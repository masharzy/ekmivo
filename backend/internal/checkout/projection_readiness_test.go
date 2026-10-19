package checkout

import("context";"errors";"testing";"time";"net/http/httptest";"encoding/json";"github.com/jackc/pgx/v5/pgconn")

func TestMissingProjectionRepairsOnlyOnce(t *testing.T){
 calls,repairs:=0,0
 err:=withProjectionRepair(context.Background(),"workspace","live",func()error{calls++;if calls==1{return &pgconn.PgError{Code:"P0401"}};return nil},func(ctx context.Context,ws,realm string)error{repairs++;if ws!="workspace"||realm!="live"{t.Fatal("scope changed")};d,ok:=ctx.Deadline();if !ok||time.Until(d)>8*time.Second{t.Fatal("repair must be bounded")};return nil})
 if err!=nil||calls!=2||repairs!=1{t.Fatalf("repair failed calls=%d repairs=%d err=%v",calls,repairs,err)}
}
func TestAuthorizationAndPlanErrorsNeverTriggerProjectionRepair(t *testing.T){
 for _,code:=range []string{"42501","P6802","P6807","23505","08006"}{
  repairs,calls:=0,0;original:=&pgconn.PgError{Code:code}
  err:=withProjectionRepair(context.Background(),"workspace","live",func()error{calls++;return original},func(context.Context,string,string)error{repairs++;return nil})
  if err!=original||calls!=1||repairs!=0{t.Fatalf("non-readiness error retried: %s",code)}
 }
}
func TestFailedRepairNeverRerunsAndRepeatedMissingDoesNotLoop(t *testing.T){
 calls:=0
 run:=func()error{calls++;return &pgconn.PgError{Code:"P0401"}}
 err:=withProjectionRepair(context.Background(),"workspace","live",run,func(context.Context,string,string)error{return errors.New("offline")})
 if calls!=1||err==nil{t.Fatal("failed repair reran operation")}
 calls=0;err=withProjectionRepair(context.Background(),"workspace","live",run,func(context.Context,string,string)error{return nil})
 if calls!=2||err==nil{t.Fatal("unbounded repair or hidden error")}
}
func TestInitializingIsRetryableNotForbidden(t *testing.T){
 w:=httptest.NewRecorder();mapped(w,&pgconn.PgError{Code:"P0401"})
 var body struct{Error struct{Code string `json:"code"`}}
 if json.Unmarshal(w.Body.Bytes(),&body)!=nil||w.Code!=503||w.Header().Get("Retry-After")!="1"||body.Error.Code!="WORKSPACE_INITIALIZING"{t.Fatal("initialization mislabeled as permission denial")}
}
