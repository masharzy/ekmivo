# Shared Android/web messaging contract — phases 2–4

Implemented by `backend/internal/checkout/mobile_devices.go`, `mobile_inbox.go`, `inbox_oauth.go`, `inbox_provider.go` and `inbox_push.go`. This is source API documentation, not a production deployment claim. Later media/profile endpoints are not implemented by this contract.

## Scope and authentication

Mobile POSTs use the existing P-256 signed transport and bounded body. Headers: `X-Ekmivo-Device-ID`, `X-Ekmivo-Event-ID`, `X-Ekmivo-Timestamp`, `X-Ekmivo-Signature`. The signature covers method, exact route, timestamp, event ID and raw body using the existing canonicalizer. Server loads device workspace/environment/key and verifies current authorization; caller-supplied scope never routes messages. Web routes require the existing session, active workspace membership/settings permission and explicit `environment=live|sandbox`; mutating browser requests pass existing origin/proxy protection.

| Route | Behavior |
|---|---|
| POST `/v1/device/pairing-preview` | `{pairing_token}`; non-consuming lookup, fetched name/products/expiry only; no SMS permission or collection |
| POST `/v1/device/claim` | Explicit consent plus existing signed public-key proof; same-key recovery, same device ID |
| POST `/v1/device/workspace-state` | Authoritative workspace identity, `products.ai/payments`, `payments_ready`, device ID; supports both-off state |
| POST `/v1/device/mobile-disconnect` | Revoke current control device; client retains queued evidence and blocks destructive local disconnect while pending |
| POST `/v1/device/inbox` | Signed actions below |
| POST `/v1/device/inbox-push-register` | Active device token registration; encrypted server-side |
| GET/POST `/v1/workspaces/{workspaceID}/mobile-devices` | List / create expiring one-use phone code |
| POST `/v1/workspaces/{workspaceID}/mobile-devices/{mobileID}/{mobileAction}` | `reconnect`, `revoke`, `delete`; body `phone_id` must match route; reconnect preserves ID |
| POST `/v1/workspaces/{workspaceID}/inbox` | Same Inbox actions under session authorization; distinct durable user cursor |
| GET `/v1/workspaces/{workspaceID}/inbox-connections` | Scoped provider/connection state; no credential disclosure |
| POST `/v1/workspaces/{workspaceID}/inbox-connect` | `{provider:wa|ig|ms}`; single-use actor-scoped OAuth URL |
| POST `/v1/workspaces/{workspaceID}/inbox-connections/{connectionID}/disconnect` | Disable connection and sending/sync |
| GET `/v1/channels/meta/callback` | Session-bound state consumption and code exchange; scope rechecked before save |
| GET/POST `/v1/channels/meta/webhook` | Verification challenge / HMAC-verified durable ingestion; credentials never supplied by Android |

## Inbox actions

Envelope: `{action,thread_id?,before?,filters?,body?}`. Mobile bodies may include existing enrollment/environment transport fields; scope is always derived server-side. Request body maximum 32768 bytes. Client cannot set `reader_kind`; backend overwrites it as device/user.

- `list`: filters `channel` (`wa`,`ig`,`ms` or empty), `unread`, `mode` (`ai`,`seller`,`waiting` or empty), `days`, `q`, `offset`. Page size 50; current pagination uses bounded offsets. Response `{items}` includes actual preview, activity and reader-specific unread count.
- `messages`: required thread ID; optional `before` message sequence; ascending items from newest matching page of 50. Response `{thread,items}`; thread includes current AI setting, reply-window status and durable read sequence.
- `read`: body `{sequence}`; monotonic cursor clamped to existing messages in this thread.
- `ai`: body `{enabled:boolean}`; persists handover configuration and increments version. This is not AI reply generation.
- `send`: body `{text,idempotency_key,reply_to?}`; UUID key, supported text only, optional same-thread reply. Same key/body returns original message; changed content conflicts. Seller send atomically disables AI and increments handover version. Server checks current product, enabled connection and 24-hour customer window.
- `retry`: body `{message_id}`; only known failed messages in the same scoped thread and open window. Uncertain outcomes cannot be blindly retried.

Outgoing state is queued → sending → sent/failed/uncertain. Provider events alone establish delivered/seen; late or reordered status does not regress seen. A leased send lost during a worker crash becomes uncertain. Read watermarks and per-message events survive a provider-status-before-send-response race. Reply acceptance is not payment confirmation.

## Runtime and client behavior

Foreground capability refresh occurs on STARTED and every two seconds; visible navigation/permission policy reacts to the observable snapshot. Payment entitlement and finance projection readiness are separate. Failed fetches preserve last scoped cache; authority remains server-side. Disabled Payment stops capture/delivery without deleting existing encrypted evidence. New permissions are requested through Android consent; grants cannot be automatic.

Provider integration requires configured approved Meta app, scopes, account access, OAuth redirect and verified webhook subscription. Current account discovery is bounded to 100 entries per provider discovery call; larger portfolios need pagination expansion. Tokens are encrypted; production token expiry/refresh/revocation behavior still needs live validation. Optional FCM uses minimal IDs and reauthorizes/fetches data before notification display. See `ANDROID-REDESIGN-STATUS.md` for migration/configuration details and `MANUAL-VERIFICATION.md` for remaining provider/device tests.
