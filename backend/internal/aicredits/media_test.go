package aicredits

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestMediaProviderWireAndUsage(t *testing.T) {
	for _, kind := range []string{"image", "audio", "video"} {
		t.Run(kind, func(t *testing.T) {
			mime := map[string]string{"image": "image/png", "audio": "audio/wav", "video": "video/mp4"}[kind]
			a := Media{Kind: kind, MIME: mime, Data: base64.StdEncoding.EncodeToString([]byte("fixture media"))}
			p := NewOpenRouter("fixture-key")
			p.client.Transport = routerTransport(func(r *http.Request) (*http.Response, error) {
				var body struct {
					Messages []struct {
						Role    string          `json:"role"`
						Content json.RawMessage `json:"content"`
					} `json:"messages"`
				}
				if json.NewDecoder(r.Body).Decode(&body) != nil {
					t.Fatal("invalid JSON")
				}
				var parts []map[string]any
				if len(body.Messages) != 1 || json.Unmarshal(body.Messages[0].Content, &parts) != nil || len(parts) != 2 {
					t.Fatal("media was silently dropped")
				}
				expected := map[string]string{"image": "image_url", "audio": "input_audio", "video": "video_url"}[kind]
				if parts[1]["type"] != expected {
					t.Fatal(parts)
				}
				encoded, _ := json.Marshal(parts)
				if strings.Contains(string(encoded), "api.telegram.org") || strings.Contains(string(encoded), "fixture-key") {
					t.Fatal("channel credential leaked")
				}
				if !strings.Contains(string(encoded), a.Data) {
					t.Fatal("media bytes missing")
				}
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"id":"media-fixture","model":"qwen/qwen3.8-omni-flash","choices":[{"message":{"content":"ছবিতে একটি ফুল আছে।"}}],"usage":{"prompt_tokens":1200,"completion_tokens":20}}`)), Header: http.Header{}}, nil
			})
			out, err := p.Generate(context.Background(), "qwen/qwen3.8-omni-flash", 100, []Message{{Role: "user", Content: "Describe", Media: []Media{a}}})
			if err != nil || out.Usage.InputTokens != 1200 || out.Text == "" {
				t.Fatal(out, err)
			}
		})
	}
}
func TestMediaRejectsUnsupportedModelAndMalformedInput(t *testing.T) {
	a := Media{Kind: "audio", MIME: "audio/wav", Data: base64.StdEncoding.EncodeToString([]byte("fixture"))}
	if _, err := providerMessages("text/model", []Message{{Role: "user", Content: "hello", Media: []Media{a}}}); err == nil {
		t.Fatal("text-only model accepted media")
	}
	for _, m := range []Message{{Role: "system", Content: "hello", Media: []Media{a}}, {Role: "user", Content: "hello", Media: []Media{a, a}}, {Role: "user", Content: "hello", Media: []Media{{Kind: "audio", MIME: "audio/wav", Data: "bad!"}}}} {
		if _, err := providerMessages("qwen/qwen3.8-omni-flash", []Message{m}); err == nil {
			t.Fatal("unsafe media accepted")
		}
	}
	// Raw base64 for OpenRouter, data URI for direct Qwen: these differ upstream.
	wire, err := providerMessages("qwen3.5-omni-flash", []Message{{Role: "user", Content: "hello", Media: []Media{a}}})
	raw, _ := json.Marshal(wire)
	if err != nil || !strings.Contains(string(raw), "data:audio/wav;base64,") {
		t.Fatal(string(raw), err)
	}
}
func TestMediaFingerprintIncludesBytesAndReservationBound(t *testing.T) {
	r := Request{Workspace: "00000000-0000-0000-0000-000000000001", Actor: "00000000-0000-0000-0000-000000000002", Key: "media-fixture-123456", Model: "qwen/qwen3.8-omni-flash", Messages: []Message{{Role: "user", Content: "describe", Media: []Media{{Kind: "image", MIME: "image/png", Data: base64.StdEncoding.EncodeToString([]byte("first"))}}}}}
	first, bound, err := r.fingerprint()
	if err != nil || bound < 4096 {
		t.Fatal(bound, err)
	}
	r.Messages[0].Media[0].Data = base64.StdEncoding.EncodeToString([]byte("second"))
	second, _, err := r.fingerprint()
	if err != nil || second == first {
		t.Fatal("media missing from idempotency identity")
	}
}
