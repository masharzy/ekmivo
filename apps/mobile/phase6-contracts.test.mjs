import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(name)=>readFileSync(name,"utf8");

test("shared reference header and dynamic product navigation are used",()=>{
 const app=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/ui/EkmivoApp.kt");
 const settings=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/receipt/EkmivoSettings.kt");
 const home=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/receipt/LiveHome.kt");
 assert.match(app,/EkmivoReferenceHeader\(/);
 assert.match(app,/EkmivoReferenceBottomNav\(/);
 assert.doesNotMatch(app,/if\(tab==Tab\.SETTINGS\) Row/);
 assert.doesNotMatch(settings,/SettingsHeading[\s\S]{0,350}Text\("e\."/);
 assert.doesNotMatch(home,/item\{HomeHeader\(bn,state\)\}/);
});
test("live state badge overlaps the pulse ring, never duplicates the header",()=>{
 const home=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/receipt/LiveHome.kt");
 assert.match(home,/HeroStatusBadge\(bn,state,[\s\S]{0,110}align\(Alignment.TopEnd\)/);
 assert.match(home,/Forwarded\\nin history/);
 assert.match(home,/Text\(if\(bn\)"সংরক্ষিত SMS\\nপাঠানো"/);
 assert.match(home,/EkmivoPulseRing\(/);
});
test("inbox is capability-gated with signed backend requests",()=>{
 const domain=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/inbox/InboxDomain.kt");
 const app=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/ui/EkmivoApp.kt");
 const manifest=read("apps/mobile/app/src/main/AndroidManifest.xml");
 const fcm=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/inbox/InboxPush.kt");
 assert.match(domain,/interface InboxRepository/);
 assert.match(domain,/interface InboxRepository/);
 assert.match(domain,/data class InboxMessage/);
 assert.match(app,/workspacePages\(ai,payments\)/);
 const navigation=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/ui/WorkspaceNavigation.kt");
 assert.match(navigation,/if\(ai\)add\(EkmivoReferencePage\.INBOX\)/);
 const route=read("apps/mobile/app/src/main/java/com/ekmivo/mobile/inbox/InboxRoute.kt");
 assert.match(route,/ReceiptTransport\.post\(context,"inbox"/);
 assert.match(manifest,/InboxFirebaseService/);
 assert.match(fcm,/override fun onNewToken/);
 assert.match(fcm,/currentPhone\(context\)/);
 assert.match(fcm,/FirebaseApp.getApps\(app\)\.isEmpty\(\)/);
});
