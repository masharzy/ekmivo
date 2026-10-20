# Ekmivo shared messaging foundation — owner direction, 2026-10-19

This is the binding integration architecture for Android phases 4–6 and the web channel connection flow. Implementation evidence is maintained in `ANDROID-REDESIGN-STATUS.md`; architecture requirements below also cover later media/profile phases. The existing Go/Postgres application remains authoritative; use its auth, workspace access, encryption and job infrastructure. Do not introduce a parallel backend or enable a demo Inbox.

## End-to-end ownership

The merchant connects authorized Facebook Pages/Messenger, WhatsApp Business accounts and Instagram accounts from the web workspace. Server-side OAuth/account selection validates the connected account and records the channel connection. Provider webhook verification and signed event validation happen on Go. Store accepted events durably before acknowledging them, deduplicate provider retries, normalize them into workspace conversations/messages, and update web/Android clients from the same authorized API. Android is not a notification-scraping substitute for channel APIs.

Outbound seller replies, AI replies, media, reactions and copy-forward requests enter the same authorized server pipeline. Persist the requested action plus an idempotency key and outbox job atomically. A worker calls the connected account's provider API. Provider delivery/read events update separate timestamps/statuses. A 200 send response does not manufacture a seen event. Persist AI handover and its version under a conversation lock so a seller send cannot race an already queued AI reply unnoticed.

## Schema and contract gates before enabling Inbox

Implement additive migrations in the correct control/product database, with the existing migration coordinator and isolated Neon verification. Financial databases remain exclusively payment evidence/ledger realms. Existing schemas must be audited before naming or creating new tables; these names are conceptual, not duplicate-table instructions.

| Entity | Required invariants |
|---|---|
| Channel connection | workspace FK; provider; external account/page ID; connection state; encrypted credentials/reference; scopes; token expiry; config version; disconnected timestamp; unique authorized ownership policy |
| External identity | connection/provider-scoped external user ID; no automatic cross-provider merge by name; optional verified phone/username separately |
| Conversation | workspace+connection+external thread unique; last customer message time; AI enabled/version; last activity; per-user read cursor/unread semantics |
| Message | workspace/conversation composite scope; sender role; supported typed content; provider ID unique within connection; client idempotency key; reply FK in same conversation; original event time and ingestion time |
| Message event | immutable provider event identity; sent/delivered/read/failure timestamps; out-of-order reconciliation; failed retry cannot regress already seen |
| Media asset | workspace ownership; actual bytes/object reference; content type/size; lifecycle; upload state; provider media reference scoped to connection; retention/authorization |
| Reaction | message+actor+provider identity; add/remove state; supported capability; idempotent event application |
| Webhook inbox | signature-verification outcome; stable dedup key; durable minimal encrypted event; processing/lease/retry metadata; poison-event handling |
| Send outbox | persisted desired action+idempotency; retryable vs permanent failure; provider request/result correlation; no blind duplicate resend on ambiguous timeout |
| Customer/order profile | authorized workspace scope; explicit identity link; totals independent of visible pagination; real order source and timestamps; no fabricated cross-merchant history |
| Seller notes | workspace/customer scope; saved version; optimistic concurrency; clear-to-empty supported |
| Device subscription | workspace/phone binding; server-authorized channel scope; push token rotation/revoke; minimal notification payload; deep link reauthorizes |

Every schema row needs composite FKs/unique indexes where appropriate, workspace RLS or equivalent existing authorization, restricted database role grants, stable pagination cursors and relevant query indexes. Encrypt credentials and private event/media data using existing key management; keep OAuth secrets and access tokens off Android and out of logs. A provider retry or worker crash must not duplicate conversations/messages/sends.

## API behavior

Read endpoints expose loading/error/forbidden distinctly from empty. Live updates reconnect with a cursor and replay/dedup missed events. Mark-read uses a durable cursor; unread is never only a local badge. Server derives channel/provider from the authorized conversation, never trusts a client-supplied workspace/provider/recipient to route a message. Recheck permission, active connection, current send window and typed capability at execution time as well as UI rendering time.

Copy-forward is a NEW outbound message linked internally to its source for audit; it is not provider-native forwarding metadata. Validate the target conversation and supported source content. Re-upload/translate media when provider IDs cannot be reused. Reject unsupported types with a stable error; no false-success toast. Current UI's per-channel actions remain gated until official current contracts and the implementation prove support.

Connection/revocation, seller takeover, duplicate/out-of-order webhooks, retry after timeout, cursor reconnect, foreign-workspace IDs, note conflicts, media authorization, expired windows and unsupported actions require integration tests. Test adapters must be explicitly marked; a fake adapter pass is not live-provider acceptance.

## Current honest status

Phases 2–4 now implement control-plane device pairing/capabilities and database-backed text Inbox. The enabled native route uses signed API requests; web channels use session authorization, single-use OAuth state, encrypted account credentials and verified provider ingestion. Both use the same scoped conversations, read cursors and outgoing queue. Polling refresh is bounded at two seconds while foregrounded; this is not a zero-latency streaming guarantee. Device push is optional and configuration-dependent. Production migrations/provider approval/live-device acceptance have not been performed.

Media assets, reactions, copy-forward, full customer/order profiles and seller notes remain later phases. AI handover configuration is persisted; this change does not implement an AI reply-generation engine. Advanced token lifecycle/expiry health and channel-specific live behavior still require provider validation. Read `ANDROID-REDESIGN-STATUS.md` for rollout switches, test evidence and continuation instructions.
