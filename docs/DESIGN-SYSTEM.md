> **Latest landing-page direction — 2026-10-13, supersedes the old public V3 split-hero specification below:** The owner selected a centered, full-height typographic hero with no two-column hero image; editorial cream/light-yellow/powder-blue/blush brush marks and tilted sketch-border cards in Light mode; **strict Vercel-like black, white and grayscale in Dark mode**. The landing page is concise product discovery with two clearly separated services (Payments and AI), one interactive workflow, benefit cards, audience, integrity/trust, honest service readiness, and FAQ. Preserve EN/BN, reduced motion, mobile, and existing shared header/footer. Never invent customer logos, usage metrics, testimonials, prices or unsupported provider integrations. The operational UI design remains as otherwise documented here.

# Ekmivo design system

Version 5 · 2026-10-11 · Same Ink & Bone palette; payment-first product/environment UX specification.

**Selected direction (V4 palette, V3 page structure): Ink & Bone — restrained monochrome, off-white/light surfaces, graphite typography and crisp charcoal actions; dark mode uses layered near-black surfaces and bone-white text/actions.** Hind Siliguri is the typeface for Bengali and English. The public site is product-led and motion-forward: animated hero workspace, customer-journey chapters, AI and Commerce deep dives, and an interactive evidence-matching explanation. Product workspaces remain information-led and accessible. V3 is a marketing implementation milestone, not a claim that business integrations are live.

বাংলায়: নতুন Option F Ink & Bone—লাইট মোডে অফ-হোয়াইট ও সাদা পটভূমি, প্রায় কালো লেখা ও বোতাম; ডার্ক মোডে কালো/গ্রাফাইট পটভূমি, হালকা bone-white লেখা ও বোতাম। আকর্ষণীয় বড় হিরো শুধু পাবলিক সাইটে; কাজের স্ক্রিনে তথ্য, অবস্থা ও নিয়ন্ত্রণ স্পষ্ট থাকবে।

The canonical product plan is [DUAL-SAAS-MVP-PLAN.bn.md](./DUAL-SAAS-MVP-PLAN.bn.md). This file owns design behavior. [MVP-FEATURE-SCOPE.md](./MVP-FEATURE-SCOPE.md) owns feature coverage; [IMPLEMENTATION-BACKLOG.md](./IMPLEMENTATION-BACKLOG.md) owns work order and evidence. Start with the repository [AGENTS.md](../AGENTS.md) for the reading sequence.

## 1. Visual direction

The public opening is a fully theme-aware Ink & Bone split hero with an animated sample workspace on the other side. The next story has six scroll-progress chapters (mobile: horizontally navigable cards) followed by independent AI/Commerce service modes, 13 capability mockups and selectable verified/pending/exception payment states. All examples are prominently labelled illustrations; none are connected to live merchant systems. Mobile layouts are intentionally different from desktop. The public header starts as a centered floating bar, expands to full width after scrolling, hides while scrolling down and returns full width on upward scroll; near the top it returns to floating width. Every public page, including login and registration, shares the header and footer. Motion stops under `prefers-reduced-motion`.

The application itself remains task-led: inbox for conversations, tables for payments, list/Kanban for orders and a calendar for bookings. Do not copy the large public hero into operational screens. Keep labels, evidence and record states visible.

Avoid fabricated customer logos, reviews, analytics, growth claims and functional demos. Label illustrative records as sample. Avoid purple gradients, random floating blobs, generic 3D shapes, emoji decoration and scroll hijacking. Use motion to demonstrate meaningful product state transitions, and keep essential information visible even without animation. Use sparse monochrome grid lines rather than colored glows; tonal differentiation comes from hierarchy, space, contrast and shape. The redesigned home hero does not use orbital decoration; existing login/register atmosphere is separate.

## 2. Palette and semantic tokens

Exact values live in [design/tokens.css](./design/tokens.css). Components use semantic variables. Light and dark are separate palettes: Ink (#262626) is the light-mode action, Bone (#F1F1E9) is the dark-mode action. No teal/lime highlight remains; business status colors are reserved for meaningful status labels, not decoration. **Verified payment uses its separate success color and explicit label**.

| Role | Light | Dark |
|---|---|---|
| Canvas | `#FAFAF8` | `#141414` |
| Surface | `#FFFFFF` | `#242424` |
| Main text | `#222222` | `#F5F5F1` |
| Secondary text | `#565650` | `#CAC9C2` |
| Primary (ink / bone) | `#262626` | `#F1F1E9` |
| Soft accent | `#EDECE7` | `#353531` |
| Success label | `#285D42` | `#B2DEC1` |
| Essential control border | `#77766E` | `#A4A29B` |

Status palettes for warning, danger and information also live in the CSS. Every badge needs a readable text label; color alone does not convey status. Decorative separators may be subtle, but input boundaries use `control-border`. Keyboard focus uses a visible outline. The refreshed [contrast report](./design/CONTRAST-REPORT.md) verifies all 82 specified Ink & Bone solid-color pairs; rendered layouts, overlays and focus behavior still require browser accessibility audits. This does not replace rendered accessibility checks. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

## 3. Typography

**Hind Siliguri** is the UI and display family in both languages. The web app self-hosts the licensed 400, 500, 600 and 700 font files through `next/font/local` with `font-display: swap`; the OFL notice is kept in `apps/web/src/fonts/OFL.txt`. [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/hindsiliguri) describes its Bengali and Latin coverage. Code, IDs and API keys use a system monospace face only where literal character distinction matters.

| Role | English | বাংলা | Weight |
|---|---|---|---|
| Public hero desktop | 52–104px / 1.04 | 44–78px / 1.3 | 600 |
| Public hero mobile | 43–70px / 1.1 | 44–78px / 1.3 | 600 |
| App page title | 28px / 1.25 | 28px / 1.4 | 600 |
| Section title | 20px / 1.35 | 20px / 1.5 | 600 |
| Body and forms | 16px / 1.5 | 16px / 1.7 | 400 |
| Navigation and button | 14px / 1.4 | 14–15px / 1.6 | 600 |
| Data row | 14px / 1.5 | 15px / 1.6 | 400/500 |

Bengali conjuncts and vowel marks must not clip. Bengali text has no forced uppercase or letter spacing. Controls and rows may grow taller for longer labels. Keep one page heading and a logical heading order.

## 4. Spacing, shape and iconography

- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80px. Default field gap 16px, panel padding 24px desktop / 16px mobile, section gap 32px.
- Radius: controls 6px, panels 10px, dialogs 12px. Only avatars and compact status chips may be fully round.
- Default control min-height 44px; desktop compact controls 36px only with fine-pointer input. Touch hit areas at least 44×44px even when the icon is smaller. This is a product target stronger than WCAG 2.2 AA's base 24px criterion; spacing exceptions do not justify cramped product controls. [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- Icons: one consistent outline family, e.g. Lucide, 18–20px with approximately 1.75–2px stroke. Use a text label beside unfamiliar icons. Native apps may use platform-native equivalents with the same meaning and density.
- Ordinary surfaces have no shadow. Popovers use the token shadow; dialogs use one stronger shadow plus backdrop. Dark mode relies on surface elevation and borders as well as the shadow.
- Amounts align right, descriptions left, counts use tabular numerals. Use logical CSS properties (`padding-inline`, etc.) but both EN and BN layouts are left-to-right.

## 5. Application shell and responsive behavior

Desktop application: sidebar 232px, header min-height 64px, content gutter 32px, page max-width 1440px. Settings/forms max-width 720px. Inbox and wide operations tables may use the full available width.

For the **public site**, keep the shared floating/scrolling header. For the **application**, business selector sits at the sidebar top; header order is product selector → payment Sandbox/Live selector → record search → EN/বাংলা → theme → notifications/profile. Narrow screens use the drawer for business/navigation; product/environment and compact locale/theme stay discoverable. Exact controls and responsive behavior are in [PRODUCT-UX-SPEC.bn.md](PRODUCT-UX-SPEC.bn.md).

| Width | Layout |
|---|---|
| ≥1280px | Full sidebar; inbox list 304px + conversation flex + optional detail rail 320px |
| 1024–1279px | Full sidebar; detail rail becomes an on-demand drawer |
| 768–1023px | Collapsible navigation; max two working panes; detail overlay |
| <768px | One working pane; navigation drawer; list→detail navigation with clear back action |

Do not shrink a three-column desktop dashboard into a phone screen. Mobile tables show a meaningful record summary, amount/status and a detail link; alternatively use an explicitly labelled horizontal scroll region for comparisons. Never hide financial columns without an accessible detail route. Sticky action bars respect safe areas and the virtual keyboard.

Orders support both table and Kanban views; keyboard/button state transitions are available alongside drag-and-drop. Dense workflows may offer Comfortable/Compact on desktop; Bengali rows can grow to preserve readability. At 200% zoom all tasks remain reachable. At 320px viewport width no page-level horizontal overflow except deliberately scrollable data regions.

## 6. Light/dark theme feature

Options: **Light / Dark / System** (`হালকা / গাঢ় / সিস্টেম`). Use a labelled menu/radio group; do not make an ambiguous icon that silently cycles through three states.

Behavior contract:

1. First visit defaults to System; explicit saved preference overrides it. User profile sync can carry the preference between authenticated devices; current device selection applies immediately.
2. Persist a non-sensitive theme preference cookie or equivalent server-readable setting for web rendering. Apply the resolved theme before first paint with CSP-compatible initialization; no light flash during dark navigation and no hydration mismatch.
3. CSS token file supports explicit `data-theme="light"`, `data-theme="dark"`, or no explicit attribute for OS fallback. The stored setting remains `system` when using OS fallback. React/native state must not invent a fourth mode.
4. Listen to OS changes only in System mode. Broadcast explicit preference changes to other same-origin tabs. A storage failure must still allow an in-memory switch.
5. Theme changes must not reset filters, form drafts, inbox scroll, current conversation or workspace.
6. Charts, tooltips, dialogs, toasts, skeletons, focus rings, widget, public checkout, admin, mobile and extension surfaces all use the corresponding palette. Do not invert product images or channel logos.
7. Native app observes device appearance and saved preference. Website widget supports the same three modes inside its isolated root; host-page CSS must not accidentally override it.
8. Printable invoice defaults to white paper and dark text regardless of app theme; retain semantic labels and hide navigation.

Theme preference is personal, not a workspace-wide mutation. Merchant brand customization must not remove system focus or make operational text unreadable.

## 7. EN / BN language feature

The visible switcher reads **EN / বাংলা**, with selected state and accessible full names (“English”, “বাংলা”). Do not use country flags to represent languages. Internal codes are `en` and `bn`.

- Default locale: বাংলা. Explicit locale URL or saved user choice takes priority. Public and app page routes use `/bn/...` and `/en/...`; APIs/webhooks keep language-independent paths. Set the correct document `lang` and keep `dir="ltr"`.
- Preserve the current page, record, search, filters and unsaved work when switching. A locale navigation must not recreate an order/payment request. Save preference to a non-sensitive cookie and profile where available; public URLs remain shareable.
- All first-party navigation, titles, actions, tooltips, errors, empty/loading states, onboarding, billing, emails, receipts and help copy have message keys with EN/BN values. No runtime concatenation of sentence fragments.
- Server returns stable error/status codes; the client maps them to translated copy. Unknown technical details go in an expandable support detail, not raw English stack traces in a Bengali form.
- User messages, product names/descriptions, uploaded content, provider references and customer names remain unchanged. UI language and AI reply language are separate settings. Never silently translate a customer's evidence or message.
- Use locale-aware date/amount formatting. Operational amounts, phone numbers, IDs and references use Latin digits in both modes for comparison/copy consistency; use `bn-BD-u-nu-latn` for Bengali operational formatting. Localized Bengali words/month names remain Bengali. Accept Bengali numeric input and normalize it to canonical digits before validation.
- Phone/account/TrxID/UUID values are never reformatted with separators or translated. Money is formatted for display from integer minor units; copy/export uses documented canonical values.
- Time displays in the workspace timezone (initially Asia/Dhaka) with full timestamp/timezone available; store UTC. For payment matching, show transaction time separately from sync time. Do not translate numbers by fragile text replacement.
- Missing locale keys fail the release translation check; during development an English fallback is allowed with a diagnostic. English text expansion and longer Bengali labels must wrap or reflow, not shrink below the type scale.

### Core vocabulary

| Key | EN | BN |
|---|---|---|
| `nav.overview` | Overview | সারসংক্ষেপ |
| `nav.inbox` | Inbox | ইনবক্স |
| `nav.orders` | Orders | অর্ডার |
| `nav.payments` | Payments | পেমেন্ট |
| `nav.catalog` | Catalog | পণ্যতালিকা |
| `nav.inventory` | Inventory | মজুত |
| `nav.bookings` | Bookings | বুকিং |
| `nav.integrations` | Integrations | সংযোগ |
| `nav.billing` | Billing | বিল ও ব্যবহার |
| `nav.settings` | Settings | সেটিংস |
| `payment.pending` | Waiting for payment | পেমেন্টের অপেক্ষায় |
| `payment.verifying` | Verifying payment | পেমেন্ট যাচাই হচ্ছে |
| `payment.verified` | Payment verified | পেমেন্ট যাচাই সম্পন্ন |
| `payment.exception` | Could not match payment | পেমেন্ট মেলানো যায়নি |
| `device.offline` | Phone is offline | ফোন অফলাইনে আছে |
| `action.takeover` | Take over conversation | কথোপকথনের দায়িত্ব নিন |
| `action.release` | Return to AI | AI-কে দায়িত্ব দিন |
| `action.pauseAI` | Pause AI | AI থামান |
| `action.save` | Save changes | পরিবর্তন সংরক্ষণ করুন |

This is a seed glossary, not the complete translation catalog. Avoid literal translations that make familiar commerce terms harder to understand.

## 8. Navigation preserves the full feature set

Two independent product trees replace a mixed AI/Commerce sidebar. [PRODUCT-UX-SPEC.bn.md](PRODUCT-UX-SPEC.bn.md) gives every menu, tab, detail, CTA, permission and failure state; it elaborates this design guide.

| Product | Groups | Key coverage |
|---|---|---|
| Payment gateway | Overview; Payments; Receiving & verification; Integrations & events; Commerce; Workspace | Financial workflow/API/device/checkout first; full commerce remains inventory scope |
| AI workspace | Overview; Customer conversations; Sales & growth; Your AI; Connections; Workspace | Human inbox, channels, AI/knowledge/CRM/booking; phased implementation, no feature removed |
| Separate surfaces | Public checkout/docs; platform admin; Android/iOS/PWA/extension | Appropriate shells/capability, same semantic tokens and terminology |

Business selector sidebar top; product selector header first; payment Sandbox/Live next to product; search then language/theme/notifications/profile. Icons always with clear familiar labels. No 46 ungrouped top-level items.

Authorization server-side; navigation visibility not security or completion. Build states explicit; users can find authorized capability via menu/search. Shared contact/catalog references do not duplicate data.

## 9. Core components

| Component | Design and interaction contract |
|---|---|
| Button | Primary filled ink (light) / bone (dark), secondary neutral outline, tertiary text. One primary action per local task. Loading preserves width and action label; prevent duplicate submission. Disabled reason is available in text, not a hover-only tooltip. |
| Destructive action | Danger text/icon and explicit action name; confirmation shows the affected record when irreversible. No red used for ordinary navigation. |
| Input/select | Persistent label, optional help, error below field, visible control boundary. Focus does not move layout. Currency/phone/reference fields use suitable input modes; no placeholder-only labels. |
| Search/filter | Search above list; compact filter controls with active count and Clear. Preserve filters across detail/back navigation. Applied filters need meaningful text, not unlabeled color dots. |
| Data table | Sticky header where useful; 48px minimum row, 40px desktop compact. Sort buttons announce state. Pagination/cursor progress visible. Row actions keyboard-accessible; selection does not trigger navigation. |
| Status badge | Soft background, text + optional icon, no blinking dot. Separate payment, order, delivery and settlement statuses. |
| Tabs | Use tabs only for sibling views; URL/navigation links for actual pages. Selected underline/rail + text weight; keyboard behavior follows the chosen semantic pattern. |
| Drawer | Record details beside a list on desktop; full-screen on mobile. Close/escape and focus return. Unsaved edits remain protected. |
| Dialog | Focus trap, title/description, explicit buttons, safe initial focus. Closing does not imply a transaction was cancelled server-side. |
| Toast/banner | Toast for transient confirmation; persistent banner/inline notice for lost sync, missing permission or payment exception. Do not rely on a disappearing toast for a financial outcome. |
| Chat message | Customer/merchant/AI identity labelled, clear timestamp, attachment state, sent/failed state. Do not render all text as accent-colored bubbles or pretend AI is a person. |
| Empty state | One sentence explaining what is missing and one relevant action. Example: “No products yet. Add a product.” No giant robot illustration. |
| Loading state | Geometry-matched skeleton or inline progress. Keep known data visible with stale/sync notice; do not replace a whole table with a spinner for a small update. |
| Chart | Limited series, direct legend, readable axis/tooltips, table alternative. Use semantic colors for meaning and line/dash/marker distinctions. No gradient area fill as decoration or fabricated forecast. |
| Integration tile | Provider name, actual connection state, last sync, relevant action. Connected, reconnect-needed, syncing and unavailable are distinct. |
| Code/secret | Monospace, copy action, masked secret by default, explicit reveal; never place credential values in toast/log output. |

## 10. Payment screen and checkout: fixed product behavior

**Verification is automatic.** The UI must not reintroduce a customer TrxID form, screenshot upload, manual-approval requirement or optional auto-acceptance step into the normal payment flow.

Merchant payment page:

```text
Payments                         [EN / বাংলা] [Theme]
Payment requests | Incoming | Verified | Exceptions | Accounts & phones
Search sender / order       Method filter        Date filter
-------------------------------------------------------------------
Time      Sender       Amount      Receiving account     Status
14:05     01…          ৳500.00      bKash · …1234         Verified ✓
-------------------------------------------------------------------
Selected record detail:
Order / request • sender • amount • transaction time • receiving account
Verification method • verified time • phone sync health • webhook delivery
```

Incoming and pending lists can appear side by side for reconciliation; the successful event links itself automatically. The merchant is not required to manually pair the rows. Mask sensitive values in list views based on permissions; authorized detail may reveal/copy them.

Customer checkout sequence: order/amount → sending number already supplied or confirmed in the request → payment destination/instructions → waiting → verifying → verified receipt. Label the payer field “Number you will pay from / যে নম্বর থেকে টাকা পাঠাবেন”; it is not the customer's contact number by assumption. Keep time window and receiving details visible. No PIN or OTP collection.

Live status comes from the backend; do not animate a fake success after a timeout. Unique valid time + sender + amount + receiving account/method match automatically updates payment and sends confirmation. Missing/ambiguous data stays pending/exception with a concrete explanation and recovery path. Device offline is a sync state, not proof of payment failure. A method label in details records SMS/notification/API verification without demanding a second gateway check.

## 11. Other screen patterns

- **Inbox:** list → conversation → customer rail. Composer stays reachable; persistent “You are replying / আপনি উত্তর দিচ্ছেন” state after takeover. A global AI pause is visibly different from one-chat takeover. Voice/image processing has progress and retry states.
- **Agent Desk:** draft/live version indicator, structured settings and natural-language edit field, preview conversation, test results and publish/undo controls. Preview is visibly labelled test; changing a draft does not silently affect live customers.
- **Orders:** table/Kanban toggle; selected order opens a detail view with items/totals, payment and shipment histories. Bulk actions show selection count and per-record failures. Payment verification is not hidden behind an order-approval button.
- **Bookings:** calendar plus list alternative; date/resource filters; explicit timezone and unavailable-slot state. On mobile start with the day/list view, not a compressed month grid.
- **Billing:** balance, usage ledger, subscription and invoices. Exact money and clear rate labels; no progress bar that obscures actual charges. Credit exhaustion keeps human inbox and independent B operations reachable.
- **Admin:** shared components, visibly distinct admin/workspace context; support access reason and expiry where required. Never disguise a cross-tenant operation as an ordinary merchant action.
- **Public site:** light/dark-aware Ink & Bone split hero with meaningful animation, chapter-based journey, two independently selectable services, thirteen feature demonstrations, evidence-based payment states, operations, solutions, trust, pricing configurations and FAQ. All illustrative interface data is labelled sample. The header starts as a floating bar, expands on scroll, hides while moving down and returns on upward scroll. No invented usage figures or copied competitor promises.
- **Mobile/extension:** same semantic tokens and terminology; native controls may adapt to platform patterns. Small extension width gets focused assistant/takeover tasks, not a squeezed full dashboard.

## 12. Motion and accessibility

Motion tokens: 120ms hover/focus color, 180ms menu/change, 220ms drawer/dialog; easing `cubic-bezier(0.2, 0, 0, 1)`. The public header expansion/hide, animated illustrative workspace, limited scroll chapter transitions and short entrance reveals are permitted purposeful motion. Pause/replay must be available for auto-cycling motion. No bounce, scroll hijacking or delayed access to content. Under reduced motion, remove translation/scale and nonessential animation; functional progress remains readable.

Use semantic controls, visible keyboard focus, skip navigation, meaningful landmarks, programmatic field/error associations, accessible dialog focus handling and text alternatives. Announce significant async status with a restrained live region; every queue update must not interrupt the user. On auto-verification announce once without stealing focus. Support contrast/forced-color modes with native outlines where appropriate. Drag/drop always has a non-drag alternative.

## 13. Design completion and agent implementation sequence

1. Read the canonical master plan, feature inventory and this guide. Tokens are the implementation color authority; any palette change must update this guide and recheck contrast.
2. Implement the design foundation and EN/BN catalogs before product pages. Theme and locale are functional features, not decorative mock controls.
3. First visual checkpoint: shell + payment list/detail + customer waiting/verified flow + inbox sample, in Light/EN, Light/BN, Dark/EN, Dark/BN. Fixtures must be labelled sample data.
4. Verify keyboard behavior, phone/tablet/desktop widths, 200% zoom, Bengali glyphs, long names, missing data, loading/error/offline, and reduced motion.
5. Apply components across all scope rows. Do not simplify away channels, voice, booking, agency, mobile or other required functionality to make a cleaner screenshot.
6. Before release: theme persistence/system switching, language persistence/routing, form preservation, complete translation keys, correct numbers/time, no customer TrxID step, full S-ID coverage.

Current source includes Ink & Bone public pages, self-hosted font and partial theme/locale/dashboard components; existing auth/workspace/recovery source is present. D01/D02, complete visual/accessibility audits and functional financial routes remain open. Previous statements that account forms intentionally never submit are superseded by auth source; current deployment and live mail/security behavior need evidence. See [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md).

## Separate product dashboards — user correction, 2026-10-11

Operational shell has a grouped icon sidebar, compact sticky header, current-business selector, navigation search, product switch and theme/language controls. The sidebar scrolls independently; mobile uses a modal drawer with Escape, focus containment and a labelled close action. Monochrome semantic tokens and Hind Siliguri remain the visual foundation.

AI groups: Overview; Customer conversations; Sales & growth; Your AI; Connections; Workspace. Payment groups: Overview; Payments; Receiving sources; Commerce; Integrations & events; Workspace. These two trees supersede a single mixed AI/Commerce sidebar. Shared objects appear in the relevant product context without duplicating their storage.

The product switch presents both products with an icon, clear name, one-line purpose, current selection and entitlement state. It switches product within the same business. A business switch keeps the current product if enabled, otherwise opens that business's available product. Never present unavailable products as working links. Overview metrics are product-specific; unconnected data is shown as unavailable, never fake revenue or zero activity.

Every route requires its own domain view, actual data service, authorized actions and applicable provider evidence. Tabs, tables and empty states alone are not completion. Light/dark, EN/BN, mobile and keyboard verification remain required before this shell is called production-ready.
