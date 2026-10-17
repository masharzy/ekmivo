# Ekmivo Android App: Full Redesign and Rebuild Prompt

Paste everything below into your coding agent. Give it access to the Android project, the Ekmivo web dashboard repo, and the approved design reference:

**Design reference (source of truth for layout and feel):** https://claude.ai/artifact/3762SwiFQWWnn5BD4ChZVy
It is an interactive page with 5 screens: Home, Pairing, Permission wizard, Disconnected, Settings. Open it and study every screen before writing code.

---

## 0. Your role

You are a senior Android engineer and product designer (Kotlin, Jetpack Compose, Material 3, Android system services). You are taking over the Ekmivo seller Android app. The current build looks like a generic template and behaves naively: dead-end states, chores pushed onto the user, and none of the polish of the Ekmivo web dashboard. Make it feel like the same team built both: premium, minimal, calm, trustworthy.

Work like an engineer, not a code generator:

1. **Investigate before changing anything.** Read the whole project. Find the root cause of each problem in section 2. Write a short audit (what is wrong, why, which files) before editing.
2. **No stacked patches.** If the current architecture cannot support the behaviour below, restructure it properly and say so.
3. **Match the web.** Read the web dashboard's design tokens (Tailwind config, `globals.css`, theme files, components) and port them into a Compose theme: colours, radii, type scale, spacing, light and dark. The design reference uses placeholder colours and fonts only. Take layout, hierarchy, behaviour and copy from the reference; take colours, fonts and radii from the web.
4. Keep the backend contract (pairing, SMS ingest) intact unless broken. If an API or web change is needed, list it explicitly instead of assuming it.

---

## 0a. Copy and content rules (these OVERRIDE any conflicting text in this prompt, the spec, and the reference page)

The reference page is a **design** reference. Layout, sizes, colours, hierarchy, number of elements and animation stay exactly as drawn. Its **text and numbers are demo content** and must not ship as-is.

### Rules
1. **Never name payment providers in UI copy** (no bKash, Nagad, Rocket, etc.). Use the generic phrase "পেমেন্টের SMS" (English: "payment SMS"). Which senders count as payment SMS comes from server config, so the same app works for any provider.
2. **Provider marks in the feed** (the small coloured tile) are derived from the sender profile the server provides (display name initials and brand colour). Unknown sender: neutral tile (surface-2 background, muted initials). No hard-coded provider colours in the UI code.
3. **Every claim must be true.** If the product cannot guarantee a sentence, rewrite it. The app has to look at each incoming SMS on the phone to find payment ones, so "no other SMS are read" is inaccurate; say that other SMS are not **sent or stored**. Do not write "secure", "automatically verified" or "you don't have to match anything" unless the product really guarantees it.
4. **Everything dynamic comes from real data** (see the table below). No demo values in code, previews excepted.
5. **Brand-specific guidance only on that brand.** The Samsung battery step appears only when `Build.MANUFACTURER` is Samsung. Other brands get their own equivalent step (or generic battery guidance); skip if none.
6. All strings in `strings.xml` in Bangla and English, same tone. "SMS" may stay in Bangla sentences. Digits follow locale (Bangla digits and ৳ in Bangla; Latin digits in English).

### Approved replacement copy (Bangla; write English equivalents in the same tone)
| Where | Use this text |
|---|---|
| Welcome, body | এই ফোনে আসা পেমেন্টের SMS নিজে থেকে Ekmivo-তে পাঠানো হবে। |
| Welcome, numbered steps | from the real flow, see 3.3c |
| Camera permission, body | QR কোড স্ক্যান করতে ক্যামেরা লাগবে। কোনো ছবি সংরক্ষণ করা হয় না। (verify this is true in code) |
| Consent sheet, paragraph | Ekmivo এই ফোনে আসা SMS দেখে শুধু পেমেন্টের SMS **{দোকানের নাম}**-এ পাঠাবে। বাকি SMS পাঠানো বা সংরক্ষণ করা হবে না। |
| Connecting, body | {দোকানের নাম}-এর সাথে যুক্ত করা হচ্ছে। |
| SMS permission, body | এই ফোনে আসা পেমেন্টের SMS চিনে Ekmivo-তে পাঠাতে এই অনুমতি দরকার। বাকি SMS পাঠানো হবে না। |
| Done, body | {দোকানের নাম}-এর পেমেন্ট SMS এখন থেকে নিজে থেকে Ekmivo-তে পাঠানো হবে। |
| Home hero label | "আজ যাচাই হয়েছে" **only if the server returns a verified total**. If the app only knows what it forwarded, use "আজ পাঠানো হয়েছে" and show the forwarded amount. The label must match the data source. |

### Demo content in the reference that must be replaced by real data
| Demo in reference | Production source |
|---|---|
| Shop name "রহিম ফ্যাশন", avatar "রি" | shop name from the QR payload or code validation response; avatar = first letter(s) of that name |
| Device name "Galaxy A54" | `Build.MANUFACTURER` + `Build.MODEL` by default, editable by the seller, sent to the dashboard |
| ৳১২,৪৫০, ১৮ / ১ / ১ (hero and stats) | live values from the local database / server |
| Feed rows (amounts, "••••৪৮২১", "২ মি আগে", status tags) | parsed from real SMS: amount, masked sender, relative time, delivery status |
| "bK", "Ng" tiles and their colours | sender profile from server config (rule 2) |
| "শেষ SMS ২ মিনিট আগে…", "শেষ সিঙ্ক ২ মিনিট আগে" | real timestamps, relative formatting |
| "২টি অপ্রেরিত SMS দেখুন" | real unsent count; hide the link when zero |
| Code cells "K7M2-9Q" | empty input; length and character set from the server's code format |
| Settings values "চালু" / "ঠিক করুন ›" | live Setup Health state |
| Samsung step text | conditional (rule 5) |
| Welcome step rows naming a dashboard button ("ফোন যুক্ত করুন") | actual labels from the web dashboard (3.3c) |

### Text on the reference page that should not ship as-is (detected)
- Any "bKash ও Nagad" wording (welcome, consent sheet, SMS permission): replaced above.
- "অন্য কোনো SMS পড়া হবে না": inaccurate, replaced above.
- "আপনাকে কিছু মেলাতে হবে না": over-promise, removed.
- "নিরাপদ সংযোগ": unverified claim, removed.
- "কোনো ছবি তোলা বা রাখা হবে না": keep only the verified part (images are not saved).
- "আজ যাচাই হয়েছে" and "…নিজে থেকে যাচাই হবে": claim server-side verification; see the table.
- The welcome step rows: guessed dashboard wording, replaced by real flow.
- Page chrome of the reference (page title, captions, the notes under the phone, "টর্চ"-style demo labels are fine): none of the page's own explanatory captions go into the app.

---

## 1. What the app is

Ekmivo is an omnichannel e-commerce SaaS with automated mobile-payment SMS verification. The Android app is the seller's phone companion:

- Forwards incoming payment SMS to the Ekmivo server reliably, even with the screen off.
- Is paired to one seller shop through a one-time code or QR from the web dashboard.
- Later (not now): unified inbox for WhatsApp, Messenger and Instagram with AI-assisted replies and push notifications when a customer replies.

Users are non-technical shop owners in Bangladesh. Default language Bangla, English available. The app must work without the user understanding Android battery management.

---

## 2. Problems in the current build (verify each in code)

1. **Disconnect is a dead end.** After the seller disconnects the phone from the web, the app shows a warning ("server authorization not matched") with a "check connection again" button and text telling the user to fix sync instead of pairing again. After a revoke, only re-pairing can work. Likely root cause: HTTP 401/403 treated as a transient sync error while local pairing data is kept. The header also still says "LIVE" during the error, a contradiction.
2. **Setup is pushed onto the user.** Settings tells the user to grant background access themselves, accept a persistent notification, and on Samsung remove the app from Sleeping/Deep sleeping apps. No permission checklist, no detection of what is missing, no guided flow.
3. **Pairing is clumsy.** A QR scan only fills the text field; the user must tick a checkbox and press connect.
4. **Settings are sparse.** Language, theme, two outlined buttons. No device info, last sync, diagnostics, or disconnect.
5. **Visual quality.** Flat default dark Material, weak hierarchy, a chunky pill bottom bar, empty space, Bangla and English mixed inside one sentence, "SMS Forwarder" untranslated beside Bangla labels, an empty Inbox tab.

---

## 3. Required behaviour

### 3.1 Connection state machine (single source of truth)

Model it explicitly (sealed `ConnectionState` in a repository exposed as `StateFlow`) and render every screen from it.

| State | Meaning | UI |
|---|---|---|
| `Unpaired` | no credentials | Pairing screen |
| `Pairing` | verifying code | inline progress, inputs disabled |
| `Active` | paired and accepted by server | Home, live |
| `Degraded(reason)` | offline or server unreachable, queue growing | amber banner, queue count, automatic retry with backoff; never asks to re-pair |
| `PermissionsIncomplete(missing)` | paired but forwarding unreliable | Home shows the fix card, wizard resumes at the first missing item |
| `Revoked` | 401/403 or explicit revoke signal | clear token, stop worker, keep unsent queue safe, show Disconnected screen |

Map 401/403 to `Revoked` in exactly one place (the auth interceptor). Distinguish 4xx from 5xx and from network errors. Handle token refresh if it exists, clock skew, airplane mode, process death, device reboot (`BOOT_COMPLETED`).

Decide and document what happens to SMS received while revoked. Recommended: keep locally for a configurable window, offer upload after re-pairing to the same shop, discard if paired to a different shop.

### 3.2 Permissions and reliability: guided and automatic

Build a **Setup Health** system that re-checks on every resume and exposes items as `OK / Missing / Unknown`:

- SMS permission (`RECEIVE_SMS`, `READ_SMS` as the implementation needs)
- Notifications (`POST_NOTIFICATIONS`, Android 13+)
- Battery optimisation exemption (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` flow)
- Foreground service for reliable forwarding, with an intentional low-importance notification channel and a quick action to open the app
- Camera, requested only when the user taps scan
- OEM restrictions (Samsung Sleeping/Deep sleeping apps, Xiaomi autostart, etc.): cannot be set programmatically. Detect the manufacturer, open the best available settings intent with fallbacks, show a short step guide, let the user mark it done, and re-surface it if forwarding gaps are detected.

Rules:
- Right after pairing succeeds, run the **permission wizard**: one permission per step, one-line plain reason, a primary action that triggers the system dialog or settings intent, automatic advance on grant, correct handling of "denied" and "don't ask again" (deep link to app settings).
- Never request everything in one burst at launch. Never silently skip a needed permission.
- Home shows a health card only when something is wrong, with one fix button that resumes the wizard at the first missing item.
- Detect real failure: if last-received and last-forwarded times diverge, or the worker has not run, show a warning instead of failing silently.

### 3.3 Pairing flow

**Key rule: before the QR is read or the code is validated, the app does not know which shop it is connecting to. No screen before that point may show a shop name.** The shop name appears only after the QR payload (or a server "validate code" response) provides it.

First-launch flow, exactly in this order (see the reference page, mode "প্রথমবার সেটআপ", 10 steps):
1. **Welcome** (unpaired first open): logo, title, one-line value, a card of numbered steps whose text comes from the **real** pairing flow (section 3.3c, not the placeholder text on the reference page), primary "Scan QR", link "Connect with a code".
2. **Camera permission**: shown only if camera access is not yet granted; skipped otherwise.
3. **Scan**: live viewfinder with corner brackets, torch, hint "Hold the dashboard QR inside the frame", link "Connect with a code". Generic header, no shop name.
4. **Confirm**: appears after the QR is read. Viewfinder dims, a bottom sheet shows the shop name (now known) and one sentence (approved copy in section 0a), and one button, **Confirm and connect**. Tapping it is the consent; store consent timestamp and version.
5. **Connecting**: spinner, "Connecting…", no buttons.
6. **Permission wizard**, one permission per screen: SMS, notifications, battery exemption, OEM guide (Samsung only; skipped on other brands). Steps for permissions already granted are skipped.
7. **Done**: "All set", then Home.

### 3.3c The real pairing flow (do not copy the placeholder steps)

The reference page's three welcome steps ("open Connect phone on the dashboard", "scan QR on this phone", "give permissions") are **placeholders**. Write the real ones from the product as it exists:

1. **Read the web repo** and find: the page and menu path where the seller generates the QR/pair code, its exact label, whether the seller must be logged in first, code length/format/expiry, the QR payload format (does it carry shop name?), and whether a deep link exists. Write the welcome rows (2 to 4 rows; keep the drawn card layout) from what you find, using the dashboard's actual labels in the dashboard's language.
2. If something cannot be determined from the repos, use neutral wording ("ড্যাশবোর্ডে ফোন যুক্ত করার পেজ খুলুন") and list it as "needs confirmation" in the audit. Never invent a menu path.
3. **Single-device sellers.** Many sellers have only this phone, and a phone cannot scan its own screen. The code path must be first-class, not hidden: the dashboard opened in the phone's browser should offer the code and an **"Open in app"** deep link (`ekmivo://pair?code=…`); the app also offers an explicit "Paste code" action (read the clipboard only on that tap). If the web lacks the deep link or a copyable code, list it as a required web change.
4. The app has no login of its own: identity comes from the web account that issued the code. Confirm this in the repo and state it.
5. Layout and animation of the Welcome, Scan, Code and Confirm screens do not change; only their text and data do.

Code entry (alternative path, reachable from Welcome, Camera permission and Scan): cell-style code input, "Verify code". After verification the server returns the shop name and the same Confirm sheet is shown, then steps 5 to 7.

Auto-advance rules: scan success goes straight to Confirm; permission grant goes straight to the next step; no step requires the user to press a second button to proceed after an action succeeded, other than the single consent button.
5. If the QR can also carry the shop name or a deep link (`ekmivo://pair?code=...`), use it. List any web-side change needed.
6. Errors are specific: expired code, already used, wrong environment, no network, each with its exact next action.

SMS permissions are restricted on Google Play. State in the audit how the app is distributed (sideloaded APK or Play with a declared exception) and design accordingly.

### 3.4 Delivery guarantees

- Persist every received payment SMS to Room **before** upload. Upload with WorkManager and exponential backoff. Uploads idempotent via a stable client message id.
- Sender filter list comes from server config, not hard-coded.
- Per-message status: received, sending, sent, failed (with reason and retry).
- "Recover missed SMS" becomes a **Rescan inbox** tool in Diagnostics with a date range and a result summary.

---

## 4. Design spec (matches the approved reference)

### 4.1 Principles
A payment control room: one glance tells the seller whether money is flowing. Few elements, strong hierarchy, no decoration. Same voice as the web dashboard. Dark and light equally polished plus a System option; dark uses layered surfaces (background, surface, raised) with hairline borders, not flat black.

### 4.2 Foundations
- Compose + Material 3 as a base only; override colours, shapes and typography fully with the web's tokens.
- Reference placeholder palette (replace with web tokens): background near-black, surface and raised surface one step lighter each, hairline border, cream text and cream primary button with dark text (matches the "e." logo tile), green for live/success, amber for pending/warning, red for failed/error. Semantic colours only for status.
- Typography: the web's type scale; choose a Bangla font that pairs with it; set explicit Bangla line heights (conjuncts clip with tight heights). Tabular numerals for amounts.
- Motion: soft pulse on the live indicator, `AnimatedContent` for state changes, insert animation for new feed rows, haptic on success. Respect reduced motion.
- One icon set, outlined, consistent stroke.
- Navigation: slim bottom bar with **two tabs: Live and Settings**, selected tab as a subtle raised pill. Edge-to-edge with correct insets. Hide the Inbox tab behind a feature flag until it exists.

### 4.3 Screens

**Home (Live)**
- Header row: logo tile "e.", shop name with device name beneath, and a connection chip on the right (Live / Syncing / Offline / Needs attention), driven strictly by `ConnectionState`.
- Hero: a circular pulse ring (two staggered expanding rings in the success colour) around a core circle showing today's verified total in large type with the label "verified today", and beneath it "Last SMS forwarded 2 minutes ago". When degraded or needing attention, the same hero changes tone and shows the single most important action. One hero, one message.
- Three compact stat tiles: Forwarded, Pending, Failed (failed number in the error colour). Tapping Pending or Failed filters the feed.
- "Recent payments" feed: rows with a provider mark (derived from the sender profile the server provides, never hard-coded), amount in strong type, masked sender and relative time beneath, and a status chip on the right (sent / sending / retry). Rows separated by hairlines, not cards. New rows animate in. Tap opens a detail sheet (raw text, timestamps, attempts, retry).
- Empty state: invitation, explains what will appear, offers a test forward.
- Health card only when needed.

**Pairing**
- Header "Connect this phone" with subtitle "Scan the QR from your dashboard".
- Camera viewfinder filling the body, framed with four corner brackets, torch toggle, automatic detection.
- On scan, the viewfinder dims and the consent sheet slides up: shop avatar and name, "Scan successful", the one-sentence consent, full-width primary **Confirm and connect**, and a quiet Cancel. Below the camera, a "Use a code instead" entry.

**Permission wizard**
- Four progress bars at the top (completed ones filled).
- Centered: large rounded icon tile, title, a two-line reason, and small status tags for steps already done.
- Bottom: full-width primary action ("Allow") and a quiet "Why is this needed?" link that expands a short explanation.

**Disconnected**
- Header with a red "Disconnected" chip.
- Centered: red-toned icon tile, title "This phone was disconnected from your dashboard", body "The device was removed from the web. Reconnect and SMS forwarding resumes.".
- Bottom: one primary **Reconnect** button that goes straight to pairing, and a quiet link "View 2 unsent SMS". No retry button anywhere in this state.

**Settings** (grouped cards, not a flat list)
- Device card: shop name with device name, last sync.
- Reliability card: SMS permission, notifications, battery exemption, each with a status value on the right (On in green, "Fix ›" in amber that opens the wizard step). Also the OEM battery guide.
- App card: language segmented control (Bangla / English), theme segmented control (System / Light / Dark), Diagnostics and logs row (export logs, test forward, rescan inbox, app version).
- Separate destructive card at the bottom: **Disconnect this phone**, in the error colour, with a confirmation sheet that explains the consequences.
- Later additions the layout must allow: notification sound and quiet hours, sender filters (read-only from server), retry all failed, local queue size, support link.

**Inbox (not built yet)**
Do not ship an empty tab. Build the groundwork only: `feature/inbox` package, nav route behind `inboxEnabled`, a "customer replied" notification channel, FCM token plumbing behind the flag, domain sketch (`Conversation`, `Message`, `Channel {WHATSAPP, MESSENGER, INSTAGRAM}`, `AiSuggestion`) and a repository interface. Future intent for context: conversation list with channel badges and unread counts, thread view, AI reply suggestions as editable chips above the composer, push notification deep-linking to the thread, all traffic through backend APIs.

### 4.4 Copy and localisation
- All strings in `strings.xml` in Bangla and English. No hard-coded strings.
- **Never mix languages inside a sentence.** Terms Bangla users genuinely say in English (SMS) may stay; write natural Bangla for the rest ("ব্যাটারি ছাড়", not "background access"). Write like a product writer, short and friendly, not word-for-word translation. Translate "SMS Forwarder" and nav labels consistently.
- Sentence case. Buttons start with a verb. Errors say what happened and what to do, in one or two lines, never raw exception text, never first person.
- Use the Bangla copy in the reference as the starting point.

---

## 5. Engineering standards

- Single-activity, Compose Navigation, MVVM or MVI with unidirectional data flow, repositories, Hilt (or Koin if already used), Room, DataStore, WorkManager, Retrofit or Ktor with the auth interceptor above.
- Tokens stored securely (EncryptedSharedPreferences or Keystore-backed DataStore).
- Stateless composables. Previews for every screen in light, dark, Bangla, English, and each `ConnectionState`.
- Accessibility: 48dp touch targets, content descriptions, font scaling to 200% without breakage, checked contrast.
- Tests: unit tests for the state machine and the SMS filter/parser; an instrumented test for the pairing flow; a test proving 401 clears credentials and routes to Disconnected.
- Do not delete working delivery logic; refactor it behind the new repository.

---

## 6. Deliverables, in order

1. **Audit** (short): root causes for section 2, architecture assessment, list of required backend or web changes.
2. **Theme**: web tokens ported to Compose, with a preview screen of palette, type and components.
3. **State machine and repositories**, with tests.
4. **Pairing flow** with auto-pair and the consent sheet.
5. **Permission wizard and Setup Health.**
6. **Home, Disconnected, Settings** matching the reference.
7. **Inbox groundwork** behind the flag.
8. **Final summary**: what changed, what you could not do, what the web or backend team must do, manual QA steps (including a real Samsung device test with the screen off for 30 minutes).

Ask questions only when blocked by something you cannot find in the code or web repo. Otherwise decide, state the assumption in one line, and continue.

## 7. Quality bar

A stranger seeing a screenshot of this app next to the Ekmivo web dashboard should believe the same designer made both, and the app should look like the reference screens. No screen may contain a dead-end action, a contradicting status, a mixed-language sentence, or a task the app could have done for the user.