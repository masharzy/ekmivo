package knowledge

import (
	"context"
	"io"
	"net/http"
	"net/netip"
	"strings"
	"testing"
)

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestURLRejectsPrivateMetadataCredentialsPortsAndTunnels(t *testing.T) {
	for _, raw := range []string{"http://example.com", "https://user:secret@example.com", "https://example.com:444", "https://127.0.0.1", "https://169.254.169.254/latest/meta-data", "https://[::1]", "https://[::ffff:127.0.0.1]", "https://localhost.", "https://service.internal", "https://[64:ff9b::a00:1]"} {
		if _, err := publicURL(raw); err == nil {
			t.Fatal("unsafe URL accepted", raw)
		}
	}
	for _, raw := range []string{"10.0.0.1", "100.64.1.1", "192.168.1.1", "203.0.113.1", "2001:db8::1", "fe80::1", "fc00::1", "127.0.0.1"} {
		if publicAddress(netip.MustParseAddr(raw)) {
			t.Fatal("unsafe address", raw)
		}
	}
	for _, raw := range []string{"8.8.8.8", "1.1.1.1", "2001:4860:4860::8888"} {
		if !publicAddress(netip.MustParseAddr(raw)) {
			t.Fatal("public address rejected", raw)
		}
	}
	if conn, err := publicDial(context.Background(), "tcp", "127.0.0.1:443"); err == nil {
		conn.Close()
		t.Fatal("private address reached dialer")
	}
}
func TestURLRedirectIsRevalidatedBeforeNextRequest(t *testing.T) {
	calls := 0
	client := &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{"https://169.254.169.254/secrets"}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	}), CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	if _, _, err := fetchPublic(context.Background(), "https://public.example/page", client); err == nil || calls != 1 {
		t.Fatal("private redirect followed", err, calls)
	}
}
func TestHTMLPreviewIsBoundedPlainTextWithoutScriptsFormsOrHiddenSecrets(t *testing.T) {
	text, err := htmlText([]byte(`<html><head><title>Ignore</title></head><body><h1>Orchid</h1><script>fetch('secret')</script><div hidden>Hidden secret</div><form>Private fields</form><p>Delivery &amp; warranty বাংলা</p><img src="https://169.254.169.254"><p>Three days</p></body></html>`))
	if err != nil || !strings.Contains(text, "Delivery & warranty বাংলা") || strings.Contains(text, "secret") || strings.Contains(text, "Private") || strings.Contains(text, "fetch") {
		t.Fatal(text, err)
	}
	if _, err := htmlText([]byte(strings.Repeat("x", MaxTextBytes+1))); err == nil {
		t.Fatal("oversized text accepted")
	}
}
