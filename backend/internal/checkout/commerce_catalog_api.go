package checkout

import (
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/masharzy/briofold/backend/internal/authz"
	"github.com/masharzy/briofold/backend/internal/knowledge"
)

// catalogAPIEnabled gates the public product API. It is off unless the
// operator turns it on, so the code can ship before the rollout.
func catalogAPIEnabled() bool { return os.Getenv("BRIOFOLD_PRODUCT_API_ENABLED") == "true" }

// catalogDerivedID gives a stable UUID for the n-th image of an operation, so a
// replayed request stores the same media rows instead of new ones.
func catalogDerivedID(key, part string) string {
	sum := md5.Sum([]byte(key + ":" + part))
	// Version 4 and RFC 4122 variant bits keep the id valid for every UUID check in the API.
	sum[6] = sum[6]&0x0f | 0x40
	sum[8] = sum[8]&0x3f | 0x80
	h := hex.EncodeToString(sum[:])
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:32]
}

// commerceStoreImage validates, scans and stores one image, then records it in
// commerce_media. The bytes decide the type; the caller's claim is only a hint.
func (s *Service) commerceStoreImage(ctx context.Context, ws, realm, actor, mediaID, name string, data []byte) error {
	typ, valid := validateInboxMedia(data, "")
	if valid != nil || !strings.HasPrefix(typ, "image/") {
		return fmt.Errorf("invalid image")
	}
	if scanFile(ctx, data) != nil {
		return fmt.Errorf("scan unconfirmed")
	}
	h := sha256.Sum256(data)
	hash := hex.EncodeToString(h[:])
	objectKey := "commerce/" + realm + "/" + ws + "/" + mediaID + "/" + hash
	if _, err := objectRequest(ctx, "PUT", objectKey, data); err != nil {
		return err
	}
	headers := http.Header{}
	headers.Set("X-Filename", name)
	body, _ := json.Marshal(map[string]any{"media_id": mediaID, "object_key": objectKey, "mime": typ, "name": uploadFilename(headers), "sha256": hash})
	var raw []byte
	return s.Pipeline.Control.QueryRow(ctx, "SELECT commerce_write($1::uuid,$2,$3::uuid,$4::uuid,'media-save',$5::jsonb)", ws, realm, actor, mediaID, body).Scan(&raw)
}

// commerceFetchImages downloads each URL through the SSRF-safe fetcher and
// stores it. Failures are reported per URL so one bad link does not hide the rest.
func (s *Service) commerceFetchImages(ctx context.Context, ws, realm, actor, key string, urls []string) ([]string, []map[string]any) {
	ids := []string{}
	failed := []map[string]any{}
	for i, raw := range urls {
		data, _, err := knowledge.FetchPublicImage(ctx, raw)
		if err != nil {
			failed = append(failed, map[string]any{"url": raw, "error": "IMAGE_UNREACHABLE_OR_INVALID"})
			continue
		}
		id := catalogDerivedID(key, "img:"+strconv.Itoa(i))
		if err = s.commerceStoreImage(ctx, ws, realm, actor, id, "product-"+strconv.Itoa(i+1), data); err != nil {
			failed = append(failed, map[string]any{"url": raw, "error": "IMAGE_STORE_FAILED"})
			continue
		}
		ids = append(ids, id)
	}
	return ids, failed
}

var catalogAPIFields = map[string]bool{"external_id": true, "name": true, "description": true, "category": true, "tags": true, "search_aliases": true, "ai_notes": true, "min_price_minor": true, "size_chart": true, "active": true, "variants": true, "image_urls": true, "warehouse_id": true}
var catalogAPIVariantFields = map[string]bool{"sku": true, "barcode": true, "options": true, "price_minor": true, "stock": true, "active": true}

// validCatalogAPIBody rejects server-owned fields and wrong types before SQL
// sees them. SQL re-validates every bound, so this is only the first fence.
func validCatalogAPIBody(b map[string]any, create bool) bool {
	for f := range b {
		if !catalogAPIFields[f] {
			return false
		}
	}
	if create {
		if ext, _ := b["external_id"].(string); strings.TrimSpace(ext) == "" {
			return false
		}
	} else if _, has := b["external_id"]; has {
		return false
	}
	if name, has := b["name"]; has {
		if s, ok := name.(string); !ok || strings.TrimSpace(s) == "" || len(s) > 200 {
			return false
		}
	} else if create {
		return false
	}
	if urls, has := b["image_urls"]; has {
		list, ok := urls.([]any)
		if !ok || len(list) > 8 {
			return false
		}
		for _, u := range list {
			if v, ok := u.(string); !ok || len(v) > 2048 {
				return false
			}
		}
	}
	variants, has := b["variants"]
	if !has {
		return !create
	}
	list, ok := variants.([]any)
	if !ok || len(list) < 1 || len(list) > 100 {
		return false
	}
	for _, raw := range list {
		v, ok := raw.(map[string]any)
		if !ok {
			return false
		}
		for f := range v {
			if !catalogAPIVariantFields[f] {
				return false
			}
		}
		if sku, _ := v["sku"].(string); strings.TrimSpace(sku) == "" {
			return false
		}
		if !wholeNumber(v["price_minor"], 1, 100000000000) {
			return false
		}
		if stock, has := v["stock"]; has && !wholeNumber(stock, 0, 10000000) {
			return false
		}
	}
	if m, has := b["min_price_minor"]; has && m != nil && !wholeNumber(m, 0, 100000000000) {
		return false
	}
	return true
}

func wholeNumber(v any, min, max float64) bool {
	n, ok := v.(float64)
	return ok && n >= min && n <= max && n == float64(int64(n))
}

// HandleProductAPI serves /v1/products for merchant API keys. Reads need
// products:read, every change needs products:write. Writes require a UUID
// Idempotency-Key and are replay-safe in SQL.
func (s *Service) HandleProductAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !catalogAPIEnabled() {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	realm := explicitRealm(r)
	if realm != "live" && realm != "sandbox" {
		fail(w, 422, "INVALID_SCOPE")
		return
	}
	id := r.PathValue("id")
	stock := strings.HasSuffix(r.URL.Path, "/stock")
	if id != "" && !uuidPattern.MatchString(id) {
		fail(w, 422, "INVALID_PRODUCT")
		return
	}
	scope := "products:write"
	if r.Method == http.MethodGet {
		scope = "products:read"
	}
	cred, err := s.Auth.AuthenticateMerchant(r.Context(), r.Header.Get("Authorization"), authz.Environment(realm), scope)
	if err != nil {
		authError(w, err)
		return
	}
	if r.Method == http.MethodGet {
		s.productAPIRead(w, r, cred.WorkspaceID, realm, cred.KeyID, id)
		return
	}
	if !s.budget(w, "product-api:"+cred.WorkspaceID, 60) {
		return
	}
	if r.Method == http.MethodDelete {
		var raw []byte
		if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_api_catalog_delete($1::uuid,$2,$3::uuid,$4::uuid)", cred.WorkspaceID, realm, cred.KeyID, id).Scan(&raw); err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, json.RawMessage(raw))
		return
	}
	key := r.Header.Get("Idempotency-Key")
	var b map[string]any
	if !uuidPattern.MatchString(key) || decodeBounded(w, r, &b, 262144) != nil || b == nil {
		fail(w, 422, "INVALID_PRODUCT")
		return
	}
	if stock {
		encoded, _ := json.Marshal(b)
		var raw []byte
		if id == "" || r.Method != http.MethodPut {
			fail(w, 405, "METHOD_NOT_ALLOWED")
			return
		}
		if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_api_catalog_stock($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6::jsonb)", cred.WorkspaceID, realm, cred.KeyID, key, id, encoded).Scan(&raw); err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, json.RawMessage(raw))
		return
	}
	create := r.Method == http.MethodPost
	if (create && id != "") || (!create && (id == "" || r.Method != http.MethodPut)) || !validCatalogAPIBody(b, create) {
		fail(w, 422, "INVALID_PRODUCT")
		return
	}
	var failedImages []map[string]any
	if urls, has := b["image_urls"].([]any); has {
		delete(b, "image_urls")
		var actor string
		if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_api_key_actor($1::uuid,$2,$3::uuid,'products:write')::text", cred.WorkspaceID, realm, cred.KeyID).Scan(&actor); err != nil {
			inboxWorkFailure(w, err)
			return
		}
		list := make([]string, 0, len(urls))
		for _, u := range urls {
			list = append(list, u.(string))
		}
		var ids []string
		ids, failedImages = s.commerceFetchImages(r.Context(), cred.WorkspaceID, realm, actor, key, list)
		b["images"] = ids
	}
	encoded, _ := json.Marshal(b)
	var raw []byte
	if create {
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_api_catalog_write($1::uuid,$2,$3::uuid,$4::uuid,$5::jsonb)", cred.WorkspaceID, realm, cred.KeyID, key, encoded).Scan(&raw)
	} else {
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_api_catalog_update($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6::jsonb)", cred.WorkspaceID, realm, cred.KeyID, key, id, encoded).Scan(&raw)
	}
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	out := map[string]any{}
	if json.Unmarshal(raw, &out) != nil {
		write(w, 200, json.RawMessage(raw))
		return
	}
	if len(failedImages) > 0 {
		out["image_errors"] = failedImages
	}
	status := 200
	if created, _ := out["created"].(bool); created {
		status = 201
	}
	write(w, status, out)
}

func (s *Service) productAPIRead(w http.ResponseWriter, r *http.Request, ws, realm, keyID, id string) {
	if !s.budget(w, "product-api-read:"+ws, 120) {
		return
	}
	off := 0
	var parseErr error
	if value := r.URL.Query().Get("cursor"); value != "" {
		off, parseErr = strconv.Atoi(value)
	}
	ext := r.URL.Query().Get("external_id")
	if parseErr != nil || off < 0 || off > 100000 || len(ext) > 200 || len(r.URL.Query().Get("q")) > 200 {
		fail(w, 422, "INVALID_FILTER")
		return
	}
	var raw []byte
	if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_api_catalog_read($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7)", ws, realm, keyID, nullableID(id), ext, off, r.URL.Query().Get("q")).Scan(&raw); err != nil {
		inboxWorkFailure(w, err)
		return
	}
	write(w, 200, json.RawMessage(raw))
}
