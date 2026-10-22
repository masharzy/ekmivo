# Store-first subscription checkout Phase 7 — release gate evidence

**Status: NOT SEALED / NOT MERGED / NOT DEPLOYED** pending exact-head Phase 7 CI, predecessor seals and acceptance. Filename is an evidence locator, not an assertion of completion.

## Scope and provenance

- Ekmivo Store-first checkout **Phase 7, last phase (0–7)**, release branch `agents/store-subscription-phase7-release`.
- Phase 6 integrated source currently includes Phase 3 coupon, Phase 4 intent and Phase 5 Order Summary changes, with unapplied SQL 0153 and 0154 in the control database only.
- Phase 7 adds a read-only, MFA-protected Super Admin recovery view, role-checked narrow SQL functions, monitored exception and coupon exports, CSV injection defense and export audit, isolated PostgreSQL regression, focused release CI, and controlled rollback runbook.
- Existing merchant checkout stays independent. No provider credential, money movement, production schema application, or feature-flag activation is part of this PR.

## Actual automated evidence

- Prior Phase 6 focused exact-head `02af897`: [run 39743889358](https://github.com/masharzy/ekmivo/actions/runs/39743889358) **SUCCESS** including Go race, Next build, actual isolated PostgreSQL Phase 3–6 fixture.
- Prior Phase 6 Foundation `02af897`: [run 39743898415](https://github.com/masharzy/ekmivo/actions/runs/39743898415) **FAILED** because two older contract tests still target the removed `[intent]` route; fixed in newer Phase 6 `fe38d0e`, whose CI must be checked separately.
- Phase 7 new workflow `.github/workflows/store-subscription-phase7.yml`: NOT RUN until branch publication.
- Phase 7 PostgreSQL `0154` smoke including Super Admin denial, runtime direct table denial, paid/late-money and coupon audit, and SQL-filter injection: NOT RUN until CI.
- Phase 7 browser real API EN/BN/theme/width/zoom full acceptance: OPEN. Prior synthetic layout checks are not equivalent to current real API-backed browser verification.
- Separate financial-control isolated real money/provider proof: OPEN; no production fixtures permitted.

## Gates still open

1. Exact SHA on Phase 7 draft PR, focused workflow and Foundation CI green for this *same* SHA, with migrations parsed and isolated PostgreSQL tests passing.
2. Verified dependency order, including Phase 6 final code-level seal. Dependency branches remain draft/unmerged; no production release.
3. API-backed browser quote → coupon → consent → payment handoff/response and merchant isolation, wallet account allowlisting and legal accessibility matrix. Real provider/device acceptance and production cutover are separately owned by user/operator.

After every automated gate is green, update this document to **PHASE 7 — CODE-LEVEL SEALED**, with exact immutable SHA/job links. Do not write SEALED based on file name or green checks against an older SHA.
