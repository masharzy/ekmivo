package main

import (
 "context"
 "errors"
 "os"
 "path/filepath"
 "github.com/jackc/pgx/v5/pgxpool"
)

// Run 0051 explicitly after the financial PG06/PG10/PG11 prerequisites.
// Never on API startup and never in the identity/control database.
func migrateOfflineSMSRefund(ctx context.Context, realm, dsn, filename string) error {
 if filepath.Base(filename)!="0051_pg06_late_sms_refund.sql" {
  return errors.New("explicit 0051 financial migration file required")
 }
 pool,err:=pgxpool.New(ctx,dsn);if err!=nil{return err};defer pool.Close()
 conn,err:=pool.Acquire(ctx);if err!=nil{return err};defer conn.Release()
 var actual string
 var prior,already,owner bool
 err=conn.QueryRow(ctx,`SELECT environment,
  to_regclass('public.pg06_phone_forwarded') IS NOT NULL
   AND to_regclass('public.pg11_refunds') IS NOT NULL
   AND to_regprocedure('public.pg10_public_payment_sources(uuid,text)') IS NOT NULL,
  to_regprocedure('public.pg06_phone_candidate(uuid,text,text,bigint,timestamptz,text)') IS NOT NULL,
  (SELECT relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
   FROM pg_class WHERE oid='public.financial_realm'::regclass)
  FROM financial_realm WHERE singleton`).Scan(&actual,&prior,&already,&owner)
 if err!=nil||actual!=realm||!prior||!owner{
  return errors.New("0051 requires isolated owner financial realm with PG06/PG10/PG11 migrations")
 }
 if already{return nil}
 body,err:=os.ReadFile(filepath.Clean(filename));if err!=nil{return err}
 _,err=conn.Conn().PgConn().Exec(ctx,string(body)).ReadAll()
 return err
}
