package checkout

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
)

type inboxSendJob struct {
	ChannelGuard bool           `json:"channel_guard"`
	Broadcast    bool           `json:"broadcast"`
	ID           string         `json:"id"`
	Workspace    string         `json:"workspace_id"`
	Thread       string         `json:"thread_id"`
	Environment  string         `json:"environment"`
	Text         string         `json:"text"`
	Type         string         `json:"type"`
	Content      map[string]any `json:"content"`
	Reply        string         `json:"reply_provider_id"`
	Channel      string         `json:"channel"`
	Account      string         `json:"account"`
	Recipient    string         `json:"recipient"`
	Credential   string         `json:"credential"`
}

func str(m map[string]any, k string) string { v, _ := m[k].(string); return v }
func (s *Service) inboxSendPayload(ctx context.Context, j inboxSendJob, token, version string) (map[string]any, error) {
	kind := j.Type
	if kind == "" {
		kind = "text"
	}
	msg := map[string]any{"text": j.Text}
	payload := map[string]any{"recipient": map[string]string{"id": j.Recipient}, "message": msg, "messaging_type": "RESPONSE"}
	if j.Reply != "" && j.Channel == "ig" {
		msg["reply_to"] = map[string]string{"mid": j.Reply}
	}
	if kind == "reaction" {
		if j.Channel == "wa" {
			return map[string]any{"messaging_product": "whatsapp", "to": j.Recipient, "type": "reaction", "reaction": map[string]string{"message_id": str(j.Content, "provider_id"), "emoji": str(j.Content, "emoji")}}, nil
		}
		reaction := str(j.Content, "emoji")
		action := "react"
		if reaction == "" {
			action = "unreact"
		}
		if mapped, ok := map[string]string{"❤️": "love", "👍": "like", "😂": "laugh", "😮": "wow", "😢": "sad", "🙏": "love"}[reaction]; ok {
			reaction = mapped
		}
		return map[string]any{"recipient": map[string]string{"id": j.Recipient}, "sender_action": action, "payload": map[string]string{"message_id": str(j.Content, "provider_id"), "reaction": reaction}}, nil
	}
	if kind == "product" {
		price, _ := j.Content["price_minor"].(float64)
		// Provider-neutral product copy: native card uses the immutable catalog snapshot.
		msg["text"] = str(j.Content, "name") + "\n" + formatMinor(int64(price)) + " " + str(j.Content, "currency") + "\n" + str(j.Content, "sizes")
		if j.Channel != "wa" {
			element := map[string]any{"title": str(j.Content, "name"), "subtitle": formatMinor(int64(price)) + " " + str(j.Content, "currency") + " · " + str(j.Content, "sizes")}
			if id := str(j.Content, "image_media_id"); id != "" {
				link, err := s.mediaCapability(j.Workspace, j.Environment, j.Thread, id)
				if err != nil {
					return nil, err
				}
				element["image_url"] = link
			}
			payload["message"] = map[string]any{"attachment": map[string]any{"type": "template", "payload": map[string]any{"template_type": "generic", "elements": []any{element}}}}
		}
	} else if kind != "text" {
		if kind != "image" && kind != "audio" && kind != "document" {
			return nil, errors.New("UNSUPPORTED_MESSAGE")
		}
		if kind == "document" && j.Channel == "ig" {
			return nil, errors.New("UNSUPPORTED_MESSAGE")
		}
		link, err := s.mediaCapability(j.Workspace, j.Environment, j.Thread, str(j.Content, "media_id"))
		if err != nil {
			return nil, err
		}
		attachmentType := kind
		if kind == "document" {
			attachmentType = "file"
		}
		msg = map[string]any{"attachment": map[string]any{"type": attachmentType, "payload": map[string]any{"url": link}}}
		payload["message"] = msg
		if j.Channel == "wa" {
			// Upload actual bytes to Meta, then address the resulting Media ID in Send API.
			var raw []byte
			err = s.Pipeline.Control.QueryRow(ctx, "SELECT inbox_media_access($1::uuid,$2,$3::uuid,$4::uuid)", j.Workspace, j.Environment, j.Thread, str(j.Content, "media_id")).Scan(&raw)
			if err != nil {
				return nil, err
			}
			var f struct {
				Key  string `json:"object_key"`
				Mime string `json:"mime"`
				Name string `json:"name"`
			}
			if json.Unmarshal(raw, &f) != nil || f.Key == "" {
				return nil, errors.New("MEDIA_UNAVAILABLE")
			}
			data, err := objectRequest(ctx, "GET", f.Key, nil)
			if err != nil {
				return nil, err
			}
			var buffer bytes.Buffer
			form := multipart.NewWriter(&buffer)
			_ = form.WriteField("messaging_product", "whatsapp")
			_ = form.WriteField("type", f.Mime)
			header := textproto.MIMEHeader{}
			header.Set("Content-Disposition", `form-data; name="file"; filename="attachment"`)
			header.Set("Content-Type", f.Mime)
			part, err := form.CreatePart(header)
			if err != nil {
				return nil, err
			}
			_, _ = part.Write(data)
			_ = form.Close()
			req, _ := http.NewRequestWithContext(ctx, "POST", "https://graph.facebook.com/"+version+"/"+url.PathEscape(j.Account)+"/media", &buffer)
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", form.FormDataContentType())
			res, err := inboxHTTP.Do(req)
			if err != nil {
				return nil, errors.New("MEDIA_UPLOAD_UNAVAILABLE")
			}
			defer res.Body.Close()
			var result struct {
				ID string `json:"id"`
			}
			if res.StatusCode < 200 || res.StatusCode >= 300 || json.NewDecoder(io.LimitReader(res.Body, 65536)).Decode(&result) != nil || result.ID == "" {
				return nil, errors.New("MEDIA_UPLOAD_REJECTED")
			}
			media := map[string]string{"id": result.ID}
			if kind == "document" {
				media["filename"] = f.Name
			}
			payload = map[string]any{"messaging_product": "whatsapp", "to": j.Recipient, "type": kind, kind: media}
			if j.Reply != "" {
				payload["context"] = map[string]string{"message_id": j.Reply}
			}
			return payload, nil
		}
	}
	if j.Channel == "wa" {
		payload = map[string]any{"messaging_product": "whatsapp", "to": j.Recipient, "type": "text", "text": map[string]any{"body": msg["text"]}}
		if j.Reply != "" {
			payload["context"] = map[string]string{"message_id": j.Reply}
		}
	}
	return payload, nil
}
func formatMinor(v int64) string { return fmt.Sprintf("%d.%02d", v/100, v%100) }
