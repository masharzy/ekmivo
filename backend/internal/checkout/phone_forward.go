package checkout

import (
 "crypto/sha256"
 "encoding/hex"
 "encoding/json"
 "net/http"
 "strings"
 "time"

 "github.com/masharzy/ekmivo/backend/internal/deviceevidence"
 "github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
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
  (strings.Contains(normalized,"tk ")||strings.Contains(normalized,"amount:"))
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
 candidateRows,err:=pool.Query(r.Context(),
  "SELECT account_id,number_cipher FROM pg06_phone_candidate_accounts($1::uuid,$2)",phoneID,senderMethod)
 if err!=nil{fail(w,503,"SOURCE_UNAVAILABLE");return}
 type receiver struct{id string;cipher []byte}
 candidatesForSource:=[]receiver{}
 for candidateRows.Next(){
  var candidate receiver
  if err=candidateRows.Scan(&candidate.id,&candidate.cipher);err!=nil{break}
  candidatesForSource=append(candidatesForSource,candidate)
 }
 if candidateRows.Err()!=nil{err=candidateRows.Err()}
 candidateRows.Close()
 if err!=nil{fail(w,503,"SOURCE_UNAVAILABLE");return}
 if len(candidatesForSource)==0{fail(w,422,"SOURCE_NOT_CONFIGURED");return}
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
 var payer,reference any
 var amount,original,precision,method,version any
 if parsed!=nil && parseMethod==senderMethod {
  accountIDs:=[]string{}
  for _,candidate:=range candidatesForSource{
   // Never determine a RECEIVING account from provider SMS sender, an
   // unverified SIM slot, or the fact that the merchant has one account.
   if parsed.Receiving!="" {
    plain,de:=merchantwebhook.Decrypt(s.Pipeline.Key,candidate.cipher,workspace+"|"+realm)
    if de!=nil{fail(w,503,"SOURCE_UNAVAILABLE");return}
    if number,ok:=NormalizePayer(string(plain));ok && number==parsed.Receiving {
     accountIDs=append(accountIDs,candidate.id)
    }
   }
  }
  if len(accountIDs)==1{
   receiving=accountIDs[0]
   payer=deviceevidence.Identity(s.PayerKey,parsed.Payer)
   reference=deviceevidence.Identity(s.PayerKey,"receipt|"+accountIDs[0]+"|"+parsed.Reference)
   amount=parsed.Amount;original=parsed.TransactionAt;precision=parsed.Precision
   method=parsed.Method;version=parsed.Version
  }
 }
 eventID:=r.Header.Get("X-Ekmivo-Event-ID")
 cipher,e:=deviceevidence.Encrypt(s.Pipeline.Key,[]byte(event.Evidence),phoneID+"|"+eventID)
 if e!=nil{fail(w,503,"EVIDENCE_ENCRYPTION_UNAVAILABLE");return}
 hash:=sha256.Sum256(raw)
 var ack []byte
 e=pool.QueryRow(r.Context(),"SELECT pg06_phone_forward($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid,$11,$12,$13,$14,$15,$16,$17)",
  phoneID,eventID,hex.EncodeToString(hash[:]),cipher,event.Source,event.Binding,
  event.ObservedAt,event.Sequence,event.ConfigurationVersion,receiving,payer,amount,
  original,precision,reference,method,version).Scan(&ack)
 if e!=nil{mapped(w,e);return}
 write(w,202,json.RawMessage(ack))
}
