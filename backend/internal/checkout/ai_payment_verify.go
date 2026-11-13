package checkout

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
)

// Phase 4: a customer's TrxID is only a claim. It becomes `verified` when the independent financial
// realm holds a matching SMS receipt: same TrxID digest, method, sender (payer digest), a receiving
// account allowed by the AI selling settings, the full amount, after the order was created, and not
// already used by a checkout payment. The TrxID and sender number never reach the control database
// or logs; aiProofArgs replaces them with the same keyed digests the SMS pipeline stores.

func aiPaymentVerifyEnabled() bool { return os.Getenv("BRIOFOLD_AI_PAYMENT_VERIFY_ENABLED") == "true" }

type aiClaim struct {
	ID          string    `json:"id"`
	Workspace   string    `json:"workspace_id"`
	Env         string    `json:"environment"`
	Method      string    `json:"method"`
	Digest      string    `json:"digest"`
	PayerDigest string    `json:"payer_digest"`
	DueMinor    int64     `json:"due_minor"`
	OrderAt     time.Time `json:"order_created_at"`
	ServiceMode string    `json:"service_mode"`
	Accounts    []string  `json:"accounts"` // empty = any receiving account of the workspace
}

type aiReceipt struct {
	Method      string    `json:"method"`
	AmountMinor int64     `json:"amount_minor"`
	At          time.Time `json:"at"`
	Direction   string    `json:"direction"`
	PayerHMAC   string    `json:"payer_hmac"`
	Account     string    `json:"receiving_account_id"`
	Allocated   bool      `json:"allocated"`
	Checkout    string    `json:"checkout_status"` // realm matcher decision for this receipt
}

// matchClaim returns "matched", "retry" (no receipt yet), "review" (needs the owner) or "failed", plus a reason.
func matchClaim(c aiClaim, r *aiReceipt) (string, string) {
	if c.ServiceMode == "ai" {
		return "review", "ai_only_never_verified"
	}
	if r == nil {
		return "retry", "no_matching_sms"
	}
	accountOK := len(c.Accounts) == 0
	for _, a := range c.Accounts {
		if a == r.Account {
			accountOK = true
		}
	}
	switch {
	case r.Direction != "incoming":
		return "failed", "not_incoming"
	case r.Allocated || r.Checkout == "matched":
		return "failed", "already_used"
	case r.Checkout == "" || r.Checkout == "pending":
		// The checkout matcher has not decided yet; claiming now could double-spend the receipt.
		return "retry", "checkout_matcher_pending"
	case r.Checkout != "unmatched":
		return "review", "checkout_" + r.Checkout
	case r.Method != c.Method:
		return "failed", "wrong_method"
	case !accountOK:
		return "review", "wrong_receiving_account"
	case r.PayerHMAC == "" || r.PayerHMAC != c.PayerDigest:
		return "review", "sender_mismatch"
	case r.At.Before(c.OrderAt.Add(-1 * time.Minute)):
		return "review", "payment_before_order"
	case r.AmountMinor < c.DueMinor:
		return "review", "short_payment"
	case r.AmountMinor > c.DueMinor:
		return "review", "over_payment"
	}
	return "matched", ""
}

// lookupAIReceipt reads through the realm function pg236_ai_receipt (the API role has no direct table access).
func (s *Service) lookupAIReceipt(ctx context.Context, c aiClaim) (*aiReceipt, error) {
	var out *aiReceipt
	err := s.scoped(ctx, c.Workspace, c.Env, func(tx pgx.Tx) error {
		var raw []byte
		if e := tx.QueryRow(ctx, "SELECT pg236_ai_receipt($1::uuid,$2,$3)", c.Workspace, c.Env, c.Digest).Scan(&raw); e != nil {
			return e
		}
		if len(raw) == 0 || string(raw) == "null" {
			return nil
		}
		var r aiReceipt
		if e := json.Unmarshal(raw, &r); e != nil {
			return e
		}
		out = &r
		return nil
	})
	return out, err
}

// RunAIPaymentVerify checks pending claims every minute (the SQL resolver moves a claim to the owner
// review queue after 15 minutes without a matching receipt), expires stale AI drafts and sends owner notices.
func (s *Service) RunAIPaymentVerify(ctx context.Context) {
	if (!aiPaymentVerifyEnabled() && !aiToolsEnabled()) || s.Pipeline == nil {
		return
	}
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if os.Getenv("BRIOFOLD_AI_CHANNEL_COMMERCE_ENABLED") == "true" {
				s.resolveAIOrderPaymentLinks(ctx)
			}
			if aiPaymentVerifyEnabled() {
				s.verifyAIClaimsOnce(ctx)
			} else {
				var n int
				_ = s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_expire_drafts()").Scan(&n)
			}
			s.processAINotices(ctx, 20)
		}
	}
}

// reviewLateSMS re-checks claims that went to review only because no SMS had arrived (the forwarding phone was
// offline, the SMS was late). When the receipt now matches exactly, the claim is verified without the owner.
func (s *Service) reviewLateSMS(ctx context.Context) {
	if os.Getenv("BRIOFOLD_AI_LATE_SMS_REVIEW_ENABLED") != "true" {
		return
	}
	var raw []byte
	if err := s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_sms_review_due(10)").Scan(&raw); err != nil {
		log.Printf("ai payment verify: sms_review_due failed")
		return
	}
	var claims []aiClaim
	if json.Unmarshal(raw, &claims) != nil {
		return
	}
	for _, c := range claims {
		if c.ServiceMode == "ai" {
			continue
		}
		receipt, err := s.lookupAIReceipt(ctx, c)
		if err != nil || receipt == nil {
			continue
		}
		if outcome, _ := matchClaim(c, receipt); outcome != "matched" {
			continue
		}
		var acct any
		if receipt.Account != "" {
			acct = receipt.Account
		}
		var res []byte
		if err := s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_claim_resolve($1::uuid,'matched','',$2::uuid)", c.ID, acct).Scan(&res); err != nil {
			log.Printf("ai payment verify: late sms resolve failed")
		}
	}
}

func (s *Service) verifyAIClaimsOnce(ctx context.Context) {
	var raw []byte
	if err := s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_claims_due(20)").Scan(&raw); err != nil {
		log.Printf("ai payment verify: claims_due failed")
		return
	}
	defer s.reviewLateSMS(ctx)
	var claims []aiClaim
	if json.Unmarshal(raw, &claims) != nil {
		return
	}
	for _, c := range claims {
		outcome, why, account := "review", "ai_only_never_verified", ""
		if c.ServiceMode != "ai" {
			receipt, err := s.lookupAIReceipt(ctx, c)
			if err != nil {
				// Counted as a retry so the 15 minute rule still moves it to the owner if lookups keep failing.
				outcome, why = "retry", "receipt_lookup_unavailable"
			} else {
				outcome, why = matchClaim(c, receipt)
				if receipt != nil {
					account = receipt.Account
				}
			}
		}
		var res []byte
		var acct any
		if account != "" {
			acct = account
		}
		if err := s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_claim_resolve($1::uuid,$2,$3,$4::uuid)", c.ID, outcome, why, acct).Scan(&res); err != nil {
			log.Printf("ai payment verify: resolve failed claim=%s", c.ID)
		}
	}
	var n int
	if err := s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_expire_drafts()").Scan(&n); err != nil {
		log.Printf("ai payment verify: expire drafts failed")
	}
}
