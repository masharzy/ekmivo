package authz

import (
 "context"
 "crypto/rand"
 "encoding/base64"
 "strings"
 "testing"
)

func TestMerchantKeySyntaxAndEnvironment(t *testing.T){
 secret:=make([]byte,32)
 if _,err:=rand.Read(secret);err!=nil{t.Fatal(err)}
 raw:=base64.RawURLEncoding.EncodeToString(secret)
 prefix:="0123456789abcdef"
 for _,tc:=range []struct{label string;env Environment}{
  {"test",Sandbox},{"live",Live},
 }{
  token:="ek_"+tc.label+"_"+prefix+"_"+raw
  gotID,gotEnv,digest,ok:=ParseMerchantToken(token)
  if !ok||gotID!=prefix||gotEnv!=tc.env||len(digest)!=64{t.Fatalf("parse %s failed",tc.label)}
  if strings.Contains(digest,raw){t.Fatal("raw secret included in fingerprint")}
  _,_,_,valid:=ParseMerchantToken(token+"x")
  if valid{t.Fatal("accepted trailing token bytes")}
 }
 for _,token:=range []string{
  "", "ek_test_"+prefix+"_short","ek_live_"+prefix+"_"+strings.Repeat("a",42)+"B",
  "ek_test_"+strings.Repeat("f",16)+"_"+strings.Repeat("!",43),
  "ek_test_"+prefix+"_"+raw+" extra",
  "ek_prod_"+prefix+"_"+raw,
 }{
  if _,_,_,ok:=ParseMerchantToken(token);ok{t.Fatalf("accepted invalid merchant credential")}
 }
}
func TestMerchantKeyCannotAuthorizeWithoutDatabase(t *testing.T){
 _,err:=(*Repository)(nil).AuthenticateMerchant(context.Background(),"Bearer anything",Sandbox,"payments:read")
 if err!=ErrUnavailable{t.Fatalf("missing DB accepted: %v",err)}
}
