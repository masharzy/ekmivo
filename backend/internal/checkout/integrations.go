package checkout

import (
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
	"net/http"
)

func (s *Service) HandleIntegrations(w http.ResponseWriter, r *http.Request) {
	ws, realm := r.PathValue("workspaceID"), explicitRealm(r)
	if !s.pipelineReady() || !uuidPattern.MatchString(ws) || s.pipelinePool(realm) == nil {
		fail(w, 503, "INTEGRATIONS_UNAVAILABLE")
		return
	}
	actor, role, err := s.documentActor(r, ws, realm, "payments", r.Method != "GET")
	if err != nil {
		authError(w, err)
		return
	}
	var raw []byte
	if r.Method == "GET" {
		err = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg12_read($1::uuid,$2)", ws, realm).Scan(&raw)
		})
	} else {
		if (role != "owner" && role != "admin") || !originAllowed(r) {
			fail(w, 403, "ACCESS_DENIED")
			return
		}
		var b struct {
			Kind    string `json:"kind"`
			Name    string `json:"name"`
			Origin  string `json:"origin"`
			Webhook string `json:"webhook_id"`
			Version int64  `json:"expected_version"`
		}
		if decodeBounded(w, r, &b, 4096) != nil {
			fail(w, 422, "INVALID_CONNECTION")
			return
		}
		id := r.PathValue("integrationID")
		action := r.PathValue("integrationAction")
		if id == "" || action == "edit" {
			u, e := merchantwebhook.ValidateURL(b.Origin)
			if e != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" && u.Path != "/" || len(b.Name) < 2 || len(b.Name) > 120 || b.Webhook != "" && !uuidPattern.MatchString(b.Webhook) {
				fail(w, 422, "INVALID_CONNECTION")
				return
			}
			b.Origin = u.Scheme + "://" + u.Host
		}
		if id != "" && !uuidPattern.MatchString(id) {
			fail(w, 404, "NOT_FOUND")
			return
		}
		err = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg12_save($1::uuid,$2,$3::uuid,$4,$5,$6,$7::uuid,$8,$9,$10::uuid)", ws, realm, nullableID(id), b.Kind, b.Name, b.Origin, nullableID(b.Webhook), action, b.Version, nullableID(actor)).Scan(&raw)
		})
	}
	if err != nil {
		mapped(w, err)
		return
	}
	var result any
	if json.Unmarshal(raw, &result) != nil {
		fail(w, 503, "INVALID_CONNECTION_RESULT")
		return
	}
	if r.Method == "GET" {
		if data, ok := result.(map[string]any); ok {
			sources := []map[string]any{}
			for _, rule := range s.Pipeline.Rules {
				if rule.Approved && (realm == "sandbox" || !rule.SandboxOnly) {
					sources = append(sources, map[string]any{"method": rule.Method, "source": rule.Source, "parser_id": rule.ID, "version": rule.Version, "sandbox_only": rule.SandboxOnly})
				}
			}
			data["approved_sources"] = sources
		}
	}
	write(w, 200, result)
}
