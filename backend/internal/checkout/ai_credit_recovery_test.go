package checkout

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"strings"
	"testing"
	"time"
)

type topupTestRow struct {
	body []byte
	err  error
}

func (r topupTestRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	*dest[0].(*[]byte) = r.body
	return nil
}

type topupTestDB struct{ query func(string, ...any) pgx.Row }

func (db topupTestDB) QueryRow(_ context.Context, q string, args ...any) pgx.Row {
	return db.query(q, args...)
}

const recoveryWorkspace = "10000000-0000-4000-8000-000000000001"
const recoveryReceiver = "10000000-0000-4000-8000-000000000002"
const recoveryTopup = "10000000-0000-4000-8000-000000000003"
const recoveryPayment = "10000000-0000-4000-8000-000000000004"
const recoveryDigest = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func recoveryQueue() []byte {
	return []byte(`[{"id":"` + recoveryTopup + `","workspace_id":"` + recoveryWorkspace + `","receiving_workspace_id":"` + recoveryReceiver + `","amount_minor":1000,"checkout_token_digest":"` + recoveryDigest + `"}]`)
}
func TestAITopupRecoveryOnlyCreditsAuthoritativeExactProof(t *testing.T) {
	key := []byte("rotated-test-key-with-no-original-secrets")
	valid := billingPaymentProof{ID: recoveryPayment, Workspace: recoveryReceiver, Amount: 1000, At: time.Now().UTC()}
	for _, tc := range []struct {
		name                  string
		proof                 []byte
		wantCredit, wantError bool
	}{
		{"unpaid", []byte("null"), false, false},
		{"malformed", []byte("{"), false, true},
		{"missing fields", []byte("{}"), false, true},
		{"wrong receiver", func() []byte { p := valid; p.Workspace = recoveryWorkspace; b, _ := json.Marshal(p); return b }(), false, true},
		{"wrong amount", func() []byte { p := valid; p.Amount++; b, _ := json.Marshal(p); return b }(), false, true},
		{"verified", func() []byte { b, _ := json.Marshal(valid); return b }(), true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			credits := 0
			control := topupTestDB{query: func(q string, args ...any) pgx.Row {
				if strings.Contains(q, "claim_pending") {
					return topupTestRow{body: recoveryQueue()}
				}
				credits++
				if len(args) != 4 || args[0] != recoveryWorkspace || args[1] != recoveryTopup || args[2] != recoveryPayment || args[3] != int64(1000) {
					t.Fatal("credit proof scope changed")
				}
				return topupTestRow{body: []byte(`{"credited":true,"balance_minor":1000}`)}
			}}
			finance := topupTestDB{query: func(q string, args ...any) pgx.Row {
				expected := recoveryDigest
				if q != "SELECT pg13_platform_payment($1)" || len(args) != 1 || args[0] != expected {
					t.Fatal("wrong authoritative proof lookup")
				}
				return topupTestRow{body: tc.proof}
			}}
			err := reconcileAITopups(context.Background(), control, finance, key, "live", true)
			if (err != nil) != tc.wantError {
				t.Fatalf("unexpected recovery error: %v", err)
			}
			if (credits == 1) != tc.wantCredit {
				t.Fatalf("credit calls = %d", credits)
			}
		})
	}
}

func TestAITopupRecoveryNeverRunsInSandboxOrWhenDisabled(t *testing.T) {
	if err := reconcileAITopups(context.Background(), nil, nil, nil, "sandbox", true); err != nil {
		t.Fatal(err)
	}
	if err := reconcileAITopups(context.Background(), nil, nil, nil, "live", false); err != nil {
		t.Fatal(err)
	}
	if err := reconcileAITopups(context.Background(), nil, nil, nil, "live", true); err == nil {
		t.Fatal("enabled recovery silently accepted missing services")
	}
}

func TestAITopupRecoveryRejectsBadQueueAndContinuesAfterProofFailure(t *testing.T) {
	key := []byte("rotated-test-key-with-no-original-secrets")
	credits := 0
	lookups := 0
	queue := strings.TrimSuffix(string(recoveryQueue()), "]") + `,{"id":"10000000-0000-4000-8000-000000000005","workspace_id":"` + recoveryWorkspace + `","receiving_workspace_id":"` + recoveryReceiver + `","amount_minor":1000,"checkout_token_digest":"` + recoveryDigest + `"}]`
	control := topupTestDB{query: func(q string, args ...any) pgx.Row {
		if strings.Contains(q, "claim_pending") {
			return topupTestRow{body: []byte(queue)}
		}
		credits++
		return topupTestRow{body: []byte(`{"credited":true,"balance_minor":1000}`)}
	}}
	finance := topupTestDB{query: func(string, ...any) pgx.Row {
		lookups++
		if lookups == 1 {
			return topupTestRow{err: errors.New("temporary source outage")}
		}
		raw, _ := json.Marshal(billingPaymentProof{ID: recoveryPayment, Workspace: recoveryReceiver, Amount: 1000, At: time.Now().UTC()})
		return topupTestRow{body: raw}
	}}
	if err := reconcileAITopups(context.Background(), control, finance, key, "live", true); err == nil || credits != 1 || lookups != 2 {
		t.Fatal("one failure blocked other accepted purchases")
	}
	for _, raw := range []string{"{}", "null", "[{}]"} {
		control.query = func(string, ...any) pgx.Row { return topupTestRow{body: []byte(raw)} }
		if err := reconcileAITopups(context.Background(), control, finance, key, "live", true); err == nil {
			t.Fatal("invalid recovery queue accepted")
		}
	}
}
