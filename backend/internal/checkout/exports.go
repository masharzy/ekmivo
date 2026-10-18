package checkout

import (
	"encoding/base64"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"net/http"
)

func (s *Service) HandleExports(w http.ResponseWriter, r *http.Request) {
	ws, realm, id := r.PathValue("workspaceID"), explicitRealm(r), r.PathValue("exportID")
	if !s.pipelineReady() || !uuidPattern.MatchString(ws) || s.pipelinePool(realm) == nil {
		fail(w, 503, "EXPORT_UNAVAILABLE")
		return
	}
	actor, role, e := s.documentActor(r, ws, realm, "payments", false)
	if e != nil {
		authError(w, e)
		return
	}
	if actor == "" || (role != "owner" && role != "admin") {
		fail(w, 403, "ACCESS_DENIED")
		return
	}
	if s.Auth.GranularGrants {
		var allowed bool
		if s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg10_export_authorized($1::uuid,$2::uuid)", ws, actor).Scan(&allowed) != nil {
			fail(w, 503, "EXPORT_UNAVAILABLE")
			return
		}
		if !allowed {
			fail(w, 403, "ACCESS_DENIED")
			return
		}
	}
	if !s.planFeature(w, r, ws, realm, "exports") {
		return
	}
	var raw []byte
	if r.Method == "POST" {
		if !originAllowed(r) {
			fail(w, 403, "ORIGIN_DENIED")
			return
		}
		var b struct {
			Resource string `json:"resource"`
		}
		if decodeBounded(w, r, &b, 1024) != nil {
			fail(w, 422, "INVALID_EXPORT")
			return
		}
		var result string
		key := r.Header.Get("Idempotency-Key")
		if !keyPattern.MatchString(key) {
			fail(w, 400, "IDEMPOTENCY_KEY_REQUIRED")
			return
		}
		e = s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg10_export_enqueue($1::uuid,$2,$3::uuid,$4,$5)", ws, realm, actor, b.Resource, key).Scan(&result)
		})
		if e != nil {
			mapped(w, e)
			return
		}
		write(w, 202, map[string]string{"id": result, "status": "queued"})
		return
	}
	if !uuidPattern.MatchString(id) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	download := r.PathValue("exportAction") == "download"
	e = s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT pg10_export_get($1::uuid,$2,$3::uuid,$4::uuid,$5)", ws, realm, id, actor, download).Scan(&raw)
	})
	if e != nil {
		mapped(w, e)
		return
	}
	if len(raw) == 0 || string(raw) == "null" {
		fail(w, 410, "EXPORT_EXPIRED_OR_UNAVAILABLE")
		return
	}
	var data map[string]any
	_ = json.Unmarshal(raw, &data)
	if !download {
		write(w, 200, data)
		return
	}
	encoded, _ := data["body_cipher"].(string)
	cipher, e := base64.StdEncoding.DecodeString(encoded)
	if e != nil {
		fail(w, 503, "EXPORT_UNAVAILABLE")
		return
	}
	plain, e := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, ws+"|"+realm+"|export")
	if e != nil {
		fail(w, 503, "EXPORT_UNAVAILABLE")
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=export.csv")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(plain)
}
