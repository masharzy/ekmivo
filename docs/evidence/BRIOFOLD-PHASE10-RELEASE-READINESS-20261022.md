# Briofold Phase 10 — final-phase engineering and release ledger

**Owner request:** Final Phase 10, plus a complete 0–10 accounting and one consolidated owner test checklist. This is the Briofold unified merchant-dashboard roadmap, **not** the Store-first subscription Phase 0–7 plan.

**Assessment: Phase 10 FULL CODE SEAL = OPEN. Production cutover = NOT AUTHORIZED.** Physical/real-provider testing belongs to the owner, outside the code-level gate. But missing *code* and unintegrated migrations/branches cannot be waived as “manual testing.” Do not relabel the phase complete because its existing baseline CI is green.

## Verified scope and phase history

| Phase | Existing delivered source/evidence | Verified status / limitations |
| --- | --- | --- |
| 0 · Baseline | [PR #89](https://github.com/masharzy/ekmivo/pull/89) merged: roadmap, visual/source mapping, 56-row initial feature tracker. | Initial audit/planning, not a verified end-to-end parity baseline. |
| 1 · Design isolation | [PR #90](https://github.com/masharzy/ekmivo/pull/90) merged: style boundary regression guards for payment, marketing, admin. | **Partial:** owner-mandated root `globals.css` physical isolation (Phase 1B) not complete in that PR. |
| 2 · Business/routes | [PR #91](https://github.com/masharzy/ekmivo/pull/91) merged: canonical merchant route adapters and authenticated current-business resolution; locale-neutral URLs. | Code landed; comprehensive owner visual/redirect/tenant acceptance is a separate gate. |
| 3 · Shell/Settings | PRs [#91](https://github.com/masharzy/ekmivo/pull/91) and [#92](https://github.com/masharzy/ekmivo/pull/92) merged: unified sections/settings and revised SMS Data/Invoices navigation. | Core routes exist; route-by-route parity tracker remains unverified, some modules are deliberately unavailable. |
| 4 · Onboarding | PRs [#93](https://github.com/masharzy/ekmivo/pull/93) and [#127](https://github.com/masharzy/ekmivo/pull/127) merged: AI/Payments/Both onboarding and auth/browser continuations. | Isolated browser/DB acceptance; actual new-merchant/provider manual acceptance remains separate. |
| 5 · Independent AI wallet | PRs [#93](https://github.com/masharzy/ekmivo/pull/93) and [#128](https://github.com/masharzy/ekmivo/pull/128) merged: prepaid ledger/top-up proof safety and zero-credit manual Inbox/payment continuity. | Automated financial correctness assertions; paid AI/top-up flags OFF pending published tariff/provider and real activation approval. |
| 6 · Inbox/AI/comments | PRs [#129](https://github.com/masharzy/ekmivo/pull/129), [#130](https://github.com/masharzy/ekmivo/pull/130), [#131](https://github.com/masharzy/ekmivo/pull/131): role-safe Inbox, drafts/sends, versioned AI Studio, grounded jobs, website widget, signed comment/post rules/alerts. | Mock-provider SQL/Go/browser acceptance recorded; no real message/provider/moderation guarantee. Runtime flags and configured external services matter. |
| 7 · CRM | [PR #132](https://github.com/masharzy/ekmivo/pull/132) merged/deployed as `af3ea46`; migration 0140 control applied. Separate profiles, verified linking, lead stages, team follow-ups, privacy/export. | Four-job CI passed; production health checked. Physical email/provider, merchant UX acceptance pending. |
| 8 · Commerce | [PR #136](https://github.com/masharzy/ekmivo/pull/136) OPEN, head `411090a2`, Foundation CI [39707671306](https://github.com/masharzy/ekmivo/actions/runs/39707671306) 4/4 pass including **72** responsive cases. Orders/catalog/stock, coupons, COD, returns, imports, courier boundary. | **Code-level sealed only.** Migration `0141` **not production applied** per latest recorded handoff; not merged/deployed. |
| 9 · Payments parity | [PR #138](https://github.com/masharzy/ekmivo/pull/138) OPEN, head `da94b0ae`, Foundation CI [39731069638](https://github.com/masharzy/ekmivo/actions/runs/39731069638) 4/4 pass; **96** payment and **72** commerce responsive cases pass. | **Code-level sealed only.** Stacked on Phase 8; real finance engine intact, not merged/deployed. |
| 10 · Final growth/release | `agents/phase10-growth-release`: aggregate-only business reporting for full CRM stage/follow-up, orders by state/source, and conversation activity. Tenant/realm checked SECURITY DEFINER reader; no financial amount inferred from order state. `0142` additive control migration; isolated SQL + Next browser/responsive gate. | **Increment in progress.** Broadcast dispatch, provider-safe campaign scheduling, bookings, complete AI/team/advanced exports, Phase 1B isolation, tracker parity and final production rollout remain open code/ops gates. |

## Phase 10 verified reporting contract

- `/reports`: business/customer and order workflow counts; 0 only after successful authorized read. An absent function/database returns explicit unavailable, not fake zero.
- `BRIOFOLD_GROWTH_REPORTS_ENABLED=true` enables the new read model **only after migration 0142 is verified**. Default OFF leaves existing Reports behavior intact during earlier-phase rollout.
- `/reports/payments`: remains the existing *authoritative finance* report; COD, order status and merchant courier claims never become verified payment totals.
- `/reports/ai`: authorized conversation counts and **separately metered AI credit statement**. No synthetic AI usage metric.
- `briofold_growth_snapshot(workspace,realm,actor)`: membership and active actor rechecked in PostgreSQL; every aggregate scoped to business+live/sandbox. Owner and viewer may read anonymized counts only; no raw contacts, phone numbers, customer names, provider tokens or financial ledger grants.
- Tests apply 0142 in disposable loopback PostgreSQL after 0140/0141, compare exact aggregated counts against isolated records, deny wrong business, isolate sandbox, and exercise EN/BN, light/dark and 320/360/768/1440 browser widths. No production fixture or migration is allowed in the tests.

## Phase 10 release blockers — code/ops, NOT owner physical checks

1. Complete physical CSS ownership separation from global marketing styles (Phase 1B); approved merchant computed styles and no cross-route leak.
2. Implement and exercise broadcast drafts/consent and suppression/audience safety, opt-in proof, quiet hours/provider policies, preview/schedule/worker/idempotent delivery and uncertain-outcome review; current `/customers/broadcasts` shows explicit service-unavailable shell.
3. Complete actual bookings/service slots and provider-safe scheduling; `/customers/bookings` is currently unavailable. Do not advertise working website voice/calls without supported transport.
4. Complete post campaign/editor scheduling and reporting, advanced role-safe cross-source exports, full sales/team/AI analytics with server-defined denominators. Some existing post-to-product mapping belongs to Phase 8, **not** Phase 10 campaign scheduling.
5. Reconcile all entries in `docs/BRIOFOLD-FEATURE-PARITY-TRACKER.csv` to exact code/CI or an explicit *external provider/compliance* block. The tracker currently contains `NOT_YET_VERIFIED_IN_UNIFIED_DASHBOARD` rows; these are **not** all external blockers.
6. Integrate Phase 8 → 9 → 10 in order against latest `main` without overwriting concurrent Store-first subscription branches; rerun CI on the integration SHA. Verify migration 0141/0142 dependency, backups/forward-only rollback, feature flags, read parity and deployment observability before approving cutover.

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
