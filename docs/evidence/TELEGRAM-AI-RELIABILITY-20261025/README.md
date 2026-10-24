# Telegram AI reply reliability

Production inspection found the sender healthy (previous AI replies accepted by
Telegram), but the latest generation was `unknown` and its channel job was in
review with `AI_REQUEST_UNKNOWN`. A provider generation reference exists; the
previous adapter did not record which response validation failed. Do not claim
the exact old upstream failure is established, and do not blindly replay it.

OpenRouter's public model catalog reports qwen/qwen3.8-omni-flash reasoning is
optional and enabled by default. The configured reply limit is 1,000 tokens.
The official reasoning guide documents that hidden thinking can consume that
budget and leave no visible content. Disable optional thinking specifically for
this chat model. Keep unrelated models and authoritative usage checks intact.

Add structural failure diagnostics without response bodies, credentials or
customer text. Provider uncertainties retain the existing review/recovery path.

Validation: focused `go test ./internal/aicredits -run TestOpenRouter -count=1`
passed, including Qwen thinking disabled and unrelated models unchanged, bounded
requests, usage validation, rejection and redirect protection.

Production rollout: Render dep-dbegpf4s728c73cjhho0 is live at commit
179517e823bfbb548a68e0aaa36aa26122d95489. Vercel production env now enables
BRIOFOLD_AI_RUNTIME_ENABLED; dpl_HKpCq2sqftMcfL65pu7ASZgU936A is READY.
One real published-version Studio test completed with authoritative usage
(489 input, 76 output), charge BDT 0.09.

Further root cause: briofold_ai_request_begin treated an old `unknown` execution
as an active thread lock. The next customer question therefore failed before
any new provider call with SQLSTATE 54000 (mapped to AI_RUNTIME_UNAVAILABLE).
Migration 0215 keeps the active-generation lock for `running` executions only.
Same-key unknown requests still return their original recovery state, and the
workspace-wide cap of 20 unresolved/running executions is unchanged.

The narrow function change was applied atomically to production. Only the later
job with no execution record was requeued. It completed and Telegram accepted
its reply (provider message ID 19). The original unknown execution and its
generation reference remain unchanged for reconciliation, with no replay.
This is actual provider evidence, not a synthetic production fixture. No Docker
or broad test suite was used. The precise old malformed/incomplete provider
response remains unknown because the previous adapter did not log its shape.

References:
- https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- https://openrouter.ai/api/v1/models
