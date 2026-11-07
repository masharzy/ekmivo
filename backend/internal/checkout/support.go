package checkout

import (
	"encoding/json"
	"net/http"
)

func (s *Service) HandleSupportReply(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Auth == nil {
		fail(w, 503, "SUPPORT_UNAVAILABLE")
		return
	}
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	cookie, e := r.Cookie("briofold-session")
	if e != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	actor, e := s.Auth.Authenticate(r.Context(), cookie.Value)
	if e == nil {
		_, e = s.Auth.AuthorizePlatform(r.Context(), actor, false)
	}
	if e != nil {
		authError(w, e)
		return
	}
	ticket := r.PathValue("ticketID")
	if !uuidPattern.MatchString(ticket) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var b struct {
		Message string `json:"message"`
		Status  string `json:"status"`
	}
	if decodeBounded(w, r, &b, 8192) != nil {
		fail(w, 422, "INVALID_REPLY")
		return
	}
	var raw []byte
	e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_support_reply($1::uuid,$2::uuid,$3,$4)", actor.UserID, ticket, b.Message, b.Status).Scan(&raw)
	if e != nil {
		mapped(w, e)
		return
	}
	var data any
	if json.Unmarshal(raw, &data) != nil {
		fail(w, 503, "SUPPORT_UNAVAILABLE")
		return
	}
	write(w, 200, data)
}
