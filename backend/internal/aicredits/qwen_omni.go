package aicredits

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

type QwenOmni struct {
	key    string
	client *http.Client
}

func NewQwenOmni(key string) *QwenOmni {
	return &QwenOmni{key: key, client: &http.Client{Timeout: 40 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

type ConfiguredProviders struct {
	Qwen       Provider
	OpenRouter Provider
}

func (p ConfiguredProviders) Generate(ctx context.Context, model string, max int64, m []Message) (Output, error) {
	if model == "qwen3.5-omni-flash" || strings.HasPrefix(model, "qwen3.5-omni-flash-") {
		if p.Qwen == nil {
			return Output{}, ErrRejected
		}
		return p.Qwen.Generate(ctx, model, max, m)
	}
	if p.OpenRouter == nil {
		return Output{}, ErrRejected
	}
	return p.OpenRouter.Generate(ctx, model, max, m)
}
func (p *QwenOmni) Generate(ctx context.Context, model string, max int64, m []Message) (Output, error) {
	var out Output
	if p == nil || p.key == "" || max < 1 || max > 65536 || !(model == "qwen3.5-omni-flash" || strings.HasPrefix(model, "qwen3.5-omni-flash-")) || !modelID.MatchString(model) {
		return out, ErrRejected
	}
	wire, e := providerMessages(model, m)
	if e != nil {
		return out, e
	}
	body, e := json.Marshal(map[string]any{"model": model, "messages": wire, "max_tokens": max, "stream": true, "stream_options": map[string]bool{"include_usage": true}, "modalities": []string{"text"}})
	if e != nil {
		return out, ErrRejected
	}
	req, e := http.NewRequestWithContext(ctx, "POST", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", bytes.NewReader(body))
	if e != nil {
		return out, ErrRejected
	}
	req.Header.Set("Authorization", "Bearer "+p.key)
	req.Header.Set("Content-Type", "application/json")
	res, e := p.client.Do(req)
	if e != nil {
		return out, errors.New("provider outcome uncertain")
	}
	defer res.Body.Close()
	switch res.StatusCode {
	case 400, 401, 403, 404, 413, 422, 429:
		return out, ErrRejected
	}
	if res.StatusCode != 200 {
		return out, errors.New("provider outcome uncertain")
	}
	return readQwenStream(res.Body, model)
}
func readQwenStream(r io.Reader, model string) (Output, error) {
	var out Output
	haveUsage, finished, done := false, false, false
	limited := io.LimitReader(r, 1048577)
	scan := bufio.NewScanner(limited)
	scan.Buffer(make([]byte, 4096), 131072)
	total := 0
	for scan.Scan() {
		line := scan.Text()
		total += len(line) + 1
		if total > 1048576 {
			return out, errors.New("provider response too large")
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		raw := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if raw == "[DONE]" {
			done = true
			break
		}
		var c struct {
			ID      string `json:"id"`
			Model   string `json:"model"`
			Choices []struct {
				Index int `json:"index"`
				Delta struct {
					Content *string `json:"content"`
				} `json:"delta"`
				Finish *string `json:"finish_reason"`
			} `json:"choices"`
			Usage *struct {
				Input  *int64 `json:"prompt_tokens"`
				Output *int64 `json:"completion_tokens"`
			} `json:"usage"`
			Error json.RawMessage `json:"error"`
		}
		if json.Unmarshal([]byte(raw), &c) != nil || (len(c.Error) > 0 && string(c.Error) != "null") {
			return out, errors.New("provider response invalid")
		}
		if c.Model != "" && c.Model != model && !strings.HasPrefix(c.Model, model+"-") {
			return out, errors.New("provider model mismatch")
		}
		if c.ID != "" {
			if len(c.ID) > 200 || (out.ID != "" && out.ID != c.ID) {
				return out, errors.New("provider response identity mismatch")
			}
			out.ID = c.ID
		}
		for _, choice := range c.Choices {
			if choice.Index != 0 {
				return out, errors.New("multiple provider choices")
			}
			if choice.Delta.Content != nil {
				out.Text += *choice.Delta.Content
			}
			if choice.Finish != nil {
				if *choice.Finish != "stop" {
					return out, errors.New("provider output incomplete")
				}
				finished = true
			}
		}
		if len(out.Text) > 65536 {
			return out, errors.New("provider output too large")
		}
		if c.Usage != nil {
			if haveUsage || c.Usage.Input == nil || c.Usage.Output == nil || *c.Usage.Input < 0 || *c.Usage.Output < 0 {
				return out, errors.New("provider usage invalid")
			}
			haveUsage = true
			out.Usage = Usage{InputTokens: *c.Usage.Input, OutputTokens: *c.Usage.Output}
		}
	}
	if scan.Err() != nil || !done || !finished || !haveUsage || out.ID == "" || strings.TrimSpace(out.Text) == "" {
		return out, errors.New("provider result incomplete")
	}
	return out, nil
}
