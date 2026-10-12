package deviceevidence

import "testing"

func TestApprovedReceiptReceivingNumberIsDistinctFromPayerAndProviderSender(t *testing.T){
 rule:=ParserRule{
  ID:"fixture-receiving-v1",Version:1,Source:"BKASH",
  Method:"bkash",Approved:true,SandboxOnly:true,
  Pattern:"^Received (?P<amount>[0-9.]+) from (?P<payer>[+]880[0-9]+) to (?P<receiving>[+]880[0-9]+) at (?P<time>[0-9: -]+) ref (?P<reference>[A-Z0-9]+)$",
  CapturePattern:"^Received (?P<amount>[0-9.]+) from (?P<payer>[+]880[0-9]+) to (?P<receiving>[+]880[0-9]+) at (?P<time>[0-9: -]+) ref (?P<reference>[A-Z0-9]+)$",
  TimeLayout:"2006-01-02 15:04:05",TimeZone:"Asia/Dhaka",Precision:"second",
 }
 if err:=rule.Validate();err!=nil{t.Fatal(err)}
 sample:="Received 500.00 from +8801712345678 to +8801812345678 at 2026-10-12 15:04:05 ref TXREF001"
 receipt,err:=rule.Parse("BKASH","sandbox",sample)
 if err!=nil{t.Fatal(err)}
 if receipt.Receiving!="+8801812345678"||receipt.Payer!="+8801712345678"||receipt.Receiving==receipt.Payer {
  t.Fatalf("account/payer mixed: %#v",receipt)
 }
 if rule.AcceptCapture("OTP","sandbox",sample) {t.Fatal("unapproved SMS originatingAddress accepted")}
 if _,err:=rule.Parse("BKASH","sandbox","Received 500.00 from +8801712345678 to ****5678 at 2026-10-12 15:04:05 ref TXREF001");err==nil{
  t.Fatal("masked receiving identity accepted")
 }
}
