package main

import (
 "context"
 "errors"
 "os"
 "path/filepath"
 "github.com/jackc/pgx/v5/pgxpool"
)

// 0049 is an explicit, repeat-safe financial-realm-only operation.
// Never run from the HTTP server. Preserve already-issued payment intents.
func migratePhysicalIntent(ctx context.Context,realm,dsn,path string) error {
 if filepath.Base(path)!="0049_pg10_physical_phone_intent.sql" {
  return errors.New("0049 requires explicit PG10 physical-phone intent migration file")
 }
 pool,err:=pgxpool.New(ctx,dsn)
 if err!=nil{return err}
 defer pool.Close()
 conn,err:=pool.Acquire(ctx)
 if err!=nil{return err}
 defer conn.Release()
 var actual string
 var required,owner,already bool
 err=conn.QueryRow(ctx,`SELECT environment,
  to_regclass('public.pg06_phone_forwarded') IS NOT NULL
  AND to_regprocedure('public.pg10_intent(uuid,text,text,bigint,integer,text,text,text)') IS NOT NULL
  AND position('20 minutes' in pg_get_functiondef('public.pg10_checkout_view(text)'::regprocedure))>0,
  (SELECT relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
   FROM pg_class WHERE oid='public.financial_realm'::regclass),
  position('20 minutes' in pg_get_functiondef('public.pg10_intent(uuid,text,text,bigint,integer,text,text,text)'::regprocedure))>0
  FROM financial_realm WHERE singleton`).Scan(&actual,&required,&owner,&already)
 if err!=nil||actual!=realm||!required||!owner{
  return errors.New("0049 requires financial migration-owner and installed 0047/0048")
 }
 if already{return nil}
 contents,err:=os.ReadFile(filepath.Clean(path))
 if err!=nil{return err}
 _,err=conn.Conn().PgConn().Exec(ctx,string(contents)).ReadAll()
 return err
}
