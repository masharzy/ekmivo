package checkout

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"

	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
	"github.com/masharzy/briofold/backend/internal/receiptnotice"
)

// Owner notifications for AI orders (paid, COD, payment review). The database outbox guarantees one notice per order and
// kind; this drains it. Email goes to verified owner/admin accounts, push to the workspace's claimed devices.
// Message text names the order reference and amount only: no customer phone, address or TrxID.

type aiNotice struct {
	Order       string `json:"order_id"`
	Kind        string `json:"kind"`
	Workspace   string `json:"workspace_id"`
	Environment string `json:"environment"`
	Reference   string `json:"reference"`
	TotalMinor  int64  `json:"total_minor"`
	EmailState  string `json:"email_state"`
	PushState   string `json:"push_state"`
	Recipients  []struct {
		Email      string    `json:"email"`
		VerifiedAt time.Time `json:"verified_at"`
	} `json:"recipients"`
	Devices []struct {
		Device string `json:"device_id"`
		Token  string `json:"token"`
	} `json:"devices"`
}

// Injectable in tests; production uses SMTP and FCM.
var (
	aiSendEmail = func(ctx context.Context, s *Service, m receiptnotice.Message) error {
		if s.NoticeSMTP == nil {
			return errAINoticeUnconfigured
		}
		return receiptnotice.SendSMTP(ctx, *s.NoticeSMTP, m)
	}
	aiSendPush = func(ctx context.Context, token string, data map[string]string) error {
		project, email, key := fcmCredentials()
		if project == "" || email == "" || key == "" {
			return errAINoticeUnconfigured
		}
		access, err := fcmAccessToken(ctx, email, key)
		if err != nil {
			return err
		}
		body, _ := json.Marshal(map[string]any{"message": map[string]any{"token": token, "data": data, "android": map[string]string{"priority": "high"}}})
		req, _ := http.NewRequestWithContext(ctx, "POST", "https://fcm.googleapis.com/v1/projects/"+url.PathEscape(project)+"/messages:send", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+access)
		req.Header.Set("Content-Type", "application/json")
		res, err := inboxHTTP.Do(req)
		if err != nil {
			return err
		}
		io.Copy(io.Discard, io.LimitReader(res.Body, 65536))
		res.Body.Close()
		if res.StatusCode < 200 || res.StatusCode > 299 {
			return fmt.Errorf("fcm status %d", res.StatusCode)
		}
		return nil
	}
)

var errAINoticeUnconfigured = fmt.Errorf("notice channel not configured")

func aiNoticeText(n aiNotice) (string, string) {
	amount := fmt.Sprintf("%d.%02d BDT", n.TotalMinor/100, n.TotalMinor%100)
	switch n.Kind {
	case "paid":
		return "Payment verified: order " + n.Reference, "The AI assistant's order " + n.Reference + " is paid (" + amount + ") and confirmed. Please pack and ship it."
	case "cod":
		return "New COD order " + n.Reference, "The AI assistant confirmed cash-on-delivery order " + n.Reference + " (" + amount + "). Please pack and ship it."
	}
	return "Payment needs review: order " + n.Reference, "A payment for order " + n.Reference + " (" + amount + ") could not be verified automatically. Please check it in the review queue."
}

// processAINotices sends up to limit queued notices. A channel that is not configured counts as skipped, not failed.
func (s *Service) processAINotices(ctx context.Context, limit int) int {
	done := 0
	for i := 0; i < limit; i++ {
		var raw []byte
		if err := s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_next_notice()").Scan(&raw); err != nil || len(raw) == 0 || string(raw) == "null" {
			return done
		}
		var n aiNotice
		if json.Unmarshal(raw, &n) != nil {
			return done
		}
		subject, text := aiNoticeText(n)
		email, push := n.EmailState, n.PushState
		if email != "sent" && email != "skipped" {
			email = "skipped"
			for _, r := range n.Recipients {
				m := receiptnotice.Message{Recipient: receiptnotice.Recipient{Workspace: n.Workspace, Environment: n.Environment, Email: r.Email, ConsentedAt: r.VerifiedAt, VerifiedAt: r.VerifiedAt},
					Workspace: n.Workspace, Environment: n.Environment, MessageID: "ainotice-" + n.Order + "-" + n.Kind, Subject: subject, Text: text}
				if err := aiSendEmail(ctx, s, m); err == nil {
					email = "sent"
				} else if err != errAINoticeUnconfigured && email != "sent" {
					email = "failed"
				}
			}
		}
		if push != "sent" && push != "skipped" {
			push = "skipped"
			for _, d := range n.Devices {
				cipher, err := base64.StdEncoding.DecodeString(d.Token)
				token, de := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, n.Workspace+"|push|"+d.Device)
				if err != nil || de != nil {
					continue
				}
				data := map[string]string{"kind": "ai_order_" + n.Kind, "workspace_id": n.Workspace, "order_id": n.Order, "title": subject}
				if perr := aiSendPush(ctx, string(token), data); perr == nil {
					push = "sent"
				} else if perr != errAINoticeUnconfigured && push != "sent" {
					push = "failed"
				}
			}
		}
		if _, err := s.Pipeline.Control.Exec(ctx, "SELECT briofold_ai_finish_notice($1::uuid,$2,$3,$4)", n.Order, n.Kind, email, push); err != nil {
			log.Printf("ai notice finish failed order=%s", n.Order)
		}
		done++
	}
	return done
}
