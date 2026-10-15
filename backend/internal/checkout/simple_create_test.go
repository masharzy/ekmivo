package checkout

import ("encoding/json";"testing")

func TestSimpleBDTParsing(t *testing.T) {
 for _,tc:=range []struct{input string;minor int64;valid bool}{
  {"150",15000,true},{"150.50",15050,true},{"0.01",1,true},{"1000000000",100000000000,true},
  {"0",0,false},{"0.001",0,false},{"-1",0,false},{"1e3",0,false},
  {"1.999",0,false},{"\"150\"",0,false},{"1000000000.01",0,false},
  {"01",0,false},{"150.5",15050,true},
 }{
  got,ok:=parseBDT(json.RawMessage(tc.input))
  if got!=tc.minor||ok!=tc.valid{t.Errorf("%s => %d/%v expected %d/%v",tc.input,got,ok,tc.minor,tc.valid)}
 }
}
func TestSimpleCreateDefaultsAndLegacyCompatibility(t *testing.T) {
 w:="527bf31a-bb41-4d3d-8c7f-9dbe725dc1df"
 key:="idempotency-key-123456"
 simple:=createRequest{AmountBDT:json.RawMessage("150.50"),RedirectURL:"https://merchant.example/success"}
 if !prepareCreateRequest(&simple,key,w,"sandbox"){t.Fatal("simple request rejected")}
 if simple.Amount!=15050||simple.Currency!="BDT"||simple.Expiry!=30||simple.Reference==""{t.Fatalf("bad defaults: %#v",simple)}
 retry:=createRequest{AmountBDT:json.RawMessage("150.50"),RedirectURL:"https://merchant.example/success"}
 if !prepareCreateRequest(&retry,key,w,"sandbox")||retry.Reference!=simple.Reference{t.Fatal("idempotent defaults changed")}
 legacy:=createRequest{Reference:"old-order",Amount:12500,Currency:"BDT",Expiry:15}
 if !prepareCreateRequest(&legacy,key,w,"sandbox")||legacy.Amount!=12500{t.Fatal("legacy integration broken")}
}
func TestSimpleCreateRejectsUnsafeInputs(t *testing.T) {
 tests:=[]createRequest{
  {AmountBDT:json.RawMessage("99"),RedirectURL:"http://merchant.example/success"},
  {AmountBDT:json.RawMessage("99")},
  {AmountBDT:json.RawMessage("99"),Amount:9900,RedirectURL:"https://merchant.example/success"},
  {AmountBDT:json.RawMessage("99"),RedirectURL:"https://merchant.example/success",WebhookURL:"http://localhost/hook"},
  {AmountBDT:json.RawMessage("99"),RedirectURL:"https://merchant.example/success",Metadata:json.RawMessage("[]")},
  {AmountBDT:json.RawMessage("99"),RedirectURL:"https://merchant.example/success",CustomerEmail:"bad email"},
 }
 for i,body:=range tests {if prepareCreateRequest(&body,"idempotency-123456","527bf31a-bb41-4d3d-8c7f-9dbe725dc1df","sandbox"){t.Errorf("accepted invalid request %d",i)}}
}
