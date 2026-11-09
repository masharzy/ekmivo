#!/usr/bin/env node
// 100 concurrent sandbox conversations through the real inbox -> AI job queue -> tool loop. Pass: error rate < 1%.
//   LOAD_CONTROL_URL=... LOAD_CONN_ID=<sandbox inbox connection uuid> node tools/testing/ai-load-test.mjs
// Remote: also SEED_ALLOW_REMOTE_SANDBOX=1, SEED_ALLOWED_HOST=<host> and the briofold_test_branch marker (see the seed).
// Run the API with BRIOFOLD_AI_RUNTIME_ENABLED=true and INBOX_SENDER_ENABLED unset, so replies stay queued and
// nothing is sent to Meta for the fake PSIDs. This spends real model credits.
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
import {assertSafeTarget, assertTestMarker} from "./seed-ai-commerce-sandbox.mjs";

const url = process.env.LOAD_CONTROL_URL, conn = process.env.LOAD_CONN_ID, N = Number(process.env.LOAD_CONVERSATIONS || 100);
const target = assertSafeTarget(url, "load-control");
if (!conn) throw new Error("LOAD_CONN_ID required (a sandbox inbox connection)");
const postgres = createRequire(new URL("../../apps/web/package.json", import.meta.url))("postgres");
const db = postgres(url, {max: 10, prepare: false});
// One message per conversation keeps one job per thread (bursts are coalesced by design).
const msgs = ["punjabi ache?", "dam koto?", "COD hobe?", "Dhaka te delivery charge koto?", "amar order er ki obostha?"];
const start = Date.now();
try {
  if (target.remote) await assertTestMarker(db, "load-control");
  const env = (await db`SELECT environment FROM inbox_connections WHERE id=${conn}`)[0]?.environment;
  if (env !== "sandbox") throw new Error("connection is not a sandbox connection");
  const tag = "load-" + randomUUID().slice(0, 8) + "-";
  await Promise.all(Array.from({length: N}, (_, i) =>
    db`SELECT inbox_ingest(${conn},${randomUUID()},${tag + i},${"Load " + i},${msgs[i % msgs.length]},'text',now())`));
  const deadline = Date.now() + 10 * 60_000;
  let rows;
  do {
    await new Promise(r => setTimeout(r, 5000));
    rows = await db`SELECT j.state,j.reason,count(*)::int n FROM briofold_ai_channel_jobs j JOIN inbox_threads t ON t.id=j.thread_id
      WHERE t.connection_id=${conn} AND t.external_id LIKE ${tag + "%"} GROUP BY 1,2`;
  } while (rows.some(r => ["queued", "running"].includes(r.state)) && Date.now() < deadline);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const ok = rows.filter(r => r.state === "completed").reduce((s, r) => s + r.n, 0);
  const bad = total - ok - rows.filter(r => r.state === "cancelled").reduce((s, r) => s + r.n, 0);
  const rate = total ? bad / total : 1;
  console.log(JSON.stringify({conversations: N, jobs: total, completed: ok, by_state_reason: rows, error_rate_pct: Math.round(rate * 1000) / 10,
    seconds: Math.round((Date.now() - start) / 1000), pass: total >= N * 0.99 && rate < 0.01}));
  process.exitCode = rate < 0.01 && total >= N * 0.99 ? 0 : 1;
} finally { await db.end(); }
