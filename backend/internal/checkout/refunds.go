package checkout

import (
	"encoding/base64"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/masharzy/briofold/backend/internal/deviceevidence"
	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
)

type RefundRequest struct {
	PaymentID string `json:"payment_id"`
	Amount    int64  `json:"amount_minor"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	Reason    string `json:"reason"`
}

func (b *RefundRequest) valid() bool {
	c := DocumentBody{Reference: "refund-contact", Name: b.Name, Email: b.Email, Phone: b.Phone}
	if c.validate("customers") != nil {
		return false
	}
	b.Phone = c.Phone
	return b.Amount > 0 && b.Amount <= 100000000000 && len(strings.TrimSpace(b.Reason)) >= 10 && len(b.Reason) <= 2000 && (b.Phone != "" || b.Email != "")
}
func (s *Service) createRefund(w http.ResponseWriter, r *http.Request, ws, realm, actor, payment string, b RefundRequest) {
	if !b.valid() || !uuidPattern.MatchString(payment) {
		fail(w, 422, "INVALID_REFUND_REQUEST")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if !keyPattern.MatchString(key) {
		fail(w, 400, "IDEMPOTENCY_KEY_REQUIRED")
		return
	}
	customer, _ := json.Marshal(map[string]string{"name": b.Name, "email": b.Email, "phone": b.Phone})
	cipher, e := deviceevidence.Encrypt(s.Pipeline.Key, customer, ws+"|"+realm+"|refund-customer")
	if e != nil {
		fail(w, 503, "REFUND_SOURCE_UNAVAILABLE")
		return
	}
	body, _ := json.Marshal(b)
	var raw []byte
	e = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT pg11_refund($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8,$9::uuid)", ws, realm, payment, b.Amount, cipher, b.Reason, key, digest(string(body)+payment), nullableID(actor)).Scan(&raw)
	})
	if e != nil {
		mapped(w, e)
		return
	}
	var data any
	_ = json.Unmarshal(raw, &data)
	write(w, 201, data)
}
func (s *Service) HandleRefunds(w http.ResponseWriter, r *http.Request) {
	ws, realm := r.PathValue("workspaceID"), explicitRealm(r)
	if !s.pipelineReady() || s.pipelinePool(realm) == nil {
		fail(w, 503, "REFUND_SOURCE_UNAVAILABLE")
		return
	}
	if !uuidPattern.MatchString(ws) {
		fail(w, 400, "INVALID_SCOPE")
		return
	}
	mutation := r.Method != "GET"
	actor, role, e := s.documentActor(r, ws, realm, "refunds", mutation)
	if e != nil {
		authError(w, e)
		return
	}
	if mutation && !originAllowed(r) && r.Header.Get("Authorization") == "" {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if !s.budget(w, "refunds:"+ws+realm, 60) {
		return
	}
	id, action := r.PathValue("refundID"), r.PathValue("refundAction")
	if id != "" && !uuidPattern.MatchString(id) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if !mutation {
		if !validOperationFilters(r) {
			fail(w, 422, "INVALID_FILTERS")
			return
		}
		var raw []byte
		e = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg11_page($1::uuid,$2,'refunds',$3::uuid,$4::uuid,$5,NULL)", ws, realm, nullableID(id), nullableID(r.URL.Query().Get("cursor")), optionalFilter(r.URL.Query().Get("status"))).Scan(&raw)
		})
		if e != nil {
			mapped(w, e)
			return
		}
		var data any
		_ = json.Unmarshal(raw, &data)
		s.refundContacts(data, ws, realm, role == "owner" || role == "admin")
		write(w, 200, data)
		return
	}
	if id == "" {
		var b RefundRequest
		if decodeBounded(w, r, &b, 8192) != nil {
			fail(w, 422, "INVALID_REFUND_REQUEST")
			return
		}
		s.createRefund(w, r, ws, realm, actor, b.PaymentID, b)
		return
	}
	if role != "owner" && role != "admin" {
		fail(w, 403, "SELLER_ACTION_REQUIRED")
		return
	}
	var b struct {
		Note      string `json:"note"`
		Reference string `json:"reference"`
		Version   int64  `json:"expected_version"`
		Confirm   bool   `json:"confirm_seller_action"`
	}
	if decodeBounded(w, r, &b, 8192) != nil || !b.Confirm {
		fail(w, 422, "SELLER_CONFIRMATION_REQUIRED")
		return
	}
	var raw []byte
	e = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT pg11_refund_action($1::uuid,$2,$3::uuid,$4,$5,$6,$7::uuid,$8)", ws, realm, id, action, b.Note, b.Reference, nullableID(actor), b.Version).Scan(&raw)
	})
	if e != nil {
		mapped(w, e)
		return
	}
	var data any
	_ = json.Unmarshal(raw, &data)
	write(w, 200, data)
}
func (s *Service) refundContacts(v any, ws, realm string, reveal bool) {
	switch x := v.(type) {
	case map[string]any:
		if encoded, ok := x["customer_cipher"].(string); ok {
			delete(x, "customer_cipher")
			if reveal {
				var cipher []byte
				var e error
				if strings.HasPrefix(encoded, "\\x") {
					cipher, e = hex.DecodeString(encoded[2:])
				} else {
					cipher, e = base64.StdEncoding.DecodeString(encoded)
				}
				if e == nil {
					plain, err := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, ws+"|"+realm+"|refund-customer")
					if err == nil {
						var contact any
						_ = json.Unmarshal(plain, &contact)
						x["customer"] = contact
					}
				}
			}
		}
		for _, a := range x {
			s.refundContacts(a, ws, realm, reveal)
		}
	case []any:
		for _, a := range x {
			s.refundContacts(a, ws, realm, reveal)
		}
	}
}
func (s *Service) HandlePublicRefund(w http.ResponseWriter, r *http.Request) {
	if !s.pipelineReady() {
		fail(w, 503, "REFUND_SOURCE_UNAVAILABLE")
		return
	}
	cap := r.PathValue("token")
	if !tokenPattern.MatchString(cap) || !originAllowed(r) {
		fail(w, 403, "CAPABILITY_OR_ORIGIN_DENIED")
		return
	}
	if !s.budget(w, "customer-refund:"+digest(cap), 5) {
		return
	}
	pool, raw, e := s.lookupCheckout(r, cap)
	if e != nil || pool == nil {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var doc struct {
		Workspace   string `json:"workspace_id"`
		Environment string `json:"environment"`
		ID          string `json:"id"`
	}
	if json.Unmarshal(raw, &doc) != nil {
		fail(w, 503, "INVALID_CHECKOUT_RESULT")
		return
	}
	var payment string
	e = pool.QueryRow(r.Context(), "SELECT pg11_checkout_payment($1)", digest(cap)).Scan(&payment)
	if e != nil || !uuidPattern.MatchString(payment) {
		fail(w, 409, "VERIFIED_PAYMENT_REQUIRED")
		return
	}
	var b RefundRequest
	if decodeBounded(w, r, &b, 8192) != nil {
		fail(w, 422, "INVALID_REFUND_REQUEST")
		return
	}
	b.PaymentID = payment
	s.createRefund(w, r, doc.Workspace, doc.Environment, "", payment, b)
}

type StatementLine struct {
	LineID    string    `json:"line_id"`
	Reference string    `json:"reference"`
	Amount    int64     `json:"amount_minor"`
	Currency  string    `json:"currency"`
	Direction string    `json:"direction"`
	At        time.Time `json:"transaction_at"`
}

func (s *Service) HandleReconciliation(w http.ResponseWriter, r *http.Request) {
	ws, realm, action := r.PathValue("workspaceID"), explicitRealm(r), r.PathValue("reconcileAction")
	if !uuidPattern.MatchString(ws) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if !s.budget(w, "reconciliation:"+ws+":"+realm, 60) {
		return
	}
	if !s.pipelineReady() || s.pipelinePool(realm) == nil {
		fail(w, 503, "RECONCILIATION_SOURCE_UNAVAILABLE")
		return
	}
	actor, role, e := s.documentActor(r, ws, realm, "payments", r.Method != "GET")
	if e != nil {
		authError(w, e)
		return
	}
	if r.Method == "GET" {
		if !validOperationFilters(r) {
			fail(w, 422, "INVALID_FILTERS")
			return
		}
		var raw []byte
		e = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg11_page($1::uuid,$2,'reconciliation',NULL,$3::uuid,$4,$5::uuid)", ws, realm, nullableID(r.URL.Query().Get("cursor")), optionalFilter(r.URL.Query().Get("status")), nullableID(r.URL.Query().Get("account"))).Scan(&raw)
		})
		if e != nil {
			mapped(w, e)
			return
		}
		var data any
		_ = json.Unmarshal(raw, &data)
		write(w, 200, data)
		return
	}
	if role != "owner" && role != "admin" || !originAllowed(r) {
		fail(w, 403, "ACCESS_DENIED")
		return
	}
	if action == "settlement-link" {
		var b struct {
			LineID    string `json:"line_id"`
			PaymentID string `json:"payment_id"`
			Reason    string `json:"reason"`
		}
		if decodeBounded(w, r, &b, 4096) != nil || !uuidPattern.MatchString(b.LineID) || !uuidPattern.MatchString(b.PaymentID) {
			fail(w, 422, "INVALID_SETTLEMENT")
			return
		}
		var raw []byte
		e = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg11_settlement($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::uuid)", ws, realm, b.LineID, b.PaymentID, b.Reason, actor).Scan(&raw)
		})
		if e != nil {
			mapped(w, e)
			return
		}
		var out any
		_ = json.Unmarshal(raw, &out)
		write(w, 200, out)
		return
	}
	if action != "statement-preview" && action != "statement-import" {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var b struct {
		Account string `json:"account_id"`
		CSV     string `json:"csv"`
	}
	if decodeBounded(w, r, &b, 1048576) != nil || !uuidPattern.MatchString(b.Account) {
		fail(w, 422, "INVALID_STATEMENT")
		return
	}
	c := csv.NewReader(strings.NewReader(b.CSV))
	c.FieldsPerRecord = 6
	header, err := c.Read()
	if err != nil || strings.Join(header, ",") != "line_id,reference,amount_minor,currency,direction,transaction_at" {
		fail(w, 422, "STATEMENT_HEADER_REQUIRED")
		return
	}
	lines := []StatementLine{}
	rowErrors := []map[string]any{}
	seen := map[string]bool{}
	for row := 2; row <= 2002; row++ {
		v, err := c.Read()
		if err == io.EOF {
			break
		}
		if row == 2002 {
			fail(w, 422, "STATEMENT_LIMIT_2000")
			return
		}
		if err != nil {
			rowErrors = append(rowErrors, map[string]any{"row": row, "code": "INVALID_CSV"})
			continue
		}
		amount, ae := strconv.ParseInt(v[2], 10, 64)
		at, te := time.Parse(time.RFC3339, v[5])
		if ae != nil || te != nil || amount <= 0 || amount > 100000000000 || v[3] != "BDT" || v[4] != "incoming" && v[4] != "outgoing" || v[0] == "" || len(v[0]) > 128 || len(v[1]) > 128 || seen[v[0]] {
			rowErrors = append(rowErrors, map[string]any{"row": row, "code": "INVALID_STATEMENT_LINE"})
			continue
		}
		seen[v[0]] = true
		lines = append(lines, StatementLine{v[0], v[1], amount, v[3], v[4], at})
	}
	if action == "statement-preview" {
		write(w, 200, map[string]any{"valid_count": len(lines), "errors": rowErrors, "provenance": "merchant_imported_statement"})
		return
	}
	if len(rowErrors) > 0 {
		write(w, 422, map[string]any{"error": map[string]string{"code": "STATEMENT_HAS_ERRORS"}, "errors": rowErrors})
		return
	}
	e = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		for _, l := range lines {
			payload, _ := json.Marshal(l)
			var id string
			err := tx.QueryRow(r.Context(), "SELECT pg11_statement($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8,$9,$10)", ws, realm, b.Account, l.LineID, l.Reference, l.Amount, l.Currency, l.Direction, l.At, digest(string(payload))).Scan(&id)
			if err != nil {
				return err
			}
		}
		return nil
	})
	if e != nil {
		mapped(w, e)
		return
	}
	write(w, 200, map[string]any{"imported": len(lines), "provider_verified": false})
}

func optionalFilter(value string) any {
	if value == "" {
		return nil
	}
	return value
}
func validOperationFilters(r *http.Request) bool {
	for _, name := range []string{"cursor", "account"} {
		value := r.URL.Query().Get(name)
		if value != "" && !uuidPattern.MatchString(value) {
			return false
		}
	}
	return len(r.URL.Query().Get("status")) <= 40
}
