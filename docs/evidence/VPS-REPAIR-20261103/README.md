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

## Owner-authorized growth enablement

The owner explicitly requested production activation after the migration repair. Set production frontend GROWTH_OPERATIONS, GROWTH_REPORTS, GROWTH_CONSENT and BROADCAST_DISPATCH flags; deployment dpl_GoaLFB815kp4CvW3mQGLATDs6r4w is READY. Enabled backend consent/dispatch flags using the prepared one-shot admin script; no persistent passwordless sudo permission was added. The compatibility Render service received matching flags while its background sender remains disabled.

Verified production Bookings form and Broadcasts approval/consent interface in the signed-in browser. Authenticated broadcast-runs API returned the supported Messenger/Instagram transport list without an unavailable error. Actual restricted-web-role booking/broadcast reads passed. Transaction-rollback checks passed for booking create/idempotency, overlapping-slot denial, unrelated-actor denial, unsupported broadcast-transport denial and rejection of an unapproved message ID. Approved broadcast runs and pending recipients were both zero before activation. No real campaign was approved or message sent by the agent.

These checks validate the stated boundaries; they are not a blanket security certification or proof of every provider delivery path.

## Overview channel predicate follow-up

The AI overview uses `briofold_channel_allowed` inside composed SQL fragments. The initial static SELECT-call audit missed this nested predicate. Reproduced a real `permission denied for function briofold_channel_allowed` under the web role. Migration 0218 grants only EXECUTE on this stable SECURITY DEFINER authorization predicate. Actual owner channel reads returned four authorized channels; an unrelated actor returned zero. Verified the production dashboard visibly rendered eleven conversations, one waiting reply, four channels and the existing AI/human activity totals, with no unavailable warning. Counts describe the verification snapshot, not fixed expected production values.
