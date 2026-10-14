package main

import (
 "context"
 "errors"
 "fmt"
 "os"
 "path/filepath"

 "github.com/jackc/pgx/v5/pgxpool"
)

// 0061 installs a scoped, read-only financial function in BOTH isolated realms.
// Explicit operator opt-in only; never at API startup.
func migrateTransactionLookup(ctx context.Context, realm, dsn, filename string) error {
 if filepath.Base(filename)!="0061_transaction_lookup.sql" {
  return errors.New("0061 explicit transaction lookup SQL file required")
 }
 pool,err:=pgxpool.New(ctx,dsn)
 if err!=nil{return err}
 defer pool.Close()
 var installedRealm string
 var owner,installed bool
 err=pool.QueryRow(ctx,`SELECT environment,
  (SELECT relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
   FROM pg_class WHERE oid='financial_realm'::regclass),
  to_regprocedure('pg61_transaction_lookup(uuid,text,uuid,text,text,bigint)') IS NOT NULL
  FROM financial_realm WHERE singleton`).Scan(&installedRealm,&owner,&installed)
 if err!=nil || installedRealm!=realm || !owner{
  return errors.New("0061 migration requires correct financial realm migration owner")
 }
 if installed { return nil }
 content,err:=os.ReadFile(filepath.Clean(filename))
 if err!=nil{return err}
 conn,err:=pool.Acquire(ctx)
 if err!=nil{return err}
 defer conn.Release()
 if _,err=conn.Conn().PgConn().Exec(ctx,string(content)).ReadAll();err!=nil {
  return fmt.Errorf("0061 transaction lookup migration failed: %w",err)
 }
 var ready bool
 if err=pool.QueryRow(ctx,"SELECT to_regprocedure('pg61_transaction_lookup(uuid,text,uuid,text,text,bigint)') IS NOT NULL").Scan(&ready);err!=nil{return err}
 if !ready {return errors.New("0061 function not installed")}
 return nil
}
