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
 if ready.Code!=http.StatusServiceUnavailable{t.Fatalf("readiness HTTP %d; expected 503 until financial release verification passes",ready.Code)}
 var state map[string]string
 if err:=json.Unmarshal(ready.Body.Bytes(),&state);err!=nil{t.Fatal(err)}
 if state["status"]!="not_ready"||state["reason"]!="financial_release_verification_pending"{t.Fatalf("readiness misrepresented: %#v",state)}
}

func TestPG03MerchantContextIsRealAuthorizationNotFakePayment(t *testing.T){
 handler:=newHandler()
 for _,tc:=range []struct{path string;status int;code string}{
  {"/v1/merchant/context",401,"INVALID_API_KEY"},
  {"/v1/merchant/context?environment=LIVE",400,"ENVIRONMENT_DERIVED_FROM_KEY"},
  {"/v1/merchant/context?environment=sandbox&environment=live",400,"ENVIRONMENT_DERIVED_FROM_KEY"},
  {"/v1/merchant/context?environment=live",400,"ENVIRONMENT_DERIVED_FROM_KEY"},
 }{
  recorder:=httptest.NewRecorder()
  handler.ServeHTTP(recorder,httptest.NewRequest(http.MethodGet,tc.path,nil))
  if recorder.Code!=tc.status{t.Fatalf("%s: got %d expected %d",tc.path,recorder.Code,tc.status)}
  var response struct{ Error struct{Code string `json:"code"`; CorrelationID string `json:"correlation_id"`} `json:"error"` }
  if err:=json.Unmarshal(recorder.Body.Bytes(),&response);err!=nil{t.Fatal(err)}
  if response.Error.Code!=tc.code{t.Fatalf("%s: got code %s expected %s",tc.path,response.Error.Code,tc.code)}
  if len(response.Error.CorrelationID)!=24{t.Fatalf("%s: missing request correlation ID",tc.path)}
 }
}

// New public merchant routes intentionally have no workspace path or environment query.
// With the financial service unconfigured they fail closed instead of 404/serving demo rows.
func TestKeyScopedPaymentRoutesRegistered(t *testing.T){
 handler:=newHandler()
 for _,tc:=range []struct{method,path string}{
  {http.MethodGet,"/v1/payment-intents"},
  {http.MethodGet,"/v1/payment-intents/00000000-0000-4000-8000-000000000001"},
  {http.MethodPost,"/v1/payment-intents"},
  {http.MethodPost,"/v1/payment-intents/00000000-0000-4000-8000-000000000001/cancel"},
 }{
  r:=httptest.NewRequest(tc.method,tc.path,nil)
  got:=httptest.NewRecorder()
  handler.ServeHTTP(got,r)
  if got.Code!=http.StatusServiceUnavailable {t.Fatalf("%s %s: HTTP %d, expected fail-closed 503",tc.method,tc.path,got.Code)}
 }
}
