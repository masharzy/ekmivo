# PR 65 — authorized full payer number verification (2026-10-16)

Owner selected encrypted storage with full phone returned by the authorized owner/admin API. No plaintext storage migration, changes to payment verification, or browser test.

Integrated main 763e1bf. Retained the encrypted aggregate-contact read and verified-payment SMS fallback. Fixed arbitrary global LIMIT 50 starvation: choose up to three newest verified payments per requested payer and batch the existing ciphertext lookup in groups of 50, bounded to 150 candidates. Never reconstruct masked digits. The approved, unambiguous source parser can recover a number only after evidence decryption; other tenants/realms and unverified receipts are excluded.

Verification on final Go code:
- `go test ./...` PASS.
- `go vet ./...` PASS.
- `go test -race ./internal/checkout` PASS.
- New regressions: restricted workspace roles, encrypted contact, wrong key/AAD/workspace, approved SMS fallback, wrong source, sandbox parser in Live, multiple matching parsers and preserving a manually named customer.
- Exact-query synthetic SQL on existing isolated Neon branch br-silent-breeze-b32znlqj: all 50 verified customer groups covered, 52 bounded candidates (3 + 49), max 3 per payer, other tenant/realm excluded, unverified group excluded — all five assertions true. Generator: tools/testing/customer-payer-selection.mjs. CTE SELECT only; no persistent fixtures/writes.
- Production read-only EXPLAIN and catalog privilege probes confirm the query compiles and finance-reader can SELECT the scoped tables and execute the existing evidence function. No migration or production data write.

Browser tests omitted by owner request. Crypto/parser cases are synthetic tests, not a claim that a real provider payment or actual signed-in production response was newly observed. Existing real evidence stays encrypted. No Docker used.
