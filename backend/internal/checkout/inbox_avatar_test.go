package checkout

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/masharzy/briofold/backend/internal/deviceevidence"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestTelegramAvatarKeepsBotCredentialServerSide(t *testing.T) {
	old := inboxHTTP
	defer func() { inboxHTTP = old }()
	key := []byte("01234567890123456789012345678901")
	token := "123456:abcdefghijklmnopqrstuvwxyz_ABCD"
	cipher, _ := deviceevidence.Encrypt(key, []byte(token), "store|inbox|tg|123456")
	raw, _ := json.Marshal(map[string]string{"provider": "tg", "customer": "42", "account": "123456", "credential": base64.StdEncoding.EncodeToString(cipher)})
	calls := 0
	photo := []byte("\x89PNG\r\n\x1a\nfixture")
	inboxHTTP = &http.Client{Transport: telegramTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		body := ""
		switch {
		case strings.HasSuffix(r.URL.Path, "/getUserProfilePhotos"):
			body = `{"ok":true,"result":{"photos":[[{"file_id":"avatar"}]]}}`
		case strings.HasSuffix(r.URL.Path, "/getFile"):
			body = `{"ok":true,"result":{"file_path":"photos/avatar.jpg"}}`
		case strings.HasSuffix(r.URL.Path, "/photos/avatar.jpg"):
			body = string(photo)
		default:
			t.Fatal("unexpected avatar request")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}, nil
	})}
	s := Service{Pipeline: &Pipeline{Key: key}}
	data, mime, err := s.fetchInboxAvatar(context.Background(), "store", raw)
	if err != nil || mime != "image/png" || string(data) != string(photo) || calls != 3 {
		t.Fatal("avatar resolution failed", mime, err, calls)
	}
	if strings.Contains(string(data), token) {
		t.Fatal("credential reached avatar bytes")
	}
}
func TestMetaAvatarAcceptsProviderPhotoLargerThan512KB(t *testing.T) {
	old := inboxHTTP
	defer func() { inboxHTTP = old }()
	t.Setenv("META_GRAPH_VERSION", "v26.0")
	key := []byte("01234567890123456789012345678901")
	token := "private-page-token"
	cipher, _ := deviceevidence.Encrypt(key, []byte(token), "store|inbox|ms|page")
	raw, _ := json.Marshal(map[string]string{"provider": "ms", "customer": "customer", "account": "page", "credential": base64.StdEncoding.EncodeToString(cipher)})
	photo := make([]byte, 600*1024)
	copy(photo, []byte{0xff, 0xd8, 0xff})
	inboxHTTP = &http.Client{Transport: telegramTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host == "graph.facebook.com" {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"profile_pic":"https://example.fbcdn.net/photo"}`)), Header: http.Header{}}, nil
		}
		if r.URL.Host != "example.fbcdn.net" || r.Header.Get("Authorization") != "" {
			t.Fatal("avatar credential/host boundary violated")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(photo))), Header: http.Header{}}, nil
	})}
	s := Service{Pipeline: &Pipeline{Key: key}}
	data, mime, err := s.fetchInboxAvatar(context.Background(), "store", raw)
	if err != nil || mime != "image/jpeg" || len(data) != len(photo) {
		t.Fatal("valid Meta photo rejected", mime, err)
	}
}
