import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");

test("header is below status bar on both tabs",()=>{
 const header=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/ui/EkmivoBrandHeader.kt");
 const app=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/ui/EkmivoApp.kt");
 assert.match(header,/fillMaxWidth\(\)\.statusBarsPadding\(\)/);
 assert.match(app,/topBar=\{\s*EkmivoBrandHeader/);
});
test("phone disconnect signs a server revoke before local key deletion",()=>{
 const settings=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/receipt/EkmivoSettings.kt");
 const go=read("backend/internal/checkout/physical_devices.go");
 const router=read("backend/internal/checkout/receipt_pipeline.go");
 const migration=read("infra/migrations/0083_phone_self_revoke.sql");
 const signature=settings.indexOf('ReceiptTransport.post(app,"phone-disconnect"');
 const remove=settings.indexOf('if(store.disconnect())');
 assert.ok(signature>0&&remove>signature);
 assert.match(settings,/if\(store\.count\(\)>0 \|\| stage>0\)/);
 assert.match(go,/VerifyP256DER/);
 assert.ok(go.indexOf('r.PathValue("action")=="phone-disconnect"')>go.indexOf("VerifyP256DER"));
 assert.match(router,/r.PathValue\("action"\) == "phone-disconnect"/);
 assert.match(migration,/UPDATE pg06_phones[\s\S]*revoked_at=now\(\)/);
 assert.match(migration,/UPDATE pg06_devices[\s\S]*revoked_at=now\(\)/);
});
test("foreground checks revocation without restarting app",()=>{
 const app=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/ui/EkmivoApp.kt");
 assert.match(app,/repeatOnLifecycle\(Lifecycle.State.STARTED\)/);
 assert.match(app,/if\(paired\) DeviceHeartbeat.check\(appContext\)/);
 assert.match(app,/delay\(12_000L\)/);
});
test("dashboard keeps revoked phone and offers new QR with a fresh token",()=>{
 const web=read("apps/web/src/components/sms-devices.tsx");
 assert.match(web,/visiblePhones=phones/);
 assert.match(web,/Generate new pairing QR/);
 assert.match(web,/setName\(current.name\);setSelected\(null\);setCreateOpen\(true\)/);
 assert.match(web,/\/revoke/);
});
test("APK updates require an authenticated release feed, digest and standard installer",()=>{
 const backend=read("backend/cmd/api/mobile_release.go");
 const app=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/update/AppUpdateService.kt");
 const manifest=read("apps/mobile/app/src/main/AndroidManifest.xml");
 assert.match(backend,/EKMIVO_ANDROID_APK_SHA256/);
 assert.match(app,/MessageDigest.getInstance\("SHA-256"\)/);
 assert.match(app,/UPDATE_PACKAGE_MISMATCH/);
 assert.match(app,/Intent.ACTION_VIEW/);
 assert.match(app,/canRequestPackageInstalls/);
 assert.match(manifest,/FileProvider/);
 assert.match(manifest,/REQUEST_INSTALL_PACKAGES/);
});
