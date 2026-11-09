# Phase 2 evidence: sandbox seed (code level)

Script: `tools/testing/seed-ai-commerce-sandbox.mjs`; safety test: `tools/testing/seed-ai-commerce-sandbox.test.mjs`.

Run: `SEED_CONTROL_URL=... SEED_FINANCE_SANDBOX_URL=... SEED_OWNER_EMAIL=... [SEED_ALLOW_REMOTE_SANDBOX=1] node tools/testing/seed-ai-commerce-sandbox.mjs`

Seeds (all `TEST-` prefixed, environment=sandbox): 2 workspaces (both, ai), 20 products x 2-4 variants (some stock 0, some min_price),
3 coupons (valid, expired, once-per-customer), customer "Sarkio Test" with a Messenger sandbox thread, 6 orders
(delivered 3, cancelled 1, returned 1, hold/awaiting 1 with an unverified claimed payment), and 4 fake SMS receipts
(2 senders, 1 low amount, 1 reusable "already used") in the sandbox financial DB.

## Verified
- `node tools/testing/seed-ai-commerce-sandbox.test.mjs`: live/prod/remote URL refusal, deterministic ids (idempotent keys), 20 products, TEST- prefix.

## NOT verified (owner will run end-to-end)
- Execution against a real Neon test branch: first and second run no duplicates, nothing written to live.
- Not seeded yet: real product images (the SQL write path takes no image bytes; use the Product API with image_urls), workspace settings
  (receiving number, COD, 5% max discount, delivery 70/130) because the settings tables arrive with Phase 4, payments rows (verified 2, COD 2).
- Column names in the order/customer inserts were taken from the Neon test-branch schema; a first run may need a small fix.
