package merchantwebhook

import (
"context"
"crypto/ecdsa"
"crypto/elliptic"
"crypto/rand"
"crypto/tls"
"crypto/x509"
"crypto/x509/pkix"
"errors"
"io"
"math/big"
"net"
"net/http"
"net/http/httptest"
"net/netip"
"strconv"
"testing"
"time"
)

func TestSignatureAndSSRF(t *testing.T) {
	now := time.Now()
	epoch := strconv.FormatInt(now.Unix(), 10)
	key := []byte("a-secret-for-only-this-test")
	body := []byte(`{"id":"stable"}`)
	signature := Sign(key, body, epoch, "stable")
	if !Verify(key, body, epoch, "stable", signature, now) {
		t.Fatal("valid signature rejected")
	}
	if Verify(key, []byte(`{ "id":"stable"}`), epoch, "stable", signature, now) {
		t.Fatal("changed bytes accepted")
	}
	if Verify(key, body, epoch, "stable", signature, now.Add(6*time.Minute)) {
		t.Fatal("stale delivery accepted")
	}
	for _, raw := range []string{"http://example.com", "https://127.0.0.1", "https://[::1]", "https://169.254.169.254", "https://example.com:8443", "https://user:pass@example.com"} {
		if _, e := ValidateURL(raw); e == nil {
			t.Fatal("unsafe URL accepted", raw)
		}
	}
}

func TestPinnedSignedHTTPSDelivery(t *testing.T) {
 key,err:=ecdsa.GenerateKey(elliptic.P256(),rand.Reader);if err!=nil{t.Fatal(err)}
 template:=&x509.Certificate{
  SerialNumber:big.NewInt(41),Subject:pkix.Name{CommonName:"webhook.example.com"},
  DNSNames:[]string{"webhook.example.com"},
  NotBefore:time.Now().Add(-time.Hour),NotAfter:time.Now().Add(time.Hour),
  KeyUsage:x509.KeyUsageDigitalSignature,
  ExtKeyUsage:[]x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
 }
 der,err:=x509.CreateCertificate(rand.Reader,template,template,&key.PublicKey,key);if err!=nil{t.Fatal(err)}
 cert,err:=x509.ParseCertificate(der);if err!=nil{t.Fatal(err)}
 roots:=x509.NewCertPool();roots.AddCert(cert)
 secret:=[]byte("fictional-only-merchant-webhook-test-signing-key")
 id:="347665ef-f985-44f6-9c6e-124b9d503899"
 lease:="dcc51bce-96f7-4338-a49b-1f4a8dbdedf6"
 body:=[]byte("{\"id\":\"347665ef-f985-44f6-9c6e-124b9d503899\",\"schema_version\":1}")
 code:=204;calls:=0
 srv:=httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  calls++
  raw,readErr:=io.ReadAll(r.Body);if readErr!=nil{t.Error(readErr)}
  if r.Method!="POST" || r.Host!="webhook.example.com" || r.URL.Path!="/receive" ||
   r.Header.Get("X-Ekmivo-Event-ID")!=id || r.Header.Get("X-Briofold-Event-ID")!=id || r.Header.Get("X-Briofold-Signature")!=r.Header.Get("X-Ekmivo-Signature") ||r.Header.Get("X-Ekmivo-Delivery-ID")!=lease ||
   string(raw)!=string(body) {
   t.Errorf("altered signed request: %s %s %s",r.Method,r.Host,r.URL)
  }
  signature:=r.Header.Get("X-Ekmivo-Signature")
  if len(signature)<3 || signature[:3]!="v1=" || !Verify(secret,raw,r.Header.Get("X-Ekmivo-Timestamp"),id,signature[3:],time.Now()){
   t.Error("signature did not cover exact sent bytes")
  }
  if code==302 {w.Header().Set("Location","http://127.0.0.1/unsafe")}
  w.WriteHeader(code)
 }))
 srv.TLS=&tls.Config{Certificates:[]tls.Certificate{{Certificate:[][]byte{der},PrivateKey:key}}}
 srv.StartTLS();defer srv.Close()
 resolve:=func(_ context.Context,_,hostname string)([]netip.Addr,error){
  if hostname!="webhook.example.com"{t.Errorf("unexpected DNS %s",hostname)}
  return []netip.Addr{netip.MustParseAddr("93.184.216.34")},nil
 }
 dial:=func(ctx context.Context,network,address string)(net.Conn,error){
  if address!="93.184.216.34:443"{t.Errorf("untrusted rebinding %s",address)}
  return (&net.Dialer{}).DialContext(ctx,network,srv.Listener.Addr().String())
 }
 endpoint:="https://webhook.example.com/receive"
 if status,reason:=sendWithNetwork(context.Background(),endpoint,secret,body,id,lease,resolve,dial,roots);
 status!=204||reason!=""{t.Fatalf("signed HTTPS failure: %d %s",status,reason)}
 if calls!=1{t.Fatalf("expected exactly one post; %d",calls)}
 code=302
 if status,reason:=sendWithNetwork(context.Background(),endpoint,secret,body,id,lease,resolve,dial,roots);
 status!=302||reason!="non_success_response"||calls!=2{t.Fatalf("followed redirect: %d %s calls=%d",status,reason,calls)}
 code=500
 if status,reason:=sendWithNetwork(context.Background(),endpoint,secret,body,id,lease,resolve,dial,roots);
 status!=500||reason!="non_success_response"{t.Fatalf("unexpected 5xx result: %d %s",status,reason)}
 private:=func(_ context.Context,_,_ string)([]netip.Addr,error){
  return []netip.Addr{netip.MustParseAddr("93.184.216.34"),netip.MustParseAddr("127.0.0.1")},nil
 }
 if status,reason:=sendWithNetwork(context.Background(),endpoint,secret,body,id,lease,private,dial,roots);
 status!=0||reason!="private_address_rejected"{t.Fatalf("mixed private DNS passed: %d %s",status,reason)}
 unavailable:=func(_ context.Context,_,_ string)([]netip.Addr,error){return nil,errors.New("unavailable")}
 if status,reason:=sendWithNetwork(context.Background(),endpoint,secret,body,id,lease,unavailable,dial,roots);
 status!=0||reason!="dns_unavailable"{t.Fatalf("DNS error passed: %d %s",status,reason)}
}
func TestStrictSSRFAdditionalCases(t *testing.T) {
 for _,url:=range []string{
  "https://[::ffff:127.0.0.1]/","https://[64:ff9b::a9fe:a9fe]/",
  "https://[fc00::1]","https://[fe80::1]",
  "https://127.0.0.1:443","https://localhost.",
  "https://tenant.internal","https://test.local",
  "https://webhook.example.com:8443","http://webhook.example.com",
  "https://user:password@webhook.example.com",
 } {
  if _,err:=ValidateURL(url);err==nil{t.Errorf("unsafe endpoint accepted: %s",url)}
 }
 if _,err:=ValidateURL("https://webhook.example.com/receive");err!=nil{t.Fatalf("public https denied: %v",err)}
}
