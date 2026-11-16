import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {serviceStatusFromGo,fallbackServiceStatus,overallState,SERVICE_KEYS} from "../src/lib/service-status.ts";

const file=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");

test("Go service status maps every service and never invents a state",()=>{
 const s=serviceStatusFromGo({services:{payments:"operational",sms:"degraded",ai:"down",chat:"weird",webhooks:"unknown"}},"2026-11-16T05:00:00Z");
 assert.deepEqual(s.services,{web:"operational",payments:"operational",sms:"degraded",ai:"down",chat:"unknown",webhooks:"unknown"});
 assert.equal(s.payment_service,"operational");
 assert.equal(s.release_verified,false);
 assert.equal(serviceStatusFromGo(null,"x"),null);
 assert.equal(serviceStatusFromGo({services:[]},"x"),null);
 assert.deepEqual(Object.keys(s.services).sort(),[...SERVICE_KEYS].sort());
});

test("flag off keeps the old payment readiness and marks the rest unknown",()=>{
 const s=fallbackServiceStatus("unavailable","t");
 assert.equal(s.services.payments,"down");
 assert.equal(s.payment_service,"unavailable");
 for(const k of ["sms","ai","chat","webhooks"])assert.equal(s.services[k],"unknown");
 assert.equal(fallbackServiceStatus("operational","t").services.payments,"operational");
});

test("overall summary: a problem wins, all up is ok, otherwise unknown",()=>{
 const up=Object.fromEntries(SERVICE_KEYS.map(k=>[k,"operational"]));
 assert.equal(overallState(up),"ok");
 assert.equal(overallState({...up,ai:"degraded",chat:"unknown"}),"issue");
 assert.equal(overallState({...up,sms:"unknown"}),"unknown");
});

test("status page uses the shared public chrome once, in bn and en",()=>{
 const page=file("app/[locale]/status/page.tsx");
 assert.ok(!page.includes("SiteHeader")&&!page.includes("SiteFooter"),"layout already renders header and footer");
 assert.ok(page.includes("সেবার অবস্থা")&&page.includes("Service status"));
 assert.ok(!page.includes("কেমন চলছে")&&!page.includes("every service in one place"),"plain copy, no filler");
 const ui=file("components/service-status.tsx");
 for(const key of ["web","payments","sms","ai","chat","webhooks"])assert.ok(ui.includes(`${key}:[`),key);
 assert.ok(file("components/site-footer.tsx").includes('"/status"'));
 assert.ok(file("app/globals.css").includes('@import "./public-status-recovery.css";'));
});

test("status and recovery styles use only semantic theme tokens",()=>{
 const css=file("app/public-status-recovery.css");
 assert.ok(css.includes(".bf-pub :where(a){color:inherit")&&!/\.bf-pub a\{/.test(css),"link reset must not beat .bf-btn colours (invisible button text)");
 const hexes=[...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m=>m[0].toLowerCase());
 assert.deepEqual([...new Set(hexes)].sort(),["#04200e","#a3f56a55","#fff","#ffffff22"].sort(),"new hard-coded colours must come from tokens");
});

test("recovery keeps the server actions, 12-character rule and does not reveal accounts",()=>{
 const form=file("components/recovery-form.tsx");
 assert.ok(form.includes("requestPasswordResetAction")&&form.includes("completePasswordResetAction"));
 assert.equal((form.match(/minLength=\{12\}/g)||[]).length,1,"one shared password field component");
 assert.ok(form.includes('autoComplete="one-time-code"')&&form.includes('pattern="[0-9]{6}"'));
 assert.ok(form.includes("aria-pressed={show}"),"show/hide password is a real toggle button");
 assert.ok(file("actions/recovery.ts").includes("Same response for unknown accounts"));
});
