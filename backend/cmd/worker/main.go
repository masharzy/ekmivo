// PG04: separate realm-bound River payment worker; only nonfinancial
// pg04_audit durability events are currently registered.
package main

import (
 "context"
 "errors"
 "fmt"
 "log"
 "net/url"
 "os"
 "strconv"
 "os/signal"
 "strings"
 "syscall"
 "time"

 "github.com/jackc/pgx/v5/pgxpool"
 "github.com/masharzy/ekmivo/backend/internal/financial"
 "github.com/riverqueue/river"
 "github.com/riverqueue/river/riverdriver/riverpgxv5"
)

type AuditWorker struct{
 river.WorkerDefaults[financial.AuditArgs]
 Pool *pgxpool.Pool
 Control *pgxpool.Pool
 Realm string
}
// This bounded timeout applies only to the PG04 internal audit probe. River
// reclaims timed-out running jobs after process death, and the audit PK makes
// repeated handler execution idempotent.
func (w *AuditWorker) Timeout(_ *river.Job[financial.AuditArgs]) time.Duration {
 return 10*time.Second
}
func testPause(ctx context.Context)error{
 ms:=os.Getenv("PG04_TEST_PAUSE_AFTER_CLAIM_MS")
 if ms==""{return nil}
 if os.Getenv("PG04_CI_FAULT_INJECTION")!="true"{return errors.New("fault injection forbidden")}
 u,e:=url.Parse(os.Getenv("FINANCIAL_WORKER_DATABASE_URL"))
 if e!=nil||u.Hostname()!="127.0.0.1"&&u.Hostname()!="localhost"{
  return errors.New("fault injection permitted only with local disposable PostgreSQL")
 }
 n,e:=strconv.Atoi(ms)
 if e!=nil||n<1||n>30000{return errors.New("invalid bounded test-only delay")}
 select {
 case <-ctx.Done():return ctx.Err()
 case <-time.After(time.Duration(n)*time.Millisecond):return nil
 }
}

func (w *AuditWorker) Work(ctx context.Context,job *river.Job[financial.AuditArgs])error{
 if job.Args.Environment!=w.Realm||!strings.Contains(job.Args.OutboxID,"-") {
  return errors.New("financial audit job realm or identifier is invalid")
 }
 if w.Pool==nil||w.Control==nil{return errors.New("financial/control projection unavailable")}
 var ws,realm string;var projectedVersion int64
 if err:=w.Pool.QueryRow(ctx,`SELECT workspace_id::text,environment,entitlement_version
 FROM financial_audit_context($1::uuid)`,job.Args.OutboxID).
  Scan(&ws,&realm,&projectedVersion);err!=nil{return errors.New("financial audit context unavailable")}
 var sourceVersion int64;var active bool
 if err:=w.Control.QueryRow(ctx,`SELECT source_version,active FROM resolve_financial_projection($1::uuid,$2)`,
  ws,realm).Scan(&sourceVersion,&active);err!=nil{
  return errors.New("authoritative control workspace unavailable")
 }
 if !active||sourceVersion!=projectedVersion||realm!=w.Realm{
  return errors.New("control entitlement suspended or out of sync")
 }
 if err:=testPause(ctx);err!=nil{return err}
 // SECURITY DEFINER function checks physical realm, exact immutable event
 // kind/payload, workspace projection and idempotent processed-event PK.
 // No fake merchant payment, webhook or receipt is created here.
 var first bool
 if err:=w.Pool.QueryRow(ctx,"SELECT financial_process_audit($1::uuid)",job.Args.OutboxID).Scan(&first);err!=nil{
  return errors.New("financial audit handler rejected event")
 }
 return nil
}
func validateWorkerRole(name,realm string)error{
 if realm!="sandbox"&&realm!="live"{return errors.New("invalid explicit financial realm")}
 if name!="ekmivo_financial_worker_"+realm{return fmt.Errorf("wrong restricted financial worker role for %s",realm)}
 return nil
}
func verifyRealm(ctx context.Context,pool *pgxpool.Pool,realm string)error{
 var actual,actor string
 err:=pool.QueryRow(ctx,`SELECT environment,current_user FROM financial_realm WHERE singleton=true`).Scan(&actual,&actor)
 if err!=nil||actual!=realm{return errors.New("wrong or missing independent financial realm")}
 return validateWorkerRole(actor,realm)
}
func verifyControlProjection(ctx context.Context,pool *pgxpool.Pool)error{
 var member bool;var hasAuth,hasRealm bool
 err:=pool.QueryRow(ctx,`SELECT pg_has_role(current_user,'ekmivo_financial_projection','member'),
 to_regclass('public.auth_sessions') IS NOT NULL,
 to_regclass('public.financial_realm') IS NOT NULL`).Scan(&member,&hasAuth,&hasRealm)
 if err!=nil||!member||!hasAuth||hasRealm{return errors.New("restricted authoritative control DB required")}
 return nil
}
// PG04-specific crash recovery: River retains the authoritative job record,
// while a scoped reclaimer makes SIGKILL'd audit-only jobs eligible again after
// their bounded 10s handler timeout. It NEVER touches future payment jobs.
// River claims retryable jobs normally; unique processed-outbox makes replay safe.
// 30s is deliberately greater than AuditWorker.Timeout and claims are updated
// atomically, including when multiple worker instances are polling.
func rescueAbandonedAuditJobs(ctx context.Context,pool *pgxpool.Pool,realm string)(int64,error){
 if realm!="sandbox"&&realm!="live"{return 0,errors.New("invalid rescue realm")}
 if pool==nil{return 0,errors.New("missing River database")}
 result,err:=pool.Exec(ctx,`UPDATE river_job SET
  state='retryable',scheduled_at=now()
 WHERE queue=$1 AND kind='pg04_audit' AND state='running'
   AND attempted_at < now()-interval '30 seconds'
   AND attempt < max_attempts`,"financial_"+realm)
 if err!=nil{return 0,errors.New("PG04 River audit rescue failed")}
 return result.RowsAffected(),nil
}

func main(){
 realm:=os.Getenv("EKMIVO_WORKER_ENVIRONMENT")
 if realm!="sandbox"&&realm!="live"{log.Fatal("EKMIVO_WORKER_ENVIRONMENT is required: sandbox|live")}
 dsn:=os.Getenv("FINANCIAL_WORKER_DATABASE_URL")
 if dsn==""{log.Fatal("FINANCIAL_WORKER_DATABASE_URL missing (no control DB fallback)")}
 ctx,cancel:=signal.NotifyContext(context.Background(),os.Interrupt,syscall.SIGTERM)
 defer cancel()
 pool,err:=pgxpool.New(ctx,dsn)
 if err!=nil{log.Fatal("financial worker database initialization unavailable")}
 defer pool.Close()
 source:=os.Getenv("PG04_WORKER_CONTROL_PROJECTION_URL")
 if source==""{log.Fatal("restricted control projection URL is required for fresh reauthorization")}
 financeURL,e1:=url.Parse(dsn);controlURL,e2:=url.Parse(source)
 if e1!=nil||e2!=nil||financeURL.Host+financeURL.Path==controlURL.Host+controlURL.Path||
  financeURL.User.Username()==controlURL.User.Username(){
  log.Fatal("financial and control DB/credential identities must be separate")
 }
 control,err:=pgxpool.New(ctx,source)
 if err!=nil{log.Fatal("restricted control projection client unavailable")}
 defer control.Close()
 probe,cancelProbe:=context.WithTimeout(ctx,10*time.Second)
 err=verifyRealm(probe,pool,realm)
 if err==nil{err=verifyControlProjection(probe,control)}
 cancelProbe()
 if err!=nil{log.Fatal("financial queue/control authority preflight: ",err)}
 workers:=river.NewWorkers()
 river.AddWorker(workers,&AuditWorker{Pool:pool,Control:control,Realm:realm})
 client,err:=river.NewClient(riverpgxv5.New(pool),&river.Config{
  Queues:map[string]river.QueueConfig{"financial_"+realm:{MaxWorkers:2}},
  Workers:workers,
 })
 if err!=nil{log.Fatal("River worker creation: ",err)}
 if err:=client.Start(ctx);err!=nil{log.Fatal("River worker startup: ",err)}
 log.Printf("PG04 River worker active for %s, audit-only; payment verification DISABLED",realm)
 ticker:=time.NewTicker(5*time.Second)
 defer ticker.Stop()
 // Run once immediately after startup, and thereafter with short bounded SQL
 // requests. A crashed worker has no process left to acknowledge its job.
loop:
 for{
  scoped,done:=context.WithTimeout(ctx,3*time.Second)
  recovered,err:=rescueAbandonedAuditJobs(scoped,pool,realm)
  done()
  if err!=nil && ctx.Err()==nil{log.Print("PG04 audit rescue retry: dependency unavailable")}
  if recovered>0{log.Printf("PG04 River recovered %d stale audit job(s)",recovered)}
  select {
  case <-ctx.Done():break loop
  case <-ticker.C:
  }
 }
 stopCtx,stopCancel:=context.WithTimeout(context.Background(),15*time.Second)
 defer stopCancel()
 if err:=client.Stop(stopCtx);err!=nil{log.Printf("River worker stop: %v",err)}
}
