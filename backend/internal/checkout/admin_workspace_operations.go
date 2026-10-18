package checkout

import (
 "net/http"
 "encoding/json"
 "github.com/jackc/pgx/v5"
)

// HandleAdminWorkspaceOperations is a read-only, workspace-scoped, MFA-protected
// platform administration view. It never uses merchant impersonation or grants
// any finance mutation capability.
func (s *Service) HandleAdminWorkspaceOperations(w http.ResponseWriter,r *http.Request){
 if s==nil || s.Auth==nil || !s.pipelineReady(){fail(w,503,"PLATFORM_OPERATIONS_UNAVAILABLE");return}
 ws,realm,resource:=r.PathValue("workspaceID"),explicitRealm(r),r.PathValue("resource")
 if !uuidPattern.MatchString(ws)||(realm!="sandbox"&&realm!="live")||(resource!="payments"&&resource!="devices"&&resource!="overview"){fail(w,400,"INVALID_SCOPE");return}
 cookie,err:=r.Cookie("ekmivo-session")
 if err!=nil{fail(w,401,"UNAUTHENTICATED");return}
 actor,err:=s.Auth.Authenticate(r.Context(),cookie.Value)
 if err!=nil{authError(w,err);return}
 if _,err=s.Auth.AuthorizePlatform(r.Context(),actor,true);err!=nil{authError(w,err);return}
 var raw []byte
 err=s.pipelineScoped(r.Context(),ws,realm,func(tx pgx.Tx)error{
  if resource=="devices" {
   return tx.QueryRow(r.Context(),"SELECT pg06_phone_list($1::uuid,$2)",ws,realm).Scan(&raw)
  }
  return tx.QueryRow(r.Context(),"SELECT pg09_read($1::uuid,$2,$3,NULL::uuid,NULL::uuid,NULL::text,NULL::uuid,NULL::text,NULL::timestamptz,NULL::timestamptz,NULL::text)",ws,realm,resource).Scan(&raw)
 })
 if err!=nil{mapped(w,err);return}
 if !json.Valid(raw){fail(w,503,"OPERATIONS_INVALID_DATA");return}
 w.Header().Set("Cache-Control","private, no-store")
 w.Header().Set("Content-Type","application/json")
 w.WriteHeader(http.StatusOK)
 _,_=w.Write(raw)
}
