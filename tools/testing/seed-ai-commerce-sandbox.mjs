#!/usr/bin/env node
// Phase 2: idempotent AI-commerce SANDBOX seed. Every record is TEST-prefixed and
// lives in environment='sandbox'. Refuses live/production databases.
//   SEED_CONTROL_URL=... SEED_FINANCE_SANDBOX_URL=... SEED_OWNER_EMAIL=... node seed-ai-commerce-sandbox.mjs
// Re-running updates the same rows (deterministic ids/references); it never duplicates.
import {createHash, createHmac} from "node:crypto";
import {createRequire} from "node:module";

export const ENV = "sandbox";
const NS = "TEST-";

export function assertSafeTarget(raw, label, {allowRemote = process.env.SEED_ALLOW_REMOTE_SANDBOX === "1"} = {}) {
  if (!raw) throw new Error(`${label}: URL missing`);
  const u = new URL(raw);
  if (/prod|live/i.test(u.pathname) && !/sandbox|test/i.test(u.pathname))
    throw new Error(`${label}: refuses a database whose name looks like live/production`);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (!local && !allowRemote)
    throw new Error(`${label}: remote host refused; set SEED_ALLOW_REMOTE_SANDBOX=1 only for a sandbox/test branch`);
  return u;
}

// Deterministic uuid so a second run hits the same rows.
export const id = (...p) => {
  const h = createHash("sha256").update(NS + p.join("|")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const hmac = s => createHmac("sha256", "test-seed-key").update(s).digest("hex");

const CATS = [
  ["punjabi", "Cotton Punjabi", 280000, ["পাঞ্জাবি"]],
  ["saree", "Jamdani Saree", 650000, ["শাড়ি"]],
  ["tshirt", "Basic T-Shirt", 99000, ["টি-শার্ট"]],
  ["shoes", "Leather Shoes", 320000, ["জুতা"]],
  ["bag", "Canvas Bag", 150000, ["ব্যাগ"]],
];
export function products() {
  const out = [];
  CATS.forEach(([cat, base, price, alias], ci) => {
    for (let n = 1; n <= 4; n++) {
      const k = ci * 4 + n, sizes = ["S", "M", "L", "XL"].slice(0, 2 + (n % 3));
      out.push({
        external_id: `${NS}P-${cat}-${n}`, name: `${NS}${base} ${n}`, description: `${base} model ${n}`,
        category: cat, tags: [cat], search_aliases: [cat, ...alias],
        ai_notes: "", min_price_minor: n % 2 ? Math.round(price * 0.9) : null,
        variants: sizes.map((s, i) => ({
          sku: `${NS}${cat}-${n}-${s}`, price_minor: price + n * 5000,
          // some variants out of stock on purpose
          stock: (k + i) % 5 === 0 ? 0 : 3 + ((k + i) % 7),
          options: {size: s},
        })),
      });
    }
  });
  return out; // 20 products, 2-4 variants each
}

async function ensureWorkspace(db, owner, name, mode) {
  const wid = id("workspace", name);
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${wid},${name},${mode},${owner}) ON CONFLICT(id) DO NOTHING`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${wid},${owner},'owner') ON CONFLICT DO NOTHING`;
  return wid;
}

export async function seed({control, finance}) {
  const email = process.env.SEED_OWNER_EMAIL;
  if (!email) throw new Error("SEED_OWNER_EMAIL required (an existing user in the sandbox/test DB)");
  const owner = (await control`SELECT id FROM users WHERE lower(email)=lower(${email})`)[0]?.id;
  if (!owner) throw new Error("owner user not found");
  const report = {};
  const wsBoth = await ensureWorkspace(control, owner, `${NS}Both mode shop`, "both");
  const wsAi = await ensureWorkspace(control, owner, `${NS}AI-only shop`, "ai");
  report.workspaces = [wsBoth, wsAi];

  for (const w of [wsBoth, wsAi]) {
    await control`INSERT INTO commerce_warehouses(id,workspace_id,environment,name) VALUES(${id("wh", w)},${w},${ENV},${NS + "Main"}) ON CONFLICT DO NOTHING`;
    for (const p of products()) {
      await control`SELECT commerce_catalog_write(${w},${ENV},${owner},${id("key", w, p.external_id)},${"catalog-upsert"},${control.json({...p, external_id: p.external_id})})`;
    }
    // 3 coupons: valid, expired, per-customer-limit 1
    const cp = [
      ["TEST-VALID10", "percent", 10, "now() - interval '1 day'", "now() + interval '30 days'", 100],
      ["TEST-EXPIRED", "fixed", 20000, "now() - interval '40 days'", "now() - interval '10 days'", 100],
      ["TEST-ONCE", "fixed", 10000, "now() - interval '1 day'", "now() + interval '30 days'", 100],
    ];
    for (const [code, kind, value, s, e, lim] of cp) {
      await control.unsafe(
        `INSERT INTO commerce_coupons(id,workspace_id,environment,code,kind,value,usage_limit,per_customer_limit,starts_at,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,1,${s},${e}) ON CONFLICT(workspace_id,environment,code) DO NOTHING`,
        [id("coupon", w, code), w, ENV, code, kind, value, lim]);
    }
  }

  // Test customer + Messenger sandbox thread on the Both-mode workspace
  const cust = id("customer", "sarkio");
  await control`INSERT INTO briofold_customers(id,workspace_id,environment,name,phone) VALUES(${cust},${wsBoth},${ENV},'Sarkio Test','01700000001') ON CONFLICT(id) DO NOTHING`;
  const conn = (await control`SELECT inbox_connection(${wsBoth},${ENV},'ms',${NS + "messenger-" + wsBoth},decode('abcd','hex')) AS id`)[0].id;
  await control`SELECT inbox_ingest(${conn},${id("msg", "hello")},'test-psid-sarkio','Sarkio Test','TEST hello','text',now())`;
  const thread = (await control`SELECT id FROM inbox_threads WHERE connection_id=${conn} AND external_id='test-psid-sarkio'`)[0]?.id;
  if (thread) await control`INSERT INTO briofold_customer_sources(customer_id,kind,source_id) VALUES(${cust},'inbox_thread',${thread}) ON CONFLICT DO NOTHING`;

  // 6 orders: delivered x3, cancelled, returned, awaiting payment
  const wh = id("wh", wsBoth);
  const variants = await control`SELECT v.id,v.sku,v.price_minor FROM commerce_variants v WHERE v.workspace_id=${wsBoth} AND v.environment=${ENV} AND v.sku LIKE ${NS + "%"} ORDER BY v.sku LIMIT 6`;
  const states = ["delivered", "delivered", "delivered", "cancelled", "returned", "hold"];
  for (let i = 0; i < states.length; i++) {
    const v = variants[i]; if (!v) continue;
    const oid = id("order", i), total = Number(v.price_minor) + 7000;
    await control`INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,customer_id,warehouse_id,status,recipient,subtotal_minor,shipping_minor,total_minor)
      VALUES(${oid},${wsBoth},${ENV},${NS + "ORD-" + (i + 1)},'ai',${cust},${wh},${states[i]},${control.json({name: "Sarkio Test", city: "Dhaka"})},${v.price_minor},7000,${total}) ON CONFLICT(id) DO NOTHING`;
    await control`INSERT INTO commerce_lines(workspace_id,environment,order_id,variant_id,name,sku,options,unit_minor,quantity)
      VALUES(${wsBoth},${ENV},${oid},${v.id},${v.sku},${v.sku},'{}'::jsonb,${v.price_minor},1) ON CONFLICT(order_id,variant_id) DO NOTHING`;
    const claimed = i === 5 ? {method: "bkash", transaction_id: "TESTCLAIM01", amount_minor: total} : {};
    await control`UPDATE commerce_orders SET claimed_payment=${control.json(claimed)} WHERE id=${oid}`;
  }
  report.orders = states.length;

  // Fake SMS in the sandbox financial realm: 2 different senders, one reused TrxID, one low amount
  if (finance) {
    const proj = (await control`SELECT source_version FROM resolve_financial_projection(${wsBoth},${ENV})`)[0];
    if (proj) await finance`SELECT financial_sync_workspace(${wsBoth},${ENV},${Number(proj.source_version)},true)`;
    let acct = (await finance`SELECT id FROM financial_receiving_accounts WHERE workspace_id=${wsBoth} AND environment=${ENV} AND identity_hmac=${hmac("recv")}`)[0];
    if (!acct) acct = (await finance`INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix) VALUES(${wsBoth},${ENV},'bkash',${hmac("recv")},'0001') RETURNING id`)[0];
    const sms = [
      ["TESTTRX0001", "01711111111", 350000], ["TESTTRX0002", "01722222222", 350000],
      ["TESTTRX0003", "01711111111", 5000], // low amount
      ["TESTUSED001", "01733333333", 350000], // already used by an order
    ];
    for (const [ref, payer, amount] of sms) {
      const rh = hmac(ref);
      if ((await finance`SELECT 1 FROM financial_receipt_observations WHERE workspace_id=${wsBoth} AND environment=${ENV} AND provider_reference_hmac=${rh}`).length) continue;
      const ev = (await finance`INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,event_digest,original_source_at,encrypted_evidence)
        VALUES(${wsBoth},${ENV},'device_sms',${NS + "evt-" + ref},${hmac("evt" + ref)},now(),${Buffer.alloc(48, 55)}) RETURNING id`)[0];
      await finance`INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,receiving_account_id,provider_reference_hmac,payer_hmac,amount_minor,method,direction,original_transaction_at,time_precision,parser_version)
        VALUES(${wsBoth},${ENV},${ev.id},${acct.id},${rh},${hmac(payer)},${amount},'bkash','incoming',now(),'second',1)`;
    }
    report.sms = sms.length;
  }
  return report;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  assertSafeTarget(process.env.SEED_CONTROL_URL, "control");
  if (process.env.SEED_FINANCE_SANDBOX_URL) assertSafeTarget(process.env.SEED_FINANCE_SANDBOX_URL, "finance");
  const postgres = createRequire(new URL("../../apps/web/package.json", import.meta.url))("postgres");
  const control = postgres(process.env.SEED_CONTROL_URL, {max: 1, prepare: false});
  const finance = process.env.SEED_FINANCE_SANDBOX_URL ? postgres(process.env.SEED_FINANCE_SANDBOX_URL, {max: 1, prepare: false}) : null;
  try { console.log(JSON.stringify(await seed({control, finance}))); }
  finally { await control.end(); if (finance) await finance.end(); }
}
