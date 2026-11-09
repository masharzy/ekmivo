# Runbook: AI commerce (tool loop, orders, payment claims)

## Flags (all default off; flag off = old behaviour)
| Env | Effect |
|---|---|
| `BRIOFOLD_PRODUCT_API_ENABLED` | `/v1/products` public API |
| `BRIOFOLD_CATALOG_ENABLED` | dashboard catalog editor + CSV import |
| `BRIOFOLD_WOO_SYNC_ENABLED` | WooCommerce import + auto sync |
| `BRIOFOLD_AI_TOOLS_ENABLED` | AI answers through the tool loop (needs `BRIOFOLD_AI_RUNTIME_ENABLED=true`) |
| `BRIOFOLD_AI_TOOLS_WORKSPACES` | comma list of workspace ids; empty = all. Use for staged rollout |
| `BRIOFOLD_AI_PAYMENT_VERIFY_ENABLED` | worker that checks claims against SMS receipts every minute |
| `BRIOFOLD_AI_KILL_SWITCH=true` | stops the tool loop immediately for everyone (restart API) |
| `BRIOFOLD_AI_THREAD_STEPS_PER_MIN` (20) | model generations per thread per minute (text replies and tool steps) |
| `BRIOFOLD_AI_DAILY_COST_CAP_MINOR` (1000000) | per-workspace AI cost in the last 24 h (`briofold_ai_executions.charged_minor`); 0 = no cap. Over a limit => job goes to review, nothing is sent |

Note: the names differ from the plan (`BRIOFOLD_CATALOG_API_ENABLED`); the ones above are what the code reads.

## Rollout
1. Take a Neon snapshot/branch of production. Apply migrations with the migrate tool: control 0228-0235, both financial realms 0236.
2. Deploy with all flags off. Verify normal AI replies still work (old text path).
3. Turn on `BRIOFOLD_AI_TOOLS_ENABLED=true` with `BRIOFOLD_AI_TOOLS_WORKSPACES=<one test workspace>`.
4. After a day with no problems, add `BRIOFOLD_AI_PAYMENT_VERIFY_ENABLED=true`, then widen the allowlist.

## Rollback
- Immediate: `BRIOFOLD_AI_KILL_SWITCH=true` (or flags off) and restart. Old text replies resume. Data stays.
- Model rollback: set `AI_DEFAULT_MODEL` back to the previous value in channel config (note the previous value before changing).
- DB rollback (only if needed, test branch first): realm `DROP FUNCTION pg236_ai_receipt`; control `DROP TRIGGER briofold_thread_name_sync ON inbox_threads`, `DROP FUNCTION briofold_customer_profile` (0235 also replaced `briofold_customer_orders`: restore the 0227 body), then 0234 functions and tables (`commerce_payment_claims`, `commerce_ai_quotes`, `commerce_ai_settings`, columns `payment_state`, `draft_expires_at`), then 0233 (`briofold_ai_tool`, `briofold_ai_apply_handover`, `briofold_ai_rate_ok`, `ai_tool_calls`). Migrations are immutable once applied: add a new migration instead of editing.

## Monitoring (SQL)
- Tool errors last hour: `SELECT tool,count(*) FILTER (WHERE NOT ok) bad,count(*) FROM ai_tool_calls WHERE created_at>now()-interval '1 hour' GROUP BY 1;`
- Owner review queue size: `SELECT count(*) FROM commerce_payment_claims WHERE state='review';`
- Claims stuck pending > 20 min: `SELECT count(*) FROM commerce_payment_claims WHERE state='pending' AND created_at<now()-interval '20 minutes';` (worker not running)
- Jobs in review: `SELECT reason,count(*) FROM briofold_ai_channel_jobs WHERE state='review' GROUP BY 1;`

## Retry policy
Each tool step is one metered request with a derived key; a step is never repeated after the provider answered. A payment claim is retried every minute for 15 minutes, then goes to the owner review queue.

## Privacy
TrxID and the sender number are replaced by keyed digests (same as the SMS pipeline) + last 4 / last 3 digits before they reach the control DB. Receiving numbers stay encrypted in the financial realm; settings only hold account references. Tool args are stored redacted (phone numbers, addresses, ids, keys). Never log message bodies or numbers.
