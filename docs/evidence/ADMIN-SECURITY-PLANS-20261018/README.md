# Admin security and plan audit — 2026-10-18

## Implemented

- Untrusted sign-in requires MFA before Admin data access. Verified active sessions have no periodic ten-minute/twelve-hour MFA timeout. Optional trust lasts 30 days and uses a hashed, random, HttpOnly credential. Device revoke signs out linked sessions. Role changes and MFA recovery/reset revoke device trust. Failed recovery does not revoke trust.
- Settings exposes role management and trusted devices without adding sidebar options. Role checks apply to navigation, pages, actions and support SQL. Support and analyst have different permissions. Privileged writes remain Super Admin only.
- Plan wizard has compact Admin styling, accessible placeholder fields, simpler copy, full-draft validation and review. Whole-taka amounts omit trailing decimal zeros.
- Plan features gate merchant navigation, direct list/detail pages, export controls, Go APIs, private database functions and queued export/invoice delivery. Existing public payment completion remains available.
- Inter is served locally; Bengali uses existing Hind Siliguri. Security dialogs use Admin classes. Temporary QA route removed.
- Additive migrations 0089/0090 control and 0091/0092 both financial realms are included in the existing migration coordinator's dashboard-reference mode.

## Automated evidence

- `node --test tools/testing/admin-session-policy.test.mjs tools/testing/platform-admin-automated.test.mjs`: 25 passed.
- `go test ./...`: passed. Tests requiring database environment variables skip without those variables; this is not a live Go/API integration pass.
- `python apps/web/scripts/verify-admin-design.py`: passed. This is a structural design check, not a visual comparison.
- Web TypeScript/build passed; lint has existing warnings, with no errors after fixing the new trusted-device component.
- Isolated Neon branch: `test-managed-plans-final-20261016` (`br-still-fog-b38to82q`). Control trusted-device schema and support role guard verified. Financial guards present in both realms. Live SQL checks passed: each of four features denied when disabled, allowed when enabled, missing snapshot denied; direct invoice/link/report/export/contact functions denied with disabled features.
- SQL guard checks only set transaction-local values; no production data was changed.

## Not claimed / pending

- Production migration/deployment and real production API integration have not been performed in this turn.
- Physical-device verification belongs to the owner. Browser/visual/responsive QA was excluded by the owner's latest instruction to run code-level checks only; pixel parity is not claimed.
- Cross-device push approval is not implemented. New untrusted devices use mandatory authenticator MFA; this is the owner's clarified required login rule.
- This evidence does not certify every legacy Admin route or every existing feature as production-complete.

## Workspace usage follow-up

Usage & credits now renders sections only for enabled products. Payment gateway shows the effective purchased plan, current quota period, successful/reserved payments, active receiving accounts, devices, live API keys, team members and active unpaid checkouts against plan limits, plus remaining allowances. It returns aggregate counts only. AI retains the real credit balance and explicitly does not claim metered AI usage.

- Six additional component tests passed for all four product combinations, limits/remaining arithmetic and unavailable-source behavior (31 tests total).
- Production web build and targeted lint passed (one existing unused-variable warning in inventory).
- New migration 0093 tested on the isolated Neon live financial branch: aggregate fields present, receiving-account count equals the underlying active count, cross-workspace scope rejected. The existing migration runner includes 0093 for both financial realms.
- Production migration/deploy is separate from this source push and is not claimed here.

## Production activation — 2026-10-18

Owner explicitly requested activation after the deployment inspection. Applied 0089/0090 to production control and 0091/0092/0093 to production sandbox and live financial databases on `br-solitary-river-b3ztvg8j`, using per-realm transactions, a five-second lock timeout, the existing advisory migration lock, and exact source SHA-256 entries in `dashboard_reference_migrations`. Post-apply checks verified the trusted-device table and session link, support role guard, both financial feature/usage functions, finance-reader execution permission, and all eight per-realm ledger entries. No payment records were deleted or modified.

Vercel production alias was READY on `3a7bf701a8f511f2cc695b8f1adfd3df5df7551e`; Render deploy `dep-dba6vmh42hec73dad1ag` was live on the same commit. Authenticated end-user interactions and physical-device checks remain owner verification. Render error-log inspection was unavailable because the connector had no selected workspace; no clean-log claim is made.
