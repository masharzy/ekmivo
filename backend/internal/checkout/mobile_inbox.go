package checkout

import (
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/masharzy/ekmivo/backend/internal/authz"
)

func (s *Service) handleMobileInbox(w http.ResponseWriter, r *http.Request, raw []byte) {
	d, err := s.mobileIdentity(r, raw)
	if err != nil {
		authError(w, err)
		return
	}
	s.executeInboxRequest(w, r, raw, d, "device")
}

// Capability comes from a bounded action, never a client-declared role.
func webInboxCapability(action string) (authz.Capability, bool) {
	switch action {
	case "ai-review-read", "work-read", "list", "messages", "profile", "products", "info", "media-get", "read":
		return authz.InboxRead, true
	case "send-saved-reply", "ai-review-done", "work", "takeover", "release", "ticket", "duty", "work-note", "send", "retry", "media-upload", "send-media", "send-product", "forward", "react", "note", "contact", "orders-save":
		return authz.InboxSend, true
	case "saved-reply", "archive-reply", "ai", "product-save":
		return authz.InboxManage, true
	default:
		return "", false
	}
}
func (s *Service) HandleWebInbox(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost || !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "INBOX_UNAVAILABLE")
		return
	}
	c, err := r.Cookie("ekmivo-session")
	if err != nil {
		authError(w, authz.ErrUnauthorized)
		return
	}
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
	var request struct {
		Action string `json:"action"`
	}
	if json.Unmarshal(raw, &request) != nil {
		fail(w, 422, "INVALID_REQUEST")
		return
	}
	capability, valid := webInboxCapability(request.Action)
	if !valid {
		fail(w, 422, "INVALID_ACTION")
		return
	}
	workspace, environment := r.PathValue("workspaceID"), explicitRealm(r)
	if _, err = s.Auth.AuthorizeWorkspace(r.Context(), actor, workspace, authz.Environment(environment), capability); err != nil {
		authError(w, err)
		return
	}
	s.executeInboxRequest(w, r, raw, mobileIdentity{ID: actor.UserID, Workspace: workspace, Environment: environment}, "user")
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
	if _, ok := inboxWorkOffset(b.Filters["offset"]); !ok {
		fail(w, 422, "INVALID_FILTER")
		return
	}
	b.Filters["reader_kind"] = reader
	if b.Body == nil {
		b.Body = map[string]any{}
	}
	b.Body["reader_kind"] = reader
	if reader == "user" && thread != nil {
		cap := "send"
		if c, _ := webInboxCapability(b.Action); c == authz.InboxRead {
			cap = "read"
		}
		source := ""
		if b.Action == "forward" {
			source, _ = b.Body["message_id"].(string)
			if !uuidPattern.MatchString(source) {
				fail(w, 422, "INVALID_MESSAGE")
				return
			}
		}
		if err = s.inboxChannelScope(r.Context(), d.Workspace, d.Environment, d.ID, b.Thread, cap, source); err != nil {
			inboxWorkFailure(w, err)
			return
		}
	}
	var result []byte
	if reader == "user" && b.Action == "send-saved-reply" {
		key, _ := b.Body["operation_key"].(string)
		if thread == nil || !uuidPattern.MatchString(key) {
			fail(w, 422, "INVALID_OPERATION_KEY")
			return
		}
		body, _ := json.Marshal(b.Body)
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_saved_reply_send($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6::jsonb)", d.Workspace, d.Environment, d.ID, thread, key, body).Scan(&result)
		if err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, json.RawMessage(result))
		return
	}
	if reader == "user" && (b.Action == "ai-review-read" || b.Action == "ai-review-done") {
		if b.Action == "ai-review-read" {
			offset, valid := inboxWorkOffset(b.Filters["offset"])
			query, _ := b.Filters["q"].(string)
			if !valid || utf8.RuneCountInString(query) > 100 {
				fail(w, 422, "INVALID_FILTER")
				return
			}
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_ai_review_read($1::uuid,$2,$3::uuid,$4,$5)", d.Workspace, d.Environment, d.ID, offset, query).Scan(&result)
		} else {
			job, _ := b.Body["job_id"].(string)
			key, _ := b.Body["operation_key"].(string)
			if !uuidPattern.MatchString(job) || !uuidPattern.MatchString(key) {
				fail(w, 422, "INVALID_OPERATION_KEY")
				return
			}
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_ai_review_done($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid)", d.Workspace, d.Environment, d.ID, job, key).Scan(&result)
		}
		if err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, json.RawMessage(result))
		return
	}
	if reader == "user" && (b.Action == "work-read" || b.Action == "work" || b.Action == "takeover" || b.Action == "release" || b.Action == "ticket" || b.Action == "duty" || b.Action == "work-note" || b.Action == "saved-reply" || b.Action == "archive-reply") {
		if b.Action == "work-read" {
			offset, valid := inboxWorkOffset(b.Filters["reply_offset"])
			tickets, ticketValid := inboxWorkOffset(b.Filters["ticket_offset"])
			history, historyValid := inboxWorkOffset(b.Filters["history_offset"])
			if !valid || !ticketValid || !historyValid {
				fail(w, 422, "INVALID_FILTER")
				return
			}
			filters, _ := json.Marshal(b.Filters)
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_inbox_work_read($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7,$8::jsonb)", d.Workspace, d.Environment, d.ID, thread, offset, tickets, history, filters).Scan(&result)
		} else {
			key, _ := b.Body["operation_key"].(string)
			if !uuidPattern.MatchString(key) {
				fail(w, 422, "INVALID_OPERATION_KEY")
				return
			}
			action := b.Action
			if action == "work-note" {
				action = "note"
			}
			body, _ := json.Marshal(b.Body)
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_inbox_work_write($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7::jsonb)", d.Workspace, d.Environment, d.ID, thread, key, action, body).Scan(&result)
		}
		if err != nil {
			inboxWorkFailure(w, err)
			return
		}
		write(w, 200, json.RawMessage(result))
		return
	}
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
			if !validInboxText(text) || !uuidPattern.MatchString(id) {
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

func validInboxText(text string) bool {
	return len(text) <= 32000 && utf8.ValidString(text) && utf8.RuneCountInString(text) <= 8000 && strings.TrimSpace(text) != ""
}
func inboxWorkOffset(value any) (int, bool) {
	if value == nil {
		return 0, true
	}
	n, ok := value.(float64)
	if !ok || n < 0 || n > 10000 || n != float64(int(n)) {
		return 0, false
	}
	return int(n), true
}

func inboxWorkFailure(w http.ResponseWriter, err error) {
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		switch pg.Code {
		case "40001", "40P01":
			fail(w, 409, "WORKFLOW_CHANGED")
			return
		case "54000":
			w.Header().Set("Retry-After", "60")
			fail(w, 429, "WORKFLOW_RATE_LIMIT")
			return
		case "22P02", "22007", "22008":
			fail(w, 422, "INVALID_WORKFLOW")
			return
		}
	}
	mapped(w, err)
}
