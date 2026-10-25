package checkout

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/masharzy/ekmivo/backend/internal/aicredits"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
)

func fixtureStudioImage(t *testing.T) []byte {
	t.Helper()
	var b bytes.Buffer
	if png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 24, 24))) != nil {
		t.Fatal("fixture encode")
	}
	return b.Bytes()
}
func TestStudioMediaDecodesRealFormats(t *testing.T) {
	ctx := context.Background()
	if _, err := prepareStudioMedia(ctx, "image", fixtureStudioImage(t)); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"audio", "video"} {
		t.Run(kind, func(t *testing.T) {
			if _, err := os.Stat("/usr/bin/ffmpeg"); err != nil {
				t.Skip("ffmpeg runtime required")
			}
			dest := filepath.Join(t.TempDir(), "fixture.wav")
			args := []string{"-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1"}
			if kind == "video" {
				dest = filepath.Join(t.TempDir(), "fixture.mp4")
				args = []string{"-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-shortest", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p"}
			}
			if out, err := exec.Command("/usr/bin/ffmpeg", append(args, dest)...).CombinedOutput(); err != nil {
				t.Fatal(err, string(out))
			}
			b, err := os.ReadFile(dest)
			if err != nil {
				t.Fatal(err)
			}
			got, err := prepareStudioMedia(ctx, kind, b)
			if err != nil || got.Kind != kind || got.Data == "" {
				t.Fatal(got.Kind, err)
			}
			if _, err = base64.StdEncoding.DecodeString(got.Data); err != nil {
				t.Fatal(err)
			}
		})
	}
	for _, kind := range []string{"audio", "image", "video", "document"} {
		if _, err := prepareStudioMedia(ctx, kind, []byte("not media")); err == nil {
			t.Fatal("invalid media accepted", kind)
		}
	}
}
func TestTelegramMediaIntake(t *testing.T) {
	for _, body := range []string{`"photo":[{"file_id":"small","file_size":100},{"file_id":"large","file_size":200}]`, `"voice":{"file_id":"voice","duration":1}`, `"audio":{"file_id":"audio","duration":1}`, `"video":{"file_id":"video","duration":1}`, `"video_note":{"file_id":"note","duration":1}`} {
		raw := []byte(`{"update_id":1,"message":{"message_id":2,"date":1700000000,"from":{"id":42},"chat":{"id":42,"type":"private"},` + body + `,"caption":"এটা কী?"}}`)
		u, ok := parseTelegramIncoming(raw)
		kind, file := telegramMedia(u)
		if !ok || kind == "" || file == nil {
			t.Fatal("media dropped", body)
		}
		if kind == "image" && file.ID != "large" {
			t.Fatal("wrong photo")
		}
		if _, ok = parseTelegramIncoming(bytes.Replace(raw, []byte(`"type":"private"`), []byte(`"type":"group"`), 1)); ok {
			t.Fatal("group accepted")
		}
	}
}
func TestStudioAttachmentEnablesOnlyActualMedia(t *testing.T) {
	var c studioContext
	c.Config.Model = "qwen/qwen3.8-omni-flash"
	c.Question = "এটা কী?"
	if _, err := studioMessages(c); err == nil {
		t.Fatal("text grounding unexpectedly bypassed")
	}
	c.media = []aicredits.Media{{Kind: "image", MIME: "image/png", Data: base64.StdEncoding.EncodeToString(fixtureStudioImage(t))}}
	m, err := studioMessages(c)
	if err != nil || !strings.Contains(m[0].Content, studioAttachedMediaPolicy) || strings.Contains(m[0].Content, studioTextOnlyMediaPolicy) || len(m[1].Media) != 1 {
		t.Fatal("media prompt/input lost", err)
	}
	// Dashboard/customer JSON cannot grant server media capability.
	if json.Unmarshal([]byte(`{"media":[{"kind":"image","data":"fake"}]}`), &c) != nil {
		t.Fatal("JSON")
	}
	var plain studioContext
	_ = json.Unmarshal([]byte(`{"media":[{"kind":"image","data":"fake"}]}`), &plain)
	if len(plain.media) != 0 {
		t.Fatal("untrusted JSON granted media")
	}
}
func TestStudioMediaDownloadKeepsSecretsOnServer(t *testing.T) {
	old := inboxHTTP
	defer func() { inboxHTTP = old }()
	key := []byte("01234567890123456789012345678901")
	token := "123456:abcdefghijklmnopqrstuvwxyz_ABCD"
	credential, _ := deviceevidence.Encrypt(key, []byte(token), "business|inbox|tg|123456")
	ref, _ := deviceevidence.Encrypt(key, []byte(`{"provider_id":"file-fixture","caption":"এটা কী?"}`), "business|inbox-source")
	source := studioMediaSource{Kind: "image", Provider: "tg", Account: "123456", Credential: base64.StdEncoding.EncodeToString(credential), Reference: base64.StdEncoding.EncodeToString(ref)}
	calls := 0
	inboxHTTP = &http.Client{Transport: telegramTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Host != "api.telegram.org" {
			t.Fatal("untrusted host")
		}
		body := `{"ok":true,"result":{"file_path":"photos/test.png","file_size":100}}`
		if calls == 2 {
			if !strings.Contains(r.URL.Path, "/file/bot"+token+"/") {
				t.Fatal("download auth missing")
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(fixtureStudioImage(t)))}, nil
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	s := Service{Pipeline: &Pipeline{Key: key}}
	media, caption, err := s.loadStudioMedia(context.Background(), "business", source)
	if err != nil || caption != "এটা কী?" || media.Kind != "image" || calls != 2 {
		t.Fatal(calls, caption, err)
	}
	encoded, _ := json.Marshal(media)
	if strings.Contains(string(encoded), token) || strings.Contains(string(encoded), "api.telegram.org") {
		t.Fatal("provider secrets leaked")
	}
	calls = 0
	if _, _, err = s.loadStudioMedia(context.Background(), "other-business", source); err == nil || calls != 0 {
		t.Fatal("cross-business media access")
	}
}
