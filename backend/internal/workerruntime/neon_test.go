package workerruntime

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/briofold/backend/internal/financial"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"net/url"
	"os"
	"testing"
	"time"
)

// Actual River startup/leadership/stop with restricted credentials on the named
// isolated test branch. Audit queues only: no HTTP/SMTP/object-store actions.
func TestNeonTwoRealmRuntimeLifecycle(t *testing.T) {
	host := os.Getenv("WORKER_RUNTIME_TEST_HOST")
	if host == "" {
		t.Skip("explicit isolated Neon test branch required")
	}
	t.Setenv("PG06_PIPELINE_ENABLED", "false")
	t.Setenv("PG10_EXTENSIONS_ENABLED", "false")
	control := os.Getenv("WORKER_RUNTIME_TEST_CONTROL_URL")
	check := func(dsn string) {
		t.Helper()
		u, e := url.Parse(dsn)
		if e != nil || u == nil || u.Hostname() != host {
			t.Fatal("test cannot cross the isolated branch boundary")
		}
	}
	check(control)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ready := make(chan string, 2)
	result := make(chan error, 2)
	for _, realm := range []string{"sandbox", "live"} {
		dsn := os.Getenv("WORKER_RUNTIME_TEST_SANDBOX_URL")
		if realm == "live" {
			dsn = os.Getenv("WORKER_RUNTIME_TEST_LIVE_URL")
		}
		check(dsn)
		c := Config{Realm: realm, DatabaseURL: dsn, ControlURL: control, OnStarted: func() { ready <- realm }}
		go func() { result <- Run(ctx, c) }()
	}
	for i := 0; i < 2; i++ {
		select {
		case r := <-ready:
			t.Log("River client started for", r)
		case e := <-result:
			t.Fatalf("runtime startup failed: %v", e)
		case <-time.After(30 * time.Second):
			t.Fatal("worker startup timeout")
		}
	}
	cancel()
	for i := 0; i < 2; i++ {
		select {
		case e := <-result:
			if e != nil {
				t.Fatal(e)
			}
		case <-time.After(20 * time.Second):
			t.Fatal("worker shutdown did not drain")
		}
	}
}

// Regression: default ByArgs uniqueness includes completed jobs forever. Each
// sweep must deduplicate within its interval and run again after that interval.
func TestNeonCompletedSweepDoesNotSuppressNextPeriod(t *testing.T) {
	host := os.Getenv("WORKER_RUNTIME_TEST_HOST")
	if host == "" {
		t.Skip("explicit isolated Neon test branch required")
	}
	dsn := os.Getenv("WORKER_RUNTIME_TEST_SANDBOX_URL")
	u, e := url.Parse(dsn)
	if e != nil || u.Hostname() != host {
		t.Fatal("isolated branch required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal("pool initialization failed")
	}
	defer pool.Close()
	client, e := river.NewClient(riverpgxv5.New(pool), &river.Config{})
	if e != nil {
		t.Fatal(e)
	}
	tx, e := pool.Begin(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback(context.Background())
	args := financial.AuditArgs{Environment: "sandbox", OutboxID: fmt.Sprintf("sweep-regression-%d", time.Now().UnixNano())}
	opts := &river.InsertOpts{Queue: "financial_sandbox", UniqueOpts: sweepUniqueness(time.Second)}
	first, e := client.InsertTx(ctx, tx, args, opts)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = tx.Exec(ctx, "UPDATE river_job SET state='completed',finalized_at=now() WHERE id=$1", first.Job.ID); e != nil {
		t.Fatal(e)
	}
	// Waiting past a full interval also covers a period boundary crossed during
	// insertion; no production queue or real receipt is involved.
	time.Sleep(1100 * time.Millisecond)
	next, e := client.InsertTx(ctx, tx, args, opts)
	if e != nil {
		t.Fatal(e)
	}
	if next.Job.ID == first.Job.ID || next.UniqueSkippedAsDuplicate {
		t.Fatal("completed sweep suppressed next period")
	}
}
