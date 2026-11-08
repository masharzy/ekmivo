package checkout

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestInboxRealtimeWorkspaceIsolationAndCoalescing(t *testing.T) {
	h := &inboxRealtimeHub{ready: true, subscribers: make(map[string]map[chan struct{}]struct{})}
	a, ok := h.subscribe("store-a")
	if !ok {
		t.Fatal("subscription failed")
	}
	b, _ := h.subscribe("store-b")
	h.publish("store-a")
	h.publish("store-a")
	if len(a) != 1 || len(b) != 0 {
		t.Fatal("cross-store notification or duplicate queue")
	}
	h.unsubscribe("store-a", a)
	h.publish("store-a")
	if h.total != 1 || len(h.subscribers["store-a"]) != 0 {
		t.Fatal("subscription not released")
	}
	h.ready = false
	if _, ok = h.subscribe("store-c"); ok {
		t.Fatal("disconnected listener reported ready")
	}
}
func TestInboxRealtimeRejectsUntrustedOrigin(t *testing.T) {
	old := getAllowedOrigin()
	SetAllowedOrigin("https://briofold.tech")
	defer SetAllowedOrigin(old)
	for _, origin := range []string{"", "https://evil.example"} {
		req := httptest.NewRequest(http.MethodGet, "/v1/workspaces/test/inbox/realtime", nil)
		req.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		(&Service{}).HandleInboxRealtime(w, req)
		if w.Code != 403 {
			t.Fatal("untrusted socket origin permitted")
		}
	}
}
func TestTelegramSentMediaRetainsProviderFileReference(t *testing.T) {
	r := telegramSentMedia{Photos: []telegramMediaFile{{ID: "small"}, {ID: "large"}}}
	if r.fileID() != "large" {
		t.Fatal("channel photo reference lost")
	}
	r = telegramSentMedia{Voice: &telegramMediaFile{ID: "voice"}}
	if r.fileID() != "voice" {
		t.Fatal("voice reference lost")
	}
	r = telegramSentMedia{Document: &telegramMediaFile{ID: "document"}}
	if r.fileID() != "document" {
		t.Fatal("document reference lost")
	}
}
