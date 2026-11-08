package checkout

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/masharzy/briofold/backend/internal/deviceevidence"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestInboxUploadPermitBoundaries(t *testing.T) {
	key := []byte("01234567890123456789012345678901")
	now := time.Now()
	id := "00000000-0000-4000-8000-000000000001"
	base := inboxUploadPermit{Session: "sealed-session", Workspace: id, Realm: "live", Thread: id, Media: id, Size: 1024, Expires: now.Add(time.Minute).Unix()}
	seal := func(p inboxUploadPermit) string {
		raw, _ := json.Marshal(p)
		b, e := deviceevidence.Encrypt(key, raw, "inbox-upload:v1")
		if e != nil {
			t.Fatal(e)
		}
		return base64.RawURLEncoding.EncodeToString(b)
	}
	ticket := seal(base)
	if _, e := decodeInboxUploadPermit(key, ticket, id, now); e != nil {
		t.Fatal(e)
	}
	if _, e := decodeInboxUploadPermit(key, ticket, "00000000-0000-4000-8000-000000000002", now); e == nil {
		t.Fatal("permit crossed media boundary")
	}
	if _, e := decodeInboxUploadPermit(key, ticket, id, now.Add(2*time.Minute)); e == nil {
		t.Fatal("expired permit accepted")
	}
	b, _ := base64.RawURLEncoding.DecodeString(ticket)
	b[14] ^= 1
	if _, e := decodeInboxUploadPermit(key, base64.RawURLEncoding.EncodeToString(b), id, now); e == nil {
		t.Fatal("tampered permit accepted")
	}
	p := base
	p.Size = inboxMediaLimit + 1
	if _, e := decodeInboxUploadPermit(key, seal(p), id, now); e == nil {
		t.Fatal("oversize permitted")
	}
	p = base
	p.Realm = "other"
	if _, e := decodeInboxUploadPermit(key, seal(p), id, now); e == nil {
		t.Fatal("invalid realm permitted")
	}
}
func TestInboxUploadPreflight(t *testing.T) {
	old := getAllowedOrigin()
	SetAllowedOrigin("https://briofold.tech")
	defer SetAllowedOrigin(old)
	for _, origin := range []string{"https://briofold.tech", "https://evil.example", ""} {
		req := httptest.NewRequest(http.MethodOptions, "/v1/channels/upload/id", nil)
		req.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		(&Service{}).HandleInboxUpload(w, req)
		if origin == "https://briofold.tech" {
			if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != origin {
				t.Fatal("valid preflight denied")
			}
		} else if w.Code != 403 || w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatal("cross-origin upload permitted")
		}
	}
}
func TestTelegramUploadPreservesOriginalBytes(t *testing.T) {
	old := inboxHTTP
	defer func() { inboxHTTP = old }()
	original := []byte{0, 1, 2, 255, 128, 50, 42, 10}
	inboxHTTP = &http.Client{Transport: telegramTransport(func(r *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(r.URL.Path, "/sendPhoto") {
			t.Fatal("wrong upload route")
		}
		if err := r.ParseMultipartForm(1024); err != nil {
			t.Fatal(err)
		}
		f, _, err := r.FormFile("photo")
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		got, err := io.ReadAll(f)
		if err != nil || !bytes.Equal(got, original) {
			t.Fatal("original attachment bytes changed")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"ok":true,"result":{"message_id":12}}`)), Header: http.Header{}}, nil
	})}
	var result struct {
		ID int64 `json:"message_id"`
	}
	if err := telegramUpload(context.Background(), "123456:abcdefghijklmnopqrstuvwxyz_ABCD", "sendPhoto", "photo", "original.jpg", "image/jpeg", map[string]string{"chat_id": "42"}, original, &result); err != nil || result.ID != 12 {
		t.Fatal("upload failed", err)
	}
}
