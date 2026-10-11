package financial

import(
 "context"
 "encoding/json"
 "errors"
 "strings"
 "testing"
 "github.com/jackc/pgx/v5"
)
func TestTransactionBoundaryValidatesScope(t *testing.T){
 for _,tc:=range []struct{ws,env string}{
  {"","sandbox"},{"not-a-uuid","live"},
  {"12345678-1234-4234-8234-123456789012","production"},
 }{
  if !errors.Is(validateScope(tc.ws,tc.env),ErrInvalid){t.Fatalf("accepted scope %+v",tc)}
 }
 if err:=validateScope("12345678-1234-4234-8234-123456789012","sandbox");err!=nil{t.Fatal(err)}
}
func TestResultMustBeBoundedSuccessObject(t *testing.T){
 for _,result:=range []Result{
  {200,json.RawMessage("[]")},
  {200,json.RawMessage("null")},
  {200,json.RawMessage("{")},
  {400,json.RawMessage("{}")},
  {200,json.RawMessage(strings.Repeat("x",17000))},
 }{
  if !errors.Is(validateResult(result),ErrInvalid){t.Fatalf("invalid result accepted: %d",result.Status)}
 }
 if err:=validateResult(Result{Status:201,Body:json.RawMessage(`{"id":"opaque"}`)});err!=nil{t.Fatal(err)}
}
func TestAbsentStoreNeverInvokesMutation(t *testing.T){
 called:=false
 _,err:=(&Store{}).Execute(t.Context(),"12345678-1234-4234-8234-123456789012","sandbox","payments.create","1234567890123456",[]byte("{}"),
  func(_ context.Context,_ pgx.Tx)(Result,error){called=true;return Result{},nil})
 if !errors.Is(err,ErrUnavailable)||called{t.Fatal("callback ran without financial DB+River")}
}
func TestDigestUsesWholeRequest(t *testing.T){
 if DigestRequest([]byte(`{"amount":1}`))==DigestRequest([]byte(`{"amount":2}`)){t.Fatal("different request bytes collided")}
 if len(DigestRequest([]byte("{}")))!=64{t.Fatal("digest length")}
}
func TestInvalidRealmBlocksAnyWrite(t *testing.T){
 s:=&Store{Realm:"live"}
 if err:=s.valid("12345678-1234-4234-8234-123456789012","sandbox");!errors.Is(err,ErrUnavailable){t.Fatal("nil pool must fail closed")}
}
