# Briofold paid AI execution — source checkpoint

This records a bounded implementation checkpoint, not full Phase 5/6 acceptance.

## Implemented

- `backend/internal/aicredits/engine.go` accepts a request only through a transactional Store claim. It reserves the configured worst-case amount before a provider call, uses one immutable tariff snapshot, and settles from provider-observed input/cache/output tokens.
- Migration `0129` enforces tenant/actor membership, settings permission, AI entitlement, request fingerprint/idempotency, 20 pending requests per business and one pending request per conversation. Raw execution rows remain private. A generation ID cannot produce two positive charges in the same business.
- Exact Go and PostgreSQL arithmetic use integer paisa rates per million tokens, combined rounding once, cache substitution and maximum bounds. Admin publishes rates explicitly; no commercial model/rates are seeded.
- Definitive provider rejection releases the reservation. Network/ambiguous usage/settlement outcomes become recovery-pending and never trigger an automatic second paid call. A lost database reply after settlement cannot undo the committed charge or repeat generation.
- Replies are AES-GCM encrypted with workspace/request associated data. A completed retry returns the stored result at its original tariff and verifies its charged amount.
- `/v1/workspaces/{workspaceID}/ai/test` is an authenticated, same-origin manager endpoint using this engine. The web proxy allows only its POST command, keeps body bounds, and gives it a bounded 50-second upstream window rather than aborting a 40-second model request at 15 seconds. Other proxy commands retain their existing timeouts.
- `BRIOFOLD_AI_RUNTIME_ENABLED` defaults off. `OPENROUTER_API_KEY`, a configured rate and a funded prepaid wallet are required. This checkpoint performs no live model calls and changes no production flags/migrations.

## Provider contract used

Only bounded, non-streaming text requests are supported by this adapter. No tools, voice, image generation, provider fallback loop or automatic financial action is enabled. The returned model must match the explicitly configured model ID; unverified aliases are not silently accepted.

Official OpenRouter contracts inspected on 2026-10-20:

- https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
- https://openrouter.ai/blog/tutorials/prompt-caching-sticky-routing/

`max_completion_tokens` bounds output. `usage.prompt_tokens`, `usage.completion_tokens` and optional `usage.prompt_tokens_details.cached_tokens` supply the usage. Missing or inconsistent usage is not estimated from text length. Input byte/framing bounds protect admission; provider-reported usage outside the configured reservation bound remains uncertain and cannot overdraw a wallet.

## Automated checks

- Go engine tests: parallel identical calls, insufficient-credit denial, changed-input key conflicts, timeout/rejection, usage overrun, lost settlement reply, original-rate replay and encrypted cross-workspace denial.
- HTTP adapter tests: fixed endpoint/auth, bounded request, exact usage extraction, missing usage/model mismatch, oversized response, error redaction and no redirects.
- Existing isolated PostgreSQL harness now applies `0129` and tests actual concurrent claim/settle/release, generation deduplication, old tariff retention, unknown outcomes, revocation during accepted execution, request/conversation caps and raw-table denial.
- Web proxy tests exercise authentication, origin/body/method bounds and the paid test endpoint.

Local unit/race/build outcomes and full CI are recorded in the associated PR/Issue #94. A written SQL test is not a passed SQL test until that run succeeds.

## Remaining code work (not manual/provider verification)

- Generation recovery/explicit audited operator resolution for uncertain executions, including cases where no generation ID was returned.
- Agent instruction/version/knowledge UI and actual channel automation must call this one engine; they are Phase 6 work, not delivered by an isolated test endpoint.
- Full remaining feature-parity ledger and Phase 1–10 scope remain open. Do not infer phase completeness from this checkpoint.

## External/manual gates

Owner performs manual UI/UX/API verification. Real provider credentials, configured model behavior/usage, runtime/host timeout behavior and deployment migrations remain separately unverified. Neon test-branch quota prevented another isolated branch; no unrelated branches were removed and no production migration was run. Required source SQL checks use the existing disposable GitHub CI databases.
