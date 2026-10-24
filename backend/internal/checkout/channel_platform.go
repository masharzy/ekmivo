package checkout

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
)

var channelKeys = []string{"META_APP_ID", "META_APP_SECRET", "META_GRAPH_VERSION", "META_OAUTH_REDIRECT_URI", "META_WEBHOOK_VERIFY_TOKEN", "META_WHATSAPP_CONFIG_ID", "CHANNEL_PUBLIC_ORIGIN"}
var channelSecrets = map[string]bool{"META_APP_SECRET": true, "META_WEBHOOK_VERIFY_TOKEN": true}
var graphVersionPattern = regexp.MustCompile(`^v[0-9]{1,3}\.[0-9]{1,2}$`)
var channelNumber = regexp.MustCompile(`^[0-9]{1,30}$`)

func validChannelSetting(k, v string) bool {
	if len(v) > 4096 || strings.ContainsAny(v, "\r\n\x00") {
		return false
	}
	if v == "" {
		return true
	}
	switch k {
	case "META_APP_ID", "META_WHATSAPP_CONFIG_ID":
		return channelNumber.MatchString(v)
	case "META_GRAPH_VERSION":
		return graphVersionPattern.MatchString(v)
	case "META_OAUTH_REDIRECT_URI", "CHANNEL_PUBLIC_ORIGIN":
		u, e := url.Parse(v)
		return e == nil && u.Scheme == "https" && u.Host != "" && u.User == nil && u.RawQuery == "" && u.Fragment == "" && (k != "CHANNEL_PUBLIC_ORIGIN" || u.Path == "" || u.Path == "/")
	case "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN":
		return len(v) >= 16
	}
	return false
}
func (s *Service) loadChannelConfig(ctx context.Context) (map[string]string, bool, string) {
	values := map[string]string{}
	for _, k := range channelKeys {
		values[k] = strings.TrimSpace(os.Getenv(k))
	}
	if s == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		return values, false, "initial"
	}
	var raw []byte
	err := s.Pipeline.Control.QueryRow(ctx, "SELECT channel_platform_config_read()").Scan(&raw)
	if err != nil {
		var pe *pgconn.PgError
		if errors.As(err, &pe) && (pe.Code == "42883" || pe.Code == "42P01") {
			return values, false, "initial"
		}
		return map[string]string{}, false, "initial"
	}
	if len(raw) > 0 {
		plain, e := merchantwebhook.Decrypt(s.Pipeline.Key, raw, "channel-platform-config:v1")
		if e != nil {
			return map[string]string{}, false, "initial"
		}
		var saved map[string]string
		if json.Unmarshal(plain, &saved) != nil {
			return map[string]string{}, false, "initial"
		}
		for k, v := range saved {
			if validChannelSetting(k, v) {
				values[k] = v
			}
		}
	}
	revision := "initial"
	if len(raw) > 0 {
		h := sha256.Sum256(raw)
		revision = hex.EncodeToString(h[:])
	}
	return values, true, revision
}
func (s *Service) channelConfig(ctx context.Context) (map[string]string, bool) {
	c, ready, _ := s.loadChannelConfig(ctx)
	return c, ready
}
func channelReadiness(c map[string]string) map[string]any {
	missing := func(keys ...string) []string {
		out := []string{}
		for _, k := range keys {
			if c[k] == "" || !validChannelSetting(k, c[k]) {
				out = append(out, k)
			}
		}
		return out
	}
	meta := []string{"META_APP_ID", "META_APP_SECRET", "META_GRAPH_VERSION", "META_OAUTH_REDIRECT_URI", "META_WEBHOOK_VERIFY_TOKEN", "CHANNEL_PUBLIC_ORIGIN"}
	wa := append(append([]string{}, meta...), "META_WHATSAPP_CONFIG_ID")
	return map[string]any{"ms": missing(meta...), "ig": missing(meta...), "wa": missing(wa...), "tg": missing("CHANNEL_PUBLIC_ORIGIN")}
}
func (s *Service) HandleChannelPlatform(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil || len(s.Pipeline.Key) != 32 {
		fail(w, 503, "CHANNEL_SETUP_UNAVAILABLE")
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
	if _, e = s.Auth.AuthorizePlatform(r.Context(), actor, true); e != nil {
		authError(w, e)
		return
	}
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	c, storage, revision := s.loadChannelConfig(r.Context())
	if r.Method == "POST" {
		var body struct {
			Values   map[string]string `json:"values"`
			Reason   string            `json:"reason"`
			Revision string            `json:"revision"`
		}
		if decodeBounded(w, r, &body, 32768) != nil || len(body.Reason) < 10 || len(body.Reason) > 500 || len(body.Values) > len(channelKeys) {
			fail(w, 422, "INVALID_CONFIGURATION")
			return
		}
		if !storage {
			fail(w, 503, "CHANNEL_CONFIG_MIGRATION_REQUIRED")
			return
		}
		if body.Revision != revision {
			fail(w, 409, "CONFIGURATION_CHANGED")
			return
		}
		for k, v := range body.Values {
			v = strings.TrimSpace(v)
			if !validChannelSetting(k, v) {
				fail(w, 422, "INVALID_CONFIGURATION")
				return
			}
			if v != "" {
				c[k] = v
			}
		}
		plain, _ := json.Marshal(c)
		cipher, err := deviceevidence.Encrypt(s.Pipeline.Key, plain, "channel-platform-config:v1")
		if err != nil {
			fail(w, 503, "CHANNEL_SETUP_UNAVAILABLE")
			return
		}
		if _, err = s.Pipeline.Control.Exec(r.Context(), "SELECT channel_platform_config_write($1::uuid,$2,$3,$4)", actor.UserID, cipher, body.Reason, body.Revision); err != nil {
			fail(w, 503, "CHANNEL_SETUP_SAVE_FAILED")
			return
		}
		h := sha256.Sum256(cipher)
		revision = hex.EncodeToString(h[:])
	}
	fields := []map[string]any{}
	for _, k := range channelKeys {
		v := ""
		if !channelSecrets[k] {
			v = c[k]
		}
		fields = append(fields, map[string]any{"key": k, "secret": channelSecrets[k], "configured": c[k] != "", "value": v})
	}
	w.Header().Set("Cache-Control", "private, no-store")
	write(w, 200, map[string]any{"fields": fields, "storage_ready": storage, "channels": channelReadiness(c), "revision": revision, "meta_webhook_url": strings.TrimRight(c["CHANNEL_PUBLIC_ORIGIN"], "/") + "/v1/channels/meta/webhook"})
}
func (s *Service) HandleChannelReadiness(w http.ResponseWriter, r *http.Request) {
	if e := s.inboxManageSession(r, r.PathValue("workspaceID"), explicitRealm(r)); e != nil {
		authError(w, e)
		return
	}
	c, _ := s.channelConfig(r.Context())
	w.Header().Set("Cache-Control", "private, no-store")
	write(w, 200, map[string]any{"channels": channelReadiness(c)})
}
