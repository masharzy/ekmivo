package financial

import(
 "errors"
 "testing"
)
func TestFinanceConnectionSeparation(t *testing.T){
 good:=ValidateFinanceSeparation(
  "postgresql://control-user:opaque@localhost:5432/ekmivo_control",
  "postgresql://sandbox-user:opaque@localhost:5432/ekmivo_sandbox",
  "postgresql://live-user:opaque@localhost:5432/ekmivo_live")
 if good!=nil{t.Fatalf("separate DB and credential identities rejected: %v",good)}
 tests:=[][3]string{
  {"postgresql://same@localhost/control","postgresql://same@localhost/sandbox","postgresql://other@localhost/live"},
  {"postgresql://control@localhost/shared","postgresql://sandbox@localhost/shared","postgresql://live@localhost/live"},
  {"postgresql://control@localhost/control","postgresql://sandbox@localhost/live","postgresql://live@localhost/live"},
  {"","postgresql://sandbox@localhost/sandbox","postgresql://live@localhost/live"},
 }
 for _,c:=range tests{
  if !errors.Is(ValidateFinanceSeparation(c[0],c[1],c[2]),ErrInvalid){
   t.Fatalf("unsafe DB separation accepted: %q %q %q",c[0],c[1],c[2])
  }
 }
}
func TestVersionedProjectionUnavailableFailsClosed(t *testing.T){
 p:=ProjectionCoordinator{}
 if _,_,err:=p.Sync(t.Context(),"12345678-1234-4234-8234-123456789012","sandbox");!errors.Is(err,ErrUnavailable){
  t.Fatalf("absent projection connections allowed: %v",err)
 }
 if _,err:=p.SyncAll(t.Context());!errors.Is(err,ErrUnavailable){t.Fatal("unavailable projector ran")}
}
