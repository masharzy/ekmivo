package authz

import (
 "context"
 "crypto/sha256"
 "crypto/subtle"
 "database/sql"
 "encoding/base64"
 "encoding/hex"
 "errors"
 "regexp"
 "strings"
)

var merchantTokenRx=regexp.MustCompile(`^ek_(test|live)_([a-f0-9]{16})_([A-Za-z0-9_-]{43})$`)

// MerchantCredential deliberately contains no hash, token or account secrets.
type MerchantCredential struct {
 KeyID string `json:"key_id"`
 WorkspaceID string `json:"workspace_id"`
 Environment Environment `json:"environment"`
 Scopes []string `json:"scopes"`
}

func ParseMerchantToken(token string) (string,Environment,string,bool) {
 parts:=merchantTokenRx.FindStringSubmatch(token)
 if parts==nil{return "", "", "", false}
 decoded,err:=base64.RawURLEncoding.DecodeString(parts[3])
 if err!=nil||len(decoded)!=32||base64.RawURLEncoding.EncodeToString(decoded)!=parts[3]{
  return "","","",false
 }
 env:=Live
 if parts[1]=="test"{env=Sandbox}
 sum:=sha256.Sum256([]byte(token))
 return parts[2],env,hex.EncodeToString(sum[:]),true
}

// Authorization is by the entire high-entropy SHA-256 credential, not the
// public ID or prefix; resolver does not expose digests to the runtime role.
func (r *Repository) AuthenticateMerchant(ctx context.Context, authorization string, env Environment, scope string)(MerchantCredential,error){
 var result MerchantCredential
 if r==nil||r.DB==nil{return result,ErrUnavailable}
 if !validEnvironment(env){return result,ErrForbidden}
 if !strings.HasPrefix(authorization,"Bearer "){return result,ErrUnauthorized}
 token:=strings.TrimPrefix(authorization,"Bearer ")
 id,prefixEnv,digest,ok:=ParseMerchantToken(token)
 if !ok{return result,ErrUnauthorized}
 if prefixEnv!=env{return result,ErrForbidden}
 var realm,storedDigest string
 err:=r.DB.QueryRowContext(ctx,`SELECT key_id::text,tenant_id::text,realm,allowed_scopes,stored_digest
 FROM resolve_merchant_api_key($1)`,id).
 Scan(&result.KeyID,&result.WorkspaceID,&realm,&result.Scopes,&storedDigest)
 if errors.Is(err,sql.ErrNoRows){return MerchantCredential{},ErrUnauthorized}
 if err!=nil{return MerchantCredential{},ErrUnavailable}
 // Fixed-size digest comparison is constant time even when a prefix exists.
 if len(storedDigest)!=64||subtle.ConstantTimeCompare([]byte(storedDigest),[]byte(digest))!=1{
  return MerchantCredential{},ErrUnauthorized
 }
 if realm!=string(env){return MerchantCredential{},ErrForbidden}
 if !uuidRx.MatchString(result.WorkspaceID){return MerchantCredential{},ErrUnavailable}
 authorized:=false
 for _,candidate:=range result.Scopes{if candidate==scope{authorized=true}}
 if !authorized{return MerchantCredential{},ErrForbidden}
 var touched bool
 if err:=r.DB.QueryRowContext(ctx,`SELECT touch_merchant_api_key($1,$2)`,id,digest).Scan(&touched);err!=nil{
  return MerchantCredential{},ErrUnavailable
 }
 if !touched{return MerchantCredential{},ErrUnauthorized}
 result.Environment=env
 return result,nil
}
