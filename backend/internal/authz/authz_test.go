package authz

import (
 "crypto/rand"
 "encoding/base64"
 "errors"
 "testing"
)

func TestOpaqueSessionHashRejectsInvalidTokens(t *testing.T) {
 for _,token:=range []string{"","arbitrary-token","../bad","123","."}{
  if _,ok:=hashOpaqueSession(token);ok{t.Fatalf("accepted invalid session %q",token)}
 }
 data:=make([]byte,32)
 if _,err:=rand.Read(data);err!=nil{t.Fatal(err)}
 valid:=base64.RawURLEncoding.EncodeToString(data)
 if hash,ok:=hashOpaqueSession(valid);!ok||len(hash)!=64{t.Fatal("valid 256-bit session rejected")}
 if hash,ok:=hashOpaqueSession(valid+"=");ok||hash!=""{t.Fatal("noncanonical session accepted")}
}
func TestCapabilityMatrixLeastPrivilege(t *testing.T){
 for _,role:=range []string{"owner","admin","editor","viewer"}{
  if !permits(role,PaymentsRead){t.Fatalf("%s cannot read",role)}
 }
 for _,role:=range []string{"owner","admin","editor"}{
  if !permits(role,PaymentsIssue){t.Fatalf("%s cannot issue safe PG05 requests",role)}
 }
 for _,role:=range []string{"viewer","","unknown"}{
  if permits(role,PaymentsIssue){t.Fatalf("%s unexpectedly issued payment request",role)}
 }
 if serviceAllows("ai",PaymentsIssue){t.Fatal("AI-only mode bypassed payments issue")}
 for _,role:=range []string{"editor","viewer","","unknown"}{
  for _,capability:=range []Capability{PaymentsManage,WorkspaceSettings,MembersManage}{
   if permits(role,capability){t.Fatalf("%s unexpectedly got %s",role,capability)}
  }
 }
 if permits("owner",Capability("payments:mark-paid")){t.Fatal("unregistered privileged capability accepted")}
 if serviceAllows("ai",PaymentsRead){t.Fatal("AI-only workspace gained payment access")}
 if !serviceAllows("commerce",PaymentsManage){t.Fatal("commerce workspace denied payment management")}
 if validEnvironment("preview") {t.Fatal("undeclared environment allowed")}
}
func TestFailClosedWithoutDatabase(t *testing.T){
 r:=&Repository{}
 if _,err:=r.Authenticate(t.Context(),"");!errors.Is(err,ErrUnavailable){t.Fatalf("want unavailable: %v",err)}
 if _,err:=r.AuthorizeWorkspace(t.Context(),Principal{UserID:"abc"},"invalid",Live,PaymentsRead);!errors.Is(err,ErrUnavailable){t.Fatalf("want unavailable: %v",err)}
 if _,err:=r.AuthorizePlatform(t.Context(),Principal{},true);!errors.Is(err,ErrUnavailable){t.Fatalf("want unavailable: %v",err)}
}

func TestInboxLeastPrivilegeAndIndependentProductAccess(t *testing.T) {
 for _, role := range []string{"owner", "admin", "editor", "viewer", "unknown", ""} {
  for _, check := range []struct { capability Capability; allowed bool }{
   {InboxRead, role == "owner" || role == "admin" || role == "editor" || role == "viewer"},
   {InboxSend, role == "owner" || role == "admin" || role == "editor"},
   {InboxManage, role == "owner" || role == "admin"},
  } {
   if permits(role, check.capability) != check.allowed { t.Fatalf("%s %s permission mismatch", role, check.capability) }
  }
 }
 for _, capability := range []Capability{InboxRead, InboxSend, InboxManage} {
  if !serviceAllows("ai", capability) || !serviceAllows("both", capability) || serviceAllows("commerce", capability) || serviceAllows("off", capability) {
   t.Fatalf("incorrect AI entitlement gate for %s", capability)
  }
 }
}
