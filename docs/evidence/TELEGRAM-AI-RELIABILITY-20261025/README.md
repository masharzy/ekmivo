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

Production deployment and real generation verification are pending at commit.

References:
- https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- https://openrouter.ai/api/v1/models
