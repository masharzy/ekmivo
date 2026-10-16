package checkout

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
)

type verifiedPayerSMSEvidence struct {
	ID       string `json:"id"`
	Evidence string `json:"evidence_b64"`
	AAD      string `json:"aad"`
	Contact  string `json:"payer_cipher_b64"`
	Sender   string `json:"sender"`
}

const verifiedPayerPaymentsSQL = `WITH candidates AS (
 SELECT p.id::text AS payment_id,
 (('64'||substr(md5(a.workspace_id::text||':'||a.environment||':'||a.payer_hmac),3))::uuid)::text AS customer_id,
 row_number() OVER (PARTITION BY a.payer_hmac ORDER BY p.verified_at DESC,p.id DESC) AS evidence_rank
 FROM payment_attempts a
 JOIN financial_payments p ON p.attempt_id=a.id AND p.workspace_id=$1::uuid AND p.environment=$2
 WHERE a.workspace_id=$1::uuid AND a.environment=$2
 AND (('64'||substr(md5(a.workspace_id::text||':'||a.environment||':'||a.payer_hmac),3))::uuid)::text
 IN (SELECT value FROM jsonb_array_elements_text($3::jsonb))
)
SELECT payment_id,customer_id FROM candidates WHERE evidence_rank<=3
ORDER BY evidence_rank,customer_id LIMIT 150`

// Only owner/admin may recover verified payer phones. Saved customer contacts
// never inherit payer identity, and missing evidence is never reconstructed
// from a four-digit suffix.
func (s *Service) supplementCustomerPayerNumbers(r *http.Request, ws, realm string, result any, role string) {
	if role != "owner" && role != "admin" {
		return
	}
	payload, ok := result.(map[string]any)
	if !ok {
		return
	}
	records, ok := payload["items"].([]any)
	if !ok || len(records) == 0 || len(records) > 50 {
		return
	}
	ids := make([]string, 0, len(records))
	byID := make(map[string]map[string]any, len(records))
	for _, v := range records {
		row, ok := v.(map[string]any)
		if !ok {
			continue
		}
		body, ok := row["body"].(map[string]any)
		if !ok || body["source"] != "checkout_payer" {
			continue
		}
		id, ok := row["id"].(string)
		if !ok || !uuidPattern.MatchString(id) {
			continue
		}
		ids = append(ids, id)
		byID[id] = body
	}
	if len(ids) == 0 {
		return
	}
	key, err := json.Marshal(ids)
	if err != nil {
		return
	}
	var raw []byte
	err = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT pg66_customer_payer_evidence($1::uuid,$2,$3::jsonb)", ws, realm, string(key)).Scan(&raw)
	})
	if err == nil {
		var entries []struct {
			ID     string `json:"id"`
			Cipher string `json:"payer_cipher_b64"`
		}
		if json.Unmarshal(raw, &entries) == nil {
			for _, entry := range entries {
				if byID[entry.ID] == nil {
					continue
				}
				phone := readEncryptedPayerPhone(s.Pipeline.Key, entry.Cipher, ws+"|"+realm+"|refund-customer")
				if phone != "" {
					setVerifiedPayerPhone(byID[entry.ID], phone)
				}
			}
		}
	}
	// Older receipts or rotated sender keys can make the arbitrary aggregate
	// cipher unreadable. Use only signed source evidence already matched to an
	// immutable verified payment, and never bypass owner/admin authorization.
	unresolved := make([]string, 0, len(ids))
	for _, id := range ids {
		body := byID[id]
		if body == nil {
			continue
		}
		phone, _ := body["phone"].(string)
		if _, valid := deviceevidence.NormalizeNumber(phone); !valid {
			unresolved = append(unresolved, id)
		}
	}
	if len(unresolved) != 0 {
		s.recoverPayersFromVerifiedSMS(r, ws, realm, unresolved, byID)
	}
}

func setVerifiedPayerPhone(body map[string]any, phone string) {
	if phone == "" {
		return
	}
	body["phone"] = phone
	if name, ok := body["name"].(string); ok && strings.HasPrefix(name, "Payer · ") {
		body["name"] = phone
	}
}

func readEncryptedPayerPhone(secret []byte, b64, aad string) string {
	if len(secret) == 0 || b64 == "" || aad == "" {
		return ""
	}
	cipher, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return ""
	}
	plain, err := merchantwebhook.Decrypt(secret, cipher, aad)
	if err != nil {
		return ""
	}
	var contact struct {
		Phone string `json:"phone"`
	}
	if json.Unmarshal(plain, &contact) != nil {
		return ""
	}
	phone, valid := deviceevidence.NormalizeNumber(contact.Phone)
	if !valid {
		return ""
	}
	return phone
}

// The finance-reader SQL role can read the existing verified-payment IDs;
// pg66_payment_sms_evidence returns encrypted evidence only, never plaintext.
// This fallback never touches unverified or unrelated payer groups.
func (s *Service) recoverPayersFromVerifiedSMS(r *http.Request, ws, realm string, unresolved []string, byID map[string]map[string]any) {
	idsJSON, err := json.Marshal(unresolved)
	if err != nil {
		return
	}
	paymentOwners := make(map[string]string)
	paymentIDs := make([]string, 0, 50)
	var entries []verifiedPayerSMSEvidence
	err = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		rows, e := tx.Query(r.Context(), verifiedPayerPaymentsSQL, ws, realm, string(idsJSON))
		if e != nil {
			return e
		}
		for rows.Next() {
			var paymentID, customerID string
			if e = rows.Scan(&paymentID, &customerID); e != nil {
				rows.Close()
				return e
			}
			if byID[customerID] == nil {
				continue
			}
			paymentOwners[paymentID] = customerID
			paymentIDs = append(paymentIDs, paymentID)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return e
		}
		if len(paymentIDs) == 0 {
			return nil
		}
		// Evidence function accepts at most 50 IDs; keep every customer represented
		// and try up to three recent verified payments without unbounded reads.
		for offset := 0; offset < len(paymentIDs); offset += 50 {
			end := offset + 50
			if end > len(paymentIDs) {
				end = len(paymentIDs)
			}
			input, e := json.Marshal(paymentIDs[offset:end])
			if e != nil {
				return e
			}
			var encrypted []byte
			if e = tx.QueryRow(r.Context(), "SELECT pg66_payment_sms_evidence($1::uuid,$2,'payments',$3::jsonb)",
				ws, realm, string(input)).Scan(&encrypted); e != nil {
				return e
			}
			var batch []verifiedPayerSMSEvidence
			if e = json.Unmarshal(encrypted, &batch); e != nil {
				return e
			}
			entries = append(entries, batch...)
		}
		return nil
	})
	if err != nil || len(paymentIDs) == 0 {
		return
	}
	for _, entry := range entries {
		customerID := paymentOwners[entry.ID]
		target := byID[customerID]
		if target == nil {
			continue
		}
		// Stop after the first verified original number is recovered per customer.
		if current, _ := target["phone"].(string); current != "" {
			if _, valid := deviceevidence.NormalizeNumber(current); valid {
				continue
			}
		}
		phone := readVerifiedPayerSMSPhone(s.Pipeline.Key, ws, realm, entry, s.Pipeline.Rules)
		if phone != "" {
			setVerifiedPayerPhone(target, phone)
		}
	}
}

func readVerifiedPayerSMSPhone(secret []byte, ws, realm string, entry verifiedPayerSMSEvidence, rules map[string]deviceevidence.ParserRule) string {
	phone := readEncryptedPayerPhone(secret, entry.Contact, ws+"|"+realm+"|refund-customer")
	if phone == "" && entry.Evidence != "" && entry.AAD != "" {
		if cipher, e := base64.StdEncoding.DecodeString(entry.Evidence); e == nil {
			if clear, e := merchantwebhook.Decrypt(secret, cipher, entry.AAD); e == nil {
				// Only a single unambiguous approved provider parser may supply the
				// number. The SQL relationship already binds this to a verified payment.
				matches := 0
				for _, rule := range rules {
					if !rule.Approved || (rule.SandboxOnly && realm != "sandbox") || !strings.EqualFold(rule.Source, entry.Sender) {
						continue
					}
					parsed, e := rule.Parse(rule.Source, realm, string(clear))
					if e != nil {
						continue
					}
					canonical, valid := deviceevidence.NormalizeNumber(parsed.Payer)
					if !valid {
						continue
					}
					matches++
					if matches == 1 {
						phone = canonical
					} else {
						phone = ""
						break
					}
				}
				if matches != 1 {
					phone = ""
				}
			}
		}
	}
	return phone
}
