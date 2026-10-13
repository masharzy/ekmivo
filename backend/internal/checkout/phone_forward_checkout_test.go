package checkout
import (
 "testing"
 "github.com/masharzy/ekmivo/backend/internal/deviceevidence"
)
func TestLiveMethodsPhysicalForwarderRequiresApprovedProviderParser(t *testing.T){
 valid:=deviceevidence.ParserRule{ID:"v1",Source:"bKash",Method:"bkash",Approved:true,Pattern:"^(?P<payer>.+) (?P<receiving>.+) (?P<amount>.+) (?P<time>.+) (?P<reference>.+)$"}
 service:=&Service{Pipeline:&Pipeline{Rules:map[string]deviceevidence.ParserRule{"v1":valid}}}
 raw:=[]byte(`{"sources":[{"method":"bkash","source":"bKash","forwarder":true}]}`)
 if !service.liveMethods(raw)["bkash"]{t.Fatal("approved provider parser should activate bound physical phone")}
 valid.Pattern="^(?P<payer>.+) (?P<amount>.+) (?P<time>.+) (?P<reference>.+)$"
 service.Pipeline.Rules["v1"]=valid
 if !service.liveMethods(raw)["bkash"]{t.Fatal("receiver capture must not be mandatory for a provider receipt")}
 valid.Pattern="^(?P<payer>.+) (?P<receiving>.+) (?P<amount>.+) (?P<time>.+) (?P<reference>.+)$"
 valid.SandboxOnly=true
 service.Pipeline.Rules["v1"]=valid
 if service.liveMethods(raw)["bkash"]{t.Fatal("sandbox-only parser must not activate live checkout")}
 valid.SandboxOnly=false;valid.Approved=false
 service.Pipeline.Rules["v1"]=valid
 if service.liveMethods(raw)["bkash"]{t.Fatal("unapproved parser must not activate live checkout")}
 if service.liveMethods([]byte(`{"sources":[]}`))["bkash"]{t.Fatal("paired source not in checkout must stay unavailable")}
}
