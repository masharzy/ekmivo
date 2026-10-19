# New workspace first-load projection race — 19 October 2026

## Cause and scope
New Google/password accounts create the workspace in the control database before financial data reads begin. The hosted authoritative projection reconciler polls every **20 seconds**. Before the new registry row exists, `pg06_scope` returned SQLSTATE 42501, indistinguishable from real access denial. RSC seeds retained that error; refresh after the background sync worked. Reproduced missing-row -> 42501 on the isolated financial branch before applying this change. Production request/correlation logs for the user's screenshot were unavailable, so the exact screenshot HTTP status is not asserted. New workspaces currently have no active paid subscription; legitimate plan restrictions remain separate from this initialization race.

## Fix
- Additive financial migration 0107 distinguishes a correctly bound but absent registry row (`P0401`) from wrong scope, wrong physical realm, or actual suspension (`42501`). Original pg06_scope owner and ACL preserved. New void readiness probe granted only to the existing reader role, not public; no reader provisioning/table-write privileges.
- Every checkout scoped transaction runs the probe before domain reads/writes. On P0401 only, roll back, perform one authoritative workspace/realm sync through the existing restricted provisioner credentials, then retry once. Eight-second repair budget; concurrent requests coalesce per workspace/realm. Real authorization/plan/database errors do not retry.
- Reuses the existing coordinator and preflight checks. Background reconciliation remains operational; on-demand sync never grants membership, products or plans and does not copy identity information. Failure stays fail-closed as 503 WORKSPACE_INITIALIZING + Retry-After, not fabricated zero data.
- No client auto-retry loop, new permanent cache, blanket 403 suppression, or disabled permission checks.

## Verification
- Full Go `go test ./...` passed. Four targeted tests cover successful bounded one-time repair, non-retry for authorization/plan/conflict/database errors, failed/repeated repair, and accurate retryable HTTP mapping. External-env integration tests can skip; SQL evidence below was executed separately.
- Migration applied to both isolated Neon finance databases on br-still-fog-b38to82q. Actual rollback-only SQL fixture verifies missing readiness, immediate sync/read without waiting for the periodic worker, idempotency, stale-version rejection, suspension, cross-workspace/realm denial, and preserved reader/provisioner separation.
- No production synthetic users/workspaces/payments. Owner's new-account browser check remains manual; no historical screenshot status, real-device, or UI E2E claim.

Reproduce fixture: tools/testing/workspace-projection-readiness.sql (isolated branch only).
