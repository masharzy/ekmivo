package checkout

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
)

// HandleGrowth serves drafts and internal appointments. It intentionally has
// no delivery/send action: an unverified CRM opt-in is not transport consent.
func (s *Service) HandleGrowth(w http.ResponseWriter, r *http.Request) {
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
	store, realm := r.PathValue("workspaceID"), explicitRealm(r)
	if !uuidPattern.MatchString(store) || (realm != "live" && realm != "sandbox") {
		fail(w, 422, "INVALID_SCOPE")
		return
	}
	// The CONTROL SECURITY DEFINER reader/writer verifies active membership and
	// read vs manage privilege on every call (including revocation). The Next
	// proxy separately rejects a stale Store tab on the user's primary binding.
	if !s.budget(w, "growth:"+store+":"+actor.UserID, 90) {
		return
	}
	var raw []byte
	if r.Method == http.MethodGet {
		kind := r.URL.Query().Get("kind")
		if kind == "audience" && os.Getenv("BRIOFOLD_GROWTH_CONSENT_ENABLED") == "true" {
			err = s.Pipeline.Control.QueryRow(r.Context(),
				"SELECT briofold_growth_audience_preview($1::uuid,$2,$3::uuid,$4,$5)",
				store, realm, actor.UserID, r.URL.Query().Get("channel"), r.URL.Query().Get("audience")).Scan(&raw)
		} else if kind == "broadcast" || kind == "post" || kind == "booking" {
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_growth_operations_read($1::uuid,$2,$3::uuid,$4)", store, realm, actor.UserID, kind).Scan(&raw)
		} else {
			fail(w, 422, "INVALID_GROWTH_KIND")
			return
		}
	} else if r.Method == http.MethodPost {
		var command struct {
			Action string         `json:"action"`
			Key    string         `json:"operation_key"`
			Body   map[string]any `json:"body"`
		}
		if decodeBounded(w, r, &command, 16384) != nil || !uuidPattern.MatchString(command.Key) || command.Body == nil || len(command.Action) > 40 || strings.TrimSpace(command.Action) == "" {
			fail(w, 422, "INVALID_GROWTH_COMMAND")
			return
		}
		encoded, _ := json.Marshal(command.Body)
		if command.Action == "suppress-contact" && os.Getenv("BRIOFOLD_GROWTH_CONSENT_ENABLED") == "true" {
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_growth_suppress_contact($1::uuid,$2,$3::uuid,$4::uuid,$5::jsonb)", store, realm, actor.UserID, command.Key, encoded).Scan(&raw)
		} else {
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_growth_operations_write($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::jsonb)", store, realm, actor.UserID, command.Key, command.Action, encoded).Scan(&raw)
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
	w.WriteHeader(200)
	_, _ = w.Write(raw)
}
