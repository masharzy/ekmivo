#!/usr/bin/env node
// Phase 2: idempotent AI-commerce SANDBOX seed. Every record is TEST-prefixed and lives in environment='sandbox'.
//
//   SEED_CONTROL_URL=...            control DB of a disposable test branch
//   SEED_FINANCE_SANDBOX_URL=...    sandbox financial realm DB of the same test setup (optional; SMS + payments)
//   SEED_OWNER_EMAIL=...            an existing app_users email in that branch
//   SEED_PAYER_SECRET=...           same value as the API's PG05_PAYER_SECRET (TrxID/sender digests must match)
//   SEED_PIPELINE_KEY_HEX=...       same value as the API's PG06_ENCRYPTION_KEY_HEX (encrypts the receiving number)
//   Remote databases additionally need SEED_ALLOW_REMOTE_SANDBOX=1, SEED_ALLOWED_HOST=<exact host> and a marker table
//   created by hand on the test branch ONLY:  CREATE TABLE briofold_test_branch(singleton boolean PRIMARY KEY DEFAULT true);
//
// Re-running updates the same rows (deterministic ids/references); it never duplicates.
import {createCipheriv, createHash, createHmac, randomBytes} from "node:crypto";
import {createRequire} from "node:module";

export const ENV = "sandbox";
const NS = "TEST-";

// Synchronous URL check. Remote hosts must be named exactly; production-looking database names are refused.
export function assertSafeTarget(raw, label, {allowRemote = process.env.SEED_ALLOW_REMOTE_SANDBOX === "1", allowedHost = process.env.SEED_ALLOWED_HOST || ""} = {}) {
  if (!raw) throw new Error(`${label}: URL missing`);
  const u = new URL(raw);
  if (/prod|live/i.test(u.pathname) && !/sandbox|test/i.test(u.pathname))
    throw new Error(`${label}: refuses a database whose name looks like live/production`);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (!local) {
    if (!allowRemote) throw new Error(`${label}: remote host refused; set SEED_ALLOW_REMOTE_SANDBOX=1 only for a test branch`);
    if (!allowedHost || allowedHost !== u.hostname) throw new Error(`${label}: remote host must equal SEED_ALLOWED_HOST exactly`);
  }
  return {url: u, remote: !local};
}

// Database check before any write: a remote target must carry the hand-made test-branch marker.
export async function assertTestMarker(db, label) {
  const [r] = await db`SELECT to_regclass('public.briofold_test_branch') IS NOT NULL AS ok`;
  if (!r?.ok) throw new Error(`${label}: marker table briofold_test_branch missing; this is not a prepared test branch`);
}

// Deterministic uuid so a second run hits the same rows.
export const id = (...p) => {
  const h = createHash("sha256").update(NS + p.join("|")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

// Same digests as backend deviceevidence.Identity: hex(HMAC-SHA256(PG05_PAYER_SECRET, value)).
export const identity = (key, value) => createHmac("sha256", key).update(value).digest("hex");
export const normalizeNumber = n => { let s = String(n).replace(/[ ()-]/g, ""); if (s.startsWith("01")) s = "+88" + s; if (s.startsWith("880")) s = "+" + s; return s; };
export const referenceDigest = (key, method, ref) => identity(key, `receipt|${method}|${ref}`);
export const payerDigest = (key, number) => identity(key, normalizeNumber(number));

// Same envelope as backend merchantwebhook.Decrypt: nonce(12) || ciphertext || tag, AAD "<workspace>|<realm>".
export function encryptNumber(keyHex, workspace, realm, number) {
  const nonce = randomBytes(12), c = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), nonce);
  c.setAAD(Buffer.from(`${workspace}|${realm}`));
  return Buffer.concat([nonce, c.update(number, "utf8"), c.final(), c.getAuthTag()]);
}

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
      const p = {
        external_id: `${NS}P-${cat}-${n}`, name: `${NS}${base} ${n}`, description: `${base} model ${n}`,
        category: cat, tags: [cat], search_aliases: [cat, ...alias], ai_notes: "",
        variants: sizes.map((s, i) => ({
          sku: `${NS}${cat}-${n}-${s}`, price_minor: price + n * 5000,
          stock: (k + i) % 5 === 0 ? 0 : 3 + ((k + i) % 7), // some variants out of stock on purpose
          options: {size: s},
        })),
      };
      if (n % 2) p.min_price_minor = Math.round(price * 0.9);
      out.push(p);
    }
  });
  return out; // 20 products, 2-4 variants each
}

// Fake SMS receipts. Amounts are paisa. TESTUSED001 is already allocated to a checkout payment.
export const SMS = [
  {ref: "TESTTRX0001", payer: "01711111111", amount: 350000},
  {ref: "TESTTRX0002", payer: "01722222222", amount: 350000},
  {ref: "TESTTRX0003", payer: "01711111111", amount: 5000},
  {ref: "TESTUSED001", payer: "01733333333", amount: 350000, allocated: true},
  {ref: "TESTPAID001", payer: "01711111111", amount: 0, order: 0},
  {ref: "TESTPAID002", payer: "01711111111", amount: 0, order: 1},
];

async function ensureWorkspace(db, owner, name, mode) {
  const wid = id("workspace", name);
  await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${wid},${name},${mode},${owner}) ON CONFLICT(id) DO NOTHING`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${wid},${owner},'owner') ON CONFLICT DO NOTHING`;
  return wid;
}

export async function seed({control, finance, remote = {}}) {
  const email = process.env.SEED_OWNER_EMAIL;
  if (!email) throw new Error("SEED_OWNER_EMAIL required (an existing user in the test DB)");
  if (remote.control) await assertTestMarker(control, "control");
  if (finance && remote.finance) await assertTestMarker(finance, "finance");
  const payerKey = process.env.SEED_PAYER_SECRET, pipelineKey = process.env.SEED_PIPELINE_KEY_HEX;
  if (finance && (!payerKey || payerKey.length < 32 || !/^[0-9a-f]{64}$/i.test(pipelineKey || "")))
    throw new Error("SEED_PAYER_SECRET (>=32 chars) and SEED_PIPELINE_KEY_HEX (64 hex) must equal the API's PG05_PAYER_SECRET / PG06_ENCRYPTION_KEY_HEX");
  const owner = (await control`SELECT id FROM app_users WHERE lower(email)=lower(${email})`)[0]?.id;
  if (!owner) throw new Error("owner user not found in app_users");
  const report = {};
  const wsBoth = await ensureWorkspace(control, owner, `${NS}Both mode shop`, "both");
  const wsAi = await ensureWorkspace(control, owner, `${NS}AI-only shop`, "ai");
  report.workspaces = [wsBoth, wsAi];

  for (const w of [wsBoth, wsAi]) {
    await control`INSERT INTO commerce_warehouses(id,workspace_id,environment,name) VALUES(${id("wh", w)},${w},${ENV},${NS + "Main"}) ON CONFLICT DO NOTHING`;
    for (const p of products()) {
      await control`SELECT commerce_catalog_write(${w},${ENV},${owner},${id("key", w, p.external_id)},${control.json(p)})`;
    }
    const cp = [
      ["TEST-VALID10", "percent", 10, "now() - interval '1 day'", "now() + interval '30 days'"],
      ["TEST-EXPIRED", "fixed", 20000, "now() - interval '40 days'", "now() - interval '10 days'"],
      ["TEST-ONCE", "fixed", 10000, "now() - interval '1 day'", "now() + interval '30 days'"],
    ];
    for (const [code, kind, value, s, e] of cp) {
      await control.unsafe(
        `INSERT INTO commerce_coupons(id,workspace_id,environment,code,kind,value,usage_limit,per_customer_limit,starts_at,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,100,1,${s},${e}) ON CONFLICT(workspace_id,environment,code) DO NOTHING`,
        [id("coupon", w, code), w, ENV, code, kind, value]);
    }
  }

  // inbox_ingest auto-creates and links a customer for the thread; rename that one (no second customer).
  const conn = (await control`SELECT inbox_connection(${wsBoth},${ENV},'ms',${NS + "messenger-" + wsBoth},decode('abcd','hex')) AS id`)[0].id;
  await control`SELECT inbox_ingest(${conn},${id("msg", "hello")},'test-psid-sarkio','Sarkio Test','TEST hello','text',now())`;
  const thread = (await control`SELECT id FROM inbox_threads WHERE connection_id=${conn} AND external_id='test-psid-sarkio'`)[0]?.id;
  if (!thread) throw new Error("test thread was not created");
  const cust = (await control`SELECT customer_id AS id FROM briofold_customer_sources WHERE workspace_id=${wsBoth} AND environment=${ENV} AND kind='thread' AND source_id=${thread}`)[0]?.id;
  if (!cust) throw new Error("thread has no linked customer");
  await control`UPDATE briofold_customers SET name='Sarkio Test',phone='01700000001' WHERE id=${cust}`;

  // 6 orders: delivered x3 (2 verified bKash, 1 COD), cancelled, returned (COD), awaiting payment with an unverified claim.
  const wh = id("wh", wsBoth);
  const variants = await control`SELECT v.id,v.sku,v.price_minor FROM commerce_variants v WHERE v.workspace_id=${wsBoth} AND v.environment=${ENV} AND v.sku LIKE ${NS + "%"} ORDER BY v.sku LIMIT 6`;
  const plan = [["delivered", "verified"], ["delivered", "verified"], ["delivered", "cod"], ["cancelled", "none"], ["returned", "cod"], ["hold", "claimed"]];
  const orders = [];
  for (let i = 0; i < plan.length; i++) {
    const v = variants[i]; if (!v) continue;
    const oid = id("order", i), total = Number(v.price_minor) + 7000, [status, pay] = plan[i];
    await control`INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,source_id,customer_id,warehouse_id,status,recipient,subtotal_minor,shipping_minor,total_minor,created_by)
      VALUES(${oid},${wsBoth},${ENV},${NS + "ORD-" + (i + 1)},'ai',${thread},${cust},${wh},${status},${control.json({name: "Sarkio Test", city: "Dhaka", address: "TEST Road 1"})},${v.price_minor},7000,${total},${owner}) ON CONFLICT(id) DO NOTHING`;
    await control`INSERT INTO commerce_lines(workspace_id,environment,order_id,variant_id,name,sku,options,unit_minor,quantity)
      VALUES(${wsBoth},${ENV},${oid},${v.id},${v.sku},${v.sku},'{}'::jsonb,${v.price_minor},1) ON CONFLICT(order_id,variant_id) DO NOTHING`;
    const claimed = pay === "claimed" ? {method: "bkash", last4: "IM01", amount_minor: total} : pay === "verified" ? {method: "bkash", last4: `D00${i + 1}`, amount_minor: total} : {};
    await control`UPDATE commerce_orders SET payment_state=${pay},claimed_payment=${control.json(claimed)} WHERE id=${oid}`;
    orders.push({oid, total, pay});
  }
  report.orders = orders.length;

  // AI selling settings (receiving account filled in below when the financial realm is available).
  const settings = {cod_enabled: true, cod_charge_minor: 0, delivery_dhaka_minor: 7000, delivery_outside_minor: 13000, max_discount_pct: 5, negotiation_enabled: true};
  for (const w of [wsBoth, wsAi]) await control`SELECT briofold_ai_selling_write(${w},${ENV},${owner},${control.json(settings)})`;

  if (finance) {
    const proj = (await control`SELECT source_version FROM resolve_financial_projection(${wsBoth},${ENV})`)[0];
    if (proj) await finance`SELECT financial_sync_workspace(${wsBoth},${ENV},${Number(proj.source_version)},true)`;
    const accountIdentity = identity(payerKey, "TEST-receiving|" + wsBoth);
    let acct = (await finance`SELECT id FROM financial_receiving_accounts WHERE workspace_id=${wsBoth} AND environment=${ENV} AND identity_hmac=${accountIdentity}`)[0];
    if (!acct) {
      acct = (await finance`INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix) VALUES(${wsBoth},${ENV},'bkash',${accountIdentity},'0000') RETURNING id`)[0];
      await finance`INSERT INTO pg06_account_configuration(workspace_id,environment,account_id,number_cipher) VALUES(${wsBoth},${ENV},${acct.id},${encryptNumber(pipelineKey, wsBoth, ENV, "01700000000")})`;
    }
    await control`SELECT briofold_ai_selling_write(${wsBoth},${ENV},${owner},${control.json({receiving_account_ids: [acct.id]})})`;

    for (const s of SMS) {
      const amount = s.order !== undefined ? orders[s.order].total : s.amount;
      const rh = referenceDigest(payerKey, "bkash", s.ref), ph = payerDigest(payerKey, s.payer);
      let obs = (await finance`SELECT id FROM financial_receipt_observations WHERE workspace_id=${wsBoth} AND environment=${ENV} AND provider_reference_hmac=${rh}`)[0];
      if (!obs) {
        const ev = (await finance`INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,event_digest,original_source_at,encrypted_evidence)
          VALUES(${wsBoth},${ENV},'device_sms',${NS + "evt-" + s.ref},${identity(payerKey, "evt|" + s.ref)},now(),${Buffer.alloc(48, 55)}) RETURNING id`)[0];
        obs = (await finance`INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,receiving_account_id,provider_reference_hmac,payer_hmac,amount_minor,method,direction,original_transaction_at,time_precision,parser_version)
          VALUES(${wsBoth},${ENV},${ev.id},${acct.id},${rh},${ph},${amount},'bkash','incoming',now(),'second',1) RETURNING id`)[0];
      }
      if (s.allocated && !(await finance`SELECT 1 FROM financial_payments WHERE observation_id=${obs.id}`).length) {
        const [intent] = await finance`INSERT INTO payment_intents(workspace_id,environment,merchant_reference,amount_minor,expires_at) VALUES(${wsBoth},${ENV},${NS + "INTENT-" + s.ref},${amount},now()+interval '30 minutes') RETURNING id`;
        const [attempt] = await finance`INSERT INTO payment_attempts(workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,amount_minor,method,window_start,window_end,policy_version)
          VALUES(${wsBoth},${ENV},${intent.id},${acct.id},${ph},'3333',${amount},'bkash',now()-interval '5 minutes',now()+interval '20 minutes',1) RETURNING id`;
        const [payment] = await finance`INSERT INTO financial_payments(workspace_id,environment,attempt_id,observation_id,verified_amount_minor,verification_method,policy_version) VALUES(${wsBoth},${ENV},${attempt.id},${obs.id},${amount},'sms_match',1) RETURNING id`;
        await finance`INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor) VALUES(${wsBoth},${ENV},${payment.id},${intent.id},${amount})`;
      }
      // The two verified seed orders own their receipts on the control side too, so they cannot be claimed again.
      if (s.order !== undefined) {
        await control`INSERT INTO commerce_payment_claims(id,workspace_id,environment,order_id,thread_id,method,transaction_digest,transaction_last4,payer_digest,payer_last3,claimed_amount_minor,state,receiving_account_id,resolved_at)
          VALUES(${id("claim", s.ref)},${wsBoth},${ENV},${orders[s.order].oid},${thread},'bkash',${rh},${s.ref.slice(-4)},${ph},${normalizeNumber(s.payer).slice(-3)},${amount},'verified',${acct.id},now())
          ON CONFLICT(workspace_id,environment,transaction_digest) DO NOTHING`;
      }
    }
    // The awaiting order's claim is unverified and sits in the owner review queue (no SMS exists for it).
    const awaiting = orders.find(o => o.pay === "claimed");
    if (awaiting) {
      await control`INSERT INTO commerce_payment_claims(id,workspace_id,environment,order_id,thread_id,method,transaction_digest,transaction_last4,payer_digest,payer_last3,claimed_amount_minor,state,reason,resolved_at)
        VALUES(${id("claim", "unverified")},${wsBoth},${ENV},${awaiting.oid},${thread},'bkash',${referenceDigest(payerKey, "bkash", "TESTCLAIM01")},'IM01',${payerDigest(payerKey, "01744444444")},'444',${awaiting.total},'review','seeded_unverified',now())
        ON CONFLICT(workspace_id,environment,transaction_digest) DO NOTHING`;
    }
    report.sms = SMS.length;
    report.receiving_account = acct.id;
  }
  return report;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const c = assertSafeTarget(process.env.SEED_CONTROL_URL, "control");
  const f = process.env.SEED_FINANCE_SANDBOX_URL ? assertSafeTarget(process.env.SEED_FINANCE_SANDBOX_URL, "finance") : null;
  const postgres = createRequire(new URL("../../apps/web/package.json", import.meta.url))("postgres");
  const control = postgres(process.env.SEED_CONTROL_URL, {max: 1, prepare: false});
  const finance = f ? postgres(process.env.SEED_FINANCE_SANDBOX_URL, {max: 1, prepare: false}) : null;
  try { console.log(JSON.stringify(await seed({control, finance, remote: {control: c.remote, finance: f?.remote}}))); }
  finally { await control.end(); if (finance) await finance.end(); }
}
