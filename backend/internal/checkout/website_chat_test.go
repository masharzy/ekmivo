package checkout

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWebsiteExactOrigin(t *testing.T) {
	for _, o := range []string{"https://example.com", "https://shop.example.com", "https://example.com:443"} {
		if !websiteOrigin(o) {
			t.Fatal(o)
		}
	}
	for _, o := range []string{"", "null", "*", "http://example.com", "https://example.com/", "https://example.com/x", "https://example.com?x=1", "https://example.com#frag", "https://user:secret@example.com", "https://example.com:444", "https://example.com\\@evil.test", "https://example.com\n", "https:///", "https://"} {
		if websiteOrigin(o) {
			t.Fatal("unsafe origin", o)
		}
	}
}
func TestWebsiteSecretsAndImplicitDenial(t *testing.T) {
	a, e := websiteSecret()
	if e != nil {
		t.Fatal(e)
	}
	b, e := websiteSecret()
	if e != nil {
		t.Fatal(e)
	}
	if a == b || !websiteSecretValid(a) || len(websiteHash(a)) != 64 || websiteHash(a) == a {
		t.Fatal("secret isolation")
	}
	for _, bad := range []string{"", strings.Repeat("A", 64), a[:62], strings.Repeat("x", 64)} {
		if websiteSecretValid(bad) {
			t.Fatal("bad secret")
		}
	}
	for _, o := range []string{"", "null", "https://example.com/"} {
		r := httptest.NewRequest("POST", "https://api.example.test/", strings.NewReader(`{}`))
		r.SetPathValue("siteID", "621474bc-f320-4b21-ace9-1333f026f918")
		r.Header.Set("Origin", o)
		w := httptest.NewRecorder()
		(&Service{}).HandleWebsiteChat(w, r)
		if w.Code != 403 || w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatal("implicit access")
		}
	}
}
func TestWebsiteWidgetNoAmbientCredentialsOrHTML(t *testing.T) {
	w := httptest.NewRecorder()
	(&Service{}).HandleWebsiteWidget(w, httptest.NewRequest("GET", "/widget.js", nil))
	if w.Code != 200 || !strings.Contains(w.Header().Get("Content-Type"), "javascript") || strings.Contains(w.Body.String(), "innerHTML") || !strings.Contains(w.Body.String(), `credentials:"omit"`) {
		t.Fatal("unsafe widget")
	}
}
