package checkout

import (
	"encoding/base64"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/masharzy/ekmivo/backend/internal/authz"
	"github.com/masharzy/ekmivo/backend/internal/receiptnotice"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// CRM reads and writes stay in control. Cross-realm references are validated
// against authorized financial reads, never copied into payment authority.
func (s *Service) HandleCustomers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	cookie, err := r.Cookie("ekmivo-session")
	if err != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	actor, err := s.Auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		authError(w, err)
		return
	}
	ws, realm := r.PathValue("workspaceID"), explicitRealm(r)
	if !uuidPattern.MatchString(ws) || (realm != "live" && realm != "sandbox") {
		fail(w, 422, "INVALID_SCOPE")
		return
	}
	if !s.budget(w, "crm:"+ws+":"+actor.UserID, 120) {
		return
	}
	var raw []byte
	if r.Method == http.MethodGet {
		cid := r.URL.Query().Get("customer")
		off := 0
		if v := r.URL.Query().Get("cursor"); v != "" {
			off, err = strconv.Atoi(v)
		}
		if err != nil || off < 0 || off > 10000 || (cid != "" && !uuidPattern.MatchString(cid)) {
			fail(w, 422, "INVALID_FILTER")
			return
		}
		if r.URL.Query().Get("format") == "export" {
			if cid == "" {
				fail(w, 422, "CUSTOMER_REQUIRED")
				return
			}
			err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_customer_export($1::uuid,$2,$3::uuid,$4::uuid)", ws, realm, actor.UserID, cid).Scan(&raw)
			if err == nil {
				w.Header().Set("Content-Disposition", `attachment; filename="customer.json"`)
			}
		} else {
			source, priority, assigned := r.URL.Query().Get("source"), r.URL.Query().Get("priority"), r.URL.Query().Get("assignee")
			if cid == "" && (source != "" || priority != "" || assigned != "") {
				err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_customers_search($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8,$9)", ws, realm, actor.UserID, off, r.URL.Query().Get("q"), r.URL.Query().Get("filter"), source, priority, assigned).Scan(&raw)
			} else {
				err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_customers_read($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7)", ws, realm, actor.UserID, nullableID(cid), off, r.URL.Query().Get("q"), r.URL.Query().Get("filter")).Scan(&raw)
			}
		}
	} else if r.Method == http.MethodPost {
		var b struct {
			Action string         `json:"action"`
			Key    string         `json:"operation_key"`
			Body   map[string]any `json:"body"`
		}
		if decodeBounded(w, r, &b, 20000) != nil || !uuidPattern.MatchString(b.Key) || b.Body == nil {
			fail(w, 422, "INVALID_COMMAND")
			return
		}
		id, _ := b.Body["id"].(string)
		if b.Action == "verify-email" {
			s.customerEmailChallenge(w, r, ws, realm, actor.UserID, id, b.Key, b.Body["consented"] == true)
			return
		}
		if b.Action == "finance-import" {
			if _, err = s.Auth.AuthorizeWorkspace(r.Context(), actor, ws, authz.Environment(realm), authz.PaymentsRead); err != nil {
				authError(w, err)
				return
			}
			cursor, _ := b.Body["cursor"].(string)
			if cursor != "" && !uuidPattern.MatchString(cursor) {
				fail(w, 422, "INVALID_CURSOR")
				return
			}
			var finance []byte
			err = s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
				return tx.QueryRow(r.Context(), "SELECT pg10_read($1::uuid,$2,'customers',NULL::uuid,$3::uuid,NULL::text)", ws, realm, nullableID(cursor)).Scan(&finance)
			})
			var page struct {
				Items json.RawMessage `json:"items"`
				Next  *string         `json:"next_cursor"`
			}
			if err != nil || json.Unmarshal(finance, &page) != nil {
				fail(w, 503, "FINANCE_SOURCE_UNAVAILABLE")
				return
			}
			var imported int
			if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_customer_finance_import($1::uuid,$2,$3::uuid,$4::jsonb)", ws, realm, actor.UserID, page.Items).Scan(&imported); err != nil {
				inboxWorkFailure(w, err)
				return
			}
			write(w, 200, map[string]any{"imported": imported, "next_cursor": page.Next})
			return
		}
		if b.Action == "link" {
			source, _ := b.Body["source_id"].(string)
			kind, _ := b.Body["kind"].(string)
			if !uuidPattern.MatchString(id) || !validCRMSourceID(source) {
				fail(w, 422, "INVALID_SOURCE")
				return
			}
			if kind != "thread" && kind != "order" {
				if kind != "finance-customer" && kind != "invoice" && kind != "payment" {
					fail(w, 422, "UNSUPPORTED_SOURCE")
					return
				}
				if _, err = s.Auth.AuthorizeWorkspace(r.Context(), actor, ws, authz.Environment(realm), authz.PaymentsRead); err != nil {
					authError(w, err)
					return
				}
				var finance []byte
				err = s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
					if kind == "payment" {
						return tx.QueryRow(r.Context(), "SELECT pg09_read($1::uuid,$2,'payments',$3::uuid,NULL::uuid,NULL::text,NULL::uuid,NULL::text,NULL::timestamptz,NULL::timestamptz,NULL::text)", ws, realm, source).Scan(&finance)
					}
					resource := "customers"
					if kind == "invoice" {
						resource = "invoices"
					}
					return tx.QueryRow(r.Context(), "SELECT pg10_read($1::uuid,$2,$3,$4::uuid,NULL::uuid,NULL::text)", ws, realm, resource, source).Scan(&finance)
				})
				var result struct {
					Items []struct {
						ID string `json:"id"`
					} `json:"items"`
				}
				decoded := json.Unmarshal(finance, &result) == nil
				found := false
				for _, item := range result.Items {
					if strings.EqualFold(item.ID, source) {
						found = true
					}
				}
				if err != nil || !decoded || !found {
					fail(w, 403, "SOURCE_UNAVAILABLE")
					return
				}
			}
		}
		if b.Action == "followup" {
			b.Body["followup_id"] = b.Key
		}
		encoded, _ := json.Marshal(b.Body)
		err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_customers_write($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::jsonb)", ws, realm, actor.UserID, b.Key, b.Action, encoded).Scan(&raw)
	} else {
		fail(w, 405, "METHOD_NOT_ALLOWED")
		return
	}
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	_, _ = w.Write(raw)
}

func (s *Service) customerEmailChallenge(w http.ResponseWriter, r *http.Request, ws, realm, actor, id, key string, consented bool) {
	if !uuidPattern.MatchString(id) || !consented {
		fail(w, 422, "CUSTOMER_CONSENT_REQUIRED")
		return
	}
	origin, err := url.Parse(os.Getenv("CRM_PUBLIC_ORIGIN"))
	if err != nil || origin.Scheme != "https" || origin.Host == "" || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" || (origin.Path != "" && origin.Path != "/") || s.NoticeSMTP == nil || len(s.Pipeline.Key) != 32 {
		fail(w, 503, "VERIFICATION_TRANSPORT_UNAVAILABLE")
		return
	}
	token := base64.RawURLEncoding.EncodeToString(mac(s.Pipeline.Key, "crm-email|"+ws+"|"+realm+"|"+actor+"|"+id+"|"+key))
	var raw []byte
	err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_customer_challenge($1::uuid,$2,$3::uuid,$4::uuid,$5)", ws, realm, actor, id, digest(token)).Scan(&raw)
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	var challenge struct {
		Email   string `json:"email"`
		Created bool   `json:"created"`
	}
	if json.Unmarshal(raw, &challenge) != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	if !challenge.Created {
		write(w, 200, map[string]any{"status": "already-requested"})
		return
	}
	now := time.Now()
	err = receiptnotice.SendSMTP(r.Context(), *s.NoticeSMTP, receiptnotice.Message{ContactVerification: true, Recipient: receiptnotice.Recipient{Workspace: ws, Environment: realm, Email: challenge.Email, ConsentedAt: now}, Workspace: ws, Environment: realm, MessageID: "crm-" + digest(token), Subject: "Confirm your customer email / ইমেইল যাচাই করুন", Text: "You requested email verification for your customer profile. Confirm only if this is your address. This does not authorize marketing or confirm payment. The link expires in 15 minutes.\nআপনার গ্রাহক প্রোফাইলের ইমেইল যাচাই করুন। এতে প্রচারণার সম্মতি বা পেমেন্ট নিশ্চিত হয় না।\n" + strings.TrimSuffix(origin.String(), "/") + "/customer-verify#" + token})
	if err != nil {
		fail(w, 503, "VERIFICATION_DELIVERY_UNCONFIRMED")
		return
	}
	write(w, 200, map[string]any{"status": "verification-requested"})
}
func (s *Service) HandleCustomerVerify(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if s == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	var b struct {
		Token string `json:"token"`
	}
	if decodeBounded(w, r, &b, 1024) != nil || !tokenPattern.MatchString(b.Token) {
		fail(w, 422, "INVALID_VERIFICATION")
		return
	}
	if !s.budget(w, "crm-verify:"+r.RemoteAddr, 30) {
		return
	}
	var ok bool
	if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_customer_verify($1)", digest(b.Token)).Scan(&ok); err != nil {
		fail(w, 403, "VERIFICATION_UNAVAILABLE")
		return
	}
	write(w, 200, map[string]any{"verified": ok})
}

// API contact fields are unverified claims and never grant merge/payment truth.
func (s *Service) HandleCustomerAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	realm := explicitRealm(r)
	if realm != "live" && realm != "sandbox" {
		fail(w, 422, "INVALID_SCOPE")
		return
	}
	credential, err := s.Auth.AuthenticateMerchant(r.Context(), r.Header.Get("Authorization"), authz.Environment(realm), "customers:write")
	if err != nil {
		authError(w, err)
		return
	}
	if !s.budget(w, "crm-api:"+credential.WorkspaceID, 60) {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	var body DocumentBody
	if !uuidPattern.MatchString(key) || decodeBounded(w, r, &body, 8192) != nil || body.validate("customers") != nil {
		fail(w, 422, "INVALID_CUSTOMER")
		return
	}
	encoded, _ := json.Marshal(map[string]any{"reference": body.Reference, "name": body.Name, "email": body.Email, "phone": body.Phone})
	var raw []byte
	if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT briofold_customer_api_create($1::uuid,$2,$3::uuid,$4::uuid,$5::jsonb)", credential.WorkspaceID, realm, credential.KeyID, key, encoded).Scan(&raw); err != nil {
		inboxWorkFailure(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(201)
	_, _ = w.Write(raw)
}

func validCRMSourceID(value string) bool {
	var id pgtype.UUID
	return len(value) == 36 && id.Scan(value) == nil && id.Valid
}
