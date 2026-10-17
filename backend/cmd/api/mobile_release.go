package main

import (
 "encoding/hex"
 "net/http"
 "net/url"
 "os"
 "strconv"
 "strings"
)

// Public, read-only release manifest. An unavailable release is 204, not
// a fabricated "up to date" claim. Configure all fields together on Render.
func handleAndroidRelease(w http.ResponseWriter, r *http.Request) {
 codeRaw := strings.TrimSpace(os.Getenv("EKMIVO_ANDROID_VERSION_CODE"))
 version := strings.TrimSpace(os.Getenv("EKMIVO_ANDROID_VERSION_NAME"))
 download := strings.TrimSpace(os.Getenv("EKMIVO_ANDROID_APK_URL"))
 sha := strings.ToLower(strings.TrimSpace(os.Getenv("EKMIVO_ANDROID_APK_SHA256")))
 if codeRaw == "" || version == "" || download == "" || sha == "" {
  w.Header().Set("Cache-Control","no-store")
  w.WriteHeader(http.StatusNoContent)
  return
 }
 code, err := strconv.Atoi(codeRaw)
 parsed, urlErr := url.Parse(download)
 bytes, hexErr := hex.DecodeString(sha)
 if err!=nil || code<=0 || len(version)>40 || urlErr!=nil ||
  parsed.Scheme!="https" || parsed.Hostname()=="" || parsed.User!=nil ||
  parsed.Fragment!="" || hexErr!=nil || len(bytes)!=32 {
  http.Error(w,"RELEASE_CONFIGURATION_UNAVAILABLE",http.StatusServiceUnavailable)
  return
 }
 writeJSON(w,http.StatusOK,map[string]any{
  "version_code":code,
  "version_name":version,
  "apk_url":download,
  "sha256":sha,
 })
}
