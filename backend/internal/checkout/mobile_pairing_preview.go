package checkout

import (
 "encoding/json"
 "errors"
 "net/http"

 "github.com/jackc/pgx/v5"
)

// Preview is intentionally separate from claim: loading a workspace must never
// consume a pairing token or start SMS collection before explicit consent.
func (s *Service) handleMobilePairingPreview(w http.ResponseWriter, r *http.Request, raw []byte) {
 w.Header().Set("Cache-Control", "no-store")
 var body struct { Token string `json:"pairing_token"` }
 if json.Unmarshal(raw,&body)!=nil || !physicalPairingCodePattern.MatchString(body.Token) {
  fail(w,422,"INVALID_ENROLLMENT"); return
 }
 if !s.budget(w,"device-preview-global",300) || !s.budget(w,"device-preview|"+digest(body.Token),20) { return }
 var identity []byte
 err:=s.Sandbox.QueryRow(r.Context(),"SELECT pg06_phone_pairing_preview($1)",digest(body.Token)).Scan(&identity)
 if (errors.Is(err,pgx.ErrNoRows) || err==nil && len(identity)==0) && s.Pipeline.Live!=nil {
  err=s.Pipeline.Live.QueryRow(r.Context(),"SELECT pg06_phone_pairing_preview($1)",digest(body.Token)).Scan(&identity)
 }
 if err!=nil && !errors.Is(err,pgx.ErrNoRows) { fail(w,503,"WORKSPACE_LOOKUP_UNAVAILABLE");return }
 if len(identity)==0 { fail(w,403,"PAIRING_UNAVAILABLE");return }
 var scope struct { Workspace string `json:"workspace_id"`; Environment string `json:"environment"`; Expires string `json:"expires_at"` }
 if json.Unmarshal(identity,&scope)!=nil || !uuidPattern.MatchString(scope.Workspace) || (scope.Environment!="sandbox"&&scope.Environment!="live") {
  fail(w,503,"WORKSPACE_LOOKUP_UNAVAILABLE");return
 }
 var preview []byte
 if err=s.Pipeline.Control.QueryRow(r.Context(),"SELECT mobile_workspace_preview($1::uuid,$2)",scope.Workspace,scope.Environment).Scan(&preview);err!=nil {
  if errors.Is(err,pgx.ErrNoRows) { fail(w,403,"PAIRING_UNAVAILABLE") } else { fail(w,503,"WORKSPACE_LOOKUP_UNAVAILABLE") };return
 }
 var result map[string]any
 if json.Unmarshal(preview,&result)!=nil || result==nil { fail(w,503,"WORKSPACE_LOOKUP_UNAVAILABLE");return }
 result["expires_at"]=scope.Expires
 write(w,200,result)
}
