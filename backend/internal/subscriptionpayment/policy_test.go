package subscriptionpayment

import (
	"errors"
	"testing"
	"time"
)
const store="2e927250-501d-4868-a4f5-1376c736795c"
const receiver="78cc5e35-bf33-4350-94e7-9ca03dd6e7bd"
const other="49cf194d-c8a1-4730-a010-8e83d648f4b1"
func fixture() Snapshot {
	return Snapshot{
		IntentID:"e61f4c47-889d-4be8-ab91-fd72c4c0b131",
		QuoteID:"0bff3c6c-bb90-4a1c-8c6a-54303725d02c",
		InvoiceID:"18d637d8-a9cc-46d7-83bd-4a736c6e4978",
		StoreID:store,ReceiverID:receiver,
		OfferVersionID:"29a15792-d02a-47b9-8f9a-f4f58a45a0d1",
		CheckoutDigest:"aabbccdd"+ "11223344556677889900aabbccddeeff11223344556677889900aabb",
		Currency:"BDT",Product:"payments",Term:"monthly",AmountMinor:2500,
		PaymentExpiresAt:time.Now().Add(time.Hour),
	}
}
func TestSnapshotRejectsCrossStoreMoneyAndUnsupportedEntitlements(t *testing.T) {
	for _, tc:=range []struct{name string; mutate func(*Snapshot)}{
		{"valid",func(*Snapshot){}},
		{"buyer receiving",func(s *Snapshot){s.ReceiverID=s.StoreID}},
		{"wrong currency",func(s *Snapshot){s.Currency="USD"}},
		{"client priced free",func(s *Snapshot){s.AmountMinor=0}},
		{"negative due",func(s *Snapshot){s.AmountMinor=-1}},
		{"AI prepaid",func(s *Snapshot){s.Product="ai_credit"}},
		{"bundle auto debit",func(s *Snapshot){s.Product="bundle"}},
		{"yearly not bridged",func(s *Snapshot){s.Term="yearly"}},
		{"no locator",func(s *Snapshot){s.CheckoutDigest=""}},
		{"cross invoice",func(s *Snapshot){s.InvoiceID=other[:10]}},
		{"no expiration",func(s *Snapshot){s.PaymentExpiresAt=time.Time{}}},
	} {
		t.Run(tc.name,func(t *testing.T){s:=fixture();tc.mutate(&s);e:=s.Validate();if (tc.name=="valid")!=(e==nil){t.Fatalf("validation: %v",e)}})
	}
}
func TestSourcesFailClosed(t *testing.T) {
	s:=fixture()
	good:=Source{WorkspaceID:receiver,Method:"bkash",AccountID:other,Enabled:true,Verified:true,Online:true,ParserApproved:true,Ready:true}
	for _, tc:=range []struct{name string;mutate func(*Source)}{
		{"offline",func(x *Source){x.Online=false}},
		{"wrong receiver",func(x *Source){x.WorkspaceID=store}},
		{"disabled",func(x *Source){x.Enabled=false}},
		{"unverified",func(x *Source){x.Verified=false}},
		{"unapproved parser",func(x *Source){x.ParserApproved=false}},
		{"source stale",func(x *Source){x.Ready=false}},
		{"fabricated method",func(x *Source){x.Method="demo"}},
		{"missing account",func(x *Source){x.AccountID=""}},
	} {
		t.Run(tc.name,func(t *testing.T){x:=good;tc.mutate(&x);v,e:=AvailableSources(s,[]Source{x});if len(v)!=0||!errors.Is(e,ErrReceivingUnavailable){t.Fatalf("exposed unavailable method: %v %v",v,e)}})
	}
	v,e:=AvailableSources(s,[]Source{good,good});if e!=nil||len(v)!=1{t.Fatalf("deduplication: %v %v",v,e)}
}
func TestFinancialStateNeverTrustsClientSuccess(t *testing.T){
	s:=fixture();valid:=&Proof{PaymentID:other,ReceivingWorkspaceID:receiver,AmountMinor:s.AmountMinor,VerifiedAt:time.Now()}
	for _, tc:=range []struct{state string;proof *Proof;want Decision;failure bool}{
		{"completed",nil,"",true},
		{"paid",valid,"",true},
		{"awaiting_payment",nil,Waiting,false},
		{"requires_payer",nil,Waiting,false},
		{"processing",nil,Verifying,false},
		{"completed",valid,Activate,false},
		{"cancelled",valid,Recover,false},
		{"expired",valid,Recover,false},
		{"cancelled",nil,Cancelled,false},
		{"expired",nil,Expired,false},
		{"exception",nil,Recover,false},
		{"awaiting_payment",valid,Verifying,false},
	}{
		d,e:=Evaluate(s,tc.state,tc.proof)
		if tc.failure {if e==nil{t.Fatalf("%s: accepted fake verification",tc.state)}} else if e!=nil||d!=tc.want{t.Fatalf("%s: %s, %v",tc.state,d,e)}
	}
	for _, mutation:=range []func(*Proof){
		func(p *Proof){p.ReceivingWorkspaceID=store},
		func(p *Proof){p.AmountMinor++},
		func(p *Proof){p.VerifiedAt=time.Time{}},
		func(p *Proof){p.PaymentID=""}}{
		p:=*valid;mutation(&p);if _,e:=Evaluate(s,"completed",&p);!errors.Is(e,ErrInconsistentEvidence){t.Fatalf("invalid proof accepted: %v",e)}
	}
}
