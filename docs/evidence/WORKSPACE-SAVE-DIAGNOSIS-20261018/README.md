# Workspace save / usage diagnosis — 2026-10-18

Target: Easy Education 02 (`56ff9817-40ac-41ec-9ebf-14009cc7e3eb`). Payments enabled; AI disabled.

## Confirmed causes and fixes

1. The new Admin usage handler queried `merchant_api_keys` and `workspace_members` directly through the restricted Go control connection. That role cannot SELECT either table. This caused missing API-key/member counts. Added 0094 with a Super Admin checked, aggregate-only SECURITY DEFINER function; runtime table isolation remains intact. Isolated Neon test using the actual `ekmivo_financial_runtime` login returned keys=0, members=1; a non-admin actor was denied. Both database install and backend query must be deployed for this fix.
2. Draft navigation synchronously rechecked `isDirty` after save/discard callbacks that schedule React state updates. This falsely reported the first successful action as a failure. Navigation now trusts successful callbacks and continues to block false/throwing callbacks. Deferred-state regressions passed. API-key local drafts also track their saved baseline.
3. Account mutations suppressed every error as "Unable to save changes", and the modal hid the page-level error. Now show localized actionable messages, safe backend/HTTP codes and correlation IDs inside the open modal. An uncertain gateway/network save directs users to refresh before retrying, without claiming the mutation did not commit. A name-only follow-up failure is distinguished from a successful account create. Duplicate in-flight submissions are blocked.
4. Added existing privacy-preserving API activity recording for receiving-account/device operations. Database errors log only SQLSTATE, routine and table names, never parameter values, phone numbers, SMS, secrets or SQL text.
5. Usage table columns wrap within mobile width; resource labels no longer require horizontal scrolling.

## Workspace findings

- Effective Starter plan active at inspection: 500 payments/period, 2 receiving accounts, 1 device, 3 API keys, 2 team members.
- Current live receiving accounts: 0; non-revoked physical phones: 1; live valid API keys: 0; members: 1.
- Account limit was NOT exhausted. The same `pg06_account` flow with a test ciphertext succeeded on the isolated Neon live branch as its actual finance-reader login; a deliberately raised/caught exception rolled back the test row. This is database-path verification, not proof of a successful owner HTTP mutation.
- Device usage is at the purchased limit; attempting an additional enrollment can produce a plan-limit denial. The existing phone should use reconnect. No limits were raised or bypassed.

## Historical 502/503 investigation

At the screenshot's approximate 12:23 Bangladesh time (06:23 UTC), Render 06:10–06:35 UTC metrics showed CPU 0.014–0.016 core against 0.15 core and memory approximately 24–25 MB against 512 MB. Those samples do not support CPU/memory exhaustion as the cause. They do not rule out an unobserved transient event.

Render searches returned no matching historical error/request records; HTTP count series were empty. Vercel rejected the historical runtime-log window because the Hobby retention period had elapsed. The old account-save and device 502/503 request-level causes therefore remain UNCONFIRMED. A missing log is not proof that no errors occurred. Do not call the issue fixed solely because an isolated SQL insert worked.

## Checks

- 38 Node regression tests passed, including error classification, role/session and workspace product visibility.
- Draft smoke passed, including deferred React save/discard, actual failed save/discard and registry cleanup.
- Go tests passed; database-env integration tests skip when their DSNs are absent.
- Isolated Neon actual-role aggregate and account-create checks passed.
- Physical device / owner browser verification was not performed, per owner instruction.

## Activation

Migration 0094 was applied to production control with the existing migration lock and exact SHA-256 ledger entry. Production restricted-runtime execution returned `api_keys=0`, `team_members=1` for the target workspace. Proxy diagnostics preserve a generated correlation header on upstream/network failures and log only route templates/error classes. No automatic retry of financial writes was introduced.

## Follow-up: account conflict identified

Owner supplied correlation `c6544ceaa140808a848e2d95`. Production activity confirms POST receiving-account operation returned 409 at 07:39:07 UTC. Render logs show SQLSTATE 23505 on `financial_receiving_accounts` at that time. The target workspace has no receiving-account rows. Schema inspection found the additional global unique index `financial_exclusive_receiving_identity(environment,method,identity_hmac)`, beyond the workspace-local constraint. Thus a receiving identity in another workspace conflicts even when the current list is empty. The generic message failed to explain this distinction.

Map that exact constraint to `RECEIVING_ACCOUNT_IN_USE` with an explicit cross-workspace message in both languages; retain generic conflict for other unique constraints. Safe diagnostics now also include the constraint name. Preserve the existing global exclusivity policy, immutable financial history and other workspace records. No accounts were moved, deleted or disclosed in the user response. This explains the newly observed 409; it does not retrospectively prove a cause for old 502/503 responses.
