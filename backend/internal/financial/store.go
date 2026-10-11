// Package financial implements PG04's internal transactional durability boundary.
 // It never creates verified payments or treats client input as financial evidence.
package financial

import (
 "context"
 "crypto/sha256"
 "database/sql"
 "encoding/hex"
 "encoding/json"
 "errors"
 "fmt"
 "regexp"
 "strings"
)

var (
 ErrConflict=errors.New("idempotency key reused with different request")
 ErrInvalid=errors.New("invalid financial operation")
 ErrUnavailable=errors.New("financial store unavailable")
 uuidRE=regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
 opRE=regexp.MustCompile(`^[a-z][a-z0-9_.:-]{1,63}$`)
)
type Result struct {
 Status int
 Body json.RawMessage
}
// Store uses an explicitly authorized SQL connection. At PG04 the restricted
// API role has NO financial INSERT grants: PG05 must add validated writer
// entrypoints and call this only after fresh Go authorization.
type Store struct { DB *sql.DB }

func validateScope(workspace,environment string) error {
 if !uuidRE.MatchString(workspace) || (environment!="sandbox"&&environment!="live") {
  return ErrInvalid
 }
 return nil
}
func validateResult(r Result) error {
 if r.Status<200 || r.Status>299 || len(r.Body)==0 || len(r.Body)>16384 || !json.Valid(r.Body){
  return ErrInvalid
 }
 var value any
 if err:=json.Unmarshal(r.Body,&value);err!=nil{return ErrInvalid}
 if _,ok:=value.(map[string]any);!ok{return ErrInvalid}
 return nil
}
func DigestRequest(payload []byte) string {
 h:=sha256.Sum256(payload)
 return hex.EncodeToString(h[:])
}

// Execute serializes identical operation/key scopes using a transaction-level
// advisory lock, verifies the full request digest and commits the domain
// callback, any outbox rows and immutable response atomically.
// A rolled-back callback leaves NO persisted idempotency result or job.
// Canonicalize structured request bytes at the authenticated API boundary.
func (s *Store) Execute(
 ctx context.Context,workspace,environment,operation,key string,request []byte,
 callback func(context.Context,*sql.Tx)(Result,error),
)(Result,error){
 var zero Result
 if s==nil||s.DB==nil{return zero,ErrUnavailable}
 if err:=validateScope(workspace,environment);err!=nil{return zero,err}
 if !opRE.MatchString(operation)||len(key)<16||len(key)>128||len(request)==0||callback==nil{
  return zero,ErrInvalid
 }
 tx,err:=s.DB.BeginTx(ctx,&sql.TxOptions{Isolation:sql.LevelReadCommitted})
 if err!=nil{return zero,fmt.Errorf("%w: begin",ErrUnavailable)}
 defer tx.Rollback()
 // Hash collisions only cause extra serialization, never a result alias:
 // the complete scoped key is checked against the UNIQUE primary key.
 _,err=tx.ExecContext(ctx,
  "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
  workspace+"\x00"+environment+"\x00"+operation+"\x00"+key)
 if err!=nil{return zero,fmt.Errorf("%w: lock",ErrUnavailable)}
 var digest string
 var code int
 var body []byte
 err=tx.QueryRowContext(ctx,`SELECT request_hash::text,result_code,result_body
   FROM financial_idempotency WHERE workspace_id=$1::uuid AND environment=$2
   AND operation=$3 AND idempotency_key=$4`,workspace,environment,operation,key).
  Scan(&digest,&code,&body)
 if err==nil{
  if strings.TrimSpace(digest)!=DigestRequest(request){return zero,ErrConflict}
  if err=tx.Commit();err!=nil{return zero,fmt.Errorf("%w: replay commit",ErrUnavailable)}
  return Result{Status:code,Body:body},nil
 }
 if !errors.Is(err,sql.ErrNoRows){return zero,fmt.Errorf("%w: idempotency read",ErrUnavailable)}
 result,err:=callback(ctx,tx)
 if err!=nil{return zero,err}
 if err=validateResult(result);err!=nil{return zero,err}
 _,err=tx.ExecContext(ctx,`INSERT INTO financial_idempotency
   (workspace_id,environment,operation,idempotency_key,request_hash,result_code,result_body)
   VALUES($1::uuid,$2,$3,$4,$5,$6,$7::jsonb)`,
  workspace,environment,operation,key,DigestRequest(request),result.Status,string(result.Body))
 if err!=nil{return zero,fmt.Errorf("%w: idempotency commit record",ErrUnavailable)}
 if err=tx.Commit();err!=nil{return zero,fmt.Errorf("%w: transaction commit",ErrUnavailable)}
 return result,nil
}

// EnqueueTx requires the SAME transaction as its domain mutation. Event key
// collision with a different event is a conflict rather than a second job.
// The deferred database constraint also prohibits orphan outbox events.
func EnqueueTx(ctx context.Context,tx *sql.Tx,workspace,environment,eventKey,kind string,payload json.RawMessage)(string,error){
 if tx==nil{return "",ErrInvalid}
 if err:=validateScope(workspace,environment);err!=nil{return "",err}
 if !opRE.MatchString(kind)||len(eventKey)<1||len(eventKey)>160{return "",ErrInvalid}
 if err:=validateResult(Result{Status:200,Body:payload});err!=nil{return "",err}
 var id string
 err:=tx.QueryRowContext(ctx,`INSERT INTO financial_outbox
   (workspace_id,environment,event_key,event_kind,payload)
   VALUES($1::uuid,$2,$3,$4,$5::jsonb)
   ON CONFLICT(workspace_id,environment,event_key) DO NOTHING
   RETURNING id::text`,workspace,environment,eventKey,kind,string(payload)).Scan(&id)
 if errors.Is(err,sql.ErrNoRows){
  var oldKind string
  var equal bool
  err=tx.QueryRowContext(ctx,`SELECT id::text,event_kind,payload=$1::jsonb
   FROM financial_outbox
   WHERE workspace_id=$2::uuid AND environment=$3 AND event_key=$4`,
   string(payload),workspace,environment,eventKey).Scan(&id,&oldKind,&equal)
  if err!=nil{return "",fmt.Errorf("%w: existing outbox",ErrUnavailable)}
  if oldKind!=kind||!equal{return "",ErrConflict}
 }else if err!=nil{return "",fmt.Errorf("%w: append outbox",ErrUnavailable)}
 _,err=tx.ExecContext(ctx,`INSERT INTO financial_jobs(workspace_id,environment,outbox_id,queue)
  VALUES($1::uuid,$2,$3::uuid,'financial:'||$2)
  ON CONFLICT(workspace_id,environment,outbox_id) DO NOTHING`,workspace,environment,id)
 if err!=nil{return "",fmt.Errorf("%w: enqueue job",ErrUnavailable)}
 return id,nil
}
