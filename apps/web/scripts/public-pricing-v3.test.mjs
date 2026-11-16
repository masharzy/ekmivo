import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pricingPlans,yearlyDiscount} from "../src/lib/pricing-catalog.ts";

const file=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const terms=(o={})=>({name:"Pro",name_bn:"প্রো",description:"",description_bn:"",kind:"paid",amount_minor:39900,period_days:30,grace_days:0,free_days:null,
 payment_limit:2000,quota_period:"calendar",active_checkout_limit:100,create_per_minute:120,
 features:{invoices:true,payment_links:true,reports:true,exports:false},limits:{api_keys:2,team_members:3,devices:2,payment_methods:null},badge:"",badge_bn:"",contact_url:"",...o});
const offer=(o)=>({currency:"BDT",name:"Pro",name_bn:"প্রো",description:"",description_bn:"",included_ai_credits:null,...o});
const V1="00000000-0000-0000-0000-000000000001",V2="00000000-0000-0000-0000-000000000002";

test("published monthly and yearly offers join their Gateway plan; legacy plans fill the gaps",()=>{
 const plans=[{id:"pro",version_id:V1,terms:terms()},{id:"free",version_id:V2,terms:terms({name:"Free",kind:"free",amount_minor:0,payment_limit:50})}];
 const offers=[offer({key:"pro_m",version_id:"10000000-0000-0000-0000-000000000001",product:"payments",term:"monthly",amount_minor:"39900",gateway_plan_version_id:V1}),
  offer({key:"pro_y",version_id:"10000000-0000-0000-0000-000000000002",product:"payments",term:"yearly",amount_minor:"399000",gateway_plan_version_id:V1}),
  offer({key:"ai",version_id:"10000000-0000-0000-0000-000000000003",product:"ai_credit",term:"one_time",amount_minor:"50000",gateway_plan_version_id:null,included_ai_credits:"500"})];
 const out=pricingPlans(offers,plans);
 assert.deepEqual(out.map(p=>p.name),["Free","Pro"],"free first, AI packs are not payment plans");
 const pro=out[1];
 assert.equal(pro.monthly.href,"/subscribe/pro_m?term=monthly&version=10000000-0000-0000-0000-000000000001");
 assert.equal(pro.yearly.amountMinor,399000);
 assert.equal(yearlyDiscount(pro),16.7);
 assert.equal(out[0].monthly.href,"/subscribe/free");
 assert.deepEqual(pro.bullets[0],{en:"2,000 successful payments a month",bn:"মাসে ২,০০০টা সফল পেমেন্ট"});
 assert.ok(pro.bullets.some(b=>b.bn==="ইনভয়েস, পেমেন্ট লিংক, রিপোর্ট"));
});

test("no saving or no monthly price means no discount is shown",()=>{
 const p={monthly:{amountMinor:100},yearly:{amountMinor:1200}};
 assert.equal(yearlyDiscount(p),null);
 assert.equal(yearlyDiscount({monthly:null,yearly:{amountMinor:1}}),null);
});

test("pricing page: tabs, yearly toggle, credit explained above the cards, free ৳30 and ৳20 minimum",()=>{
 const ui=file("components/pricing-experience.tsx");
 for(const s of ["পেমেন্ট গেটওয়ে","এআই বট","দুটোই","মাসিক","বার্ষিক","এআই ক্রেডিট মানে টাকার ব্যালেন্স","৳৩০ ফ্রি নিন","সর্বনিম্ন ৳২০"])assert.ok(ui.includes(s),s);
 assert.ok(ui.includes("const AI_MIN=20"));
 assert.ok(!ui.includes("১ ক্রেডিট = ৳১")&&!ui.includes("1 credit = ৳1"),"credit is a taka balance, not a unit per reply");
 assert.ok(/aiView=<>\{creditStrip\}<div className="bf-grid2">/.test(ui),"credit explanation sits right above the AI cards");
 assert.ok(ui.includes("comboEnabled=false")&&ui.includes("comboEnabled?:false"),"one-order plan + recharge stays off until the server supports it");
 const page=file("app/[locale]/pricing/page.tsx");
 assert.ok(page.includes('freeEnabled={process.env.BRIOFOLD_AI_FREE_CREDIT_ENABLED==="true"}'));
 assert.ok(!page.includes("comboEnabled"),"page never switches combo on");
 assert.ok(file("app/globals.css").includes('@import "./public-pricing-v3.css";'));
});

test("pricing styles use only semantic theme tokens",()=>{
 const css=file("app/public-pricing-v3.css");
 const hexes=[...new Set([...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m=>m[0].toLowerCase()))].sort();
 assert.deepEqual(hexes,["#ffffff14","#ffffff33"]);
});
