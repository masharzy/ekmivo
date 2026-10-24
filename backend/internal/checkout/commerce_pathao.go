package checkout

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
)

// The base URL is fixed by the provider; never accept a merchant URL or proxy.
const pathaoOrigin = "https://api-hermes.pathao.com/aladdin/api/v1"

var pathaoIdentity = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)

type pathaoClient struct {
	do func(context.Context, *http.Request) (*http.Response, error)
}
type pathaoOption struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

func (c pathaoClient) request(ctx context.Context, method, path, token string, body any, target any) error {
	var data []byte
	var err error
	if body != nil {
		data, err = json.Marshal(body)
		if err != nil {
			return err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, pathaoOrigin+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	response, err := c.do(ctx, req)
	if err != nil {
		return errors.New("PATHAO_OUTCOME_UNCONFIRMED")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return errors.New("PATHAO_REQUEST_UNCONFIRMED")
	}
	if json.NewDecoder(io.LimitReader(response.Body, 1048576)).Decode(target) != nil {
		return errors.New("PATHAO_RESPONSE_UNCONFIRMED")
	}
	return nil
}
func (c pathaoClient) token(ctx context.Context, cred commerceCredentials) (string, error) {
	var result struct {
		Access string `json:"access_token"`
		Type   string `json:"token_type"`
	}
	err := c.request(ctx, "POST", "/issue-token", "", map[string]string{"client_id": cred.APIKey, "client_secret": cred.Secret, "username": cred.Username, "password": cred.Password, "grant_type": "password"}, &result)
	if err != nil || result.Access == "" || len(result.Access) > 8192 || strings.ContainsAny(result.Access, "\r\n") || result.Type != "Bearer" {
		return "", errors.New("PATHAO_AUTH_UNAVAILABLE")
	}
	return result.Access, nil
}
func (c pathaoClient) locations(ctx context.Context, token, kind string, parent int64) ([]pathaoOption, error) {
	path, prefix := "", ""
	switch kind {
	case "stores":
		path = "/stores"
		prefix = "store"
	case "cities":
		path = "/city-list"
		prefix = "city"
	case "zones":
		if parent < 1 || parent > 999999999 {
			return nil, errors.New("INVALID_PARENT")
		}
		path = "/cities/" + strconv.FormatInt(parent, 10) + "/zone-list"
		prefix = "zone"
	case "areas":
		if parent < 1 || parent > 999999999 {
			return nil, errors.New("INVALID_PARENT")
		}
		path = "/zones/" + strconv.FormatInt(parent, 10) + "/area-list"
		prefix = "area"
	default:
		return nil, errors.New("INVALID_LOCATION")
	}
	var result struct {
		Code int    `json:"code"`
		Type string `json:"type"`
		Data struct {
			Data     []map[string]json.RawMessage `json:"data"`
			LastPage int                          `json:"last_page"`
		} `json:"data"`
	}
	if c.request(ctx, "GET", path, token, nil, &result) != nil || result.Code != 200 || result.Type != "success" || result.Data.Data == nil || len(result.Data.Data) > 1000 || result.Data.LastPage > 1 {
		return nil, errors.New("PATHAO_LOCATIONS_UNAVAILABLE")
	}
	items := make([]pathaoOption, 0, len(result.Data.Data))
	seen := map[int64]bool{}
	for _, row := range result.Data.Data {
		var id int64
		var name string
		var active int
		if json.Unmarshal(row[prefix+"_id"], &id) != nil || id < 1 || id > 999999999 || json.Unmarshal(row[prefix+"_name"], &name) != nil || strings.TrimSpace(name) == "" || len(name) > 500 || seen[id] {
			return nil, errors.New("PATHAO_LOCATIONS_UNAVAILABLE")
		}
		if kind == "stores" && (json.Unmarshal(row["is_active"], &active) != nil || active != 1) {
			continue
		}
		seen[id] = true
		items = append(items, pathaoOption{id, name})
	}
	return items, nil
}
func pathaoNumber(v any) int64 {
	n, ok := v.(float64)
	if !ok || n < 0 || n > 999999999 || n != float64(int64(n)) {
		return -1
	}
	return int64(n)
}
func validatePathaoOptions(b map[string]any) error {
	allowed := map[string]bool{"store_id": true, "recipient_city": true, "recipient_zone": true, "recipient_area": true, "delivery_type": true, "item_type": true, "item_quantity": true, "item_weight": true}
	for key := range b {
		if !allowed[key] {
			return errors.New("INVALID_PATHAO_OPTIONS")
		}
	}
	for _, k := range []string{"store_id", "recipient_city", "recipient_zone", "item_quantity"} {
		if pathaoNumber(b[k]) < 1 {
			return errors.New("PATHAO_LOCATION_OR_QUANTITY_REQUIRED")
		}
	}
	if pathaoNumber(b["delivery_type"]) != 48 || pathaoNumber(b["item_type"]) < 1 || pathaoNumber(b["item_type"]) > 2 || pathaoNumber(b["recipient_area"]) < 0 {
		return errors.New("INVALID_PATHAO_OPTIONS")
	}
	weight, ok := b["item_weight"].(float64)
	if !ok || weight < 0.5 || weight > 10 {
		return errors.New("INVALID_PATHAO_WEIGHT")
	}
	return nil
}
func (c pathaoClient) verifyLocations(ctx context.Context, token string, b map[string]any) error {
	for _, check := range []struct{ kind, key, parent string }{{"stores", "store_id", ""}, {"cities", "recipient_city", ""}, {"zones", "recipient_zone", "recipient_city"}, {"areas", "recipient_area", "recipient_zone"}} {
		id := pathaoNumber(b[check.key])
		if check.kind == "areas" && id == 0 {
			continue
		}
		parent := int64(0)
		if check.parent != "" {
			parent = pathaoNumber(b[check.parent])
		}
		items, err := c.locations(ctx, token, check.kind, parent)
		if err != nil {
			return err
		}
		found := false
		for _, item := range items {
			if item.ID == id {
				found = true
				break
			}
		}
		if !found {
			return errors.New("PATHAO_LOCATION_CHANGED_REFRESH")
		}
	}
	return nil
}

type pathaoShipment struct {
	ID          string            `json:"id"`
	Order       string            `json:"order_id"`
	Revision    int64             `json:"revision"`
	State       string            `json:"status"`
	Consignment string            `json:"consignment"`
	COD         int64             `json:"cod_minor"`
	Recipient   map[string]string `json:"recipient"`
	Notes       string            `json:"notes"`
	Replayed    bool              `json:"replayed"`
}

func (c pathaoClient) book(ctx context.Context, token string, d pathaoShipment, options map[string]any) (string, error) {
	if validatePathaoOptions(options) != nil || d.COD < 0 || d.COD%100 != 0 {
		return "", errors.New("PATHAO_WHOLE_TAKA_COD_REQUIRED")
	}
	payload := map[string]any{}
	for _, key := range []string{"store_id", "recipient_city", "recipient_zone", "delivery_type", "item_type", "item_quantity", "item_weight"} {
		payload[key] = options[key]
	}
	if pathaoNumber(options["recipient_area"]) > 0 {
		payload["recipient_area"] = options["recipient_area"]
	}
	phone := strings.TrimPrefix(d.Recipient["phone"], "+")
	if strings.HasPrefix(phone, "880") {
		phone = "0" + phone[3:]
	}
	payload["merchant_order_id"] = "BF-" + d.ID
	payload["recipient_name"] = d.Recipient["name"]
	payload["recipient_phone"] = phone
	payload["recipient_address"] = d.Recipient["address"]
	payload["amount_to_collect"] = d.COD / 100
	payload["special_instruction"] = d.Notes
	var result struct {
		Code int    `json:"code"`
		Type string `json:"type"`
		Data struct {
			Consignment string `json:"consignment_id"`
			Reference   string `json:"merchant_order_id"`
		} `json:"data"`
	}
	if c.request(ctx, "POST", "/orders", token, payload, &result) != nil || result.Code != 200 || result.Type != "success" || !pathaoIdentity.MatchString(result.Data.Consignment) || result.Data.Reference != "BF-"+d.ID {
		return "", errors.New("BOOKING_OUTCOME_UNKNOWN_RECONCILE")
	}
	return result.Data.Consignment, nil
}
func (c pathaoClient) status(ctx context.Context, token string, d pathaoShipment) (string, error) {
	if !pathaoIdentity.MatchString(d.Consignment) {
		return "", errors.New("RECONCILE_BOOKING_WITH_PROVIDER")
	}
	var result struct {
		Code int    `json:"code"`
		Type string `json:"type"`
		Data struct {
			Consignment string `json:"consignment_id"`
			Reference   string `json:"merchant_order_id"`
			Status      string `json:"order_status_slug"`
		} `json:"data"`
	}
	if c.request(ctx, "GET", "/orders/"+url.PathEscape(d.Consignment)+"/info", token, nil, &result) != nil || result.Code != 200 || result.Type != "success" || result.Data.Consignment != d.Consignment || result.Data.Reference != "BF-"+d.ID || strings.TrimSpace(result.Data.Status) == "" || len(result.Data.Status) > 80 {
		return "", errors.New("PATHAO_STATUS_UNAVAILABLE")
	}
	return result.Data.Status, nil
}
func (s *Service) pathaoCommand(r *http.Request, ws, realm, actor, key, action string, b map[string]any) ([]byte, error) {
	raw, _ := json.Marshal(b)
	var result []byte
	err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_pathao_command($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::jsonb)", ws, realm, actor, key, action, raw).Scan(&result)
	return result, err
}
func (s *Service) commercePathao(w http.ResponseWriter, r *http.Request, ws, realm, actor, key, action string, b map[string]any) {
	if os.Getenv("BRIOFOLD_PATHAO_ENABLED") != "true" {
		fail(w, 503, "PATHAO_UNAVAILABLE")
		return
	}
	switch action {
	case "integration-save", "integration-disable", "courier-book", "courier-status", "pathao-locations":
	default:
		fail(w, 422, "INVALID_PATHAO_ACTION")
		return
	}
	if action == "pathao-locations" {
		kind := str(b, "kind")
		if kind != "stores" && kind != "cities" && kind != "zones" && kind != "areas" {
			fail(w, 422, "INVALID_LOCATION")
			return
		}
		if (kind == "zones" || kind == "areas") && pathaoNumber(b["parent_id"]) < 1 {
			fail(w, 422, "INVALID_PARENT")
			return
		}
	}
	if (action == "courier-book" || action == "courier-status") && !uuidPattern.MatchString(str(b, "id")) {
		fail(w, 422, "INVALID_DELIVERY")
		return
	}
	associated := ws + "|" + realm + "|commerce|pathao"
	if action == "integration-save" || action == "integration-disable" {
		cred := commerceCredentials{APIKey: str(b, "api_key"), Secret: str(b, "secret"), Username: str(b, "username"), Password: str(b, "password")}
		address, err := mail.ParseAddress(cred.Username)
		if action == "integration-save" && (len(cred.APIKey) < 1 || len(cred.APIKey) > 100 || len(cred.Secret) < 8 || len(cred.Secret) > 500 || err != nil || address.Address != cred.Username || len(cred.Username) > 254 || len(cred.Password) < 8 || len(cred.Password) > 500) {
			fail(w, 422, "INVALID_CREDENTIALS")
			return
		}
		encoded, _ := json.Marshal(cred)
		cipher, err := deviceevidence.Encrypt(s.Pipeline.Key, encoded, associated)
		if err != nil {
			fail(w, 503, "ENCRYPTION_UNAVAILABLE")
			return
		}
		var ignored []byte
		if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_pathao_credentials($1::uuid,$2,$3::uuid,$4,$5)", ws, realm, actor, cipher, action != "integration-disable").Scan(&ignored); err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, map[string]any{"saved": true})
		return
	}
	if realm != "live" {
		fail(w, 422, "COURIER_LIVE_ONLY")
		return
	}
	var d pathaoShipment
	if action != "pathao-locations" {
		raw, err := s.pathaoCommand(r, ws, realm, actor, newUUID(), "read", b)
		if err != nil {
			inboxWorkFailure(w, err)
			return
		}
		if json.Unmarshal(raw, &d) != nil {
			fail(w, 503, "SOURCE_UNAVAILABLE")
			return
		}
		if action == "courier-book" && d.State != "ready" {
			fail(w, 409, "RECONCILE_BOOKING_WITH_PROVIDER")
			return
		}
	}
	var cipher []byte
	if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_pathao_credentials($1::uuid,$2,$3::uuid)", ws, realm, actor).Scan(&cipher); err != nil {
		inboxWorkFailure(w, err)
		return
	}
	plain, err := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, associated)
	var cred commerceCredentials
	if err != nil || json.Unmarshal(plain, &cred) != nil {
		fail(w, 503, "INTEGRATION_NOT_CONFIGURED")
		return
	}
	client := pathaoClient{do: commerceHTTPRequest}
	if s.pathaoRequest != nil {
		client.do = s.pathaoRequest
	}
	token, err := client.token(r.Context(), cred)
	if err != nil {
		fail(w, 503, "PATHAO_AUTH_UNAVAILABLE")
		return
	}
	if action == "pathao-locations" {
		items, err := client.locations(r.Context(), token, str(b, "kind"), pathaoNumber(b["parent_id"]))
		if err != nil {
			fail(w, 503, "PATHAO_LOCATIONS_UNAVAILABLE")
			return
		}
		write(w, 200, map[string]any{"items": items})
		return
	}
	if action == "courier-status" {
		status, err := client.status(r.Context(), token, d)
		if err != nil {
			fail(w, 503, "PATHAO_STATUS_UNAVAILABLE")
			return
		}
		raw, err := s.pathaoCommand(r, ws, realm, actor, key, "status", map[string]any{"id": d.ID, "consignment": d.Consignment, "provider_status": status})
		if err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, json.RawMessage(raw))
		return
	}
	options, ok := b["options"].(map[string]any)
	if !ok || validatePathaoOptions(options) != nil || d.COD%100 != 0 {
		fail(w, 422, "INVALID_PATHAO_PARCEL_OR_WHOLE_TAKA_COD")
		return
	}
	if client.verifyLocations(r.Context(), token, options) != nil {
		fail(w, 422, "PATHAO_LOCATIONS_CHANGED_OR_UNAVAILABLE")
		return
	}
	raw, err := s.pathaoCommand(r, ws, realm, actor, key, "start", map[string]any{"id": d.ID, "revision": d.Revision, "options": options})
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	if json.Unmarshal(raw, &d) != nil || d.Replayed {
		fail(w, 409, "RECONCILE_BOOKING_WITH_PROVIDER")
		return
	}
	consignment, bookErr := client.book(r.Context(), token, d, options)
	next := map[string]any{"id": d.ID, "revision": d.Revision, "status": "unknown"}
	if bookErr == nil {
		next["status"] = "booked"
		next["consignment"] = consignment
	}
	raw, err = s.pathaoCommand(r, ws, realm, actor, newUUID(), "finish", next)
	if err != nil || bookErr != nil {
		fail(w, 409, "BOOKING_OUTCOME_UNKNOWN_RECONCILE")
		return
	}
	write(w, 200, json.RawMessage(raw))
}
