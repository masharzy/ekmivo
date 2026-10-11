// Package financial is Ekmivo's PG04 durable financial transaction boundary.
// PG04 does not expose a public mutation route or assert customer money is paid.
package financial

import (
 "context"
 "crypto/rand"
 "crypto/sha256"
 "encoding/hex"
 "encoding/json"
 "errors"
 "fmt"
 "regexp"
 "strings"

 "github.com/jackc/pgx/v5"
 "github.com/jackc/pgx/v5/pgxpool"
 "github.com/riverqueue/river"
)
var (
 ErrConflict=errors.New("idempotency key reused with another payload")
 ErrInvalid=errors.New("invalid financial operation or realm")
 ErrUnavailable=errors.New("financial database unavailable")
 uuidRE=regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
 opRE=regexp.MustCompile(`^[a-z][a-z0-9_.:-]{1,63}$`)
)
type Result struct{Status int; Body json.RawMessage}
type AuditArgs struct {
 OutboxID string `json:"outbox_id"`
 Environment string `json:"environment"`
}
func (AuditArgs) Kind()string{return "pg04.audit"}
type Store struct{
 DB *pgxpool.Pool
 Queue *river.Client[pgx.Tx]
 Realm string
}
func validateScope(workspace,env string)error{
 if !uuidRE.MatchString(workspace)||(env!="sandbox"&&env!="live"){return ErrInvalid}
 return nil
}
func validateResult(r Result)error{
 if r.Status<200||r.Status>299||len(r.Body)==0||len(r.Body)>16384||!json.Valid(r.Body){return ErrInvalid}
 var value any
 if err:=json.Unmarshal(r.Body,&value);err!=nil{return ErrInvalid}
 if _,ok:=value.(map[string]any);!ok{return ErrInvalid}
 return nil
}
func DigestRequest(request []byte)string{digest:=sha256.Sum256(request);return hex.EncodeToString(digest[:])}
func randomUUID()(string,error){
 b:=make([]byte,16);if _,err:=rand.Read(b);err!=nil{return "",err}
 b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80
 out:=hex.EncodeToString(b)
 return out[:8]+"-"+out[8:12]+"-"+out[12:16]+"-"+out[16:20]+"-"+out[20:],nil
}
func (s *Store) valid(workspace,environment string)error{
 if s==nil||s.DB==nil||s.Queue==nil{return ErrUnavailable}
 if err:=validateScope(workspace,environment);err!=nil{return err}
 if s.Realm!=environment{return ErrInvalid}
 return nil
}
// Execute must only be called after a FRESH control-plane session/member/key,
// product and environment authorization. PG04 does not grant untrusted clients
// mutation rights. Business write, River insert, outbox and result commit once.
// Replay returns database-normalized exactly identical result bytes.
func (s *Store) Execute(
 ctx context.Context,workspace,environment,operation,key string,request []byte,
 callback func(context.Context,pgx.Tx)(Result,error),
)(Result,error){
 zero:=Result{}
 if err:=s.valid(workspace,environment);err!=nil{return zero,err}
 if !opRE.MatchString(operation)||len(key)<16||len(key)>128||len(request)==0||callback==nil{return zero,ErrInvalid}
 tx,err:=s.DB.BeginTx(ctx,pgx.TxOptions{})
 if err!=nil{return zero,fmt.Errorf("%w: begin",ErrUnavailable)}
 defer tx.Rollback(ctx)
 _,err=tx.Exec(ctx,`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
  workspace+"|"+environment+"|"+operation+"|"+key)
 if err!=nil{return zero,fmt.Errorf("%w: lock",ErrUnavailable)}
 var digest string;var status int;var body []byte
 err=tx.QueryRow(ctx,`SELECT request_hash::text,result_code,result_body
 FROM financial_idempotency WHERE workspace_id=$1::uuid AND environment=$2
 AND operation=$3 AND idempotency_key=$4`,
 workspace,environment,operation,key).Scan(&digest,&status,&body)
 if err==nil{
  if strings.TrimSpace(digest)!=DigestRequest(request){return zero,ErrConflict}
  if err=tx.Commit(ctx);err!=nil{return zero,fmt.Errorf("%w: replay commit",ErrUnavailable)}
  return Result{Status:status,Body:body},nil
 }
 if !errors.Is(err,pgx.ErrNoRows){return zero,fmt.Errorf("%w: read",ErrUnavailable)}
 result,err:=callback(ctx,tx)
 if err!=nil{return zero,err}
 if err=validateResult(result);err!=nil{return zero,err}
 _,err=tx.Exec(ctx,`INSERT INTO financial_idempotency
 (workspace_id,environment,operation,idempotency_key,request_hash,result_code,result_body)
 VALUES($1::uuid,$2,$3,$4,$5,$6,$7::jsonb)`,
 workspace,environment,operation,key,DigestRequest(request),result.Status,string(result.Body))
 if err!=nil{return zero,fmt.Errorf("%w: write",ErrUnavailable)}
 err=tx.QueryRow(ctx,`SELECT result_body FROM financial_idempotency
 WHERE workspace_id=$1::uuid AND environment=$2 AND operation=$3 AND idempotency_key=$4`,
 workspace,environment,operation,key).Scan(&body)
 if err!=nil{return zero,fmt.Errorf("%w: normalized result",ErrUnavailable)}
 if err=tx.Commit(ctx);err!=nil{return zero,fmt.Errorf("%w: atomic commit",ErrUnavailable)}
 return Result{Status:result.Status,Body:body},nil
}
// EnqueueTx uses River's transactional InsertTx on the SAME pgx.Tx used by the
// domain write and immutable idempotency record. Any error rolls all back.
// Outbox-key lock prevents a raced or replayed job with different arguments.
func (s *Store) EnqueueTx(ctx context.Context,tx pgx.Tx,workspace,env,eventKey,kind string,payload json.RawMessage)(string,error){
 if err:=s.valid(workspace,env);err!=nil{return "",err}
 if tx==nil||len(eventKey)==0||len(eventKey)>160||kind!="pg04.audit"{
  return "",ErrInvalid // future event kinds require their own real handlers
 }
 if err:=validateResult(Result{Status:200,Body:payload});err!=nil{return "",err}
 _,err:=tx.Exec(ctx,"SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
  "outbox|"+workspace+"|"+env+"|"+eventKey)
 if err!=nil{return "",ErrUnavailable}
 var previous,oldKind string;var same bool
 err=tx.QueryRow(ctx,`SELECT id::text,event_kind,payload=$1::jsonb
 FROM financial_outbox WHERE workspace_id=$2::uuid AND environment=$3 AND event_key=$4`,
 string(payload),workspace,env,eventKey).Scan(&previous,&oldKind,&same)
 if err==nil{
  if oldKind!=kind||!same{return "",ErrConflict}
  return previous,nil
 }
 if !errors.Is(err,pgx.ErrNoRows){return "",ErrUnavailable}
 outboxID,err:=randomUUID();if err!=nil{return "",ErrUnavailable}
 job,err:=s.Queue.InsertTx(ctx,tx,AuditArgs{OutboxID:outboxID,Environment:env},
  &river.InsertOpts{Queue:"financial_"+env,MaxAttempts:10})
 if err!=nil{return "",fmt.Errorf("%w: River transactional enqueue",ErrUnavailable)}
 _,err=tx.Exec(ctx,`INSERT INTO financial_outbox
 (id,workspace_id,environment,event_key,event_kind,payload,river_job_id)
 VALUES($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb,$7)`,
 outboxID,workspace,env,eventKey,kind,string(payload),job.Job.ID)
 if err!=nil{return "",fmt.Errorf("%w: atomic outbox insert",ErrUnavailable)}
 return outboxID,nil
}
