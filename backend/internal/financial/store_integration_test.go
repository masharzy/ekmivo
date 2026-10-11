package financial

import (
 "context"
 "crypto/rand"
 "database/sql"
 "encoding/hex"
 "encoding/json"
 "errors"
 "fmt"
 "net/url"
 "os"
 "sync"
 "sync/atomic"
 "testing"
 "time"

 _ "github.com/jackc/pgx/v5/stdlib"
)

func pg04UUID(t *testing.T) string {
 t.Helper()
 v:=make([]byte,16)
 if _,err:=rand.Read(v);err!=nil{t.Fatal(err)}
 v[6]=(v[6]&15)|64;v[8]=(v[8]&63)|128
 b:=hex.EncodeToString(v)
 return b[:8]+"-"+b[8:12]+"-"+b[12:16]+"-"+b[16:20]+"-"+b[20:]
}
func TestPG04PostgresIdempotentMutationAndQueue(t *testing.T){
 raw:=os.Getenv("PG00_TEST_DATABASE_URL")
 if raw==""{t.Skip("local disposable PostgreSQL integration environment not set")}
 u,err:=url.Parse(raw)
 if err!=nil||!(u.Hostname()=="127.0.0.1"||u.Hostname()=="localhost"||u.Hostname()=="::1") {
  t.Fatal("PG04 integration refuses remote database")
 }
 db,err:=sql.Open("pgx",raw)
 if err!=nil{t.Fatal(err)}
 defer db.Close()
 db.SetMaxOpenConns(8)
 ctx,done:=context.WithTimeout(context.Background(),25*time.Second)
 defer done()
 actor,workspace:=pg04UUID(t),pg04UUID(t)
 if _,err=db.ExecContext(ctx,`INSERT INTO app_users(id,email,display_name,password_hash)
  VALUES($1::uuid,$2,'PG04 Go integration','test-no-login')`,actor,"pg04-"+actor+"@example.invalid");err!=nil{t.Fatal(err)}
 if _,err=db.ExecContext(ctx,`INSERT INTO workspaces(id,name,service_mode,created_by)
  VALUES($1::uuid,'PG04 Go integration','commerce',$2::uuid)`,workspace,actor);err!=nil{t.Fatal(err)}
 if _,err=db.ExecContext(ctx,`INSERT INTO workspace_members(workspace_id,user_id,role)
  VALUES($1::uuid,$2::uuid,'owner')`,workspace,actor);err!=nil{t.Fatal(err)}
 store:=&Store{DB:db}
 key:=pg04UUID(t)
 var calls atomic.Int32
 mutation:=func(ctx context.Context,tx *sql.Tx)(Result,error){
  calls.Add(1)
  var intent string
  ref:="pg04-go-"+key
  err:=tx.QueryRowContext(ctx,`INSERT INTO payment_intents
   (workspace_id,environment,merchant_reference,amount_minor,expires_at)
   VALUES($1::uuid,'sandbox',$2,1800,now()+interval '1 hour') RETURNING id::text`,
   workspace,ref).Scan(&intent)
  if err!=nil{return Result{},err}
  outboxID,err:=EnqueueTx(ctx,tx,workspace,"sandbox","intent.created:"+intent,
   "pg04.audit",json.RawMessage(`{"schema_version":1,"action":"durability_probe"}`))
  if err!=nil{return Result{},err}
  return Result{201,json.RawMessage(fmt.Sprintf(`{"intent_id":%q,"outbox_id":%q}`,intent,outboxID))},nil
 }
 input:=[]byte(`{"amount_minor":1800,"currency":"BDT"}`)
 first,err:=store.Execute(ctx,workspace,"sandbox","payments.create",key,input,mutation)
 if err!=nil{t.Fatal(err)}
 second,err:=store.Execute(ctx,workspace,"sandbox","payments.create",key,input,mutation)
 if err!=nil{t.Fatal(err)}
 if first.Status!=201||string(first.Body)!=string(second.Body)||calls.Load()!=1 {
  t.Fatalf("replay changed result or ran callback twice: %d",calls.Load())
 }
 _,err=store.Execute(ctx,workspace,"sandbox","payments.create",key,[]byte(`{"amount_minor":1801}`),mutation)
 if !errors.Is(err,ErrConflict){t.Fatalf("different payload reused idempotency key: %v",err)}
 var intents,jobs,outbox,records int
 err=db.QueryRowContext(ctx,`SELECT
  (SELECT count(*) FROM payment_intents WHERE workspace_id=$1::uuid),
  (SELECT count(*) FROM financial_jobs WHERE workspace_id=$1::uuid),
  (SELECT count(*) FROM financial_outbox WHERE workspace_id=$1::uuid),
  (SELECT count(*) FROM financial_idempotency WHERE workspace_id=$1::uuid)`,workspace).
  Scan(&intents,&jobs,&outbox,&records)
 if err!=nil{t.Fatal(err)}
 if intents!=1||jobs!=1||outbox!=1||records!=1 {
  t.Fatalf("commit was not atomic: intents/jobs/outbox/results = %d/%d/%d/%d",intents,jobs,outbox,records)
 }
 failKey:=pg04UUID(t)
 _,err=store.Execute(ctx,workspace,"sandbox","payments.create",failKey,input,
  func(ctx context.Context,tx *sql.Tx)(Result,error){
   if _,err:=EnqueueTx(ctx,tx,workspace,"sandbox","will.rollback",
    "pg04.audit",json.RawMessage(`{"schema_version":1,"action":"durability_probe"}`));err!=nil{
    return Result{},err
   }
   return Result{},errors.New("intentional rollback")
  })
 if err==nil{t.Fatal("callback rollback did not return error")}
 var rolledBack int
 if err=db.QueryRowContext(ctx,`SELECT count(*) FROM financial_outbox
  WHERE workspace_id=$1::uuid AND event_key='will.rollback'`,workspace).Scan(&rolledBack);err!=nil{t.Fatal(err)}
 if rolledBack!=0{t.Fatal("outbox job leaked from rolled-back transaction")}
 // Competing requests must all receive the SAME stored result with one callback.
 parallelKey:=pg04UUID(t)
 var wins atomic.Int32
 var group sync.WaitGroup
 errorsCh:=make(chan error,12)
 for i:=0;i<12;i++{
  group.Add(1)
  go func(){
   defer group.Done()
   _,err:=store.Execute(ctx,workspace,"sandbox","payments.create",parallelKey,input,
    func(_ context.Context,_ *sql.Tx)(Result,error){
     wins.Add(1)
     return Result{Status:201,Body:json.RawMessage(`{"exactly_once":true}`)},nil
    })
   if err!=nil{errorsCh<-err}
  }()
 }
 group.Wait();close(errorsCh)
 for err:=range errorsCh{t.Fatalf("concurrent request failed: %v",err)}
 if wins.Load()!=1{t.Fatalf("idempotent callback ran %d times",wins.Load())}
 t.Log("PG04 disposable DB: atomic outcome/outbox/job, fail rollback and 12 concurrent replays PASS")
}
