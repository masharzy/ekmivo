package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Explicit additive mode in the existing migration operator, never API startup.
func migrateMobilePreview(ctx context.Context) error {
	control := os.Getenv("PG04_CONTROL_MIGRATION_DATABASE_URL")
	sandbox, live := os.Getenv("PG04_SANDBOX_MIGRATION_DATABASE_URL"), os.Getenv("PG04_LIVE_MIGRATION_DATABASE_URL")
	if err := validateIndependent(sandbox, live); err != nil {
		return err
	}
	ct, _, err := inspectDSN(control)
	if err != nil {
		return err
	}
	sa, _, _ := inspectDSN(sandbox)
	lv, _, _ := inspectDSN(live)
	if ct == sa || ct == lv {
		return errors.New("control and finance must be separate")
	}
	targets := []struct{ dsn, file, realm string }{
		{control, os.Getenv("MOBILE_PREVIEW_CONTROL_MIGRATION_FILE"), ""},
		{sandbox, os.Getenv("MOBILE_PREVIEW_FINANCIAL_MIGRATION_FILE"), "sandbox"},
		{live, os.Getenv("MOBILE_PREVIEW_FINANCIAL_MIGRATION_FILE"), "live"},
	}
	if os.Getenv("MOBILE_FOUNDATION_ALLOW_MIGRATION") == "true" {
		root := os.Getenv("MOBILE_FOUNDATION_MIGRATION_DIRECTORY")
		if root == "" {
			return errors.New("explicit mobile foundation migration directory required")
		}
		targets = append(targets,
			struct{ dsn, file, realm string }{control, filepath.Join(root, "0116_mobile_devices_control.sql"), ""},
			struct{ dsn, file, realm string }{sandbox, filepath.Join(root, "0117_mobile_device_financial_adoption.sql"), "sandbox"},
			struct{ dsn, file, realm string }{live, filepath.Join(root, "0117_mobile_device_financial_adoption.sql"), "live"},
			struct{ dsn, file, realm string }{control, filepath.Join(root, "0118_workspace_inbox.sql"), ""},
			struct{ dsn, file, realm string }{control, filepath.Join(root, "0119_channel_oauth.sql"), ""},
			struct{ dsn, file, realm string }{control, filepath.Join(root, "0120_inbox_push.sql"), ""},
			struct{ dsn, file, realm string }{control, filepath.Join(root, "0121_inbox_media_profiles.sql"), ""},
			struct{ dsn, file, realm string }{sandbox, filepath.Join(root, "0122_payment_allowance_worker_grant.sql"), "sandbox"},
			struct{ dsn, file, realm string }{live, filepath.Join(root, "0122_payment_allowance_worker_grant.sql"), "live"})
	}
	for _, t := range targets {
		want := "0115_mobile_pairing_preview_financial.sql"
		if t.realm == "" {
			want = "0114_mobile_workspace_preview_control.sql"
		}
		base := filepath.Base(t.file)
		if base != want && !(os.Getenv("MOBILE_FOUNDATION_ALLOW_MIGRATION") == "true" && (base == "0116_mobile_devices_control.sql" || base == "0117_mobile_device_financial_adoption.sql" || base == "0118_workspace_inbox.sql" || base == "0119_channel_oauth.sql" || base == "0120_inbox_push.sql" || base == "0121_inbox_media_profiles.sql" || base == "0122_payment_allowance_worker_grant.sql")) {
			return errors.New("explicit mobile preview migration file required")
		}
		pool, e := pgxpool.New(ctx, t.dsn)
		if e != nil {
			return e
		}
		e = func() error {
			defer pool.Close()
			var ok bool
			if t.realm == "" {
				e = pool.QueryRow(ctx, `SELECT to_regclass('public.auth_sessions') IS NOT NULL AND to_regclass('public.financial_realm') IS NULL AND EXISTS(SELECT 1 FROM pg_class WHERE oid='public.workspaces'::regclass AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))`).Scan(&ok)
			} else {
				e = pool.QueryRow(ctx, `SELECT environment=$1 AND to_regprocedure('pg06_phone_claim(text,bytea)') IS NOT NULL AND EXISTS(SELECT 1 FROM pg_class WHERE oid='public.financial_realm'::regclass AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) FROM financial_realm WHERE singleton`, t.realm).Scan(&ok)
			}
			if e != nil || !ok {
				return errors.New("mobile preview requires matching database and migration owner")
			}
			marker := ""
			switch base {
			case "0116_mobile_devices_control.sql":
				marker = "mobile_devices"
			case "0117_mobile_device_financial_adoption.sql":
				marker = "pg06_mobile_adopt(uuid,uuid,text,bytea)"
			case "0121_inbox_media_profiles.sql":
				marker = "inbox_media"
			case "0120_inbox_push.sql":
				marker = "inbox_push_tokens"
			case "0119_channel_oauth.sql":
				marker = "inbox_oauth_states"
			case "0118_workspace_inbox.sql":
				marker = "inbox_connections"
			}
			if marker != "" {
				var installed bool
				query := "SELECT to_regclass($1) IS NOT NULL"
				if base == "0117_mobile_device_financial_adoption.sql" {
					query = "SELECT to_regprocedure($1) IS NOT NULL"
				}
				if e = pool.QueryRow(ctx, query, marker).Scan(&installed); e != nil {
					return e
				}
				if installed {
					return nil
				}
			}
			script, e := os.ReadFile(filepath.Clean(t.file))
			if e != nil {
				return e
			}
			conn, e := pool.Acquire(ctx)
			if e != nil {
				return e
			}
			defer conn.Release()
			_, e = conn.Conn().PgConn().Exec(ctx, string(script)).ReadAll()
			return e
		}()
		if e != nil {
			return e
		}
	}
	return nil
}
