package main

import (
 "encoding/base64"
 "encoding/json"
 "net/http/httptest"
 "strings"
 "testing"
)

func TestKeyBoundMerchantRouteRejectsURLScopeAndMissingCredentials(t *testing.T) {
 handler := newHandler()
 synthetic := "ek_test_0123456789abcdef_" + base64.RawURLEncoding.EncodeToString(make([]byte, 32))
 for _, tc := range []struct {
  name, method, url, auth, code string
  want int
 }{
  {"no key", "GET", "/v1/payment-intents", "", "INVALID_API_KEY", 401},
  {"no query realm", "POST", "/v1/payment-intents?environment=live", "", "ENVIRONMENT_FROM_KEY", 400},
  {"invalid bearer token", "GET", "/v1/payment-intents", "Bearer not-a-real-key", "INVALID_API_KEY", 401},
  {"invalid token prefix", "GET", "/v1/payment-intents", strings.Replace(synthetic, "ek_test_", "ek_fake_", 1), "INVALID_API_KEY", 401},
  {"recognized format needs auth backend", "GET", "/v1/payment-intents", "Bearer "+synthetic, "AUTH_SERVICE_UNAVAILABLE", 503},
  {"unknown state action", "POST", "/v1/payment-intents/00000000-0000-4000-8000-000000000001/unknown", "Bearer "+synthetic, "NOT_FOUND", 404},
  {"TrxID endpoint needs auth backend", "POST", "/v1/payment-intents/00000000-0000-4000-8000-000000000001/verify-transaction", "Bearer "+synthetic, "AUTH_SERVICE_UNAVAILABLE", 503},
 } {
  t.Run(tc.name, func(t *testing.T) {
   request := httptest.NewRequest(tc.method, tc.url, nil)
   if tc.auth != "" { request.Header.Set("Authorization", tc.auth) }
   recorder := httptest.NewRecorder()
   handler.ServeHTTP(recorder, request)
   if recorder.Code != tc.want { t.Fatalf("status %d, want %d: %s", recorder.Code, tc.want, recorder.Body.String()) }
   var result struct { Error struct { Code string `json:"code"` } `json:"error"` }
   if err := json.Unmarshal(recorder.Body.Bytes(), &result); err != nil { t.Fatal(err) }
   if result.Error.Code != tc.code { t.Fatalf("error code %s, want %s", result.Error.Code, tc.code) }
  })
 }
}
