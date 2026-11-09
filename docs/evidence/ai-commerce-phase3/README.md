# Phase 3 evidence: AI tool loop (code level)

Flag: `BRIOFOLD_AI_TOOLS_ENABLED=true` (off = old text-only path, unchanged).
Files: `backend/internal/checkout/ai_tools.go` (+ `_test.go`), hook in `studio_execution.go`, `infra/migrations/0233_briofold_ai_tools.sql`.

## Design
Model answers with one JSON object (`{"tool","args"}` or `{"reply"}`) over the existing metered engine. Each step is its own
metered request (key = hash(job key, step)), max 5 steps + handover step 6, 90 s budget. Forbidden args (ids, prices, stock,
payment status) are rejected. Every tool call goes through `briofold_ai_tool`, which refuses when the job lease is invalid
(SQLSTATE 42501, no write), replays the stored result for the same (job, step), and logs redacted args in `ai_tool_calls`.
Signed (HMAC, expiring) payload helpers for price quotes (30 min) and button actions; channel card/button limits; voice/video limits.

## Verified
- Neon test branch (br-tiny-mouse-b37574ht): 0233 applied; invalid lease rejected with 42501.
- gofmt clean. Go unit tests written (parse, redaction, signed payloads, limits); CI is the compiler.

## NOT verified / not built yet
- Real model run through the loop; migration second run and rollback (rollback: `DROP FUNCTION briofold_ai_tool(...)`, `DROP TABLE ai_tool_calls`).
- Tools returning `tool_unavailable` until Phase 4 (0234): find_product_by_image, send_products, quote_price, check_coupon, delivery_charge,
  upsert_order_draft, send_order_summary, ask_payment_choice, create_payment_link, submit_payment_proof.
- Carousel/button rendering and signed button handling in the channel senders (Messenger/Instagram/WhatsApp/website); helpers only.
- Voice/video enforcement is a helper, not yet wired into media intake; ffmpeg wav conversion not done.
- Handover flips `ai_enabled`, so the fallback message may be dropped by the finish validity check; needs a real run to confirm.
- Inbox picker / AI reply path still reads `inbox_products` (not switched to the new catalog).
