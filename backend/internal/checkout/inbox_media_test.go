package checkout

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"strconv"
	"testing"
	"time"
)

func TestMetaMediaHostBoundary(t *testing.T) {
	for _, u := range []string{"http://lookaside.fbsbx.com/a", "https://fbcdn.net.evil.test/a", "https://127.0.0.1/a", "https://user@lookaside.fbsbx.com/a", "https://lookaside.fbsbx.com:123/a"} {
		if safeMetaMediaURL(u) {
			t.Fatalf("unsafe host accepted %s", u)
		}
	}
	if !safeMetaMediaURL("https://lookaside.fbsbx.com/whatsapp_business/attachments/x") {
		t.Fatal("Meta media host rejected")
	}
}
func TestIncomingMediaParsing(t *testing.T) {
	raw := []byte(`{"entry":[{"id":"page","messaging":[{"sender":{"id":"user"},"timestamp":1700000000000,"message":{"mid":"message","attachments":[{"type":"image","payload":{"url":"https://x.fbcdn.net/a"}},{"type":"audio","payload":{"url":"https://x.fbcdn.net/b"}}]}}]}]}`)
	got := parseInboxMedia(raw)
	if len(got) != 2 || got[1].Message != "message/1" || got[0].Kind != "image" {
		t.Fatalf("wrong normalization %#v", got)
	}
}
func TestReactionPayloadAndProviderReply(t *testing.T) {
	s := &Service{}
	job := inboxSendJob{Type: "reaction", Channel: "ig", Recipient: "user", Content: map[string]any{"emoji": "❤️", "provider_id": "mid"}}
	p, err := s.inboxSendPayload(context.Background(), job, "token", "v25.0")
	if err != nil || p["sender_action"] != "react" {
		t.Fatal(p, err)
	}
	b, _ := json.Marshal(p)
	if string(b) == "" {
		t.Fatal("empty payload")
	}
	job = inboxSendJob{Type: "text", Channel: "wa", Text: "hello", Reply: "original", Recipient: "customer"}
	p, err = s.inboxSendPayload(context.Background(), job, "token", "v25.0")
	if err != nil || p["context"].(map[string]string)["message_id"] != "original" {
		t.Fatal("reply context lost", p, err)
	}
}
func TestMediaRejectsOversizeAndExecutable(t *testing.T) {
	if _, err := validateInboxMedia(make([]byte, inboxMediaLimit+1), "image/png"); err == nil {
		t.Fatal("oversize accepted")
	}
	if _, err := validateInboxMedia([]byte("MZ\x00\x01\x02"), "image/png"); err == nil {
		t.Fatal("invalid binary accepted")
	}
}

func TestProviderOggAudioIsNotRejectedAsGenericOgg(t *testing.T) {
	data := make([]byte, 64)
	copy(data, []byte("OggS\x00"))
	typ, err := validateInboxMedia(data, "audio/ogg")
	if err != nil || typ != "audio/ogg" {
		t.Fatal(typ, err)
	}
}

// Provider URLs must be short-lived capabilities bound to the exact Store,
// realm, conversation and file. A source storage key must never leave the API.
func TestOutboundAttachmentCapabilityScope(t *testing.T) {
	t.Setenv("INBOX_PUBLIC_API_ORIGIN", "https://media.example.test")
	key := []byte("fictional-media-capability-key-32-bytes")
	s := &Service{Pipeline: &Pipeline{Key: key}}
	for _, channel := range []string{"ms", "ig"} {
		for _, kind := range []string{"image", "audio", "document"} {
			job := inboxSendJob{Workspace: "store", Environment: "sandbox", Thread: "thread", Type: kind, Channel: channel, Recipient: "customer", Content: map[string]any{"media_id": "file", "object_key": "private-source-must-not-leak"}}
			payload, err := s.inboxSendPayload(context.Background(), job, "secret-token", "v25.0")
			if channel == "ig" && kind == "document" {
				if err == nil {
					t.Fatal("unsupported Instagram document accepted")
				}
				continue
			}
			if err != nil {
				t.Fatal(err)
			}
			raw, _ := json.Marshal(payload)
			if bytes.Contains(raw, []byte("private-source")) || bytes.Contains(raw, []byte("secret-token")) {
				t.Fatal("private storage or token leaked")
			}
			message := payload["message"].(map[string]any)
			attachment := message["attachment"].(map[string]any)
			expected := kind
			if kind == "document" {
				expected = "file"
			}
			if attachment["type"] != expected {
				t.Fatal("wrong provider attachment", attachment)
			}
			u, err := url.Parse(attachment["payload"].(map[string]any)["url"].(string))
			if err != nil {
				t.Fatal(err)
			}
			q := u.Query()
			expires, err := strconv.ParseInt(q.Get("expires"), 10, 64)
			if err != nil || expires < time.Now().Add(9*time.Minute).Unix() || expires > time.Now().Add(11*time.Minute).Unix() {
				t.Fatal("unbounded capability expiry")
			}
			if u.Scheme != "https" || u.Host != "media.example.test" || u.Path != "/v1/channels/media/file" || q.Get("w") != "store" || q.Get("e") != "sandbox" || q.Get("t") != "thread" {
				t.Fatal("capability scope lost", u)
			}
			sign := func(realm string) string {
				mac := hmac.New(sha256.New, key)
				mac.Write([]byte("inbox-media|store|" + realm + "|thread|file|" + q.Get("expires")))
				return hex.EncodeToString(mac.Sum(nil))
			}
			if q.Get("sig") != sign("sandbox") || q.Get("sig") == sign("live") {
				t.Fatal("signature does not bind realm")
			}
		}
	}
}
