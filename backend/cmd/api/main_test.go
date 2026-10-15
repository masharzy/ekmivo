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
  {"/v1/merchant/context",400,"INVALID_ENVIRONMENT"},
  {"/v1/merchant/context?environment=LIVE",400,"INVALID_ENVIRONMENT"},
  {"/v1/merchant/context?environment=sandbox&environment=live",400,"INVALID_ENVIRONMENT"},
  {"/v1/merchant/context?environment=live",503,"AUTH_SERVICE_UNAVAILABLE"},
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


func TestKeyBoundMerchantRouteFailsClosedWithoutCredentialsOrRuntime(t *testing.T) {
 handler := newHandler()
 cases := []struct {
  method string
  path string
  auth string
  expected int
  code string
 }{
  {http.MethodPost,"/v1/payment-intents?environment=live","",400,"ENVIRONMENT_FROM_KEY"},
  {http.MethodGet,"/v1/payment-intents","",401,"INVALID_API_KEY"},
  {http.MethodPost,"/v1/payment-intents","not-bearer",401,"INVALID_API_KEY"},
  {http.MethodGet,"/v1/payment-intents/9a6f551e-e081-4b74-bcf8-73a5836ab3f4","",401,"INVALID_API_KEY"},
  {http.MethodPost,"/v1/payment-intents/9a6f551e-e081-4b74-bcf8-73a5836ab3f4/verify-transaction","",401,"INVALID_API_KEY"},
  {http.MethodPost,"/v1/payment-intents/9a6f551e-e081-4b74-bcf8-73a5836ab3f4/unknown","",404,"NOT_FOUND"},
  {http.MethodPost,"/v1/payment-intents","Bearer ek_test_0123456789abcdef_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",503,"AUTH_SERVICE_UNAVAILABLE"},
 }
 for _,tc:=range cases {
  t.Run(tc.method+" "+tc.path,func(t *testing.T){
   request:=httptest.NewRequest(tc.method,tc.path,nil)
   if tc.auth!="" { request.Header.Set("Authorization",tc.auth) }
   recorder:=httptest.NewRecorder()
   handler.ServeHTTP(recorder,request)
   if recorder.Code!=tc.expected {t.Fatalf("got HTTP %d want %d: %s",recorder.Code,tc.expected,recorder.Body.String())}
   var result struct{Error struct{Code string `json:"code"`} `json:"error"`}
   if err:=json.Unmarshal(recorder.Body.Bytes(),&result);err!=nil {t.Fatal(err)}
   if result.Error.Code!=tc.code {t.Fatalf("got code %s want %s",result.Error.Code,tc.code)}
  })
 }
}
