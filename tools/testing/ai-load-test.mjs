#!/usr/bin/env node
// 100 concurrent sandbox conversations through the real inbox -> AI job queue. Pass criterion: error rate < 1%.
//   LOAD_CONTROL_URL=... LOAD_ALLOW_REMOTE_SANDBOX=1 LOAD_CONN_ID=<sandbox inbox connection uuid> node tools/testing/ai-load-test.mjs
// Requires the API with BRIOFOLD_AI_RUNTIME_ENABLED=true running against the same sandbox database.
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
import {assertSafeTarget} from "./seed-ai-commerce-sandbox.mjs";
const url = process.env.LOAD_CONTROL_URL, conn = process.env.LOAD_CONN_ID, N = Number(process.env.LOAD_CONVERSATIONS || 100);
assertSafeTarget(url, "load-control", {allowRemote: process.env.LOAD_ALLOW_REMOTE_SANDBOX === "1"});
if (!conn) throw new Error("LOAD_CONN_ID required (a sandbox inbox connection)");
const postgres = createRequire(new URL("../../apps/web/package.json", import.meta.url))("postgres");
const db = postgres(url, {max: 10, prepare: false});
const msgs = ["punjabi ache?", "dam koto?", "COD hobe?", "delivery charge Dhaka", "order status"];
const start = Date.now();
try {
  const env = (await db`SELECT environment FROM inbox_connections WHERE id=${conn}`)[0]?.environment;
  if (env !== "sandbox") throw new Error("connection is not a sandbox connection");
  await Promise.all(Array.from({length: N}, async (_, i) => {
    for (const m of msgs) await db`SELECT inbox_ingest(${conn},${randomUUID()},${"load-psid-" + i},${"Load " + i},${m},'text',now())`;
  }));
  const deadline = Date.now() + 10 * 60_000;
  let rows;
  do {
    await new Promise(r => setTimeout(r, 5000));
    rows = await db`SELECT state,count(*)::int n FROM briofold_ai_channel_jobs j JOIN inbox_threads t ON t.id=j.thread_id WHERE t.connection_id=${conn} AND t.external_id LIKE 'load-psid-%' GROUP BY state`;
  } while (rows.some(r => ["queued", "running"].includes(r.state)) && Date.now() < deadline);
  const by = Object.fromEntries(rows.map(r => [r.state, r.n])), total = rows.reduce((s, r) => s + r.n, 0);
  const bad = (by.failed || 0) + (by.queued || 0) + (by.running || 0) + (by.review || 0);
  const rate = total ? bad / total : 1;
  console.log(JSON.stringify({conversations: N, jobs: total, states: by, error_rate_pct: Math.round(rate * 1000) / 10, seconds: Math.round((Date.now() - start) / 1000), pass: rate < 0.01}));
  process.exitCode = rate < 0.01 ? 0 : 1;
} finally { await db.end(); }
