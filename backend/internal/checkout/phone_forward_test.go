package checkout

import "testing"

func TestPaymentSMSForwardScope(t *testing.T){
 cases:=[]struct{sender,body string;allow bool}{
  {"bKash","You have received Tk 500.00 from 01712345678. TrxID AB123 at 12/10/2026 13:10",true},
  {"NAGAD","Money Received. Amount: Tk 250.00 Sender: 01912345678 TxnID ABC123",true},
  {"Rocket","Cash In Tk 100 from 01812345678 successful. Balance Tk 100",true},
  {"bKash","Your OTP is 123456. Do not share your verification code.",false},
  {"NAGAD","You have requested an account recovery code 123456",false},
  {"01712345678","You have received Tk 1000 from 01800000000",false},
  {"OtherBank","Received Tk 100 from 01700000000",false},
  {"bKash","Your account balance is Tk 4000",false},
  {"bKash","You have received Tk 100",false},
 }
 for _,c:=range cases{
  if actual:=paymentSMSSource(c.sender,c.body);actual!=c.allow{
   t.Errorf("sender=%q text=%q: got %t want %t",c.sender,c.body,actual,c.allow)
  }
 }
}
