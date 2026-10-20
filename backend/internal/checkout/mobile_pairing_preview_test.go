package checkout

import (
 "net/http/httptest"
 "strings"
 "testing"
)

func TestMobilePreviewRejectsInvalidTokenBeforeDatabase(t *testing.T) {
 for _,raw:=range []string{`{}`,`{"pairing_token":""}`,`{"pairing_token":"ABCDEFGH/../../claim"}`,`{"pairing_token":123}`,`invalid`,`{"pairing_token":"ABCDEFGH","workspace_id":"injected"}`,`{"pairing_token":"ABCDEFGH"}{}`} {
  w:=httptest.NewRecorder()
  (&Service{}).handleMobilePairingPreview(w,httptest.NewRequest("POST","/v1/device/pairing-preview",nil),[]byte(raw))
  if w.Code!=422 || !strings.Contains(w.Body.String(),"INVALID_ENROLLMENT") {t.Fatalf("invalid preview status %d",w.Code)}
  if w.Header().Get("Cache-Control")!="no-store" {t.Fatal("pairing response must not be cached")}
 }
}
