package aicredits

import (
	"encoding/base64"
	"strings"
)

// Media is private, server-fetched input. Provider URLs and channel credentials
// must never be placed in it. Bytes live only for this bounded execution.
type Media struct {
	Kind string `json:"kind"`
	MIME string `json:"mime"`
	Data string `json:"data"`
}

const MaxMediaBytes = 8 * 1024 * 1024

func (m Media) inputBound() (int64, error) {
	if len(m.Data) == 0 || len(m.Data) > base64.StdEncoding.EncodedLen(MaxMediaBytes) {
		return 0, ErrInvalidRequest
	}
	b, err := base64.StdEncoding.Strict().DecodeString(m.Data)
	if err != nil || len(b) == 0 || len(b) > MaxMediaBytes {
		return 0, ErrInvalidRequest
	}
	switch {
	case m.Kind == "image" && (m.MIME == "image/jpeg" || m.MIME == "image/png"):
		return 4096, nil
	case m.Kind == "audio" && m.MIME == "audio/wav":
		return 8192, nil
	case m.Kind == "video" && m.MIME == "video/mp4":
		return 8192, nil
	}
	return 0, ErrInvalidRequest
}
func mediaModel(model string) bool {
	return model == "qwen/qwen3.8-omni-flash" || model == "qwen3.5-omni-flash" || strings.HasPrefix(model, "qwen3.5-omni-flash-")
}

// Text-only wire requests retain their original shape. Multimedia uses the
// OpenAI-compatible content array supported by both configured omni providers.
func providerMessages(model string, messages []Message) ([]map[string]any, error) {
	out := make([]map[string]any, 0, len(messages))
	for _, m := range messages {
		row := map[string]any{"role": m.Role, "content": m.Content}
		if len(m.Media) > 0 {
			if !mediaModel(model) || m.Role != "user" || len(m.Media) > 1 {
				return nil, ErrRejected
			}
			parts := []any{map[string]any{"type": "text", "text": m.Content}}
			for _, a := range m.Media {
				if _, err := a.inputBound(); err != nil {
					return nil, ErrRejected
				}
				switch a.Kind {
				case "image":
					parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]string{"url": "data:" + a.MIME + ";base64," + a.Data}})
				case "audio":
					audioData := a.Data
					if !strings.Contains(model, "/") {
						audioData = "data:audio/wav;base64," + audioData
					}
					parts = append(parts, map[string]any{"type": "input_audio", "input_audio": map[string]string{"data": audioData, "format": "wav"}})
				case "video":
					parts = append(parts, map[string]any{"type": "video_url", "video_url": map[string]string{"url": "data:video/mp4;base64," + a.Data}})
				}
			}
			row["content"] = parts
		}
		out = append(out, row)
	}
	return out, nil
}
