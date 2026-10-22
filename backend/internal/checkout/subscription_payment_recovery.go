package checkout

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/masharzy/ekmivo/backend/internal/subscriptionpayment"
)

// Only the dedicated Live financial worker may apply verified subscription
// transitions. This function is never called by a browser request.
// The payment digest is an immutable locator persisted before the financial
// create; it remains usable across API restarts and signing-key rotation.
func reconcileSubscriptionPayments(ctx context.Context, control, finance aiTopupQueryer, realm string, enabled bool) error {
	if !enabled || realm != "live" {return nil}
	if control == nil || finance == nil {return errors.New("subscription reconciliation unavailable")}
	var raw []byte
	if err:=control.QueryRow(ctx,"SELECT platform_subscription_payment_pending()").Scan(&raw);err!=nil {
		return errors.New("subscription pending cursor unavailable")
	}
	var queue []struct {
		Intent string `json:"intent_id"`
		Invoice string `json:"invoice_id"`
		Workspace string `json:"workspace_id"`
		Receiver string `json:"receiving_workspace_id"`
		Digest string `json:"checkout_token_digest"`
		Amount int64 `json:"amount_minor"`
		State string `json:"state"`
	}
	if len(raw)==0 || json.Unmarshal(raw,&queue)!=nil || len(queue)>50 {
		return errors.New("subscription pending cursor invalid")
	}
	var firstErr error
	for _, pending:=range queue {
		if err:=ctx.Err();err!=nil {return err}
		if !uuidPattern.MatchString(pending.Intent)||!uuidPattern.MatchString(pending.Invoice)||
			!uuidPattern.MatchString(pending.Workspace)||!uuidPattern.MatchString(pending.Receiver)||
			pending.Workspace==pending.Receiver||!validAICreditProofDigest(pending.Digest)||
			pending.Amount<=0||pending.State!="awaiting_payment"&&pending.State!="expired"&&
			pending.State!="cancelled"&&pending.State!="recovery_required" {
			firstErr=errors.New("subscription pending scope invalid")
			continue
		}
		var proofRaw []byte
		var state sql.NullString
		if err:=finance.QueryRow(ctx,
			"SELECT pg13_platform_payment($1),pg05_checkout_view($1)->>'state'",
			pending.Digest).Scan(&proofRaw,&state);err!=nil {
			firstErr=errors.New("subscription financial status unavailable")
			continue
		}
		proof, verified, err:=decodeBillingPaymentProof(proofRaw,pending.Receiver,pending.Amount)
		if err!=nil {
			firstErr=errors.New("subscription financial proof mismatch")
			continue
		}
		// Missing financial intent after a crash is an incomplete handoff, not
		// an authorization to retry blindly or to release the buyer's coupon.
		if !state.Valid || state.String=="" {continue}
		if state.String=="completed" && verified {
			if pending.State!="awaiting_payment" {
				reason:="expired_verified"
				if pending.State=="cancelled" {reason="cancelled_verified"}
				var recorded bool
				err=control.QueryRow(ctx,"SELECT platform_subscription_payment_recover($1::uuid,$2::uuid,$3)",
					pending.Intent,proof.ID,reason).Scan(&recorded)
				if err!=nil||!recorded {firstErr=errors.New("subscription late-money recovery unavailable")}
				continue
			}
			var applied bool
			err=control.QueryRow(ctx,
				"SELECT platform_subscription_payment_settle($1::uuid,$2::uuid,$3,$4,$5::uuid)",
				pending.Intent,proof.ID,proof.Amount,proof.At,pending.Receiver).Scan(&applied)
			if err!=nil||!applied {firstErr=errors.New("subscription verified entitlement settlement unavailable")}
			continue
		}
		if state.String=="completed"&&!verified {
			firstErr=errors.New("financial checkout completed without verified allocation")
			continue
		}
		if state.String=="expired"||state.String=="cancelled" {
			if verified {
				reason:=state.String+"_verified"
				var recorded bool
				err=control.QueryRow(ctx,"SELECT platform_subscription_payment_recover($1::uuid,$2::uuid,$3)",
					pending.Intent,proof.ID,reason).Scan(&recorded)
				if err!=nil||!recorded {firstErr=errors.New("subscription terminal-money recovery unavailable")}
			} else if pending.State=="awaiting_payment" {
				var changed bool
				err=control.QueryRow(ctx,"SELECT platform_subscription_payment_terminal($1::uuid,$2)",
					pending.Intent,state.String).Scan(&changed)
				if err!=nil||!changed {firstErr=errors.New("subscription terminal release unavailable")}
			}
			continue
		}
		if state.String=="exception" {
			firstErr=fmt.Errorf("subscription payment requires operator diagnosis")
			continue
		}
		if state.String!="requires_payer"&&state.String!="awaiting_payment"&&state.String!="processing" {
			firstErr=errors.New("subscription financial state unrecognized")
		}
	}
	return firstErr
}
