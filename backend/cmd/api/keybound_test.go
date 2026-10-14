package main

import (
 "encoding/base64"
 "net/http"
 "net/http/httptest"
 "strings"
 "testing"
)

func TestKeyBoundMerchantRouteRejectsUntrustedScope(t *testing.T) {
 token := "ek_test_1234567890abcdef_" + base64.RawURLEncoding.EncodeToString([]byte(strings.Repeat("z",32)))
 cases := []struct{ name, method, path, authorization string; status int }{
  {"no key", "POST", "/v1/payment-intents", "", http.StatusUnauthorized},
  {"bad key", "GET", "/v1/payment-intents", "Bearer fake", http.StatusUnauthorized},
  {"url environment forbidden", "POST", "/v1/payment-intents?environment=live", "Bearer "+token, http.StatusBadRequest},
  {"no auth service", "POST", "/v1/payment-intents", "Bearer "+token, http.StatusServiceUnavailable},
  {"lookup needs key", "POST", "/v1/payment-intents/11111111-1111-4111-8111-111111111111/verify-transaction", "", http.StatusUnauthorized},
 }
 mux := newHandlerWithCheckout(nil,nil)
 for _, tc := range cases {
  t.Run(tc.name,func(t *testing.T){
   req:=httptest.NewRequest(tc.method,tc.path,nil)
   if tc.authorization!=""{req.Header.Set("Authorization",tc.authorization)}
   out:=httptest.NewRecorder()
   mux.ServeHTTP(out,req)
   if out.Code!=tc.status {t.Fatalf("status %d want %d: %s",out.Code,tc.status,out.Body.String())}
  })
 }
}
