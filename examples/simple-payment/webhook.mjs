// Node.js 22+; npm install postgres
// Set DATABASE_URL, BRIOFOLD_API_ORIGIN, BRIOFOLD_API_KEY,
// BRIOFOLD_WEBHOOK_SECRET (Dashboard → API Keys → automatic webhook signing; one secret per workspace and environment).
// Your order-creation code stores the returned invoice_id against its order.
// PostgreSQL schema (run once in YOUR merchant database):
// CREATE TABLE orders(id text PRIMARY KEY, invoice_id uuid UNIQUE NOT NULL,
//   amount_minor bigint NOT NULL, currency text NOT NULL DEFAULT 'BDT',
//   status text NOT NULL DEFAULT 'pending');
// CREATE TABLE briofold_events(id uuid PRIMARY KEY, received_at timestamptz DEFAULT now());
// CREATE TABLE fulfilment_outbox(order_id text PRIMARY KEY REFERENCES orders(id),
//   created_at timestamptz DEFAULT now());
import {createServer} from "node:http";
import {createHmac, timingSafeEqual} from "node:crypto";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, {max: 4});
const api = new URL(process.env.BRIOFOLD_API_ORIGIN);
if (api.protocol !== "https:") throw new Error("HTTPS API origin required");
const apiKey = process.env.BRIOFOLD_API_KEY;
const secret = process.env.BRIOFOLD_WEBHOOK_SECRET;
if (!apiKey || !secret) throw new Error("Server credentials missing");

async function confirmOrder(invoiceId, eventId) {
  const response = await fetch(new URL("/v1/payment/verify", api), {
    method: "POST", headers: {Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json"},
    body: JSON.stringify({invoice_id: invoiceId}),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("Verify API unavailable");
  const payment = await response.json();
  if (payment.invoice_id !== invoiceId || payment.status !== "COMPLETED")
    throw new Error("Payment is not completed; retry later");
  await sql.begin(async tx => {
    const [order] = await tx`SELECT * FROM orders
      WHERE invoice_id=${invoiceId}::uuid FOR UPDATE`;
    if (!order || String(order.amount_minor) !== String(payment.amount_minor) ||
        order.currency !== payment.currency) throw new Error("Order mismatch");
    if (eventId) await tx`INSERT INTO briofold_events(id) VALUES(${eventId}::uuid)
      ON CONFLICT DO NOTHING`;
    if (order.status === "paid") return;
    if (order.status !== "pending") throw new Error("Order needs review");
    await tx`UPDATE orders SET status='paid' WHERE id=${order.id}`;
    // An idempotent worker fulfils/enrols from this durable outbox. Do not
    // perform an external side effect inside a retryable DB transaction.
    await tx`INSERT INTO fulfilment_outbox(order_id) VALUES(${order.id})
      ON CONFLICT DO NOTHING`;
  });
}
// For a redirect-only integration, call confirmOrder(storedInvoiceId) from
// your authenticated return handler. Ignore browser-supplied payment status.

createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/briofold/webhook") {
    res.writeHead(404).end(); return;
  }
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) {res.writeHead(413).end(); return;}
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);
    const timestamp = String((req.headers["x-briofold-timestamp"] || req.headers["x-ekmivo-timestamp"]) || "");
    const signature = String((req.headers["x-briofold-signature"] || req.headers["x-ekmivo-signature"]) || "");
    const expected = createHmac("sha256", secret)
      .update(timestamp + ".").update(raw).digest();
    const fresh = /^[0-9]+$/.test(timestamp) &&
      Math.abs(Date.now()/1000 - Number(timestamp)) <= 300;
    if (!fresh || !/^v1=[a-f0-9]{64}$/.test(signature) ||
        !timingSafeEqual(expected, Buffer.from(signature.slice(3), "hex"))) {
      res.writeHead(401).end(); return;
    }
    const event = JSON.parse(raw.toString("utf8"));
    if (event.id !== (req.headers["x-briofold-event-id"] || req.headers["x-ekmivo-event-id"]) ||
        !/^[a-f0-9-]{36}$/i.test(event.id || "")) {
      res.writeHead(400).end(); return;
    }
    if (event.type !== "payment.verified") {res.writeHead(200).end(); return;}
    // payment.verified carries the payment request id as data.payment_intent_id (the same id create returns as invoice_id).
    const invoiceId = event.data?.payment_intent_id;
    if (!/^[a-f0-9-]{36}$/i.test(invoiceId || "")) {
      res.writeHead(400).end(); return;
    }
    await confirmOrder(invoiceId, event.id);
    res.writeHead(200).end("ok");
  } catch {
    // Non-2xx keeps delivery retryable. Never log request bodies or credentials.
    res.writeHead(503).end("retry later");
  }
}).listen(Number(process.env.PORT || 3000));
