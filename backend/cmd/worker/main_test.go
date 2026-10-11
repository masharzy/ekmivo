package main

import (
 "encoding/json"
 "testing"
)

func TestWorkerAcceptsOnlyNonFinancialDurabilityProbes(t *testing.T){
 good:=json.RawMessage(`{"schema_version":1,"action":"durability_probe"}`)
 if err:=parseAuditPayload(good);err!=nil{t.Fatal(err)}
 for _,bad:=range [][]byte{
  []byte("invalid"),
  []byte(`{"schema_version":2,"action":"durability_probe"}`),
  []byte(`{"schema_version":1,"action":"mark_paid"}`),
  []byte(`{"schema_version":1,"action":"deliver_webhook"}`),
 }{
  if err:=parseAuditPayload(bad);err==nil{t.Fatalf("unsafe worker operation accepted: %s",bad)}
 }
}
func TestWorkerLeaseTokenIsUnpredictableRFC4122(t *testing.T){
 a,err:=makeLeaseToken();if err!=nil{t.Fatal(err)}
 b,err:=makeLeaseToken();if err!=nil{t.Fatal(err)}
 if a==b||len(a)!=36||a[14]!='4'{t.Fatal("weak lease token")}
}
