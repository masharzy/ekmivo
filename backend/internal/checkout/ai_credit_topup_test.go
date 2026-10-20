package checkout

import (
 "net/http"
 "net/http/httptest"
 "testing"
)

func TestAICreditTopupDisabledFailsClosed(t *testing.T) {
 t.Setenv("BRIOFOLD_AI_TOPUPS_ENABLED","false")
 service:=&Service{}
 for _,path:=range []string{
  "/v1/workspaces/00000000-0000-4000-8000-000000000001/ai-credits/purchase",
  "/v1/workspaces/00000000-0000-4000-8000-000000000001/ai-credits/00000000-0000-4000-8000-000000000002/reconcile",
 }{
  req:=httptest.NewRequest(http.MethodPost,path,nil)
  recorder:=httptest.NewRecorder()
  service.HandleAICreditTopup(recorder,req)
  if recorder.Code!=http.StatusServiceUnavailable {
   t.Fatalf("disabled topup %s: got %d, want %d",path,recorder.Code,http.StatusServiceUnavailable)
  }
 }
}

func TestAICreditTopupNeedsAuthoritativeServices(t *testing.T) {
 t.Setenv("BRIOFOLD_AI_TOPUPS_ENABLED","true")
 service:=&Service{}
 req:=httptest.NewRequest(http.MethodPost,
  "/v1/workspaces/00000000-0000-4000-8000-000000000001/ai-credits/purchase",nil)
 recorder:=httptest.NewRecorder()
 service.HandleAICreditTopup(recorder,req)
 if recorder.Code!=http.StatusServiceUnavailable {
  t.Fatalf("unavailable financial services must fail closed, got %d",recorder.Code)
 }
}
