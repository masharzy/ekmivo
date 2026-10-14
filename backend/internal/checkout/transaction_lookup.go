package checkout

import (
 "encoding/json"
 "net/http"
 "regexp"
 "strings"

 "github.com/jackc/pgx/v5"
 "github.com/masharzy/ekmivo/backend/internal/deviceevidence"
)

// TrxID-assisted lookup never allocates or marks a receipt paid.
// Only an already-verified payment for this tenant and immutable intent qualifies.
var merchantTrxIDPattern = regexp.MustCompile(`^[A-Za-z0-9_.:-]{4,128}$`)

type transactionLookupRequest struct {
 TransactionID string `json:"transaction_id"`
 Provider string `json:"provider"`
 AmountMinor int64 `json:"amount_minor"`
}

func (s *Service) HandleTransactionLookup(w http.ResponseWriter, r *http.Request) {
 if s == nil || !s.ready() { fail(w, 503, "FINANCIAL_SERVICE_UNAVAILABLE"); return }
 ws, realm, intentID := r.PathValue("workspaceID"), explicitRealm(r), r.PathValue("intentID")
 if !uuidPattern.MatchString(ws) || !uuidPattern.MatchString(intentID) ||
  (realm != "live" && realm != "sandbox") { fail(w, 400, "INVALID_SCOPE"); return }
 if err := s.merchant(r, ws, realm, "payments:read"); err != nil { authError(w, err); return }
 if !s.budget(w, "trx-lookup:"+ws+":"+realm, 60) { return }
 var input transactionLookupRequest
 if !decode(w, r, &input) { return }
 input.TransactionID=strings.TrimSpace(input.TransactionID)
 input.Provider=strings.ToLower(strings.TrimSpace(input.Provider))
 if !merchantTrxIDPattern.MatchString(input.TransactionID) ||
  (input.Provider!="bkash" && input.Provider!="nagad" && input.Provider!="rocket") ||
  input.AmountMinor<=0 { fail(w, 422, "INVALID_TRANSACTION_LOOKUP"); return }
 hash:=deviceevidence.Identity(s.PayerKey, "receipt|"+input.Provider+"|"+input.TransactionID)
 var raw []byte
 err:=s.scoped(r.Context(),ws,realm,func(tx pgx.Tx) error {
  return tx.QueryRow(r.Context(),
   "SELECT pg61_transaction_lookup($1::uuid,$2,$3::uuid,$4,$5,$6)",
   ws,realm,intentID,input.Provider,hash,input.AmountMinor).Scan(&raw)
 })
 if err!=nil { mapped(w,err); return }
 var result map[string]any
 if json.Unmarshal(raw,&result)!=nil || result==nil { fail(w,503,"INVALID_FINANCIAL_RESULT"); return }
 write(w,200,result)
}
