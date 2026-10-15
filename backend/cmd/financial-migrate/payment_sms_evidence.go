package main

import (
 "context"
 "errors"
 "os"
 "path/filepath"

 "github.com/jackc/pgx/v5/pgxpool"
)

// 0066 is a bounded, read-only evidence lookup for owner/admin dashboard
// decryption. Apply explicitly in both isolated finance databases, never on
// server startup. The query never returns decrypted numbers or SMS messages.
func migratePaymentSMSEvidence(ctx context.Context, realm, dsn, filename string) error {
 if filepath.Base(filename)!="0066_payment_sms_evidence_read.sql" {
  return errors.New("explicit 0066 SMS evidence migration file required")
 }
 pool,err:=pgxpool.New(ctx,dsn)
 if err!=nil{return err}
 defer pool.Close()
 var actual, dbname, actor string
 var owner, schema, installed bool
 err=pool.QueryRow(ctx,`SELECT f.environment,current_database(),current_user,
 (SELECT relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
 FROM pg_class WHERE oid='public.financial_realm'::regclass),
 to_regclass('public.pg06_phone_forwarded') IS NOT NULL
 AND to_regclass('public.pg06_transport') IS NOT NULL
 AND to_regclass('public.financial_inbound_events') IS NOT NULL
 AND to_regprocedure('public.pg06_scope(uuid,text)') IS NOT NULL,
 to_regprocedure('public.pg66_payment_sms_evidence(uuid,text,text,jsonb)') IS NOT NULL AND to_regprocedure('public.pg66_customer_payer_evidence(uuid,text,jsonb)') IS NOT NULL
 FROM financial_realm f WHERE f.singleton`).Scan(&actual,&dbname,&actor,&owner,&schema,&installed)
 if err!=nil||actual!=realm||dbname=="ekmivo"||!owner||!schema||actor=="ekmivo_financial_runtime"{
  return errors.New("0066 requires existing isolated owner financial realm")
 }
 if installed{return nil}
 body,err:=os.ReadFile(filepath.Clean(filename))
 if err!=nil{return err}
 conn,err:=pool.Acquire(ctx)
 if err!=nil{return err}
 defer conn.Release()
 if _,err=conn.Conn().PgConn().Exec(ctx,string(body)).ReadAll();err!=nil{return err}
 var ready bool
 if err=pool.QueryRow(ctx,`SELECT to_regprocedure('public.pg66_payment_sms_evidence(uuid,text,text,jsonb)') IS NOT NULL AND to_regprocedure('public.pg66_customer_payer_evidence(uuid,text,jsonb)') IS NOT NULL`).Scan(&ready);err!=nil{return err}
 if !ready{return errors.New("0066 SQL function not installed")}
 return nil
}
