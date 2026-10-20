import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pairingPayload,pairingSvg} from "../../apps/web/src/lib/pairing-qr.mjs";

test("physical phone code: 8 characters, QR and copy identical",()=>{
 const code="ABCDEFGH";
 assert.equal(pairingPayload(code),"ekmivo://pair?token=ABCDEFGH");
 assert.match(pairingSvg(code),/<svg/);
 for(const invalid of ["A".repeat(43),"ABCD-123","O2345678","A".repeat(7)]){
  assert.throws(()=>pairingPayload(invalid),/INVALID_PAIRING_CODE/);
 }
});
test("web modal visually renders eight cells and copy button",()=>{
 const web=readFileSync("apps/web/src/components/sms-devices.tsx","utf8");
 assert.match(web,/repeat\(8,minmax\(0,1fr\)\)/);
 assert.match(web,/token\.split\(""\)\.map/);
 assert.match(web,/navigator\.clipboard\.writeText\(token\)/);
 assert.match(web,/ABCDEFGHJKLMNPQRSTUVWXYZ23456789/);
});
test("one-time claim, 5 minute expiration, digest remain in database",()=>{
 const sql=readFileSync("infra/migrations/0045_pg06_physical_phone_multi_account.sql","utf8");
 assert.match(sql,/now\(\)\+interval '5 minutes'/);
 assert.match(sql,/pair_expires_at>now\(\)/);
 assert.match(sql,/pair_digest=NULL,pair_expires_at=NULL/);
 const handler=readFileSync("backend/internal/checkout/physical_devices.go","utf8");
 assert.match(handler,/randomPhysicalPairingCode\(\)/);
 assert.match(handler,/digest\(token\)/);
});
test("Android eight-cell input never consumes before consent",()=>{
 const flow=readFileSync("apps/mobile/app/src/main/java/com/ekmivo/mobile/receipt/PairingFlow.kt","utf8");
 assert.match(flow,/repeat\(PairingToken\.LENGTH\)/);
 assert.match(flow,/R\.string\.pair_verify_code/);
 assert.match(flow,/PairingToken\.parse\(input\)/);
 assert.match(flow,/"pairing-preview"/);
 assert.doesNotMatch(flow,/entered\.length == PairingToken\.LENGTH/);
 assert.match(flow,/page=PairPage\.CONFIRM/);
 assert.match(flow,/PairTokenEntry\(/);
 const token=readFileSync("apps/mobile/app/src/main/java/com/ekmivo/mobile/receipt/PairingToken.kt","utf8");
 assert.match(token,/const val LENGTH = 8/);
});
