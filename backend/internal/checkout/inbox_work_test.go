package checkout

import (
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/masharzy/ekmivo/backend/internal/authz"
	"math"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestInboxUnicodeMessageLimit(t *testing.T) {
	for _, text := range []string{"Hello", strings.Repeat("ক", 8000), strings.Repeat("🙂", 8000)} {
		if !validInboxText(text) {
			t.Fatal("valid Unicode reply rejected")
		}
	}
	for _, text := range []string{"", " \n\t", strings.Repeat("ক", 8001), string([]byte{0xff})} {
		if validInboxText(text) {
			t.Fatal("invalid reply accepted")
		}
	}
}
func TestInboxWorkOffset(t *testing.T) {
	for _, v := range []any{nil, float64(0), float64(50), float64(10000)} {
		if _, ok := inboxWorkOffset(v); !ok {
			t.Fatal("valid offset rejected")
		}
	}
	for _, v := range []any{"50", float64(-1), float64(0.5), float64(10001), math.NaN(), math.Inf(1)} {
		if _, ok := inboxWorkOffset(v); ok {
			t.Fatal("invalid offset accepted")
		}
	}
}
func TestInboxWorkCapabilities(t *testing.T) {
	for action, want := range map[string]authz.Capability{"ai-review-read": authz.InboxRead, "ai-review-done": authz.InboxSend, "work-read": authz.InboxRead, "takeover": authz.InboxSend, "release": authz.InboxSend, "work": authz.InboxSend, "ticket": authz.InboxSend, "work-note": authz.InboxSend, "duty": authz.InboxSend, "saved-reply": authz.InboxManage, "archive-reply": authz.InboxManage} {
		got, ok := webInboxCapability(action)
		if !ok || got != want {
			t.Fatalf("%s capability mismatch", action)
		}
	}
}
func TestInboxWorkflowRecoveryStatus(t *testing.T) {
	for code, status := range map[string]int{"40001": 409, "40P01": 409, "54000": 429, "22007": 422, "22P02": 422, "42501": 403} {
		w := httptest.NewRecorder()
		inboxWorkFailure(w, &pgconn.PgError{Code: code})
		if w.Code != status {
			t.Fatalf("%s status %d", code, w.Code)
		}
	}
}
