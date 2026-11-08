package checkout

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/masharzy/briofold/backend/internal/deviceevidence"
	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type inboxIncomingMedia struct {
	Account, Message, Sender, Kind, URL, ProviderID, Mime, Filename, Caption, StickerID string
	At                                                                                  time.Time
}

func parseInboxMedia(raw []byte) []inboxIncomingMedia {
	var root map[string]any
	if json.Unmarshal(raw, &root) != nil {
		return nil
	}
	var out []inboxIncomingMedia
	rows := func(v any) []any { x, _ := v.([]any); return x }
	obj := func(v any) map[string]any { x, _ := v.(map[string]any); return x }
	for _, entry := range rows(root["entry"]) {
		e := obj(entry)
		for _, message := range rows(e["messaging"]) {
			m := obj(message)
			msg := obj(m["message"])
			if msg["is_echo"] == true {
				continue
			}
			seenSticker := map[string]bool{}
			for index, attachment := range rows(msg["attachments"]) {
				a := obj(attachment)
				stickerID := mediaStickerID(obj(a["payload"])["sticker_id"])
				if stickerID != "" {
					if seenSticker[stickerID] {
						continue
					}
					seenSticker[stickerID] = true
				}
				kind := str(a, "type")
				if kind == "sticker" {
					kind = "image"
				}
				if kind == "file" {
					kind = "document"
				}
				if kind != "image" && kind != "audio" && kind != "video" && kind != "document" {
					continue
				}
				id := str(msg, "mid")
				if index > 0 {
					id += "/" + strconv.Itoa(index)
				}
				stamp, _ := m["timestamp"].(float64)
				out = append(out, inboxIncomingMedia{Account: str(e, "id"), Message: id, Sender: str(obj(m["sender"]), "id"), Kind: kind, Caption: str(msg, "text"), URL: str(obj(a["payload"]), "url"), StickerID: mediaStickerID(obj(a["payload"])["sticker_id"]), At: time.UnixMilli(int64(stamp))})
			}
		}
		for _, change := range rows(e["changes"]) {
			v := obj(obj(change)["value"])
			for _, message := range rows(v["messages"]) {
				m := obj(message)
				kind := str(m, "type")
				if kind != "image" && kind != "audio" && kind != "video" && kind != "document" && kind != "sticker" {
					continue
				}
				media := obj(m[kind])
				if kind == "sticker" {
					kind = "image" // WhatsApp stickers are WebP images
				}
				sec, err := strconv.ParseInt(str(m, "timestamp"), 10, 64)
				if err != nil {
					continue
				}
				out = append(out, inboxIncomingMedia{Account: str(obj(v["metadata"]), "phone_number_id"), Message: str(m, "id"), Sender: str(m, "from"), Kind: kind, Caption: str(media, "caption"), ProviderID: str(media, "id"), Mime: str(media, "mime_type"), Filename: str(media, "filename"), At: time.Unix(sec, 0)})
			}
		}
	}
	return out
}

type inboxIncomingReaction struct {
	Account, Message, Sender, Emoji string
	At                              time.Time
}

func parseInboxReactions(raw []byte) []inboxIncomingReaction {
	var root map[string]any
	if json.Unmarshal(raw, &root) != nil {
		return nil
	}
	rows := func(v any) []any { x, _ := v.([]any); return x }
	obj := func(v any) map[string]any { x, _ := v.(map[string]any); return x }
	var out []inboxIncomingReaction
	for _, entry := range rows(root["entry"]) {
		e := obj(entry)
		for _, message := range rows(e["messaging"]) {
			m := obj(message)
			r := obj(m["reaction"])
			if str(r, "mid") == "" {
				continue
			}
			emoji := str(r, "emoji")
			if emoji == "" {
				emoji = map[string]string{"love": "❤️", "like": "👍", "laugh": "😂", "wow": "😮", "sad": "😢", "angry": "😠"}[str(r, "reaction")]
			}
			if str(r, "action") == "unreact" {
				emoji = ""
			}
			stamp, _ := m["timestamp"].(float64)
			out = append(out, inboxIncomingReaction{str(e, "id"), str(r, "mid"), str(obj(m["sender"]), "id"), emoji, time.UnixMilli(int64(stamp))})
		}
		for _, change := range rows(e["changes"]) {
			v := obj(obj(change)["value"])
			for _, message := range rows(v["messages"]) {
				m := obj(message)
				if str(m, "type") != "reaction" {
					continue
				}
				r := obj(m["reaction"])
				sec, err := strconv.ParseInt(str(m, "timestamp"), 10, 64)
				if err != nil {
					continue
				}
				out = append(out, inboxIncomingReaction{str(obj(v["metadata"]), "phone_number_id"), str(r, "message_id"), str(m, "from"), str(r, "emoji"), time.Unix(sec, 0)})
			}
		}
	}
	return out
}
func (s *Service) persistInboxMedia(ctx context.Context, tx pgx.Tx, provider string, raw []byte) error {
	for _, m := range parseInboxMedia(raw) {
		var conn, ws string
		var token []byte
		err := tx.QueryRow(ctx, "SELECT * FROM inbox_provider_connections($1,$2)", provider, m.Account).Scan(&conn, &ws, &token)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		ref, _ := json.Marshal(map[string]string{"url": m.URL, "provider_id": m.ProviderID, "mime": m.Mime, "name": m.Filename, "caption": m.Caption, "sticker_id": m.StickerID, "message_id": m.Message})
		cipher, err := deviceevidence.Encrypt(s.Pipeline.Key, ref, ws+"|inbox-source")
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "SELECT inbox_inbound_media($1::uuid,$2,$3,'',$4,$5,$6)", conn, m.Message, m.Sender, m.Kind, cipher, m.At)
		if err != nil {
			return err
		}
	}
	for _, reaction := range parseInboxReactions(raw) {
		var conn, ws string
		var token []byte
		err := tx.QueryRow(ctx, "SELECT * FROM inbox_provider_connections($1,$2)", provider, reaction.Account).Scan(&conn, &ws, &token)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "SELECT inbox_provider_reaction($1::uuid,$2,$3,$4,$5)", conn, reaction.Message, reaction.Sender, reaction.Emoji, reaction.At)
		if err != nil {
			return err
		}
	}

	return nil
}
func safeMetaMediaURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return false
	}
	h := strings.ToLower(u.Hostname())
	for _, suffix := range []string{"fbcdn.net", "fbsbx.com", "cdninstagram.com"} {
		if h == suffix || strings.HasSuffix(h, "."+suffix) {
			return true
		}
	}
	return false
}

func mediaStickerID(value any) string {
	switch id := value.(type) {
	case string:
		return id
	case float64:
		return strconv.FormatInt(int64(id), 10)
	default:
		return ""
	}
}

type inboxDownload struct {
	Data []byte
	MIME string
	Name string
}

func (s *Service) fetchInboundMedia(ctx context.Context, d mobileIdentity, t, id string) (inboxDownload, error) {
	var raw []byte
	if err := s.Pipeline.Control.QueryRow(ctx, "SELECT inbox_media_source($1::uuid,$2,$3::uuid,$4::uuid)", d.Workspace, d.Environment, t, id).Scan(&raw); err != nil {
		return inboxDownload{}, err
	}
	var src map[string]any
	if json.Unmarshal(raw, &src) != nil || str(src, "reference") == "" {
		return inboxDownload{}, errors.New("MEDIA_UNAVAILABLE")
	}
	cipher, err := base64.StdEncoding.DecodeString(str(src, "reference"))
	if err != nil {
		return inboxDownload{}, err
	}
	data, err := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, d.Workspace+"|inbox-source")
	if err != nil {
		return inboxDownload{}, err
	}
	var ref map[string]string
	if json.Unmarshal(data, &ref) != nil {
		return inboxDownload{}, errors.New("MEDIA_UNAVAILABLE")
	}
	credential, err := base64.StdEncoding.DecodeString(str(src, "credential"))
	if err != nil {
		return inboxDownload{}, err
	}
	token, err := merchantwebhook.Decrypt(s.Pipeline.Key, credential, d.Workspace+"|inbox|"+str(src, "provider")+"|"+str(src, "account"))
	if err != nil {
		return inboxDownload{}, err
	}
	mediaURL := ref["url"]
	if ref["message_id"] == "" {
		ref["message_id"] = str(src, "provider_message_id")
	}
	if str(src, "provider") == "tg" {
		var file struct {
			Path string `json:"file_path"`
		}
		if ref["provider_id"] == "" || telegramCall(ctx, string(token), "getFile", map[string]string{"file_id": ref["provider_id"]}, &file) != nil || !telegramFilePath.MatchString(file.Path) {
			return inboxDownload{}, errors.New("MEDIA_EXPIRED_OR_UNAVAILABLE")
		}
		mediaURL = "https://api.telegram.org/file/bot" + string(token) + "/" + file.Path
	}
	if str(src, "provider") == "wa" {
		cfg, _ := s.channelConfig(ctx)
		version := cfg["META_GRAPH_VERSION"]
		if !strings.HasPrefix(version, "v") || strings.ContainsAny(version, "/?#") {
			return inboxDownload{}, errors.New("CHANNEL_NOT_CONFIGURED")
		}
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://graph.facebook.com/"+version+"/"+url.PathEscape(ref["provider_id"]), nil)
		req.Header.Set("Authorization", "Bearer "+string(token))
		res, err := inboxHTTP.Do(req)
		if err != nil {
			return inboxDownload{}, err
		}
		var result struct {
			URL string `json:"url"`
		}
		err = json.NewDecoder(io.LimitReader(res.Body, 65536)).Decode(&result)
		res.Body.Close()
		if err != nil || res.StatusCode != 200 {
			return inboxDownload{}, errors.New("MEDIA_UNAVAILABLE")
		}
		mediaURL = result.URL
	}
	if str(src, "provider") != "tg" && !safeMetaMediaURL(mediaURL) {
		return inboxDownload{}, errors.New("MEDIA_HOST_DENIED")
	}
	download := func() (*http.Response, error) {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
		if err != nil {
			return nil, err
		}
		if str(src, "provider") == "wa" {
			request.Header.Set("Authorization", "Bearer "+string(token))
		}
		return inboxHTTP.Do(request)
	}
	res, err := download()
	if err != nil {
		return inboxDownload{}, err
	}
	if (res.StatusCode == 403 || res.StatusCode == 404 || res.StatusCode == 410) && (str(src, "provider") == "ms" || str(src, "provider") == "ig") {
		res.Body.Close()
		cfg, _ := s.channelConfig(ctx)
		parts := strings.Split(ref["message_id"], "/")
		index := 0
		if len(parts) > 1 {
			index, _ = strconv.Atoi(parts[len(parts)-1])
		}
		var message struct {
			Attachments struct {
				Data []struct {
					Image struct {
						URL     string `json:"url"`
						Sticker bool   `json:"render_as_sticker"`
					} `json:"image_data"`
					Video struct {
						URL string `json:"url"`
					} `json:"video_data"`
					FileURL string `json:"file_url"`
				} `json:"data"`
			} `json:"attachments"`
		}
		request, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://graph.facebook.com", nil)
		if parts[0] == "" || index < 0 || !graphVersionPattern.MatchString(cfg["META_GRAPH_VERSION"]) || metaGet(request, cfg["META_GRAPH_VERSION"], url.PathEscape(parts[0])+"?fields=attachments{image_data,video_data,file_url}", string(token), &message) != nil || index >= len(message.Attachments.Data) {
			return inboxDownload{}, errors.New("MEDIA_REFRESH_UNAVAILABLE")
		}
		item := message.Attachments.Data[index]
		mediaURL = item.Image.URL
		if mediaURL == "" {
			mediaURL = item.Video.URL
		}
		if mediaURL == "" {
			mediaURL = item.FileURL
		}
		if !safeMetaMediaURL(mediaURL) {
			return inboxDownload{}, errors.New("MEDIA_HOST_DENIED")
		}
		ref["url"] = mediaURL
		if item.Image.Sticker {
			ref["sticker_id"] = "meta-sticker"
		}
		encoded, _ := json.Marshal(ref)
		encrypted, encryptErr := deviceevidence.Encrypt(s.Pipeline.Key, encoded, d.Workspace+"|inbox-source")
		if encryptErr != nil {
			return inboxDownload{}, encryptErr
		}
		if _, err = s.Pipeline.Control.Exec(ctx, "SELECT inbox_source_metadata($1::uuid,$2::uuid,$3::uuid,$4,$5)", d.Workspace, t, id, encrypted, ref["sticker_id"] != ""); err != nil {
			return inboxDownload{}, err
		}
		res, err = download()
		if err != nil {
			return inboxDownload{}, err
		}
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return inboxDownload{}, errors.New("MEDIA_EXPIRED_OR_UNAVAILABLE")
	}
	data, err = io.ReadAll(io.LimitReader(res.Body, inboxInboundLimit+1))
	if err != nil {
		return inboxDownload{}, err
	}
	// Providers send e.g. "audio/ogg; codecs=opus": compare the bare type only.
	declared := strings.ToLower(strings.TrimSpace(strings.Split(ref["mime"], ";")[0]))
	if declared == "" && str(src, "kind") == "audio" {
		declared = strings.ToLower(strings.TrimSpace(strings.Split(res.Header.Get("Content-Type"), ";")[0]))
	}
	if str(src, "kind") == "audio" && len(data) > 12 && string(data[4:8]) == "ftyp" {
		declared = "audio/mp4" // voice notes in an MP4/M4A container
	}
	var typ string
	if str(src, "kind") == "video" {
		typ, err = validateInboundVideo(data)
	} else {
		typ, err = validateInboxMediaMax(data, declared, inboxInboundLimit)
	}
	if err != nil && err.Error() == "UNSUPPORTED_FILE_TYPE" && str(src, "kind") == "document" && len(data) > 0 && len(data) <= inboxInboundLimit {
		// Unknown document formats are stored as opaque bytes; the owner downloads them at their own risk.
		typ, err = "application/octet-stream", nil
	}
	if err != nil {
		return inboxDownload{}, err
	}
	if ref["sticker_id"] != "" {
		encoded, _ := json.Marshal(ref)
		encrypted, err := deviceevidence.Encrypt(s.Pipeline.Key, encoded, d.Workspace+"|inbox-source")
		if err != nil {
			return inboxDownload{}, err
		}
		if _, err = s.Pipeline.Control.Exec(ctx, "SELECT inbox_source_metadata($1::uuid,$2::uuid,$3::uuid,$4,true)", d.Workspace, t, id, encrypted); err != nil {
			return inboxDownload{}, err
		}
	}
	name := ref["name"]
	if name == "" {
		name = "attachment"
	}
	return inboxDownload{Data: data, MIME: typ, Name: name}, nil
}

// inboundMediaKind returns the stored attachment kind (image/audio/video/document) or "" if unknown.
func (s *Service) inboundMediaKind(ctx context.Context, d mobileIdentity, t, id string) string {
	var raw []byte
	if s.Pipeline.Control.QueryRow(ctx, "SELECT inbox_media_source($1::uuid,$2,$3::uuid,$4::uuid)", d.Workspace, d.Environment, t, id).Scan(&raw) != nil {
		return ""
	}
	var src map[string]any
	if json.Unmarshal(raw, &src) != nil {
		return ""
	}
	return str(src, "kind")
}
