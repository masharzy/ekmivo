package checkout

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/masharzy/briofold/backend/internal/authz"
	"github.com/masharzy/briofold/backend/internal/deviceevidence"
	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
)

type inboxUploadPermit struct {
	Session   string  `json:"session"`
	Workspace string  `json:"workspace"`
	Realm     string  `json:"realm"`
	Thread    string  `json:"thread"`
	Media     string  `json:"media"`
	Mime      string  `json:"mime"`
	Name      string  `json:"name"`
	Hash      string  `json:"hash"`
	Size      int64   `json:"size"`
	Duration  float64 `json:"duration"`
	Expires   int64   `json:"expires"`
}

func (s *Service) inboxUploadTicket(w http.ResponseWriter, r *http.Request, d mobileIdentity, thread string, b map[string]any) {
	id, _ := b["media_id"].(string)
	size, _ := b["size"].(float64)
	hash, _ := b["sha256"].(string)
	digest, err := hex.DecodeString(hash)
	if !uuidPattern.MatchString(thread) || !uuidPattern.MatchString(id) || size < 1 || size > inboxMediaLimit || size != float64(int64(size)) || err != nil || len(digest) != 32 {
		fail(w, 422, "INVALID_MEDIA")
		return
	}
	cookie, err := r.Cookie("__Secure-briofold-api-session")
	if err != nil {
		cookie, err = r.Cookie("briofold-session")
	}
	if err != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	link, err := s.mediaCapability(d.Workspace, d.Environment, thread, id)
	if err != nil {
		fail(w, 503, "MEDIA_ORIGIN_NOT_CONFIGURED")
		return
	}
	if !s.budget(w, "inbox-upload-ticket:"+d.ID, 30) {
		return
	}
	name, _ := b["name"].(string)
	mime, _ := b["mime"].(string)
	duration, _ := b["duration_ms"].(float64)
	if len(name) > 512 || len(mime) > 128 || duration < 0 || duration > 3600000 {
		fail(w, 422, "INVALID_MEDIA")
		return
	}
	permit := inboxUploadPermit{cookie.Value, d.Workspace, d.Environment, thread, id, mime, name, hash, int64(size), duration, time.Now().Add(3 * time.Minute).Unix()}
	raw, _ := json.Marshal(permit)
	encrypted, err := deviceevidence.Encrypt(s.Pipeline.Key, raw, "inbox-upload:v1")
	if err != nil {
		fail(w, 503, "UPLOAD_UNAVAILABLE")
		return
	}
	// The session is sealed inside a scoped short-lived permit, never exposed to JS.
	origin := strings.Split(link, "/v1/channels/media/")[0]
	w.Header().Set("Cache-Control", "private, no-store")
	write(w, 200, map[string]any{"url": origin + "/v1/channels/upload/" + id, "ticket": base64.RawURLEncoding.EncodeToString(encrypted)})
}

func (s *Service) HandleInboxUpload(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Origin") == "" || !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
	w.Header().Add("Vary", "Origin")
	w.Header().Set("Cache-Control", "private, no-store")
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Max-Age", "300")
		w.WriteHeader(204)
		return
	}
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "INBOX_UNAVAILABLE")
		return
	}
	p, err := decodeInboxUploadPermit(s.Pipeline.Key, strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), r.PathValue("mediaID"), time.Now())
	if err != nil {
		fail(w, 403, "INVALID_UPLOAD_TICKET")
		return
	}
	actor, err := s.Auth.Authenticate(r.Context(), p.Session)
	if err != nil {
		authError(w, err)
		return
	}
	if _, err = s.Auth.AuthorizeWorkspace(r.Context(), actor, p.Workspace, authz.Environment(p.Realm), authz.InboxSend); err != nil {
		authError(w, err)
		return
	}
	if err = s.inboxChannelScope(r.Context(), p.Workspace, p.Realm, actor.UserID, p.Thread, "send", ""); err != nil {
		inboxWorkFailure(w, err)
		return
	}
	if r.ContentLength > p.Size {
		fail(w, 413, "FILE_LIMIT_EXCEEDED")
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, p.Size))
	if err != nil || int64(len(data)) != p.Size {
		fail(w, 422, "INVALID_MEDIA")
		return
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != p.Hash {
		fail(w, 422, "INVALID_MEDIA")
		return
	}
	typ, err := validateInboxMedia(data, p.Mime)
	if err != nil {
		fail(w, 422, inboxMediaFailureCode(err))
		return
	}
	s.saveInboxUpload(w, r, mobileIdentity{ID: actor.UserID, Workspace: p.Workspace, Environment: p.Realm}, p.Thread, p.Media, data, typ, map[string]any{"name": p.Name, "duration_ms": p.Duration})
}

func decodeInboxUploadPermit(key []byte, ticket, media string, now time.Time) (inboxUploadPermit, error) {
	var p inboxUploadPermit
	invalid := errors.New("INVALID_UPLOAD_TICKET")
	if len(ticket) > 12000 {
		return p, invalid
	}
	encrypted, err := base64.RawURLEncoding.DecodeString(ticket)
	if err != nil {
		return p, invalid
	}
	raw, err := merchantwebhook.Decrypt(key, encrypted, "inbox-upload:v1")
	if err != nil || json.Unmarshal(raw, &p) != nil || p.Media != media || !uuidPattern.MatchString(p.Media) || !uuidPattern.MatchString(p.Workspace) || !uuidPattern.MatchString(p.Thread) || (p.Realm != "live" && p.Realm != "sandbox") || p.Session == "" || p.Expires < now.Unix() || p.Expires > now.Add(4*time.Minute).Unix() || p.Size < 1 || p.Size > inboxMediaLimit {
		return p, invalid
	}
	return p, nil
}
