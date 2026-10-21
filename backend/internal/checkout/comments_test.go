package checkout

import (
	"context"
	"errors"
	policy "github.com/masharzy/ekmivo/backend/internal/comments"
	"io"
	"net/http"
	"strings"
	"testing"
)

type commentTransport func(*http.Request) (*http.Response, error)

func (f commentTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func commentResponse(code int, body string) *http.Response {
	return &http.Response{StatusCode: code, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}
func TestSignedCommentNormalization(t *testing.T) {
	fb := parseComments([]byte(`{"object":"page","entry":[{"id":"123","changes":[{"field":"feed","value":{"item":"comment","verb":"add","comment_id":"123_9","post_id":"123_4","message":"দাম কত?","from":{"id":"customer"}}},{"field":"feed","value":{"item":"comment","comment_id":"123_10","post_id":"123_4","message":"own reply","from":{"id":"123"}}}]}]}`))
	if len(fb) != 1 || fb[0].Text != "দাম কত?" {
		t.Fatal(fb)
	}
	ig := parseComments([]byte(`{"object":"instagram","entry":[{"id":"123","changes":[{"field":"comments","value":{"id":"456","text":"price?","media":{"id":"789"},"from":{"id":"customer"}}}]}]}`))
	if len(ig) != 1 || ig[0].ID != "456" || ig[0].Post != "789" {
		t.Fatal(ig)
	}
}
func TestCommentOwnershipAndProviderActions(t *testing.T) {
	for _, provider := range []string{"ms", "ig"} {
		for _, action := range []string{"reply", "hide", "delete"} {
			calls := 0
			client := &http.Client{Transport: commentTransport(func(r *http.Request) (*http.Response, error) {
				calls++
				if r.URL.Host != "graph.facebook.com" || r.Header.Get("Authorization") != "Bearer fixture" {
					t.Fatal("credential destination")
				}
				if calls == 1 {
					field := "from"
					if provider == "ig" {
						field = "owner"
					}
					return commentResponse(200, `{"`+field+`":{"id":"123"}}`), nil
				}
				if action == "delete" && r.Method != "DELETE" {
					t.Fatal("wrong method")
				}
				if action == "reply" {
					suffix := "/comments"
					if provider == "ig" {
						suffix = "/replies"
					}
					if !strings.HasSuffix(r.URL.Path, suffix) {
						t.Fatal(r.URL.Path)
					}
					return commentResponse(200, `{"id":"posted"}`), nil
				}
				return commentResponse(200, `{"success":true}`), nil
			})}
			state, reason := sendComment(context.Background(), client, "v26.0", "fixture", commentJob{Account: "123", Provider: provider, Post: "123_4", External: "123_5", Decision: policy.Decision{Action: action, Reply: "Safe fixed reply"}})
			if state != "sent" || reason != "" || calls != 2 {
				t.Fatalf("%s %s %s %s", provider, action, state, reason)
			}
		}
	}
}
func TestCommentUnknownOutcomesAreNotSuccess(t *testing.T) {
	for _, outcome := range []string{"timeout", "server-error", "missing-id", "wrong-owner"} {
		calls := 0
		client := &http.Client{Transport: commentTransport(func(*http.Request) (*http.Response, error) {
			calls++
			if calls == 1 {
				if outcome == "wrong-owner" {
					return commentResponse(200, `{"from":{"id":"other"}}`), nil
				}
				return commentResponse(200, `{"from":{"id":"123"}}`), nil
			}
			if outcome == "timeout" {
				return nil, errors.New("response lost")
			}
			if outcome == "server-error" {
				return commentResponse(503, `{}`), nil
			}
			return commentResponse(200, `{}`), nil
		})}
		state, _ := sendComment(context.Background(), client, "v26.0", "fixture", commentJob{Account: "123", Provider: "ms", Post: "post", External: "comment", Decision: policy.Decision{Action: "reply", Reply: "Reply"}})
		if outcome == "wrong-owner" {
			if state != "failed" || calls != 1 {
				t.Fatal("cross-account action")
			}
		} else if state != "uncertain" {
			t.Fatal("unknown outcome accepted")
		}
	}
}
