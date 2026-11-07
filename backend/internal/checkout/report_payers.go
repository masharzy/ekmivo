package checkout

import (
 "encoding/base64"
 "encoding/json"
 "net/http"
 "time"

 "github.com/jackc/pgx/v5"
 "github.com/masharzy/briofold/backend/internal/deviceevidence"
 "github.com/masharzy/briofold/backend/internal/merchantwebhook"
)

// HandleReportLedger returns real VERIFIED payments and their verified payer
// number, never a destination/receiving number or guessed customer contact.
// Decryption happens only here, after an owner/admin session is authorized.
// A merchant API key / viewer / editor cannot retrieve another person's phone.
func (s *Service) HandleReportLedger(w http.ResponseWriter,r *http.Request) {
 ws,realm:=r.PathValue("workspaceID"),explicitRealm(r)
 if !s.pipelineReady()||!uuidPattern.MatchString(ws)||s.pipelinePool(realm)==nil {
  fail(w,503,"REPORT_SOURCE_UNAVAILABLE");return
 }
 _,role,e:=s.documentActor(r,ws,realm,"payments",false)
 if e!=nil {authError(w,e);return}
 if role!="owner"&&role!="admin" {fail(w,403,"PAYER_REPORT_ACCESS_DENIED");return}
 if !s.budget(w,"payer-ledger:"+ws+":"+realm,60){return}
 from,err1:=time.Parse(time.RFC3339,r.URL.Query().Get("from"))
 to,err2:=time.Parse(time.RFC3339,r.URL.Query().Get("to"))
 account,cursor:=r.URL.Query().Get("account"),r.URL.Query().Get("cursor")
 if err1!=nil||err2!=nil||!to.After(from)||to.Sub(from)>366*24*time.Hour||
  account!=""&&!uuidPattern.MatchString(account)||
  cursor!=""&&!uuidPattern.MatchString(cursor) {
  fail(w,422,"INVALID_LEDGER_FILTERS");return
 }
 var raw []byte
 e=s.pipelineScoped(r.Context(),ws,realm,func(tx pgx.Tx)error{
  return tx.QueryRow(r.Context(),
   "SELECT pg57_report_payer_ledger($1::uuid,$2,$3,$4,$5::uuid,$6::uuid)",
   ws,realm,from,to,nullableID(account),nullableID(cursor)).Scan(&raw)
 })
 if e!=nil {mapped(w,e);return}
 var payload struct{
  Items []struct{
   ID string `json:"id"`
   Reference string `json:"merchant_reference"`
   VerifiedMinor int64 `json:"verified_amount_minor"`
   VerifiedAt time.Time `json:"verified_at"`
   OriginalAt *time.Time `json:"original_transaction_at"`
   Method string `json:"method"`
   Currency string `json:"currency"`
   PayerCipher string `json:"payer_cipher_b64"`
  } `json:"items"`
  NextCursor *string `json:"next_cursor"`
 }
 if json.Unmarshal(raw,&payload)!=nil {fail(w,503,"INVALID_LEDGER_SOURCE");return}
 type row struct{
  ID string `json:"id"`
  Reference string `json:"merchant_reference"`
  AmountMinor int64 `json:"verified_amount_minor"`
  VerifiedAt time.Time `json:"verified_at"`
  OriginalAt *time.Time `json:"original_transaction_at,omitempty"`
  Method string `json:"method"`
  Currency string `json:"currency"`
  PayerNumber *string `json:"payer_number"`
 }
 rows:=make([]row,0,len(payload.Items))
 for _,item:=range payload.Items {
  var number *string
  if item.PayerCipher!="" {
   ciphertext,err:=base64.StdEncoding.DecodeString(item.PayerCipher)
   if err!=nil {fail(w,503,"PAYER_EVIDENCE_UNAVAILABLE");return}
   plain,err:=merchantwebhook.Decrypt(s.Pipeline.Key,ciphertext,ws+"|"+realm+"|refund-customer")
   if err!=nil {fail(w,503,"PAYER_EVIDENCE_UNAVAILABLE");return}
   var contact struct{Phone string `json:"phone"`}
   if json.Unmarshal(plain,&contact)!=nil {fail(w,503,"PAYER_EVIDENCE_UNAVAILABLE");return}
   normalized,valid:=deviceevidence.NormalizeNumber(contact.Phone)
   if !valid {fail(w,503,"PAYER_EVIDENCE_UNAVAILABLE");return}
   number=&normalized
  }
  rows=append(rows,row{ID:item.ID,Reference:item.Reference,AmountMinor:item.VerifiedMinor,
   VerifiedAt:item.VerifiedAt,OriginalAt:item.OriginalAt,Method:item.Method,Currency:item.Currency,PayerNumber:number})
 }
 w.Header().Set("Cache-Control","private, no-store")
 w.Header().Set("Referrer-Policy","no-referrer")
 write(w,200,map[string]any{"items":rows,"next_cursor":payload.NextCursor})
}
