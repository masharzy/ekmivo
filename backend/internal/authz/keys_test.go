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
  for _,lead:=range []string{"bf","ek"}{
   legacy:=lead+"_"+tc.label+"_"+prefix+"_"+raw
   if _,e,_,ok:=ParseMerchantToken(legacy);!ok||e!=tc.env{t.Fatalf("%s %s credential rejected",lead,tc.label)}
  }
  token:="bf_"+tc.label+"_"+prefix+"_"+raw
  gotID,gotEnv,digest,ok:=ParseMerchantToken(token)
  if !ok||gotID!=prefix||gotEnv!=tc.env||len(digest)!=64{t.Fatalf("parse %s failed",tc.label)}
  if strings.Contains(digest,raw){t.Fatal("raw secret included in fingerprint")}
  _,_,_,valid:=ParseMerchantToken(token+"x")
  if valid{t.Fatal("accepted trailing token bytes")}
 }
 for _,token:=range []string{
  "", "bf_test_"+prefix+"_short","bf_live_"+prefix+"_"+strings.Repeat("a",42)+"B",
  "bf_test_"+strings.Repeat("f",16)+"_"+strings.Repeat("!",43),
  "bf_test_"+prefix+"_"+raw+" extra",
  "bf_prod_"+prefix+"_"+raw,
 }{
  if _,_,_,ok:=ParseMerchantToken(token);ok{t.Fatalf("accepted invalid merchant credential")}
 }
}
func TestMerchantKeyCannotAuthorizeWithoutDatabase(t *testing.T){
 _,err:=(*Repository)(nil).AuthenticateMerchant(context.Background(),"Bearer anything",Sandbox,"payments:read")
 if err!=ErrUnavailable{t.Fatalf("missing DB accepted: %v",err)}
}
