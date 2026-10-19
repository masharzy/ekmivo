package checkout

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
)

// Reparse only server-stored ciphertext, never user-submitted replacement text.
// Current control authorization and the existing unique-attempt matcher still apply.
func RecoverPendingPhoneReceipts(ctx context.Context, pool, control *pgxpool.Pool, realm string, key, payerKey []byte, rulesJSON string) error {
	if len(key) != 32 || len(payerKey) < 32 {
		return errors.New("receipt recovery keys unavailable")
	}
	var installed bool
	if err := pool.QueryRow(ctx, "SELECT to_regprocedure('pg108_pending_phone_receipts()') IS NOT NULL").Scan(&installed); err != nil {
		return err
	}
	if !installed {
		return nil
	}
	var raw []byte
	if err := pool.QueryRow(ctx, "SELECT pg108_pending_phone_receipts()").Scan(&raw); err != nil {
		return err
	}
	var rows []struct {
		ID          string `json:"id"`
		Workspace   string `json:"workspace_id"`
		Environment string `json:"environment"`
		Phone       string `json:"phone_id"`
		Event       string `json:"event_id"`
		Sender      string `json:"sender"`
		Cipher      string `json:"cipher"`
		Version     int64  `json:"version"`
	}
	if err := json.Unmarshal(raw, &rows); err != nil {
		return err
	}
	rules := builtinSMSRules()
	var custom []deviceevidence.ParserRule
	if strings.TrimSpace(rulesJSON) != "" {
		if err := json.Unmarshal([]byte(rulesJSON), &custom); err != nil {
			return err
		}
		rules = append(rules, custom...)
	}
	for _, row := range rows {
		if row.Environment != realm {
			return errors.New("receipt recovery realm mismatch")
		}
		var active bool
		var version int64
		if err := control.QueryRow(ctx, "SELECT source_version,active FROM resolve_financial_projection($1::uuid,$2)", row.Workspace, realm).Scan(&version, &active); err != nil || !active || version != row.Version {
			continue
		}
		cipher, err := base64.StdEncoding.DecodeString(row.Cipher)
		if err != nil {
			return err
		}
		plain, err := merchantwebhook.Decrypt(key, cipher, row.Phone+"|"+row.Event)
		if err != nil {
			return err
		}
		var parsed *deviceevidence.ParsedReceipt
		for _, rule := range rules {
			if !strings.EqualFold(rule.Source, row.Sender) {
				continue
			}
			p, e := rule.Parse(rule.Source, realm, string(plain))
			if e != nil {
				continue
			}
			if parsed != nil {
				parsed = nil
				break
			}
			parsed = &p
		}
		if parsed == nil || parsed.Method != strings.ToLower(row.Sender) {
			continue
		}
		contact, _ := json.Marshal(map[string]string{"name": "", "email": "", "phone": parsed.Payer})
		encrypted, err := deviceevidence.Encrypt(key, contact, row.Workspace+"|"+realm+"|refund-customer")
		if err != nil {
			return err
		}
		var observation *string
		if err := pool.QueryRow(ctx, "SELECT pg108_recover_phone_receipt($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10)", row.ID, row.Version, deviceevidence.Identity(payerKey, parsed.Payer), parsed.Amount, parsed.TransactionAt, parsed.Precision, deviceevidence.Identity(payerKey, "receipt|"+parsed.Method+"|"+parsed.Reference), parsed.Method, parsed.Version, encrypted).Scan(&observation); err != nil {
			return err
		}
	}
	return nil
}
