import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=(path)=>readFileSync(path,"utf8");

test("web phone status thresholds respect background heartbeat fallback",()=>{
 const src=file("apps/web/src/components/sms-devices.tsx");
 assert.match(src,/elapsed>=2700000\)return "offline"/);
 assert.match(src,/elapsed>=1200000\?"delayed":"online"/);
 assert.match(src,/if\(!p\.permission_ok\)return "permission"/);
});
test("foreground notification is accompanied by a signed heartbeat loop",()=>{
 const service=file("apps/mobile/app/src/main/java/com/briofold/mobile/receipt/ReceiptForwardingService.kt");
 const heartbeat=file("apps/mobile/app/src/main/java/com/briofold/mobile/receipt/DeviceHeartbeat.kt");
 assert.match(service,/while\(isActive\)/);
 assert.match(service,/DeviceHeartbeat\.check\(applicationContext\)/);
 assert.match(service,/heartbeatScope\.cancel\(\)/);
 assert.match(heartbeat,/INTERVAL_MS = 120_000L/);
 assert.match(heartbeat,/ReceiptTransport\.post\(app,envelope\.first,envelope\.second/);
 assert.match(heartbeat,/phone-heartbeat/);
 assert.match(heartbeat,/last_success/);
});
test("active UI checks authorization so server revoke is visible without app restart",()=>{
 const app=file("apps/mobile/app/src/main/java/com/briofold/mobile/ui/BriofoldApp.kt");
 assert.match(app,/repeatOnLifecycle\(Lifecycle\.State\.STARTED\)/);
 assert.match(app,/DeviceHeartbeat\.check\(appContext\)/);
 assert.match(app,/ConnectionState\.Revoked/);
});
test("phase 4 empty local forwarded history shows numeric zero",()=>{
 const home=file("apps/mobile/app/src/main/java/com/briofold/mobile/receipt/LiveHome.kt");
 assert.match(home,/current\.acknowledged==0 && !current\.unavailable\)"0"/);
});
test("settings uses real health, local disconnect queue guard, and safe diagnostics",()=>{
 const settings=file("apps/mobile/app/src/main/java/com/briofold/mobile/receipt/BriofoldSettings.kt");
 const diagnostics=file("apps/mobile/app/src/main/java/com/briofold/mobile/receipt/BriofoldDiagnostics.kt");
 const store=file("apps/mobile/app/src/main/java/com/briofold/mobile/receipt/ReceiptStore.kt");
 assert.match(settings,/SetupHealth\(app\)\.refresh\(\)/);
 assert.match(settings,/DeviceHeartbeat\.lastSuccess\(app\)/);
 assert.match(settings,/store\.disconnect|it\.disconnect\(\)/);
 assert.match(store,/PENDING_RECEIPTS_BLOCK_DISCONNECT/);
 assert.match(diagnostics,/ReceiptInboxRecovery\.recover/);
 assert.match(diagnostics,/No SMS text, payer number/);
 assert.match(diagnostics,/DeviceHeartbeat\.check\(context\)/);
});
