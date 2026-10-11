// Package checkout implements PG05 sandbox payment requests and customer checkout.
// Neither customer input nor a browser redirect can mark money as verified.
package checkout

import (
 "context"
 "crypto/hmac"
 "crypto/sha256"
 "encoding/base64"
 "encoding/hex"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "net/http"
 "net/url"
 "regexp"
 "strings"
 "time"

 "github.com/jackc/pgx/v5"
 "github.com/jackc/pgx/v5/pgconn"
 "github.com/jackc/pgx/v5/pgxpool"
 "github.com/masharzy/ekmivo/backend/internal/authz"
)

var (
 uuidPattern=regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
 referencePattern=regexp.MustCompile(`^[^\x00-\x1f]{1,128}$`)
 tokenPattern=regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
 keyPattern=regexp.MustCompile(`^[A-Za-z0-9_.:-]{16,128}$`)
)
type Service struct {
 Auth *authz.Repository
 Sandbox *pgxpool.Pool
 TokenKey []byte
 PayerKey []byte
}
type createRequest struct{
 Reference string `json:"merchant_reference"`
 Amount int64 `json:"amount_minor"`
 Currency string `json:"currency"`
 Expiry int `json:"expires_in_minutes"`
 OrderID string `json:"order_id,omitempty"`
 InvoiceID string `json:"invoice_id,omitempty"`
}
func write(w http.ResponseWriter,status int,body any){
 w.Header().Set("Content-Type","application/json; charset=utf-8")
 w.Header().Set("Cache-Control","no-store")
 w.Header().Set("Referrer-Policy","no-referrer")
 w.Header().Set("X-Content-Type-Options","nosniff")
 w.WriteHeader(status)
 _=json.NewEncoder(w).Encode(body)
}
func fail(w http.ResponseWriter,status int,code string){
 write(w,status,map[string]any{"error":map[string]string{"code":code}})
}
func digest(s string)string{b:=sha256.Sum256([]byte(s));return hex.EncodeToString(b[:])}
func mac(key []byte,s string)[]byte{m:=hmac.New(sha256.New,key);m.Write([]byte(s));return m.Sum(nil)}
func (s *Service) token(ws,realm,key string)string{
 return base64.RawURLEncoding.EncodeToString(mac(s.TokenKey,ws+"|"+realm+"|"+key))
}
func (s *Service) ready()bool{return s!=nil&&s.Sandbox!=nil&&s.Auth!=nil&&len(s.TokenKey)>=32&&len(s.PayerKey)>=32}
func (s *Service) Close(){if s!=nil&&s.Sandbox!=nil{s.Sandbox.Close()}}
// Start refuses the control-plane database, privileged roles and a wrongly
// connected physical realm; there is no silent fallback to the auth database.
func Start(ctx context.Context,auth *authz.Repository,raw,controlURL string,tokenKey,payerKey []byte)(*Service,error){
 if raw==""||auth==nil||len(tokenKey)<32||len(payerKey)<32{
  return nil,errors.New("PG05 sandbox finance/auth/secrets unavailable")
 }
 f,e:=url.Parse(raw);a,ea:=url.Parse(controlURL)
 if e!=nil||ea!=nil||f.Host==""||f.User.Username()==""||f.Host+f.Path==a.Host+a.Path{
  return nil,errors.New("PG05 must use a different isolated finance database")
 }
 pool,err:=pgxpool.New(ctx,raw);if err!=nil{return nil,err}
 var realm,actor string;var hasReader,super,bypass bool
 err=pool.QueryRow(ctx,`SELECT f.environment,current_user,
  pg_has_role(current_user,'ekmivo_finance_reader','member'),
  r.rolsuper,r.rolbypassrls FROM financial_realm f
  JOIN pg_roles r ON r.rolname=current_user WHERE f.singleton`).
  Scan(&realm,&actor,&hasReader,&super,&bypass)
 if err!=nil||realm!="sandbox"||!hasReader||super||bypass{
  pool.Close();return nil,errors.New("PG05 restricted sandbox reader role/realm check failed")
 }
 // Check the migration exists before accepting customer-facing traffic.
 var installed bool
 err=pool.QueryRow(ctx,`SELECT to_regprocedure('pg05_checkout_view(text)') IS NOT NULL
  AND to_regprocedure('pg05_create_linked_intent(uuid,text,text,text,uuid,integer,text,text,text)') IS NOT NULL`).Scan(&installed)
 if err!=nil||!installed{
  pool.Close();return nil,errors.New("PG05 checkout migration not installed")
 }
 _=actor // Role name intentionally not logged with credentials.
 return &Service{Auth:auth,Sandbox:pool,TokenKey:tokenKey,PayerKey:payerKey},nil
}
func explicitRealm(r *http.Request)string{
 vals:=r.URL.Query()["environment"]
 if len(vals)!=1||len(vals[0])==0{return ""}
 if vals[0]!="sandbox"&&vals[0]!="live"{return ""}
 return vals[0]
}
func originAllowed(r *http.Request)bool{
 origin:=r.Header.Get("Origin")
 if origin==""{return true} // Server-to-server merchant API requests have no Origin.
 expected:=strings.TrimSuffix(strings.TrimSpace(getAllowedOrigin()),"/")
 return expected!=""&&origin==expected
}
var allowedOrigin string
func SetAllowedOrigin(v string){allowedOrigin=v}
func getAllowedOrigin()string{return allowedOrigin}
func mapped(w http.ResponseWriter,err error){
 var pg *pgconn.PgError
 if errors.As(err,&pg){
  switch pg.Code{
  case "23505": fail(w,409,"CONFLICT");return
  case "23514": fail(w,409,"LOCKED_OR_EXPIRED");return
  case "22023","23502","22001","22003":fail(w,422,"INVALID_REQUEST");return
  case "42501":fail(w,403,"ACCESS_DENIED");return
  case "P0002":fail(w,404,"SOURCE_NOT_FOUND");return
  }
 }
 fail(w,503,"FINANCIAL_SERVICE_UNAVAILABLE")
}
func validRequest(body createRequest)bool{
 if body.Currency!="BDT"||body.Expiry<5||body.Expiry>60{return false}
 if strings.TrimSpace(body.Reference)!=body.Reference||!referencePattern.MatchString(body.Reference){return false}
 // A linked total must NEVER be supplied by the browser; SQL resolves
 // it from a frozen server-side source document under the same realm/tenant.
 if body.OrderID!=""||body.InvoiceID!=""{
  if body.OrderID!=""&&body.InvoiceID!=""{return false}
  id:=body.OrderID
  if id==""{id=body.InvoiceID}
  return body.Amount==0&&uuidPattern.MatchString(id)
 }
 return body.Amount>=1&&body.Amount<=100000000000
}
func decode(w http.ResponseWriter,r *http.Request,into any)bool{
 dec:=json.NewDecoder(http.MaxBytesReader(w,r.Body,4096));dec.DisallowUnknownFields()
 if err:=dec.Decode(into);err!=nil{fail(w,422,"INVALID_REQUEST");return false}
 var other any
 if err:=dec.Decode(&other);!errors.Is(err,io.EOF){fail(w,422,"INVALID_REQUEST");return false}
 return true
}
func (s *Service) merchant(r *http.Request,ws,realm,scope string)error{
 if realm!="sandbox"{return authz.ErrUnavailable} // Live source adapter not yet onboarded.
 authHeader:=r.Header.Get("Authorization")
 if authHeader!="" {
  key,err:=s.Auth.AuthenticateMerchant(r.Context(),authHeader,authz.Environment(realm),scope)
  if err!=nil{return err}
  if ws!=""&&ws!=key.WorkspaceID{return authz.ErrForbidden}
  return nil
 }
 cookie,err:=r.Cookie("ekmivo-session")
 if err!=nil{return authz.ErrUnauthorized}
 actor,err:=s.Auth.Authenticate(r.Context(),cookie.Value)
 if err!=nil{return err}
 capability:=authz.PaymentsRead
 if scope=="payments:write"{capability=authz.PaymentsIssue}
 _,err=s.Auth.AuthorizeWorkspace(r.Context(),actor,ws,authz.Environment(realm),capability)
 return err
}
func authError(w http.ResponseWriter,err error){
 switch{
 case errors.Is(err,authz.ErrUnauthorized):fail(w,401,"UNAUTHENTICATED")
 case errors.Is(err,authz.ErrForbidden),errors.Is(err,authz.ErrMFANeeded):fail(w,403,"ACCESS_DENIED")
 default:fail(w,503,"AUTH_OR_SOURCE_UNAVAILABLE")
 }
}
func (s *Service) scoped(ctx context.Context,ws,realm string,fn func(pgx.Tx)error)error{
 tx,err:=s.Sandbox.BeginTx(ctx,pgx.TxOptions{})
 if err!=nil{return err}
 defer tx.Rollback(ctx)
 _,err=tx.Exec(ctx,`SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)`,ws,realm)
 if err!=nil{return err}
 if err=fn(tx);err!=nil{return err}
 return tx.Commit(ctx)
}
func attachTokens(s *Service,ws,realm string,result any){
 switch v:=result.(type){
 case map[string]any:
  if key,ok:=v["creation_key"].(string);ok {
   v["checkout_token"]=s.token(ws,realm,key)
   delete(v,"creation_key")
  }
 case []any:
  for _,item:=range v{attachTokens(s,ws,realm,item)}
 }
}
// HandleMerchant exposes independently scoped session or merchant-key
// requests, never accepts workspace_id from the JSON body.
func (s *Service) HandleMerchant(w http.ResponseWriter,r *http.Request){
 if !s.ready(){fail(w,503,"FINANCIAL_SERVICE_UNAVAILABLE");return}
 ws:=r.PathValue("workspaceID")
 realm:=explicitRealm(r)
 if !uuidPattern.MatchString(ws)||realm==""{fail(w,400,"INVALID_SCOPE");return}
 if realm=="live"{fail(w,503,"LIVE_SOURCE_NOT_CONNECTED");return}
 if r.Method!="GET"&&!originAllowed(r){fail(w,403,"ORIGIN_DENIED");return}
 cap:="payments:read"
 if r.Method!="GET"{cap="payments:write"}
 if err:=s.merchant(r,ws,realm,cap);err!=nil{authError(w,err);return}
 switch r.Method {
 case "GET":
  var raw []byte
  err:=s.scoped(r.Context(),ws,realm,func(tx pgx.Tx)error{
   return tx.QueryRow(r.Context(),"SELECT pg05_merchant_list($1::uuid,$2)",ws,realm).Scan(&raw)
  })
  if err!=nil{mapped(w,err);return}
  var data any
  if err=json.Unmarshal(raw,&data);err!=nil{fail(w,503,"INVALID_FINANCIAL_RESULT");return}
  attachTokens(s,ws,realm,data)
  write(w,200,map[string]any{"data":data,"environment":realm})
 case "POST":
  if r.PathValue("intentID")!=""{
   s.cancel(w,r,ws,realm);return
  }
  key:=r.Header.Get("Idempotency-Key")
  if !keyPattern.MatchString(key){fail(w,422,"IDEMPOTENCY_KEY_REQUIRED");return}
  var payload createRequest
  if !decode(w,r,&payload){return}
  if !validRequest(payload){fail(w,422,"INVALID_REQUEST");return}
  raw,_:=json.Marshal(payload)
  token:=s.token(ws,realm,key)
  var answer []byte
  err:=s.scoped(r.Context(),ws,realm,func(tx pgx.Tx)error{
   if payload.OrderID!=""||payload.InvoiceID!=""{
    kind,sourceID:="order",payload.OrderID
    if payload.InvoiceID!=""{kind,sourceID="invoice",payload.InvoiceID}
    return tx.QueryRow(r.Context(),
     `SELECT pg05_create_linked_intent($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8,$9)`,
     ws,realm,payload.Reference,kind,sourceID,payload.Expiry,key,digest(token),digest(string(raw))).Scan(&answer)
   }
   return tx.QueryRow(r.Context(),`SELECT pg05_create_intent($1::uuid,$2,$3,$4,$5,$6,$7,$8)`,
    ws,realm,payload.Reference,payload.Amount,payload.Expiry,key,digest(token),digest(string(raw))).Scan(&answer)
  })
  if err!=nil{mapped(w,err);return}
  var data map[string]any
  if err=json.Unmarshal(answer,&data);err!=nil{fail(w,503,"INVALID_FINANCIAL_RESULT");return}
  data["checkout_token"]=token
  write(w,201,data)
 default:fail(w,405,"METHOD_NOT_ALLOWED")
 }
}
// HandleSources creates immutable, server-calculated sandbox invoice/order
// snapshots and lists ONLY the documents in the authorized workspace.
func (s *Service) HandleSources(w http.ResponseWriter,r *http.Request){
 if !s.ready(){fail(w,503,"FINANCIAL_SERVICE_UNAVAILABLE");return}
 ws:=r.PathValue("workspaceID");realm:=explicitRealm(r)
 if !uuidPattern.MatchString(ws)||realm==""{fail(w,400,"INVALID_SCOPE");return}
 if realm=="live"{fail(w,503,"LIVE_SOURCE_NOT_CONNECTED");return}
 if r.Method!="GET"&&r.Method!="POST"{fail(w,405,"METHOD_NOT_ALLOWED");return}
 if r.Method=="POST"&&!originAllowed(r){fail(w,403,"ORIGIN_DENIED");return}
 scope:="payments:read"
 if r.Method=="POST"{scope="payments:write"}
 if err:=s.merchant(r,ws,realm,scope);err!=nil{authError(w,err);return}
 if r.Method=="GET"{
  var raw []byte
  err:=s.scoped(r.Context(),ws,realm,func(tx pgx.Tx)error{
   return tx.QueryRow(r.Context(),
    "SELECT pg05_list_billing_sources($1::uuid,$2)",ws,realm).Scan(&raw)
  })
  if err!=nil{mapped(w,err);return}
  if len(raw)==0||string(raw)=="null"{fail(w,403,"ACCESS_DENIED");return}
  var data any
  if json.Unmarshal(raw,&data)!=nil{fail(w,503,"INVALID_FINANCIAL_RESULT");return}
  write(w,200,map[string]any{"data":data,"environment":realm});return
 }
 var body struct{
  Kind string `json:"source_kind"`
  Reference string `json:"source_reference"`
  Items json.RawMessage `json:"items"`
 }
 if !decode(w,r,&body){return}
 if body.Kind!="order"&&body.Kind!="invoice"{fail(w,422,"INVALID_SOURCE");return}
 if !referencePattern.MatchString(body.Reference)||strings.TrimSpace(body.Reference)!=body.Reference||
  len(body.Items)==0{fail(w,422,"INVALID_SOURCE");return}
 var answer []byte
 err:=s.scoped(r.Context(),ws,realm,func(tx pgx.Tx)error{
  return tx.QueryRow(r.Context(),
   "SELECT pg05_create_billing_source($1::uuid,$2,$3,$4,$5::jsonb)",
   ws,realm,body.Kind,body.Reference,string(body.Items)).Scan(&answer)
 })
 if err!=nil{mapped(w,err);return}
 w.Header().Set("Content-Type","application/json; charset=utf-8")
 w.Header().Set("Cache-Control","no-store");w.WriteHeader(201);_,_=w.Write(answer)
}
func (s *Service) cancel(w http.ResponseWriter,r *http.Request,ws,realm string){
 if r.PathValue("action")!="cancel"||!uuidPattern.MatchString(r.PathValue("intentID")){
  fail(w,404,"NOT_FOUND");return
 }
 var answer []byte
 err:=s.scoped(r.Context(),ws,realm,func(tx pgx.Tx)error{
  return tx.QueryRow(r.Context(),"SELECT pg05_cancel_intent($1::uuid,$2,$3::uuid)",
    ws,realm,r.PathValue("intentID")).Scan(&answer)
 })
 if err!=nil{mapped(w,err);return}
 if len(answer)==0||string(answer)=="null"{fail(w,404,"NOT_FOUND");return}
 w.Header().Set("Cache-Control","no-store")
 w.WriteHeader(200);_,_=w.Write(answer)
}
var digits=map[rune]rune{
 '০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9',
 '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
}
func NormalizePayer(s string)(string,bool){
 var b strings.Builder
 for _,r:=range strings.TrimSpace(s){
  if d,ok:=digits[r];ok{r=d}
  if r==' '||r=='-'{continue}
  b.WriteRune(r)
 }
 s=b.String()
 if strings.HasPrefix(s,"01"){s="+88"+s}
 if strings.HasPrefix(s,"8801"){s="+"+s}
 if len(s)!=14||!strings.HasPrefix(s,"+8801"){return "",false}
 if s[5]<'3'||s[5]>'9'{return "",false}
 for _,ch:=range s[6:]{if ch<'0'||ch>'9'{return "",false}}
 return s,true
}
// HandlePublic validates a 256-bit opaque capability; no untrusted callback,
// money-status, redirect or manual "verified" operation is accepted.
func (s *Service) HandlePublic(w http.ResponseWriter,r *http.Request){
 if !s.ready(){fail(w,503,"FINANCIAL_SERVICE_UNAVAILABLE");return}
 token:=r.PathValue("token")
 if !tokenPattern.MatchString(token){fail(w,404,"NOT_FOUND");return}
 if r.Method=="POST" {
  if r.PathValue("action")!="lock"||!originAllowed(r){fail(w,403,"ORIGIN_DENIED");return}
  var body struct{Payer string `json:"payer_number"`;Method string `json:"method"`}
  if !decode(w,r,&body){return}
  payer,ok:=NormalizePayer(body.Payer)
  if !ok||!((body.Method=="bkash")||(body.Method=="nagad")||(body.Method=="rocket")){
   fail(w,422,"INVALID_PAYER_OR_METHOD");return
  }
  var raw []byte
  err:=s.Sandbox.QueryRow(r.Context(),"SELECT pg05_lock_payer($1,$2,$3,$4)",
   digest(token),hex.EncodeToString(mac(s.PayerKey,payer)),payer[len(payer)-4:],body.Method).Scan(&raw)
  if err!=nil{mapped(w,err);return}
  if len(raw)==0||string(raw)=="null"{fail(w,404,"NOT_FOUND");return}
  w.Header().Set("Content-Type","application/json")
  w.Header().Set("Cache-Control","no-store")
  w.Header().Set("Referrer-Policy","no-referrer")
  w.WriteHeader(200);_,_=w.Write(raw)
  return
 }
 if r.Method!="GET"||r.PathValue("action")!=""{fail(w,405,"METHOD_NOT_ALLOWED");return}
 var raw []byte
 err:=s.Sandbox.QueryRow(r.Context(),"SELECT pg05_checkout_view($1)",digest(token)).Scan(&raw)
 if err!=nil{mapped(w,err);return}
 if len(raw)==0||string(raw)=="null"{fail(w,404,"NOT_FOUND");return}
 w.Header().Set("Content-Type","application/json")
 w.Header().Set("Cache-Control","no-store")
 w.Header().Set("Referrer-Policy","no-referrer")
 w.WriteHeader(200);_,_=w.Write(raw)
}
// Prepared by the Go API main package on service startup.
func Diagnostic(s *Service)string{
 if s==nil||!s.ready(){return "checkout not configured"}
 return fmt.Sprintf("sandbox checkout configured, live gated, %s",time.Now().UTC().Format("2006-01-02"))
}
