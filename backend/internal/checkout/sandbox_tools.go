package checkout

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/masharzy/briofold/backend/internal/authz"
	"github.com/masharzy/briofold/backend/internal/deviceevidence"
	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
	"net/http"
	"os"
	"strings"
)

var sandboxScenarios = []string{"exact-unique", "wrong-payer", "under-amount", "over-amount", "before-window", "after-window", "missing-time", "outgoing", "missing-payer", "missing-amount", "unknown-direction", "wrong-account", "wrong-method"}

func (s *Service) HandleSandboxTools(w http.ResponseWriter, r *http.Request) {
	ws, action := r.PathValue("workspaceID"), r.PathValue("sandboxAction")
	publicCandidate := ws == os.Getenv("PG14_PUBLIC_SANDBOX_WORKSPACE") && uuidPattern.MatchString(ws) && r.Header.Get("Authorization") != ""
	// A shared API may expose only the fixed public TEST workspace. Every SQL
	// call below binds Sandbox; pg14_run independently checks financial_realm.
	if !s.pipelineReady() || (s.Pipeline.Live != nil && !publicCandidate) || os.Getenv("PG14_SANDBOX_TOOLS_ENABLED") != "true" || explicitRealm(r) != "sandbox" {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if !uuidPattern.MatchString(ws) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	actor, role, e := s.documentActor(r, ws, "sandbox", "payments", r.Method != "GET")
	if e != nil {
		authError(w, e)
		return
	}
	publicKey := role == "merchant_key" && ws == os.Getenv("PG14_PUBLIC_SANDBOX_WORKSPACE") && uuidPattern.MatchString(ws)
	if publicKey {
		if action == "reset" {
			fail(w, 403, "PUBLIC_SANDBOX_RESET_FORBIDDEN")
			return
		}
		scope := "payments:read"
		if r.Method != "GET" {
			scope = "payments:write"
		}
		credential, err := s.Auth.AuthenticateMerchant(r.Context(), r.Header.Get("Authorization"), authz.Environment("sandbox"), scope)
		if err != nil {
			authError(w, err)
			return
		}
		// Fixture audit records the credential ID, never impersonates an admin.
		actor = credential.KeyID
		if s.PublicSandboxWorker == nil {
			fail(w, 503, "PUBLIC_SANDBOX_WORKER_UNAVAILABLE")
			return
		}
	}
	if !publicKey && (actor == "" || (role != "owner" && role != "admin")) {
		fail(w, 403, "SANDBOX_DEVELOPER_SESSION_REQUIRED")
		return
	}
	if r.Method != "GET" && !publicKey {
		cookie, err := r.Cookie("briofold-session")
		if err != nil {
			authError(w, authz.ErrUnauthorized)
			return
		}
		principal, err := s.Auth.Authenticate(r.Context(), cookie.Value)
		if err == nil {
			_, err = s.Auth.AuthorizeWorkspace(r.Context(), principal, ws, authz.Environment("sandbox"), authz.PaymentsManage)
		}
		if err != nil {
			authError(w, err)
			return
		}
	}
	if !s.budget(w, "sandbox-tools:"+ws, 30) {
		return
	}
	if action == "scenarios" && r.Method == "GET" {
		write(w, 200, map[string]any{"simulation": true, "items": sandboxScenarios, "provider_sandbox": false, "real_device_verified": false, "worker_ready": s.PublicSandboxWorker != nil})
		return
	}
	var raw []byte
	if r.Method == "GET" {
		if action == "receiver" && publicKey {
			id := r.URL.Query().Get("receiver_id")
			if !uuidPattern.MatchString(id) {
				fail(w, 422, "INVALID_RECEIVER_ID")
				return
			}
			e = s.pipelineScoped(r.Context(), ws, "sandbox", func(tx pgx.Tx) error {
				return tx.QueryRow(r.Context(), "SELECT pg60_receiver_read($1::uuid,$2::uuid)", ws, id).Scan(&raw)
			})
		} else if action == "runs" {
			e = s.pipelineScoped(r.Context(), ws, "sandbox", func(tx pgx.Tx) error { return tx.QueryRow(r.Context(), "SELECT pg14_runs($1::uuid)", ws).Scan(&raw) })
		} else {
			fail(w, 404, "NOT_FOUND")
			return
		}
	} else {
		if !originAllowed(r) {
			fail(w, 403, "ORIGIN_DENIED")
			return
		}
		var b struct {
			Scenario string `json:"scenario"`
			URL      string `json:"url"`
			Password string `json:"current_password"`
			Confirm  bool   `json:"confirm_archive_reset"`
		}
		if decodeBounded(w, r, &b, 2048) != nil {
			fail(w, 422, "INVALID_SCENARIO")
			return
		}
		if action == "reset" {
			if !b.Confirm {
				fail(w, 422, "RESET_CONFIRMATION_REQUIRED")
				return
			}
			cookie, _ := r.Cookie("briofold-session")
			if cookie == nil {
				fail(w, 401, "UNAUTHENTICATED")
				return
			}
			principal, err := s.Auth.Authenticate(r.Context(), cookie.Value)
			if err == nil {
				err = s.Auth.ConfirmPassword(r.Context(), principal, b.Password)
			}
			if err != nil {
				authError(w, err)
				return
			}
			var n int64
			e = s.pipelineScoped(r.Context(), ws, "sandbox", func(tx pgx.Tx) error {
				return tx.QueryRow(r.Context(), "SELECT pg14_reset($1::uuid,$2::uuid)", ws, actor).Scan(&n)
			})
			raw, _ = json.Marshal(map[string]any{"archived": n, "financial_history_retained": true, "simulation": true})
		} else if action == "webhooks" && publicKey {
			if err := s.merchant(r, ws, "sandbox", "webhooks:manage"); err != nil {
				authError(w, err)
				return
			}
			base := strings.TrimRight(os.Getenv("PG14_PUBLIC_SANDBOX_API_ORIGIN"), "/") + "/v1/public-sandbox/receiver/"
			if !strings.HasPrefix(b.URL, base) || len(b.URL) > 512 {
				fail(w, 422, "CONTROLLED_SANDBOX_RECEIVER_REQUIRED")
				return
			}
			if _, err := merchantwebhook.ValidateURL(b.URL); err != nil {
				fail(w, 422, "INVALID_RECEIVER_URL")
				return
			}
			secret, err := randomCapability()
			if err != nil {
				fail(w, 503, "SIMULATION_UNAVAILABLE")
				return
			}
			cipher, err := deviceevidence.Encrypt(s.Pipeline.Key, []byte(secret), ws+"|sandbox")
			if err != nil {
				fail(w, 503, "SIMULATION_UNAVAILABLE")
				return
			}
			payload, _ := json.Marshal(map[string]string{"url": b.URL})
			limitHit := false
			e = s.pipelineScoped(r.Context(), ws, "sandbox", func(tx pgx.Tx) error {
				if _, err := tx.Exec(r.Context(), "SELECT pg_advisory_xact_lock(hashtextextended('public-endpoints:'||$1,0))", ws); err != nil {
					return err
				}
				var listed []byte
				if err := tx.QueryRow(r.Context(), "SELECT pg09_read($1::uuid,'sandbox','webhooks',NULL,NULL)", ws).Scan(&listed); err != nil {
					return err
				}
				var endpoints struct {
					Items []struct {
						ID  string `json:"id"`
						URL string `json:"url"`
					} `json:"items"`
				}
				if err := json.Unmarshal(listed, &endpoints); err != nil {
					return err
				}
				for _, endpoint := range endpoints.Items {
					if endpoint.URL != b.URL {
						continue
					}
					var credential []byte
					if err := tx.QueryRow(r.Context(), "SELECT pg60_receiver_credentials($1::uuid,$2)", ws, b.URL).Scan(&credential); err != nil {
						return err
					}
					var saved struct {
						Active []byte `json:"active"`
					}
					if err := json.Unmarshal(credential, &saved); err != nil {
						return err
					}
					plain, err := merchantwebhook.Decrypt(s.Pipeline.Key, saved.Active, ws+"|sandbox")
					if err != nil {
						return err
					}
					secret = string(plain)
					raw, _ = json.Marshal(map[string]string{"id": endpoint.ID})
					return nil
				}
				if len(endpoints.Items) >= 10 {
					limitHit = true
					return errors.New("public endpoint limit")
				}
				return tx.QueryRow(r.Context(), "SELECT pg09_action($1::uuid,'sandbox','webhooks',NULL,'create',$2::jsonb,$3)", ws, string(payload), cipher).Scan(&raw)
			})
			if limitHit {
				fail(w, 429, "PUBLIC_SANDBOX_ENDPOINT_LIMIT")
				return
			}
			if e == nil {
				var result map[string]any
				if json.Unmarshal(raw, &result) != nil {
					fail(w, 503, "SIMULATION_UNAVAILABLE")
					return
				}
				id := sha256.Sum256([]byte(secret))
				result["signing_secret"], result["signing_key_id"], result["simulation"] = secret, hex.EncodeToString(id[:8]), true
				raw, _ = json.Marshal(result)
			}
		} else if action == "dispatch" && publicKey {
			err := s.drainPublicSandbox(r.Context(), ws)
			if err != nil {
				fail(w, 503, "PUBLIC_SANDBOX_DELIVERY_UNRESOLVED")
				return
			}
			raw, _ = json.Marshal(map[string]any{"simulation": true, "delivery_sweep_completed": true})
		} else if action == "runs" {
			key := r.Header.Get("Idempotency-Key")
			if !keyPattern.MatchString(key) {
				fail(w, 400, "IDEMPOTENCY_KEY_REQUIRED")
				return
			}
			valid := false
			for _, scenario := range sandboxScenarios {
				if b.Scenario == scenario {
					valid = true
				}
			}
			if !valid {
				fail(w, 422, "UNSUPPORTED_SCENARIO")
				return
			}
			evidence, _ := json.Marshal(map[string]any{"simulation": true, "scenario": b.Scenario, "source": "sandbox_fixture"})
			cipher, err := deviceevidence.Encrypt(s.Pipeline.Key, evidence, ws+"|sandbox")
			if err != nil {
				fail(w, 503, "SIMULATION_UNAVAILABLE")
				return
			}
			payer := hex.EncodeToString(mac(s.PayerKey, "sandbox-fixture|"+ws+key))
			e = s.pipelineScoped(r.Context(), ws, "sandbox", func(tx pgx.Tx) error {
				return tx.QueryRow(r.Context(), "SELECT pg14_run($1::uuid,$2::uuid,$3,$4,$5,$6)", ws, actor, b.Scenario, key, payer, cipher).Scan(&raw)
			})
			if e == nil && publicKey {
				if err := s.drainPublicSandbox(r.Context(), ws); err != nil {
					fail(w, 503, "PUBLIC_SANDBOX_RESULT_UNRESOLVED")
					return
				}
			}
		} else {
			fail(w, 404, "NOT_FOUND")
			return
		}
	}
	if e != nil {
		mapped(w, e)
		return
	}
	var data any
	if json.Unmarshal(raw, &data) != nil {
		fail(w, 503, "SIMULATION_UNAVAILABLE")
		return
	}
	write(w, 200, data)
}
