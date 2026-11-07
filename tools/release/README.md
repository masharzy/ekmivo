# Payment release gates

These tools do not deploy or approve a release. All commands run from the repo root. Never commit credentials or receipt contents.

1. On a clean reviewed commit, `node tools/release/create-manifest.mjs new-manifest.json staging .` creates an exact-source manifest with every gate NOT RUN. Alternatively copy `manifest.template.json` to a private evidence directory. Record the exact tested Git commit and actual observations. Keep unavailable checks `manual_pending` or `not_run`.
2. `node tools/release/record-observation.mjs device observation.json recorded.json` validates consent, all five matching assertions, actual payment/webhook/dedup observations and hashes retained evidence. `cohort` and `incident` record daily paid-cohort observations and operational incidents. Device aliases replace phone numbers.
3. `node tools/release/review.mjs manifest.json evidence-root audit` audits incomplete evidence. `release` mode rejects any missing mandatory PASS, mismatched deployment commit, missing owner release decision or unresolved financial/security incident. Inspect the CLI usage before execution.
4. `BRIOFOLD_PROBE_API_URL` configures the read-only readiness/latency probe. `http-probe.mjs output.json` does not verify financial behavior.
5. `production-smoke.mjs output.json` needs `BRIOFOLD_SMOKE_API_URL`, `BRIOFOLD_SMOKE_WEB_URL`, `BRIOFOLD_SMOKE_WORKSPACE_ID`, `BRIOFOLD_SMOKE_READ_KEY` (live, read-only dedicated test key), and `BRIOFOLD_SMOKE_COMMIT`. It checks readiness, public docs/login, unauthenticated denial and live/sandbox key isolation. No mutation is made.

Deploy once after combined acceptance; do not repeatedly spend Vercel quota on code iterations. Failed smoke means stop intake and assess rollback, not erase financial history or blindly replay external effects. Restore/rollback must preserve reconciliation and already-accepted callbacks.
