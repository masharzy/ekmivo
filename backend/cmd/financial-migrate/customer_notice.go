package main

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/briofold/backend/internal/receiptnotice"
	"os"
	"path/filepath"
)

func migrateCustomerNotice(ctx context.Context, realm, dsn, filename string) error {
	if filepath.Base(filename) != "0015_pg08_customer_notice.sql" {
		return errors.New("explicit customer notice migration path required")
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return err
	}
	defer pool.Close()
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	var actual string
	var installed, owner bool
	err = conn.QueryRow(ctx, `SELECT f.environment,to_regprocedure('pg08_notice_due()') IS NOT NULL,
 c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
 FROM financial_realm f JOIN pg_class c ON c.oid='public.financial_realm'::regclass WHERE f.singleton`).Scan(&actual, &installed, &owner)
	if err != nil || actual != realm || !owner {
		return errors.New("notice migration requires isolated realm migration owner")
	}
	if installed {
		return receiptnotice.CheckSchema(ctx, pool)
	}
	body, err := os.ReadFile(filepath.Clean(filename))
	if err != nil {
		return err
	}
	_, err = conn.Conn().PgConn().Exec(ctx, string(body)).ReadAll()
	return err
}
