// Synthetic Admin coupon visual/layout acceptance, using the ACTUAL TSX and
// locked Admin CSS. No production sessions, coupon records or tax rules read.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdirSync} from "node:fs";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {runInNewContext} from "node:vm";
import {chromium} from "@playwright/test";
import {formatBdtMinor,formatPercentBps} from "../src/lib/subscription-coupons.ts";

const require=createRequire(new URL("../package.json",import.meta.url));
const ts=require("typescript"),React=require("react"),jsx=require("react/jsx-runtime"),server=require("react-dom/server");
const component=readFileSync(new URL("../src/components/admin-subscription-coupons.tsx",import.meta.url),"utf8");
// Only the test harness exports the private modal; production exports stay stable.
const compiled=ts.transpileModule(component+"\nexports.TestCouponForm=CouponForm;",{
 compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}
}).outputText;
const isolated={exports:{}};
runInNewContext(compiled,{
 module:isolated,exports:isolated.exports,require:name=>{
  if(name==="react")return React;
  if(name==="react/jsx-runtime")return jsx;
  if(name==="next/navigation")return {useRouter:()=>({refresh(){}})};
  if(name==="next/link")return {__esModule:true,default:({children,href,...props})=>React.createElement("a",{href,...props},children)};
  if(name==="../actions/admin-subscription-coupons")return {
   saveSubscriptionCoupon:async()=>({status:"success",message:"Fictional"}),
   saveSubscriptionTaxPolicy:async()=>({status:"success",message:"Fictional"}),
   transitionSubscriptionCoupon:async()=>({status:"success",message:"Fictional"}),
   subscriptionCouponHistory:async()=>({error:null,data:{versions:[],redemptions:[],offset:0}})
  };
  if(name==="../lib/subscription-coupons")return {formatBdtMinor,formatPercentBps};
  throw Error("Unexpected dependency in isolated Admin UI: "+name);
 },Intl,Date,URLSearchParams,Math,Number,Array,JSON,Set,Object,String,console
});
const {AdminSubscriptionCoupons,TestCouponForm}=isolated.exports;
const coupon={id:"2f4d2a17-021c-4413-a7cd-89323b38b60b",code_normalized:"FICTIONAL10",status:"paused",
 discount_kind:"percent",percent_bps:1000,fixed_minor:null,max_discount_minor:1000,min_subtotal_minor:0,
 max_redemptions:20,max_per_store:1,first_purchase_only:false,stack_with_annual:false,stack_with_bundle:false,
 eligible_offer_keys:[],eligible_products:["payments"],eligible_terms:["monthly"],starts_at:null,expires_at:null,
 revision:3,created_at:"2026-10-20T00:00:00Z",updated_at:"2026-10-21T00:00:00Z",redeemed:2,reserved:1};
const rules=[{id:"5ddc871e-75c7-40ef-b731-56d60fe5a5c4",product:"payments",term:"monthly",rate_bps:0,
 revision:1,reason:"Fictional display only",updated_at:"2026-10-21T00:00:00Z"}];
const styles=["admin-tokens.css","admin-theme.css","admin-components.css"].map(n=>readFileSync(new URL(`../src/styles/admin/${n}`,import.meta.url),"utf8")).join("\n");
const baseStyle="html,body{margin:0;width:100%;max-width:100%;}body{font:13px system-ui,sans-serif}button{cursor:pointer}";
function html(locale,theme,mode){
 const view=mode==="editor"?React.createElement(TestCouponForm,{coupon,locale,onClose(){}}):
  React.createElement(AdminSubscriptionCoupons,{locale,data:{coupons:[coupon],next_offset:null},query:"",status:"all",offset:0,taxRules:rules});
 const content=server.renderToStaticMarkup(view);
 return `<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${baseStyle}\n${styles}</style></head><body><main class="pa-root pa-admin-design" data-admin-theme="${theme}" lang="${locale}"><div class="pa-main"><div class="pa-content">${content}</div></div></main></body></html>`;
}

test("Phase3 real coupon Admin markup preserves required fields and approved tax controls",()=>{
 for(const locale of ["en","bn"]){
  const markup=html(locale,"light","editor");
  assert.match(markup,/role="dialog"/);assert.match(markup,/aria-modal="true"/);
  for(const name of ["discount_value","eligible_products","eligible_terms","max_redemptions","reason"])
   assert.match(markup,new RegExp(`name="${name}"`));
  assert.match(html(locale,"light","list"),/name="tax_percent"/);
 }
});

test("Phase3 coupon list, tax panel and editing dialog fit desktop/mobile EN/BN in both Admin themes",async t=>{
 if(process.env.PHASE3_RENDER_ONLY==="1")return;
 const browser=await chromium.launch({headless:true});
 const location=resolve("test-results","subscription-coupon-admin");mkdirSync(location,{recursive:true});
 try{
  for(const locale of ["en","bn"])for(const theme of ["light","dark"])
   for(const width of [320,375,768,1024,1440])for(const mode of ["list","editor"]){
    await t.test(`${locale}-${theme}-${width}-${mode}`,async()=>{
     const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
     try{
      await page.setContent(html(locale,theme,mode));
      const size=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,
       dialog:document.querySelector('[role="dialog"]')?.getBoundingClientRect().width||0,
       tableWrap:document.querySelector('.pa-table-wrap')?.clientWidth||0}));
      assert.ok(size.document<=size.width+1,`horizontal page overflow ${JSON.stringify(size)}`);
      if(mode==="editor"){
       assert.equal(await page.locator('[role="dialog"][aria-modal="true"]').count(),1);
       assert.ok(size.dialog<=width-30,`dialog clipped ${JSON.stringify(size)}`);
       await page.keyboard.press("Tab");
       assert.ok(await page.evaluate(()=>document.activeElement?.tagName!=="BODY"),"keyboard cannot focus dialog controls");
      }else{
       assert.equal(await page.locator('input[name="tax_percent"]').count(),1);
       assert.equal(await page.locator('.pa-table-wrap').count(),2);
      }
      await page.screenshot({path:resolve(location,`${locale}-${theme}-${width}-${mode}.png`),fullPage:true});
     }finally{await page.close()}
    });
   }
 }finally{await browser.close()}
});
