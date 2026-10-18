# Dashboard plan limits — 18 October 2026

Owner requested plan-specific dashboard Add/Create restrictions and useful bilingual messages. Work resumed after reviewing remote main changes #80, #81 and #82 (Store/Team redesign, workspace rename, checkout preview/provider icons). Those changes were fast-forwarded and preserved. The Team quota controls were reapplied to the new Team markup. Unpublished quota migrations originally numbered 0097/0098 were renamed 0101/0102 to avoid the other release's migrations; no applied migration was edited.

## Behavior
- Receiving accounts, SMS devices, active Live API keys and team seats show used/plan limit. At capacity or on an inactive plan, Add/Create is disabled with View plans and Refresh. Missing usage is unavailable, never zero or unlimited. Account enable and device reconnect remain authoritative server checks; cleanup/revoke/delete and existing reads remain available.
- Pending invitations reserve a seat including the owner; accepting converts that reservation into one member. Creating or renewing an expired invitation cannot bypass capacity. Duplicate active invitations are rejected. Initial workspace owner bootstrap is preserved, and AI-only workspaces are not assigned an invented payment-plan quota.
- Device reconnect/expired pairing reissue and account re-enable enforce the same fresh effective quota as insertion. Expired unlimited plans cannot add resources. Key rotation replaces an existing credential without consuming an additional slot, including when renewal is needed; revoke remains possible.
- One-time payment requests show successful+reserved period usage, extra purchased allowance and independent active checkout capacity. Existing monthly, active-checkout, per-minute, subscription and feature errors use clear EN/BN guidance in requests/documents rather than raw plan codes.
- Explicit system billing workspace exemptions and test-resource sandbox exemptions are preserved. Shared team seats cannot bypass quota through a sandbox URL.
- Initial counts are server-rendered through existing request-local initial reads. The session-authorized aggregate endpoint exposes no account/device/key identity or secrets. Mutation/focus refreshes are scope-bound and ignore older responses. Pairing expiry refreshes capacity. The web proxy explicitly permits billing/limits while retaining its route allowlist.

## Database/code verification
- Rollback-only isolated Neon control fixture: first owner, invitation reservation, cap rejection, expired-invitation renewal cap, invitation acceptance, member and API-key limits, credential replacement on an expired plan, expired-plan create denial and cross-tenant aggregate denial.
- Rollback-only isolated financial fixture: account add cap, disable/re-enable, device insertion, reconnect/reissue cap, cleanup/reconnect recovery and inactive unlimited-plan denial. Sandbox migration execution passed independently. Old reconnect migration 0086 was applied only to the isolated branch where missing as a test prerequisite; it was already present in production.
- Unit tests cover finite/unlimited/zero limits, missing counts, inactive plans, explicit exemption, sandbox/shared team, pending seats, monthly reserved/extra allowance, active checkout cap, bilingual error copy and web-proxy routing. Existing checkout logo tests, draft smoke, Admin reference checker and responsive CSS cascade checks passed.
- Full Go suite and Next production build passed on updated main. Targeted lint: zero errors; preexisting image/unused-variable warnings remain.
- Browser/physical-device behavior was not exercised. No real receiving number, subscription, device or financial history was changed for verification.

Production rollout: control 0101 and financial 0102 applied independently to Live and Sandbox with checksum ledger entries. Actual runtime aggregate EXECUTE verified; raw key/member SELECT remains denied. No real merchant plan terms or resources were changed for tests.
