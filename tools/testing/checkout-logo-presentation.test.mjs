import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const binary=(path)=>readFileSync(new URL(path,import.meta.url));
test("merchant provider icons are separate transparent PNG assets",()=>{
 for(const provider of ["bkash","nagad","rocket"]){
  const data=binary("../../apps/web/public/payment-assets/"+provider+"-icon.png");
  assert.equal(data.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  assert.ok(data.length>300,"icon should contain real image data");
 }
});
test("checkout preview script compiles and uses icon-only marks",()=>{
 const source=read("../../apps/web/src/lib/checkout-preview.ts");
 const html=JSON.parse(source.slice(source.indexOf("=")+1).trim().replace(/;$/,""));
 const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js,"script missing");
 assert.doesNotThrow(()=>new Script(js));
 assert.ok(html.includes("payment-assets/${x}-icon.png"));
 assert.ok(html.includes("payment-assets/'+m+'-icon.png"));
 assert.ok(html.includes("data-logo-position"));
 assert.ok(html.includes('data-logo-invert'));
 assert.ok(!html.includes('"/payment-assets/${x}.png"'));
});
test("live theme and editor expose the same logo controls",()=>{
 const editor=read("../../apps/web/src/components/checkout-themes.tsx");
 const config=read("../../apps/web/src/lib/checkout-theme.ts");
 const live=read("../../apps/web/src/components/themed-checkout.tsx");
 const styles=read("../../apps/web/src/components/themed-checkout.css");
 for(const key of ["Logo size","Logo radius","Logo position","Invert logo"])assert.ok(editor.includes(key));
 for(const key of ["radius","position","invert"])assert.ok(config.includes(key));
 assert.ok(live.includes('data-logo-position={config.store.position}'));
 assert.ok(live.includes('data-logo-invert={config.theme==='));
 assert.ok(live.includes("-icon.png"));
 assert.ok(styles.includes("tk-mk.has-logo{background:transparent!important"));
 assert.ok(styles.includes('tk-night[data-logo-invert="true"]'));
 const store=read("../../apps/web/src/components/store-profile-editor.tsx");
 assert.ok(!store.includes("Brand color"));
 assert.ok(!store.includes("ব্র্যান্ড রং"));
});

test("checkout theme is delivered on initial authorized server render",()=>{
 const server=read("../../apps/web/src/components/dashboard-content.tsx");
 const client=read("../../apps/web/src/components/checkout-themes.tsx");
 assert.ok(server.includes("dashboard_checkout_theme_read("),"server must read current theme from DB");
 assert.ok(server.includes("Promise.all(["),"independent reads must run concurrently");
 assert.ok(server.includes("initialTheme={initialCheckoutTheme}"),"RSC must pass saved theme");
 assert.ok(client.includes("initialTheme?.body??defaultCheckoutTheme(storeName)"),"client must initialize from server data");
 assert.ok(client.includes("useState(!initialTheme)"),"saved configuration must not show loading state");
 assert.ok(client.includes("{loaded&&<div className=\"cols\">"),"never show default configuration before real settings load");
 assert.ok(client.includes("onClick={()=>void load()}"),"failed first read needs retry");
});
test("logo editor uses scoped controls with live values",()=>{
 const editor=read("../../apps/web/src/components/checkout-themes.tsx");
 const styles=read("../../apps/web/src/components/checkout-editor-reference.css");
 assert.ok(editor.includes("logo-brand-preview"));
 assert.ok(editor.includes("logo-slider"));
 assert.ok(editor.includes("logo-placement-options"));
 assert.ok(editor.includes('aria-pressed={config.store.position===id}'));
 assert.ok(styles.includes(".ref-checkout-editor .logo-editor"));
 assert.ok(styles.includes("--fill"));
});
