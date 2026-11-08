package checkout

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/masharzy/briofold/backend/internal/authz"
	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
	"golang.org/x/sync/singleflight"
)

type inboxAvatarEntry struct {
	data    []byte
	mime    string
	expires time.Time
}

var inboxAvatars = struct {
	sync.Mutex
	items map[string]inboxAvatarEntry
	bytes int
}{items: map[string]inboxAvatarEntry{}}
var inboxAvatarFlights singleflight.Group

func (s *Service) HandleInboxAvatar(w http.ResponseWriter, r *http.Request) {
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "INBOX_UNAVAILABLE")
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
	ws, realm, thread := r.PathValue("workspaceID"), explicitRealm(r), r.PathValue("threadID")
	if !uuidPattern.MatchString(thread) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	actor, err := s.Auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		authError(w, err)
		return
	}
	if _, err = s.Auth.AuthorizeWorkspace(r.Context(), actor, ws, authz.Environment(realm), authz.InboxRead); err != nil {
		authError(w, err)
		return
	}
	if err = s.inboxChannelScope(r.Context(), ws, realm, actor.UserID, thread, "read", ""); err != nil {
		inboxWorkFailure(w, err)
		return
	}
	// Reauthorize even a cached avatar, including disconnected channels.
	var raw []byte
	if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_avatar_source($1::uuid,$2,$3::uuid)", ws, realm, thread).Scan(&raw); err != nil {
		fail(w, 404, "NOT_FOUND")
		return
	}
	key := ws + "|" + realm + "|" + thread
	inboxAvatars.Lock()
	entry, ok := inboxAvatars.items[key]
	inboxAvatars.Unlock()
	if !ok || time.Now().After(entry.expires) {
		value, _, _ := inboxAvatarFlights.Do(key, func() (any, error) {
			ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
			defer cancel()
			data, mime, _ := s.fetchInboxAvatar(ctx, ws, raw)
			ttl := time.Hour
			if len(data) == 0 {
				ttl = 5 * time.Minute
			}
			fresh := inboxAvatarEntry{data, mime, time.Now().Add(ttl)}
			inboxAvatars.Lock()
			if old, ok := inboxAvatars.items[key]; ok {
				inboxAvatars.bytes -= len(old.data)
				delete(inboxAvatars.items, key)
			}
			for k, v := range inboxAvatars.items {
				if time.Now().After(v.expires) {
					inboxAvatars.bytes -= len(v.data)
					delete(inboxAvatars.items, k)
				}
			}
			for len(inboxAvatars.items) >= 128 || inboxAvatars.bytes+len(data) > 32*1024*1024 {
				for k, v := range inboxAvatars.items {
					inboxAvatars.bytes -= len(v.data)
					delete(inboxAvatars.items, k)
					break
				}
			}
			inboxAvatars.items[key] = fresh
			inboxAvatars.bytes += len(data)
			inboxAvatars.Unlock()
			return fresh, nil
		})
		entry = value.(inboxAvatarEntry)
	}
	if len(entry.data) == 0 {
		fail(w, 404, "PHOTO_UNAVAILABLE")
		return
	}
	w.Header().Set("Content-Type", entry.mime)
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Length", strconv.Itoa(len(entry.data)))
	_, _ = w.Write(entry.data)
}
func (s *Service) fetchInboxAvatar(ctx context.Context, workspace string, raw []byte) ([]byte, string, error) {
	var src map[string]string
	if json.Unmarshal(raw, &src) != nil {
		return nil, "", errors.New("PHOTO_UNAVAILABLE")
	}
	credential, err := base64.StdEncoding.DecodeString(src["credential"])
	if err != nil {
		return nil, "", err
	}
	token, err := merchantwebhook.Decrypt(s.Pipeline.Key, credential, workspace+"|inbox|"+src["provider"]+"|"+src["account"])
	if err != nil {
		return nil, "", err
	}
	mediaURL := ""
	switch src["provider"] {
	case "tg":
		id, err := strconv.ParseInt(src["customer"], 10, 64)
		if err != nil || id <= 0 {
			return nil, "", errors.New("PHOTO_UNAVAILABLE")
		}
		var photos struct {
			Photos [][]telegramMediaFile `json:"photos"`
		}
		if telegramCall(ctx, string(token), "getUserProfilePhotos", map[string]any{"user_id": id, "limit": 1}, &photos) != nil || len(photos.Photos) == 0 || len(photos.Photos[0]) == 0 {
			return nil, "", errors.New("PHOTO_UNAVAILABLE")
		}
		var file struct {
			Path string `json:"file_path"`
		}
		// The first size is sufficient for a compact avatar and avoids large downloads.
		if telegramCall(ctx, string(token), "getFile", map[string]string{"file_id": photos.Photos[0][0].ID}, &file) != nil || !telegramFilePath.MatchString(file.Path) {
			return nil, "", errors.New("PHOTO_UNAVAILABLE")
		}
		mediaURL = "https://api.telegram.org/file/bot" + string(token) + "/" + file.Path
	case "ms", "ig":
		cfg, _ := s.channelConfig(ctx)
		version := cfg["META_GRAPH_VERSION"]
		if !graphVersionPattern.MatchString(version) {
			return nil, "", errors.New("PHOTO_UNAVAILABLE")
		}
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://graph.facebook.com/"+version+"/"+url.PathEscape(src["customer"])+"?fields=profile_pic", nil)
		req.Header.Set("Authorization", "Bearer "+string(token))
		res, err := inboxHTTP.Do(req)
		if err != nil {
			return nil, "", errors.New("PHOTO_UNAVAILABLE")
		}
		var profile struct {
			Picture string `json:"profile_pic"`
		}
		err = json.NewDecoder(io.LimitReader(res.Body, 65536)).Decode(&profile)
		res.Body.Close()
		if err != nil || res.StatusCode != 200 || !safeMetaMediaURL(profile.Picture) {
			return nil, "", errors.New("PHOTO_UNAVAILABLE")
		}
		mediaURL = profile.Picture
	default:
		return nil, "", errors.New("PHOTO_UNAVAILABLE")
	}
	// Redirects remain disabled; never send a channel credential to an arbitrary host.
	req, _ := http.NewRequestWithContext(ctx, "GET", mediaURL, nil)
	res, err := inboxHTTP.Do(req)
	if err != nil {
		return nil, "", errors.New("PHOTO_UNAVAILABLE")
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 5*1024*1024+1))
	typ := http.DetectContentType(data)
	if err != nil || res.StatusCode != 200 || len(data) > 5*1024*1024 || !strings.HasPrefix(typ, "image/") || typ == "image/svg+xml" {
		return nil, "", errors.New("PHOTO_UNAVAILABLE")
	}
	return data, typ, nil
}
