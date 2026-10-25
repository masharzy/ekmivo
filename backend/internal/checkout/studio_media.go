package checkout

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/masharzy/ekmivo/backend/internal/aicredits"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
)

var errStudioMedia = errors.New("AI media unavailable")
var telegramFilePath = regexp.MustCompile(`^[A-Za-z0-9_/-]+\.[A-Za-z0-9]+$`)

type studioMediaSource struct {
	Reference  string `json:"reference"`
	Credential string `json:"credential"`
	Account    string `json:"account"`
	Provider   string `json:"provider"`
	Kind       string `json:"kind"`
}

func (s *Service) studioJobMedia(ctx context.Context, job, lease, workspace string) (aicredits.Media, string, error) {
	var raw []byte
	if err := s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_channel_media($1::uuid,$2::uuid)", job, lease).Scan(&raw); err != nil {
		return aicredits.Media{}, "", errStudioMedia
	}
	if len(raw) == 0 || string(raw) == "null" {
		return aicredits.Media{}, "", nil
	}
	var source studioMediaSource
	if json.Unmarshal(raw, &source) != nil {
		return aicredits.Media{}, "", errStudioMedia
	}
	return s.loadStudioMedia(ctx, workspace, source)
}
func (s *Service) loadStudioMedia(ctx context.Context, workspace string, src studioMediaSource) (aicredits.Media, string, error) {
	var none aicredits.Media
	if src.Kind != "image" && src.Kind != "audio" && src.Kind != "video" {
		return none, "", errStudioMedia
	}
	encrypted, err := base64.StdEncoding.DecodeString(src.Reference)
	if err != nil {
		return none, "", errStudioMedia
	}
	plain, err := merchantwebhook.Decrypt(s.Pipeline.Key, encrypted, workspace+"|inbox-source")
	if err != nil {
		return none, "", errStudioMedia
	}
	var ref map[string]string
	if json.Unmarshal(plain, &ref) != nil || len(ref["caption"]) > 8000 {
		return none, "", errStudioMedia
	}
	encrypted, err = base64.StdEncoding.DecodeString(src.Credential)
	if err != nil {
		return none, "", errStudioMedia
	}
	token, err := merchantwebhook.Decrypt(s.Pipeline.Key, encrypted, workspace+"|inbox|"+src.Provider+"|"+src.Account)
	if err != nil {
		return none, "", errStudioMedia
	}
	target := ref["url"]
	switch src.Provider {
	case "tg":
		var file struct {
			Path string `json:"file_path"`
			Size int64  `json:"file_size"`
		}
		if ref["provider_id"] == "" || telegramCall(ctx, string(token), "getFile", map[string]string{"file_id": ref["provider_id"]}, &file) != nil || file.Size > aicredits.MaxMediaBytes || !telegramFilePath.MatchString(file.Path) || strings.Contains(file.Path, "..") {
			return none, "", errStudioMedia
		}
		target = "https://api.telegram.org/file/bot" + string(token) + "/" + file.Path
	case "wa":
		cfg, _ := s.channelConfig(ctx)
		version := cfg["META_GRAPH_VERSION"]
		if !regexp.MustCompile(`^v[0-9]+\.[0-9]+$`).MatchString(version) || !regexp.MustCompile(`^[0-9]+$`).MatchString(ref["provider_id"]) {
			return none, "", errStudioMedia
		}
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://graph.facebook.com/"+version+"/"+url.PathEscape(ref["provider_id"]), nil)
		req.Header.Set("Authorization", "Bearer "+string(token))
		res, e := inboxHTTP.Do(req)
		if e != nil {
			return none, "", errStudioMedia
		}
		var file struct {
			URL string `json:"url"`
		}
		e = json.NewDecoder(io.LimitReader(res.Body, 65536)).Decode(&file)
		res.Body.Close()
		if e != nil || res.StatusCode != 200 {
			return none, "", errStudioMedia
		}
		target = file.URL
		if !safeMetaMediaURL(target) {
			return none, "", errStudioMedia
		}
	case "ms", "ig":
		if !safeMetaMediaURL(target) {
			return none, "", errStudioMedia
		}
	default:
		return none, "", errStudioMedia
	}
	req, err := http.NewRequestWithContext(ctx, "GET", target, nil)
	if err != nil {
		return none, "", errStudioMedia
	}
	if src.Provider == "wa" {
		req.Header.Set("Authorization", "Bearer "+string(token))
	}
	res, err := inboxHTTP.Do(req)
	if err != nil {
		return none, "", errStudioMedia
	}
	defer res.Body.Close()
	if res.StatusCode != 200 || res.ContentLength > aicredits.MaxMediaBytes {
		return none, "", errStudioMedia
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, aicredits.MaxMediaBytes+1))
	if err != nil || len(data) == 0 || len(data) > aicredits.MaxMediaBytes {
		return none, "", errStudioMedia
	}
	media, err := prepareStudioMedia(ctx, src.Kind, data)
	return media, ref["caption"], err
}

// Never expose provider download URLs to the model. Local tools receive only a
// private file; network protocols, large files, long clips and extra streams are disabled.
func prepareStudioMedia(ctx context.Context, kind string, data []byte) (aicredits.Media, error) {
	var out aicredits.Media
	if len(data) == 0 || len(data) > aicredits.MaxMediaBytes {
		return out, errStudioMedia
	}
	mime := http.DetectContentType(data)
	if kind == "image" {
		if mime != "image/png" && mime != "image/jpeg" {
			return out, errStudioMedia
		}
		cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil || cfg.Width < 11 || cfg.Height < 11 || int64(cfg.Width)*int64(cfg.Height) > 20000000 {
			return out, errStudioMedia
		}
		decoded, _, err := image.Decode(bytes.NewReader(data))
		if err != nil {
			return out, errStudioMedia
		}
		width, height := cfg.Width, cfg.Height
		if width > 768 || height > 768 {
			if width >= height {
				height = height * 768 / width
				width = 768
			} else {
				width = width * 768 / height
				height = 768
			}
		}
		if width < 1 || height < 1 {
			return out, errStudioMedia
		}
		small := image.NewRGBA(image.Rect(0, 0, width, height))
		for y := 0; y < height; y++ {
			for x := 0; x < width; x++ {
				small.Set(x, y, decoded.At(decoded.Bounds().Min.X+x*cfg.Width/width, decoded.Bounds().Min.Y+y*cfg.Height/height))
			}
		}
		var encoded bytes.Buffer
		if jpeg.Encode(&encoded, small, &jpeg.Options{Quality: 85}) != nil {
			return out, errStudioMedia
		}
		return aicredits.Media{Kind: kind, MIME: "image/jpeg", Data: base64.StdEncoding.EncodeToString(encoded.Bytes())}, nil
	}
	if kind != "audio" && kind != "video" {
		return out, errStudioMedia
	}
	// Reject playlists, HTML and arbitrary files before invoking a demuxer.
	containerOK := mime == "audio/mpeg" || mime == "audio/wave" || mime == "audio/x-wav" || mime == "audio/wav" || mime == "application/ogg" || mime == "audio/ogg" || mime == "video/webm" || (len(data) > 12 && string(data[4:8]) == "ftyp") || (len(data) > 2 && data[0] == 0xff && data[1]&0xf6 == 0xf0)
	if !containerOK {
		return out, errStudioMedia
	}

	dir, err := os.MkdirTemp("", "ekmivo-ai-media-")
	if err != nil {
		return out, errStudioMedia
	}
	defer os.RemoveAll(dir)
	input := filepath.Join(dir, "input")
	if os.WriteFile(input, data, 0600) != nil {
		return out, errStudioMedia
	}
	run, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	args := []string{"-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration:stream=codec_type", "-of", "json", input}
	probe, err := exec.CommandContext(run, "/usr/bin/prlimit", append([]string{"--as=536870912", "--cpu=8", "--nofile=64", "--nproc=128", "--", "/usr/bin/ffprobe"}, args...)...).Output()
	if err != nil || len(probe) > 16384 {
		return out, errStudioMedia
	}
	var info struct {
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
		Streams []struct {
			Type string `json:"codec_type"`
		} `json:"streams"`
	}
	if json.Unmarshal(probe, &info) != nil {
		return out, errStudioMedia
	}
	duration, err := strconv.ParseFloat(info.Format.Duration, 64)
	limit := 60.0
	if kind == "video" {
		limit = 30
	}
	if err != nil || !(duration > 0 && duration <= limit) {
		return out, errStudioMedia
	}
	have := false
	for _, stream := range info.Streams {
		if stream.Type == kind {
			have = true
		}
	}
	if !have {
		return out, errStudioMedia
	}
	output := filepath.Join(dir, "output.wav")
	args = []string{"-v", "error", "-nostdin", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", input, "-map_metadata", "-1"}
	if kind == "audio" {
		mime = "audio/wav"
		args = append(args, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le")
	} else {
		output = filepath.Join(dir, "output.mp4")
		mime = "video/mp4"
		args = append(args, "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=384:384:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=1", "-c:v", "libx264", "-threads", "1", "-preset", "ultrafast", "-crf", "28", "-c:a", "aac", "-ac", "1", "-ar", "16000", "-movflags", "+faststart")
	}
	args = append(args, "-t", strconv.FormatFloat(limit, 'f', 0, 64), "-fs", strconv.Itoa(aicredits.MaxMediaBytes), "-y", output)
	cmd := exec.CommandContext(run, "/usr/bin/prlimit", append([]string{"--as=536870912", "--cpu=8", "--fsize=8388608", "--nofile=64", "--nproc=128", "--", "/usr/bin/ffmpeg"}, args...)...)
	if cmd.Run() != nil {
		return out, errStudioMedia
	}
	data, err = os.ReadFile(output)
	if err != nil || len(data) == 0 || len(data) > aicredits.MaxMediaBytes {
		return out, errStudioMedia
	}
	return aicredits.Media{Kind: kind, MIME: mime, Data: base64.StdEncoding.EncodeToString(data)}, nil
}
