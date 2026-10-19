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
 control:=os.Getenv("PG04_CONTROL_MIGRATION_DATABASE_URL")
 sandbox,live:=os.Getenv("PG04_SANDBOX_MIGRATION_DATABASE_URL"),os.Getenv("PG04_LIVE_MIGRATION_DATABASE_URL")
 if err:=validateIndependent(sandbox,live);err!=nil{return err}
 ct,_,err:=inspectDSN(control);if err!=nil{return err}
 sa,_,_:=inspectDSN(sandbox);lv,_,_:=inspectDSN(live)
 if ct==sa||ct==lv{return errors.New("control and finance must be separate")}
 targets:=[]struct{dsn,file,realm string}{
  {control,os.Getenv("MOBILE_PREVIEW_CONTROL_MIGRATION_FILE"),""},
  {sandbox,os.Getenv("MOBILE_PREVIEW_FINANCIAL_MIGRATION_FILE"),"sandbox"},
  {live,os.Getenv("MOBILE_PREVIEW_FINANCIAL_MIGRATION_FILE"),"live"},
 }
 for _,t:=range targets {
  want:="0115_mobile_pairing_preview_financial.sql";if t.realm==""{want="0114_mobile_workspace_preview_control.sql"}
  if filepath.Base(t.file)!=want{return errors.New("explicit mobile preview migration file required")}
  pool,e:=pgxpool.New(ctx,t.dsn);if e!=nil{return e}
  e=func()error{
   defer pool.Close()
   var ok bool
   if t.realm=="" {
    e=pool.QueryRow(ctx,`SELECT to_regclass('public.auth_sessions') IS NOT NULL AND to_regclass('public.financial_realm') IS NULL AND EXISTS(SELECT 1 FROM pg_class WHERE oid='public.workspaces'::regclass AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))`).Scan(&ok)
   }else{
    e=pool.QueryRow(ctx,`SELECT environment=$1 AND to_regprocedure('pg06_phone_claim(text,bytea)') IS NOT NULL AND EXISTS(SELECT 1 FROM pg_class WHERE oid='public.financial_realm'::regclass AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) FROM financial_realm WHERE singleton`,t.realm).Scan(&ok)
   }
   if e!=nil||!ok{return errors.New("mobile preview requires matching database and migration owner")}
   script,e:=os.ReadFile(filepath.Clean(t.file));if e!=nil{return e}
   conn,e:=pool.Acquire(ctx);if e!=nil{return e};defer conn.Release()
   _,e=conn.Conn().PgConn().Exec(ctx,string(script)).ReadAll();return e
  }()
  if e!=nil{return e}
 }
 return nil
}
