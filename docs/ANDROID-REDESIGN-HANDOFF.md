# Ekmivo Native Kotlin Android — সম্পূর্ণ ডিজাইন ও ডেভেলপমেন্ট হ্যান্ডঅফ

সংস্করণ: 2.0 · আপডেট: ১৯ অক্টোবর ২০২৬ · নিচের checkpoint বর্তমান implementation-এর authoritative অবস্থা; মূল design extraction-এর পুরোনো status বাক্যগুলো ঐতিহাসিক।

## বর্তমান এজেন্ট হ্যান্ডঅফ — আগে পড়তে হবে

Repository: `masharzy/ekmivo`; branch `codex/android-reference-phases-1-2`; PR https://github.com/masharzy/ekmivo/pull/86 . Phase 1–4 source আছে। Phase 2–4 একসাথে বাস্তব DB/API/native UI-তে implement করা হয়েছে; CI/real-device acceptance আলাদা। Final commit ও CI outcome PR-তে দেখবে; pending run-কে green ধরে নেবে না। নতুন এজেন্ট production rollout হয়েছে ধরে শুরু করবে না। মূল reference এবং সব original HTML এই ফাইলের পরের অংশে রয়েছে।

এখন Phase 5–পরবর্তী কাজ user চাইলে শুরু করবে; কাজের আগে working tree/PR head inspect করবে। একই ID, signed receipt queue, no-SIM-binding ও isolated financial realm রক্ষা করবে। কোনো নতুন agent context না পেলেও এই checkpoint, API contract ও নিচের পূর্ণ reference থেকে বাকি কাজ চালাতে পারবে।

### Implementation checkpoint (embedded)



## Current implementation

Phases 2–4 source implemented together; combined CI pending at this checkpoint. Phase 1 previously passed native compile/unit CI. Exact screenshot parity and live provider/device acceptance remain manual pending.

- Phase 2: product-neutral QR/manual preview, explicit consent, control-plane device identity for AI-only/Payment/both, same-ID reconnect, server workspace capabilities, product-aware permissions and navigation. Foreground refresh runs immediately on STARTED and every two seconds while visible: no restart/APK update for entitlement changes. This is bounded polling, not a zero-latency push guarantee. Android permission consent always remains user-controlled.
- Phase 3: native SMS dashboard from encrypted local evidence, durable daily delivery counters (additive Room migration), connection/offline/failure/retry states; capability-aware Settings, same device identity on Payment adoption, existing queued receipt preservation. Unknown historical totals display a dash rather than fabricated zero.
- Phase 4: signed real database Inbox list/filter/pagination, text chat, durable reader cursors, AI handover toggle, reply quote/copy/swipe, idempotent send and known-failure retry, provider-derived delivery/read status, closed-window/offline states. Web Inbox uses the same database/API. Media/forward/reactions/profile belong to the later reference phases and are not claimed implemented here.

## Backend and database

Additive migrations 0114/0116/0118/0119/0120 target CONTROL only. 0115/0117 target each independent FINANCIAL realm. Control devices never bind a phone/SIM to a receiving account. Authoritative signed workspace-state remains readable with either/both products off; disabled Payment cannot collect or deliver new receipts. Financial projection readiness is distinct from entitlement. Legacy phone key/revocation is checked before adopting control identity.

Normalized channel connections/threads/messages/read cursors, tenant+realm scope, encrypted channel credentials, signed provider webhook ingestion, durable outgoing queue, early delivery-status replay, scoped encrypted push registration/jobs and OAuth single-use actor-bound states are implemented. Ambiguous send outcomes are marked uncertain instead of blindly sending duplicates. This does not implement an AI reply-generation engine.

## Operator rollout (not performed)

Use the EXISTING financial migration operator with `MOBILE_PREVIEW_ALLOW_MIGRATION=true`, explicit `MOBILE_PREVIEW_CONTROL_MIGRATION_FILE` (0114), `MOBILE_PREVIEW_FINANCIAL_MIGRATION_FILE` (0115), `MOBILE_FOUNDATION_ALLOW_MIGRATION=true`, `MOBILE_FOUNDATION_MIGRATION_DIRECTORY`, and the existing three `PG04_*_MIGRATION_DATABASE_URL` values. Migration owner/independent-realm checks remain. No automatic API-startup migrations; deploy migrations before new runtime/client.

Server provider configuration: inspect `inbox_oauth.go`/`inbox_provider.go` for META variables, approved scopes, redirect/webhook URLs and API version. Enable `INBOX_SENDER_ENABLED=true` only on the configured sender runtime. Push optionally requires `INBOX_FCM_CREDENTIALS_FILE` pointing to server-only service-account JSON. Android public Firebase identifiers use `EKMIVO_FIREBASE_APPLICATION_ID`, `EKMIVO_FIREBASE_API_KEY`, `EKMIVO_FIREBASE_PROJECT_ID`, `EKMIVO_FIREBASE_SENDER_ID`; without configuration no mock token/notification is generated.

## Verification

Local Go all-package tests passed. TypeScript passed. Neon isolated branch `br-cold-paper-b3pks3sr`, database `ekmivo`: rolled-back migrations and functional tests passed product switching, AI-only pairing, both-off access, cross-realm/tenant denial, incoming deduplication, outgoing idempotency conflicts, handover, durable reads, early provider seen event replay, 24h denial, revocation and push-job fanout. No production migration or rollout performed. Combined remote CI results must be appended below after completion.

## Next agent / remaining gates

Do not reset financial matching, identity, queues or plan semantics. Read `ANDROID-REDESIGN-HANDOFF.md` and original references in `docs/design/android-20261019/`. Continue later reference phases only after combined CI is green. Keep live Meta approval/account tests, Firebase delivery, real-device permission transitions/process death, EN/BN and screenshot comparison pending in `MANUAL-VERIFICATION.md`. Do not claim pixel parity or production acceptance from compilation. No separate release APK requested at this stage.

## Combined verification checkpoint

Commit `4b8ed10c0c165bd60eea8bf240ac18a6854e30e5`, run `39265784728`: native Compose compile/unit, Go all-package/race/vet/HTTP smoke and both runtime/operator image builds passed. Web lint/build/OpenAPI and initial database suites passed; PG04 HTTP fixture failed because the fixture omitted runtime-required `pg06_workspace_ready`. Follow-up installs the genuine pipeline/readiness migrations in both disposable realms before current API requests; readiness security remains enforced. Run `39266611114` tests that fix plus unread opening position/divider, quote jump/highlight, exact long-press duration, swipe/haptics, pull refresh, pagination refresh, lifecycle-aware polling and connected-channel management. Final run outcome is recorded on PR #86; do not infer success from this pending checkpoint.

Additional Neon rollback evidence: 0117 adopted AI-first phone identity idempotently in both sandbox/live financial test databases, with one physical phone and authorized key. OAuth actor isolation and single-use replay tests passed in control.

The second run passed native/Go/image checks and real checkout browser journeys at 320/768/1440, EN/BN and Light/Dark, then stopped on an obsolete expired-result heading assertion. The current Official theme says “This payment link has expired”; the fixture now asserts that exact heading and the do-not-send-money guidance. New phase 2–4 SQL assertions are also included in the existing isolated CI database suite and roll back after testing.

Database role verification correction: the running API uses `ekmivo_financial_projection` for its restricted control pool and `ekmivo_finance_reader` for each finance pool. Function-only EXECUTE grants now include those actual roles; raw messaging tables remain inaccessible. CI installs the real additive contracts before current API HTTP tests, and SQL asserts actual pool-role execution. Earlier owner-role-only SQL checks did not establish runtime grants.

### API/operator continuation (embedded)



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

---

নিচে মূল design specification ও original reference। Implementation status-এর ক্ষেত্রে উপরের checkpoint প্রাধান্য পাবে।

## 1. নতুন এজেন্ট প্রথমে এটি পড়বে

অ্যাপ আগে থেকেই native Kotlin-এ তৈরি। বিদ্যমান repository audit করে সেই অ্যাপেই এই ডিজাইন ও প্রয়োজনীয় functionality implement করতে হবে। React Native/Flutter/web app বানানো যাবে না; HTML WebView-তে ঢুকিয়ে native implementation সম্পন্ন বলা যাবে না। বিদ্যমান Compose অথবা XML/View architecture আগে শনাক্ত করো, তারপর একই stack-এ কাজ করো। শুধু ডিজাইনের জন্য পুরো app rewrite নয়।

ব্যবহারকারীর উদ্দেশ্য: আগের SMS-forwarder-কেন্দ্রিক অ্যাপকে workspace-aware Payment + AI Bot app-এ রূপান্তর, নিচের reference-এর চেহারা, spacing, typography, copy, state ও interaction অক্ষুণ্ণ রেখে। আগে phase অনুযায়ী কাজ; প্রতিটি phase-এর শেষে evidence এবং next-agent checkpoint। শেষের phase বাকি রেখে “100% complete” বলা যাবে না।

এই এক ফাইলেই তিনটি input-এর হুবহু source আছে। আলাদা HTML না থাকলে Appendix A/B/C থেকে extract করো। ৭০টি screenshot বাধ্যতামূলক নয়। তবে visual parity যাচাইয়ে runnable HTML reference এবং একই viewport-এর native capture পাশাপাশি দেখতে হবে। Native source/repository ও build/signing access এই MD-এর মধ্যে নেই; implementation করতে সেগুলো প্রয়োজন।

### প্রমাণ ও সীমা

- তিনটি সরবরাহকৃত reference source বিশ্লেষণ করে এই handoff তৈরি। Repository বা backend contract দেখা হয়নি।
- এখানে প্রস্তাবিত state/model নাম logical ধারণা, বিদ্যমান API route/schema/class-এর দাবি নয়।
- Design reference তৈরি থাকা আর Kotlin feature তৈরি থাকা আলাদা। বিদ্যমান feature-এর completion Phase 0 audit-এ নির্ধারণ করতে হবে।
- English screens-এর পূর্ণ translated copy, diagnostics detail screen, permission-denied layout এবং production API contracts reference-এ সম্পূর্ণ নেই। এগুলোকে “exact reference” দাবি করা যাবে না।

## 2. কোন reference কখন প্রযোজ্য

| বিষয় | নির্দেশনার অগ্রাধিকার |
|---|---|
| এই handoff-এর স্পষ্ট conflict resolution | প্রথমে প্রযোজ্য; নিচে ব্যাখ্যা আছে |
| Workspace setup, Payment/AI capability, SMS, Settings | Appendix A-র **শেষ কার্যকর override** ও flow notes |
| Inbox/chat/customer profile geometry ও interactions | Appendix B standalone inbox source |
| Inbox-এর লিখিত ব্যাখ্যা | Appendix C; B-র code-এর সাথে conflict হলে নীচের explicit সিদ্ধান্ত, তারপর B |
| Production truth, permissions, API outcomes | repository/backend audit; demo timer/data authoritative নয় |
| পুরোনো product context | সাম্প্রতিক workspace design-এর বিরোধী হলে নতুন design অনুসরণ |

Appendix A-তে প্রথম `const S={...}`-এর পর `S.welcome=...`, `S.home=...`, `flow.length=0`, `others.length=0`, নতুন `draw` আছে। প্রথম version পড়েই implementation শুরু করা নিষিদ্ধ। শেষ runtime assignment-এর output নিতে হবে। একই ফাইলে embedded inbox আছে; standalone B-কে Inbox-এর মূল reference ধরো।

### স্পষ্ট অসংগতি ও সিদ্ধান্ত

1. **Disconnected:** flow note বলে একটাই button “আবার যুক্ত করুন”; পুরোনো `S.off`-এ “২টি অপ্রেরিত SMS দেখুন” link রয়ে গেছে। নতুন UI-তে একটাই reconnect CTA রাখো। Queue অক্ষত থাকবে; link বাদ মানে data delete নয়।
2. **Payment-only tabs:** `nv3` unconditional তিন tab দেখায়, কিন্তু capability অনুযায়ী AI-only-তে SMS নেই। সিদ্ধান্ত: AI-only = ইনবক্স/সেটিংস; Payment-only = SMS/সেটিংস; দুটোই = ইনবক্স/SMS/সেটিংস। Payment-only default SMS, AI/দুটো default Inbox। এটি handoff-এর integration সিদ্ধান্ত, সব variant HTML-এ আলাদা আঁকা নেই।
3. **Payment-only success copy:** `S.done` দুটো service-এর কথা বলে। Payment-only-তে AI notification দাবি করবে না; Payment-specific copy resource যোগ করে এই deviation log-এ লিখবে।
4. **Light setup:** outer app `.ph`-তে inbox-এর মতো পূর্ণ light override নেই; `color:#111` কিছু CTA-তে hardcoded। Native app-এ B-র paired light tokens ব্যবহার করে contrast ঠিক করবে; layout অপরিবর্তিত। Dark outer page light হলেও phone light হয়েছে ধরে নেবে না।
5. **No zero rule:** customer profile-এর unknown/empty data ও optional zero stat লুকাতে হবে। SMS dashboard-এ সত্যিকারের ০ failed count বৈধ; অজানা count-কে ০ বানানো অবৈধ।
6. **Digits:** Bengali UI-এর display digits বাংলা। Pairing code, opaque IDs, URLs, API payload, raw phone value ও credential-এর অক্ষর পরিবর্তন নয়; copy action raw value কপি করবে। English mode-এর display locale অনুযায়ী হবে।
7. **Demo vs production:** JS delivery timer, fake waveform, generated product artwork, hardcoded store/customer/order, auto customer reply, automatic demo “seen” real app-এ যাবে না। এগুলো deterministic visual fixtures-এ থাকবে।
8. **Profile note:** prototype blur-এ toast দেখায়, durable save নেই। Production-এ save সত্যিই সফল হওয়ার পরে “নোট সেভ হয়েছে”; note খালি করে save করাও supported হবে।
9. **Message info:** source-এ `ts+1000/3000` fake delivered/seen time আছে; real event timestamp ছাড়া দেখাবে না।
10. **Pinch zoom:** state caption-এ আছে, standalone viewer JS-এ swipe/arrow আছে কিন্তু pinch handler নেই। Native viewer-এ pinch zoom যোগ করতে হবে; নতুন visual control নয়।
11. **Grouping:** লিখিত spec customer sender label বললেও `msgEl` customer `.who` বানায় না। B-র render অনুসারে customer name bubble-এর উপরে যোগ করবে না; AI/আপনি run label থাকবে।
12. **Capability claims:** Instagram document/delivered এবং 24h rules এখানে reference behavior। Production integration-এর সময় current provider contract/capabilities যাচাই করবে; UI server capability থেকে চালাবে। এই handoff-কে provider documentation বলে ব্যবহার করবে না।
13. **Unreachable code screen:** `S.code` আছে কিন্তু final `others` তালিকা থেকে বাদ। Welcome-এর manual code action থাকায় screen implement করতেই হবে; catalog থেকে বাদ পড়া feature removal নয়।
14. **No active product:** reference layout নেই। Audit-এ বাস্তবে সম্ভব কিনা নির্ধারণ করো; সম্ভব হলে existing access/error component ব্যবহার করে recoverable state দাও, কোনো service enabled ধরে নিও না।

## 3. ছয়টি স্থায়ী নিয়ম

1. Native Kotlin; বিদ্যমান pairing identity, signed SMS evidence, queue এবং workspace isolation রক্ষা।
2. Reference spacing/radius/icons/copy বদলে generic Material design বসানো যাবে না। Default elevation/shadow নেই; borders/surfaces দিয়ে depth।
3. বাংলা Hind Siliguri 400/500 bundle করতে হবে; network font request-এর ওপর app নির্ভর করবে না। Missing font হলে completion দাবি নয়।
4. Phone ও receiving account-এর assignment/binding, SIM slot/subscription field যোগ নয়। One physical phone = one pairing; reconnect-এ duplicate device নয়। Existing account/device plan limits পরিবর্তন নয়।
5. Android SMS পাঠিয়েছে মানে backend-এ payment confirmed নয়। App evidence delivery status দেখাবে; Go backend verification authoritative।
6. Demo সুন্দর দেখালেই শেষ নয়: loading, offline, failure, permission denial, process death, reconnect ও unsupported capability পরীক্ষা করতে হবে।

## 4. Visual implementation contract

B-র ভেতরের phone reference 360×720; A setup reference outer frame 300×620, border 6, radius 34। এগুলো presentation frame—production native screen-এ fake black phone border/device shell বসাবে না। Native content available width জুড়ে; horizontal dp, sizes ও proportions reference থেকে। তুলনার সময় inner viewport মাপবে (border বাদ), 300 বনাম 360 width গুলিয়ে mismatch ঘোষণা নয়। System status/navigation bar এবং keyboard insets একবারই apply হবে। Small screen-এ content scroll হবে, CTA হারাবে না।

CSS px spacing → dp; text size → sp with reference font scale 1.0 baseline। Android font padding/baseline আলাদা হতে পারে; text screenshot দিয়ে যাচাই করবে, পুরো UI scale করে mismatch ঢাকবে না। 1px reference border-এর native rendering density অনুযায়ী তুলনা করবে। Icon path SVG sprite থেকেই VectorDrawable/Compose path-এ port করো; কাছাকাছি icon library glyph নয়।

### Token table

| Token | Dark | Light |
|---|---|---|
| bg | #0F0F0E | #F4F3EE |
| s1 | #181817 | #FFFFFF |
| s2 | #222220 | #ECEAE2 |
| bd | #2C2C29 | #D9D8D1 |
| tx / contrast | #F1F0EA | #1B1B19 |
| mu | #8D8B84 | #6B6A64 |
| ink | #111111 | #FFFFFF |
| ok / okbg | #3DDC97 / #12301F | #14935C / #DDF3E8 |
| wr / wrbg | #F5B544 / #33260D | #B7791F / #FBEFD3 |
| er / erbg | #F2685B / #3A1B18 | #D6453A / #F9DEDA |
| seen | #1E90E0 | #1E90E0 |

Channels: WA #25D366, IG #C13584, Messenger #0A7CFF; white badge glyph। Image status seen source override #53C7FF preserve। Black media surfaces, white overlay content, alpha fills এবং demo artwork colours B-এর exceptions; token-only বাক্য দিয়ে source-এর এই values হারাবে না।

### Shared measurements

- Header padding 16/16/8; logo 34×34 radius10, e. 16/500; ordinary workspace name14/500/sub11।
- Setup center icon76 radius24, inner icon32; title19/500 line-height1.5; paragraph13 line-height1.7।
- Primary setup button46 radius14 text15/500; footer padding0/20/24; secondary action13 muted padding10।
- Setup progress4 bars22×4 gap6; permission tag11 padding3/8 full radius।
- Navigation border-top1, padding8/12/14 for three tabs; item padding4/12 radius12, icon20 and label11 gap3; active s2/tx। Two-tab outer reference padding8/24/14 item4/18।
- Default line icons 24 viewBox, rendered20, stroke1.8 round caps/joins; smaller per component source।
- Setup CSS and Inbox CSS contain different `.ring`, `.hero`, `.sheet` definitions. Native components should keep these separately scoped, never accidentally share unrelated geometry.
- No shadows, invented header menus, online customer state, call/video actions, “forwarded” labels। Emoji only source reaction/sticker/demo content, never substitute UI icon।

## 5. Setup state machine — প্রতিটি ধাপ

| State | Screen/content | Action / next / special rule |
|---|---|---|
| welcome | Ekmivo logo; “আপনার ওয়ার্কস্পেসের সঙ্গে এই ফোন সংযুক্ত করুন”; QR instructions three rows | QR CTA → camera permission/scan; manual CTA → code। Product unknown: SMS/Payment explanation নয় |
| cam | Generic ফোন যুক্ত করুন header; camera icon, “ক্যামেরা চালু করুন”; no stored-photo copy | Request camera on action; granted → scan; code alternative usable |
| scan | Black camera area radius20, margin10/16; frame150, corner26 stroke2.5; torch top-right | Decode once → load; avoid duplicate requests; no guessed workspace name |
| code | “পেয়ারিং কোড লিখুন”; eight26×38 radius8 cells, gap6, separator after4; focus border | Accept contract-valid raw code; verify → same load/confirmation; QR back action |
| load | Spinner34 border3, centered icon tile; “আপনার ওয়ার্কস্পেস লোড হচ্ছে…” / “একটু অপেক্ষা করুন।” | Fetch workspace name + enabled products from backend, not QR claims |
| fail | Error alert icon, “ওয়ার্কস্পেস লোড করা যায়নি”; কারণ line | Retry existing code; rescan resets lookup; distinguish offline, expired/invalid code, server issue without exposing internals |
| confB | Dim scanner + workspace sheet; AI Bot then Payment enabled rows; SMS disclosure | “সংযুক্ত করুন” confirms consent; “আবার স্ক্যান করুন” cancels pending lookup |
| confP | Same sheet, Payment row only + SMS disclosure | No AI row; confirm then Payment permission flow |
| confA | Same sheet, AI Bot only, “কাস্টমার রিপ্লাই দিলে এই ফোনে নোটিফিকেশন আসবে।” | No SMS disclosure/permission; confirm then notification flow |
| conn | “যুক্ত হচ্ছে…” spinner with workspace subtitle | Source legacy state; reuse as pending confirmation if pairing network call needs it; do not invent mandatory extra flow step |
| p1 | “পেমেন্ট SMS পড়তে দিন”; final updated explanation | Payment only; request actual SMS runtime permissions needed by existing collector; grant → p2 |
| p2 | “নোটিফিকেশন চালু করুন”; forwarding/failure notification copy | Payment branch; OS/version-aware permission handling; existing grants skip |
| p3 | “ব্যাকগ্রাউন্ডে চালু রাখুন”; battery restriction explanation | Payment background collection flow; return from Settings recheck actual status |
| p4 | “স্লিপিং অ্যাপ তালিকা থেকে সরান”; Samsung instructions | Samsung only; “সেটিংস খুলুন” / “করেছি, এগিয়ে যান”; cannot auto-grant manufacturer setting |
| nA | Single progress marker; notification explanation for customer replies | AI-only: notification permission only, apart from QR camera; no SMS/battery/Samsung setup |
| done | “সব ঠিক আছে”; connected workspace; begin CTA | Both products copy as A; Payment-only copy adapted as §2 |
| doneA | “রহিম ফ্যাশনের কাস্টমার মেসেজ এখন থেকে এই ফোনে নোটিফিকেশন হয়ে আসবে।” fixture | Real workspace name; begin → Inbox |
| off | Error chip/icon/title “এই ফোন ড্যাশবোর্ড থেকে বিচ্ছিন্ন” | One reconnect CTA; do not wipe queued evidence or create duplicate pairing |

Confirmation sheet: surface s2, radius24 top, padding18/18/22, top border1; workspace tile34 in sample brand colour #D12053; store name14, subtitle11; product rows padding9/12 icon17 label13 green enabled pill। SMS disclosure exact text in A: “SMS ফরওয়ার্ডিং: পেমেন্টের SMS পাঠাতে এই ফোনের SMS অনুমতি লাগবে। Ekmivo এই ফোনে আসা SMS দেখে শুধু পেমেন্টের SMS পাঠাবে। বাকি SMS পাঠানো বা সংরক্ষণ করা হবে না।” Production pipeline must uphold that privacy promise; audit collector before retaining copy।

Permission denied/permanently denied is not a successful step. Same screen structure রাখবে, existing app recovery/settings affordance reuse করবে; exact denial copy/layout reference-এ নেই বলে deviation record করবে। Returning to app, activity recreation, rotation, process restart-এ permission/pairing state বাস্তব status থেকে পুনর্গঠন করবে। No automatic permission prompt before user consent/product lookup।

## 6. SMS ও Settings — কার্যকর v2 design

SMS header workspace name/sub “ওয়ার্কস্পেস”, chip লাইভ/অফলাইন। Hero ring136, core112, amount-style count22/500; **টাকার অঙ্ক নয়** আজ পাঠানো SMS count। Live two ripple rings2.8s, second delay1.4s; live dot1.6s pulse। Note12 muted। Stats three equal cards gap8, padding12/16/4, radius12, cell9/10, value17/500, label11: এই সপ্তাহ / অপেক্ষায় / ব্যর্থ।

Recent SMS section11 muted padding12/16/6; row padding9/16 gap10 top border1; generic message tile30 radius9; masked sender14/500, age11; status pill11 padding3/8। Sent green “পাঠানো হয়েছে”, in-flight amber “পাঠানো হচ্ছে”, failed red “আবার চেষ্টা”; retry triggers existing queue delivery and prevents duplicate send race। Reference now contains sent history; do not apply older “hide all sent receipts” behavior to remove this final v2 recent list। Existing queue storage/retention audit করতে হবে; invented retention limit নয়।

Offline amber banner title “ইন্টারনেট নেই”, body “SMS ফোনে জমা আছে। নেট এলে নিজে থেকে পাঠানো হবে।” Ring amber static; count pending; label “পাঠানোর অপেক্ষায়”; last-success timestamp stays truthful। Offline queued → reconnect/sync → acknowledged sent; failed explicit retry distinct from pending। Acknowledgement হারালে idempotent retry, wrong workspace-এ evidence নয়। Internet restored মানেই sent নয়।

Settings block order:

1. Workspace card: ওয়ার্কস্পেস / চালু সার্ভিস / এই ডিভাইস। Use real values and only enabled service chips।
2. নির্ভরযোগ্যতা: SMS permission (Payment only), notification permission, battery exemption (Payment only); actual status and applicable repair links। AI-only should not show unnecessary SMS reliability tasks।
3. অ্যাপ: language বাংলা/English; theme সিস্টেম/লাইট/ডার্ক; ডায়াগনস্টিক ও লগ action। Segments12, padding4/10, full border pill; active contrast/ink।
4. Separate card destructive “ফোন বিচ্ছিন্ন করুন”; connected identity updates only after successful backend result। Existing confirmation dialog reuse; reference has no separate confirmation design।

Card radius14, margin0/16/10; row10/14, font13, value12 muted, row icon17; dividers1। Scroll area flexes above bottom nav। Diagnostics destination not drawn: audit existing implementation; no dead button and no claim of exact unseen screen। Sensitive codes/tokens/SMS bodies must not appear in shareable diagnostic output। Language/theme persist after relaunch, system mode follows OS। English translation layout stays identical, বাংলা uses Hind Siliguri।

## 7. Inbox, chat, media ও profile essentials

Appendix C-এর §§3–15 পূর্ণ screen-by-screen written spec; Appendix B-এর CSS/JS exact values এবং প্রতিটি string। নিচের checklist binding; দীর্ঘ detailed spec পড়ে তারপর code করো।

### Inbox

Header17 title, connection chip, filter34 radius10 count badge15। Chips horizontal scroll gap6 padding4/16/8, font12 padding5/12। Row10/16 gap12; avatar40; channel badge18 offset−3 ring2; name14/500 preview12 ellipsis; time11; unread min18 height18। New activity sorts newest first; movement340ms, new row450ms। Pull max70 threshold40; demo hold800ms is fixture timing, real refresh waits actual response। Filters channel/status/time, reset + result-count CTA, persistence workspace scoped; literal browser localStorage key is not a native persistence API requirement। Offline banner + empty/reset state as C। Active Inbox navigation only on root list, no bottom bar invented inside detail chat/profile。

### Chat/text/selection

Header padding12/10/10/6; back34; customer header avatar34 + name14/sub11 opens profile; AI chip11။ No call/menu。 Screens slide320ms cubic(.2,.8,.2,1), parent−24%, dim.35; profile dims chat brightness.7। Message row1/14, run margin7; bubble max78%, padding9/12 radius16 tail5; customer s1 left, AI s2 right, seller contrast right। Text13/1.5; meta10; tick13 stroke2.2; time/blue-seen interactions source exact। Own statuses sending clock/sent1/delivered2/seen blue/failed13 red “!”; Instagram skip delivered per capability। Do not infer delivered/seen from elapsed time。

Unread divider opens at first unread; days/relative time localized; preserve scroll on older-page load/live updates។ FAB36 right14 bottom10 when >120 from bottom; badge unread new customer messages only। Reply quote green3 radius8; tap original scrolls/flashes1.2s। Long press430ms; selection toolbar covers header, copy text-only, forward own/AI supported types only; reactions six source emoji customer-only toggle। Swipe right threshold56dp, extra distance×.28, vibrate12ms once crossing, spring return380ms; vertical scrolling must not accidentally reply/long press। Accessibility equivalent actions without adding decorative UI。

### Composer/voice

Composer padding8/12/14, gap8; input min40 radius20; textarea38→96, font13 line1.5; clip32×38, camera collapses width0 after typing; send40 circle morph280ms spring։ Offline opacity.45/disabled and “ইন্টারনেট নেই”; 24h closed replaces composer with exact two-line card। Use last customer message, not last seller/AI activity; server enforces send eligibility too। Seller send disables AI persistently per conversation; restore toggle must persist, not just change local chip。

Recording replaces input at same position; height40 radius20 with trash34, red dot9, duration min32, waveform bars2.5 gap2 heights3–23, max40 samples, 90ms refresh; right send arrow stays40। Real microphone capture and real amplitude required; runtime mic permission requested at recording action, not AI onboarding। <1s → “ভয়েস খুব ছোট”; discard on leaving; release recorder/player resources and handle interruption。 Waveform playback26 bars/play32/duration11; one active player, no fake progress detached from audio。

### Media, products, forwarding

Gallery multi-pick max10, camera single; max-count toast exact। Black preview full-screen close/counter, thumbs52 radius10 gap8, active border2 white, inactive65%, remove16, dashed add tile, count on send; no caption field। Single image220×max260 cover; group width220 gap2 radius13; 2 columns150; 3 first wide150 then100; 4 grid108; >4 first4 with +remaining overlay black50%22 white। One group status, underlying message batching follows actual provider contract। Viewer swipe>50 and arrows40, proper index, pinch zoom, back; no lost selection after rotation。

Product card210, art110, name13/500 sizes11.5 price500, no invented CTA。 Demo emoji art is fixture; real product assets/data in production। File tile34, name max130 ellipsis, real filename/size; unsupported text exact italic, not silently dropped। Attachment circles52: gallery/camera/document if supported/product। Forward targets exclude current, disabled45% for closed window/unsupported file with reason; plain new copy no forwarded label; target AI off; no cross-workspace leakage। Message info uses actual events, channel and sender; unknown timestamps never fabricated。

### Customer profile

Header “কাস্টমারের তথ্য”15/500; scroll bottom24; hero avatar76/badge24/name19, quick buttons max104 padding10/4 radius14 gap10। Cards margin10/12/0 padding14 radius18 border1 title12 muted। Exact order: hero, actions, verdict, eligible order summary, behavior or intro, grouped history, known contact, interests if any, notes। Ring68 inner54 text15; stat tiles min78 gap8 radius12 value18। Order rows item13 date11.5 right amount13 chip11; three per store then more/less toggle। Unknown user/phone/address omitted; phone copy only when exists; no duplicated WhatsApp number row under contact if hero already shows it。

Verdict precedence: no orders/talks≤1 নতুন; no orders/talks≥4 frequent non-buyer amber; no orders/talks2–3 neutral; orders but none completed neutral first order; completed<3 with100% green good start otherwise red caution; then ≥85 green,60–84 amber,<60 red। Completed=success+cancel+return, excludes in-progress। No percent denominator0। Exact Bengali labels/reasons in C §11/B verdict()। Summary only when completed>0; optional zero stats omitted; spend only successful, average only≥2 successes। True known 0% with completed orders is valid, unknown 0% is not। Brand-new profile no ring/rate/stats/history/behavior; intro includes first message timestamp/channel/text। Group stores only within authorized server scope; never fetch unrelated merchants just because fixture contains several names। Notes save/deletion durable; failure never success toast。

## 8. Phase plan — একই ক্রমে কাজ, clear exit gate

প্রতিটি phase-এর status TODO → IN_PROGRESS → IMPLEMENTED_UNVERIFIED → VERIFIED। BLOCKED হলে exact dependency লিখবে; next independent item করা যায়, dependent feature fake করা যায় না। Phase verified না হলে তার code “complete” বলে পরের handoff-এ লিখবে না।

| Phase | কাজ | Exit evidence |
|---|---|---|
| 0 — Repository audit | Android module/stack/build variants/current screens/pairing/queue/backend/channel code map; AGENTS instructions; current commit; actual implementation vs reference gap; baseline build | Paths+symbols+commands+results; feature coverage matrix; no guessed endpoints |
| 1 — Shared visual foundation | Font bundled, dark/light/system tokens, vectors, typed reusable buttons/chips/cards/nav; insets/baselines; deterministic fixtures | Setup & Inbox shell dark/light captures, font/theme persistence, narrow screen no clipping |
| 2 — Workspace pairing & setup | Welcome, camera/scan/manual code/loading/error, three confirmation modes, consent, version-aware product permissions, success/disconnect/reconnect | AI-only/Payment-only/both + expired code/offline/denied/Samsung/non-Samsung; no duplicate device |
| 3 — SMS & Settings | Final SMS counts/history/retry/offline queue, real connection state, product nav, workspace/service/device Settings, language/theme/reliability/diagnostics/disconnect | Offline→network→server ack; process restart/reboot pending retry; settings persist; no financial-confirmation claim |
| 4 — Inbox & text chat | Conversation list/filter/unread/sync notifications, detail header/messages/status/AI handover/composer/reply/selection/swipe | Inbox state catalog + text cases; real API errors; no fake ticks/customer reply |
| 5 — Media & advanced messaging | Image multi-pick/preview/grids/viewer/zoom, real voice record/play, document/product, reaction/forward/info, capability/window rules | Every media catalog state, 1/2/3/4/5+/10/11 images, voice<1s, Instagram restrictions, actual events |
| 6 — Customer profile | All verdict variants, scoped orders+summary/history/contact/interests, persistent notes incl clearing | Every profile catalog; threshold/zero/unknown cases; server authorization; relaunch saves |
| 7 — Integration & release | E2E three capability modes, offline/recovery/lifecycle, parity review all states dark/light, build and release validation | All gates with evidence; APK if available/requested; exact commit/artifact identity; honest remaining list |

### Phase 0 mandatory outputs

Create/update repo-local `ANDROID-REDESIGN-HANDOFF.md` (this contract or its maintained operational copy), `ANDROID-REDESIGN-STATUS.md`, `ANDROID-REFERENCE-COVERAGE.md`, `ANDROID-DESIGN-DEVIATIONS.md`। Names are proposed new docs, not existing repo files। Do not move application source into a standalone demo repository। Preserve unrelated work, inspect git status before edits।

Coverage rows: reference state → native screen/component path → data source/API symbol → UI status → functional status → dark/light visual result → evidence → blocker। If backend absent, specify minimum missing contract rather than inventing a route। Existing Kotlin feature found working can be retained; validate before marking verified।

### Per-phase acceptance gates

- Phase2: unknown workspace never shows sample store; quick double-tap confirm does not pair twice; denial stays recoverable; OS back/camera release; server disconnect caught after relaunch; already granted permissions skipped; manual code same backend verification.
- Phase3: pending survives offline/app restart; acknowledge vs retry safe; live false if backend unreachable despite network; SMS counter based on receipts not payment amounts; AI-only no SMS task/nav; Payment-only no unsupported inbox; reconnect preserves identity and original queue ownership.
- Phase4: last-activity order updates; unread decrements backed by API; filters scoped and persisted; no customer typing/online claim; send failure retry one logical message; AI state refresh/relaunch stable; overlapping live events deduplicated by server message id.
- Phase5: picker cancel no empty send; remove final preview exits; >10 no overflow; reconnect does not auto-send duplicate media; actual file/voice bytes received; unsupported action cannot be invoked via hidden UI/deep link; window crossing while chat open updates composer.
- Phase6: verdict thresholds exactly; totals not derived from truncated visible3 orders; raw phone copy; note empty save; API errors do not masquerade as empty real profile; cached profile not leaked across workspace.
- Phase7: tests meaningful to business paths; baseline failures distinguished; build failure blocks release claim; no secrets in docs/logs/APK metadata; use existing signing setup without printing key credentials. Push/merge/deploy state only if actually done; this document itself is not a fresh instruction to release unrelated changes.

## 9. Production data contract audit checklist

Before integration map existing contracts for pairing lookup/confirmation/reconnect/revocation; workspace capabilities; device identity; receipt enqueue/ack/retry; conversation list/filter/paging/read/unread; messages list/paging/send/reply/media upload; delivery/seen events; AI takeover/toggle; reactions; product catalog; customer profile/order stats/authorized stores; notes save/clear; push registration and deep links। This is an audit checklist, not a claim all APIs exist।

For every asynchronous screen model: loading, loaded-empty, loaded, stale-cached/offline, recoverable-failed, access-disabled/revoked where applicable। Spinner ends on failure; absent data not 0; restored connectivity triggers bounded retry and reconciliation। Use existing secure auth/device signature rules; do not weaken backend validation to fit prototype। Account/device plan limits unchanged। Background SMS signed evidence remains Go-authoritative workspace matching, no customer TrxID/screenshot requirement added।

Provider-specific capabilities/version guidance must be verified during implementation from official contracts. Missing feature classify `BACKEND_REQUIRED`, `PROVIDER_UNSUPPORTED`, or `REFERENCE_UNSPECIFIED`; do not advertise functional completion with hardcoded arrays。

## 10. Visual QA ও checkpoint নিয়ম

Visual fixture mode must be test/debug only, deterministic time/data/randomness, one named state at a time; clear timers/reset storage between states. Production uses actual data। Compare source and native same inner viewport, theme, fixture, font scale, density; screenshots/overlay inspect text wrapping, bounds, padding, stroke, colour, tails, layers and keyboard inset। Automatable measurements help; raw pixel diff alone is not a universal pass/fail because native font rendering differs। No unreviewed geometry/font/colour difference accepted as “close enough”; deviation list exact reason/effect রাখবে।

Check small width, reference width, large screen, large font without broken interactions; RTL scope not requested। System back closes top overlay→profile→chat→root as applicable; keyboard and recording lifecycle verified। Accessibility labels for icons, adequate hit regions without changing visible glyph size, disabled reason readable, reduced-motion respects app/system setting।

### নতুন এজেন্টের checkpoint template

```md
# Android redesign — current checkpoint
Updated: <timestamp>
Repository / branch / HEAD: <actual>
Working tree: <clean or actual changed files>
Current phase: <id and state>
Verified phases: <ids with evidence>
Implemented but unverified: <exact items>
Not started: <exact items>
Blocked: <reason + required dependency>
Changed files / symbols: <paths>
Backend changes / migrations: <actual; none if none>
Reference coverage: <state ids passed/failed/not-run>
Checks run: <exact command, result, relevant output>
Visual evidence: <reference/native viewport, captures, unresolved differences>
Design deviations: <decision, reason, user-visible impact>
Next action: <single concrete next step and path/symbol>
Release / push / deploy status: <actual only>
Secrets: not included
```

শেষ message-এ just done নয়: কোন phase verified, কোনটি unverified/blocked, কোন file changed, কী পরীক্ষা হয়েছে, next action লিখবে। Context কমলে নতুন feature শুরু না করে আগে checkpoint persist করবে। Checklist app থেকে পাওয়া evidence ছাড়া tick নয়।

### বর্তমান handoff status

| Item | অবস্থা |
|---|---|
| তিন source, state catalog, conflicts, phase plan, checkpoint contract | এই deliverable-এ প্রস্তুত |
| Repository implementation audit | NOT STARTED — repo সরবরাহ/খোলা হয়নি |
| Kotlin/UI/backend modifications | NOT STARTED |
| Native visual comparison/emulator/device QA | NOT RUN |
| APK build/signing/push/merge/deploy | NOT RUN |

## 11. Copy-and-send instruction for the next agent

এই MD পুরো পড়ো। Appendix A/B/C থেকে reference extract করো, latest override ও conflict decisions মেনে চলবে। আমার existing native Kotlin Ekmivo app-এ Phase0 audit দিয়ে শুরু করে Phase1–7 ক্রমে সম্পূর্ণ implement করবে। প্রতি phase শেষে checkpoint/coverage/deviations update করবে এবং actual checks ছাড়া verified বলবে না। Generic redesign, demo WebView, fake data/timers দিয়ে production complete নয়। Backend gap থাকলে স্পষ্ট লিখে implementable কাজ চালাও। Limit শেষ হওয়ার আগে current phase, exact files, verified results এবং next action persist করবে। শুধু এই MD-তে থাকা screenshot count বা demo state দেখে repository already complete ধরে নিও না।

## 12. সম্পূর্ণ reference state index

নিচের 49টি Inbox/chat/profile state source থেকে নেওয়া; setup/SMS/settings index §5–6-এ। প্রতিটি phase coverage table-এ এই exact ids রাখবে।

| # | State ID | দৃশ্য | যাচাইয়ের বিষয় |
|---|---|---|---|
| 1 | `list` | ইনবক্স তালিকা | সব চ্যানেলের কথোপকথন একসাথে, নতুন কার্যকলাপ আগে। অ্যাভাটারের কোণের ছোট আইকন বলে মেসেজ কোথা থেকে এসেছে। উপরের ডানে ফিল্টার বাটন। |
| 2 | `list-filter` | ফিল্টার চিপ: অপঠিত | সব, অপঠিত, আর ওয়ার্কস্পেসে যে চ্যানেল আছে। সংখ্যা সরাসরি চিপে। |
| 3 | `list-filter-channel` | ফিল্টার চিপ: চ্যানেল | একটা চ্যানেল বাছলে শুধু সেই চ্যানেলের চ্যাট। |
| 4 | `list-filter-sheet` | ফিল্টার শিট | চ্যানেল, স্ট্যাটাস (AI উত্তর দিচ্ছে / আপনি / উত্তরহীন), সময়। ফিল্টার চালু থাকলে বাটনে ডট। |
| 5 | `list-offline` | ইনবক্স অফলাইন | ইন্টারনেট না থাকলে ব্যানার আর অ্যাম্বার স্ট্যাটাস। নেট এলে নিজে থেকে ঠিক হয়, আবার পেয়ার করতে হয় না। |
| 6 | `list-notif` | অ্যাপের ভেতরে নোটিফিকেশন | অন্য চ্যাটে মেসেজ এলে উপরে ব্যানার, ৩.২ সেকেন্ড পরে সরে যায়। চাপলে সেই চ্যাট। অ্যাপ ব্যাকগ্রাউন্ডে থাকলে সিস্টেম নোটিফিকেশন। |
| 7 | `chat-open` | চ্যাট খোলা | কাস্টমার বাঁদিকে, AI আর আপনি ডানদিকে। হেডারে কাস্টমারের নাম আর AI চালু/বন্ধ চিপ। নামে চাপলে কাস্টমারের পুরো তথ্য খোলে। কল, ভিডিও কল বা মেনু নেই। |
| 8 | `profile-regular` | কাস্টমারের তথ্য: ভরসাযোগ্য কাস্টমার | হেডারে নামে চাপলে এই পাতা খোলে। উপরে নাম, চ্যানেল আর “কেমন কাস্টমার” ট্যাগ। নিচে সফল অর্ডারের হার, মোট অর্ডার, সফল, বাতিল, মোট কেনাকাটা, আর কতবার কথা বলে কতবার কিনেছেন। |
| 9 | `profile-orders` | অর্ডারের ইতিহাস (স্টোর অনুযায়ী) | কাস্টমার কোন ওয়ার্কস্পেস বা স্টোর থেকে কী কিনেছেন, স্টোর ধরে আলাদা দলে। প্রতিটি অর্ডারে তারিখ, দাম আর অবস্থা। বাতিল হলে কারণও লেখা থাকে। প্রতি স্টোরে সর্বশেষ ৩টি দেখায়, বাকিগুলো “আরও দেখুন” চাপলে। |
| 10 | `profile-risky` | কাস্টমারের তথ্য: ঝুঁকিপূর্ণ কাস্টমার | বেশিরভাগ অর্ডার বাতিল করলে লাল ট্যাগ আসে। সাথে বাতিলের কারণ আর কী করা ভালো তার ছোট পরামর্শ। |
| 11 | `profile-new` | কাস্টমারের তথ্য: নতুন কাস্টমার | প্রথমবার মেসেজ করলে যে তথ্য এখনো নেই তা “০” বা ফাঁকা হিসেবে দেখানো হয় না, পুরো অংশটাই বাদ যায়। শুধু যা জানা আছে তা থাকে: চ্যানেল, প্রথম মেসেজ ও তার লেখা। অর্ডারের জায়গায় এক লাইনের ব্যাখ্যা। |
| 12 | `profile-lookers` | কাস্টমারের তথ্য: বারবার জিজ্ঞেস করেন, কেনেননি | অনেকবার কথা বলেছেন কিন্তু কোনো অর্ডার হয়নি, এমন কাস্টমারের জন্য আলাদা ট্যাগ। কী কী নিয়ে জানতে চেয়েছেন তাও দেখায়। |
| 13 | `profile-first-order` | কাস্টমারের তথ্য: প্রথম অর্ডার চলছে | ডেলিভারি না হওয়া পর্যন্ত সফল অর্ডারের হার দেখানো হয় না, কারণ তখন হিসাবটা অর্থহীন। |
| 14 | `chat-ai-typing` | AI লিখছে | হেডারের নিচে সবুজ লেখা, আর তালিকার শেষে তিন ডটের বাবল। কাস্টমার টাইপ করছে কি না চ্যানেল জানায় না, তাই সেটা নেই। |
| 15 | `chat-select-customer` | মেসেজ ধরে রাখা: কাস্টমার | উপরে রিঅ্যাকশন বার। হেডার ঢেকে রিপ্লাই, ফরওয়ার্ড নেই (কাস্টমারের মেসেজ), কপি, তথ্য। |
| 16 | `chat-reacted` | রিঅ্যাকশন দেওয়া | মেসেজের নিচের কোণে ছোট চিপ। একই ইমোজিতে আবার চাপলে মুছে যায়। |
| 17 | `chat-select-own` | মেসেজ ধরে রাখা: AI বা আপনার | রিঅ্যাকশন বার নেই। হেডারে রিপ্লাই, ফরওয়ার্ড, কপি, তথ্য। |
| 18 | `chat-swipe` | সোয়াইপ করে রিপ্লাই | ডানে টানলে আইকন আসে, সীমা পেরোলে আইকন উল্টে যায় আর হালকা কাঁপুনি। ছেড়ে দিলে বাবল স্প্রিং করে ফেরে। |
| 19 | `chat-reply-bar` | রিপ্লাই বার | কম্পোজারের উপরে উদ্ধৃতি বার। পাঠালে বাবলের ভেতরে উদ্ধৃতি, চাপলে আসল মেসেজে লাফ দিয়ে ফ্ল্যাশ। |
| 20 | `attach-sheet` | অ্যাটাচ শিট | গ্যালারি, ক্যামেরা, ডকুমেন্ট, পণ্য। |
| 21 | `attach-sheet-ig` | অ্যাটাচ শিট: Instagram | Instagram ডকুমেন্ট নেয় না, তাই বাটনটাই থাকে না। চ্যানেলের ক্ষমতা ব্যাকএন্ড থেকে আসে। |
| 22 | `product-picker` | পণ্য বাছাই | ক্যাটালগ থেকে পণ্য। চাপলেই কার্ড চলে যায়। |
| 23 | `image-preview` | ছবি পাঠানোর আগে | গ্যালারি থেকে একসাথে অনেক ছবি বাছা যায়। বাছার পর পুরো স্ক্রিনে প্রিভিউ। ক্যাপশন নেই (Messenger আর Instagram ছবিতে ক্যাপশন নেয় না)। |
| 24 | `images-preview` | একসাথে ৪টি ছবি: পাঠানোর আগে | নিচে ছোট ছবির সারি। যেটায় চাপবেন সেটা বড় হয়ে দেখা যায়। ছোট × দিয়ে বাদ দেওয়া যায়, “+” দিয়ে আরও ছবি যোগ (সর্বোচ্চ ১০টি)। পাঠানোর বাটনে মোট ছবির সংখ্যা। |
| 25 | `images-2` | ২টি ছবি পাঠানো | চ্যাটে পাশাপাশি দুটি। সময় আর টিক নিচের ডানে, একই বাবলে। |
| 26 | `images-3` | ৩টি ছবি পাঠানো | উপরে একটি চওড়া ছবি, নিচে দুটি। |
| 27 | `images-4` | ৪টি ছবি পাঠানো | ২×২ গ্রিড। পুরো গ্রুপের একটাই টিক, আলাদা আলাদা নয়। |
| 28 | `images-received-5` | কাস্টমার ৫টি ছবি পাঠালে | গ্রিডে প্রথম ৪টি দেখায়, চতুর্থটির উপর বাকি ছবির সংখ্যা (“+১”)। চাপলে সব ছবি বড় করে দেখা যায়। |
| 29 | `images-viewer` | একাধিক ছবি বড় করে দেখা | ডানে-বাঁয়ে টেনে বা তীরে চেপে পরের ছবি। উপরে নামের পাশে কত নম্বর ছবি তা লেখা (যেমন ৩/৫)। |
| 30 | `image-sending` | ছবি: পাঠানো হচ্ছে | ছবির ভেতরে নিচের ডানে সময় আর ঘড়ি। |
| 31 | `image-sent` | ছবি: পাঠানো হয়েছে | এক ধূসর টিক। |
| 32 | `image-delivered` | ছবি: পৌঁছেছে | দুই ধূসর টিক, দ্বিতীয়টা পাশ থেকে স্লাইড করে আসে। Instagram-এ এই ধাপ নেই। |
| 33 | `image-seen` | ছবি: দেখেছে | টিক নীল হয়ে যায় (৩০০ মি.সে. ক্রসফেড)। একই চার ধাপ টেক্সটেও। |
| 34 | `image-received` | কাস্টমারের ছবি | বাঁদিকে, ২২০ ডিপি পর্যন্ত চওড়া। চাপলে বড় করে দেখা। |
| 35 | `image-viewer` | ছবি বড় করে দেখা | কালো ব্যাকগ্রাউন্ড, উপরে পাঠকের নাম, পিঞ্চে জুম। |
| 36 | `product-card` | পণ্যের কার্ড | AI বা আপনি পণ্য পাঠালে কাস্টমার যা দেখে তা-ই। কার্ডে চাপার মতো বাটন নেই। |
| 37 | `voice-recording` | ভয়েস রেকর্ডিং | রেকর্ডিং শুরু হলে লেখার বক্স সরে গিয়ে পুরো জায়গায় রেকর্ডার আসে: বাঁয়ে ফেলে দেওয়ার বাটন, লাল ডট, সময় আর কথার সাথে চলা তরঙ্গ। ডানে পাঠানোর বাটন। ১ সেকেন্ডের কম হলে পাঠানো হয় না, টোস্টে জানায়। |
| 38 | `voice-message` | ভয়েস মেসেজ | প্লে বাটন আর ২৬ বারের তরঙ্গ। চালালে বার একে একে ভরে। |
| 39 | `doc-message` | ডকুমেন্ট মেসেজ | ফাইলের নাম আর সাইজ। |
| 40 | `sticker-unsupported` | স্টিকার ও অসমর্থিত মেসেজ | স্টিকার বাবল ছাড়া। চেনা যায় না এমন মেসেজ লুকানো হয় না, নোট দেখায়। |
| 41 | `info-sheet` | মেসেজ তথ্য | পাঠানো, পৌঁছেছে, দেখেছে, চ্যানেল, কে পাঠিয়েছে। সময় সত্যিকারের ইভেন্ট থেকে, আন্দাজে না। |
| 42 | `forward-sheet` | ফরওয়ার্ড শিট | অন্য চ্যাট বেছে নিলে একই মেসেজের কপি যায়, “ফরওয়ার্ডেড” লেবেল নেই। ২৪ ঘণ্টা পেরোনো চ্যাট ধূসর। |
| 43 | `window-closed` | ২৪ ঘণ্টা পার | ইনপুটের জায়গায় নোটিশ। কাস্টমার নতুন মেসেজ দিলে নিজে থেকে খুলে যায়। |
| 44 | `chat-offline` | চ্যাট অফলাইন | ব্যানার, ইনপুট ধূসর, উত্তর পাঠানো যায় না। |
| 45 | `send-failed` | পাঠানো ব্যর্থ | লাল “!” আইকন, চাপলে আবার চেষ্টা। |
| 46 | `composer-typing` | লেখার সময় কম্পোজার | লেখা শুরু করলে ক্যামেরা সরে যায়, মাইক ঘুরে পাঠানোর তীর হয়। |
| 47 | `chat-light` | চ্যাট: লাইট থিম | একই লেআউট, শুধু রং বদলায়। |
| 48 | `list-light` | তালিকা: লাইট থিম | একই লেআউট, শুধু রং বদলায়। |
| 49 | `profile-light` | কাস্টমারের তথ্য: লাইট থিম | একই লেআউট, শুধু রং বদলায়। |

## 13. Embedded source extraction ও integrity

এই MD-র নিচের fenced source block-এর ভিতরের bytes UTF-8 হিসেবে সংশ্লিষ্ট নামে save করলে reference পাওয়া যাবে। Appendix C-তে তার নিজস্ব Appendix A/fence আছে; outer block পাঁচটি backtick ব্যবহার করেছে যাতে nesting না ভাঙে। Source নিজেরা edit করা হয়নি; উপরের নির্দেশনা overlay হিসেবে conflict মেটায়। HTML Google font request করে; visual reference খুলতে font load সত্যিই হয়েছে কিনা পরীক্ষা করবে। Native font offline bundled হবে।

| Original file | UTF-8 bytes | SHA-256 |
|---|---|---|
| `ekmivo-app-design.html` | 155951 | `f48b4942199621a6cadbd4857577f02ca2c9c9b67d78fd3bf560d6515c55b684` |
| `ekmivo-inbox.html` | 92900 | `70f389cd111b69557c3db7a936cc5c1c32a6305684fe815b1d707435b60d33f6` |
| `ekmivo-design-spec.md` | 132646 | `ec3ebeb1c9cd5332729d4edda790337e7d59996f617f28802998394d0bc8e8d9` |

## Appendix A — ekmivo-app-design.html (হুবহু)

<!-- BEGIN SOURCE: ekmivo-app-design.html -->
`````html
<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ekmivo Android app: design reference</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--pg:#F4F3EE;--tx:#1B1B19;--mu:#6B6A64;--cb:#fff;--cbd:#D9D8D1;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--pg:#121211;--tx:#F1F0EA;--mu:#9A988F;--cb:#1E1E1C;--cbd:#34332F}}
:root[data-theme="dark"]{--pg:#121211;--tx:#F1F0EA;--mu:#9A988F;--cb:#1E1E1C;--cbd:#34332F}
html{scroll-padding-top:env(safe-area-inset-top,0px)}
*{box-sizing:border-box}
body{margin:0;background:var(--pg);color:var(--tx);font-family:"Hind Siliguri",system-ui,sans-serif;padding:20px 16px 40px;min-height:100vh}
h1{font-size:20px;font-weight:500;margin:0 0 4px;text-align:center}
.lead{font-size:14px;color:var(--mu);text-align:center;margin:0 0 16px}
.row2{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:14px}
.row2 button{font:inherit;font-size:14px;padding:7px 14px;border-radius:99px;border:1px solid var(--cbd);background:var(--cb);color:var(--tx);cursor:pointer}
.row2 button.on{background:var(--tx);color:var(--pg);border-color:var(--tx)}
button:focus-visible{outline:2px solid #3DDC97;outline-offset:2px}
#cap{text-align:center;font-size:16px;font-weight:500;margin:4px 0 4px}
#note{text-align:center;font-size:13px;color:var(--mu);max-width:320px;margin:0 auto 16px;line-height:1.6;min-height:42px}
.ph{--bg:#0F0F0E;--s1:#181817;--s2:#222220;--bd:#2C2C29;--tx:#F1F0EA;--mu:#8D8B84;--ok:#3DDC97;--wr:#F5B544;--er:#F2685B;width:300px;max-width:100%;height:620px;margin:0 auto;background:var(--bg);color:var(--tx);border-radius:34px;border:6px solid #2C2C29;overflow:hidden;display:flex;flex-direction:column}
.ph .top{display:flex;align-items:center;gap:10px;padding:16px 16px 8px}
.ph .logo{width:34px;height:34px;border-radius:10px;background:var(--tx);color:#111;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:16px;flex:none}
.ph .shop{font-size:14px;font-weight:500;line-height:1.2}
.ph .sub{font-size:11px;color:var(--mu)}
.ph .chip{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;padding:4px 10px;border-radius:99px;border:1px solid var(--bd);background:var(--s1)}
.ph .dot{width:7px;height:7px;border-radius:50%;background:var(--ok);animation:bl 1.6s infinite}
@keyframes bl{50%{opacity:.35}}
@keyframes rp{0%{transform:scale(.8);opacity:.5}100%{transform:scale(1.25);opacity:0}}
@keyframes sp{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ph .dot,.ph .ring i.r,.ph .spin{animation:none}}
.ph .hero{display:flex;flex-direction:column;align-items:center;padding:10px 16px 6px}
.ph .ring{position:relative;width:136px;height:136px;display:flex;align-items:center;justify-content:center;margin:10px 0 12px}
.ph .ring i.r{position:absolute;inset:0;border-radius:50%;border:1px solid var(--ok);animation:rp 2.8s infinite}
.ph .ring i.r2{animation-delay:1.4s}
.ph .core{width:112px;height:112px;border-radius:50%;background:var(--s1);border:1px solid var(--bd);display:flex;flex-direction:column;align-items:center;justify-content:center}
.ph .amt{font-size:22px;font-weight:500}
.ph .lab{font-size:11px;color:var(--mu);margin-top:2px}
.ph .note{font-size:12px;color:var(--mu);text-align:center}
.ph .stats{display:flex;gap:8px;padding:12px 16px 4px}
.ph .st{flex:1;background:var(--s1);border-radius:12px;padding:9px 10px}
.ph .st b{display:block;font-size:17px;font-weight:500}
.ph .st span{font-size:11px;color:var(--mu)}
.ph .sec{font-size:11px;color:var(--mu);padding:12px 16px 6px}
.ph .row{display:flex;align-items:center;gap:10px;padding:9px 16px;border-top:1px solid var(--bd)}
.ph .pv{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;color:#fff}
.ph .rm{flex:1;min-width:0}.ph .rm b{font-size:14px;font-weight:500;display:block;line-height:1.25}.ph .rm span{font-size:11px;color:var(--mu)}
.ph .tag{font-size:11px;padding:3px 8px;border-radius:99px;white-space:nowrap}
.ph .t-ok{background:#12301F;color:var(--ok)}.ph .t-wr{background:#33260D;color:var(--wr)}.ph .t-er{background:#3A1B18;color:var(--er)}.ph .t-n{background:var(--s2);color:var(--mu)}
.ph .scrl{flex:1;min-height:0;overflow-y:auto;scrollbar-width:none}.ph .scrl::-webkit-scrollbar{display:none}
.ph .nav{margin-top:auto;display:flex;border-top:1px solid var(--bd);padding:8px 24px 14px;justify-content:space-around}
.ph .ni{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;color:var(--mu);padding:4px 18px;border-radius:12px}
.ph .ni.on{color:var(--tx);background:var(--s2)}
.ph svg.i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.ph .btn{display:flex;align-items:center;justify-content:center;height:46px;border-radius:14px;font-size:15px;font-weight:500;width:100%;background:var(--tx);color:#111}
.ph .lnk{font-size:13px;color:var(--mu);text-align:center;padding:10px}
.ph .bot{padding:0 20px 24px}
.ph .ctr{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 24px}
.ph .ic{width:76px;height:76px;border-radius:24px;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;margin-bottom:18px}
.ph .ic svg.i{width:32px;height:32px}
.ph h3{font-size:19px;font-weight:500;margin:0 0 8px;line-height:1.5}
.ph p{font-size:13px;color:var(--mu);margin:0;line-height:1.7}
.ph .card{background:var(--s1);border-radius:14px;margin:0 16px 10px;overflow:hidden}
.ph .li{display:flex;align-items:center;gap:10px;padding:10px 14px;font-size:13px;border-top:1px solid var(--bd)}
.ph .li:first-child{border-top:0}.ph .li .v{margin-left:auto;color:var(--mu);font-size:12px}
.ph .li svg.i{width:17px;height:17px;color:var(--mu)}
.ph .seg{display:flex;gap:6px;margin-left:auto}.ph .seg b{font-weight:400;font-size:12px;padding:4px 10px;border-radius:99px;border:1px solid var(--bd);color:var(--mu)}.ph .seg b.on{background:var(--tx);color:#111;border-color:var(--tx)}
.ph .dots{display:flex;gap:6px;justify-content:center;padding:18px 0 0}.ph .dots b{width:22px;height:4px;border-radius:2px;background:var(--bd)}.ph .dots b.on{background:var(--tx)}
.ph .scan{flex:1;margin:10px 16px;border-radius:20px;background:#0A0A09;border:1px solid var(--bd);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;position:relative}
.ph .scan.dim .fr{opacity:.55}
.ph .fr{width:150px;height:150px;position:relative}.ph .fr i{position:absolute;width:26px;height:26px;border:2.5px solid var(--tx)}
.ph .hint{font-size:12px;color:var(--mu)}
.ph .torch{position:absolute;top:12px;right:12px;font-size:11px;padding:4px 10px;border-radius:99px;border:1px solid var(--bd);background:var(--s1);color:var(--mu)}
.ph .sheet{background:var(--s2);border-radius:24px 24px 0 0;padding:18px 18px 22px;margin-top:auto;border-top:1px solid var(--bd)}
.ph .stp{display:flex;align-items:center;gap:10px;padding:10px 12px;font-size:13px;text-align:left;border-top:1px solid var(--bd)}
.ph .stp:first-child{border-top:0}
.ph .n{width:20px;height:20px;border-radius:50%;border:1px solid var(--bd);font-size:11px;display:flex;align-items:center;justify-content:center;color:var(--mu);flex:none}
.ph .cells{display:flex;gap:6px;justify-content:center;align-items:center;margin:20px 0 6px}
.ph .cell{width:26px;height:38px;border-radius:8px;border:1px solid var(--bd);background:var(--s1);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:500}
.ph .cell.on{border-color:var(--tx)}
.ph .spin{width:34px;height:34px;border-radius:50%;border:3px solid var(--bd);border-top-color:var(--tx);animation:sp 1s linear infinite}
.ph .nav.t3{padding:8px 12px 14px}.ph .nav.t3 .ni{padding:4px 12px}
.ph .av{position:relative;width:40px;height:40px;border-radius:50%;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:500;flex:none}
.ph .bd{position:absolute;right:-3px;bottom:-3px;width:18px;height:18px;border-radius:50%;border:2px solid var(--bg);display:flex;align-items:center;justify-content:center;color:#fff}
.ph .bd svg.i{width:10px;height:10px;stroke-width:2.2}
.ph .cv{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--bd)}
.ph .cm{flex:1;min-width:0}.ph .cm b{display:block;font-size:14px;font-weight:500;line-height:1.25}.ph .cm span{display:block;font-size:12px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ph .cr{display:flex;flex-direction:column;align-items:flex-end;gap:5px;font-size:11px;color:var(--mu)}
.ph .un{min-width:18px;height:18px;padding:0 6px;border-radius:99px;background:var(--tx);color:#111;font-size:11px;font-weight:500;display:flex;align-items:center;justify-content:center}
.ph .fl{display:flex;gap:6px;padding:4px 16px 8px;overflow:hidden}
.ph .fl b{font-weight:400;font-size:12px;padding:5px 12px;border-radius:99px;border:1px solid var(--bd);color:var(--mu);white-space:nowrap}.ph .fl b.on{background:var(--tx);color:#111;border-color:var(--tx)}
.ph .fb{margin-left:auto;width:34px;height:34px;border-radius:10px;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;color:var(--mu)}
.ph .bub{padding:9px 12px;border-radius:16px;font-size:13px;line-height:1.5}
.ph .bl{background:var(--s1);border-bottom-left-radius:5px}
.ph .br{background:var(--s2);border-bottom-right-radius:5px}
.ph .bs{background:var(--tx);color:#111;border-bottom-right-radius:5px}
.ph .who{font-size:10.5px;color:var(--mu);margin:0 4px 3px}
.ph .msgs{flex:1;display:flex;flex-direction:column;gap:10px;padding:14px 16px;overflow:hidden}
.ph .comp{display:flex;align-items:center;gap:8px;padding:8px 12px 16px;border-top:1px solid var(--bd)}
.ph .inp{flex:1;height:40px;border-radius:99px;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:center;padding:0 14px;font-size:13px;color:var(--mu)}
.ph .snd{width:40px;height:40px;border-radius:50%;background:var(--tx);color:#111;display:flex;align-items:center;justify-content:center}
.ph .ban{margin:4px 16px 0;padding:10px 12px;border-radius:12px;background:#33260D;display:flex;gap:10px;align-items:flex-start}
.ph .ban svg.i{color:var(--wr);margin-top:2px}
.ph .ban b{display:block;font-size:13px;font-weight:500;color:var(--wr)}.ph .ban span{font-size:12px;color:var(--mu);line-height:1.5}
.ph .ring.off i.r{border-color:var(--wr);animation:none;opacity:.35}
.ph .pr{display:flex;align-items:center;gap:10px;padding:9px 12px;font-size:13px;border-top:1px solid var(--bd)}.ph .pr:first-child{border-top:0}.ph .pr svg.i{width:17px;height:17px;color:var(--mu)}
.ph .pv svg.i{width:16px;height:16px}
.ph .sday{align-self:center;font-size:11px;color:var(--mu)}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<symbol id="act" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></symbol>
<symbol id="set" viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></symbol>
<symbol id="bat" viewBox="0 0 24 24"><rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M6 10v4M10 10v4"/></symbol>
<symbol id="off" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></symbol>
<symbol id="sto" viewBox="0 0 24 24"><path d="M3 9l1-5h16l1 5M3 9h18M4 9v11h16V9"/></symbol>
<symbol id="ref" viewBox="0 0 24 24"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/></symbol>
<symbol id="msg" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></symbol>
<symbol id="bel" viewBox="0 0 24 24"><path d="M6 17v-6a6 6 0 1112 0v6l1.5 2h-15zM10 21h4"/></symbol>
<symbol id="doc" viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7zM14 3v5h5"/></symbol>
<symbol id="phn" viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></symbol>
<symbol id="cam" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></symbol>
<symbol id="chk" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></symbol>
<symbol id="wa" viewBox="0 0 24 24"><path d="M12 4a8 8 0 00-6.9 12L4 20l4.1-1.1A8 8 0 1012 4z"/><path d="M9.5 9.5c.3 2 2.5 4.2 4.5 4.5"/></symbol>
<symbol id="ig" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="4"/><circle cx="12" cy="12" r="3.2"/><path d="M16.5 7.5h0"/></symbol>
<symbol id="ms" viewBox="0 0 24 24"><path d="M13 3L6 13h5l-1 8 7-10h-5z"/></symbol>
<symbol id="arr" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></symbol>
<symbol id="snd" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="flt" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></symbol>
<symbol id="alt" viewBox="0 0 24 24"><path d="M12 4l9 16H3zM12 10v4M12 17h0"/></symbol>
<symbol id="bot" viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h0M15 13h0"/></symbol>
<symbol id="wal" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 14h2"/></symbol>
</svg>

<h1>Ekmivo Android app</h1>
<p class="lead">ডিজাইন রেফারেন্স</p>
<div class="row2" id="modes"></div>
<div id="cap"></div>
<div id="note"></div>
<div id="stage"></div>
<div class="row2" id="nv" style="margin-top:16px"></div>
<div class="row2" id="chips" style="margin-top:16px"></div>

<script>
const I=n=>`<svg class="i" aria-hidden="true"><use href="#${n}"/></svg>`;
const bn=n=>String(n).replace(/\d/g,d=>'০১২৩৪৫৬৭৮৯'[d]);
const nav=a=>`<div class="nav"><div class="ni ${a==0?'on':''}">${I('act')}লাইভ</div><div class="ni ${a==1?'on':''}">${I('set')}সেটিংস</div></div>`;
const hdr=`<div class="top"><div class="logo">e.</div><div><div class="shop">রহিম ফ্যাশন</div><div class="sub">Galaxy A54</div></div>`;
const hdrG=`<div class="top"><div class="logo">e.</div><div><div class="shop">ফোন যুক্ত করুন</div><div class="sub">ড্যাশবোর্ডের QR স্ক্যান করুন</div></div></div>`;
const frame=`<div class="fr"><i style="top:0;left:0;border-right:0;border-bottom:0;border-radius:10px 0 0 0"></i><i style="top:0;right:0;border-left:0;border-bottom:0;border-radius:0 10px 0 0"></i><i style="bottom:0;left:0;border-right:0;border-top:0;border-radius:0 0 0 10px"></i><i style="bottom:0;right:0;border-left:0;border-top:0;border-radius:0 0 10px 0"></i></div>`;
const tg=(l,s)=>`<span class="tag ${s==2?'t-ok':'t-n'}">${l}${s==2?' ✓':''}</span>`;
const W=(k,ic,t,p,tags,btn,lnk)=>`<div class="dots">${[1,2,3,4].map(i=>`<b class="${i<=k?'on':''}"></b>`).join('')}</div>
<div class="ctr"><div class="ic">${I(ic)}</div><h3>${t}</h3><p>${p}</p><div style="display:flex;gap:8px;margin-top:18px">${tags}</div></div>
<div class="bot"><div class="btn">${btn}</div><div class="lnk">${lnk}</div></div>`;
const S={
welcome:`<div class="top"><div class="logo">e.</div><div class="shop">Ekmivo</div></div>
<div class="ctr"><div class="ic">${I('phn')}</div><h3>ফোনটি Ekmivo-র সাথে যুক্ত করুন</h3><p>bKash ও Nagad-এর পেমেন্ট SMS নিজে থেকে যাচাই হবে। আপনাকে কিছু মেলাতে হবে না।</p>
<div class="card" style="margin:20px 0 0;width:100%"><div class="stp"><span class="n">১</span>ড্যাশবোর্ডে ‘ফোন যুক্ত করুন’ খুলুন</div><div class="stp"><span class="n">২</span>এই ফোনে QR স্ক্যান করুন</div><div class="stp"><span class="n">৩</span>প্রয়োজনীয় অনুমতিগুলো দিন</div></div></div>
<div class="bot"><div class="btn">QR স্ক্যান করুন</div><div class="lnk">কোড দিয়ে যুক্ত করুন</div></div>`,
cam:`${hdrG}<div class="scan"><div class="ic" style="margin:0">${I('cam')}</div><div style="text-align:center;padding:0 22px"><h3 style="margin-bottom:6px">ক্যামেরা চালু করুন</h3><p>QR কোড স্ক্যান করতে ক্যামেরা লাগবে। কোনো ছবি তোলা বা রাখা হবে না।</p></div></div>
<div class="bot"><div class="btn">অনুমতি দিন</div><div class="lnk">কোড দিয়ে যুক্ত করুন</div></div>`,
scan:`${hdrG}<div class="scan"><span class="torch">টর্চ</span>${frame}<div class="hint">ড্যাশবোর্ডের QR কোড ফ্রেমে ধরুন</div></div>
<div class="bot"><div class="lnk">কোড দিয়ে যুক্ত করুন</div></div>`,
confirm:`${hdrG}<div class="scan dim">${frame}</div>
<div class="sheet"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div class="logo" style="background:#D12053;color:#fff;font-size:13px">রি</div><div><div class="shop">রহিম ফ্যাশন</div><div class="sub">স্ক্যান সফল হয়েছে</div></div></div>
<p style="margin-bottom:14px">Ekmivo এই ফোনের bKash ও Nagad পেমেন্ট SMS পড়ে <b style="font-weight:500;color:var(--tx)">রহিম ফ্যাশন</b>-এ পাঠাবে। অন্য কোনো SMS পড়া হবে না।</p>
<div class="btn">নিশ্চিত করে যুক্ত করুন</div><div class="lnk" style="padding:10px 0 0">বাতিল</div></div>`,
conn:`${hdrG}<div class="ctr"><div class="ic"><div class="spin"></div></div><h3>যুক্ত হচ্ছে…</h3><p>রহিম ফ্যাশন-এর সাথে নিরাপদ সংযোগ তৈরি হচ্ছে।</p></div>`,
p1:W(1,'msg','পেমেন্ট SMS পড়তে দিন','bKash ও Nagad-এর পেমেন্ট SMS ধরার জন্য এই অনুমতি দরকার। অন্য কোনো SMS পাঠানো হবে না।',tg('SMS',1)+tg('নোটিফিকেশন',1)+tg('ব্যাটারি',1),'অনুমতি দিন','কেন দরকার?'),
p2:W(2,'bel','নোটিফিকেশন চালু করুন','ফরওয়ার্ডিং চালু আছে কি না, আর কোনো SMS ব্যর্থ হলে সেটা জানাতে নোটিফিকেশন দরকার।',tg('SMS',2)+tg('নোটিফিকেশন',1)+tg('ব্যাটারি',1),'অনুমতি দিন','কেন দরকার?'),
p3:W(3,'bat','ব্যাকগ্রাউন্ডে চালু রাখুন','স্ক্রিন বন্ধ থাকলেও যেন কোনো পেমেন্ট SMS মিস না হয়, তাই ব্যাটারি সীমাবদ্ধতা থেকে Ekmivo-কে ছাড় দিন।',tg('SMS',2)+tg('নোটিফিকেশন',2)+tg('ব্যাটারি',1),'অনুমতি দিন','কেন দরকার?'),
p4:W(4,'phn','স্লিপিং অ্যাপ তালিকা থেকে সরান','Samsung ফোনের ব্যাটারি সেটিংসে Ekmivo-কে ‘স্লিপিং অ্যাপ’ ও ‘ডিপ স্লিপিং অ্যাপ’ তালিকা থেকে সরিয়ে রাখুন। নইলে স্ক্রিন বন্ধ থাকলে SMS থেমে যেতে পারে।',tg('SMS',2)+tg('নোটিফিকেশন',2)+tg('ব্যাটারি',2),'সেটিংস খুলুন','করেছি, এগিয়ে যান'),
done:`<div class="top"><div class="logo">e.</div><div class="shop">রহিম ফ্যাশন</div></div><div class="ctr"><div class="ic" style="color:var(--ok)">${I('chk')}</div><h3>সব ঠিক আছে</h3><p>রহিম ফ্যাশনের পেমেন্ট SMS এখন থেকে নিজে থেকে যাচাই হবে।</p></div>
<div class="bot"><div class="btn">শুরু করুন</div></div>`,
home:`${hdr}<div class="chip"><i class="dot"></i>লাইভ</div></div>
<div class="hero"><div class="ring"><i class="r"></i><i class="r r2"></i><div class="core"><div class="amt">৳১২,৪৫০</div><div class="lab">আজ যাচাই হয়েছে</div></div></div><div class="note">শেষ SMS ২ মিনিট আগে পাঠানো হয়েছে</div></div>
<div class="stats"><div class="st"><b>১৮</b><span>পাঠানো</span></div><div class="st"><b>১</b><span>অপেক্ষায়</span></div><div class="st"><b style="color:var(--er)">১</b><span>ব্যর্থ</span></div></div>
<div class="sec">সাম্প্রতিক পেমেন্ট</div>
<div class="row"><div class="pv" style="background:#D12053">bK</div><div class="rm"><b>৳১,২০০</b><span>••••৪৮২১, ২ মি আগে</span></div><span class="tag t-ok">পাঠানো হয়েছে</span></div>
<div class="row"><div class="pv" style="background:#E2262D">Ng</div><div class="rm"><b>৳৮৫০</b><span>••••৯৩০৭, ১১ মি আগে</span></div><span class="tag t-wr">পাঠানো হচ্ছে</span></div>
<div class="row"><div class="pv" style="background:#D12053">bK</div><div class="rm"><b>৳২,৩০০</b><span>••••১২৫৫, ২৪ মি আগে</span></div><span class="tag t-er">আবার চেষ্টা</span></div>
${nav(0)}`,
code:`${hdrG.replace('ড্যাশবোর্ডের QR স্ক্যান করুন','কোড দিয়ে')}<div class="ctr" style="justify-content:flex-start;padding-top:36px"><h3>পেয়ারিং কোড লিখুন</h3><p>ড্যাশবোর্ডের ‘ফোন যুক্ত করুন’ পেজে কোডটি দেখাবে।</p>
<div class="cells"><span class="cell">K</span><span class="cell">7</span><span class="cell">M</span><span class="cell">2</span><span class="hint">-</span><span class="cell">9</span><span class="cell">Q</span><span class="cell on"></span><span class="cell"></span></div></div>
<div class="bot"><div class="btn">কোড যাচাই করুন</div><div class="lnk">QR স্ক্যান করুন</div></div>`,
off:`<div class="top"><div class="logo">e.</div><div class="shop">Ekmivo</div><div class="chip" style="color:var(--er)">বিচ্ছিন্ন</div></div>
<div class="ctr"><div class="ic" style="color:var(--er)">${I('off')}</div><h3>এই ফোন ড্যাশবোর্ড থেকে বিচ্ছিন্ন</h3><p>ওয়েব থেকে ডিভাইসটি সরানো হয়েছে। আবার যুক্ত করলেই SMS পাঠানো শুরু হবে।</p></div>
<div class="bot"><div class="btn">আবার যুক্ত করুন</div><div class="lnk">২টি অপ্রেরিত SMS দেখুন</div></div>`,
set:`<div class="top"><div class="logo">e.</div><div class="shop" style="font-size:17px">সেটিংস</div></div>
<div class="scrl"><div class="card" style="margin-top:6px"><div class="li">${I('sto')}রহিম ফ্যাশন<span class="v">Galaxy A54</span></div><div class="li">${I('ref')}শেষ সিঙ্ক<span class="v">২ মিনিট আগে</span></div></div>
<div class="sec" style="padding-top:6px">নির্ভরযোগ্যতা</div>
<div class="card"><div class="li">${I('msg')}SMS অনুমতি<span class="v" style="color:var(--ok)">চালু</span></div><div class="li">${I('bel')}নোটিফিকেশন<span class="v" style="color:var(--ok)">চালু</span></div><div class="li">${I('bat')}ব্যাটারি ছাড়<span class="v" style="color:var(--wr)">ঠিক করুন ›</span></div></div>
<div class="sec" style="padding-top:2px">অ্যাপ</div>
<div class="card"><div class="li">ভাষা<div class="seg"><b class="on">বাংলা</b><b>English</b></div></div><div class="li">থিম<div class="seg"><b class="on">সিস্টেম</b><b>লাইট</b><b>ডার্ক</b></div></div><div class="li">${I('doc')}ডায়াগনস্টিক ও লগ<span class="v">›</span></div></div>
<div class="card"><div class="li" style="color:var(--er);justify-content:center">ফোন বিচ্ছিন্ন করুন</div></div>
${nav(1)}`
};
const flow=[
['welcome','ওয়েলকাম','অ্যাপ প্রথমবার খুললে, পেয়ার করা না থাকলে এই স্ক্রিন আসে। এখনো অ্যাপ জানে না কোন দোকান।'],
['cam','ক্যামেরা অনুমতি','‘QR স্ক্যান করুন’ চাপলে ক্যামেরার অনুমতি না থাকলে এটি আসে। আগে দেওয়া থাকলে এই ধাপ বাদ।'],
['scan','QR স্ক্যান','এখনো দোকানের নাম জানা নেই, তাই স্ক্রিনে কোনো দোকানের নাম নেই। QR পড়া হলে পরের ধাপ নিজে থেকে আসে।'],
['confirm','নিশ্চিত করুন','QR থেকে (বা কোড যাচাই করে সার্ভার থেকে) দোকানের নাম পাওয়ার পরেই এটি দেখায়। এই বাটনে চাপাই সম্মতি।'],
['conn','সংযোগ','সার্ভারে পেয়ারিং হচ্ছে। ব্যবহারকারীকে কিছু করতে হয় না।'],
['p1','অনুমতি ১: SMS','পেয়ারিং শেষ হতেই অনুমতির ধাপ শুরু। একটা স্ক্রিনে একটা অনুমতি।'],
['p2','অনুমতি ২: নোটিফিকেশন','আগের অনুমতি পেলে নিজে থেকেই এই স্ক্রিনে আসে।'],
['p3','অনুমতি ৩: ব্যাটারি','সিস্টেম ডায়ালগে ‘অনুমতি’ দিলে পরের ধাপ।'],
['p4','অনুমতি ৪: Samsung গাইড','সেটিংস অ্যাপে করতে হয়, অ্যাপ নিজে করতে পারে না। ফোন Samsung না হলে এই ধাপ বাদ।'],
['done','শেষ','সব অনুমতি ঠিক থাকলে। ‘শুরু করুন’ চাপলে হোম।']
];
const others=[['home','হোম','সেটআপের পর রোজকার স্ক্রিন।'],['code','কোড দিয়ে','QR না চাইলে। কোড দিলে সার্ভার দোকানের নাম এনে একই নিশ্চিতকরণ শিট দেখায়।'],['off','বিচ্ছিন্ন','ওয়েব থেকে ফোন সরালে। শুধু একটাই বাটন: আবার যুক্ত করুন।'],['set','সেটিংস','নির্ভরযোগ্যতা, অ্যাপ, ও বিচ্ছিন্ন করার অপশন।']];
let mode='flow',idx=0,oth=0;
const el=id=>document.getElementById(id);
function btn(p,t,fn,on){const b=document.createElement('button');b.textContent=t;if(on)b.className='on';b.onclick=fn;p.appendChild(b)}
function draw(){
  const list=mode==='flow'?flow:others,i=mode==='flow'?idx:oth,it=list[i];
  el('stage').innerHTML='<div class="ph">'+S[it[0]]+'</div>';
  el('cap').textContent=mode==='flow'?`ধাপ ${bn(i+1)} / ${bn(flow.length)}: ${it[1]}`:it[1];
  el('note').textContent=it[2];
  el('modes').innerHTML='';btn(el('modes'),'প্রথমবার সেটআপ',()=>{mode='flow';draw()},mode==='flow');btn(el('modes'),'অন্যান্য স্ক্রিন',()=>{mode='other';draw()},mode!=='flow');
  el('nv').innerHTML='';el('chips').innerHTML='';
  if(mode==='flow'){
    btn(el('nv'),'‹ আগের',()=>{if(idx>0){idx--;draw()}});
    btn(el('nv'),idx===flow.length-1?'হোমে যান ›':'পরের ›',()=>{if(idx<flow.length-1){idx++}else{mode='other';oth=0}draw()},true);
  }else others.forEach((o,k)=>btn(el('chips'),o[1],()=>{oth=k;draw()},k===oth));
}
/* ---- v2: workspace, products, AI inbox ---- */
const nv3=a=>`<div class="nav t3"><div class="ni ${a==0?'on':''}">${I('msg')}ইনবক্স</div><div class="ni ${a==1?'on':''}">${I('act')}SMS</div><div class="ni ${a==2?'on':''}">${I('set')}সেটিংস</div></div>`;
const hdrW=c=>`<div class="top"><div class="logo">e.</div><div><div class="shop">রহিম ফ্যাশন</div><div class="sub">ওয়ার্কস্পেস</div></div>${c}</div>`;
const chipLive=`<div class="chip"><i class="dot"></i>লাইভ</div>`;
const chipOff=`<div class="chip" style="color:var(--wr)"><i class="dot" style="background:var(--wr);animation:none"></i>অফলাইন</div>`;
const badge=t=>{const m={wa:['#25D366','wa'],ig:['#C13584','ig'],ms:['#0A7CFF','ms']}[t];return `<span class="bd" style="background:${m[0]}">${I(m[1])}</span>`};
const cv=(ini,name,msg,time,ch,un)=>`<div class="cv"><div class="av">${ini}${badge(ch)}</div><div class="cm"><b>${name}</b><span>${msg}</span></div><div class="cr"><span>${time}</span>${un?`<span class="un">${un}</span>`:''}</div></div>`;
const bub=(side,who,t)=>{const l=side=='l';return `<div style="align-self:${l?'flex-start':'flex-end'};display:flex;flex-direction:column;align-items:${l?'flex-start':'flex-end'};max-width:78%">${who?`<div class="who">${who}</div>`:''}<div class="bub ${l?'bl':side=='a'?'br':'bs'}">${t}</div></div>`};
const prodRow=(ic,n)=>`<div class="pr">${I(ic)}${n}<span class="tag t-ok" style="margin-left:auto">চালু</span></div>`;
const smsNeed=`<div class="pr" style="background:var(--s1);border-radius:12px;margin-bottom:10px;align-items:flex-start;border:0">${I('msg')}<span style="line-height:1.6;font-size:12.5px">SMS ফরওয়ার্ডিং: পেমেন্টের SMS পাঠাতে এই ফোনের SMS অনুমতি লাগবে। Ekmivo এই ফোনে আসা SMS দেখে শুধু পেমেন্টের SMS পাঠাবে। বাকি SMS পাঠানো বা সংরক্ষণ করা হবে না।</span></div>`;
const conf=(prods,extra,para)=>`${hdrG}<div class="scan dim">${frame}</div><div class="sheet"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div class="logo" style="background:#D12053;color:#fff;font-size:13px">র</div><div><div class="shop">রহিম ফ্যাশন</div><div class="sub">ওয়ার্কস্পেস</div></div></div><div class="card" style="margin:0 0 10px">${prods}</div>${extra}${para?`<p style="margin-bottom:14px">${para}</p>`:''}<div class="btn">সংযুক্ত করুন</div><div class="lnk" style="padding:10px 0 0">আবার স্ক্যান করুন</div></div>`;
const sr=(s,t,c,l)=>`<div class="row"><div class="pv" style="background:var(--s2);color:var(--mu)">${I('msg')}</div><div class="rm"><b>${s}</b><span>${t}</span></div><span class="tag ${c}">${l}</span></div>`;

S.welcome=`<div class="top"><div class="logo">e.</div><div class="shop">Ekmivo</div></div>
<div class="ctr"><div class="ic">${I('phn')}</div><h3>আপনার ওয়ার্কস্পেসের সঙ্গে এই ফোন সংযুক্ত করুন</h3><p>ড্যাশবোর্ডের QR কোড স্ক্যান করলেই ফোন যুক্ত হয়ে যাবে।</p>
<div class="card" style="margin:20px 0 0;width:100%"><div class="stp"><span class="n">১</span>ওয়েবের মেনুতে Devices খুলুন</div><div class="stp"><span class="n">২</span>এই ফোনে QR স্ক্যান করুন</div><div class="stp"><span class="n">৩</span>দরকারি অনুমতিগুলো দিন</div></div></div>
<div class="bot"><div class="btn">QR স্ক্যান করুন</div><div class="lnk">কোড দিয়ে যুক্ত করুন</div></div>`;
S.cam=S.cam.replace('কোনো ছবি তোলা বা রাখা হবে না।','কোনো ছবি সংরক্ষণ করা হয় না।');
S.load=`${hdrG}<div class="ctr"><div class="ic"><div class="spin"></div></div><h3>আপনার ওয়ার্কস্পেস লোড হচ্ছে…</h3><p>একটু অপেক্ষা করুন।</p></div>`;
S.confB=conf(prodRow('bot','AI Bot')+prodRow('wal','Payment'),smsNeed,'');
S.confP=conf(prodRow('wal','Payment'),smsNeed,'');
S.confA=conf(prodRow('bot','AI Bot'),'','কাস্টমার রিপ্লাই দিলে এই ফোনে নোটিফিকেশন আসবে।');
S.fail=`${hdrG}<div class="ctr"><div class="ic" style="color:var(--er)">${I('alt')}</div><h3>ওয়ার্কস্পেস লোড করা যায়নি</h3><p>কারণ: ইন্টারনেট সংযোগ নেই। সংযোগ ঠিক হলে আবার চেষ্টা করুন।</p></div><div class="bot"><div class="btn">আবার চেষ্টা</div><div class="lnk">আবার স্ক্যান করুন</div></div>`;
S.p1=S.p1.replace('bKash ও Nagad-এর পেমেন্ট SMS ধরার জন্য এই অনুমতি দরকার। অন্য কোনো SMS পাঠানো হবে না।','এই ফোনে আসা পেমেন্টের SMS চিনে Ekmivo-তে পাঠাতে এই অনুমতি দরকার। বাকি SMS পাঠানো হবে না।');
S.nA=`<div class="dots"><b class="on"></b></div><div class="ctr"><div class="ic">${I('bel')}</div><h3>নোটিফিকেশন চালু করুন</h3><p>কাস্টমার রিপ্লাই দিলে সাথে সাথে জানাতে নোটিফিকেশন দরকার।</p></div><div class="bot"><div class="btn">অনুমতি দিন</div><div class="lnk">কেন দরকার?</div></div>`;
S.done=`<div class="top"><div class="logo">e.</div><div class="shop">রহিম ফ্যাশন</div></div><div class="ctr"><div class="ic" style="color:var(--ok)">${I('chk')}</div><h3>সব ঠিক আছে</h3><p>ফোনটি ওয়ার্কস্পেসের সাথে যুক্ত। কাস্টমার মেসেজের নোটিফিকেশন আসবে, আর পেমেন্টের SMS নিজে থেকে পাঠানো হবে।</p></div><div class="bot"><div class="btn">শুরু করুন</div></div>`;
S.doneA=`<div class="top"><div class="logo">e.</div><div class="shop">রহিম ফ্যাশন</div></div><div class="ctr"><div class="ic" style="color:var(--ok)">${I('chk')}</div><h3>সব ঠিক আছে</h3><p>রহিম ফ্যাশনের কাস্টমার মেসেজ এখন থেকে এই ফোনে নোটিফিকেশন হয়ে আসবে।</p></div><div class="bot"><div class="btn">শুরু করুন</div></div>`;
S.inbox=`<div class="top"><div class="logo">e.</div><div class="shop" style="font-size:17px">ইনবক্স</div><div class="fb">${I('flt')}</div></div>
<div class="fl"><b class="on">সব</b><b>অপঠিত ৩</b><b>WhatsApp</b><b>Instagram</b><b>Messenger</b></div>
${cv('আ','আয়েশা খাতুন','AI: জি, আছে। M আর L সাইজ পাওয়া যাচ্ছে।','২ মি','wa','২')}${cv('র','রফিক হোসেন','দাম কত এই জুতাটার?','১৫ মি','ig','১')}${cv('ফ','ফারিয়া আক্তার','AI: আপনার অর্ডার কাল পৌঁছাবে।','১ ঘণ্টা','ms','')}${cv('ন','নাসির উদ্দিন','ধন্যবাদ ভাই','গতকাল','wa','')}${cv('সু','সুমি','কালারটা কি আরো আছে?','গতকাল','ig','')}${cv('ম','মিজান','অর্ডার বাতিল করতে চাই','২ দিন','ms','')}
${nv3(0)}`;
S.chat=`<div class="top" style="border-bottom:1px solid var(--bd);padding-bottom:10px"><div style="color:var(--mu)">${I('arr')}</div><div class="av" style="width:34px;height:34px;font-size:13px">আ${badge('wa')}</div><div><div class="shop">আয়েশা খাতুন</div><div class="sub">WhatsApp</div></div><div class="chip"><i class="dot"></i>AI চালু</div></div>
<div class="msgs"><div class="sday">আজ</div>${bub('l','','ভাইয়া, এই শার্টটা কি এখন আছে?')}${bub('a','AI','জি, আছে। M আর L সাইজ পাওয়া যাচ্ছে।')}${bub('l','','L লাগবে, ডেলিভারি কত?')}${bub('s','আপনি','ঢাকায় ৬০ টাকা।')}</div>
<div class="comp"><div class="inp">মেসেজ লিখুন…</div><div class="snd">${I('snd')}</div></div>`;
S.home=`${hdrW(chipLive)}<div class="hero"><div class="ring"><i class="r"></i><i class="r r2"></i><div class="core"><div class="amt">১৮</div><div class="lab">আজ পাঠানো SMS</div></div></div><div class="note">শেষ SMS ২ মিনিট আগে পাঠানো হয়েছে</div></div>
<div class="stats"><div class="st"><b>১২৬</b><span>এই সপ্তাহ</span></div><div class="st"><b>১</b><span>অপেক্ষায়</span></div><div class="st"><b style="color:var(--er)">১</b><span>ব্যর্থ</span></div></div>
<div class="sec">সাম্প্রতিক SMS</div>${sr('••••৪৮২১','২ মি আগে','t-ok','পাঠানো হয়েছে')}${sr('••••৯৩০৭','১১ মি আগে','t-wr','পাঠানো হচ্ছে')}${sr('••••১২৫৫','২৪ মি আগে','t-er','আবার চেষ্টা')}
${nv3(1)}`;
S.offline=`${hdrW(chipOff)}<div class="ban">${I('alt')}<div><b>ইন্টারনেট নেই</b><span>SMS ফোনে জমা আছে। নেট এলে নিজে থেকে পাঠানো হবে।</span></div></div>
<div class="hero"><div class="ring off"><i class="r"></i><div class="core"><div class="amt">৩</div><div class="lab">পাঠানোর অপেক্ষায়</div></div></div><div class="note">শেষবার পাঠানো হয়েছে ১২ মিনিট আগে</div></div>
<div class="stats"><div class="st"><b>১২৬</b><span>এই সপ্তাহ</span></div><div class="st"><b style="color:var(--wr)">৩</b><span>অপেক্ষায়</span></div><div class="st"><b>০</b><span>ব্যর্থ</span></div></div>
<div class="sec">সাম্প্রতিক SMS</div>${sr('••••৪৮২১','২ মি আগে','t-wr','অপেক্ষায়')}${sr('••••৯৩০৭','৫ মি আগে','t-wr','অপেক্ষায়')}
${nv3(1)}`;
S.off=S.off.replace('ওয়েব থেকে ডিভাইসটি সরানো হয়েছে। আবার যুক্ত করলেই SMS পাঠানো শুরু হবে।','ওয়েব থেকে ডিভাইসটি সরানো হয়েছে। আবার যুক্ত করলেই আগের মতো চলবে।');
S.set=`<div class="top"><div class="logo">e.</div><div class="shop" style="font-size:17px">সেটিংস</div></div>
<div class="scrl"><div class="card" style="margin-top:6px"><div class="li">${I('sto')}ওয়ার্কস্পেস<span class="v">রহিম ফ্যাশন</span></div><div class="li">${I('wal')}চালু সার্ভিস<span class="v" style="display:flex;gap:6px"><span class="tag t-ok">AI Bot</span><span class="tag t-ok">Payment</span></span></div><div class="li">${I('phn')}এই ডিভাইস<span class="v">Galaxy A54</span></div></div>
<div class="sec" style="padding-top:6px">নির্ভরযোগ্যতা</div>
<div class="card"><div class="li">${I('msg')}SMS অনুমতি<span class="v" style="color:var(--ok)">চালু</span></div><div class="li">${I('bel')}নোটিফিকেশন<span class="v" style="color:var(--ok)">চালু</span></div><div class="li">${I('bat')}ব্যাটারি ছাড়<span class="v" style="color:var(--wr)">ঠিক করুন ›</span></div></div>
<div class="sec" style="padding-top:2px">অ্যাপ</div>
<div class="card"><div class="li">ভাষা<div class="seg"><b class="on">বাংলা</b><b>English</b></div></div><div class="li">থিম<div class="seg"><b class="on">সিস্টেম</b><b>লাইট</b><b>ডার্ক</b></div></div><div class="li">${I('doc')}ডায়াগনস্টিক ও লগ<span class="v">›</span></div></div>
<div class="card"><div class="li" style="color:var(--er);justify-content:center">ফোন বিচ্ছিন্ন করুন</div></div></div>
${nv3(2)}`;

const nw='অ্যাপ প্রথমবার খুললে এই স্ক্রিন আসে। এখানে SMS বা Payment নিয়ে কিছু লেখা নেই, কারণ কোন সার্ভিস চালু তা এখনো জানা নেই।';
const flowAI=[['welcome','ওয়েলকাম',nw],['scan','QR স্ক্যান','ওয়ার্কস্পেস এখনো জানা নেই। QR পড়া হলে সরাসরি লোডিং-এ যায়।'],['load','ওয়ার্কস্পেস লোড','QR-এ শুধু একটা কোড থাকে। ওয়ার্কস্পেসের নাম আর কোন সার্ভিস চালু, সেটা ব্যাকএন্ড থেকে আসে।'],['confA','নিশ্চিত করুন (শুধু AI)','শুধু AI চালু থাকলে SMS নিয়ে কোনো লেখা নেই। নিচে ‘আবার স্ক্যান করুন’।'],['nA','অনুমতি: নোটিফিকেশন','‘সংযুক্ত করুন’ চাপলে শুধু নোটিফিকেশনের অনুমতি চায়। ক্যামেরা আগেই দেওয়া থাকলে বাদ।'],['doneA','শেষ','এরপর শুধু ইনবক্স আর সেটিংস ট্যাব। SMS ট্যাব নেই।']];
flow.length=0;
flow.push(['welcome','ওয়েলকাম',nw],['cam','ক্যামেরা অনুমতি','‘QR স্ক্যান করুন’ চাপলে ক্যামেরার অনুমতি না থাকলে এটি আসে। আগে দেওয়া থাকলে বাদ।'],['scan','QR স্ক্যান','ওয়ার্কস্পেস এখনো জানা নেই। QR পড়া হলে সরাসরি লোডিং-এ যায়।'],['load','ওয়ার্কস্পেস লোড','QR-এ শুধু একটা কোড থাকে। ওয়ার্কস্পেসের নাম আর কোন সার্ভিস চালু, সেটা ব্যাকএন্ড থেকে আসে।'],['confB','নিশ্চিত করুন (দুটোই)','Payment থাকায় SMS ফরওয়ার্ডিং-এর প্রয়োজন স্পষ্ট করে লেখা। শুধু Payment হলে AI Bot-এর সারিটা থাকে না।'],['p1','অনুমতি ১: SMS','Payment চালু থাকলে বর্তমান অনুমতির ধাপগুলো। একটা স্ক্রিনে একটা অনুমতি।'],['p2','অনুমতি ২: নোটিফিকেশন','আগের অনুমতি পেলে নিজে থেকেই এই স্ক্রিনে আসে।'],['p3','অনুমতি ৩: ব্যাটারি','সিস্টেম ডায়ালগে ‘অনুমতি’ দিলে পরের ধাপ।'],['p4','অনুমতি ৪: Samsung গাইড','শুধু Samsung ফোনে।'],['done','শেষ','দুই সার্ভিস চালু থাকলে ইনবক্স, SMS ও সেটিংস তিনটা ট্যাব।']);
others.length=0;
others.push(['home','SMS (হিস্টরি)','Payment চালু থাকলে। টাকার অঙ্ক নেই, শুধু কতটি SMS পাঠানো হয়েছে।'],['offline','অফলাইন','ইন্টারনেট না থাকলে স্পষ্ট ব্যানার, অ্যাম্বার স্ট্যাটাস, আর জমা থাকা SMS-এর সংখ্যা।'],['fail','লোড ব্যর্থ','কারণ আলাদা করে লেখা (নেট নেই, কোডের মেয়াদ শেষ, সার্ভার সাড়া দিচ্ছে না) আর দুটো পথ: আবার চেষ্টা, আবার স্ক্যান।'],['confP','নিশ্চিত করুন (শুধু Payment)','শুধু Payment চালু থাকলে।'],['off','বিচ্ছিন্ন','ওয়েব থেকে ফোন সরালে। একটাই বাটন: আবার যুক্ত করুন।'],['set','সেটিংস','ওয়ার্কস্পেস, চালু সার্ভিস, ডিভাইস। সব ওয়ার্কস্পেসে থাকে।']);
const G={pay:['সেটআপ: Payment / দুটোই',flow],ai:['সেটআপ: শুধু AI',flowAI],oth:['অন্যান্য স্ক্রিন',others]};
let gk='pay';const gi={pay:0,ai:0,oth:0};
draw=function(){
  const list=G[gk][1],i=gi[gk],it=list[i],isFlow=gk!=='oth';
  el('stage').innerHTML='<div class="ph">'+S[it[0]]+'</div>';
  el('cap').textContent=isFlow?`ধাপ ${bn(i+1)} / ${bn(list.length)}: ${it[1]}`:it[1];
  el('note').textContent=it[2];
  const m=el('modes');m.innerHTML='';Object.keys(G).forEach(k=>btn(m,G[k][0],()=>{gk=k;draw()},k===gk));
  el('nv').innerHTML='';el('chips').innerHTML='';
  if(isFlow){btn(el('nv'),'‹ আগের',()=>{if(gi[gk]>0){gi[gk]--;draw()}});btn(el('nv'),i===list.length-1?'অন্যান্য স্ক্রিন ›':'পরের ›',()=>{if(i<list.length-1)gi[gk]++;else gk='oth';draw()},true)}
  else list.forEach((o,k)=>btn(el('chips'),o[1],()=>{gi.oth=k;draw()},k===i));
};
draw();
</script>
<script type="text/plain" id="inboxSrc"><!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ekmivo ইনবক্স</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0}
body{background:#121211;color:#F1F0EA;font-family:"Hind Siliguri",system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:16px 8px 24px}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
.ph{--bg:#0F0F0E;--s1:#181817;--s2:#222220;--bd:#2C2C29;--tx:#F1F0EA;--mu:#8D8B84;--ok:#3DDC97;--wr:#F5B544;--er:#F2685B;--okbg:#12301F;--wrbg:#33260D;--erbg:#3A1B18;--cr:#F1F0EA;--ink:#111;--seen:#1E90E0;
--out:cubic-bezier(.2,.8,.2,1);--spring:cubic-bezier(.34,1.56,.64,1);
width:360px;max-width:100%;height:720px;max-height:calc(100vh - 90px);min-height:560px;position:relative;background:var(--bg);color:var(--tx);border-radius:34px;border:6px solid #2C2C29;overflow:hidden;font-size:14px}
.ph.light{--bg:#F4F3EE;--s1:#fff;--s2:#ECEAE2;--bd:#D9D8D1;--tx:#1B1B19;--mu:#6B6A64;--ok:#14935C;--wr:#B7791F;--er:#D6453A;--okbg:#DDF3E8;--wrbg:#FBEFD3;--erbg:#F9DEDA;--cr:#1B1B19;--ink:#fff}
@media(max-width:480px){body{padding:0}.ph{width:100vw;height:100vh;max-height:none;border:0;border-radius:0}}
svg.i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
svg.i.fill{fill:currentColor}
.scr{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--bg);transition:transform .32s var(--out);will-change:transform}
#sChat{transform:translateX(100%)}
.ph.chat #sChat{transform:none}.ph.chat #sInbox{transform:translateX(-24%)}
#dim{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .32s var(--out);z-index:3}
.ph.chat #dim{opacity:.35}
.top{display:flex;align-items:center;gap:10px;padding:16px 16px 8px;flex:none}
.logo{width:34px;height:34px;border-radius:10px;background:var(--cr);color:var(--ink);display:flex;align-items:center;justify-content:center;font-weight:500;font-size:16px;flex:none}
.ttl{font-size:17px;font-weight:500}
.chip{display:flex;align-items:center;gap:6px;font-size:11px;padding:4px 10px;border-radius:99px;border:1px solid var(--bd);background:var(--s1);white-space:nowrap;transition:color .25s}
.dot{width:7px;height:7px;border-radius:50%;background:var(--ok);animation:bl 1.6s infinite}
@keyframes bl{50%{opacity:.35}}
.chip.off{color:var(--wr)}.chip.off .dot{background:var(--wr);animation:none}.chip.sync .dot{background:var(--mu);animation:none}
.fb{position:relative;width:34px;height:34px;border-radius:10px;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;color:var(--mu);flex:none}
.fb u{position:absolute;top:-3px;right:-3px;min-width:15px;height:15px;border-radius:99px;background:var(--cr);color:var(--ink);font-size:10px;text-decoration:none;display:flex;align-items:center;justify-content:center;padding:0 3px;animation:pp .3s var(--spring)}
@keyframes pp{from{transform:scale(0)}}
.fl{display:flex;gap:6px;padding:4px 16px 8px;overflow-x:auto;scrollbar-width:none;flex:none}
.fl button{font-size:12px;padding:5px 12px;border-radius:99px;border:1px solid var(--bd);color:var(--mu);white-space:nowrap;transition:background .2s,color .2s,border-color .2s,transform .12s}
.fl button:active{transform:scale(.95)}
.fl button.on{background:var(--cr);color:var(--ink);border-color:var(--cr)}
.ban{margin:0 16px;padding:0 12px;border-radius:12px;background:var(--wrbg);display:flex;gap:10px;align-items:flex-start;flex:none;max-height:0;opacity:0;overflow:hidden;transition:max-height .3s var(--out),opacity .25s,margin .3s,padding .3s}
.ban.show{max-height:90px;opacity:1;margin-top:4px;padding:10px 12px}
.ban svg{color:var(--wr);margin-top:2px}.ban b{display:block;font-size:13px;font-weight:500;color:var(--wr)}.ban span{font-size:12px;color:var(--mu);line-height:1.5}
#list{flex:1;overflow-y:auto;scrollbar-width:none;position:relative;overscroll-behavior:contain}
#ptr{height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;transition:height .22s var(--out)}
.spin{width:20px;height:20px;border-radius:50%;border:2px solid var(--bd);border-top-color:var(--tx);animation:sp 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.cv{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--bd);cursor:pointer;transition:background .12s}
.cv:active{background:var(--s1)}
.cv.in{animation:rowin .45s var(--out)}
@keyframes rowin{from{opacity:0;transform:translateY(-12px);background:var(--s2)}}
.av{position:relative;width:40px;height:40px;border-radius:50%;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:500;flex:none}
.bd{position:absolute;right:-3px;bottom:-3px;width:18px;height:18px;border-radius:50%;border:2px solid var(--bg);display:flex;align-items:center;justify-content:center;color:#fff}
.bd svg.i{width:10px;height:10px;stroke-width:2.2}
.cm{flex:1;min-width:0}.cm b{display:block;font-size:14px;font-weight:500;line-height:1.25}
.cm span{display:block;font-size:12px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm span.ty{color:var(--ok)}
.cr{display:flex;flex-direction:column;align-items:flex-end;gap:5px;font-size:11px;color:var(--mu)}
.un{min-width:18px;height:18px;padding:0 6px;border-radius:99px;background:var(--cr);color:var(--ink);font-size:11px;font-weight:500;display:flex;align-items:center;justify-content:center}
.empty{padding:60px 30px;text-align:center;color:var(--mu);font-size:13px;line-height:1.7}
.empty button{margin-top:12px;padding:7px 16px;border-radius:99px;border:1px solid var(--bd);color:var(--tx);font-size:13px}
.nav{margin-top:auto;display:flex;border-top:1px solid var(--bd);padding:8px 12px 14px;justify-content:space-around;flex:none}
.ni{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;color:var(--mu);padding:4px 12px;border-radius:12px}
.ni.on{color:var(--tx);background:var(--s2)}
/* chat header */
.chh{position:relative;display:flex;align-items:center;gap:8px;padding:12px 10px 10px 6px;border-bottom:1px solid var(--bd);flex:none;background:var(--bg);z-index:5}
.ib{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:var(--mu);flex:none;transition:background .15s}
.ib:active{background:var(--s2)}
.chh .nm{flex:1;min-width:0;line-height:1.2}
.chh .nm b{display:block;font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chh .nm span{display:block;font-size:11px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .2s}
.chh .nm span.g{color:var(--ok)}
.aic{font-size:11px;padding:4px 10px;border-radius:99px;border:1px solid var(--bd);background:var(--s1);display:flex;gap:6px;align-items:center;white-space:nowrap;transition:transform .12s}
.aic:active{transform:scale(.94)}
.aic i{width:6px;height:6px;border-radius:50%;background:var(--ok);transition:background .2s}.aic.offai i{background:var(--mu)}
#selbar{position:absolute;inset:0;background:var(--s2);display:flex;align-items:center;gap:2px;padding:0 8px 0 6px;z-index:6;opacity:0;pointer-events:none;transform:translateY(-6px);transition:opacity .18s,transform .2s var(--out)}
#selbar.show{opacity:1;pointer-events:auto;transform:none}#selbar .sp{flex:1}
.mwrap{flex:1;min-height:0;position:relative}
#msgs{position:absolute;inset:0;overflow-y:auto;scrollbar-width:none;display:flex;flex-direction:column;padding:10px 0 8px;overscroll-behavior:contain}
.sday{align-self:center;font-size:11px;color:var(--mu);background:var(--s1);padding:3px 10px;border-radius:99px;margin:10px 0 6px}
.udiv{align-self:center;font-size:11px;color:var(--tx);background:var(--s2);padding:3px 12px;border-radius:99px;margin:10px 0 6px}
.mr{position:relative;display:flex;padding:1px 14px;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.mr.first{margin-top:7px}
.mr.l{justify-content:flex-start}.mr.r{justify-content:flex-end}
.mr.sel{background:color-mix(in srgb,var(--cr) 14%,transparent)}
.mr.flash{animation:fl 1.2s}@keyframes fl{0%,60%{background:color-mix(in srgb,var(--cr) 18%,transparent)}}
.rep{position:absolute;left:18px;top:50%;margin-top:-14px;width:28px;height:28px;border-radius:50%;background:var(--s2);color:var(--mu);display:flex;align-items:center;justify-content:center;opacity:0;transition:background .15s,color .15s}
.rep svg{width:16px;height:16px}
.bc{display:flex;flex-direction:column;max-width:78%;position:relative;will-change:transform}
.bc.back{transition:transform .38s var(--spring)}
.mr.l .bc{align-items:flex-start}.mr.r .bc{align-items:flex-end}
.who{display:none;font-size:10.5px;color:var(--mu);margin:2px 4px 3px}
.mr.first .who{display:block}
.bub{padding:9px 12px;border-radius:16px;font-size:13px;line-height:1.5;word-break:break-word;white-space:pre-wrap;position:relative;transition:transform .12s}
.mr.pressing .bub{transform:scale(.985)}
.mr.l .bub{background:var(--s1)}
.bub.ba{background:var(--s2)}
.bub.bs{background:var(--cr);color:var(--ink)}
.mr.l.last .bub{border-bottom-left-radius:5px}
.mr.r.last .bub{border-bottom-right-radius:5px}
.bub.bs .mt{opacity:.65}
.mt{float:right;margin:7px 0 -3px 10px;font-size:10px;color:var(--mu);display:inline-flex;gap:3px;align-items:center;line-height:1;white-space:nowrap}
.mrow{text-align:right;margin-top:3px;height:12px}.mrow .mt{float:none;margin:0}
.tk{display:inline-flex;align-items:center}.tk svg{width:13px;height:13px;stroke-width:2.2}
.dbl{display:inline-flex;color:inherit;transition:color .3s}.dbl svg+svg{margin-left:-8px}.dbl.seen{color:var(--seen)}
.bub.bs .dbl.seen{color:var(--seen);opacity:1}
.tk.pop{animation:tp .4s var(--spring)}.tk.pop .t2{animation:t2 .24s var(--out)}
@keyframes tp{from{transform:scale(.4);opacity:.2}}@keyframes t2{from{transform:translateX(-7px);opacity:0}}
.fail{width:13px;height:13px;border-radius:50%;background:var(--er);color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.mr.new.out .bc{animation:bout .3s var(--spring);transform-origin:bottom right}
.mr.new.in .bc{animation:bin .24s var(--out);transform-origin:bottom left}
@keyframes bout{from{opacity:0;transform:translateY(18px) scale(.9)}}
@keyframes bin{from{opacity:0;transform:translateY(8px) scale(.96)}}
.qt{background:rgba(127,127,127,.16);border-left:3px solid var(--ok);border-radius:8px;padding:5px 8px;margin:-2px -4px 6px;font-size:12px;cursor:pointer;user-select:none}
.qt b{display:block;font-size:11px;font-weight:500;color:var(--ok)}.qt span{display:block;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.rx{align-self:flex-end;margin:-8px 8px 0 0;background:var(--s2);border:1px solid var(--bd);border-radius:99px;padding:0 6px;font-size:13px;line-height:20px;z-index:1;animation:pp .32s var(--spring)}
.mr.l .rx{align-self:flex-start;margin:-8px 0 0 8px}
.stk{width:120px;height:120px;display:flex;align-items:center;justify-content:center;font-size:76px}
.ovm{position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.5);color:#fff;border-radius:99px;padding:2px 7px;font-size:10px;display:flex;gap:3px;align-items:center}
.ovm .tk{color:#fff}.ovm .dbl.seen{color:#53C7FF}
.imgw{position:relative;border-radius:13px;overflow:hidden;cursor:pointer;min-width:150px}
.imgw img{display:block;width:220px;max-width:100%;max-height:260px;object-fit:cover;animation:fi .35s}
@keyframes fi{from{opacity:0}}
.imgw .ph_{width:220px;max-width:100%;height:150px;background:linear-gradient(135deg,#8a6a4f,#3b2a20);display:flex;align-items:center;justify-content:center;font-size:54px}
.gw{display:grid;gap:2px;width:220px;max-width:100%}.gw .gt{position:relative;overflow:hidden;min-width:0}
.gw .gt img{width:100%;height:100%;max-height:none;object-fit:cover;display:block}
.g2{grid-template-columns:1fr 1fr;grid-auto-rows:150px}.g3{grid-template-columns:1fr 1fr;grid-template-rows:150px 100px}.g3 .gt:first-child{grid-column:1/-1}.g4{grid-template-columns:1fr 1fr;grid-auto-rows:108px}
.gw .more{position:absolute;inset:0;background:rgba(0,0,0,.5);color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center}
#pvw img#pImg{bottom:150px;max-height:calc(100% - 210px)}
.pth{position:absolute;left:0;right:0;bottom:76px;display:flex;gap:8px;padding:0 16px;overflow-x:auto;z-index:2;scrollbar-width:none}.pth::-webkit-scrollbar{display:none}
.pth button{position:relative;width:52px;height:52px;border-radius:10px;overflow:hidden;flex:none;border:2px solid transparent;opacity:.65;color:#fff;font-size:24px;line-height:48px;text-align:center;transition:opacity .15s,border-color .15s}
.pth button.on{border-color:#fff;opacity:1}.pth button.add{border:1px dashed #777;opacity:1}
#pvw .pth img{position:static;display:block;width:100%;height:100%;object-fit:cover;margin:0;max-height:none}
.pth .rm{position:absolute;top:1px;right:1px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.7);font-size:12px;line-height:16px}
.sendb .cnt{position:absolute;right:-4px;top:-4px;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;background:var(--ink);color:var(--cr);border:1.5px solid var(--cr);font-size:11px;font-weight:500;line-height:15px;text-align:center;display:none}.sendb .cnt.on{display:block}
.vnav{position:absolute;top:50%;width:40px;height:40px;margin-top:-20px;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;z-index:3;display:flex;align-items:center;justify-content:center}#vPrev{left:10px}#vNext{right:10px}#vNext svg{transform:rotate(180deg)}
.bub.im{padding:3px}
.pc{padding:0;width:210px;overflow:hidden}
.pimg{height:110px;display:flex;align-items:center;justify-content:center;font-size:54px}
.pi{padding:8px 12px 0}.pi b{display:block;font-size:13px;font-weight:500}.pi span{font-size:11.5px;opacity:.7}.pp{font-weight:500;margin-top:2px}
.pc .mrow{padding:6px 10px 6px;margin:0}
.vn{display:flex;align-items:center;gap:8px;min-width:190px}
.pl{width:32px;height:32px;border-radius:50%;background:rgba(127,127,127,.25);display:flex;align-items:center;justify-content:center;flex:none}
.pl svg{width:14px;height:14px}
.wf{display:flex;align-items:center;gap:2px;height:26px;flex:1}.wf i{width:2.5px;border-radius:2px;background:currentColor;opacity:.3;transition:opacity .15s}.wf i.f{opacity:1}
.vd{font-size:11px;opacity:.7}
.fileb{display:flex;align-items:center;gap:10px;min-width:170px}.fileb .fi{width:34px;height:34px;border-radius:9px;background:rgba(127,127,127,.25);display:flex;align-items:center;justify-content:center}
.fileb b{font-weight:500;font-size:13px;display:block;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fileb span{font-size:11px;opacity:.7}
.unsup{color:var(--mu);font-style:italic}
#typ{display:none;padding:1px 14px;margin-top:7px}#typ.show{display:flex;animation:bin .24s var(--out)}
#typ .bub{border-bottom-right-radius:5px}
.tdots{display:flex;gap:4px;padding:5px 2px}.tdots i{width:7px;height:7px;border-radius:50%;background:var(--mu);animation:td 1.2s infinite}
.tdots i:nth-child(2){animation-delay:.15s}.tdots i:nth-child(3){animation-delay:.3s}
@keyframes td{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}
#fab{position:absolute;right:14px;bottom:10px;width:36px;height:36px;border-radius:50%;background:var(--s2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;color:var(--tx);opacity:0;transform:translateY(10px) scale(.8);pointer-events:none;transition:opacity .2s,transform .25s var(--spring);z-index:4}
#fab.show{opacity:1;transform:none;pointer-events:auto}
#fab svg{transform:rotate(-90deg)}
#fab u{position:absolute;top:-7px;right:-3px;min-width:18px;height:18px;border-radius:99px;background:var(--cr);color:var(--ink);font-size:11px;font-weight:500;text-decoration:none;display:none;align-items:center;justify-content:center;padding:0 5px}
#fab.has u{display:flex}
#rbar{margin:0 12px;padding:0 10px;background:var(--s1);border-radius:12px 12px 0 0;border-left:3px solid var(--ok);display:flex;align-items:center;gap:8px;flex:none;max-height:0;opacity:0;overflow:hidden;transition:max-height .22s var(--out),opacity .18s,padding .22s}
#rbar.show{max-height:56px;opacity:1;padding:8px 10px}
#rbar div{flex:1;min-width:0;font-size:12px}#rbar b{display:block;color:var(--ok);font-weight:500;font-size:11px}#rbar span{display:block;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.comp{position:relative;display:flex;align-items:flex-end;gap:8px;padding:8px 12px 14px;border-top:1px solid var(--bd);flex:none}
.inw{flex:1;min-height:40px;border-radius:20px;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:flex-end;padding:0 4px 0 12px;min-width:0}
.inw textarea{flex:1;min-width:0;background:none;border:0;outline:0;resize:none;color:var(--tx);font:inherit;font-size:13px;line-height:1.5;padding:9px 4px;max-height:96px;height:38px;transition:height .12s}
.inw textarea::placeholder{color:var(--mu)}
.inw .ib{width:32px;height:38px;border-radius:0}
#bCam{transition:width .2s var(--out),opacity .15s;overflow:hidden}#bCam.hide{width:0;opacity:0;pointer-events:none}
.sendb{position:relative;width:40px;height:40px;border-radius:50%;background:var(--cr);color:var(--ink);flex:none;transition:transform .15s var(--spring)}
.sendb:active{transform:scale(.88)}
.sendb svg{position:absolute;left:10px;top:10px;transition:transform .28s var(--spring),opacity .18s}
.sendb .s_mic{opacity:1}.sendb .s_snd{opacity:0;transform:rotate(-90deg) scale(.5)}
.sendb.has .s_mic{opacity:0;transform:rotate(90deg) scale(.5)}.sendb.has .s_snd{opacity:1;transform:none}
.sendb.recm .s_mic{opacity:0}.sendb.recm .s_snd{opacity:1;transform:none}
.comp.dis .inw,.comp.dis .sendb{opacity:.45;pointer-events:none}
.wcl{display:none;flex:1;align-items:flex-start;gap:10px;background:var(--s1);border:1px solid var(--bd);border-radius:14px;padding:10px 12px}
.wcl svg{color:var(--mu);margin-top:2px}.wcl b{display:block;font-size:13px;font-weight:500}.wcl span{font-size:12px;color:var(--mu);line-height:1.5}
.comp.closed .inw,.comp.closed .sendb{display:none}.comp.closed .wcl{display:flex}
.rec{order:-1;display:none;flex:1;min-width:0;height:40px;border-radius:20px;background:var(--s1);border:1px solid var(--bd);align-items:center;gap:8px;padding:0 14px 0 3px;font-size:13px}
.comp.recing .inw{display:none}.comp.recing .rec{display:flex;animation:bin .22s var(--out)}
.rec .ib{width:34px;height:34px;color:var(--er)}.rec>i{width:9px;height:9px;border-radius:50%;background:var(--er);animation:bl 1s infinite;flex:none}#recT{min-width:32px;flex:none}.rec .sp{flex:1;min-width:0;display:flex;gap:2px;align-items:center;justify-content:flex-end;height:26px;overflow:hidden}.rec .sp b{width:2.5px;flex:none;border-radius:2px;background:var(--tx);opacity:.55;transition:height .09s}
@keyframes wv{from{height:4px}to{height:18px}}
.ov{position:absolute;inset:0;z-index:30;visibility:hidden;transition:visibility 0s .3s}
.ov.show{visibility:visible;transition:none}
.bk{position:absolute;inset:0;background:rgba(0,0,0,.5);opacity:0;transition:opacity .25s}.ov.show .bk{opacity:1}
.sheet{position:absolute;left:0;right:0;bottom:0;background:var(--s2);border-radius:24px 24px 0 0;padding:16px 18px 22px;border-top:1px solid var(--bd);transform:translateY(100%);transition:transform .32s var(--out);max-height:85%;overflow-y:auto;scrollbar-width:none}
.ov.show .sheet{transform:none}
.sheet h4{margin:0 0 12px;font-size:15px;font-weight:500;display:flex;align-items:center}
.sheet h4 button{margin-left:auto;font-size:12px;color:var(--mu)}
.sl{font-size:11px;color:var(--mu);margin:12px 0 6px}
.pills{display:flex;flex-wrap:wrap;gap:6px}.pills button{font-size:12px;padding:5px 12px;border-radius:99px;border:1px solid var(--bd);color:var(--mu);transition:background .2s,color .2s,border-color .2s,transform .12s}.pills button:active{transform:scale(.95)}.pills button.on{background:var(--cr);color:var(--ink);border-color:var(--cr)}
.btn{display:flex;align-items:center;justify-content:center;height:46px;border-radius:14px;font-size:15px;font-weight:500;width:100%;background:var(--cr);color:var(--ink);margin-top:16px;transition:opacity .12s}.btn:active{opacity:.88}
.grid4{display:flex;justify-content:space-around;text-align:center;font-size:12px;color:var(--mu)}
.grid4 div{display:flex;flex-direction:column;align-items:center;gap:6px}.grid4 button{width:52px;height:52px;border-radius:50%;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;color:var(--tx);transition:transform .15s var(--spring)}.grid4 button:active{transform:scale(.9)}
.ir{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--bd);font-size:13px}.ir:first-of-type{border-top:0}.ir span.v{margin-left:auto;color:var(--mu);font-size:12px}
.lr{display:flex;align-items:center;gap:12px;padding:8px 0;cursor:pointer;border-top:1px solid var(--bd)}
#rxbar{position:absolute;z-index:20;display:flex;background:var(--s2);border:1px solid var(--bd);border-radius:99px;padding:4px 8px;gap:2px;opacity:0;pointer-events:none;transform:scale(.7);transition:opacity .15s,transform .22s var(--spring)}
#rxbar.show{opacity:1;pointer-events:auto;transform:none}#rxbar button{font-size:22px;width:34px;height:34px;border-radius:50%}
#rxbar.show button{animation:pp .3s var(--spring) backwards}
#rxbar button:active{transform:scale(1.3)!important}
#toast{position:absolute;left:50%;bottom:96px;transform:translate(-50%,10px);background:var(--cr);color:var(--ink);font-size:12.5px;padding:8px 14px;border-radius:99px;opacity:0;pointer-events:none;transition:.25s;z-index:60;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}
#toast.show{opacity:1;transform:translate(-50%,0)}
#notif{position:absolute;left:10px;right:10px;top:10px;z-index:55;background:var(--s2);border:1px solid var(--bd);border-radius:16px;padding:10px 12px;display:flex;gap:10px;align-items:center;transform:translateY(-130%);transition:transform .38s var(--spring);cursor:pointer}
#notif.show{transform:none}#notif b{font-size:13px;font-weight:500;display:block}#notif span{font-size:12px;color:var(--mu);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#notif div{min-width:0;flex:1}
#viewer,#pvw{background:#000;color:#fff;z-index:40;opacity:0;transition:opacity .22s,visibility 0s .22s}
#viewer.show,#pvw.show{opacity:1}
#viewer .body{position:absolute;inset:0;transform:scale(.92);transition:transform .3s var(--out)}#viewer.show .body{transform:none}
#viewer img,#pvw img{position:absolute;left:0;right:0;top:56px;bottom:90px;margin:auto;max-width:100%;max-height:calc(100% - 150px)}
#viewer .vph{position:absolute;left:0;right:0;top:56px;bottom:90px;margin:auto;width:280px;height:200px;background:linear-gradient(135deg,#8a6a4f,#3b2a20);display:flex;align-items:center;justify-content:center;font-size:80px;border-radius:8px}
.vt{position:absolute;top:0;left:0;right:0;padding:14px 8px;display:flex;align-items:center;gap:8px;color:#fff;z-index:2}
.pvb{position:absolute;left:0;right:0;bottom:0;padding:10px 16px 18px;display:flex;justify-content:flex-end;z-index:2}
.ctl{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:14px;max-width:420px}
.ctl button{font-size:12.5px;padding:6px 12px;border-radius:99px;border:1px solid #34332F;background:#1E1E1C;color:#F1F0EA}
.ctl p{width:100%;text-align:center;margin:0;font-size:11.5px;color:#9A988F}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01s!important;transition-duration:.01s!important}}
body.embed{background:transparent;padding:0;min-height:0}body.embed .ctl{display:none}

/* header tap target */
.chi{display:flex;align-items:center;gap:8px;flex:1;min-width:0;text-align:left;border-radius:12px;padding:2px 6px 2px 2px;transition:background .15s}
.chi:active{background:var(--s2)}
/* customer profile */
#sProf{transform:translateX(100%)}
#sChat{transition:transform .32s var(--out),filter .32s}
.ph.prof #sProf{transform:none}.ph.prof #sChat{transform:translateX(-24%);filter:brightness(.7)}
.pfh{display:flex;align-items:center;gap:6px;padding:12px 10px 10px 6px;border-bottom:1px solid var(--bd);flex:none}.pfh b{font-size:15px;font-weight:500}
#pfBody{flex:1;overflow-y:auto;scrollbar-width:none;padding-bottom:24px;overscroll-behavior:contain}
.hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:18px 20px 6px}
.hero .av{width:76px;height:76px;font-size:26px}.hero .bd{width:24px;height:24px;right:-2px;bottom:-2px}.hero .bd svg.i{width:13px;height:13px}
.hero h2{margin:12px 0 2px;font-size:19px;font-weight:500}.hero .sub{font-size:12.5px;color:var(--mu)}
.tag{display:inline-flex;align-items:center;margin-top:10px;font-size:12px;padding:4px 12px;border-radius:99px}
.tag.ok{background:var(--okbg);color:var(--ok)}.tag.wr{background:var(--wrbg);color:var(--wr)}.tag.er{background:var(--erbg);color:var(--er)}.tag.mu{background:var(--s2);color:var(--tx)}
.qa{display:flex;justify-content:center;gap:10px;padding:14px 16px 4px}
.qa button{flex:1;max-width:104px;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 4px;border-radius:14px;background:var(--s1);border:1px solid var(--bd);font-size:11.5px;color:var(--tx);transition:transform .12s}
.qa button:active{transform:scale(.95)}.qa svg{color:var(--mu)}
.pfc{margin:10px 12px 0;padding:14px;border-radius:18px;background:var(--s1);border:1px solid var(--bd)}
.pfc h5{margin:0 0 10px;font-size:12px;font-weight:500;color:var(--mu)}
.vd2{display:flex;align-items:center;gap:14px}.vd2 b{display:block;font-size:14.5px;font-weight:500;line-height:1.4}.vd2 span{font-size:12px;color:var(--mu)}
.ring{--p:0;--c:var(--ok);width:68px;height:68px;border-radius:50%;background:conic-gradient(var(--c) calc(var(--p)*1%),var(--s2) 0);display:flex;align-items:center;justify-content:center;flex:none}
.ring.wr{--c:var(--wr)}.ring.er{--c:var(--er)}
.ring i{font-style:normal;width:54px;height:54px;border-radius:50%;background:var(--s1);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:500}
.rs{margin:12px 0 0;padding:0;list-style:none;font-size:12.5px;line-height:1.55}
.rs li{display:flex;gap:8px;padding:3px 0}.rs li:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--mu);margin-top:7px;flex:none}
.rs li.ok:before{background:var(--ok)}.rs li.er:before{background:var(--er)}.rs li.wr:before{background:var(--wr)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:8px;margin-bottom:10px}
.tile{background:var(--s2);border-radius:12px;padding:10px 4px;text-align:center}.tile b{display:block;font-size:18px;font-weight:500}.tile span{font-size:11px;color:var(--mu)}
.tile.ok b{color:var(--ok)}.tile.er b{color:var(--er)}.tile.wr b{color:var(--wr)}
.kv{display:flex;align-items:flex-start;gap:12px;padding:9px 0;border-top:1px solid var(--bd);font-size:13px}.kv:first-of-type{border-top:0;padding-top:0}.kv:last-child{padding-bottom:0}
.kv .k{color:var(--mu);flex:none}.kv .v{margin-left:auto;text-align:right;min-width:0;word-break:break-word}
.emp2{display:flex;gap:12px;align-items:flex-start}.emp2 .ic{width:40px;height:40px;border-radius:12px;background:var(--s2);display:flex;align-items:center;justify-content:center;flex:none;color:var(--mu)}
.emp2 b{display:block;font-size:14px;font-weight:500;margin-bottom:2px}.emp2 span{font-size:12.5px;color:var(--mu);line-height:1.6}
.stg{margin-top:14px}.stg:first-of-type{margin-top:0}
.sth{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;margin-bottom:2px}.sth svg{color:var(--mu);width:16px;height:16px}.sth span{margin-left:auto;font-size:11.5px;color:var(--mu);font-weight:400}
.ord{display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--bd)}.stg .sth+.ord{margin-top:6px}
.ord .l{flex:1;min-width:0}.ord .l b{display:block;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ord .l span{display:block;font-size:11.5px;color:var(--mu)}.ord .l span.why{color:var(--er);margin-top:1px}
.ord .r{text-align:right;flex:none;font-size:13px}.ord .r em{display:block;width:max-content;margin:3px 0 0 auto;font-style:normal;font-size:11px;padding:2px 8px;border-radius:99px}
.ord .r em.ok{background:var(--okbg);color:var(--ok)}.ord .r em.er{background:var(--erbg);color:var(--er)}.ord .r em.wr{background:var(--wrbg);color:var(--wr)}.ord .r em.mu{background:var(--s2);color:var(--tx)}
.stg:not(.open) .ord.x{display:none}
.mo{display:block;width:100%;padding:8px 0 0;font-size:12px;color:var(--mu);text-align:center;border-top:1px solid var(--bd)}
.chips2{display:flex;flex-wrap:wrap;gap:6px}.chips2 span{font-size:12px;padding:4px 10px;border-radius:99px;background:var(--s2)}
.fmsg{font-size:13px;line-height:1.55;background:var(--s2);border-radius:12px;padding:9px 12px;margin-top:2px;word-break:break-word}
.nt{width:100%;min-height:64px;background:var(--s2);border:1px solid var(--bd);border-radius:12px;padding:10px;color:var(--tx);font:inherit;font-size:13px;line-height:1.5;resize:none;outline:0;display:block}
.nt::placeholder{color:var(--mu)}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<symbol id="act" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></symbol>
<symbol id="set" viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></symbol>
<symbol id="msg" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></symbol>
<symbol id="wa" viewBox="0 0 24 24"><path d="M12 4a8 8 0 00-6.9 12L4 20l4.1-1.1A8 8 0 1012 4z"/><path d="M9.5 9.5c.3 2 2.5 4.2 4.5 4.5"/></symbol>
<symbol id="ig" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="4"/><circle cx="12" cy="12" r="3.2"/><path d="M16.5 7.5h0"/></symbol>
<symbol id="ms" viewBox="0 0 24 24"><path d="M13 3L6 13h5l-1 8 7-10h-5z"/></symbol>
<symbol id="back" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></symbol>
<symbol id="snd" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="flt" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></symbol>
<symbol id="alt" viewBox="0 0 24 24"><path d="M12 4l9 16H3zM12 10v4M12 17h0"/></symbol>
<symbol id="clip" viewBox="0 0 24 24"><path d="M20 11l-8 8a5 5 0 01-7-7l8-8a3.5 3.5 0 015 5l-8 8a2 2 0 01-3-3l7-7"/></symbol>
<symbol id="cam" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></symbol>
<symbol id="mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></symbol>
<symbol id="chk" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></symbol>
<symbol id="x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
<symbol id="rep" viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M4 12h10a6 6 0 016 6v1"/></symbol>
<symbol id="fwd" viewBox="0 0 24 24"><path d="M15 7l5 5-5 5M20 12H10a6 6 0 00-6 6v1"/></symbol>
<symbol id="copy" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/></symbol>
<symbol id="info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/></symbol>
<symbol id="play" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></symbol>
<symbol id="pause" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></symbol>
<symbol id="img" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M3 17l5-4 4 3 3-2 6 4"/></symbol>
<symbol id="doc" viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7zM14 3v5h5"/></symbol>
<symbol id="bag" viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6zM9 8a3 3 0 016 0"/></symbol>
<symbol id="clk" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
<symbol id="trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></symbol>
</svg>

<div class="ph" id="ph">
  <div class="scr" id="sInbox">
    <div class="top"><div class="logo">e.</div><div class="ttl">ইনবক্স</div><div id="netChip" class="chip" style="margin-left:auto"><i class="dot"></i>লাইভ</div><button class="fb" id="fBtn" aria-label="ফিল্টার"><svg class="i"><use href="#flt"/></svg></button></div>
    <div class="fl" id="chips"></div>
    <div class="ban" id="inBan"><svg class="i"><use href="#alt"/></svg><div><b>ইন্টারনেট নেই</b><span>নেট এলে নতুন মেসেজ আসবে। এখন উত্তর পাঠানো যাবে না।</span></div></div>
    <div id="list"><div id="ptr"><div class="spin"></div></div><div id="rows"></div></div>
    <div class="nav"><div class="ni on"><svg class="i"><use href="#msg"/></svg>ইনবক্স</div><div class="ni"><svg class="i"><use href="#act"/></svg>SMS</div><div class="ni"><svg class="i"><use href="#set"/></svg>সেটিংস</div></div>
    <div id="dim"></div>
  </div>

  <div class="scr" id="sChat">
    <div class="chh" id="chh">
      <button class="ib" id="bBack" aria-label="ফিরে যান"><svg class="i"><use href="#back"/></svg></button>
      <button class="chi" id="chInfo" aria-label="কাস্টমারের তথ্য"><div class="av" id="chAv" style="width:34px;height:34px;font-size:13px"></div><div class="nm"><b id="chName"></b><span id="chSub"></span></div></button>
      <button class="aic" id="aiT"><i></i><span>AI চালু</span></button>
      <div id="selbar">
        <button class="ib" data-a="close" aria-label="বন্ধ"><svg class="i"><use href="#x"/></svg></button><span class="sp"></span>
        <button class="ib" data-a="reply" aria-label="রিপ্লাই"><svg class="i"><use href="#rep"/></svg></button>
        <button class="ib" data-a="fwd" aria-label="ফরওয়ার্ড"><svg class="i"><use href="#fwd"/></svg></button>
        <button class="ib" data-a="copy" aria-label="কপি"><svg class="i"><use href="#copy"/></svg></button>
        <button class="ib" data-a="info" aria-label="তথ্য"><svg class="i"><use href="#info"/></svg></button>
      </div>
    </div>
    <div class="ban" id="chBan"><svg class="i"><use href="#alt"/></svg><div><b>ইন্টারনেট নেই</b><span>নেট এলে নতুন মেসেজ আসবে। এখন উত্তর পাঠানো যাবে না।</span></div></div>
    <div class="mwrap">
      <div id="msgs"><div class="mr r" id="typ"><div class="bc"><div class="who" style="display:block">AI</div><div class="bub ba"><div class="tdots"><i></i><i></i><i></i></div></div></div></div></div>
      <button id="fab" aria-label="নিচে যান"><svg class="i"><use href="#back"/></svg><u id="fabN"></u></button>
    </div>
    <div id="rbar"><div><b id="rbN"></b><span id="rbT"></span></div><button class="ib" id="rbX" aria-label="বাতিল"><svg class="i"><use href="#x"/></svg></button></div>
    <div class="comp" id="comp">
      <div class="inw">
        <textarea id="inp" rows="1" placeholder="মেসেজ লিখুন…"></textarea>
        <button class="ib" id="bClip" aria-label="সংযুক্ত করুন"><svg class="i"><use href="#clip"/></svg></button>
        <button class="ib" id="bCam" aria-label="ক্যামেরা"><svg class="i"><use href="#cam"/></svg></button>
      </div>
      <button class="sendb" id="bSend" aria-label="পাঠান"><svg class="i s_mic"><use href="#mic"/></svg><svg class="i s_snd"><use href="#snd"/></svg></button>
      <div class="wcl"><svg class="i"><use href="#clk"/></svg><div><b>২৪ ঘণ্টা পার হয়ে গেছে</b><span>কাস্টমার নতুন মেসেজ দিলে আবার উত্তর দেওয়া যাবে।</span></div></div>
      <div class="rec"><button class="ib" id="recX" aria-label="বাতিল"><svg class="i"><use href="#trash"/></svg></button><i></i><span id="recT">০:০০</span><div class="sp" id="recW"></div></div>
    </div>
  </div>

  <div class="scr" id="sProf">
    <div class="pfh"><button class="ib" id="pfBack" aria-label="ফিরে যান"><svg class="i"><use href="#back"/></svg></button><b>কাস্টমারের তথ্য</b></div>
    <div id="pfBody"></div>
  </div>

  <div id="rxbar"></div>
  <div id="notif"><div class="av" id="nAv" style="width:34px;height:34px;font-size:13px"></div><div><b id="nT"></b><span id="nB"></span></div></div>
  <div class="ov" id="shw"><div class="bk" id="shBk"></div><div class="sheet" id="sh"></div></div>
  <div class="ov" id="viewer"><div class="vt"><button class="ib" id="vX" style="color:#fff"><svg class="i"><use href="#back"/></svg></button><b id="vN" style="font-weight:500"></b></div><div class="body" id="vB"></div><button class="vnav" id="vPrev" aria-label="আগের"><svg class="i"><use href="#back"/></svg></button><button class="vnav" id="vNext" aria-label="পরের"><svg class="i"><use href="#back"/></svg></button></div>
  <div class="ov" id="pvw"><div class="vt"><button class="ib" id="pX" style="color:#fff"><svg class="i"><use href="#x"/></svg></button><b id="pC" style="font-weight:500;font-size:13px;margin-left:auto;padding-right:8px"></b></div><img id="pImg" alt=""><div class="pth" id="pTh"></div><div class="pvb"><button class="sendb has" id="pSend" aria-label="পাঠান"><svg class="i s_snd"><use href="#snd"/></svg><span class="cnt" id="pCnt"></span></button></div></div>
  <div id="toast"></div>
</div>
<input type="file" id="fGal" accept="image/*" multiple hidden>
<input type="file" id="fCam" accept="image/*" capture="environment" hidden>
<input type="file" id="fDoc" hidden>

<div class="ctl">
  <button id="cNet">ইন্টারনেট বন্ধ করুন</button>
  <button id="cSim">কাস্টমারের মেসেজ আসুক</button>
  <button id="cOther">অন্য চ্যাটে নতুন মেসেজ</button>
  <button id="cReact">কাস্টমার রিঅ্যাক্ট করুক</button>
  <button id="cImgS">ছবি পাঠান (ডেমো)</button>
  <button id="cImgC">কাস্টমার ছবি পাঠাক</button>
  <button id="cImgM">একসাথে ৪টি ছবি পাঠান</button>
  <button id="cImgCM">কাস্টমার ৫টি ছবি পাঠাক</button>
  <button id="cTheme">লাইট থিম</button>
  <p>উপরের বাটনগুলো শুধু ডেমোর জন্য। আসল অ্যাপে এগুলো ব্যাকএন্ড ইভেন্ট থেকে আসবে।</p>
</div>

<script>
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const bn=n=>String(n).replace(/\d/g,d=>'০১২৩৪৫৬৭৮৯'[d]);
const I=(n,c='')=>`<svg class="i ${c}"><use href="#${n}"/></svg>`;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CH={wa:{n:'WhatsApp',c:'#25D366'},ig:{n:'Instagram',c:'#C13584'},ms:{n:'Messenger',c:'#0A7CFF'}};
/* what each channel's API really supports */
const CAP={wa:{doc:1,dlv:1},ms:{doc:1,dlv:1},ig:{doc:0,dlv:0}};
const badge=ch=>`<span class="bd" style="background:${CH[ch].c}">${I(ch)}</span>`;
const hm=ts=>{const d=new Date(ts);return bn(String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'))};
const mmss=s=>bn(Math.floor(s/60)+':'+String(s%60).padStart(2,'0'));
const rel=ts=>{const m=Math.floor((Date.now()-ts)/60000);if(m<1)return'এখন';if(m<60)return bn(m)+' মি';const h=Math.floor(m/60);if(h<24)return bn(h)+' ঘণ্টা';const d=Math.floor(h/24);return d==1?'গতকাল':bn(d)+' দিন'};
const dayLbl=ts=>{const a=new Date(ts).setHours(0,0,0,0),b=new Date().setHours(0,0,0,0),d=Math.round((b-a)/864e5);return d==0?'আজ':d==1?'গতকাল':bn(new Date(ts).getDate())+'/'+bn(new Date(ts).getMonth()+1)};
const now=Date.now(),MIN=60000;let uid=1;
const mk=(from,text,ago,x={})=>({id:uid++,from,type:'text',text,ts:now-ago*MIN,...(from==='c'?{}:{st:'seen'}),...x});
const PROD=[{name:'কটন ক্যাজুয়াল শার্ট',price:'১,২৫০',sizes:'M, L, XL',emo:'👕',g:['#4b6cb7','#182848']},{name:'লেদার স্নিকার',price:'২,৮০০',sizes:'৪০, ৪১, ৪২',emo:'👟',g:['#c0392b','#4a1a14']},{name:'ডেনিম জ্যাকেট',price:'৩,৫০০',sizes:'M, L',emo:'🧥',g:['#2c7a7b','#123a3b']}];
const prod=(from,p,ago)=>mk(from,'',ago,{type:'product',p});
const convs=[
{id:1,name:'আয়েশা খাতুন',ini:'আ',ch:'wa',ai:true,unread:2,ri:0,msgs:[
 mk('c','হ্যালো, শার্ট নিয়ে জানতে চাই',1500),mk('a','জি, বলুন। কোন শার্টটা দেখছেন?',1498),
 mk('c','ভাইয়া, এই শার্টটা কি এখন আছে?',12),prod('a',PROD[0],11),mk('a','জি, আছে। M আর L সাইজ পাওয়া যাচ্ছে।',11,{react:'👍'}),
 mk('c','L লাগবে',3),mk('c','ডেলিভারি কত?',2)]},
{id:2,name:'রফিক হোসেন',ini:'র',ch:'ig',ai:true,unread:1,ri:0,msgs:[mk('c','',20,{type:'img'}),mk('c','দাম কত এই জুতাটার?',15)]},
{id:3,name:'ফারিয়া আক্তার',ini:'ফ',ch:'ms',ai:true,unread:0,ri:0,msgs:[mk('c','',75,{type:'voice',dur:8}),mk('a','আপনার অর্ডার কাল পৌঁছাবে।',62)]},
{id:4,name:'নাসির উদ্দিন',ini:'ন',ch:'wa',ai:false,unread:0,ri:0,msgs:[mk('s','আপনার অর্ডার পাঠানো হয়েছে।',1300,{react:'❤️'}),mk('c','ধন্যবাদ ভাই',1290),mk('c','',1289,{type:'file',name:'invoice.pdf',size:'১২৪ KB'})]},
{id:5,name:'সুমি',ini:'সু',ch:'ig',ai:true,unread:0,ri:0,msgs:[mk('c','কালারটা কি আরো আছে?',900),mk('a','জি, কালো আর নীল আছে।',899),mk('c','🙏',700,{type:'sticker'}),mk('c','',650,{type:'unsup'})]},
{id:7,name:'তানভীর আহমেদ',ini:'ত',ch:'wa',ai:true,unread:1,ri:0,msgs:[mk('c','ভাইয়া, আপনাদের পেজে শার্ট আছে?',4)]},
{id:6,name:'মিজান',ini:'ম',ch:'ms',ai:false,unread:0,ri:0,msgs:[mk('c','অর্ডার বাতিল করতে চাই',2880)]}
];
let cur=null,net=true,selId=null,replyTo=null,fabN=0,filt={ch:[],unread:false,status:null,time:'all'};
try{const f=JSON.parse(localStorage.getItem('ek_filt')||'null');if(f)filt=f}catch(e){}
const saveF=()=>{try{localStorage.setItem('ek_filt',JSON.stringify(filt))}catch(e){}};
const last=c=>c.msgs.length?c.msgs[c.msgs.length-1].ts:0;
const pv=m=>({text:m.text,img:'ছবি',imgs:'ছবি ('+bn((m.srcs||[]).length)+'টি)',sticker:'স্টিকার',voice:'ভয়েস মেসেজ',product:'পণ্য: '+(m.p&&m.p.name),file:'ডকুমেন্ট: '+m.name,unsup:'অন্য ধরনের মেসেজ'}[m.type]||'');
const lastC=c=>{for(let i=c.msgs.length-1;i>=0;i--)if(c.msgs[i].from==='c')return c.msgs[i];return null};
const windowOpen=c=>{const m=lastC(c);return !!m&&Date.now()-m.ts<864e5};
let toastT;const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>e.classList.remove('show'),1900)};
const vib=()=>{try{navigator.vibrate&&navigator.vibrate(12)}catch(e){}};

/* ---------- inbox ---------- */
const fcount=()=>(filt.ch.length?1:0)+(filt.unread?1:0)+(filt.status?1:0)+(filt.time!=='all'?1:0);
function filtered(){const t0=new Date().setHours(0,0,0,0);return convs.filter(c=>{
 if(filt.ch.length&&!filt.ch.includes(c.ch))return false;if(filt.unread&&!c.unread)return false;
 if(filt.status==='ai'&&!c.ai)return false;if(filt.status==='me'&&c.ai)return false;
 if(filt.status==='unans'){const l=c.msgs[c.msgs.length-1];if(!(l&&l.from==='c'))return false}
 const l=last(c);if(filt.time==='today'&&l<t0)return false;if(filt.time==='7'&&l<Date.now()-7*864e5)return false;if(filt.time==='30'&&l<Date.now()-30*864e5)return false;return true})}
function renderChips(){const un=convs.reduce((a,c)=>a+(c.unread?1:0),0);const none=!filt.ch.length&&!filt.unread;
 $('#chips').innerHTML=`<button class="${none?'on':''}" data-k="all">সব</button><button class="${filt.unread?'on':''}" data-k="un">অপঠিত ${bn(un)}</button>`+Object.keys(CH).map(k=>`<button class="${filt.ch.includes(k)?'on':''}" data-k="${k}">${CH[k].n}</button>`).join('');
 const b=$('#fBtn'),u=b.querySelector('u');if(u)u.remove();if(fcount())b.insertAdjacentHTML('beforeend',`<u>${bn(fcount())}</u>`)}
function renderList(newId){renderChips();const old={};$$('#rows .cv').forEach(e=>old[e.dataset.id]=e.getBoundingClientRect().top);
 const arr=filtered().sort((a,b)=>last(b)-last(a));
 $('#rows').innerHTML=arr.length?arr.map(c=>{const l=c.msgs[c.msgs.length-1];
  const pre=c.typing==='a'?`<span class="ty">AI লিখছে…</span>`:`<span>${l?(l.from==='a'?'AI: ':'')+esc(pv(l)):''}</span>`;
  return `<div class="cv ${c.id===newId&&old[c.id]==null?'in':''}" data-id="${c.id}"><div class="av">${c.ini}${badge(c.ch)}</div><div class="cm"><b>${esc(c.name)}</b>${pre}</div><div class="cr"><span>${l?rel(l.ts):''}</span>${c.unread?`<span class="un">${bn(c.unread)}</span>`:''}</div></div>`}).join('')
  :`<div class="empty">কোনো কনভারসেশন পাওয়া যায়নি।${fcount()?`<br><button id="clrF">ফিল্টার মুছুন</button>`:''}</div>`;
 $$('#rows .cv').forEach(e=>{const o=old[e.dataset.id];if(o==null)return;const d=o-e.getBoundingClientRect().top;if(Math.abs(d)>1)e.animate([{transform:`translateY(${d}px)`},{transform:'none'}],{duration:340,easing:'cubic-bezier(.2,.8,.2,1)'})})}
$('#chips').onclick=e=>{const k=e.target.dataset.k;if(!k)return;if(k==='all'){filt.ch=[];filt.unread=false}else if(k==='un')filt.unread=!filt.unread;else filt.ch=filt.ch.includes(k)?filt.ch.filter(x=>x!==k):[...filt.ch,k];saveF();renderList()};
$('#rows').onclick=e=>{if(e.target.id==='clrF'){filt={ch:[],unread:false,status:null,time:'all'};saveF();renderList();return}const r=e.target.closest('.cv');if(r)openChat(+r.dataset.id)};
function filterSheet(){const P=(arr,sel,k)=>arr.map(([v,l])=>`<button class="${sel(v)?'on':''}" data-k="${k}" data-v="${v}">${l}</button>`).join('');
 openSheet(`<h4>ফিল্টার<button data-k="clr">সব মুছুন</button></h4>
 <div class="sl">চ্যানেল</div><div class="pills">${P(Object.keys(CH).map(k=>[k,CH[k].n]),v=>filt.ch.includes(v),'ch')}</div>
 <div class="sl">স্ট্যাটাস</div><div class="pills">${P([['ai','AI রিপ্লাই দিচ্ছে'],['me','আপনি রিপ্লাই দিচ্ছেন'],['unans','উত্তর বাকি']],v=>filt.status===v,'st')}</div>
 <div class="sl">সময়</div><div class="pills">${P([['all','সব'],['today','আজ'],['7','৭ দিন'],['30','৩০ দিন']],v=>filt.time===v,'tm')}</div>
 <div class="btn" data-k="done">${bn(filtered().length)}টি কনভারসেশন দেখুন</div>`,e=>{const k=e.target.dataset.k,v=e.target.dataset.v;if(!k)return;
  if(k==='ch')filt.ch=filt.ch.includes(v)?filt.ch.filter(x=>x!==v):[...filt.ch,v];if(k==='st')filt.status=filt.status===v?null:v;if(k==='tm')filt.time=v;
  if(k==='clr')filt={ch:[],unread:false,status:null,time:'all'};saveF();renderList();if(k==='done')closeSheet();else filterSheet()},true)}
$('#fBtn').onclick=filterSheet;
(()=>{const L=$('#list');let y0=null,d=0;L.addEventListener('touchstart',e=>{if(L.scrollTop<=0)y0=e.touches[0].clientY},{passive:true});
 L.addEventListener('touchmove',e=>{if(y0==null)return;d=Math.max(0,Math.min(70,(e.touches[0].clientY-y0)*.5));$('#ptr').style.transition='none';$('#ptr').style.height=d+'px'},{passive:true});
 L.addEventListener('touchend',()=>{if(y0==null)return;$('#ptr').style.transition='';if(d>40){$('#ptr').style.height='40px';setTimeout(()=>{$('#ptr').style.height='0';renderList()},800)}else $('#ptr').style.height='0';y0=null;d=0})})();

/* ---------- sheets ---------- */
let shH=null;
function openSheet(html,h,keep){$('#sh').innerHTML=html;shH=h||null;$('#shw').classList.add('show')}
function closeSheet(){$('#shw').classList.remove('show')}
$('#shBk').onclick=closeSheet;$('#sh').onclick=e=>shH&&shH(e);

/* ---------- chat render ---------- */
const tk=m=>{if(m.from==='c')return'';const s=m.st;if(s==='sending')return I('clk');if(s==='failed')return`<span class="fail" data-retry="${m.id}">!</span>`;if(s==='sent')return I('chk');return`<span class="dbl ${s==='seen'?'seen':''}">${I('chk')}${I('chk','t2')}</span>`};
const meta=(m,c='mt')=>`<span class="${c}">${hm(m.ts)}<span class="tk">${tk(m)}</span></span>`;
const who=m=>m.from==='c'?cur.name:m.from==='a'?'AI':'আপনি';
const bars=m=>{let s='',x=m.id*9301+49297;for(let i=0;i<26;i++){x=(x*9301+49297)%233280;s+=`<i style="height:${5+Math.round(x/233280*18)}px"></i>`}return s};
function body(m){const k=m.from==='c'?'':m.from==='a'?'ba':'bs';
 const q=m.reply&&cur.msgs.find(x=>x.id===m.reply);
 const qh=q?`<div class="qt" data-q="${q.id}"><b>${esc(who(q))}</b><span>${esc(pv(q))}</span></div>`:'';
 switch(m.type){
 case'text':return`<div class="bub ${k}">${qh}${esc(m.text)}${meta(m)}</div>`;
 case'sticker':return`<div class="stk">${m.text}</div>`;
 case'imgs':{const n=m.srcs.length,sh=m.srcs.slice(0,4),more=n>4?n-4:0;return`<div class="bub im ${k}">${qh}<div class="imgw gw g${Math.min(n,4)}" data-img="${m.id}">${sh.map((x,i)=>`<div class="gt" data-i="${i}"><img src="${x}" alt="ছবি">${more&&i===3?`<span class="more">+${bn(more)}</span>`:''}</div>`).join('')}<span class="ovm">${hm(m.ts)}<span class="tk">${tk(m)}</span></span></div></div>`}
 case'img':return`<div class="bub im ${k}">${qh}<div class="imgw" data-img="${m.id}">${m.src?`<img src="${m.src}" alt="ছবি">`:`<div class="ph_">👟</div>`}<span class="ovm">${hm(m.ts)}<span class="tk">${tk(m)}</span></span></div></div>`;
 case'voice':return`<div class="bub ${k}"><div class="vn"><button class="pl" data-pl="${m.id}" aria-label="চালান">${I('play','fill')}</button><div class="wf">${bars(m)}</div><span class="vd">${mmss(m.dur)}</span></div><div class="mrow">${meta(m)}</div></div>`;
 case'file':return`<div class="bub ${k}"><div class="fileb"><div class="fi">${I('doc')}</div><div><b>${esc(m.name)}</b><span>${esc(m.size||'')}</span></div></div><div class="mrow">${meta(m)}</div></div>`;
 case'product':return`<div class="bub pc ${k||'ba'}"><div class="pimg" style="background:linear-gradient(135deg,${m.p.g[0]},${m.p.g[1]})">${m.p.emo}</div><div class="pi"><b>${esc(m.p.name)}</b><span>সাইজ: ${m.p.sizes}</span><div class="pp">৳${m.p.price}</div></div><div class="mrow">${meta(m)}</div></div>`;
 case'unsup':return`<div class="bub"><span class="unsup">এই ধরনের মেসেজ এখানে দেখানো যায় না।</span><div class="mrow">${meta(m)}</div></div>`}}
function msgEl(m,isNew){const mine=m.from!=='c',r=document.createElement('div');
 r.className='mr '+(mine?'r':'l')+(isNew?' new '+(mine?'out':'in'):'');r.dataset.id=m.id;r.dataset.from=m.from;
 r.innerHTML=`<div class="rep">${I('rep')}</div><div class="bc">${mine?`<div class="who">${m.from==='a'?'AI':'আপনি'}</div>`:''}${body(m)}${m.react?`<div class="rx">${m.react}</div>`:''}</div>`;return r}
function markRuns(){const rows=$$('#msgs .mr[data-id]');rows.forEach(r=>{const p=r.previousElementSibling,n=r.nextElementSibling;
 const sp=p&&p.dataset&&p.dataset.id&&p.dataset.from===r.dataset.from,sn=n&&n.dataset&&n.dataset.id&&n.dataset.from===r.dataset.from;
 r.classList.toggle('first',!sp);r.classList.toggle('last',!sn)})}
function renderMsgs(){const box=$('#msgs'),typ=$('#typ');[...box.children].forEach(x=>x!==typ&&x.remove());let pd='';const c=cur;
 let divAt=null;if(c.divId)divAt=c.divId;
 c.msgs.forEach(m=>{const d=dayLbl(m.ts);if(d!==pd){const s=document.createElement('div');s.className='sday';s.textContent=d;box.insertBefore(s,typ);pd=d}
  if(divAt===m.id){const u=document.createElement('div');u.className='udiv';u.id='udiv';u.textContent=bn(c.divN)+'টি অপঠিত মেসেজ';box.insertBefore(u,typ)}
  box.insertBefore(msgEl(m),typ)});markRuns();
 const u=$('#udiv');box.style.scrollBehavior='auto';box.scrollTop=u?Math.max(0,u.offsetTop-70):box.scrollHeight;box.style.scrollBehavior='';fabN=0;updFab()}
const nearBottom=()=>{const b=$('#msgs');return b.scrollHeight-b.scrollTop-b.clientHeight<120};
function updFab(){const f=$('#fab');f.classList.toggle('show',!nearBottom());f.classList.toggle('has',fabN>0);$('#fabN').textContent=bn(fabN)}
$('#msgs').addEventListener('scroll',()=>{if(nearBottom())fabN=0;updFab()},{passive:true});
$('#fab').onclick=()=>{fabN=0;$('#msgs').scrollTo({top:$('#msgs').scrollHeight,behavior:'smooth'})};
function appendMsg(m){const box=$('#msgs'),near=nearBottom()||m.from==='s';
 const d=dayLbl(m.ts),prev=cur.msgs[cur.msgs.length-2];if(!prev||dayLbl(prev.ts)!==d){const s=document.createElement('div');s.className='sday';s.textContent=d;box.insertBefore(s,$('#typ'))}
 box.insertBefore(msgEl(m,true),$('#typ'));markRuns();
 if(near)box.scrollTo({top:box.scrollHeight,behavior:'smooth'});else if(m.from==='c'){fabN++;updFab()}}
function setSt(m,st){m.st=st;const e=$(`#msgs [data-id="${m.id}"] .tk`);if(!e)return;const d=e.querySelector('.dbl');
 if(d&&st==='seen'){d.classList.add('seen');e.classList.remove('pop');void e.offsetWidth;e.classList.add('pop');return}
 e.innerHTML=tk(m);e.classList.remove('pop');void e.offsetWidth;e.classList.add('pop')}
function reRow(m){const old=$(`#msgs [data-id="${m.id}"]`);if(old){old.replaceWith(msgEl(m));markRuns()}}
function hdr(){const c=cur;$('#chAv').innerHTML=c.ini+badge(c.ch);$('#chName').textContent=c.name;
 const s=$('#chSub');s.className=c.typing==='a'?'g':'';s.textContent=c.typing==='a'?'AI উত্তর লিখছে…':CH[c.ch].n;
 $('#aiT').className='aic'+(c.ai?'':' offai');$('#aiT span').textContent=c.ai?'AI চালু':'AI বন্ধ'}
function setTyping(c,who){c.typing=who;if(cur===c){hdr();const t=$('#typ');t.classList.toggle('show',!!who);if(who&&nearBottom())$('#msgs').scrollTo({top:$('#msgs').scrollHeight,behavior:'smooth'})}if(!$('#ph').classList.contains('chat'))renderList()}
function openChat(id){if(rec)stopRec(false);cur=convs.find(c=>c.id===id);const cm=cur.msgs.filter(m=>m.from==='c');
 if(cur.unread>0&&cm.length){const f=cm[Math.max(0,cm.length-cur.unread)];cur.divId=f.id;cur.divN=Math.min(cur.unread,cm.length)}else cur.divId=null;
 cur.unread=0;clearSel();clearReply(true);$('#inp').value='';autosize();hdr();renderMsgs();$('#ph').classList.add('chat');updComposer();syncSend()}
$('#bBack').onclick=()=>{if(rec)stopRec(false);cur=null;$('#ph').classList.remove('chat','prof');clearSel();setTimeout(()=>renderList(),50)};
$('#aiT').onclick=()=>{cur.ai=!cur.ai;hdr();toast(cur.ai?'AI আবার রিপ্লাই দিবে':'আপনি এখন রিপ্লাই দিচ্ছেন')};

/* ---------- connectivity + 24h window ---------- */
function updComposer(){if(!cur)return;const closed=!windowOpen(cur);$('#comp').classList.toggle('closed',closed);$('#comp').classList.toggle('dis',!net&&!closed);$('#inp').placeholder=net?'মেসেজ লিখুন…':'ইন্টারনেট নেই'}
function updNet(){$('#netChip').className='chip'+(net?'':' off');$('#netChip').innerHTML=net?'<i class="dot"></i>লাইভ':'<i class="dot"></i>অফলাইন';$('#inBan').classList.toggle('show',!net);$('#chBan').classList.toggle('show',!net);updComposer()}

/* ---------- sending ---------- */
function deliver(c,m,react){setTimeout(()=>{if(!net){setSt(m,'failed');return}setSt(m,'sent');
 const toSeen=()=>setTimeout(()=>{setSt(m,'seen');if(react)customerReply(c)},CAP[c.ch].dlv?1300:1600);
 if(CAP[c.ch].dlv)setTimeout(()=>{setSt(m,'delivered');toSeen()},650);else toSeen()},450)}
function sendSeller(m){const c=cur;Object.assign(m,{id:uid++,from:'s',ts:Date.now(),st:'sending'});if(replyTo)m.reply=replyTo;clearReply();
 if(c.ai){c.ai=false;hdr();toast('আপনি রিপ্লাই দিচ্ছেন, AI বন্ধ হয়েছে')}
 c.msgs.push(m);appendMsg(m);deliver(c,m,true)}
$('#msgs').addEventListener('click',e=>{const r=e.target.closest('[data-retry]');if(r){const m=cur.msgs.find(x=>x.id==r.dataset.retry);if(!net)return toast('ইন্টারনেট নেই');setSt(m,'sending');deliver(cur,m,false)}});
const REPL=['ঠিক আছে ভাইয়া 👍','আচ্ছা, অর্ডার করতে চাই','পেমেন্ট কিভাবে করব?','ধন্যবাদ!'];
function customerReply(c){if(c.rt)return;c.rt=setTimeout(()=>{c.rt=null;if(!net)return;incoming(c,mk('c',REPL[c.ri++%REPL.length],0,{ts:Date.now()}))},1600)}
function incoming(c,m){c.msgs.push(m);const open=cur===c&&$('#ph').classList.contains('chat');
 if(open){appendMsg(m);updComposer()}else{c.unread++;renderList(c.id);notify(c,m)}}
function notify(c,m){$('#nAv').innerHTML=c.ini+badge(c.ch);$('#nT').textContent=c.name+' · '+CH[c.ch].n;$('#nB').textContent=pv(m);const n=$('#notif');n.dataset.id=c.id;n.classList.add('show');clearTimeout(n.t);n.t=setTimeout(()=>n.classList.remove('show'),3200)}
$('#notif').onclick=e=>{$('#notif').classList.remove('show');openChat(+e.currentTarget.dataset.id)};
function aiReply(c,text){setTimeout(()=>{if(!net)return;setTyping(c,'a');setTimeout(()=>{setTyping(c,null);
 const w=/দাম|জুতা|আছে|কালার|শার্ট|জ্যাকেট/.test(text);const out=[];
 if(w)out.push(mk('a','',0,{type:'product',p:PROD[Math.floor(Math.random()*3)],ts:Date.now(),st:'sent'}));
 out.push(mk('a',w?'এটা দেখতে পারেন। অর্ডার করতে চাইলে জানান।':'জি, আমি দেখে জানাচ্ছি।',0,{ts:Date.now(),st:'sent'}));
 out.forEach((m,i)=>setTimeout(()=>{c.msgs.push(m);if(c===cur&&$('#ph').classList.contains('chat'))appendMsg(m);else renderList(c.id);deliver(c,m,false)},i*500))},1900)},800)}
const SIM=['ভাইয়া, এই জুতাটার দাম কত?','আরো কালার আছে?','ডেলিভারি কতদিনে পাবো?','আজকে অর্ডার করলে কাল পাবো?'];let si=0;
function simCustomer(c){if(!net)return toast('ইন্টারনেট নেই');const t=SIM[si++%SIM.length];setTimeout(()=>{incoming(c,mk('c',t,0,{ts:Date.now()}));if(c.ai)aiReply(c,t)},500)}

/* composer */
const inp=$('#inp');
function autosize(){inp.style.height='38px';inp.style.height=Math.min(96,inp.scrollHeight)+'px'}
function syncSend(){const has=inp.value.trim().length>0||!!rec;$('#bSend').classList.toggle('has',has&&!rec);$('#bSend').classList.toggle('recm',!!rec);$('#bCam').classList.toggle('hide',inp.value.trim().length>0)}
inp.oninput=()=>{autosize();syncSend()};
inp.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend()}};
let rec=null;
function doSend(){if(!net){if(rec)toast('ইন্টারনেট নেই');return}if(rec){stopRec(true);return}const t=inp.value.trim();if(!t){startRec();return}sendSeller({type:'text',text:t});inp.value='';autosize();syncSend()}
$('#bSend').onclick=doSend;
function startReply(id){const m=cur.msgs.find(x=>x.id==id);if(!m)return;replyTo=m.id;$('#rbN').textContent=who(m);$('#rbT').textContent=pv(m);$('#rbar').classList.add('show');inp.focus()}
function clearReply(){replyTo=null;$('#rbar').classList.remove('show')}$('#rbX').onclick=()=>clearReply();
function drawW(){const w=rec.w;rec.a=Math.max(.12,Math.min(1,rec.a+(Math.random()-.5)*.8));w.push(rec.a);if(w.length>40)w.shift();$('#recW').innerHTML=w.map(a=>`<b style="height:${Math.round(3+a*20)}px"></b>`).join('')}
function startRec(){rec={t:0,a:.4,w:[],iv:setInterval(()=>{rec.t++;$('#recT').textContent=mmss(rec.t)},1000)};rec.wv=setInterval(drawW,90);$('#recT').textContent='০:০০';$('#comp').classList.add('recing');syncSend();vib()}
function stopRec(send){clearInterval(rec.iv);clearInterval(rec.wv);const t=rec.t;$('#comp').classList.remove('recing');rec=null;syncSend();if(send&&t>=1)sendSeller({type:'voice',dur:t});else if(send)toast('ভয়েস খুব ছোট')}
$('#recX').onclick=()=>stopRec(false);
let pl=null;
$('#msgs').addEventListener('click',e=>{const b=e.target.closest('[data-pl]');if(!b)return;const m=cur.msgs.find(x=>x.id==b.dataset.pl),w=b.parentNode.querySelector('.wf').children;
 if(pl){clearInterval(pl.iv);pl.b.innerHTML=I('play','fill');[...pl.w].forEach(x=>x.classList.remove('f'));const same=pl.b===b;pl=null;if(same)return}
 let p=0;b.innerHTML=I('pause');pl={b,w,iv:setInterval(()=>{p+=.1;const n=Math.floor(p/m.dur*w.length);[...w].forEach((x,i)=>x.classList.toggle('f',i<n));if(p>=m.dur){clearInterval(pl.iv);b.innerHTML=I('play','fill');[...w].forEach(x=>x.classList.remove('f'));pl=null}},100)}});
/* attach */
$('#bClip').onclick=()=>{const doc=CAP[cur.ch].doc;openSheet(`<h4>পাঠান</h4><div class="grid4"><div><button data-k="gal">${I('img')}</button>গ্যালারি</div><div><button data-k="cam">${I('cam')}</button>ক্যামেরা</div>${doc?`<div><button data-k="doc">${I('doc')}</button>ডকুমেন্ট</div>`:''}<div><button data-k="prod">${I('bag')}</button>পণ্য</div></div>`,e=>{const k=(e.target.closest('[data-k]')||{dataset:{}}).dataset.k;if(!k)return;closeSheet();if(k==='gal')$('#fGal').click();if(k==='cam')$('#fCam').click();if(k==='doc')$('#fDoc').click();if(k==='prod')setTimeout(prodSheet,200)})};
$('#bCam').onclick=()=>$('#fCam').click();
function prodSheet(){openSheet(`<h4>পণ্য পাঠান</h4>`+PROD.map((p,i)=>`<div class="lr" data-p="${i}"><div class="av" style="border-radius:10px;font-size:22px;background:linear-gradient(135deg,${p.g[0]},${p.g[1]})">${p.emo}</div><div class="cm"><b>${p.name}</b><span>৳${p.price}</span></div></div>`).join(''),e=>{const r=e.target.closest('[data-p]');if(r){closeSheet();sendSeller({type:'product',p:PROD[r.dataset.p]})}})}
let pend=[],pcur=0,appendMode=false;const MAXI=10;
function pvRender(){$('#pImg').src=pend[pcur]||'';$('#pTh').innerHTML=pend.map((x,i)=>`<button data-t="${i}" class="${i===pcur?'on':''}"><img src="${x}" alt=""><span class="rm" data-r="${i}">×</span></button>`).join('')+(pend.length<MAXI?'<button class="add" data-add="1">+</button>':'');$('#pC').textContent=pend.length>1?bn(pcur+1)+'/'+bn(pend.length):'';const c=$('#pCnt');c.textContent=bn(pend.length);c.classList.toggle('on',pend.length>1)}
function pvOpen(list,append){if(append&&$('#pvw').classList.contains('show')){pcur=pend.length;pend=pend.concat(list)}else{pend=list.slice();pcur=0}if(pend.length>MAXI){pend=pend.slice(0,MAXI);toast('সর্বোচ্চ ১০টি ছবি')}pcur=Math.min(pcur,pend.length-1);pvRender();$('#pvw').classList.add('show')}
$('#pTh').onclick=e=>{const r=e.target.closest('[data-r]');if(r){pend.splice(+r.dataset.r,1);if(!pend.length){$('#pvw').classList.remove('show');return}pcur=Math.min(pcur,pend.length-1);return pvRender()}if(e.target.closest('[data-add]')){appendMode=true;$('#fGal').click();return}const t=e.target.closest('[data-t]');if(t){pcur=+t.dataset.t;pvRender()}};
const onFile=e=>{const fs=[...e.target.files];e.target.value='';if(!fs.length)return;if(!net)return toast('ইন্টারনেট নেই');const im=fs.filter(f=>f.type.startsWith('image/'));
 if(im.length){pvOpen(im.map(f=>URL.createObjectURL(f)),appendMode);appendMode=false}else{const f=fs[0];sendSeller({type:'file',name:f.name,size:bn(f.size/1024<1024?Math.round(f.size/1024)+' KB':(f.size/1048576).toFixed(1)+' MB')})}};
$('#fGal').onchange=onFile;$('#fCam').onchange=onFile;$('#fDoc').onchange=onFile;
$('#pX').onclick=()=>$('#pvw').classList.remove('show');
$('#pSend').onclick=()=>{const l=pend.slice();$('#pvw').classList.remove('show');l.length>1?sendSeller({type:'imgs',srcs:l}):sendSeller({type:'img',src:l[0]})};
$('#msgs').addEventListener('click',e=>{const w=e.target.closest('[data-img]');if(!w||selId||justSel)return;const m=cur.msgs.find(x=>x.id==w.dataset.img),t=e.target.closest('[data-i]');openViewer(m,t?+t.dataset.i:0)});
let vs=null,vx=0;
function openViewer(m,i){vs={m,i,list:m.srcs||[m.src||null]};showV();$('#viewer').classList.add('show')}
function showV(){const l=vs.list,x=l[vs.i];$('#vN').textContent=who(vs.m)+(l.length>1?' · '+bn(vs.i+1)+'/'+bn(l.length):'');$('#vB').innerHTML=x?`<img src="${x}" alt="">`:`<div class="vph">👟</div>`;$('#vPrev').style.display=vs.i>0?'':'none';$('#vNext').style.display=vs.i<l.length-1?'':'none'}
const vgo=d=>{if(vs&&vs.i+d>=0&&vs.i+d<vs.list.length){vs.i+=d;showV()}};
$('#vPrev').onclick=()=>vgo(-1);$('#vNext').onclick=()=>vgo(1);
$('#vB').addEventListener('pointerdown',e=>vx=e.clientX);$('#vB').addEventListener('pointerup',e=>{const d=e.clientX-vx;if(Math.abs(d)>50)vgo(d<0?1:-1)});
$('#vX').onclick=()=>$('#viewer').classList.remove('show');

/* ---------- swipe to reply / long press ---------- */
let sw=null,justSel=false;const box=$('#msgs');
box.addEventListener('pointerdown',e=>{const r=e.target.closest('.mr');if(!r||r.id==='typ'||e.button>0)return;
 sw={r,x:e.clientX,y:e.clientY,moved:false,hit:false,id:e.pointerId};r.classList.add('pressing');
 sw.t=setTimeout(()=>{if(sw&&!sw.moved){const id=sw.r.dataset.id;sw.r.classList.remove('pressing');sw=null;justSel=true;setTimeout(()=>justSel=false,350);select(+id)}},430)});
box.addEventListener('pointermove',e=>{if(!sw)return;const dx=e.clientX-sw.x,dy=e.clientY-sw.y;
 if(!sw.moved&&Math.abs(dy)>10){clearTimeout(sw.t);sw.r.classList.remove('pressing');sw=null;return}
 if(Math.abs(dx)>8&&!sw.moved){sw.moved=true;clearTimeout(sw.t);sw.r.classList.remove('pressing');try{sw.r.setPointerCapture(sw.id)}catch(_){}sw.r.querySelector('.bc').classList.remove('back')}
 if(sw.moved){const raw=Math.max(0,dx),t=raw<56?raw:56+(raw-56)*.28,bc=sw.r.querySelector('.bc'),rp=sw.r.querySelector('.rep');
  bc.style.transform=`translateX(${t}px)`;rp.style.opacity=Math.min(1,Math.max(0,(t-10)/40));rp.style.transform=`scale(${.6+Math.min(.4,t/140)})`;
  if(t>=56&&!sw.hit){sw.hit=true;vib();rp.style.background='var(--cr)';rp.style.color='var(--ink)'}else if(t<56&&sw.hit){sw.hit=false;rp.style.background='';rp.style.color=''}}});
const endSw=()=>{if(!sw)return;clearTimeout(sw.t);sw.r.classList.remove('pressing');if(sw.moved){const bc=sw.r.querySelector('.bc'),rp=sw.r.querySelector('.rep');bc.classList.add('back');bc.style.transform='';rp.style.opacity=0;rp.style.background='';rp.style.color='';if(sw.hit)startReply(sw.r.dataset.id)}sw=null};
box.addEventListener('pointerup',endSw);box.addEventListener('pointercancel',endSw);
box.addEventListener('contextmenu',e=>{const r=e.target.closest('.mr');if(r&&r.id!=='typ'){e.preventDefault();clearTimeout(sw&&sw.t);sw=null;justSel=true;setTimeout(()=>justSel=false,350);select(+r.dataset.id)}});
box.addEventListener('click',e=>{if(justSel)return;const q=e.target.closest('[data-q]');if(q&&!selId){const t=$(`#msgs [data-id="${q.dataset.q}"]`);if(t){t.scrollIntoView({behavior:'smooth',block:'center'});t.classList.remove('flash');void t.offsetWidth;t.classList.add('flash')}return}
 if(selId){const r=e.target.closest('.mr');if(r&&r.id!=='typ'&&+r.dataset.id!==selId)select(+r.dataset.id);else clearSel()}});
/* selection: reply / copy / info; reactions only on customer messages */
const RX=['👍','❤️','😂','😮','😢','🙏'];
function select(id){clearSel(true);selId=id;const r=$(`#msgs [data-id="${id}"]`);r.classList.add('sel');vib();const m=cur.msgs.find(x=>x.id===id);
 $('#selbar').classList.add('show');$('#selbar [data-a=copy]').style.display=m.type==='text'?'':'none';$('#selbar [data-a=fwd]').style.display=m.from==='c'||m.type==='unsup'?'none':'';
 const rb=$('#rxbar');if(m.from==='c'){const pr=$('#ph').getBoundingClientRect(),rr=r.getBoundingClientRect();
  rb.innerHTML=RX.map((x,i)=>`<button data-x="${x}" style="animation-delay:${i*30}ms">${x}</button>`).join('');rb.style.top=Math.max(64,rr.top-pr.top-46)+'px';rb.style.left='14px';rb.style.right='auto';rb.classList.remove('show');void rb.offsetWidth;rb.classList.add('show')}else rb.classList.remove('show')}
function clearSel(keep){if(selId){const r=$(`#msgs [data-id="${selId}"]`);r&&r.classList.remove('sel')}selId=null;if(!keep){$('#selbar').classList.remove('show');$('#rxbar').classList.remove('show')}}
$('#rxbar').onclick=e=>{const x=e.target.dataset.x;if(!x)return;const m=cur.msgs.find(v=>v.id===selId);m.react=m.react===x?null:x;clearSel();reRow(m)};
$('#selbar').onclick=e=>{const a=(e.target.closest('[data-a]')||{dataset:{}}).dataset.a;if(!a)return;const m=cur.msgs.find(v=>v.id===selId);
 if(a==='close')return clearSel();
 if(a==='reply'){const id=selId;clearSel();startReply(id)}
 if(a==='copy'){clearSel();try{navigator.clipboard.writeText(m.text)}catch(_){}toast('কপি হয়েছে')}
 if(a==='fwd'){clearSel();fwdSheet(m)}
 if(a==='info'){clearSel();infoSheet(m)}};

/* forward = resend a copy through the send API (no native \"Forwarded\" label exists) */
function fwdSheet(m){const o=convs.filter(c=>c!==cur);
 const ok=c=>windowOpen(c)&&!(m.type==='file'&&!CAP[c.ch].doc);
 const why=c=>!windowOpen(c)?'২৪ ঘণ্টা পার হয়ে গেছে':'এই চ্যানেলে ডকুমেন্ট পাঠানো যায় না';
 openSheet(`<h4>ফরওয়ার্ড করুন</h4>`+o.map(c=>`<div class="cv" data-f="${c.id}" style="padding:10px 0;${ok(c)?'':'opacity:.45;pointer-events:none'}"><div class="av">${c.ini}${badge(c.ch)}</div><div class="cm"><b>${esc(c.name)}</b><span>${ok(c)?CH[c.ch].n:why(c)}</span></div></div>`).join(''),
 e=>{const r=e.target.closest('[data-f]');if(!r)return;if(!net){closeSheet();return toast('ইন্টারনেট নেই')}
  const c=convs.find(x=>x.id==r.dataset.f),n={...m,id:uid++,from:'s',ts:Date.now(),st:'sending'};delete n.reply;delete n.react;
  c.msgs.push(n);if(c.ai)c.ai=false;closeSheet();renderList(c.id);deliver(c,n,false);toast('ফরওয়ার্ড হয়েছে · '+c.name)})}
function infoSheet(m){const mine=m.from!=='c',st=m.st,t=ts=>hm(ts),cap=CAP[cur.ch];
 openSheet(`<h4>মেসেজ তথ্য</h4><div class="ir">${I('chk')}${mine?'পাঠানো হয়েছে':'এসেছে'}<span class="v">${dayLbl(m.ts)}, ${t(m.ts)}</span></div>`+
 (mine&&cap.dlv?`<div class="ir"><span class="dbl">${I('chk')}${I('chk','t2')}</span>পৌঁছেছে<span class="v">${['delivered','seen'].includes(st)?t(m.ts+1000):'এখনো না'}</span></div>`:'')+
 (mine?`<div class="ir"><span class="dbl seen">${I('chk')}${I('chk','t2')}</span>দেখেছে<span class="v">${st==='seen'?t(m.ts+3000):'এখনো না'}</span></div>`:'')+
 `<div class="ir">${I(cur.ch)}চ্যানেল<span class="v">${CH[cur.ch].n}</span></div><div class="ir">${I('msg')}পাঠিয়েছে<span class="v">${who(m)}</span></div>`)}


/* ---------- customer profile ---------- */
const MON=['জানু','ফেব্রু','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টে','অক্টো','নভে','ডিসে'];
const dFmt=ts=>{const d=new Date(ts);return bn(d.getDate())+' '+MON[d.getMonth()]+(d.getFullYear()!==new Date().getFullYear()?' '+bn(d.getFullYear()):'')};
const when=ts=>Date.now()-ts<864e5&&new Date(ts).getDate()===new Date().getDate()?'আজ, '+hm(ts):dFmt(ts);
const taka=n=>'৳'+bn(Number(n).toLocaleString('en-IN'));
const O=(id,store,items,amt,days,s,why)=>({id,store,items,amt,ts:now-days*864e5,s,why});
const FH='ফ্যাশন হাউস',SC='শু কর্নার',GW='জেন্টস ওয়্যার';
const ST={ok:['সফল','ok'],cx:['বাতিল','er'],rt:['ফেরত','wr'],run:['চলমান','mu']};
/* demo data: in the real app this comes from the orders of every workspace/store this customer bought from */
const PROF={
1:{phone:'+৮৮০ ১৭১২-৩৪৫৬৭৮',addr:'বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা',pay:'ক্যাশ অন ডেলিভারি',first:now-200*864e5,msgs:96,talks:14,orders:[
 O('#১০৪২',FH,'কটন ক্যাজুয়াল শার্ট × ১',1250,0.1,'run'),O('#০৯৮৮',FH,'লিনেন কুর্তি × ২',2400,20,'ok'),O('#০৯৩১',FH,'ডেনিম জ্যাকেট × ১',3500,41,'ok'),O('#০৮৭৬',FH,'টি-শার্ট × ৩',1800,70,'ok'),
 O('#০৭১২',SC,'লেদার স্নিকার × ১',2800,95,'ok'),O('#০৬৫৪',SC,'স্যান্ডেল × ১',1150,130,'cx','ঠিকানা ভুল ছিল'),O('#০৬০১',SC,'স্পোর্টস জুতা × ১',2200,160,'ok'),O('#০৫৪৪',FH,'ওড়না × ২',900,190,'ok')]},
2:{user:'rafiq.hossain',addr:'মিরপুর ১০, ঢাকা',pay:'ক্যাশ অন ডেলিভারি',first:now-120*864e5,msgs:58,talks:12,orders:[
 O('#১০১৯',SC,'লেদার স্নিকার × ১',2800,9,'cx','ডেলিভারির সময় ফোন ধরেননি'),O('#০৯৫৫',GW,'ডেনিম জ্যাকেট × ১',3500,35,'cx','ডেলিভারির সময় নিতে চাননি'),O('#০৮৯০',GW,'টি-শার্ট × ২',1200,60,'ok'),O('#০৮০১',GW,'জিন্স প্যান্ট × ১',1800,88,'cx','পরে মত বদলেছেন')]},
3:{addr:'উত্তরা সেক্টর ৭, ঢাকা',pay:'বিকাশ',first:now-80*864e5,msgs:31,talks:5,orders:[
 O('#১০৩১',FH,'শাড়ি × ১',3200,1,'run'),O('#০৯৭০',FH,'থ্রি-পিস × ১',2600,28,'ok'),O('#০৮৯৯',FH,'ওড়না × ২',800,55,'ok'),O('#০৮২২',FH,'থ্রি-পিস × ১',2400,78,'cx','সাইজ মেলেনি')]},
4:{phone:'+৮৮০ ১৮১৯-২২৩৩৪৪',addr:'কলেজ রোড, কুমিল্লা',pay:'ক্যাশ অন ডেলিভারি',first:now-150*864e5,msgs:40,talks:9,orders:[
 O('#১০০২',GW,'পাঞ্জাবি × ১',2100,22,'ok'),O('#০৯৬১',SC,'লোফার জুতা × ১',2600,45,'ok'),O('#০৯১৫',GW,'শার্ট × ২',2400,66,'ok'),O('#০৮৫০',GW,'পলো শার্ট × ১',950,92,'ok'),O('#০৭৭৭',SC,'স্যান্ডেল × ১',1400,120,'ok'),O('#০৬৯০',GW,'ট্রাউজার × ১',1700,148,'ok')]},
5:{user:'sumi.__',first:now-25*864e5,msgs:23,talks:9,asked:['কালো ও নীল রঙের কুর্তি','দাম ও সাইজ চার্ট'],orders:[]},
6:{addr:'সদর রোড, বরিশাল',pay:'ক্যাশ অন ডেলিভারি',first:now-3*864e5,msgs:4,talks:2,orders:[O('#১০৪০',GW,'টি-শার্ট × ২',1200,2,'run')]},
7:{phone:'+৮৮০ ১৯১৮-৫৫৬৬৭৭',talks:1,orders:[]}};
function profData(c){const P=PROF[c.id]||{},cm=c.msgs.filter(m=>m.from==='c'),seen=[];
 c.msgs.forEach(m=>{if(m.type==='product'&&m.p&&!seen.includes(m.p.name))seen.push(m.p.name)});
 return{phone:P.phone,user:P.user,addr:P.addr,pay:P.pay,orders:(P.orders||[]).slice().sort((a,b)=>b.ts-a.ts),
  first:P.first||(cm[0]?cm[0].ts:Date.now()),msgs:P.msgs||cm.length,talks:P.talks||1,asked:[...(P.asked||[]),...seen],firstTxt:(cm.find(m=>m.type==='text')||{}).text}}
function verdict(P){const o=P.orders,n=t=>o.filter(x=>x.s===t),ok=n('ok'),cx=n('cx'),rt=n('rt'),run=n('run'),done=ok.length+cx.length+rt.length;
 const rate=done?Math.round(ok.length/done*100):null,r=[];let label,tone;
 if(!o.length){if(P.talks<=1){label='নতুন কাস্টমার';tone='mu'}else if(P.talks>=4){label='অনেকবার জিজ্ঞেস করেছেন, কেনেননি';tone='wr'}else{label='এখনো কেনেননি';tone='mu'}}
 else if(!done){label='প্রথম অর্ডার চলছে';tone='mu'}
 else if(done<3&&rate===100){label='নতুন, কিন্তু ভালো শুরু';tone='ok'}
 else if(done<3){label='সতর্ক থাকুন';tone='er'}
 else if(rate>=85){label='ভরসাযোগ্য কাস্টমার';tone='ok'}
 else if(rate>=60){label='মাঝারি কাস্টমার';tone='wr'}
 else{label='ঝুঁকিপূর্ণ কাস্টমার';tone='er'}
 if(ok.length)r.push(['ok',`${bn(ok.length)}টি অর্ডার ঠিকমতো নিয়েছেন`]);
 if(done&&!cx.length&&!rt.length)r.push(['ok','কখনো বাতিল বা ফেরত দেননি']);
 if(cx.length){const w=cx.find(x=>x.why);r.push(['er',`${bn(cx.length)}বার অর্ডার বাতিল করেছেন`+(w?`। সর্বশেষ কারণ: ${w.why}`:'')])}
 if(rt.length)r.push(['wr',`${bn(rt.length)}টি পণ্য ফেরত দিয়েছেন`]);
 if(run.length)r.push(['mu',`${bn(run.length)}টি অর্ডার এখন চলছে`]);
 if(done&&tone==='er')r.push(['wr','অর্ডার নেওয়ার আগে ফোনে কনফার্ম করুন, সম্ভব হলে অগ্রিম নিন']);
 return{label,tone,rate,done,ok,cx,rt,run,reasons:r}}
const kv=(k,v)=>`<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
function pfHTML(c){const P=profData(c),o=P.orders,V=verdict(P),fresh=!o.length&&P.talks<=1;
 const sub=[CH[c.ch].n,c.ch==='wa'&&P.phone?P.phone:c.ch==='ig'&&P.user?'@'+P.user:''].filter(Boolean).join(' · ');
 let h=`<div class="hero"><div class="av">${c.ini}${badge(c.ch)}</div><h2>${esc(c.name)}</h2><div class="sub">${sub}</div><span class="tag ${V.tone}">${V.label}</span></div>
 <div class="qa"><button data-a="chat">${I('msg')}মেসেজ</button>${P.phone?`<button data-a="copy">${I('copy')}নম্বর কপি</button>`:''}<button data-a="ai">${I('ms')}${c.ai?'AI বন্ধ করুন':'AI চালু করুন'}</button></div>`;
 /* 1. how good a customer */
 if(V.done){h+=`<div class="pfc"><div class="vd2"><div class="ring ${V.tone}" style="--p:${V.rate}"><i>${bn(V.rate)}%</i></div><div><b>${bn(V.done)}টির মধ্যে ${bn(V.ok.length)}টি অর্ডার সফল</b><span>সফল অর্ডারের হার</span></div></div><ul class="rs">${V.reasons.map(x=>`<li class="${x[0]}">${x[1]}</li>`).join('')}</ul></div>`}
 else if(o.length){h+=`<div class="pfc"><div class="emp2"><div class="ic">${I('clk')}</div><div><b>প্রথম অর্ডার চলছে</b><span>ডেলিভারি হওয়ার পর এখানে সফল অর্ডারের হার আর কেমন কাস্টমার তা দেখা যাবে।</span></div></div></div>`}
 else if(fresh){h+=`<div class="pfc"><div class="emp2"><div class="ic">${I('bag')}</div><div><b>এখনো কোনো অর্ডার নেই</b><span>প্রথমবার মেসেজ করেছেন। অর্ডার হলে এখানে অর্ডারের ইতিহাস, সফল অর্ডারের হার আর কেমন কাস্টমার তা দেখা যাবে।</span></div></div></div>`}
 else{h+=`<div class="pfc"><div class="emp2"><div class="ic">${I('bag')}</div><div><b>এখনো কিছু কেনেননি</b><span>${bn(P.talks)}বার কথা বলেছেন, মোট ${bn(P.msgs)}টি মেসেজ দিয়েছেন, কিন্তু কোনো অর্ডার হয়নি।</span></div></div></div>`}
 /* 2. order summary (only real numbers) */
 if(V.done){const tl=[['মোট অর্ডার',o.length,''],['সফল',V.ok.length,'ok'],['বাতিল',V.cx.length,'er'],['ফেরত',V.rt.length,'wr'],['চলমান',V.run.length,'']].filter((x,i)=>i===0||x[1]>0);
  const sum=V.ok.reduce((a,x)=>a+x.amt,0);
  h+=`<div class="pfc"><h5>অর্ডারের সারাংশ</h5><div class="tiles">${tl.map(x=>`<div class="tile ${x[2]}"><b>${bn(x[1])}</b><span>${x[0]}</span></div>`).join('')}</div>`+
   (V.ok.length?kv('মোট কেনাকাটা',taka(sum)):'')+(V.ok.length>1?kv('গড় অর্ডার',taka(Math.round(sum/V.ok.length))):'')+kv('শেষ অর্ডার',dFmt(o[0].ts))+`</div>`}
 /* 3. intro for a brand-new customer / buying behaviour for everyone else */
 if(fresh){h+=`<div class="pfc"><h5>পরিচিতি</h5>${kv('প্রথম মেসেজ',when(P.first))}${kv('চ্যানেল',CH[c.ch].n)}${P.firstTxt?`<div class="fmsg">${esc(P.firstTxt)}</div>`:''}</div>`}
 else{h+=`<div class="pfc"><h5>কথা বলা আর কেনার আচরণ</h5>${kv('প্রথম মেসেজ',dFmt(P.first))}${kv('মোট মেসেজ দিয়েছেন',bn(P.msgs)+'টি')}${kv('কথা হয়েছে',bn(P.talks)+' বার')}`+
  (o.length?kv('অর্ডার হয়েছে',bn(o.length)+' বার'):'')+(o.length&&P.talks>o.length?kv('কথা হয়েছে, কিন্তু অর্ডার হয়নি',bn(P.talks-o.length)+' বার'):'')+`</div>`}
 /* 4. orders grouped by workspace / store */
 if(o.length){const g=[];o.forEach(x=>{let e=g.find(y=>y.n===x.store);if(!e)g.push(e={n:x.store,l:[]});e.l.push(x)});
  h+=`<div class="pfc" id="pfOrders"><h5>অর্ডারের ইতিহাস</h5>${g.map((e,gi)=>{const t=e.l.filter(x=>x.s==='ok').reduce((a,x)=>a+x.amt,0);
   return`<div class="stg" data-g="${gi}"><div class="sth">${I('bag')}${esc(e.n)}<span>${bn(e.l.length)}টি অর্ডার${t?' · '+taka(t):''}</span></div>${e.l.map((x,i)=>`<div class="ord ${i>=3?'x':''}"><div class="l"><b>${esc(x.items)}</b><span>${dFmt(x.ts)} · ${x.id}</span>${x.why?`<span class="why">${esc(x.why)}</span>`:''}</div><div class="r">${taka(x.amt)}<em class="${ST[x.s][1]}">${ST[x.s][0]}</em></div></div>`).join('')}${e.l.length>3?`<button class="mo" data-a="more">আরও ${bn(e.l.length-3)}টি দেখুন</button>`:''}</div>`}).join('')}</div>`}
 /* 5. contact: only what we actually know */
 const rows=[P.phone&&c.ch!=='wa'&&kv('ফোন',P.phone),P.addr&&kv('ঠিকানা',esc(P.addr)),P.pay&&kv('পছন্দের পেমেন্ট',P.pay)].filter(Boolean);
 if(rows.length)h+=`<div class="pfc"><h5>যোগাযোগ ও ডেলিভারি</h5>${rows.join('')}</div>`;
 if(P.asked.length)h+=`<div class="pfc"><h5>যা নিয়ে জানতে চেয়েছেন</h5><div class="chips2">${P.asked.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div>`;
 h+=`<div class="pfc"><h5>আপনার নোট</h5><textarea class="nt" id="pfNote" rows="2" placeholder="এই কাস্টমার সম্পর্কে কিছু লিখে রাখুন…">${esc(c.note||'')}</textarea></div>`;
 return h}
function openProfile(){if(!cur)return;$('#pfBody').innerHTML=pfHTML(cur);$('#pfBody').scrollTop=0;$('#ph').classList.add('prof')}
$('#chInfo').onclick=openProfile;
$('#pfBack').onclick=()=>$('#ph').classList.remove('prof');
$('#pfBody').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
 if(a==='chat')$('#ph').classList.remove('prof');
 if(a==='copy'){try{navigator.clipboard.writeText(profData(cur).phone)}catch(_){}toast('নম্বর কপি হয়েছে')}
 if(a==='ai'){cur.ai=!cur.ai;hdr();b.innerHTML=I('ms')+(cur.ai?'AI বন্ধ করুন':'AI চালু করুন');toast(cur.ai?'AI আবার রিপ্লাই দিবে':'আপনি এখন রিপ্লাই দিচ্ছেন')}
 if(a==='more'){const g=b.closest('.stg');g.classList.toggle('open');b.textContent=g.classList.contains('open')?'কম দেখুন':'আরও '+bn(g.querySelectorAll('.ord.x').length)+'টি দেখুন'}});
$('#pfBody').addEventListener('input',e=>{if(e.target.id==='pfNote'&&cur)cur.note=e.target.value});
$('#pfBody').addEventListener('focusout',e=>{if(e.target.id==='pfNote'&&cur&&cur.note)toast('নোট সেভ হয়েছে')});

/* ---------- demo controls ---------- */
$('#cNet').onclick=e=>{net=!net;e.target.textContent=net?'ইন্টারনেট বন্ধ করুন':'ইন্টারনেট চালু করুন';
 if(net){$('#netChip').className='chip sync';$('#netChip').innerHTML='<i class="dot"></i>সিঙ্ক হচ্ছে';setTimeout(updNet,1200);$('#inBan').classList.remove('show');$('#chBan').classList.remove('show');updComposer()}else updNet()};
$('#cSim').onclick=()=>simCustomer(cur||convs[2]);
$('#cOther').onclick=()=>{if(!net)return toast('ইন্টারনেট নেই');const o=convs.filter(c=>c!==cur);const c=o[Math.floor(Math.random()*o.length)];const t=SIM[si++%SIM.length];
 setTimeout(()=>{incoming(c,mk('c',t,0,{ts:Date.now()}));if(c.ai)aiReply(c,t)},400)};
$('#cReact').onclick=()=>{if(!cur)return toast('আগে একটি চ্যাট খুলুন');const m=[...cur.msgs].reverse().find(x=>x.from!=='c');if(!m)return;m.react=['👍','❤️','😍'][Math.floor(Math.random()*3)];reRow(m)};
$('#cTheme').onclick=e=>{const l=$('#ph').classList.toggle('light');e.target.textContent=l?'ডার্ক থিম':'লাইট থিম'};

/* demo images drawn on a canvas, so no file picker is needed */
const DEMO=[['#e9c9a0','#8a6a4f','👟'],['#a8c5d9','#3b5a73','👕'],['#d9a8b4','#7a3b4c','👜'],['#c9d9a8','#4c6b3a','🧢'],['#d9cfa8','#6b5d3a','🕶️']];let di=0;
function demoImg(){const[a,b,e]=DEMO[di++%DEMO.length],c=document.createElement('canvas');c.width=720;c.height=540;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,720,540);g.addColorStop(0,a);g.addColorStop(1,b);x.fillStyle=g;x.fillRect(0,0,720,540);x.font='260px serif';x.textAlign='center';x.textBaseline='middle';x.fillText(e,360,280);return c.toDataURL('image/jpeg',.85)}
$('#cImgS').onclick=()=>{if(!cur)return toast('আগে একটি চ্যাট খুলুন');if(!net)return toast('ইন্টারনেট নেই');if(!windowOpen(cur))return toast('২৪ ঘণ্টা পার হয়ে গেছে');pvOpen([demoImg()])};
$('#cImgM').onclick=()=>{if(!cur)return toast('আগে একটি চ্যাট খুলুন');if(!net)return toast('ইন্টারনেট নেই');if(!windowOpen(cur))return toast('২৪ ঘণ্টা পার হয়ে গেছে');pvOpen([demoImg(),demoImg(),demoImg(),demoImg()])};
$('#cImgCM').onclick=()=>{const c=cur||convs[0];if(!net)return toast('ইন্টারনেট নেই');setTimeout(()=>{incoming(c,mk('c','',0,{type:'imgs',srcs:[1,2,3,4,5].map(demoImg),ts:Date.now()}));if(c.ai)aiReply(c,'')},400)};
$('#cImgC').onclick=()=>{const c=cur||convs[0];if(!net)return toast('ইন্টারনেট নেই');setTimeout(()=>{incoming(c,mk('c','',0,{type:'img',src:demoImg(),ts:Date.now()}));if(c.ai)aiReply(c,'')},400)};

/* design-page hook: puts the prototype into a named, frozen state (used by ekmivo-app-design.html) */
window.__step=function(k){
 const later=(f,t)=>setTimeout(f,t),lastOf=f=>[...cur.msgs].reverse().find(f),
  cust=()=>lastOf(m=>m.from==='c'&&m.type==='text'),own=()=>lastOf(m=>m.from!=='c'&&m.type==='text'),
  rowOf=m=>$(`#msgs [data-id="${m.id}"]`),view=e=>{if(!e)return;const b=$('#msgs');b.scrollTop+=e.getBoundingClientRect().top-b.getBoundingClientRect().top-b.clientHeight/2+e.offsetHeight/2},
  sendImg=st=>{const m={id:uid++,from:'s',type:'img',src:demoImg(),ts:Date.now(),st};cur.msgs.push(m);appendMsg(m);view(rowOf(m))},
  sendImgs=(n,st)=>{const m={id:uid++,from:'s',type:'imgs',srcs:Array.from({length:n},()=>demoImg()),ts:Date.now(),st};cur.msgs.push(m);appendMsg(m);view(rowOf(m))},
  chat=(id,f,t)=>{openChat(id);if(f)later(f,t||350)};
 const A={
 'list':()=>{},
 'list-filter':()=>$$('#chips button')[1].click(),
 'list-filter-channel':()=>$$('#chips button').find(b=>b.textContent.includes('Instagram')).click(),
 'list-filter-sheet':()=>$('#fBtn').click(),
 'list-offline':()=>$('#cNet').click(),
 'list-notif':()=>{notify(convs[1],mk('c','ভাইয়া, এই জুতাটার দাম কত?',0,{ts:Date.now()}));clearTimeout($('#notif').t)},
 'chat-open':()=>chat(1),
 'chat-ai-typing':()=>chat(1,()=>setTyping(cur,'a'),300),
 'chat-select-customer':()=>chat(1,()=>{const m=cust();view(rowOf(m));later(()=>select(m.id),150)}),
 'chat-reacted':()=>chat(1,()=>{const m=cust();m.react='❤️';reRow(m);view(rowOf(m))}),
 'chat-select-own':()=>chat(1,()=>{const m=own();view(rowOf(m));later(()=>select(m.id),150)}),
 'chat-swipe':()=>chat(1,()=>{const m=cust(),r=rowOf(m);view(r);const bc=r.querySelector('.bc'),rp=r.querySelector('.rep');bc.classList.remove('back');bc.style.transform='translateX(64px)';rp.style.opacity=1;rp.style.transform='scale(1)';rp.style.background='var(--cr)';rp.style.color='var(--ink)'}),
 'chat-reply-bar':()=>chat(1,()=>startReply(cust().id)),
 'attach-sheet':()=>chat(1,()=>$('#bClip').click(),300),
 'attach-sheet-ig':()=>chat(2,()=>$('#bClip').click(),300),
 'product-picker':()=>chat(1,()=>prodSheet(),300),
 'image-preview':()=>chat(1,()=>pvOpen([demoImg()]),300),
 'images-preview':()=>chat(1,()=>{pvOpen([1,2,3,4].map(demoImg));pcur=1;pvRender()},300),
 'images-2':()=>chat(1,()=>sendImgs(2,'seen')),
 'images-3':()=>chat(1,()=>sendImgs(3,'seen')),
 'images-4':()=>chat(1,()=>sendImgs(4,'delivered')),
 'images-received-5':()=>chat(1,()=>{const m={id:uid++,from:'c',type:'imgs',srcs:[1,2,3,4,5].map(demoImg),ts:Date.now()};cur.msgs.push(m);appendMsg(m);view(rowOf(m))}),
 'images-viewer':()=>chat(1,()=>{const m={id:uid++,from:'c',type:'imgs',srcs:[1,2,3,4,5].map(demoImg),ts:Date.now()};cur.msgs.push(m);appendMsg(m);openViewer(m,2)}),
 'image-sending':()=>chat(1,()=>sendImg('sending')),
 'image-sent':()=>chat(1,()=>sendImg('sent')),
 'image-delivered':()=>chat(1,()=>sendImg('delivered')),
 'image-seen':()=>chat(1,()=>sendImg('seen')),
 'image-received':()=>chat(2),
 'image-viewer':()=>chat(2,()=>$('#msgs .imgw').click()),
 'product-card':()=>chat(1,()=>view($('#msgs .pc'))),
 'voice-recording':()=>chat(1,()=>startRec(),300),
 'voice-message':()=>chat(3),
 'doc-message':()=>chat(4),
 'sticker-unsupported':()=>chat(5),
 'info-sheet':()=>chat(1,()=>infoSheet(own())),
 'forward-sheet':()=>chat(1,()=>fwdSheet(own())),
 'window-closed':()=>chat(6),
 'chat-offline':()=>chat(1,()=>$('#cNet').click(),300),
 'send-failed':()=>chat(1,()=>{const m={id:uid++,from:'s',type:'text',text:'ঠিক আছে, পাঠাচ্ছি',ts:Date.now(),st:'failed'};cur.msgs.push(m);appendMsg(m);view(rowOf(m))}),
 'composer-typing':()=>chat(1,()=>{inp.value='জি, আজকেই পাঠিয়ে দিচ্ছি';autosize();syncSend()},300),
 'profile-regular':()=>chat(1,()=>openProfile(),350),
 'profile-orders':()=>chat(1,()=>{openProfile();later(()=>{const bd=$('#pfBody');bd.scrollTop+=$('#pfOrders').getBoundingClientRect().top-bd.getBoundingClientRect().top-8},250)},350),
 'profile-risky':()=>chat(2,()=>openProfile(),350),
 'profile-new':()=>chat(7,()=>openProfile(),350),
 'profile-lookers':()=>chat(5,()=>openProfile(),350),
 'profile-first-order':()=>chat(6,()=>openProfile(),350),
 'profile-light':()=>{$('#ph').classList.add('light');chat(1,()=>openProfile(),350)},
 'chat-light':()=>{$('#ph').classList.add('light');chat(1)},
 'list-light':()=>$('#ph').classList.add('light')};
 (A[k]||A.list)()};
renderList();updNet();syncSend();
setInterval(()=>{if(!$('#ph').classList.contains('chat'))renderList()},60000);
<\/script>
</body>
</html>

</script>
<script>
(function(){
 const IBS=[["list", "ইনবক্স তালিকা", "সব চ্যানেলের কথোপকথন একসাথে, নতুন কার্যকলাপ আগে। অ্যাভাটারের কোণের ছোট আইকন বলে মেসেজ কোথা থেকে এসেছে। উপরের ডানে ফিল্টার বাটন।"], ["list-filter", "ফিল্টার চিপ: অপঠিত", "সব, অপঠিত, আর ওয়ার্কস্পেসে যে চ্যানেল আছে। সংখ্যা সরাসরি চিপে।"], ["list-filter-channel", "ফিল্টার চিপ: চ্যানেল", "একটা চ্যানেল বাছলে শুধু সেই চ্যানেলের চ্যাট।"], ["list-filter-sheet", "ফিল্টার শিট", "চ্যানেল, স্ট্যাটাস (AI উত্তর দিচ্ছে / আপনি / উত্তরহীন), সময়। ফিল্টার চালু থাকলে বাটনে ডট।"], ["list-offline", "ইনবক্স অফলাইন", "ইন্টারনেট না থাকলে ব্যানার আর অ্যাম্বার স্ট্যাটাস। নেট এলে নিজে থেকে ঠিক হয়, আবার পেয়ার করতে হয় না।"], ["list-notif", "অ্যাপের ভেতরে নোটিফিকেশন", "অন্য চ্যাটে মেসেজ এলে উপরে ব্যানার, ৩.২ সেকেন্ড পরে সরে যায়। চাপলে সেই চ্যাট। অ্যাপ ব্যাকগ্রাউন্ডে থাকলে সিস্টেম নোটিফিকেশন।"], ["chat-open", "চ্যাট খোলা", "কাস্টমার বাঁদিকে, AI আর আপনি ডানদিকে। হেডারে কাস্টমারের নাম আর AI চালু/বন্ধ চিপ। নামে চাপলে কাস্টমারের পুরো তথ্য খোলে। কল, ভিডিও কল বা মেনু নেই।"], ["profile-regular", "কাস্টমারের তথ্য: ভরসাযোগ্য কাস্টমার", "হেডারে নামে চাপলে এই পাতা খোলে। উপরে নাম, চ্যানেল আর “কেমন কাস্টমার” ট্যাগ। নিচে সফল অর্ডারের হার, মোট অর্ডার, সফল, বাতিল, মোট কেনাকাটা, আর কতবার কথা বলে কতবার কিনেছেন।"], ["profile-orders", "অর্ডারের ইতিহাস (স্টোর অনুযায়ী)", "কাস্টমার কোন ওয়ার্কস্পেস বা স্টোর থেকে কী কিনেছেন, স্টোর ধরে আলাদা দলে। প্রতিটি অর্ডারে তারিখ, দাম আর অবস্থা। বাতিল হলে কারণও লেখা থাকে। প্রতি স্টোরে সর্বশেষ ৩টি দেখায়, বাকিগুলো “আরও দেখুন” চাপলে।"], ["profile-risky", "কাস্টমারের তথ্য: ঝুঁকিপূর্ণ কাস্টমার", "বেশিরভাগ অর্ডার বাতিল করলে লাল ট্যাগ আসে। সাথে বাতিলের কারণ আর কী করা ভালো তার ছোট পরামর্শ।"], ["profile-new", "কাস্টমারের তথ্য: নতুন কাস্টমার", "প্রথমবার মেসেজ করলে যে তথ্য এখনো নেই তা “০” বা ফাঁকা হিসেবে দেখানো হয় না, পুরো অংশটাই বাদ যায়। শুধু যা জানা আছে তা থাকে: চ্যানেল, প্রথম মেসেজ ও তার লেখা। অর্ডারের জায়গায় এক লাইনের ব্যাখ্যা।"], ["profile-lookers", "কাস্টমারের তথ্য: বারবার জিজ্ঞেস করেন, কেনেননি", "অনেকবার কথা বলেছেন কিন্তু কোনো অর্ডার হয়নি, এমন কাস্টমারের জন্য আলাদা ট্যাগ। কী কী নিয়ে জানতে চেয়েছেন তাও দেখায়।"], ["profile-first-order", "কাস্টমারের তথ্য: প্রথম অর্ডার চলছে", "ডেলিভারি না হওয়া পর্যন্ত সফল অর্ডারের হার দেখানো হয় না, কারণ তখন হিসাবটা অর্থহীন।"], ["chat-ai-typing", "AI লিখছে", "হেডারের নিচে সবুজ লেখা, আর তালিকার শেষে তিন ডটের বাবল। কাস্টমার টাইপ করছে কি না চ্যানেল জানায় না, তাই সেটা নেই।"], ["chat-select-customer", "মেসেজ ধরে রাখা: কাস্টমার", "উপরে রিঅ্যাকশন বার। হেডার ঢেকে রিপ্লাই, ফরওয়ার্ড নেই (কাস্টমারের মেসেজ), কপি, তথ্য।"], ["chat-reacted", "রিঅ্যাকশন দেওয়া", "মেসেজের নিচের কোণে ছোট চিপ। একই ইমোজিতে আবার চাপলে মুছে যায়।"], ["chat-select-own", "মেসেজ ধরে রাখা: AI বা আপনার", "রিঅ্যাকশন বার নেই। হেডারে রিপ্লাই, ফরওয়ার্ড, কপি, তথ্য।"], ["chat-swipe", "সোয়াইপ করে রিপ্লাই", "ডানে টানলে আইকন আসে, সীমা পেরোলে আইকন উল্টে যায় আর হালকা কাঁপুনি। ছেড়ে দিলে বাবল স্প্রিং করে ফেরে।"], ["chat-reply-bar", "রিপ্লাই বার", "কম্পোজারের উপরে উদ্ধৃতি বার। পাঠালে বাবলের ভেতরে উদ্ধৃতি, চাপলে আসল মেসেজে লাফ দিয়ে ফ্ল্যাশ।"], ["attach-sheet", "অ্যাটাচ শিট", "গ্যালারি, ক্যামেরা, ডকুমেন্ট, পণ্য।"], ["attach-sheet-ig", "অ্যাটাচ শিট: Instagram", "Instagram ডকুমেন্ট নেয় না, তাই বাটনটাই থাকে না। চ্যানেলের ক্ষমতা ব্যাকএন্ড থেকে আসে।"], ["product-picker", "পণ্য বাছাই", "ক্যাটালগ থেকে পণ্য। চাপলেই কার্ড চলে যায়।"], ["image-preview", "ছবি পাঠানোর আগে", "গ্যালারি থেকে একসাথে অনেক ছবি বাছা যায়। বাছার পর পুরো স্ক্রিনে প্রিভিউ। ক্যাপশন নেই (Messenger আর Instagram ছবিতে ক্যাপশন নেয় না)।"], ["images-preview", "একসাথে ৪টি ছবি: পাঠানোর আগে", "নিচে ছোট ছবির সারি। যেটায় চাপবেন সেটা বড় হয়ে দেখা যায়। ছোট × দিয়ে বাদ দেওয়া যায়, “+” দিয়ে আরও ছবি যোগ (সর্বোচ্চ ১০টি)। পাঠানোর বাটনে মোট ছবির সংখ্যা।"], ["images-2", "২টি ছবি পাঠানো", "চ্যাটে পাশাপাশি দুটি। সময় আর টিক নিচের ডানে, একই বাবলে।"], ["images-3", "৩টি ছবি পাঠানো", "উপরে একটি চওড়া ছবি, নিচে দুটি।"], ["images-4", "৪টি ছবি পাঠানো", "২×২ গ্রিড। পুরো গ্রুপের একটাই টিক, আলাদা আলাদা নয়।"], ["images-received-5", "কাস্টমার ৫টি ছবি পাঠালে", "গ্রিডে প্রথম ৪টি দেখায়, চতুর্থটির উপর বাকি ছবির সংখ্যা (“+১”)। চাপলে সব ছবি বড় করে দেখা যায়।"], ["images-viewer", "একাধিক ছবি বড় করে দেখা", "ডানে-বাঁয়ে টেনে বা তীরে চেপে পরের ছবি। উপরে নামের পাশে কত নম্বর ছবি তা লেখা (যেমন ৩/৫)।"], ["image-sending", "ছবি: পাঠানো হচ্ছে", "ছবির ভেতরে নিচের ডানে সময় আর ঘড়ি।"], ["image-sent", "ছবি: পাঠানো হয়েছে", "এক ধূসর টিক।"], ["image-delivered", "ছবি: পৌঁছেছে", "দুই ধূসর টিক, দ্বিতীয়টা পাশ থেকে স্লাইড করে আসে। Instagram-এ এই ধাপ নেই।"], ["image-seen", "ছবি: দেখেছে", "টিক নীল হয়ে যায় (৩০০ মি.সে. ক্রসফেড)। একই চার ধাপ টেক্সটেও।"], ["image-received", "কাস্টমারের ছবি", "বাঁদিকে, ২২০ ডিপি পর্যন্ত চওড়া। চাপলে বড় করে দেখা।"], ["image-viewer", "ছবি বড় করে দেখা", "কালো ব্যাকগ্রাউন্ড, উপরে পাঠকের নাম, পিঞ্চে জুম।"], ["product-card", "পণ্যের কার্ড", "AI বা আপনি পণ্য পাঠালে কাস্টমার যা দেখে তা-ই। কার্ডে চাপার মতো বাটন নেই।"], ["voice-recording", "ভয়েস রেকর্ডিং", "রেকর্ডিং শুরু হলে লেখার বক্স সরে গিয়ে পুরো জায়গায় রেকর্ডার আসে: বাঁয়ে ফেলে দেওয়ার বাটন, লাল ডট, সময় আর কথার সাথে চলা তরঙ্গ। ডানে পাঠানোর বাটন। ১ সেকেন্ডের কম হলে পাঠানো হয় না, টোস্টে জানায়।"], ["voice-message", "ভয়েস মেসেজ", "প্লে বাটন আর ২৬ বারের তরঙ্গ। চালালে বার একে একে ভরে।"], ["doc-message", "ডকুমেন্ট মেসেজ", "ফাইলের নাম আর সাইজ।"], ["sticker-unsupported", "স্টিকার ও অসমর্থিত মেসেজ", "স্টিকার বাবল ছাড়া। চেনা যায় না এমন মেসেজ লুকানো হয় না, নোট দেখায়।"], ["info-sheet", "মেসেজ তথ্য", "পাঠানো, পৌঁছেছে, দেখেছে, চ্যানেল, কে পাঠিয়েছে। সময় সত্যিকারের ইভেন্ট থেকে, আন্দাজে না।"], ["forward-sheet", "ফরওয়ার্ড শিট", "অন্য চ্যাট বেছে নিলে একই মেসেজের কপি যায়, “ফরওয়ার্ডেড” লেবেল নেই। ২৪ ঘণ্টা পেরোনো চ্যাট ধূসর।"], ["window-closed", "২৪ ঘণ্টা পার", "ইনপুটের জায়গায় নোটিশ। কাস্টমার নতুন মেসেজ দিলে নিজে থেকে খুলে যায়।"], ["chat-offline", "চ্যাট অফলাইন", "ব্যানার, ইনপুট ধূসর, উত্তর পাঠানো যায় না।"], ["send-failed", "পাঠানো ব্যর্থ", "লাল “!” আইকন, চাপলে আবার চেষ্টা।"], ["composer-typing", "লেখার সময় কম্পোজার", "লেখা শুরু করলে ক্যামেরা সরে যায়, মাইক ঘুরে পাঠানোর তীর হয়।"], ["chat-light", "চ্যাট: লাইট থিম", "একই লেআউট, শুধু রং বদলায়।"], ["list-light", "তালিকা: লাইট থিম", "একই লেআউট, শুধু রং বদলায়।"], ["profile-light", "কাস্টমারের তথ্য: লাইট থিম", "একই লেআউট, শুধু রং বদলায়।"]];
 const o=G.oth;delete G.oth;G.ib=['ইনবক্স ও চ্যাট (ধাপে ধাপে)',IBS];G.oth=o;gi.ib=0;IBS.forEach(x=>S[x[0]]='');
 const src=document.getElementById('inboxSrc').textContent.replace(/<\\\/script/g,'</script');
 const _d=draw;
 draw=function(){_d();if(gk!=='ib')return;const it=G.ib[1][gi.ib];
  el('stage').innerHTML='<iframe id="ibf" title="inbox" style="width:360px;height:720px;border:6px solid #2C2C29;border-radius:34px;background:#0F0F0E;display:block;margin:0 auto;max-width:100%"></iframe>';
  const f=el('ibf');f.onload=()=>{f.contentDocument.body.classList.add('embed');f.contentWindow.__step(it[0])};f.srcdoc=src};
 draw();
})();
</script>
</body>
</html>

`````
<!-- END SOURCE: ekmivo-app-design.html -->

## Appendix B — ekmivo-inbox.html (হুবহু)

<!-- BEGIN SOURCE: ekmivo-inbox.html -->
`````html
<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ekmivo ইনবক্স</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0}
body{background:#121211;color:#F1F0EA;font-family:"Hind Siliguri",system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:16px 8px 24px}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
.ph{--bg:#0F0F0E;--s1:#181817;--s2:#222220;--bd:#2C2C29;--tx:#F1F0EA;--mu:#8D8B84;--ok:#3DDC97;--wr:#F5B544;--er:#F2685B;--okbg:#12301F;--wrbg:#33260D;--erbg:#3A1B18;--cr:#F1F0EA;--ink:#111;--seen:#1E90E0;
--out:cubic-bezier(.2,.8,.2,1);--spring:cubic-bezier(.34,1.56,.64,1);
width:360px;max-width:100%;height:720px;max-height:calc(100vh - 90px);min-height:560px;position:relative;background:var(--bg);color:var(--tx);border-radius:34px;border:6px solid #2C2C29;overflow:hidden;font-size:14px}
.ph.light{--bg:#F4F3EE;--s1:#fff;--s2:#ECEAE2;--bd:#D9D8D1;--tx:#1B1B19;--mu:#6B6A64;--ok:#14935C;--wr:#B7791F;--er:#D6453A;--okbg:#DDF3E8;--wrbg:#FBEFD3;--erbg:#F9DEDA;--cr:#1B1B19;--ink:#fff}
@media(max-width:480px){body{padding:0}.ph{width:100vw;height:100vh;max-height:none;border:0;border-radius:0}}
svg.i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
svg.i.fill{fill:currentColor}
.scr{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--bg);transition:transform .32s var(--out);will-change:transform}
#sChat{transform:translateX(100%)}
.ph.chat #sChat{transform:none}.ph.chat #sInbox{transform:translateX(-24%)}
#dim{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .32s var(--out);z-index:3}
.ph.chat #dim{opacity:.35}
.top{display:flex;align-items:center;gap:10px;padding:16px 16px 8px;flex:none}
.logo{width:34px;height:34px;border-radius:10px;background:var(--cr);color:var(--ink);display:flex;align-items:center;justify-content:center;font-weight:500;font-size:16px;flex:none}
.ttl{font-size:17px;font-weight:500}
.chip{display:flex;align-items:center;gap:6px;font-size:11px;padding:4px 10px;border-radius:99px;border:1px solid var(--bd);background:var(--s1);white-space:nowrap;transition:color .25s}
.dot{width:7px;height:7px;border-radius:50%;background:var(--ok);animation:bl 1.6s infinite}
@keyframes bl{50%{opacity:.35}}
.chip.off{color:var(--wr)}.chip.off .dot{background:var(--wr);animation:none}.chip.sync .dot{background:var(--mu);animation:none}
.fb{position:relative;width:34px;height:34px;border-radius:10px;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;color:var(--mu);flex:none}
.fb u{position:absolute;top:-3px;right:-3px;min-width:15px;height:15px;border-radius:99px;background:var(--cr);color:var(--ink);font-size:10px;text-decoration:none;display:flex;align-items:center;justify-content:center;padding:0 3px;animation:pp .3s var(--spring)}
@keyframes pp{from{transform:scale(0)}}
.fl{display:flex;gap:6px;padding:4px 16px 8px;overflow-x:auto;scrollbar-width:none;flex:none}
.fl button{font-size:12px;padding:5px 12px;border-radius:99px;border:1px solid var(--bd);color:var(--mu);white-space:nowrap;transition:background .2s,color .2s,border-color .2s,transform .12s}
.fl button:active{transform:scale(.95)}
.fl button.on{background:var(--cr);color:var(--ink);border-color:var(--cr)}
.ban{margin:0 16px;padding:0 12px;border-radius:12px;background:var(--wrbg);display:flex;gap:10px;align-items:flex-start;flex:none;max-height:0;opacity:0;overflow:hidden;transition:max-height .3s var(--out),opacity .25s,margin .3s,padding .3s}
.ban.show{max-height:90px;opacity:1;margin-top:4px;padding:10px 12px}
.ban svg{color:var(--wr);margin-top:2px}.ban b{display:block;font-size:13px;font-weight:500;color:var(--wr)}.ban span{font-size:12px;color:var(--mu);line-height:1.5}
#list{flex:1;overflow-y:auto;scrollbar-width:none;position:relative;overscroll-behavior:contain}
#ptr{height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;transition:height .22s var(--out)}
.spin{width:20px;height:20px;border-radius:50%;border:2px solid var(--bd);border-top-color:var(--tx);animation:sp 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.cv{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--bd);cursor:pointer;transition:background .12s}
.cv:active{background:var(--s1)}
.cv.in{animation:rowin .45s var(--out)}
@keyframes rowin{from{opacity:0;transform:translateY(-12px);background:var(--s2)}}
.av{position:relative;width:40px;height:40px;border-radius:50%;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:500;flex:none}
.bd{position:absolute;right:-3px;bottom:-3px;width:18px;height:18px;border-radius:50%;border:2px solid var(--bg);display:flex;align-items:center;justify-content:center;color:#fff}
.bd svg.i{width:10px;height:10px;stroke-width:2.2}
.cm{flex:1;min-width:0}.cm b{display:block;font-size:14px;font-weight:500;line-height:1.25}
.cm span{display:block;font-size:12px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm span.ty{color:var(--ok)}
.cr{display:flex;flex-direction:column;align-items:flex-end;gap:5px;font-size:11px;color:var(--mu)}
.un{min-width:18px;height:18px;padding:0 6px;border-radius:99px;background:var(--cr);color:var(--ink);font-size:11px;font-weight:500;display:flex;align-items:center;justify-content:center}
.empty{padding:60px 30px;text-align:center;color:var(--mu);font-size:13px;line-height:1.7}
.empty button{margin-top:12px;padding:7px 16px;border-radius:99px;border:1px solid var(--bd);color:var(--tx);font-size:13px}
.nav{margin-top:auto;display:flex;border-top:1px solid var(--bd);padding:8px 12px 14px;justify-content:space-around;flex:none}
.ni{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;color:var(--mu);padding:4px 12px;border-radius:12px}
.ni.on{color:var(--tx);background:var(--s2)}
/* chat header */
.chh{position:relative;display:flex;align-items:center;gap:8px;padding:12px 10px 10px 6px;border-bottom:1px solid var(--bd);flex:none;background:var(--bg);z-index:5}
.ib{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:var(--mu);flex:none;transition:background .15s}
.ib:active{background:var(--s2)}
.chh .nm{flex:1;min-width:0;line-height:1.2}
.chh .nm b{display:block;font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chh .nm span{display:block;font-size:11px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .2s}
.chh .nm span.g{color:var(--ok)}
.aic{font-size:11px;padding:4px 10px;border-radius:99px;border:1px solid var(--bd);background:var(--s1);display:flex;gap:6px;align-items:center;white-space:nowrap;transition:transform .12s}
.aic:active{transform:scale(.94)}
.aic i{width:6px;height:6px;border-radius:50%;background:var(--ok);transition:background .2s}.aic.offai i{background:var(--mu)}
#selbar{position:absolute;inset:0;background:var(--s2);display:flex;align-items:center;gap:2px;padding:0 8px 0 6px;z-index:6;opacity:0;pointer-events:none;transform:translateY(-6px);transition:opacity .18s,transform .2s var(--out)}
#selbar.show{opacity:1;pointer-events:auto;transform:none}#selbar .sp{flex:1}
.mwrap{flex:1;min-height:0;position:relative}
#msgs{position:absolute;inset:0;overflow-y:auto;scrollbar-width:none;display:flex;flex-direction:column;padding:10px 0 8px;overscroll-behavior:contain}
.sday{align-self:center;font-size:11px;color:var(--mu);background:var(--s1);padding:3px 10px;border-radius:99px;margin:10px 0 6px}
.udiv{align-self:center;font-size:11px;color:var(--tx);background:var(--s2);padding:3px 12px;border-radius:99px;margin:10px 0 6px}
.mr{position:relative;display:flex;padding:1px 14px;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.mr.first{margin-top:7px}
.mr.l{justify-content:flex-start}.mr.r{justify-content:flex-end}
.mr.sel{background:color-mix(in srgb,var(--cr) 14%,transparent)}
.mr.flash{animation:fl 1.2s}@keyframes fl{0%,60%{background:color-mix(in srgb,var(--cr) 18%,transparent)}}
.rep{position:absolute;left:18px;top:50%;margin-top:-14px;width:28px;height:28px;border-radius:50%;background:var(--s2);color:var(--mu);display:flex;align-items:center;justify-content:center;opacity:0;transition:background .15s,color .15s}
.rep svg{width:16px;height:16px}
.bc{display:flex;flex-direction:column;max-width:78%;position:relative;will-change:transform}
.bc.back{transition:transform .38s var(--spring)}
.mr.l .bc{align-items:flex-start}.mr.r .bc{align-items:flex-end}
.who{display:none;font-size:10.5px;color:var(--mu);margin:2px 4px 3px}
.mr.first .who{display:block}
.bub{padding:9px 12px;border-radius:16px;font-size:13px;line-height:1.5;word-break:break-word;white-space:pre-wrap;position:relative;transition:transform .12s}
.mr.pressing .bub{transform:scale(.985)}
.mr.l .bub{background:var(--s1)}
.bub.ba{background:var(--s2)}
.bub.bs{background:var(--cr);color:var(--ink)}
.mr.l.last .bub{border-bottom-left-radius:5px}
.mr.r.last .bub{border-bottom-right-radius:5px}
.bub.bs .mt{opacity:.65}
.mt{float:right;margin:7px 0 -3px 10px;font-size:10px;color:var(--mu);display:inline-flex;gap:3px;align-items:center;line-height:1;white-space:nowrap}
.mrow{text-align:right;margin-top:3px;height:12px}.mrow .mt{float:none;margin:0}
.tk{display:inline-flex;align-items:center}.tk svg{width:13px;height:13px;stroke-width:2.2}
.dbl{display:inline-flex;color:inherit;transition:color .3s}.dbl svg+svg{margin-left:-8px}.dbl.seen{color:var(--seen)}
.bub.bs .dbl.seen{color:var(--seen);opacity:1}
.tk.pop{animation:tp .4s var(--spring)}.tk.pop .t2{animation:t2 .24s var(--out)}
@keyframes tp{from{transform:scale(.4);opacity:.2}}@keyframes t2{from{transform:translateX(-7px);opacity:0}}
.fail{width:13px;height:13px;border-radius:50%;background:var(--er);color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.mr.new.out .bc{animation:bout .3s var(--spring);transform-origin:bottom right}
.mr.new.in .bc{animation:bin .24s var(--out);transform-origin:bottom left}
@keyframes bout{from{opacity:0;transform:translateY(18px) scale(.9)}}
@keyframes bin{from{opacity:0;transform:translateY(8px) scale(.96)}}
.qt{background:rgba(127,127,127,.16);border-left:3px solid var(--ok);border-radius:8px;padding:5px 8px;margin:-2px -4px 6px;font-size:12px;cursor:pointer;user-select:none}
.qt b{display:block;font-size:11px;font-weight:500;color:var(--ok)}.qt span{display:block;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.rx{align-self:flex-end;margin:-8px 8px 0 0;background:var(--s2);border:1px solid var(--bd);border-radius:99px;padding:0 6px;font-size:13px;line-height:20px;z-index:1;animation:pp .32s var(--spring)}
.mr.l .rx{align-self:flex-start;margin:-8px 0 0 8px}
.stk{width:120px;height:120px;display:flex;align-items:center;justify-content:center;font-size:76px}
.ovm{position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.5);color:#fff;border-radius:99px;padding:2px 7px;font-size:10px;display:flex;gap:3px;align-items:center}
.ovm .tk{color:#fff}.ovm .dbl.seen{color:#53C7FF}
.imgw{position:relative;border-radius:13px;overflow:hidden;cursor:pointer;min-width:150px}
.imgw img{display:block;width:220px;max-width:100%;max-height:260px;object-fit:cover;animation:fi .35s}
@keyframes fi{from{opacity:0}}
.imgw .ph_{width:220px;max-width:100%;height:150px;background:linear-gradient(135deg,#8a6a4f,#3b2a20);display:flex;align-items:center;justify-content:center;font-size:54px}
.gw{display:grid;gap:2px;width:220px;max-width:100%}.gw .gt{position:relative;overflow:hidden;min-width:0}
.gw .gt img{width:100%;height:100%;max-height:none;object-fit:cover;display:block}
.g2{grid-template-columns:1fr 1fr;grid-auto-rows:150px}.g3{grid-template-columns:1fr 1fr;grid-template-rows:150px 100px}.g3 .gt:first-child{grid-column:1/-1}.g4{grid-template-columns:1fr 1fr;grid-auto-rows:108px}
.gw .more{position:absolute;inset:0;background:rgba(0,0,0,.5);color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center}
#pvw img#pImg{bottom:150px;max-height:calc(100% - 210px)}
.pth{position:absolute;left:0;right:0;bottom:76px;display:flex;gap:8px;padding:0 16px;overflow-x:auto;z-index:2;scrollbar-width:none}.pth::-webkit-scrollbar{display:none}
.pth button{position:relative;width:52px;height:52px;border-radius:10px;overflow:hidden;flex:none;border:2px solid transparent;opacity:.65;color:#fff;font-size:24px;line-height:48px;text-align:center;transition:opacity .15s,border-color .15s}
.pth button.on{border-color:#fff;opacity:1}.pth button.add{border:1px dashed #777;opacity:1}
#pvw .pth img{position:static;display:block;width:100%;height:100%;object-fit:cover;margin:0;max-height:none}
.pth .rm{position:absolute;top:1px;right:1px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.7);font-size:12px;line-height:16px}
.sendb .cnt{position:absolute;right:-4px;top:-4px;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;background:var(--ink);color:var(--cr);border:1.5px solid var(--cr);font-size:11px;font-weight:500;line-height:15px;text-align:center;display:none}.sendb .cnt.on{display:block}
.vnav{position:absolute;top:50%;width:40px;height:40px;margin-top:-20px;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;z-index:3;display:flex;align-items:center;justify-content:center}#vPrev{left:10px}#vNext{right:10px}#vNext svg{transform:rotate(180deg)}
.bub.im{padding:3px}
.pc{padding:0;width:210px;overflow:hidden}
.pimg{height:110px;display:flex;align-items:center;justify-content:center;font-size:54px}
.pi{padding:8px 12px 0}.pi b{display:block;font-size:13px;font-weight:500}.pi span{font-size:11.5px;opacity:.7}.pp{font-weight:500;margin-top:2px}
.pc .mrow{padding:6px 10px 6px;margin:0}
.vn{display:flex;align-items:center;gap:8px;min-width:190px}
.pl{width:32px;height:32px;border-radius:50%;background:rgba(127,127,127,.25);display:flex;align-items:center;justify-content:center;flex:none}
.pl svg{width:14px;height:14px}
.wf{display:flex;align-items:center;gap:2px;height:26px;flex:1}.wf i{width:2.5px;border-radius:2px;background:currentColor;opacity:.3;transition:opacity .15s}.wf i.f{opacity:1}
.vd{font-size:11px;opacity:.7}
.fileb{display:flex;align-items:center;gap:10px;min-width:170px}.fileb .fi{width:34px;height:34px;border-radius:9px;background:rgba(127,127,127,.25);display:flex;align-items:center;justify-content:center}
.fileb b{font-weight:500;font-size:13px;display:block;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fileb span{font-size:11px;opacity:.7}
.unsup{color:var(--mu);font-style:italic}
#typ{display:none;padding:1px 14px;margin-top:7px}#typ.show{display:flex;animation:bin .24s var(--out)}
#typ .bub{border-bottom-right-radius:5px}
.tdots{display:flex;gap:4px;padding:5px 2px}.tdots i{width:7px;height:7px;border-radius:50%;background:var(--mu);animation:td 1.2s infinite}
.tdots i:nth-child(2){animation-delay:.15s}.tdots i:nth-child(3){animation-delay:.3s}
@keyframes td{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}
#fab{position:absolute;right:14px;bottom:10px;width:36px;height:36px;border-radius:50%;background:var(--s2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;color:var(--tx);opacity:0;transform:translateY(10px) scale(.8);pointer-events:none;transition:opacity .2s,transform .25s var(--spring);z-index:4}
#fab.show{opacity:1;transform:none;pointer-events:auto}
#fab svg{transform:rotate(-90deg)}
#fab u{position:absolute;top:-7px;right:-3px;min-width:18px;height:18px;border-radius:99px;background:var(--cr);color:var(--ink);font-size:11px;font-weight:500;text-decoration:none;display:none;align-items:center;justify-content:center;padding:0 5px}
#fab.has u{display:flex}
#rbar{margin:0 12px;padding:0 10px;background:var(--s1);border-radius:12px 12px 0 0;border-left:3px solid var(--ok);display:flex;align-items:center;gap:8px;flex:none;max-height:0;opacity:0;overflow:hidden;transition:max-height .22s var(--out),opacity .18s,padding .22s}
#rbar.show{max-height:56px;opacity:1;padding:8px 10px}
#rbar div{flex:1;min-width:0;font-size:12px}#rbar b{display:block;color:var(--ok);font-weight:500;font-size:11px}#rbar span{display:block;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.comp{position:relative;display:flex;align-items:flex-end;gap:8px;padding:8px 12px 14px;border-top:1px solid var(--bd);flex:none}
.inw{flex:1;min-height:40px;border-radius:20px;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:flex-end;padding:0 4px 0 12px;min-width:0}
.inw textarea{flex:1;min-width:0;background:none;border:0;outline:0;resize:none;color:var(--tx);font:inherit;font-size:13px;line-height:1.5;padding:9px 4px;max-height:96px;height:38px;transition:height .12s}
.inw textarea::placeholder{color:var(--mu)}
.inw .ib{width:32px;height:38px;border-radius:0}
#bCam{transition:width .2s var(--out),opacity .15s;overflow:hidden}#bCam.hide{width:0;opacity:0;pointer-events:none}
.sendb{position:relative;width:40px;height:40px;border-radius:50%;background:var(--cr);color:var(--ink);flex:none;transition:transform .15s var(--spring)}
.sendb:active{transform:scale(.88)}
.sendb svg{position:absolute;left:10px;top:10px;transition:transform .28s var(--spring),opacity .18s}
.sendb .s_mic{opacity:1}.sendb .s_snd{opacity:0;transform:rotate(-90deg) scale(.5)}
.sendb.has .s_mic{opacity:0;transform:rotate(90deg) scale(.5)}.sendb.has .s_snd{opacity:1;transform:none}
.sendb.recm .s_mic{opacity:0}.sendb.recm .s_snd{opacity:1;transform:none}
.comp.dis .inw,.comp.dis .sendb{opacity:.45;pointer-events:none}
.wcl{display:none;flex:1;align-items:flex-start;gap:10px;background:var(--s1);border:1px solid var(--bd);border-radius:14px;padding:10px 12px}
.wcl svg{color:var(--mu);margin-top:2px}.wcl b{display:block;font-size:13px;font-weight:500}.wcl span{font-size:12px;color:var(--mu);line-height:1.5}
.comp.closed .inw,.comp.closed .sendb{display:none}.comp.closed .wcl{display:flex}
.rec{order:-1;display:none;flex:1;min-width:0;height:40px;border-radius:20px;background:var(--s1);border:1px solid var(--bd);align-items:center;gap:8px;padding:0 14px 0 3px;font-size:13px}
.comp.recing .inw{display:none}.comp.recing .rec{display:flex;animation:bin .22s var(--out)}
.rec .ib{width:34px;height:34px;color:var(--er)}.rec>i{width:9px;height:9px;border-radius:50%;background:var(--er);animation:bl 1s infinite;flex:none}#recT{min-width:32px;flex:none}.rec .sp{flex:1;min-width:0;display:flex;gap:2px;align-items:center;justify-content:flex-end;height:26px;overflow:hidden}.rec .sp b{width:2.5px;flex:none;border-radius:2px;background:var(--tx);opacity:.55;transition:height .09s}
@keyframes wv{from{height:4px}to{height:18px}}
.ov{position:absolute;inset:0;z-index:30;visibility:hidden;transition:visibility 0s .3s}
.ov.show{visibility:visible;transition:none}
.bk{position:absolute;inset:0;background:rgba(0,0,0,.5);opacity:0;transition:opacity .25s}.ov.show .bk{opacity:1}
.sheet{position:absolute;left:0;right:0;bottom:0;background:var(--s2);border-radius:24px 24px 0 0;padding:16px 18px 22px;border-top:1px solid var(--bd);transform:translateY(100%);transition:transform .32s var(--out);max-height:85%;overflow-y:auto;scrollbar-width:none}
.ov.show .sheet{transform:none}
.sheet h4{margin:0 0 12px;font-size:15px;font-weight:500;display:flex;align-items:center}
.sheet h4 button{margin-left:auto;font-size:12px;color:var(--mu)}
.sl{font-size:11px;color:var(--mu);margin:12px 0 6px}
.pills{display:flex;flex-wrap:wrap;gap:6px}.pills button{font-size:12px;padding:5px 12px;border-radius:99px;border:1px solid var(--bd);color:var(--mu);transition:background .2s,color .2s,border-color .2s,transform .12s}.pills button:active{transform:scale(.95)}.pills button.on{background:var(--cr);color:var(--ink);border-color:var(--cr)}
.btn{display:flex;align-items:center;justify-content:center;height:46px;border-radius:14px;font-size:15px;font-weight:500;width:100%;background:var(--cr);color:var(--ink);margin-top:16px;transition:opacity .12s}.btn:active{opacity:.88}
.grid4{display:flex;justify-content:space-around;text-align:center;font-size:12px;color:var(--mu)}
.grid4 div{display:flex;flex-direction:column;align-items:center;gap:6px}.grid4 button{width:52px;height:52px;border-radius:50%;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;color:var(--tx);transition:transform .15s var(--spring)}.grid4 button:active{transform:scale(.9)}
.ir{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--bd);font-size:13px}.ir:first-of-type{border-top:0}.ir span.v{margin-left:auto;color:var(--mu);font-size:12px}
.lr{display:flex;align-items:center;gap:12px;padding:8px 0;cursor:pointer;border-top:1px solid var(--bd)}
#rxbar{position:absolute;z-index:20;display:flex;background:var(--s2);border:1px solid var(--bd);border-radius:99px;padding:4px 8px;gap:2px;opacity:0;pointer-events:none;transform:scale(.7);transition:opacity .15s,transform .22s var(--spring)}
#rxbar.show{opacity:1;pointer-events:auto;transform:none}#rxbar button{font-size:22px;width:34px;height:34px;border-radius:50%}
#rxbar.show button{animation:pp .3s var(--spring) backwards}
#rxbar button:active{transform:scale(1.3)!important}
#toast{position:absolute;left:50%;bottom:96px;transform:translate(-50%,10px);background:var(--cr);color:var(--ink);font-size:12.5px;padding:8px 14px;border-radius:99px;opacity:0;pointer-events:none;transition:.25s;z-index:60;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}
#toast.show{opacity:1;transform:translate(-50%,0)}
#notif{position:absolute;left:10px;right:10px;top:10px;z-index:55;background:var(--s2);border:1px solid var(--bd);border-radius:16px;padding:10px 12px;display:flex;gap:10px;align-items:center;transform:translateY(-130%);transition:transform .38s var(--spring);cursor:pointer}
#notif.show{transform:none}#notif b{font-size:13px;font-weight:500;display:block}#notif span{font-size:12px;color:var(--mu);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#notif div{min-width:0;flex:1}
#viewer,#pvw{background:#000;color:#fff;z-index:40;opacity:0;transition:opacity .22s,visibility 0s .22s}
#viewer.show,#pvw.show{opacity:1}
#viewer .body{position:absolute;inset:0;transform:scale(.92);transition:transform .3s var(--out)}#viewer.show .body{transform:none}
#viewer img,#pvw img{position:absolute;left:0;right:0;top:56px;bottom:90px;margin:auto;max-width:100%;max-height:calc(100% - 150px)}
#viewer .vph{position:absolute;left:0;right:0;top:56px;bottom:90px;margin:auto;width:280px;height:200px;background:linear-gradient(135deg,#8a6a4f,#3b2a20);display:flex;align-items:center;justify-content:center;font-size:80px;border-radius:8px}
.vt{position:absolute;top:0;left:0;right:0;padding:14px 8px;display:flex;align-items:center;gap:8px;color:#fff;z-index:2}
.pvb{position:absolute;left:0;right:0;bottom:0;padding:10px 16px 18px;display:flex;justify-content:flex-end;z-index:2}
.ctl{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:14px;max-width:420px}
.ctl button{font-size:12.5px;padding:6px 12px;border-radius:99px;border:1px solid #34332F;background:#1E1E1C;color:#F1F0EA}
.ctl p{width:100%;text-align:center;margin:0;font-size:11.5px;color:#9A988F}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01s!important;transition-duration:.01s!important}}
body.embed{background:transparent;padding:0;min-height:0}body.embed .ctl{display:none}

/* header tap target */
.chi{display:flex;align-items:center;gap:8px;flex:1;min-width:0;text-align:left;border-radius:12px;padding:2px 6px 2px 2px;transition:background .15s}
.chi:active{background:var(--s2)}
/* customer profile */
#sProf{transform:translateX(100%)}
#sChat{transition:transform .32s var(--out),filter .32s}
.ph.prof #sProf{transform:none}.ph.prof #sChat{transform:translateX(-24%);filter:brightness(.7)}
.pfh{display:flex;align-items:center;gap:6px;padding:12px 10px 10px 6px;border-bottom:1px solid var(--bd);flex:none}.pfh b{font-size:15px;font-weight:500}
#pfBody{flex:1;overflow-y:auto;scrollbar-width:none;padding-bottom:24px;overscroll-behavior:contain}
.hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:18px 20px 6px}
.hero .av{width:76px;height:76px;font-size:26px}.hero .bd{width:24px;height:24px;right:-2px;bottom:-2px}.hero .bd svg.i{width:13px;height:13px}
.hero h2{margin:12px 0 2px;font-size:19px;font-weight:500}.hero .sub{font-size:12.5px;color:var(--mu)}
.tag{display:inline-flex;align-items:center;margin-top:10px;font-size:12px;padding:4px 12px;border-radius:99px}
.tag.ok{background:var(--okbg);color:var(--ok)}.tag.wr{background:var(--wrbg);color:var(--wr)}.tag.er{background:var(--erbg);color:var(--er)}.tag.mu{background:var(--s2);color:var(--tx)}
.qa{display:flex;justify-content:center;gap:10px;padding:14px 16px 4px}
.qa button{flex:1;max-width:104px;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 4px;border-radius:14px;background:var(--s1);border:1px solid var(--bd);font-size:11.5px;color:var(--tx);transition:transform .12s}
.qa button:active{transform:scale(.95)}.qa svg{color:var(--mu)}
.pfc{margin:10px 12px 0;padding:14px;border-radius:18px;background:var(--s1);border:1px solid var(--bd)}
.pfc h5{margin:0 0 10px;font-size:12px;font-weight:500;color:var(--mu)}
.vd2{display:flex;align-items:center;gap:14px}.vd2 b{display:block;font-size:14.5px;font-weight:500;line-height:1.4}.vd2 span{font-size:12px;color:var(--mu)}
.ring{--p:0;--c:var(--ok);width:68px;height:68px;border-radius:50%;background:conic-gradient(var(--c) calc(var(--p)*1%),var(--s2) 0);display:flex;align-items:center;justify-content:center;flex:none}
.ring.wr{--c:var(--wr)}.ring.er{--c:var(--er)}
.ring i{font-style:normal;width:54px;height:54px;border-radius:50%;background:var(--s1);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:500}
.rs{margin:12px 0 0;padding:0;list-style:none;font-size:12.5px;line-height:1.55}
.rs li{display:flex;gap:8px;padding:3px 0}.rs li:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--mu);margin-top:7px;flex:none}
.rs li.ok:before{background:var(--ok)}.rs li.er:before{background:var(--er)}.rs li.wr:before{background:var(--wr)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:8px;margin-bottom:10px}
.tile{background:var(--s2);border-radius:12px;padding:10px 4px;text-align:center}.tile b{display:block;font-size:18px;font-weight:500}.tile span{font-size:11px;color:var(--mu)}
.tile.ok b{color:var(--ok)}.tile.er b{color:var(--er)}.tile.wr b{color:var(--wr)}
.kv{display:flex;align-items:flex-start;gap:12px;padding:9px 0;border-top:1px solid var(--bd);font-size:13px}.kv:first-of-type{border-top:0;padding-top:0}.kv:last-child{padding-bottom:0}
.kv .k{color:var(--mu);flex:none}.kv .v{margin-left:auto;text-align:right;min-width:0;word-break:break-word}
.emp2{display:flex;gap:12px;align-items:flex-start}.emp2 .ic{width:40px;height:40px;border-radius:12px;background:var(--s2);display:flex;align-items:center;justify-content:center;flex:none;color:var(--mu)}
.emp2 b{display:block;font-size:14px;font-weight:500;margin-bottom:2px}.emp2 span{font-size:12.5px;color:var(--mu);line-height:1.6}
.stg{margin-top:14px}.stg:first-of-type{margin-top:0}
.sth{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;margin-bottom:2px}.sth svg{color:var(--mu);width:16px;height:16px}.sth span{margin-left:auto;font-size:11.5px;color:var(--mu);font-weight:400}
.ord{display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--bd)}.stg .sth+.ord{margin-top:6px}
.ord .l{flex:1;min-width:0}.ord .l b{display:block;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ord .l span{display:block;font-size:11.5px;color:var(--mu)}.ord .l span.why{color:var(--er);margin-top:1px}
.ord .r{text-align:right;flex:none;font-size:13px}.ord .r em{display:block;width:max-content;margin:3px 0 0 auto;font-style:normal;font-size:11px;padding:2px 8px;border-radius:99px}
.ord .r em.ok{background:var(--okbg);color:var(--ok)}.ord .r em.er{background:var(--erbg);color:var(--er)}.ord .r em.wr{background:var(--wrbg);color:var(--wr)}.ord .r em.mu{background:var(--s2);color:var(--tx)}
.stg:not(.open) .ord.x{display:none}
.mo{display:block;width:100%;padding:8px 0 0;font-size:12px;color:var(--mu);text-align:center;border-top:1px solid var(--bd)}
.chips2{display:flex;flex-wrap:wrap;gap:6px}.chips2 span{font-size:12px;padding:4px 10px;border-radius:99px;background:var(--s2)}
.fmsg{font-size:13px;line-height:1.55;background:var(--s2);border-radius:12px;padding:9px 12px;margin-top:2px;word-break:break-word}
.nt{width:100%;min-height:64px;background:var(--s2);border:1px solid var(--bd);border-radius:12px;padding:10px;color:var(--tx);font:inherit;font-size:13px;line-height:1.5;resize:none;outline:0;display:block}
.nt::placeholder{color:var(--mu)}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<symbol id="act" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></symbol>
<symbol id="set" viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></symbol>
<symbol id="msg" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></symbol>
<symbol id="wa" viewBox="0 0 24 24"><path d="M12 4a8 8 0 00-6.9 12L4 20l4.1-1.1A8 8 0 1012 4z"/><path d="M9.5 9.5c.3 2 2.5 4.2 4.5 4.5"/></symbol>
<symbol id="ig" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="4"/><circle cx="12" cy="12" r="3.2"/><path d="M16.5 7.5h0"/></symbol>
<symbol id="ms" viewBox="0 0 24 24"><path d="M13 3L6 13h5l-1 8 7-10h-5z"/></symbol>
<symbol id="back" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></symbol>
<symbol id="snd" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="flt" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></symbol>
<symbol id="alt" viewBox="0 0 24 24"><path d="M12 4l9 16H3zM12 10v4M12 17h0"/></symbol>
<symbol id="clip" viewBox="0 0 24 24"><path d="M20 11l-8 8a5 5 0 01-7-7l8-8a3.5 3.5 0 015 5l-8 8a2 2 0 01-3-3l7-7"/></symbol>
<symbol id="cam" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></symbol>
<symbol id="mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></symbol>
<symbol id="chk" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></symbol>
<symbol id="x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
<symbol id="rep" viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M4 12h10a6 6 0 016 6v1"/></symbol>
<symbol id="fwd" viewBox="0 0 24 24"><path d="M15 7l5 5-5 5M20 12H10a6 6 0 00-6 6v1"/></symbol>
<symbol id="copy" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/></symbol>
<symbol id="info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/></symbol>
<symbol id="play" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></symbol>
<symbol id="pause" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></symbol>
<symbol id="img" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M3 17l5-4 4 3 3-2 6 4"/></symbol>
<symbol id="doc" viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7zM14 3v5h5"/></symbol>
<symbol id="bag" viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6zM9 8a3 3 0 016 0"/></symbol>
<symbol id="clk" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
<symbol id="trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></symbol>
</svg>

<div class="ph" id="ph">
  <div class="scr" id="sInbox">
    <div class="top"><div class="logo">e.</div><div class="ttl">ইনবক্স</div><div id="netChip" class="chip" style="margin-left:auto"><i class="dot"></i>লাইভ</div><button class="fb" id="fBtn" aria-label="ফিল্টার"><svg class="i"><use href="#flt"/></svg></button></div>
    <div class="fl" id="chips"></div>
    <div class="ban" id="inBan"><svg class="i"><use href="#alt"/></svg><div><b>ইন্টারনেট নেই</b><span>নেট এলে নতুন মেসেজ আসবে। এখন উত্তর পাঠানো যাবে না।</span></div></div>
    <div id="list"><div id="ptr"><div class="spin"></div></div><div id="rows"></div></div>
    <div class="nav"><div class="ni on"><svg class="i"><use href="#msg"/></svg>ইনবক্স</div><div class="ni"><svg class="i"><use href="#act"/></svg>SMS</div><div class="ni"><svg class="i"><use href="#set"/></svg>সেটিংস</div></div>
    <div id="dim"></div>
  </div>

  <div class="scr" id="sChat">
    <div class="chh" id="chh">
      <button class="ib" id="bBack" aria-label="ফিরে যান"><svg class="i"><use href="#back"/></svg></button>
      <button class="chi" id="chInfo" aria-label="কাস্টমারের তথ্য"><div class="av" id="chAv" style="width:34px;height:34px;font-size:13px"></div><div class="nm"><b id="chName"></b><span id="chSub"></span></div></button>
      <button class="aic" id="aiT"><i></i><span>AI চালু</span></button>
      <div id="selbar">
        <button class="ib" data-a="close" aria-label="বন্ধ"><svg class="i"><use href="#x"/></svg></button><span class="sp"></span>
        <button class="ib" data-a="reply" aria-label="রিপ্লাই"><svg class="i"><use href="#rep"/></svg></button>
        <button class="ib" data-a="fwd" aria-label="ফরওয়ার্ড"><svg class="i"><use href="#fwd"/></svg></button>
        <button class="ib" data-a="copy" aria-label="কপি"><svg class="i"><use href="#copy"/></svg></button>
        <button class="ib" data-a="info" aria-label="তথ্য"><svg class="i"><use href="#info"/></svg></button>
      </div>
    </div>
    <div class="ban" id="chBan"><svg class="i"><use href="#alt"/></svg><div><b>ইন্টারনেট নেই</b><span>নেট এলে নতুন মেসেজ আসবে। এখন উত্তর পাঠানো যাবে না।</span></div></div>
    <div class="mwrap">
      <div id="msgs"><div class="mr r" id="typ"><div class="bc"><div class="who" style="display:block">AI</div><div class="bub ba"><div class="tdots"><i></i><i></i><i></i></div></div></div></div></div>
      <button id="fab" aria-label="নিচে যান"><svg class="i"><use href="#back"/></svg><u id="fabN"></u></button>
    </div>
    <div id="rbar"><div><b id="rbN"></b><span id="rbT"></span></div><button class="ib" id="rbX" aria-label="বাতিল"><svg class="i"><use href="#x"/></svg></button></div>
    <div class="comp" id="comp">
      <div class="inw">
        <textarea id="inp" rows="1" placeholder="মেসেজ লিখুন…"></textarea>
        <button class="ib" id="bClip" aria-label="সংযুক্ত করুন"><svg class="i"><use href="#clip"/></svg></button>
        <button class="ib" id="bCam" aria-label="ক্যামেরা"><svg class="i"><use href="#cam"/></svg></button>
      </div>
      <button class="sendb" id="bSend" aria-label="পাঠান"><svg class="i s_mic"><use href="#mic"/></svg><svg class="i s_snd"><use href="#snd"/></svg></button>
      <div class="wcl"><svg class="i"><use href="#clk"/></svg><div><b>২৪ ঘণ্টা পার হয়ে গেছে</b><span>কাস্টমার নতুন মেসেজ দিলে আবার উত্তর দেওয়া যাবে।</span></div></div>
      <div class="rec"><button class="ib" id="recX" aria-label="বাতিল"><svg class="i"><use href="#trash"/></svg></button><i></i><span id="recT">০:০০</span><div class="sp" id="recW"></div></div>
    </div>
  </div>

  <div class="scr" id="sProf">
    <div class="pfh"><button class="ib" id="pfBack" aria-label="ফিরে যান"><svg class="i"><use href="#back"/></svg></button><b>কাস্টমারের তথ্য</b></div>
    <div id="pfBody"></div>
  </div>

  <div id="rxbar"></div>
  <div id="notif"><div class="av" id="nAv" style="width:34px;height:34px;font-size:13px"></div><div><b id="nT"></b><span id="nB"></span></div></div>
  <div class="ov" id="shw"><div class="bk" id="shBk"></div><div class="sheet" id="sh"></div></div>
  <div class="ov" id="viewer"><div class="vt"><button class="ib" id="vX" style="color:#fff"><svg class="i"><use href="#back"/></svg></button><b id="vN" style="font-weight:500"></b></div><div class="body" id="vB"></div><button class="vnav" id="vPrev" aria-label="আগের"><svg class="i"><use href="#back"/></svg></button><button class="vnav" id="vNext" aria-label="পরের"><svg class="i"><use href="#back"/></svg></button></div>
  <div class="ov" id="pvw"><div class="vt"><button class="ib" id="pX" style="color:#fff"><svg class="i"><use href="#x"/></svg></button><b id="pC" style="font-weight:500;font-size:13px;margin-left:auto;padding-right:8px"></b></div><img id="pImg" alt=""><div class="pth" id="pTh"></div><div class="pvb"><button class="sendb has" id="pSend" aria-label="পাঠান"><svg class="i s_snd"><use href="#snd"/></svg><span class="cnt" id="pCnt"></span></button></div></div>
  <div id="toast"></div>
</div>
<input type="file" id="fGal" accept="image/*" multiple hidden>
<input type="file" id="fCam" accept="image/*" capture="environment" hidden>
<input type="file" id="fDoc" hidden>

<div class="ctl">
  <button id="cNet">ইন্টারনেট বন্ধ করুন</button>
  <button id="cSim">কাস্টমারের মেসেজ আসুক</button>
  <button id="cOther">অন্য চ্যাটে নতুন মেসেজ</button>
  <button id="cReact">কাস্টমার রিঅ্যাক্ট করুক</button>
  <button id="cImgS">ছবি পাঠান (ডেমো)</button>
  <button id="cImgC">কাস্টমার ছবি পাঠাক</button>
  <button id="cImgM">একসাথে ৪টি ছবি পাঠান</button>
  <button id="cImgCM">কাস্টমার ৫টি ছবি পাঠাক</button>
  <button id="cTheme">লাইট থিম</button>
  <p>উপরের বাটনগুলো শুধু ডেমোর জন্য। আসল অ্যাপে এগুলো ব্যাকএন্ড ইভেন্ট থেকে আসবে।</p>
</div>

<script>
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const bn=n=>String(n).replace(/\d/g,d=>'০১২৩৪৫৬৭৮৯'[d]);
const I=(n,c='')=>`<svg class="i ${c}"><use href="#${n}"/></svg>`;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CH={wa:{n:'WhatsApp',c:'#25D366'},ig:{n:'Instagram',c:'#C13584'},ms:{n:'Messenger',c:'#0A7CFF'}};
/* what each channel's API really supports */
const CAP={wa:{doc:1,dlv:1},ms:{doc:1,dlv:1},ig:{doc:0,dlv:0}};
const badge=ch=>`<span class="bd" style="background:${CH[ch].c}">${I(ch)}</span>`;
const hm=ts=>{const d=new Date(ts);return bn(String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'))};
const mmss=s=>bn(Math.floor(s/60)+':'+String(s%60).padStart(2,'0'));
const rel=ts=>{const m=Math.floor((Date.now()-ts)/60000);if(m<1)return'এখন';if(m<60)return bn(m)+' মি';const h=Math.floor(m/60);if(h<24)return bn(h)+' ঘণ্টা';const d=Math.floor(h/24);return d==1?'গতকাল':bn(d)+' দিন'};
const dayLbl=ts=>{const a=new Date(ts).setHours(0,0,0,0),b=new Date().setHours(0,0,0,0),d=Math.round((b-a)/864e5);return d==0?'আজ':d==1?'গতকাল':bn(new Date(ts).getDate())+'/'+bn(new Date(ts).getMonth()+1)};
const now=Date.now(),MIN=60000;let uid=1;
const mk=(from,text,ago,x={})=>({id:uid++,from,type:'text',text,ts:now-ago*MIN,...(from==='c'?{}:{st:'seen'}),...x});
const PROD=[{name:'কটন ক্যাজুয়াল শার্ট',price:'১,২৫০',sizes:'M, L, XL',emo:'👕',g:['#4b6cb7','#182848']},{name:'লেদার স্নিকার',price:'২,৮০০',sizes:'৪০, ৪১, ৪২',emo:'👟',g:['#c0392b','#4a1a14']},{name:'ডেনিম জ্যাকেট',price:'৩,৫০০',sizes:'M, L',emo:'🧥',g:['#2c7a7b','#123a3b']}];
const prod=(from,p,ago)=>mk(from,'',ago,{type:'product',p});
const convs=[
{id:1,name:'আয়েশা খাতুন',ini:'আ',ch:'wa',ai:true,unread:2,ri:0,msgs:[
 mk('c','হ্যালো, শার্ট নিয়ে জানতে চাই',1500),mk('a','জি, বলুন। কোন শার্টটা দেখছেন?',1498),
 mk('c','ভাইয়া, এই শার্টটা কি এখন আছে?',12),prod('a',PROD[0],11),mk('a','জি, আছে। M আর L সাইজ পাওয়া যাচ্ছে।',11,{react:'👍'}),
 mk('c','L লাগবে',3),mk('c','ডেলিভারি কত?',2)]},
{id:2,name:'রফিক হোসেন',ini:'র',ch:'ig',ai:true,unread:1,ri:0,msgs:[mk('c','',20,{type:'img'}),mk('c','দাম কত এই জুতাটার?',15)]},
{id:3,name:'ফারিয়া আক্তার',ini:'ফ',ch:'ms',ai:true,unread:0,ri:0,msgs:[mk('c','',75,{type:'voice',dur:8}),mk('a','আপনার অর্ডার কাল পৌঁছাবে।',62)]},
{id:4,name:'নাসির উদ্দিন',ini:'ন',ch:'wa',ai:false,unread:0,ri:0,msgs:[mk('s','আপনার অর্ডার পাঠানো হয়েছে।',1300,{react:'❤️'}),mk('c','ধন্যবাদ ভাই',1290),mk('c','',1289,{type:'file',name:'invoice.pdf',size:'১২৪ KB'})]},
{id:5,name:'সুমি',ini:'সু',ch:'ig',ai:true,unread:0,ri:0,msgs:[mk('c','কালারটা কি আরো আছে?',900),mk('a','জি, কালো আর নীল আছে।',899),mk('c','🙏',700,{type:'sticker'}),mk('c','',650,{type:'unsup'})]},
{id:7,name:'তানভীর আহমেদ',ini:'ত',ch:'wa',ai:true,unread:1,ri:0,msgs:[mk('c','ভাইয়া, আপনাদের পেজে শার্ট আছে?',4)]},
{id:6,name:'মিজান',ini:'ম',ch:'ms',ai:false,unread:0,ri:0,msgs:[mk('c','অর্ডার বাতিল করতে চাই',2880)]}
];
let cur=null,net=true,selId=null,replyTo=null,fabN=0,filt={ch:[],unread:false,status:null,time:'all'};
try{const f=JSON.parse(localStorage.getItem('ek_filt')||'null');if(f)filt=f}catch(e){}
const saveF=()=>{try{localStorage.setItem('ek_filt',JSON.stringify(filt))}catch(e){}};
const last=c=>c.msgs.length?c.msgs[c.msgs.length-1].ts:0;
const pv=m=>({text:m.text,img:'ছবি',imgs:'ছবি ('+bn((m.srcs||[]).length)+'টি)',sticker:'স্টিকার',voice:'ভয়েস মেসেজ',product:'পণ্য: '+(m.p&&m.p.name),file:'ডকুমেন্ট: '+m.name,unsup:'অন্য ধরনের মেসেজ'}[m.type]||'');
const lastC=c=>{for(let i=c.msgs.length-1;i>=0;i--)if(c.msgs[i].from==='c')return c.msgs[i];return null};
const windowOpen=c=>{const m=lastC(c);return !!m&&Date.now()-m.ts<864e5};
let toastT;const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>e.classList.remove('show'),1900)};
const vib=()=>{try{navigator.vibrate&&navigator.vibrate(12)}catch(e){}};

/* ---------- inbox ---------- */
const fcount=()=>(filt.ch.length?1:0)+(filt.unread?1:0)+(filt.status?1:0)+(filt.time!=='all'?1:0);
function filtered(){const t0=new Date().setHours(0,0,0,0);return convs.filter(c=>{
 if(filt.ch.length&&!filt.ch.includes(c.ch))return false;if(filt.unread&&!c.unread)return false;
 if(filt.status==='ai'&&!c.ai)return false;if(filt.status==='me'&&c.ai)return false;
 if(filt.status==='unans'){const l=c.msgs[c.msgs.length-1];if(!(l&&l.from==='c'))return false}
 const l=last(c);if(filt.time==='today'&&l<t0)return false;if(filt.time==='7'&&l<Date.now()-7*864e5)return false;if(filt.time==='30'&&l<Date.now()-30*864e5)return false;return true})}
function renderChips(){const un=convs.reduce((a,c)=>a+(c.unread?1:0),0);const none=!filt.ch.length&&!filt.unread;
 $('#chips').innerHTML=`<button class="${none?'on':''}" data-k="all">সব</button><button class="${filt.unread?'on':''}" data-k="un">অপঠিত ${bn(un)}</button>`+Object.keys(CH).map(k=>`<button class="${filt.ch.includes(k)?'on':''}" data-k="${k}">${CH[k].n}</button>`).join('');
 const b=$('#fBtn'),u=b.querySelector('u');if(u)u.remove();if(fcount())b.insertAdjacentHTML('beforeend',`<u>${bn(fcount())}</u>`)}
function renderList(newId){renderChips();const old={};$$('#rows .cv').forEach(e=>old[e.dataset.id]=e.getBoundingClientRect().top);
 const arr=filtered().sort((a,b)=>last(b)-last(a));
 $('#rows').innerHTML=arr.length?arr.map(c=>{const l=c.msgs[c.msgs.length-1];
  const pre=c.typing==='a'?`<span class="ty">AI লিখছে…</span>`:`<span>${l?(l.from==='a'?'AI: ':'')+esc(pv(l)):''}</span>`;
  return `<div class="cv ${c.id===newId&&old[c.id]==null?'in':''}" data-id="${c.id}"><div class="av">${c.ini}${badge(c.ch)}</div><div class="cm"><b>${esc(c.name)}</b>${pre}</div><div class="cr"><span>${l?rel(l.ts):''}</span>${c.unread?`<span class="un">${bn(c.unread)}</span>`:''}</div></div>`}).join('')
  :`<div class="empty">কোনো কনভারসেশন পাওয়া যায়নি।${fcount()?`<br><button id="clrF">ফিল্টার মুছুন</button>`:''}</div>`;
 $$('#rows .cv').forEach(e=>{const o=old[e.dataset.id];if(o==null)return;const d=o-e.getBoundingClientRect().top;if(Math.abs(d)>1)e.animate([{transform:`translateY(${d}px)`},{transform:'none'}],{duration:340,easing:'cubic-bezier(.2,.8,.2,1)'})})}
$('#chips').onclick=e=>{const k=e.target.dataset.k;if(!k)return;if(k==='all'){filt.ch=[];filt.unread=false}else if(k==='un')filt.unread=!filt.unread;else filt.ch=filt.ch.includes(k)?filt.ch.filter(x=>x!==k):[...filt.ch,k];saveF();renderList()};
$('#rows').onclick=e=>{if(e.target.id==='clrF'){filt={ch:[],unread:false,status:null,time:'all'};saveF();renderList();return}const r=e.target.closest('.cv');if(r)openChat(+r.dataset.id)};
function filterSheet(){const P=(arr,sel,k)=>arr.map(([v,l])=>`<button class="${sel(v)?'on':''}" data-k="${k}" data-v="${v}">${l}</button>`).join('');
 openSheet(`<h4>ফিল্টার<button data-k="clr">সব মুছুন</button></h4>
 <div class="sl">চ্যানেল</div><div class="pills">${P(Object.keys(CH).map(k=>[k,CH[k].n]),v=>filt.ch.includes(v),'ch')}</div>
 <div class="sl">স্ট্যাটাস</div><div class="pills">${P([['ai','AI রিপ্লাই দিচ্ছে'],['me','আপনি রিপ্লাই দিচ্ছেন'],['unans','উত্তর বাকি']],v=>filt.status===v,'st')}</div>
 <div class="sl">সময়</div><div class="pills">${P([['all','সব'],['today','আজ'],['7','৭ দিন'],['30','৩০ দিন']],v=>filt.time===v,'tm')}</div>
 <div class="btn" data-k="done">${bn(filtered().length)}টি কনভারসেশন দেখুন</div>`,e=>{const k=e.target.dataset.k,v=e.target.dataset.v;if(!k)return;
  if(k==='ch')filt.ch=filt.ch.includes(v)?filt.ch.filter(x=>x!==v):[...filt.ch,v];if(k==='st')filt.status=filt.status===v?null:v;if(k==='tm')filt.time=v;
  if(k==='clr')filt={ch:[],unread:false,status:null,time:'all'};saveF();renderList();if(k==='done')closeSheet();else filterSheet()},true)}
$('#fBtn').onclick=filterSheet;
(()=>{const L=$('#list');let y0=null,d=0;L.addEventListener('touchstart',e=>{if(L.scrollTop<=0)y0=e.touches[0].clientY},{passive:true});
 L.addEventListener('touchmove',e=>{if(y0==null)return;d=Math.max(0,Math.min(70,(e.touches[0].clientY-y0)*.5));$('#ptr').style.transition='none';$('#ptr').style.height=d+'px'},{passive:true});
 L.addEventListener('touchend',()=>{if(y0==null)return;$('#ptr').style.transition='';if(d>40){$('#ptr').style.height='40px';setTimeout(()=>{$('#ptr').style.height='0';renderList()},800)}else $('#ptr').style.height='0';y0=null;d=0})})();

/* ---------- sheets ---------- */
let shH=null;
function openSheet(html,h,keep){$('#sh').innerHTML=html;shH=h||null;$('#shw').classList.add('show')}
function closeSheet(){$('#shw').classList.remove('show')}
$('#shBk').onclick=closeSheet;$('#sh').onclick=e=>shH&&shH(e);

/* ---------- chat render ---------- */
const tk=m=>{if(m.from==='c')return'';const s=m.st;if(s==='sending')return I('clk');if(s==='failed')return`<span class="fail" data-retry="${m.id}">!</span>`;if(s==='sent')return I('chk');return`<span class="dbl ${s==='seen'?'seen':''}">${I('chk')}${I('chk','t2')}</span>`};
const meta=(m,c='mt')=>`<span class="${c}">${hm(m.ts)}<span class="tk">${tk(m)}</span></span>`;
const who=m=>m.from==='c'?cur.name:m.from==='a'?'AI':'আপনি';
const bars=m=>{let s='',x=m.id*9301+49297;for(let i=0;i<26;i++){x=(x*9301+49297)%233280;s+=`<i style="height:${5+Math.round(x/233280*18)}px"></i>`}return s};
function body(m){const k=m.from==='c'?'':m.from==='a'?'ba':'bs';
 const q=m.reply&&cur.msgs.find(x=>x.id===m.reply);
 const qh=q?`<div class="qt" data-q="${q.id}"><b>${esc(who(q))}</b><span>${esc(pv(q))}</span></div>`:'';
 switch(m.type){
 case'text':return`<div class="bub ${k}">${qh}${esc(m.text)}${meta(m)}</div>`;
 case'sticker':return`<div class="stk">${m.text}</div>`;
 case'imgs':{const n=m.srcs.length,sh=m.srcs.slice(0,4),more=n>4?n-4:0;return`<div class="bub im ${k}">${qh}<div class="imgw gw g${Math.min(n,4)}" data-img="${m.id}">${sh.map((x,i)=>`<div class="gt" data-i="${i}"><img src="${x}" alt="ছবি">${more&&i===3?`<span class="more">+${bn(more)}</span>`:''}</div>`).join('')}<span class="ovm">${hm(m.ts)}<span class="tk">${tk(m)}</span></span></div></div>`}
 case'img':return`<div class="bub im ${k}">${qh}<div class="imgw" data-img="${m.id}">${m.src?`<img src="${m.src}" alt="ছবি">`:`<div class="ph_">👟</div>`}<span class="ovm">${hm(m.ts)}<span class="tk">${tk(m)}</span></span></div></div>`;
 case'voice':return`<div class="bub ${k}"><div class="vn"><button class="pl" data-pl="${m.id}" aria-label="চালান">${I('play','fill')}</button><div class="wf">${bars(m)}</div><span class="vd">${mmss(m.dur)}</span></div><div class="mrow">${meta(m)}</div></div>`;
 case'file':return`<div class="bub ${k}"><div class="fileb"><div class="fi">${I('doc')}</div><div><b>${esc(m.name)}</b><span>${esc(m.size||'')}</span></div></div><div class="mrow">${meta(m)}</div></div>`;
 case'product':return`<div class="bub pc ${k||'ba'}"><div class="pimg" style="background:linear-gradient(135deg,${m.p.g[0]},${m.p.g[1]})">${m.p.emo}</div><div class="pi"><b>${esc(m.p.name)}</b><span>সাইজ: ${m.p.sizes}</span><div class="pp">৳${m.p.price}</div></div><div class="mrow">${meta(m)}</div></div>`;
 case'unsup':return`<div class="bub"><span class="unsup">এই ধরনের মেসেজ এখানে দেখানো যায় না।</span><div class="mrow">${meta(m)}</div></div>`}}
function msgEl(m,isNew){const mine=m.from!=='c',r=document.createElement('div');
 r.className='mr '+(mine?'r':'l')+(isNew?' new '+(mine?'out':'in'):'');r.dataset.id=m.id;r.dataset.from=m.from;
 r.innerHTML=`<div class="rep">${I('rep')}</div><div class="bc">${mine?`<div class="who">${m.from==='a'?'AI':'আপনি'}</div>`:''}${body(m)}${m.react?`<div class="rx">${m.react}</div>`:''}</div>`;return r}
function markRuns(){const rows=$$('#msgs .mr[data-id]');rows.forEach(r=>{const p=r.previousElementSibling,n=r.nextElementSibling;
 const sp=p&&p.dataset&&p.dataset.id&&p.dataset.from===r.dataset.from,sn=n&&n.dataset&&n.dataset.id&&n.dataset.from===r.dataset.from;
 r.classList.toggle('first',!sp);r.classList.toggle('last',!sn)})}
function renderMsgs(){const box=$('#msgs'),typ=$('#typ');[...box.children].forEach(x=>x!==typ&&x.remove());let pd='';const c=cur;
 let divAt=null;if(c.divId)divAt=c.divId;
 c.msgs.forEach(m=>{const d=dayLbl(m.ts);if(d!==pd){const s=document.createElement('div');s.className='sday';s.textContent=d;box.insertBefore(s,typ);pd=d}
  if(divAt===m.id){const u=document.createElement('div');u.className='udiv';u.id='udiv';u.textContent=bn(c.divN)+'টি অপঠিত মেসেজ';box.insertBefore(u,typ)}
  box.insertBefore(msgEl(m),typ)});markRuns();
 const u=$('#udiv');box.style.scrollBehavior='auto';box.scrollTop=u?Math.max(0,u.offsetTop-70):box.scrollHeight;box.style.scrollBehavior='';fabN=0;updFab()}
const nearBottom=()=>{const b=$('#msgs');return b.scrollHeight-b.scrollTop-b.clientHeight<120};
function updFab(){const f=$('#fab');f.classList.toggle('show',!nearBottom());f.classList.toggle('has',fabN>0);$('#fabN').textContent=bn(fabN)}
$('#msgs').addEventListener('scroll',()=>{if(nearBottom())fabN=0;updFab()},{passive:true});
$('#fab').onclick=()=>{fabN=0;$('#msgs').scrollTo({top:$('#msgs').scrollHeight,behavior:'smooth'})};
function appendMsg(m){const box=$('#msgs'),near=nearBottom()||m.from==='s';
 const d=dayLbl(m.ts),prev=cur.msgs[cur.msgs.length-2];if(!prev||dayLbl(prev.ts)!==d){const s=document.createElement('div');s.className='sday';s.textContent=d;box.insertBefore(s,$('#typ'))}
 box.insertBefore(msgEl(m,true),$('#typ'));markRuns();
 if(near)box.scrollTo({top:box.scrollHeight,behavior:'smooth'});else if(m.from==='c'){fabN++;updFab()}}
function setSt(m,st){m.st=st;const e=$(`#msgs [data-id="${m.id}"] .tk`);if(!e)return;const d=e.querySelector('.dbl');
 if(d&&st==='seen'){d.classList.add('seen');e.classList.remove('pop');void e.offsetWidth;e.classList.add('pop');return}
 e.innerHTML=tk(m);e.classList.remove('pop');void e.offsetWidth;e.classList.add('pop')}
function reRow(m){const old=$(`#msgs [data-id="${m.id}"]`);if(old){old.replaceWith(msgEl(m));markRuns()}}
function hdr(){const c=cur;$('#chAv').innerHTML=c.ini+badge(c.ch);$('#chName').textContent=c.name;
 const s=$('#chSub');s.className=c.typing==='a'?'g':'';s.textContent=c.typing==='a'?'AI উত্তর লিখছে…':CH[c.ch].n;
 $('#aiT').className='aic'+(c.ai?'':' offai');$('#aiT span').textContent=c.ai?'AI চালু':'AI বন্ধ'}
function setTyping(c,who){c.typing=who;if(cur===c){hdr();const t=$('#typ');t.classList.toggle('show',!!who);if(who&&nearBottom())$('#msgs').scrollTo({top:$('#msgs').scrollHeight,behavior:'smooth'})}if(!$('#ph').classList.contains('chat'))renderList()}
function openChat(id){if(rec)stopRec(false);cur=convs.find(c=>c.id===id);const cm=cur.msgs.filter(m=>m.from==='c');
 if(cur.unread>0&&cm.length){const f=cm[Math.max(0,cm.length-cur.unread)];cur.divId=f.id;cur.divN=Math.min(cur.unread,cm.length)}else cur.divId=null;
 cur.unread=0;clearSel();clearReply(true);$('#inp').value='';autosize();hdr();renderMsgs();$('#ph').classList.add('chat');updComposer();syncSend()}
$('#bBack').onclick=()=>{if(rec)stopRec(false);cur=null;$('#ph').classList.remove('chat','prof');clearSel();setTimeout(()=>renderList(),50)};
$('#aiT').onclick=()=>{cur.ai=!cur.ai;hdr();toast(cur.ai?'AI আবার রিপ্লাই দিবে':'আপনি এখন রিপ্লাই দিচ্ছেন')};

/* ---------- connectivity + 24h window ---------- */
function updComposer(){if(!cur)return;const closed=!windowOpen(cur);$('#comp').classList.toggle('closed',closed);$('#comp').classList.toggle('dis',!net&&!closed);$('#inp').placeholder=net?'মেসেজ লিখুন…':'ইন্টারনেট নেই'}
function updNet(){$('#netChip').className='chip'+(net?'':' off');$('#netChip').innerHTML=net?'<i class="dot"></i>লাইভ':'<i class="dot"></i>অফলাইন';$('#inBan').classList.toggle('show',!net);$('#chBan').classList.toggle('show',!net);updComposer()}

/* ---------- sending ---------- */
function deliver(c,m,react){setTimeout(()=>{if(!net){setSt(m,'failed');return}setSt(m,'sent');
 const toSeen=()=>setTimeout(()=>{setSt(m,'seen');if(react)customerReply(c)},CAP[c.ch].dlv?1300:1600);
 if(CAP[c.ch].dlv)setTimeout(()=>{setSt(m,'delivered');toSeen()},650);else toSeen()},450)}
function sendSeller(m){const c=cur;Object.assign(m,{id:uid++,from:'s',ts:Date.now(),st:'sending'});if(replyTo)m.reply=replyTo;clearReply();
 if(c.ai){c.ai=false;hdr();toast('আপনি রিপ্লাই দিচ্ছেন, AI বন্ধ হয়েছে')}
 c.msgs.push(m);appendMsg(m);deliver(c,m,true)}
$('#msgs').addEventListener('click',e=>{const r=e.target.closest('[data-retry]');if(r){const m=cur.msgs.find(x=>x.id==r.dataset.retry);if(!net)return toast('ইন্টারনেট নেই');setSt(m,'sending');deliver(cur,m,false)}});
const REPL=['ঠিক আছে ভাইয়া 👍','আচ্ছা, অর্ডার করতে চাই','পেমেন্ট কিভাবে করব?','ধন্যবাদ!'];
function customerReply(c){if(c.rt)return;c.rt=setTimeout(()=>{c.rt=null;if(!net)return;incoming(c,mk('c',REPL[c.ri++%REPL.length],0,{ts:Date.now()}))},1600)}
function incoming(c,m){c.msgs.push(m);const open=cur===c&&$('#ph').classList.contains('chat');
 if(open){appendMsg(m);updComposer()}else{c.unread++;renderList(c.id);notify(c,m)}}
function notify(c,m){$('#nAv').innerHTML=c.ini+badge(c.ch);$('#nT').textContent=c.name+' · '+CH[c.ch].n;$('#nB').textContent=pv(m);const n=$('#notif');n.dataset.id=c.id;n.classList.add('show');clearTimeout(n.t);n.t=setTimeout(()=>n.classList.remove('show'),3200)}
$('#notif').onclick=e=>{$('#notif').classList.remove('show');openChat(+e.currentTarget.dataset.id)};
function aiReply(c,text){setTimeout(()=>{if(!net)return;setTyping(c,'a');setTimeout(()=>{setTyping(c,null);
 const w=/দাম|জুতা|আছে|কালার|শার্ট|জ্যাকেট/.test(text);const out=[];
 if(w)out.push(mk('a','',0,{type:'product',p:PROD[Math.floor(Math.random()*3)],ts:Date.now(),st:'sent'}));
 out.push(mk('a',w?'এটা দেখতে পারেন। অর্ডার করতে চাইলে জানান।':'জি, আমি দেখে জানাচ্ছি।',0,{ts:Date.now(),st:'sent'}));
 out.forEach((m,i)=>setTimeout(()=>{c.msgs.push(m);if(c===cur&&$('#ph').classList.contains('chat'))appendMsg(m);else renderList(c.id);deliver(c,m,false)},i*500))},1900)},800)}
const SIM=['ভাইয়া, এই জুতাটার দাম কত?','আরো কালার আছে?','ডেলিভারি কতদিনে পাবো?','আজকে অর্ডার করলে কাল পাবো?'];let si=0;
function simCustomer(c){if(!net)return toast('ইন্টারনেট নেই');const t=SIM[si++%SIM.length];setTimeout(()=>{incoming(c,mk('c',t,0,{ts:Date.now()}));if(c.ai)aiReply(c,t)},500)}

/* composer */
const inp=$('#inp');
function autosize(){inp.style.height='38px';inp.style.height=Math.min(96,inp.scrollHeight)+'px'}
function syncSend(){const has=inp.value.trim().length>0||!!rec;$('#bSend').classList.toggle('has',has&&!rec);$('#bSend').classList.toggle('recm',!!rec);$('#bCam').classList.toggle('hide',inp.value.trim().length>0)}
inp.oninput=()=>{autosize();syncSend()};
inp.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend()}};
let rec=null;
function doSend(){if(!net){if(rec)toast('ইন্টারনেট নেই');return}if(rec){stopRec(true);return}const t=inp.value.trim();if(!t){startRec();return}sendSeller({type:'text',text:t});inp.value='';autosize();syncSend()}
$('#bSend').onclick=doSend;
function startReply(id){const m=cur.msgs.find(x=>x.id==id);if(!m)return;replyTo=m.id;$('#rbN').textContent=who(m);$('#rbT').textContent=pv(m);$('#rbar').classList.add('show');inp.focus()}
function clearReply(){replyTo=null;$('#rbar').classList.remove('show')}$('#rbX').onclick=()=>clearReply();
function drawW(){const w=rec.w;rec.a=Math.max(.12,Math.min(1,rec.a+(Math.random()-.5)*.8));w.push(rec.a);if(w.length>40)w.shift();$('#recW').innerHTML=w.map(a=>`<b style="height:${Math.round(3+a*20)}px"></b>`).join('')}
function startRec(){rec={t:0,a:.4,w:[],iv:setInterval(()=>{rec.t++;$('#recT').textContent=mmss(rec.t)},1000)};rec.wv=setInterval(drawW,90);$('#recT').textContent='০:০০';$('#comp').classList.add('recing');syncSend();vib()}
function stopRec(send){clearInterval(rec.iv);clearInterval(rec.wv);const t=rec.t;$('#comp').classList.remove('recing');rec=null;syncSend();if(send&&t>=1)sendSeller({type:'voice',dur:t});else if(send)toast('ভয়েস খুব ছোট')}
$('#recX').onclick=()=>stopRec(false);
let pl=null;
$('#msgs').addEventListener('click',e=>{const b=e.target.closest('[data-pl]');if(!b)return;const m=cur.msgs.find(x=>x.id==b.dataset.pl),w=b.parentNode.querySelector('.wf').children;
 if(pl){clearInterval(pl.iv);pl.b.innerHTML=I('play','fill');[...pl.w].forEach(x=>x.classList.remove('f'));const same=pl.b===b;pl=null;if(same)return}
 let p=0;b.innerHTML=I('pause');pl={b,w,iv:setInterval(()=>{p+=.1;const n=Math.floor(p/m.dur*w.length);[...w].forEach((x,i)=>x.classList.toggle('f',i<n));if(p>=m.dur){clearInterval(pl.iv);b.innerHTML=I('play','fill');[...w].forEach(x=>x.classList.remove('f'));pl=null}},100)}});
/* attach */
$('#bClip').onclick=()=>{const doc=CAP[cur.ch].doc;openSheet(`<h4>পাঠান</h4><div class="grid4"><div><button data-k="gal">${I('img')}</button>গ্যালারি</div><div><button data-k="cam">${I('cam')}</button>ক্যামেরা</div>${doc?`<div><button data-k="doc">${I('doc')}</button>ডকুমেন্ট</div>`:''}<div><button data-k="prod">${I('bag')}</button>পণ্য</div></div>`,e=>{const k=(e.target.closest('[data-k]')||{dataset:{}}).dataset.k;if(!k)return;closeSheet();if(k==='gal')$('#fGal').click();if(k==='cam')$('#fCam').click();if(k==='doc')$('#fDoc').click();if(k==='prod')setTimeout(prodSheet,200)})};
$('#bCam').onclick=()=>$('#fCam').click();
function prodSheet(){openSheet(`<h4>পণ্য পাঠান</h4>`+PROD.map((p,i)=>`<div class="lr" data-p="${i}"><div class="av" style="border-radius:10px;font-size:22px;background:linear-gradient(135deg,${p.g[0]},${p.g[1]})">${p.emo}</div><div class="cm"><b>${p.name}</b><span>৳${p.price}</span></div></div>`).join(''),e=>{const r=e.target.closest('[data-p]');if(r){closeSheet();sendSeller({type:'product',p:PROD[r.dataset.p]})}})}
let pend=[],pcur=0,appendMode=false;const MAXI=10;
function pvRender(){$('#pImg').src=pend[pcur]||'';$('#pTh').innerHTML=pend.map((x,i)=>`<button data-t="${i}" class="${i===pcur?'on':''}"><img src="${x}" alt=""><span class="rm" data-r="${i}">×</span></button>`).join('')+(pend.length<MAXI?'<button class="add" data-add="1">+</button>':'');$('#pC').textContent=pend.length>1?bn(pcur+1)+'/'+bn(pend.length):'';const c=$('#pCnt');c.textContent=bn(pend.length);c.classList.toggle('on',pend.length>1)}
function pvOpen(list,append){if(append&&$('#pvw').classList.contains('show')){pcur=pend.length;pend=pend.concat(list)}else{pend=list.slice();pcur=0}if(pend.length>MAXI){pend=pend.slice(0,MAXI);toast('সর্বোচ্চ ১০টি ছবি')}pcur=Math.min(pcur,pend.length-1);pvRender();$('#pvw').classList.add('show')}
$('#pTh').onclick=e=>{const r=e.target.closest('[data-r]');if(r){pend.splice(+r.dataset.r,1);if(!pend.length){$('#pvw').classList.remove('show');return}pcur=Math.min(pcur,pend.length-1);return pvRender()}if(e.target.closest('[data-add]')){appendMode=true;$('#fGal').click();return}const t=e.target.closest('[data-t]');if(t){pcur=+t.dataset.t;pvRender()}};
const onFile=e=>{const fs=[...e.target.files];e.target.value='';if(!fs.length)return;if(!net)return toast('ইন্টারনেট নেই');const im=fs.filter(f=>f.type.startsWith('image/'));
 if(im.length){pvOpen(im.map(f=>URL.createObjectURL(f)),appendMode);appendMode=false}else{const f=fs[0];sendSeller({type:'file',name:f.name,size:bn(f.size/1024<1024?Math.round(f.size/1024)+' KB':(f.size/1048576).toFixed(1)+' MB')})}};
$('#fGal').onchange=onFile;$('#fCam').onchange=onFile;$('#fDoc').onchange=onFile;
$('#pX').onclick=()=>$('#pvw').classList.remove('show');
$('#pSend').onclick=()=>{const l=pend.slice();$('#pvw').classList.remove('show');l.length>1?sendSeller({type:'imgs',srcs:l}):sendSeller({type:'img',src:l[0]})};
$('#msgs').addEventListener('click',e=>{const w=e.target.closest('[data-img]');if(!w||selId||justSel)return;const m=cur.msgs.find(x=>x.id==w.dataset.img),t=e.target.closest('[data-i]');openViewer(m,t?+t.dataset.i:0)});
let vs=null,vx=0;
function openViewer(m,i){vs={m,i,list:m.srcs||[m.src||null]};showV();$('#viewer').classList.add('show')}
function showV(){const l=vs.list,x=l[vs.i];$('#vN').textContent=who(vs.m)+(l.length>1?' · '+bn(vs.i+1)+'/'+bn(l.length):'');$('#vB').innerHTML=x?`<img src="${x}" alt="">`:`<div class="vph">👟</div>`;$('#vPrev').style.display=vs.i>0?'':'none';$('#vNext').style.display=vs.i<l.length-1?'':'none'}
const vgo=d=>{if(vs&&vs.i+d>=0&&vs.i+d<vs.list.length){vs.i+=d;showV()}};
$('#vPrev').onclick=()=>vgo(-1);$('#vNext').onclick=()=>vgo(1);
$('#vB').addEventListener('pointerdown',e=>vx=e.clientX);$('#vB').addEventListener('pointerup',e=>{const d=e.clientX-vx;if(Math.abs(d)>50)vgo(d<0?1:-1)});
$('#vX').onclick=()=>$('#viewer').classList.remove('show');

/* ---------- swipe to reply / long press ---------- */
let sw=null,justSel=false;const box=$('#msgs');
box.addEventListener('pointerdown',e=>{const r=e.target.closest('.mr');if(!r||r.id==='typ'||e.button>0)return;
 sw={r,x:e.clientX,y:e.clientY,moved:false,hit:false,id:e.pointerId};r.classList.add('pressing');
 sw.t=setTimeout(()=>{if(sw&&!sw.moved){const id=sw.r.dataset.id;sw.r.classList.remove('pressing');sw=null;justSel=true;setTimeout(()=>justSel=false,350);select(+id)}},430)});
box.addEventListener('pointermove',e=>{if(!sw)return;const dx=e.clientX-sw.x,dy=e.clientY-sw.y;
 if(!sw.moved&&Math.abs(dy)>10){clearTimeout(sw.t);sw.r.classList.remove('pressing');sw=null;return}
 if(Math.abs(dx)>8&&!sw.moved){sw.moved=true;clearTimeout(sw.t);sw.r.classList.remove('pressing');try{sw.r.setPointerCapture(sw.id)}catch(_){}sw.r.querySelector('.bc').classList.remove('back')}
 if(sw.moved){const raw=Math.max(0,dx),t=raw<56?raw:56+(raw-56)*.28,bc=sw.r.querySelector('.bc'),rp=sw.r.querySelector('.rep');
  bc.style.transform=`translateX(${t}px)`;rp.style.opacity=Math.min(1,Math.max(0,(t-10)/40));rp.style.transform=`scale(${.6+Math.min(.4,t/140)})`;
  if(t>=56&&!sw.hit){sw.hit=true;vib();rp.style.background='var(--cr)';rp.style.color='var(--ink)'}else if(t<56&&sw.hit){sw.hit=false;rp.style.background='';rp.style.color=''}}});
const endSw=()=>{if(!sw)return;clearTimeout(sw.t);sw.r.classList.remove('pressing');if(sw.moved){const bc=sw.r.querySelector('.bc'),rp=sw.r.querySelector('.rep');bc.classList.add('back');bc.style.transform='';rp.style.opacity=0;rp.style.background='';rp.style.color='';if(sw.hit)startReply(sw.r.dataset.id)}sw=null};
box.addEventListener('pointerup',endSw);box.addEventListener('pointercancel',endSw);
box.addEventListener('contextmenu',e=>{const r=e.target.closest('.mr');if(r&&r.id!=='typ'){e.preventDefault();clearTimeout(sw&&sw.t);sw=null;justSel=true;setTimeout(()=>justSel=false,350);select(+r.dataset.id)}});
box.addEventListener('click',e=>{if(justSel)return;const q=e.target.closest('[data-q]');if(q&&!selId){const t=$(`#msgs [data-id="${q.dataset.q}"]`);if(t){t.scrollIntoView({behavior:'smooth',block:'center'});t.classList.remove('flash');void t.offsetWidth;t.classList.add('flash')}return}
 if(selId){const r=e.target.closest('.mr');if(r&&r.id!=='typ'&&+r.dataset.id!==selId)select(+r.dataset.id);else clearSel()}});
/* selection: reply / copy / info; reactions only on customer messages */
const RX=['👍','❤️','😂','😮','😢','🙏'];
function select(id){clearSel(true);selId=id;const r=$(`#msgs [data-id="${id}"]`);r.classList.add('sel');vib();const m=cur.msgs.find(x=>x.id===id);
 $('#selbar').classList.add('show');$('#selbar [data-a=copy]').style.display=m.type==='text'?'':'none';$('#selbar [data-a=fwd]').style.display=m.from==='c'||m.type==='unsup'?'none':'';
 const rb=$('#rxbar');if(m.from==='c'){const pr=$('#ph').getBoundingClientRect(),rr=r.getBoundingClientRect();
  rb.innerHTML=RX.map((x,i)=>`<button data-x="${x}" style="animation-delay:${i*30}ms">${x}</button>`).join('');rb.style.top=Math.max(64,rr.top-pr.top-46)+'px';rb.style.left='14px';rb.style.right='auto';rb.classList.remove('show');void rb.offsetWidth;rb.classList.add('show')}else rb.classList.remove('show')}
function clearSel(keep){if(selId){const r=$(`#msgs [data-id="${selId}"]`);r&&r.classList.remove('sel')}selId=null;if(!keep){$('#selbar').classList.remove('show');$('#rxbar').classList.remove('show')}}
$('#rxbar').onclick=e=>{const x=e.target.dataset.x;if(!x)return;const m=cur.msgs.find(v=>v.id===selId);m.react=m.react===x?null:x;clearSel();reRow(m)};
$('#selbar').onclick=e=>{const a=(e.target.closest('[data-a]')||{dataset:{}}).dataset.a;if(!a)return;const m=cur.msgs.find(v=>v.id===selId);
 if(a==='close')return clearSel();
 if(a==='reply'){const id=selId;clearSel();startReply(id)}
 if(a==='copy'){clearSel();try{navigator.clipboard.writeText(m.text)}catch(_){}toast('কপি হয়েছে')}
 if(a==='fwd'){clearSel();fwdSheet(m)}
 if(a==='info'){clearSel();infoSheet(m)}};

/* forward = resend a copy through the send API (no native \"Forwarded\" label exists) */
function fwdSheet(m){const o=convs.filter(c=>c!==cur);
 const ok=c=>windowOpen(c)&&!(m.type==='file'&&!CAP[c.ch].doc);
 const why=c=>!windowOpen(c)?'২৪ ঘণ্টা পার হয়ে গেছে':'এই চ্যানেলে ডকুমেন্ট পাঠানো যায় না';
 openSheet(`<h4>ফরওয়ার্ড করুন</h4>`+o.map(c=>`<div class="cv" data-f="${c.id}" style="padding:10px 0;${ok(c)?'':'opacity:.45;pointer-events:none'}"><div class="av">${c.ini}${badge(c.ch)}</div><div class="cm"><b>${esc(c.name)}</b><span>${ok(c)?CH[c.ch].n:why(c)}</span></div></div>`).join(''),
 e=>{const r=e.target.closest('[data-f]');if(!r)return;if(!net){closeSheet();return toast('ইন্টারনেট নেই')}
  const c=convs.find(x=>x.id==r.dataset.f),n={...m,id:uid++,from:'s',ts:Date.now(),st:'sending'};delete n.reply;delete n.react;
  c.msgs.push(n);if(c.ai)c.ai=false;closeSheet();renderList(c.id);deliver(c,n,false);toast('ফরওয়ার্ড হয়েছে · '+c.name)})}
function infoSheet(m){const mine=m.from!=='c',st=m.st,t=ts=>hm(ts),cap=CAP[cur.ch];
 openSheet(`<h4>মেসেজ তথ্য</h4><div class="ir">${I('chk')}${mine?'পাঠানো হয়েছে':'এসেছে'}<span class="v">${dayLbl(m.ts)}, ${t(m.ts)}</span></div>`+
 (mine&&cap.dlv?`<div class="ir"><span class="dbl">${I('chk')}${I('chk','t2')}</span>পৌঁছেছে<span class="v">${['delivered','seen'].includes(st)?t(m.ts+1000):'এখনো না'}</span></div>`:'')+
 (mine?`<div class="ir"><span class="dbl seen">${I('chk')}${I('chk','t2')}</span>দেখেছে<span class="v">${st==='seen'?t(m.ts+3000):'এখনো না'}</span></div>`:'')+
 `<div class="ir">${I(cur.ch)}চ্যানেল<span class="v">${CH[cur.ch].n}</span></div><div class="ir">${I('msg')}পাঠিয়েছে<span class="v">${who(m)}</span></div>`)}


/* ---------- customer profile ---------- */
const MON=['জানু','ফেব্রু','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টে','অক্টো','নভে','ডিসে'];
const dFmt=ts=>{const d=new Date(ts);return bn(d.getDate())+' '+MON[d.getMonth()]+(d.getFullYear()!==new Date().getFullYear()?' '+bn(d.getFullYear()):'')};
const when=ts=>Date.now()-ts<864e5&&new Date(ts).getDate()===new Date().getDate()?'আজ, '+hm(ts):dFmt(ts);
const taka=n=>'৳'+bn(Number(n).toLocaleString('en-IN'));
const O=(id,store,items,amt,days,s,why)=>({id,store,items,amt,ts:now-days*864e5,s,why});
const FH='ফ্যাশন হাউস',SC='শু কর্নার',GW='জেন্টস ওয়্যার';
const ST={ok:['সফল','ok'],cx:['বাতিল','er'],rt:['ফেরত','wr'],run:['চলমান','mu']};
/* demo data: in the real app this comes from the orders of every workspace/store this customer bought from */
const PROF={
1:{phone:'+৮৮০ ১৭১২-৩৪৫৬৭৮',addr:'বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা',pay:'ক্যাশ অন ডেলিভারি',first:now-200*864e5,msgs:96,talks:14,orders:[
 O('#১০৪২',FH,'কটন ক্যাজুয়াল শার্ট × ১',1250,0.1,'run'),O('#০৯৮৮',FH,'লিনেন কুর্তি × ২',2400,20,'ok'),O('#০৯৩১',FH,'ডেনিম জ্যাকেট × ১',3500,41,'ok'),O('#০৮৭৬',FH,'টি-শার্ট × ৩',1800,70,'ok'),
 O('#০৭১২',SC,'লেদার স্নিকার × ১',2800,95,'ok'),O('#০৬৫৪',SC,'স্যান্ডেল × ১',1150,130,'cx','ঠিকানা ভুল ছিল'),O('#০৬০১',SC,'স্পোর্টস জুতা × ১',2200,160,'ok'),O('#০৫৪৪',FH,'ওড়না × ২',900,190,'ok')]},
2:{user:'rafiq.hossain',addr:'মিরপুর ১০, ঢাকা',pay:'ক্যাশ অন ডেলিভারি',first:now-120*864e5,msgs:58,talks:12,orders:[
 O('#১০১৯',SC,'লেদার স্নিকার × ১',2800,9,'cx','ডেলিভারির সময় ফোন ধরেননি'),O('#০৯৫৫',GW,'ডেনিম জ্যাকেট × ১',3500,35,'cx','ডেলিভারির সময় নিতে চাননি'),O('#০৮৯০',GW,'টি-শার্ট × ২',1200,60,'ok'),O('#০৮০১',GW,'জিন্স প্যান্ট × ১',1800,88,'cx','পরে মত বদলেছেন')]},
3:{addr:'উত্তরা সেক্টর ৭, ঢাকা',pay:'বিকাশ',first:now-80*864e5,msgs:31,talks:5,orders:[
 O('#১০৩১',FH,'শাড়ি × ১',3200,1,'run'),O('#০৯৭০',FH,'থ্রি-পিস × ১',2600,28,'ok'),O('#০৮৯৯',FH,'ওড়না × ২',800,55,'ok'),O('#০৮২২',FH,'থ্রি-পিস × ১',2400,78,'cx','সাইজ মেলেনি')]},
4:{phone:'+৮৮০ ১৮১৯-২২৩৩৪৪',addr:'কলেজ রোড, কুমিল্লা',pay:'ক্যাশ অন ডেলিভারি',first:now-150*864e5,msgs:40,talks:9,orders:[
 O('#১০০২',GW,'পাঞ্জাবি × ১',2100,22,'ok'),O('#০৯৬১',SC,'লোফার জুতা × ১',2600,45,'ok'),O('#০৯১৫',GW,'শার্ট × ২',2400,66,'ok'),O('#০৮৫০',GW,'পলো শার্ট × ১',950,92,'ok'),O('#০৭৭৭',SC,'স্যান্ডেল × ১',1400,120,'ok'),O('#০৬৯০',GW,'ট্রাউজার × ১',1700,148,'ok')]},
5:{user:'sumi.__',first:now-25*864e5,msgs:23,talks:9,asked:['কালো ও নীল রঙের কুর্তি','দাম ও সাইজ চার্ট'],orders:[]},
6:{addr:'সদর রোড, বরিশাল',pay:'ক্যাশ অন ডেলিভারি',first:now-3*864e5,msgs:4,talks:2,orders:[O('#১০৪০',GW,'টি-শার্ট × ২',1200,2,'run')]},
7:{phone:'+৮৮০ ১৯১৮-৫৫৬৬৭৭',talks:1,orders:[]}};
function profData(c){const P=PROF[c.id]||{},cm=c.msgs.filter(m=>m.from==='c'),seen=[];
 c.msgs.forEach(m=>{if(m.type==='product'&&m.p&&!seen.includes(m.p.name))seen.push(m.p.name)});
 return{phone:P.phone,user:P.user,addr:P.addr,pay:P.pay,orders:(P.orders||[]).slice().sort((a,b)=>b.ts-a.ts),
  first:P.first||(cm[0]?cm[0].ts:Date.now()),msgs:P.msgs||cm.length,talks:P.talks||1,asked:[...(P.asked||[]),...seen],firstTxt:(cm.find(m=>m.type==='text')||{}).text}}
function verdict(P){const o=P.orders,n=t=>o.filter(x=>x.s===t),ok=n('ok'),cx=n('cx'),rt=n('rt'),run=n('run'),done=ok.length+cx.length+rt.length;
 const rate=done?Math.round(ok.length/done*100):null,r=[];let label,tone;
 if(!o.length){if(P.talks<=1){label='নতুন কাস্টমার';tone='mu'}else if(P.talks>=4){label='অনেকবার জিজ্ঞেস করেছেন, কেনেননি';tone='wr'}else{label='এখনো কেনেননি';tone='mu'}}
 else if(!done){label='প্রথম অর্ডার চলছে';tone='mu'}
 else if(done<3&&rate===100){label='নতুন, কিন্তু ভালো শুরু';tone='ok'}
 else if(done<3){label='সতর্ক থাকুন';tone='er'}
 else if(rate>=85){label='ভরসাযোগ্য কাস্টমার';tone='ok'}
 else if(rate>=60){label='মাঝারি কাস্টমার';tone='wr'}
 else{label='ঝুঁকিপূর্ণ কাস্টমার';tone='er'}
 if(ok.length)r.push(['ok',`${bn(ok.length)}টি অর্ডার ঠিকমতো নিয়েছেন`]);
 if(done&&!cx.length&&!rt.length)r.push(['ok','কখনো বাতিল বা ফেরত দেননি']);
 if(cx.length){const w=cx.find(x=>x.why);r.push(['er',`${bn(cx.length)}বার অর্ডার বাতিল করেছেন`+(w?`। সর্বশেষ কারণ: ${w.why}`:'')])}
 if(rt.length)r.push(['wr',`${bn(rt.length)}টি পণ্য ফেরত দিয়েছেন`]);
 if(run.length)r.push(['mu',`${bn(run.length)}টি অর্ডার এখন চলছে`]);
 if(done&&tone==='er')r.push(['wr','অর্ডার নেওয়ার আগে ফোনে কনফার্ম করুন, সম্ভব হলে অগ্রিম নিন']);
 return{label,tone,rate,done,ok,cx,rt,run,reasons:r}}
const kv=(k,v)=>`<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
function pfHTML(c){const P=profData(c),o=P.orders,V=verdict(P),fresh=!o.length&&P.talks<=1;
 const sub=[CH[c.ch].n,c.ch==='wa'&&P.phone?P.phone:c.ch==='ig'&&P.user?'@'+P.user:''].filter(Boolean).join(' · ');
 let h=`<div class="hero"><div class="av">${c.ini}${badge(c.ch)}</div><h2>${esc(c.name)}</h2><div class="sub">${sub}</div><span class="tag ${V.tone}">${V.label}</span></div>
 <div class="qa"><button data-a="chat">${I('msg')}মেসেজ</button>${P.phone?`<button data-a="copy">${I('copy')}নম্বর কপি</button>`:''}<button data-a="ai">${I('ms')}${c.ai?'AI বন্ধ করুন':'AI চালু করুন'}</button></div>`;
 /* 1. how good a customer */
 if(V.done){h+=`<div class="pfc"><div class="vd2"><div class="ring ${V.tone}" style="--p:${V.rate}"><i>${bn(V.rate)}%</i></div><div><b>${bn(V.done)}টির মধ্যে ${bn(V.ok.length)}টি অর্ডার সফল</b><span>সফল অর্ডারের হার</span></div></div><ul class="rs">${V.reasons.map(x=>`<li class="${x[0]}">${x[1]}</li>`).join('')}</ul></div>`}
 else if(o.length){h+=`<div class="pfc"><div class="emp2"><div class="ic">${I('clk')}</div><div><b>প্রথম অর্ডার চলছে</b><span>ডেলিভারি হওয়ার পর এখানে সফল অর্ডারের হার আর কেমন কাস্টমার তা দেখা যাবে।</span></div></div></div>`}
 else if(fresh){h+=`<div class="pfc"><div class="emp2"><div class="ic">${I('bag')}</div><div><b>এখনো কোনো অর্ডার নেই</b><span>প্রথমবার মেসেজ করেছেন। অর্ডার হলে এখানে অর্ডারের ইতিহাস, সফল অর্ডারের হার আর কেমন কাস্টমার তা দেখা যাবে।</span></div></div></div>`}
 else{h+=`<div class="pfc"><div class="emp2"><div class="ic">${I('bag')}</div><div><b>এখনো কিছু কেনেননি</b><span>${bn(P.talks)}বার কথা বলেছেন, মোট ${bn(P.msgs)}টি মেসেজ দিয়েছেন, কিন্তু কোনো অর্ডার হয়নি।</span></div></div></div>`}
 /* 2. order summary (only real numbers) */
 if(V.done){const tl=[['মোট অর্ডার',o.length,''],['সফল',V.ok.length,'ok'],['বাতিল',V.cx.length,'er'],['ফেরত',V.rt.length,'wr'],['চলমান',V.run.length,'']].filter((x,i)=>i===0||x[1]>0);
  const sum=V.ok.reduce((a,x)=>a+x.amt,0);
  h+=`<div class="pfc"><h5>অর্ডারের সারাংশ</h5><div class="tiles">${tl.map(x=>`<div class="tile ${x[2]}"><b>${bn(x[1])}</b><span>${x[0]}</span></div>`).join('')}</div>`+
   (V.ok.length?kv('মোট কেনাকাটা',taka(sum)):'')+(V.ok.length>1?kv('গড় অর্ডার',taka(Math.round(sum/V.ok.length))):'')+kv('শেষ অর্ডার',dFmt(o[0].ts))+`</div>`}
 /* 3. intro for a brand-new customer / buying behaviour for everyone else */
 if(fresh){h+=`<div class="pfc"><h5>পরিচিতি</h5>${kv('প্রথম মেসেজ',when(P.first))}${kv('চ্যানেল',CH[c.ch].n)}${P.firstTxt?`<div class="fmsg">${esc(P.firstTxt)}</div>`:''}</div>`}
 else{h+=`<div class="pfc"><h5>কথা বলা আর কেনার আচরণ</h5>${kv('প্রথম মেসেজ',dFmt(P.first))}${kv('মোট মেসেজ দিয়েছেন',bn(P.msgs)+'টি')}${kv('কথা হয়েছে',bn(P.talks)+' বার')}`+
  (o.length?kv('অর্ডার হয়েছে',bn(o.length)+' বার'):'')+(o.length&&P.talks>o.length?kv('কথা হয়েছে, কিন্তু অর্ডার হয়নি',bn(P.talks-o.length)+' বার'):'')+`</div>`}
 /* 4. orders grouped by workspace / store */
 if(o.length){const g=[];o.forEach(x=>{let e=g.find(y=>y.n===x.store);if(!e)g.push(e={n:x.store,l:[]});e.l.push(x)});
  h+=`<div class="pfc" id="pfOrders"><h5>অর্ডারের ইতিহাস</h5>${g.map((e,gi)=>{const t=e.l.filter(x=>x.s==='ok').reduce((a,x)=>a+x.amt,0);
   return`<div class="stg" data-g="${gi}"><div class="sth">${I('bag')}${esc(e.n)}<span>${bn(e.l.length)}টি অর্ডার${t?' · '+taka(t):''}</span></div>${e.l.map((x,i)=>`<div class="ord ${i>=3?'x':''}"><div class="l"><b>${esc(x.items)}</b><span>${dFmt(x.ts)} · ${x.id}</span>${x.why?`<span class="why">${esc(x.why)}</span>`:''}</div><div class="r">${taka(x.amt)}<em class="${ST[x.s][1]}">${ST[x.s][0]}</em></div></div>`).join('')}${e.l.length>3?`<button class="mo" data-a="more">আরও ${bn(e.l.length-3)}টি দেখুন</button>`:''}</div>`}).join('')}</div>`}
 /* 5. contact: only what we actually know */
 const rows=[P.phone&&c.ch!=='wa'&&kv('ফোন',P.phone),P.addr&&kv('ঠিকানা',esc(P.addr)),P.pay&&kv('পছন্দের পেমেন্ট',P.pay)].filter(Boolean);
 if(rows.length)h+=`<div class="pfc"><h5>যোগাযোগ ও ডেলিভারি</h5>${rows.join('')}</div>`;
 if(P.asked.length)h+=`<div class="pfc"><h5>যা নিয়ে জানতে চেয়েছেন</h5><div class="chips2">${P.asked.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div>`;
 h+=`<div class="pfc"><h5>আপনার নোট</h5><textarea class="nt" id="pfNote" rows="2" placeholder="এই কাস্টমার সম্পর্কে কিছু লিখে রাখুন…">${esc(c.note||'')}</textarea></div>`;
 return h}
function openProfile(){if(!cur)return;$('#pfBody').innerHTML=pfHTML(cur);$('#pfBody').scrollTop=0;$('#ph').classList.add('prof')}
$('#chInfo').onclick=openProfile;
$('#pfBack').onclick=()=>$('#ph').classList.remove('prof');
$('#pfBody').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
 if(a==='chat')$('#ph').classList.remove('prof');
 if(a==='copy'){try{navigator.clipboard.writeText(profData(cur).phone)}catch(_){}toast('নম্বর কপি হয়েছে')}
 if(a==='ai'){cur.ai=!cur.ai;hdr();b.innerHTML=I('ms')+(cur.ai?'AI বন্ধ করুন':'AI চালু করুন');toast(cur.ai?'AI আবার রিপ্লাই দিবে':'আপনি এখন রিপ্লাই দিচ্ছেন')}
 if(a==='more'){const g=b.closest('.stg');g.classList.toggle('open');b.textContent=g.classList.contains('open')?'কম দেখুন':'আরও '+bn(g.querySelectorAll('.ord.x').length)+'টি দেখুন'}});
$('#pfBody').addEventListener('input',e=>{if(e.target.id==='pfNote'&&cur)cur.note=e.target.value});
$('#pfBody').addEventListener('focusout',e=>{if(e.target.id==='pfNote'&&cur&&cur.note)toast('নোট সেভ হয়েছে')});

/* ---------- demo controls ---------- */
$('#cNet').onclick=e=>{net=!net;e.target.textContent=net?'ইন্টারনেট বন্ধ করুন':'ইন্টারনেট চালু করুন';
 if(net){$('#netChip').className='chip sync';$('#netChip').innerHTML='<i class="dot"></i>সিঙ্ক হচ্ছে';setTimeout(updNet,1200);$('#inBan').classList.remove('show');$('#chBan').classList.remove('show');updComposer()}else updNet()};
$('#cSim').onclick=()=>simCustomer(cur||convs[2]);
$('#cOther').onclick=()=>{if(!net)return toast('ইন্টারনেট নেই');const o=convs.filter(c=>c!==cur);const c=o[Math.floor(Math.random()*o.length)];const t=SIM[si++%SIM.length];
 setTimeout(()=>{incoming(c,mk('c',t,0,{ts:Date.now()}));if(c.ai)aiReply(c,t)},400)};
$('#cReact').onclick=()=>{if(!cur)return toast('আগে একটি চ্যাট খুলুন');const m=[...cur.msgs].reverse().find(x=>x.from!=='c');if(!m)return;m.react=['👍','❤️','😍'][Math.floor(Math.random()*3)];reRow(m)};
$('#cTheme').onclick=e=>{const l=$('#ph').classList.toggle('light');e.target.textContent=l?'ডার্ক থিম':'লাইট থিম'};

/* demo images drawn on a canvas, so no file picker is needed */
const DEMO=[['#e9c9a0','#8a6a4f','👟'],['#a8c5d9','#3b5a73','👕'],['#d9a8b4','#7a3b4c','👜'],['#c9d9a8','#4c6b3a','🧢'],['#d9cfa8','#6b5d3a','🕶️']];let di=0;
function demoImg(){const[a,b,e]=DEMO[di++%DEMO.length],c=document.createElement('canvas');c.width=720;c.height=540;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,720,540);g.addColorStop(0,a);g.addColorStop(1,b);x.fillStyle=g;x.fillRect(0,0,720,540);x.font='260px serif';x.textAlign='center';x.textBaseline='middle';x.fillText(e,360,280);return c.toDataURL('image/jpeg',.85)}
$('#cImgS').onclick=()=>{if(!cur)return toast('আগে একটি চ্যাট খুলুন');if(!net)return toast('ইন্টারনেট নেই');if(!windowOpen(cur))return toast('২৪ ঘণ্টা পার হয়ে গেছে');pvOpen([demoImg()])};
$('#cImgM').onclick=()=>{if(!cur)return toast('আগে একটি চ্যাট খুলুন');if(!net)return toast('ইন্টারনেট নেই');if(!windowOpen(cur))return toast('২৪ ঘণ্টা পার হয়ে গেছে');pvOpen([demoImg(),demoImg(),demoImg(),demoImg()])};
$('#cImgCM').onclick=()=>{const c=cur||convs[0];if(!net)return toast('ইন্টারনেট নেই');setTimeout(()=>{incoming(c,mk('c','',0,{type:'imgs',srcs:[1,2,3,4,5].map(demoImg),ts:Date.now()}));if(c.ai)aiReply(c,'')},400)};
$('#cImgC').onclick=()=>{const c=cur||convs[0];if(!net)return toast('ইন্টারনেট নেই');setTimeout(()=>{incoming(c,mk('c','',0,{type:'img',src:demoImg(),ts:Date.now()}));if(c.ai)aiReply(c,'')},400)};

/* design-page hook: puts the prototype into a named, frozen state (used by ekmivo-app-design.html) */
window.__step=function(k){
 const later=(f,t)=>setTimeout(f,t),lastOf=f=>[...cur.msgs].reverse().find(f),
  cust=()=>lastOf(m=>m.from==='c'&&m.type==='text'),own=()=>lastOf(m=>m.from!=='c'&&m.type==='text'),
  rowOf=m=>$(`#msgs [data-id="${m.id}"]`),view=e=>{if(!e)return;const b=$('#msgs');b.scrollTop+=e.getBoundingClientRect().top-b.getBoundingClientRect().top-b.clientHeight/2+e.offsetHeight/2},
  sendImg=st=>{const m={id:uid++,from:'s',type:'img',src:demoImg(),ts:Date.now(),st};cur.msgs.push(m);appendMsg(m);view(rowOf(m))},
  sendImgs=(n,st)=>{const m={id:uid++,from:'s',type:'imgs',srcs:Array.from({length:n},()=>demoImg()),ts:Date.now(),st};cur.msgs.push(m);appendMsg(m);view(rowOf(m))},
  chat=(id,f,t)=>{openChat(id);if(f)later(f,t||350)};
 const A={
 'list':()=>{},
 'list-filter':()=>$$('#chips button')[1].click(),
 'list-filter-channel':()=>$$('#chips button').find(b=>b.textContent.includes('Instagram')).click(),
 'list-filter-sheet':()=>$('#fBtn').click(),
 'list-offline':()=>$('#cNet').click(),
 'list-notif':()=>{notify(convs[1],mk('c','ভাইয়া, এই জুতাটার দাম কত?',0,{ts:Date.now()}));clearTimeout($('#notif').t)},
 'chat-open':()=>chat(1),
 'chat-ai-typing':()=>chat(1,()=>setTyping(cur,'a'),300),
 'chat-select-customer':()=>chat(1,()=>{const m=cust();view(rowOf(m));later(()=>select(m.id),150)}),
 'chat-reacted':()=>chat(1,()=>{const m=cust();m.react='❤️';reRow(m);view(rowOf(m))}),
 'chat-select-own':()=>chat(1,()=>{const m=own();view(rowOf(m));later(()=>select(m.id),150)}),
 'chat-swipe':()=>chat(1,()=>{const m=cust(),r=rowOf(m);view(r);const bc=r.querySelector('.bc'),rp=r.querySelector('.rep');bc.classList.remove('back');bc.style.transform='translateX(64px)';rp.style.opacity=1;rp.style.transform='scale(1)';rp.style.background='var(--cr)';rp.style.color='var(--ink)'}),
 'chat-reply-bar':()=>chat(1,()=>startReply(cust().id)),
 'attach-sheet':()=>chat(1,()=>$('#bClip').click(),300),
 'attach-sheet-ig':()=>chat(2,()=>$('#bClip').click(),300),
 'product-picker':()=>chat(1,()=>prodSheet(),300),
 'image-preview':()=>chat(1,()=>pvOpen([demoImg()]),300),
 'images-preview':()=>chat(1,()=>{pvOpen([1,2,3,4].map(demoImg));pcur=1;pvRender()},300),
 'images-2':()=>chat(1,()=>sendImgs(2,'seen')),
 'images-3':()=>chat(1,()=>sendImgs(3,'seen')),
 'images-4':()=>chat(1,()=>sendImgs(4,'delivered')),
 'images-received-5':()=>chat(1,()=>{const m={id:uid++,from:'c',type:'imgs',srcs:[1,2,3,4,5].map(demoImg),ts:Date.now()};cur.msgs.push(m);appendMsg(m);view(rowOf(m))}),
 'images-viewer':()=>chat(1,()=>{const m={id:uid++,from:'c',type:'imgs',srcs:[1,2,3,4,5].map(demoImg),ts:Date.now()};cur.msgs.push(m);appendMsg(m);openViewer(m,2)}),
 'image-sending':()=>chat(1,()=>sendImg('sending')),
 'image-sent':()=>chat(1,()=>sendImg('sent')),
 'image-delivered':()=>chat(1,()=>sendImg('delivered')),
 'image-seen':()=>chat(1,()=>sendImg('seen')),
 'image-received':()=>chat(2),
 'image-viewer':()=>chat(2,()=>$('#msgs .imgw').click()),
 'product-card':()=>chat(1,()=>view($('#msgs .pc'))),
 'voice-recording':()=>chat(1,()=>startRec(),300),
 'voice-message':()=>chat(3),
 'doc-message':()=>chat(4),
 'sticker-unsupported':()=>chat(5),
 'info-sheet':()=>chat(1,()=>infoSheet(own())),
 'forward-sheet':()=>chat(1,()=>fwdSheet(own())),
 'window-closed':()=>chat(6),
 'chat-offline':()=>chat(1,()=>$('#cNet').click(),300),
 'send-failed':()=>chat(1,()=>{const m={id:uid++,from:'s',type:'text',text:'ঠিক আছে, পাঠাচ্ছি',ts:Date.now(),st:'failed'};cur.msgs.push(m);appendMsg(m);view(rowOf(m))}),
 'composer-typing':()=>chat(1,()=>{inp.value='জি, আজকেই পাঠিয়ে দিচ্ছি';autosize();syncSend()},300),
 'profile-regular':()=>chat(1,()=>openProfile(),350),
 'profile-orders':()=>chat(1,()=>{openProfile();later(()=>{const bd=$('#pfBody');bd.scrollTop+=$('#pfOrders').getBoundingClientRect().top-bd.getBoundingClientRect().top-8},250)},350),
 'profile-risky':()=>chat(2,()=>openProfile(),350),
 'profile-new':()=>chat(7,()=>openProfile(),350),
 'profile-lookers':()=>chat(5,()=>openProfile(),350),
 'profile-first-order':()=>chat(6,()=>openProfile(),350),
 'profile-light':()=>{$('#ph').classList.add('light');chat(1,()=>openProfile(),350)},
 'chat-light':()=>{$('#ph').classList.add('light');chat(1)},
 'list-light':()=>$('#ph').classList.add('light')};
 (A[k]||A.list)()};
renderList();updNet();syncSend();
setInterval(()=>{if(!$('#ph').classList.contains('chat'))renderList()},60000);
</script>
</body>
</html>

`````
<!-- END SOURCE: ekmivo-inbox.html -->

## Appendix C — ekmivo-design-spec.md (হুবহু)

<!-- BEGIN SOURCE: ekmivo-design-spec.md -->
`````markdown
# Ekmivo Seller App — Inbox, Chat & Customer Profile: Strict Design Specification

Version 1.0 · Language of UI: Bengali (bn) · Platform: Android seller app (prototype built as one HTML file, 360 × 720 phone frame)

---

## 0. How to use this file (instructions to the AI / developer)

You are given this specification. **It is the only source of truth.** Reproduce the design exactly: every colour, size, spacing, radius, font weight, animation, timing, string and behaviour must match. "Close" or "in the same spirit" is a failure.

1. **Appendix A contains the complete reference source** (`ekmivo-inbox.html`) verbatim. If you build for the web, copy its CSS, markup and JS **unchanged**. If you port to another stack (React Native, Compose, Flutter, React), every numeric value in Appendix A's CSS must be carried over 1:1 (px → dp), and every string in the JS must be copied character for character.
2. Where this document and Appendix A ever appear to disagree, **Appendix A wins**. Do not "fix" it, do not modernise it, do not refactor it.
3. Do not add, remove, rename, reorder or restyle anything. Do not add features, screens, buttons, icons, animations, libraries or fonts that are not in this spec.
4. Do not replace any Bengali text with English or with your own wording. Do not "improve" copy.
5. If something is not specified, do **not** invent it. Leave it out and list it in a "Not specified" note at the end of your answer.
6. When finished, run the acceptance checklist in §15 and report each item as pass/fail.

---

## 1. Hard prohibitions

- No UI frameworks or component libraries (no Material, Tailwind, Bootstrap, shadcn, etc.) for the prototype. Plain HTML + CSS + vanilla JS only.
- No external assets except the single Google Fonts request for **Hind Siliguri** (weights 400 and 500). No remote images, no icon fonts, no emoji used as UI icons (emoji appear only as user content: reactions, stickers, demo product pictures).
- No gradients except: the demo product/placeholder pictures (`linear-gradient(135deg, …)`), the demo-image canvas, and the success-rate ring (`conic-gradient`).
- No shadows anywhere. Depth is made with 1px borders and the surface tokens only.
- No font weight other than 400 and 500. No italics except the "unsupported message" note.
- No calls, video calls, three-dot menus, "typing…" for the customer, "online" status, or "forwarded" labels. These do not exist in the product (the channels' APIs do not provide them).
- No colours outside the tokens in §3 (plus the three channel colours and the black/white overlays listed there).
- Never show `0`, `null`, `undefined`, `NaN`, "N/A" or an empty row for unknown data. Omit the whole row/card instead (see §11).

---

## 2. Deliverable shape

- One HTML file, `lang="bn"`, `<meta viewport content="width=device-width, initial-scale=1, viewport-fit=cover">`, title `Ekmivo ইনবক্স`.
- Phone frame `.ph`: width 360px, max-width 100%, height 720px, `max-height: calc(100vh − 90px)`, min-height 560px, border-radius 34px, border 6px solid `#2C2C29`, overflow hidden, base font-size 14px. At viewport ≤ 480px the frame becomes full-bleed (100vw × 100vh, no border, no radius, no padding on body).
- Page body background `#121211`, text `#F1F0EA`, font `"Hind Siliguri", system-ui, sans-serif`.
- Below the frame there is a row of **demo controls** (`.ctl`) — they exist only for the prototype. In a production build they are removed; in the prototype they must stay exactly as in Appendix A.
- `prefers-reduced-motion: reduce` → all animation/transition durations become 0.01s.
- A global hook `window.__step(name)` puts the prototype into any named state (catalogue in §13). Keep it.

---

## 3. Design tokens

### 3.1 Colour (CSS custom properties on `.ph`)

| Token | Dark (default) | Light (`.ph.light`) | Use |
|---|---|---|---|
| `--bg` | `#0F0F0E` | `#F4F3EE` | screen background |
| `--s1` | `#181817` | `#FFFFFF` | cards, inputs, incoming bubble, chips |
| `--s2` | `#222220` | `#ECEAE2` | raised surface, AI bubble, sheets, avatar bg |
| `--bd` | `#2C2C29` | `#D9D8D1` | all 1px borders/dividers |
| `--tx` | `#F1F0EA` | `#1B1B19` | primary text |
| `--mu` | `#8D8B84` | `#6B6A64` | secondary text, icons |
| `--ok` | `#3DDC97` | `#14935C` | success |
| `--wr` | `#F5B544` | `#B7791F` | warning |
| `--er` | `#F2685B` | `#D6453A` | error / cancelled |
| `--okbg` | `#12301F` | `#DDF3E8` | success tint |
| `--wrbg` | `#33260D` | `#FBEFD3` | warning tint |
| `--erbg` | `#3A1B18` | `#F9DEDA` | error tint |
| `--cr` | `#F1F0EA` | `#1B1B19` | "contrast" fill: send button, own bubble, active chip, unread badge |
| `--ink` | `#111111` | `#FFFFFF` | text on `--cr` |
| `--seen` | `#1E90E0` | `#1E90E0` | blue "seen" ticks |

Channel colours (badge fill): WhatsApp `#25D366`, Instagram `#C13584`, Messenger `#0A7CFF`. Badge icon colour `#fff`.
Overlays: scrim `rgba(0,0,0,.5)` (sheets, 0.35 for dim behind sliding screen), image viewer/preview background `#000` with white content, translucent chips on photos `rgba(0,0,0,.5)`.

### 3.2 Motion

- `--out: cubic-bezier(.2,.8,.2,1)` for slides, sheets, fades.
- `--spring: cubic-bezier(.34,1.56,.64,1)` for pops, send button, bubble entrance, swipe return.
- Screen slide 320ms `--out`. Sheet slide 320ms `--out`. Scrim fade 250ms. Chip/pill colour change 200ms. Press feedback `scale(.95)` 120ms.

### 3.3 Typography

Font Hind Siliguri only. Weights 400 (body) and 500 (titles, names, buttons, badges). Sizes used: 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15, 16, 17, 19, 22 (+ 26/54/76/80 for avatar initial / emoji illustrations). Message text 13px / line-height 1.5. Inbox title 17px/500. Chat header name 14px/500, sub 11px. Profile name 19px/500. Numbers are always Bengali digits (০১২৩৪৫৬৭৮৯) — convert every digit, including times, counts, prices and dates.

### 3.4 Shape & spacing

Radii: phone 34, sheet top 24, card 18, bubble 16 (last bubble in a run: the tail-side bottom corner 5), image 13, input pill 20, chips/badges 99 (full), icon buttons 50% or 10–12. Borders always 1px `--bd` (selection/quote bar 3px `--ok`). Icons: inline SVG sprite, 24×24 viewBox, `fill:none; stroke:currentColor; stroke-width:1.8; round caps/joins`, rendered at 20px (13px for ticks, 10px inside channel badges, 14px inside play button, 16px for the swipe-reply icon). Screen horizontal padding 16px (inbox) / 14px (chat rows) / 12px (cards).

---

## 4. Screens and navigation

Three stacked absolute screens inside the phone frame, plus overlays:

1. **Inbox** (`#sInbox`) — default.
2. **Chat** (`#sChat`) — slides in from the right over the inbox; inbox moves left 24% and is dimmed (`#dim` opacity .35).
3. **Customer profile** (`#sProf`) — slides in from the right over the chat; chat moves left 24% and dims to `brightness(.7)`.
4. Overlays: bottom sheet (filter, attach, product picker, forward, message info), full-screen image **viewer**, full-screen **image preview** (before sending), in-app **notification** banner, **toast**, **reaction bar**.

Back button on chat → inbox (also stops a running voice recording and closes profile). Back on profile → chat.

---

## 5. Inbox screen

- Top bar: padding 16/16/8. Logo tile 34×34, radius 10, `--cr` fill, letter "e." 16px/500 in `--ink`. Title "ইনবক্স" 17px/500. Right: connection chip (`লাইভ` green pulsing dot / `অফলাইন` amber static dot / `সিঙ্ক হচ্ছে` grey static dot) then a 34×34 filter button (radius 10, `--s1`, border) with a count badge (`--cr`, 15px high) when filters are active.
- Filter chips row (horizontal scroll, hidden scrollbar, gap 6, padding 4/16/8): `সব`, `অপঠিত <n>`, then one chip per channel (WhatsApp, Instagram, Messenger). Chip: 12px, padding 5/12, full radius, 1px border, muted text; active = `--cr` fill, `--ink` text.
- Offline banner (hidden by default): amber tint `--wrbg`, radius 12, margin 0 16, alert icon + bold line "ইন্টারনেট নেই" + "নেট এলে নতুন মেসেজ আসবে। এখন উত্তর পাঠানো যাবে না।"
- Conversation row `.cv`: padding 10/16, top border 1px, gap 12. Avatar 40px circle (`--s2`, initial 14px/500) with an 18px channel badge at bottom-right (−3px offset, 2px ring in `--bg`). Middle: name 14px/500 + one-line preview 12px muted, ellipsis; preview prefix `AI: ` for AI messages; while AI types the preview is green "AI লিখছে…". Right column: relative time 11px muted + unread pill (min 18px, `--cr` fill).
- Sorting: by last activity, newest first; rows animate to new positions (340ms `--out`); a brand-new row drops in (450ms).
- Pull-to-refresh: spinner, pull distance max 70px, triggers above 40px, holds 800ms.
- Empty state: "কোনো কনভারসেশন পাওয়া যায়নি।" plus "ফিল্টার মুছুন" button if filters active.
- Bottom nav: three items — ইনবক্স (active, `--s2` pill), SMS, সেটিংস. 11px labels, 20px icons.
- Filter sheet: sections চ্যানেল / স্ট্যাটাস (AI রিপ্লাই দিচ্ছে · আপনি রিপ্লাই দিচ্ছেন · উত্তর বাকি) / সময় (সব · আজ · ৭ দিন · ৩০ দিন), pills like chips, a "সব মুছুন" link, and a full-width button "<n>টি কনভারসেশন দেখুন". Filters persist in `localStorage` key `ek_filt`.

---

## 6. Chat screen

### 6.1 Header (`.chh`)
Back button, tappable block (**opens the customer profile**) with 34px avatar + name (14px/500) + sub line (channel name, or green "AI উত্তর লিখছে…"), then the AI chip: `AI চালু` (green dot) / `AI বন্ধ` (grey dot). When a message is selected, a selection bar covers the header: close, spacer, reply, forward, copy, info icons.

### 6.2 Messages
- Day separators ("আজ", "গতকাল", or `d/m`) as centred 11px chips on `--s1`. Unread divider "<n>টি অপঠিত মেসেজ" on `--s2`; the chat opens scrolled to it.
- Row padding 1/14. Customer messages left, AI and seller messages right. Max bubble width 78%. First message of a run shows a tiny sender label (customer name / `AI` / `আপনি`) 10.5px muted; consecutive messages are grouped (7px extra gap above a new run).
- Bubble colours: customer `--s1`; AI `--s2`; seller `--cr` with `--ink` text. Padding 9/12, radius 16, last in run has the tail corner 5px.
- Time + status sit inside the bubble bottom-right, 10px (text: floated; voice/file/product: own row 12px high). Image bubbles: padding 3, time on a dark translucent pill over the photo.
- Status for own messages: sending = clock icon; sent = 1 tick; delivered = 2 ticks (second slides in from the left, 240ms); seen = ticks turn `--seen` blue (300ms); failed = 13px red circle with "!" (tap = retry). Instagram has **no delivered step** (sent → seen).
- Reaction chip: bottom corner of the bubble, 20px high, `--s2`, 1px border, pop animation.
- Reply quote inside bubble: 3px `--ok` left bar, translucent grey fill, radius 8, sender in green 11px, one-line text.
- Message types: **text**, **sticker** (120×120, emoji 76px, no bubble), **single image** (max 220×260, cover), **image group** (see §7), **voice** (play button 32px, 26-bar waveform, duration), **file** (34px icon tile, name ellipsis at 130px, size), **product card** (210px wide: 110px picture area with gradient + emoji 54px, name, "সাইজ: …", price in 500), **unsupported** ("এই ধরনের মেসেজ এখানে দেখানো যায় না।" italic muted — never hidden).
- Typing bubble (AI only): three 7px dots, staggered bounce.
- "Scroll to bottom" FAB: 36px circle bottom-right, shows when >120px from bottom, with unread count badge.
- Gestures: **long-press 430ms** or right-click selects; **swipe right** replies (resistance after 56px: extra distance × .28; at ≥56px the reply icon fills `--cr` and the device vibrates 12ms; release springs back 380ms). Reactions bar (👍 ❤️ 😂 😮 😢 🙏) appears **only for customer messages**; tapping the same emoji again removes it. Forward is hidden for customer messages and unsupported messages; copy only for text.
- Reply bar above the composer: 3px green bar, name + one-line preview, close button.

### 6.3 Composer
Pill input (min-height 40, radius 20, `--s1`, 1px border) with auto-growing textarea (13px, 38px → max 96px), paperclip button and camera button (camera collapses to width 0 once text is typed). Round 40px send button (`--cr`): shows **mic** when empty, **arrow** when text exists (icon cross-rotates, 280ms spring). Enter sends, Shift+Enter newline. Offline: input 45% opacity, placeholder "ইন্টারনেট নেই". 24h window closed: input replaced by a card — clock icon, "২৪ ঘণ্টা পার হয়ে গেছে", "কাস্টমার নতুন মেসেজ দিলে আবার উত্তর দেওয়া যাবে।"

### 6.4 Voice recording (fixed design)
Tapping the mic starts recording. The text input **disappears** and the recorder takes its exact place (flex:1, height 40, radius 20, `--s1`, 1px border): [trash button 34px in `--er`] [9px red pulsing dot] [timer, e.g. ০:০৭, min-width 32] [live waveform: bars 2.5px wide, gap 2, heights 3–23px, right-aligned, last 40 samples, new sample every 90ms, bars `--tx` at 55% opacity]. The round send button stays on the right showing the **arrow**. Tap arrow → send (if ≥ 1s; otherwise toast "ভয়েস খুব ছোট"). Tap trash → discard. Leaving the chat discards. Device vibrates 12ms on start.

---

## 7. Images

- **Pick**: gallery supports multiple selection; camera takes one. Max **10** images (extra ones are cut, toast "সর্বোচ্চ ১০টি ছবি").
- **Preview before send** (full-screen black): close ✕ top-left; counter "২/৪" top-right (only when >1); large current image; thumbnail strip at bottom (52×52, radius 10, 8px gap, current has 2px white border, others 65% opacity; each thumb has a 16px ✕ to remove; a dashed "+" tile adds more while < 10); round send button bottom-right with a count badge when >1. No caption (Messenger/Instagram do not accept captions on images).
- **In chat** (width 220px, 2px gap, radius 13): 1 image = single; 2 = two columns, rows 150px; 3 = first image full-width 150px on top, two below at 100px; 4 = 2×2, rows 108px; >4 = show first 4, the 4th has a 50% black overlay with "+<n>" (22px white). Time/status pill bottom-right on the group. One status for the whole group.
- **Viewer** (black): back arrow + sender name (+ "৩/৫" when multiple), image centred (max-width 100%), prev/next 40px translucent circles, swipe left/right (>50px) changes image. Tapping an image in chat opens the viewer at that image.

---

## 8. Channel capability rules (from the real APIs)

| Channel | Documents | "Delivered" tick |
|---|---|---|
| WhatsApp | yes | yes |
| Messenger | yes | yes |
| Instagram | **no** (attach sheet has no ডকুমেন্ট button; forward of files disabled) | **no** |

Attach sheet: round 52px buttons — গ্যালারি, ক্যামেরা, ডকুমেন্ট (if allowed), পণ্য. Product picker lists the 3 catalogue items (avatar tile with gradient + emoji, name, price); tapping sends the card immediately.
Forward sheet: lists other chats; a chat is greyed (45%, not tappable) with reason "২৪ ঘণ্টা পার হয়ে গেছে" or "এই চ্যানেলে ডকুমেন্ট পাঠানো যায় না". Forwarding sends a plain copy (no "forwarded" label) and turns that chat's AI off.
Message info sheet: sent time, delivered time (if channel supports), seen time, channel, sender.

---

## 9. Behaviour & timing rules

- **24-hour window**: composer is open only if the last *customer* message is < 24h old.
- Sending as seller **turns the AI off** for that chat (toast "আপনি রিপ্লাই দিচ্ছেন, AI বন্ধ হয়েছে"); the AI chip toggles it back (toast "AI আবার রিপ্লাই দিবে").
- Delivery simulation: sending → sent after 450ms → delivered +650ms (if channel supports) → seen +1300ms (1600ms on Instagram) → customer auto-reply 1600ms later. Offline: status becomes failed.
- AI reply: 800ms wait, typing bubble 1900ms, then (if text mentions দাম/জুতা/আছে/কালার/শার্ট/জ্যাকেট) a product card then a text, 500ms apart.
- In-app notification banner for other chats: slides down with spring, auto-hides after 3200ms, tap opens that chat. Toasts last 1900ms.
- Relative time labels refresh every 60s while the inbox is visible.
- Connection: going offline shows banners and greys the composer; coming back shows "সিঙ্ক হচ্ছে" for 1200ms then "লাইভ".

---

## 10. Customer profile screen (opens when the chat header name is tapped)

Header: back button + "কাস্টমারের তথ্য" 15px/500, bottom border. Scrolling body, cards `.pfc` (margin 10/12/0, padding 14, radius 18, `--s1`, 1px border, small title 12px muted).

Order of blocks, top to bottom:
1. **Hero** — 76px avatar with 24px channel badge, name 19px/500, sub line `<channel>` + (WhatsApp: phone number · Instagram: @username), then the **customer-type tag**.
2. **Quick actions** — মেসেজ (back to chat), নম্বর কপি (only if a phone number exists; toast "নম্বর কপি হয়েছে"), AI বন্ধ/চালু করুন.
3. **Verdict card** (one of four variants, §11).
4. **অর্ডারের সারাংশ** — stat tiles + rows (only when at least one order finished).
5. **কথা বলা আর কেনার আচরণ** (returning) **or** **পরিচিতি** (brand-new).
6. **অর্ডারের ইতিহাস** — grouped by workspace/store.
7. **যোগাযোগ ও ডেলিভারি** — only rows with real data.
8. **যা নিয়ে জানতে চেয়েছেন** — chips, only if known.
9. **আপনার নোট** — textarea; toast "নোট সেভ হয়েছে" on blur.

Order history: each store group has a header (bag icon, store name, right side "<n>টি অর্ডার · ৳<successful total>"), then order rows: bold item line, `<date> · <order id>` muted, cancel reason in red under it, right side price and status chip (সফল green / বাতিল red / ফেরত amber / চলমান grey). Show the latest 3 per store; the rest are hidden behind "আরও <n>টি দেখুন" (toggles to "কম দেখুন"). Newest first. Dates like "১৯ অক্টো" (+ year if not current year). Money like `৳১০,৬০০` with Indian digit grouping.

---

## 11. Customer-type logic (exact)

Let `ok`, `cx` (cancelled), `rt` (returned), `run` (in progress) be order counts. `done = ok + cx + rt`. `rate = round(ok / done × 100)` (only if `done > 0`).

| Condition | Tag text | Tone |
|---|---|---|
| no orders, talks ≤ 1 | নতুন কাস্টমার | neutral |
| no orders, talks ≥ 4 | অনেকবার জিজ্ঞেস করেছেন, কেনেননি | amber |
| no orders, 2–3 talks | এখনো কেনেননি | neutral |
| orders but `done = 0` | প্রথম অর্ডার চলছে | neutral |
| `done < 3` and rate = 100 | নতুন, কিন্তু ভালো শুরু | green |
| `done < 3` and rate < 100 | সতর্ক থাকুন | red |
| rate ≥ 85 | ভরসাযোগ্য কাস্টমার | green |
| rate 60–84 | মাঝারি কাস্টমার | amber |
| rate < 60 | ঝুঁকিপূর্ণ কাস্টমার | red |

Verdict card variants:
- `done > 0`: 68px conic-gradient ring with the percentage inside (colour = tone), headline "<done>টির মধ্যে <ok>টি অর্ডার সফল", caption "সফল অর্ডারের হার", then bullet reasons (green/red/amber/grey dot): "<n>টি অর্ডার ঠিকমতো নিয়েছেন"; "কখনো বাতিল বা ফেরত দেননি" (when none cancelled/returned); "<n>বার অর্ডার বাতিল করেছেন। সর্বশেষ কারণ: <reason>"; "<n>টি পণ্য ফেরত দিয়েছেন"; "<n>টি অর্ডার এখন চলছে"; and for red tone "অর্ডার নেওয়ার আগে ফোনে কনফার্ম করুন, সম্ভব হলে অগ্রিম নিন".
- orders exist but none finished: icon card "প্রথম অর্ডার চলছে" + explanation. **No percentage, no counts.**
- brand-new (no orders, talks ≤ 1): icon card "এখনো কোনো অর্ডার নেই" + explanation.
- talked a lot, no orders: icon card "এখনো কিছু কেনেননি" + "<n>বার কথা বলেছেন, মোট <n>টি মেসেজ দিয়েছেন, কিন্তু কোনো অর্ডার হয়নি।"

Stat tiles show: মোট অর্ডার always; সফল / বাতিল / ফেরত / চলমান **only when > 0**. Extra rows: মোট কেনাকাটা (needs ≥ 1 successful), গড় অর্ডার (needs ≥ 2 successful), শেষ অর্ডার.

**First-time customer rule**: a brand-new customer sees only: hero + tag, quick actions, "এখনো কোনো অর্ডার নেই" card, "পরিচিতি" (প্রথম মেসেজ time, চ্যানেল, their first message text), contact rows that exist, notes. No tiles, no ring, no rate, no history, no behaviour card, no zeros.

---

## 12. Demo data (must match)

Conversations (id · name · channel · AI · unread): 1 আয়েশা খাতুন WA on 2 · 2 রফিক হোসেন IG on 1 · 3 ফারিয়া আক্তার Messenger on 0 · 4 নাসির উদ্দিন WA **off** 0 · 5 সুমি IG on 0 · 6 মিজান Messenger **off** 0 · 7 তানভীর আহমেদ WA on 1 (new customer, first message "ভাইয়া, আপনাদের পেজে শার্ট আছে?" 4 minutes ago).
Catalogue: কটন ক্যাজুয়াল শার্ট ৳১,২৫০ (M, L, XL) 👕 · লেদার স্নিকার ৳২,৮০০ (৪০, ৪১, ৪২) 👟 · ডেনিম জ্যাকেট ৳৩,৫০০ (M, L) 🧥.
Workspaces/stores: ফ্যাশন হাউস, শু কর্নার, জেন্টস ওয়্যার. Per-customer message lists and the full order histories (ids, items, amounts, ages, statuses, cancel reasons) are the `convs` and `PROF` constants in Appendix A — copy them unchanged.

---

## 13. State catalogue

Every state below can be reached with `window.__step('<name>')`; use it to verify your build visually against the reference.

| # | `__step` name | Title | What it shows |
|---|---|---|---|
| 1 | `list` | ইনবক্স তালিকা | সব চ্যানেলের কথোপকথন একসাথে, নতুন কার্যকলাপ আগে। অ্যাভাটারের কোণের ছোট আইকন বলে মেসেজ কোথা থেকে এসেছে। উপরের ডানে ফিল্টার বাটন। |
| 2 | `list-filter` | ফিল্টার চিপ: অপঠিত | সব, অপঠিত, আর ওয়ার্কস্পেসে যে চ্যানেল আছে। সংখ্যা সরাসরি চিপে। |
| 3 | `list-filter-channel` | ফিল্টার চিপ: চ্যানেল | একটা চ্যানেল বাছলে শুধু সেই চ্যানেলের চ্যাট। |
| 4 | `list-filter-sheet` | ফিল্টার শিট | চ্যানেল, স্ট্যাটাস (AI উত্তর দিচ্ছে / আপনি / উত্তরহীন), সময়। ফিল্টার চালু থাকলে বাটনে ডট। |
| 5 | `list-offline` | ইনবক্স অফলাইন | ইন্টারনেট না থাকলে ব্যানার আর অ্যাম্বার স্ট্যাটাস। নেট এলে নিজে থেকে ঠিক হয়, আবার পেয়ার করতে হয় না। |
| 6 | `list-notif` | অ্যাপের ভেতরে নোটিফিকেশন | অন্য চ্যাটে মেসেজ এলে উপরে ব্যানার, ৩.২ সেকেন্ড পরে সরে যায়। চাপলে সেই চ্যাট। অ্যাপ ব্যাকগ্রাউন্ডে থাকলে সিস্টেম নোটিফিকেশন। |
| 7 | `chat-open` | চ্যাট খোলা | কাস্টমার বাঁদিকে, AI আর আপনি ডানদিকে। হেডারে কাস্টমারের নাম আর AI চালু/বন্ধ চিপ। নামে চাপলে কাস্টমারের পুরো তথ্য খোলে। কল, ভিডিও কল বা মেনু নেই। |
| 8 | `profile-regular` | কাস্টমারের তথ্য: ভরসাযোগ্য কাস্টমার | হেডারে নামে চাপলে এই পাতা খোলে। উপরে নাম, চ্যানেল আর “কেমন কাস্টমার” ট্যাগ। নিচে সফল অর্ডারের হার, মোট অর্ডার, সফল, বাতিল, মোট কেনাকাটা, আর কতবার কথা বলে কতবার কিনেছেন। |
| 9 | `profile-orders` | অর্ডারের ইতিহাস (স্টোর অনুযায়ী) | কাস্টমার কোন ওয়ার্কস্পেস বা স্টোর থেকে কী কিনেছেন, স্টোর ধরে আলাদা দলে। প্রতিটি অর্ডারে তারিখ, দাম আর অবস্থা। বাতিল হলে কারণও লেখা থাকে। প্রতি স্টোরে সর্বশেষ ৩টি দেখায়, বাকিগুলো “আরও দেখুন” চাপলে। |
| 10 | `profile-risky` | কাস্টমারের তথ্য: ঝুঁকিপূর্ণ কাস্টমার | বেশিরভাগ অর্ডার বাতিল করলে লাল ট্যাগ আসে। সাথে বাতিলের কারণ আর কী করা ভালো তার ছোট পরামর্শ। |
| 11 | `profile-new` | কাস্টমারের তথ্য: নতুন কাস্টমার | প্রথমবার মেসেজ করলে যে তথ্য এখনো নেই তা “০” বা ফাঁকা হিসেবে দেখানো হয় না, পুরো অংশটাই বাদ যায়। শুধু যা জানা আছে তা থাকে: চ্যানেল, প্রথম মেসেজ ও তার লেখা। অর্ডারের জায়গায় এক লাইনের ব্যাখ্যা। |
| 12 | `profile-lookers` | কাস্টমারের তথ্য: বারবার জিজ্ঞেস করেন, কেনেননি | অনেকবার কথা বলেছেন কিন্তু কোনো অর্ডার হয়নি, এমন কাস্টমারের জন্য আলাদা ট্যাগ। কী কী নিয়ে জানতে চেয়েছেন তাও দেখায়। |
| 13 | `profile-first-order` | কাস্টমারের তথ্য: প্রথম অর্ডার চলছে | ডেলিভারি না হওয়া পর্যন্ত সফল অর্ডারের হার দেখানো হয় না, কারণ তখন হিসাবটা অর্থহীন। |
| 14 | `chat-ai-typing` | AI লিখছে | হেডারের নিচে সবুজ লেখা, আর তালিকার শেষে তিন ডটের বাবল। কাস্টমার টাইপ করছে কি না চ্যানেল জানায় না, তাই সেটা নেই। |
| 15 | `chat-select-customer` | মেসেজ ধরে রাখা: কাস্টমার | উপরে রিঅ্যাকশন বার। হেডার ঢেকে রিপ্লাই, ফরওয়ার্ড নেই (কাস্টমারের মেসেজ), কপি, তথ্য। |
| 16 | `chat-reacted` | রিঅ্যাকশন দেওয়া | মেসেজের নিচের কোণে ছোট চিপ। একই ইমোজিতে আবার চাপলে মুছে যায়। |
| 17 | `chat-select-own` | মেসেজ ধরে রাখা: AI বা আপনার | রিঅ্যাকশন বার নেই। হেডারে রিপ্লাই, ফরওয়ার্ড, কপি, তথ্য। |
| 18 | `chat-swipe` | সোয়াইপ করে রিপ্লাই | ডানে টানলে আইকন আসে, সীমা পেরোলে আইকন উল্টে যায় আর হালকা কাঁপুনি। ছেড়ে দিলে বাবল স্প্রিং করে ফেরে। |
| 19 | `chat-reply-bar` | রিপ্লাই বার | কম্পোজারের উপরে উদ্ধৃতি বার। পাঠালে বাবলের ভেতরে উদ্ধৃতি, চাপলে আসল মেসেজে লাফ দিয়ে ফ্ল্যাশ। |
| 20 | `attach-sheet` | অ্যাটাচ শিট | গ্যালারি, ক্যামেরা, ডকুমেন্ট, পণ্য। |
| 21 | `attach-sheet-ig` | অ্যাটাচ শিট: Instagram | Instagram ডকুমেন্ট নেয় না, তাই বাটনটাই থাকে না। চ্যানেলের ক্ষমতা ব্যাকএন্ড থেকে আসে। |
| 22 | `product-picker` | পণ্য বাছাই | ক্যাটালগ থেকে পণ্য। চাপলেই কার্ড চলে যায়। |
| 23 | `image-preview` | ছবি পাঠানোর আগে | গ্যালারি থেকে একসাথে অনেক ছবি বাছা যায়। বাছার পর পুরো স্ক্রিনে প্রিভিউ। ক্যাপশন নেই (Messenger আর Instagram ছবিতে ক্যাপশন নেয় না)। |
| 24 | `images-preview` | একসাথে ৪টি ছবি: পাঠানোর আগে | নিচে ছোট ছবির সারি। যেটায় চাপবেন সেটা বড় হয়ে দেখা যায়। ছোট × দিয়ে বাদ দেওয়া যায়, “+” দিয়ে আরও ছবি যোগ (সর্বোচ্চ ১০টি)। পাঠানোর বাটনে মোট ছবির সংখ্যা। |
| 25 | `images-2` | ২টি ছবি পাঠানো | চ্যাটে পাশাপাশি দুটি। সময় আর টিক নিচের ডানে, একই বাবলে। |
| 26 | `images-3` | ৩টি ছবি পাঠানো | উপরে একটি চওড়া ছবি, নিচে দুটি। |
| 27 | `images-4` | ৪টি ছবি পাঠানো | ২×২ গ্রিড। পুরো গ্রুপের একটাই টিক, আলাদা আলাদা নয়। |
| 28 | `images-received-5` | কাস্টমার ৫টি ছবি পাঠালে | গ্রিডে প্রথম ৪টি দেখায়, চতুর্থটির উপর বাকি ছবির সংখ্যা (“+১”)। চাপলে সব ছবি বড় করে দেখা যায়। |
| 29 | `images-viewer` | একাধিক ছবি বড় করে দেখা | ডানে-বাঁয়ে টেনে বা তীরে চেপে পরের ছবি। উপরে নামের পাশে কত নম্বর ছবি তা লেখা (যেমন ৩/৫)। |
| 30 | `image-sending` | ছবি: পাঠানো হচ্ছে | ছবির ভেতরে নিচের ডানে সময় আর ঘড়ি। |
| 31 | `image-sent` | ছবি: পাঠানো হয়েছে | এক ধূসর টিক। |
| 32 | `image-delivered` | ছবি: পৌঁছেছে | দুই ধূসর টিক, দ্বিতীয়টা পাশ থেকে স্লাইড করে আসে। Instagram-এ এই ধাপ নেই। |
| 33 | `image-seen` | ছবি: দেখেছে | টিক নীল হয়ে যায় (৩০০ মি.সে. ক্রসফেড)। একই চার ধাপ টেক্সটেও। |
| 34 | `image-received` | কাস্টমারের ছবি | বাঁদিকে, ২২০ ডিপি পর্যন্ত চওড়া। চাপলে বড় করে দেখা। |
| 35 | `image-viewer` | ছবি বড় করে দেখা | কালো ব্যাকগ্রাউন্ড, উপরে পাঠকের নাম, পিঞ্চে জুম। |
| 36 | `product-card` | পণ্যের কার্ড | AI বা আপনি পণ্য পাঠালে কাস্টমার যা দেখে তা-ই। কার্ডে চাপার মতো বাটন নেই। |
| 37 | `voice-recording` | ভয়েস রেকর্ডিং | রেকর্ডিং শুরু হলে লেখার বক্স সরে গিয়ে পুরো জায়গায় রেকর্ডার আসে: বাঁয়ে ফেলে দেওয়ার বাটন, লাল ডট, সময় আর কথার সাথে চলা তরঙ্গ। ডানে পাঠানোর বাটন। ১ সেকেন্ডের কম হলে পাঠানো হয় না, টোস্টে জানায়। |
| 38 | `voice-message` | ভয়েস মেসেজ | প্লে বাটন আর ২৬ বারের তরঙ্গ। চালালে বার একে একে ভরে। |
| 39 | `doc-message` | ডকুমেন্ট মেসেজ | ফাইলের নাম আর সাইজ। |
| 40 | `sticker-unsupported` | স্টিকার ও অসমর্থিত মেসেজ | স্টিকার বাবল ছাড়া। চেনা যায় না এমন মেসেজ লুকানো হয় না, নোট দেখায়। |
| 41 | `info-sheet` | মেসেজ তথ্য | পাঠানো, পৌঁছেছে, দেখেছে, চ্যানেল, কে পাঠিয়েছে। সময় সত্যিকারের ইভেন্ট থেকে, আন্দাজে না। |
| 42 | `forward-sheet` | ফরওয়ার্ড শিট | অন্য চ্যাট বেছে নিলে একই মেসেজের কপি যায়, “ফরওয়ার্ডেড” লেবেল নেই। ২৪ ঘণ্টা পেরোনো চ্যাট ধূসর। |
| 43 | `window-closed` | ২৪ ঘণ্টা পার | ইনপুটের জায়গায় নোটিশ। কাস্টমার নতুন মেসেজ দিলে নিজে থেকে খুলে যায়। |
| 44 | `chat-offline` | চ্যাট অফলাইন | ব্যানার, ইনপুট ধূসর, উত্তর পাঠানো যায় না। |
| 45 | `send-failed` | পাঠানো ব্যর্থ | লাল “!” আইকন, চাপলে আবার চেষ্টা। |
| 46 | `composer-typing` | লেখার সময় কম্পোজার | লেখা শুরু করলে ক্যামেরা সরে যায়, মাইক ঘুরে পাঠানোর তীর হয়। |
| 47 | `chat-light` | চ্যাট: লাইট থিম | একই লেআউট, শুধু রং বদলায়। |
| 48 | `list-light` | তালিকা: লাইট থিম | একই লেআউট, শুধু রং বদলায়। |
| 49 | `profile-light` | কাস্টমারের তথ্য: লাইট থিম | একই লেআউট, শুধু রং বদলায়। |

---

## 14. Things that must never change when porting

- Bengali digits everywhere; times as `০৭:৫৪`; durations as `০:০৭`.
- The five message statuses and their icons; Instagram skips "delivered".
- AI bubbles are `--s2`, seller bubbles `--cr`, customer bubbles `--s1`.
- Reactions only on customer messages; forward never on customer messages.
- The voice recorder replaces the input (it never overlaps it).
- The profile page never shows empty/zero data (§1, §11).
- Everything is driven by tokens in §3; no hard-coded extra colours.

## 15. Acceptance checklist (report pass/fail for each)

1. Phone frame, tokens and fonts match §2–§3 in dark **and** light themes.
2. Inbox: chips, filter sheet, offline banner, unread pills, channel badges, pull-to-refresh, sorting animation.
3. Chat: all message types, grouping, tails, status ticks (4 steps + failed), reactions, quotes, swipe-to-reply threshold 56px, long-press 430ms, selection bar, FAB.
4. Composer: mic ↔ arrow morph, camera collapse, auto-grow to 96px, offline and 24h-closed states.
5. Voice recorder replaces the input; trash, red dot, timer, live waveform, arrow send; <1s toast.
6. Images: multi-pick up to 10, preview strip, grid layouts for 1/2/3/4/5+, "+n" overlay, viewer with swipe and counter.
7. Channel rules: Instagram has no document button and no delivered tick.
8. Profile page: all nine blocks in order, verdict table in §11, store-grouped history with "আরও দেখুন", no zeros/nulls for new customers.
9. Every `__step` name in §13 renders its documented state.
10. No element, string, colour, animation or library that is not in this document or Appendix A.

---

## Appendix A — Complete reference source (`ekmivo-inbox.html`, verbatim)

Copy this file unchanged for a web build. For other stacks, treat every value in it as binding.

~~~~html
<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ekmivo ইনবক্স</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0}
body{background:#121211;color:#F1F0EA;font-family:"Hind Siliguri",system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:16px 8px 24px}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
.ph{--bg:#0F0F0E;--s1:#181817;--s2:#222220;--bd:#2C2C29;--tx:#F1F0EA;--mu:#8D8B84;--ok:#3DDC97;--wr:#F5B544;--er:#F2685B;--okbg:#12301F;--wrbg:#33260D;--erbg:#3A1B18;--cr:#F1F0EA;--ink:#111;--seen:#1E90E0;
--out:cubic-bezier(.2,.8,.2,1);--spring:cubic-bezier(.34,1.56,.64,1);
width:360px;max-width:100%;height:720px;max-height:calc(100vh - 90px);min-height:560px;position:relative;background:var(--bg);color:var(--tx);border-radius:34px;border:6px solid #2C2C29;overflow:hidden;font-size:14px}
.ph.light{--bg:#F4F3EE;--s1:#fff;--s2:#ECEAE2;--bd:#D9D8D1;--tx:#1B1B19;--mu:#6B6A64;--ok:#14935C;--wr:#B7791F;--er:#D6453A;--okbg:#DDF3E8;--wrbg:#FBEFD3;--erbg:#F9DEDA;--cr:#1B1B19;--ink:#fff}
@media(max-width:480px){body{padding:0}.ph{width:100vw;height:100vh;max-height:none;border:0;border-radius:0}}
svg.i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
svg.i.fill{fill:currentColor}
.scr{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--bg);transition:transform .32s var(--out);will-change:transform}
#sChat{transform:translateX(100%)}
.ph.chat #sChat{transform:none}.ph.chat #sInbox{transform:translateX(-24%)}
#dim{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .32s var(--out);z-index:3}
.ph.chat #dim{opacity:.35}
.top{display:flex;align-items:center;gap:10px;padding:16px 16px 8px;flex:none}
.logo{width:34px;height:34px;border-radius:10px;background:var(--cr);color:var(--ink);display:flex;align-items:center;justify-content:center;font-weight:500;font-size:16px;flex:none}
.ttl{font-size:17px;font-weight:500}
.chip{display:flex;align-items:center;gap:6px;font-size:11px;padding:4px 10px;border-radius:99px;border:1px solid var(--bd);background:var(--s1);white-space:nowrap;transition:color .25s}
.dot{width:7px;height:7px;border-radius:50%;background:var(--ok);animation:bl 1.6s infinite}
@keyframes bl{50%{opacity:.35}}
.chip.off{color:var(--wr)}.chip.off .dot{background:var(--wr);animation:none}.chip.sync .dot{background:var(--mu);animation:none}
.fb{position:relative;width:34px;height:34px;border-radius:10px;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;color:var(--mu);flex:none}
.fb u{position:absolute;top:-3px;right:-3px;min-width:15px;height:15px;border-radius:99px;background:var(--cr);color:var(--ink);font-size:10px;text-decoration:none;display:flex;align-items:center;justify-content:center;padding:0 3px;animation:pp .3s var(--spring)}
@keyframes pp{from{transform:scale(0)}}
.fl{display:flex;gap:6px;padding:4px 16px 8px;overflow-x:auto;scrollbar-width:none;flex:none}
.fl button{font-size:12px;padding:5px 12px;border-radius:99px;border:1px solid var(--bd);color:var(--mu);white-space:nowrap;transition:background .2s,color .2s,border-color .2s,transform .12s}
.fl button:active{transform:scale(.95)}
.fl button.on{background:var(--cr);color:var(--ink);border-color:var(--cr)}
.ban{margin:0 16px;padding:0 12px;border-radius:12px;background:var(--wrbg);display:flex;gap:10px;align-items:flex-start;flex:none;max-height:0;opacity:0;overflow:hidden;transition:max-height .3s var(--out),opacity .25s,margin .3s,padding .3s}
.ban.show{max-height:90px;opacity:1;margin-top:4px;padding:10px 12px}
.ban svg{color:var(--wr);margin-top:2px}.ban b{display:block;font-size:13px;font-weight:500;color:var(--wr)}.ban span{font-size:12px;color:var(--mu);line-height:1.5}
#list{flex:1;overflow-y:auto;scrollbar-width:none;position:relative;overscroll-behavior:contain}
#ptr{height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;transition:height .22s var(--out)}
.spin{width:20px;height:20px;border-radius:50%;border:2px solid var(--bd);border-top-color:var(--tx);animation:sp 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.cv{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--bd);cursor:pointer;transition:background .12s}
.cv:active{background:var(--s1)}
.cv.in{animation:rowin .45s var(--out)}
@keyframes rowin{from{opacity:0;transform:translateY(-12px);background:var(--s2)}}
.av{position:relative;width:40px;height:40px;border-radius:50%;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:500;flex:none}
.bd{position:absolute;right:-3px;bottom:-3px;width:18px;height:18px;border-radius:50%;border:2px solid var(--bg);display:flex;align-items:center;justify-content:center;color:#fff}
.bd svg.i{width:10px;height:10px;stroke-width:2.2}
.cm{flex:1;min-width:0}.cm b{display:block;font-size:14px;font-weight:500;line-height:1.25}
.cm span{display:block;font-size:12px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm span.ty{color:var(--ok)}
.cr{display:flex;flex-direction:column;align-items:flex-end;gap:5px;font-size:11px;color:var(--mu)}
.un{min-width:18px;height:18px;padding:0 6px;border-radius:99px;background:var(--cr);color:var(--ink);font-size:11px;font-weight:500;display:flex;align-items:center;justify-content:center}
.empty{padding:60px 30px;text-align:center;color:var(--mu);font-size:13px;line-height:1.7}
.empty button{margin-top:12px;padding:7px 16px;border-radius:99px;border:1px solid var(--bd);color:var(--tx);font-size:13px}
.nav{margin-top:auto;display:flex;border-top:1px solid var(--bd);padding:8px 12px 14px;justify-content:space-around;flex:none}
.ni{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;color:var(--mu);padding:4px 12px;border-radius:12px}
.ni.on{color:var(--tx);background:var(--s2)}
/* chat header */
.chh{position:relative;display:flex;align-items:center;gap:8px;padding:12px 10px 10px 6px;border-bottom:1px solid var(--bd);flex:none;background:var(--bg);z-index:5}
.ib{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:var(--mu);flex:none;transition:background .15s}
.ib:active{background:var(--s2)}
.chh .nm{flex:1;min-width:0;line-height:1.2}
.chh .nm b{display:block;font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chh .nm span{display:block;font-size:11px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .2s}
.chh .nm span.g{color:var(--ok)}
.aic{font-size:11px;padding:4px 10px;border-radius:99px;border:1px solid var(--bd);background:var(--s1);display:flex;gap:6px;align-items:center;white-space:nowrap;transition:transform .12s}
.aic:active{transform:scale(.94)}
.aic i{width:6px;height:6px;border-radius:50%;background:var(--ok);transition:background .2s}.aic.offai i{background:var(--mu)}
#selbar{position:absolute;inset:0;background:var(--s2);display:flex;align-items:center;gap:2px;padding:0 8px 0 6px;z-index:6;opacity:0;pointer-events:none;transform:translateY(-6px);transition:opacity .18s,transform .2s var(--out)}
#selbar.show{opacity:1;pointer-events:auto;transform:none}#selbar .sp{flex:1}
.mwrap{flex:1;min-height:0;position:relative}
#msgs{position:absolute;inset:0;overflow-y:auto;scrollbar-width:none;display:flex;flex-direction:column;padding:10px 0 8px;overscroll-behavior:contain}
.sday{align-self:center;font-size:11px;color:var(--mu);background:var(--s1);padding:3px 10px;border-radius:99px;margin:10px 0 6px}
.udiv{align-self:center;font-size:11px;color:var(--tx);background:var(--s2);padding:3px 12px;border-radius:99px;margin:10px 0 6px}
.mr{position:relative;display:flex;padding:1px 14px;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.mr.first{margin-top:7px}
.mr.l{justify-content:flex-start}.mr.r{justify-content:flex-end}
.mr.sel{background:color-mix(in srgb,var(--cr) 14%,transparent)}
.mr.flash{animation:fl 1.2s}@keyframes fl{0%,60%{background:color-mix(in srgb,var(--cr) 18%,transparent)}}
.rep{position:absolute;left:18px;top:50%;margin-top:-14px;width:28px;height:28px;border-radius:50%;background:var(--s2);color:var(--mu);display:flex;align-items:center;justify-content:center;opacity:0;transition:background .15s,color .15s}
.rep svg{width:16px;height:16px}
.bc{display:flex;flex-direction:column;max-width:78%;position:relative;will-change:transform}
.bc.back{transition:transform .38s var(--spring)}
.mr.l .bc{align-items:flex-start}.mr.r .bc{align-items:flex-end}
.who{display:none;font-size:10.5px;color:var(--mu);margin:2px 4px 3px}
.mr.first .who{display:block}
.bub{padding:9px 12px;border-radius:16px;font-size:13px;line-height:1.5;word-break:break-word;white-space:pre-wrap;position:relative;transition:transform .12s}
.mr.pressing .bub{transform:scale(.985)}
.mr.l .bub{background:var(--s1)}
.bub.ba{background:var(--s2)}
.bub.bs{background:var(--cr);color:var(--ink)}
.mr.l.last .bub{border-bottom-left-radius:5px}
.mr.r.last .bub{border-bottom-right-radius:5px}
.bub.bs .mt{opacity:.65}
.mt{float:right;margin:7px 0 -3px 10px;font-size:10px;color:var(--mu);display:inline-flex;gap:3px;align-items:center;line-height:1;white-space:nowrap}
.mrow{text-align:right;margin-top:3px;height:12px}.mrow .mt{float:none;margin:0}
.tk{display:inline-flex;align-items:center}.tk svg{width:13px;height:13px;stroke-width:2.2}
.dbl{display:inline-flex;color:inherit;transition:color .3s}.dbl svg+svg{margin-left:-8px}.dbl.seen{color:var(--seen)}
.bub.bs .dbl.seen{color:var(--seen);opacity:1}
.tk.pop{animation:tp .4s var(--spring)}.tk.pop .t2{animation:t2 .24s var(--out)}
@keyframes tp{from{transform:scale(.4);opacity:.2}}@keyframes t2{from{transform:translateX(-7px);opacity:0}}
.fail{width:13px;height:13px;border-radius:50%;background:var(--er);color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.mr.new.out .bc{animation:bout .3s var(--spring);transform-origin:bottom right}
.mr.new.in .bc{animation:bin .24s var(--out);transform-origin:bottom left}
@keyframes bout{from{opacity:0;transform:translateY(18px) scale(.9)}}
@keyframes bin{from{opacity:0;transform:translateY(8px) scale(.96)}}
.qt{background:rgba(127,127,127,.16);border-left:3px solid var(--ok);border-radius:8px;padding:5px 8px;margin:-2px -4px 6px;font-size:12px;cursor:pointer;user-select:none}
.qt b{display:block;font-size:11px;font-weight:500;color:var(--ok)}.qt span{display:block;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.rx{align-self:flex-end;margin:-8px 8px 0 0;background:var(--s2);border:1px solid var(--bd);border-radius:99px;padding:0 6px;font-size:13px;line-height:20px;z-index:1;animation:pp .32s var(--spring)}
.mr.l .rx{align-self:flex-start;margin:-8px 0 0 8px}
.stk{width:120px;height:120px;display:flex;align-items:center;justify-content:center;font-size:76px}
.ovm{position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.5);color:#fff;border-radius:99px;padding:2px 7px;font-size:10px;display:flex;gap:3px;align-items:center}
.ovm .tk{color:#fff}.ovm .dbl.seen{color:#53C7FF}
.imgw{position:relative;border-radius:13px;overflow:hidden;cursor:pointer;min-width:150px}
.imgw img{display:block;width:220px;max-width:100%;max-height:260px;object-fit:cover;animation:fi .35s}
@keyframes fi{from{opacity:0}}
.imgw .ph_{width:220px;max-width:100%;height:150px;background:linear-gradient(135deg,#8a6a4f,#3b2a20);display:flex;align-items:center;justify-content:center;font-size:54px}
.gw{display:grid;gap:2px;width:220px;max-width:100%}.gw .gt{position:relative;overflow:hidden;min-width:0}
.gw .gt img{width:100%;height:100%;max-height:none;object-fit:cover;display:block}
.g2{grid-template-columns:1fr 1fr;grid-auto-rows:150px}.g3{grid-template-columns:1fr 1fr;grid-template-rows:150px 100px}.g3 .gt:first-child{grid-column:1/-1}.g4{grid-template-columns:1fr 1fr;grid-auto-rows:108px}
.gw .more{position:absolute;inset:0;background:rgba(0,0,0,.5);color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center}
#pvw img#pImg{bottom:150px;max-height:calc(100% - 210px)}
.pth{position:absolute;left:0;right:0;bottom:76px;display:flex;gap:8px;padding:0 16px;overflow-x:auto;z-index:2;scrollbar-width:none}.pth::-webkit-scrollbar{display:none}
.pth button{position:relative;width:52px;height:52px;border-radius:10px;overflow:hidden;flex:none;border:2px solid transparent;opacity:.65;color:#fff;font-size:24px;line-height:48px;text-align:center;transition:opacity .15s,border-color .15s}
.pth button.on{border-color:#fff;opacity:1}.pth button.add{border:1px dashed #777;opacity:1}
#pvw .pth img{position:static;display:block;width:100%;height:100%;object-fit:cover;margin:0;max-height:none}
.pth .rm{position:absolute;top:1px;right:1px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.7);font-size:12px;line-height:16px}
.sendb .cnt{position:absolute;right:-4px;top:-4px;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;background:var(--ink);color:var(--cr);border:1.5px solid var(--cr);font-size:11px;font-weight:500;line-height:15px;text-align:center;display:none}.sendb .cnt.on{display:block}
.vnav{position:absolute;top:50%;width:40px;height:40px;margin-top:-20px;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;z-index:3;display:flex;align-items:center;justify-content:center}#vPrev{left:10px}#vNext{right:10px}#vNext svg{transform:rotate(180deg)}
.bub.im{padding:3px}
.pc{padding:0;width:210px;overflow:hidden}
.pimg{height:110px;display:flex;align-items:center;justify-content:center;font-size:54px}
.pi{padding:8px 12px 0}.pi b{display:block;font-size:13px;font-weight:500}.pi span{font-size:11.5px;opacity:.7}.pp{font-weight:500;margin-top:2px}
.pc .mrow{padding:6px 10px 6px;margin:0}
.vn{display:flex;align-items:center;gap:8px;min-width:190px}
.pl{width:32px;height:32px;border-radius:50%;background:rgba(127,127,127,.25);display:flex;align-items:center;justify-content:center;flex:none}
.pl svg{width:14px;height:14px}
.wf{display:flex;align-items:center;gap:2px;height:26px;flex:1}.wf i{width:2.5px;border-radius:2px;background:currentColor;opacity:.3;transition:opacity .15s}.wf i.f{opacity:1}
.vd{font-size:11px;opacity:.7}
.fileb{display:flex;align-items:center;gap:10px;min-width:170px}.fileb .fi{width:34px;height:34px;border-radius:9px;background:rgba(127,127,127,.25);display:flex;align-items:center;justify-content:center}
.fileb b{font-weight:500;font-size:13px;display:block;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fileb span{font-size:11px;opacity:.7}
.unsup{color:var(--mu);font-style:italic}
#typ{display:none;padding:1px 14px;margin-top:7px}#typ.show{display:flex;animation:bin .24s var(--out)}
#typ .bub{border-bottom-right-radius:5px}
.tdots{display:flex;gap:4px;padding:5px 2px}.tdots i{width:7px;height:7px;border-radius:50%;background:var(--mu);animation:td 1.2s infinite}
.tdots i:nth-child(2){animation-delay:.15s}.tdots i:nth-child(3){animation-delay:.3s}
@keyframes td{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}
#fab{position:absolute;right:14px;bottom:10px;width:36px;height:36px;border-radius:50%;background:var(--s2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;color:var(--tx);opacity:0;transform:translateY(10px) scale(.8);pointer-events:none;transition:opacity .2s,transform .25s var(--spring);z-index:4}
#fab.show{opacity:1;transform:none;pointer-events:auto}
#fab svg{transform:rotate(-90deg)}
#fab u{position:absolute;top:-7px;right:-3px;min-width:18px;height:18px;border-radius:99px;background:var(--cr);color:var(--ink);font-size:11px;font-weight:500;text-decoration:none;display:none;align-items:center;justify-content:center;padding:0 5px}
#fab.has u{display:flex}
#rbar{margin:0 12px;padding:0 10px;background:var(--s1);border-radius:12px 12px 0 0;border-left:3px solid var(--ok);display:flex;align-items:center;gap:8px;flex:none;max-height:0;opacity:0;overflow:hidden;transition:max-height .22s var(--out),opacity .18s,padding .22s}
#rbar.show{max-height:56px;opacity:1;padding:8px 10px}
#rbar div{flex:1;min-width:0;font-size:12px}#rbar b{display:block;color:var(--ok);font-weight:500;font-size:11px}#rbar span{display:block;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.comp{position:relative;display:flex;align-items:flex-end;gap:8px;padding:8px 12px 14px;border-top:1px solid var(--bd);flex:none}
.inw{flex:1;min-height:40px;border-radius:20px;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:flex-end;padding:0 4px 0 12px;min-width:0}
.inw textarea{flex:1;min-width:0;background:none;border:0;outline:0;resize:none;color:var(--tx);font:inherit;font-size:13px;line-height:1.5;padding:9px 4px;max-height:96px;height:38px;transition:height .12s}
.inw textarea::placeholder{color:var(--mu)}
.inw .ib{width:32px;height:38px;border-radius:0}
#bCam{transition:width .2s var(--out),opacity .15s;overflow:hidden}#bCam.hide{width:0;opacity:0;pointer-events:none}
.sendb{position:relative;width:40px;height:40px;border-radius:50%;background:var(--cr);color:var(--ink);flex:none;transition:transform .15s var(--spring)}
.sendb:active{transform:scale(.88)}
.sendb svg{position:absolute;left:10px;top:10px;transition:transform .28s var(--spring),opacity .18s}
.sendb .s_mic{opacity:1}.sendb .s_snd{opacity:0;transform:rotate(-90deg) scale(.5)}
.sendb.has .s_mic{opacity:0;transform:rotate(90deg) scale(.5)}.sendb.has .s_snd{opacity:1;transform:none}
.sendb.recm .s_mic{opacity:0}.sendb.recm .s_snd{opacity:1;transform:none}
.comp.dis .inw,.comp.dis .sendb{opacity:.45;pointer-events:none}
.wcl{display:none;flex:1;align-items:flex-start;gap:10px;background:var(--s1);border:1px solid var(--bd);border-radius:14px;padding:10px 12px}
.wcl svg{color:var(--mu);margin-top:2px}.wcl b{display:block;font-size:13px;font-weight:500}.wcl span{font-size:12px;color:var(--mu);line-height:1.5}
.comp.closed .inw,.comp.closed .sendb{display:none}.comp.closed .wcl{display:flex}
.rec{order:-1;display:none;flex:1;min-width:0;height:40px;border-radius:20px;background:var(--s1);border:1px solid var(--bd);align-items:center;gap:8px;padding:0 14px 0 3px;font-size:13px}
.comp.recing .inw{display:none}.comp.recing .rec{display:flex;animation:bin .22s var(--out)}
.rec .ib{width:34px;height:34px;color:var(--er)}.rec>i{width:9px;height:9px;border-radius:50%;background:var(--er);animation:bl 1s infinite;flex:none}#recT{min-width:32px;flex:none}.rec .sp{flex:1;min-width:0;display:flex;gap:2px;align-items:center;justify-content:flex-end;height:26px;overflow:hidden}.rec .sp b{width:2.5px;flex:none;border-radius:2px;background:var(--tx);opacity:.55;transition:height .09s}
@keyframes wv{from{height:4px}to{height:18px}}
.ov{position:absolute;inset:0;z-index:30;visibility:hidden;transition:visibility 0s .3s}
.ov.show{visibility:visible;transition:none}
.bk{position:absolute;inset:0;background:rgba(0,0,0,.5);opacity:0;transition:opacity .25s}.ov.show .bk{opacity:1}
.sheet{position:absolute;left:0;right:0;bottom:0;background:var(--s2);border-radius:24px 24px 0 0;padding:16px 18px 22px;border-top:1px solid var(--bd);transform:translateY(100%);transition:transform .32s var(--out);max-height:85%;overflow-y:auto;scrollbar-width:none}
.ov.show .sheet{transform:none}
.sheet h4{margin:0 0 12px;font-size:15px;font-weight:500;display:flex;align-items:center}
.sheet h4 button{margin-left:auto;font-size:12px;color:var(--mu)}
.sl{font-size:11px;color:var(--mu);margin:12px 0 6px}
.pills{display:flex;flex-wrap:wrap;gap:6px}.pills button{font-size:12px;padding:5px 12px;border-radius:99px;border:1px solid var(--bd);color:var(--mu);transition:background .2s,color .2s,border-color .2s,transform .12s}.pills button:active{transform:scale(.95)}.pills button.on{background:var(--cr);color:var(--ink);border-color:var(--cr)}
.btn{display:flex;align-items:center;justify-content:center;height:46px;border-radius:14px;font-size:15px;font-weight:500;width:100%;background:var(--cr);color:var(--ink);margin-top:16px;transition:opacity .12s}.btn:active{opacity:.88}
.grid4{display:flex;justify-content:space-around;text-align:center;font-size:12px;color:var(--mu)}
.grid4 div{display:flex;flex-direction:column;align-items:center;gap:6px}.grid4 button{width:52px;height:52px;border-radius:50%;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;color:var(--tx);transition:transform .15s var(--spring)}.grid4 button:active{transform:scale(.9)}
.ir{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--bd);font-size:13px}.ir:first-of-type{border-top:0}.ir span.v{margin-left:auto;color:var(--mu);font-size:12px}
.lr{display:flex;align-items:center;gap:12px;padding:8px 0;cursor:pointer;border-top:1px solid var(--bd)}
#rxbar{position:absolute;z-index:20;display:flex;background:var(--s2);border:1px solid var(--bd);border-radius:99px;padding:4px 8px;gap:2px;opacity:0;pointer-events:none;transform:scale(.7);transition:opacity .15s,transform .22s var(--spring)}
#rxbar.show{opacity:1;pointer-events:auto;transform:none}#rxbar button{font-size:22px;width:34px;height:34px;border-radius:50%}
#rxbar.show button{animation:pp .3s var(--spring) backwards}
#rxbar button:active{transform:scale(1.3)!important}
#toast{position:absolute;left:50%;bottom:96px;transform:translate(-50%,10px);background:var(--cr);color:var(--ink);font-size:12.5px;padding:8px 14px;border-radius:99px;opacity:0;pointer-events:none;transition:.25s;z-index:60;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}
#toast.show{opacity:1;transform:translate(-50%,0)}
#notif{position:absolute;left:10px;right:10px;top:10px;z-index:55;background:var(--s2);border:1px solid var(--bd);border-radius:16px;padding:10px 12px;display:flex;gap:10px;align-items:center;transform:translateY(-130%);transition:transform .38s var(--spring);cursor:pointer}
#notif.show{transform:none}#notif b{font-size:13px;font-weight:500;display:block}#notif span{font-size:12px;color:var(--mu);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#notif div{min-width:0;flex:1}
#viewer,#pvw{background:#000;color:#fff;z-index:40;opacity:0;transition:opacity .22s,visibility 0s .22s}
#viewer.show,#pvw.show{opacity:1}
#viewer .body{position:absolute;inset:0;transform:scale(.92);transition:transform .3s var(--out)}#viewer.show .body{transform:none}
#viewer img,#pvw img{position:absolute;left:0;right:0;top:56px;bottom:90px;margin:auto;max-width:100%;max-height:calc(100% - 150px)}
#viewer .vph{position:absolute;left:0;right:0;top:56px;bottom:90px;margin:auto;width:280px;height:200px;background:linear-gradient(135deg,#8a6a4f,#3b2a20);display:flex;align-items:center;justify-content:center;font-size:80px;border-radius:8px}
.vt{position:absolute;top:0;left:0;right:0;padding:14px 8px;display:flex;align-items:center;gap:8px;color:#fff;z-index:2}
.pvb{position:absolute;left:0;right:0;bottom:0;padding:10px 16px 18px;display:flex;justify-content:flex-end;z-index:2}
.ctl{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:14px;max-width:420px}
.ctl button{font-size:12.5px;padding:6px 12px;border-radius:99px;border:1px solid #34332F;background:#1E1E1C;color:#F1F0EA}
.ctl p{width:100%;text-align:center;margin:0;font-size:11.5px;color:#9A988F}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01s!important;transition-duration:.01s!important}}
body.embed{background:transparent;padding:0;min-height:0}body.embed .ctl{display:none}

/* header tap target */
.chi{display:flex;align-items:center;gap:8px;flex:1;min-width:0;text-align:left;border-radius:12px;padding:2px 6px 2px 2px;transition:background .15s}
.chi:active{background:var(--s2)}
/* customer profile */
#sProf{transform:translateX(100%)}
#sChat{transition:transform .32s var(--out),filter .32s}
.ph.prof #sProf{transform:none}.ph.prof #sChat{transform:translateX(-24%);filter:brightness(.7)}
.pfh{display:flex;align-items:center;gap:6px;padding:12px 10px 10px 6px;border-bottom:1px solid var(--bd);flex:none}.pfh b{font-size:15px;font-weight:500}
#pfBody{flex:1;overflow-y:auto;scrollbar-width:none;padding-bottom:24px;overscroll-behavior:contain}
.hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:18px 20px 6px}
.hero .av{width:76px;height:76px;font-size:26px}.hero .bd{width:24px;height:24px;right:-2px;bottom:-2px}.hero .bd svg.i{width:13px;height:13px}
.hero h2{margin:12px 0 2px;font-size:19px;font-weight:500}.hero .sub{font-size:12.5px;color:var(--mu)}
.tag{display:inline-flex;align-items:center;margin-top:10px;font-size:12px;padding:4px 12px;border-radius:99px}
.tag.ok{background:var(--okbg);color:var(--ok)}.tag.wr{background:var(--wrbg);color:var(--wr)}.tag.er{background:var(--erbg);color:var(--er)}.tag.mu{background:var(--s2);color:var(--tx)}
.qa{display:flex;justify-content:center;gap:10px;padding:14px 16px 4px}
.qa button{flex:1;max-width:104px;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 4px;border-radius:14px;background:var(--s1);border:1px solid var(--bd);font-size:11.5px;color:var(--tx);transition:transform .12s}
.qa button:active{transform:scale(.95)}.qa svg{color:var(--mu)}
.pfc{margin:10px 12px 0;padding:14px;border-radius:18px;background:var(--s1);border:1px solid var(--bd)}
.pfc h5{margin:0 0 10px;font-size:12px;font-weight:500;color:var(--mu)}
.vd2{display:flex;align-items:center;gap:14px}.vd2 b{display:block;font-size:14.5px;font-weight:500;line-height:1.4}.vd2 span{font-size:12px;color:var(--mu)}
.ring{--p:0;--c:var(--ok);width:68px;height:68px;border-radius:50%;background:conic-gradient(var(--c) calc(var(--p)*1%),var(--s2) 0);display:flex;align-items:center;justify-content:center;flex:none}
.ring.wr{--c:var(--wr)}.ring.er{--c:var(--er)}
.ring i{font-style:normal;width:54px;height:54px;border-radius:50%;background:var(--s1);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:500}
.rs{margin:12px 0 0;padding:0;list-style:none;font-size:12.5px;line-height:1.55}
.rs li{display:flex;gap:8px;padding:3px 0}.rs li:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--mu);margin-top:7px;flex:none}
.rs li.ok:before{background:var(--ok)}.rs li.er:before{background:var(--er)}.rs li.wr:before{background:var(--wr)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:8px;margin-bottom:10px}
.tile{background:var(--s2);border-radius:12px;padding:10px 4px;text-align:center}.tile b{display:block;font-size:18px;font-weight:500}.tile span{font-size:11px;color:var(--mu)}
.tile.ok b{color:var(--ok)}.tile.er b{color:var(--er)}.tile.wr b{color:var(--wr)}
.kv{display:flex;align-items:flex-start;gap:12px;padding:9px 0;border-top:1px solid var(--bd);font-size:13px}.kv:first-of-type{border-top:0;padding-top:0}.kv:last-child{padding-bottom:0}
.kv .k{color:var(--mu);flex:none}.kv .v{margin-left:auto;text-align:right;min-width:0;word-break:break-word}
.emp2{display:flex;gap:12px;align-items:flex-start}.emp2 .ic{width:40px;height:40px;border-radius:12px;background:var(--s2);display:flex;align-items:center;justify-content:center;flex:none;color:var(--mu)}
.emp2 b{display:block;font-size:14px;font-weight:500;margin-bottom:2px}.emp2 span{font-size:12.5px;color:var(--mu);line-height:1.6}
.stg{margin-top:14px}.stg:first-of-type{margin-top:0}
.sth{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;margin-bottom:2px}.sth svg{color:var(--mu);width:16px;height:16px}.sth span{margin-left:auto;font-size:11.5px;color:var(--mu);font-weight:400}
.ord{display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--bd)}.stg .sth+.ord{margin-top:6px}
.ord .l{flex:1;min-width:0}.ord .l b{display:block;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ord .l span{display:block;font-size:11.5px;color:var(--mu)}.ord .l span.why{color:var(--er);margin-top:1px}
.ord .r{text-align:right;flex:none;font-size:13px}.ord .r em{display:block;width:max-content;margin:3px 0 0 auto;font-style:normal;font-size:11px;padding:2px 8px;border-radius:99px}
.ord .r em.ok{background:var(--okbg);color:var(--ok)}.ord .r em.er{background:var(--erbg);color:var(--er)}.ord .r em.wr{background:var(--wrbg);color:var(--wr)}.ord .r em.mu{background:var(--s2);color:var(--tx)}
.stg:not(.open) .ord.x{display:none}
.mo{display:block;width:100%;padding:8px 0 0;font-size:12px;color:var(--mu);text-align:center;border-top:1px solid var(--bd)}
.chips2{display:flex;flex-wrap:wrap;gap:6px}.chips2 span{font-size:12px;padding:4px 10px;border-radius:99px;background:var(--s2)}
.fmsg{font-size:13px;line-height:1.55;background:var(--s2);border-radius:12px;padding:9px 12px;margin-top:2px;word-break:break-word}
.nt{width:100%;min-height:64px;background:var(--s2);border:1px solid var(--bd);border-radius:12px;padding:10px;color:var(--tx);font:inherit;font-size:13px;line-height:1.5;resize:none;outline:0;display:block}
.nt::placeholder{color:var(--mu)}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<symbol id="act" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></symbol>
<symbol id="set" viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></symbol>
<symbol id="msg" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></symbol>
<symbol id="wa" viewBox="0 0 24 24"><path d="M12 4a8 8 0 00-6.9 12L4 20l4.1-1.1A8 8 0 1012 4z"/><path d="M9.5 9.5c.3 2 2.5 4.2 4.5 4.5"/></symbol>
<symbol id="ig" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="4"/><circle cx="12" cy="12" r="3.2"/><path d="M16.5 7.5h0"/></symbol>
<symbol id="ms" viewBox="0 0 24 24"><path d="M13 3L6 13h5l-1 8 7-10h-5z"/></symbol>
<symbol id="back" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></symbol>
<symbol id="snd" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="flt" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></symbol>
<symbol id="alt" viewBox="0 0 24 24"><path d="M12 4l9 16H3zM12 10v4M12 17h0"/></symbol>
<symbol id="clip" viewBox="0 0 24 24"><path d="M20 11l-8 8a5 5 0 01-7-7l8-8a3.5 3.5 0 015 5l-8 8a2 2 0 01-3-3l7-7"/></symbol>
<symbol id="cam" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></symbol>
<symbol id="mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></symbol>
<symbol id="chk" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></symbol>
<symbol id="x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
<symbol id="rep" viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M4 12h10a6 6 0 016 6v1"/></symbol>
<symbol id="fwd" viewBox="0 0 24 24"><path d="M15 7l5 5-5 5M20 12H10a6 6 0 00-6 6v1"/></symbol>
<symbol id="copy" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/></symbol>
<symbol id="info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/></symbol>
<symbol id="play" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></symbol>
<symbol id="pause" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></symbol>
<symbol id="img" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M3 17l5-4 4 3 3-2 6 4"/></symbol>
<symbol id="doc" viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7zM14 3v5h5"/></symbol>
<symbol id="bag" viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6zM9 8a3 3 0 016 0"/></symbol>
<symbol id="clk" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
<symbol id="trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></symbol>
</svg>

<div class="ph" id="ph">
  <div class="scr" id="sInbox">
    <div class="top"><div class="logo">e.</div><div class="ttl">ইনবক্স</div><div id="netChip" class="chip" style="margin-left:auto"><i class="dot"></i>লাইভ</div><button class="fb" id="fBtn" aria-label="ফিল্টার"><svg class="i"><use href="#flt"/></svg></button></div>
    <div class="fl" id="chips"></div>
    <div class="ban" id="inBan"><svg class="i"><use href="#alt"/></svg><div><b>ইন্টারনেট নেই</b><span>নেট এলে নতুন মেসেজ আসবে। এখন উত্তর পাঠানো যাবে না।</span></div></div>
    <div id="list"><div id="ptr"><div class="spin"></div></div><div id="rows"></div></div>
    <div class="nav"><div class="ni on"><svg class="i"><use href="#msg"/></svg>ইনবক্স</div><div class="ni"><svg class="i"><use href="#act"/></svg>SMS</div><div class="ni"><svg class="i"><use href="#set"/></svg>সেটিংস</div></div>
    <div id="dim"></div>
  </div>

  <div class="scr" id="sChat">
    <div class="chh" id="chh">
      <button class="ib" id="bBack" aria-label="ফিরে যান"><svg class="i"><use href="#back"/></svg></button>
      <button class="chi" id="chInfo" aria-label="কাস্টমারের তথ্য"><div class="av" id="chAv" style="width:34px;height:34px;font-size:13px"></div><div class="nm"><b id="chName"></b><span id="chSub"></span></div></button>
      <button class="aic" id="aiT"><i></i><span>AI চালু</span></button>
      <div id="selbar">
        <button class="ib" data-a="close" aria-label="বন্ধ"><svg class="i"><use href="#x"/></svg></button><span class="sp"></span>
        <button class="ib" data-a="reply" aria-label="রিপ্লাই"><svg class="i"><use href="#rep"/></svg></button>
        <button class="ib" data-a="fwd" aria-label="ফরওয়ার্ড"><svg class="i"><use href="#fwd"/></svg></button>
        <button class="ib" data-a="copy" aria-label="কপি"><svg class="i"><use href="#copy"/></svg></button>
        <button class="ib" data-a="info" aria-label="তথ্য"><svg class="i"><use href="#info"/></svg></button>
      </div>
    </div>
    <div class="ban" id="chBan"><svg class="i"><use href="#alt"/></svg><div><b>ইন্টারনেট নেই</b><span>নেট এলে নতুন মেসেজ আসবে। এখন উত্তর পাঠানো যাবে না।</span></div></div>
    <div class="mwrap">
      <div id="msgs"><div class="mr r" id="typ"><div class="bc"><div class="who" style="display:block">AI</div><div class="bub ba"><div class="tdots"><i></i><i></i><i></i></div></div></div></div></div>
      <button id="fab" aria-label="নিচে যান"><svg class="i"><use href="#back"/></svg><u id="fabN"></u></button>
    </div>
    <div id="rbar"><div><b id="rbN"></b><span id="rbT"></span></div><button class="ib" id="rbX" aria-label="বাতিল"><svg class="i"><use href="#x"/></svg></button></div>
    <div class="comp" id="comp">
      <div class="inw">
        <textarea id="inp" rows="1" placeholder="মেসেজ লিখুন…"></textarea>
        <button class="ib" id="bClip" aria-label="সংযুক্ত করুন"><svg class="i"><use href="#clip"/></svg></button>
        <button class="ib" id="bCam" aria-label="ক্যামেরা"><svg class="i"><use href="#cam"/></svg></button>
      </div>
      <button class="sendb" id="bSend" aria-label="পাঠান"><svg class="i s_mic"><use href="#mic"/></svg><svg class="i s_snd"><use href="#snd"/></svg></button>
      <div class="wcl"><svg class="i"><use href="#clk"/></svg><div><b>২৪ ঘণ্টা পার হয়ে গেছে</b><span>কাস্টমার নতুন মেসেজ দিলে আবার উত্তর দেওয়া যাবে।</span></div></div>
      <div class="rec"><button class="ib" id="recX" aria-label="বাতিল"><svg class="i"><use href="#trash"/></svg></button><i></i><span id="recT">০:০০</span><div class="sp" id="recW"></div></div>
    </div>
  </div>

  <div class="scr" id="sProf">
    <div class="pfh"><button class="ib" id="pfBack" aria-label="ফিরে যান"><svg class="i"><use href="#back"/></svg></button><b>কাস্টমারের তথ্য</b></div>
    <div id="pfBody"></div>
  </div>

  <div id="rxbar"></div>
  <div id="notif"><div class="av" id="nAv" style="width:34px;height:34px;font-size:13px"></div><div><b id="nT"></b><span id="nB"></span></div></div>
  <div class="ov" id="shw"><div class="bk" id="shBk"></div><div class="sheet" id="sh"></div></div>
  <div class="ov" id="viewer"><div class="vt"><button class="ib" id="vX" style="color:#fff"><svg class="i"><use href="#back"/></svg></button><b id="vN" style="font-weight:500"></b></div><div class="body" id="vB"></div><button class="vnav" id="vPrev" aria-label="আগের"><svg class="i"><use href="#back"/></svg></button><button class="vnav" id="vNext" aria-label="পরের"><svg class="i"><use href="#back"/></svg></button></div>
  <div class="ov" id="pvw"><div class="vt"><button class="ib" id="pX" style="color:#fff"><svg class="i"><use href="#x"/></svg></button><b id="pC" style="font-weight:500;font-size:13px;margin-left:auto;padding-right:8px"></b></div><img id="pImg" alt=""><div class="pth" id="pTh"></div><div class="pvb"><button class="sendb has" id="pSend" aria-label="পাঠান"><svg class="i s_snd"><use href="#snd"/></svg><span class="cnt" id="pCnt"></span></button></div></div>
  <div id="toast"></div>
</div>
<input type="file" id="fGal" accept="image/*" multiple hidden>
<input type="file" id="fCam" accept="image/*" capture="environment" hidden>
<input type="file" id="fDoc" hidden>

<div class="ctl">
  <button id="cNet">ইন্টারনেট বন্ধ করুন</button>
  <button id="cSim">কাস্টমারের মেসেজ আসুক</button>
  <button id="cOther">অন্য চ্যাটে নতুন মেসেজ</button>
  <button id="cReact">কাস্টমার রিঅ্যাক্ট করুক</button>
  <button id="cImgS">ছবি পাঠান (ডেমো)</button>
  <button id="cImgC">কাস্টমার ছবি পাঠাক</button>
  <button id="cImgM">একসাথে ৪টি ছবি পাঠান</button>
  <button id="cImgCM">কাস্টমার ৫টি ছবি পাঠাক</button>
  <button id="cTheme">লাইট থিম</button>
  <p>উপরের বাটনগুলো শুধু ডেমোর জন্য। আসল অ্যাপে এগুলো ব্যাকএন্ড ইভেন্ট থেকে আসবে।</p>
</div>

<script>
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const bn=n=>String(n).replace(/\d/g,d=>'০১২৩৪৫৬৭৮৯'[d]);
const I=(n,c='')=>`<svg class="i ${c}"><use href="#${n}"/></svg>`;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CH={wa:{n:'WhatsApp',c:'#25D366'},ig:{n:'Instagram',c:'#C13584'},ms:{n:'Messenger',c:'#0A7CFF'}};
/* what each channel's API really supports */
const CAP={wa:{doc:1,dlv:1},ms:{doc:1,dlv:1},ig:{doc:0,dlv:0}};
const badge=ch=>`<span class="bd" style="background:${CH[ch].c}">${I(ch)}</span>`;
const hm=ts=>{const d=new Date(ts);return bn(String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'))};
const mmss=s=>bn(Math.floor(s/60)+':'+String(s%60).padStart(2,'0'));
const rel=ts=>{const m=Math.floor((Date.now()-ts)/60000);if(m<1)return'এখন';if(m<60)return bn(m)+' মি';const h=Math.floor(m/60);if(h<24)return bn(h)+' ঘণ্টা';const d=Math.floor(h/24);return d==1?'গতকাল':bn(d)+' দিন'};
const dayLbl=ts=>{const a=new Date(ts).setHours(0,0,0,0),b=new Date().setHours(0,0,0,0),d=Math.round((b-a)/864e5);return d==0?'আজ':d==1?'গতকাল':bn(new Date(ts).getDate())+'/'+bn(new Date(ts).getMonth()+1)};
const now=Date.now(),MIN=60000;let uid=1;
const mk=(from,text,ago,x={})=>({id:uid++,from,type:'text',text,ts:now-ago*MIN,...(from==='c'?{}:{st:'seen'}),...x});
const PROD=[{name:'কটন ক্যাজুয়াল শার্ট',price:'১,২৫০',sizes:'M, L, XL',emo:'👕',g:['#4b6cb7','#182848']},{name:'লেদার স্নিকার',price:'২,৮০০',sizes:'৪০, ৪১, ৪২',emo:'👟',g:['#c0392b','#4a1a14']},{name:'ডেনিম জ্যাকেট',price:'৩,৫০০',sizes:'M, L',emo:'🧥',g:['#2c7a7b','#123a3b']}];
const prod=(from,p,ago)=>mk(from,'',ago,{type:'product',p});
const convs=[
{id:1,name:'আয়েশা খাতুন',ini:'আ',ch:'wa',ai:true,unread:2,ri:0,msgs:[
 mk('c','হ্যালো, শার্ট নিয়ে জানতে চাই',1500),mk('a','জি, বলুন। কোন শার্টটা দেখছেন?',1498),
 mk('c','ভাইয়া, এই শার্টটা কি এখন আছে?',12),prod('a',PROD[0],11),mk('a','জি, আছে। M আর L সাইজ পাওয়া যাচ্ছে।',11,{react:'👍'}),
 mk('c','L লাগবে',3),mk('c','ডেলিভারি কত?',2)]},
{id:2,name:'রফিক হোসেন',ini:'র',ch:'ig',ai:true,unread:1,ri:0,msgs:[mk('c','',20,{type:'img'}),mk('c','দাম কত এই জুতাটার?',15)]},
{id:3,name:'ফারিয়া আক্তার',ini:'ফ',ch:'ms',ai:true,unread:0,ri:0,msgs:[mk('c','',75,{type:'voice',dur:8}),mk('a','আপনার অর্ডার কাল পৌঁছাবে।',62)]},
{id:4,name:'নাসির উদ্দিন',ini:'ন',ch:'wa',ai:false,unread:0,ri:0,msgs:[mk('s','আপনার অর্ডার পাঠানো হয়েছে।',1300,{react:'❤️'}),mk('c','ধন্যবাদ ভাই',1290),mk('c','',1289,{type:'file',name:'invoice.pdf',size:'১২৪ KB'})]},
{id:5,name:'সুমি',ini:'সু',ch:'ig',ai:true,unread:0,ri:0,msgs:[mk('c','কালারটা কি আরো আছে?',900),mk('a','জি, কালো আর নীল আছে।',899),mk('c','🙏',700,{type:'sticker'}),mk('c','',650,{type:'unsup'})]},
{id:7,name:'তানভীর আহমেদ',ini:'ত',ch:'wa',ai:true,unread:1,ri:0,msgs:[mk('c','ভাইয়া, আপনাদের পেজে শার্ট আছে?',4)]},
{id:6,name:'মিজান',ini:'ম',ch:'ms',ai:false,unread:0,ri:0,msgs:[mk('c','অর্ডার বাতিল করতে চাই',2880)]}
];
let cur=null,net=true,selId=null,replyTo=null,fabN=0,filt={ch:[],unread:false,status:null,time:'all'};
try{const f=JSON.parse(localStorage.getItem('ek_filt')||'null');if(f)filt=f}catch(e){}
const saveF=()=>{try{localStorage.setItem('ek_filt',JSON.stringify(filt))}catch(e){}};
const last=c=>c.msgs.length?c.msgs[c.msgs.length-1].ts:0;
const pv=m=>({text:m.text,img:'ছবি',imgs:'ছবি ('+bn((m.srcs||[]).length)+'টি)',sticker:'স্টিকার',voice:'ভয়েস মেসেজ',product:'পণ্য: '+(m.p&&m.p.name),file:'ডকুমেন্ট: '+m.name,unsup:'অন্য ধরনের মেসেজ'}[m.type]||'');
const lastC=c=>{for(let i=c.msgs.length-1;i>=0;i--)if(c.msgs[i].from==='c')return c.msgs[i];return null};
const windowOpen=c=>{const m=lastC(c);return !!m&&Date.now()-m.ts<864e5};
let toastT;const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>e.classList.remove('show'),1900)};
const vib=()=>{try{navigator.vibrate&&navigator.vibrate(12)}catch(e){}};

/* ---------- inbox ---------- */
const fcount=()=>(filt.ch.length?1:0)+(filt.unread?1:0)+(filt.status?1:0)+(filt.time!=='all'?1:0);
function filtered(){const t0=new Date().setHours(0,0,0,0);return convs.filter(c=>{
 if(filt.ch.length&&!filt.ch.includes(c.ch))return false;if(filt.unread&&!c.unread)return false;
 if(filt.status==='ai'&&!c.ai)return false;if(filt.status==='me'&&c.ai)return false;
 if(filt.status==='unans'){const l=c.msgs[c.msgs.length-1];if(!(l&&l.from==='c'))return false}
 const l=last(c);if(filt.time==='today'&&l<t0)return false;if(filt.time==='7'&&l<Date.now()-7*864e5)return false;if(filt.time==='30'&&l<Date.now()-30*864e5)return false;return true})}
function renderChips(){const un=convs.reduce((a,c)=>a+(c.unread?1:0),0);const none=!filt.ch.length&&!filt.unread;
 $('#chips').innerHTML=`<button class="${none?'on':''}" data-k="all">সব</button><button class="${filt.unread?'on':''}" data-k="un">অপঠিত ${bn(un)}</button>`+Object.keys(CH).map(k=>`<button class="${filt.ch.includes(k)?'on':''}" data-k="${k}">${CH[k].n}</button>`).join('');
 const b=$('#fBtn'),u=b.querySelector('u');if(u)u.remove();if(fcount())b.insertAdjacentHTML('beforeend',`<u>${bn(fcount())}</u>`)}
function renderList(newId){renderChips();const old={};$$('#rows .cv').forEach(e=>old[e.dataset.id]=e.getBoundingClientRect().top);
 const arr=filtered().sort((a,b)=>last(b)-last(a));
 $('#rows').innerHTML=arr.length?arr.map(c=>{const l=c.msgs[c.msgs.length-1];
  const pre=c.typing==='a'?`<span class="ty">AI লিখছে…</span>`:`<span>${l?(l.from==='a'?'AI: ':'')+esc(pv(l)):''}</span>`;
  return `<div class="cv ${c.id===newId&&old[c.id]==null?'in':''}" data-id="${c.id}"><div class="av">${c.ini}${badge(c.ch)}</div><div class="cm"><b>${esc(c.name)}</b>${pre}</div><div class="cr"><span>${l?rel(l.ts):''}</span>${c.unread?`<span class="un">${bn(c.unread)}</span>`:''}</div></div>`}).join('')
  :`<div class="empty">কোনো কনভারসেশন পাওয়া যায়নি।${fcount()?`<br><button id="clrF">ফিল্টার মুছুন</button>`:''}</div>`;
 $$('#rows .cv').forEach(e=>{const o=old[e.dataset.id];if(o==null)return;const d=o-e.getBoundingClientRect().top;if(Math.abs(d)>1)e.animate([{transform:`translateY(${d}px)`},{transform:'none'}],{duration:340,easing:'cubic-bezier(.2,.8,.2,1)'})})}
$('#chips').onclick=e=>{const k=e.target.dataset.k;if(!k)return;if(k==='all'){filt.ch=[];filt.unread=false}else if(k==='un')filt.unread=!filt.unread;else filt.ch=filt.ch.includes(k)?filt.ch.filter(x=>x!==k):[...filt.ch,k];saveF();renderList()};
$('#rows').onclick=e=>{if(e.target.id==='clrF'){filt={ch:[],unread:false,status:null,time:'all'};saveF();renderList();return}const r=e.target.closest('.cv');if(r)openChat(+r.dataset.id)};
function filterSheet(){const P=(arr,sel,k)=>arr.map(([v,l])=>`<button class="${sel(v)?'on':''}" data-k="${k}" data-v="${v}">${l}</button>`).join('');
 openSheet(`<h4>ফিল্টার<button data-k="clr">সব মুছুন</button></h4>
 <div class="sl">চ্যানেল</div><div class="pills">${P(Object.keys(CH).map(k=>[k,CH[k].n]),v=>filt.ch.includes(v),'ch')}</div>
 <div class="sl">স্ট্যাটাস</div><div class="pills">${P([['ai','AI রিপ্লাই দিচ্ছে'],['me','আপনি রিপ্লাই দিচ্ছেন'],['unans','উত্তর বাকি']],v=>filt.status===v,'st')}</div>
 <div class="sl">সময়</div><div class="pills">${P([['all','সব'],['today','আজ'],['7','৭ দিন'],['30','৩০ দিন']],v=>filt.time===v,'tm')}</div>
 <div class="btn" data-k="done">${bn(filtered().length)}টি কনভারসেশন দেখুন</div>`,e=>{const k=e.target.dataset.k,v=e.target.dataset.v;if(!k)return;
  if(k==='ch')filt.ch=filt.ch.includes(v)?filt.ch.filter(x=>x!==v):[...filt.ch,v];if(k==='st')filt.status=filt.status===v?null:v;if(k==='tm')filt.time=v;
  if(k==='clr')filt={ch:[],unread:false,status:null,time:'all'};saveF();renderList();if(k==='done')closeSheet();else filterSheet()},true)}
$('#fBtn').onclick=filterSheet;
(()=>{const L=$('#list');let y0=null,d=0;L.addEventListener('touchstart',e=>{if(L.scrollTop<=0)y0=e.touches[0].clientY},{passive:true});
 L.addEventListener('touchmove',e=>{if(y0==null)return;d=Math.max(0,Math.min(70,(e.touches[0].clientY-y0)*.5));$('#ptr').style.transition='none';$('#ptr').style.height=d+'px'},{passive:true});
 L.addEventListener('touchend',()=>{if(y0==null)return;$('#ptr').style.transition='';if(d>40){$('#ptr').style.height='40px';setTimeout(()=>{$('#ptr').style.height='0';renderList()},800)}else $('#ptr').style.height='0';y0=null;d=0})})();

/* ---------- sheets ---------- */
let shH=null;
function openSheet(html,h,keep){$('#sh').innerHTML=html;shH=h||null;$('#shw').classList.add('show')}
function closeSheet(){$('#shw').classList.remove('show')}
$('#shBk').onclick=closeSheet;$('#sh').onclick=e=>shH&&shH(e);

/* ---------- chat render ---------- */
const tk=m=>{if(m.from==='c')return'';const s=m.st;if(s==='sending')return I('clk');if(s==='failed')return`<span class="fail" data-retry="${m.id}">!</span>`;if(s==='sent')return I('chk');return`<span class="dbl ${s==='seen'?'seen':''}">${I('chk')}${I('chk','t2')}</span>`};
const meta=(m,c='mt')=>`<span class="${c}">${hm(m.ts)}<span class="tk">${tk(m)}</span></span>`;
const who=m=>m.from==='c'?cur.name:m.from==='a'?'AI':'আপনি';
const bars=m=>{let s='',x=m.id*9301+49297;for(let i=0;i<26;i++){x=(x*9301+49297)%233280;s+=`<i style="height:${5+Math.round(x/233280*18)}px"></i>`}return s};
function body(m){const k=m.from==='c'?'':m.from==='a'?'ba':'bs';
 const q=m.reply&&cur.msgs.find(x=>x.id===m.reply);
 const qh=q?`<div class="qt" data-q="${q.id}"><b>${esc(who(q))}</b><span>${esc(pv(q))}</span></div>`:'';
 switch(m.type){
 case'text':return`<div class="bub ${k}">${qh}${esc(m.text)}${meta(m)}</div>`;
 case'sticker':return`<div class="stk">${m.text}</div>`;
 case'imgs':{const n=m.srcs.length,sh=m.srcs.slice(0,4),more=n>4?n-4:0;return`<div class="bub im ${k}">${qh}<div class="imgw gw g${Math.min(n,4)}" data-img="${m.id}">${sh.map((x,i)=>`<div class="gt" data-i="${i}"><img src="${x}" alt="ছবি">${more&&i===3?`<span class="more">+${bn(more)}</span>`:''}</div>`).join('')}<span class="ovm">${hm(m.ts)}<span class="tk">${tk(m)}</span></span></div></div>`}
 case'img':return`<div class="bub im ${k}">${qh}<div class="imgw" data-img="${m.id}">${m.src?`<img src="${m.src}" alt="ছবি">`:`<div class="ph_">👟</div>`}<span class="ovm">${hm(m.ts)}<span class="tk">${tk(m)}</span></span></div></div>`;
 case'voice':return`<div class="bub ${k}"><div class="vn"><button class="pl" data-pl="${m.id}" aria-label="চালান">${I('play','fill')}</button><div class="wf">${bars(m)}</div><span class="vd">${mmss(m.dur)}</span></div><div class="mrow">${meta(m)}</div></div>`;
 case'file':return`<div class="bub ${k}"><div class="fileb"><div class="fi">${I('doc')}</div><div><b>${esc(m.name)}</b><span>${esc(m.size||'')}</span></div></div><div class="mrow">${meta(m)}</div></div>`;
 case'product':return`<div class="bub pc ${k||'ba'}"><div class="pimg" style="background:linear-gradient(135deg,${m.p.g[0]},${m.p.g[1]})">${m.p.emo}</div><div class="pi"><b>${esc(m.p.name)}</b><span>সাইজ: ${m.p.sizes}</span><div class="pp">৳${m.p.price}</div></div><div class="mrow">${meta(m)}</div></div>`;
 case'unsup':return`<div class="bub"><span class="unsup">এই ধরনের মেসেজ এখানে দেখানো যায় না।</span><div class="mrow">${meta(m)}</div></div>`}}
function msgEl(m,isNew){const mine=m.from!=='c',r=document.createElement('div');
 r.className='mr '+(mine?'r':'l')+(isNew?' new '+(mine?'out':'in'):'');r.dataset.id=m.id;r.dataset.from=m.from;
 r.innerHTML=`<div class="rep">${I('rep')}</div><div class="bc">${mine?`<div class="who">${m.from==='a'?'AI':'আপনি'}</div>`:''}${body(m)}${m.react?`<div class="rx">${m.react}</div>`:''}</div>`;return r}
function markRuns(){const rows=$$('#msgs .mr[data-id]');rows.forEach(r=>{const p=r.previousElementSibling,n=r.nextElementSibling;
 const sp=p&&p.dataset&&p.dataset.id&&p.dataset.from===r.dataset.from,sn=n&&n.dataset&&n.dataset.id&&n.dataset.from===r.dataset.from;
 r.classList.toggle('first',!sp);r.classList.toggle('last',!sn)})}
function renderMsgs(){const box=$('#msgs'),typ=$('#typ');[...box.children].forEach(x=>x!==typ&&x.remove());let pd='';const c=cur;
 let divAt=null;if(c.divId)divAt=c.divId;
 c.msgs.forEach(m=>{const d=dayLbl(m.ts);if(d!==pd){const s=document.createElement('div');s.className='sday';s.textContent=d;box.insertBefore(s,typ);pd=d}
  if(divAt===m.id){const u=document.createElement('div');u.className='udiv';u.id='udiv';u.textContent=bn(c.divN)+'টি অপঠিত মেসেজ';box.insertBefore(u,typ)}
  box.insertBefore(msgEl(m),typ)});markRuns();
 const u=$('#udiv');box.style.scrollBehavior='auto';box.scrollTop=u?Math.max(0,u.offsetTop-70):box.scrollHeight;box.style.scrollBehavior='';fabN=0;updFab()}
const nearBottom=()=>{const b=$('#msgs');return b.scrollHeight-b.scrollTop-b.clientHeight<120};
function updFab(){const f=$('#fab');f.classList.toggle('show',!nearBottom());f.classList.toggle('has',fabN>0);$('#fabN').textContent=bn(fabN)}
$('#msgs').addEventListener('scroll',()=>{if(nearBottom())fabN=0;updFab()},{passive:true});
$('#fab').onclick=()=>{fabN=0;$('#msgs').scrollTo({top:$('#msgs').scrollHeight,behavior:'smooth'})};
function appendMsg(m){const box=$('#msgs'),near=nearBottom()||m.from==='s';
 const d=dayLbl(m.ts),prev=cur.msgs[cur.msgs.length-2];if(!prev||dayLbl(prev.ts)!==d){const s=document.createElement('div');s.className='sday';s.textContent=d;box.insertBefore(s,$('#typ'))}
 box.insertBefore(msgEl(m,true),$('#typ'));markRuns();
 if(near)box.scrollTo({top:box.scrollHeight,behavior:'smooth'});else if(m.from==='c'){fabN++;updFab()}}
function setSt(m,st){m.st=st;const e=$(`#msgs [data-id="${m.id}"] .tk`);if(!e)return;const d=e.querySelector('.dbl');
 if(d&&st==='seen'){d.classList.add('seen');e.classList.remove('pop');void e.offsetWidth;e.classList.add('pop');return}
 e.innerHTML=tk(m);e.classList.remove('pop');void e.offsetWidth;e.classList.add('pop')}
function reRow(m){const old=$(`#msgs [data-id="${m.id}"]`);if(old){old.replaceWith(msgEl(m));markRuns()}}
function hdr(){const c=cur;$('#chAv').innerHTML=c.ini+badge(c.ch);$('#chName').textContent=c.name;
 const s=$('#chSub');s.className=c.typing==='a'?'g':'';s.textContent=c.typing==='a'?'AI উত্তর লিখছে…':CH[c.ch].n;
 $('#aiT').className='aic'+(c.ai?'':' offai');$('#aiT span').textContent=c.ai?'AI চালু':'AI বন্ধ'}
function setTyping(c,who){c.typing=who;if(cur===c){hdr();const t=$('#typ');t.classList.toggle('show',!!who);if(who&&nearBottom())$('#msgs').scrollTo({top:$('#msgs').scrollHeight,behavior:'smooth'})}if(!$('#ph').classList.contains('chat'))renderList()}
function openChat(id){if(rec)stopRec(false);cur=convs.find(c=>c.id===id);const cm=cur.msgs.filter(m=>m.from==='c');
 if(cur.unread>0&&cm.length){const f=cm[Math.max(0,cm.length-cur.unread)];cur.divId=f.id;cur.divN=Math.min(cur.unread,cm.length)}else cur.divId=null;
 cur.unread=0;clearSel();clearReply(true);$('#inp').value='';autosize();hdr();renderMsgs();$('#ph').classList.add('chat');updComposer();syncSend()}
$('#bBack').onclick=()=>{if(rec)stopRec(false);cur=null;$('#ph').classList.remove('chat','prof');clearSel();setTimeout(()=>renderList(),50)};
$('#aiT').onclick=()=>{cur.ai=!cur.ai;hdr();toast(cur.ai?'AI আবার রিপ্লাই দিবে':'আপনি এখন রিপ্লাই দিচ্ছেন')};

/* ---------- connectivity + 24h window ---------- */
function updComposer(){if(!cur)return;const closed=!windowOpen(cur);$('#comp').classList.toggle('closed',closed);$('#comp').classList.toggle('dis',!net&&!closed);$('#inp').placeholder=net?'মেসেজ লিখুন…':'ইন্টারনেট নেই'}
function updNet(){$('#netChip').className='chip'+(net?'':' off');$('#netChip').innerHTML=net?'<i class="dot"></i>লাইভ':'<i class="dot"></i>অফলাইন';$('#inBan').classList.toggle('show',!net);$('#chBan').classList.toggle('show',!net);updComposer()}

/* ---------- sending ---------- */
function deliver(c,m,react){setTimeout(()=>{if(!net){setSt(m,'failed');return}setSt(m,'sent');
 const toSeen=()=>setTimeout(()=>{setSt(m,'seen');if(react)customerReply(c)},CAP[c.ch].dlv?1300:1600);
 if(CAP[c.ch].dlv)setTimeout(()=>{setSt(m,'delivered');toSeen()},650);else toSeen()},450)}
function sendSeller(m){const c=cur;Object.assign(m,{id:uid++,from:'s',ts:Date.now(),st:'sending'});if(replyTo)m.reply=replyTo;clearReply();
 if(c.ai){c.ai=false;hdr();toast('আপনি রিপ্লাই দিচ্ছেন, AI বন্ধ হয়েছে')}
 c.msgs.push(m);appendMsg(m);deliver(c,m,true)}
$('#msgs').addEventListener('click',e=>{const r=e.target.closest('[data-retry]');if(r){const m=cur.msgs.find(x=>x.id==r.dataset.retry);if(!net)return toast('ইন্টারনেট নেই');setSt(m,'sending');deliver(cur,m,false)}});
const REPL=['ঠিক আছে ভাইয়া 👍','আচ্ছা, অর্ডার করতে চাই','পেমেন্ট কিভাবে করব?','ধন্যবাদ!'];
function customerReply(c){if(c.rt)return;c.rt=setTimeout(()=>{c.rt=null;if(!net)return;incoming(c,mk('c',REPL[c.ri++%REPL.length],0,{ts:Date.now()}))},1600)}
function incoming(c,m){c.msgs.push(m);const open=cur===c&&$('#ph').classList.contains('chat');
 if(open){appendMsg(m);updComposer()}else{c.unread++;renderList(c.id);notify(c,m)}}
function notify(c,m){$('#nAv').innerHTML=c.ini+badge(c.ch);$('#nT').textContent=c.name+' · '+CH[c.ch].n;$('#nB').textContent=pv(m);const n=$('#notif');n.dataset.id=c.id;n.classList.add('show');clearTimeout(n.t);n.t=setTimeout(()=>n.classList.remove('show'),3200)}
$('#notif').onclick=e=>{$('#notif').classList.remove('show');openChat(+e.currentTarget.dataset.id)};
function aiReply(c,text){setTimeout(()=>{if(!net)return;setTyping(c,'a');setTimeout(()=>{setTyping(c,null);
 const w=/দাম|জুতা|আছে|কালার|শার্ট|জ্যাকেট/.test(text);const out=[];
 if(w)out.push(mk('a','',0,{type:'product',p:PROD[Math.floor(Math.random()*3)],ts:Date.now(),st:'sent'}));
 out.push(mk('a',w?'এটা দেখতে পারেন। অর্ডার করতে চাইলে জানান।':'জি, আমি দেখে জানাচ্ছি।',0,{ts:Date.now(),st:'sent'}));
 out.forEach((m,i)=>setTimeout(()=>{c.msgs.push(m);if(c===cur&&$('#ph').classList.contains('chat'))appendMsg(m);else renderList(c.id);deliver(c,m,false)},i*500))},1900)},800)}
const SIM=['ভাইয়া, এই জুতাটার দাম কত?','আরো কালার আছে?','ডেলিভারি কতদিনে পাবো?','আজকে অর্ডার করলে কাল পাবো?'];let si=0;
function simCustomer(c){if(!net)return toast('ইন্টারনেট নেই');const t=SIM[si++%SIM.length];setTimeout(()=>{incoming(c,mk('c',t,0,{ts:Date.now()}));if(c.ai)aiReply(c,t)},500)}

/* composer */
const inp=$('#inp');
function autosize(){inp.style.height='38px';inp.style.height=Math.min(96,inp.scrollHeight)+'px'}
function syncSend(){const has=inp.value.trim().length>0||!!rec;$('#bSend').classList.toggle('has',has&&!rec);$('#bSend').classList.toggle('recm',!!rec);$('#bCam').classList.toggle('hide',inp.value.trim().length>0)}
inp.oninput=()=>{autosize();syncSend()};
inp.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend()}};
let rec=null;
function doSend(){if(!net){if(rec)toast('ইন্টারনেট নেই');return}if(rec){stopRec(true);return}const t=inp.value.trim();if(!t){startRec();return}sendSeller({type:'text',text:t});inp.value='';autosize();syncSend()}
$('#bSend').onclick=doSend;
function startReply(id){const m=cur.msgs.find(x=>x.id==id);if(!m)return;replyTo=m.id;$('#rbN').textContent=who(m);$('#rbT').textContent=pv(m);$('#rbar').classList.add('show');inp.focus()}
function clearReply(){replyTo=null;$('#rbar').classList.remove('show')}$('#rbX').onclick=()=>clearReply();
function drawW(){const w=rec.w;rec.a=Math.max(.12,Math.min(1,rec.a+(Math.random()-.5)*.8));w.push(rec.a);if(w.length>40)w.shift();$('#recW').innerHTML=w.map(a=>`<b style="height:${Math.round(3+a*20)}px"></b>`).join('')}
function startRec(){rec={t:0,a:.4,w:[],iv:setInterval(()=>{rec.t++;$('#recT').textContent=mmss(rec.t)},1000)};rec.wv=setInterval(drawW,90);$('#recT').textContent='০:০০';$('#comp').classList.add('recing');syncSend();vib()}
function stopRec(send){clearInterval(rec.iv);clearInterval(rec.wv);const t=rec.t;$('#comp').classList.remove('recing');rec=null;syncSend();if(send&&t>=1)sendSeller({type:'voice',dur:t});else if(send)toast('ভয়েস খুব ছোট')}
$('#recX').onclick=()=>stopRec(false);
let pl=null;
$('#msgs').addEventListener('click',e=>{const b=e.target.closest('[data-pl]');if(!b)return;const m=cur.msgs.find(x=>x.id==b.dataset.pl),w=b.parentNode.querySelector('.wf').children;
 if(pl){clearInterval(pl.iv);pl.b.innerHTML=I('play','fill');[...pl.w].forEach(x=>x.classList.remove('f'));const same=pl.b===b;pl=null;if(same)return}
 let p=0;b.innerHTML=I('pause');pl={b,w,iv:setInterval(()=>{p+=.1;const n=Math.floor(p/m.dur*w.length);[...w].forEach((x,i)=>x.classList.toggle('f',i<n));if(p>=m.dur){clearInterval(pl.iv);b.innerHTML=I('play','fill');[...w].forEach(x=>x.classList.remove('f'));pl=null}},100)}});
/* attach */
$('#bClip').onclick=()=>{const doc=CAP[cur.ch].doc;openSheet(`<h4>পাঠান</h4><div class="grid4"><div><button data-k="gal">${I('img')}</button>গ্যালারি</div><div><button data-k="cam">${I('cam')}</button>ক্যামেরা</div>${doc?`<div><button data-k="doc">${I('doc')}</button>ডকুমেন্ট</div>`:''}<div><button data-k="prod">${I('bag')}</button>পণ্য</div></div>`,e=>{const k=(e.target.closest('[data-k]')||{dataset:{}}).dataset.k;if(!k)return;closeSheet();if(k==='gal')$('#fGal').click();if(k==='cam')$('#fCam').click();if(k==='doc')$('#fDoc').click();if(k==='prod')setTimeout(prodSheet,200)})};
$('#bCam').onclick=()=>$('#fCam').click();
function prodSheet(){openSheet(`<h4>পণ্য পাঠান</h4>`+PROD.map((p,i)=>`<div class="lr" data-p="${i}"><div class="av" style="border-radius:10px;font-size:22px;background:linear-gradient(135deg,${p.g[0]},${p.g[1]})">${p.emo}</div><div class="cm"><b>${p.name}</b><span>৳${p.price}</span></div></div>`).join(''),e=>{const r=e.target.closest('[data-p]');if(r){closeSheet();sendSeller({type:'product',p:PROD[r.dataset.p]})}})}
let pend=[],pcur=0,appendMode=false;const MAXI=10;
function pvRender(){$('#pImg').src=pend[pcur]||'';$('#pTh').innerHTML=pend.map((x,i)=>`<button data-t="${i}" class="${i===pcur?'on':''}"><img src="${x}" alt=""><span class="rm" data-r="${i}">×</span></button>`).join('')+(pend.length<MAXI?'<button class="add" data-add="1">+</button>':'');$('#pC').textContent=pend.length>1?bn(pcur+1)+'/'+bn(pend.length):'';const c=$('#pCnt');c.textContent=bn(pend.length);c.classList.toggle('on',pend.length>1)}
function pvOpen(list,append){if(append&&$('#pvw').classList.contains('show')){pcur=pend.length;pend=pend.concat(list)}else{pend=list.slice();pcur=0}if(pend.length>MAXI){pend=pend.slice(0,MAXI);toast('সর্বোচ্চ ১০টি ছবি')}pcur=Math.min(pcur,pend.length-1);pvRender();$('#pvw').classList.add('show')}
$('#pTh').onclick=e=>{const r=e.target.closest('[data-r]');if(r){pend.splice(+r.dataset.r,1);if(!pend.length){$('#pvw').classList.remove('show');return}pcur=Math.min(pcur,pend.length-1);return pvRender()}if(e.target.closest('[data-add]')){appendMode=true;$('#fGal').click();return}const t=e.target.closest('[data-t]');if(t){pcur=+t.dataset.t;pvRender()}};
const onFile=e=>{const fs=[...e.target.files];e.target.value='';if(!fs.length)return;if(!net)return toast('ইন্টারনেট নেই');const im=fs.filter(f=>f.type.startsWith('image/'));
 if(im.length){pvOpen(im.map(f=>URL.createObjectURL(f)),appendMode);appendMode=false}else{const f=fs[0];sendSeller({type:'file',name:f.name,size:bn(f.size/1024<1024?Math.round(f.size/1024)+' KB':(f.size/1048576).toFixed(1)+' MB')})}};
$('#fGal').onchange=onFile;$('#fCam').onchange=onFile;$('#fDoc').onchange=onFile;
$('#pX').onclick=()=>$('#pvw').classList.remove('show');
$('#pSend').onclick=()=>{const l=pend.slice();$('#pvw').classList.remove('show');l.length>1?sendSeller({type:'imgs',srcs:l}):sendSeller({type:'img',src:l[0]})};
$('#msgs').addEventListener('click',e=>{const w=e.target.closest('[data-img]');if(!w||selId||justSel)return;const m=cur.msgs.find(x=>x.id==w.dataset.img),t=e.target.closest('[data-i]');openViewer(m,t?+t.dataset.i:0)});
let vs=null,vx=0;
function openViewer(m,i){vs={m,i,list:m.srcs||[m.src||null]};showV();$('#viewer').classList.add('show')}
function showV(){const l=vs.list,x=l[vs.i];$('#vN').textContent=who(vs.m)+(l.length>1?' · '+bn(vs.i+1)+'/'+bn(l.length):'');$('#vB').innerHTML=x?`<img src="${x}" alt="">`:`<div class="vph">👟</div>`;$('#vPrev').style.display=vs.i>0?'':'none';$('#vNext').style.display=vs.i<l.length-1?'':'none'}
const vgo=d=>{if(vs&&vs.i+d>=0&&vs.i+d<vs.list.length){vs.i+=d;showV()}};
$('#vPrev').onclick=()=>vgo(-1);$('#vNext').onclick=()=>vgo(1);
$('#vB').addEventListener('pointerdown',e=>vx=e.clientX);$('#vB').addEventListener('pointerup',e=>{const d=e.clientX-vx;if(Math.abs(d)>50)vgo(d<0?1:-1)});
$('#vX').onclick=()=>$('#viewer').classList.remove('show');

/* ---------- swipe to reply / long press ---------- */
let sw=null,justSel=false;const box=$('#msgs');
box.addEventListener('pointerdown',e=>{const r=e.target.closest('.mr');if(!r||r.id==='typ'||e.button>0)return;
 sw={r,x:e.clientX,y:e.clientY,moved:false,hit:false,id:e.pointerId};r.classList.add('pressing');
 sw.t=setTimeout(()=>{if(sw&&!sw.moved){const id=sw.r.dataset.id;sw.r.classList.remove('pressing');sw=null;justSel=true;setTimeout(()=>justSel=false,350);select(+id)}},430)});
box.addEventListener('pointermove',e=>{if(!sw)return;const dx=e.clientX-sw.x,dy=e.clientY-sw.y;
 if(!sw.moved&&Math.abs(dy)>10){clearTimeout(sw.t);sw.r.classList.remove('pressing');sw=null;return}
 if(Math.abs(dx)>8&&!sw.moved){sw.moved=true;clearTimeout(sw.t);sw.r.classList.remove('pressing');try{sw.r.setPointerCapture(sw.id)}catch(_){}sw.r.querySelector('.bc').classList.remove('back')}
 if(sw.moved){const raw=Math.max(0,dx),t=raw<56?raw:56+(raw-56)*.28,bc=sw.r.querySelector('.bc'),rp=sw.r.querySelector('.rep');
  bc.style.transform=`translateX(${t}px)`;rp.style.opacity=Math.min(1,Math.max(0,(t-10)/40));rp.style.transform=`scale(${.6+Math.min(.4,t/140)})`;
  if(t>=56&&!sw.hit){sw.hit=true;vib();rp.style.background='var(--cr)';rp.style.color='var(--ink)'}else if(t<56&&sw.hit){sw.hit=false;rp.style.background='';rp.style.color=''}}});
const endSw=()=>{if(!sw)return;clearTimeout(sw.t);sw.r.classList.remove('pressing');if(sw.moved){const bc=sw.r.querySelector('.bc'),rp=sw.r.querySelector('.rep');bc.classList.add('back');bc.style.transform='';rp.style.opacity=0;rp.style.background='';rp.style.color='';if(sw.hit)startReply(sw.r.dataset.id)}sw=null};
box.addEventListener('pointerup',endSw);box.addEventListener('pointercancel',endSw);
box.addEventListener('contextmenu',e=>{const r=e.target.closest('.mr');if(r&&r.id!=='typ'){e.preventDefault();clearTimeout(sw&&sw.t);sw=null;justSel=true;setTimeout(()=>justSel=false,350);select(+r.dataset.id)}});
box.addEventListener('click',e=>{if(justSel)return;const q=e.target.closest('[data-q]');if(q&&!selId){const t=$(`#msgs [data-id="${q.dataset.q}"]`);if(t){t.scrollIntoView({behavior:'smooth',block:'center'});t.classList.remove('flash');void t.offsetWidth;t.classList.add('flash')}return}
 if(selId){const r=e.target.closest('.mr');if(r&&r.id!=='typ'&&+r.dataset.id!==selId)select(+r.dataset.id);else clearSel()}});
/* selection: reply / copy / info; reactions only on customer messages */
const RX=['👍','❤️','😂','😮','😢','🙏'];
function select(id){clearSel(true);selId=id;const r=$(`#msgs [data-id="${id}"]`);r.classList.add('sel');vib();const m=cur.msgs.find(x=>x.id===id);
 $('#selbar').classList.add('show');$('#selbar [data-a=copy]').style.display=m.type==='text'?'':'none';$('#selbar [data-a=fwd]').style.display=m.from==='c'||m.type==='unsup'?'none':'';
 const rb=$('#rxbar');if(m.from==='c'){const pr=$('#ph').getBoundingClientRect(),rr=r.getBoundingClientRect();
  rb.innerHTML=RX.map((x,i)=>`<button data-x="${x}" style="animation-delay:${i*30}ms">${x}</button>`).join('');rb.style.top=Math.max(64,rr.top-pr.top-46)+'px';rb.style.left='14px';rb.style.right='auto';rb.classList.remove('show');void rb.offsetWidth;rb.classList.add('show')}else rb.classList.remove('show')}
function clearSel(keep){if(selId){const r=$(`#msgs [data-id="${selId}"]`);r&&r.classList.remove('sel')}selId=null;if(!keep){$('#selbar').classList.remove('show');$('#rxbar').classList.remove('show')}}
$('#rxbar').onclick=e=>{const x=e.target.dataset.x;if(!x)return;const m=cur.msgs.find(v=>v.id===selId);m.react=m.react===x?null:x;clearSel();reRow(m)};
$('#selbar').onclick=e=>{const a=(e.target.closest('[data-a]')||{dataset:{}}).dataset.a;if(!a)return;const m=cur.msgs.find(v=>v.id===selId);
 if(a==='close')return clearSel();
 if(a==='reply'){const id=selId;clearSel();startReply(id)}
 if(a==='copy'){clearSel();try{navigator.clipboard.writeText(m.text)}catch(_){}toast('কপি হয়েছে')}
 if(a==='fwd'){clearSel();fwdSheet(m)}
 if(a==='info'){clearSel();infoSheet(m)}};

/* forward = resend a copy through the send API (no native \"Forwarded\" label exists) */
function fwdSheet(m){const o=convs.filter(c=>c!==cur);
 const ok=c=>windowOpen(c)&&!(m.type==='file'&&!CAP[c.ch].doc);
 const why=c=>!windowOpen(c)?'২৪ ঘণ্টা পার হয়ে গেছে':'এই চ্যানেলে ডকুমেন্ট পাঠানো যায় না';
 openSheet(`<h4>ফরওয়ার্ড করুন</h4>`+o.map(c=>`<div class="cv" data-f="${c.id}" style="padding:10px 0;${ok(c)?'':'opacity:.45;pointer-events:none'}"><div class="av">${c.ini}${badge(c.ch)}</div><div class="cm"><b>${esc(c.name)}</b><span>${ok(c)?CH[c.ch].n:why(c)}</span></div></div>`).join(''),
 e=>{const r=e.target.closest('[data-f]');if(!r)return;if(!net){closeSheet();return toast('ইন্টারনেট নেই')}
  const c=convs.find(x=>x.id==r.dataset.f),n={...m,id:uid++,from:'s',ts:Date.now(),st:'sending'};delete n.reply;delete n.react;
  c.msgs.push(n);if(c.ai)c.ai=false;closeSheet();renderList(c.id);deliver(c,n,false);toast('ফরওয়ার্ড হয়েছে · '+c.name)})}
function infoSheet(m){const mine=m.from!=='c',st=m.st,t=ts=>hm(ts),cap=CAP[cur.ch];
 openSheet(`<h4>মেসেজ তথ্য</h4><div class="ir">${I('chk')}${mine?'পাঠানো হয়েছে':'এসেছে'}<span class="v">${dayLbl(m.ts)}, ${t(m.ts)}</span></div>`+
 (mine&&cap.dlv?`<div class="ir"><span class="dbl">${I('chk')}${I('chk','t2')}</span>পৌঁছেছে<span class="v">${['delivered','seen'].includes(st)?t(m.ts+1000):'এখনো না'}</span></div>`:'')+
 (mine?`<div class="ir"><span class="dbl seen">${I('chk')}${I('chk','t2')}</span>দেখেছে<span class="v">${st==='seen'?t(m.ts+3000):'এখনো না'}</span></div>`:'')+
 `<div class="ir">${I(cur.ch)}চ্যানেল<span class="v">${CH[cur.ch].n}</span></div><div class="ir">${I('msg')}পাঠিয়েছে<span class="v">${who(m)}</span></div>`)}


/* ---------- customer profile ---------- */
const MON=['জানু','ফেব্রু','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টে','অক্টো','নভে','ডিসে'];
const dFmt=ts=>{const d=new Date(ts);return bn(d.getDate())+' '+MON[d.getMonth()]+(d.getFullYear()!==new Date().getFullYear()?' '+bn(d.getFullYear()):'')};
const when=ts=>Date.now()-ts<864e5&&new Date(ts).getDate()===new Date().getDate()?'আজ, '+hm(ts):dFmt(ts);
const taka=n=>'৳'+bn(Number(n).toLocaleString('en-IN'));
const O=(id,store,items,amt,days,s,why)=>({id,store,items,amt,ts:now-days*864e5,s,why});
const FH='ফ্যাশন হাউস',SC='শু কর্নার',GW='জেন্টস ওয়্যার';
const ST={ok:['সফল','ok'],cx:['বাতিল','er'],rt:['ফেরত','wr'],run:['চলমান','mu']};
/* demo data: in the real app this comes from the orders of every workspace/store this customer bought from */
const PROF={
1:{phone:'+৮৮০ ১৭১২-৩৪৫৬৭৮',addr:'বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা',pay:'ক্যাশ অন ডেলিভারি',first:now-200*864e5,msgs:96,talks:14,orders:[
 O('#১০৪২',FH,'কটন ক্যাজুয়াল শার্ট × ১',1250,0.1,'run'),O('#০৯৮৮',FH,'লিনেন কুর্তি × ২',2400,20,'ok'),O('#০৯৩১',FH,'ডেনিম জ্যাকেট × ১',3500,41,'ok'),O('#০৮৭৬',FH,'টি-শার্ট × ৩',1800,70,'ok'),
 O('#০৭১২',SC,'লেদার স্নিকার × ১',2800,95,'ok'),O('#০৬৫৪',SC,'স্যান্ডেল × ১',1150,130,'cx','ঠিকানা ভুল ছিল'),O('#০৬০১',SC,'স্পোর্টস জুতা × ১',2200,160,'ok'),O('#০৫৪৪',FH,'ওড়না × ২',900,190,'ok')]},
2:{user:'rafiq.hossain',addr:'মিরপুর ১০, ঢাকা',pay:'ক্যাশ অন ডেলিভারি',first:now-120*864e5,msgs:58,talks:12,orders:[
 O('#১০১৯',SC,'লেদার স্নিকার × ১',2800,9,'cx','ডেলিভারির সময় ফোন ধরেননি'),O('#০৯৫৫',GW,'ডেনিম জ্যাকেট × ১',3500,35,'cx','ডেলিভারির সময় নিতে চাননি'),O('#০৮৯০',GW,'টি-শার্ট × ২',1200,60,'ok'),O('#০৮০১',GW,'জিন্স প্যান্ট × ১',1800,88,'cx','পরে মত বদলেছেন')]},
3:{addr:'উত্তরা সেক্টর ৭, ঢাকা',pay:'বিকাশ',first:now-80*864e5,msgs:31,talks:5,orders:[
 O('#১০৩১',FH,'শাড়ি × ১',3200,1,'run'),O('#০৯৭০',FH,'থ্রি-পিস × ১',2600,28,'ok'),O('#০৮৯৯',FH,'ওড়না × ২',800,55,'ok'),O('#০৮২২',FH,'থ্রি-পিস × ১',2400,78,'cx','সাইজ মেলেনি')]},
4:{phone:'+৮৮০ ১৮১৯-২২৩৩৪৪',addr:'কলেজ রোড, কুমিল্লা',pay:'ক্যাশ অন ডেলিভারি',first:now-150*864e5,msgs:40,talks:9,orders:[
 O('#১০০২',GW,'পাঞ্জাবি × ১',2100,22,'ok'),O('#০৯৬১',SC,'লোফার জুতা × ১',2600,45,'ok'),O('#০৯১৫',GW,'শার্ট × ২',2400,66,'ok'),O('#০৮৫০',GW,'পলো শার্ট × ১',950,92,'ok'),O('#০৭৭৭',SC,'স্যান্ডেল × ১',1400,120,'ok'),O('#০৬৯০',GW,'ট্রাউজার × ১',1700,148,'ok')]},
5:{user:'sumi.__',first:now-25*864e5,msgs:23,talks:9,asked:['কালো ও নীল রঙের কুর্তি','দাম ও সাইজ চার্ট'],orders:[]},
6:{addr:'সদর রোড, বরিশাল',pay:'ক্যাশ অন ডেলিভারি',first:now-3*864e5,msgs:4,talks:2,orders:[O('#১০৪০',GW,'টি-শার্ট × ২',1200,2,'run')]},
7:{phone:'+৮৮০ ১৯১৮-৫৫৬৬৭৭',talks:1,orders:[]}};
function profData(c){const P=PROF[c.id]||{},cm=c.msgs.filter(m=>m.from==='c'),seen=[];
 c.msgs.forEach(m=>{if(m.type==='product'&&m.p&&!seen.includes(m.p.name))seen.push(m.p.name)});
 return{phone:P.phone,user:P.user,addr:P.addr,pay:P.pay,orders:(P.orders||[]).slice().sort((a,b)=>b.ts-a.ts),
  first:P.first||(cm[0]?cm[0].ts:Date.now()),msgs:P.msgs||cm.length,talks:P.talks||1,asked:[...(P.asked||[]),...seen],firstTxt:(cm.find(m=>m.type==='text')||{}).text}}
function verdict(P){const o=P.orders,n=t=>o.filter(x=>x.s===t),ok=n('ok'),cx=n('cx'),rt=n('rt'),run=n('run'),done=ok.length+cx.length+rt.length;
 const rate=done?Math.round(ok.length/done*100):null,r=[];let label,tone;
 if(!o.length){if(P.talks<=1){label='নতুন কাস্টমার';tone='mu'}else if(P.talks>=4){label='অনেকবার জিজ্ঞেস করেছেন, কেনেননি';tone='wr'}else{label='এখনো কেনেননি';tone='mu'}}
 else if(!done){label='প্রথম অর্ডার চলছে';tone='mu'}
 else if(done<3&&rate===100){label='নতুন, কিন্তু ভালো শুরু';tone='ok'}
 else if(done<3){label='সতর্ক থাকুন';tone='er'}
 else if(rate>=85){label='ভরসাযোগ্য কাস্টমার';tone='ok'}
 else if(rate>=60){label='মাঝারি কাস্টমার';tone='wr'}
 else{label='ঝুঁকিপূর্ণ কাস্টমার';tone='er'}
 if(ok.length)r.push(['ok',`${bn(ok.length)}টি অর্ডার ঠিকমতো নিয়েছেন`]);
 if(done&&!cx.length&&!rt.length)r.push(['ok','কখনো বাতিল বা ফেরত দেননি']);
 if(cx.length){const w=cx.find(x=>x.why);r.push(['er',`${bn(cx.length)}বার অর্ডার বাতিল করেছেন`+(w?`। সর্বশেষ কারণ: ${w.why}`:'')])}
 if(rt.length)r.push(['wr',`${bn(rt.length)}টি পণ্য ফেরত দিয়েছেন`]);
 if(run.length)r.push(['mu',`${bn(run.length)}টি অর্ডার এখন চলছে`]);
 if(done&&tone==='er')r.push(['wr','অর্ডার নেওয়ার আগে ফোনে কনফার্ম করুন, সম্ভব হলে অগ্রিম নিন']);
 return{label,tone,rate,done,ok,cx,rt,run,reasons:r}}
const kv=(k,v)=>`<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
function pfHTML(c){const P=profData(c),o=P.orders,V=verdict(P),fresh=!o.length&&P.talks<=1;
 const sub=[CH[c.ch].n,c.ch==='wa'&&P.phone?P.phone:c.ch==='ig'&&P.user?'@'+P.user:''].filter(Boolean).join(' · ');
 let h=`<div class="hero"><div class="av">${c.ini}${badge(c.ch)}</div><h2>${esc(c.name)}</h2><div class="sub">${sub}</div><span class="tag ${V.tone}">${V.label}</span></div>
 <div class="qa"><button data-a="chat">${I('msg')}মেসেজ</button>${P.phone?`<button data-a="copy">${I('copy')}নম্বর কপি</button>`:''}<button data-a="ai">${I('ms')}${c.ai?'AI বন্ধ করুন':'AI চালু করুন'}</button></div>`;
 /* 1. how good a customer */
 if(V.done){h+=`<div class="pfc"><div class="vd2"><div class="ring ${V.tone}" style="--p:${V.rate}"><i>${bn(V.rate)}%</i></div><div><b>${bn(V.done)}টির মধ্যে ${bn(V.ok.length)}টি অর্ডার সফল</b><span>সফল অর্ডারের হার</span></div></div><ul class="rs">${V.reasons.map(x=>`<li class="${x[0]}">${x[1]}</li>`).join('')}</ul></div>`}
 else if(o.length){h+=`<div class="pfc"><div class="emp2"><div class="ic">${I('clk')}</div><div><b>প্রথম অর্ডার চলছে</b><span>ডেলিভারি হওয়ার পর এখানে সফল অর্ডারের হার আর কেমন কাস্টমার তা দেখা যাবে।</span></div></div></div>`}
 else if(fresh){h+=`<div class="pfc"><div class="emp2"><div class="ic">${I('bag')}</div><div><b>এখনো কোনো অর্ডার নেই</b><span>প্রথমবার মেসেজ করেছেন। অর্ডার হলে এখানে অর্ডারের ইতিহাস, সফল অর্ডারের হার আর কেমন কাস্টমার তা দেখা যাবে।</span></div></div></div>`}
 else{h+=`<div class="pfc"><div class="emp2"><div class="ic">${I('bag')}</div><div><b>এখনো কিছু কেনেননি</b><span>${bn(P.talks)}বার কথা বলেছেন, মোট ${bn(P.msgs)}টি মেসেজ দিয়েছেন, কিন্তু কোনো অর্ডার হয়নি।</span></div></div></div>`}
 /* 2. order summary (only real numbers) */
 if(V.done){const tl=[['মোট অর্ডার',o.length,''],['সফল',V.ok.length,'ok'],['বাতিল',V.cx.length,'er'],['ফেরত',V.rt.length,'wr'],['চলমান',V.run.length,'']].filter((x,i)=>i===0||x[1]>0);
  const sum=V.ok.reduce((a,x)=>a+x.amt,0);
  h+=`<div class="pfc"><h5>অর্ডারের সারাংশ</h5><div class="tiles">${tl.map(x=>`<div class="tile ${x[2]}"><b>${bn(x[1])}</b><span>${x[0]}</span></div>`).join('')}</div>`+
   (V.ok.length?kv('মোট কেনাকাটা',taka(sum)):'')+(V.ok.length>1?kv('গড় অর্ডার',taka(Math.round(sum/V.ok.length))):'')+kv('শেষ অর্ডার',dFmt(o[0].ts))+`</div>`}
 /* 3. intro for a brand-new customer / buying behaviour for everyone else */
 if(fresh){h+=`<div class="pfc"><h5>পরিচিতি</h5>${kv('প্রথম মেসেজ',when(P.first))}${kv('চ্যানেল',CH[c.ch].n)}${P.firstTxt?`<div class="fmsg">${esc(P.firstTxt)}</div>`:''}</div>`}
 else{h+=`<div class="pfc"><h5>কথা বলা আর কেনার আচরণ</h5>${kv('প্রথম মেসেজ',dFmt(P.first))}${kv('মোট মেসেজ দিয়েছেন',bn(P.msgs)+'টি')}${kv('কথা হয়েছে',bn(P.talks)+' বার')}`+
  (o.length?kv('অর্ডার হয়েছে',bn(o.length)+' বার'):'')+(o.length&&P.talks>o.length?kv('কথা হয়েছে, কিন্তু অর্ডার হয়নি',bn(P.talks-o.length)+' বার'):'')+`</div>`}
 /* 4. orders grouped by workspace / store */
 if(o.length){const g=[];o.forEach(x=>{let e=g.find(y=>y.n===x.store);if(!e)g.push(e={n:x.store,l:[]});e.l.push(x)});
  h+=`<div class="pfc" id="pfOrders"><h5>অর্ডারের ইতিহাস</h5>${g.map((e,gi)=>{const t=e.l.filter(x=>x.s==='ok').reduce((a,x)=>a+x.amt,0);
   return`<div class="stg" data-g="${gi}"><div class="sth">${I('bag')}${esc(e.n)}<span>${bn(e.l.length)}টি অর্ডার${t?' · '+taka(t):''}</span></div>${e.l.map((x,i)=>`<div class="ord ${i>=3?'x':''}"><div class="l"><b>${esc(x.items)}</b><span>${dFmt(x.ts)} · ${x.id}</span>${x.why?`<span class="why">${esc(x.why)}</span>`:''}</div><div class="r">${taka(x.amt)}<em class="${ST[x.s][1]}">${ST[x.s][0]}</em></div></div>`).join('')}${e.l.length>3?`<button class="mo" data-a="more">আরও ${bn(e.l.length-3)}টি দেখুন</button>`:''}</div>`}).join('')}</div>`}
 /* 5. contact: only what we actually know */
 const rows=[P.phone&&c.ch!=='wa'&&kv('ফোন',P.phone),P.addr&&kv('ঠিকানা',esc(P.addr)),P.pay&&kv('পছন্দের পেমেন্ট',P.pay)].filter(Boolean);
 if(rows.length)h+=`<div class="pfc"><h5>যোগাযোগ ও ডেলিভারি</h5>${rows.join('')}</div>`;
 if(P.asked.length)h+=`<div class="pfc"><h5>যা নিয়ে জানতে চেয়েছেন</h5><div class="chips2">${P.asked.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div>`;
 h+=`<div class="pfc"><h5>আপনার নোট</h5><textarea class="nt" id="pfNote" rows="2" placeholder="এই কাস্টমার সম্পর্কে কিছু লিখে রাখুন…">${esc(c.note||'')}</textarea></div>`;
 return h}
function openProfile(){if(!cur)return;$('#pfBody').innerHTML=pfHTML(cur);$('#pfBody').scrollTop=0;$('#ph').classList.add('prof')}
$('#chInfo').onclick=openProfile;
$('#pfBack').onclick=()=>$('#ph').classList.remove('prof');
$('#pfBody').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
 if(a==='chat')$('#ph').classList.remove('prof');
 if(a==='copy'){try{navigator.clipboard.writeText(profData(cur).phone)}catch(_){}toast('নম্বর কপি হয়েছে')}
 if(a==='ai'){cur.ai=!cur.ai;hdr();b.innerHTML=I('ms')+(cur.ai?'AI বন্ধ করুন':'AI চালু করুন');toast(cur.ai?'AI আবার রিপ্লাই দিবে':'আপনি এখন রিপ্লাই দিচ্ছেন')}
 if(a==='more'){const g=b.closest('.stg');g.classList.toggle('open');b.textContent=g.classList.contains('open')?'কম দেখুন':'আরও '+bn(g.querySelectorAll('.ord.x').length)+'টি দেখুন'}});
$('#pfBody').addEventListener('input',e=>{if(e.target.id==='pfNote'&&cur)cur.note=e.target.value});
$('#pfBody').addEventListener('focusout',e=>{if(e.target.id==='pfNote'&&cur&&cur.note)toast('নোট সেভ হয়েছে')});

/* ---------- demo controls ---------- */
$('#cNet').onclick=e=>{net=!net;e.target.textContent=net?'ইন্টারনেট বন্ধ করুন':'ইন্টারনেট চালু করুন';
 if(net){$('#netChip').className='chip sync';$('#netChip').innerHTML='<i class="dot"></i>সিঙ্ক হচ্ছে';setTimeout(updNet,1200);$('#inBan').classList.remove('show');$('#chBan').classList.remove('show');updComposer()}else updNet()};
$('#cSim').onclick=()=>simCustomer(cur||convs[2]);
$('#cOther').onclick=()=>{if(!net)return toast('ইন্টারনেট নেই');const o=convs.filter(c=>c!==cur);const c=o[Math.floor(Math.random()*o.length)];const t=SIM[si++%SIM.length];
 setTimeout(()=>{incoming(c,mk('c',t,0,{ts:Date.now()}));if(c.ai)aiReply(c,t)},400)};
$('#cReact').onclick=()=>{if(!cur)return toast('আগে একটি চ্যাট খুলুন');const m=[...cur.msgs].reverse().find(x=>x.from!=='c');if(!m)return;m.react=['👍','❤️','😍'][Math.floor(Math.random()*3)];reRow(m)};
$('#cTheme').onclick=e=>{const l=$('#ph').classList.toggle('light');e.target.textContent=l?'ডার্ক থিম':'লাইট থিম'};

/* demo images drawn on a canvas, so no file picker is needed */
const DEMO=[['#e9c9a0','#8a6a4f','👟'],['#a8c5d9','#3b5a73','👕'],['#d9a8b4','#7a3b4c','👜'],['#c9d9a8','#4c6b3a','🧢'],['#d9cfa8','#6b5d3a','🕶️']];let di=0;
function demoImg(){const[a,b,e]=DEMO[di++%DEMO.length],c=document.createElement('canvas');c.width=720;c.height=540;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,720,540);g.addColorStop(0,a);g.addColorStop(1,b);x.fillStyle=g;x.fillRect(0,0,720,540);x.font='260px serif';x.textAlign='center';x.textBaseline='middle';x.fillText(e,360,280);return c.toDataURL('image/jpeg',.85)}
$('#cImgS').onclick=()=>{if(!cur)return toast('আগে একটি চ্যাট খুলুন');if(!net)return toast('ইন্টারনেট নেই');if(!windowOpen(cur))return toast('২৪ ঘণ্টা পার হয়ে গেছে');pvOpen([demoImg()])};
$('#cImgM').onclick=()=>{if(!cur)return toast('আগে একটি চ্যাট খুলুন');if(!net)return toast('ইন্টারনেট নেই');if(!windowOpen(cur))return toast('২৪ ঘণ্টা পার হয়ে গেছে');pvOpen([demoImg(),demoImg(),demoImg(),demoImg()])};
$('#cImgCM').onclick=()=>{const c=cur||convs[0];if(!net)return toast('ইন্টারনেট নেই');setTimeout(()=>{incoming(c,mk('c','',0,{type:'imgs',srcs:[1,2,3,4,5].map(demoImg),ts:Date.now()}));if(c.ai)aiReply(c,'')},400)};
$('#cImgC').onclick=()=>{const c=cur||convs[0];if(!net)return toast('ইন্টারনেট নেই');setTimeout(()=>{incoming(c,mk('c','',0,{type:'img',src:demoImg(),ts:Date.now()}));if(c.ai)aiReply(c,'')},400)};

/* design-page hook: puts the prototype into a named, frozen state (used by ekmivo-app-design.html) */
window.__step=function(k){
 const later=(f,t)=>setTimeout(f,t),lastOf=f=>[...cur.msgs].reverse().find(f),
  cust=()=>lastOf(m=>m.from==='c'&&m.type==='text'),own=()=>lastOf(m=>m.from!=='c'&&m.type==='text'),
  rowOf=m=>$(`#msgs [data-id="${m.id}"]`),view=e=>{if(!e)return;const b=$('#msgs');b.scrollTop+=e.getBoundingClientRect().top-b.getBoundingClientRect().top-b.clientHeight/2+e.offsetHeight/2},
  sendImg=st=>{const m={id:uid++,from:'s',type:'img',src:demoImg(),ts:Date.now(),st};cur.msgs.push(m);appendMsg(m);view(rowOf(m))},
  sendImgs=(n,st)=>{const m={id:uid++,from:'s',type:'imgs',srcs:Array.from({length:n},()=>demoImg()),ts:Date.now(),st};cur.msgs.push(m);appendMsg(m);view(rowOf(m))},
  chat=(id,f,t)=>{openChat(id);if(f)later(f,t||350)};
 const A={
 'list':()=>{},
 'list-filter':()=>$$('#chips button')[1].click(),
 'list-filter-channel':()=>$$('#chips button').find(b=>b.textContent.includes('Instagram')).click(),
 'list-filter-sheet':()=>$('#fBtn').click(),
 'list-offline':()=>$('#cNet').click(),
 'list-notif':()=>{notify(convs[1],mk('c','ভাইয়া, এই জুতাটার দাম কত?',0,{ts:Date.now()}));clearTimeout($('#notif').t)},
 'chat-open':()=>chat(1),
 'chat-ai-typing':()=>chat(1,()=>setTyping(cur,'a'),300),
 'chat-select-customer':()=>chat(1,()=>{const m=cust();view(rowOf(m));later(()=>select(m.id),150)}),
 'chat-reacted':()=>chat(1,()=>{const m=cust();m.react='❤️';reRow(m);view(rowOf(m))}),
 'chat-select-own':()=>chat(1,()=>{const m=own();view(rowOf(m));later(()=>select(m.id),150)}),
 'chat-swipe':()=>chat(1,()=>{const m=cust(),r=rowOf(m);view(r);const bc=r.querySelector('.bc'),rp=r.querySelector('.rep');bc.classList.remove('back');bc.style.transform='translateX(64px)';rp.style.opacity=1;rp.style.transform='scale(1)';rp.style.background='var(--cr)';rp.style.color='var(--ink)'}),
 'chat-reply-bar':()=>chat(1,()=>startReply(cust().id)),
 'attach-sheet':()=>chat(1,()=>$('#bClip').click(),300),
 'attach-sheet-ig':()=>chat(2,()=>$('#bClip').click(),300),
 'product-picker':()=>chat(1,()=>prodSheet(),300),
 'image-preview':()=>chat(1,()=>pvOpen([demoImg()]),300),
 'images-preview':()=>chat(1,()=>{pvOpen([1,2,3,4].map(demoImg));pcur=1;pvRender()},300),
 'images-2':()=>chat(1,()=>sendImgs(2,'seen')),
 'images-3':()=>chat(1,()=>sendImgs(3,'seen')),
 'images-4':()=>chat(1,()=>sendImgs(4,'delivered')),
 'images-received-5':()=>chat(1,()=>{const m={id:uid++,from:'c',type:'imgs',srcs:[1,2,3,4,5].map(demoImg),ts:Date.now()};cur.msgs.push(m);appendMsg(m);view(rowOf(m))}),
 'images-viewer':()=>chat(1,()=>{const m={id:uid++,from:'c',type:'imgs',srcs:[1,2,3,4,5].map(demoImg),ts:Date.now()};cur.msgs.push(m);appendMsg(m);openViewer(m,2)}),
 'image-sending':()=>chat(1,()=>sendImg('sending')),
 'image-sent':()=>chat(1,()=>sendImg('sent')),
 'image-delivered':()=>chat(1,()=>sendImg('delivered')),
 'image-seen':()=>chat(1,()=>sendImg('seen')),
 'image-received':()=>chat(2),
 'image-viewer':()=>chat(2,()=>$('#msgs .imgw').click()),
 'product-card':()=>chat(1,()=>view($('#msgs .pc'))),
 'voice-recording':()=>chat(1,()=>startRec(),300),
 'voice-message':()=>chat(3),
 'doc-message':()=>chat(4),
 'sticker-unsupported':()=>chat(5),
 'info-sheet':()=>chat(1,()=>infoSheet(own())),
 'forward-sheet':()=>chat(1,()=>fwdSheet(own())),
 'window-closed':()=>chat(6),
 'chat-offline':()=>chat(1,()=>$('#cNet').click(),300),
 'send-failed':()=>chat(1,()=>{const m={id:uid++,from:'s',type:'text',text:'ঠিক আছে, পাঠাচ্ছি',ts:Date.now(),st:'failed'};cur.msgs.push(m);appendMsg(m);view(rowOf(m))}),
 'composer-typing':()=>chat(1,()=>{inp.value='জি, আজকেই পাঠিয়ে দিচ্ছি';autosize();syncSend()},300),
 'profile-regular':()=>chat(1,()=>openProfile(),350),
 'profile-orders':()=>chat(1,()=>{openProfile();later(()=>{const bd=$('#pfBody');bd.scrollTop+=$('#pfOrders').getBoundingClientRect().top-bd.getBoundingClientRect().top-8},250)},350),
 'profile-risky':()=>chat(2,()=>openProfile(),350),
 'profile-new':()=>chat(7,()=>openProfile(),350),
 'profile-lookers':()=>chat(5,()=>openProfile(),350),
 'profile-first-order':()=>chat(6,()=>openProfile(),350),
 'profile-light':()=>{$('#ph').classList.add('light');chat(1,()=>openProfile(),350)},
 'chat-light':()=>{$('#ph').classList.add('light');chat(1)},
 'list-light':()=>$('#ph').classList.add('light')};
 (A[k]||A.list)()};
renderList();updNet();syncSend();
setInterval(()=>{if(!$('#ph').classList.contains('chat'))renderList()},60000);
</script>
</body>
</html>

~~~~

`````
<!-- END SOURCE: ekmivo-design-spec.md -->

## Verified combined CI checkpoint — 2026-10-19

Commit `4cf7f9b780600ec55c60cf4abfb007d87f5c6b54`, [Foundation CI run 39267709334](https://github.com/masharzy/ekmivo/actions/runs/39267709334): **all four jobs passed** — native Kotlin Compose assemble/unit tests, Go compile/unit/race/vet/HTTP smoke, runtime/migration image builds, and full Next.js lint/build/OpenAPI/PostgreSQL/session/browser suites. Mobile foundation SQL and restricted-role execution were included.

Final follow-up contains this consolidated handoff, both-off permission-screen guard, stable end-of-history pagination and quote content/jump across older pages. Inspect the latest PR head CI before continuing; the green checkpoint above predates this final follow-up. Real-device/provider/production acceptance remains pending as documented.

## Phase 5–6 continuation checkpoint — 2026-10-20

Phase 5–6 source is added by control migration 0121, Inbox advanced/media/provider handlers and native `InboxMedia`, `InboxMessageActions`, `CustomerProfile`, `CustomerVerdict` components. Current API/operator/configuration/verification details are appended in `ANDROID-MESSAGING-API.md`, `ANDROID-REDESIGN-STATUS.md`, and the consolidated `MANUAL-VERIFICATION.md`. Earlier “later media/profile endpoints are not implemented” passages above describe the phase 2–4 checkpoint only. Do not infer production readiness: Meta approval/account, private storage/scanner, device and visual checks remain pending. Check latest PR head CI before continuing.
