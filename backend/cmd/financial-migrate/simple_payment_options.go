package main

import (
 "context"
 "errors"
 "fmt"
 "os"
 "path/filepath"
 "github.com/jackc/pgx/v5/pgxpool"
)

// 0062 installs additive payment intent options in separately authorized
// sandbox/live financial databases. Never run this at API startup.
func migrateSimplePaymentOptions(ctx context.Context, realm, dsn, filename string) error {
 if filepath.Base(filename)!="0062_simple_payment_options.sql" {
  return errors.New("explicit 0062 simple payment SQL file required")
 }
 pool,err:=pgxpool.New(ctx,dsn)
 if err!=nil{return err}
 defer pool.Close()
 var installedRealm,dbname,user string
 var realmOwner,authPresent,corePresent,eventsPresent,endpointsPresent,alreadyInstalled bool
 err=pool.QueryRow(ctx,`SELECT f.environment,current_database(),current_user,
  (SELECT relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
   FROM pg_class WHERE oid='public.financial_realm'::regclass),
  to_regclass('public.auth_sessions') IS NOT NULL,
  to_regclass('public.payment_intents') IS NOT NULL,
  to_regclass('public.pg07_events') IS NOT NULL,
  to_regclass('public.pg08_endpoints') IS NOT NULL,
  to_regprocedure('pg62_store_intent_options(uuid,text,uuid,text,text,text,text,text,text,jsonb)') IS NOT NULL
  FROM financial_realm f WHERE f.singleton`).
  Scan(&installedRealm,&dbname,&user,&realmOwner,&authPresent,&corePresent,&eventsPresent,&endpointsPresent,&alreadyInstalled)
 if err!=nil||installedRealm!=realm||!realmOwner||authPresent||
 !corePresent||!eventsPresent||!endpointsPresent||dbname=="ekmivo"||
 user=="ekmivo_financial_runtime" {
  return errors.New("0062 refused: incorrect realm, migration owner or prerequisite schema")
 }
 if alreadyInstalled {
  // A partially deployed schema is not accepted as migrated.
  var tableReady,redirectsReady,merchantReady,triggerReady bool
  err=pool.QueryRow(ctx,`SELECT to_regclass('public.pg62_intent_options') IS NOT NULL,
   to_regprocedure('pg62_checkout_redirects(uuid,text,uuid)') IS NOT NULL,
   to_regprocedure('pg62_merchant_options(uuid,text,uuid)') IS NOT NULL,
   EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='pg62_delivery_endpoint_selection' AND NOT tgisinternal)`).
   Scan(&tableReady,&redirectsReady,&merchantReady,&triggerReady)
  if err!=nil||!tableReady||!redirectsReady||!merchantReady||!triggerReady {
   return errors.New("0062 incomplete previous installation; manual investigation required")
  }
  return nil
 }
 body,err:=os.ReadFile(filepath.Clean(filename))
 if err!=nil{return err}
 conn,err:=pool.Acquire(ctx)
 if err!=nil{return err}
 defer conn.Release()
 if _,err=conn.Conn().PgConn().Exec(ctx,string(body)).ReadAll();err!=nil {
  return fmt.Errorf("0062 additive financial migration failed: %w",err)
 }
 var ready bool
 if err=pool.QueryRow(ctx,`SELECT
  to_regclass('public.pg62_intent_options') IS NOT NULL AND
  to_regprocedure('pg62_store_intent_options(uuid,text,uuid,text,text,text,text,text,text,jsonb)') IS NOT NULL AND
  to_regprocedure('pg62_checkout_redirects(uuid,text,uuid)') IS NOT NULL AND
  to_regprocedure('pg62_merchant_options(uuid,text,uuid)') IS NOT NULL AND
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='pg62_delivery_endpoint_selection' AND NOT tgisinternal)`).Scan(&ready);err!=nil{
  return err
 }
 if !ready{return errors.New("0062 objects missing after SQL execution")}
 return nil
}
