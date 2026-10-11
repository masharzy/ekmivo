package main
import(
 "context"
 "errors"
 "testing"
 "github.com/masharzy/ekmivo/backend/internal/financial"
 "github.com/riverqueue/river"
)
func TestPG04WorkerRoleIsolation(t *testing.T){
 if err:=validateWorkerRole("ekmivo_financial_worker_sandbox","sandbox");err!=nil{t.Fatal(err)}
 for _,tc:=range []struct{role,realm string}{
  {"ekmivo_financial_worker_live","sandbox"},
  {"ekmivo_financial_runtime_sandbox","sandbox"},
  {"ekmivo_financial_worker_sandbox","live"},
  {"ekmivo_financial_worker_sandbox",""},
 }{
  if err:=validateWorkerRole(tc.role,tc.realm);err==nil{t.Fatalf("accepted cross-role: %+v",tc)}
 }
}
func TestPG04WorkerRejectsRealmMismatchBeforeDatabaseUse(t *testing.T){
 w:=&AuditWorker{Realm:"sandbox"}
 e:=w.Work(context.Background(),&river.Job[financial.AuditArgs]{
  Args:financial.AuditArgs{Environment:"live",OutboxID:"00000000-0000-4000-8000-000000000001"},
 })
 if !errors.Is(e,nil)&&e==nil{t.Fatal("should reject cross-realm")}
 if e==nil{t.Fatal("cross-realm worker job accepted")}
}
