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
	"mime"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const inboxMediaLimit = 5 * 1024 * 1024

// Inbound media is whatever the channel delivered (Messenger 25 MB, WhatsApp up to 100 MB); 128 MB is a memory guard only.
const inboxInboundLimit = 128 * 1024 * 1024

// validateInboundVideo accepts MP4/MOV/3GP (ISO base media) and WebM by magic bytes.
func validateInboundVideo(data []byte) (string, error) {
	if len(data) == 0 || len(data) > inboxInboundLimit {
		return "", errors.New("FILE_LIMIT_EXCEEDED")
	}
	if len(data) > 12 && string(data[4:8]) == "ftyp" {
		return "video/mp4", nil
	}
	if len(data) > 4 && data[0] == 0x1a && data[1] == 0x45 && data[2] == 0xdf && data[3] == 0xa3 {
		return "video/webm", nil
	}
	return "", errors.New("UNSUPPORTED_FILE_TYPE")
}

func validateInboxMedia(data []byte, declared string) (string, error) {
	return validateInboxMediaMax(data, declared, inboxMediaLimit)
}

func validateInboxMediaMax(data []byte, declared string, max int) (string, error) {
	if len(data) == 0 || len(data) > max {
		return "", errors.New("FILE_LIMIT_EXCEEDED")
	}
	typ := http.DetectContentType(data)
	if typ == "application/ogg" && strings.HasPrefix(declared, "audio/") {
		typ = "audio/ogg"
	}
	if typ == "application/octet-stream" && declared == "audio/aac" && len(data) > 2 && data[0] == 0xff && data[1]&0xf6 == 0xf0 {
		typ = "audio/aac"
	}
	if strings.HasPrefix(typ, "image/") {
		switch typ {
		case "image/jpeg", "image/png":
			cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
			if err != nil || cfg.Width < 1 || cfg.Height < 1 || int64(cfg.Width)*int64(cfg.Height) > 20000000 {
				return "", errors.New("INVALID_IMAGE")
			}
		case "image/gif", "image/webp":
			// Accepted on magic bytes alone (animated GIF / sticker WebP); the browser renders them.
		default:
			return "", errors.New("UNSUPPORTED_FILE_TYPE")
		}
	} else if (typ == "application/octet-stream" || typ == "video/mp4") && len(data) > 12 && string(data[4:8]) == "ftyp" && strings.HasPrefix(declared, "audio/") {
		typ = "audio/mp4"
	} else if typ == "audio/wave" {
		typ = "audio/wav"
	} else if typ != "application/pdf" && typ != "audio/mpeg" && typ != "audio/ogg" && typ != "audio/aac" && typ != "audio/mp4" && !strings.HasPrefix(typ, "text/plain") {
		return "", errors.New("UNSUPPORTED_FILE_TYPE")
	}
	return typ, nil
}

// inboxMediaFailureCode exposes only fixed, non-sensitive failure reasons so the inbox can tell the
// seller why an attachment is unavailable. Anything else stays the generic MEDIA_UNAVAILABLE.
func inboxMediaFailureCode(err error) string {
	switch c := err.Error(); c {
	case "MEDIA_HOST_DENIED", "MEDIA_EXPIRED_OR_UNAVAILABLE", "CHANNEL_NOT_CONFIGURED", "MEDIA_ORIGIN_NOT_CONFIGURED",
		"UNSUPPORTED_FILE_TYPE", "FILE_LIMIT_EXCEEDED", "INVALID_IMAGE":
		return c
	}
	return "MEDIA_UNAVAILABLE"
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
		// Owner decision: the inbox does not run a malware scan. Content type is verified by magic bytes
		// and files are opened inside the browser; non-renderable files are downloaded at the owner's risk.
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
		wantURL, _ := b["url"].(bool)
		if wantURL && s.inboundMediaKind(r.Context(), d, thread, id) == "video" {
			// Videos can be large: hand back the signed link now and let the browser stream it.
			link, linkErr := s.mediaCapability(d.Workspace, d.Environment, thread, id)
			if linkErr != nil {
				fail(w, 503, "MEDIA_ORIGIN_NOT_CONFIGURED")
				return
			}
			write(w, 200, map[string]any{"url": link, "mime": "video/mp4", "name": "video"})
			return
		}
		media, err := s.fetchInboundMedia(r.Context(), d, thread, id)
		if err != nil {
			fail(w, 503, inboxMediaFailureCode(err))
			return
		}
		w.Header().Set("Cache-Control", "private, no-store")
		if wantURL {
			link, err := s.mediaCapability(d.Workspace, d.Environment, thread, id)
			if err != nil {
				fail(w, 503, "MEDIA_ORIGIN_NOT_CONFIGURED")
				return
			}
			write(w, 200, map[string]any{"url": link, "mime": media.MIME, "name": media.Name})
		} else {
			write(w, 200, map[string]any{"data": base64.StdEncoding.EncodeToString(media.Data), "mime": media.MIME, "name": media.Name})
		}
		return
	}
	if wantURL, _ := b["url"].(bool); wantURL {
		// Large media (video) is fetched by the browser directly through a short-lived signed URL.
		link, linkErr := s.mediaCapability(d.Workspace, d.Environment, thread, id)
		if linkErr != nil {
			fail(w, 503, "MEDIA_ORIGIN_NOT_CONFIGURED")
			return
		}
		write(w, 200, map[string]any{"url": link, "mime": f.Mime, "name": f.Name})
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
	var data []byte
	if json.Unmarshal(raw, &f) != nil || f.Key == "" {
		media, fetchErr := s.fetchInboundMedia(r.Context(), mobileIdentity{Workspace: ws, Environment: e}, t, id)
		if fetchErr != nil {
			fail(w, 503, inboxMediaFailureCode(fetchErr))
			return
		}
		data, f.Mime, f.Name = media.Data, media.MIME, media.Name
	} else {
		data, err = objectRequest(r.Context(), "GET", f.Key, nil)
		if err != nil {
			fail(w, 503, "PRIVATE_STORAGE_UNAVAILABLE")
			return
		}
	}
	// The dashboard may inspect audio bytes to determine durations that metadata
	// alone does not expose. The signed URL remains the access capability.
	w.Header().Set("Access-Control-Allow-Origin", "https://briofold.tech")
	w.Header().Add("Vary", "Origin")
	w.Header().Set("Content-Type", f.Mime)
	disposition := "inline"
	if q.Get("download") == "1" {
		disposition = "attachment"
	}
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": f.Name}))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "sandbox")
	w.Header().Set("Cache-Control", "private, max-age=480")
	// ServeContent adds Range support so <video> can seek and stream.
	http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(data))
}
