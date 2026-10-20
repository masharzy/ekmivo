package checkout

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/masharzy/ekmivo/backend/internal/authz"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
)

type mobileIdentity struct {
	ID, Workspace, Environment string
	Key                        []byte
	Legacy                     bool
}

func (s *Service) mobileSession(r *http.Request, w, e string) error {
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		return authz.ErrUnavailable
	}
	c, err := r.Cookie("ekmivo-session")
	if err != nil {
		return authz.ErrUnauthorized
	}
	actor, err := s.Auth.Authenticate(r.Context(), c.Value)
	if err != nil {
		return err
	}
	_, err = s.Auth.AuthorizeWorkspace(r.Context(), actor, w, authz.Environment(e), authz.WorkspaceSettings)
	return err
}
func mobileSignature(r *http.Request, raw, key []byte) bool {
	canonical, e := deviceevidence.CanonicalRequest(r.Method, r.URL.Path, r.Header.Get("X-Ekmivo-Timestamp"), r.Header.Get("X-Ekmivo-Event-ID"), raw)
	sig, se := base64.StdEncoding.DecodeString(r.Header.Get("X-Ekmivo-Signature"))
	return e == nil && se == nil && deviceevidence.TimestampWithinSkew(r.Header.Get("X-Ekmivo-Timestamp"), time.Now()) && deviceevidence.VerifyP256DER(key, canonical, sig)
}
func (s *Service) mobileIdentity(r *http.Request, raw []byte) (mobileIdentity, error) {
	d := mobileIdentity{ID: r.Header.Get("X-Ekmivo-Device-ID")}
	if !uuidPattern.MatchString(d.ID) {
		return d, authz.ErrForbidden
	}
	var authorized bool
	err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT * FROM mobile_device_key($1::uuid)", d.ID).Scan(&d.Workspace, &d.Environment, &d.Key, &authorized, &d.Legacy)
	if errors.Is(err, pgx.ErrNoRows) {
		// Legacy payment phones keep their existing ID/key and can survive product changes.
		for _, realm := range []string{"sandbox", "live"} {
			pool := s.pipelinePool(realm)
			if pool == nil {
				continue
			}
			e := pool.QueryRow(r.Context(), "SELECT * FROM pg06_mobile_key($1::uuid)", d.ID).Scan(&d.Workspace, &d.Environment, &d.Key, &authorized)
			if e != nil && !errors.Is(e, pgx.ErrNoRows) {
				return d, authz.ErrUnavailable
			}
			if e == nil {
				err = nil
				d.Legacy = true
				break
			}
		}
	} else if err != nil {
		return d, authz.ErrUnavailable
	}
	if err != nil || !authorized || !mobileSignature(r, raw, d.Key) {
		return d, authz.ErrForbidden
	}
	if d.Legacy {
		var ws, e string
		var key []byte
		var active bool
		pool := s.pipelinePool(d.Environment)
		if pool == nil {
			return d, authz.ErrUnavailable
		}
		if err = pool.QueryRow(r.Context(), "SELECT * FROM pg06_mobile_key($1::uuid)", d.ID).Scan(&ws, &e, &key, &active); err != nil || !active || ws != d.Workspace || e != d.Environment || !bytes.Equal(key, d.Key) {
			return d, authz.ErrForbidden
		}
		if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT mobile_device_adopt($1::uuid,$2::uuid,$3,$4)", d.ID, d.Workspace, d.Environment, d.Key).Scan(&active); err != nil {
			return d, authz.ErrUnavailable
		}
		if !active {
			return d, authz.ErrForbidden
		}
	}
	return d, nil
}
func (s *Service) HandleMobileDevices(w http.ResponseWriter, r *http.Request) {
	ws, realm := r.PathValue("workspaceID"), explicitRealm(r)
	if !uuidPattern.MatchString(ws) || (realm != "live" && realm != "sandbox") {
		fail(w, 400, "INVALID_SCOPE")
		return
	}
	if r.Method != "GET" && !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if err := s.mobileSession(r, ws, realm); err != nil {
		authError(w, err)
		return
	}
	var b struct {
		Name    string `json:"name"`
		PhoneID string `json:"phone_id"`
	}
	action, id := r.PathValue("mobileAction"), r.PathValue("mobileID")
	if r.Method == "GET" {
		action = "list"
	} else {
		if decodeBounded(w, r, &b, 2048) != nil {
			fail(w, 422, "INVALID_REQUEST")
			return
		}
		if id != "" && (!uuidPattern.MatchString(id) || b.PhoneID != id) {
			fail(w, 422, "PHONE_ID_MISMATCH")
			return
		}
		if action == "" {
			action = "begin"
		}
		if action == "begin" && (len(b.Name) < 1 || len(b.Name) > 80) {
			fail(w, 422, "INVALID_REQUEST")
			return
		}
	}
	var phone any
	if id != "" {
		phone = id
	}
	code := ""
	var err error
	if action == "begin" || action == "reconnect" {
		code, err = randomPhysicalPairingCode()
		if err != nil {
			fail(w, 503, "ENTROPY_UNAVAILABLE")
			return
		}
	}
	var result []byte
	err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT mobile_device_manage($1::uuid,$2,$3,$4::uuid,$5,$6)", ws, realm, action, phone, b.Name, digest(code)).Scan(&result)
	if err != nil {
		mapped(w, err)
		return
	}
	if code != "" {
		var body map[string]any
		if json.Unmarshal(result, &body) != nil {
			fail(w, 503, "SOURCE_UNAVAILABLE")
			return
		}
		body["pairing_token"] = code
		write(w, 200, body)
		return
	}
	write(w, 200, json.RawMessage(result))
}
func (s *Service) handleWorkspaceState(w http.ResponseWriter, r *http.Request, raw []byte) {
	d, err := s.mobileIdentity(r, raw)
	if err != nil {
		authError(w, err)
		return
	}
	var state []byte
	if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT mobile_workspace_state($1::uuid,$2)", d.Workspace, d.Environment).Scan(&state); err != nil || len(state) == 0 {
		fail(w, 503, "WORKSPACE_LOOKUP_UNAVAILABLE")
		return
	}
	var body map[string]any
	if json.Unmarshal(state, &body) != nil || body == nil {
		fail(w, 403, "WORKSPACE_DISABLED")
		return
	}
	body["payments_ready"] = true
	if !d.Legacy {
		products, _ := body["products"].(map[string]any)
		if products["payments"] == true {
			ready := true
			if s.SyncProjection != nil {
				ready = s.SyncProjection(r.Context(), d.Workspace, d.Environment) == nil
			}
			pool := s.pipelinePool(d.Environment)
			if pool == nil {
				ready = false
			}
			if ready {
				var adopted bool
				ready = pool.QueryRow(r.Context(), "SELECT pg06_mobile_adopt($1::uuid,$2::uuid,$3,$4)", d.ID, d.Workspace, d.Environment, d.Key).Scan(&adopted) == nil && adopted
			}
			body["payments_ready"] = ready
		}
	}
	_, _ = s.Pipeline.Control.Exec(r.Context(), "SELECT mobile_device_touch($1::uuid)", d.ID)
	body["device_id"] = d.ID
	write(w, 200, body)
}
func (s *Service) tryMobileClaim(w http.ResponseWriter, r *http.Request, raw []byte) bool {
	var b struct {
		Token     string `json:"pairing_token"`
		PublicKey string `json:"public_key"`
	}
	if json.Unmarshal(raw, &b) != nil {
		return false
	}
	var exists bool
	if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT mobile_device_pair_exists($1)", digest(b.Token)).Scan(&exists); err != nil {
		fail(w, 503, "WORKSPACE_LOOKUP_UNAVAILABLE")
		return true
	}
	if !exists {
		return false
	}
	key, err := base64.StdEncoding.DecodeString(b.PublicKey)
	generic, ke := x509.ParsePKIXPublicKey(key)
	pub, ok := generic.(*ecdsa.PublicKey)
	if err != nil || ke != nil || !ok || pub.Curve.Params().Name != "P-256" || !mobileSignature(r, raw, key) {
		fail(w, 403, "ENROLLMENT_PROOF_REJECTED")
		return true
	}
	var result []byte
	if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT mobile_device_claim($1,$2)", digest(b.Token), key).Scan(&result); err != nil {
		fail(w, 403, "PAIRING_UNAVAILABLE")
		return true
	}
	write(w, 200, json.RawMessage(result))
	return true
}
