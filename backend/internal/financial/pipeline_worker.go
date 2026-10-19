package financial

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"github.com/masharzy/ekmivo/backend/internal/receiptnotice"
	"github.com/riverqueue/river"
	"time"
)

type PipelineArgs struct {
	Environment string `json:"environment"`
}

func (PipelineArgs) Kind() string { return "receipt_pipeline" }

type PipelineWorker struct {
	river.WorkerDefaults[PipelineArgs]
	Pool, Control *pgxpool.Pool
	Realm         string
	EncryptionKey []byte
	NoticeSMTP    *receiptnotice.SMTPConfig
	TrackHealth   bool
	// An inline public-test drain must never operate on other tenants or Live.
	OnlyWorkspace        string
	RecoverPhoneReceipts func(context.Context) error
}

func (w *PipelineWorker) Timeout(*river.Job[PipelineArgs]) time.Duration { return 20 * time.Second }

type pendingOperation struct {
	ID, Workspace, Realm string
	Version              int64
}

func (w *PipelineWorker) authorized(ctx context.Context, p pendingOperation) bool {
	if p.Realm != w.Realm || (w.OnlyWorkspace != "" && (w.Realm != "sandbox" || p.Workspace != w.OnlyWorkspace)) {
		return false
	}
	var active bool
	var version int64
	e := w.Control.QueryRow(ctx, `SELECT source_version,active FROM resolve_financial_projection($1::uuid,$2)`, p.Workspace, p.Realm).Scan(&version, &active)
	return e == nil && active && version == p.Version
}
func (w *PipelineWorker) pending(ctx context.Context, function string) ([]pendingOperation, error) {
	// Function name is a private constant, never request input.
	rows, e := w.Pool.Query(ctx, "SELECT * FROM "+function+"()")
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	items := []pendingOperation{}
	for rows.Next() {
		var p pendingOperation
		if e = rows.Scan(&p.ID, &p.Workspace, &p.Realm, &p.Version); e != nil {
			return nil, e
		}
		if w.OnlyWorkspace == "" || (w.Realm == "sandbox" && p.Workspace == w.OnlyWorkspace && p.Realm == "sandbox") {
			items = append(items, p)
		}
	}
	return items, rows.Err()
}
func (w *PipelineWorker) Work(ctx context.Context, job *river.Job[PipelineArgs]) (workErr error) {
	if w.TrackHealth {
		defer func() { RecordWorkerHealth(w.Pool, "critical", w.Realm, workErr == nil) }()
	}
	if job.Args.Environment != w.Realm || len(w.EncryptionKey) != 32 {
		return errors.New("pipeline configuration unavailable")
	}
	if w.RecoverPhoneReceipts != nil {
		if err := w.RecoverPhoneReceipts(ctx); err != nil {
			return errors.New("stored phone receipt recovery unavailable")
		}
	}
	items, e := w.pending(ctx, "pg07_pending")
	if e != nil {
		return errors.New("matching queue unavailable")
	}
	for _, p := range items {
		if !w.authorized(ctx, p) {
			continue
		}
		var status string
		if e = w.Pool.QueryRow(ctx, "SELECT pg07_match($1::uuid,$2)", p.ID, p.Version).Scan(&status); e != nil {
			return errors.New("matching operation rejected")
		}
	}
	items, e = w.pending(ctx, "pg08_due")
	if e != nil {
		return errors.New("delivery queue unavailable")
	}
	// One bounded HTTP attempt per sweep; separate realm workers scale this drain.
	for _, p := range items {
		if !w.authorized(ctx, p) {
			continue
		}
		var raw []byte
		if e = w.Pool.QueryRow(ctx, "SELECT pg08_claim($1::uuid,$2)", p.ID, p.Version).Scan(&raw); e != nil {
			return errors.New("delivery claim unavailable")
		}
		if len(raw) == 0 || string(raw) == "null" {
			return nil
		}
		var d struct {
			ID      string          `json:"id"`
			EventID string          `json:"event_id"`
			LeaseID string          `json:"lease_id"`
			URL     string          `json:"url"`
			Secret  string          `json:"secret"`
			Body    json.RawMessage `json:"body"`
		}
		if e = json.Unmarshal(raw, &d); e != nil {
			return errors.New("invalid delivery claim")
		}
		encrypted, e := base64.StdEncoding.DecodeString(d.Secret)
		if e != nil {
			return errors.New("invalid delivery secret")
		}
		secret, e := merchantwebhook.Decrypt(w.EncryptionKey, encrypted, p.Workspace+"|"+p.Realm)
		if e != nil {
			return errors.New("delivery key unavailable")
		}
		var envelope map[string]any
		if json.Unmarshal(d.Body, &envelope) != nil {
			return errors.New("invalid event envelope")
		}
		envelope["delivery_id"] = d.LeaseID
		body, e := json.Marshal(envelope)
		if e != nil {
			return errors.New("event serialization unavailable")
		}
		code, reason := merchantwebhook.Send(ctx, d.URL, secret, body, d.EventID, d.LeaseID)
		var recorded bool
		if e = w.Pool.QueryRow(ctx, "SELECT pg08_finish($1::uuid,$2::uuid,$3,$4)", d.ID, d.LeaseID, code, reason).Scan(&recorded); e != nil {
			return errors.New("delivery outcome recording unavailable")
		}
		return nil
	}
	return nil
}
