package checkout

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
)

func wooHookOrigin() (string, error) {
	origin := strings.TrimRight(os.Getenv("WOO_WEBHOOK_PUBLIC_ORIGIN"), "/")
	u, err := merchantwebhook.ValidateURL(origin)
	if err != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return "", errors.New("PUBLIC_API_ORIGIN_REQUIRED")
	}
	return origin, nil
}
func wooSignature(secret, raw []byte, signature string) bool {
	if len(signature) != 44 {
		return false
	}
	given, err := base64.StdEncoding.DecodeString(signature)
	if err != nil || len(given) != 32 {
		return false
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write(raw)
	return hmac.Equal(given, mac.Sum(nil))
}
func (s *Service) commerceWooHooks(w http.ResponseWriter, r *http.Request, ws, realm, actor, key, action string, b map[string]any) {
	if os.Getenv("BRIOFOLD_WOO_WEBHOOKS_ENABLED") != "true" {
		fail(w, 503, "WOO_WEBHOOKS_UNAVAILABLE")
		return
	}
	if action == "woo-hook-disable" {
		var ignored any
		err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_woo_hook_disable($1::uuid,$2,$3::uuid,$4::uuid)", ws, realm, actor, str(b, "id")).Scan(&ignored)
		if err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, map[string]bool{"disabled": true})
		return
	}
	origin, err := wooHookOrigin()
	if err != nil {
		fail(w, 503, "PUBLIC_API_ORIGIN_REQUIRED")
		return
	}
	var cipher []byte
	err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_integration($1::uuid,$2,$3::uuid,'woocommerce')", ws, realm, actor).Scan(&cipher)
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	plain, err := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, ws+"|"+realm+"|commerce|woocommerce")
	var cred commerceCredentials
	if err != nil || json.Unmarshal(plain, &cred) != nil {
		fail(w, 503, "INTEGRATION_NOT_CONFIGURED")
		return
	}
	sourceID := newUUID()
	random := make([]byte, 32)
	if _, err = rand.Read(random); err != nil {
		fail(w, 503, "ENTROPY_UNAVAILABLE")
		return
	}
	secret := base64.RawURLEncoding.EncodeToString(random)
	cipher, err = deviceevidence.Encrypt(s.Pipeline.Key, []byte(secret), ws+"|"+realm+"|woo-hook|"+sourceID)
	if err != nil {
		fail(w, 503, "ENCRYPTION_UNAVAILABLE")
		return
	}
	var raw []byte
	err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_woo_hook_create($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7)", ws, realm, actor, key, sourceID, cred.Origin, cipher).Scan(&raw)
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	var result struct {
		ID     string `json:"id"`
		Cipher string `json:"secret_cipher"`
	}
	if json.Unmarshal(raw, &result) != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	// A lost response may recover this create operation for fifteen minutes.
	// The read-only metadata endpoint never exposes a signing secret.
	cipher, err = base64.StdEncoding.DecodeString(result.Cipher)
	if err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	recovered, err := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, ws+"|"+realm+"|woo-hook|"+result.ID)
	if err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	write(w, 200, map[string]any{"id": result.ID, "endpoint": origin + "/v1/channels/woocommerce/" + result.ID, "signing_secret": string(recovered)})
}
func (s *Service) HandleWooWebhook(w http.ResponseWriter, r *http.Request) {
	if os.Getenv("BRIOFOLD_WOO_WEBHOOKS_ENABLED") != "true" || s == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	id := r.PathValue("sourceID")
	if !uuidPattern.MatchString(id) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if !s.budget(w, "woo-hook:"+id, 120) {
		return
	}
	var raw []byte
	if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_woo_hook_source($1::uuid)", id).Scan(&raw); err != nil || len(raw) == 0 {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var source struct {
		Workspace   string `json:"workspace_id"`
		Environment string `json:"environment"`
		Origin      string `json:"origin"`
		Cipher      string `json:"secret_cipher"`
		Connection  string `json:"connection_cipher"`
	}
	if json.Unmarshal(raw, &source) != nil {
		fail(w, 404, "NOT_FOUND")
		return
	}
	decode := func(encoded, aad string) ([]byte, error) {
		cipher, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return nil, err
		}
		return merchantwebhook.Decrypt(s.Pipeline.Key, cipher, aad)
	}
	secret, err := decode(source.Cipher, source.Workspace+"|"+source.Environment+"|woo-hook|"+id)
	if err != nil {
		fail(w, 404, "NOT_FOUND")
		return
	}
	connection, err := decode(source.Connection, source.Workspace+"|"+source.Environment+"|commerce|woocommerce")
	var cred commerceCredentials
	if err != nil || json.Unmarshal(connection, &cred) != nil || cred.Origin != source.Origin {
		fail(w, 404, "NOT_FOUND")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1048576))
	if err != nil {
		fail(w, 413, "BODY_TOO_LARGE")
		return
	}
	// Woo's official deliver_ping sends only an unsigned form webhook_id.
	// Acknowledge reachability without recording authentication or any notice.
	typ, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if typ == "application/x-www-form-urlencoded" && len(body) <= 256 && r.Header.Get("X-WC-Webhook-Signature") == "" {
		form, parseErr := url.ParseQuery(string(body))
		id, idErr := strconv.ParseUint(form.Get("webhook_id"), 10, 64)
		if parseErr == nil && idErr == nil && id > 0 && len(form) == 1 && len(form["webhook_id"]) == 1 {
			write(w, 200, map[string]bool{"probe_acknowledged": true, "authenticated": false})
			return
		}
	}
	if !wooSignature(secret, body, r.Header.Get("X-WC-Webhook-Signature")) {
		fail(w, 401, "SIGNATURE_INVALID")
		return
	}
	delivery := r.Header.Get("X-WC-Webhook-Delivery-ID")
	if len(delivery) < 1 || len(delivery) > 128 || strings.ContainsAny(delivery, "\r\n\x00") {
		fail(w, 422, "INVALID_DELIVERY")
		return
	}
	// Header topics are not part of the HMAC. Treat every accepted payload only
	// as a product notice and refetch current data before any import preview.
	var product struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	}
	if json.Unmarshal(body, &product) != nil || product.ID < 1 || len([]rune(product.Name)) > 200 || strings.ContainsRune(product.Name, 0) {
		fail(w, 422, "INVALID_PRODUCT_NOTICE")
		return
	}
	hash := sha256.Sum256(body)
	err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_woo_hook_receive($1::uuid,$2,$3,$4,$5)", id, delivery, hex.EncodeToString(hash[:]), product.ID, product.Name).Scan(&raw)
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	write(w, 200, json.RawMessage(raw))
}

func (s *Service) commerceWooHooksRead(w http.ResponseWriter, r *http.Request, ws, realm, actor string, off int) {
	if os.Getenv("BRIOFOLD_WOO_WEBHOOKS_ENABLED") != "true" {
		fail(w, 503, "WOO_WEBHOOKS_UNAVAILABLE")
		return
	}
	origin, err := wooHookOrigin()
	if err != nil {
		fail(w, 503, "PUBLIC_API_ORIGIN_REQUIRED")
		return
	}
	var raw []byte
	if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_woo_hook_read($1::uuid,$2,$3::uuid,$4)", ws, realm, actor, off).Scan(&raw); err != nil {
		inboxWorkFailure(w, err)
		return
	}
	var result struct {
		Sources []map[string]any `json:"sources"`
		Events  []map[string]any `json:"events"`
	}
	if json.Unmarshal(raw, &result) != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	for _, source := range result.Sources {
		id, _ := source["id"].(string)
		source["endpoint"] = origin + "/v1/channels/woocommerce/" + id
	}
	write(w, 200, result)
}
