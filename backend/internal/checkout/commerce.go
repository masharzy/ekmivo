package checkout

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/masharzy/ekmivo/backend/internal/authz"
)

// Commerce owns operations only. Every financial reference is read from its
// independent authorized realm before it is linked; no payment state is written.
func (s *Service) HandleCommerce(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	cookie, err := r.Cookie("ekmivo-session")
	if err != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	actor, err := s.Auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		authError(w, err)
		return
	}
	ws, realm := r.PathValue("workspaceID"), explicitRealm(r)
	if !uuidPattern.MatchString(ws) || (realm != "live" && realm != "sandbox") {
		fail(w, 422, "INVALID_SCOPE")
		return
	}
	if !s.budget(w, "commerce:"+ws+":"+actor.UserID, 120) {
		return
	}
	var raw []byte
	if r.Method == http.MethodGet {
		off := 0
		if q := r.URL.Query().Get("cursor"); q != "" {
			off, err = strconv.Atoi(q)
		}
		id := r.URL.Query().Get("item")
		if err != nil || off < 0 || off > 10000 || (id != "" && !uuidPattern.MatchString(id)) {
			fail(w, 422, "INVALID_FILTER")
			return
		}
		if r.URL.Query().Get("resource") == "photo-metrics" {
			if os.Getenv("BRIOFOLD_PRODUCT_PHOTOS_ENABLED") != "true" {
				fail(w, 503, "PRODUCT_PHOTOS_UNAVAILABLE")
				return
			}
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_photo_metrics($1::uuid,$2,$3::uuid)", ws, realm, actor.UserID).Scan(&raw)
		} else if r.URL.Query().Get("resource") == "assignments" {
			if os.Getenv("BRIOFOLD_COMMERCE_ASSIGNMENTS_ENABLED") != "true" {
				fail(w, 503, "ASSIGNMENTS_UNAVAILABLE")
				return
			}
			if id == "" {
				fail(w, 422, "ORDER_REQUIRED")
				return
			}
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_assignment_read($1::uuid,$2,$3::uuid,$4::uuid)", ws, realm, actor.UserID, id).Scan(&raw)
		} else if r.URL.Query().Get("resource") == "scan" {
			if os.Getenv("BRIOFOLD_COMMERCE_SCAN_ENABLED") != "true" {
				fail(w, 503, "SCANNER_UNAVAILABLE")
				return
			}
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_order_scan($1::uuid,$2,$3::uuid,$4,$5,$6,$7)", ws, realm, actor.UserID,
				r.URL.Query().Get("q"), off, r.URL.Query().Get("status"), r.URL.Query().Get("source")).Scan(&raw)
		} else if r.URL.Query().Get("resource") == "product-analytics" {
			if os.Getenv("BRIOFOLD_COMMERCE_PRODUCT_ANALYTICS_ENABLED") != "true" {
				fail(w, 503, "PRODUCT_ANALYTICS_UNAVAILABLE")
				return
			}
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_product_operational_analytics($1::uuid,$2,$3::uuid,$4,$5)", ws, realm, actor.UserID,
				off, r.URL.Query().Get("q")).Scan(&raw)
		} else {
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_read($1::uuid,$2,$3::uuid,$4,$5::uuid,$6,$7,$8,$9)", ws, realm, actor.UserID, r.URL.Query().Get("resource"), nullableID(id), off, r.URL.Query().Get("q"), r.URL.Query().Get("status"), r.URL.Query().Get("source")).Scan(&raw)
		}
	} else if r.Method == http.MethodPost {
		var cmd struct {
			Action string         `json:"action"`
			Key    string         `json:"operation_key"`
			Body   map[string]any `json:"body"`
		}
		if decodeBounded(w, r, &cmd, 7340032) != nil || !uuidPattern.MatchString(cmd.Key) || cmd.Body == nil {
			fail(w, 422, "INVALID_COMMAND")
			return
		}
		if cmd.Action == "notification-read" {
			var seq int64
			switch v := cmd.Body["sequence"].(type) {
			case float64:
				if v < 0 || v != float64(int64(v)) {
					fail(w, 422, "INVALID_CURSOR")
					return
				}
				seq = int64(v)
			default:
				fail(w, 422, "INVALID_CURSOR")
				return
			}
			var ok bool
			if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_notification_ack($1::uuid,$2,$3::uuid,$4)", ws, realm, actor.UserID, seq).Scan(&ok); err != nil {
				inboxWorkFailure(w, err)
				return
			}
			write(w, 200, map[string]any{"saved": ok})
			return
		}
		switch cmd.Action {
		case "warehouse", "product", "adjust-stock", "transfer-stock", "coupon", "create-order", "review-order", "edit-order", "order-state", "delivery", "delivery-state", "cod-receipt", "return-request", "return-state", "exchange-link", "post-map", "import-preview", "import-apply", "assign-order":
		case "finance-link":
			if _, err = s.Auth.AuthorizeWorkspace(r.Context(), actor, ws, authz.Environment(realm), authz.PaymentsRead); err != nil {
				authError(w, err)
				return
			}
			if !s.commerceFinanceLink(w, r, ws, realm, cmd.Body) {
				return
			}
		case "media-read":
			s.commerceMediaRead(w, r, ws, realm, actor.UserID, cmd.Body)
			return
		case "photo-search", "photo-evaluate", "photo-index":
			s.commercePhotoAction(w, r, ws, realm, actor.UserID, cmd.Key, cmd.Action, cmd.Body)
			return
		case "media-upload":
			s.commerceMediaUpload(w, r, ws, realm, actor.UserID, cmd.Key, cmd.Body)
			return
		case "integration-save", "integration-disable", "courier-book", "courier-status", "woocommerce-preview", "pathao-locations":
			s.commerceIntegration(w, r, ws, realm, actor.UserID, cmd.Key, cmd.Action, cmd.Body)
			return
		default:
			fail(w, 422, "INVALID_COMMAND")
			return
		}
		if cmd.Action == "create-order" || cmd.Action == "review-order" || cmd.Action == "edit-order" {
			for _, f := range []string{"source", "paid", "payment_status", "total_minor", "subtotal_minor", "unit_minor", "status"} {
				if _, ok := cmd.Body[f]; ok {
					fail(w, 422, "SERVER_OWNED_FIELD")
					return
				}
			}
		}
		body, _ := json.Marshal(cmd.Body)
		if len(body) > 524288 {
			fail(w, 413, "BODY_TOO_LARGE")
			return
		}
		if cmd.Action == "assign-order" {
			if os.Getenv("BRIOFOLD_COMMERCE_ASSIGNMENTS_ENABLED") != "true" {
				fail(w, 503, "ASSIGNMENTS_UNAVAILABLE")
				return
			}
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_assignment_write($1::uuid,$2,$3::uuid,$4::uuid,$5::jsonb)", ws, realm, actor.UserID, cmd.Key, body).Scan(&raw)
		} else {
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_write($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::jsonb)", ws, realm, actor.UserID, cmd.Key, cmd.Action, body).Scan(&raw)
		}
	} else {
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(raw)
}

func (s *Service) commerceFinanceLink(w http.ResponseWriter, r *http.Request, ws, realm string, b map[string]any) bool {
	source, _ := b["source_id"].(string)
	kind, _ := b["kind"].(string)
	if !validCRMSourceID(source) || (kind != "payment" && kind != "invoice" && kind != "refund") {
		fail(w, 422, "INVALID_SOURCE")
		return false
	}
	var raw []byte
	err := s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		if kind == "payment" {
			return tx.QueryRow(r.Context(), "SELECT pg09_read($1::uuid,$2,'payments',$3::uuid,NULL::uuid,NULL::text,NULL::uuid,NULL::text,NULL::timestamptz,NULL::timestamptz,NULL::text)", ws, realm, source).Scan(&raw)
		}
		if kind == "refund" {
			return tx.QueryRow(r.Context(), "SELECT pg11_page($1::uuid,$2,'refunds',$3::uuid,NULL::uuid,NULL::text,NULL)", ws, realm, source).Scan(&raw)
		}
		return tx.QueryRow(r.Context(), "SELECT pg10_read($1::uuid,$2,'invoices',$3::uuid,NULL::uuid,NULL::text)", ws, realm, source).Scan(&raw)
	})
	var page struct {
		Items []struct {
			ID       string `json:"id"`
			Amount   int64  `json:"verified_amount_minor"`
			Status   string `json:"status"`
			Currency string `json:"currency"`
		} `json:"items"`
	}
	if err != nil || json.Unmarshal(raw, &page) != nil {
		fail(w, 503, "FINANCE_SOURCE_UNAVAILABLE")
		return false
	}
	for _, v := range page.Items {
		if strings.EqualFold(v.ID, source) {
			if kind == "payment" && (v.Amount <= 0 || v.Status != "verified" || v.Currency != "BDT") {
				break
			}
			b["amount_minor"] = int64(0)
			if kind == "payment" {
				b["amount_minor"] = v.Amount
			}
			return true
		}
	}
	fail(w, 403, "FINANCIAL_REFERENCE_UNAVAILABLE")
	return false
}

func (s *Service) commerceMediaUpload(w http.ResponseWriter, r *http.Request, ws, realm, actor, key string, b map[string]any) {
	var authorized []byte
	if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_read($1::uuid,$2,$3::uuid,'products')", ws, realm, actor).Scan(&authorized); err != nil {
		inboxWorkFailure(w, err)
		return
	}
	var access struct {
		Manage bool `json:"can_manage"`
	}
	if json.Unmarshal(authorized, &access) != nil || !access.Manage {
		fail(w, 403, "FORBIDDEN")
		return
	}
	encoded, _ := b["data"].(string)
	data, err := base64.StdEncoding.DecodeString(encoded)
	declared, _ := b["mime"].(string)
	typ, valid := validateInboxMedia(data, declared)
	if err != nil || valid != nil || !strings.HasPrefix(typ, "image/") {
		fail(w, 422, "INVALID_IMAGE")
		return
	}
	if scanFile(r.Context(), data) != nil {
		fail(w, 503, "FILE_SCAN_UNCONFIRMED")
		return
	}
	h := sha256.Sum256(data)
	hash := hex.EncodeToString(h[:])
	objectKey := "commerce/" + realm + "/" + ws + "/" + key + "/" + hash
	if _, err = objectRequest(r.Context(), "PUT", objectKey, data); err != nil {
		fail(w, 503, "PRIVATE_STORAGE_UNAVAILABLE")
		return
	}
	name, _ := b["name"].(string)
	headers := http.Header{}
	headers.Set("X-Filename", name)
	body, _ := json.Marshal(map[string]any{"media_id": key, "object_key": objectKey, "mime": typ, "name": uploadFilename(headers), "sha256": hash})
	var raw []byte
	err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_write($1::uuid,$2,$3::uuid,$4::uuid,'media-save',$5::jsonb)", ws, realm, actor, key, body).Scan(&raw)
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	if os.Getenv("BRIOFOLD_PRODUCT_PHOTOS_ENABLED") == "true" {
		indexed := false
		if signature, featureErr := productPhotoFeatures(data); featureErr == nil {
			_ = s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_photo_index($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7::jsonb)", ws, realm, actor, key, hash, signature.Hash, photoColorsJSON(signature)).Scan(&indexed)
		}
		var result map[string]any
		if json.Unmarshal(raw, &result) == nil {
			result["photo_indexed"] = indexed
			raw, _ = json.Marshal(result)
		}
	}
	write(w, 200, json.RawMessage(raw))
}

func (s *Service) commerceMediaRead(w http.ResponseWriter, r *http.Request, ws, realm, actor string, b map[string]any) {
	id, _ := b["id"].(string)
	if !uuidPattern.MatchString(id) {
		fail(w, 422, "INVALID_IMAGE")
		return
	}
	var raw []byte
	if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_media_access($1::uuid,$2,$3::uuid,$4::uuid)", ws, realm, actor, id).Scan(&raw); err != nil {
		inboxWorkFailure(w, err)
		return
	}
	var f struct {
		Key  string `json:"object_key"`
		Mime string `json:"mime"`
		Name string `json:"name"`
	}
	if json.Unmarshal(raw, &f) != nil || f.Key == "" {
		fail(w, 404, "NOT_FOUND")
		return
	}
	data, err := objectRequest(r.Context(), "GET", f.Key, nil)
	if err != nil {
		fail(w, 503, "PRIVATE_STORAGE_UNAVAILABLE")
		return
	}
	write(w, 200, map[string]any{"data": base64.StdEncoding.EncodeToString(data), "mime": f.Mime, "name": f.Name})
}
