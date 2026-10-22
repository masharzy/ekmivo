# Briofold single-Store — owner-operated physical/provider QA

**Scope:** Briofold unified merchant dashboard Phase 0–10. This is **not** the Store-first SaaS subscription checkout project. These are the owner's real-device, real-service and visual checks. They are **excluded from the engineering code-level seal** at the owner's request, but the owner must still authorize any production launch involving their providers, customers or funds.

**Do not use production fixtures.** Use an authorized test Store and configured providers. Confirm live/sandbox boundaries first. Do not initiate actual marketing sends, real charges or provider bookings without the owner's explicit live-test authorization. A disabled integration is a legitimate result; never describe it as verified live.

## A. Identity and navigation

- [ ] Sign up/sign in, verify email, refresh session, log out and return to the same selected **single Store**. Do not require an old workspace selector.
- [ ] Complete AI-only, Payments-only and combined onboarding; ensure the right modules appear and disabled modules stay inaccessible.
- [ ] Navigate `/dashboard`, `/inbox`, `/orders`, `/customers`, `/payments`, `/sms-data`, `/reports`, `/notifications` and `/settings` with no visible `/bn` or `/en` prefix.
- [ ] Compare owner/admin/editor/viewer: a viewer cannot edit sensitive Store settings or download contact CSV; switching accounts must not retain someone else's data.
- [ ] Try Bengali and English, light/dark modes, narrow 320px and common 360/768/1440px viewports; inspect fonts, keyboard use and back/forward browser navigation.

## B. Conversations and AI

- [ ] Connect and disconnect each authorized Meta/WhatsApp/website channel; verify channel-specific permissions in the provider account, not merely an in-app success toast.
- [ ] Receive a real test message, assign/handover to a human, respond, refresh and check the external receiver actually got the message once.
- [ ] Send and receive allowed images/audio; test long threads, saved replies, labels, unread queue, conversation search and failed-network retry.
- [ ] Publish an AI instruction/knowledge revision, test a grounded answer, verify staff takeover and rollback; confirm prepaid AI metering does not block manual Inbox work at zero credits.
- [ ] Check per-post comment moderation and opt-in boundaries on a test page. Unsupported voice calling must remain **unavailable**, not silently enabled.

## C. Commerce and CRM

- [ ] Create manual and test API/AI orders; inspect correct source, recipient, team assignment, stock reservations, status history, cancellation, barcode/manual search, bulk action and packing label.
- [ ] Test actual camera scanning only on a supported owner device; a missing `BarcodeDetector` must show an honest fallback to manual/USB scanning.
- [ ] Import a small product CSV; review changes before applying, upload approved product photos and check product variants and stock after reload.
- [ ] If a courier account is configured, validate provider booking, unknown outcome recovery, handover receipt, tracking and COD report against that provider's portal. Do not rebook automatically after an unknown outcome.
- [ ] Create and edit CRM profiles; verify stage, assignee, due reminders, opt-out/suppression, safe export, viewer masking and no automatic identity merge from unverified matching data.
- [ ] Review planned campaign/broadcast drafts and booking calendars. **No marketing delivery** should be possible without verified channel consent, approved templates and provider credentials.

## D. Money and Android SMS phones

- [ ] In the owner's test environment, pair an authorized Android phone, observe QR/code expiration, claimed status, heartbeat and SMS permission state.
- [ ] Disconnect the phone in web settings and verify the Android/web state changes without duplicate devices; reconnect the **same UUID**, without entering a new name, and reissue a new pairing code.
- [ ] Attempt old/expired pairing codes and wrong-device claims; all must fail. Delete a disconnected phone and a reconnected phone; the device row should disappear but historical receipt/payment evidence must stay.
- [ ] Compare the same authorized transaction, amount (BDT), invoice, payment link, refund and webhook status in legacy and unified views. A courier COD note or merchant order status must **never** count as a verified gateway payment.
- [ ] Test payment success, expiry, retry, stale loading, refund consistency and webhook replay only against an approved sandbox or explicitly authorized low-value live environment.
- [ ] Validate checkout themes on first navigation, hard refresh and save/reload. Verify receiving account masking and copy controls; never expose a full secret in screenshots.

## E. Go-live sign-off (separate from code seal)

- [ ] Confirm every required schema migration/version on the intended **CONTROL** or **FINANCIAL** database, never the wrong realm.
- [ ] Confirm feature flags intentionally enabled and external credentials installed through approved secret management.
- [ ] Confirm all required CI jobs and release parity gate passed on the **exact deployed commit**; do not rely on a prior unrelated green run.
- [ ] Verify deployed commit/hash, monitored errors and rollback route with a responsible operator.
- [ ] Record failures with route, Store role, environment, locale, viewport, screenshots without private data, and exact reproduction steps.

Owner QA can remain unchecked when code is ready. **Unimplemented or unverified source code, missing migration integration, red CI and unresolved 56-row parity failures cannot be waived as “physical testing.”**
