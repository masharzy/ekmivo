package checkout

// Physical phone management is distinct from per-account evidence routing.
// Each linked source remains a stable enrollment ID for queued receipt delivery.
import (
 "encoding/base64"
 "encoding/json"
 "errors"
 "net/http"
 "regexp"
 "strings"
 "time"

 "github.com/jackc/pgx/v5"
 "github.com/masharzy/ekmivo/backend/internal/deviceevidence"
 "github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
)

type phoneAssociation struct {
 ID string `json:"id"`
 AccountID string `json:"account_id"`
 Source string `json:"source"`
 Binding string `json:"binding"`
 ParserID string `json:"parser_id"`
 CapturePattern string `json:"capture_pattern"`
}
func (s *Service) HandlePhones(w http.ResponseWriter,r *http.Request) {
 if !s.pipelineReady(){ fail(w,503,"PIPELINE_SOURCE_UNAVAILABLE");return }
 ws,realm:=r.PathValue("workspaceID"),explicitRealm(r)
 id,action:=r.PathValue("phoneID"),r.PathValue("phoneAction")
 if !uuidPattern.MatchString(ws)|| (id!=""&&!uuidPattern.MatchString(id))||(realm!="sandbox"&&realm!="live"){fail(w,400,"INVALID_SCOPE");return}
 if r.Method!="GET"&&!originAllowed(r){fail(w,403,"ORIGIN_DENIED");return}
 if e:=s.pipelineSession(r,ws,realm,r.Method!="GET");e!=nil{authError(w,e);return}
 if r.Method=="GET" {
  if id!="" || action!=""{fail(w,404,"NOT_FOUND");return}
  var raw []byte
  type receiving struct{ID,Method,Number,Label string;Disabled bool}
  accounts:=[]receiving{}
  e:=s.pipelineScoped(r.Context(),ws,realm,func(tx pgx.Tx)error{
   if err:=tx.QueryRow(r.Context(),"SELECT pg06_phone_list($1::uuid,$2)",ws,realm).Scan(&raw);err!=nil{return err}
   rows,err:=tx.Query(r.Context(),"SELECT account_id,method,display_suffix,account_label,number_cipher,disabled_at FROM pg06_phone_account_cipher($1::uuid,$2)",ws,realm)
   if err!=nil{return err};defer rows.Close()
   for rows.Next(){
    var a receiving;var suffix string;var cipher []byte;var disabled *time.Time
    if err:=rows.Scan(&a.ID,&a.Method,&suffix,&a.Label,&cipher,&disabled);err!=nil{return err}
    plain,err:=merchantwebhook.Decrypt(s.Pipeline.Key,cipher,ws+"|"+realm)
    if err!=nil{return errors.New("receiving identity unavailable")}
    a.Number=string(plain)
    if _,ok:=NormalizePayer(a.Number);!ok{return errors.New("invalid receiving identity")}
    a.Disabled=disabled!=nil
    accounts=append(accounts,a)
   }
   return rows.Err()
  })
  if e!=nil{mapped(w,e);return}
  write(w,200,map[string]any{"items":json.RawMessage(raw),"accounts":accounts});return
 }
 if r.Method!="POST"{fail(w,405,"METHOD_NOT_ALLOWED");return}
 var body struct{
  Name string `json:"name"`
  AccountID string `json:"account_id"`
  Source string `json:"source"`
  Binding string `json:"binding"`
  ParserID string `json:"parser_id"`
  BindingID string `json:"binding_id"`
  Label string `json:"label"`
  Number string `json:"account_number"`
 }
 if e:=decodeBounded(w,r,&body,4096);e!=nil{fail(w,422,"INVALID_REQUEST");return}
 var raw []byte
 token:=""
 e:=s.pipelineScoped(r.Context(),ws,realm,func(tx pgx.Tx)error{
  switch{
  case id==""&&action=="":
   if strings.TrimSpace(body.Name)==""||len(body.Name)>80{return errors.New("phone name required")}
   var err error;token,err=randomCapability();if err!=nil{return err}
   return tx.QueryRow(r.Context(),"SELECT pg06_phone_begin($1::uuid,$2,$3,$4)",ws,realm,body.Name,digest(token)).Scan(&raw)
  case id!=""&&action=="attach":
   rule,ok:=s.Pipeline.Rules[body.ParserID]
   if !ok||!rule.Approved||(rule.SandboxOnly&&realm!="sandbox")||rule.Source!=body.Source||!uuidPattern.MatchString(body.AccountID){
    return errors.New("approved parser/source/account required")
   }
   if !(strings.HasPrefix(body.Binding,"sms:")||body.Binding=="package:"+body.Source) {return errors.New("invalid SIM/source binding")}
   var m string
   err:=tx.QueryRow(r.Context(),"SELECT method FROM financial_receiving_accounts WHERE id=$1::uuid AND workspace_id=$2::uuid AND environment=$3",body.AccountID,ws,realm).Scan(&m)
   if err!=nil||m!=rule.Method{return errors.New("method/account mismatch")}
   name:=body.Name;if name==""{name=body.Source}
   return tx.QueryRow(r.Context(),"SELECT pg06_phone_attach($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7,$8)",ws,realm,id,body.AccountID,name,body.Source,body.ParserID,body.Binding).Scan(&raw)
  case id!=""&&action=="edit-account":
   var ok bool
   var identity,suffix any
   var cipher []byte
   if body.Number!="" {
    number,valid:=NormalizePayer(body.Number)
    if !valid{return errors.New("invalid full receiving number")}
    var method string
    if err:=tx.QueryRow(r.Context(),"SELECT method FROM financial_receiving_accounts WHERE id=$1::uuid AND workspace_id=$2::uuid AND environment=$3",id,ws,realm).Scan(&method);err!=nil{return err}
    identity=deviceevidence.Identity(s.PayerKey,"account|"+method+"|"+number)
    suffix=number[len(number)-4:]
    var err error
    cipher,err=deviceevidence.Encrypt(s.Pipeline.Key,[]byte(number),ws+"|"+realm)
    if err!=nil{return err}
   }
   if err:=tx.QueryRow(r.Context(),"SELECT pg06_phone_account_edit($1::uuid,$2,$3::uuid,$4,$5,$6,$7)",ws,realm,id,body.Label,identity,suffix,cipher).Scan(&ok);err!=nil{return err}
   if !ok{return errors.New("account unavailable")};raw=[]byte(`{"saved":true}`);return nil
  case id!=""&&action=="detach":
   if !uuidPattern.MatchString(body.BindingID){return errors.New("invalid association")}
   var ok bool
   if err:=tx.QueryRow(r.Context(),"SELECT pg06_phone_detach($1::uuid,$2,$3::uuid,$4::uuid)",ws,realm,id,body.BindingID).Scan(&ok);err!=nil{return err}
   if !ok{return errors.New("association not found")};raw=[]byte(`{"detached":true}`);return nil
  case id!=""&&(action=="rename"||action=="revoke"):
   if action=="rename"&&(strings.TrimSpace(body.Name)==""||len(body.Name)>80){return errors.New("invalid name")}
   var ok bool
   if err:=tx.QueryRow(r.Context(),"SELECT pg06_phone_action($1::uuid,$2,$3::uuid,$4,$5)",ws,realm,id,action,body.Name).Scan(&ok);err!=nil{return err}
   if !ok{return errors.New("phone not found")};raw=[]byte(`{"saved":true}`);return nil
  default:return errors.New("invalid phone action")
  }
 })
 if e!=nil{mapped(w,e);return}
 result:=map[string]any{}
 if json.Unmarshal(raw,&result)!=nil{fail(w,503,"PHONE_RESULT_UNAVAILABLE");return}
 if token!=""{result["pairing_token"]=token}
 write(w,200,result)
}

// Called only after the same signed device transport's pre-authentication gate.
// A physical phone signs configuration/heartbeat. Its linked account enrollments
// each sign receipts separately and never become new physical registrations.
func (s *Service) HandlePhysicalDevice(w http.ResponseWriter,r *http.Request,raw []byte){
 var body struct{
  EnrollmentID string `json:"enrollment_id"`
  Environment string `json:"environment"`
  Permission bool `json:"permission_ok"`
  Backlog int `json:"backlog"`
  Overflow int64 `json:"overflow_count"`
  QueueError string `json:"queue_error"`
  Model string `json:"model"`
  AppVersion string `json:"app_version"`
 }
 id:=r.Header.Get("X-Ekmivo-Device-ID")
 if json.Unmarshal(raw,&body)!=nil||!uuidPattern.MatchString(id)||body.EnrollmentID!=id||(body.Environment!="sandbox"&&body.Environment!="live"){fail(w,403,"PHONE_AUTHORIZATION_REJECTED");return}
 pool:=s.pipelinePool(body.Environment)
 if pool==nil{fail(w,403,"PHONE_AUTHORIZATION_REJECTED");return}
 var ws,realm string;var key []byte;var version int64
 if e:=pool.QueryRow(r.Context(),"SELECT * FROM pg06_phone_key($1::uuid)",id).Scan(&ws,&realm,&key,&version);e!=nil||realm!=body.Environment{fail(w,403,"PHONE_AUTHORIZATION_REJECTED");return}
 var active bool;var authoritative int64
 if e:=s.Pipeline.Control.QueryRow(r.Context(),"SELECT source_version,active FROM resolve_financial_projection($1::uuid,$2)",ws,realm).Scan(&authoritative,&active);e!=nil||!active||authoritative!=version{
  fail(w,403,"PHONE_AUTHORIZATION_REJECTED");return
 }
 canonical,e:=deviceevidence.CanonicalRequest(r.Method,r.URL.Path,r.Header.Get("X-Ekmivo-Timestamp"),r.Header.Get("X-Ekmivo-Event-ID"),raw)
 signature,se:=base64.StdEncoding.DecodeString(r.Header.Get("X-Ekmivo-Signature"))
 if e!=nil||se!=nil||!deviceevidence.TimestampWithinSkew(r.Header.Get("X-Ekmivo-Timestamp"),time.Now())||!deviceevidence.VerifyP256DER(key,canonical,signature){
  fail(w,403,"PHONE_SIGNATURE_REJECTED");return
 }
 if r.PathValue("action")=="configuration" {
  var encoded []byte
  if e:=pool.QueryRow(r.Context(),"SELECT pg06_phone_configuration($1::uuid)",id).Scan(&encoded);e!=nil||len(encoded)==0||string(encoded)=="null"{
   fail(w,403,"PHONE_REVOKED");return
  }
  var result struct{
   ID string `json:"id"`
   Environment string `json:"environment"`
   ConfigVersion int64 `json:"config_version"`
   Bindings []phoneAssociation `json:"bindings"`
  }
  if json.Unmarshal(encoded,&result)!=nil{fail(w,503,"INVALID_CONFIGURATION");return}
  for i:=range result.Bindings{
   a:=&result.Bindings[i];rule,ok:=s.Pipeline.Rules[a.ParserID]
   if !ok||!rule.Approved||rule.Source!=a.Source||(rule.SandboxOnly&&realm!="sandbox"){
    fail(w,503,"APPROVED_SOURCE_UNAVAILABLE");return
   }
   pat:=rule.CapturePattern;if pat==""{pat=rule.Pattern}
   a.CapturePattern=strings.ReplaceAll(pat,"(?P<","(?<")
  }
  write(w,200,result);return
 }
 if r.PathValue("action")=="phone-heartbeat" {
  if body.Backlog<0||body.Backlog>10000||body.Overflow<0||len(body.QueueError)>64||
   !regexp.MustCompile(`^[A-Z0-9_]*$`).MatchString(body.QueueError){fail(w,422,"INVALID_HEALTH");return}
  var ok bool
  if e:=pool.QueryRow(r.Context(),"SELECT pg06_phone_heartbeat($1::uuid,$2,$3,$4,$5,$6,$7)",id,body.Permission,body.Backlog,body.Model,body.AppVersion,body.Overflow,body.QueueError).Scan(&ok);e!=nil||!ok{
   fail(w,503,"PHONE_HEALTH_UNAVAILABLE");return
  }
  write(w,200,map[string]bool{"stored":true});return
 }
 fail(w,404,"NOT_FOUND")
}

// Scope + signing prevent a sender-address spoof from selecting a destination.
// Actual payer and original transaction time come only from approved server parsers.
