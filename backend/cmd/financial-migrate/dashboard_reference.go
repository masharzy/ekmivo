package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CONTROL catch-up stays in the existing checksum-protected coordinator.
// 0212–0218 are preinstalled prerequisites on the supported deployment baseline.
var dashboardControlMigrations = []string{
	"0069_dashboard_preferences.sql",
	"0073_dashboard_support_topic.sql",
	"0074_checkout_themes.sql",
	"0076_dashboard_billing.sql",
	"0089_admin_trusted_devices.sql",
	"0090_admin_support_roles.sql",
	"0094_admin_control_resource_usage.sql",
	"0096_platform_receiving_workspace.sql",
	"0101_dashboard_control_plan_limits.sql",
	"0103_system_workspace_unlimited.sql",
	"0104_system_workspace_subscription_cleanup.sql",
	"0105_buyer_upgrade_timing.sql",
	"0106_google_login.sql",
	"0133_platform_subscription_checkout_foundation.sql",
	"0134_platform_subscription_coupon_admin.sql",
	"0135_subscription_coupon_admin_audit_subject_fix.sql",
	"0140_platform_subscription_policy_catalog.sql",
	"0141_briofold_commerce.sql",
	"0141_platform_subscription_policy_lock_concat_fix.sql",
	"0142_briofold_growth_reporting.sql",
	"0142_platform_subscription_policy_kind_qualification.sql",
	"0143_platform_subscription_offer_admin.sql",
	"0144_platform_subscription_public_catalog.sql",
	"0145_platform_subscription_coupon_versions.sql",
	"0146_platform_subscription_coupon_lifecycle.sql",
	"0147_platform_subscription_coupon_restrictions.sql",
	"0148_platform_subscription_coupon_tax_requote.sql",
	"0149_platform_subscription_coupon_quote_read.sql",
	"0151_phase4_durable_purchase_intents.sql",
	"0152_platform_subscription_order_summary.sql",
	"0153_platform_subscription_payment_handoff.sql",
	"0154_platform_subscription_release_operations.sql",
	"0155_platform_subscription_safe_runtime_grants.sql",
	"0156_web_runtime_least_privilege.sql",
	"0180_briofold_growth_operations.sql",
	"0181_briofold_growth_analytics_exports.sql",
	"0182_briofold_growth_consent_safety.sql",
	"0183_briofold_signed_channel_optouts.sql",
	"0184_briofold_order_assignment.sql",
	"0185_briofold_order_barcode_search.sql",
	"0186_briofold_order_reporting.sql",
	"0187_briofold_assignment_viewer_privacy.sql",
	"0188_briofold_unified_activity.sql",
	"0189_briofold_crm_viewer_privacy.sql",
	"0190_briofold_feedback_topics.sql",
	"0191_briofold_crm_search.sql",
	"0192_briofold_followup_scheduling.sql",
	"0193_briofold_inbox_filters.sql",
	"0194_briofold_response_reporting.sql",
	"0195_briofold_product_operational_analytics.sql",
	"0196_briofold_team_groups.sql",
	"0197_briofold_saved_reply_sequences.sql",
	"0198_briofold_feedback_screenshots.sql",
	"0199_briofold_unconverted_interest.sql",
	"0200_briofold_help_videos.sql",
	"0201_briofold_waiting_reply_truth.sql",
	"0202_briofold_channel_policies.sql",
	"0203_briofold_linked_order_conversion.sql",
	"0204_briofold_product_photo_search.sql",
	"0205_briofold_pathao_courier.sql",
	"0206_briofold_woo_webhook_sources.sql",
	"0207_briofold_broadcast_dispatch.sql",
	"0208_briofold_member_channel_scopes.sql",
	"0209_briofold_broadcast_optin_offers.sql",
	"0210_briofold_sender_guard_precedence.sql",
	"0211_briofold_consent_scope_runtime.sql",
	"0219_inbox_telegram_no_reply_window.sql",
	"0220_inbox_window_execution_grants.sql",
	"0221_inbox_media_refresh_metadata.sql",
	"0222_inbox_transient_blobs.sql",
	"0223_inbox_blobs_drop.sql",
	"0224_inbox_telegram_delivered_on_send.sql",
	"0225_inbox_delivered_watermark.sql",
	"0226_inbox_realtime_avatars.sql",
	"0227_briofold_customer_orders_link.sql",
	"0228_briofold_catalog_search.sql",
}

// Explicit release mode in the existing coordinator; never runs at API startup.
// The checksum ledger is shared with the authorized connector rollout.
func migrateDashboardReference(ctx context.Context) error {
	dir := os.Getenv("DASHBOARD_REFERENCE_MIGRATION_DIR")
	if dir == "" {
		return errors.New("DASHBOARD_REFERENCE_MIGRATION_DIR is required")
	}
	targets := []struct {
		realm, dsn string
		files      []string
	}{
		{"control", os.Getenv("PG04_CONTROL_MIGRATION_DATABASE_URL"), dashboardControlMigrations},
		{"sandbox", os.Getenv("PG04_SANDBOX_MIGRATION_DATABASE_URL"), []string{"0070_dashboard_link_actions.sql", "0071_dashboard_phone_counts.sql", "0072_dashboard_notification_read_all.sql", "0075_checkout_customer_details.sql", "0077_dashboard_billing_usage.sql", "0078_invoice_numbers.sql", "0079_public_invoice_details.sql", "0080_invoice_public_draft.sql", "0081_public_invoice_receipts.sql", "0086_phone_reconnect_delete.sql", "0091_plan_feature_enforcement.sql", "0092_plan_document_feature_guards.sql", "0093_payment_plan_resource_usage.sql", "0095_receiving_account_consent_delete.sql", "0102_dashboard_financial_plan_limits.sql", "0107_workspace_projection_readiness.sql", "0108_pending_phone_receipt_recovery.sql", "0109_checkout_return_origin.sql"}},
		{"live", os.Getenv("PG04_LIVE_MIGRATION_DATABASE_URL"), []string{"0070_dashboard_link_actions.sql", "0071_dashboard_phone_counts.sql", "0072_dashboard_notification_read_all.sql", "0075_checkout_customer_details.sql", "0077_dashboard_billing_usage.sql", "0078_invoice_numbers.sql", "0079_public_invoice_details.sql", "0080_invoice_public_draft.sql", "0081_public_invoice_receipts.sql", "0086_phone_reconnect_delete.sql", "0091_plan_feature_enforcement.sql", "0092_plan_document_feature_guards.sql", "0093_payment_plan_resource_usage.sql", "0095_receiving_account_consent_delete.sql", "0102_dashboard_financial_plan_limits.sql", "0107_workspace_projection_readiness.sql", "0108_pending_phone_receipt_recovery.sql", "0109_checkout_return_origin.sql"}},
	}
	seen := map[string]bool{}
	for _, target := range targets {
		identity, _, err := inspectDSN(target.dsn)
		if err != nil {
			return err
		}
		if seen[identity] {
			return errors.New("three independent migration databases required")
		}
		seen[identity] = true
	}
	boundary := regexp.MustCompile(`(?m)^(BEGIN|COMMIT);\s*$`)
	for _, target := range targets {
		pool, err := pgxpool.New(ctx, target.dsn)
		if err != nil {
			return err
		}
		err = func() error {
			defer pool.Close()
			tx, err := pool.Begin(ctx)
			if err != nil {
				return err
			}
			defer tx.Rollback(ctx)
			var auth, finance, owner bool
			if err = tx.QueryRow(ctx, `SELECT to_regclass('public.auth_sessions') IS NOT NULL,to_regclass('public.financial_realm') IS NOT NULL,EXISTS(SELECT 1 FROM pg_class WHERE oid=CASE WHEN $1='control' THEN to_regclass('public.pg13_plans') ELSE to_regclass('public.financial_realm') END AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))`, target.realm).Scan(&auth, &finance, &owner); err != nil {
				return err
			}
			if !owner || target.realm == "control" && (!auth || finance) || target.realm != "control" && (auth || !finance) {
				return errors.New("wrong schema or non-owner migration connection")
			}
			if target.realm != "control" {
				var realm string
				if err = tx.QueryRow(ctx, "SELECT environment FROM financial_realm WHERE singleton").Scan(&realm); err != nil || realm != target.realm {
					return errors.New("wrong financial realm")
				}
			}
			if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('dashboard-reference-20261017',0))`); err != nil {
				return err
			}
			if _, err = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS dashboard_reference_migrations(filename text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
				return err
			}
			if _, err = tx.Exec(ctx, `REVOKE ALL ON dashboard_reference_migrations FROM PUBLIC`); err != nil {
				return err
			}
			if _, err = tx.Exec(ctx, `SET LOCAL lock_timeout='5s'`); err != nil {
				return err
			}
			for _, file := range target.files {
				body, err := os.ReadFile(filepath.Join(dir, file))
				if err != nil {
					return err
				}
				digest := sha256.Sum256(body)
				checksum := hex.EncodeToString(digest[:])
				var installed bool
				if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM dashboard_reference_migrations WHERE filename=$1)`, file).Scan(&installed); err != nil {
					return err
				}
				if installed {
					var saved string
					if err = tx.QueryRow(ctx, `SELECT sha256 FROM dashboard_reference_migrations WHERE filename=$1`, file).Scan(&saved); err != nil {
						return err
					}
					if saved != checksum {
						return fmt.Errorf("%s checksum mismatch", file)
					}
					continue
				}
				// PgConn simple protocol supports the reviewed multi-statement SQL file.
				if _, err = tx.Conn().PgConn().Exec(ctx, boundary.ReplaceAllString(string(body), "")).ReadAll(); err != nil {
					return fmt.Errorf("%s: %w", file, err)
				}
				if _, err = tx.Exec(ctx, `INSERT INTO dashboard_reference_migrations(filename,sha256) VALUES($1,$2)`, file, checksum); err != nil {
					return err
				}
			}
			return tx.Commit(ctx)
		}()
		if err != nil {
			return fmt.Errorf("dashboard reference %s: %w", target.realm, err)
		}
	}
	return nil
}
