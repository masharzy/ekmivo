package checkout

import (
	"context"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/ekmivo/backend/internal/authz"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// Pipeline configuration is opt-in deployment wiring, not an opt-in to
// automatic matching. Every complete unique approved receipt matches normally.
type Pipeline struct {
	Key     []byte
	Rules   map[string]deviceevidence.ParserRule
	Control *pgxpool.Pool
	Live    *pgxpool.Pool
}

func (s *Service) ConfigurePipeline(ctx context.Context, keyHex, rulesJSON, controlDSN, liveDSN string) error {
	key, e := hex.DecodeString(keyHex)
	if e != nil || len(key) != 32 || controlDSN == "" {
		return errors.New("pipeline encryption/control configuration unavailable")
	}
	rules := []deviceevidence.ParserRule{}
	if strings.TrimSpace(rulesJSON) == "" {
		rulesJSON = "[]"
	}
	if e = json.Unmarshal([]byte(rulesJSON), &rules); e != nil {
		return errors.New("invalid receipt parser registry")
	}
	registry := map[string]deviceevidence.ParserRule{}
	for _, r := range builtinSMSRules() {
		if e = r.Validate(); e != nil {
			return e
		}
		registry[r.ID] = r
	}
	for _, r := range rules {
		if e = r.Validate(); e != nil {
			return e
		}
		if _, exists := registry[r.ID]; exists {
			return errors.New("duplicate parser id")
		}
		registry[r.ID] = r
	}
	control, e := pgxpool.New(ctx, controlDSN)
	if e != nil {
		return e
	}
	var allowed bool
	if e = control.QueryRow(ctx, `SELECT pg_has_role(current_user,'ekmivo_financial_projection','member') AND to_regclass('public.auth_sessions') IS NOT NULL AND to_regclass('public.financial_realm') IS NULL`).Scan(&allowed); e != nil || !allowed {
		control.Close()
		return errors.New("restricted control projection connection required")
	}
	var installed bool
	if e = s.Sandbox.QueryRow(ctx, `SELECT to_regprocedure('pg07_pending()') IS NOT NULL`).Scan(&installed); e != nil || !installed {
		control.Close()
		return errors.New("receipt pipeline migration unavailable")
	}
	s.Pipeline = &Pipeline{Key: key, Rules: registry, Control: control}
	if liveDSN != "" {
		live, err := pgxpool.New(ctx, liveDSN)
		if err != nil {
			control.Close()
			s.Pipeline = nil
			return err
		}
		var realm string
		var valid bool
		err = live.QueryRow(ctx, `SELECT f.environment,pg_has_role(current_user,'ekmivo_finance_reader','member') AND NOT r.rolsuper AND NOT r.rolbypassrls AND to_regprocedure('pg07_pending()') IS NOT NULL FROM financial_realm f JOIN pg_roles r ON r.rolname=current_user WHERE f.singleton`).Scan(&realm, &valid)
		a, b := s.Sandbox.Config().ConnConfig, live.Config().ConnConfig
		if err != nil || realm != "live" || !valid || a.Host == b.Host && a.Database == b.Database || a.User == b.User {
			live.Close()
			control.Close()
			s.Pipeline = nil
			return errors.New("independent restricted live financial realm required")
		}
		s.Pipeline.Live = live
	}
	return nil
}
func (s *Service) pipelinePool(realm string) *pgxpool.Pool {
	if realm == "sandbox" {
		return s.Sandbox
	}
	if realm == "live" && s.Pipeline != nil {
		return s.Pipeline.Live
	}
	return nil
}
func (s *Service) pipelineScoped(ctx context.Context, ws, realm string, fn func(pgx.Tx) error) error {
	pool := s.pipelinePool(realm)
	if pool == nil {
		return authz.ErrUnavailable
	}
	tx, e := pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, `SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment',$2,true)`, ws, realm); e != nil {
		return e
	}
	if e = fn(tx); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Service) pipelineReady() bool {
	return s.ready() && s.Pipeline != nil && s.Pipeline.Control != nil
}
func randomCapability() (string, error) {
	b := make([]byte, 32)
	_, e := rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b), e
}
func decodeBounded(w http.ResponseWriter, r *http.Request, value any, limit int64) error {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	d.DisallowUnknownFields()
	if e := d.Decode(value); e != nil {
		return e
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return errors.New("extra request body")
	}
	return nil
}
func (s *Service) pipelineSession(r *http.Request, ws, realm string, manage bool) error {
	if s.pipelinePool(realm) == nil {
		return authz.ErrUnavailable
	}
	if !manage && r.Header.Get("Authorization") != "" {
		key, e := s.Auth.AuthenticateMerchant(r.Context(), r.Header.Get("Authorization"), authz.Environment(realm), "payments:read")
		if e != nil {
			return e
		}
		if key.WorkspaceID != ws {
			return authz.ErrForbidden
		}
		return nil
	}
	// Device and secret management require a session owner/admin capability,
	// not merely an editor's payment issuance key.
	cookie, e := r.Cookie("ekmivo-session")
	if e != nil {
		return authz.ErrUnauthorized
	}
	actor, e := s.Auth.Authenticate(r.Context(), cookie.Value)
	if e != nil {
		return e
	}
	capability := authz.PaymentsRead
	if manage {
		capability = authz.PaymentsManage
	}
	_, e = s.Auth.AuthorizeWorkspace(r.Context(), actor, ws, authz.Environment(realm), capability)
	return e
}
func (s *Service) HandleOperations(w http.ResponseWriter, r *http.Request) {
	if !s.pipelineReady() {
		fail(w, 503, "PIPELINE_SOURCE_UNAVAILABLE")
		return
	}
	ws, realm := r.PathValue("workspaceID"), explicitRealm(r)
	resource, id, action := r.PathValue("resource"), r.PathValue("resourceID"), r.PathValue("action")
	if !uuidPattern.MatchString(ws) || realm == "" || id != "" && !uuidPattern.MatchString(id) {
		fail(w, 400, "INVALID_SCOPE")
		return
	}
	if r.Method != "GET" && !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if e := s.pipelineSession(r, ws, realm, r.Method != "GET"); e != nil {
		authError(w, e)
		return
	}
	w, finishActivity := s.observeAPI(w, r, ws, realm)
	defer finishActivity()
	actorID := ""
	if r.Method != "GET" {
		cookie, _ := r.Cookie("ekmivo-session")
		actor, e := s.Auth.Authenticate(r.Context(), cookie.Value)
		if e != nil {
			authError(w, e)
			return
		}
		actorID = actor.UserID
	}
	allowed := map[string]bool{"notices": true, "devices": true, "gateways": true, "payments": true, "incoming": true, "webhooks": true, "deliveries": true, "events": true, "parsers": true, "overview": true}
	if !allowed[resource] {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if resource == "parsers" && r.Method == "GET" {
		items := []map[string]any{}
		for _, rule := range s.Pipeline.Rules {
			if rule.Approved && (!rule.SandboxOnly || realm == "sandbox") {
				items = append(items, map[string]any{"id": rule.ID, "source": rule.Source, "method": rule.Method, "version": rule.Version})
			}
		}
		write(w, 200, map[string]any{"items": items})
		return
	}
	var raw []byte
	var secret string
	var pairing string
	withScope := s.pipelineScoped
	if r.Method != "GET" && ((id == "" && (resource == "devices" || resource == "gateways")) || resource == "gateways" && action == "enable") {
		withScope = s.creationScoped
	}
	e := withScope(r.Context(), ws, realm, func(tx pgx.Tx) error {
		if actorID != "" {
			if _, e := tx.Exec(r.Context(), "SELECT set_config('ekmivo.actor_id',$1,true)", actorID); e != nil {
				return e
			}
		}
		if r.Method == "GET" {
			if resource == "notices" {
				if id == "" {
					return errors.New("payment id required")
				}
				return tx.QueryRow(r.Context(), "SELECT pg08_notice_read($1::uuid,$2,$3::uuid)", ws, realm, id).Scan(&raw)
			}
			cursor := r.URL.Query().Get("cursor")
			if cursor != "" && !uuidPattern.MatchString(cursor) {
				return errors.New("invalid cursor")
			}
			query := r.URL.Query()
			account := query.Get("account")
			if account != "" && !uuidPattern.MatchString(account) {
				return errors.New("invalid account filter")
			}
			var from, to any
			for _, field := range []string{"from", "to"} {
				if value := query.Get(field); value != "" {
					parsed, e := time.Parse(time.RFC3339, value)
					if e != nil {
						return errors.New("invalid date filter")
					}
					if field == "from" {
						from = parsed
					} else {
						to = parsed
					}
				}
			}
			search := strings.TrimSpace(query.Get("q"))
			if len([]rune(search)) > 96 {
				return errors.New("invalid search filter")
			}
			if resource == "incoming" {
				// New physical-phone SMS receipts live in pg06_phone_forwarded, not
				// the legacy pg06_transport source. Preserve both without double-counting.
				return tx.QueryRow(r.Context(),
					"SELECT pg56_incoming_read($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::uuid,$7,$8::timestamptz,$9::timestamptz,$10)",
					ws, realm, nullableID(id), nullableID(cursor), nullableID(query.Get("status")), nullableID(account), nullableID(query.Get("method")), from, to, nullableID(search)).Scan(&raw)
			}
			return tx.QueryRow(r.Context(), "SELECT pg09_read($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7::uuid,$8,$9::timestamptz,$10::timestamptz,$11::text)", ws, realm, resource, nullableID(id), nullableID(cursor), nullableID(query.Get("status")), nullableID(account), nullableID(query.Get("method")), from, to, nullableID(search)).Scan(&raw)
		}
		var body struct {
			Consent   bool   `json:"shared_number_consent"`
			Reason    string `json:"reason"`
			Method    string `json:"method"`
			Number    string `json:"account_number"`
			AccountID string `json:"account_id"`
			Name      string `json:"name"`
			Source    string `json:"source"`
			Binding   string `json:"binding"`
			ParserID  string `json:"parser_id"`
			URL       string `json:"url"`
		}
		if e := decodeBounded(w, r, &body, 4096); e != nil {
			return e
		}
		if resource == "notices" {
			if id == "" || action != "retry" {
				return errors.New("invalid notice recovery action")
			}
			return tx.QueryRow(r.Context(), "SELECT pg08_notice_retry($1::uuid,$2,$3::uuid,$4)", ws, realm, id, body.Reason).Scan(&raw)
		}
		if resource == "gateways" && id == "" && action == "" {
			number, ok := deviceevidence.NormalizeNumber(body.Number)
			if !ok {
				return errors.New("full receiving number required")
			}
			encrypted, e := deviceevidence.Encrypt(s.Pipeline.Key, []byte(number), ws+"|"+realm)
			if e != nil {
				return e
			}
			return tx.QueryRow(r.Context(), "SELECT pg06_account_add($1::uuid,$2,$3,$4,$5,$6,$7)", ws, realm, body.Method, deviceevidence.Identity(s.PayerKey, "account|"+body.Method+"|"+number), number[len(number)-4:], encrypted, body.Consent).Scan(&raw)
		}
		if resource == "gateways" && id != "" && action == "delete" {
			return tx.QueryRow(r.Context(), "SELECT pg06_account_delete($1::uuid,$2,$3::uuid)", ws, realm, id).Scan(&raw)
		}
		if resource == "devices" && id == "" && action == "" {
			rule, ok := s.Pipeline.Rules[body.ParserID]
			if !ok || !rule.Approved || (rule.SandboxOnly && realm != "sandbox") || rule.Source != body.Source || !uuidPattern.MatchString(body.AccountID) {
				return errors.New("approved parser/account/source required")
			}
			if !strings.HasPrefix(body.Binding, "sms:") && body.Binding != "package:"+body.Source {
				return errors.New("explicit SIM/package binding required")
			}
			var accountBody []byte
			if e := tx.QueryRow(r.Context(), "SELECT pg09_read($1::uuid,$2,'gateways',$3::uuid,NULL)", ws, realm, body.AccountID).Scan(&accountBody); e != nil {
				return e
			}
			var account struct {
				Items []struct {
					Method string `json:"method"`
				} `json:"items"`
			}
			if json.Unmarshal(accountBody, &account) != nil || len(account.Items) != 1 || account.Items[0].Method != rule.Method {
				return errors.New("method/account binding mismatch")
			}
			var e error
			pairing, e = randomCapability()
			if e != nil {
				return e
			}
			return tx.QueryRow(r.Context(), "SELECT pg06_pair($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8)", ws, realm, body.AccountID, body.Name, body.Source, body.ParserID, body.Binding, digest(pairing)).Scan(&raw)
		}
		var encrypted []byte
		if resource == "webhooks" && (id == "" || action == "rotate") {
			if id == "" {
				if _, e := merchantwebhook.ValidateURL(body.URL); e != nil {
					return e
				}
				action = "create"
			}
			var e error
			secret, e = randomCapability()
			if e != nil {
				return e
			}
			encrypted, e = deviceevidence.Encrypt(s.Pipeline.Key, []byte(secret), ws+"|"+realm)
			if e != nil {
				return e
			}
		}
		payload, _ := json.Marshal(body)
		return tx.QueryRow(r.Context(), "SELECT pg09_action($1::uuid,$2,$3,$4::uuid,$5,$6::jsonb,$7)", ws, realm, resource, nullableID(id), action, string(payload), encrypted).Scan(&raw)
	})
	if e != nil {
		mapped(w, e)
		return
	}
	var result map[string]any
	if e = json.Unmarshal(raw, &result); e != nil {
		fail(w, 503, "INVALID_SERVICE_RESPONSE")
		return
	}
	if r.Method == "GET" && resource == "incoming" {
		if err := s.supplementSMS(r, ws, realm, result); err != nil {
			mapped(w, err)
			return
		}
	}
	if r.Method == "GET" && (resource == "payments" || resource == "incoming") {
		s.supplementAuthorizedPaymentEvidence(r, ws, realm, resource, id, result)
	}
	if r.Method == "GET" && resource == "deliveries" && id != "" {
		var history []byte
		if err := s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg58_delivery_history($1::uuid,$2,$3::uuid)", ws, realm, id).Scan(&history)
		}); err != nil {
			mapped(w, err)
			return
		}
		result["attempt_history"] = json.RawMessage(history)
	}
	if secret != "" {
		result["signing_secret"] = secret
		hash := sha256.Sum256([]byte(secret))
		result["signing_key_id"] = hex.EncodeToString(hash[:8])
	}
	if pairing != "" {
		result["pairing_token"] = pairing
	}
	write(w, 200, result)
}
func nullableID(id string) any {
	if id == "" {
		return nil
	}
	return id
}

type deviceContext struct {
	Workspace, Realm, Account, Source, Binding, Parser string
	Key                                                []byte
	Version                                            int64
	Pool                                               *pgxpool.Pool
}

func (s *Service) device(r *http.Request, raw []byte) (deviceContext, error) {
	var d deviceContext
	id := r.Header.Get("X-Ekmivo-Device-ID")
	if !uuidPattern.MatchString(id) {
		return d, errors.New("invalid device")
	}
	var scope struct {
		EnrollmentID string `json:"enrollment_id"`
		Environment  string `json:"environment"`
	}
	if json.Unmarshal(raw, &scope) != nil || scope.EnrollmentID != id || s.pipelinePool(scope.Environment) == nil {
		return d, errors.New("signed enrollment scope mismatch")
	}
	d.Pool = s.pipelinePool(scope.Environment)
	e := d.Pool.QueryRow(r.Context(), "SELECT * FROM pg06_device_context($1::uuid)", id).Scan(&d.Workspace, &d.Realm, &d.Account, &d.Source, &d.Binding, &d.Parser, &d.Key, &d.Version)
	if e != nil || d.Realm != scope.Environment {
		return d, errors.New("enrollment unavailable in selected physical realm")
	}
	var active bool
	var version int64
	e = s.Pipeline.Control.QueryRow(r.Context(), "SELECT source_version,active FROM resolve_financial_projection($1::uuid,$2)", d.Workspace, d.Realm).Scan(&version, &active)
	if e != nil || !active || version != d.Version {
		return d, errors.New("stale device authority")
	}
	timestamp, event := r.Header.Get("X-Ekmivo-Timestamp"), r.Header.Get("X-Ekmivo-Event-ID")
	canonical, e := deviceevidence.CanonicalRequest(r.Method, r.URL.Path, timestamp, event, raw)
	signature, se := base64.StdEncoding.DecodeString(r.Header.Get("X-Ekmivo-Signature"))
	if e != nil || se != nil || !deviceevidence.TimestampWithinSkew(timestamp, time.Now()) || !deviceevidence.VerifyP256DER(d.Key, canonical, signature) {
		return d, errors.New("device signature rejected")
	}
	return d, nil
}
func (s *Service) HandleDevice(w http.ResponseWriter, r *http.Request) {
	if !s.pipelineReady() {
		fail(w, 503, "PIPELINE_SOURCE_UNAVAILABLE")
		return
	}
	// Pre-authentication budget is separate: spoofing a device ID must not
	// consume an enrolled device's acceptance quota. Edge protection is also required.
	if !s.limits.allow("device-ingress-global", 20000, time.Now()) {
		fail(w, 429, "RATE_LIMITED")
		return
	}
	limit := int64(12288)

	if r.PathValue("action") == "inbox" {
		limit = 32768
	}
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	raw, e := io.ReadAll(r.Body)
	if e != nil {
		fail(w, 413, "BODY_TOO_LARGE")
		return
	}
	if r.PathValue("action") == "mobile-disconnect" {
		d, err := s.mobileIdentity(r, raw)
		if err != nil {
			authError(w, err)
			return
		}
		var result []byte
		if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT mobile_device_manage($1::uuid,$2,'revoke',$3::uuid,'','')", d.Workspace, d.Environment, d.ID).Scan(&result); err != nil {
			fail(w, 503, "SOURCE_UNAVAILABLE")
			return
		}
		write(w, 200, map[string]bool{"disconnected": true})
		return
	}
	if r.PathValue("action") == "inbox-push-register" {
		s.handleInboxPushRegistration(w, r, raw)
		return
	}
	if r.PathValue("action") == "inbox" {
		s.handleMobileInbox(w, r, raw)
		return
	}
	if r.PathValue("action") == "workspace-state" {
		s.handleWorkspaceState(w, r, raw)
		return
	}
	if r.PathValue("action") == "claim" && s.tryMobileClaim(w, r, raw) {
		return
	}
	if r.PathValue("action") == "pairing-preview" {
		s.handleMobilePairingPreview(w, r, raw)
		return
	}
	if r.PathValue("action") == "claim" {
		var claim struct {
			Token     string `json:"pairing_token"`
			PublicKey string `json:"public_key"`
		}
		if json.Unmarshal(raw, &claim) != nil || !(physicalPairingCodePattern.MatchString(claim.Token) || tokenPattern.MatchString(claim.Token)) {
			fail(w, 422, "INVALID_ENROLLMENT")
			return
		}
		if !s.budget(w, "device-claim|"+digest(claim.Token), 20) {
			return
		}
		key, e := base64.StdEncoding.DecodeString(claim.PublicKey)
		generic, ke := x509.ParsePKIXPublicKey(key)
		public, ok := generic.(*ecdsa.PublicKey)
		timestamp, event := r.Header.Get("X-Ekmivo-Timestamp"), r.Header.Get("X-Ekmivo-Event-ID")
		canonical, ce := deviceevidence.CanonicalRequest(r.Method, r.URL.Path, timestamp, event, raw)
		signature, se := base64.StdEncoding.DecodeString(r.Header.Get("X-Ekmivo-Signature"))
		if e != nil || ke != nil || !ok || public.Curve.Params().Name != "P-256" || ce != nil || se != nil || !deviceevidence.TimestampWithinSkew(timestamp, time.Now()) || !deviceevidence.VerifyP256DER(key, canonical, signature) {
			fail(w, 403, "ENROLLMENT_PROOF_REJECTED")
			return
		}
		var result []byte
		e = s.Sandbox.QueryRow(r.Context(), "SELECT pg06_phone_claim($1,$2)", digest(claim.Token), key).Scan(&result)
		if e != nil && s.Pipeline.Live != nil {
			e = s.Pipeline.Live.QueryRow(r.Context(), "SELECT pg06_phone_claim($1,$2)", digest(claim.Token), key).Scan(&result)
		}
		if e == nil {
			var enrollment struct {
				ID          string `json:"id"`
				Workspace   string `json:"workspace_id"`
				Environment string `json:"environment"`
			}
			var adopted bool
			if json.Unmarshal(result, &enrollment) != nil || s.Pipeline.Control.QueryRow(r.Context(), "SELECT mobile_device_adopt($1::uuid,$2::uuid,$3,$4)", enrollment.ID, enrollment.Workspace, enrollment.Environment, key).Scan(&adopted) != nil || !adopted {
				fail(w, 503, "WORKSPACE_LOOKUP_UNAVAILABLE")
				return
			}
			write(w, 200, json.RawMessage(result))
			return
		}
		e = s.Sandbox.QueryRow(r.Context(), "SELECT pg06_claim($1,$2)", digest(claim.Token), key).Scan(&result)
		if e != nil && s.Pipeline.Live != nil {
			e = s.Pipeline.Live.QueryRow(r.Context(), "SELECT pg06_claim($1,$2)", digest(claim.Token), key).Scan(&result)
		}
		if e != nil {
			fail(w, 403, "PAIRING_UNAVAILABLE")
			return
		}
		var enrollment map[string]any
		if json.Unmarshal(result, &enrollment) != nil {
			fail(w, 503, "INVALID_ENROLLMENT_RESPONSE")
			return
		}
		rule, found := s.Pipeline.Rules[fmtString(enrollment["parser_id"])]
		if !found {
			fail(w, 503, "PARSER_UNAVAILABLE")
			return
		}
		capturePattern := rule.CapturePattern
		if capturePattern == "" {
			capturePattern = rule.Pattern
		}
		enrollment["capture_pattern"] = strings.ReplaceAll(capturePattern, "(?P<", "(?<")
		write(w, 200, enrollment)
		return
	}
	if r.PathValue("action") == "configuration" || r.PathValue("action") == "phone-heartbeat" || r.PathValue("action") == "phone-events" || r.PathValue("action") == "phone-disconnect" {
		s.HandlePhysicalDevice(w, r, raw)
		return
	}
	d, e := s.device(r, raw)
	if e != nil {
		fail(w, 403, "DEVICE_AUTHORIZATION_REJECTED")
		return
	}
	if !s.budget(w, "device-authenticated-global", 12000) || !s.budget(w, "device-authenticated|"+r.Header.Get("X-Ekmivo-Device-ID"), 600) {
		return
	}
	switch r.PathValue("action") {
	case "history":
		var history []byte
		err := d.Pool.QueryRow(r.Context(), "SELECT pg06_history($1::uuid)", r.Header.Get("X-Ekmivo-Device-ID")).Scan(&history)
		if err != nil {
			fail(w, 503, "RECEIPT_HISTORY_UNAVAILABLE")
			return
		}
		write(w, 200, map[string]any{"items": json.RawMessage(history)})
	case "heartbeat":
		var body struct {
			Permission bool   `json:"permission_ok"`
			Backlog    int    `json:"backlog"`
			Overflow   int64  `json:"overflow_count"`
			QueueError string `json:"queue_error"`
			Model      string `json:"model"`
			Version    string `json:"app_version"`
		}
		if json.Unmarshal(raw, &body) != nil || body.Backlog < 0 || body.Backlog > 10000 || body.Overflow < 0 || len(body.QueueError) > 64 || (body.QueueError != "" && !regexp.MustCompile(`^[A-Z0-9_]+$`).MatchString(body.QueueError)) {
			fail(w, 422, "INVALID_HEALTH")
			return
		}
		var stored bool
		e = d.Pool.QueryRow(r.Context(), "SELECT pg06_heartbeat($1::uuid,$2,$3,$4,$5,$6,$7)", r.Header.Get("X-Ekmivo-Device-ID"), body.Permission, body.Backlog, body.Model, body.Version, body.Overflow, body.QueueError).Scan(&stored)
		if e != nil || !stored {
			fail(w, 503, "HEALTH_UNAVAILABLE")
			return
		}
		write(w, 200, map[string]bool{"stored": true})
	case "events":
		var body struct {
			Source     string    `json:"source"`
			Binding    string    `json:"binding"`
			Kind       string    `json:"kind"`
			Evidence   string    `json:"evidence"`
			ObservedAt time.Time `json:"observed_at"`
			Sequence   int64     `json:"sequence"`
		}
		if json.Unmarshal(raw, &body) != nil || body.Source != d.Source || body.Binding != d.Binding || (body.Kind != "device_sms" && body.Kind != "device_notification") || body.Kind == "device_sms" && !strings.HasPrefix(d.Binding, "sms:") || body.Kind == "device_notification" && d.Binding != "package:"+d.Source || len(body.Evidence) > 8192 || body.ObservedAt.IsZero() || body.Sequence <= 0 {
			fail(w, 422, "SOURCE_BINDING_REJECTED")
			return
		}
		rule, ok := s.Pipeline.Rules[d.Parser]
		if !ok {
			fail(w, 503, "PARSER_UNAVAILABLE")
			return
		}
		if !rule.AcceptCapture(body.Source, d.Realm, body.Evidence) {
			fail(w, 422, "IRRELEVANT_RECEIPT_REJECTED")
			return
		}
		receipt, parseErr := rule.Parse(body.Source, d.Realm, body.Evidence)
		// If the approved receipt contains its full receiving number, it must
		// match the server's encrypted enrolled destination. Never use the SMS
		// originatingAddress as payer or a route authority.
		if parseErr == nil && receipt.Receiving != "" {
			var cipher []byte
			if err := d.Pool.QueryRow(r.Context(), "SELECT pg06_device_receiving_cipher($1::uuid)", r.Header.Get("X-Ekmivo-Device-ID")).Scan(&cipher); err != nil || len(cipher) == 0 {
				fail(w, 503, "RECEIVING_ACCOUNT_UNAVAILABLE")
				return
			}
			plain, err := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, d.Workspace+"|"+d.Realm)
			if err != nil {
				fail(w, 503, "RECEIVING_ACCOUNT_UNAVAILABLE")
				return
			}
			if receipt.Receiving != string(plain) {
				parseErr = errors.New("receiving identity mismatch")
			}
		}
		reason := ""
		var payer, ref any
		var amount, at, precision, method, version any
		if parseErr != nil {
			if receipt.Receiving != "" {
				reason = "receiving_identity_mismatch"
			} else {
				reason = "unrecognized_or_incomplete_receipt"
			}
		} else {
			payer = deviceevidence.Identity(s.PayerKey, receipt.Payer)
			ref = deviceevidence.Identity(s.PayerKey, "receipt|"+d.Account+"|"+receipt.Reference)
			amount = receipt.Amount
			at = receipt.TransactionAt
			precision = receipt.Precision
			method = receipt.Method
			version = receipt.Version
		}
		event := r.Header.Get("X-Ekmivo-Event-ID")
		encrypted, ee := deviceevidence.Encrypt(s.Pipeline.Key, []byte(body.Evidence), r.Header.Get("X-Ekmivo-Device-ID")+"|"+event)
		if ee != nil {
			fail(w, 503, "EVIDENCE_ENCRYPTION_UNAVAILABLE")
			return
		}
		hash := sha256.Sum256(raw)
		var result []byte
		e = d.Pool.QueryRow(r.Context(), "SELECT pg06_ingest($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)", r.Header.Get("X-Ekmivo-Device-ID"), event, hex.EncodeToString(hash[:]), encrypted, payer, amount, at, precision, ref, method, version, body.Kind, reason, body.ObservedAt, body.Sequence).Scan(&result)
		if e != nil {
			mapped(w, e)
			return
		}
		write(w, 202, json.RawMessage(result))
	default:
		fail(w, 404, "NOT_FOUND")
	}
}
func fmtString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// A session-less device can submit only signed evidence for its immutable
// enrollment. It cannot select a workspace, environment or verified status.
