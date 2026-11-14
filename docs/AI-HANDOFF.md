# AI commerce bot: handoff (2026-11-14)

Read this file first for any work on the AI selling bot, AI payments, orders or the VPS deploy.
It replaces older notes where they disagree. Then read `docs/plans/ai-production-ready.md` (the agreed plan).

## 1. How to work with the owner

- Reply in short, simple Bangla (Banglish if he writes Banglish). No long explanations.
- **Check the code before you answer.** Do not guess. If you have not verified something, say so in the same sentence. The owner gets angry, with reason, at confident guesses.
- State what exists in code and what does not, in a small table when comparing.
- Do only what he asks. When he says "later", put it in the plan and stop.
- He does not run Claude Code on the VPS (1 vCPU, 2 GB RAM). Give him **one command at a time**, he pastes the output. No extra talk around commands.
- He uses Windows PowerShell to reach the VPS over SSH as a non-root user with sudo. Do not give PowerShell syntax for the VPS shell or the other way round.

## 2. Safety rules (owner's own, still in force)

- No production database writes without his permission. Never hand-edit production orders, payments or stock.
- Back up before any production migration (the deploy script does this).
- Feature flag off must mean exactly the old behaviour.
- Never put phone numbers, TrxIDs, addresses, API keys or database URLs in logs, commits, docs or chat.
- Merge to `main` and deploy only when he says so.
- Money decisions never belong to the model. The model talks; the database verifies and calculates.

## 3. Production layout

- One VPS. Docker containers: `briofold-api-1` (Go API), `briofold-postgres-1` (Postgres), nginx.
- Databases: `ekmivo` (control), `ekmivo_live_financial`, `ekmivo_sandbox_financial`.
- Web dashboard: Vercel project `ekmivo-web`.
- Older docs (`AGENTS.md`, `docs/AGENT-HANDOFF.md`) describe Neon and Render as production. For the AI bot that is out of date: production data is on the VPS.
- Source on the VPS for builds: `/opt/briofold/rename-release/src`. Backups: `/opt/briofold/backup/` (same disk, a known risk, see plan step 1).
- Flags live in the API's `compose.json` env. On in production: `BRIOFOLD_AI_TOOLS_ENABLED`, `BRIOFOLD_AI_RUNTIME_ENABLED`, `BRIOFOLD_AI_COMMERCE_V2_ENABLED`, `BRIOFOLD_AI_ORDER_MEMORY_ENABLED`, `BRIOFOLD_AI_LATE_SMS_REVIEW_ENABLED`, `BRIOFOLD_AI_PAYMENT_VERIFY_ENABLED`, `BRIOFOLD_AI_PAYMENTS_V2_ENABLED`. Not set: `BRIOFOLD_CATALOG_ENABLED`, `BRIOFOLD_PRODUCT_PHOTOS_ENABLED`, `PRIVATE_S3_*`, `BRIOFOLD_PATHAO_ENABLED`. Confirm on the VPS before relying on this list.

## 4. Deploy (the only allowed way)

Deploy only from a GitHub commit, only with the script. Never place code on the VPS by hand: earlier VPS-only fixes were lost from the repo and had to be recovered (`docs/recovered/vps-2026-11-10/`).

```bash
cd /opt/briofold/rename-release/src && git fetch origin <branch> && git show <full-40-char-hash>:deploy/vps/ai-payments-v2.sh > ~/ai-payments-v2.sh
sudo bash ~/ai-payments-v2.sh <full-40-char-hash>
```

The script checks health, dumps all three databases, applies migrations 0247 to 0253, builds the API image, restarts the API, watches health for 30 s and rolls the API back on failure. `--rollback` and `--flag-off` exist. The restore paths have not been exercised on the real VPS.
New migrations must be added to the script's list, to `backend/cmd/financial-migrate/dashboard_reference.go` and to `apps/web/scripts/briofold-ai-commerce-acceptance.mjs`.

CI: `.github/workflows/ci.yml`. The job "Next.js lint, build and isolated PostgreSQL smoke" takes 30 to 50 minutes. Wait for green before deploy. From Claude cloud sessions GitHub GraphQL is blocked: use `gh api` REST.

## 5. What was built (PR #166, merged to main as d52fb7aa)

Problem solved: the AI did not know the shop profile and products, and could not confirm payments itself.

- **AI context:** the job now carries the business profile and real products (`studio_execution.go`, flag `BRIOFOLD_AI_COMMERCE_V2_ENABLED`).
- **Payment ledger:** `commerce_order_payments` (immutable, void only). `commerce_orders` got `paid_minor`, `advance_minor`, `cod_charge_minor`, `pay_method`; `payment_state` has `partial`. One writer: `commerce_order_payment_recalc`.
- **Verification ladder** (`briofold_ai_payment_settle`, tool `verify_payment`): sender number alone confirms only when exactly one unclaimed receipt of the exact amount exists since the conversation started; otherwise ask the TrxID; still unsure goes to owner review and the customer is told it is in review.
- **Partial payments**, COD and online method switch (tool `change_payment_method`), owner advance rule (`advance_rule`, `advance_pct` in `commerce_ai_settings`, UI in `apps/web/src/components/ai-selling-settings.tsx`).
- **AI-only workspaces** (`service_mode='ai'`, no SMS app) never auto-verify: every payment goes to owner review. This is intended.
- **Orders page Paid column** reads the ledger (migration 0253).
- Migrations: control 0247, 0249 to 0253; financial realms 0248. Go: `backend/internal/checkout/ai_payments_v2.go`, `ai_tools.go`, `ai_payment_verify.go`, `ai_owner_http.go`. Tests: `ai_payments_v2_test.go`, subtest in `ai_commerce_integration_test.go`, `infra/tests/0247_*.sql`, `infra/tests/0249_*.sql`.

State on 2026-11-14: the owner reported both deploys done (first b9cda3af, then 672d0dfa). He confirmed the payment flow works with a real ৳230 order. He has **not yet confirmed** that the Orders page now shows Paid ৳230: ask him.

## 6. Facts checked in code (do not re-guess these)

- Owner order status today: one step forward only (`order-state` in `infra/migrations/0141_briofold_commerce.sql`): draft/hold → confirmed/cancelled, confirmed → packed/cancelled/hold, packed → shipped/cancelled, shipped → delivered. No backward move, no skipping, no cancel reason field.
- Owner approve/reject of an AI payment claim: API exists (`ai_owner_http.go`). `commerce_order_payment_owner` (record/void by owner) has no caller in Go or web yet.
- Courier: Steadfast booking and status exist and are manual (`commerce_integrations.go`). Pathao booking exists behind `BRIOFOLD_PATHAO_ENABLED` (`commerce_pathao.go`). Settings page: `courier-integrations.tsx`. No auto-booking after payment, no courier-side customer record.
- Customer profile (`infra/migrations/0235_briofold_customer_profile.sql`) already counts the shop's own delivered/cancelled/returned orders and a risk level.
- Screenshot reading (TrxID and sender from a payment screenshot) is in the AI instructions, not measured on the real model.
- AI context: last 8 text messages (700 chars each), max 5 tool steps, instructions about 6,500 bytes sent on every message, input limit 16,000 for `qwen/qwen3.8-omni-flash` (counted in bytes; Bangla is 3 bytes per character).
- Voice and video do not reach the model in AI selling mode (they go to a human).
- All automated tests use scripted model replies. Nothing has been measured against the real model yet.

Not checked yet: whether an AI-created order can be booked through the existing Steadfast path; whether any courier API returns a customer's received/returned counts by phone number.

## 7. Open work

1. PR #167 (docs only): plan update and this file. Merge when the owner says.
2. The plan `docs/plans/ai-production-ready.md`, in order: foundation, evals with the real model, CX, memory, voice, image search with pgvector, video. Courier is "later" by owner decision.
3. Owner decisions still open: Cloudflare R2 account; voice or image first; monthly AI conversation cap per plan.
4. Small items: owner notification for partial payments; owner record/void buttons in Orders UI; nightly permission error in the log (index maintenance job at midnight); delete the 0-byte backup `ekmivo_live_financial-pre-ai-fix-20261113-1318.dump` in `/opt/briofold/backup/`.

## 8. Owner decisions already made (do not reopen)

- Payment ladder as in section 5. AI-only plan: no auto verification; AI collects address, sender number, TrxID (or reads a screenshot), owner approves.
- Owner can cancel with a required reason; the AI tells the customer that reason.
- Step-by-step status stays, and the owner may also jump to any status forward or back; stock and money follow automatically; every change is recorded.
- Delivery areas: whole country, or chosen divisions/districts/thanas, with charge and delivery time per area.
- Courier work (auto booking, courier record of a customer) comes after the AI steps.
- Model: Qwen3.8 Omni Flash for now; compare alternatives only with the eval set.

## 9. Related documents

- `docs/plans/ai-production-ready.md`: the plan.
- `docs/plans/ai-commerce-v2-refactor.md`, `docs/backlog/ai-commerce-owner-feedback.md`: earlier plan and owner feedback.
- `docs/recovered/vps-2026-11-10/`: code that existed only on the VPS.
- `CLAUDE.md`: its Android rules apply to `apps/mobile` work only.
