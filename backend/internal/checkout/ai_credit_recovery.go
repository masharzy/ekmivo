package checkout

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
)

type aiTopupQueryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

// No user session is required for recovery of an already accepted purchase.
// Neither a checkout redirect nor a control-database status is payment proof.
func reconcileAITopups(ctx context.Context, control, financial aiTopupQueryer, key []byte, realm string, enabled bool) error {
	if !enabled || realm != "live" {
		return nil
	}
	if control == nil || financial == nil || len(key) < 32 {
		return errors.New("AI top-up recovery unavailable")
	}
	var raw []byte
	if err := control.QueryRow(ctx, "SELECT briofold_ai_topup_claim_pending()").Scan(&raw); err != nil {
		return errors.New("AI top-up recovery queue unavailable")
	}
	var pending []struct {
		ID        string `json:"id"`
		Workspace string `json:"workspace_id"`
		Receiver  string `json:"receiving_workspace_id"`
		Amount    int64  `json:"amount_minor"`
	}
	if len(raw) == 0 || string(raw) == "null" || json.Unmarshal(raw, &pending) != nil || len(pending) > 50 {
		return errors.New("AI top-up recovery queue invalid")
	}
	service := &Service{TokenKey: key}
	var failed error
	for _, purchase := range pending {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if !uuidPattern.MatchString(purchase.ID) || !uuidPattern.MatchString(purchase.Workspace) || !uuidPattern.MatchString(purchase.Receiver) || purchase.Workspace == purchase.Receiver || purchase.Amount < 1000 || purchase.Amount > 10000000 {
			failed = errors.New("AI top-up recovery scope invalid")
			continue
		}
		var rawProof []byte
		token := digest(service.token(purchase.Receiver, "live", "ai-credit:"+purchase.ID))
		if err := financial.QueryRow(ctx, "SELECT pg13_platform_payment($1)", token).Scan(&rawProof); err != nil {
			failed = errors.New("AI top-up recovery proof unavailable")
			continue
		}
		proof, verified, err := decodeBillingPaymentProof(rawProof, purchase.Receiver, purchase.Amount)
		if err != nil {
			failed = errors.New("AI top-up recovery proof mismatch")
			continue
		}
		if !verified {
			continue
		}
		var result []byte
		if err := control.QueryRow(ctx, "SELECT briofold_ai_topup_credit_proof($1::uuid,$2::uuid,$3::uuid,$4)", purchase.Workspace, purchase.ID, proof.ID, proof.Amount).Scan(&result); err != nil {
			failed = errors.New("AI top-up recovery credit unavailable")
			continue
		}
		var applied struct {
			Credited *bool  `json:"credited"`
			Balance  *int64 `json:"balance_minor"`
		}
		if json.Unmarshal(result, &applied) != nil || applied.Credited == nil || applied.Balance == nil || *applied.Balance < 0 {
			failed = errors.New("AI top-up recovery credit response invalid")
		}
	}
	return failed
}
