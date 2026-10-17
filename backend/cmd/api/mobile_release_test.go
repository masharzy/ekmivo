package main

import (
 "encoding/json"
 "net/http"
 "net/http/httptest"
 "strings"
 "testing"
)

func TestMobileReleaseManifestNotPublished(t *testing.T){
 t.Setenv("EKMIVO_ANDROID_VERSION_CODE","")
 t.Setenv("EKMIVO_ANDROID_VERSION_NAME","")
 t.Setenv("EKMIVO_ANDROID_APK_URL","")
 t.Setenv("EKMIVO_ANDROID_APK_SHA256","")
 recorder:=httptest.NewRecorder()
 handleAndroidRelease(recorder,httptest.NewRequest(http.MethodGet,"/v1/mobile/releases/latest",nil))
 if recorder.Code!=http.StatusNoContent { t.Fatalf("expected 204, got %d",recorder.Code) }
}

func TestMobileReleaseManifestValidated(t *testing.T){
 t.Setenv("EKMIVO_ANDROID_VERSION_CODE","5")
 t.Setenv("EKMIVO_ANDROID_VERSION_NAME","0.2.3")
 t.Setenv("EKMIVO_ANDROID_APK_URL","https://updates.example.org/ekmivo-v5.apk")
 t.Setenv("EKMIVO_ANDROID_APK_SHA256",strings.Repeat("a",64))
 recorder:=httptest.NewRecorder()
 handleAndroidRelease(recorder,httptest.NewRequest(http.MethodGet,"/v1/mobile/releases/latest",nil))
 if recorder.Code!=http.StatusOK { t.Fatalf("expected 200, got %d: %s",recorder.Code,recorder.Body.String()) }
 var out map[string]any
 if e:=json.Unmarshal(recorder.Body.Bytes(),&out);e!=nil {t.Fatal(e)}
 if out["version_code"]!=float64(5) || out["sha256"]!=strings.Repeat("a",64){t.Fatalf("wrong data: %v",out)}
 t.Setenv("EKMIVO_ANDROID_APK_URL","http://unsafe.example.org/update.apk")
 recorder=httptest.NewRecorder()
 handleAndroidRelease(recorder,httptest.NewRequest(http.MethodGet,"/v1/mobile/releases/latest",nil))
 if recorder.Code!=http.StatusServiceUnavailable{t.Fatalf("insecure url must fail, got %d",recorder.Code)}
}
