# Phase 10 broadcast continuation — verification pending

> **Final status:** this historical checkpoint is superseded by the [2026-10-24 engineering code seal](BRIOFOLD-PHASE10-CODE-SEAL-20261024.md). Exact code 23d84cf passed all four Foundation jobs, including this increment’s relevant suites; provider/device acceptance remains separate.

This increment does not seal the broadcast row or Phase 10. Previous verified accounting remains 46/56 accounted and 10 unresolved. PR #146 remains unmerged; production migration, deployment, flags and customer sends are not authorized.

## Follow-up source increment

0209 adds real signed `START OFFERS` consent acquisition, authoritative audience-bound merchant coupon snapshots and expiry/claim guards, named test-recipient selection and current member-scoped preview/control metadata. See `BRIOFOLD-PHASE10-SIGNED-OFFERS-20261024.md`. The original implementation/limitation discussion below records the earlier 0207 increment; audience-bound offers are now implemented but unverified, rather than missing. No additional row is closed until actual integrated evidence.

## Implementation

CONTROL-only additive 0207 stores explicit campaign/reply revision approvals, audience snapshots, identity-bound consent/thread recipients and stable per-recipient sequence keys. Preview and approval are separate authenticated owner/admin actions. The selected saved reply is outgoing content; editorial campaign body remains planning text. The preview token binds Store, realm, actor, campaign/reply revisions, exact eligible audience and sequence. Up to 500 current-window Messenger/Instagram customers, at most twenty approval runs per Store/day; one audience run per campaign revision and one test run per revision/customer. Cancelled approvals cannot be recreated to accidentally resend.

The scheduler uses the existing ordered text/image/audio/document saved-sequence queue, preserving current Inbox permissions, media provenance, window validation, AI takeover guards and existing per-Store limits. Instagram documents and other transports/outside-window templates fail closed. Scheduled work respects a validated timezone/quiet pair and delivery/offer expiry. Worker selection skips quiet campaigns so they cannot starve other due runs. Each queued message is rechecked at claim and immediately before provider transport for current consent/suppression, identity/source, role, content revision, window, expiry and quiet hours. Changed approval fails remaining queued messages. Unknown provider outcomes are not automatically resent; accepted messages are not reported as delivered. Runtime flag `BRIOFOLD_BROADCAST_DISPATCH_ENABLED` defaults off; disabling it rejects claimed broadcast jobs. Existing `INBOX_SENDER_ENABLED` remains independently required for any real dispatch.

The canonical Broadcast screen supplies saved-reply search/pagination, eligible audience/sequence preview, explicit approval, optional consented test customer, scheduling/quiet hours/expiry, cancellation and persisted aggregate results. No provider secret or browser draft is stored by this panel. Email/SMS/WhatsApp and outside-window approved-template transport are explicitly unavailable; audience-bound discounts are not implemented by this increment. These gaps prevent a full S24 seal.

## Verification

Local Go checkout/authz/API tests, TypeScript, ESLint, production Next build and 0207 SQL/PLpgSQL syntax parsing passed. These do not substitute for database/browser acceptance.

The isolated CI suite adds real CONTROL consent versus preference checks, actor/Store/realm/unsupported-channel denial, frozen preview approval, duplicate/idempotency/concurrent scheduler checks, actual ordered Inbox queue/claim, fresh opt-out, approver revocation, revision/expiry/quiet guards, scheduled test run, cancellation, canonical positive test-send approval/results and EN/BN/theme/width cases. The claim checks use rollback-only isolation and never execute a provider transport. The API fixture explicitly disables the Inbox sender. This new suite has not yet run; no pass is claimed.
