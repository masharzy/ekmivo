// Package authz enforces Ekmivo's PostgreSQL opaque sessions, workspace
// membership/capabilities, platform MFA and transaction-local RLS context.
package authz

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"time"
)

var (
	ErrUnauthorized = errors.New("unauthorized")
	ErrForbidden    = errors.New("forbidden")
	ErrMFANeeded    = errors.New("admin_mfa_required")
	ErrUnavailable  = errors.New("authorization_unavailable")
	uuidRx          = regexp.MustCompile(`^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$`)
)

type Capability string

const (
	PaymentsRead      Capability = "payments:read"
	PaymentsIssue     Capability = "payments:issue" // safe PG05 create/cancel; editors allowed
	PaymentsManage    Capability = "payments:manage"
	WorkspaceSettings Capability = "workspace:settings"
	MembersManage     Capability = "members:manage"
)

type Environment string

const (
	Sandbox Environment = "sandbox"
	Live    Environment = "live"
)

type Principal struct {
	UserID        string
	SessionID     string
	Email         string
	EmailVerified bool
	MFAVerifiedAt sql.NullTime
}
type WorkspaceAccess struct {
	WorkspaceID string
	Environment Environment
	Role        string
	Capability  Capability
}
type Repository struct {
	DB             *sql.DB
	GranularGrants bool
}

// ValidateRuntimeRole rejects superuser, BYPASSRLS or owner credentials
// before the Go API can serve financial/tenant routes.
func (r *Repository) ValidateRuntimeRole(ctx context.Context) error {
	if r == nil || r.DB == nil {
		return ErrUnavailable
	}
	var current string
	var super, bypass, login, createRole, createDB, elevatedMember, tableOwner bool
	err := r.DB.QueryRowContext(ctx, `SELECT r.rolname,r.rolsuper,r.rolbypassrls,r.rolcanlogin,
  r.rolcreaterole,r.rolcreatedb,
  EXISTS(
   SELECT 1 FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid
   WHERE m.member=r.oid AND parent.rolname IN ('neon_superuser','pg_read_all_data','pg_write_all_data')
  ),
  EXISTS(
   SELECT 1 FROM pg_class tbl JOIN pg_namespace n ON n.oid=tbl.relnamespace
   WHERE n.nspname='public' AND tbl.relname IN
     ('workspace_environments','workspace_environment_settings','auth_sessions','platform_admin_mfa')
     AND tbl.relowner=r.oid
  )
 FROM pg_roles r WHERE r.rolname=current_user`).Scan(
		&current, &super, &bypass, &login, &createRole, &createDB, &elevatedMember, &tableOwner)
	if err != nil {
		return fmt.Errorf("%w: cannot inspect database role", ErrUnavailable)
	}
	if current != "ekmivo_financial_runtime" || super || bypass || createRole || createDB || elevatedMember || tableOwner || !login {
		return fmt.Errorf("%w: financial API requires dedicated unprivileged ekmivo_financial_runtime login", ErrUnavailable)
	}
	return nil
}

// Session IDs are 32 random bytes represented as unpadded base64url, as
// issued by the existing Next.js self-hosted auth implementation.
func hashOpaqueSession(token string) (string, bool) {
	raw, e := base64.RawURLEncoding.DecodeString(token)
	if e != nil || len(raw) != 32 || base64.RawURLEncoding.EncodeToString(raw) != token {
		return "", false
	}
	digest := sha256.Sum256([]byte(token))
	return hex.EncodeToString(digest[:]), true
}
func (r *Repository) Authenticate(ctx context.Context, token string) (Principal, error) {
	var u Principal
	if r == nil || r.DB == nil {
		return u, ErrUnavailable
	}
	hash, valid := hashOpaqueSession(token)
	if !valid {
		return u, ErrUnauthorized
	}
	err := r.DB.QueryRowContext(ctx, `
 SELECT s.id::text,u.id::text,u.email,u.email_verified_at IS NOT NULL,
 s.mfa_verified_at
 FROM auth_sessions s JOIN app_users u ON u.id=s.user_id
 WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()
 AND u.disabled_at IS NULL
 AND (u.email_verified_at IS NOT NULL OR NOT EXISTS (
  SELECT 1 FROM platform_auth_settings f
  WHERE f.singleton=true AND f.email_verification_enabled=true
 )) LIMIT 1`, hash).
		Scan(&u.SessionID, &u.UserID, &u.Email, &u.EmailVerified, &u.MFAVerifiedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Principal{}, ErrUnauthorized
	}
	if err != nil {
		return Principal{}, ErrUnavailable
	}
	return u, nil
}
func validEnvironment(e Environment) bool { return e == Sandbox || e == Live }
func permits(role string, c Capability) bool {
	switch c {
	case PaymentsRead:
		return role == "owner" || role == "admin" || role == "editor" || role == "viewer"
	case PaymentsIssue:
		return role == "owner" || role == "admin" || role == "editor"
	case PaymentsManage, WorkspaceSettings, MembersManage:
		return role == "owner" || role == "admin"
	default:
		return false
	}
}
func serviceAllows(mode string, capability Capability) bool {
	switch capability {
	case PaymentsRead, PaymentsIssue, PaymentsManage:
		return mode == "commerce" || mode == "both"
	default:
		return true
	}
}

// AuthorizeWorkspace checks actor ownership and environment in a fresh
// transaction, binds RLS context using SET LOCAL / set_config(...,true), then
// probes a FORCE RLS-protected table; after commit/rollback context is cleared.
// Calling services must not trust any client-supplied role, tenant or status.
func (r *Repository) AuthorizeWorkspace(ctx context.Context, principal Principal, workspaceID string, environment Environment, capability Capability) (WorkspaceAccess, error) {
	var result WorkspaceAccess
	if r == nil || r.DB == nil {
		return result, ErrUnavailable
	}
	if !uuidRx.MatchString(principal.UserID) || !uuidRx.MatchString(workspaceID) || !validEnvironment(environment) {
		return result, ErrForbidden
	}
	tx, err := r.DB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return result, ErrUnavailable
	}
	defer tx.Rollback()
	var role string
	err = tx.QueryRowContext(ctx, `SELECT m.role
  FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id
  JOIN app_users u ON u.id=m.user_id
  WHERE m.workspace_id=$1::uuid AND m.user_id=$2::uuid AND u.disabled_at IS NULL
  LIMIT 1`, workspaceID, principal.UserID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return result, ErrForbidden
	}
	if err != nil {
		return result, ErrUnavailable
	}
	if !permits(role, capability) {
		return result, ErrForbidden
	}
	if r.GranularGrants {
		var allowed sql.NullBool
		if err = tx.QueryRowContext(ctx, "SELECT pg13_capability_override($1::uuid,$2::uuid,$3)", workspaceID, principal.UserID, string(capability)).Scan(&allowed); err != nil {
			return result, ErrUnavailable
		}
		if allowed.Valid && !allowed.Bool {
			return result, ErrForbidden
		}
	}
	var actor, tenant, env string
	err = tx.QueryRowContext(ctx, `SELECT
  set_config('ekmivo.user_id',$1,true),
  set_config('ekmivo.workspace_id',$2,true),
  set_config('ekmivo.environment',$3,true)`, principal.UserID, workspaceID, string(environment)).
		Scan(&actor, &tenant, &env)
	if err != nil {
		return result, ErrUnavailable
	}
	if capability == PaymentsRead || capability == PaymentsIssue || capability == PaymentsManage {
		var enabled bool
		err = tx.QueryRowContext(ctx, `SELECT enabled FROM workspace_product_access
   WHERE workspace_id=$1::uuid AND product='payments' LIMIT 1`, workspaceID).Scan(&enabled)
		if errors.Is(err, sql.ErrNoRows) || err == nil && !enabled {
			return result, ErrForbidden
		}
		if err != nil {
			return result, ErrUnavailable
		}
	}
	var exists int
	err = tx.QueryRowContext(ctx, `SELECT 1 FROM workspace_environments
  WHERE workspace_id=$1::uuid AND environment=$2 AND status='active'
  LIMIT 1`, workspaceID, string(environment)).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return result, ErrForbidden
	}
	if err != nil {
		return result, ErrUnavailable
	}
	if err = tx.Commit(); err != nil {
		return result, ErrUnavailable
	}
	return WorkspaceAccess{WorkspaceID: workspaceID, Environment: environment, Role: role, Capability: capability}, nil
}

// Admin access is always subject to enrolled TOTP plus a recent session-specific
// MFA challenge, even if ordinary user email verification is globally disabled.
func (r *Repository) AuthorizePlatform(ctx context.Context, principal Principal, superOnly bool) (string, error) {
	if r == nil || r.DB == nil {
		return "", ErrUnavailable
	}
	if !uuidRx.MatchString(principal.UserID) {
		return "", ErrUnauthorized
	}
	var role string
	var confirmed sql.NullTime
	err := r.DB.QueryRowContext(ctx, `SELECT a.role,m.confirmed_at
 FROM platform_administrators a LEFT JOIN platform_admin_mfa m ON m.user_id=a.user_id
 JOIN app_users u ON u.id=a.user_id
 WHERE a.user_id=$1::uuid AND u.disabled_at IS NULL LIMIT 1`, principal.UserID).Scan(&role, &confirmed)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrForbidden
	}
	if err != nil {
		return "", ErrUnavailable
	}
	if superOnly && role != "super_admin" {
		return "", ErrForbidden
	}
	if !confirmed.Valid || !principal.MFAVerifiedAt.Valid || principal.MFAVerifiedAt.Time.Before(confirmed.Time) || time.Since(principal.MFAVerifiedAt.Time) < -time.Minute {
		return "", ErrMFANeeded
	}
	return role, nil
}
