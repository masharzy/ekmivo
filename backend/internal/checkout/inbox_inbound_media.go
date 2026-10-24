package checkout

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type inboxIncomingMedia struct {
	Account, Message, Sender, Kind, URL, ProviderID, Mime, Filename string
	At                                                              time.Time
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
			for index, attachment := range rows(msg["attachments"]) {
				a := obj(attachment)
				kind := str(a, "type")
				if kind == "file" {
					kind = "document"
				}
				if kind != "image" && kind != "audio" && kind != "document" {
					continue
				}
				id := str(msg, "mid")
				if index > 0 {
					id += "/" + strconv.Itoa(index)
				}
				stamp, _ := m["timestamp"].(float64)
				out = append(out, inboxIncomingMedia{Account: str(e, "id"), Message: id, Sender: str(obj(m["sender"]), "id"), Kind: kind, URL: str(obj(a["payload"]), "url"), At: time.UnixMilli(int64(stamp))})
			}
		}
		for _, change := range rows(e["changes"]) {
			v := obj(obj(change)["value"])
			for _, message := range rows(v["messages"]) {
				m := obj(message)
				kind := str(m, "type")
				if kind != "image" && kind != "audio" && kind != "document" {
					continue
				}
				media := obj(m[kind])
				sec, err := strconv.ParseInt(str(m, "timestamp"), 10, 64)
				if err != nil {
					continue
				}
				out = append(out, inboxIncomingMedia{Account: str(obj(v["metadata"]), "phone_number_id"), Message: str(m, "id"), Sender: str(m, "from"), Kind: kind, ProviderID: str(media, "id"), Mime: str(media, "mime_type"), Filename: str(media, "filename"), At: time.Unix(sec, 0)})
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
		ref, _ := json.Marshal(map[string]string{"url": m.URL, "provider_id": m.ProviderID, "mime": m.Mime, "name": m.Filename})
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
	for _, suffix := range []string{"fbcdn.net", "fbsbx.com"} {
		if h == suffix || strings.HasSuffix(h, "."+suffix) {
			return true
		}
	}
	return false
}
func (s *Service) hydrateInboxMedia(ctx context.Context, d mobileIdentity, t, id string) error {
	var raw []byte
	if err := s.Pipeline.Control.QueryRow(ctx, "SELECT inbox_media_source($1::uuid,$2,$3::uuid,$4::uuid)", d.Workspace, d.Environment, t, id).Scan(&raw); err != nil {
		return err
	}
	var src map[string]any
	if json.Unmarshal(raw, &src) != nil || str(src, "reference") == "" {
		return errors.New("MEDIA_UNAVAILABLE")
	}
	cipher, err := base64.StdEncoding.DecodeString(str(src, "reference"))
	if err != nil {
		return err
	}
	data, err := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, d.Workspace+"|inbox-source")
	if err != nil {
		return err
	}
	var ref map[string]string
	if json.Unmarshal(data, &ref) != nil {
		return errors.New("MEDIA_UNAVAILABLE")
	}
	credential, err := base64.StdEncoding.DecodeString(str(src, "credential"))
	if err != nil {
		return err
	}
	token, err := merchantwebhook.Decrypt(s.Pipeline.Key, credential, d.Workspace+"|inbox|"+str(src, "provider")+"|"+str(src, "account"))
	if err != nil {
		return err
	}
	mediaURL := ref["url"]
	if str(src, "provider") == "wa" {
		cfg, _ := s.channelConfig(ctx)
		version := cfg["META_GRAPH_VERSION"]
		if !strings.HasPrefix(version, "v") || strings.ContainsAny(version, "/?#") {
			return errors.New("CHANNEL_NOT_CONFIGURED")
		}
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://graph.facebook.com/"+version+"/"+url.PathEscape(ref["provider_id"]), nil)
		req.Header.Set("Authorization", "Bearer "+string(token))
		res, err := inboxHTTP.Do(req)
		if err != nil {
			return err
		}
		var result struct {
			URL string `json:"url"`
		}
		err = json.NewDecoder(io.LimitReader(res.Body, 65536)).Decode(&result)
		res.Body.Close()
		if err != nil || res.StatusCode != 200 {
			return errors.New("MEDIA_UNAVAILABLE")
		}
		mediaURL = result.URL
	}
	if !safeMetaMediaURL(mediaURL) {
		return errors.New("MEDIA_HOST_DENIED")
	}
	req, _ := http.NewRequestWithContext(ctx, "GET", mediaURL, nil)
	if str(src, "provider") == "wa" {
		req.Header.Set("Authorization", "Bearer "+string(token))
	}
	res, err := inboxHTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return errors.New("MEDIA_EXPIRED_OR_UNAVAILABLE")
	}
	data, err = io.ReadAll(io.LimitReader(res.Body, inboxMediaLimit+1))
	if err != nil {
		return err
	}
	declared := ref["mime"]
	if declared == "" && str(src, "kind") == "audio" {
		declared = strings.Split(res.Header.Get("Content-Type"), ";")[0]
	}
	typ, err := validateInboxMedia(data, declared)
	if err != nil {
		return err
	}
	if scanFile(ctx, data) != nil {
		return errors.New("FILE_SCAN_UNCONFIRMED")
	}
	hash := sha256.Sum256(data)
	key := "inbox/" + d.Environment + "/" + d.Workspace + "/" + id + "/" + hex.EncodeToString(hash[:])
	if _, err = objectRequest(ctx, "PUT", key, data); err != nil {
		return err
	}
	name := ref["name"]
	if name == "" {
		name = "attachment"
	}
	_, err = s.Pipeline.Control.Exec(ctx, "SELECT inbox_inbound_store($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8)", d.Workspace, t, id, key, name, typ, len(data), hex.EncodeToString(hash[:]))
	return err
}
