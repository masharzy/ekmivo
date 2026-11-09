# Phase 6 evidence (code level)
`evals/bangla-commerce/build-scripts.mjs` (87 scripts) and `run-evals.mjs` (OpenRouter runner, fake shop, metrics, cost in BDT, results folder).
NOT run: no model was called (no API key here), so there are no results and no model choice. Voice/image scripts need media files and the runner does not send media yet. No admin model setting/one-click rollback UI (uses `AI_DEFAULT_MODEL`).
Production readiness: flags, allowlist, kill switch, per-thread/daily limits in `ai_tools.go`; runbook `docs/runbooks/ai-commerce.md`; `tools/testing/ai-load-test.mjs` (not run).
