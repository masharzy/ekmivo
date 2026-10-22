package checkout

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
)

// No redirects carrying credentials; account keys stay in encrypted control storage.
var inboxHTTP = &http.Client{Timeout: 12 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

func (s *Service) HandleInboxConnection(w http.ResponseWriter, r *http.Request) {
	ws, e := r.PathValue("workspaceID"), explicitRealm(r)
	if !uuidPattern.MatchString(ws) || (e != "sandbox" && e != "live") {
		fail(w, 400, "INVALID_SCOPE")
		return
	}
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if err := s.mobileSession(r, ws, e); err != nil {
		authError(w, err)
		return
	}
	if r.Method == "GET" {
		var result []byte
		if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_connection_list($1::uuid,$2)", ws, e).Scan(&result); err != nil {
			fail(w, 503, "SOURCE_UNAVAILABLE")
			return
		}
		write(w, 200, json.RawMessage(result))
		return
	}
	if id := r.PathValue("connectionID"); id != "" {
		if !uuidPattern.MatchString(id) {
			fail(w, 422, "INVALID_CONNECTION")
			return
		}
		var removed bool
		if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_disconnect($1::uuid,$2,$3::uuid)", ws, e, id).Scan(&removed); err != nil {
			fail(w, 503, "SOURCE_UNAVAILABLE")
			return
		}
		if !removed {
			fail(w, 404, "NOT_FOUND")
			return
		}
		write(w, 200, map[string]bool{"disconnected": true})
		return
	}
	var b struct {
		Provider    string `json:"provider"`
		ExternalID  string `json:"external_id"`
		AccessToken string `json:"access_token"`
	}
	if decodeBounded(w, r, &b, 8192) != nil || !(b.Provider == "wa" || b.Provider == "ig" || b.Provider == "ms") || len(b.AccessToken) < 16 || len(b.AccessToken) > 4096 || len(b.ExternalID) > 80 {
		fail(w, 422, "INVALID_CONNECTION")
		return
	}
	for _, c := range b.ExternalID {
		if c < '0' || c > '9' {
			fail(w, 422, "INVALID_CONNECTION")
			return
		}
	}
	if b.ExternalID == "" {
		fail(w, 422, "INVALID_CONNECTION")
		return
	}
	version := os.Getenv("META_GRAPH_VERSION")
	if !strings.HasPrefix(version, "v") || strings.ContainsAny(version, "/?#") {
		fail(w, 503, "CHANNEL_NOT_CONFIGURED")
		return
	}
	// Verify the token actually grants access to the claimed provider account.
	req, _ := http.NewRequestWithContext(r.Context(), "GET", "https://graph.facebook.com/"+version+"/"+b.ExternalID+"?fields=id", nil)
	req.Header.Set("Authorization", "Bearer "+b.AccessToken)
	response, err := inboxHTTP.Do(req)
	if err != nil {
		fail(w, 503, "CHANNEL_UNAVAILABLE")
		return
	}
	var verified struct {
		ID string `json:"id"`
	}
	defer response.Body.Close()
	if response.StatusCode != 200 || json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&verified) != nil || verified.ID != b.ExternalID {
		fail(w, 403, "CHANNEL_AUTHORIZATION_REJECTED")
		return
	}
	cipher, err := deviceevidence.Encrypt(s.Pipeline.Key, []byte(b.AccessToken), ws+"|inbox|"+b.Provider+"|"+b.ExternalID)
	if err != nil {
		fail(w, 503, "CHANNEL_UNAVAILABLE")
		return
	}
	var id string
	if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_connection($1::uuid,$2,$3,$4,$5)", ws, e, b.Provider, b.ExternalID, cipher).Scan(&id); err != nil {
		mapped(w, err)
		return
	}
	write(w, 200, map[string]string{"id": id})
}
func inboxWebhookSignature(secret, header string, raw []byte) bool {
	expected := hmac.New(sha256.New, []byte(secret))
	expected.Write(raw)
	supplied, err := hex.DecodeString(strings.TrimPrefix(header, "sha256="))
	return secret != "" && strings.HasPrefix(header, "sha256=") && err == nil && hmac.Equal(expected.Sum(nil), supplied)
}

// A small, exact opt-out vocabulary prevents substring false positives such
// as "please stop order 123". This only removes marketing eligibility; it
// never changes ordinary support conversations or establishes opt-in.
func signedChannelMarketingOptOut(message string) bool {
	switch strings.ToLower(strings.TrimSpace(message)) {
	case "stop", "stop all", "unsubscribe":
		return true
	default:
		return false
	}
}
func (s *Service) HandleInboxWebhook(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	if r.Method == "GET" {
		expected := os.Getenv("META_WEBHOOK_VERIFY_TOKEN")
		if expected == "" || r.URL.Query().Get("hub.mode") != "subscribe" || !hmac.Equal([]byte(expected), []byte(r.URL.Query().Get("hub.verify_token"))) {
			fail(w, 403, "WEBHOOK_VERIFICATION_REJECTED")
			return
		}
		w.WriteHeader(200)
		_, _ = w.Write([]byte(r.URL.Query().Get("hub.challenge")))
		return
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1048576))
	if err != nil {
		fail(w, 413, "BODY_TOO_LARGE")
		return
	}
	if !inboxWebhookSignature(os.Getenv("META_APP_SECRET"), r.Header.Get("X-Hub-Signature-256"), raw) {
		fail(w, 403, "WEBHOOK_SIGNATURE_REJECTED")
		return
	}
	var payload struct {
		Object string `json:"object"`
		Entry  []struct {
			ID        string `json:"id"`
			Messaging []struct {
				Sender struct {
					ID string `json:"id"`
				} `json:"sender"`
				Timestamp int64 `json:"timestamp"`
				Message   struct {
					MID    string `json:"mid"`
					Text   string `json:"text"`
					IsEcho bool   `json:"is_echo"`
				} `json:"message"`
			} `json:"messaging"`
			Changes []struct {
				Value struct {
					Metadata struct {
						Phone string `json:"phone_number_id"`
					} `json:"metadata"`
					Contacts []struct {
						WAID    string `json:"wa_id"`
						Profile struct {
							Name string `json:"name"`
						} `json:"profile"`
					} `json:"contacts"`
					Messages []struct {
						ID        string `json:"id"`
						From      string `json:"from"`
						Timestamp string `json:"timestamp"`
						Type      string `json:"type"`
						Text      struct {
							Body string `json:"body"`
						} `json:"text"`
					} `json:"messages"`
				} `json:"value"`
			} `json:"changes"`
		} `json:"entry"`
	}
	if json.Unmarshal(raw, &payload) != nil {
		fail(w, 422, "INVALID_WEBHOOK")
		return
	}
	provider := "ms"
	if payload.Object == "instagram" {
		provider = "ig"
	}
	if payload.Object == "whatsapp_business_account" {
		provider = "wa"
	}
	hash := digest(string(raw))
	cipher, err := deviceevidence.Encrypt(s.Pipeline.Key, raw, "inbox-webhook|"+hash)
	if err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	tx, err := s.Pipeline.Control.Begin(r.Context())
	if err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	defer tx.Rollback(r.Context())
	var fresh bool
	if err = tx.QueryRow(r.Context(), "SELECT inbox_webhook_record($1,$2,$3)", hash, provider, cipher).Scan(&fresh); err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	ingest := func(account, id, from, name, text, kind string, at time.Time) error {
		var connection, workspace string
		var token []byte
		queryErr := tx.QueryRow(r.Context(), "SELECT * FROM inbox_provider_connections($1,$2)", provider, account).Scan(&connection, &workspace, &token)
		if queryErr != nil {
			if errors.Is(queryErr, pgx.ErrNoRows) {
				return nil
			}
			return queryErr
		} // durable raw event retained for connections not linked yet
		var accepted bool
		if err := tx.QueryRow(r.Context(), "SELECT inbox_ingest($1::uuid,$2,$3,$4,$5,$6,$7)", connection, id, from, name, text, kind, at).Scan(&accepted); err != nil {
			return err
		}
		if accepted && kind == "text" && os.Getenv("BRIOFOLD_GROWTH_CONSENT_ENABLED") == "true" && signedChannelMarketingOptOut(text) {
			// Signed Meta webhook and existing durable inbox message are both
			// necessary. The CONTROL routine rechecks sender, message type,
			// connected Store/realm and exact STOP body independently.
			var suppressed bool
			if err := tx.QueryRow(r.Context(), "SELECT briofold_growth_provider_opt_out($1::uuid,$2)", connection, id).Scan(&suppressed); err != nil {
				return err
			}
			if !suppressed {
				return errors.New("signed marketing opt-out could not be recorded")
			}
		}
		if provider == "wa" && accepted {
			_, err := tx.Exec(r.Context(), "SELECT briofold_customer_whatsapp_identity($1::uuid,$2)", connection, from)
			return err
		}
		return nil
	}
	if fresh {
		for _, status := range parseInboxStatuses(raw) {
			var connection, workspace string
			var credential []byte
			lookupErr := tx.QueryRow(r.Context(), "SELECT * FROM inbox_provider_connections($1,$2)", provider, status.Account).Scan(&connection, &workspace, &credential)
			if errors.Is(lookupErr, pgx.ErrNoRows) {
				continue
			}
			if lookupErr != nil {
				fail(w, 503, "SOURCE_UNAVAILABLE")
				return
			}
			if status.Watermark {
				_, err = tx.Exec(r.Context(), "SELECT inbox_seen_watermark($1::uuid,$2,$3)", connection, status.Recipient, status.At)
			} else {
				_, err = tx.Exec(r.Context(), "SELECT inbox_status($1::uuid,$2,$3,$4)", connection, status.Message, status.Status, status.At)
			}
			if err != nil {
				fail(w, 503, "SOURCE_UNAVAILABLE")
				return
			}
		}
		for _, entry := range payload.Entry {
			for _, m := range entry.Messaging {
				if m.Message.MID == "" || m.Message.IsEcho {
					continue
				}
				kind := "text"
				text := m.Message.Text
				if text == "" {
					kind = "unsupported"
					text = "এই ধরনের মেসেজ এখানে দেখানো যায় না।"
				}
				if err = ingest(entry.ID, m.Message.MID, m.Sender.ID, "", text, kind, time.UnixMilli(m.Timestamp)); err != nil {
					fail(w, 503, "SOURCE_UNAVAILABLE")
					return
				}
			}
			for _, change := range entry.Changes {
				for _, m := range change.Value.Messages {
					if m.Type == "reaction" {
						continue
					}
					kind, text := m.Type, m.Text.Body
					if kind != "text" {
						kind = "unsupported"
						text = "এই ধরনের মেসেজ এখানে দেখানো যায় না।"
					}
					at, parseErr := time.ParseDuration(m.Timestamp + "s")
					if parseErr != nil {
						fail(w, 422, "INVALID_WEBHOOK_TIME")
						return
					}
					name := ""
					for _, c := range change.Value.Contacts {
						if c.WAID == m.From {
							name = c.Profile.Name
						}
					}
					if err = ingest(change.Value.Metadata.Phone, m.ID, m.From, name, text, kind, time.Unix(0, 0).Add(at)); err != nil {
						fail(w, 503, "SOURCE_UNAVAILABLE")
						return
					}
				}
			}
		}
	}
	if fresh {
		for _, comment := range parseComments(raw) {
			var accepted bool
			if err = tx.QueryRow(r.Context(), "SELECT briofold_comment_ingest($1,$2,$3,$4,$5,$6,$7)", provider, comment.Account, comment.ID, comment.Post, comment.Author, comment.Text, comment.Removed).Scan(&accepted); err != nil {
				fail(w, 503, "SOURCE_UNAVAILABLE")
				return
			}
		}
		if err = s.persistInboxMedia(r.Context(), tx, provider, raw); err != nil {
			fail(w, 503, "SOURCE_UNAVAILABLE")
			return
		}
	}
	if tx.Commit(r.Context()) != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	write(w, 200, map[string]bool{"accepted": true})
}

// An ambiguous timeout is UNCERTAIN, never silently auto-resends a customer message.
func (s *Service) RunInboxSender(ctx context.Context) {
	ticks := 0
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ticks++
			if s.Pipeline != nil && s.Pipeline.Control != nil {
				s.sendInboxPush(ctx)
				if ticks%10 == 0 {
					_, _ = s.Pipeline.Control.Exec(ctx, "SELECT briofold_inbox_alert_sweep()")
				}
			}
			var raw []byte
			if s.Pipeline == nil || s.Pipeline.Control == nil {
				continue
			}
			if err := s.Pipeline.Control.QueryRow(ctx, "SELECT inbox_next_send()").Scan(&raw); err != nil || len(raw) == 0 {
				continue
			}
			var job inboxSendJob
			if json.Unmarshal(raw, &job) != nil {
				continue
			}
			if job.Channel == "site" {
				_, _ = s.Pipeline.Control.Exec(ctx, "SELECT inbox_finish_send($1::uuid,$2,'sent','')", job.ID, "site:"+job.ID)
				continue
			}
			state, id, safe := "failed", "", "CHANNEL_NOT_CONFIGURED"
			version := os.Getenv("META_GRAPH_VERSION")
			encoded, err := base64.StdEncoding.DecodeString(job.Credential)
			token, decryptErr := merchantwebhook.Decrypt(s.Pipeline.Key, encoded, job.Workspace+"|inbox|"+job.Channel+"|"+job.Account)
			if err == nil && decryptErr == nil && strings.HasPrefix(version, "v") && !strings.ContainsAny(version, "/?#") {
				payload, payloadErr := s.inboxSendPayload(ctx, job, string(token), version)
				if payloadErr != nil {
					_, _ = s.Pipeline.Control.Exec(ctx, "SELECT inbox_finish_send($1::uuid,'','failed','MEDIA_PREPARATION_FAILED')", job.ID)
					continue
				}
				data, _ := json.Marshal(payload)
				req, _ := http.NewRequestWithContext(ctx, "POST", "https://graph.facebook.com/"+version+"/"+url.PathEscape(job.Account)+"/messages", bytes.NewReader(data))
				req.Header.Set("Authorization", "Bearer "+string(token))
				req.Header.Set("Content-Type", "application/json")
				response, e := inboxHTTP.Do(req)
				if e != nil {
					state = "uncertain"
					safe = "PROVIDER_OUTCOME_UNKNOWN"
				} else {
					var result struct {
						MID      string `json:"message_id"`
						Messages []struct {
							ID string `json:"id"`
						} `json:"messages"`
					}
					parseErr := json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&result)
					response.Body.Close()
					if response.StatusCode >= 200 && response.StatusCode < 300 && parseErr == nil {
						id = result.MID
						if len(result.Messages) > 0 {
							id = result.Messages[0].ID
						}
						if id != "" || job.Type == "reaction" {
							state = "sent"
							safe = ""
						} else {
							state = "uncertain"
							safe = "PROVIDER_OUTCOME_UNKNOWN"
						}
					} else if response.StatusCode >= 500 {
						state = "uncertain"
						safe = "PROVIDER_OUTCOME_UNKNOWN"
					} else {
						safe = "PROVIDER_SEND_REJECTED"
					}
				}
			}
			_, _ = s.Pipeline.Control.Exec(ctx, "SELECT inbox_finish_send($1::uuid,$2,$3,$4)", job.ID, id, state, safe)
			if state == "sent" && job.Type == "reaction" {
				_, _ = s.Pipeline.Control.Exec(ctx, "SELECT inbox_reaction_finish($1::uuid)", job.ID)
			}
		}
	}
}
