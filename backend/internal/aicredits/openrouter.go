package aicredits

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type OpenRouter struct {
	key    string
	client *http.Client
}

func NewOpenRouter(key string) *OpenRouter {
	return &OpenRouter{key: key, client: &http.Client{Timeout: 40 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

// Bounded text or server-fetched media input; output remains text-only.
func (p *OpenRouter) Generate(ctx context.Context, model string, maxOutput int64, messages []Message) (Output, error) {
	var result Output
	if p == nil || p.key == "" || maxOutput < 1 || !modelID.MatchString(model) {
		return result, ErrRejected
	}
	wire, err := providerMessages(model, messages)
	if err != nil {
		return result, err
	}
	body, err := json.Marshal(struct {
		Model     string           `json:"model"`
		Messages  []map[string]any `json:"messages"`
		Max       int64            `json:"max_completion_tokens"`
		Stream    bool             `json:"stream"`
		Reasoning *struct {
			Enabled bool `json:"enabled"`
		} `json:"reasoning,omitempty"`
	}{Model: model, Messages: wire, Max: maxOutput, Stream: false, Reasoning: chatReasoning(model)})
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
	case 400, 401, 402, 403, 404, 413, 422, 429:
		raw, _ := io.ReadAll(io.LimitReader(response.Body, 32768))
		if response.StatusCode == 402 {
			log.Printf("openrouter generation rejected: %s", creditRejectionDiagnostic(raw, maxOutput))
			if ctx.Value(providerDiagnosticContextKey{}) == true {
				log.Printf("openrouter credit validation detail: %s", providerRejectionSummary(raw))
			}
		} else if ctx.Value(providerDiagnosticContextKey{}) == true {
			log.Printf("openrouter generation rejected: status=%d summary=%s", response.StatusCode, providerRejectionSummary(raw))
		} else {
			log.Printf("openrouter generation rejected: status=%d", response.StatusCode)
		}
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

// Whitelisted diagnostics only: never log the provider body, customer text,
// credentials, raw upstream metadata or arbitrary provider messages.
func creditRejectionDiagnostic(raw []byte, max int64) string {
	var p struct {
		Error struct {
			Message  string `json:"message"`
			Metadata struct {
				Source string `json:"limit_source"`
				Reason string `json:"reason"`
			} `json:"metadata"`
		} `json:"error"`
	}
	_ = json.Unmarshal(raw, &p)
	source := "unreported"
	switch p.Error.Metadata.Source {
	case "openrouter_credits", "openrouter_key_limit", "openrouter_in_flight_budget":
		source = p.Error.Metadata.Source
	}
	reason := "unreported"
	switch p.Error.Metadata.Reason {
	case "weight_exceeds_budget", "in_flight_budget_exhausted", "insufficient_credits", "key_limit_exceeded":
		reason = p.Error.Metadata.Reason
	}
	number := func(pattern string) string {
		v := regexp.MustCompile(pattern).FindStringSubmatch(strings.ToLower(p.Error.Message))
		if len(v) > 1 && len(v[1]) < 12 {
			return v[1]
		}
		return "unreported"
	}
	return "status=402 source=" + source + " reason=" + reason + " max_output=" + strconv.FormatInt(max, 10) + " requested=" + number(`requested (?:up to )?([0-9]+)`) + " affordable=" + number(`(?:can only afford|can afford) ([0-9]+)`)
}

func providerRejectionSummary(raw []byte) string {
	var p struct {
		Error struct {
			Message  string `json:"message"`
			Metadata struct {
				Raw string `json:"raw"`
			} `json:"metadata"`
		} `json:"error"`
	}
	if json.Unmarshal(raw, &p) != nil {
		return "unparsed rejection"
	}
	message := p.Error.Message
	var upstream struct {
		Message string `json:"message"`
		Error   struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal([]byte(p.Error.Metadata.Raw), &upstream) == nil {
		if upstream.Error.Message != "" {
			message += "; upstream: " + upstream.Error.Message
		} else if upstream.Message != "" {
			message += "; upstream: " + upstream.Message
		}
	}
	// Report error messages, never raw provider metadata. Redact credentials,
	// media payloads and contact strings before bounding the diagnostic.
	for _, pattern := range []string{`(?i)sk-[a-z0-9_-]+`, `[A-Za-z0-9+/=_-]{64,}`, `https?://[^\s]+`, `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]+`, `[0-9]{7,}`} {
		message = regexp.MustCompile(pattern).ReplaceAllString(message, "[redacted]")
	}
	message = strings.Join(strings.Fields(message), " ")
	if len(message) > 600 {
		message = message[:600]
	}
	return message
}

type providerDiagnosticContextKey struct{}

// WithProviderDiagnostics opts an operator-requested diagnostic into redacted
// error messages; ordinary customer requests log status codes only.
func WithProviderDiagnostics(ctx context.Context) context.Context {
	return context.WithValue(ctx, providerDiagnosticContextKey{}, true)
}
