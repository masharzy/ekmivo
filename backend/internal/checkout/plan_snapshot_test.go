package checkout

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/masharzy/ekmivo/backend/internal/authz"
)

type snapshotConnector struct {
	system, installed bool
}

func (c snapshotConnector) Connect(context.Context) (driver.Conn, error) {
	return snapshotConn{c.system, c.installed}, nil
}
func (c snapshotConnector) Driver() driver.Driver { return snapshotDriver{} }

type snapshotDriver struct{}

func (snapshotDriver) Open(string) (driver.Conn, error) { return nil, errors.New("use connector") }

type snapshotConn struct {
	system, installed bool
}

func (snapshotConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("unexpected prepare")
}
func (snapshotConn) Close() error              { return nil }
func (snapshotConn) Begin() (driver.Tx, error) { return nil, errors.New("unexpected transaction") }
func (c snapshotConn) QueryContext(_ context.Context, q string, _ []driver.NamedValue) (driver.Rows, error) {
	switch {
	case strings.Contains(q, "to_regprocedure('public.platform_billing_system_workspace"):
		return &snapshotRows{value: c.installed}, nil
	case strings.Contains(q, "platform_billing_system_workspace"):
		return &snapshotRows{value: c.system}, nil
	case strings.Contains(q, "to_regprocedure"):
		return &snapshotRows{value: true}, nil
	case strings.Contains(q, "payment_plan_effective"):
		return &snapshotRows{value: []byte(`{"active":true,"terms":{"features":{"invoices":true,"payment_links":true,"reports":true,"exports":false}},"revision":3}`)}, nil
	default:
		return nil, errors.New("unexpected query: " + q)
	}
}

type snapshotRows struct {
	value driver.Value
	read  bool
}

func (*snapshotRows) Columns() []string { return []string{"value"} }
func (*snapshotRows) Close() error      { return nil }
func (r *snapshotRows) Next(v []driver.Value) error {
	if r.read {
		return io.EOF
	}
	r.read = true
	v[0] = r.value
	return nil
}
func TestPlanSnapshotPreservesFeaturesForSystemReceivingWorkspace(t *testing.T) {
	for _, system := range []bool{false, true} {
		db := sql.OpenDB(snapshotConnector{system: system, installed: true})
		defer db.Close()
		s := &Service{Auth: &authz.Repository{DB: db}}
		raw, err := s.planSnapshot(context.Background(), "3c12457f-01e7-4b85-9269-0244b55c7be4", "live")
		if err != nil {
			t.Fatal(err)
		}
		var p struct {
			Workspace string `json:"workspace_id"`
			Platform  bool   `json:"platform_billing"`
			Fetched   string `json:"fetched_at"`
			Terms     struct {
				Features map[string]bool `json:"features"`
			} `json:"terms"`
		}
		if err = json.Unmarshal(raw, &p); err != nil {
			t.Fatal(err)
		}
		if p.Platform != system || p.Workspace == "" || p.Fetched == "" {
			t.Fatalf("invalid scope/exemption: %s", raw)
		}
		if !p.Terms.Features["invoices"] || !p.Terms.Features["payment_links"] || !p.Terms.Features["reports"] || p.Terms.Features["exports"] {
			t.Fatalf("snapshot lost or broadened plan features: %s", raw)
		}
	}
}

func TestPlanSnapshotNoPlatformReceiverCannotGrantSystemExemption(t *testing.T) {
	db := sql.OpenDB(snapshotConnector{system: true, installed: false})
	defer db.Close()
	s := &Service{Auth: &authz.Repository{DB: db}}
	raw, err := s.planSnapshot(context.Background(), "3c12457f-01e7-4b85-9269-0244b55c7be4", "live")
	if err != nil {
		t.Fatal(err)
	}
	var p map[string]any
	if err := json.Unmarshal(raw, &p); err != nil {
		t.Fatal(err)
	}
	if p["platform_billing"] == true {
		t.Fatalf("missing system receiver granted an exemption: %s", raw)
	}
	terms, ok := p["terms"].(map[string]any)
	if !ok || terms["features"] == nil {
		t.Fatalf("plan features lost when platform receiver is unavailable: %s", raw)
	}
}
