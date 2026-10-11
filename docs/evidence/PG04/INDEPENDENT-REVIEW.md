# PG04 independent verification — 2026-10-11

Reviewed PR #6 head `50909d23f53aa075ef654367bdfc83b117ed324d`, branch `pg04-integrated-current-main-20261011`. At the original review this PR was OPEN; it subsequently merged as 13db19a after the boundary correction. This review does not change the concurrent implementation branch, applied migrations, credentials or financial data.

## Verified evidence

- Inspected actual GitHub Actions run [38135142457](https://github.com/masharzy/ekmivo/actions/runs/38135142457), code SHA `12d80eb327aaad1196c6d71d03062ce6004b7b83`: all four jobs succeeded. Compared that SHA with PR head: only three documentation files differ; application, migrations, tests and CI are identical.
- Actual logs contain `PG04 isolated finance+River PASS: 52 assertions`, real pgx/River integration PASS, migration replay, and production runtime/migration image builds. Read the harness implementing running-job SIGKILL, fresh process recovery and exactly one audit-processing marker.
- Source implements physically separate financial realms, immutable records, amount/FK/dedup guards, transactional River/outbox and idempotent request replay. The worker processes only an internal audit probe; it does not confirm merchant payments or dispatch merchant webhooks.
- No Docker or production migration was run during this review. Existing isolated CI evidence was inspected; it is not a newly repeated local PostgreSQL test.
- Independently exported the exact PR source to a temporary directory and ran `go test ./... -count=1` and `go vet ./...`: both exit 0. All Go package unit tests pass. The PostgreSQL integration test skips locally without its disposable database configuration; its database evidence comes from the inspected CI run, not this local invocation.

## Findings preventing unconditional acceptance

### P1 — inconsistent transaction-time window endpoint (corrected)

In `infra/migrations/0008_pg04_financial_core.sql`, attempt overlap uses `tstzrange(...,'[)')`: the end is excluded. However, `financial_verify_payment_fields` rejects second-precision observations only when `original_transaction_at > window_end`. An observation exactly at the end therefore passes this time check. Adjacent attempts can share that instant under the verification rule despite being nonoverlapping under the issuance rule.

Align the time policy across issuance, matcher and database backstop, and add cases immediately before, exactly at and immediately after the boundary, including adjacent windows and minute precision. This is a source-level finding, not a claim that a live payment was misconfirmed.

### P1 — populated tenant isolation and receipt-negative evidence missing

The harness's no-context reader assertion runs before payment intents are seeded. Seeing zero rows in an empty table does not demonstrate isolation against existing tenant data. Seed at least two tenants, demonstrate the authorized positive read, then wrong-tenant and absent-context denial with the actual restricted reader roles in each realm.

The harness inserts a valid synthetic verified payment, but does not attempt verified-payment inserts with individually wrong payer, receiving account, method, amount, transaction time, outgoing/unknown direction, unknown precision or wrong source provenance. These rules exist in SQL; their negative outcomes are not proven by the current 52 assertions. Add explicit failures and assert no payment/allocation/outbox/job survives each failed transaction.

### P2 — concurrency and rollback assertions narrower than the claims

The 12-way idempotency test races a callback returning a JSON value without creating an intent/outbox/job. Sequential replay separately proves one intent/job. Add a concurrent first-use test whose callback actually inserts the domain row and enqueues River, then assert one of each.

Overlapping attempts and allocation caps are tested sequentially, not with independent competing transactions. Add actual races and final amount/count assertions. The rollback test checks absence of its outbox row but does not explicitly query River to prove absence of the corresponding orphaned job; add that assertion.

## Deployment / scope

PR source evidence explicitly says financial production databases/migrations, projector and worker have not been deployed. Vercel web preview success cannot prove these backend services run. Production acceptance needs independent realm provisioning, reviewed migration, restricted credentials, actual worker/projector startup and isolated synthetic runtime checks. This review does not perform those changes.

Checkout (PG05), actual native receipt collection (PG06), automatic matching (PG07), and merchant webhook delivery (PG08) are later gates, not missing PG04 user-interface work. No fabricated UI acceptance or real provider/device result is claimed.

**Correction verified:** source `1bf4581c216e7cf1bc3aaa56c679591967b5e14b` changes the second-precision end comparison to >= and adds six real database cases. [CI 38142699483](https://github.com/masharzy/ekmivo/actions/runs/38142699483) passes all four jobs and 58 financial assertions. The boundary finding is CLOSED.

**Verdict:** the owner authorized merging this corrected implementation milestone. Stronger automated financial/isolation proof listed above remains pending, and production rollout remains unverified. These technical gaps should not be labelled merely owner manual testing.

### PG04 independent automated follow-up complete — 2026-10-11

Tested source a8fa3c98ddd55196be02a142f34f3f79e2f40597: [CI 38144576645](https://github.com/masharzy/ekmivo/actions/runs/38144576645) all four jobs PASS. Actual isolated PostgreSQL finance/River harness: **107/107 assertions**; separate Go integration cases pass actual competing-connection attempt/funds/intent races and 12-way idempotent intent/outbox/job creation, including explicit orphaned-job rollback denial. Worker running-job SIGKILL/fresh restart still passes. Restricted populated two-tenant readers tested in both physical realms. Sixteen malformed receipt cases deny with no financial effects; valid control case succeeds.

Earlier independent review automated-evidence gaps are CLOSED. PG04 bounded source and available automated verification are complete; production provisioning/migration/projector/worker rollout and real provider/device release evidence remain OPEN. This does not accept PG05 or later PGs. Local full Go unit tests/vet and both Node syntax checks PASS; no local PostgreSQL integration or laptop Docker is claimed. Application/migrations/UI unchanged; only test code and documentation changed.
