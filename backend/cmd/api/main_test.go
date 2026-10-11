package main

import (
 "encoding/json"
 "net/http"
 "net/http/httptest"
 "testing"
)

func TestHealthIsLiveButFinancialReadinessIsNot(t *testing.T){
 handler:=newHandler()
 health:=httptest.NewRecorder()
 handler.ServeHTTP(health,httptest.NewRequest(http.MethodGet,"/healthz",nil))
 if health.Code!=http.StatusOK {t.Fatalf("health HTTP %d; expected 200",health.Code)}
 var live map[string]string
 if err:=json.Unmarshal(health.Body.Bytes(),&live);err!=nil{t.Fatal(err)}
 if live["status"]!="ok"||live["service"]!="ekmivo-api"{t.Fatalf("invalid health response: %#v",live)}
 ready:=httptest.NewRecorder()
 handler.ServeHTTP(ready,httptest.NewRequest(http.MethodGet,"/readyz",nil))
 if ready.Code!=http.StatusServiceUnavailable{t.Fatalf("readiness HTTP %d; expected 503 until PG financial components implemented",ready.Code)}
 var state map[string]string
 if err:=json.Unmarshal(ready.Body.Bytes(),&state);err!=nil{t.Fatal(err)}
 if state["status"]!="not_ready"||state["reason"]!="financial_services_not_implemented"{t.Fatalf("readiness misrepresented: %#v",state)}
}

func TestPG03MerchantContextIsRealAuthorizationNotFakePayment(t *testing.T){
 handler:=newHandler()
 for _,tc:=range []struct{path string;status int;code string}{
  {"/v1/merchant/context",400,"INVALID_ENVIRONMENT"},
  {"/v1/merchant/context?environment=LIVE",400,"INVALID_ENVIRONMENT"},
  {"/v1/merchant/context?environment=sandbox&environment=live",400,"INVALID_ENVIRONMENT"},
  {"/v1/merchant/context?environment=live",503,"AUTH_SERVICE_UNAVAILABLE"},
 }{
  recorder:=httptest.NewRecorder()
  handler.ServeHTTP(recorder,httptest.NewRequest(http.MethodGet,tc.path,nil))
  if recorder.Code!=tc.status{t.Fatalf("%s: got %d expected %d",tc.path,recorder.Code,tc.status)}
  var response struct{ Error struct{Code string `json:"code"`} `json:"error"` }
  if err:=json.Unmarshal(recorder.Body.Bytes(),&response);err!=nil{t.Fatal(err)}
  if response.Error.Code!=tc.code{t.Fatalf("%s: got code %s expected %s",tc.path,response.Error.Code,tc.code)}
 }
}
