package checkout

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/financial"
	"github.com/riverqueue/river"
	"time"
)

type ExportArgs struct {
	Environment string `json:"environment"`
}

func (ExportArgs) Kind() string { return "private_document_export" }

type ExportWorker struct {
	river.WorkerDefaults[ExportArgs]
	Pool, Control *pgxpool.Pool
	Realm         string
	Key           []byte
}

func (*ExportWorker) Timeout(*river.Job[ExportArgs]) time.Duration { return 60 * time.Second }
func (w *ExportWorker) Work(ctx context.Context, job *river.Job[ExportArgs]) (workErr error) {
	defer func() { financial.RecordWorkerHealth(w.Pool, "export", w.Realm, workErr == nil) }()
	if job.Args.Environment != w.Realm || len(w.Key) != 32 {
		return errors.New("export configuration unavailable")
	}
	var raw []byte
	if e := w.Pool.QueryRow(ctx, "SELECT pg10_export_claim()").Scan(&raw); e != nil {
		return errors.New("export queue unavailable")
	}
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var j struct {
		ID        string `json:"id"`
		Workspace string `json:"workspace_id"`
		Realm     string `json:"environment"`
		Actor     string `json:"actor_id"`
		Resource  string `json:"resource"`
		Lease     string `json:"lease_id"`
	}
	if json.Unmarshal(raw, &j) != nil || j.Realm != w.Realm {
		return errors.New("export lease invalid")
	}
	finish := func(cipher []byte, code any) error {
		var accepted bool
		e := w.Pool.QueryRow(ctx, "SELECT pg10_export_finish($1::uuid,$2::uuid,$3,$4,$5)", j.ID, j.Lease, cipher, digest(j.ID), code).Scan(&accepted)
		if e != nil || !accepted {
			return errors.New("export result unconfirmed")
		}
		return nil
	}
	var allowed bool
	if e := w.Control.QueryRow(ctx, "SELECT pg10_export_authorized($1::uuid,$2::uuid)", j.Workspace, j.Actor).Scan(&allowed); e != nil {
		return errors.New("export authority unavailable")
	}
	if !allowed {
		return finish(nil, "ACTOR_ACCESS_REMOVED")
	}
	var buffer bytes.Buffer
	writer := csv.NewWriter(&buffer)
	_ = writer.Write([]string{"id", "reference", "name", "email", "phone", "status", "amount_minor", "paid_minor", "currency"})
	cursor := ""
	for page := 0; page < 200; page++ {
		var snapshot []byte
		if w.Realm == "live" {
			if err := w.Control.QueryRow(ctx, "SELECT payment_plan_effective($1::uuid)", j.Workspace).Scan(&snapshot); err != nil {
				return errors.New("export plan unavailable")
			}
			var p map[string]any
			if json.Unmarshal(snapshot, &p) != nil {
				return errors.New("invalid export plan")
			}
			terms, _ := p["terms"].(map[string]any)
			features, _ := terms["features"].(map[string]any)
			feature := ""
			if j.Resource == "invoices" {
				feature = "invoices"
			}
			if j.Resource == "payment-links" {
				feature = "payment_links"
			}
			if features["exports"] != true || feature != "" && features[feature] != true {
				return finish(nil, "PLAN_FEATURE_REQUIRED")
			}
			p["workspace_id"] = j.Workspace
			p["fetched_at"] = time.Now().UTC()
			snapshot, _ = json.Marshal(p)
		}
		tx, err := w.Pool.Begin(ctx)
		if err != nil {
			return err
		}
		if len(snapshot) > 0 {
			_, err = tx.Exec(ctx, "SELECT set_config('ekmivo.payment_plan',$1,true)", string(snapshot))
		}
		if err == nil {
			err = tx.QueryRow(ctx, "SELECT pg10_export_rows($1::uuid,$2::uuid,$3::uuid)", j.ID, j.Lease, nullableID(cursor)).Scan(&raw)
		}
		if err != nil {
			tx.Rollback(ctx)
			return errors.New("export page unavailable")
		}
		if err = tx.Commit(ctx); err != nil {
			return err
		}
		var data struct {
			Items []map[string]any `json:"items"`
			Next  string           `json:"next_cursor"`
		}
		if json.Unmarshal(raw, &data) != nil {
			return errors.New("export rows invalid")
		}
		for _, row := range data.Items {
			body, _ := row["body"].(map[string]any)
			cell := func(v any) string {
				if v == nil {
					return ""
				}
				return csvSafe(fmt.Sprint(v))
			}
			_ = writer.Write([]string{cell(row["id"]), cell(row["reference"]), cell(body["name"]), cell(body["email"]), cell(body["phone"]), cell(row["status"]), cell(row["amount_minor"]), cell(row["paid_minor"]), "BDT"})
		}
		writer.Flush()
		if writer.Error() != nil || buffer.Len() > 10485760 {
			return finish(nil, "EXPORT_LIMIT_EXCEEDED")
		}
		cursor = data.Next
		if cursor == "" {
			break
		}
		if page == 199 {
			return finish(nil, "EXPORT_ROW_LIMIT_EXCEEDED")
		}
	}
	cipher, e := deviceevidence.Encrypt(w.Key, buffer.Bytes(), j.Workspace+"|"+j.Realm+"|export")
	if e != nil {
		return errors.New("export encryption unavailable")
	}
	return finish(cipher, nil)
}
