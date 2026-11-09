package checkout

import (
	"context"
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/masharzy/briofold/backend/internal/deviceevidence"
)

// Phase 4: a customer's TrxID is only a claim. It becomes `verified` when the independent financial
// realm holds a matching SMS receipt. The TrxID never reaches the control database or logs: the
// tool loop replaces it with a keyed digest (same digest as the receipt lookup) and its last 4 chars.

func aiPaymentVerifyEnabled() bool { return os.Getenv("BRIOFOLD_AI_PAYMENT_VERIFY_ENABLED") == "true" }

type aiClaim struct {
	ID        string    `json:"id"`
	Workspace string    `json:"workspace_id"`
	Env       string    `json:"environment"`
	Method    string    `json:"method"`
	Digest    string    `json:"digest"`
	DueMinor  int64     `json:"due_minor"`
	OrderAt   time.Time `json:"order_created_at"`
}

type aiReceipt struct {
	Method      string
	AmountMinor int64
	At          time.Time
	Direction   string
	OwnAccount  bool // receipt arrived on a receiving account of this workspace
}

// matchClaim returns "matched", "retry" (no receipt yet), "review" (needs the owner) or "failed", plus a reason.
func matchClaim(c aiClaim, r *aiReceipt) (string, string) {
	if r == nil {
		return "retry", "no_receipt"
	}
	switch {
	case r.Direction != "incoming":
		return "failed", "not_incoming"
	case !r.OwnAccount:
		return "failed", "wrong_account"
	case r.Method != c.Method:
		return "failed", "wrong_method"
	case r.At.Before(c.OrderAt.Add(-1 * time.Minute)):
		return "failed", "payment_before_order"
	case r.AmountMinor < c.DueMinor:
		return "review", "short_payment"
	case r.AmountMinor > c.DueMinor:
		return "review", "over_payment"
	}
	return "matched", ""
}

var trxRaw = regexp.MustCompile(`^[A-Za-z0-9_.:-]{4,128}$`)

// aiProofArgs swaps the raw transaction id for digest + last4. Returns false when it is unusable.
func (s *Service) aiProofArgs(args map[string]any) bool {
	raw, _ := args["transaction_id"].(string)
	method, _ := args["method"].(string)
	raw = strings.TrimSpace(raw)
	method = strings.ToLower(strings.TrimSpace(method))
	if !trxRaw.MatchString(raw) || (method != "bkash" && method != "nagad" && method != "rocket") {
		return false
	}
	delete(args, "transaction_id")
	args["method"] = method
	args["transaction_digest"] = deviceevidence.Identity(s.PayerKey, "receipt|"+method+"|"+raw)
	args["transaction_last4"] = raw[len(raw)-4:]
	return true
}

func (s *Service) lookupAIReceipt(ctx context.Context, c aiClaim) (*aiReceipt, error) {
	var out *aiReceipt
	err := s.scoped(ctx, c.Workspace, c.Env, func(tx pgx.Tx) error {
		var r aiReceipt
		var own bool
		e := tx.QueryRow(ctx, `SELECT o.method,o.amount_minor,o.original_transaction_at,o.direction,
			EXISTS(SELECT 1 FROM financial_receiving_accounts a WHERE a.id=o.receiving_account_id AND a.workspace_id=o.workspace_id)
			FROM financial_receipt_observations o WHERE o.workspace_id=$1::uuid AND o.environment=$2 AND o.provider_reference_hmac=$3
			ORDER BY o.original_transaction_at DESC LIMIT 1`, c.Workspace, c.Env, c.Digest).Scan(&r.Method, &r.AmountMinor, &r.At, &r.Direction, &own)
		if e == pgx.ErrNoRows {
			return nil
		}
		if e != nil {
			return e
		}
		r.OwnAccount = own
		out = &r
		return nil
	})
	return out, err
}

// RunAIPaymentVerify checks pending claims every minute (the SQL resolver moves a claim to the owner
// review queue after 15 minutes without a matching receipt) and expires stale AI drafts.
func (s *Service) RunAIPaymentVerify(ctx context.Context) {
	if !aiPaymentVerifyEnabled() || s.Pipeline == nil {
		return
	}
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.verifyAIClaimsOnce(ctx)
		}
	}
}

func (s *Service) verifyAIClaimsOnce(ctx context.Context) {
	var raw []byte
	if s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_claims_due(20)").Scan(&raw) != nil {
		return
	}
	var claims []aiClaim
	if json.Unmarshal(raw, &claims) != nil {
		return
	}
	for _, c := range claims {
		receipt, err := s.lookupAIReceipt(ctx, c)
		if err != nil {
			continue // transient: stays pending, tried again next minute
		}
		outcome, why := matchClaim(c, receipt)
		var res []byte
		_ = s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_claim_resolve($1::uuid,$2,$3)", c.ID, outcome, why).Scan(&res)
	}
	var n int
	_ = s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_expire_drafts()").Scan(&n)
}
