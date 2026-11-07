package authz

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/url"
	"os"
	"testing"
	"time"
)

// Real pgx database/sql regression: SQL-only resolver checks cannot catch
// text[] -> []string scan failures. Fixtures exist only in disposable CI DB.
func TestPostgresMerchantCredentials(t *testing.T) {
	raw := os.Getenv("PG00_TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("requires isolated PostgreSQL fixture database")
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Hostname() != "localhost" && parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "::1") {
		t.Fatal("refusing non-local fixture database")
	}
	db, err := sql.Open("pgx", raw)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	var uid, wid string
	if err = tx.QueryRowContext(ctx, `INSERT INTO app_users(email,display_name,password_hash) VALUES ('pg03-go-array@example.invalid','PG03 Go','invalid-fixture') RETURNING id::text`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRowContext(ctx, `INSERT INTO workspaces(name,service_mode,created_by) VALUES ('PG03 Go','commerce',$1::uuid) RETURNING id::text`, uid).Scan(&wid); err != nil {
		t.Fatal(err)
	}
	entropy := make([]byte, 32)
	if _, err = rand.Read(entropy); err != nil {
		t.Fatal(err)
	}
	token := "bf_test_" + hex.EncodeToString(entropy[:8]) + "_" + base64.RawURLEncoding.EncodeToString(entropy)
	publicID, _, digest, _ := ParseMerchantToken(token)
	if _, err = tx.ExecContext(ctx, `INSERT INTO merchant_api_keys(workspace_id,environment,name,public_id,secret_digest,scopes,expires_at,created_by) VALUES ($1::uuid,'sandbox','Go scan regression',$2,$3,ARRAY['payments:read','refunds:read'],now()+interval '1 hour',$4::uuid)`, wid, publicID, digest, uid); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := db.ExecContext(context.Background(), `DELETE FROM workspaces WHERE id=$1::uuid`, wid); err != nil {
			t.Error("fixture workspace cleanup failed")
		}
		if _, err := db.ExecContext(context.Background(), `DELETE FROM app_users WHERE id=$1::uuid`, uid); err != nil {
			t.Error("fixture identity cleanup failed")
		}
	}()
	// Role is nonprivileged and has no direct key-table access.
	runtimeURL := *parsed
	runtimeURL.User = url.UserPassword("ekmivo_financial_runtime", "pg01-ci-only-password")
	runtimeDB, err := sql.Open("pgx", runtimeURL.String())
	if err != nil {
		t.Fatal(err)
	}
	defer runtimeDB.Close()
	repo := Repository{DB: runtimeDB}
	credential, err := repo.AuthenticateMerchant(ctx, "Bearer "+token, Sandbox, "payments:read")
	if err != nil || credential.WorkspaceID != wid || len(credential.Scopes) != 2 {
		t.Fatalf("valid multi-scope key failed: %v", err)
	}
	var used bool
	if err = db.QueryRowContext(ctx, `SELECT last_used_at IS NOT NULL FROM merchant_api_keys WHERE public_id=$1`, publicID).Scan(&used); err != nil || !used {
		t.Fatal("successful authentication did not record use")
	}
	if _, err = repo.AuthenticateMerchant(ctx, "Bearer "+token, Sandbox, "payments:write"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("missing scope: %v", err)
	}
	if _, err = repo.AuthenticateMerchant(ctx, "Bearer "+token, Live, "payments:read"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("wrong environment: %v", err)
	}
	entropy[31] ^= 1
	wrong := "bf_test_" + publicID + "_" + base64.RawURLEncoding.EncodeToString(entropy)
	if _, err = repo.AuthenticateMerchant(ctx, "Bearer "+wrong, Sandbox, "payments:read"); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("tampered secret: %v", err)
	}
	if _, err = db.ExecContext(ctx, `UPDATE merchant_api_keys SET revoked_at=now() WHERE public_id=$1`, publicID); err != nil {
		t.Fatal(err)
	}
	if _, err = repo.AuthenticateMerchant(ctx, "Bearer "+token, Sandbox, "payments:read"); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("revoked secret: %v", err)
	}
}
