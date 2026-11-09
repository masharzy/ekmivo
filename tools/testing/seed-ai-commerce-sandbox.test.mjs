import assert from "node:assert/strict";
import {createDecipheriv, createHmac} from "node:crypto";
import {assertSafeTarget, assertTestMarker, encryptNumber, id, normalizeNumber, payerDigest, products, referenceDigest} from "./seed-ai-commerce-sandbox.mjs";

// URL guard
assert.throws(() => assertSafeTarget("postgres://u@db.neon.tech/ekmivo_live", "c", {allowRemote: true, allowedHost: "db.neon.tech"}), /live\/production/);
assert.throws(() => assertSafeTarget("postgres://u@db.neon.tech/ekmivo", "c", {allowRemote: false}), /remote/);
assert.throws(() => assertSafeTarget("postgres://u@db.neon.tech/ekmivo", "c", {allowRemote: true, allowedHost: ""}), /SEED_ALLOWED_HOST/);
assert.throws(() => assertSafeTarget("postgres://u@prod.neon.tech/ekmivo", "c", {allowRemote: true, allowedHost: "test.neon.tech"}), /SEED_ALLOWED_HOST/);
assert.throws(() => assertSafeTarget("postgres://u@localhost/ekmivo_prod", "c"), /production/);
assert.equal(assertSafeTarget("postgres://u@localhost/ekmivo_sandbox", "c").remote, false);
assert.equal(assertSafeTarget("postgres://u@test.neon.tech/ekmivo", "c", {allowRemote: true, allowedHost: "test.neon.tech"}).remote, true);
// Marker guard
const fakeDb = ok => async () => [{ok}];
await assert.rejects(() => assertTestMarker(fakeDb(false), "c"), /marker/);
await assertTestMarker(fakeDb(true), "c");

// Deterministic ids, catalog shape
assert.equal(id("a", 1), id("a", 1));
assert.notEqual(id("a", 1), id("a", 2));
assert.match(id("x"), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
const p = products();
assert.equal(p.length, 20);
assert.ok(p.every(x => x.name.startsWith("TEST-") && x.variants.length >= 2 && x.variants.length <= 4));
assert.ok(p.some(x => x.variants.some(v => v.stock === 0)) && p.some(x => x.min_price_minor));
assert.ok(p.every(x => x.min_price_minor === undefined || Number.isInteger(x.min_price_minor)), "no null min_price");
assert.equal(new Set(p.map(x => x.external_id)).size, 20);

// Digests match backend deviceevidence.Identity / NormalizeNumber
const key = "k".repeat(32);
assert.equal(normalizeNumber("017-1111 1111"), "+8801711111111");
assert.equal(referenceDigest(key, "bkash", "TESTTRX0001"), createHmac("sha256", key).update("receipt|bkash|TESTTRX0001").digest("hex"));
assert.equal(payerDigest(key, "01711111111"), createHmac("sha256", key).update("+8801711111111").digest("hex"));
// Receiving number envelope matches merchantwebhook.Decrypt (nonce || ct || tag, AAD workspace|realm)
const hex = "11".repeat(32), env = encryptNumber(hex, "w", "sandbox", "01700000000");
const d = createDecipheriv("aes-256-gcm", Buffer.from(hex, "hex"), env.subarray(0, 12));
d.setAAD(Buffer.from("w|sandbox")); d.setAuthTag(env.subarray(env.length - 16));
assert.equal(Buffer.concat([d.update(env.subarray(12, env.length - 16)), d.final()]).toString(), "01700000000");
console.log("seed safety tests ok");
