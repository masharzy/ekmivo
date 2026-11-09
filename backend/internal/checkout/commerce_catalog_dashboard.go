package checkout

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

func catalogDashboardEnabled() bool { return os.Getenv("BRIOFOLD_CATALOG_ENABLED") == "true" }

// catalogRowCode turns a database failure into a fixed, non-sensitive code for
// one import row. The raw error text never reaches the browser.
func catalogRowCode(err error) string {
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		switch pg.Code {
		case "22023", "22P02", "23514":
			return "INVALID_ROW"
		case "23505":
			return "DUPLICATE_ROW"
		case "42501":
			return "NOT_ALLOWED"
		}
	}
	return "ROW_FAILED"
}

// commerceCatalogAction serves the seller dashboard's catalog actions:
// catalog-product (one product, manual) and catalog-import (up to 25 CSV rows).
// Source is always set here; the browser cannot choose it.
func (s *Service) commerceCatalogAction(w http.ResponseWriter, r *http.Request, ws, realm, actor, key, action string, b map[string]any) {
	if !catalogDashboardEnabled() {
		fail(w, 503, "CATALOG_UNAVAILABLE")
		return
	}
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
	if action == "catalog-product" {
		out, err := s.catalogSaveOne(r, ws, realm, actor, key, b, "manual")
		if err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, out)
		return
	}
	rows, ok := b["rows"].([]any)
	if !ok || len(rows) < 1 || len(rows) > 25 {
		fail(w, 422, "INVALID_IMPORT")
		return
	}
	results := make([]map[string]any, 0, len(rows))
	saved := 0
	for i, raw := range rows {
		row, ok := raw.(map[string]any)
		ext, _ := row["external_id"].(string)
		if !ok || strings.TrimSpace(ext) == "" {
			results = append(results, map[string]any{"row": i, "ok": false, "error": "INVALID_ROW"})
			continue
		}
		out, err := s.catalogSaveOne(r, ws, realm, actor, catalogDerivedID(key, "row:"+strconv.Itoa(i)), row, "csv")
		if err != nil {
			results = append(results, map[string]any{"row": i, "ok": false, "error": catalogRowCode(err)})
			continue
		}
		saved++
		item := map[string]any{"row": i, "ok": true}
		var parsed map[string]any
		if json.Unmarshal(out, &parsed) == nil {
			item["id"] = parsed["id"]
			item["created"] = parsed["created"]
			item["image_errors"] = parsed["image_errors"]
		}
		results = append(results, item)
	}
	write(w, 200, map[string]any{"saved": saved, "failed": len(rows) - saved, "results": results})
}

// catalogSaveOne fetches any image_urls, then writes one product through the
// single SQL write path. The key makes a retry return the first answer.
func (s *Service) catalogSaveOne(r *http.Request, ws, realm, actor, key string, b map[string]any, source string) (json.RawMessage, error) {
	body := map[string]any{}
	for k, v := range b {
		body[k] = v
	}
	delete(body, "source")
	if _, editing := body["id"]; !editing {
		body["source"] = source
	}
	if source == "manual" {
		delete(body, "external_id")
	}
	var failedImages []map[string]any
	if urls, has := body["image_urls"].([]any); has {
		delete(body, "image_urls")
		list := []string{}
		for _, u := range urls {
			if v, ok := u.(string); ok && len(list) < 8 {
				list = append(list, v)
			}
		}
		var ids []string
		ids, failedImages = s.commerceFetchImages(r.Context(), ws, realm, actor, key, list)
		if len(ids) > 0 || len(list) == 0 {
			body["images"] = ids
		}
	}
	encoded, _ := json.Marshal(body)
	var raw []byte
	if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_catalog_write($1::uuid,$2,$3::uuid,$4::uuid,$5::jsonb)", ws, realm, actor, key, encoded).Scan(&raw); err != nil {
		return nil, err
	}
	if len(failedImages) == 0 {
		return raw, nil
	}
	var out map[string]any
	if json.Unmarshal(raw, &out) != nil {
		return raw, nil
	}
	out["image_errors"] = failedImages
	merged, _ := json.Marshal(out)
	return merged, nil
}
