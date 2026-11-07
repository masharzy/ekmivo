package financial

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
	"github.com/masharzy/briofold/backend/internal/receiptnotice"
	"github.com/riverqueue/river"
)

type NoticeArgs struct {
	Environment string `json:"environment"`
}

func (NoticeArgs) Kind() string { return "receipt_notice" }

type NoticeWorker struct {
	river.WorkerDefaults[NoticeArgs]
	Pipeline *PipelineWorker
}

func (*NoticeWorker) Timeout(*river.Job[NoticeArgs]) time.Duration { return 15 * time.Second }
func (w *NoticeWorker) Work(ctx context.Context, job *river.Job[NoticeArgs]) (workErr error) {
	if w.Pipeline == nil || job.Args.Environment != w.Pipeline.Realm {
		return errors.New("notice realm unavailable")
	}
	if w.Pipeline.TrackHealth {
		defer func() { RecordWorkerHealth(w.Pipeline.Pool, "notice", w.Pipeline.Realm, workErr == nil) }()
	}
	return w.Pipeline.drainNotice(ctx)
}

func (w *PipelineWorker) drainNotice(ctx context.Context) error {
	if w.NoticeSMTP == nil {
		return nil
	}
	items, err := w.pending(ctx, "pg08_notice_due")
	if err != nil {
		return errors.New("notice queue unavailable")
	}
	for _, p := range items {
		if !w.authorized(ctx, p) {
			continue
		}
		var raw []byte
		if err = w.Pool.QueryRow(ctx, "SELECT pg08_notice_claim($1::uuid,$2)", p.ID, p.Version).Scan(&raw); err != nil {
			return errors.New("notice claim unavailable")
		}
		if len(raw) == 0 {
			return nil
		}
		var claim struct {
			ID        string    `json:"id"`
			Lease     string    `json:"lease_id"`
			Email     string    `json:"email_cipher"`
			Consented time.Time `json:"consented_at"`
			Verified  time.Time `json:"verified_at"`
			Locale    string    `json:"locale"`
			Event     struct {
				Data struct {
					Amount    int64  `json:"amount_minor"`
					Currency  string `json:"currency"`
					Reference string `json:"merchant_reference"`
					Method    string `json:"verification_method"`
				} `json:"data"`
			} `json:"event"`
		}
		if json.Unmarshal(raw, &claim) != nil {
			return errors.New("invalid notice claim")
		}
		cipher, err := base64.StdEncoding.DecodeString(claim.Email)
		if err != nil {
			return errors.New("invalid notice ciphertext")
		}
		email, err := merchantwebhook.Decrypt(w.EncryptionKey, cipher, p.Workspace+"|"+p.Realm+"|notice-email")
		if err != nil {
			return errors.New("notice key unavailable")
		}
		text := fmt.Sprintf("Your payment was verified.\nAmount: %d.%02d %s\nReference: %s\nVerification: %s\n", claim.Event.Data.Amount/100, claim.Event.Data.Amount%100, claim.Event.Data.Currency, claim.Event.Data.Reference, claim.Event.Data.Method)
		if p.Realm == "sandbox" {
			text = "SANDBOX — NO REAL MONEY\n" + text
		}
		subject := "Briofold payment receipt"
		if claim.Locale == "bn" {
			subject = "Briofold পেমেন্টের রসিদ"
			text = fmt.Sprintf("আপনার পেমেন্ট যাচাই হয়েছে।\nপরিমাণ: %d.%02d %s\nরেফারেন্স: %s\nযাচাইয়ের পদ্ধতি: %s\n", claim.Event.Data.Amount/100, claim.Event.Data.Amount%100, claim.Event.Data.Currency, claim.Event.Data.Reference, claim.Event.Data.Method)
			if p.Realm == "sandbox" {
				text = "পরীক্ষামূলক — আসল টাকা নয়\n" + text
			}
		}
		err = receiptnotice.SendSMTP(ctx, *w.NoticeSMTP, receiptnotice.Message{
			Recipient: receiptnotice.Recipient{Workspace: p.Workspace, Environment: p.Realm, Email: string(email), ConsentedAt: claim.Consented, VerifiedAt: claim.Verified},
			Workspace: p.Workspace, Environment: p.Realm, MessageID: claim.ID, Subject: subject, Text: text,
		})
		outcome := "accepted"
		if err != nil {
			outcome = "failed"
		}
		if errors.Is(err, receiptnotice.ErrOutcomeUnknown) {
			outcome = "unknown"
		}
		var recorded bool
		if err = w.Pool.QueryRow(ctx, "SELECT pg08_notice_finish($1::uuid,$2::uuid,$3)", claim.ID, claim.Lease, outcome).Scan(&recorded); err != nil {
			return errors.New("notice outcome unavailable")
		}
		return nil
	}
	return nil
}
