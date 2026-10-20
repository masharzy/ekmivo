package checkout

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAITestEndpointFailsClosedWithoutRuntimeConfiguration(t *testing.T) {
	t.Setenv("BRIOFOLD_AI_RUNTIME_ENABLED", "false")
	recorder := httptest.NewRecorder()
	(&Service{}).HandleAITest(recorder, httptest.NewRequest(http.MethodPost, "/v1/workspaces/10000000-0000-4000-8000-000000000001/ai/test", nil))
	if recorder.Code != 503 {
		t.Fatal("disabled AI execution did not fail closed")
	}
	t.Setenv("BRIOFOLD_AI_RUNTIME_ENABLED", "true")
	t.Setenv("OPENROUTER_API_KEY", "")
	recorder = httptest.NewRecorder()
	(&Service{}).HandleAITest(recorder, httptest.NewRequest(http.MethodPost, "/v1/workspaces/10000000-0000-4000-8000-000000000001/ai/test", nil))
	if recorder.Code != 503 {
		t.Fatal("missing provider/auth/wallet configuration did not fail closed")
	}
}
