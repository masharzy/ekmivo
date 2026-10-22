// Isolated UI simulation. All phone/payment API calls are mocked; no real device
// is registered, renamed, revoked or paid. The temporary dev route is removed.
import {createRequire} from "node:module";
import {mkdir,writeFile,rm} from "node:fs/promises";
import assert from "node:assert/strict";
import {pairingPayload,pairingSvg} from "../src/lib/pairing-qr.mjs";
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_RUNTIME||"playwright");
const base=process.env.PUBLIC_SMOKE_URL||"http://localhost:3027";
const route=new URL("../src/app/[locale]/ui-sms-test/",import.meta.url);
const evidence=new URL("../../../docs/evidence/SMS-DEVICES-QR-20261014/",import.meta.url).pathname.replace(/^\/(\w:)/,"$1");
// Match the eight-character Crockford-style alphabet emitted by the Go pairing endpoint.
const token="ABCD2345",phoneId="22222222-2222-4222-8222-222222222222",workspace="11111111-1111-4111-8111-111111111111";
assert.throws(()=>pairingPayload("<script>"));assert.match(pairingSvg(token),/fill="white"/);assert.match(pairingSvg(token),/width="[0-9]+px"/);
await mkdir(route,{recursive:true});await mkdir(evidence,{recursive:true});
await writeFile(new URL("page.tsx",route),`import {notFound} from "next/navigation";import Link from "next/link";import {PaymentPhoneManagement} from "../../../components/payment-phone-management";export default async function Page({params}:{params:Promise<{locale:string}>}){if(process.env.NODE_ENV!=="development")notFound();const {locale}=await params;return <main style={{maxWidth:1100,margin:"24px auto 40px",padding:16}}><p>Simulated SMS device UI — no real account</p><PaymentPhoneManagement locale={locale==="bn"?"bn":"en"} workspaceId="${workspace}" environment="live" canManage={true}/><Link href="/pay/ppppppppppppppppppppppppppppppppppppppppppp">Open simulated checkout</Link></main>}`);
let browser;
try{
 browser=await chromium.launch({headless:true,channel:process.env.SMOKE_BROWSER_CHANNEL});
 const context=await browser.newContext({viewport:{width:1440,height:1100}});
 await context.addCookies([{name:"ekmivo-locale",value:"en",url:base},{name:"ekmivo-theme",value:"light",url:base}]);
 const page=await context.newPage();page.on("dialog",d=>d.accept());
 let phones=[],failure=false;
 await page.route(`**/api/go/workspaces/${workspace}/phones**`,async r=>{
  const req=r.request(),path=new URL(req.url()).pathname,body=req.method()==="POST"?req.postDataJSON():null;
  if(failure){await r.fulfill({status:503,json:{error:{code:"PIPELINE_SOURCE_UNAVAILABLE"}}});return;}
  if(req.method()==="GET"){await r.fulfill({json:{items:phones,accounts:[]}});return;}
  if(path.endsWith("/rename")){phones[0].name=body.name;await r.fulfill({json:{saved:true}});return;}
  if(path.endsWith("/revoke")){phones[0].revoked_at=new Date().toISOString();await r.fulfill({json:{saved:true}});return;}
  assert.deepEqual(Object.keys(body),["name"]);
  phones=[{id:phoneId,name:body.name,created_at:new Date().toISOString(),claimed_at:null,heartbeat_at:null,permission_ok:false,backlog:0}];
  await r.fulfill({json:{id:phoneId,pairing_token:token,expires_at:new Date(Date.now()+300000).toISOString()}});
 });
 await page.goto(base+"/ui-sms-test",{timeout:180000});
 await page.getByLabel("Phone name",{exact:true}).first().fill("Test receipt phone");
 await page.getByRole("button",{name:"Create pairing QR",exact:true}).click();
 const qr=page.locator(".sd-pair-qr svg");await qr.waitFor({state:"visible",timeout:60000});
 const box=await qr.boundingBox();assert.ok(box.width>200&&Math.abs(box.width-box.height)<2,"QR must be a visible square");
 await page.locator(".sd-pair-qr").screenshot({path:evidence+"pairing-qr-test-only.png"});
 await page.screenshot({path:evidence+"pairing-light-desktop.png"});
 assert.equal(await page.getByText("Approved source",{exact:true}).count(),0);
 assert.equal(await page.getByText("Exact SIM/source binding",{exact:true}).count(),0);
 await page.setViewportSize({width:320,height:1100});
 await context.addCookies([{name:"ekmivo-theme",value:"dark",url:base}]);
 await page.evaluate(()=>document.documentElement.dataset.theme="dark");
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,"Mobile overflow");
 await page.screenshot({path:evidence+"pairing-dark-mobile.png"});
 phones[0].claimed_at=new Date().toISOString();phones[0].heartbeat_at=new Date().toISOString();phones[0].permission_ok=true;
 await page.getByRole("button",{name:"Refresh",exact:true}).click();await page.getByText("Phone paired successfully",{exact:true}).waitFor();
 assert.equal(await page.locator(".sd-pair-qr").count(),0,"Pairing QR must disappear after claim");
 await page.getByRole("button",{name:"Done",exact:true}).click();
 await page.getByRole("button",{name:"Device details",exact:true}).click();
 await page.locator("#sd-rename").fill("Renamed test phone");await page.getByRole("button",{name:"Save name",exact:true}).click();
 await page.getByText("Phone name updated.",{exact:true}).waitFor();assert.equal(phones[0].name,"Renamed test phone");
 failure=true;await page.getByRole("button",{name:"Refresh",exact:true}).click();await page.locator(".sd-error[role=alert]").waitFor();
 assert.equal(await page.locator(".sd-phone").count(),1,"Failed refresh must retain last successful data");
 failure=false;await page.getByRole("button",{name:"Try again",exact:true}).click();
 await page.getByRole("button",{name:"Disconnect",exact:true}).click();await page.getByText("Phone disconnected. Existing payment history is retained.",{exact:true}).waitFor();
 assert.equal(await page.locator(".sd-phone").count(),0);
 // Test actual public routes: anonymous GET-only mocked checkout data.
 const payToken="p".repeat(43);
 await page.route("**/api/documents/**",r=>r.fulfill({json:{merchant_name:"UI test merchant",kind:"payment-links",reference:"UI test",environment:"sandbox",amount_minor:1000,paid_minor:0,configured_methods:["bkash"],body:{description:"Simulated checkout",fields:[]}}}));
 await page.route("**/api/checkout/**",r=>r.fulfill({json:{id:phoneId,merchant_name:"UI test merchant",merchant_reference:"UI test",amount_minor:1000,currency:"BDT",environment:"sandbox",created_at:new Date().toISOString(),expires_at:new Date(Date.now()+300000).toISOString(),server_time:new Date().toISOString(),state:"requires_payer",payer_suffix:null,method:null,methods:["bkash"],destination:null,verification_available:true}}));
 await page.getByRole("link",{name:"Open simulated checkout",exact:true}).click();
 await page.waitForURL(base+"/pay/"+payToken,{timeout:180000});await page.locator("[data-customer-checkout]").waitFor();
 assert.equal(await page.locator(".site-header").count(),0,"Client navigation to pay must remove marketing chrome");
 for(const locale of ["en","bn"]){
  await context.addCookies([{name:"ekmivo-locale",value:locale,url:base}]);
  for(const path of ["/pay/","/checkout/"]){
   await page.goto(base+path+payToken,{timeout:180000});await page.locator("[data-customer-checkout]").waitFor();
   assert.equal(await page.locator(".site-header").count(),0,path+" must not render marketing header");
   assert.equal(await page.locator(".site-footer").count(),0,path+" must not render marketing footer");
  }
 }
 await page.goto(base+"/login",{timeout:180000});await page.locator(".site-header").waitFor();
 console.log("PASS (mock UI): QR square/quiet zone, pairing claim hides secret, rename/revoke, refresh error retains data, 320px dark layout, EN/BN standalone pay/checkout and header on login");
}finally{if(browser)await browser.close();await rm(new URL("page.tsx",route),{force:true});}
