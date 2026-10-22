package main

import (
 "context"
 "errors"
 "os"
 "path/filepath"

 "github.com/jackc/pgx/v5/pgxpool"
)

// 0056 is additive and scoped exclusively to separate financial realms.
// It is deliberately operator-gated, not run at API startup or by the worker.
// Replays are safe: the two SECURITY DEFINER functions have stable signatures.
func migratePhoneIncomingReports(ctx context.Context, realm, dsn, filename string) error {
 if filepath.Base(filename)!="0056_phone_incoming_and_late_refund_reports.sql" {
  return errors.New("explicit 0056 financial migration file required")
 }
 pool,err:=pgxpool.New(ctx,dsn)
 if err!=nil{return err}
 defer pool.Close()
 conn,err:=pool.Acquire(ctx)
 if err!=nil{return err}
 defer conn.Release()
 var actual string
 var installed,prerequisites,owner bool
 err=conn.QueryRow(ctx,`SELECT environment,
 to_regprocedure('public.pg56_incoming_read(uuid,text,uuid,uuid,text,uuid,text,timestamptz,timestamptz,text)') IS NOT NULL
 AND to_regprocedure('public.pg56_refund_summary(uuid,text,timestamptz,timestamptz,uuid)') IS NOT NULL,
 to_regclass('public.pg06_phone_forwarded') IS NOT NULL
 AND to_regclass('public.pg06_transport') IS NOT NULL
 AND to_regclass('public.pg07_receipt_results') IS NOT NULL
 AND to_regclass('public.pg11_refunds') IS NOT NULL
 AND (SELECT count(*)=2 FROM pg_attribute
   WHERE attrelid=to_regclass('public.pg11_refunds')
   AND attname IN ('source_intent_id','source_observation_id')
   AND NOT attisdropped)
 AND to_regprocedure('public.pg13_reports(uuid,text,timestamptz,timestamptz,uuid)') IS NOT NULL,
 (SELECT relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
  FROM pg_class WHERE oid='public.financial_realm'::regclass)
 FROM financial_realm WHERE singleton`).Scan(&actual,&installed,&prerequisites,&owner)
 if err!=nil||actual!=realm||!prerequisites||!owner {
  return errors.New("0056 requires isolated owner financial realm with PG06/PG07/PG11/PG13 and the 0051 late-refund columns")
 }
 if installed{return nil}
 body,err:=os.ReadFile(filepath.Clean(filename))
 if err!=nil{return err}
 // PostgreSQL transaction wrappers in the reviewed file ensure atomic updates.
 _,err=conn.Conn().PgConn().Exec(ctx,string(body)).ReadAll()
 if err!=nil{return err}
 var applied bool
 err=conn.QueryRow(ctx,`SELECT
  to_regprocedure('public.pg56_incoming_read(uuid,text,uuid,uuid,text,uuid,text,timestamptz,timestamptz,text)') IS NOT NULL
  AND to_regprocedure('public.pg56_refund_summary(uuid,text,timestamptz,timestamptz,uuid)') IS NOT NULL`).Scan(&applied)
 if err!=nil{return err}
 if !applied{return errors.New("0056 post-migration functions unavailable")}
 return nil
}
