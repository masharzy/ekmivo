package checkout

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/financial"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"github.com/masharzy/ekmivo/backend/internal/receiptnotice"
	"github.com/riverqueue/river"
	"html"
	"net/http"
	"os"
	"strings"
	"time"
)

func (s *Service) sendInvoice(w http.ResponseWriter, r *http.Request, ws, realm, id, actor, role, action string) {
	if actor == "" || (role != "owner" && role != "admin") {
		fail(w, 403, "SELLER_SESSION_REQUIRED")
		return
	}
	var authorized bool
	if s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg10_invoice_send_authorized($1::uuid,$2::uuid)", ws, actor).Scan(&authorized) != nil {
		fail(w, 503, "INVOICE_EMAIL_UNAVAILABLE")
		return
	}
	if !authorized {
		fail(w, 403, "ACCESS_DENIED")
		return
	}
	if s.NoticeSMTP == nil {
		fail(w, 503, "INVOICE_EMAIL_UNAVAILABLE")
		return
	}
	var b struct {
		Version int64 `json:"expected_version"`
		Consent bool  `json:"consent_to_contact"`
	}
	key := r.Header.Get("Idempotency-Key")
	if decodeBounded(w, r, &b, 1024) != nil || !b.Consent || !keyPattern.MatchString(key) {
		fail(w, 422, "EXPLICIT_CONTACT_CONSENT_REQUIRED")
		return
	}
	var raw []byte
	if e := s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT pg10_invoice_contact($1::uuid,$2,$3::uuid)", ws, realm, id).Scan(&raw)
	}); e != nil {
		mapped(w, e)
		return
	}
	var contact struct {
		Email   string `json:"email"`
		Version int64  `json:"version"`
	}
	if json.Unmarshal(raw, &contact) != nil {
		fail(w, 503, "CONTACT_UNAVAILABLE")
		return
	}
	email, e := receiptnotice.NormalizeEmail(contact.Email)
	if e != nil {
		fail(w, 422, "CUSTOMER_EMAIL_REQUIRED")
		return
	}
	if contact.Version != b.Version {
		fail(w, 409, "INVOICE_VERSION_CHANGED")
		return
	}
	cipher, e := deviceevidence.Encrypt(s.Pipeline.Key, []byte(email), ws+"|"+realm+"|invoice-email")
	if e != nil {
		fail(w, 503, "INVOICE_EMAIL_UNAVAILABLE")
		return
	}
	var queued string
	e = s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT pg10_invoice_send($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7,$8)", ws, realm, id, actor, action, cipher, key, b.Version).Scan(&queued)
	})
	if e != nil {
		mapped(w, e)
		return
	}
	write(w, 202, map[string]any{"id": queued, "status": "queued", "delivery_confirmed": false, "contact_independently_verified": false})
}

type InvoiceNoticeArgs struct {
	Environment string `json:"environment"`
}

func (InvoiceNoticeArgs) Kind() string { return "invoice_delivery" }

type InvoiceNoticeWorker struct {
	river.WorkerDefaults[InvoiceNoticeArgs]
	Pool, Control *pgxpool.Pool
	Realm         string
	Key, TokenKey []byte
	SMTP          *receiptnotice.SMTPConfig
}

func (*InvoiceNoticeWorker) Timeout(*river.Job[InvoiceNoticeArgs]) time.Duration {
	return 30 * time.Second
}
func (w *InvoiceNoticeWorker) Work(ctx context.Context, job *river.Job[InvoiceNoticeArgs]) (workErr error) {
	defer func() { financial.RecordWorkerHealth(w.Pool, "invoice_notice", w.Realm, workErr == nil) }()
	if job.Args.Environment != w.Realm || w.SMTP == nil {
		return errors.New("invoice delivery unavailable")
	}
	var raw []byte
	if w.Pool.QueryRow(ctx, "SELECT pg10_invoice_notice_claim()").Scan(&raw) != nil {
		return errors.New("invoice delivery queue unavailable")
	}
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var n struct {
		ID        string    `json:"id"`
		Lease     string    `json:"lease_id"`
		Actor     string    `json:"actor_id"`
		Workspace string    `json:"workspace_id"`
		Realm     string    `json:"environment"`
		Cipher    string    `json:"recipient_cipher"`
		Key       string    `json:"capability_key"`
		Reference string    `json:"reference"`
		Created   time.Time `json:"created_at"`
	}
	if json.Unmarshal(raw, &n) != nil || n.Realm != w.Realm {
		return errors.New("invoice notice scope invalid")
	}
	finish := func(result string) error {
		var ok bool
		if w.Pool.QueryRow(ctx, "SELECT pg10_invoice_notice_finish($1::uuid,$2::uuid,$3)", n.ID, n.Lease, result).Scan(&ok) != nil || !ok {
			return errors.New("invoice delivery result unconfirmed")
		}
		return nil
	}
	var allowed bool
	if w.Control.QueryRow(ctx, "SELECT pg10_invoice_send_authorized($1::uuid,$2::uuid)", n.Workspace, n.Actor).Scan(&allowed) != nil {
		return errors.New("notice authority unavailable")
	}
	if !allowed {
		return finish("cancelled")
	}
	if w.Realm == "live" {
		var enabled bool
		if err := w.Control.QueryRow(ctx, "SELECT coalesce((payment_plan_effective($1::uuid)->'terms'->'features'->>'invoices')::boolean,false)", n.Workspace).Scan(&enabled); err != nil {
			return errors.New("invoice plan unavailable")
		}
		if !enabled {
			return finish("cancelled")
		}
	}
	cipher, e := base64.StdEncoding.DecodeString(n.Cipher)
	if e != nil {
		return finish("failed")
	}
	email, e := merchantwebhook.Decrypt(w.Key, cipher, n.Workspace+"|"+w.Realm+"|invoice-email")
	if e != nil {
		return finish("failed")
	}
	origin := os.Getenv("PUBLIC_WEB_ORIGIN")
	if _, e := merchantwebhook.ValidateURL(origin); e != nil {
		return finish("failed")
	}
	s := &Service{TokenKey: w.TokenKey}
	token := s.token(n.Workspace, w.Realm, "document:invoices:"+n.Key)
	var publicRaw []byte
	if err := w.Pool.QueryRow(ctx, "SELECT pg10_public($1)", digest(token)).Scan(&publicRaw); err != nil {
		return errors.New("invoice document unavailable")
	}
	if len(publicRaw) == 0 || string(publicRaw) == "null" {
		return finish("cancelled")
	}
	var invoice invoiceEmailData
	if json.Unmarshal(publicRaw, &invoice) != nil || invoice.Kind != "invoices" {
		return errors.New("invoice email data unavailable")
	}
	if invoice.Status != "issued" {
		return finish("cancelled")
	}
	var seller string
	var themeLogo *string
	if w.Control.QueryRow(ctx, "SELECT coalesce(nullif(t.body->'store'->>'name',''),w.name),t.body->'store'->>'logo' FROM workspaces w LEFT JOIN checkout_theme_settings t ON t.workspace_id=w.id WHERE w.id=$1::uuid", n.Workspace).Scan(&seller, &themeLogo) != nil {
		return errors.New("invoice merchant unavailable")
	}
	logoURL := ""
	if themeLogo != nil && strings.HasPrefix(*themeLogo, "/api/checkout-logos/") {
		sha := strings.TrimPrefix(*themeLogo, "/api/checkout-logos/")
		if len(sha) == 64 && strings.Trim(sha, "0123456789abcdef") == "" {
			logoURL = origin + *themeLogo
		}
	}
	invoiceURL := origin + "/invoice/" + token
	message := receiptnotice.Message{MerchantRequestedDocument: true, Workspace: n.Workspace, Environment: w.Realm, MessageID: n.ID, Subject: "Invoice / ইনভয়েস " + n.Reference, Text: "Invoice / ইনভয়েস: " + invoiceURL + "\nPayment is verified only by the server. / সার্ভার যাচাই ছাড়া পরিশোধ নিশ্চিত নয়।", HTML: renderInvoiceEmail(seller, n.Reference, string(email), invoiceURL, origin+"/pay/"+token, invoice, logoURL), Recipient: receiptnotice.Recipient{Workspace: n.Workspace, Environment: w.Realm, Email: string(email), ConsentedAt: n.Created}}
	e = receiptnotice.SendSMTP(ctx, *w.SMTP, message)
	if errors.Is(e, receiptnotice.ErrOutcomeUnknown) {
		return finish("unknown")
	}
	if e != nil {
		return finish("failed")
	}
	return finish("accepted")
}

type invoiceEmailData struct {
	Kind        string `json:"kind"`
	Status      string `json:"status"`
	IssuedAt    string `json:"issued_at"`
	BillToName  string `json:"bill_to_name"`
	AmountMinor int64  `json:"amount_minor"`
	PaidMinor   int64  `json:"paid_minor"`
	DueMinor    int64  `json:"due_minor"`
	Body        struct {
		DueAt string `json:"due_at"`
		Items []struct {
			Title     string `json:"title"`
			Quantity  int64  `json:"quantity"`
			UnitMinor int64  `json:"unit_amount_minor"`
		} `json:"items"`
		TaxMinor      int64 `json:"tax_minor"`
		FeeMinor      int64 `json:"fee_minor"`
		ShippingMinor int64 `json:"shipping_minor"`
		DiscountMinor int64 `json:"discount_minor"`
	} `json:"body"`
}

func invoiceEmailMoney(n int64) string {
	sign := ""
	if n < 0 {
		sign = "-"
		n = -n
	}
	return fmt.Sprintf("%sBDT %d.%02d", sign, n/100, n%100)
}
func renderInvoiceEmail(seller, reference, to, invoiceURL, payURL string, d invoiceEmailData, logoURL string) string {
	e := html.EscapeString
	var rows strings.Builder
	subtotal := int64(0)
	for _, item := range d.Body.Items {
		value := item.Quantity * item.UnitMinor
		subtotal += value
		rows.WriteString("<tr><td style=\"padding:12px;border-bottom:1px solid #eee\">" + e(item.Title) + "</td><td style=\"padding:12px;text-align:right;border-bottom:1px solid #eee\">" + fmt.Sprint(item.Quantity) + "</td><td style=\"padding:12px;text-align:right;border-bottom:1px solid #eee\">" + e(invoiceEmailMoney(value)) + "</td></tr>")
	}
	due := "—"
	if ts, err := time.Parse(time.RFC3339, d.Body.DueAt); err == nil {
		due = ts.In(time.FixedZone("BDT", 6*3600)).Format("02 Jan 2006")
	}
	issued := "—"
	if ts, err := time.Parse(time.RFC3339, d.IssuedAt); err == nil {
		issued = ts.In(time.FixedZone("BDT", 6*3600)).Format("02 Jan 2006")
	}
	recipient := d.BillToName
	if recipient == "" {
		recipient = to
	} else {
		recipient += " (" + to + ")"
	}
	button := "<p style=\"color:#167744;font-weight:600\">Payment verified / পেমেন্ট যাচাইকৃত</p>"
	if d.DueMinor > 0 {
		button = "<a href=\"" + e(payURL) + "\" style=\"display:inline-block;background:#161922;color:white;text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:600\">Pay invoice / পরিশোধ করুন</a>"
	}
	logoMarkup := ""
	if logoURL != "" {
		logoMarkup = "<img src=\"" + e(logoURL) + "\" width=\"48\" height=\"48\" alt=\"\" style=\"display:block;object-fit:contain;margin-bottom:10px\">"
	}
	return "<!doctype html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body style=\"margin:0;padding:24px 12px;background:#f5f6f8;color:#191d25;font-family:Arial,sans-serif\"><div style=\"max-width:620px;margin:auto;background:white;border:1px solid #e7e8ed;border-radius:12px;padding:24px\"><header style=\"border-bottom:1px solid #ddd;padding-bottom:18px\">" + logoMarkup + "<b style=\"font-size:21px\">" + e(seller) + "</b><h1 style=\"font-size:17px\">Invoice " + e(reference) + "</h1></header><p>To / প্রাপক: " + e(recipient) + "</p><p>Issued / ইস্যু: " + e(issued) + "</p><p>Due / শেষ তারিখ: " + e(due) + "</p><table style=\"width:100%;border-collapse:collapse\"><thead><tr><th style=\"text-align:left;padding:12px\">Item</th><th style=\"text-align:right;padding:12px\">Qty</th><th style=\"text-align:right;padding:12px\">Amount</th></tr></thead><tbody>" + rows.String() + "</tbody></table><div style=\"padding:16px;text-align:right\"><p>Subtotal: " + e(invoiceEmailMoney(subtotal)) + "</p><p>Invoice fee: " + e(invoiceEmailMoney(d.Body.FeeMinor)) + "</p><p>Tax: " + e(invoiceEmailMoney(d.Body.TaxMinor)) + " &nbsp; Shipping: " + e(invoiceEmailMoney(d.Body.ShippingMinor)) + " &nbsp; Discount: " + e(invoiceEmailMoney(d.Body.DiscountMinor)) + "</p><strong>Total: " + e(invoiceEmailMoney(d.AmountMinor)) + "</strong></div>" + button + "<p><a href=\"" + e(invoiceURL) + "\">View invoice / ইনভয়েস দেখুন</a></p><p style=\"font-size:12px;color:#747987\">Payment status is determined only by server verification.</p></div></body></html>"
}
