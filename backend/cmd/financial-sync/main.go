// Command financial-sync applies a versioned non-PII control-plane
// projection to exactly one separately credentialed finance realm.
package main

import(
 "context"
 "log"
 "os"
 "time"
 "github.com/jackc/pgx/v5/pgxpool"
 "github.com/masharzy/ekmivo/backend/internal/financial"
)
func main(){
 control:=os.Getenv("PG04_PROJECTION_CONTROL_URL")
 sa:=os.Getenv("PG04_PROVISIONER_SANDBOX_URL")
 lv:=os.Getenv("PG04_PROVISIONER_LIVE_URL")
 if err:=financial.ValidateFinanceSeparation(control,sa,lv);err!=nil{
  log.Fatal("PG04 projection requires three physically separate DBs and DB role identities")
 }
 ctx,cancel:=context.WithTimeout(context.Background(),20*time.Second)
 defer cancel()
 open:=func(raw string)*pgxpool.Pool{
  pool,err:=pgxpool.New(ctx,raw)
  if err!=nil{log.Fatal("projection DB unavailable")}
  return pool
 }
 c,s,l:=open(control),open(sa),open(lv)
 defer c.Close();defer s.Close();defer l.Close()
 co:=financial.ProjectionCoordinator{Control:c,Sandbox:s,Live:l}
 ver,enabled,err:=co.Sync(ctx,os.Getenv("PG04_WORKSPACE_ID"),os.Getenv("PG04_ENVIRONMENT"))
 if err!=nil{log.Fatal("projected workspace not applied: ",err)}
 log.Printf("PG04 workspace projection version=%d active=%t (no PII)",ver,enabled)
}
