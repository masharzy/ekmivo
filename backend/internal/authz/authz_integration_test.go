package authz

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// Real PostgreSQL integration is run by the web CI PostgreSQL job, never
// against the production DATABASE_URL. It validates Go and RLS together.
func TestPostgresSessionMembershipAndEnvironment(t *testing.T) {
	url := os.Getenv("PG01_RUNTIME_DATABASE_URL")
	if url == "" {
		t.Skip("requires disposable PG01_RUNTIME_DATABASE_URL")
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	repo := Repository{DB: db}
	if err = repo.ProbeReadOnlyBoundary(ctx); err != nil {
		t.Fatal(err)
	}
	adminURL := os.Getenv("PG00_TEST_DATABASE_URL")
	if adminURL == "" {
		t.Fatal("PG01 integration requires isolated admin fixture database")
	}
	admin, err := sql.Open("pgx", adminURL)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	ids := []string{"11111111-1111-4111-a111-111111111111", "22222222-2222-4222-a222-222222222222", "33333333-3333-4333-a333-333333333333"}
	workspaces := []string{"41111111-1111-4111-a111-111111111111", "42222222-2222-4222-a222-222222222222", "43333333-3333-4333-a333-333333333333"}
	var token string
	fixture, err := admin.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer fixture.Rollback()
	for i, id := range ids {
		_, err = fixture.ExecContext(ctx, "INSERT INTO app_users(id,email,display_name,password_hash) VALUES ($1::uuid,$2,'PG01 User','invalid-fixture-hash')", id, fmt.Sprintf("pg01go%d@example.invalid", i))
		if err != nil {
			t.Fatal(err)
		}
		_, err = fixture.ExecContext(ctx, "INSERT INTO workspaces(id,name,service_mode,created_by) VALUES ($1::uuid,'PG01 Go Tenant','commerce',$2::uuid)", workspaces[i], id)
		if err != nil {
			t.Fatal(err)
		}
		_, err = fixture.ExecContext(ctx, "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1::uuid,$2::uuid,'owner')", workspaces[i], id)
		if err != nil {
			t.Fatal(err)
		}
		// Migration trigger seeds both environments atomically with each workspace.
		var seeded int
		err = fixture.QueryRowContext(ctx, "SELECT count(*) FROM workspace_environments WHERE workspace_id=$1::uuid", workspaces[i]).Scan(&seeded)
		if err != nil || seeded != 2 {
			t.Fatalf("workspace contexts not seeded: %v (count %d)", err, seeded)
		}
	}
	// Fixture is committed for the separate runtime connection, then removed
	// at test cleanup. The randomly generated session token is never logged.
	if err = fixture.Commit(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		for _, id := range ids {
			_, _ = admin.ExecContext(context.Background(), "DELETE FROM workspace_members WHERE user_id=$1::uuid", id)
		}
		for _, id := range workspaces {
			_, _ = admin.ExecContext(context.Background(), "DELETE FROM workspace_environments WHERE workspace_id=$1::uuid", id)
			_, _ = admin.ExecContext(context.Background(), "DELETE FROM workspaces WHERE id=$1::uuid", id)
		}
		for _, id := range ids {
			_, _ = admin.ExecContext(context.Background(), "DELETE FROM app_users WHERE id=$1::uuid", id)
		}
	}()
	bytes := make([]byte, 32)
	if _, err = rand.Read(bytes); err != nil {
		t.Fatal(err)
	}
	token = base64.RawURLEncoding.EncodeToString(bytes)
	hash := sha256.Sum256([]byte(token))
	_, err = admin.ExecContext(ctx, "INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1::uuid,$2,now()+interval '1 hour')", ids[0], hex.EncodeToString(hash[:]))
	if err != nil {
		t.Fatal(err)
	}
	principal, err := repo.Authenticate(ctx, token)
	if err != nil || principal.UserID != ids[0] {
		t.Fatalf("auth failed: %v", err)
	}
	if _, err = repo.AuthorizePlatform(ctx, principal, true); !errors.Is(err, ErrForbidden) {
		t.Fatalf("workspace owner gained platform admin privileges: %v", err)
	}
	_, err = admin.ExecContext(ctx, "INSERT INTO platform_administrators(user_id,role) VALUES ($1::uuid,'super_admin')", ids[0])
	if err != nil {
		t.Fatal(err)
	}
	_, err = admin.ExecContext(ctx, "INSERT INTO platform_admin_mfa(user_id,secret_ciphertext,confirmed_at) VALUES ($1::uuid,'sealed-test-fixture',now())", ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.AuthorizePlatform(ctx, principal, true); !errors.Is(err, ErrMFANeeded) {
		t.Fatalf("platform admin without recent MFA was authorized: %v", err)
	}
	_, err = admin.ExecContext(ctx, "UPDATE auth_sessions SET mfa_verified_at=now() WHERE token_hash=$1", hex.EncodeToString(hash[:]))
	if err != nil {
		t.Fatal(err)
	}
	principal, err = repo.Authenticate(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	if role, err := repo.AuthorizePlatform(ctx, principal, true); err != nil || role != "super_admin" {
		t.Fatalf("fresh MFA platform admin was rejected: %v", err)
	}
	_, err = admin.ExecContext(ctx, "WITH enrolled AS (UPDATE platform_admin_mfa SET confirmed_at=now()-interval '14 hours' WHERE user_id=$2::uuid) UPDATE auth_sessions SET mfa_verified_at=now()-interval '13 hours' WHERE token_hash=$1", hex.EncodeToString(hash[:]), ids[0])
	if err != nil {
		t.Fatal(err)
	}
	principal, err = repo.Authenticate(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.AuthorizePlatform(ctx, principal, true); err != nil {
		t.Fatalf("verified active login must not require periodic MFA: %v", err)
	}
	_, err = admin.ExecContext(ctx, "UPDATE auth_sessions SET mfa_verified_at=now() WHERE token_hash=$1", hex.EncodeToString(hash[:]))
	if err != nil {
		t.Fatal(err)
	}
	_, err = admin.ExecContext(ctx, "UPDATE platform_administrators SET role='support' WHERE user_id=$1::uuid", ids[0])
	if err != nil {
		t.Fatal(err)
	}
	principal, err = repo.Authenticate(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.AuthorizePlatform(ctx, principal, true); !errors.Is(err, ErrForbidden) {
		t.Fatalf("support gained super admin capability: %v", err)
	}
	_, err = admin.ExecContext(ctx, "UPDATE platform_administrators SET role='super_admin' WHERE user_id=$1::uuid", ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.AuthorizeWorkspace(ctx, principal, workspaces[0], Sandbox, PaymentsRead); err != nil {
		t.Fatalf("own sandbox denied: %v", err)
	}
	if _, err = repo.AuthorizeWorkspace(ctx, principal, workspaces[0], Live, PaymentsRead); err != nil {
		t.Fatalf("own live denied: %v", err)
	}
	_, err = admin.ExecContext(ctx, "UPDATE workspace_product_access SET enabled=false WHERE workspace_id=$1::uuid AND product='payments'", workspaces[0])
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.AuthorizeWorkspace(ctx, principal, workspaces[0], Live, PaymentsRead); !errors.Is(err, ErrForbidden) {
		t.Fatalf("disabled payment product still authorized: %v", err)
	}
	_, err = admin.ExecContext(ctx, "UPDATE workspace_product_access SET enabled=true WHERE workspace_id=$1::uuid AND product='payments'", workspaces[0])
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.AuthorizeWorkspace(ctx, principal, workspaces[0], Live, PaymentsRead); err != nil {
		t.Fatalf("restored payments denied: %v", err)
	}

	if _, err = repo.AuthorizeWorkspace(ctx, principal, workspaces[1], Live, PaymentsRead); !errors.Is(err, ErrForbidden) {
		t.Fatalf("other tenant accessed: %v", err)
	}
	if _, err = repo.AuthorizeWorkspace(ctx, principal, workspaces[0], "preview", PaymentsRead); !errors.Is(err, ErrForbidden) {
		t.Fatalf("unsupported env accessed: %v", err)
	}
	if err = repo.UpdateCheckoutExpiry(ctx, principal, workspaces[0], Sandbox, 20); err != nil {
		t.Fatalf("owner actual settings write: %v", err)
	}
	var expiry int
	if err = admin.QueryRowContext(ctx, "SELECT checkout_expiry_minutes FROM workspace_environment_settings WHERE workspace_id=$1::uuid AND environment='sandbox'", workspaces[0]).Scan(&expiry); err != nil || expiry != 20 {
		t.Fatalf("write not persisted: %v", err)
	}
	_, err = admin.ExecContext(ctx, "UPDATE workspace_members SET role='viewer' WHERE workspace_id=$1::uuid AND user_id=$2::uuid", workspaces[0], ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if err = repo.UpdateCheckoutExpiry(ctx, principal, workspaces[0], Sandbox, 25); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer actual write not rejected: %v", err)
	}
	if _, err = repo.AuthorizeWorkspace(ctx, principal, workspaces[0], Live, PaymentsManage); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer managed payment: %v", err)
	}
	_, err = admin.ExecContext(ctx, "DELETE FROM workspace_members WHERE workspace_id=$1::uuid AND user_id=$2::uuid", workspaces[0], ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.AuthorizeWorkspace(ctx, principal, workspaces[0], Live, PaymentsRead); !errors.Is(err, ErrForbidden) {
		t.Fatalf("removed member accessed: %v", err)
	}
	// A platform-wide email verification toggle must be authoritative in Go too.
	_, err = admin.ExecContext(ctx, "UPDATE platform_auth_settings SET email_verification_enabled=true WHERE singleton=true")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.Authenticate(ctx, token); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("unverified session accessed Go while verification enabled: %v", err)
	}
	_, err = admin.ExecContext(ctx, "UPDATE app_users SET email_verified_at=now() WHERE id=$1::uuid", ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.Authenticate(ctx, token); err != nil {
		t.Fatalf("verified identity denied: %v", err)
	}
	_, err = admin.ExecContext(ctx, "UPDATE platform_auth_settings SET email_verification_enabled=false WHERE singleton=true")
	if err != nil {
		t.Fatal(err)
	}
	_, err = admin.ExecContext(ctx, "UPDATE app_users SET disabled_at=now() WHERE id=$1::uuid", ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.Authenticate(ctx, token); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("disabled user retained session: %v", err)
	}
	_, err = admin.ExecContext(ctx, "UPDATE app_users SET disabled_at=NULL WHERE id=$1::uuid", ids[0])
	if err != nil {
		t.Fatal(err)
	}
	_, err = admin.ExecContext(ctx, "UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1", hex.EncodeToString(hash[:]))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.Authenticate(ctx, token); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("revoked session accepted: %v", err)
	}
}
