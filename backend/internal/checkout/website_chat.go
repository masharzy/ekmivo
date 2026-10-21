package checkout

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"unicode/utf8"
)

func websiteOrigin(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Host != "" && u.User == nil && u.RawQuery == "" && u.Fragment == "" && u.Path == "" && u.RawPath == "" && u.Opaque == "" && u.String() == raw && u.Hostname() != "" && !strings.ContainsAny(raw, "\\\r\n\t ") && (u.Port() == "" || u.Port() == "443")
}
func websiteSecret() (string, error) {
	b := make([]byte, 32)
	_, e := rand.Read(b)
	return hex.EncodeToString(b), e
}
func websiteSecretValid(s string) bool {
	b, e := hex.DecodeString(s)
	return e == nil && len(b) == 32 && strings.ToLower(s) == s
}
func websiteHash(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }

func (s *Service) HandleWebsiteSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	cookie, e := r.Cookie("ekmivo-session")
	if e != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	actor, e := s.Auth.Authenticate(r.Context(), cookie.Value)
	if e != nil {
		authError(w, e)
		return
	}
	ws := r.PathValue("workspaceID")
	if !uuidPattern.MatchString(ws) {
		fail(w, 422, "INVALID_SCOPE")
		return
	}
	var raw []byte
	if r.Method == http.MethodGet {
		e = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_website_read($1::uuid,$2::uuid)", ws, actor.UserID).Scan(&raw)
	} else if r.Method == http.MethodPost {
		var b struct {
			Origin    string `json:"origin"`
			Enabled   bool   `json:"enabled"`
			Revision  int64  `json:"revision"`
			Operation string `json:"operation_key"`
		}
		if decodeBounded(w, r, &b, 4096) != nil || !websiteOrigin(b.Origin) || b.Revision < 0 || !uuidPattern.MatchString(b.Operation) {
			fail(w, 422, "INVALID_WEBSITE")
			return
		}
		e = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_website_save($1::uuid,$2::uuid,$3,$4,$5,$6::uuid)", ws, actor.UserID, b.Origin, b.Enabled, b.Revision, b.Operation).Scan(&raw)
	} else {
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	if e != nil {
		inboxWorkFailure(w, e)
		return
	}
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	if public := strings.TrimRight(os.Getenv("INBOX_PUBLIC_API_ORIGIN"), "/"); websiteOrigin(public) {
		data["api_origin"] = public
	}
	write(w, 200, data)
}

// Public visitor access never consumes merchant cookies or URL query secrets.
func (s *Service) HandleWebsiteChat(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Vary", "Origin")
	site, origin := r.PathValue("siteID"), r.Header.Get("Origin")
	if !uuidPattern.MatchString(site) || !websiteOrigin(origin) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if s == nil || s.Pipeline == nil || s.Pipeline.Control == nil || len(s.Pipeline.Key) != 32 {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	var allowed bool
	if e := s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_website_origin($1::uuid,$2)", site, origin).Scan(&allowed); e != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	if !allowed {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(204)
		return
	}
	if r.Method != http.MethodPost {
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	var b struct {
		Action string `json:"action"`
		Secret string `json:"secret"`
		Text   string `json:"text"`
		Key    string `json:"key"`
		Before int64  `json:"before"`
	}
	if decodeBounded(w, r, &b, 32768) != nil || (b.Action != "start" && b.Action != "read" && b.Action != "send") || b.Before < 0 {
		fail(w, 422, "INVALID_REQUEST")
		return
	}
	if b.Action != "start" && !websiteSecretValid(b.Secret) {
		fail(w, 403, "VISITOR_DENIED")
		return
	}
	if b.Action == "send" && (!uuidPattern.MatchString(b.Key) || !utf8.ValidString(b.Text) || utf8.RuneCountInString(strings.TrimSpace(b.Text)) < 1 || utf8.RuneCountInString(b.Text) > 8000) {
		fail(w, 422, "INVALID_MESSAGE")
		return
	}
	if b.Action == "start" {
		var e error
		b.Secret, e = websiteSecret()
		if e != nil {
			fail(w, 503, "SOURCE_UNAVAILABLE")
			return
		}
	}
	peer, _, e := net.SplitHostPort(r.RemoteAddr)
	if e != nil {
		peer = r.RemoteAddr
	}
	mac := hmac.New(sha256.New, s.Pipeline.Key)
	mac.Write([]byte("website-peer|" + site + "|" + peer))
	peerHash := hex.EncodeToString(mac.Sum(nil))
	var raw []byte
	e = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_website_visit($1::uuid,$2,$3,$4,$5,$6,$7,$8)", site, origin, b.Action, websiteHash(b.Secret), peerHash, b.Text, b.Key, b.Before).Scan(&raw)
	if e != nil {
		inboxWorkFailure(w, e)
		return
	}
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	if b.Action == "start" {
		data["secret"] = b.Secret
	}
	write(w, 200, data)
}
