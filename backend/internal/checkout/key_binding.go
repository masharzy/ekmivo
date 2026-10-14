package checkout

import (
 "context"
 "net/http"

 "github.com/masharzy/ekmivo/backend/internal/authz"
)

// Only a server handler which has already called AuthenticateMerchant may bind
// a verified credential. Never derive this value from an HTTP header/body.
type authenticatedMerchantContextKey struct{}

func WithAuthenticatedMerchant(r *http.Request, credential authz.MerchantCredential) *http.Request {
 return r.WithContext(context.WithValue(r.Context(), authenticatedMerchantContextKey{}, credential))
}

func boundMerchant(r *http.Request, workspace, realm, scope string) (bool,error) {
 credential,ok:=r.Context().Value(authenticatedMerchantContextKey{}).(authz.MerchantCredential)
 if !ok {return false,nil}
 if credential.WorkspaceID!=workspace || string(credential.Environment)!=realm {
  return true,authz.ErrForbidden
 }
 for _,granted:=range credential.Scopes {
  if granted==scope {return true,nil}
 }
 return true,authz.ErrForbidden
}
