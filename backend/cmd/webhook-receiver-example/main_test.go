package main

import (
	"strconv"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
)

// Called from PG04/PG08's separate disposable merchant PostgreSQL database.
// The authoritative Briofold query is simulated over REAL local TLS.
func TestReceiverScopedTLSQueryAndTransactionalDedup(t *testing.T) {
	dsn := os.Getenv("PG08_TEST_MERCHANT_DSN")
	if dsn == "" {
		t.Skip("requires separately-created disposable PG08 merchant PostgreSQL database")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil { t.Fatal(err) }
	defer db.Close()
	workspace := "e1321b52-f00f-4a2c-a45b-a6d50a89c002"
	payment := "e1321b52-f00f-4a2c-a45b-a6d50a89c003"
	eventID := "e1321b52-f00f-4a2c-a45b-a6d50a89c004"
	deliveryID := "e1321b52-f00f-4a2c-a45b-a6d50a89c005"
	ref := "PG08-CI-fictional-order"
	_, err = db.Exec("INSERT INTO merchant_orders(reference,amount_minor) VALUES($1,5500) ON CONFLICT(reference) DO NOTHING", ref)
	if err != nil { t.Fatal(err) }
	key := "synthetic-api-token"
	requests := 0
	var requestLock sync.Mutex
	authority := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
		requestLock.Lock(); requests++; requestLock.Unlock()
		if r.Header.Get("Authorization")!="Bearer "+key || r.Method!="GET" ||
			r.URL.Path!="/v1/workspaces/"+workspace+"/operations/payments/"+payment ||
			r.URL.Query().Get("environment")!="sandbox" {
			t.Errorf("authoritative query scope is wrong: %s %s",r.Method,r.URL)
		}
		w.Header().Set("Content-Type","application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"items":[]map[string]any{{
				"id":payment,"merchant_reference":ref,"verified_amount_minor":5500,"currency":"BDT",
			}},
		})
	}))
	defer authority.Close()
	origin,err := url.Parse(authority.URL);if err!=nil {t.Fatal(err)}
	secret:=[]byte("current-synthetic-secret-for-merchant-receiver-test")
	previous:=[]byte("previous-synthetic-secret-for-merchant-receiver-test")
	client:=authority.Client()
	client.Timeout=5*time.Second
	handler:=newReceiverHandler(db,client,origin,"sandbox",workspace,key,[][]byte{secret,previous},time.Now().Add(time.Hour))
	event:=map[string]any{
		"id":eventID,"type":"payment.verified","schema_version":1,
		"environment":"sandbox","workspace_id":workspace,"delivery_id":deliveryID,
		"data":map[string]any{"payment_id":payment,"merchant_reference":ref,
			"amount_minor":5500,"currency":"BDT","verification_status":"verified"},
	}
	makeRequest:=func(h http.Handler, payload map[string]any, signing []byte, timestamp string, headerEvent string) int {
		t.Helper()
		raw,err:=json.Marshal(payload);if err!=nil{t.Fatal(err)}
		req:=httptest.NewRequest("POST","https://merchant.example.com/webhooks/briofold",strings.NewReader(string(raw)))
		req.Header.Set("X-Briofold-Event-ID",headerEvent)
		req.Header.Set("X-Briofold-Delivery-ID",payload["delivery_id"].(string))
		req.Header.Set("X-Briofold-Timestamp",timestamp)
		req.Header.Set("X-Briofold-Signature","v1="+merchantwebhook.Sign(signing,raw,timestamp,headerEvent))
		id:=sha256.Sum256(signing)
		req.Header.Set("X-Briofold-Key-ID",hex.EncodeToString(id[:8]))
		rec:=httptest.NewRecorder()
		h.ServeHTTP(rec,req)
		return rec.Code
	}
	epoch:=time.Now().Unix()
	stamp:=strconv.FormatInt(epoch,10)
	if status:=makeRequest(handler,event,secret,stamp,eventID);status!=204 {
		t.Fatalf("authentic signed event not accepted: %d",status)
	}
	if status:=makeRequest(handler,event,secret,stamp,eventID);status!=204 {
		t.Fatalf("identical replay not idempotent: %d",status)
	}
	var events,jobs int
	if err:=db.QueryRow("SELECT count(*) FROM merchant_webhook_events WHERE event_id=$1::uuid",eventID).Scan(&events);err!=nil{t.Fatal(err)}
	if err:=db.QueryRow("SELECT count(*) FROM merchant_fulfilment_jobs WHERE reference=$1",ref).Scan(&jobs);err!=nil{t.Fatal(err)}
	if events!=1||jobs!=1{t.Fatalf("expected exactly 1 durable event and fulfillment; got %d,%d",events,jobs)}
	tampered:=make(map[string]any)
	for k,v:=range event{tampered[k]=v}
	tampered["workspace_id"]="e1321b52-f00f-4a2c-a45b-a6d50a89c099"
	if status:=makeRequest(handler,tampered,secret,stamp,eventID);status!=400{
		t.Fatalf("cross-workspace signed event accepted: %d",status)
	}
	if status:=makeRequest(handler,event,secret,strconv.FormatInt(epoch-3600,10),eventID);status!=401{
		t.Fatalf("stale signed event accepted: %d",status)
	}
	wrongKey:=[]byte("not-the-merchant-webhook-verification-secret")
	if status:=makeRequest(handler,event,wrongKey,stamp,eventID);status!=401{
		t.Fatalf("wrong HMAC key accepted: %d",status)
	}
	rotated:=make(map[string]any)
	for k,v:=range event{rotated[k]=v}
	rotated["id"]="e1321b52-f00f-4a2c-a45b-a6d50a89c006"
	rotated["delivery_id"]="e1321b52-f00f-4a2c-a45b-a6d50a89c007"
	if status:=makeRequest(handler,rotated,previous,stamp,rotated["id"].(string));status!=204{
		t.Fatalf("previous signing key within overlap rejected: %d",status)
	}
	expiredHandler:=newReceiverHandler(db,client,origin,"sandbox",workspace,key,[][]byte{secret,previous},time.Now().Add(-time.Minute))
	if status:=makeRequest(expiredHandler,rotated,previous,stamp,rotated["id"].(string));status!=401{
		t.Fatalf("expired old signing key accepted: %d",status)
	}
	if err:=db.QueryRow("SELECT count(*) FROM merchant_fulfilment_jobs WHERE reference=$1",ref).Scan(&jobs);err!=nil{t.Fatal(err)}
	if jobs!=1{t.Fatalf("rotated duplicate event triggered duplicate fulfillment: %d",jobs)}
	requestLock.Lock();totalQueries:=requests;requestLock.Unlock()
	if totalQueries<2{t.Fatal("receiver did not verify current payment with authoritative HTTPS query")}
}
