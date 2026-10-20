package checkout

// Physical phone management is distinct from per-account evidence routing.
// Each linked source remains a stable enrollment ID for queued receipt delivery.
import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
)

// Eight characters from a 32-symbol alphabet = 40 bits of OS randomness.
// The database already stores only the digest, expires in five minutes and
// consumes the token atomically upon claim.
var physicalPairingCodePattern = regexp.MustCompile("^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$")

func randomPhysicalPairingCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	var bytes [8]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	result := make([]byte, len(bytes))
	for i, b := range bytes {
		result[i] = alphabet[int(b)&31]
	}
	return string(result), nil
}

type phoneAssociation struct {
	ID             string `json:"id"`
	AccountID      string `json:"account_id"`
	Source         string `json:"source"`
	Binding        string `json:"binding"`
	ParserID       string `json:"parser_id"`
	CapturePattern string `json:"capture_pattern"`
	Method         string `json:"method"`
	Label          string `json:"label"`
	DisplaySuffix  string `json:"display_suffix"`
}

func (s *Service) HandlePhones(w http.ResponseWriter, r *http.Request) {
	if !s.pipelineReady() {
		fail(w, 503, "PIPELINE_SOURCE_UNAVAILABLE")
		return
	}
	ws, realm := r.PathValue("workspaceID"), explicitRealm(r)
	id, action := r.PathValue("phoneID"), r.PathValue("phoneAction")
	if !uuidPattern.MatchString(ws) || (id != "" && !uuidPattern.MatchString(id)) || (realm != "sandbox" && realm != "live") {
		fail(w, 400, "INVALID_SCOPE")
		return
	}
	if r.Method != "GET" && !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if e := s.pipelineSession(r, ws, realm, true); e != nil {
		authError(w, e)
		return
	}
	w, finishActivity := s.observeAPI(w, r, ws, realm)
	defer finishActivity()
	if r.Method == "GET" {
		if id != "" || action != "" {
			fail(w, 404, "NOT_FOUND")
			return
		}
		var raw []byte
		type receiving struct {
			ID, Method, Number, Label string
			Disabled                  bool
		}
		accounts := []receiving{}
		e := s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			if err := tx.QueryRow(r.Context(), "SELECT pg06_phone_list($1::uuid,$2)", ws, realm).Scan(&raw); err != nil {
				return err
			}
			rows, err := tx.Query(r.Context(), "SELECT account_id,method,display_suffix,account_label,number_cipher,disabled_at FROM pg06_phone_account_cipher($1::uuid,$2)", ws, realm)
			if err != nil {
				return err
			}
			defer rows.Close()
			for rows.Next() {
				var a receiving
				var suffix string
				var cipher []byte
				var disabled *time.Time
				if err := rows.Scan(&a.ID, &a.Method, &suffix, &a.Label, &cipher, &disabled); err != nil {
					return err
				}
				plain, err := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, ws+"|"+realm)
				if err != nil {
					return errors.New("receiving identity unavailable")
				}
				a.Number = string(plain)
				if _, ok := NormalizePayer(a.Number); !ok {
					return errors.New("invalid receiving identity")
				}
				a.Disabled = disabled != nil
				accounts = append(accounts, a)
			}
			return rows.Err()
		})
		if e != nil {
			mapped(w, e)
			return
		}
		write(w, 200, map[string]any{"items": json.RawMessage(raw), "accounts": accounts})
		return
	}
	if r.Method != "POST" {
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	if id == "" && action == "" || id != "" && action == "reconnect" {
		var authoritative int64
		var active bool
		if err := s.Pipeline.Control.QueryRow(r.Context(),
			"SELECT source_version,active FROM resolve_financial_projection($1::uuid,$2)",
			ws, realm).Scan(&authoritative, &active); err != nil || !active {
			fail(w, 403, "PHONE_AUTHORIZATION_REJECTED")
			return
		}
		var projected int64
		if err := s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(),
				"SELECT entitlement_version FROM financial_workspace_registry WHERE workspace_id=$1::uuid AND environment=$2",
				ws, realm).Scan(&projected)
		}); err != nil || projected != authoritative {
			fail(w, 503, "PHONE_PROJECTION_STALE")
			return
		}
	}
	var body struct {
		Name      string `json:"name"`
		PhoneID   string `json:"phone_id"`
		AccountID string `json:"account_id"`
		Source    string `json:"source"`
		Binding   string `json:"binding"`
		ParserID  string `json:"parser_id"`
		BindingID string `json:"binding_id"`
		Label     string `json:"label"`
		Number    string `json:"account_number"`
	}
	if e := decodeBounded(w, r, &body, 4096); e != nil {
		fail(w, 422, "INVALID_REQUEST")
		return
	}
	// The targeted phone must be explicit and agree with the route, not just
	// inferred from a path that the browser may have stale after a refresh.
	if id != "" && (action == "reconnect" || action == "delete") && body.PhoneID != id {
		fail(w, 422, "PHONE_ID_MISMATCH")
		return
	}
	var raw []byte
	token := ""
	e := s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		switch {
		case id == "" && action == "":
			if strings.TrimSpace(body.Name) == "" || len(body.Name) > 80 {
				return errors.New("phone name required")
			}
			var err error
			token, err = randomPhysicalPairingCode()
			if err != nil {
				return err
			}
			return tx.QueryRow(r.Context(), "SELECT pg06_phone_begin($1::uuid,$2,$3,$4)", ws, realm, body.Name, digest(token)).Scan(&raw)
		case id != "" && action == "reconnect":
			var err error
			token, err = randomPhysicalPairingCode()
			if err != nil {
				return err
			}
			return tx.QueryRow(r.Context(), "SELECT pg06_phone_reconnect($1::uuid,$2,$3::uuid,$4)", ws, realm, id, digest(token)).Scan(&raw)
		case id != "" && action == "delete":
			var deleted bool
			if err := tx.QueryRow(r.Context(), "SELECT pg06_phone_delete($1::uuid,$2,$3::uuid)", ws, realm, id).Scan(&deleted); err != nil {
				return err
			}
			if !deleted {
				return errors.New("phone not found")
			}
			raw = []byte(`{"deleted":true}`)
			return nil
		case id != "" && action == "attach":
			rule, ok := s.Pipeline.Rules[body.ParserID]
			if !ok || !rule.Approved || (rule.SandboxOnly && realm != "sandbox") || rule.Source != body.Source || !uuidPattern.MatchString(body.AccountID) {
				return errors.New("approved parser/source/account required")
			}
			if !(strings.HasPrefix(body.Binding, "sms:") || body.Binding == "package:"+body.Source) {
				return errors.New("invalid SIM/source binding")
			}
			var m string
			err := tx.QueryRow(r.Context(), "SELECT method FROM financial_receiving_accounts WHERE id=$1::uuid AND workspace_id=$2::uuid AND environment=$3", body.AccountID, ws, realm).Scan(&m)
			if err != nil || m != rule.Method {
				return errors.New("method/account mismatch")
			}
			name := body.Name
			if name == "" {
				name = body.Source
			}
			return tx.QueryRow(r.Context(), "SELECT pg06_phone_attach($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7,$8)", ws, realm, id, body.AccountID, name, body.Source, body.ParserID, body.Binding).Scan(&raw)
		case id != "" && action == "edit-account":
			var ok bool
			var identity, suffix any
			var cipher []byte
			if body.Number != "" {
				number, valid := NormalizePayer(body.Number)
				if !valid {
					return errors.New("invalid full receiving number")
				}
				var method string
				if err := tx.QueryRow(r.Context(), "SELECT method FROM financial_receiving_accounts WHERE id=$1::uuid AND workspace_id=$2::uuid AND environment=$3", id, ws, realm).Scan(&method); err != nil {
					return err
				}
				identity = deviceevidence.Identity(s.PayerKey, "account|"+method+"|"+number)
				suffix = number[len(number)-4:]
				var err error
				cipher, err = deviceevidence.Encrypt(s.Pipeline.Key, []byte(number), ws+"|"+realm)
				if err != nil {
					return err
				}
			}
			if err := tx.QueryRow(r.Context(), "SELECT pg06_phone_account_edit($1::uuid,$2,$3::uuid,$4,$5,$6,$7)", ws, realm, id, body.Label, identity, suffix, cipher).Scan(&ok); err != nil {
				return err
			}
			if !ok {
				return errors.New("account unavailable")
			}
			raw = []byte(`{"saved":true}`)
			return nil
		case id != "" && action == "detach":
			if !uuidPattern.MatchString(body.BindingID) {
				return errors.New("invalid association")
			}
			var ok bool
			if err := tx.QueryRow(r.Context(), "SELECT pg06_phone_detach($1::uuid,$2,$3::uuid,$4::uuid)", ws, realm, id, body.BindingID).Scan(&ok); err != nil {
				return err
			}
			if !ok {
				return errors.New("association not found")
			}
			raw = []byte(`{"detached":true}`)
			return nil
		case id != "" && (action == "rename" || action == "revoke"):
			if action == "rename" && (strings.TrimSpace(body.Name) == "" || len(body.Name) > 80) {
				return errors.New("invalid name")
			}
			var ok bool
			if err := tx.QueryRow(r.Context(), "SELECT pg06_phone_action($1::uuid,$2,$3::uuid,$4,$5)", ws, realm, id, action, body.Name).Scan(&ok); err != nil {
				return err
			}
			if !ok {
				return errors.New("phone not found")
			}
			raw = []byte(`{"saved":true}`)
			return nil
		default:
			return errors.New("invalid phone action")
		}
	})
	if e != nil {
		mapped(w, e)
		return
	}
	result := map[string]any{}
	if json.Unmarshal(raw, &result) != nil {
		fail(w, 503, "PHONE_RESULT_UNAVAILABLE")
		return
	}
	if token != "" {
		result["pairing_token"] = token
	}
	write(w, 200, result)
}

// Called only after the same signed device transport's pre-authentication gate.
// A physical phone signs configuration/heartbeat. Its linked account enrollments
// each sign receipts separately and never become new physical registrations.
func (s *Service) HandlePhysicalDevice(w http.ResponseWriter, r *http.Request, raw []byte) {
	var body struct {
		EnrollmentID string `json:"enrollment_id"`
		Environment  string `json:"environment"`
		Permission   bool   `json:"permission_ok"`
		Backlog      int    `json:"backlog"`
		Overflow     int64  `json:"overflow_count"`
		QueueError   string `json:"queue_error"`
		Model        string `json:"model"`
		AppVersion   string `json:"app_version"`
	}
	id := r.Header.Get("X-Ekmivo-Device-ID")
	if json.Unmarshal(raw, &body) != nil || !uuidPattern.MatchString(id) || body.EnrollmentID != id || (body.Environment != "sandbox" && body.Environment != "live") {
		fail(w, 403, "PHONE_AUTHORIZATION_REJECTED")
		return
	}
	// Product revocation changes capability, not handset identity. Never erase its key.
	if d, err := s.mobileIdentity(r, raw); err == nil {
		var state []byte
		if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT mobile_workspace_state($1::uuid,$2)", d.Workspace, d.Environment).Scan(&state); err != nil {
			fail(w, 503, "WORKSPACE_LOOKUP_UNAVAILABLE")
			return
		}
		var access struct {
			Products struct {
				Payments bool `json:"payments"`
			} `json:"products"`
		}
		if json.Unmarshal(state, &access) != nil {
			fail(w, 503, "WORKSPACE_LOOKUP_UNAVAILABLE")
			return
		}
		if !access.Products.Payments {
			fail(w, 409, "PAYMENT_DISABLED")
			return
		}
	} else {
		authError(w, err)
		return
	}
	pool := s.pipelinePool(body.Environment)
	if pool == nil {
		fail(w, 403, "PHONE_AUTHORIZATION_REJECTED")
		return
	}
	var ws, realm string
	var key []byte
	var version int64
	if e := pool.QueryRow(r.Context(), "SELECT * FROM pg06_phone_key($1::uuid)", id).Scan(&ws, &realm, &key, &version); e != nil || realm != body.Environment {
		fail(w, 403, "PHONE_AUTHORIZATION_REJECTED")
		return
	}
	var active bool
	var authoritative int64
	if e := s.Pipeline.Control.QueryRow(r.Context(), "SELECT source_version,active FROM resolve_financial_projection($1::uuid,$2)", ws, realm).Scan(&authoritative, &active); e != nil || !active {
		fail(w, 403, "PHONE_AUTHORIZATION_REJECTED")
		return
	}
	// Never conflate a stale control->financial projection with an actual phone revocation.
	// A separately authorized projection reconciler must update the financial realm;
	// failing closed here prevents stale entitlements from accepting new evidence.
	if authoritative != version {
		fail(w, 503, "PHONE_PROJECTION_STALE")
		return
	}
	canonical, e := deviceevidence.CanonicalRequest(r.Method, r.URL.Path, r.Header.Get("X-Ekmivo-Timestamp"), r.Header.Get("X-Ekmivo-Event-ID"), raw)
	signature, se := base64.StdEncoding.DecodeString(r.Header.Get("X-Ekmivo-Signature"))
	if e != nil || se != nil || !deviceevidence.TimestampWithinSkew(r.Header.Get("X-Ekmivo-Timestamp"), time.Now()) || !deviceevidence.VerifyP256DER(key, canonical, signature) {
		fail(w, 403, "PHONE_SIGNATURE_REJECTED")
		return
	}
	// The key and signature are checked above. A handset disconnect must revoke
	// the same server row the dashboard lists, BEFORE Android destroys its key.
	if r.PathValue("action") == "phone-disconnect" {
		var revoked bool
		if e := pool.QueryRow(r.Context(), "SELECT pg06_phone_self_revoke($1::uuid)", id).Scan(&revoked); e != nil {
			fail(w, 503, "PHONE_DISCONNECT_UNAVAILABLE")
			return
		}
		if !revoked {
			fail(w, 403, "PHONE_REVOKED")
			return
		}
		write(w, 200, map[string]bool{"disconnected": true})
		return
	}
	if r.PathValue("action") == "phone-events" {
		s.handlePhoneForward(w, r, raw, id, ws, realm, version)
		return
	}
	if r.PathValue("action") == "configuration" {
		var encoded []byte
		if e := pool.QueryRow(r.Context(), "SELECT pg06_phone_configuration($1::uuid)", id).Scan(&encoded); e != nil || len(encoded) == 0 || string(encoded) == "null" {
			fail(w, 403, "PHONE_REVOKED")
			return
		}
		var result struct {
			ID            string             `json:"id"`
			Environment   string             `json:"environment"`
			ConfigVersion int64              `json:"config_version"`
			Bindings      []phoneAssociation `json:"bindings"`
		}
		if json.Unmarshal(encoded, &result) != nil {
			fail(w, 503, "INVALID_CONFIGURATION")
			return
		}
		// Forwarding is independent of parser availability and account selection.
		// The fixed sender allowlist only scopes collection; it is not approval
		// of a receipt format or a promise that payment matching is ready.
		// Only approved provider labels are forwarded after explicit handset consent.
		// Payment account count and SIM mapping are not a reason to discard SMS.
		allowedSources := []string{"bKash", "NAGAD", "Rocket"}
		// A configured receiving method permits narrow collection, not paid status.
		// Backend parser readiness is separate, and no financial destination
		// number/account identifier is returned to the phone.
		forwarding := map[string]any{
			"id": result.ID, "environment": result.Environment,
			"config_version": result.ConfigVersion,
			"forwarder":      true, "forward_sources": allowedSources,
		}
		// Legacy per-account source bindings are optional compatibility metadata.
		// A revoked/unsupported old parser must not disable the new physical SMS
		// forwarding path, which depends only on the signed phone + source allowlist.
		approvedBindings := []phoneAssociation{}
		for _, binding := range result.Bindings {
			rule, ok := s.Pipeline.Rules[binding.ParserID]
			if !ok || !rule.Approved || rule.Source != binding.Source || (rule.SandboxOnly && realm != "sandbox") {
				continue
			}
			pat := rule.CapturePattern
			if pat == "" {
				pat = rule.Pattern
			}
			binding.CapturePattern = strings.ReplaceAll(pat, "(?P<", "(?<")
			var method, label, suffix string
			if err := pool.QueryRow(r.Context(),
				"SELECT a.method,c.label,a.display_suffix FROM financial_receiving_accounts a JOIN pg06_account_configuration c ON c.account_id=a.id WHERE a.id=$1::uuid AND a.workspace_id=$2::uuid AND a.environment=$3 AND c.disabled_at IS NULL",
				binding.AccountID, ws, realm).Scan(&method, &label, &suffix); err != nil {
				continue
			}
			binding.Method = method
			binding.Label = label
			binding.DisplaySuffix = suffix
			approvedBindings = append(approvedBindings, binding)
		}
		forwarding["bindings"] = approvedBindings
		write(w, 200, forwarding)
		return
	}
	if r.PathValue("action") == "phone-heartbeat" {
		if body.Backlog < 0 || body.Backlog > 10000 || body.Overflow < 0 || len(body.QueueError) > 64 ||
			!regexp.MustCompile(`^[A-Z0-9_]*$`).MatchString(body.QueueError) {
			fail(w, 422, "INVALID_HEALTH")
			return
		}
		var ok bool
		if e := pool.QueryRow(r.Context(), "SELECT pg06_phone_heartbeat($1::uuid,$2,$3,$4,$5,$6,$7)", id, body.Permission, body.Backlog, body.Model, body.AppVersion, body.Overflow, body.QueueError).Scan(&ok); e != nil || !ok {
			fail(w, 503, "PHONE_HEALTH_UNAVAILABLE")
			return
		}
		write(w, 200, map[string]bool{"stored": true})
		return
	}
	fail(w, 404, "NOT_FOUND")
}

// Scope + signing prevent a sender-address spoof from selecting a destination.
// Actual payer and original transaction time come only from approved server parsers.
