# Store-first subscription checkout Phase 7 — CODE-LEVEL SEALED

**Status: PHASE 7 — CODE-LEVEL SEALED / NOT MERGED / NOT DEPLOYED.** The automated acceptance gates passed at immutable implementation SHA `1c793cd67910b8d5621322a4dfab6471ae7e2455` on 2026-10-22. This is a code-level seal, **not** approval to apply migrations, activate flags, process real provider money or cut over production. Physical/provider validation and operator release authorization are still open.

## Immutable implementation and ancestry

- Repository `masharzy/ekmivo`; release branch `agents/store-subscription-phase7-release`; draft [PR #143](https://github.com/masharzy/ekmivo/pull/143).
- Exact tested implementation commit: `1c793cd67910b8d5621322a4dfab6471ae7e2455` (tree `ca56521de5d6def99b0b540248885603afbe8ce4`).
- The implementation is a dependency-ordered merge of Phase 7 source and sealed Phase 6 commit `d858a199e96ce35ccb9c74cada0a4935759d8168`. The resulting tree contains the Phase 3 (#137), Phase 4 (#140), Phase 5 (#141) and Phase 6 (#139) checkout contracts; none of those PRs was merged into `main` or deployed by Phase 7.
- Isolated control migration order includes Phase 3 `0145`–`0149`, Phase 4 `0151`, Phase 5 `0152`, Phase 6 `0153`, and Phase 7 `0154_platform_subscription_release_operations.sql`. Migration `0150` is intentionally unused. **No Phase 5–7 migration was applied to production.**

## Exact-head CI evidence

| Run | Source SHA | Result | Covered gates |
| --- | --- | --- | --- |
| [Phase 7 focused release CI — 39749150903](https://github.com/masharzy/ekmivo/actions/runs/39749150903) | `1c793cd67910b8d5621322a4dfab6471ae7e2455` | **SUCCESS: all 3 jobs** | Go `-race`/vet and SQL syntax; source guards, TypeScript, ESLint, Next production build, design/OpenAPI and Phase 2–7 contracts; disposable PostgreSQL 17 migrations/roles and Chromium SQL-backed checkout |
| [Foundation CI — 39749159047](https://github.com/masharzy/ekmivo/actions/runs/39749159047) | `1c793cd67910b8d5621322a4dfab6471ae7e2455` | **SUCCESS** | Web TypeScript/lint/build and real PG04 financial smoke, Phase 5 interactive/responsive browser, Go compilation, Kotlin checks and migration Docker builds; conditional Phase 3 job **skipped** by workflow rules |

The prior Phase 6 implementation `5bccfa40a8c4b696533b90d4d361ce827a42bb70` independently passed [focused CI 39747536415](https://github.com/masharzy/ekmivo/actions/runs/39747536415) and [Foundation CI 39747541439](https://github.com/masharzy/ekmivo/actions/runs/39747541439); its evidence-only seal is `d858a199e96ce35ccb9c74cada0a4935759d8168`.

## Automated acceptance matrix

| Area | Code-level verification result |
| --- | --- |
| Selected published offer → opaque Store-bound intent → authenticated Order Summary | PASS: contract and isolated database checks; refresh/resume tested |
| Server-authoritative quote, changed price/expiry and three independent versioned legal consents | PASS: Phase 5 PostgreSQL security/transaction fixtures, browser and legal contracts |
| Platform coupon Apply/Remove, revision/caps, redemption only on verified settlement | PASS: isolated PostgreSQL Phase 3–6 chain, Chromium API-backed journey and duplicate/recovery regression |
| Go-to-Pay separation and subscription-only approved online wallet account filtering | PASS: Go authorization/allowlist, payment contracts and payment regression; merchant checkout isolated |
| Verified payment, retry/idempotency, late money and unknown provider response | PASS: mocked/stubbed automated transaction and worker recovery checks; **real provider remains manual** |
| Super Admin + MFA recovery view, narrow SQL privileges and export audit | PASS: isolated PostgreSQL `0154` role tests, direct runtime ledger denial, bounded CSV and formula injection checks |
| EN/BN, light/dark/system, responsive 320/375/768/1024/1440, keyboard and 200% zoom | PASS: focused browser/contract matrix; **real-device and assistive-tech acceptance remains manual** |
| Web and Go code quality, migration parser, OpenAPI, Admin tokens, independent financial Foundation regression | PASS: both exact-head runs above |

## Release / operator gates deliberately OPEN

1. PRs/dependencies must be reviewed and integrated in order. Draft PR #143 is not merged. The code-level seal is not proof that `main` contains the flow.
2. Independently approved control and financial test environments must pass provider-account identity, live sandbox callbacks, unknown-response reconciliation and actual receipt/refund/support routing. No production fixture or real money was exercised by these automated tests.
3. Operator must verify physical devices/assistive technology, manual EN/BN theme/viewport and 200% zoom checks, and staged cohort acceptance. The detailed checklist is `docs/MANUAL-VERIFICATION.md` and `docs/runbooks/STORE-SUBSCRIPTION-PHASE7-RELEASE.md`.
4. Before production, operator must validate backup/PITR and migration ledger/grants, approve staged rollout and financial monitoring, then authorize migration and deployment explicitly. This PR does not do those operations.

**Safety state:** `EKMIVO_SUBSCRIPTION_ORDER_QUOTE_ENABLED`, `EKMIVO_SUBSCRIPTION_ORDER_CONFIRM_ENABLED`, `EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED`, and `EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED` remain **OFF** for release. No production migration, payment, refund, merge or deployment was performed. Existing merchant/seller checkout remains independent.
