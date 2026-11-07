package checkout

import (
	"encoding/json"
	"net/http"
)

func (s *Service) HandlePrivacy(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Auth == nil || s.Auth.DB == nil {
		fail(w, 503, "PRIVACY_UNAVAILABLE")
		return
	}
	ws := r.PathValue("workspaceID")
	if !uuidPattern.MatchString(ws) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	cookie, err := r.Cookie("briofold-session")
	if err != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	actor, err := s.Auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		authError(w, err)
		return
	}
	if !s.budget(w, "privacy:"+actor.UserID, 10) {
		return
	}
	var raw []byte
	if r.Method == "GET" {
		err = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_privacy_read($1::uuid,$2::uuid)", ws, actor.UserID).Scan(&raw)
	} else {
		if !originAllowed(r) {
			fail(w, 403, "ORIGIN_DENIED")
			return
		}
		var body struct {
			Kind     string `json:"kind"`
			Password string `json:"current_password"`
			Confirm  bool   `json:"confirm_request"`
		}
		item := r.PathValue("requestID")
		key := r.Header.Get("Idempotency-Key")
		if decodeBounded(w, r, &body, 2048) != nil || !keyPattern.MatchString(key) || !body.Confirm || (item == "" && body.Kind != "export" && body.Kind != "delete") || (item != "" && !uuidPattern.MatchString(item)) {
			fail(w, 422, "INVALID_PRIVACY_REQUEST")
			return
		}
		if err = s.Auth.ConfirmPassword(r.Context(), actor, body.Password); err != nil {
			authError(w, err)
			return
		}
		if item != "" {
			err = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_privacy_cancel($1::uuid,$2::uuid,$3::uuid)", item, ws, actor.UserID).Scan(&raw)
		} else {
			err = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_privacy_request($1::uuid,$2::uuid,$3,$4)", ws, actor.UserID, body.Kind, key).Scan(&raw)
		}
	}
	if err != nil {
		mapped(w, err)
		return
	}
	var result any
	if json.Unmarshal(raw, &result) != nil {
		fail(w, 503, "PRIVACY_UNAVAILABLE")
		return
	}
	status := 200
	if r.Method == "POST" {
		status = 202
	}
	write(w, status, result)
}
