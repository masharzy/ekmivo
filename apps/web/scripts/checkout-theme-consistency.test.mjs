import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=p=>readFileSync(new URL("../src/"+p,import.meta.url),"utf8");
test("payment link page renders the Official (gateway) theme, not a generic one",()=>{
 const page=src("components/public-document.tsx");
 assert.match(page,/theme\.theme==='gateway'&&!\(doc\.body\.fields\?\.length\)\)\{/);
 assert.match(page,/return <GatewayCheckout config=\{theme\}/);
});
test("no Classic shell while loading (link and checkout pages)",()=>{
 assert.match(src("components/public-document.tsx"),/if\(loading\)return <CheckoutLoading bn=\{bn\}\/>;/);
 assert.match(src("components/checkout-experience.tsx"),/if\(status==="loading"\)return <CheckoutLoading bn=\{bn\}\/>;/);
});
test("Official theme uses the loaded Hind Siliguri font and light inputs, like its preview",()=>{
 const css=src("components/gateway-checkout.css");
 assert.match(css,/--san:var\(--font-hind-siliguri,'Hind Siliguri'\)/);
 assert.match(css,/\.gw\{color-scheme:light\}/);
 assert.match(css,/\.gw input,\.gw textarea,\.gw select\{background:#fff;color:#15161C\}/);
});
