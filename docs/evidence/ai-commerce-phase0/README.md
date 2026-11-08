# AI Commerce Core — Phase 0

Status: OPEN (2026-11-08). Baseline a3df78814c66e87af201ba7cc07605a7d0973670.

## Fix and validation

The pending navigation route lived in React state while the destination Store lived in a ref. Keeping both in one atomic state object removes the React refs render failure without changing the sidebar helper, either DOM mount point, styling, or navigation inventory. Hook dependencies now include the stable setter.

- Reproduced baseline errors at dashboard-frame.tsx:329–330.
- Focused/full web ESLint: PASS. TypeScript: PASS.
- 51 existing navigation/settings/inbox-draft/responsive/Store contract tests: PASS (no skips).
- Existing main CI 42504982825 Go compile/unit tests: PASS. This is baseline evidence, not this PR's CI.
- Local production build: PASS (webpack compile, TypeScript, prerender and route generation). This PR CI: pending. Local full Go run was stopped after a denied shared cache and slow isolated-cache rebuild; no local Go pass claimed.

## Database audit

Neon Ekmivo production, CONTROL database ekmivo: commerce_orders and briofold_customers_search absent. 32 dashboard_reference_migrations checksums match repository LF bytes. The ledger covers only part of deployment history. migration-audit.json inventories all 209 files, ledger checksums, and CREATE TABLE/FUNCTION anchors. Presence is not proof of latest function/ALTER version. Financial objects absent from CONTROL are expected; inbox_blobs was intentionally removed by 0223.

## Isolated SQL evidence

Existing test-customer-orders-20261108, br-frosty-mountain-b39lqauo, database ekmivo only. First atomic DO rehearsal executed 29 missing-anchor migrations through 0211, checked orders/search, then raised PHASE0_ROLLBACK_VERIFIED. Expanded rehearsal executed 35 through 0227, checked briofold_customer_orders, then raised PHASE0_FULL_ROLLBACK_VERIFIED. Both intentional exceptions rolled everything back. Top-level BEGIN/COMMIT boundaries were removed; SQL otherwise unchanged. Post-rehearsal query confirmed orders/search stayed absent. Production was read-only.

- 0141_briofold_commerce.sql
- 0142_briofold_growth_reporting.sql
- 0180_briofold_growth_operations.sql
- 0181_briofold_growth_analytics_exports.sql
- 0182_briofold_growth_consent_safety.sql
- 0183_briofold_signed_channel_optouts.sql
- 0184_briofold_order_assignment.sql
- 0185_briofold_order_barcode_search.sql
- 0186_briofold_order_reporting.sql
- 0187_briofold_assignment_viewer_privacy.sql
- 0188_briofold_unified_activity.sql
- 0191_briofold_crm_search.sql
- 0192_briofold_followup_scheduling.sql
- 0194_briofold_response_reporting.sql
- 0195_briofold_product_operational_analytics.sql
- 0196_briofold_team_groups.sql
- 0197_briofold_saved_reply_sequences.sql
- 0198_briofold_feedback_screenshots.sql
- 0199_briofold_unconverted_interest.sql
- 0200_briofold_help_videos.sql
- 0202_briofold_channel_policies.sql
- 0203_briofold_linked_order_conversion.sql
- 0204_briofold_product_photo_search.sql
- 0205_briofold_pathao_courier.sql
- 0206_briofold_woo_webhook_sources.sql
- 0207_briofold_broadcast_dispatch.sql
- 0208_briofold_member_channel_scopes.sql
- 0209_briofold_broadcast_optin_offers.sql
- 0211_briofold_consent_scope_runtime.sql
- 0219_inbox_telegram_no_reply_window.sql
- 0221_inbox_media_refresh_metadata.sql
- 0224_inbox_telegram_delivered_on_send.sql
- 0225_inbox_delivered_watermark.sql
- 0226_inbox_realtime_avatars.sql
- 0227_briofold_customer_orders_link.sql

## Open gates and rollback

Neon rejects snapshots of non-root branches (HTTP 400); creating a no-compute checkpoint child also failed, branch quota exceeded (HTTP 422). No branch was reset/deleted. The required pre-migration backup is therefore unavailable and permanent catch-up was not applied. The rollback rehearsals do NOT prove durable application or a checksum-protected idempotent second run.

- [ ] This PR CI green: Go, web lint/build, isolated PostgreSQL smoke.
- [x] Production inventory and recorded checksum evidence.
- [x] Authorized isolated SQL rollback rehearsal.
- [ ] Complete ALTER/function-version reconciliation, backed-up durable catch-up, coordinator second run.

0227 has non-idempotent ADD COLUMN/CREATE FUNCTION statements. Use the existing checksummed migration coordinator for durable execution; raw SQL must not be replayed twice. Rehearsal rollback is automatic. Future committed rollout needs a reviewed backup/checkpoint and restore plan, never dropping commerce tables as rollback. New customer/payment function authorization/PII behavior remains unaccepted.

Keep qwen/qwen3.8-omni-flash on the existing OpenRouter route; no direct-provider allowlist/model setting changes. No production writes, merge/deploy, feature activation, or Phase 1 implementation. Foundation fix introduces no selling behavior and requires no selling feature flag. Phase 0 stays OPEN.
