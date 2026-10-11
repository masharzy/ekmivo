// PG04 durable financial audit queue consumer. This is NOT a payment matcher:
 // only pg04.audit work is claimable until PG05–PG09 handlers are implemented.
package main

import (
 "context"
 "crypto/rand"
 "database/sql"
 "encoding/json"
 "errors"
 "fmt"
 "log"
 "os"
 "os/signal"
 "syscall"
 "time"

 _ "github.com/jackc/pgx/v5/stdlib"
)

type auditJob struct {
 ID string
 Kind string
 Payload []byte
}

func parseAuditPayload(raw []byte) error {
 var body struct {
  SchemaVersion int `json:"schema_version"`
  Action string `json:"action"`
 }
 if err:=json.Unmarshal(raw,&body);err!=nil{return err}
 if body.SchemaVersion!=1 || body.Action!="durability_probe" {
  return errors.New("unsupported audit payload; no financial processing attempted")
 }
 return nil
}

func makeLeaseToken() (string,error) {
 b:=make([]byte,16)
 if _,err:=rand.Read(b);err!=nil{return "",err}
 // RFC4122 UUIDv4; cryptographically unpredictable lease/claim token.
 b[6]=(b[6]&0x0f)|0x40
 b[8]=(b[8]&0x3f)|0x80
 return fmt.Sprintf("%x-%x-%x-%x-%x",b[0:4],b[4:6],b[6:8],b[8:10],b[10:]),nil
}
func claim(ctx context.Context,db *sql.DB,env,token string)(auditJob,error){
 var j auditJob
 err:=db.QueryRowContext(ctx,
  "SELECT job_id::text,event_kind,event_payload FROM financial_claim_audit_job($1,$2::uuid,$3)",
  env,token,90).Scan(&j.ID,&j.Kind,&j.Payload)
 return j,err
}
func runOnce(ctx context.Context,db *sql.DB,env string)(bool,error){
 token,err:=makeLeaseToken()
 if err!=nil{return false,err}
 job,err:=claim(ctx,db,env,token)
 if errors.Is(err,sql.ErrNoRows){return false,nil}
 if err!=nil{return false,err}
 var acknowledged bool
 if job.Kind!="pg04.audit" || parseAuditPayload(job.Payload)!=nil {
  err=db.QueryRowContext(ctx,
   "SELECT financial_retry_audit_job($1::uuid,$2::uuid,$3)",job.ID,token,"HANDLER_FAILED").Scan(&acknowledged)
  if err!=nil{return true,err}
  if !acknowledged{return true,errors.New("worker lease expired before safe retry")}
  return true,nil
 }
 // Acknowledgement is the durable outcome of this strictly internal probe.
 // No fake customer payment/receipt/merchant webhook is emitted here.
 err=db.QueryRowContext(ctx,
  "SELECT financial_ack_audit_job($1::uuid,$2::uuid)",job.ID,token).Scan(&acknowledged)
 if err!=nil{return true,err}
 if !acknowledged{return true,errors.New("worker lease expired before acknowledgement")}
 return true,nil
}

func main(){
 env:=os.Getenv("EKMIVO_WORKER_ENVIRONMENT")
 if env!="sandbox"&&env!="live"{
  log.Fatal("EKMIVO_WORKER_ENVIRONMENT must explicitly be sandbox or live")
 }
 dsn:=os.Getenv("FINANCIAL_WORKER_DATABASE_URL")
 if dsn==""{log.Fatal("FINANCIAL_WORKER_DATABASE_URL is required")}
 db,err:=sql.Open("pgx",dsn)
 if err!=nil{log.Fatal("cannot initialize financial worker database driver")}
 defer db.Close()
 db.SetMaxOpenConns(2);db.SetMaxIdleConns(1)
 ctx,stop:=signal.NotifyContext(context.Background(),os.Interrupt,syscall.SIGTERM)
 defer stop()
 initCtx,cancel:=context.WithTimeout(ctx,10*time.Second)
 err=db.PingContext(initCtx)
 if err==nil {
  var role string
  err=db.QueryRowContext(initCtx,"SELECT current_user").Scan(&role)
  if err==nil && role!="ekmivo_financial_runtime" {
   err=errors.New("financial worker requires the restricted runtime role")
  }
 }
 cancel()
 if err!=nil{log.Fatal("worker's restricted PostgreSQL connection unavailable: ",err)}
 log.Printf("financial PG04 audit worker ready for realm=%s (no payment matching)",env)
 ticker:=time.NewTicker(time.Second)
 defer ticker.Stop()
 for {
  workCtx,cancel:=context.WithTimeout(ctx,20*time.Second)
  worked,e:=runOnce(workCtx,db,env)
  cancel()
  if e!=nil&&ctx.Err()==nil{log.Printf("financial audit queue error: %v",e)}
  if worked{continue}
  select {
  case <-ctx.Done():return
  case <-ticker.C:
  }
 }
}
