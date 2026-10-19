package checkout

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/ekmivo/backend/internal/authz"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
)

type DocumentItem struct {
	Title    string `json:"title"`
	Quantity int64  `json:"quantity"`
	Unit     int64  `json:"unit_amount_minor"`
}
type CustomField struct {
	ID       string   `json:"id"`
	Label    string   `json:"label"`
	Type     string   `json:"type"`
	Required bool     `json:"required"`
	Options  []string `json:"options,omitempty"`
}
type DocumentBody struct {
	Reference       string         `json:"reference"`
	Name            string         `json:"name,omitempty"`
	Email           string         `json:"email,omitempty"`
	Phone           string         `json:"phone,omitempty"`
	Notes           string         `json:"notes,omitempty"`
	PrivateNotes    string         `json:"private_notes,omitempty"`
	Description     string         `json:"description,omitempty"`
	Tags            []string       `json:"tags,omitempty"`
	CustomerID      string         `json:"customer_id,omitempty"`
	Items           []DocumentItem `json:"items,omitempty"`
	Amount          int64          `json:"amount_minor,omitempty"`
	Tax             int64          `json:"tax_minor,omitempty"`
	Fee             int64          `json:"fee_minor,omitempty"`
	Shipping        int64          `json:"shipping_minor,omitempty"`
	Discount        int64          `json:"discount_minor,omitempty"`
	ExpectedVersion int64          `json:"expected_version,omitempty"`
	ExpiresAt       string         `json:"expires_at,omitempty"`
	DueAt           string         `json:"due_at,omitempty"`
	MaxQuantity     int            `json:"max_quantity,omitempty"`
	ImageURL        string         `json:"image_url,omitempty"`
	ReturnURL       string         `json:"return_url,omitempty"`
	MaxUses         int            `json:"max_uses,omitempty"`
	Fields          []CustomField  `json:"fields,omitempty"`
}

func (b *DocumentBody) validate(kind string) error {
	if !referencePattern.MatchString(b.Reference) || strings.TrimSpace(b.Reference) != b.Reference || len(b.Notes) > 4000 || len(b.PrivateNotes) > 4000 || len(b.Description) > 2000 || len(b.Tags) > 20 {
		return errors.New("invalid document")
	}
	for _, url := range []string{b.ImageURL, b.ReturnURL} {
		if url != "" {
			if _, err := merchantwebhook.ValidateURL(url); err != nil {
				return errors.New("invalid public URL")
			}
		}
	}
	if b.CustomerID != "" && !uuidPattern.MatchString(b.CustomerID) {
		return errors.New("invalid customer")
	}
	for _, tag := range b.Tags {
		if len(tag) == 0 || len(tag) > 40 || strings.ContainsAny(tag, "\r\n\x00") {
			return errors.New("invalid tag")
		}
	}
	if b.Email != "" {
		a, e := mail.ParseAddress(b.Email)
		if e != nil || a.Address != b.Email || len(b.Email) > 254 {
			return errors.New("invalid email")
		}
	}
	if b.Phone != "" {
		p, ok := NormalizePayer(b.Phone)
		if !ok {
			return errors.New("invalid contact phone")
		}
		b.Phone = p
	}
	if kind == "customers" && strings.TrimSpace(b.Name) == "" {
		return errors.New("customer name required")
	}
	if len(b.Name) > 160 {
		return errors.New("invalid name")
	}
	if kind == "payment-links" && (b.Amount < 1 || b.Amount > 100000000000 || b.MaxUses < 0 || b.MaxUses > 1000000 || b.MaxQuantity < 0 || b.MaxQuantity > 9999) {
		return errors.New("invalid link amount/limit")
	}
	if kind == "invoices" {
		if len(b.Items) < 1 || len(b.Items) > 100 {
			return errors.New("items required")
		}
		var total int64
		for _, l := range b.Items {
			if strings.TrimSpace(l.Title) == "" || len(l.Title) > 160 || l.Quantity < 1 || l.Quantity > 9999 || l.Unit < 0 || l.Unit > 100000000000 {
				return errors.New("invalid item")
			}
			total += l.Quantity * l.Unit
			if total > 100000000000 {
				return errors.New("total too large")
			}
		}
		for _, n := range []int64{b.Tax, b.Fee, b.Shipping, b.Discount} {
			if n < 0 || n > 100000000000 {
				return errors.New("invalid adjustment")
			}
		}
		total += b.Tax + b.Fee + b.Shipping - b.Discount
		if total < 1 || total > 100000000000 {
			return errors.New("invalid total")
		}
	}
	for _, date := range []string{b.ExpiresAt, b.DueAt} {
		if date != "" {
			if _, e := time.Parse(time.RFC3339, date); e != nil {
				return errors.New("invalid timestamp")
			}
		}
	}
	if len(b.Fields) > 20 {
		return errors.New("too many fields")
	}
	seen := map[string]bool{}
	for _, f := range b.Fields {
		if f.ID == "" || f.ID == "_quantity" || !keyPattern.MatchString("custom-field-key-"+f.ID) || len(f.ID) > 40 || seen[f.ID] || strings.TrimSpace(f.Label) == "" || len(f.Label) > 120 {
			return errors.New("invalid field")
		}
		seen[f.ID] = true
		if !map[string]bool{"text": true, "textarea": true, "select": true, "radio": true, "checkbox": true, "file": true}[f.Type] {
			return errors.New("invalid field type")
		}
		if len(f.Options) > 30 {
			return errors.New("too many options")
		}
		optionSeen := map[string]bool{}
		for _, o := range f.Options {
			if len(strings.TrimSpace(o)) == 0 || len(o) > 120 || optionSeen[o] {
				return errors.New("invalid option")
			}
			optionSeen[o] = true
		}
		if (f.Type == "select" || f.Type == "radio" || f.Type == "checkbox") && len(f.Options) == 0 {
			return errors.New("options required")
		}
	}
	return nil
}
func documentScope(res string, write bool) string {
	p := "payments"
	if res == "customers" || res == "invoices" || res == "refunds" {
		p = res
	}
	if write {
		return p + ":write"
	}
	return p + ":read"
}
func (s *Service) documentActor(r *http.Request, ws, realm, res string, mutation bool) (string, string, error) {
	if r.Header.Get("Authorization") != "" {
		key, e := s.Auth.AuthenticateMerchant(r.Context(), r.Header.Get("Authorization"), authz.Environment(realm), documentScope(res, mutation))
		if e != nil {
			return "", "", e
		}
		if key.WorkspaceID != ws {
			return "", "", authz.ErrForbidden
		}
		return "", "merchant_key", nil
	}
	cookie, e := r.Cookie("ekmivo-session")
	if e != nil {
		return "", "", authz.ErrUnauthorized
	}
	p, e := s.Auth.Authenticate(r.Context(), cookie.Value)
	if e != nil {
		return "", "", e
	}
	c := authz.PaymentsRead
	if mutation {
		c = authz.PaymentsIssue
	}
	a, e := s.Auth.AuthorizeWorkspace(r.Context(), p, ws, authz.Environment(realm), c)
	return p.UserID, a.Role, e
}
func (s *Service) HandleDocuments(w http.ResponseWriter, r *http.Request) {
	ws, realm, res := r.PathValue("workspaceID"), explicitRealm(r), r.PathValue("document")
	if !s.pipelineReady() || s.pipelinePool(realm) == nil {
		fail(w, 503, "DOCUMENT_SOURCE_UNAVAILABLE")
		return
	}
	if !uuidPattern.MatchString(ws) || !map[string]bool{"customers": true, "payment-links": true, "invoices": true}[res] {
		fail(w, 400, "INVALID_SCOPE")
		return
	}
	mutation := r.Method != "GET"
	if mutation && !originAllowed(r) && r.Header.Get("Authorization") == "" {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	actor, role, e := s.documentActor(r, ws, realm, res, mutation)
	if e != nil {
		authError(w, e)
		return
	}
	if !s.budget(w, "documents:"+ws+":"+realm+":"+r.Method, 120) {
		return
	}
	w, finishActivity := s.observeAPI(w, r, ws, realm)
	defer finishActivity()
	id, action := r.PathValue("documentID"), r.PathValue("documentAction")
	if res == "invoices" || res == "payment-links" {
		feature := "invoices"
		if res == "payment-links" {
			feature = "payment_links"
		}
		if !s.planFeature(w, r, ws, realm, feature) {
			return
		}
	}
	if id != "" && !validDocumentID(res, id) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if res == "invoices" && (action == "send" || action == "remind") {
		s.sendInvoice(w, r, ws, realm, id, actor, role, action)
		return
	}
	if action == "import-preview" || action == "import" {
		s.importCustomers(w, r, ws, realm, res, actor, action)
		return
	}
	if action == "export" {
		if !s.planFeature(w, r, ws, realm, "exports") {
			return
		}
		if role != "owner" && role != "admin" {
			fail(w, 403, "ACCESS_DENIED")
			return
		}
		var allowed bool
		if s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg10_export_authorized($1::uuid,$2::uuid)", ws, actor).Scan(&allowed) != nil {
			fail(w, 503, "EXPORT_UNAVAILABLE")
			return
		}
		if !allowed {
			fail(w, 403, "ACCESS_DENIED")
			return
		}
		s.exportDocuments(w, r, ws, realm, res)
		return
	}
	var raw []byte
	if !mutation {
		cursor, q := r.URL.Query().Get("cursor"), r.URL.Query().Get("q")
		if cursor != "" && !uuidPattern.MatchString(cursor) || len(q) > 128 {
			fail(w, 400, "INVALID_FILTER")
			return
		}
		e = s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg10_read($1::uuid,$2,$3,$4::uuid,$5::uuid,$6)", ws, realm, res, nullableID(id), nullableID(cursor), nullableID(q)).Scan(&raw)
		})
	} else {
		key := r.Header.Get("Idempotency-Key")
		if !keyPattern.MatchString(key) {
			fail(w, 400, "IDEMPOTENCY_KEY_REQUIRED")
			return
		}
		var b DocumentBody
		if decodeBounded(w, r, &b, 65536) != nil {
			fail(w, 422, "INVALID_DOCUMENT")
			return
		}
		if action == "" {
			if id == "" {
				action = "create"
			} else {
				action = "edit"
			}
		}
		autoReference := res == "invoices" && action == "create" && b.Reference == ""
		if autoReference {
			b.Reference = "INV-PENDING"
		}
		if action == "create" || action == "edit" || action == "correct" {
			if e = b.validate(res); e != nil {
				fail(w, 422, "INVALID_DOCUMENT_FIELDS")
				return
			}
		}
		if autoReference {
			b.Reference = ""
		}
		body, _ := json.Marshal(b)
		token := s.token(ws, realm, "document:"+res+":"+key)
		requestHash := digest(res+"|"+id+"|"+action+"|"+string(body))
		e = s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			if autoReference {
				return tx.QueryRow(r.Context(), "SELECT pg10_invoice_auto_create($1::uuid,$2,$3::jsonb,$4,$5,$6,$7::uuid)", ws, realm, string(body), key, requestHash, digest(token), nullableID(actor)).Scan(&raw)
			}
			return tx.QueryRow(r.Context(), "SELECT pg10_write($1::uuid,$2,$3,$4::uuid,$5,$6::jsonb,$7,$8,$9,$10::uuid)", ws, realm, res, nullableID(id), action, string(body), key, requestHash, digest(token), nullableID(actor)).Scan(&raw)
		})
	}
	if e != nil {
		mapped(w, e)
		return
	}
	var result any
	if json.Unmarshal(raw, &result) != nil {
		fail(w, 503, "INVALID_DOCUMENT_RESULT")
		return
	}
	if !mutation && res == "customers" && id != "" {
		var activityRaw []byte
		if e = s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg10_customer_activity($1::uuid,$2,$3::uuid)", ws, realm, id).Scan(&activityRaw)
		}); e != nil {
			mapped(w, e)
			return
		}
		var activity any
		_ = json.Unmarshal(activityRaw, &activity)
		if data, ok := result.(map[string]any); ok {
			data["activity"] = activity
		}
	}
	if !mutation && res == "invoices" && id != "" {
		var delivery []byte
		if e = s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg10_invoice_delivery($1::uuid,$2,$3::uuid)", ws, realm, id).Scan(&delivery)
		}); e != nil {
			mapped(w, e)
			return
		}
		var values any
		_ = json.Unmarshal(delivery, &values)
		if data, ok := result.(map[string]any); ok {
			data["delivery"] = values
		}
	}
	if !mutation && res == "customers" {
		s.supplementCustomerPayerNumbers(r, ws, realm, result, role)
	}
	attachDocumentTokens(s, ws, realm, result)
	if role == "viewer" {
		maskContacts(result)
	}
	write(w, 200, result)
}
func attachDocumentTokens(s *Service, ws, realm string, v any) {
	switch x := v.(type) {
	case map[string]any:
		if k, ok := x["capability_key"].(string); ok && k != "" {
			kind, _ := x["kind"].(string)
			x["public_token"] = s.token(ws, realm, "document:"+kind+":"+k)
			delete(x, "capability_key")
		}
		for _, a := range x {
			attachDocumentTokens(s, ws, realm, a)
		}
	case []any:
		for _, a := range x {
			attachDocumentTokens(s, ws, realm, a)
		}
	}
}
func maskContacts(v any) {
	switch x := v.(type) {
	case map[string]any:
		for k, a := range x {
			if k == "email" || k == "phone" || k == "private_notes" {
				delete(x, k)
			} else {
				maskContacts(a)
			}
		}
	case []any:
		for _, a := range x {
			maskContacts(a)
		}
	}
}
func (s *Service) importCustomers(w http.ResponseWriter, r *http.Request, ws, realm, res, actor, action string) {
	if res != "customers" || r.Method != "POST" {
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	var b struct {
		CSV string `json:"csv"`
	}
	if decodeBounded(w, r, &b, 524288) != nil {
		fail(w, 422, "INVALID_IMPORT")
		return
	}
	reader := csv.NewReader(strings.NewReader(b.CSV))
	reader.FieldsPerRecord = 4
	header, e := reader.Read()
	if e != nil || strings.Join(header, ",") != "reference,name,email,phone" {
		fail(w, 422, "CSV_HEADER_REQUIRED")
		return
	}
	rows := []DocumentBody{}
	rowErrors := []map[string]any{}
	seen := map[string]bool{}
	for line := 2; line <= 1002; line++ {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if line == 1002 {
			fail(w, 422, "IMPORT_LIMIT_1000")
			return
		}
		if err != nil {
			rowErrors = append(rowErrors, map[string]any{"row": line, "code": "INVALID_CSV_ROW"})
			continue
		}
		d := DocumentBody{Reference: row[0], Name: row[1], Email: row[2], Phone: row[3]}
		if d.validate("customers") != nil || seen[d.Reference] {
			rowErrors = append(rowErrors, map[string]any{"row": line, "code": "INVALID_OR_DUPLICATE_CUSTOMER"})
		} else {
			seen[d.Reference] = true
			rows = append(rows, d)
		}
	}
	if action == "import-preview" {
		write(w, 200, map[string]any{"valid_count": len(rows), "errors": rowErrors})
		return
	}
	if len(rowErrors) > 0 {
		write(w, 422, map[string]any{"error": map[string]string{"code": "IMPORT_HAS_ERRORS"}, "errors": rowErrors})
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if !keyPattern.MatchString(key) {
		fail(w, 400, "IDEMPOTENCY_KEY_REQUIRED")
		return
	}
	encoded, _ := json.Marshal(rows)
	var result []byte
	e = s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT pg10_import($1::uuid,$2,$3::uuid,$4,$5,$6::jsonb)", ws, realm, nullableID(actor), key, digest(b.CSV), string(encoded)).Scan(&result)
	})
	if e != nil {
		mapped(w, e)
		return
	}
	var imported map[string]any
	if json.Unmarshal(result, &imported) != nil {
		fail(w, 503, "IMPORT_UNCONFIRMED")
		return
	}
	write(w, 200, imported)
}
func csvSafe(v string) string {
	if len(v) > 0 && strings.ContainsRune("=+-@\t\r", rune(v[0])) {
		return "'" + v
	}
	return v
}
func (s *Service) exportDocuments(w http.ResponseWriter, r *http.Request, ws, realm, res string) {
	var buffer bytes.Buffer
	c := csv.NewWriter(&buffer)
	_ = c.Write([]string{"id", "reference", "name", "status", "amount_minor", "paid_minor", "currency"})
	cursor := ""
	for page := 0; page < 200; page++ {
		var raw []byte
		e := s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg10_read($1::uuid,$2,$3,NULL,$4::uuid,NULL)", ws, realm, res, nullableID(cursor)).Scan(&raw)
		})
		if e != nil {
			mapped(w, e)
			return
		}
		var data struct {
			Items []map[string]any `json:"items"`
			Next  string           `json:"next_cursor"`
		}
		if json.Unmarshal(raw, &data) != nil {
			fail(w, 503, "EXPORT_UNAVAILABLE")
			return
		}
		for _, row := range data.Items {
			body, _ := row["body"].(map[string]any)
			_ = c.Write([]string{fmt.Sprint(row["id"]), csvSafe(fmt.Sprint(row["reference"])), csvSafe(fmt.Sprint(body["name"])), fmt.Sprint(row["status"]), fmt.Sprint(row["amount_minor"]), fmt.Sprint(row["paid_minor"]), "BDT"})
		}
		cursor = data.Next
		if cursor == "" {
			break
		}
		if page == 199 {
			fail(w, 422, "EXPORT_LIMIT_EXCEEDED")
			return
		}
	}
	c.Flush()
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+res+`.csv"`)
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = w.Write(buffer.Bytes())
}
func (s *Service) publicDocument(r *http.Request, cap string) (*pgxpool.Pool, []byte, error) {
	var found *pgxpool.Pool
	var result []byte
	for _, realm := range []string{"sandbox", "live"} {
		p := s.pipelinePool(realm)
		if p == nil {
			continue
		}
		var raw []byte
		if e := p.QueryRow(r.Context(), "SELECT pg10_public($1)", digest(cap)).Scan(&raw); e != nil {
			return nil, nil, e
		}
		if len(raw) > 0 && string(raw) != "null" {
			if found != nil {
				return nil, nil, errors.New("ambiguous capability")
			}
			found = p
			result = raw
		}
	}
	return found, result, nil
}
func validateFieldValues(fields []CustomField, values map[string]any) error {
	if len(values) > len(fields) {
		return errors.New("unknown field")
	}
	known := map[string]bool{}
	for _, f := range fields {
		known[f.ID] = true
		v, exists := values[f.ID]
		if !exists || v == "" {
			if f.Required {
				return errors.New("required field")
			}
			continue
		}
		if f.Type == "checkbox" {
			list, ok := v.([]any)
			if !ok || len(list) > len(f.Options) {
				return errors.New("invalid choice")
			}
			for _, a := range list {
				valid := false
				for _, o := range f.Options {
					if a == o {
						valid = true
					}
				}
				if !valid {
					return errors.New("invalid choice")
				}
			}
			continue
		}
		text, ok := v.(string)
		if !ok || len(text) > 2000 {
			return errors.New("invalid text")
		}
		if f.Type == "file" && !uuidPattern.MatchString(text) {
			return errors.New("invalid file")
		}
		if f.Type == "select" || f.Type == "radio" {
			valid := false
			for _, o := range f.Options {
				if text == o {
					valid = true
				}
			}
			if !valid {
				return errors.New("invalid choice")
			}
		}
	}
	for k := range values {
		if !known[k] {
			return errors.New("unknown field")
		}
	}
	return nil
}
func (s *Service) HandlePublicDocument(w http.ResponseWriter, r *http.Request) {
	cap := r.PathValue("token")
	if !s.pipelineReady() {
		fail(w, 503, "DOCUMENT_SOURCE_UNAVAILABLE")
		return
	}
	if !tokenPattern.MatchString(cap) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if !s.budget(w, "document-cap:"+digest(cap), 60) {
		return
	}
	pool, raw, e := s.publicDocument(r, cap)
	if e != nil {
		mapped(w, e)
		return
	}
	if pool == nil {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var doc struct {
		ID          string       `json:"id"`
		Workspace   string       `json:"workspace_id"`
		Environment string       `json:"environment"`
		Body        DocumentBody `json:"body"`
	}
	if json.Unmarshal(raw, &doc) != nil {
		fail(w, 503, "INVALID_DOCUMENT_RESULT")
		return
	}
	business, businessErr := s.publicBusinessInfo(r, raw)
	if businessErr != nil {
		fail(w, 503, "MERCHANT_UNAVAILABLE")
		return
	}
	if r.Method == "GET" {
		var data map[string]any
		_ = json.Unmarshal(raw, &data)
		delete(data, "workspace_id")
		data["merchant_name"] = business.Name
		data["brand"] = business.Brand
		// Only the document's own opaque capability determines workspace/realm.
		// Public customers see configured accounts by provider name, never phone
		// identities, receiving numbers or unreleased parser rules.
		if doc.Environment == "live" {
			var sourceBytes, accountBytes []byte
			err := s.pipelineScoped(r.Context(), doc.Workspace, doc.Environment, func(tx pgx.Tx) error {
				if err := tx.QueryRow(r.Context(), "SELECT pg10_public_payment_sources($1::uuid,$2)", doc.Workspace, doc.Environment).Scan(&sourceBytes); err != nil {
					return err
				}
				return tx.QueryRow(r.Context(), "SELECT pg110_public_workspace_accounts($1::uuid,$2)", doc.Workspace, doc.Environment).Scan(&accountBytes)
			})
			if err != nil {
				fail(w, 503, "DOCUMENT_SOURCE_UNAVAILABLE")
				return
			}
			var selection struct {
				Configured []string `json:"configured_methods"`
			}
			if json.Unmarshal(sourceBytes, &selection) != nil {
				fail(w, 503, "INVALID_DOCUMENT_RESULT")
				return
			}
			allowed := s.liveMethods(sourceBytes)
			methods := []string{}
			for _, method := range []string{"bkash", "nagad", "rocket"} {
				if allowed[method] {
					methods = append(methods, method)
				}
			}
			var accounts []map[string]any
			if json.Unmarshal(accountBytes, &accounts) != nil {
				fail(w, 503, "INVALID_DOCUMENT_RESULT")
				return
			}
			for _, account := range accounts {
				method, _ := account["method"].(string)
				online, _ := account["source_online"].(bool)
				account["ready"] = allowed[method] && online
			}
			data["receiving_accounts"] = accounts
			data["configured_methods"] = selection.Configured
			data["methods"] = methods
		} else {
			data["configured_methods"] = []string{"bkash", "nagad", "rocket"}
			data["methods"] = []string{"bkash", "nagad", "rocket"}
		}
		write(w, 200, data)
		return
	}
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if !keyPattern.MatchString(key) || len(key) > 122 {
		fail(w, 400, "IDEMPOTENCY_KEY_REQUIRED")
		return
	}
	var b struct {
		Fields          map[string]any    `json:"fields"`
		CustomerDetails map[string]string `json:"customer_details"`
		Quantity        int               `json:"quantity"`
	}
	if decodeBounded(w, r, &b, 49152) != nil || validateFieldValues(doc.Body.Fields, b.Fields) != nil {
		fail(w, 422, "INVALID_CUSTOM_FIELDS")
		return
	}
	if validateCheckoutCustomerDetails(business.Brand, b.CustomerDetails) != nil {
		fail(w, 422, "INVALID_CUSTOMER_DETAILS")
		return
	}
	if b.Quantity == 0 {
		b.Quantity = 1
	}
	max := doc.Body.MaxQuantity
	if max < 1 {
		max = 1
	}
	if b.Quantity < 1 || b.Quantity > max {
		fail(w, 422, "QUANTITY_POLICY_DENIED")
		return
	}
	if b.Fields == nil {
		b.Fields = map[string]any{}
	}
	if len(b.CustomerDetails) > 0 {
		b.Fields["_customer_details"] = b.CustomerDetails
	}
	b.Fields["_quantity"] = b.Quantity
	fields, _ := json.Marshal(b.Fields)
	key = "visit:" + digest(cap+"|"+key)
	token := s.token(doc.Workspace, doc.Environment, key)
	e = s.creationScoped(r.Context(), doc.Workspace, doc.Environment, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT pg10_visit($1,$2,$3,$4,$5::jsonb)", digest(cap), key, digest(cap+string(fields)), digest(token), string(fields)).Scan(&raw)
	})
	if e != nil {
		mapped(w, e)
		return
	}
	var data map[string]any
	_ = json.Unmarshal(raw, &data)
	data["checkout_token"] = token
	delete(data, "creation_key")
	write(w, 201, data)
}
