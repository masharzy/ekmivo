package checkout

import (
    "errors"
    "net/http"
    "regexp"
    "strings"
    "time"

    "github.com/jackc/pgx/v5"
    "github.com/masharzy/ekmivo/backend/internal/deviceevidence"
)

// Transaction lookup is a scoped, read-only companion to automatic verification.
// A user-provided TrxID cannot mint a verified payment or consume a receipt.
// Only an already verified, uniquely allocated observation for this intent passes.
var merchantTrxIDPattern = regexp.MustCompile(`^[A-Za-z0-9_.:-]{4,128}$`)

type transactionLookupRequest struct {
    TransactionID string `json:"transaction_id"`
    Provider string `json:"provider"`
    AmountMinor int64 `json:"amount_minor"`
}

func (s *Service) HandleTransactionLookup(w http.ResponseWriter, r *http.Request) {
    if s == nil || !s.ready() {
        fail(w, 503, "FINANCIAL_SERVICE_UNAVAILABLE")
        return
    }
    ws, realm, intentID := r.PathValue("workspaceID"), explicitRealm(r), r.PathValue("intentID")
    if !uuidPattern.MatchString(ws) || !uuidPattern.MatchString(intentID) || (realm != "live" && realm != "sandbox") {
        fail(w, 400, "INVALID_SCOPE")
        return
    }
    if err := s.merchant(r, ws, realm, "payments:read"); err != nil {
        authError(w, err)
        return
    }
    if !s.budget(w, "trx-lookup:"+ws+":"+realm, 60) {
        return
    }
    var input transactionLookupRequest
    if !decode(w, r, &input) {
        return
    }
    input.TransactionID = strings.TrimSpace(input.TransactionID)
    input.Provider = strings.ToLower(strings.TrimSpace(input.Provider))
    if !merchantTrxIDPattern.MatchString(input.TransactionID) ||
        (input.Provider != "bkash" && input.Provider != "nagad" && input.Provider != "rocket") ||
        input.AmountMinor <= 0 {
        fail(w, 422, "INVALID_TRANSACTION_LOOKUP")
        return
    }
    hash := deviceevidence.Identity(s.PayerKey, "receipt|"+input.Provider+"|"+input.TransactionID)
    var paymentID string
    var verifiedAt time.Time
    err := s.scoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
        return tx.QueryRow(r.Context(), `
            SELECT p.id::text, p.verified_at
            FROM payment_intents i
            JOIN payment_attempts a
              ON a.intent_id=i.id AND a.workspace_id=i.workspace_id AND a.environment=i.environment
            JOIN financial_payments p
              ON p.attempt_id=a.id AND p.workspace_id=i.workspace_id AND p.environment=i.environment
            JOIN financial_receipt_observations o
              ON o.id=p.observation_id AND o.workspace_id=i.workspace_id AND o.environment=i.environment
            WHERE i.id=$3::uuid AND i.workspace_id=$1::uuid AND i.environment=$2
              AND o.provider_reference_hmac=$4 AND o.method=$5 AND o.direction='incoming'
              AND p.verified_amount_minor=$6 AND o.amount_minor=$6 AND i.amount_minor=$6
              AND o.payer_hmac=a.payer_hmac
              AND o.original_transaction_at>=a.window_start
              AND o.original_transaction_at<a.window_end
            LIMIT 1`, ws, realm, intentID, hash, input.Provider, input.AmountMinor).Scan(&paymentID, &verifiedAt)
    })
    if errors.Is(err, pgx.ErrNoRows) {
        // Do not expose whether a receipt exists for a different payer, order or tenant.
        write(w, 200, map[string]any{"verified":false,"status":"pending","payment_intent_id":intentID})
        return
    }
    if err != nil {
        mapped(w, err)
        return
    }
    write(w, 200, map[string]any{
        "verified":true,"status":"verified","payment_intent_id":intentID,
        "payment_id":paymentID,"verified_at":verifiedAt.UTC().Format(time.RFC3339Nano),
    })
}
