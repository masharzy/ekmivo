# Inbox realtime and channel media — 2026-11-08

Implemented: authenticated, origin-checked WebSocket invalidation directly on VPS; one PostgreSQL LISTEN connection per API process; bounded workspace-isolated subscriptions; heartbeat/session revalidation; reconnect and polling fallback. The socket carries no customer content. Existing latest-50/cursor pagination is preserved.

Original uploads and Inbox requests use the VPS API directly. API sessions use the separate HttpOnly, Secure, SameSite=Strict cookie created at login; existing sessions need one sign-out/sign-in. No browser-visible provider tokens. No upload compression, database/S3/disk file persistence. Temporary memory remains bounded.

Telegram successful photo/voice/document sends retain an encrypted provider file_id. After memory expiry/restart, media retrieval uses getFile and the channel again. Previously sent Telegram media without a retained file_id cannot be reconstructed through Bot API message_id alone. A channel-reference metadata failure must not resend an already-delivered message.

Customer avatars: authorized VPS proxy, bounded RAM cache, Telegram getUserProfilePhotos/getFile, Messenger/Instagram profile_pic. Missing/private/unsupported photos retain initials; WhatsApp customer profile photos are not claimed supported. Live VPS Telegram probe returned API 200/ok but no accessible profile photo for the current customer.

Seen is no longer inferred from a customer reply: only actual stored channel read receipts render seen. Telegram bots do not provide read receipts.

Verified: Go checkout/API tests; focused race tests; go vet; TypeScript; changed-component ESLint; migrations 0225/0226 applied on production control DB; six realtime triggers and runtime avatar EXECUTE grant verified. Linux binary and Nginx WebSocket upgrade deploy script uploaded to /opt/briofold/realtime-release, with compose/Nginx backup and health-check rollback. Frontend production deployment b8263b28 is READY on the current project.

Manual pending: privileged VPS activation; authenticated WebSocket 101 + real incoming message/delivery/read event across two devices; permission revocation and reconnect; customer-photo display where provider permits it; new Telegram media retrieval after API restart. No end-to-end acceptance claimed before these checks.

## Realtime status correction

Live database evidence: the owner's latest Messenger text reached `sent` about one second after creation while UI retained `sending`. A trailing refresh timer was not cleared after firing, suppressing later WebSocket hints. Replaced the timer logic with a serial, coalescing scheduler. Regression checks cover overlapping events during a pending request, trailing refresh, subsequent independent events, hidden-tab resume, disposal and temporary failure recovery.

Meta app subscription inspection found only messages/message_reactions. Added message_deliveries/message_reads while preserving existing subscriptions and include_values. App and Page writes both returned success; app subscription readback confirms both receipt fields active. Do not infer past delivery/read timestamps or auto-resend already accepted messages. New provider receipt events still require live end-to-end verification.
