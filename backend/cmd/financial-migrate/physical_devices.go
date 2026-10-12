package main

import (
 "context"
 "errors"
 "os"
 "path/filepath"

 "github.com/jackc/pgx/v5/pgxpool"
)

// One guarded additive 0045 upgrade in the existing financial migration
// coordinator. Never run from API startup. The coordinator's migration-role
// credentials and realm checks are required; user data is never reset.
func migratePhysicalPhones(ctx context.Context, realm, dsn, filename string) error {
 if filepath.Base(filename)!="0045_pg06_physical_phone_multi_account.sql" {
  return errors.New("explicit 0045 physical-device migration file required")
 }
 pool,err:=pgxpool.New(ctx,dsn)
 if err!=nil{return err}
 defer pool.Close()
 conn,err:=pool.Acquire(ctx)
 if err!=nil{return err}
 defer conn.Release()
 var actual string
 var installed,prior,owner bool
 err=conn.QueryRow(ctx,`SELECT environment,
  to_regclass('public.pg06_phones') IS NOT NULL,
  to_regprocedure('pg06_claim(text,bytea)') IS NOT NULL,
  (SELECT relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
   FROM pg_class WHERE oid='public.financial_realm'::regclass)
  FROM financial_realm WHERE singleton`).Scan(&actual,&installed,&prior,&owner)
 if err!=nil||actual!=realm||!prior||!owner{
  return errors.New("physical-device migration requires matching isolated realm, receipt pipeline and migration owner")
 }
 if installed{return nil}
 sql,err:=os.ReadFile(filepath.Clean(filename))
 if err!=nil{return err}
 _,err=conn.Conn().PgConn().Exec(ctx,string(sql)).ReadAll()
 return err
}
