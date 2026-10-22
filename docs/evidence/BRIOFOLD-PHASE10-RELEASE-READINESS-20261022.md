# Briofold Phase 10 — final-phase engineering and release ledger

**Owner request:** Final Phase 10, plus a complete 0–10 accounting and one consolidated owner test checklist. This is the Briofold unified merchant-dashboard roadmap, **not** the Store-first subscription Phase 0–7 plan.

**Assessment: Phase 10 FULL CODE SEAL = OPEN. Production cutover = NOT AUTHORIZED.** Physical/real-provider testing belongs to the owner, outside the code-level gate. But missing *code* and unintegrated migrations/branches cannot be waived as “manual testing.” Do not relabel the phase complete because its existing baseline CI is green.

## Verified scope and phase history

| Phase | Existing delivered source/evidence | Verified status / limitations |
| --- | --- | --- |
| 0 · Baseline | [PR #89](https://github.com/masharzy/ekmivo/pull/89) merged: roadmap, visual/source mapping, 56-row initial feature tracker. | Initial audit/planning, not a verified end-to-end parity baseline. |
| 1 · Design isolation | [PR #90](https://github.com/masharzy/ekmivo/pull/90) merged: historical style regression guards. | **WAIVED by owner on 2026-10-22.** CSS separation is not required; future homepage-to-dashboard design adoption will be separate. |
| 2 · Business/routes | [PR #91](https://github.com/masharzy/ekmivo/pull/91) merged: canonical merchant route adapters and authenticated current-business resolution; locale-neutral URLs. | Code landed; comprehensive owner visual/redirect/tenant acceptance is a separate gate. |
| 3 · Shell/Settings | PRs [#91](https://github.com/masharzy/ekmivo/pull/91) and [#92](https://github.com/masharzy/ekmivo/pull/92) merged: unified sections/settings and revised SMS Data/Invoices navigation. | Code-level shell/Settings gate rechecked in `docs/evidence/BRIOFOLD-PHASE3-CODE-SEAL-20261022.md`. New feature delivery belongs to its later implementation phase. |
| 4 · Onboarding | PRs [#93](https://github.com/masharzy/ekmivo/pull/93) and [#127](https://github.com/masharzy/ekmivo/pull/127) merged: AI/Payments/Both onboarding and auth/browser continuations. | Isolated browser/DB acceptance; actual new-merchant/provider manual acceptance remains separate. |
| 5 · Independent AI wallet | PRs [#93](https://github.com/masharzy/ekmivo/pull/93) and [#128](https://github.com/masharzy/ekmivo/pull/128) merged: prepaid ledger/top-up proof safety and zero-credit manual Inbox/payment continuity. | Automated financial correctness assertions; paid AI/top-up flags OFF pending published tariff/provider and real activation approval. |
| 6 · Inbox/AI/comments | PRs [#129](https://github.com/masharzy/ekmivo/pull/129), [#130](https://github.com/masharzy/ekmivo/pull/130), [#131](https://github.com/masharzy/ekmivo/pull/131): role-safe Inbox, drafts/sends, versioned AI Studio, grounded jobs, website widget, signed comment/post rules/alerts. | Mock-provider SQL/Go/browser acceptance recorded; no real message/provider/moderation guarantee. Runtime flags and configured external services matter. |
| 7 · CRM | [PR #132](https://github.com/masharzy/ekmivo/pull/132) merged/deployed as `af3ea46`; migration 0140 control applied. Separate profiles, verified linking, lead stages, team follow-ups, privacy/export. | Four-job CI passed; production health checked. Physical email/provider, merchant UX acceptance pending. |
| 8 · Commerce | [PR #136](https://github.com/masharzy/ekmivo/pull/136) OPEN, head `411090a2`, Foundation CI [39707671306](https://github.com/masharzy/ekmivo/actions/runs/39707671306) 4/4 pass including **72** responsive cases. Orders/catalog/stock, coupons, COD, returns, imports, courier boundary. | **Code-level sealed only.** Migration `0141` **not production applied** per latest recorded handoff; not merged/deployed. |
| 9 · Payments parity | [PR #138](https://github.com/masharzy/ekmivo/pull/138) OPEN, head `da94b0ae`, Foundation CI [39731069638](https://github.com/masharzy/ekmivo/actions/runs/39731069638) 4/4 pass; **96** payment and **72** commerce responsive cases pass. | **Code-level sealed only.** Stacked on Phase 8; real finance engine intact, not merged/deployed. |
| 10 · Final growth/release | `agents/phase10-growth-release`: aggregate-only business reporting for full CRM stage/follow-up, orders by state/source, and conversation activity. Tenant/realm checked SECURITY DEFINER reader; no financial amount inferred from order state. `0142` additive control migration; isolated SQL + Next browser/responsive gate. | **Increment in progress.** Broadcast dispatch, provider-safe campaign scheduling, bookings, complete AI/team/advanced exports, tracker parity and final production rollout remain open code/ops gates. CSS separation is WAIVED, not a blocker. |

## Phase 10 verified reporting contract

- `/reports`: business/customer and order workflow counts; 0 only after successful authorized read. An absent function/database returns explicit unavailable, not fake zero.
- `BRIOFOLD_GROWTH_REPORTS_ENABLED=true` enables the new read model **only after migration 0142 is verified**. Default OFF leaves existing Reports behavior intact during earlier-phase rollout.
- `/reports/payments`: remains the existing *authoritative finance* report; COD, order status and merchant courier claims never become verified payment totals.
- `/reports/ai`: authorized conversation counts and **separately metered AI credit statement**. No synthetic AI usage metric.
- `briofold_growth_snapshot(workspace,realm,actor)`: membership and active actor rechecked in PostgreSQL; every aggregate scoped to business+live/sandbox. Owner and viewer may read anonymized counts only; no raw contacts, phone numbers, customer names, provider tokens or financial ledger grants.
- Tests apply 0142 in disposable loopback PostgreSQL after 0140/0141, compare exact aggregated counts against isolated records, deny wrong business, isolate sandbox, and exercise EN/BN, light/dark and 320/360/768/1440 browser widths. No production fixture or migration is allowed in the tests.

## 2026-10-22 implementation continuation — consent-safe editorial and internal appointments

- `0180_briofold_growth_operations.sql` is an **additive CONTROL migration** with Store/realm authorization and single-primary-Store protection where a `platform_primary_stores` binding exists. The high migration prefix deliberately avoids the concurrent subscription team's `0143` offer Admin migration and their reserved nearby identifiers. It requires installed CRM/commerce schemas and must not be run on the financial runtime database.
- Campaign broadcasts/posts support real persisted **drafts** and **editorial planned dates**, revision conflict checks, idempotent create/update, audit-by-command key and owner/admin-only mutations. They deliberately **cannot send customer messages**. Qualified candidate counts are not verified provider opt-in, and no worker sees or dispatches these rows.
- Booking resources/appointments support role-checked persisted CRUD transitions, same-Store optional CRM linkage, service availability and serial transaction locks to prevent overlapping active reservations. No external calendar integration or outgoing confirmation is asserted.
- Next `/customers/broadcasts`, `/customers/posts`, `/customers/bookings` use the new views only when `BRIOFOLD_GROWTH_OPERATIONS_ENABLED=true`, **default OFF** until the migration and compatible Go deployment. Otherwise the earlier truthful service-unavailable view remains. Go `/v1/workspaces/{workspaceID}/growth` is authenticated and proxied with stale-Store checks and strict action payload bounds.
- New disposable DB/Go/Next/browser test `briofold-growth-operations-acceptance.mjs`: idempotency collision, writer/viewer roles, cross-Store and realm isolation, invalid linked customer, appointment collision and rollback/rebook, API origin and session, 36 responsive EN/BN/theme/viewport cases. **Not yet CI-passed at the time this section was written; it becomes evidence only when the updated head's CI is green.**

This is meaningful additional implementation, **not the full Phase 10 seal**. Provider-constrained broadcast delivery/consent proof, publishing/scheduling integrations and full tracker reconciliation are still missing. Owner physical testing remains excluded from code-level acceptance, but cannot waive these missing source/API pieces.

## Phase 10 release blockers — code/ops, NOT owner physical checks

1. Extend the new honest draft/planning module with **real consent evidence**, channel-specific suppression, opt-out, quiet hours, verified template/provider policy, preview/test, worker delivery only with explicit approval, idempotent send logs and uncertain-outcome review. A draft cannot silently count as delivery.
2. Finish bookings operations beyond internal capacity: provider-safe calendar scheduling, customer confirmations when and only when an approved transport exists, availability/time-zone refinements. No unsupported website voice/calls promises.
3. Complete actual campaign publishing integrations and reporting, advanced role-safe cross-source exports, full sales/team/AI analytics with server-defined denominators. Some existing post-to-product mapping belongs to Phase 8, **not** Phase 10 provider publishing.
4. Reconcile all entries in `docs/BRIOFOLD-FEATURE-PARITY-TRACKER.csv` to exact code/CI or an explicit *external provider/compliance* block. The tracker currently contains `NOT_YET_VERIFIED_IN_UNIFIED_DASHBOARD` rows; these are **not** all external blockers.
5. Integrate Phase 8 → 9 → 10 in order against latest `main` without overwriting concurrent Store-first subscription branches; rerun CI on the integration SHA. Verify migration 0141/0142 dependency, backups/forward-only rollback, feature flags, read parity and deployment observability before approving cutover.

**Owner architecture correction:** Single user-facing Store, not workspace-switch UX. Retain existing `platform_primary_stores` binding and internal `workspace_id`/financial realm for migration-safe authorization. No new multiple-Store picker may be introduced by Phase 10.

## One owner-run physical/manual test pass (excluded from code seal)

Use a dedicated consented merchant test business/account and record device, timezone, browser, source SHA, environment, observed result, screenshot/log *without secrets/PII*. Do not run fictional CI fixtures in production.

- [ ] Auth/onboarding: new signup, verify email/reset/MFA, invited member, AI-only, Payments-only, Both, service switch, incomplete setup and back-button continuity.
- [ ] Navigation/UI: seven logical sections plus owner-approved separate SMS Data/Invoices; EN/BN with Hind Siliguri, Light/Dark/System, 320/360/768/1440, 200% zoom, reduced motion, keyboard/screen reader, refresh/back/direct bookmarks, no locale/workspace UUID visible.
- [ ] Business & permissions: owner/admin/editor/viewer, removed employee, switched business, revoked session; cross-tenant private contact, payments, invoices and provider credentials never appear.
- [ ] Inbox/AI: Messenger/Instagram/WhatsApp/website with your authorized accounts; inbound/outbound, lost network, eight long conversations/media, human takeover, saved reply, ticket/SLA, comment post whitelist/blacklist, AI vs fixed review, provider moderation and delivery uncertainty.
- [ ] AI wallet: authorized published model tariff, top-up proof, input/output charge, low/empty balance, concurrency/retry/reversal, unchanged manual Inbox/payment functions when AI credit runs out.
- [ ] CRM/leads: verified email/phone linking, duplicate names/unverified numbers stay separate, source unlink/dispute/deletion, masking, CSV/export, stage/assignment and team follow-up in local timezone. Confirm no follow-up auto-sends.
- [ ] Commerce: products/variants/photos, stock reservation races, coupons, CSV/XLSX/Woo BDT import, manual/API/AI orders, scan/packing, COD, returns, courier Steadfast unknown outcome/reconciliation, private media and physical barcode.
- [ ] Payments/device: physical Android pair/reconnect/disconnect/delete, offline/reboot/retry, real consented bKash/Nagad/Rocket SMS examples, wrong payer/amount/time, duplicates, expiry/cancel, actual invoices/refunds, receiving-account masking and authorized webhooks/settlement.
- [ ] Reports: compare aggregate CRM/orders with actual records; check time zone, consent candidate vs send permission, no COD as verified revenue, Payment report parity, AI statement vs provider bills and export scopes.
- [ ] Failure paths: provider 502/503/timeouts, stale-cache or partial navigation, lost ACK/retry, exhausted credit, disconnected SMS source, disabled provider, 403/404/empty states, browser offline and retry.
- [ ] Production operator gates (separate, deliberate release): exact merged SHA; latest CI 4/4; backup/restore evidence; migrations 0141 then 0142 only in the CONTROL database; RLS/runtime grants and data counts; staged flags; Render/Vercel health/logs, financial realm isolation, post-deploy authorization smoke and rollback drill.

**Do not call a preview, mocked delivery, code CI, app compile or document title a production/provider/physical PASS.** Manual ledger: `docs/MANUAL-VERIFICATION.md`. Phase 8/9 code evidence is in their respective PRs and handoffs.
