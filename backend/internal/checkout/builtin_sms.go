package checkout

import "github.com/masharzy/ekmivo/backend/internal/deviceevidence"

// Built-in, versioned receipt grammar for the owner-provided bKash/Nagad samples.
// These formats are deliberately narrow: a new provider message is stored for
// review, never paid from partial fields or arbitrary keyword matching.
// No merchant-created parser or customer-entered TrxID is required.
func builtinSMSRules() []deviceevidence.ParserRule {
 const payer=`(?:\+?88)?01[3-9][0-9]{8}`
 const amount=`[0-9]{1,10}(?:\.[0-9]{1,2})?`
 const date=`[0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}`
 const ref=`[A-Za-z0-9]{6,32}`
 base:=func(id,source,method,pattern string) deviceevidence.ParserRule {
  return deviceevidence.ParserRule{ID:id,Version:1,Source:source,Method:method,
   Pattern:pattern,TimeLayout:"02/01/2006 15:04",TimeZone:"Asia/Dhaka",
   Precision:"minute",Approved:true}
 }
 return []deviceevidence.ParserRule{
  base("builtin-bkash-received-v1","bKash","bkash",
   `^You have received Tk (?P<amount>`+amount+`) from (?P<payer>`+payer+
   `)\.(?: Ref[ :][^.]{1,120}\.)? Fee Tk `+amount+
   `\. Balance Tk `+amount+`\. TrxID (?P<reference>`+ref+
   `) at (?P<time>`+date+`)$`),
  base("builtin-nagad-received-v1","NAGAD","nagad",
   `^You have received Tk (?P<amount>`+amount+`) from (?P<payer>`+payer+
   `)\. Ref: [^.]{1,120}\. Current Balance: Tk `+amount+
   `\. TxnID: (?P<reference>`+ref+`) Date: (?P<time>`+date+`)$`),
 }
}
