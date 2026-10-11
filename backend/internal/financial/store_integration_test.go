package financial

import(
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "net/url"
 "os"
 "sync"
 "sync/atomic"
 "testing"
 "time"

 "github.com/jackc/pgx/v5"
 "github.com/jackc/pgx/v5/pgxpool"
 "github.com/riverqueue/river"
 "github.com/riverqueue/river/riverdriver/riverpgxv5"
)
func TestPG04PostgresRiverAtomicIdempotency(t *testing.T){
 raw:=os.Getenv("PG04_SANDBOX_MIGRATION_DATABASE_URL")
 if raw==""{t.Skip("independent PG04 sandbox integration database not configured")}
 u,err:=url.Parse(raw)
 if err!=nil||!(u.Hostname()=="127.0.0.1"||u.Hostname()=="localhost"||u.Hostname()=="::1"){
  t.Fatal("PG04 test prohibits remote databases")
 }
 ctx,cancel:=context.WithTimeout(context.Background(),40*time.Second);defer cancel()
 pool,err:=pgxpool.New(ctx,raw);if err!=nil{t.Fatal(err)};defer pool.Close()
 pool.Config() // type-safe pool setup guard
 var realm string
 if err=pool.QueryRow(ctx,"SELECT environment FROM financial_realm WHERE singleton").Scan(&realm);err!=nil||realm!="sandbox"{
  t.Fatal("migration/realm not ready for integration")
 }
 queue,err:=river.NewClient(riverpgxv5.New(pool),&river.Config{})
 if err!=nil{t.Fatal(err)}
 ws,err:=randomUUID();if err!=nil{t.Fatal(err)}
 // Build the test tenant in the isolated CONTROL fixture first. The River
 // worker must recheck this authoritative entitlement before processing.
 controlURL:=os.Getenv("PG00_TEST_DATABASE_URL")
 if controlURL==""{t.Fatal("PG04 needs separate disposable control DB fixture")}
 control,err:=pgxpool.New(ctx,controlURL);if err!=nil{t.Fatal(err)}
 defer control.Close()
 uid,err:=randomUUID();if err!=nil{t.Fatal(err)}
 _,err=control.Exec(ctx,`INSERT INTO app_users(id,email,display_name,password_hash)
 VALUES($1::uuid,$2,'PG04 River Test','invalid-test-only')`,uid,"pg04-river-"+uid+"@example.invalid")
 if err!=nil{t.Fatal(err)}
 _,err=control.Exec(ctx,`INSERT INTO workspaces(id,name,service_mode,created_by)
 VALUES($1::uuid,'PG04 durable River','commerce',$2::uuid)`,ws,uid)
 if err!=nil{t.Fatal(err)}
 _,err=control.Exec(ctx,`INSERT INTO workspace_members(workspace_id,user_id,role)
 VALUES($1::uuid,$2::uuid,'owner')`,ws,uid)
 if err!=nil{t.Fatal(err)}
 var sourceVersion int64;var active bool
 err=control.QueryRow(ctx,`SELECT source_version,active
 FROM resolve_financial_projection($1::uuid,'sandbox')`,ws).Scan(&sourceVersion,&active)
 if err!=nil||!active{t.Fatal("PG04 authoritative control projection not enabled",err)}
 _,err=pool.Exec(ctx,"SELECT financial_sync_workspace($1::uuid,$2,$3,$4)",ws,"sandbox",sourceVersion,true)
 if err!=nil{t.Fatal(err)}
 st:=&Store{DB:pool,Queue:queue,Realm:"sandbox"}
 var calls atomic.Int32
 key,err:=randomUUID();if err!=nil{t.Fatal(err)}
 payload:=[]byte(`{"amount_minor":1800,"currency":"BDT"}`)
 operation:=func(ctx context.Context,tx pgx.Tx)(Result,error){
  calls.Add(1)
  var id string
  err:=tx.QueryRow(ctx,`INSERT INTO payment_intents(workspace_id,environment,merchant_reference,amount_minor,expires_at)
   VALUES($1::uuid,'sandbox',$2,1800,now()+interval '1 hour') RETURNING id::text`,ws,"pg04-"+key).Scan(&id)
  if err!=nil{return Result{},err}
  out,err:=st.EnqueueTx(ctx,tx,ws,"sandbox","created:"+id,"pg04.audit",
   json.RawMessage(`{"schema_version":1,"action":"durability_probe"}`))
  if err!=nil{return Result{},err}
  return Result{Status:201,Body:json.RawMessage(fmt.Sprintf(`{"intent":%q,"outbox":%q}`,id,out))},nil
 }
 first,err:=st.Execute(ctx,ws,"sandbox","payments.create",key,payload,operation)
 if err!=nil{t.Fatal(err)}
 again,err:=st.Execute(ctx,ws,"sandbox","payments.create",key,payload,operation)
 if err!=nil{t.Fatal(err)}
 if first.Status!=201||string(first.Body)!=string(again.Body)||calls.Load()!=1{
  t.Fatalf("River idempotency replay changed response/effect: %d",calls.Load())
 }
 _,err=st.Execute(ctx,ws,"sandbox","payments.create",key,[]byte(`{"amount_minor":1801}`),operation)
 if !errors.Is(err,ErrConflict){t.Fatalf("reused key not rejected: %v",err)}
 var intents,jobs,events,replies int
 if err=pool.QueryRow(ctx,`SELECT
 (SELECT count(*) FROM payment_intents WHERE workspace_id=$1::uuid),
 (SELECT count(*) FROM river_job j JOIN financial_outbox o ON o.river_job_id=j.id WHERE o.workspace_id=$1::uuid),
 (SELECT count(*) FROM financial_outbox WHERE workspace_id=$1::uuid),
 (SELECT count(*) FROM financial_idempotency WHERE workspace_id=$1::uuid)`,ws).
  Scan(&intents,&jobs,&events,&replies);err!=nil{t.Fatal(err)}
 if intents!=1||jobs!=1||events!=1||replies!=1{
  t.Fatalf("non-atomic commit intents/jobs/events/replies=%d/%d/%d/%d",intents,jobs,events,replies)
 }
 rollbackKey,err:=randomUUID();if err!=nil{t.Fatal(err)}
 _,err=st.Execute(ctx,ws,"sandbox","payments.create",rollbackKey,payload,
  func(ctx context.Context,tx pgx.Tx)(Result,error){
   if _,err:=st.EnqueueTx(ctx,tx,ws,"sandbox","rollback", "pg04.audit",
     json.RawMessage(`{"schema_version":1,"action":"durability_probe"}`));err!=nil{return Result{},err}
   return Result{},errors.New("expected rollback")
  })
 if err==nil{t.Fatal("callback rollback did not fail")}
 var left int
 if err=pool.QueryRow(ctx,`SELECT count(*) FROM financial_outbox WHERE workspace_id=$1::uuid AND event_key='rollback'`,ws).Scan(&left);err!=nil{t.Fatal(err)}
 if left!=0{t.Fatal("River job/outbox leaked from rollback")}
 multi,err:=randomUUID();if err!=nil{t.Fatal(err)}
 var winners atomic.Int32
 var group sync.WaitGroup; errs:=make(chan error,12)
 for i:=0;i<12;i++{
  group.Add(1);go func(){
   defer group.Done()
   _,e:=st.Execute(ctx,ws,"sandbox","payments.create",multi,payload,
    func(_ context.Context,_ pgx.Tx)(Result,error){
     winners.Add(1)
     return Result{Status:201,Body:json.RawMessage(`{"once":true}`)},nil
    })
   if e!=nil{errs<-e}
  }()
 }
 group.Wait();close(errs)
 for e:=range errs{t.Fatal(e)}
 if winners.Load()!=1{t.Fatalf("callback executed %d times for same key",winners.Load())}
 if err=st.valid(ws,"live");!errors.Is(err,ErrInvalid){t.Fatal("sandbox store accepted live realm")}
 t.Log("PG04 River pgx: 1 response, 1 durable job, rollback, 12-way concurrent replay and realm fail-closed PASS")
}
