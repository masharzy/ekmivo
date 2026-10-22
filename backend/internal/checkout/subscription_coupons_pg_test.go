package checkout

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/masharzy/ekmivo/backend/internal/authz"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// This test deliberately runs only against the short-lived localhost PostgreSQL
// service prepared by subscription-coupon-concurrency-smoke.mjs, never Neon.
func TestSubscriptionCouponHTTPIsolatedPostgres(t *testing.T) {
	source := os.Getenv("PHASE3_COUPON_HTTP_TEST_DATABASE_URL")
	if source == "" {
		t.Skip("requires dedicated ephemeral Phase 3 test database")
	}
	u, err := url.Parse(source)
	if err != nil || u.Hostname() != "127.0.0.1" || u.Port() != "5432" || u.Path != "/ekmivo" {
		t.Fatal("Phase 3 HTTP fixture refuses non-local databases")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := sql.Open("pgx", source)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = db.PingContext(ctx); err != nil {
		t.Fatal(err)
	}
	type record struct{ user, intent string }
	var a, b record
	for _, entry := range []struct {
		name string
		out  *record
	}{{"Fictional CI store A", &a}, {"Fictional CI store B", &b}} {
		err = db.QueryRowContext(ctx, `SELECT i.actor_id::text,i.id::text
          FROM platform_subscription_purchase_intents i
          JOIN workspaces w ON w.id=i.workspace_id
          WHERE w.name=$1 LIMIT 1`, entry.name).Scan(&entry.out.user, &entry.out.intent)
		if err != nil {
			t.Fatal(err)
		}
	}
	makeSession := func(user string, mfa bool) (token, hash string) {
		t.Helper()
		secret := make([]byte, 32)
		if _, e := rand.Read(secret); e != nil {
			t.Fatal(e)
		}
		token = base64.RawURLEncoding.EncodeToString(secret)
		digest := sha256.Sum256([]byte(token))
		hash = hex.EncodeToString(digest[:])
		mfaTime := "NULL"
		if mfa {
			mfaTime = "now()"
		}
		_, e := db.ExecContext(ctx, fmt.Sprintf(`INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at)
          VALUES($1::uuid,$2,now()+interval '1 hour',%s)`, mfaTime), user, hash)
		if e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() { _, _ = db.ExecContext(context.Background(), "DELETE FROM auth_sessions WHERE token_hash=$1", hash) })
		return
	}
	adminToken, _ := makeSession(a.user, true)
	noMFAToken, _ := makeSession(a.user, false)
	otherToken, _ := makeSession(b.user, true)
	_, err = db.ExecContext(ctx, "INSERT INTO platform_administrators(user_id,role) VALUES($1::uuid,'super_admin'),($2::uuid,'support')", a.user, b.user)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.ExecContext(context.Background(), "DELETE FROM platform_administrators WHERE user_id IN ($1::uuid,$2::uuid)", a.user, b.user) })
	_, err = db.ExecContext(ctx, "INSERT INTO platform_admin_mfa(user_id,confirmed_at) VALUES($1::uuid,now()-interval '1 minute'),($2::uuid,now()-interval '1 minute')", a.user, b.user)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.ExecContext(context.Background(), "DELETE FROM platform_admin_mfa WHERE user_id IN ($1::uuid,$2::uuid)", a.user, b.user) })
	service := &Service{Auth: &authz.Repository{DB: db}}
	SetAllowedOrigin("https://phase3-ci.example.invalid")
	t.Cleanup(func() { SetAllowedOrigin("") })
	call := func(method, path, token, body string, validOrigin bool) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, "https://phase3-ci.example.invalid"+path, strings.NewReader(body))
		if token != "" {
			req.AddCookie(&http.Cookie{Name: "ekmivo-session", Value: token})
		}
		if validOrigin {
			req.Header.Set("Origin", "https://phase3-ci.example.invalid")
		}
		w := httptest.NewRecorder()
		if strings.HasPrefix(path, "/v1/admin/") {
			service.HandleSubscriptionCouponsAdmin(w, req)
		} else {
			req.SetPathValue("intentID", strings.TrimSuffix(strings.TrimPrefix(path, "/v1/platform/purchase-intents/"), "/quote"))
			service.HandleSubscriptionCouponQuote(w, req)
		}
		return w
	}
	assertStatus := func(label string, result *httptest.ResponseRecorder, expected int) {
		t.Helper()
		if result.Code != expected {
			t.Fatalf("%s: HTTP %d instead of %d; body=%s", label, result.Code, expected, result.Body.String())
		}
	}
	quotePath := "/v1/platform/purchase-intents/" + a.intent + "/quote"
	adminPath := "/v1/admin/billing/coupons"
	assertStatus("anonymous quote", call("GET", quotePath, "", "", false), 401)
	assertStatus("other tenant quote", call("GET", quotePath, otherToken, "", false), 403)
	result := call("GET", quotePath, adminToken, "", false)
	assertStatus("own quote", result, 200)
	if !strings.Contains(result.Body.String(), "\"intent_revision\"") || !strings.Contains(result.Body.String(), "\"total_minor\"") {
		t.Fatal("server quote GET did not return immutable pricing and revision")
	}
	assertStatus("coupon POST absent Origin", call("POST", quotePath, adminToken, `{}`, false), 403)
	assertStatus("anonymous admin", call("GET", adminPath, "", "", false), 401)
	assertStatus("admin without MFA", call("GET", adminPath, noMFAToken, "", false), 403)
	assertStatus("non-super admin", call("GET", adminPath, otherToken, "", false), 403)
	assertStatus("super admin list", call("GET", adminPath, adminToken, "", false), 200)
	assertStatus("admin POST absent Origin", call("POST", adminPath, adminToken, `{}`, false), 403)
	assertStatus("admin POST invalid operation", call("POST", adminPath, adminToken, `{"operation":"make_paid"}`, true), 422)
	quote := func(label, path, token string) map[string]any {
		t.Helper()
		w := call("GET", path, token, "", false)
		assertStatus(label, w, 200)
		var result map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	operation := func(label, path, token string, revision float64, code string) map[string]any {
		t.Helper()
		bytes := make([]byte, 16)
		if _, err := rand.Read(bytes); err != nil {
			t.Fatal(err)
		}
		key := hex.EncodeToString(bytes)
		id := fmt.Sprintf("%s-%s-4%s-a%s-%s", key[0:8], key[8:12], key[13:16], key[17:20], key[20:32])
		body, err := json.Marshal(map[string]any{"operation_key": id, "revision": int64(revision), "coupon_code": code})
		if err != nil {
			t.Fatal(err)
		}
		w := call("POST", path, token, string(body), true)
		assertStatus(label, w, 200)
		var result map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		// Retrying a completed mutation with the exact same idempotency key
		// must recover its immutable response without creating a new revision.
		replay := call("POST", path, token, string(body), true)
		assertStatus(label+" replay", replay, 200)
		var repeated map[string]any
		if err := json.Unmarshal(replay.Body.Bytes(), &repeated); err != nil {
			t.Fatal(err)
		}
		if result["id"] != repeated["id"] || result["revision"] != repeated["revision"] {
			t.Fatal("coupon idempotency replay created another quote")
		}
		return result
	}
	otherPath := "/v1/platform/purchase-intents/" + b.intent + "/quote"
	// Race test reserved the only slot for exactly one of A/B. Releasing both
	// through the real HTTP handler exercises removal, then opens that slot.
	for _, entry := range []struct{ path, token string }{{quotePath, adminToken}, {otherPath, otherToken}} {
		q := quote("read race result", entry.path, entry.token)
		if q["coupon_id"] != nil {
			removed := operation("remove raced coupon", entry.path, entry.token, q["intent_revision"].(float64), "")
			if removed["coupon_id"] != nil || removed["coupon_discount_minor"].(float64) != 0 {
				t.Fatal("removal failed to clear authoritative discount")
			}
		}
	}
	base := quote("read after release", quotePath, adminToken)
	assertStatus("other Store cannot apply", call("POST", quotePath, otherToken, `{"revision":1,"operation_key":"11111111-1111-4111-a111-111111111111","coupon_code":"RACE_ONE_SLOT"}`, true), 403)
	apply := operation("apply coupon", quotePath, adminToken, base["intent_revision"].(float64), "RACE_ONE_SLOT")
	if apply["coupon_code"] != "RACE_ONE_SLOT" || apply["coupon_discount_minor"].(float64) != 1000 {
		t.Fatal("verified coupon code or integer discount changed unexpectedly")
	}
	if refreshed := quote("GET reload after apply", quotePath, adminToken); refreshed["id"] != apply["id"] || refreshed["coupon_code"] != "RACE_ONE_SLOT" {
		t.Fatal("GET after Apply did not return the same authoritative quote")
	}
	removed := operation("remove coupon", quotePath, adminToken, apply["intent_revision"].(float64), "")
	if removed["coupon_id"] != nil || removed["coupon_discount_minor"].(float64) != 0 || removed["total_minor"].(float64) != 10000 {
		t.Fatal("Remove did not restore pre-discount verified total")
	}
	if refreshed := quote("GET reload after remove", quotePath, adminToken); refreshed["id"] != removed["id"] {
		t.Fatal("GET after Remove returned stale quote")
	}
	assertStatus("stale revision", call("POST", quotePath, adminToken,
		`{"revision":1,"operation_key":"22222222-2222-4222-a222-222222222222","coupon_code":"RACE_ONE_SLOT"}`, true), 409)
	// Store settings authorization is evaluated from current database roles,
	// not a once-valid session or an old price quote.
	_, err = db.ExecContext(ctx, "UPDATE workspace_members SET role='editor' WHERE user_id=$1::uuid", a.user)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.ExecContext(context.Background(), "UPDATE workspace_members SET role='owner' WHERE user_id=$1::uuid", a.user) })
	assertStatus("downgraded owner", call("GET", quotePath, adminToken, "", false), 403)
	_, err = db.ExecContext(ctx, "UPDATE workspace_members SET role='owner' WHERE user_id=$1::uuid", a.user)
	if err != nil {
		t.Fatal(err)
	}

	_, err = db.ExecContext(ctx, "UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=(SELECT token_hash FROM auth_sessions WHERE user_id=$1::uuid AND mfa_verified_at IS NOT NULL LIMIT 1)", a.user)
	if err != nil {
		t.Fatal(err)
	}
	assertStatus("revoked administrator", call("GET", adminPath, adminToken, "", false), 401)
}
