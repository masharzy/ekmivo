package checkout

import (
	"encoding/json"
	"io"
	"net/http"
)

func (s *Service) handleMobileInbox(w http.ResponseWriter, r *http.Request, raw []byte) {
	d, err := s.mobileIdentity(r, raw)
	if err != nil {
		authError(w, err)
		return
	}
	s.executeInboxRequest(w, r, raw, d, "device")
}
func (s *Service) HandleWebInbox(w http.ResponseWriter, r *http.Request) {
	ws, e := r.PathValue("workspaceID"), explicitRealm(r)
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if err := s.mobileSession(r, ws, e); err != nil {
		authError(w, err)
		return
	}
	c, _ := r.Cookie("ekmivo-session")
	actor, err := s.Auth.Authenticate(r.Context(), c.Value)
	if err != nil {
		authError(w, err)
		return
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 7340032))
	if err != nil {
		fail(w, 413, "BODY_TOO_LARGE")
		return
	}
	s.executeInboxRequest(w, r, raw, mobileIdentity{ID: actor.UserID, Workspace: ws, Environment: e}, "user")
}
func (s *Service) executeInboxRequest(w http.ResponseWriter, r *http.Request, raw []byte, d mobileIdentity, reader string) {
	var err error
	var b struct {
		Action  string         `json:"action"`
		Thread  string         `json:"thread_id"`
		Before  *int64         `json:"before"`
		Filters map[string]any `json:"filters"`
		Body    map[string]any `json:"body"`
	}
	if json.Unmarshal(raw, &b) != nil {
		fail(w, 422, "INVALID_REQUEST")
		return
	}
	var thread any
	if b.Thread != "" {
		if !uuidPattern.MatchString(b.Thread) {
			fail(w, 422, "INVALID_THREAD")
			return
		}
		thread = b.Thread
	}
	if b.Filters == nil {
		b.Filters = map[string]any{}
	}
	if off, ok := b.Filters["offset"].(float64); ok && (off < 0 || off > 10000) {
		fail(w, 422, "INVALID_FILTER")
		return
	}
	b.Filters["reader_kind"] = reader
	if b.Body == nil {
		b.Body = map[string]any{}
	}
	b.Body["reader_kind"] = reader
	var result []byte
	if b.Action == "media-upload" || b.Action == "media-get" {
		if thread == nil {
			fail(w, 422, "INVALID_THREAD")
			return
		}
		s.inboxMediaAction(w, r, d, b.Thread, b.Action, b.Body)
		return
	}
	if b.Action == "profile" || b.Action == "note" || b.Action == "products" || b.Action == "info" || b.Action == "send-media" || b.Action == "send-product" || b.Action == "forward" || b.Action == "react" || (reader == "user" && (b.Action == "orders-save" || b.Action == "product-save" || b.Action == "contact")) {
		if thread == nil {
			fail(w, 422, "INVALID_THREAD")
			return
		}
		if b.Action == "forward" && b.Body["album"] == true {
			messageID, _ := b.Body["message_id"].(string)
			key, _ := b.Body["idempotency_key"].(string)
			if !uuidPattern.MatchString(messageID) || !uuidPattern.MatchString(key) {
				fail(w, 422, "INVALID_MESSAGE")
				return
			}
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_forward_album($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid)", d.Workspace, d.Environment, d.ID, thread, messageID, key).Scan(&result)
			if err != nil {
				mapped(w, err)
				return
			}
			write(w, 200, json.RawMessage(result))
			return
		}
		body, _ := json.Marshal(b.Body)
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_advanced($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::jsonb)", d.Workspace, d.Environment, d.ID, thread, b.Action, body).Scan(&result)
		if err != nil {
			mapped(w, err)
			return
		}
		write(w, 200, json.RawMessage(result))
		return
	}
	if b.Action == "list" || b.Action == "messages" {
		if b.Action == "messages" && thread == nil {
			fail(w, 422, "INVALID_THREAD")
			return
		}
		f, _ := json.Marshal(b.Filters)
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_page($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::jsonb)", d.Workspace, d.Environment, d.ID, thread, b.Before, f).Scan(&result)
	} else if b.Action == "send" || b.Action == "read" || b.Action == "ai" || b.Action == "retry" {
		if thread == nil {
			fail(w, 422, "INVALID_THREAD")
			return
		}
		if b.Action == "send" {
			text, _ := b.Body["text"].(string)
			id, _ := b.Body["idempotency_key"].(string)
			if text == "" || len(text) > 16000 || !uuidPattern.MatchString(id) {
				fail(w, 422, "INVALID_MESSAGE")
				return
			}
		}
		body, _ := json.Marshal(b.Body)
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_action($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::jsonb)", d.Workspace, d.Environment, d.ID, thread, b.Action, body).Scan(&result)
	} else {
		fail(w, 422, "INVALID_ACTION")
		return
	}
	if err != nil {
		mapped(w, err)
		return
	}
	write(w, 200, json.RawMessage(result))
}
