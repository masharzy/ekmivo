// PG04: separate realm-bound River payment worker; only nonfinancial
// pg04.audit durability events are currently registered.
package main

import (
 "context"
 "errors"
 "fmt"
 "log"
 "os"
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
 Realm string
}
func (w *AuditWorker) Work(ctx context.Context,job *river.Job[financial.AuditArgs])error{
 if job.Args.Environment!=w.Realm||!strings.Contains(job.Args.OutboxID,"-") {
  return errors.New("financial audit job realm or identifier is invalid")
 }
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
 probe,cancelProbe:=context.WithTimeout(ctx,10*time.Second)
 err=verifyRealm(probe,pool,realm)
 cancelProbe()
 if err!=nil{log.Fatal("financial queue realm/role preflight: ",err)}
 workers:=river.NewWorkers()
 river.AddWorker(workers,&AuditWorker{Pool:pool,Realm:realm})
 client,err:=river.NewClient(riverpgxv5.New(pool),&river.Config{
  Queues:map[string]river.QueueConfig{"financial_"+realm:{MaxWorkers:2}},
  Workers:workers,
 })
 if err!=nil{log.Fatal("River worker creation: ",err)}
 if err:=client.Start(ctx);err!=nil{log.Fatal("River worker startup: ",err)}
 log.Printf("PG04 River worker active for %s, audit-only; payment verification DISABLED",realm)
 <-ctx.Done()
 stopCtx,stopCancel:=context.WithTimeout(context.Background(),15*time.Second)
 defer stopCancel()
 if err:=client.Stop(stopCtx);err!=nil{log.Printf("River worker stop: %v",err)}
}
