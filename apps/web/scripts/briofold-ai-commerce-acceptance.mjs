import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import postgres from "postgres";

// AI commerce end to end on the isolated CI databases: installs the AI commerce migrations (control 0215-0235,
// both financial realms 0236), then runs the Go integration test that drives the real worker, metering, finish,
// tool dispatcher and payment verifier with a scripted model (backend/internal/checkout/ai_commerce_integration_test.go).
const CONTROL = ["0215_ai_unknown_thread_isolation.sql", "0216_ai_multimodal_input.sql", "0217_briofold_key_prefix.sql", "0218_web_members_lock_grant.sql",
  "0219_inbox_telegram_no_reply_window.sql", "0220_inbox_window_execution_grants.sql", "0221_inbox_media_refresh_metadata.sql", "0222_inbox_transient_blobs.sql",
  "0223_inbox_blobs_drop.sql", "0224_inbox_telegram_delivered_on_send.sql", "0225_inbox_delivered_watermark.sql", "0226_inbox_realtime_avatars.sql",
  "0227_briofold_customer_orders_link.sql", "0228_briofold_catalog_search.sql", "0229_briofold_catalog_api.sql", "0230_briofold_woo_sync.sql",
  "0231_briofold_catalog_key_actor.sql", "0232_briofold_catalog_search_speed.sql", "0233_briofold_ai_tools.sql", "0234_briofold_ai_selling.sql",
  "0235_briofold_customer_profile.sql"];
const PREREQ = {"0217_briofold_key_prefix.sql": "to_regclass('public.public_sandbox_config') IS NOT NULL"};
// Production roles that later migrations grant to; the disposable CI cluster creates them as NOLOGIN placeholders.
const PRODUCTION_ROLES = ["ekmivo_owner", "ekmivo_runtime", "ekmivo_web_app"];
const sql = name => readFile(new URL("../../../infra/migrations/" + name, import.meta.url), "utf8");
const local = raw => { const u = new URL(raw); if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || /prod/i.test(u.pathname)) throw Error("AI commerce acceptance refuses shared databases"); return raw; };

export async function runBriofoldAiCommerce({control, apiEnv, phase9Fixture}) {
  const db = postgres(local(control), {max: 1, prepare: false, onnotice: () => {}});
  try {
    // Fixture-only ledger so an interrupted run can continue; production uses the dashboard reference coordinator.
    await db`CREATE TABLE IF NOT EXISTS zz_ai_commerce_fixture_migrations(filename text PRIMARY KEY)`;
    for (const role of PRODUCTION_ROLES)
      if (!(await db`SELECT 1 FROM pg_roles WHERE rolname=${role}`).length) await db.unsafe(`CREATE ROLE ${role} NOLOGIN`);
    for (const file of CONTROL) {
      if ((await db`SELECT 1 FROM zz_ai_commerce_fixture_migrations WHERE filename=${file}`).length) continue;
      // Unrelated migrations whose prerequisites this fixture does not install (public sandbox table, web app role).
      const missing = PREREQ[file] && !(await db.unsafe(`SELECT ${PREREQ[file]} AS ok`))[0].ok;
      if (!missing) await db.unsafe(await sql(file)).simple();
      await db`INSERT INTO zz_ai_commerce_fixture_migrations VALUES(${file})`;
    }
    // Second run of the new migrations must be a no-op (idempotency).
    for (const file of CONTROL.slice(-3)) await db.unsafe(await sql(file)).simple();
  } finally { await db.end({timeout: 3}); }
  for (const realm of [phase9Fixture.liveDatabase, phase9Fixture.sandboxDatabase]) {
    const r = postgres(local(realm), {max: 1, prepare: false, onnotice: () => {}});
    try { for (let i = 0; i < 2; i++) await r.unsafe(await sql("0236_briofold_ai_receipt_lookup.sql")).simple(); } finally { await r.end({timeout: 3}); }
  }
  const out = execFileSync("go", ["test", "./internal/checkout", "-run", "TestAICommerceIntegration", "-count=1", "-v"], {
    cwd: new URL("../../../backend/", import.meta.url), timeout: 600000, encoding: "utf8",
    env: {...process.env, AI_IT_CONTROL_ADMIN_URL: control, AI_IT_RUNTIME_URL: apiEnv.AUTHZ_DATABASE_URL,
      AI_IT_PIPELINE_CONTROL_URL: apiEnv.PG06_CONTROL_PROJECTION_URL || apiEnv.AUTHZ_DATABASE_URL,
      AI_IT_LIVE_READER_URL: apiEnv.PG06_LIVE_DATABASE_URL, AI_IT_LIVE_ADMIN_URL: phase9Fixture.liveDatabase,
      PG05_PAYER_SECRET: apiEnv.PG05_PAYER_SECRET, PG06_ENCRYPTION_KEY_HEX: apiEnv.PG06_ENCRYPTION_KEY_HEX}});
  console.log(out.split("\n").filter(l => /^(--- |ok|PASS|FAIL)|_test\.go/.test(l)).join("\n"));
  if (!/--- PASS: TestAICommerceIntegration/.test(out)) throw Error("AI commerce integration did not pass:\n" + out.slice(-4000));
}
