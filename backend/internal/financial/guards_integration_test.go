package financial

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Separate connections must compete at the database guard, not a mock lock.
func TestPG04ConcurrentAttemptAndAllocationGuards(t *testing.T) {
	raw := os.Getenv("PG04_SANDBOX_MIGRATION_DATABASE_URL")
	if raw == "" {
		t.Skip("disposable PG04 database not configured")
	}
	u, e := url.Parse(raw)
	if e != nil || (u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") {
		t.Fatal("remote database prohibited")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, e := pgxpool.New(ctx, raw)
	if e != nil {
		t.Fatal(e)
	}
	defer pool.Close()
	uuid := func() string {
		id, e := randomUUID()
		if e != nil {
			t.Fatal(e)
		}
		return id
	}
	digest := func() string { v := sha256.Sum256([]byte(uuid())); return hex.EncodeToString(v[:]) }
	ws := uuid()
	if _, e = pool.Exec(ctx, "SELECT financial_sync_workspace($1::uuid,'sandbox',1,true)", ws); e != nil {
		t.Fatal(e)
	}
	var receiving string
	if e = pool.QueryRow(ctx, `INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix)
 VALUES($1::uuid,'sandbox','bkash',$2,'1234') RETURNING id::text`, ws, digest()).Scan(&receiving); e != nil {
		t.Fatal(e)
	}
	intent := func() string {
		var id string
		if e := pool.QueryRow(ctx, `INSERT INTO payment_intents(workspace_id,environment,merchant_reference,amount_minor,expires_at)
   VALUES($1::uuid,'sandbox',$2,7500,now()+interval '1 hour') RETURNING id::text`, ws, uuid()).Scan(&id); e != nil {
			t.Fatal(e)
		}
		return id
	}
	firstIntent := intent()
	payer := digest()
	start := time.Now().UTC().Add(time.Minute)
	end := start.Add(15 * time.Minute)
	insertAttempt := func(tx pgx.Tx, intent, payer string) error {
		_, e := tx.Exec(ctx, `INSERT INTO payment_attempts(workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,
   amount_minor,method,window_start,window_end,policy_version)
   VALUES($1::uuid,'sandbox',$2::uuid,$3::uuid,$4,'5678',7500,'bkash',$5,$6,1)`, ws, intent, receiving, payer, start, end)
		return e
	}
	race := func(a, b func(pgx.Tx) error, expectedCode string) {
		t.Helper()
		txs := make([]pgx.Tx, 2)
		for i := range txs {
			var e error
			txs[i], e = pool.Begin(ctx)
			if e != nil {
				t.Fatal(e)
			}
		}
		startBarrier := make(chan struct{})
		outcomes := make(chan error, 2)
		var group sync.WaitGroup
		for i, fn := range []func(pgx.Tx) error{a, b} {
			group.Add(1)
			go func(tx pgx.Tx, fn func(pgx.Tx) error) {
				defer group.Done()
				defer tx.Rollback(ctx)
				<-startBarrier
				e := fn(tx)
				if e == nil {
					e = tx.Commit(ctx)
				}
				outcomes <- e
			}(txs[i], fn)
		}
		close(startBarrier)
		group.Wait()
		close(outcomes)
		wins, denied := 0, 0
		for e := range outcomes {
			if e == nil {
				wins++
				continue
			}
			var pgError *pgconn.PgError
			if !errors.As(e, &pgError) || pgError.Code != expectedCode {
				t.Fatalf("unexpected competing transaction result: %v", e)
			}
			denied++
		}
		if wins != 1 || denied != 1 {
			t.Fatalf("expected one winner/one denied, got %d/%d", wins, denied)
		}
	}
	sameAttempt := func(tx pgx.Tx) error { return insertAttempt(tx, firstIntent, payer) }
	race(sameAttempt, sameAttempt, "23505")
	var attempts int
	if e = pool.QueryRow(ctx, "SELECT count(*) FROM payment_attempts WHERE workspace_id=$1::uuid", ws).Scan(&attempts); e != nil || attempts != 1 {
		t.Fatal("overlapping attempt race duplicated state", e)
	}
	payment := func(intent, payer string, existing bool) string {
		if !existing {
			tx, e := pool.Begin(ctx)
			if e != nil {
				t.Fatal(e)
			}
			e = insertAttempt(tx, intent, payer)
			if e == nil {
				e = tx.Commit(ctx)
			}
			tx.Rollback(ctx)
			if e != nil {
				t.Fatal(e)
			}
		}
		var attempt, inbound, observation, id string
		if e := pool.QueryRow(ctx, "SELECT id::text FROM payment_attempts WHERE workspace_id=$1::uuid AND intent_id=$2::uuid", ws, intent).Scan(&attempt); e != nil {
			t.Fatal(e)
		}
		if e := pool.QueryRow(ctx, `INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,event_digest,encrypted_evidence)
   VALUES($1::uuid,'sandbox','sandbox_fixture',$2,$3,$4) RETURNING id::text`, ws, uuid(), digest(), make([]byte, 40)).Scan(&inbound); e != nil {
			t.Fatal(e)
		}
		if e := pool.QueryRow(ctx, `INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,receiving_account_id,payer_hmac,
   amount_minor,method,direction,original_transaction_at,time_precision,parser_version)
   VALUES($1::uuid,'sandbox',$2::uuid,$3::uuid,$4,7500,'bkash','incoming',$5,'second',1) RETURNING id::text`, ws, inbound, receiving, payer, start.Add(time.Second)).Scan(&observation); e != nil {
			t.Fatal(e)
		}
		if e := pool.QueryRow(ctx, `INSERT INTO financial_payments(workspace_id,environment,attempt_id,observation_id,verified_amount_minor,verification_method,policy_version)
   VALUES($1::uuid,'sandbox',$2::uuid,$3::uuid,7500,'sandbox_fixture',1) RETURNING id::text`, ws, attempt, observation).Scan(&id); e != nil {
			t.Fatal(e)
		}
		return id
	}
	a := payment(firstIntent, payer, true)
	b := payment(intent(), digest(), false)
	c := payment(intent(), digest(), false)
	allocate := func(payment, intent string) func(pgx.Tx) error {
		return func(tx pgx.Tx) error {
			_, e := tx.Exec(ctx, `INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor)
   VALUES($1::uuid,'sandbox',$2::uuid,$3::uuid,5000)`, ws, payment, intent)
			return e
		}
	}
	// One verified payment cannot fund two simultaneous 5000 allocations.
	race(allocate(a, intent()), allocate(a, intent()), "23514")
	var allocated int
	if e = pool.QueryRow(ctx, "SELECT COALESCE(sum(amount_minor),0) FROM financial_allocations WHERE payment_id=$1::uuid", a).Scan(&allocated); e != nil || allocated != 5000 {
		t.Fatal("concurrent verified-funds cap failed", e)
	}
	// Two verified payments cannot overfund a single 7500 intent.
	target := intent()
	race(allocate(b, target), allocate(c, target), "23514")
	if e = pool.QueryRow(ctx, "SELECT COALESCE(sum(amount_minor),0) FROM financial_allocations WHERE intent_id=$1::uuid", target).Scan(&allocated); e != nil || allocated != 5000 {
		t.Fatal("concurrent intent cap failed", e)
	}
	t.Log("PG04 real connection races PASS: overlapping attempts, verified-funds cap, intent cap; one winner per race")
}
