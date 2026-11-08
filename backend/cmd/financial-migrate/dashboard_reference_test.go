package main

import (
	"os"
	"path/filepath"
	"sort"
	"testing"
)

func TestDashboardControlCatchupIsOrderedAndComplete(t *testing.T) {
	if !sort.StringsAreSorted(dashboardControlMigrations) {
		t.Fatal("CONTROL migrations must follow filename dependency order")
	}
	seen := map[string]bool{}
	for _, name := range dashboardControlMigrations {
		if seen[name] {
			t.Fatalf("duplicate migration: %s", name)
		}
		seen[name] = true
		if _, err := os.Stat(filepath.Join("..", "..", "..", "infra", "migrations", name)); err != nil {
			t.Fatalf("migration source %s: %v", name, err)
		}
	}
	for _, name := range []string{"0141_briofold_commerce.sql", "0142_briofold_growth_reporting.sql", "0180_briofold_growth_operations.sql", "0191_briofold_crm_search.sql", "0208_briofold_member_channel_scopes.sql", "0223_inbox_blobs_drop.sql", "0227_briofold_customer_orders_link.sql"} {
		if !seen[name] {
			t.Fatalf("missing required CONTROL migration: %s", name)
		}
	}
	for _, name := range []string{"0008_pg04_financial_core.sql", "0010_pg05_checkout.sql"} {
		if seen[name] {
			t.Fatalf("financial migration in CONTROL catch-up: %s", name)
		}
	}
}
