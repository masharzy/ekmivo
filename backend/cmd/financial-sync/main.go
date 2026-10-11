// Command financial-sync continuously reconciles minimal authoritative
// workspace projection to physically separate sandbox/live financial databases.
package main

import(
 "context"
 "log"
 "os"
 "os/signal"
 "syscall"
 "time"
 "github.com/jackc/pgx/v5/pgxpool"
 "github.com/masharzy/ekmivo/backend/internal/financial"
)
func main(){
 control:=os.Getenv("PG04_PROJECTION_CONTROL_URL")
 sa:=os.Getenv("PG04_PROVISIONER_SANDBOX_URL")
 lv:=os.Getenv("PG04_PROVISIONER_LIVE_URL")
 if err:=financial.ValidateFinanceSeparation(control,sa,lv);err!=nil{
  log.Fatal("PG04 projection requires three distinct DBs and DB credentials")
 }
 ctx,cancel:=signal.NotifyContext(context.Background(),os.Interrupt,syscall.SIGTERM)
 defer cancel()
 open:=func(raw string)*pgxpool.Pool{
  pool,err:=pgxpool.New(ctx,raw)
  if err!=nil{log.Fatal("projection DB connection unavailable")}
  return pool
 }
 c,s,l:=open(control),open(sa),open(lv)
 defer c.Close();defer s.Close();defer l.Close()
 co:=financial.ProjectionCoordinator{Control:c,Sandbox:s,Live:l}
 workspace:=os.Getenv("PG04_WORKSPACE_ID")
 if workspace!=""{
  check,done:=context.WithTimeout(ctx,20*time.Second)
  defer done()
  ver,enabled,err:=co.Sync(check,workspace,os.Getenv("PG04_ENVIRONMENT"))
  if err!=nil{log.Fatal("workspace projection did not reconcile: ",err)}
  log.Printf("PG04 projected one workspace: version=%d active=%t (no PII)",ver,enabled)
  return
 }
 if os.Getenv("PG04_PROJECTION_WATCH")!="true"{
  log.Fatal("PG04_PROJECTION_WATCH=true required for continuous reconciliation")
 }
 ticker:=time.NewTicker(20*time.Second)
 defer ticker.Stop()
 log.Print("PG04 versioned financial projection reconciler active")
 for{
  iteration,done:=context.WithTimeout(ctx,15*time.Second)
  n,err:=co.SyncAll(iteration)
  done()
  if err!=nil&&ctx.Err()==nil{log.Printf("PG04 projection retry: %v",err)}
  if err==nil{log.Printf("PG04 projection reconciled %d tenant/realm records",n)}
  select{case <-ctx.Done():return;case <-ticker.C:}
 }
}
