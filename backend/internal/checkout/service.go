// Package checkout implements PG05 sandbox payment requests and customer checkout.
// Neither customer input nor a browser redirect can mark money as verified.
package checkout

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/ekmivo/backend/internal/authz"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"github.com/masharzy/ekmivo/backend/internal/receiptnotice"
)

var (
	uuidPattern      = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	referencePattern = regexp.MustCompile(`^[^\x00-\x1f]{1,128}$`)
	tokenPattern     = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	keyPattern       = regexp.MustCompile(`^[A-Za-z0-9_.:-]{16,128}$`)
)

type Service struct {
	NoticeSMTP   *receiptnotice.SMTPConfig
	NoticeSchema bool
	Pipeline     *Pipeline
	limits       limiter
	Auth         *authz.Repository
	Sandbox      *pgxpool.Pool
	PublicSandboxWorker *pgxpool.Pool
	PublicSandboxCancel context.CancelFunc
	TokenKey     []byte
	PayerKey     []byte
}
type createRequest struct {
	Reference string `json:"merchant_reference"` // Old integration name.
	SimpleReference string `json:"reference,omitempty"`
	Amount int64 `json:"amount_minor"` // Old integration amount in paisa.
	AmountBDT json.RawMessage `json:"amount,omitempty"` // Simple API amount in BDT.
	Currency string `json:"currency"`
	Expiry int `json:"expires_in_minutes"`
	OrderID string `json:"order_id,omitempty"`
	InvoiceID string `json:"invoice_id,omitempty"`
	RedirectURL string `json:"redirect_url,omitempty"`
	CancelURL string `json:"cancel_url,omitempty"`
	WebhookURL string `json:"webhook_url,omitempty"`
	CustomerName string `json:"customer_name,omitempty"`
	CustomerEmail string `json:"customer_email,omitempty"`
	CustomerPhone string `json:"customer_phone,omitempty"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
}

// parseBDT handles JSON decimal numbers without float64 rounding or exponent
// interpretation. Storage and matching continue using integer paisa.
func parseBDT(raw json.RawMessage) (int64, bool) {
	text := string(raw)
	if !regexp.MustCompile(`^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$`).MatchString(text) {return 0,false}
	parts:=strings.SplitN(text,".",2)
	whole,err:=strconv.ParseInt(parts[0],10,64);if err!=nil{return 0,false}
	minor:=whole*100
	if len(parts)==2 {
		cents:=parts[1]
		if len(cents)==1{cents+="0"}
		fraction,err:=strconv.ParseInt(cents,10,64);if err!=nil{return 0,false}
		minor+=fraction
	}
	if minor<1||minor>100000000000{return 0,false};return minor,true
}

// prepareCreateRequest supports the simpler public contract without changing
// the immutable SQL money model. Reference/idempotency defaults are stable for
// explicit idempotency keys; absent keys deliberately generate fresh payments.
func prepareCreateRequest(body *createRequest, key, workspace, realm string) bool {
	if body==nil{return false}
	if len(body.AmountBDT)>0 {
		if body.Amount!=0||body.OrderID!=""||body.InvoiceID!=""||body.RedirectURL=="" {return false}
		minor,ok:=parseBDT(body.AmountBDT);if !ok{return false}
		body.Amount=minor
	}
	if body.Reference!=""&&body.SimpleReference!="" {return false}
	if body.Reference=="" {body.Reference=body.SimpleReference}
	if body.Reference=="" {body.Reference="EK-"+digest(workspace+"|"+realm+"|"+key)[:30]}
	if body.Currency=="" {body.Currency="BDT"}
	if body.Expiry==0 {body.Expiry=30}
	// Public URLs may only be HTTPS public destinations. Webhooks additionally
	// require an active, merchant-owned registered endpoint in pg62 SQL.
	for _,candidate:=range []string{body.RedirectURL,body.CancelURL,body.WebhookURL} {
		if candidate!="" {if _,err:=merchantwebhook.ValidateURL(candidate);err!=nil{return false}}
	}
	if len(body.CustomerName)>160||len(body.CustomerEmail)>254||len(body.CustomerPhone)>32{return false}
	if body.CustomerEmail!=""&&(!strings.Contains(body.CustomerEmail,"@")||strings.ContainsAny(body.CustomerEmail," \t\r\n")){return false}
	if len(body.Metadata)>2048{return false}
	if len(body.Metadata)>0 {
		var object map[string]json.RawMessage
		if json.Unmarshal(body.Metadata,&object)!=nil||object==nil{return false}
	}
	return validRequest(*body)
}

func write(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func fail(w http.ResponseWriter, status int, code string) {
	var correlation [12]byte
	_, _ = rand.Read(correlation[:])
	message := "Request could not be completed."
	if status == 401 {
		message = "Sign in or use a valid server credential."
	} else if status == 403 {
		message = "This action is not permitted."
	} else if status == 404 {
		message = "The scoped resource is unavailable."
	} else if status == 409 {
		message = "The request conflicts with current server state."
	} else if status == 422 {
		message = "Check the request fields."
	} else if status == 429 {
		message = "Wait before retrying."
	} else if status == 503 {
		message = "A required service is unavailable."
	}
	write(w, status, map[string]any{"error": map[string]string{"code": code, "message": message, "correlation_id": hex.EncodeToString(correlation[:])}})
}
func digest(s string) string { b := sha256.Sum256([]byte(s)); return hex.EncodeToString(b[:]) }
func mac(key []byte, s string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(s))
	return m.Sum(nil)
}
func (s *Service) token(ws, realm, key string) string {
	return base64.RawURLEncoding.EncodeToString(mac(s.TokenKey, ws+"|"+realm+"|"+key))
}
func (s *Service) ready() bool {
	return s != nil && s.Sandbox != nil && s.Auth != nil && s.Auth.DB != nil && len(s.TokenKey) >= 32 && len(s.PayerKey) >= 32
}
func (s *Service) Close() {
	if s != nil && s.PublicSandboxCancel != nil { s.PublicSandboxCancel() }
	if s != nil && s.PublicSandboxWorker != nil { s.PublicSandboxWorker.Close() }
	if s != nil && s.Pipeline != nil && s.Pipeline.Live != nil {
		s.Pipeline.Live.Close()
	}
	if s != nil && s.Pipeline != nil && s.Pipeline.Control != nil {
		s.Pipeline.Control.Close()
	}
	if s != nil && s.Sandbox != nil {
		s.Sandbox.Close()
	}
}

// Start refuses the control-plane database, privileged roles and a wrongly
// connected physical realm; there is no silent fallback to the auth database.
func Start(ctx context.Context, auth *authz.Repository, raw, controlURL string, tokenKey, payerKey []byte) (*Service, error) {
	if raw == "" || auth == nil || auth.DB == nil || len(tokenKey) < 32 || len(payerKey) < 32 {
		return nil, errors.New("PG05 sandbox finance/auth/secrets unavailable")
	}
	f, e := url.Parse(raw)
	a, ea := url.Parse(controlURL)
	if e != nil || ea != nil || f.Host == "" || f.User.Username() == "" || f.Host+f.Path == a.Host+a.Path {
		return nil, errors.New("PG05 must use a different isolated finance database")
	}
	pool, err := pgxpool.New(ctx, raw)
	if err != nil {
		return nil, err
	}
	var realm, actor string
	var hasReader, super, bypass bool
	err = pool.QueryRow(ctx, `SELECT f.environment,current_user,
  pg_has_role(current_user,'ekmivo_finance_reader','member'),
  r.rolsuper,r.rolbypassrls FROM financial_realm f
  JOIN pg_roles r ON r.rolname=current_user WHERE f.singleton`).
		Scan(&realm, &actor, &hasReader, &super, &bypass)
	if err != nil || realm != "sandbox" || !hasReader || super || bypass {
		pool.Close()
		return nil, errors.New("PG05 restricted sandbox reader role/realm check failed")
	}
	var controlReady bool
	if err = auth.DB.QueryRowContext(ctx, "SELECT to_regprocedure('pg05_public_business(uuid,text)') IS NOT NULL").Scan(&controlReady); err != nil || !controlReady {
		pool.Close()
		return nil, errors.New("PG05 public business control migration not installed")
	}
	// Check the migration exists before accepting customer-facing traffic.
	var installed bool
	err = pool.QueryRow(ctx, `SELECT to_regprocedure('pg05_merchant_detail(uuid,text,uuid)') IS NOT NULL
  AND to_regprocedure('pg05_create_linked_intent(uuid,text,text,text,uuid,integer,text,text,text)') IS NOT NULL`).Scan(&installed)
	if err != nil || !installed {
		pool.Close()
		return nil, errors.New("PG05 checkout migration not installed")
	}
	_ = actor // Role name intentionally not logged with credentials.
	return &Service{Auth: auth, Sandbox: pool, TokenKey: tokenKey, PayerKey: payerKey}, nil
}
func explicitRealm(r *http.Request) string {
	vals := r.URL.Query()["environment"]
	if len(vals) != 1 || len(vals[0]) == 0 {
		return ""
	}
	if vals[0] != "sandbox" && vals[0] != "live" {
		return ""
	}
	return vals[0]
}
func originAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	} // Server-to-server merchant API requests have no Origin.
	expected := strings.TrimSuffix(strings.TrimSpace(getAllowedOrigin()), "/")
	return expected != "" && origin == expected
}

var allowedOrigin string

func SetAllowedOrigin(v string) { allowedOrigin = v }
func getAllowedOrigin() string  { return allowedOrigin }
func mapped(w http.ResponseWriter, err error) {
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		switch pg.Code {
		case "23505":
			fail(w, 409, "CONFLICT")
			return
		case "23514":
			if pg.Message == "live source unavailable" {
				fail(w, 503, "RECEIVING_SOURCE_UNAVAILABLE")
				return
			}
			if pg.Message == "link expired" {
				fail(w, 410, "PAYMENT_LINK_EXPIRED")
				return
			}
			if pg.Message == "link use limit" {
				fail(w, 409, "PAYMENT_LINK_LIMIT_REACHED")
				return
			}
			fail(w, 409, "LOCKED_OR_EXPIRED")
			return
		case "22023", "23502", "22001", "22003":
			fail(w, 422, "INVALID_REQUEST")
			return
		case "42501":
			fail(w, 403, "ACCESS_DENIED")
			return
		case "P0002":
			fail(w, 404, "SOURCE_NOT_FOUND")
			return
		}
	}
	fail(w, 503, "FINANCIAL_SERVICE_UNAVAILABLE")
}
func metadataOrEmpty(raw json.RawMessage) string {
	if len(raw)==0{return "{}"}
	return string(raw)
}
func validRequest(body createRequest) bool {
	if body.Currency != "BDT" || body.Expiry < 5 || body.Expiry > 60 {
		return false
	}
	if strings.TrimSpace(body.Reference) != body.Reference || !referencePattern.MatchString(body.Reference) {
		return false
	}
	// A linked total must NEVER be supplied by the browser; SQL resolves
	// it from a frozen server-side source document under the same realm/tenant.
	if body.OrderID != "" || body.InvoiceID != "" {
		if body.OrderID != "" && body.InvoiceID != "" {
			return false
		}
		id := body.OrderID
		if id == "" {
			id = body.InvoiceID
		}
		return body.Amount == 0 && uuidPattern.MatchString(id)
	}
	return body.Amount >= 1 && body.Amount <= 100000000000
}
func decode(w http.ResponseWriter, r *http.Request, into any) bool {
	return decodeLimit(w, r, into, 4096)
}
func decodeLimit(w http.ResponseWriter, r *http.Request, into any, limit int64) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil {
		fail(w, 422, "INVALID_REQUEST")
		return false
	}
	var other any
	if err := dec.Decode(&other); !errors.Is(err, io.EOF) {
		fail(w, 422, "INVALID_REQUEST")
		return false
	}
	return true
}
func (s *Service) merchant(r *http.Request, ws, realm, scope string) error {
	// The key-only API route already validated and touched the credential.
	if present, err := boundMerchant(r, ws, realm, scope); present { return err }
	if realm != "sandbox" && (s.Pipeline == nil || s.Pipeline.Live == nil) {
		return authz.ErrUnavailable
	} // Live source adapter not yet onboarded.
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		key, err := s.Auth.AuthenticateMerchant(r.Context(), authHeader, authz.Environment(realm), scope)
		if err != nil {
			return err
		}
		if ws != "" && ws != key.WorkspaceID {
			return authz.ErrForbidden
		}
		return nil
	}
	cookie, err := r.Cookie("ekmivo-session")
	if err != nil {
		return authz.ErrUnauthorized
	}
	actor, err := s.Auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		return err
	}
	capability := authz.PaymentsRead
	if scope == "payments:write" {
		capability = authz.PaymentsIssue
	}
	_, err = s.Auth.AuthorizeWorkspace(r.Context(), actor, ws, authz.Environment(realm), capability)
	return err
}
func authError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, authz.ErrUnauthorized):
		fail(w, 401, "UNAUTHENTICATED")
	case errors.Is(err, authz.ErrForbidden), errors.Is(err, authz.ErrMFANeeded):
		fail(w, 403, "ACCESS_DENIED")
	default:
		fail(w, 503, "AUTH_OR_SOURCE_UNAVAILABLE")
	}
}
func (s *Service) scoped(ctx context.Context, ws, realm string, fn func(pgx.Tx) error) error {
	pool := s.Sandbox
	if realm == "live" {
		pool = s.pipelinePool(realm)
	}
	if pool == nil {
		return authz.ErrUnavailable
	}
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)`, ws, realm)
	if err != nil {
		return err
	}
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func attachTokens(s *Service, ws, realm string, result any) {
	switch v := result.(type) {
	case map[string]any:
		if key, ok := v["creation_key"].(string); ok {
			v["checkout_token"] = s.token(ws, realm, key)
			delete(v, "creation_key")
		}
	case []any:
		for _, item := range v {
			attachTokens(s, ws, realm, item)
		}
	}
}

// HandleMerchant exposes independently scoped session or merchant-key
// requests, never accepts workspace_id from the JSON body.
func (s *Service) HandleMerchant(w http.ResponseWriter, r *http.Request) {
	if !s.ready() {
		fail(w, 503, "FINANCIAL_SERVICE_UNAVAILABLE")
		return
	}
	ws := r.PathValue("workspaceID")
	realm := explicitRealm(r)
	if !uuidPattern.MatchString(ws) || realm == "" {
		fail(w, 400, "INVALID_SCOPE")
		return
	}
	if realm == "live" && s.pipelinePool(realm) == nil {
		fail(w, 503, "LIVE_SOURCE_NOT_CONNECTED")
		return
	}
	if r.Method != "GET" && !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	cap := "payments:read"
	if r.Method != "GET" {
		cap = "payments:write"
	}
	if err := s.merchant(r, ws, realm, cap); err != nil {
		authError(w, err)
		return
	}
	if !s.budget(w, "merchant:"+ws+":"+r.Method, 120) {
		return
	}
	w, finishActivity := s.observeAPI(w, r, ws, realm)
	defer finishActivity()
	switch r.Method {
	case "GET":
		var raw []byte
		err := s.scoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			if id := r.PathValue("intentID"); id != "" {
				if !uuidPattern.MatchString(id) {
					return &pgconn.PgError{Code: "P0002"}
				}
				return tx.QueryRow(r.Context(), "SELECT pg05_merchant_detail($1::uuid,$2,$3::uuid)", ws, realm, id).Scan(&raw)
			}
			return tx.QueryRow(r.Context(), "SELECT pg05_merchant_list($1::uuid,$2)", ws, realm).Scan(&raw)
		})
		if err != nil {
			mapped(w, err)
			return
		}
		if len(raw) == 0 || string(raw) == "null" {
			fail(w, 404, "NOT_FOUND")
			return
		}
		var data any
		if err = json.Unmarshal(raw, &data); err != nil {
			fail(w, 503, "INVALID_FINANCIAL_RESULT")
			return
		}
		attachTokens(s, ws, realm, data)
		write(w, 200, map[string]any{"data": data, "environment": realm})
	case "POST":
		if r.PathValue("intentID") != "" {
			s.cancel(w, r, ws, realm)
			return
		}
		if !s.billingAllowsNew(r.Context(), ws, realm) {
			fail(w, 403, "SUBSCRIPTION_REQUIRED")
			return
		}
		key := r.Header.Get("Idempotency-Key")
		if key=="" {
			var fresh [24]byte
			if _,err:=rand.Read(fresh[:]);err!=nil{fail(w,503,"KEY_GENERATION_UNAVAILABLE");return}
			key="ekmivo-"+hex.EncodeToString(fresh[:])
		}
		if !keyPattern.MatchString(key) {fail(w,422,"INVALID_IDEMPOTENCY_KEY");return}
		var payload createRequest
		if !decode(w, r, &payload) { return }
		if !prepareCreateRequest(&payload,key,ws,realm) {
			fail(w, 422, "INVALID_REQUEST")
			return
		}
		raw, _ := json.Marshal(payload)
		token := s.token(ws, realm, key)
		var answer []byte
		err := s.scoped(r.Context(),ws,realm,func(tx pgx.Tx) error {
			var issueErr error
			switch {
			case payload.InvoiceID!=""&&(realm=="live"||os.Getenv("PG10_EXTENSIONS_ENABLED")=="true"):
				issueErr=tx.QueryRow(r.Context(),"SELECT pg10_invoice_intent($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8)",ws,realm,payload.InvoiceID,payload.Reference,payload.Expiry,key,digest(token),digest(string(raw))).Scan(&answer)
			case payload.OrderID!=""||payload.InvoiceID!="":
				kind,sourceID:="order",payload.OrderID
				if payload.InvoiceID!=""{kind,sourceID="invoice",payload.InvoiceID}
				issueErr=tx.QueryRow(r.Context(),"SELECT pg05_create_linked_intent($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8,$9)",ws,realm,payload.Reference,kind,sourceID,payload.Expiry,key,digest(token),digest(string(raw))).Scan(&answer)
			default:
				function:="pg05_create_intent"
				if realm=="live"{function="pg10_intent"}
				issueErr=tx.QueryRow(r.Context(),"SELECT "+function+"($1::uuid,$2,$3,$4,$5,$6,$7,$8)",ws,realm,payload.Reference,payload.Amount,payload.Expiry,key,digest(token),digest(string(raw))).Scan(&answer)
			}
			if issueErr!=nil{return issueErr}
			var created struct{ID string `json:"id"`}
			if json.Unmarshal(answer,&created)!=nil||!uuidPattern.MatchString(created.ID){return errors.New("invalid intent creation result")}
			var stored bool
			return tx.QueryRow(r.Context(),"SELECT pg62_store_intent_options($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8,$9,$10::jsonb)",
				ws,realm,created.ID,payload.RedirectURL,payload.CancelURL,payload.WebhookURL,payload.CustomerName,payload.CustomerEmail,payload.CustomerPhone,metadataOrEmpty(payload.Metadata)).Scan(&stored)
		})
		if err != nil {
			mapped(w, err)
			return
		}
		var data map[string]any
		if err = json.Unmarshal(answer, &data); err != nil {
			fail(w, 503, "INVALID_FINANCIAL_RESULT")
			return
		}
		data["checkout_token"] = token
		if origin := strings.TrimSuffix(getAllowedOrigin(), "/"); strings.HasPrefix(origin, "https://") {
			data["checkout_url"] = origin + "/en/checkout/" + url.PathEscape(token)
		}
		write(w, 201, data)
	default:
		fail(w, 405, "METHOD_NOT_ALLOWED")
	}
}

// HandleSources creates immutable, server-calculated sandbox invoice/order
// snapshots and lists ONLY the documents in the authorized workspace.
func (s *Service) HandleSources(w http.ResponseWriter, r *http.Request) {
	if !s.ready() {
		fail(w, 503, "FINANCIAL_SERVICE_UNAVAILABLE")
		return
	}
	ws := r.PathValue("workspaceID")
	realm := explicitRealm(r)
	if !uuidPattern.MatchString(ws) || realm == "" {
		fail(w, 400, "INVALID_SCOPE")
		return
	}
	if realm == "live" {
		fail(w, 503, "LIVE_SOURCE_NOT_CONNECTED")
		return
	}
	if r.Method != "GET" && r.Method != "POST" {
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	if r.Method == "POST" && !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	scope := "payments:read"
	if r.Method == "POST" {
		scope = "payments:write"
	}
	if err := s.merchant(r, ws, realm, scope); err != nil {
		authError(w, err)
		return
	}
	if !s.budget(w, "merchant:"+ws+":"+r.Method, 120) {
		return
	}
	w, finishActivity := s.observeAPI(w, r, ws, realm)
	defer finishActivity()
	if r.Method == "GET" {
		var raw []byte
		err := s.scoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(),
				"SELECT pg05_list_billing_sources($1::uuid,$2)", ws, realm).Scan(&raw)
		})
		if err != nil {
			mapped(w, err)
			return
		}
		if len(raw) == 0 || string(raw) == "null" {
			fail(w, 403, "ACCESS_DENIED")
			return
		}
		var data any
		if json.Unmarshal(raw, &data) != nil {
			fail(w, 503, "INVALID_FINANCIAL_RESULT")
			return
		}
		write(w, 200, map[string]any{"data": data, "environment": realm})
		return
	}
	var body struct {
		Kind      string          `json:"source_kind"`
		Reference string          `json:"source_reference"`
		Items     json.RawMessage `json:"items"`
	}
	if !decodeLimit(w, r, &body, 16384) {
		return
	}
	if body.Kind != "order" && body.Kind != "invoice" {
		fail(w, 422, "INVALID_SOURCE")
		return
	}
	if !referencePattern.MatchString(body.Reference) || strings.TrimSpace(body.Reference) != body.Reference ||
		len(body.Items) == 0 {
		fail(w, 422, "INVALID_SOURCE")
		return
	}
	var answer []byte
	err := s.scoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			"SELECT pg05_create_billing_source($1::uuid,$2,$3,$4,$5::jsonb)",
			ws, realm, body.Kind, body.Reference, string(body.Items)).Scan(&answer)
	})
	if err != nil {
		mapped(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(201)
	_, _ = w.Write(answer)
}
func (s *Service) cancel(w http.ResponseWriter, r *http.Request, ws, realm string) {
	if r.PathValue("action") != "cancel" || !uuidPattern.MatchString(r.PathValue("intentID")) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var answer []byte
	err := s.scoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT pg05_cancel_intent($1::uuid,$2,$3::uuid)",
			ws, realm, r.PathValue("intentID")).Scan(&answer)
	})
	if err != nil {
		mapped(w, err)
		return
	}
	if len(answer) == 0 || string(answer) == "null" {
		fail(w, 404, "NOT_FOUND")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(200)
	_, _ = w.Write(answer)
}

var digits = map[rune]rune{
	'০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
	'٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
}

func NormalizePayer(s string) (string, bool) {
	var b strings.Builder
	for _, r := range strings.TrimSpace(s) {
		if d, ok := digits[r]; ok {
			r = d
		}
		if r == ' ' || r == '-' {
			continue
		}
		b.WriteRune(r)
	}
	s = b.String()
	if strings.HasPrefix(s, "01") {
		s = "+88" + s
	}
	if strings.HasPrefix(s, "8801") {
		s = "+" + s
	}
	if len(s) != 14 || !strings.HasPrefix(s, "+8801") {
		return "", false
	}
	if s[5] < '3' || s[5] > '9' {
		return "", false
	}
	for _, ch := range s[6:] {
		if ch < '0' || ch > '9' {
			return "", false
		}
	}
	return s, true
}

// HandlePublic validates a 256-bit opaque capability; no untrusted callback,
// money-status, redirect or manual "verified" operation is accepted.
func (s *Service) HandlePublic(w http.ResponseWriter, r *http.Request) {
	if !s.ready() {
		fail(w, 503, "FINANCIAL_SERVICE_UNAVAILABLE")
		return
	}
	token := r.PathValue("token")
	if !s.budget(w, "public:global", 6000) {
		return
	}
	if !tokenPattern.MatchString(token) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	limit := 90
	if r.Method == "POST" {
		limit = 20
	}
	if !s.budget(w, "public:"+digest(token)+":"+r.Method, limit) {
		return
	}
	if r.Method == "POST" {
		pool, initial, err := s.lookupCheckout(r, token)
		if err != nil {
			mapped(w, err)
			return
		}
		if pool == nil || len(initial) == 0 || string(initial) == "null" {
			fail(w, 404, "NOT_FOUND")
			return
		}
		if _, err = s.publicBusiness(r, initial); err != nil {
			fail(w, 503, "MERCHANT_UNAVAILABLE")
			return
		}
		if !originAllowed(r) {
			fail(w, 403, "ORIGIN_DENIED")
			return
		}
		if r.PathValue("action") == "cancel" {
			var cancelled []byte
			err = pool.QueryRow(r.Context(), "SELECT pg05_public_cancel($1)", digest(token)).Scan(&cancelled)
			if err != nil { mapped(w, err); return }
			if len(cancelled)==0 || string(cancelled)=="null" { fail(w,404,"NOT_FOUND");return }
			write(w,200,json.RawMessage(cancelled))
			return
		}
		if r.PathValue("action") != "lock" {
			fail(w, 405, "METHOD_NOT_ALLOWED")
			return
		}
		var body struct {
			Payer  string `json:"payer_number"`
			Method string `json:"method"`
		}
		if !decode(w, r, &body) {
			return
		}
		payer, ok := NormalizePayer(body.Payer)
		if !ok || !((body.Method == "bkash") || (body.Method == "nagad") || (body.Method == "rocket")) {
			fail(w, 422, "INVALID_PAYER_OR_METHOD")
			return
		}
		var raw []byte
		if checkoutRealm(initial) == "live" && !s.liveMethods(initial)[body.Method] {
			fail(w, 503, "RECEIVING_SOURCE_UNAVAILABLE")
			return
		}
		lockSQL := "SELECT pg05_lock_payer($1,$2,$3,$4)"
		if s.pipelineReady() {
			lockSQL = "SELECT pg06_lock_route($1,$2,$3,$4)"
		}
		if checkoutRealm(initial) == "live" {
			lockSQL = "SELECT pg10_lock_route($1,$2,$3,$4)"
		}
		err = pool.QueryRow(r.Context(), lockSQL,
			digest(token), hex.EncodeToString(mac(s.PayerKey, payer)), payer[len(payer)-4:], body.Method).Scan(&raw)
		if err != nil {
			mapped(w, err)
			return
		}
		if len(raw) == 0 || string(raw) == "null" {
			fail(w, 404, "NOT_FOUND")
			return
		}
		if checkoutRealm(initial) == "live" {
			_, raw, err = s.lookupCheckout(r, token)
			if err != nil {
				fail(w, 503, "CHECKOUT_SERVICE_UNAVAILABLE")
				return
			}
		}
		s.publicResult(w, r, raw)
		return
	}
	if r.Method != "GET" || r.PathValue("action") != "" {
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	pool, raw, err := s.lookupCheckout(r, token)
	if err != nil {
		mapped(w, err)
		return
	}
	if pool == nil || len(raw) == 0 || string(raw) == "null" {
		fail(w, 404, "NOT_FOUND")
		return
	}
	s.publicResult(w, r, raw)
}

// Capability authorizes only this checkout's public business identity. Current
// control-plane enablement is rechecked; stale finance projections cannot keep a
// disabled merchant publicly accepting payer locks through the web boundary.
type PublicBusinessInfo struct {
	Name  string            `json:"merchant_name"`
	Brand map[string]string `json:"brand"`
}

func (s *Service) publicBusiness(r *http.Request, raw []byte) (string, error) {
	info, err := s.publicBusinessInfo(r, raw)
	return info.Name, err
}
func (s *Service) publicBusinessInfo(r *http.Request, raw []byte) (PublicBusinessInfo, error) {
	var data struct {
		Workspace   string `json:"workspace_id"`
		Environment string `json:"environment"`
	}
	var info PublicBusinessInfo
	if json.Unmarshal(raw, &data) != nil || !uuidPattern.MatchString(data.Workspace) || (data.Environment != "sandbox" && data.Environment != "live") {
		return info, errors.New("invalid checkout scope")
	}
	if os.Getenv("PG10_EXTENSIONS_ENABLED") == "true" {
		var encoded []byte
		if err := s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_public_checkout($1::uuid,$2)", data.Workspace, data.Environment).Scan(&encoded); err != nil {
			return info, err
		}
		if json.Unmarshal(encoded, &info) != nil || info.Name == "" {
			return info, errors.New("merchant unavailable")
		}
		return info, nil
	}
	function := "pg05_public_business"
	if data.Environment == "live" {
		function = "pg10_public_business"
	}
	err := s.Auth.DB.QueryRowContext(r.Context(), "SELECT "+function+"($1::uuid,$2)", data.Workspace, data.Environment).Scan(&info.Name)
	return info, err
}

func (s *Service) publicResult(w http.ResponseWriter, r *http.Request, raw []byte) {
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		fail(w, 503, "INVALID_FINANCIAL_RESULT")
		return
	}
	ws, ok := data["workspace_id"].(string)
	if !ok || !uuidPattern.MatchString(ws) {
		fail(w, 503, "INVALID_FINANCIAL_RESULT")
		return
	}
	business, err := s.publicBusinessInfo(r, raw)
	if err != nil {
		fail(w, 503, "MERCHANT_UNAVAILABLE")
		return
	}

	if err := s.publicDestination(data); err != nil {
		fail(w, 503, "RECEIVING_SOURCE_UNAVAILABLE")
		return
	}
	delete(data, "workspace_id")
	// Tell customers whether a signed phone is actually online independently
	// from whether production-approved receipt parsing is available.
	if checkoutRealm(raw) == "live" {
		connected := false
		if sources, ok := data["sources"].([]any); ok {
			for _, item := range sources {
				source, ok := item.(map[string]any)
				if ok && source["forwarder"] == true {
					connected = true
					break
				}
			}
		}
		data["phone_connected"] = connected
	}
	delete(data, "sources")
	if checkoutRealm(raw) == "live" {
		available := s.liveMethods(raw)
		list := []string{}
		for _, method := range []string{"bkash", "nagad", "rocket", "bank", "other"} {
			if available[method] {
				list = append(list, method)
			}
		}
		data["methods"] = list
		data["verification_available"] = len(list) > 0
	} else if s.pipelineReady() {
		for _, rule := range s.Pipeline.Rules {
			if rule.Approved && (!rule.SandboxOnly || checkoutRealm(raw) == "sandbox") {
				data["verification_available"] = true
				break
			}
		}
	}
	// Redirect URLs are resolved only from a token-bound, tenant-scoped intent.
	// Never expose customer contact or merchant-only metadata publicly.
	if intentID,ok:=data["id"].(string);ok&&uuidPattern.MatchString(intentID) {
		realm:=checkoutRealm(raw)
		var redirects []byte
		if err:=s.scoped(r.Context(),ws,realm,func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(),"SELECT pg62_checkout_redirects($1::uuid,$2,$3::uuid)",ws,realm,intentID).Scan(&redirects)
		});err!=nil{fail(w,503,"CHECKOUT_OPTIONS_UNAVAILABLE");return}
		var options map[string]any
		if json.Unmarshal(redirects,&options)==nil {for k,v:=range options{data[k]=v}}
	}
	data["merchant_name"] = business.Name
	data["brand"] = business.Brand
	data["notice_available"] = s.NoticeSchema && s.pipelineReady()
	data["notice_delivery_available"] = s.NoticeSMTP != nil && s.pipelineReady()
	write(w, 200, data)
}

// Prepared by the Go API main package on service startup.
func Diagnostic(s *Service) string {
	if s == nil || !s.ready() {
		return "checkout not configured"
	}
	return fmt.Sprintf("sandbox checkout configured, live gated, %s", time.Now().UTC().Format("2006-01-02"))
}
