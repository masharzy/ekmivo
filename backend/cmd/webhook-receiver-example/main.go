// Merchant-side example. Its database is the MERCHANT application's database,
// never Briofold control/finance. Apply examples/webhook-receiver/schema.sql there.
package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

type event struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	Version     int    `json:"schema_version"`
	Workspace   string `json:"workspace_id"`
	Environment string `json:"environment"`
	DeliveryID  string `json:"delivery_id"`
	Data        struct {
		PaymentID string `json:"payment_id"`
		Reference string `json:"merchant_reference"`
		Amount    int64  `json:"amount_minor"`
		Currency  string `json:"currency"`
		Status    string `json:"verification_status"`
	} `json:"data"`
}

func main() {
	origin, e := url.Parse(os.Getenv("EKMIVO_API_ORIGIN"))
	if e != nil || origin.Scheme != "https" || origin.User != nil || origin.Host == "" {
		log.Fatal("configured HTTPS API origin required")
	}
	realm, workspace := os.Getenv("EKMIVO_ENVIRONMENT"), os.Getenv("EKMIVO_WORKSPACE_ID")
	key := os.Getenv("EKMIVO_MERCHANT_API_KEY")
	if (realm != "sandbox" && realm != "live") || workspace == "" || key == "" {
		log.Fatal("merchant scope configuration required")
	}
	secrets := [][]byte{[]byte(os.Getenv("EKMIVO_WEBHOOK_SECRET"))}
	if len(secrets[0]) < 32 {
		log.Fatal("signing secret required")
	}
	var previousUntil time.Time
	if previous := os.Getenv("EKMIVO_PREVIOUS_WEBHOOK_SECRET"); previous != "" {
		until, e := time.Parse(time.RFC3339, os.Getenv("EKMIVO_PREVIOUS_SECRET_UNTIL"))
		if e != nil || !time.Now().Before(until) || len(previous) < 32 {
			log.Fatal("previous key requires a future overlap expiry")
		}
		previousUntil = until
		secrets = append(secrets, []byte(previous))
	}
	db, e := sql.Open("pgx", os.Getenv("MERCHANT_DATABASE_URL"))
	if e != nil {
		log.Fatal("merchant database unavailable")
	}
	defer db.Close()
	client := &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	mux := newReceiverHandler(db, client, origin, realm, workspace, key, secrets, previousUntil)
	server := &http.Server{Addr: ":8081", Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 12 * time.Second, IdleTimeout: 60 * time.Second}
	log.Fatal(server.ListenAndServe())
}

// Receive code is identical in production and disposable merchant integration tests.
func newReceiverHandler(db *sql.DB, client *http.Client, origin *url.URL, realm, workspace, key string, secrets [][]byte, previousUntil time.Time) http.Handler {
	uuid := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	mux := http.NewServeMux()
	mux.HandleFunc("POST /webhooks/briofold", func(w http.ResponseWriter, r *http.Request) {
		raw, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 16384))
		if e != nil {
			http.Error(w, "invalid payload", 413)
			return
		}
		eventID := r.Header.Get("X-Briofold-Event-ID")
		signature := strings.TrimPrefix(r.Header.Get("X-Briofold-Signature"), "v1=")
		valid := false
		for index, secret := range secrets {
			if index > 0 && !time.Now().Before(previousUntil) {
				continue
			}
			keyID := sha256.Sum256(secret)
			if hex.EncodeToString(keyID[:8]) == r.Header.Get("X-Briofold-Key-ID") && merchantwebhook.Verify(secret, raw, r.Header.Get("X-Briofold-Timestamp"), eventID, signature, time.Now()) {
				valid = true
				break
			}
		}
		if !valid {
			http.Error(w, "signature rejected", 401)
			return
		}
		var payload event
		if json.Unmarshal(raw, &payload) != nil || payload.ID != eventID || payload.DeliveryID != r.Header.Get("X-Briofold-Delivery-ID") || !uuid.MatchString(payload.ID) || !uuid.MatchString(payload.DeliveryID) || !uuid.MatchString(payload.Data.PaymentID) || len(payload.Data.Reference) < 1 || len(payload.Data.Reference) > 128 || payload.Data.Amount <= 0 || payload.Environment != realm || payload.Workspace != workspace || payload.Version != 1 || payload.Type != "payment.verified" || payload.Data.Status != "verified" || payload.Data.Currency != "BDT" {
			http.Error(w, "event scope rejected", 400)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		defer cancel()
		// Query authoritative current state; a browser redirect is never truth.
		target := *origin
		target.Path = "/v1/workspaces/" + workspace + "/operations/payments/" + payload.Data.PaymentID
		target.RawQuery = "environment=" + realm
		query, e := http.NewRequestWithContext(ctx, "GET", target.String(), nil)
		if e != nil {
			http.Error(w, "query unavailable", 503)
			return
		}
		query.Header.Set("Authorization", "Bearer "+key)
		response, e := client.Do(query)
		if e != nil {
			http.Error(w, "query unavailable", 503)
			return
		}
		defer response.Body.Close()
		var state struct {
			Items []struct {
				ID        string `json:"id"`
				Reference string `json:"merchant_reference"`
				Amount    int64  `json:"verified_amount_minor"`
				Currency  string `json:"currency"`
			} `json:"items"`
		}
		if response.StatusCode != 200 || json.NewDecoder(io.LimitReader(response.Body, 16384)).Decode(&state) != nil || len(state.Items) != 1 || state.Items[0].ID != payload.Data.PaymentID || state.Items[0].Reference != payload.Data.Reference || state.Items[0].Amount != payload.Data.Amount || state.Items[0].Currency != "BDT" {
			http.Error(w, "payment query mismatch", 409)
			return
		}
		tx, e := db.BeginTx(ctx, nil)
		if e != nil {
			http.Error(w, "consumer unavailable", 503)
			return
		}
		defer tx.Rollback()
		// Exact order amount is the example's fulfilment policy. Advance/COD users
		// must implement their own explicit policy rather than silently shipping.
		var expected int64
		if e = tx.QueryRowContext(ctx, "SELECT amount_minor FROM merchant_orders WHERE reference=$1 FOR UPDATE", payload.Data.Reference).Scan(&expected); e != nil || expected != payload.Data.Amount {
			http.Error(w, "order not eligible", 409)
			return
		}
		var previous string
		e = tx.QueryRowContext(ctx, "SELECT payment_id::text FROM merchant_fulfilment_jobs WHERE reference=$1", payload.Data.Reference).Scan(&previous)
		if e != nil && e != sql.ErrNoRows {
			http.Error(w, "consumer unavailable", 503)
			return
		}
		if e == nil && previous != payload.Data.PaymentID {
			http.Error(w, "different payment requires reconciliation", 409)
			return
		}
		var inserted string
		e = tx.QueryRowContext(ctx, `INSERT INTO merchant_webhook_events(event_id,payment_id,reference) VALUES($1::uuid,$2::uuid,$3) ON CONFLICT DO NOTHING RETURNING event_id::text`, payload.ID, payload.Data.PaymentID, payload.Data.Reference).Scan(&inserted)
		if e == nil {
			_, e = tx.ExecContext(ctx, `INSERT INTO merchant_fulfilment_jobs(reference,payment_id) VALUES($1,$2::uuid) ON CONFLICT DO NOTHING`, payload.Data.Reference, payload.Data.PaymentID)
		} else if e == sql.ErrNoRows {
			e = nil
		}
		if e != nil || tx.Commit() != nil {
			http.Error(w, "consumer persistence unavailable", 503)
			return
		}
		w.WriteHeader(204)
	})
	return mux
}
