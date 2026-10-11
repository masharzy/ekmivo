# PG02 — context-aware business/product/environment UX acceptance

**Status: IN PROGRESS, NOT ACCEPTED.** Product owner (2026-10-11) allowed PG02 UI implementation while PG01's security verification runs separately. No PG01 acceptance was implied, and PG03 must not start until PG01 and PG02 acceptance gates are closed.

## Canonical requirement mapping

Read `docs/PRODUCT-UX-SPEC.bn.md` sections **1 (placement and switching)**, **2 (merchant routes)**, **3 (all list/form states)**, **4 (payment overview/setup)** and **8–9** if relevant. Design source: `docs/DESIGN-SYSTEM.md` §§2–7 and `docs/design/tokens.css`.

| UI / state | Implemented source behavior | Evidence status |
| --- | --- | --- |
| Business selector | Current authorized `workspacesFor` list, role, search, selected state, create/manage link; target service remains enabled or falls back | Source, browser pending |
| Product switch | Payment/AI cards with availability reasons and last valid page, current click no navigation | Source, browser pending |
| Payment environment | Query `?env=sandbox/live`, server `requireWorkspace` and membership-revalidated `workspace_environments`; suspend/invalid/duplicate query denied; different business env remembered separately; explicit live setup-unavailable banner | Source, isolated SQL test pending final CI |
| Global search | Ctrl/⌘K, Escape, arrow/Enter, scoped **navigation-only** results; real record search not invented | Source, keyboard/focus QA pending |
| EN/BN + appearance | Language change retains query/env/hash; theme System/Light/Dark immediate cookie and cross-tab localStorage sync; source uses Ink & Bone/Hind Siliguri | Source, rendered four-combination/OS QA pending |
| Mobile UI | Drawer and two-row compact controls; CSS breakpoints at 1150, 800, 520, 355; 320px acceptance not yet rendered | Source, device QA pending |
| Loading/error/forbidden | Dynamic loading skeleton; actual server error with retry; unauthorized/invalid environment message with safe workspace fallback | Source, browser pending |
| Success/empty | Real selected business/product/env shown in header and context; absent business query shows empty; unavailable backend has **no fabricated zero records or financial actions** | Source, real integration pending |
| Notifications, payment records | No fake unread, mark-paid, payment-created or webhook-sent states; event/record backend not built, explicitly unavailable | **Not implemented; later PG owner screen contracts** |
| Unsaved forms | Account-scoped browser draft Save/Restore/Discard and guarded link navigation in workspace onboarding; shared Save/Discard/Stay registration for dashboard form transitions | Source + isolated draft tests; browser QA pending |

## Automated validation
- `node apps/web/scripts/pg02-navigation-smoke.mjs`: pure actual TypeScript navigation contract transpilation and assertions.
- `node apps/web/scripts/pg02-tenant-context-smoke.mjs`: disposable loopback PostgreSQL 17, 2 workspaces, membership revocation, environment suspension, user disabling and intentional rollback. No production fixture writes.
- `.github/workflows/ci.yml` requires both along with full Next lint, TypeScript, production build, Go/Postgres security tests and unchanged native Kotlin tests.

## PG02 remaining acceptance and manual checklist
- [ ] Verify all three CI jobs green on latest combined commit and record exact run ID.
- [ ] Authenticate as real workspace owner in production; use business search, switch selected/unselected product, confirm denied product is not reachable via deep link.
- [ ] Toggle Sandbox and Live, verify one per-business preference and no record/query leakage, reload/back/forward; suspended environment and forged membership browser denial.
- [ ] Test navigation search Ctrl/⌘K, arrow/Enter, Escape, semantic focus return, keyboard-only and screen reader.
- [ ] Test EN/BN + Light/Dark/System combinations at 320, 375, 768, 1024, 1440px, 200% zoom, OS color changes and two tabs. Check overflow, Bengali conjunct clipping, no flashing, no reset on theme/language switch.
- [ ] Implement and test unsaved draft Save/Discard/Stay, when the first relevant editable PG02 form is present.
- [ ] Verify loading skeleton, real network/server error and retry, unavailable context/forbidden, business no-match, success current context, service unavailable without showing 0 fake financial rows.
- [ ] Document what is deferred to later numbered PG screen scopes (PG03 keys, PG05 requests, PG09 financial record lists, PG13 notifications) without describing it as PG02 complete.

PG06 signer/validation and AN03 Kotlin application source stay **partial and unaccepted**. Do not claim true payment auto-confirmation, original receipt collection or signed merchant webhook delivery from this dashboard foundation.

## PG02 implementation checkpoint — 2026-10-11 (supersedes planning-only rows)

**Source/integration implemented for PG02 shell, business/AI/Payments availability, account security and local-draft flows. Owner browser QA OPEN. No payment provider/checkout/key/verified transaction implemented by PG02.**

- `infra/migrations/0005_pg02_product_access.sql` applied transactionally to production Neon after isolated PostgreSQL tests. Two product rows seeded for each existing/new workspace; 1 current business yielded 2 product rows with the pre-existing selected configuration. `workspace_product_access` has FORCE RLS and one least-privileged runtime policy; runtime has column-scoped SELECT only, no UPDATE or audit privileges. `workspace_product_access_audit` stores actor/time/before/after for real workspace-admin updates. No paid subscriptions or live payments were turned on.
- `apps/web/src/lib/server/auth.ts` derives effective `ai/commerce/both/off` mode from product access rows. Both-off returns a real authorized disabled-state page. `apps/web/src/actions/workspace-products.ts` locks current membership and product row, owner/admin only, audit + update atomically, idempotent no-op. `apps/web/src/components/workspace-product-controls.tsx` adds real EN/BN administrative toggles in `/workspaces`. Role and route checks remain server-side. Go `internal/authz` checks payments enabled under transaction-local FORCE RLS, not legacy `service_mode` alone.
- `apps/web/src/app/[locale]/account` is an authenticated data-backed account security page: profile fields, MFA metadata, actual active sessions, safe current-session preservation, revoke-other-sessions and name update with server-confirmed action feedback. No invented device/IP information. Error/loading states and responsive Ink & Bone are present.
- Account-scoped local business-onboarding draft Save/Restore/Discard and unsaved navigation protection; additional cross-context draft registry for dashboard editors. No local draft claims server persistence.
- Unconnected modules now say “data source unavailable,” not `0 records`; no fake webhook, payment success, export or live notification count.

**Automated evidence:** [GitHub CI run 38122484845](https://github.com/masharzy/ekmivo/actions/runs/38122484845) commit `61105edf`: all 3 jobs SUCCESS. Isolated PostgreSQL 17 passed 0001–0005 migrations, 3-tenant PG01 RLS, 2-business environment isolation/revocation/suspension, new product AI-only/both/off/FORCE RLS/audit/rollback, Go disabled-payment-product negative case, profile name/current-vs-other-session and idempotent revoke; Next.js lint/TypeScript/build, navigation/draft/TOTP scripts, Go tests, Kotlin debug build/tests. [Render Go deployment](https://dashboard.render.com/web/srv-db5j532d0e5s73fli4h0) `61105edf` LIVE; fresh production log still confirms least-privileged role/no-context RLS startup PASS. Neon 0005 was independently inspected: exact 2 product rows for existing business, 1 FORCE RLS table, 1 policy, no elevation or unintended access to audit/metadata.

**Remaining manual:** product toggle as owner/admin and denied editor/viewer, both-off fallback, active session revoke from another browser, display-name persistence, drafts Save/Discard/Stay via browser, EN/BN × Light/Dark/System × 320/768/1440 accessibility, Ctrl/⌘K focus/keyboard/back/deep link. Vercel latest-source deployment parity was not independently confirmed in this checkpoint. All manual actions in [single ledger](../../MANUAL-VERIFICATION.md).

**Implementation/acceptance distinction:** PG02 infrastructure/source scope implemented with CI success; **PG02 manual acceptance not yet signed off**. Record search, payment records, notification streams, product/payment full forms, API keys, checkout and other linked actual business operations depend on PG03–PG13; their UI routes remain explicitly unavailable and **are not PG02 operational completion**. The owner requested sequential implementation to continue after substantial automated coverage even when manual verification is pending; this does not authorize financial success claims.

## PG02 final source hardening and release blocker (2026-10-11)

- `8c0f6cde`: cancelled Save/Discard/Stay language change no longer writes the preference prematurely. `fc86bc8a` and `b2a7b0dc`: real TypeScript component-simulation regression test for locale cookie, environment/hash-preserving route and theme changes; required in web CI.
- `2b6dc631` and `3579c608`: keyboard command palette source-focus and mobile drawer trigger-focus restoration, including React effect cleanup behavior.
- `e875db0b`: localized business role and product labels in BN; `7e0bf1e7`: account profile name editing has own account-scoped, tab-local Save draft / Discard / Stay navigation protection and explicit Restore; server name mutation still requires actual successful server response. `aecead77`: both-disabled business navigation cannot bypass dirty draft handling.
- **Known production deployment limitation:** Vercel `ekmivo-web` connected team `masharzys-projects` returned `402 payment_required`, code `api-deployments-free-per-day` and a 24-hour quota retry advisory when asked to deploy the newer PG02 source. Most recent confirmed READY web artifact was SHA `356575bb`, which is **not** the newest PG02 UI; NO live-web parity or browser completion claimed. Neon 0005 product ACL schema and Go Render deploy were checked independently and remain operational.
- **CI evidence:** last full three-job green before final UI changes [38122484845](https://github.com/masharzy/ekmivo/actions/runs/38122484845); the later `pg02-locale-guard-smoke.mjs` initially failed because its mock read the last localStorage write instead of the cookie. That *test fixture* assertion was corrected at `b2a7b0dc`. The latest combined SHA CI must be checked before calling source verified; no test-failure masking.
- **Remaining owner/manual:** account and dashboard draft Save/Discard/Stay, focus restoration, product ON/OFF as owner and denial for nonadmin, two-browser profile/revoke session, theme/locale + 320/768/1440px + 200% zoom, denied deep links and Vercel deployment parity. [Single manual register](../../MANUAL-VERIFICATION.md). External payment/provider/evidence/user-message data, record search and notifications remain later PG deliverables, not fake PG02 completions.

**Source implementation is the PG02 bounded shell/control-plane scope, not the later PG09 payment table or PG13 event service. Financial readiness remains disabled until its PG gates.**


## PG02 hardening / regression ledger — 2026-10-11 (pending PR review)

This pass is intentionally based on a **new branch from current `main`**, rather than merging stale branch changes that would overwrite the concurrent profile/drawer/disabled-business fixes. PG01's parallel work and production accounts are untouched.

**New implementation:**
- Global command search includes **business-switch shortcuts only from `workspacesFor(user.id)`** (server-authenticated membership list). EN/BN business names, keyboard arrows/Enter and combobox active-descendant IDs included; no speculative payment, customer or historical financial record lookup. Search is still not a payment data search; that requires later PG endpoints.
- Workspace onboarding now handles `ekmivo:guarded-navigation` emitted by locale controls: a dirty business form triggers Save draft / Discard / Stay and does not silently navigate/change language.
- Sandbox/Live remembered preference is persisted **after authorized route context commits**, not before the unsaved-draft decision. Cancelling a switch leaves the stored preference intact; cross-environment record identifiers are not transferred.
- Search dialogs close on a current or both-disabled business selection; concurrent Both Off draft-guard and mobile drawer focus fixes on `main` are preserved.
- Confirmed server profile-name saves clear stale tab-local name drafts, avoiding restoration of an obsolete value.

**Regression coverage:** extended `pg02-navigation-smoke.mjs` tests membership-only business search including Bengali; added `pg02-onboarding-guard-smoke.mjs` (actual TSX component event intercept under isolated JS hooks) and made it a mandatory `web` CI step. Existing PG02 navigation, locale, draft, product, tenant, account and Go/RLS checks remain required. **CI run and browser/device outcomes must be recorded after execution; writing code is not a passing test.**

**Deployment parity observation:** Vercel project `ekmivo-web` (`prj_LVQsrrOUH8f2xjp5MlqFCugqbP2j`) reported latest **READY production** deployment [dpl_dKKR6HPvQ9TtsQnEmwNpxH5vQTMa](https://vercel.com/masharzys-projects/ekmivo-web/dKKR6HPvQ9TtsQnEmwNpxH5vQTMa) at source `b2a7b0dc1b3a09587e4b41f548ee9c3bd95b7c84`. During this pass `main` had advanced to `c31b65386e9e3c470c5ac6b0a231d4968b7a83e5`; the production deployment was **behind source**. This pass's branch is not claimed deployed. Before sign-off, compare production `meta.githubCommitSha` to the merged release SHA, and use two owner-controlled accounts to test authorized browser behavior.

**Manual-only reproductions** (use disposable owner/admin/viewer accounts and a second business, not a production payment or admin account):
1. Open `/bn/workspaces`, enter an unsaved business name, switch EN in the site language control; **Stay** must retain form + URL, **Save draft** must allow route navigation and later Restore must recover only that account's draft, **Discard** must drop the unsaved name. Repeat with actual links.
2. From an authorized business `/en/w/{id}/payments/overview?env=sandbox`, open Ctrl/⌘K; type a distinct authorized business name, arrows/Enter select the right business and focus returns on Escape. Unknown business names must not surface. Validate mobile 320px.
3. From an editable dashboard form when added, modify a field, choose Live then **Stay**; the address and remembered sandbox preference must not change. Save/Discard must permit only the chosen authorized environment. Avoid claiming this check passed while the later PG form backend does not exist.
4. Toggle both products off in a second business, then switch to it with an open draft; confirm the same Save/Discard/Stay gate and disabled-state explanation (never a fake empty payment list).
5. Update real test profile name, refresh, Restore tab draft and revoke other test-browser sessions; current browser remains signed in, revoked browser is denied.
6. Repeat keyboard-only, touch, EN/BN with Light/Dark/System + OS change, zoom 200%, widths 320/768/1440, back/forward, malformed env, suspended membership, offline/forbidden/loading/error/empty and screen-reader output.

**Status:** PG02 functional source hardening added, final CI + production deploy parity + browser/device matrix still open. PG03–PG09 backend record/payment actions and PG13 notification streams are *dependency-owned*, not PG02 completion claims. Keep PG02 **OPEN** until its genuine required gates are verified.
