# Briofold Phase 3 — unified shell and Settings code-level seal

**2026-10-22: CODE-LEVEL SEALED for the Phase 3 *routing, shell, Settings adapters and existing-feature retention* boundary.** This is not a seal of later feature implementations, physical/provider tests or production cutover. The owner explicitly excludes physical checks from code-level seals.

## Reconciled owner scope

- Phase 1 physical CSS isolation was **waived** on 2026-10-22; it is not a Phase 3 prerequisite or a release blocker. No broad CSS refactor was made.
- **Single user-facing Store** is the canonical account model (`docs/STORE-FIRST-SUBSCRIPTION-CHECKOUT-EXECUTION.bn.md`). `primaryStoreFor` in `apps/web/src/lib/server/auth.ts` prioritizes `platform_primary_stores` over a historical selection cookie; `AppShell` filters other memberships for bound users; `/workspaces` forwards single-Store users into setup/dashboard. Internal UUID identifiers and exceptional legacy multi-member accounts are maintained to prevent irreversible loss. **No new multi-Store UX is authorized.**
- The original 7 main groups received 2 explicit owner additions, `SMS Data` and `Invoices`; current canonical primary nav consists of 9 entries, not 7.

## Code, origin, and permission evidence

| Contract | Implemented source and assertion |
| --- | --- |
| Locale-neutral 9 main routes and strict nested financial UUID details | `apps/web/src/lib/unified-navigation.ts`, `scripts/briofold-unified-routes.test.mjs`, `scripts/briofold-locale-routing.test.mjs` |
| Server-side session, selected Store membership, service entitlement, financial realm | `apps/web/src/components/unified-merchant-route.tsx`; `auth.ts` primary Store binding and `paymentContextFor` checks; server proxy stale-Store protection for CRM/commerce |
| One Store header and unified merchant shell, search, notifications, responsive navigation, unsaved-draft confirmation | `apps/web/src/components/dashboard-frame.tsx`, `scripts/briofold-unified-routes.test.mjs`, `scripts/briofold-settings-interactions.test.mjs` |
| Settings dedicated routes grouped by business, AI/channels, payments, developers, team, billing/help; service gates | `apps/web/src/lib/unified-navigation.ts`, `apps/web/src/components/unified-settings-index.tsx`, `scripts/briofold-unified-routes.test.mjs` |
| Existing authorized payment/AI settings capabilities reuse their operational adapters | `apps/web/src/components/dashboard-content.tsx` and `unified-merchant-route.tsx`; `scripts/briofold-unified-devices.test.mjs` |
| Real preference GET/POST, version save/reload/restore, viewer cannot edit | `scripts/briofold-settings-browser.mjs` exercises real Go + PostgreSQL + Next + Playwright in disposable CI database |
| Account/session/MFA routes retain approved dedicated handlers | `scripts/briofold-account-settings-routing.test.mjs` |
| Public marketing navbar/footer excluded from merchant route shell | `scripts/briofold-unified-routes.test.mjs` |

## Verification

- Local (same local Phase10 stack): `node --test scripts/briofold-unified-routes.test.mjs scripts/briofold-locale-routing.test.mjs scripts/briofold-account-settings-routing.test.mjs scripts/briofold-unified-devices.test.mjs scripts/briofold-settings-interactions.test.mjs` — **5 files PASS, 0 failed**.
- Previously verified full-stack CI on published Phase10 increment [39737210067](https://github.com/masharzy/ekmivo/actions/runs/39737210067): **4/4 jobs PASS** including disposable PostgreSQL/Go/Next/browser Settings, additional Phase8 72 and Phase9 96 responsive cases. A new Phase3 documentation/contract commit must receive its own green CI before treating the new SHA as verified; record it here afterward.

## Precisely excluded from this code-level seal

- Missing AiPraktor-equivalent **groups**, tutorial video/watch-state, push/PWA device preferences, advanced independent campaigns/bookings and cross-domain exports are not silently marked implemented. They remain separately tracked in the 56-item parity list; product capability completion (including Phase 10) is still open.
- Live provider accounts, actual phones/SMS/Meta send, subjective owner visual QA and production deployment are not code-level checks. See `docs/MANUAL-VERIFICATION.md`.
- The Store-first subscription checkout Phases 2–7 are concurrent and independent. Their branches/migrations must remain intact; this record makes no claims about those phases.

**Seal interpretation:** Phase 3's infrastructure for discovering and retaining existing settings is complete and tested; an individual future feature cannot be advertised as complete merely because its route is reachable. Phase 10/full parity retains its own fail-closed gate.
