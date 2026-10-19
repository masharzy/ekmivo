package checkout

import (
	"context"
	"encoding/json"
	"testing"
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
