package aicredits

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"time"
)

type OpenRouter struct {
	key    string
	client *http.Client
}

func NewOpenRouter(key string) *OpenRouter {
	return &OpenRouter{key: key, client: &http.Client{Timeout: 40 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

// Only non-streaming text generation is enabled here. Tools/media/voice must
// use their own bounded, metered adapter instead of silently adding paid work.
func (p *OpenRouter) Generate(ctx context.Context, model string, maxOutput int64, messages []Message) (Output, error) {
	var result Output
	if p == nil || p.key == "" || maxOutput < 1 || !modelID.MatchString(model) {
		return result, ErrRejected
	}
	body, err := json.Marshal(struct {
		Model     string    `json:"model"`
		Messages  []Message `json:"messages"`
		Max       int64     `json:"max_completion_tokens"`
		Stream    bool      `json:"stream"`
		Reasoning *struct {
			Enabled bool `json:"enabled"`
		} `json:"reasoning,omitempty"`
	}{Model: model, Messages: messages, Max: maxOutput, Stream: false, Reasoning: chatReasoning(model)})
	if err != nil {
		return result, ErrRejected
	}
	request, err := http.NewRequestWithContext(ctx, "POST", "https://openrouter.ai/api/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return result, ErrRejected
	}
	request.Header.Set("Authorization", "Bearer "+p.key)
	request.Header.Set("Content-Type", "application/json")
	response, err := p.client.Do(request)
	if err != nil {
		log.Print("openrouter generation unavailable: transport")
		return result, errors.New("provider result uncertain")
	}
	defer response.Body.Close()
	switch response.StatusCode {
	case 400, 401, 403, 404, 413, 422, 429:
		return result, ErrRejected
	}
	if response.StatusCode != 200 {
		log.Printf("openrouter generation unavailable: status=%d", response.StatusCode)
		return result, errors.New("provider result uncertain")
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 131073))
	if err != nil || len(raw) > 131072 {
		log.Print("openrouter generation unavailable: response bound or read")
		return result, errors.New("provider response incomplete")
	}
	var parsed struct {
		ID      string `json:"id"`
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content *string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage *struct {
			Input   *int64 `json:"prompt_tokens"`
			Output  *int64 `json:"completion_tokens"`
			Details struct {
				Cached int64 `json:"cached_tokens"`
			} `json:"prompt_tokens_details"`
		} `json:"usage"`
	}
	if json.Unmarshal(raw, &parsed) != nil {
		log.Print("openrouter generation unavailable: invalid JSON")
		return result, errors.New("provider response invalid")
	}
	if len(parsed.ID) <= 200 {
		result.ID = parsed.ID
	}
	if result.ID == "" || parsed.Model != model || len(parsed.Choices) != 1 || parsed.Choices[0].Message.Content == nil || parsed.Usage == nil || parsed.Usage.Input == nil || parsed.Usage.Output == nil {
		// Log structural facts only: no credentials, customer text or provider body.
		hasContent := len(parsed.Choices) == 1 && parsed.Choices[0].Message.Content != nil
		log.Printf("openrouter generation unavailable: id=%t model_match=%t choices=%d content=%t usage=%t", result.ID != "", parsed.Model == model, len(parsed.Choices), hasContent, parsed.Usage != nil)
		return result, errors.New("provider usage unavailable")
	}
	result.Text = *parsed.Choices[0].Message.Content
	if len(result.Text) > 65536 {
		return result, errors.New("provider output exceeds response bound")
	}
	result.Usage = Usage{InputTokens: *parsed.Usage.Input, OutputTokens: *parsed.Usage.Output, CachedInputTokens: parsed.Usage.Details.Cached}
	return result, nil
}

// This optional-thinking chat model otherwise spends the small reply budget on
// hidden reasoning and can return no visible answer. Leave other models alone.
func chatReasoning(model string) *struct {
	Enabled bool `json:"enabled"`
} {
	if model == "qwen/qwen3.8-omni-flash" {
		return &struct {
			Enabled bool `json:"enabled"`
		}{Enabled: false}
	}
	return nil
}
