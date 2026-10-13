package checkout

import (
 "crypto/sha256"
 "encoding/hex"
 "encoding/json"
 "net/http"
 "strings"
 "time"

 "github.com/masharzy/ekmivo/backend/internal/deviceevidence"
)

// The phone is an evidence forwarder, not a receiving-account or payment authority.
// These narrowly scoped sender labels are collection hints, NOT trusted receipt parsers.
func paymentSMSSource(sender, body string) bool {
 switch strings.ToLower(strings.TrimSpace(sender)) {
 case "bkash", "nagad", "rocket":
 default: return false
 }
 normalized:=strings.ToLower(strings.TrimSpace(body))
 // No wildcard forwarding: OTPs, sign-in codes and unrelated personal SMS
 // from the same originatingAddress must not be uploaded.
 return len(normalized)>=22 && len(normalized)<=6000 &&
  (strings.Contains(normalized,"received")||strings.Contains(normalized,"cash in")) &&
  (strings.Contains(normalized,"tk ")||strings.Contains(normalized,"amount:")) &&
  (strings.Contains(normalized," from ")||strings.Contains(normalized,"sender")||
   strings.Contains(normalized,"trx")||strings.Contains(normalized,"txn")||
   strings.Contains(normalized,"uddokta"))
}

func (s *Service) handlePhoneForward(w http.ResponseWriter,r *http.Request,raw []byte,phoneID,workspace,realm string) {
 var event struct {
  EnrollmentID string `json:"enrollment_id"`
  Environment string `json:"environment"`
  Source string `json:"source"`
  Binding string `json:"binding"`
  Kind string `json:"kind"`
  Evidence string `json:"evidence"`
  ObservedAt time.Time `json:"observed_at"`
  Sequence int64 `json:"sequence"`
  ConfigurationVersion int64 `json:"configuration_version"`
 }
 if json.Unmarshal(raw,&event)!=nil || event.EnrollmentID!=phoneID ||
  event.Environment!=realm || event.Kind!="device_sms" ||
  event.Sequence<=0 || event.ConfigurationVersion<0 ||
  !strings.HasPrefix(event.Binding,"sms:") || len(event.Binding)>80 ||
  !paymentSMSSource(event.Source,event.Evidence) {
  fail(w,422,"IRRELEVANT_RECEIPT_REJECTED");return
 }
 if !s.budget(w,"phone-forward|"+phoneID,1500){return}
 pool:=s.pipelinePool(realm)
 if pool==nil{fail(w,503,"SOURCE_UNAVAILABLE");return}
 // Recheck allowed receiving method on the SERVER, not only the Android
 // configuration cache; signing a sender label is not authorization alone.
 senderMethod:=strings.ToLower(strings.TrimSpace(event.Source))
 if senderMethod!="bkash"&&senderMethod!="nagad"&&senderMethod!="rocket"{
  fail(w,422,"SOURCE_NOT_CONFIGURED");return
 }
 // The approved provider receipt is forwarded irrespective of SIM or displayed
 // receiving number. Server lookup below resolves an immutable UNIQUE attempt
 // within this phone's enrolled workspace; no account-number guess is made.
 // Choose a parser only when an approved rule recognizes the entire message.
 // Never infer payer from originatingAddress.
 var parsed *deviceevidence.ParsedReceipt
 parseMethod:=""
 for _,rule:=range s.Pipeline.Rules {
  if !rule.Approved || (rule.SandboxOnly && realm!="sandbox") ||
   !strings.EqualFold(rule.Source,event.Source) ||
   !rule.AcceptCapture(rule.Source,realm,event.Evidence){continue}
  receipt,e:=rule.Parse(rule.Source,realm,event.Evidence)
  if e!=nil || receipt.Payer=="" || receipt.TransactionAt.IsZero() || receipt.Amount<=0 ||
   receipt.Reference==""{continue}
  if parsed!=nil {
   // Conflicting/multiple valid rules are not a unique match.
   parsed=nil;parseMethod="";break
  }
  parsed=&receipt;parseMethod=rule.Method
 }
 var receiving any
 var encryptedContact any
 var payer,reference any
 var amount,original,precision,method,version any
 if parsed!=nil && parseMethod==senderMethod {
  payerIdentity:=deviceevidence.Identity(s.PayerKey,parsed.Payer)
  var candidate *string
  // The financial database scopes device -> workspace; it searches ALL payment
  // attempts for the exact payer, amount, provider and immutable transaction time.
  // Multiple matching attempts intentionally yield no receiving attribution.
  err:=pool.QueryRow(r.Context(),
   "SELECT pg06_phone_candidate($1::uuid,$2,$3,$4,$5,$6)",
   phoneID,parsed.Method,payerIdentity,parsed.Amount,parsed.TransactionAt,parsed.Precision).Scan(&candidate)
  if err!=nil{fail(w,503,"MATCHING_SOURCE_UNAVAILABLE");return}
  if candidate!=nil {
   receiving=*candidate
   payer=payerIdentity
   reference=deviceevidence.Identity(s.PayerKey,"receipt|"+parsed.Method+"|"+parsed.Reference)
   amount=parsed.Amount;original=parsed.TransactionAt;precision=parsed.Precision
   method=parsed.Method;version=parsed.Version
   contactJSON,_:=json.Marshal(map[string]string{"name":"","email":"","phone":parsed.Payer})
   contactCipher,encErr:=deviceevidence.Encrypt(s.Pipeline.Key,contactJSON,workspace+"|"+realm+"|refund-customer")
   if encErr!=nil{fail(w,503,"EVIDENCE_ENCRYPTION_UNAVAILABLE");return}
   encryptedContact=contactCipher
  }
 }

 eventID:=r.Header.Get("X-Ekmivo-Event-ID")
 cipher,e:=deviceevidence.Encrypt(s.Pipeline.Key,[]byte(event.Evidence),phoneID+"|"+eventID)
 if e!=nil{fail(w,503,"EVIDENCE_ENCRYPTION_UNAVAILABLE");return}
 hash:=sha256.Sum256(raw)
 var ack []byte
 e=pool.QueryRow(r.Context(),"SELECT pg06_phone_forward($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid,$11,$12,$13,$14,$15,$16,$17,$18)",
  phoneID,eventID,hex.EncodeToString(hash[:]),cipher,event.Source,event.Binding,
  event.ObservedAt,event.Sequence,event.ConfigurationVersion,receiving,payer,amount,
  original,precision,reference,method,version,encryptedContact).Scan(&ack)
 if e!=nil{mapped(w,e);return}
 write(w,202,json.RawMessage(ack))
}
