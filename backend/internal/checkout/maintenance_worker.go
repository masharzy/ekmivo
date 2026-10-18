package checkout

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/ekmivo/backend/internal/financial"
	"github.com/riverqueue/river"
	"strings"
	"time"
)

type MaintenanceArgs struct {
	Environment string `json:"environment"`
}

func (MaintenanceArgs) Kind() string { return "payment_retention_billing" }

type MaintenanceWorker struct {
	river.WorkerDefaults[MaintenanceArgs]
	Pool, Control *pgxpool.Pool
	Realm         string
	TokenKey      []byte
}

func (*MaintenanceWorker) Timeout(*river.Job[MaintenanceArgs]) time.Duration { return 45 * time.Second }
func (w *MaintenanceWorker) Work(ctx context.Context, job *river.Job[MaintenanceArgs]) (workErr error) {
	defer func() { financial.RecordWorkerHealth(w.Pool, "maintenance", w.Realm, workErr == nil) }()
	if job.Args.Environment != w.Realm {
		return errors.New("maintenance realm mismatch")
	}
	var count int64
	if w.Pool.QueryRow(ctx, "SELECT pg11_emit_expiry()").Scan(&count) != nil {
		return errors.New("expiry event sweep unavailable")
	}
	if w.Pool.QueryRow(ctx, "SELECT pg15_prune_exports()").Scan(&count) != nil {
		return errors.New("export retention unavailable")
	}
	if w.Pool.QueryRow(ctx, "SELECT pg15_prune_receipt_evidence()").Scan(&count) != nil {
		return errors.New("receipt retention unavailable")
	}
	// Claim one object per iteration; an unknown delete is retried after its lease.
	for _, cleanup := range []struct{ claim, finish string }{{"pg15_file_claim", "pg15_file_deleted"}, {"pg15_orphan_claim", "pg15_orphan_deleted"}} {
		for i := 0; i < 10; i++ {
			var raw []byte
			if w.Pool.QueryRow(ctx, "SELECT "+cleanup.claim+"()").Scan(&raw) != nil {
				return errors.New("file retention unavailable")
			}
			if len(raw) == 0 || string(raw) == "null" {
				break
			}
			var f struct {
				ID    string `json:"id"`
				Realm string `json:"environment"`
				Key   string `json:"object_key"`
				Lease string `json:"lease"`
			}
			if json.Unmarshal(raw, &f) != nil || f.Realm != w.Realm || !uuidPattern.MatchString(f.ID) || !strings.HasPrefix(f.Key, w.Realm+"/") {
				return errors.New("file deletion scope invalid")
			}
			if _, e := objectRequest(ctx, "DELETE", f.Key, nil); e != nil {
				return errors.New("file deletion unconfirmed")
			}
			var removed bool
			if w.Pool.QueryRow(ctx, "SELECT "+cleanup.finish+"($1::uuid,$2::uuid)", f.ID, f.Lease).Scan(&removed) != nil || !removed {
				return errors.New("file deletion receipt unconfirmed")
			}
		}
	}
	if w.Realm != "live" || len(w.TokenKey) < 32 {
		return nil
	}
	var raw []byte
	if w.Control.QueryRow(ctx, "SELECT pg13_pending_billing()").Scan(&raw) != nil {
		return errors.New("billing reconciliation unavailable")
	}
	var invoices []struct {
		Receiver  string `json:"receiving_workspace_id"`
		ID        string `json:"id"`
		Workspace string `json:"workspace_id"`
		Amount    int64  `json:"amount_minor"`
	}
	if json.Unmarshal(raw, &invoices) != nil {
		return errors.New("billing queue invalid")
	}
	s := &Service{TokenKey: w.TokenKey}
	for _, i := range invoices {
		platform := i.Receiver
		if !uuidPattern.MatchString(platform) {
			return errors.New("billing receiving workspace missing")
		}
		if i.Workspace == platform {
			return errors.New("platform and merchant identity overlap")
		}
		var proofRaw []byte
		if w.Pool.QueryRow(ctx, "SELECT pg13_platform_payment($1)", digest(s.token(platform, "live", "billing:"+i.ID))).Scan(&proofRaw) != nil {
			return errors.New("platform proof query unavailable")
		}
		var p struct {
			ID        string    `json:"id"`
			Workspace string    `json:"workspace_id"`
			Amount    int64     `json:"amount_minor"`
			At        time.Time `json:"verified_at"`
		}
		if json.Unmarshal(proofRaw, &p) != nil || p.ID == "" {
			continue
		}
		if p.Workspace != platform || p.Amount != i.Amount {
			return errors.New("platform proof mismatch")
		}
		var saved bool
		if w.Control.QueryRow(ctx, "SELECT pg13_billing_verified($1::uuid,$2::uuid,$3::uuid,$4,$5)", i.Workspace, i.ID, p.ID, p.Amount, p.At).Scan(&saved) != nil || !saved {
			return errors.New("billing renewal unconfirmed")
		}
	}
	return nil
}
