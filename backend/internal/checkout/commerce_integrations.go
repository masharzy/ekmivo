package checkout

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/masharzy/ekmivo/backend/internal/authz"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
)

type commerceCredentials struct {
	APIKey string `json:"api_key"`
	Secret string `json:"secret"`
	Origin string `json:"origin"`
}

// Per-request DNS pinning prevents a merchant-supplied store hostname from
// reaching internal infrastructure. Credentials never follow redirects/proxies.
func commerceHTTPRequest(ctx context.Context, req *http.Request) (*http.Response, error) {
	u, err := merchantwebhook.ValidateURL(req.URL.String())
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", u.Hostname())
	if err != nil || len(ips) == 0 {
		return nil, errors.New("store DNS unavailable")
	}
	for _, ip := range ips {
		if _, err = merchantwebhook.ValidateURL("https://" + net.JoinHostPort(ip.String(), "443")); err != nil {
			return nil, err
		}
	}
	transport := &http.Transport{Proxy: nil, TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12, ServerName: u.Hostname()}, DisableKeepAlives: true, ResponseHeaderTimeout: 10 * time.Second, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		return (&net.Dialer{Timeout: 4 * time.Second}).DialContext(ctx, "tcp", net.JoinHostPort(ips[0].String(), "443"))
	}}
	client := &http.Client{Transport: transport, Timeout: 14 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return client.Do(req)
}
func (s *Service) commerceCommand(r *http.Request, ws, realm, actor, key, action string, b any) ([]byte, error) {
	encoded, err := json.Marshal(b)
	if err != nil {
		return nil, err
	}
	var raw []byte
	err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_write($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::jsonb)", ws, realm, actor, key, action, encoded).Scan(&raw)
	return raw, err
}
func (s *Service) commerceIntegration(w http.ResponseWriter, r *http.Request, ws, realm, actor, key, action string, b map[string]any) {
	provider, _ := b["provider"].(string)
	if action == "courier-book" || action == "courier-status" {
		provider = "steadfast"
	}
	if action == "woocommerce-preview" {
		provider = "woocommerce"
	}
	if provider != "steadfast" && provider != "woocommerce" {
		fail(w, 422, "UNSUPPORTED_PROVIDER")
		return
	}
	associated := ws + "|" + realm + "|commerce|" + provider
	if action == "integration-save" || action == "integration-disable" {
		apiKey, _ := b["api_key"].(string)
		secret, _ := b["secret"].(string)
		origin, _ := b["origin"].(string)
		if action == "integration-save" && (len(apiKey) < 8 || len(apiKey) > 500 || len(secret) < 8 || len(secret) > 500) {
			fail(w, 422, "INVALID_CREDENTIALS")
			return
		}
		if provider == "woocommerce" && action == "integration-save" {
			u, err := merchantwebhook.ValidateURL(origin)
			if err != nil || u.RawQuery != "" || u.Path != "" && u.Path != "/" {
				fail(w, 422, "PUBLIC_HTTPS_STORE_REQUIRED")
				return
			}
			origin = strings.TrimRight(origin, "/")
		}
		encoded, _ := json.Marshal(commerceCredentials{APIKey: apiKey, Secret: secret, Origin: origin})
		cipher, err := deviceevidence.Encrypt(s.Pipeline.Key, encoded, associated)
		if err != nil {
			fail(w, 503, "ENCRYPTION_UNAVAILABLE")
			return
		}
		var ignored []byte
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_integration($1::uuid,$2,$3::uuid,$4,$5,$6)", ws, realm, actor, provider, cipher, action != "integration-disable").Scan(&ignored)
		if err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, map[string]any{"saved": true})
		return
	}
	var cipher []byte
	if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_integration($1::uuid,$2,$3::uuid,$4)", ws, realm, actor, provider).Scan(&cipher); err != nil {
		fail(w, 503, "INTEGRATION_NOT_CONFIGURED")
		return
	}
	plain, err := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, associated)
	var cred commerceCredentials
	if err != nil || json.Unmarshal(plain, &cred) != nil {
		fail(w, 503, "INTEGRATION_NOT_CONFIGURED")
		return
	}
	if action == "woocommerce-preview" {
		s.commerceWooPreview(w, r, ws, realm, actor, key, b, cred)
		return
	}
	if realm != "live" {
		fail(w, 422, "COURIER_LIVE_ONLY")
		return
	}
	id, _ := b["id"].(string)
	if !uuidPattern.MatchString(id) {
		fail(w, 422, "INVALID_DELIVERY")
		return
	}
	if action == "courier-status" {
		raw, err := s.commerceCommand(r, ws, realm, actor, key, "courier-read", b)
		if err != nil {
			inboxWorkFailure(w, err)
			return
		}
		var d struct {
			Consignment string `json:"consignment"`
		}
		if json.Unmarshal(raw, &d) != nil || d.Consignment == "" {
			fail(w, 409, "RECONCILE_BOOKING_WITH_PROVIDER")
			return
		}
		req, _ := http.NewRequestWithContext(r.Context(), "GET", "https://portal.steadfast.com.bd/api/v1/status_by_cid/"+url.PathEscape(d.Consignment), nil)
		req.Header.Set("Api-Key", cred.APIKey)
		req.Header.Set("Secret-Key", cred.Secret)
		response, err := commerceHTTPRequest(r.Context(), req)
		if err != nil {
			fail(w, 503, "COURIER_STATUS_UNAVAILABLE")
			return
		}
		defer response.Body.Close()
		var status struct {
			Status         int    `json:"status"`
			DeliveryStatus string `json:"delivery_status"`
		}
		if response.StatusCode != 200 || json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&status) != nil || status.Status != 200 {
			fail(w, 503, "COURIER_STATUS_UNAVAILABLE")
			return
		}
		raw, err = s.commerceCommand(r, ws, realm, actor, newUUID(), "courier-status-record", map[string]any{"id": id, "provider_status": status.DeliveryStatus})
		if err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, json.RawMessage(raw))
		return
	}
	// Commit the durable booking boundary before any external POST. A replay or
	// process death can only reconcile the existing invoice, never auto-resend.
	raw, err := s.commerceCommand(r, ws, realm, actor, key, "courier-start", b)
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	var booking struct {
		Recipient map[string]string `json:"recipient"`
		COD       int64             `json:"cod_minor"`
		Revision  int64             `json:"revision"`
		Replayed  bool              `json:"replayed"`
		Notes     string            `json:"notes"`
	}
	if json.Unmarshal(raw, &booking) != nil {
		fail(w, 503, "BOOKING_OUTCOME_UNKNOWN")
		return
	}
	if booking.Replayed {
		fail(w, 409, "RECONCILE_BOOKING_WITH_PROVIDER")
		return
	}
	phone := strings.TrimPrefix(booking.Recipient["phone"], "+")
	if strings.HasPrefix(phone, "880") {
		phone = "0" + phone[3:]
	}
	body, _ := json.Marshal(map[string]any{"invoice": "BF-" + id, "recipient_name": booking.Recipient["name"], "recipient_phone": phone, "recipient_address": booking.Recipient["address"], "cod_amount": json.Number(fmt.Sprintf("%d.%02d", booking.COD/100, booking.COD%100)), "note": booking.Notes})
	req, _ := http.NewRequestWithContext(r.Context(), "POST", "https://portal.steadfast.com.bd/api/v1/create_order", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Api-Key", cred.APIKey)
	req.Header.Set("Secret-Key", cred.Secret)
	response, requestErr := commerceHTTPRequest(r.Context(), req)
	var result struct {
		Status      int `json:"status"`
		Consignment struct {
			ID       int64  `json:"consignment_id"`
			Tracking string `json:"tracking_code"`
		} `json:"consignment"`
	}
	known := false
	if requestErr == nil {
		defer response.Body.Close()
		known = response.StatusCode == 200 && json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&result) == nil && result.Status == 200 && result.Consignment.ID > 0
	}
	next := map[string]any{"id": id, "revision": booking.Revision, "status": "unknown"}
	if known {
		next["status"] = "booked"
		next["consignment"] = strconv.FormatInt(result.Consignment.ID, 10)
		next["tracking_url"] = "https://steadfast.com.bd/t/" + url.PathEscape(result.Consignment.Tracking)
	}
	raw, err = s.commerceCommand(r, ws, realm, actor, newUUID(), "delivery-state", next)
	if err != nil || !known {
		fail(w, 409, "BOOKING_OUTCOME_UNKNOWN_RECONCILE")
		return
	}
	write(w, 200, json.RawMessage(raw))
}

func (s *Service) HandleCommerceAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	realm := explicitRealm(r)
	if realm != "live" && realm != "sandbox" {
		fail(w, 422, "INVALID_SCOPE")
		return
	}
	scope := "orders:write"
	if r.Method == http.MethodGet {
		scope = "orders:read"
	}
	cred, err := s.Auth.AuthenticateMerchant(r.Context(), r.Header.Get("Authorization"), authz.Environment(realm), scope)
	if err != nil {
		authError(w, err)
		return
	}
	if r.Method == http.MethodGet {
		if !s.budget(w, "commerce-api-read:"+cred.WorkspaceID, 120) {
			return
		}
		off := 0
		var parseErr error
		if value := r.URL.Query().Get("cursor"); value != "" {
			off, parseErr = strconv.Atoi(value)
		}
		id := r.URL.Query().Get("item")
		if parseErr != nil || off < 0 || off > 10000 || (id != "" && !uuidPattern.MatchString(id)) {
			fail(w, 422, "INVALID_FILTER")
			return
		}
		var raw []byte
		if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_api_read($1::uuid,$2,$3::uuid,$4::uuid,$5,$6)", cred.WorkspaceID, realm, cred.KeyID, nullableID(id), off, r.URL.Query().Get("q")).Scan(&raw); err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, json.RawMessage(raw))
		return
	}
	key := r.Header.Get("Idempotency-Key")
	var b map[string]any
	if !uuidPattern.MatchString(key) || decodeBounded(w, r, &b, 32768) != nil || b == nil {
		fail(w, 422, "INVALID_ORDER")
		return
	}
	allowed := map[string]bool{"reference": true, "warehouse_id": true, "customer_id": true, "recipient": true, "lines": true, "coupon": true, "shipping_minor": true, "notes": true}
	for f := range b {
		if !allowed[f] {
			fail(w, 422, "SERVER_OWNED_FIELD")
			return
		}
	}
	if !s.budget(w, "commerce-api:"+cred.WorkspaceID, 60) {
		return
	}
	if !validCommerceAPIBody(b) {
		fail(w, 422, "INVALID_ORDER_LINES_OR_RECIPIENT")
		return
	}
	encoded, _ := json.Marshal(b)
	var raw []byte
	if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_api_write($1::uuid,$2,$3::uuid,$4::uuid,$5::jsonb)", cred.WorkspaceID, realm, cred.KeyID, key, encoded).Scan(&raw); err != nil {
		inboxWorkFailure(w, err)
		return
	}
	write(w, 201, json.RawMessage(raw))
}

// API schemas reject caller-owned prices even inside line items. A number is
// accepted only when it is an exact bounded integer in the decoded JSON.
func validCommerceAPIBody(b map[string]any) bool {
	lines, ok := b["lines"].([]any)
	if !ok || len(lines) < 1 || len(lines) > 100 {
		return false
	}
	for _, raw := range lines {
		line, ok := raw.(map[string]any)
		if !ok || len(line) != 2 {
			return false
		}
		id, ok := line["variant_id"].(string)
		if !ok || !uuidPattern.MatchString(id) {
			return false
		}
		q, ok := line["quantity"].(float64)
		if !ok || q < 1 || q > 10000 || q != float64(int64(q)) {
			return false
		}
	}
	recipient, ok := b["recipient"].(map[string]any)
	if !ok || len(recipient) != 3 {
		return false
	}
	for _, key := range []string{"name", "phone", "address"} {
		if _, ok := recipient[key].(string); !ok {
			return false
		}
	}
	return true
}
