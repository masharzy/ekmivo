# Briofold — Unified dashboard implementation roadmap

**Owner decision:** 2026-10-20. **State:** Phase 0 planning baseline complete in this document; product implementation phases NOT claimed as implemented. Ekmivo is the current repository identity; Briofold is the owner's confirmed future brand spelling. This is a staged migration, not a replacement of the finance engine.

## 0. Non-negotiable product contract

1. One customer-facing business dashboard; **no AI vs Payment dashboard switch**. Only relevant features are exposed per business entitlement. One business can enable AI, Payments or Both.
2. The **current approved Payment Gateway dashboard** (Overview and the merchant dashboard reference family) is the ONLY visual standard for the unified dashboard. Homepage/marketing and checkout are separate design surfaces. Preserve payment dashboard spacing, radii, typography, table patterns, drawers, dialogs, statuses, responsive behavior and light/dark theme.
3. **No reliance on `apps/web/src/app/globals.css` to style dashboard views.** Today `apps/web/src/app/layout.tsx` imports `globals.css`, which imports marketing, payment, admin, checkout and dashboard styles together. This violates the owner's desired isolation. Phase 1 must physically split route-level stylesheet ownership and prevent marketing selectors/tokens from styling merchant screens; using higher-specificity overrides alone is NOT acceptance. Scoped CSS modules or an isolated dashboard stylesheet with namespace `.bf-dashboard` are acceptable. Keep only minimal neutral, audited root infrastructure (fonts/accessibility) if strictly necessary; no public-site visual rules on dashboard. Do not copy a new homepage look into dashboards. Admin remains independently scoped too.
4. **No feature removal:** route/name changes are allowed, but every existing Ekmivo capability and the audited AiPraktor-visible capability must have a documented, discoverable destination and a tested functionality/permission contract. No dead menu, mock save, source-unavailable presented as zero, or misleading "connected".
5. **No `/bn` or `/en` in visible links** and no workspace UUID or AI/payment service slug for normal merchant navigation. New primary paths are `/dashboard`, `/inbox`, `/orders`, `/payments`, `/customers`, `/reports`, `/settings`. Locale is user preference, not a URL segment. Legacy links redirect without internal proxy loops. Internal business IDs persist for authorization.
6. **Payment truth remains authoritative:** original wallet SMS/notification evidence matching, financial realm isolation, transaction idempotency, webhook delivery, device pairing, plan limits, refund and reconciliation semantics do not move into AI authority. No invented verified payments.
7. The user sees **one Dashboard and one Billing page**, but **two billing products**: Payment Gateway subscription/quotas, AI prepaid metered credits. Both means a chosen gateway tier PLUS AI credit wallet. Do not bundle unbounded AI calls. AI credit exhausted must not disable permitted manual Inbox or payment operations.
8. A business's contact, order, payment and invoice data may be related through authorized linking without collapsing their separate source of truth. Never merge customer identities by name or unverified phone alone.
9. Bengali/English, Hindi Siliguri for Bengali, payment-dashboard approved English font, keyboard/mobile accessibility, light/dark/system, loading/empty/error and RBAC are mandatory on every migrated route.
10. Production remains intact while new routes are built. Feature flags and dual-read compatibility exist before any legacy delete. Database schema migrations need forward/backward compatibility, backups and rollback plan.

## 1. Verified source baseline / limitations

- Current code: `apps/web/src/lib/dashboard-navigation.ts` defines separate `ai` and `payments` groups, `dashboard-frame.tsx` renders service picker, and `src/app/[locale]/w/[workspaceId]/...` houses current merchant pages.
- Current approved payment visual source: `apps/web/src/app/dashboard-v2.css`, `dashboard-shell-v3.css`, `dashboard-pass2.css`, `dashboard-refinement.css`, `apps/web/src/components/dashboard-reference.css` and `docs/evidence/DASHBOARD-SHELL-V3-UI-HANDOFF.md`. They currently contain cascading overrides; resolve actual approved computed styles at Phase 1 rather than blindly choosing the first CSS declaration. Preserve owner-approved overview appearance.
- Current global-CSS leak: `src/app/layout.tsx` loads `globals.css`, which imports public and merchant CSS in the same entrypoint.
- Competitor evidence: `docs/research/AIPRAKTOR-DASHBOARD-AUDIT.bn.md`, `docs/research/AIPRAKTOR-UI-INVENTORY.md`, `docs/research/aipraktor-dashboard-coverage.csv` (32 inspected routes, 157 screenshots reported). This is a **visible-UI inventory**, not proof that provider integrations work. Customer's separately uploaded ZIP/Markdown files should be compared again during visual QA; do not pretend they have been line-by-line verified if unreadable in a given runtime.
- Explicitly unobserved competitor capabilities include populated chat composer/sends, live provider connection, courier end-to-end, AI publish/runtime, booking details, website voice availability, real usage billing, mobile layout. Build meaningful tested parity, not imaginary copy claims.
- The current repo's `/dashboard` entrypoint and locale-neutral redirect were implemented separately; new /inbox, /orders, etc. are **NOT** claimed complete by that routing fix.

## 2. Final primary navigation (7 entries)

| Primary | URL | Everyday tabs / destinations |
|---|---|---|
| Overview | `/dashboard` | Today, metrics, waiting, order/payment/AI warnings, setup tasks, recent activity |
| Inbox | `/inbox` | Conversations: Waiting/Unread/Open/Done, Comments, Saved replies, Tickets, Agent Desk / human ownership |
| Orders | `/orders` | Orders, Products, Variants/Inventory, Scan/packing, Courier/handover, Returns/exchanges, Coupons, To chase |
| Payments | `/payments` | Transactions, Links + one-time requests, Invoices, Refunds, Incoming receipts, Reconciliation |
| Customers | `/customers` | Customer profiles, Leads/Pipeline, Follow-ups, Broadcasts, Bookings, Campaigns/Posts |
| Reports | `/reports` | Business overview, Sales, Conversations/AI, Payments, People/Team, Products/Campaigns, exports |
| Settings | `/settings` | Organized expandable categories, each large editor in dedicated nested route |

Product/Inventory remain reachable from Orders tabs; a separate product menu is not necessary but full product functionality is. Comments has both an Inbox operating view and Settings automation rules. Notifications remain accessible from header bell and full notifications page; activity log remains accessible from account/Settings. Contextual critical warnings (credit exhausted, pairing disconnected, incoming evidence unavailable) surface on the relevant work screen, not only buried in Settings.

## 3. Settings information architecture

- **Business & Verification:** Store/business profile, ownership, KYC/KYB, NID provider flow (where lawfully necessary), receiving account ownership, customer-facing branding, checkout themes, address/working hours, delivery rules.
- **AI & Channels:** AI assistant/Agent Desk instructions, draft/test/publish/rollback, knowledge Q&A/files, channel management (Facebook Messenger, Instagram, WhatsApp, website, supported others), Page-specific settings, exact website origin allowlist, website voice only if operationally supported, **Comment Automation** per selected/all/excluded posts and page, matching rules, AI/fixed/human mode, moderation and alerts, post-photo product mapping, privacy-compliant review/upsell.
- **Payment Setup:** Payment methods/receiving accounts, SMS devices (connect/reconnect/disconnect/delete, same stable identity), SMS input health, checkout methods/config, payment alerts, verification status. Devices are business-level unless a real per-account relationship exists.
- **Developers & Integrations:** API keys, domains/scopes/rotation/revocation, API Docs, Playground, webhooks/retries/logs, product import/sync/WooCommerce, courier provider credentials, apps/integrations.
- **Team & Security:** Staff members and Groups/permission matrix, per-channel restriction, Inbox ownership, on-duty status, account/MFA/recovery/session/device permissions, audit logs, notification settings, language/theme.
- **Billing & Help:** Payment plan tier and limits; independent prepaid AI credit balance, metered usage, history, budget/low-balance warnings and top-up; subscription invoices, Help, tutorials, Feedback and install-as-app guidance.

Use accordion navigation for categories, **not** an entire settings form in one expandable card. Deep page has route, save/error states, unsaved-draft guard, bread crumbs and keyboard support.

## 4. Competitor and current feature preservation mapping

| Source capability | Briofold destination | Essential parity |
|---|---|---|
| Overview + setup guide | Overview + onboarding checklist | Pre-live checklist and useful metrics without fake zeros |
| Inbox; labels/date/assignment/alerts | Inbox → Conversations | Waiting/Unread/Open/Done; Mine/All; agent claims, saved filters, keyboard actions |
| Notifications; calls/bookings/payment alerts | Header bell + `/notifications` | Type, attention/completed, date, assignment, actionable status |
| Comments and Posts | Inbox → Comments; Settings → AI → Comment Automation | Posts selection/exclusion, keyword moderation, delete/hide only with provider permission, per-post AI/fixed/human decision, product mapping |
| Saved replies | Inbox → Saved replies | Multi-part text/photo/voice, shortcut, folders, variables, team/private, archive |
| Leads/pipeline | Customers → Leads | Stages, notes, assignees, SLA, CSV, activity and follow-up |
| Follow-ups | Customers → Follow-ups | Scheduling windows, cool-down, offers and non-spam provider constraints |
| Broadcasts | Customers → Broadcasts | Draft/test/schedule/send, audience limits, cards/carousels/offers/consent |
| Orders + source filters | Orders → All orders | AI/API/manual attribution, approval/status, cancellation, safe export |
| Orders → Customers | Customers → Profiles | Do not duplicate customer identity or financial customer tables |
| Orders → Scan | Orders → Scan | Barcode/manual scan, batching, permissions |
| Orders → Courier/Handover | Orders → Delivery/Courier | Provider credentials, booking, courier cash handover, receipts |
| Orders → To chase | Orders → To chase; Customers → Leads | Lost/non-converted conversations |
| Orders → Report | Reports → Orders | Sale/order/taker/outcome dimensions |
| Activity | Settings → Activity logs | Immutable change stream, CSV and source filters |
| Analytics + people | Reports | Messages, AI↔Human, first response, SLA, team and pipeline |
| Products catalog/variants/photo | Orders → Products | Catalog, variants, per-item price/stock, 10 photo options where applicable |
| Product sync | Orders → Products → Import/Sync | CSV/XLSX/WooCommerce preview, safe diffs, external hooks |
| Product photo search/numbers | Orders → Products → Photos/Analytics | Multimodal search and attributed conversions only with evidence |
| Stock | Orders → Inventory | Available/on hand/reserved, correct concurrency |
| Posts/photo mapping | Customers → Campaigns/Posts + Comment automation | Per-image product associations and correction |
| Knowledge | Settings → AI → Knowledge | File/Q&A ingestion and test, version/access control |
| Website chat/voice | Inbox channel + Settings → Website chat | Widget, lead capture, domain allowlist, explicit disabled-vs-live capability |
| Agent Desk | Inbox → Agent Desk + Settings → AI | Natural-language edit draft, test, explicit publish, rollback |
| Pages/channel detail | Settings → Connected channels/Pages | OAuth, page-specific AI/Human/SLA/reversion, reconnect |
| AI credit billing | Settings → Billing/AI credits | Metering/usage/account statements, not competitor's arbitrary service-charge model |
| Team + Groups | Settings → Team/Permissions | Roles, granular permissions, sensitive operations audited |
| Setup | Onboarding + Settings → Setup | Business, Facebook, product, notification, courier, team, live readiness |
| Video guide/Feedback/This device | Settings → Help/Feedback/Devices | Tutorials, voice/dictation where valid, app install/push permissions |
| Ekmivo receiving methods/SMS phones | Payments + Settings → Payment Setup | Preserve authorized receipt verification and phone pairing |
| Ekmivo payment links/requests/docs | Payments → Links; Settings → Developers | All original fields and error/confirmation semantics |
| Ekmivo invoices/refunds/reports | Payments + Reports | Preserve finance source-of-truth and refund authorization |
| Ekmivo admin workspaces/plans | Separate Admin | Remains isolated; new Briofold merchant UI must not adopt admin.css |

This is a **routing/capability matrix**. Individual internal fields, controls, read/write permissions and API contracts must be expanded into implementation tickets with tests using the full UI inventory. Audited capability != implemented capability.

## 5. Execution phases and exit gates

All dates are **sequence estimates**, not automatic background execution or a promise of a live deployment without CI/approval. A phase is not complete until code, data, accessibility and regression evidence exist; no % fabricated. The assistant owns preparation, implementation, tests and PRs on subsequent working turns, rather than handing off a design-only document.

### Phase 0 — Audit, preserve baseline, lock specifications (NOW; 1–2 focused working days)
- Inventory every current Ekmivo route and API contract, compare all AiPraktor 32 inspected routes/157 snapshots, create granular parity checklist: Existing / Partial / Missing / Untested / Not-available-provider.
- Freeze design screenshots (light/dark, Bengali/English, 360/768/1440), payment gateway component taxonomy, current token computed values. Record feature gates, DB ownership and CI acceptance.
- Deliver: `docs/BRIOFOLD-UNIFIED-IMPLEMENTATION-ROADMAP.bn.md`, completed traceability tracker and failing guard tests for style leak/legacy navigation. This document itself is the initial Phase 0 artifact, **not a completed audit of every route**.

### Phase 1 — CSS isolation and approved Payment UI foundation (2–4 focused working days, after Phase 0)
- Split monolithic `globals.css` route imports into marketing/auth, checkout, merchant and admin ownership. Change route/layout ownership safely with no style leakage on client navigation. Isolate all merchant visual tokens under a dedicated `.bf-dashboard` shell, with payment-approved computed tokens and reusable components (button, field, select/date, checkbox, tabs, table, modal, drawer, toast, skeleton, empty state, typography).
- Prevent marketing styles, tokens and effects from affecting merchant components. Avoid non-scoped `h1`, `button`, `body` rules in merchant styles. Keep old payment screens visually identical first.
- Gate: static CSS isolation test + screenshots + fonts + all modes/viewport checks + zero checkout/admin/public regressions.

### Phase 2 — Business resolution, canonical routes and migration adapters (2–4 days, after Phase 1)
- Unified server-side current-business context; one tenant-scoped auth/entitlement resolver for top-level routes, no URL workspace IDs for normal merchant navigation.
- Create `/dashboard`, `/inbox`, `/orders`, `/payments`, `/customers`, `/reports`, `/settings/...` route shells with canonical links, old bookmarks redirect without loops, guarded unsaved drafts, explicit 403/404 and tenancy tests.
- Support optional multiple businesses via server-authorized selector; do not expose workspace internals or let cookie/business slug authorize finance queries.
- Gate: direct typed URLs work, refresh/history works, no `/bn`/`/en`, UUID or service-switch routes in new nav, old deep links work.

### Phase 3 — Minimal unified shell, Settings and feature retention (3–5 days, after Phase 2)
- 7 menu entries; compact user/business header, global search, alerts, profile, one overview, one reports entry.
- Implement categorized accordion Settings with **dedicated pages** (AI, channels, comments rules, payments/devices/methods, checkout, developer keys/webhooks/docs, staff/security/billing/help). Move by adapter rather than rewriting settled payment APIs.
- Hide service-inapplicable menu entries; retain direct access and perms to all current settings features.
- Gate: route-per-feature traceability, action and RBAC regression matrix, mobile/a11y UX.

### Phase 4 — Onboarding, services and entitlements (2–4 days, after Phase 3)
- Signup → email verification → business details → select AI / Payment / Both → conditional billing configuration → dashboard.
- Payment-only shows gateway plan tier; AI-only shows trial/top-up/usage; Both shows gateway tier plus separate AI wallet. Allow add/switch service after onboarding without recreating business. Do not block basic AI-only product on irrelevant PSP verification.
- Live payment features remain gated by necessary KYC/KYB and legal/provider readiness (not NID alone).
- Gate: new/returning user, invitation, incomplete setup, role/plan changes and basic vs verified merchant tested.

### Phase 5 — Two billing engines, AI prepaid cost safety (4–7 days, after Phase 4; BEFORE paid AI enablement)
- Reuse existing Payment Gateway plan/quota engine; build independent AI credit ledger, top-up intents, metering, reservations/refunds/idempotency, usage/statement read models, low-balance alerts, optional auto top-up with explicit opt-in.
- Charge transparent cost units for model input/output and variable services at a sustainable defined tariff. Credits are value/cost-based, never unlimited guaranteed replies; fixed replies with no model usage do not debit AI credits. Accurate cost, fees, margin, taxes and accounting reviewed before launch.
- Exhausted credits pause paid AI operations but not permitted manual Inbox/payment verification.
- Gate: simultaneous requests, retries, webhook duplication, failed AI requests and reconciliation leave no double charge or negative balance.

### Phase 6 — Inbox/AI and comment automation (5–9 days, after Phase 5 gates)
- Messenger/Instagram/WhatsApp/site channel adapters, permission-aware send/inbox, ownership, human handover and auto-revert, labels, SLA, alerts, saved replies, internal notes, ticketing, duty state and keyboard/mobile support.
- AI instruction/versioning, knowledge retrieval, test/publish/rollback, source-grounded product Q&A, no AI access to unverified payment truth.
- **Post-specific Comment Automation:** allow/deny/selected post lists, keyword/intent/complaint/PII rules, confidence thresholds, AI/fixed/human review per rule, hide/delete only where approved platform capabilities allow, throttling, audit and dry-run.
- Gate: seeded 7–8 varied long conversations, attachments and multiple channels, mock provider E2E; live delivery verification only with authorized test accounts.

### Phase 7 — Unified Customers and identity linking (3–6 days, after Phase 6; can be separately developed sooner)
- One business-level CRM profile; source identities for Messenger/IG/WA/website/API and verified phone/email, deterministic verified merge and manual dispute/unlink flow.
- Keep existing finance `customers` and AI contacts isolated until safe link table/migration tested; link conversation, order, payment and invoice without forcing unsafe record merges.
- Leads, tags, assignment, follow-up and contact preferences.
- Gate: no cross-business customer data, no accidental unverified identity merge, compliant export/delete and role masking.

### Phase 8 — Central Orders + catalog + delivery operations (5–9 days, after Phase 7)
- One order domain with source `ai` / `api` / `manual` and explicit links, never automatically transform standalone payment request into order.
- Products, variants, stock/reservations, images/post mapping, import/sync, coupons, discounts, order states, invoice/barcode scan, courier booking/handover, packing/returns/exchanges and status notifications.
- Gate: inventory concurrency, idempotency, durable order history, partial payments and cancellation/refund permissions.

### Phase 9 — Payment UI integration into unified commerce (3–6 days, after Phases 7–8)
- Move existing verified payment UI and methods/receipts/device setup into new `/payments` and `/settings/payment-*` destinations; link to orders/customers/invoices through safe read models.
- Keep finance DB/ledger/workers/receipt parser immutable unless individually audited and migrated. Verify same-amount exact matching, unique evidence, provider-specific cancel/success, device disconnect/reconnect/delete, invoice/refund and webhook semantics.
- Gate: old and new UI show identical authorized financial records/totals; no double-confirm or leaked payer number; test actual pairing and payment flows with appropriate fixtures.

### Phase 10 — Growth/analytics, full parity and production rollout (5–10 days, after core domains)
- Follow-ups, broadcast audience safety, offer/campaign scheduling, posts/product matching, bookings, service voice/calls only where verified supported, sales/team/AI/payment reporting, advanced exports.
- Accessibility, theme, locale and device QA; anti-spam/provider policies; performance budgets; audit logs; edge cases (expired credit, disconnected SMS, 502/retry, stale cache, partial RSC navigation).
- Staged feature flags, migration backfills, read parity, rollback procedures and monitored production release. No enabled menu entry that silently does nothing.
- Gate: every tracked feature `Implemented+Tested`, or explicitly blocked by documented third-party/provider/compliance dependency with honest UI; CI green, merchant data checks green, owner acceptance.

## 6. Dependencies, release mechanics and sequence

- **Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10** is the default release order; Phase 7 CRM foundation can be built in parallel with Phase 5/6 only with tested tenant/identity contract.
- Every phase: inspect repo main/active PRs → scope minimal migration → implement code/tests → lint/typecheck → CI and browser smoke → PR review → merge → deploy verification → collect evidence → next phase.
- Feature flags allow modernized route to coexist with legacy route. Redirect/delete only after parity gates; never ship partial UI with records hidden.
- Rough size, not deadline: about **34–66 focused engineering workdays** across phases before full feature parity, potentially more if provider certification/integration is blocked. Progress is recorded by acceptance checks, not a fabricated percent. There is no autonomous work between chat turns without a scheduled execution tool; code work proceeds when the assistant is actively invoked.
- Payment providers, social platform APIs and legal KYC/PSP obligations require validation and approved credentials; competitor audit alone cannot prove integration or regulatory authorization.
- Each phase should publish a PR with a checklist of modified routes/components, tests, before/after screenshots and rollback notes. Keep `main` stable.

## 7. Phase-by-phase Definition of Done (for EVERY phase)

- No current product feature, keyboard control, warning or permission silently removed.
- No dashboard styling inherited from public `globals.css`; payment dashboard design tokens/spacing components remain canonical.
- Server-side RBAC, tenant membership and financial environment validation enforced; no client-only hiding.
- EN/BN cookie-selected translations but zero visible `/bn` or `/en` URLs.
- Accessible 320/360/768/1440 layout in light/dark/system and reduced-motion; Bengali font correct.
- Real loading/empty/error/retry and no misleading fake-zero or fake-verified state; browser navigation works.
- Automated tests and manual QA against representative populated (clearly labeled test) data.
- Confirm deployment commit and rollback, then mark feature matrix evidence rather than blanket "100% complete".

## 8. This change's exact status

Only roadmap/feature-preservation planning docs are being authored here. **Phase 1–10 implementation, schema changes, production rollout and full AiPraktor parity are NOT done in this PR.** A subsequent scoped PR will start the Phase 1 CSS isolation foundation after Phase 0 traceability is filled out.
