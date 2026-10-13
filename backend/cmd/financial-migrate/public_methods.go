package main

import (
 "context"
 "errors"
 "os"
 "path/filepath"
 "github.com/jackc/pgx/v5/pgxpool"
)

// Run via financial-migrate only. Idempotent; never mutate issued payment state.
func migratePublicMethods(ctx context.Context, realm,dsn,path string) error{
 if filepath.Base(path)!="0050_pg10_public_methods.sql"{return errors.New("explicit PG10 0050 public methods file required")}
 pool,err:=pgxpool.New(ctx,dsn);if err!=nil{return err};defer pool.Close()
 conn,err:=pool.Acquire(ctx);if err!=nil{return err};defer conn.Release()
 var actual string;var prerequisites,owner,installed bool
 err=conn.QueryRow(ctx,`SELECT environment,
   to_regclass('public.pg06_phone_forwarded') IS NOT NULL AND
   to_regprocedure('public.pg10_public(text)') IS NOT NULL,
   (SELECT relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
      FROM pg_class WHERE oid='public.financial_realm'::regclass),
   to_regprocedure('public.pg10_public_payment_sources(uuid,text)') IS NOT NULL
   FROM financial_realm WHERE singleton`).Scan(&actual,&prerequisites,&owner,&installed)
 if err!=nil||actual!=realm||!prerequisites||!owner{
  return errors.New("0050 requires correct financial realm, migration owner, PG10 and PG06 forwarder")
 }
 if installed{return nil}
 content,err:=os.ReadFile(filepath.Clean(path));if err!=nil{return err}
 _,err=conn.Conn().PgConn().Exec(ctx,string(content)).ReadAll()
 return err
}
