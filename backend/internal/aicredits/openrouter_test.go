package aicredits

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type routerTransport func(*http.Request) (*http.Response, error)

func (f routerTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestOpenRouterUsesBoundedRequestAndAuthoritativeUsage(t *testing.T) {
	provider := NewOpenRouter("fixture-key")
	provider.client.Transport = routerTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://openrouter.ai/api/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer fixture-key" {
			t.Fatal("unexpected provider destination/auth")
		}
		var request map[string]any
		if json.NewDecoder(r.Body).Decode(&request) != nil || request["max_completion_tokens"] != float64(123) || request["stream"] != false {
			t.Fatal("output bound or non-streaming contract missing")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"id":"fixture-generation","model":"fixture-model","choices":[{"message":{"content":"Hello"}}],"usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_tokens_details":{"cached_tokens":50}}}`)), Header: make(http.Header)}, nil
	})
	output, err := provider.Generate(context.Background(), "fixture-model", 123, []Message{{Role: "user", Content: "Hello"}})
	if err != nil || output.Text != "Hello" || output.Usage != (Usage{InputTokens: 100, CachedInputTokens: 50, OutputTokens: 20}) {
		t.Fatal("usage was inferred instead of read", output, err)
	}
}
func TestOpenRouterErrorsNeverGuessUsageOrFollowRedirects(t *testing.T) {
	for _, tc := range []struct {
		name     string
		status   int
		body     string
		rejected bool
	}{
		{"unauthorized", 401, "secret provider error", true}, {"provider credit limit", 402, "private billing details", true}, {"rate limit", 429, "", true}, {"unknown upstream", 502, "", false},
		{"missing usage", 200, `{"id":"fixture","model":"fixture-model","choices":[{"message":{"content":"Hello"}}]}`, false},
		{"wrong model", 200, `{"id":"fixture","model":"another-model","choices":[{"message":{"content":"Hello"}}],"usage":{"prompt_tokens":1,"completion_tokens":1}}`, false},
		{"redirect", 302, "", false}, {"oversized", 200, strings.Repeat("x", 131073), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			provider := NewOpenRouter("fixture-key")
			calls := 0
			provider.client.Transport = routerTransport(func(*http.Request) (*http.Response, error) {
				calls++
				return &http.Response{StatusCode: tc.status, Body: io.NopCloser(strings.NewReader(tc.body)), Header: http.Header{"Location": []string{"https://other.example/steal"}}}, nil
			})
			_, err := provider.Generate(context.Background(), "fixture-model", 100, []Message{{Role: "user", Content: "Hi"}})
			if err == nil || errors.Is(err, ErrRejected) != tc.rejected || calls != 1 || strings.Contains(err.Error(), "secret") {
				t.Fatal("unsafe provider failure behavior", err, calls)
			}
		})
	}
}

func TestOpenRouterChatReasoningBudget(t *testing.T) {
	for _, model := range []string{"qwen/qwen3.8-omni-flash", "fixture-model"} {
		t.Run(model, func(t *testing.T) {
			provider := NewOpenRouter("fixture-key")
			provider.client.Transport = routerTransport(func(r *http.Request) (*http.Response, error) {
				var request map[string]json.RawMessage
				if json.NewDecoder(r.Body).Decode(&request) != nil {
					t.Fatal("invalid request")
				}
				if model == "qwen/qwen3.8-omni-flash" {
					var reasoning map[string]bool
					if json.Unmarshal(request["reasoning"], &reasoning) != nil || len(reasoning) != 1 || reasoning["enabled"] {
						t.Fatal("chat thinking must be explicitly disabled")
					}
				} else if _, exists := request["reasoning"]; exists {
					t.Fatal("unrelated model reasoning changed")
				}
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"id":"fixture-generation","model":"` + model + `","choices":[{"message":{"content":"Hello"}}],"usage":{"prompt_tokens":100,"completion_tokens":20}}`)), Header: make(http.Header)}, nil
			})
			if _, err := provider.Generate(context.Background(), model, 1000, []Message{{Role: "user", Content: "Hello"}}); err != nil {
				t.Fatal(err)
			}
		})
	}
}
