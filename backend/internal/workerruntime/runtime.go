// Shared realm-bound River runtime for standalone and API-hosted workers.
package workerruntime

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/ekmivo/backend/internal/checkout"
	"github.com/masharzy/ekmivo/backend/internal/financial"
	"github.com/masharzy/ekmivo/backend/internal/receiptnotice"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
)

type AuditWorker struct {
	river.WorkerDefaults[financial.AuditArgs]
	Pool    *pgxpool.Pool
	Control *pgxpool.Pool
	Realm   string
}

// This bounded timeout applies only to the PG04 internal audit probe. River
// reclaims timed-out running jobs after process death, and the audit PK makes
// repeated handler execution idempotent.
func (w *AuditWorker) Timeout(_ *river.Job[financial.AuditArgs]) time.Duration {
	return 10 * time.Second
}
func testPause(ctx context.Context) error {
	ms := os.Getenv("PG04_TEST_PAUSE_AFTER_CLAIM_MS")
	if ms == "" {
		return nil
	}
	if os.Getenv("PG04_CI_FAULT_INJECTION") != "true" {
		return errors.New("fault injection forbidden")
	}
	u, e := url.Parse(os.Getenv("FINANCIAL_WORKER_DATABASE_URL"))
	if e != nil || u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost" {
		return errors.New("fault injection permitted only with local disposable PostgreSQL")
	}
	n, e := strconv.Atoi(ms)
	if e != nil || n < 1 || n > 30000 {
		return errors.New("invalid bounded test-only delay")
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(time.Duration(n) * time.Millisecond):
		return nil
	}
}

func (w *AuditWorker) Work(ctx context.Context, job *river.Job[financial.AuditArgs]) error {
	if job.Args.Environment != w.Realm || !strings.Contains(job.Args.OutboxID, "-") {
		return errors.New("financial audit job realm or identifier is invalid")
	}
	if w.Pool == nil || w.Control == nil {
		return errors.New("financial/control projection unavailable")
	}
	var ws, realm string
	var projectedVersion int64
	if err := w.Pool.QueryRow(ctx, `SELECT workspace_id::text,environment,entitlement_version
 FROM financial_audit_context($1::uuid)`, job.Args.OutboxID).
		Scan(&ws, &realm, &projectedVersion); err != nil {
		return errors.New("financial audit context unavailable")
	}
	var sourceVersion int64
	var active bool
	if err := w.Control.QueryRow(ctx, `SELECT source_version,active FROM resolve_financial_projection($1::uuid,$2)`,
		ws, realm).Scan(&sourceVersion, &active); err != nil {
		return errors.New("authoritative control workspace unavailable")
	}
	if !active || sourceVersion != projectedVersion || realm != w.Realm {
		return errors.New("control entitlement suspended or out of sync")
	}
	if err := testPause(ctx); err != nil {
		return err
	}
	// SECURITY DEFINER function checks physical realm, exact immutable event
	// kind/payload, workspace projection and idempotent processed-event PK.
	// No fake merchant payment, webhook or receipt is created here.
	var first bool
	if err := w.Pool.QueryRow(ctx, "SELECT financial_process_audit($1::uuid)", job.Args.OutboxID).Scan(&first); err != nil {
		return errors.New("financial audit handler rejected event")
	}
	return nil
}
func ValidateWorkerRole(name, realm string) error {
	if realm != "sandbox" && realm != "live" {
		return errors.New("invalid explicit financial realm")
	}
	if name != "ekmivo_financial_worker_"+realm {
		return fmt.Errorf("wrong restricted financial worker role for %s", realm)
	}
	return nil
}
func verifyRealm(ctx context.Context, pool *pgxpool.Pool, realm string) error {
	var actual, actor string
	err := pool.QueryRow(ctx, `SELECT environment,current_user FROM financial_realm WHERE singleton=true`).Scan(&actual, &actor)
	if err != nil || actual != realm {
		return errors.New("wrong or missing independent financial realm")
	}
	return ValidateWorkerRole(actor, realm)
}
func verifyControlProjection(ctx context.Context, pool *pgxpool.Pool) error {
	var member bool
	var hasAuth, hasRealm, privileged bool
	err := pool.QueryRow(ctx, `SELECT pg_has_role(current_user,'ekmivo_financial_projection','member'),
 to_regclass('public.auth_sessions') IS NOT NULL,
 to_regclass('public.financial_realm') IS NOT NULL,
 (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user)`).Scan(&member, &hasAuth, &hasRealm, &privileged)
	if err != nil || !member || !hasAuth || hasRealm || privileged {
		return errors.New("restricted authoritative control DB required")
	}
	return nil
}

type Config struct {
	Realm       string
	DatabaseURL string
	ControlURL  string
	OnStarted   func()
}

// Run retains the existing queues, signed delivery and idempotent financial jobs.
// Identity is explicit per runtime; no process-global environment is rewritten.
func Run(ctx context.Context, cfg Config) error {
	realm := cfg.Realm
	if realm != "sandbox" && realm != "live" {
		return errors.New("worker realm must be sandbox or live")
	}
	dsn := cfg.DatabaseURL
	if dsn == "" {
		return errors.New("explicit financial worker URL required")
	}
	pool, err := workerPool(ctx, dsn, 4)
	if err != nil {
		return errors.New("financial worker database initialization unavailable")
	}
	defer pool.Close()
	source := cfg.ControlURL
	if source == "" {
		return errors.New("restricted control projection URL is required for fresh reauthorization")
	}
	financeURL, e1 := url.Parse(dsn)
	controlURL, e2 := url.Parse(source)
	if e1 != nil || e2 != nil || financeURL == nil || controlURL == nil || financeURL.User == nil || controlURL.User == nil || financeURL.Host+financeURL.Path == controlURL.Host+controlURL.Path || financeURL.User.Username() == controlURL.User.Username() {
		return errors.New("financial and control DB/credential identities must be separate")
	}
	control, err := workerPool(ctx, source, 2)
	if err != nil {
		return errors.New("restricted control projection client unavailable")
	}
	defer control.Close()
	probe, cancelProbe := context.WithTimeout(ctx, 10*time.Second)
	err = verifyRealm(probe, pool, realm)
	if err == nil {
		err = verifyControlProjection(probe, control)
	}
	cancelProbe()
	if err != nil {
		return errors.New("financial queue/control authority preflight")
	}
	workers := river.NewWorkers()
	river.AddWorker(workers, &AuditWorker{Pool: pool, Control: control, Realm: realm})
	periodic := []*river.PeriodicJob{}
	queues := map[string]river.QueueConfig{"financial_" + realm: {MaxWorkers: 2}}
	if os.Getenv("PG06_PIPELINE_ENABLED") == "true" {
		key, e := hex.DecodeString(os.Getenv("PG06_ENCRYPTION_KEY_HEX"))
		if e != nil || len(key) != 32 {
			return errors.New("receipt pipeline encryption key unavailable")
		}
		noticeSMTP, e := receiptnotice.LoadSMTP()
		if e != nil {
			return errors.New("notice worker configuration blocked")
		}
		if noticeSMTP != nil {
			if e = receiptnotice.CheckSchema(ctx, pool); e != nil {
				return errors.New("notice worker migration unavailable")
			}
		}
		pipeline := &financial.PipelineWorker{Pool: pool, Control: control, Realm: realm, EncryptionKey: key, NoticeSMTP: noticeSMTP}
		pipeline.RecoverPhoneReceipts = func(ctx context.Context) error {
			return checkout.RecoverPendingPhoneReceipts(ctx, pool, control, realm, key, []byte(os.Getenv("PG05_PAYER_SECRET")), os.Getenv("PG06_PARSER_RULES_JSON"))
		}
		pipeline.TrackHealth = os.Getenv("PG10_EXTENSIONS_ENABLED") == "true"
		if os.Getenv("PG10_EXTENSIONS_ENABLED") == "true" {
			if noticeSMTP != nil {
				river.AddWorker(workers, &checkout.InvoiceNoticeWorker{Pool: pool, Control: control, Realm: realm, Key: key, TokenKey: []byte(os.Getenv("PG05_TOKEN_SECRET")), SMTP: noticeSMTP})
				queues["invoice_notice_"+realm] = river.QueueConfig{MaxWorkers: 1}
				periodic = append(periodic, river.NewPeriodicJob(river.PeriodicInterval(10*time.Second), func() (river.JobArgs, *river.InsertOpts) {
					return checkout.InvoiceNoticeArgs{Environment: realm}, &river.InsertOpts{Queue: "invoice_notice_" + realm, MaxAttempts: 3, UniqueOpts: sweepUniqueness(10 * time.Second)}
				}, &river.PeriodicJobOpts{RunOnStart: true}))
			}
			river.AddWorker(workers, &checkout.MaintenanceWorker{Pool: pool, Control: control, Realm: realm, TokenKey: []byte(os.Getenv("PG05_TOKEN_SECRET"))})
			queues["maintenance_"+realm] = river.QueueConfig{MaxWorkers: 1}
			periodic = append(periodic, river.NewPeriodicJob(river.PeriodicInterval(time.Minute), func() (river.JobArgs, *river.InsertOpts) {
				return checkout.MaintenanceArgs{Environment: realm}, &river.InsertOpts{Queue: "maintenance_" + realm, MaxAttempts: 3, UniqueOpts: sweepUniqueness(time.Minute)}
			}, &river.PeriodicJobOpts{RunOnStart: true}))
			river.AddWorker(workers, &checkout.ExportWorker{Pool: pool, Control: control, Realm: realm, Key: key})
			queues["export_"+realm] = river.QueueConfig{MaxWorkers: 1}
			periodic = append(periodic, river.NewPeriodicJob(river.PeriodicInterval(5*time.Second), func() (river.JobArgs, *river.InsertOpts) {
				return checkout.ExportArgs{Environment: realm}, &river.InsertOpts{Queue: "export_" + realm, MaxAttempts: 3, UniqueOpts: sweepUniqueness(5 * time.Second)}
			}, &river.PeriodicJobOpts{RunOnStart: true}))
		}
		river.AddWorker(workers, pipeline)
		if noticeSMTP != nil {
			river.AddWorker(workers, &financial.NoticeWorker{Pipeline: pipeline})
			queues["notice_"+realm] = river.QueueConfig{MaxWorkers: 1}
			periodic = append(periodic, river.NewPeriodicJob(river.PeriodicInterval(10*time.Second), func() (river.JobArgs, *river.InsertOpts) {
				return financial.NoticeArgs{Environment: realm}, &river.InsertOpts{Queue: "notice_" + realm, MaxAttempts: 3, UniqueOpts: sweepUniqueness(10 * time.Second)}
			}, &river.PeriodicJobOpts{RunOnStart: true}))
		}
		periodic = append(periodic, river.NewPeriodicJob(river.PeriodicInterval(2*time.Second), func() (river.JobArgs, *river.InsertOpts) {
			return financial.PipelineArgs{Environment: realm}, &river.InsertOpts{Queue: "financial_" + realm, MaxAttempts: 3, UniqueOpts: sweepUniqueness(2 * time.Second)}
		}, &river.PeriodicJobOpts{RunOnStart: true}))
	}
	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{
		PeriodicJobs: periodic,
		Queues:       queues,
		Workers:      workers,
		// This worker only handles bounded 10s PG04 audit probes. River defaults
		// to a ONE HOUR stuck-job rescue horizon, which defeats crash recovery for
		// these tiny idempotent jobs. Keep rescue later than job timeout, while
		// ensuring a killed process is safely retried by River within minutes.
		JobTimeout:           20 * time.Second,
		RescueStuckJobsAfter: 75 * time.Second,
	})
	if err != nil {
		return errors.New("River worker creation")
	}
	if err := client.Start(ctx); err != nil {
		return errors.New("River worker startup")
	}
	log.Printf("River worker active for %s; receipt pipeline enabled=%t", realm, len(periodic) > 0)
	if cfg.OnStarted != nil {
		cfg.OnStarted()
	}
	<-ctx.Done()
	stopCtx, stopCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer stopCancel()
	return client.Stop(stopCtx)
}

func workerPool(ctx context.Context, dsn string, max int32) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, errors.New("invalid worker connection configuration")
	}
	config.MaxConns = max
	config.MinConns = 0
	config.MaxConnIdleTime = time.Minute
	return pgxpool.NewWithConfig(ctx, config)
}

// Completed sweeps must not suppress future runs of the same periodic job.
func sweepUniqueness(period time.Duration) river.UniqueOpts {
	return river.UniqueOpts{ByArgs: true, ByPeriod: period}
}
