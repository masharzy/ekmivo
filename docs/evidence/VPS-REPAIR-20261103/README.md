# VPS migration repair — 2026-11-03

The production migration exposed three independent failures:

1. Vercel's proxy forwarded the legacy origin while the VPS expected `https://briofold.tech`. Set production `GO_WEB_ORIGIN` to the canonical domain and redeployed unchanged frontend source as `dpl_GgLH23uoyCurnKx9cmfAdvnrfxtm` (READY). The old origin reproduced ORIGIN_DENIED; the canonical origin passed that boundary.
2. The exported Neon control database itself lacked commerce 0141, growth/reporting 0142 and the dependent 0180–0211 migrations. Source catalog inspection confirmed this was not an export omission. Applied the existing files as `ekmivo_owner`, first in a transaction ending with ROLLBACK, then committed and recorded their hashes in the existing migration ledger. Saved a private pre-repair control database backup. No existing commerce tables were overwritten.
3. The restricted Vercel role's 0156 allowlist predated these feature functions. Authenticated API commerce reads worked, but server-rendered pages returned unavailable because `ekmivo_web_app` lacked EXECUTE. Migration 0217 adds only ten stable SECURITY DEFINER read entry points already called by Next.js. It grants no table privileges, write functions, memberships, superuser or BYPASSRLS.

## Verification

- Canonical production origin configured; Vercel deployment READY.
- Customers and Inbox visibly loaded existing records/conversations in the user's signed-in Chrome session.
- Authenticated `/api/go/workspaces/{workspace}/commerce?environment=live&resource=orders` returned the actual authorized JSON payload.
- Orders, Products, Inventory, Delivery, Returns, Coupons and Reports visibly loaded after schema/grant fixes. Empty commerce tables render honest empty states; existing financial report totals remained visible.
- All public function names statically called through Next.js database templates were checked against web-role EXECUTE permissions; no missing grants remained for existing functions.
- Actual web-role commerce read passed. Unrelated actor access remained blocked. Web role still has no superuser, BYPASSRLS, CREATEROLE or CREATEDB.
- Bookings/Broadcasts still show the source's intentional unavailable UI while their frontend feature flag is disabled. Their rollout and real provider dispatch were not claimed tested or enabled.
- No password was displayed, real message sent, payment initiated, or customer draft modified during verification.

This evidence covers migration/configuration repair and authorized read/page loads, not every product mutation or provider workflow.
