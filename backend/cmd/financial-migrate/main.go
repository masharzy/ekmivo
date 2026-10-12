// Command financial-migrate runs upstream River and Ekmivo domain migrations
// under ONE reviewed infrastructure migration procedure, never HTTP startup.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
)

type realmDSN struct{ environment, raw string }

func inspectDSN(raw string) (string, string, error) {
	if raw == "" {
		return "", "", errors.New("missing financial migration URL")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "postgres" && u.Scheme != "postgresql" || u.Host == "" {
		return "", "", errors.New("financial migration requires an explicit PostgreSQL URL")
	}
	name := strings.TrimPrefix(u.Path, "/")
	if name == "" {
		return "", "", errors.New("explicit DB name is required")
	}
	return u.Host + "/" + name, u.User.Username(), nil
}
func validateIndependent(sandbox, live string) error {
	a, au, err := inspectDSN(sandbox)
	if err != nil {
		return err
	}
	b, bu, err := inspectDSN(live)
	if err != nil {
		return err
	}
	if a == b || au == "" || bu == "" || au == bu {
		return errors.New("sandbox/live must use separate named financial databases and credentials")
	}
	if strings.HasSuffix(a, "/ekmivo") || strings.HasSuffix(b, "/ekmivo") {
		return errors.New("refusing the control-plane database")
	}
	return nil
}
func migrateControl(ctx context.Context, raw, filename string) error {
	pool, err := pgxpool.New(ctx, raw)
	if err != nil {
		return errors.New("cannot open control migration connection")
	}
	defer pool.Close()
	var auth, finance, versioned bool
	err = pool.QueryRow(ctx, `SELECT to_regclass('public.auth_sessions') IS NOT NULL,
   to_regclass('public.financial_realm') IS NOT NULL,
   to_regclass('public.financial_projection_versions') IS NOT NULL`).
		Scan(&auth, &finance, &versioned)
	if err != nil || !auth || finance {
		return errors.New("refusing to apply control migration outside auth DB")
	}
	if versioned {
		return nil
	}
	content, err := os.ReadFile(filepath.Clean(filename))
	if err != nil {
		return errors.New("control migration source missing")
	}
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return errors.New("control migration connection unavailable")
	}
	defer conn.Release()
	if _, err = conn.Conn().PgConn().Exec(ctx, string(content)).ReadAll(); err != nil {
		return fmt.Errorf("versioned control projection DDL: %w", err)
	}
	log.Print("PG04 control projection migration applied (financial/user data not copied)")
	return nil
}

func migrateRealm(ctx context.Context, env, raw, filename string) error {
	pool, err := pgxpool.New(ctx, raw)
	if err != nil {
		return errors.New("cannot open financial migration pool")
	}
	defer pool.Close()
	var dbName, actor, control string
	err = pool.QueryRow(ctx, `SELECT current_database(), current_user,
  COALESCE(to_regclass('public.auth_sessions')::text,'')`).Scan(&dbName, &actor, &control)
	if err != nil {
		return errors.New("database preflight failed")
	}
	if control != "" || strings.Contains(dbName, "control") || strings.Contains(dbName, "prod_auth") {
		return errors.New("refusing to migrate control-plane identity database")
	}
	if actor == "ekmivo_financial_runtime" || strings.Contains(actor, "worker") || strings.Contains(actor, "provisioner") {
		return errors.New("financial schema migration requires a dedicated migration operator")
	}
	// Current upstream River migrations, pinned by backend/go.mod, are coordinated
	// HERE rather than a second deploy or ad hoc HTTP-time migration runner.
	migrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return fmt.Errorf("River migration setup: %w", err)
	}
	if _, err = migrator.Migrate(ctx, rivermigrate.DirectionUp, nil); err != nil {
		return fmt.Errorf("River schema migration: %w", err)
	}
	var installed string
	err = pool.QueryRow(ctx, `SELECT environment FROM financial_realm WHERE singleton`).Scan(&installed)
	if err == nil {
		if installed != env {
			return errors.New("existing financial database realm mismatch")
		}
		log.Printf("PG04 realm=%s previously migrated; immutable realm check passed", env)
		return nil
	}
	if !strings.Contains(err.Error(), "does not exist") {
		// pgx errors differ by driver; use a catalog presence probe instead.
		var exists bool
		e := pool.QueryRow(ctx, `SELECT to_regclass('public.financial_realm') IS NOT NULL`).Scan(&exists)
		if e != nil || exists {
			return errors.New("incomplete financial realm preflight")
		}
	}
	body, err := os.ReadFile(filepath.Clean(filename))
	if err != nil {
		return errors.New("migration SQL file unavailable")
	}
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return errors.New("cannot reserve migration connection")
	}
	defer conn.Release()
	if _, err = conn.Exec(ctx, `SELECT set_config('ekmivo.financial_migration_realm',$1,false)`, env); err != nil {
		return errors.New("cannot bind financial realm")
	}
	_, err = conn.Conn().PgConn().Exec(ctx, string(body)).ReadAll()
	if err != nil {
		return fmt.Errorf("financial domain DDL: %w", err)
	}
	if err = pool.QueryRow(ctx, `SELECT environment FROM financial_realm WHERE singleton`).Scan(&installed); err != nil || installed != env {
		return errors.New("post-migration realm verification failed")
	}
	log.Printf("PG04 financial database realm=%s migrated and verified (no customer rows)", env)
	return nil
}

func migratePG05(ctx context.Context, realm, raw, filename string) error {
	if filename == "" {
		return errors.New("PG05 explicit migration source required")
	}
	pool, err := pgxpool.New(ctx, raw)
	if err != nil {
		return errors.New("PG05 financial realm unavailable")
	}
	defer pool.Close()
	var installed string
	var ready bool
	if err = pool.QueryRow(ctx, `SELECT environment,
  to_regclass('public.pg05_checkout_tokens') IS NOT NULL
 FROM financial_realm WHERE singleton`).Scan(&installed, &ready); err != nil || installed != realm {
		return errors.New("PG05 migration refused wrong or uninitialized financial realm")
	}
	if ready {
		return nil
	}
	body, err := os.ReadFile(filepath.Clean(filename))
	if err != nil {
		return errors.New("PG05 migration source unavailable")
	}
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return errors.New("PG05 migration connection unavailable")
	}
	defer conn.Release()
	if _, err = conn.Conn().PgConn().Exec(ctx, string(body)).ReadAll(); err != nil {
		return fmt.Errorf("PG05 financial checkout migration: %w", err)
	}
	return pool.QueryRow(ctx, "SELECT to_regprocedure('pg05_checkout_view(text)') IS NOT NULL").Scan(&ready)
}

// PG05 0011 is an additive upgrade. Apply even if 0010 was already installed.
func migratePG05Linked(ctx context.Context, realm, raw, filename string) error {
	if filename == "" {
		return errors.New("PG05 linked-source migration path required")
	}
	pool, err := pgxpool.New(ctx, raw)
	if err != nil {
		return err
	}
	defer pool.Close()
	var installed string
	var present bool
	err = pool.QueryRow(ctx, `SELECT environment,
  to_regclass('public.pg05_billing_sources') IS NOT NULL FROM financial_realm WHERE singleton`).
		Scan(&installed, &present)
	if err != nil || installed != realm {
		return errors.New("PG05 linked-source realm mismatch")
	}
	if present {
		return nil
	}
	var base bool
	err = pool.QueryRow(ctx, "SELECT to_regclass('public.pg05_checkout_tokens') IS NOT NULL").Scan(&base)
	if err != nil || !base {
		return errors.New("PG05 0010 prerequisite missing")
	}
	body, err := os.ReadFile(filepath.Clean(filename))
	if err != nil {
		return errors.New("PG05 0011 migration source missing")
	}
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err = conn.Conn().PgConn().Exec(ctx, string(body)).ReadAll(); err != nil {
		return fmt.Errorf("PG05 linked-source migration: %w", err)
	}
	return pool.QueryRow(ctx, "SELECT to_regclass('public.pg05_billing_sources') IS NOT NULL").Scan(&present)
}

// Additive source-integrity upgrade, guarded by its installed detail function.
func migratePG05Integrity(ctx context.Context, realm, raw, filename string) error {
	if filename == "" {
		return errors.New("PG05 integrity migration path required")
	}
	pool, err := pgxpool.New(ctx, raw)
	if err != nil {
		return err
	}
	defer pool.Close()
	var installed string
	var present bool
	err = pool.QueryRow(ctx, `SELECT environment,
 to_regprocedure('pg05_merchant_detail(uuid,text,uuid)') IS NOT NULL FROM financial_realm WHERE singleton`).Scan(&installed, &present)
	if err != nil || installed != realm {
		return errors.New("PG05 integrity realm mismatch")
	}
	if present {
		return nil
	}
	body, err := os.ReadFile(filepath.Clean(filename))
	if err != nil {
		return err
	}
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	_, err = conn.Conn().PgConn().Exec(ctx, string(body)).ReadAll()
	return err
}
func migratePG05Control(ctx context.Context, raw, filename string) error {
	if filename == "" {
		return errors.New("PG05 explicit control migration path required")
	}
	pool, err := pgxpool.New(ctx, raw)
	if err != nil {
		return err
	}
	defer pool.Close()
	var auth, finance, present bool
	err = pool.QueryRow(ctx, `SELECT to_regclass('public.auth_sessions') IS NOT NULL,
 to_regclass('public.financial_realm') IS NOT NULL,
 to_regprocedure('pg05_public_business(uuid,text)') IS NOT NULL`).Scan(&auth, &finance, &present)
	if err != nil || !auth || finance {
		return errors.New("PG05 public business migration requires control DB")
	}
	if present {
		return nil
	}
	body, err := os.ReadFile(filepath.Clean(filename))
	if err != nil {
		return err
	}
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	_, err = conn.Conn().PgConn().Exec(ctx, string(body)).ReadAll()
	return err
}

func main() {
	if os.Getenv("PG04_ALLOW_MIGRATION") != "true" {
		log.Fatal("explicit PG04_ALLOW_MIGRATION=true is mandatory")
	}
	sa, lv := os.Getenv("PG04_SANDBOX_MIGRATION_DATABASE_URL"), os.Getenv("PG04_LIVE_MIGRATION_DATABASE_URL")
	if err := validateIndependent(sa, lv); err != nil {
		log.Fatal(err)
	}
	control := os.Getenv("PG04_CONTROL_MIGRATION_DATABASE_URL")
	controlFile := os.Getenv("PG04_CONTROL_MIGRATION_FILE")
	if controlFile == "" {
		log.Fatal("PG04_CONTROL_MIGRATION_FILE must refer to infra/migrations/0009_pg04_control_projection.sql")
	}
	ct, _, err := inspectDSN(control)
	if err != nil {
		log.Fatal(err)
	}
	a, _, _ := inspectDSN(sa)
	z, _, _ := inspectDSN(lv)
	if ct == a || ct == z {
		log.Fatal("control and finance databases must never be the same")
	}
	file := os.Getenv("PG04_FINANCIAL_MIGRATION_FILE")
	if file == "" {
		log.Fatal("PG04_FINANCIAL_MIGRATION_FILE must explicitly point to infra/migrations/0008_pg04_financial_core.sql")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	if err := migrateControl(ctx, control, controlFile); err != nil {
		log.Fatal(err)
	}
	for _, target := range []realmDSN{{"sandbox", sa}, {"live", lv}} {
		if err := migrateRealm(ctx, target.environment, target.raw, file); err != nil {
			log.Fatalf("realm %s migration blocked: %v", target.environment, err)
		}
	}
	if os.Getenv("PG05_ALLOW_MIGRATION") == "true" {
		if err := migratePG05Control(ctx, control, os.Getenv("PG05_CONTROL_MIGRATION_FILE")); err != nil {
			log.Fatal(err)
		}
		source := os.Getenv("PG05_FINANCIAL_MIGRATION_FILE")
		if source == "" {
			log.Fatal("PG05_FINANCIAL_MIGRATION_FILE is required")
		}
		for _, target := range []realmDSN{{"sandbox", sa}, {"live", lv}} {
			if err := migratePG05(ctx, target.environment, target.raw, source); err != nil {
				log.Fatalf("PG05 realm %s migration blocked: %v", target.environment, err)
			}
		}
		linked := os.Getenv("PG05_LINKED_MIGRATION_FILE")
		if linked == "" {
			log.Fatal("PG05_LINKED_MIGRATION_FILE must point to 0011_pg05_linked_sources.sql")
		}
		for _, target := range []realmDSN{{"sandbox", sa}, {"live", lv}} {
			if err := migratePG05Linked(ctx, target.environment, target.raw, linked); err != nil {
				log.Fatalf("PG05 linked realm %s migration blocked: %v", target.environment, err)
			}
		}
		integrity := os.Getenv("PG05_INTEGRITY_MIGRATION_FILE")
		for _, target := range []realmDSN{{"sandbox", sa}, {"live", lv}} {
			if err := migratePG05Integrity(ctx, target.environment, target.raw, integrity); err != nil {
				log.Fatalf("PG05 integrity realm %s migration blocked: %v", target.environment, err)
			}
		}

	}
	if os.Getenv("PG06_ALLOW_MIGRATION") == "true" {
		for _, target := range []realmDSN{{"sandbox", sa}, {"live", lv}} {
			if err := migrateReceiptPipeline(ctx, target.environment, target.raw, os.Getenv("PG06_PIPELINE_MIGRATION_FILE")); err != nil {
				log.Fatalf("receipt pipeline migration blocked in %s: %v", target.environment, err)
			}
		}
	}
	if os.Getenv("PG06_PHYSICAL_PHONES_ALLOW_MIGRATION") == "true" {
		for _, target := range []realmDSN{{"sandbox", sa}, {"live", lv}} {
			if err := migratePhysicalPhones(ctx,target.environment,target.raw,os.Getenv("PG06_PHYSICAL_PHONES_MIGRATION_FILE"));err!=nil{
				log.Fatalf("PG06 physical phone migration blocked in %s: %v",target.environment,err)
			}
		}
	}
	if os.Getenv("PG06_FORWARDER_ALLOW_MIGRATION") == "true" {
		for _, target := range []realmDSN{{"sandbox", sa}, {"live", lv}} {
			if err := migratePhoneForwarder(ctx,target.environment,target.raw,os.Getenv("PG06_FORWARDER_MIGRATION_FILE"));err!=nil {
				log.Fatalf("PG06 forwarder migration blocked in %s: %v",target.environment,err)
			}
		}
	}
	if os.Getenv("PG08_NOTICE_ALLOW_MIGRATION") == "true" {
		for _, target := range []realmDSN{{"sandbox", sa}, {"live", lv}} {
			if err := migrateCustomerNotice(ctx, target.environment, target.raw, os.Getenv("PG08_NOTICE_MIGRATION_FILE")); err != nil {
				log.Fatalf("notice migration blocked in %s: %v", target.environment, err)
			}
		}
	}
	if os.Getenv("PG10_ALLOW_MIGRATION") == "true" {
		dir := os.Getenv("PG10_MIGRATION_DIRECTORY")
		if dir == "" {
			log.Fatal("explicit PG10_MIGRATION_DIRECTORY required")
		}
		for _, target := range []realmDSN{{"sandbox", sa}, {"live", lv}, {"control", control}} {
			if err := migratePaymentExtensions(ctx, target.raw, target.environment, dir); err != nil {
				log.Fatalf("payment extensions blocked in %s: %v", target.environment, err)
			}
		}
	}
}
