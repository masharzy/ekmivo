# Phase 10 credential lifecycle continuation — 2026-10-23

Scope: Briofold Phase 10, stacked on the active `agents/phase10-growth-release` work. This is not the later full Workspace-to-Store migration. Signup/name collection and old route removal are deliberately deferred by the owner until Phase 10 is complete.

## Corrections

- Merchant key server actions revalidate the actual locale-prefixed canonical `/settings/api-keys` page as well as its historical adapter. A completed create/rotate/revoke must refresh the current inventory without a manual page reload.
- All three mutations recheck an installed authoritative primary Store binding inside the write transaction. A historical membership does not authorize a stale form targeting a different Store. Legacy databases without that additive binding table retain the existing membership authorization.
- Live key issuance handles a database lacking the optional platform-receiver function by denying the implicit platform exemption and checking the actual subscription. It does not invent an active entitlement or disable the plan check.

## New acceptance

`apps/web/scripts/briofold-key-lifecycle-acceptance.mjs` runs after the Phase 9 financial/browser fixture in the existing disposable Foundation workflow. It uses a fictional test password, restores the prior hash in `finally`, and never logs raw credentials. Coverage: wrong-password creation denial; owner Sandbox creation through the canonical UI and real server action; hash-only persisted credential; immediate inventory refresh; reload secret privacy; rotation with predecessor resolver invalidation and preserved expiry/scopes; successor revocation; private viewer inventory; exact append-only audit actions. These are automated source tests until their exact pushed commit's Foundation CI passes. No provider delivery or production acceptance is implied.

## Status

**NOT SEALED.** Full 56-row parity, missing growth integrations and other unresolved implementation remain governed by `docs/BRIOFOLD-FEATURE-PARITY-TRACKER.csv`. Do not count this change as full API-key row parity before interactive domain-lock coverage and exact-head CI are verified. No PR merge, production migration, flag activation, external send or deployment is authorized.

The follow-up expands the browser test with direct viewer replay of the actual Next action payload (authorization must hold independently of hidden UI), a historical-owner stale form after primary Store rebinding, and actual Live key create/revoke under the preceding fixture's purchased entitlement. The test installs the exact binding table DDL from the canonical foundation only when absent in the older disposable fixture, and removes only that fixture-owned table/binding in `finally`; it does not claim full subscription migration acceptance. Production Next build also passes locally. This expanded acceptance still needs its own exact-head CI.

Base Phase 10 run 39895385777 and credential run 39896102758 both failed before reaching the new key journey at the immediate `isEnabled()` export assertion. The next test uses Playwright actionability waiting on the actual export click; independent CSV ledger comparisons remain unchanged, and a permanently disabled control will still fail. This is a proposed timing correction until a new CI pass proves it.

The key-capacity source also requires CONTROL 0096/0101 and financial 0068/0093. The new key journey applies those exact canonical migrations only to disposable CI realms, using the preexisting realm-specific migration owner for financial SQL. It runs after all earlier browser/financial fixtures so the migrations' stricter new-checkout and invitation admission rules do not invalidate those earlier historical fixtures. No dummy reader or bypass of the real Go capacity/entitlement checks is introduced. This fixture correction is pending a new full CI; the failed runs are not seals.

Run 39897459949 on 0f59b5a9 passed the actual payment CSV owner/viewer privacy test and the merchant statement preview/import/association/viewer-denial test. It then completed 192 responsive route cases and failed only at the outdated total assertion (`192 !== 176`), before the key journey. The route inventory is now explicitly asserted as 12 routes and 192 cases (2 locales × 2 themes × 4 widths × 12 routes), with an accurate dynamic route count in the PASS log. All per-case HTTP, theme, width, overflow and error checks are preserved.

Credential acceptance now runs after the Phase 9 semantic writes and before the long read-only responsive matrix. This keeps the quota migration boundary intact and reports credential failures earlier. Its outcomes and the corrected complete run still require fresh CI. No full parity or production acceptance is claimed.

## CRM implementation continuation

Additive CONTROL migrations 0191/0192 implement source/stage/priority/assignee filtering before stable pagination, role-safe contact/assignment projections, offer reminders, terminal skip, original requested time and IANA-timezone quiet windows. The Go reader and canonical leads/follow-up UI use these functions. Existing financial relationships and applied migrations remain unchanged.

`briofold-crm-parity-acceptance.mjs` exercises pagination beyond 50 matching records hidden behind newer nonmatches; combined filters; tenant/realm/role privacy; filtered CSV; real Go/Next scheduling and reload; skip; revision and idempotency; daytime/overnight and both DST transitions; 32 responsive locale/theme cases. It runs in the existing disposable acceptance database. TypeScript, ESLint, JavaScript syntax and diff checks pass locally. Database/browser results are still unsealed until CI executes this source.

Run 39899417676 failed waiting for the Live key revoke drawer after earlier mutations. Success handling now keys off stable secret/key IDs, refreshes the router inventory once, and the acceptance opens the exact active UUID row. This is an application lifecycle correction awaiting fresh full CI, not a weakened assertion.
