package checkout

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const inboxMediaLimit = 5 * 1024 * 1024

func validateInboxMedia(data []byte, declared string) (string, error) {
	if len(data) == 0 || len(data) > inboxMediaLimit {
		return "", errors.New("FILE_LIMIT_EXCEEDED")
	}
	typ := http.DetectContentType(data)
	if typ == "application/ogg" && declared == "audio/ogg" {
		typ = "audio/ogg"
	}
	if typ == "application/octet-stream" && declared == "audio/aac" && len(data) > 2 && data[0] == 0xff && data[1]&0xf6 == 0xf0 {
		typ = "audio/aac"
	}
	if strings.HasPrefix(typ, "image/") {
		if typ != "image/jpeg" && typ != "image/png" {
			return "", errors.New("UNSUPPORTED_FILE_TYPE")
		}
		cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil || cfg.Width < 1 || cfg.Height < 1 || int64(cfg.Width)*int64(cfg.Height) > 20000000 {
			return "", errors.New("INVALID_IMAGE")
		}
	} else if (typ == "application/octet-stream" || typ == "video/mp4") && len(data) > 12 && string(data[4:8]) == "ftyp" && declared == "audio/mp4" {
		typ = "audio/mp4"
	} else if typ != "application/pdf" && typ != "audio/mpeg" && typ != "audio/ogg" && typ != "audio/aac" && typ != "audio/mp4" && !strings.HasPrefix(typ, "text/plain") {
		return "", errors.New("UNSUPPORTED_FILE_TYPE")
	}
	return typ, nil
}

func (s *Service) inboxMediaAction(w http.ResponseWriter, r *http.Request, d mobileIdentity, thread, action string, b map[string]any) {
	id, _ := b["media_id"].(string)
	if !uuidPattern.MatchString(id) {
		fail(w, 422, "INVALID_MEDIA")
		return
	}
	if action == "media-upload" {
		encoded, _ := b["data"].(string)
		data, err := base64.StdEncoding.DecodeString(encoded)
		declared, _ := b["mime"].(string)
		typ, valid := validateInboxMedia(data, declared)
		if err != nil || valid != nil {
			fail(w, 422, "INVALID_MEDIA")
			return
		}
		// Authorize before malware scanning/storage or consuming upload resources.
		var authorized []byte
		if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_profile($1::uuid,$2,$3::uuid)", d.Workspace, d.Environment, thread).Scan(&authorized); err != nil {
			mapped(w, err)
			return
		}
		if !s.budget(w, "inbox-upload:"+d.ID, 20) {
			return
		}
		if scanFile(r.Context(), data) != nil {
			fail(w, 503, "FILE_SCAN_UNCONFIRMED")
			return
		}
		name, _ := b["name"].(string)
		h := http.Header{}
		h.Set("X-Filename", name)
		name = uploadFilename(h)
		duration, _ := b["duration_ms"].(float64)
		hash := sha256.Sum256(data)
		// Content-addressed suffix prevents a conflicting retry from overwriting accepted bytes.
		key := "inbox/" + d.Environment + "/" + d.Workspace + "/" + id + "/" + hex.EncodeToString(hash[:])
		if _, err = objectRequest(r.Context(), "PUT", key, data); err != nil {
			fail(w, 503, "PRIVATE_STORAGE_UNAVAILABLE")
			return
		}
		var result []byte
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_media_save($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10)", d.Workspace, d.Environment, thread, id, key, name, typ, len(data), hex.EncodeToString(hash[:]), int(duration)).Scan(&result)
		if err != nil {
			mapped(w, err)
			return
		}
		write(w, 200, json.RawMessage(result))
		return
	}
	var raw []byte
	if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_media_access($1::uuid,$2,$3::uuid,$4::uuid)", d.Workspace, d.Environment, thread, id).Scan(&raw); err != nil {
		mapped(w, err)
		return
	}
	var f struct {
		Key  string `json:"object_key"`
		Name string `json:"name"`
		Mime string `json:"mime"`
	}
	if json.Unmarshal(raw, &f) != nil || f.Key == "" {
		if err := s.hydrateInboxMedia(r.Context(), d, thread, id); err != nil {
			fail(w, 503, "MEDIA_UNAVAILABLE")
			return
		}
		if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_media_access($1::uuid,$2,$3::uuid,$4::uuid)", d.Workspace, d.Environment, thread, id).Scan(&raw); err != nil {
			mapped(w, err)
			return
		}
		if json.Unmarshal(raw, &f) != nil || f.Key == "" {
			fail(w, 404, "NOT_FOUND")
			return
		}
	}
	if f.Key == "" {
		fail(w, 404, "NOT_FOUND")
		return
	}
	data, err := objectRequest(r.Context(), "GET", f.Key, nil)
	if err != nil {
		fail(w, 503, "PRIVATE_STORAGE_UNAVAILABLE")
		return
	}
	write(w, 200, map[string]any{"data": base64.StdEncoding.EncodeToString(data), "mime": f.Mime, "name": f.Name})
}
func (s *Service) mediaCapability(workspace, realm, thread, id string) (string, error) {
	origin := strings.TrimRight(os.Getenv("INBOX_PUBLIC_API_ORIGIN"), "/")
	u, err := url.Parse(origin)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return "", errors.New("MEDIA_ORIGIN_NOT_CONFIGURED")
	}
	expiry := strconv.FormatInt(time.Now().Add(10*time.Minute).Unix(), 10)
	payload := workspace + "|" + realm + "|" + thread + "|" + id + "|" + expiry
	mac := hmac.New(sha256.New, s.Pipeline.Key)
	mac.Write([]byte("inbox-media|" + payload))
	return origin + "/v1/channels/media/" + id + "?w=" + workspace + "&e=" + realm + "&t=" + thread + "&expires=" + expiry + "&sig=" + hex.EncodeToString(mac.Sum(nil)), nil
}
func (s *Service) HandleInboxMedia(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	q := r.URL.Query()
	ws, e, t, id := q.Get("w"), q.Get("e"), q.Get("t"), r.PathValue("mediaID")
	expires, err := strconv.ParseInt(q.Get("expires"), 10, 64)
	if !uuidPattern.MatchString(ws) || !uuidPattern.MatchString(t) || !uuidPattern.MatchString(id) || err != nil || expires < time.Now().Unix() || expires > time.Now().Add(11*time.Minute).Unix() {
		fail(w, 404, "NOT_FOUND")
		return
	}
	payload := ws + "|" + e + "|" + t + "|" + id + "|" + q.Get("expires")
	mac := hmac.New(sha256.New, s.Pipeline.Key)
	mac.Write([]byte("inbox-media|" + payload))
	sig, err := hex.DecodeString(q.Get("sig"))
	if err != nil || !hmac.Equal(sig, mac.Sum(nil)) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var raw []byte
	if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_media_access($1::uuid,$2,$3::uuid,$4::uuid)", ws, e, t, id).Scan(&raw); err != nil {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var f struct {
		Key  string `json:"object_key"`
		Name string `json:"name"`
		Mime string `json:"mime"`
	}
	if json.Unmarshal(raw, &f) != nil || f.Key == "" {
		fail(w, 404, "NOT_FOUND")
		return
	}
	data, err := objectRequest(r.Context(), "GET", f.Key, nil)
	if err != nil {
		fail(w, 503, "PRIVATE_STORAGE_UNAVAILABLE")
		return
	}
	w.Header().Set("Content-Type", f.Mime)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": f.Name}))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "sandbox")
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = io.Copy(w, bytes.NewReader(data))
}
