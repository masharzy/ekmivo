package checkout

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestChannelConfigurationValidation(t *testing.T) {
	for k, v := range map[string]string{"META_APP_ID": "1234", "META_GRAPH_VERSION": "v25.0", "META_OAUTH_REDIRECT_URI": "https://app.example/api/channels/meta/callback", "CHANNEL_PUBLIC_ORIGIN": "https://api.example", "META_APP_SECRET": "secret-at-least-16-characters"} {
		if !validChannelSetting(k, v) {
			t.Fatal(k)
		}
	}
	for k, v := range map[string]string{"META_GRAPH_VERSION": "v1/../me", "META_APP_ID": "123\n456", "CHANNEL_PUBLIC_ORIGIN": "https://user:pass@host", "META_OAUTH_REDIRECT_URI": "http://app.test/callback", "evil": "value"} {
		if validChannelSetting(k, v) {
			t.Fatal(k)
		}
	}
	c := map[string]string{}
	if len(channelReadiness(c)["ms"].([]string)) != 6 {
		t.Fatal("incomplete Meta setup advertised")
	}
}
func TestTelegramPrivateTextAndSecretIsolation(t *testing.T) {
	raw := []byte(`{"update_id":12,"message":{"message_id":7,"date":1700000000,"text":"IELTS fee?","from":{"id":42,"first_name":"Test"},"chat":{"id":42,"type":"private"}}}`)
	u, ok := parseTelegramText(raw)
	if !ok || u.Message.Text != "IELTS fee?" {
		t.Fatal("text rejected")
	}
	for _, change := range []string{strings.Replace(string(raw), `"private"`, `"group"`, 1), strings.Replace(string(raw), `"text":"IELTS fee?"`, `"text":""`, 1), strings.Replace(string(raw), `"from":{"id":42`, `"from":{"id":43`, 1)} {
		if _, ok := parseTelegramText([]byte(change)); ok {
			t.Fatal("unsupported message accepted")
		}
	}
	key := []byte("01234567890123456789012345678901")
	if telegramSecret(key, "1") == telegramSecret(key, "2") || telegramSecret(key, "1") == telegramSecret([]byte("different-key"), "1") {
		t.Fatal("webhook context crossed")
	}
}

type telegramTransport func(*http.Request) (*http.Response, error)

func (f telegramTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestTelegramRequestsAndResponseConfirmation(t *testing.T) {
	old := inboxHTTP
	defer func() { inboxHTTP = old }()
	token := "123456:abcdefghijklmnopqrstuvwxyz_ABCD"
	inboxHTTP = &http.Client{Transport: telegramTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "api.telegram.org" || !strings.HasSuffix(r.URL.Path, "/getMe") {
			t.Fatal("unexpected provider")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"ok":true,"result":{"id":123456,"is_bot":true}}`)), Header: http.Header{}}, nil
	})}
	var result map[string]any
	if telegramCall(context.Background(), token, "getMe", map[string]any{}, &result) != nil || result["id"].(float64) != 123456 {
		t.Fatal("not confirmed")
	}
	inboxHTTP = &http.Client{Transport: telegramTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 403, Body: io.NopCloser(strings.NewReader(`{"ok":false,"description":"secret error"}`)), Header: http.Header{}}, nil
	})}
	if err := telegramCall(context.Background(), token, "getMe", nil, nil); err == nil || strings.Contains(err.Error(), token) || strings.Contains(err.Error(), "secret error") {
		t.Fatal("provider error exposed")
	}
}
func TestTelegramSendKeepsTextAndAvoidsOtherMethods(t *testing.T) {
	old := inboxHTTP
	defer func() { inboxHTTP = old }()
	key := []byte("01234567890123456789012345678901")
	token := "123456:abcdefghijklmnopqrstuvwxyz_ABCD"
	cipher, _ := deviceevidence.Encrypt(key, []byte(token), "ws|inbox|tg|123456")
	inboxHTTP = &http.Client{Transport: telegramTransport(func(r *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(r.URL.Path, "/sendMessage") {
			t.Fatal("wrong method")
		}
		var b map[string]any
		if json.NewDecoder(r.Body).Decode(&b) != nil || b["text"] != "৳500" || b["chat_id"] != "42" {
			t.Fatal("price/recipient lost")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"ok":true,"result":{"message_id":9}}`)), Header: http.Header{}}, nil
	})}
	s := Service{Pipeline: &Pipeline{Key: key}}
	state, id, code := s.sendTelegram(context.Background(), inboxSendJob{Type: "text", Workspace: "ws", Account: "123456", Recipient: "42", Text: "৳500", Credential: base64.StdEncoding.EncodeToString(cipher)})
	if state != "sent" || id != "9" || code != "" {
		t.Fatal(state, id, code)
	}
	state, _, code = s.sendTelegram(context.Background(), inboxSendJob{Type: "image"})
	if state != "failed" || code != "TELEGRAM_TEXT_ONLY" {
		t.Fatal("media falsely supported")
	}
}
