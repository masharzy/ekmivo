package checkout

import (
    "encoding/base64"
    "encoding/json"
    "net/http"

    "github.com/jackc/pgx/v5"
    "github.com/masharzy/ekmivo/backend/internal/deviceevidence"
    "github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
)

// supplementAuthorizedPaymentEvidence adds real full payer phones, the original
// SMS transaction reference and (on a detail view) source SMS. It never affects
// matching or payment status, and never exposes these fields to API keys,
// viewers or editors. Records with missing/undecipherable legacy evidence stay
// absent instead of synthesizing a transaction ID or a phone number.
func (s *Service) supplementAuthorizedPaymentEvidence(r *http.Request, ws, realm, resource, detailID string, payload map[string]any) {
    if resource != "payments" && resource != "incoming" { return }
    _, role, err := s.documentActor(r, ws, realm, "payments", false)
    if err != nil || (role != "owner" && role != "admin") { return }
    records, ok := payload["items"].([]any)
    if !ok || len(records) == 0 || len(records) > 50 { return }
    ids := make([]string, 0, len(records))
    byID := make(map[string]map[string]any, len(records))
    for _, record := range records {
        row, ok := record.(map[string]any)
        if !ok { return }
        id, ok := row["id"].(string)
        if !ok || !uuidPattern.MatchString(id) { return }
        ids = append(ids, id)
        byID[id] = row
    }
    idsJSON, err := json.Marshal(ids)
    if err != nil { return }
    var evidenceRaw []byte
    if err := s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
        return tx.QueryRow(r.Context(),
            "SELECT pg66_payment_sms_evidence($1::uuid,$2,$3,$4::jsonb)",
            ws, realm, resource, string(idsJSON)).Scan(&evidenceRaw)
    }); err != nil {
        // On a realm where migration 0066 has not been installed, preserve
        // the existing payment listing instead of returning a false zero.
        return
    }
    var entries []struct {
        ID string `json:"id"`
        EvidenceB64 string `json:"evidence_b64"`
        AAD string `json:"aad"`
        PayerCipherB64 string `json:"payer_cipher_b64"`
    }
    if json.Unmarshal(evidenceRaw, &entries) != nil { return }
    for _, entry := range entries {
        row := byID[entry.ID]
        if row == nil { continue }
        var canonicalPayer string
        if entry.PayerCipherB64 != "" {
            if cipher, err := base64.StdEncoding.DecodeString(entry.PayerCipherB64); err == nil {
                if clear, err := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, ws+"|"+realm+"|refund-customer"); err == nil {
                    var contact struct { Phone string `json:"phone"` }
                    if json.Unmarshal(clear, &contact) == nil {
                        if normalized, valid := deviceevidence.NormalizeNumber(contact.Phone); valid {
                            canonicalPayer = normalized
                        }
                    }
                }
            }
        }
        if entry.EvidenceB64 != "" && entry.AAD != "" {
            if cipher, err := base64.StdEncoding.DecodeString(entry.EvidenceB64); err == nil {
                if clear, err := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, entry.AAD); err == nil {
                    sms := string(clear)
                    if detailID != "" { row["sms_text"] = sms }
                    for _, rule := range builtinSMSRules() {
                        receipt, err := rule.Parse(rule.Source, realm, sms)
                        if err != nil { continue }
                        if canonicalPayer != "" && receipt.Payer != canonicalPayer { continue }
                        if canonicalPayer == "" { canonicalPayer = receipt.Payer }
                        if receipt.Reference != "" { row["transaction_id"] = receipt.Reference }
                        break
                    }
                }
            }
        }
        if canonicalPayer != "" { row["payer_number"] = canonicalPayer }
    }
}
