package checkout

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
)

// Adapters share authentication, immutable intents and authoritative state with
// the existing merchant API. No callback or redirect can mutate verification.
type paymentResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (b *paymentResponse) Header() http.Header { return b.header }
func (b *paymentResponse) WriteHeader(status int) {
	if b.status == 0 {
		b.status = status
	}
}
func (b *paymentResponse) Write(data []byte) (int, error) {
	if b.status == 0 {
		b.status = 200
	}
	return b.body.Write(data)
}
func forwardPaymentResponse(w http.ResponseWriter, b *paymentResponse) {
	for key, values := range b.header {
		w.Header()[key] = values
	}
	w.WriteHeader(b.status)
	_, _ = w.Write(b.body.Bytes())
}
func publicPaymentStatus(state string) string {
	switch state {
	case "completed":
		return "COMPLETED"
	case "cancelled":
		return "CANCELLED"
	case "expired":
		return "EXPIRED"
	case "exception":
		return "FAILED"
	case "refunded":
		return "REFUNDED"
	default:
		return "PENDING"
	}
}
func (s *Service) HandleSimpleCreate(w http.ResponseWriter, r *http.Request) {
	b := &paymentResponse{header: make(http.Header)}
	s.HandleMerchant(b, r)
	if b.status != 201 {
		forwardPaymentResponse(w, b)
		return
	}
	var result map[string]any
	if json.Unmarshal(b.body.Bytes(), &result) != nil {
		fail(w, 503, "INVALID_FINANCIAL_RESULT")
		return
	}
	result["invoice_id"] = result["id"]
	result["payment_url"] = result["checkout_url"]
	if state, ok := result["state"].(string); ok {
		result["status"] = publicPaymentStatus(state)
	} else {
		result["status"] = "PENDING"
	}
	write(w, 201, result)
}
func (s *Service) HandleSimpleVerify(w http.ResponseWriter, r *http.Request) {
	var body struct {
		InvoiceID string `json:"invoice_id"`
	}
	if decodeBounded(w, r, &body, 1024) != nil || !uuidPattern.MatchString(body.InvoiceID) {
		fail(w, 422, "INVALID_INVOICE_ID")
		return
	}
	next := r.Clone(r.Context())
	next.Method = http.MethodGet
	next.SetPathValue("intentID", body.InvoiceID)
	b := &paymentResponse{header: make(http.Header)}
	s.HandleMerchant(b, next)
	if b.status != 200 {
		forwardPaymentResponse(w, b)
		return
	}
	var envelope struct {
		Data map[string]any `json:"data"`
	}
	if json.Unmarshal(b.body.Bytes(), &envelope) != nil || envelope.Data == nil {
		fail(w, 503, "INVALID_FINANCIAL_RESULT")
		return
	}
	state, _ := envelope.Data["state"].(string)
	write(w, 200, map[string]any{"invoice_id": body.InvoiceID, "status": publicPaymentStatus(state), "amount_minor": envelope.Data["amount_minor"], "currency": envelope.Data["currency"], "reference": envelope.Data["merchant_reference"]})
}

// Domain separation keeps callback signing independent of public checkout tokens.
func (s *Service) automaticSigningSecret(ws, realm string) string {
	return base64.RawURLEncoding.EncodeToString(mac(s.TokenKey, "briofold:auto-webhook:v1|"+ws+"|"+realm))
}
func (s *Service) HandleSigningSecret(w http.ResponseWriter, r *http.Request) {
	if !s.pipelineReady() {
		fail(w, 503, "PIPELINE_SOURCE_UNAVAILABLE")
		return
	}
	ws, realm := r.PathValue("workspaceID"), explicitRealm(r)
	if !uuidPattern.MatchString(ws) || realm == "" {
		fail(w, 400, "INVALID_SCOPE")
		return
	}
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if err := s.pipelineSession(r, ws, realm, true); err != nil {
		authError(w, err)
		return
	}
	if !s.budget(w, "auto-signing:"+ws+":"+realm, 10) {
		return
	}
	write(w, 200, map[string]string{"signing_secret": s.automaticSigningSecret(ws, realm), "environment": realm})
}
