package checkout

import (
	"encoding/base64"
	"github.com/masharzy/ekmivo/backend/internal/knowledge"
	"net/http"
	"path/filepath"
	"strings"
)

var knowledgeImportSlots = make(chan struct{}, 2)

func (s *Service) HandleKnowledgeImport(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Auth == nil || s.Auth.DB == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	if r.Method != "POST" || !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
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
	workspace := r.PathValue("workspaceID")
	if !uuidPattern.MatchString(workspace) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var allowed bool
	if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_ai_import_authorize($1::uuid,$2::uuid)", workspace, actor.UserID).Scan(&allowed); err != nil || !allowed {
		if err != nil {
			mapped(w, err)
		} else {
			fail(w, 403, "ACCESS_DENIED")
		}
		return
	}
	if !s.budget(w, "knowledge-import:"+workspace+":"+actor.UserID, 10) {
		return
	}
	select {
	case knowledgeImportSlots <- struct{}{}:
		defer func() { <-knowledgeImportSlots }()
	default:
		w.Header().Set("Retry-After", "30")
		fail(w, 429, "DOCUMENT_IMPORT_BUSY")
		return
	}
	var input struct {
		Name string `json:"name"`
		Data string `json:"data"`
		URL  string `json:"url"`
	}
	if decodeBounded(w, r, &input, 7340032) != nil {
		fail(w, 422, "INVALID_DOCUMENT")
		return
	}
	if input.URL != "" {
		if input.Data != "" || input.Name != "" {
			fail(w, 422, "INVALID_DOCUMENT")
			return
		}
		text, name, err := knowledge.FetchPublic(r.Context(), input.URL)
		if err != nil {
			fail(w, 422, "URL_IMPORT_FAILED")
			return
		}
		title := []rune(name)
		if len(title) > 160 {
			title = title[:160]
		}
		write(w, 200, map[string]any{"text": text, "name": string(title), "kind": "text"})
		return
	}
	if len(input.Name) > 200 || !strings.EqualFold(filepath.Ext(input.Name), ".docx") {
		fail(w, 422, "INVALID_DOCUMENT")
		return
	}
	data, err := base64.StdEncoding.DecodeString(input.Data)
	if err != nil || len(data) == 0 || len(data) > knowledge.MaxFileBytes {
		fail(w, 422, "INVALID_DOCUMENT")
		return
	}
	if scanFile(r.Context(), data) != nil {
		fail(w, 503, "FILE_SCAN_UNCONFIRMED")
		return
	}
	text, err := knowledge.Word(data)
	if err != nil {
		fail(w, 422, "DOCUMENT_EXTRACTION_FAILED")
		return
	}
	// No original bytes or relationships are persisted; the owner reviews plain text.
	write(w, 200, map[string]any{"text": text, "name": filepath.Base(input.Name), "kind": "text"})
}
