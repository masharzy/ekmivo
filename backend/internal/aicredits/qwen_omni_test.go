package aicredits
import("testing";"strings";"context")
func TestQwenStreamUsageAndCompletion(t *testing.T){
 s:="data: {\"id\":\"one\",\"model\":\"qwen3.5-omni-flash\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Fee is 500 BDT\"},\"finish_reason\":\"stop\"}]}\n\ndata: {\"id\":\"one\",\"choices\":[],\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":12}}\n\ndata: [DONE]\n"
 out,e:=readQwenStream(strings.NewReader(s),"qwen3.5-omni-flash");if e!=nil||out.Text!="Fee is 500 BDT"||out.Usage.InputTokens!=100||out.Usage.OutputTokens!=12{t.Fatal(out,e)}
 for _,bad:=range []string{strings.Replace(s,"data: [DONE]","",1),strings.Replace(s,"\"stop\"","\"length\"",1),strings.Replace(s,"\"prompt_tokens\":100","\"prompt_tokens\":null",1),strings.Replace(s,"\"model\":\"qwen3.5-omni-flash\"","\"model\":\"wrong\"",1)}{if _,e=readQwenStream(strings.NewReader(bad),"qwen3.5-omni-flash");e==nil{t.Fatal("accepted incomplete or unmetered stream")}}
}
func TestQwenMissingKeyRejectedBeforeExecution(t *testing.T){if _,e:=NewQwenOmni("").Generate(context.Background(),"qwen3.5-omni-flash",100,[]Message{{Role:"user",Content:"Hi"}});e!=ErrRejected{t.Fatal(e)}}
