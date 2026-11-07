package checkout

import (
	"encoding/base64"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"github.com/masharzy/briofold/backend/internal/deviceevidence"
	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
	"net/http"
	"strings"
)

// Supplement the existing receipt page; decryption requires session management
// authority. API payment-read keys and viewers never receive full receipt text.
func (s *Service) supplementSMS(r *http.Request, ws, realm string, result map[string]any) error {
	items, ok := result["items"].([]any)
	if !ok || len(items) == 0 {
		return nil
	}
	if err := s.pipelineSession(r, ws, realm, true); err != nil {
		return nil
	}
	ids := []string{}
	byID := map[string]map[string]any{}
	for _, item := range items {
		if row, ok := item.(map[string]any); ok {
			if id, ok := row["id"].(string); ok && uuidPattern.MatchString(id) {
				ids = append(ids, id)
				byID[id] = row
			}
		}
	}
	if len(ids) == 0 {
		return nil
	}
	var raw []byte
	var installed bool
	err := s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		if err := tx.QueryRow(r.Context(), "SELECT to_regprocedure('pg64_sms_evidence(uuid,text,uuid[])') IS NOT NULL").Scan(&installed); err != nil {
			return err
		}
		if !installed {
			return nil
		}
		return tx.QueryRow(r.Context(), "SELECT pg64_sms_evidence($1::uuid,$2,$3::uuid[])", ws, realm, ids).Scan(&raw)
	})
	if err != nil {
		return err
	}
	if !installed {
		result["sms_details_available"] = false
		return nil
	}
	var evidence []struct {
		ID     string `json:"id"`
		Phone  string `json:"phone_id"`
		Event  string `json:"event_id"`
		Sender string `json:"sender"`
		Device string `json:"device_name"`
		Cipher string `json:"cipher_b64"`
	}
	if err := json.Unmarshal(raw, &evidence); err != nil {
		return err
	}
	for _, row := range evidence {
		target := byID[row.ID]
		if target == nil {
			continue
		}
		cipher, err := base64.StdEncoding.DecodeString(row.Cipher)
		if err != nil {
			continue
		}
		plain, err := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, row.Phone+"|"+row.Event)
		if err != nil {
			continue
		}
		target["sms_text"] = string(plain)
		target["device_name"] = row.Device
		var parsed *deviceevidence.ParsedReceipt
		for _, rule := range s.Pipeline.Rules {
			if !rule.Approved || (rule.SandboxOnly && realm != "sandbox") || !strings.EqualFold(rule.Source, row.Sender) {
				continue
			}
			receipt, err := rule.Parse(rule.Source, realm, string(plain))
			if err != nil {
				continue
			}
			if parsed != nil {
				parsed = nil
				break
			}
			parsed = &receipt
		}
		if parsed != nil {
			target["payer_number"] = parsed.Payer
			target["transaction_id"] = parsed.Reference
			target["amount_minor"] = parsed.Amount
			target["method"] = parsed.Method
			target["original_transaction_at"] = parsed.TransactionAt
		}
	}
	result["sms_details_available"] = true
	return nil
}
