package main

import (
 "context"
 "errors"
 "os"
 "path/filepath"
 "github.com/jackc/pgx/v5/pgxpool"
)

// Explicit financial-realm-only 0048 upgrade, never a server-startup migration.
func migrateForwarderCheckout(ctx context.Context, realm, dsn, filename string) error {
 if filepath.Base(filename)!="0048_pg10_phone_forwarder_checkout.sql" {
  return errors.New("explicit PG10 forwarder checkout 0048 file required")
 }
 pool,err:=pgxpool.New(ctx,dsn)
 if err!=nil{return err}
 defer pool.Close()
 conn,err:=pool.Acquire(ctx)
 if err!=nil{return err}
 defer conn.Release()
 var actual string
 var preflight,owner,already bool
 err=conn.QueryRow(ctx,`SELECT environment,
  to_regclass('public.pg06_phone_forwarded') IS NOT NULL
   AND to_regprocedure('public.pg10_checkout_view(text)') IS NOT NULL
   AND to_regprocedure('public.pg10_lock_route(text,text,text,text)') IS NOT NULL,
  (SELECT relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
   FROM pg_class WHERE oid='public.financial_realm'::regclass),
  position('20 minutes' in pg_get_functiondef('public.pg10_checkout_view(text)'::regprocedure))>0
  FROM financial_realm WHERE singleton`).Scan(&actual,&preflight,&owner,&already)
 if err!=nil||actual!=realm||!preflight||!owner {
  return errors.New("0048 requires correctly scoped migration-owner financial database and installed 0047/PG10")
 }
 if already{return nil}
 script,err:=os.ReadFile(filepath.Clean(filename))
 if err!=nil{return err}
 _,err=conn.Conn().PgConn().Exec(ctx,string(script)).ReadAll()
 return err
}
