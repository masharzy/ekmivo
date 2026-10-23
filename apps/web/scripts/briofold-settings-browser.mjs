import assert from "node:assert/strict";
import {expect} from "@playwright/test";
import {createHash,randomUUID} from "node:crypto";
import postgres from "postgres";
export async function runBriofoldSettingsBrowser({origin,browser,control,sessions}){
 const target=new URL(control);
 if(!["localhost","127.0.0.1","[::1]"].includes(target.hostname)||/prod/i.test(target.pathname))throw Error("Settings browser refuses shared DB");
 const db=postgres(control,{max:1,prepare:false}),workspace=randomUUID();
 let owner,viewer,context,readOnly;
 const pageErrors=[];
 try{
  const identities=await Promise.all([sessions.owner,sessions.viewer].map(token=>db.unsafe("SELECT user_id FROM auth_sessions WHERE token_hash=$1",[createHash("sha256").update(token).digest("hex")])));
  assert.ok(identities.every(rows=>rows.length===1));owner=String(identities[0][0].user_id);viewer=String(identities[1][0].user_id);
  await db.unsafe("INSERT INTO workspaces(id,name,service_mode,created_by) VALUES($1,'Phase3 preferences fixture','both',$2)",[workspace,owner]);
  await db.unsafe("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer')",[workspace,owner,viewer]);
  const createContext=async(token,actor)=>{
   const c=await browser.newContext({viewport:{width:1280,height:900}});
   await c.addCookies([
    {name:"ekmivo-session",value:token,url:origin,httpOnly:true,sameSite:"Lax"},
    {name:"ekmivo-default-workspace",value:actor+":"+workspace,url:origin,httpOnly:true,sameSite:"Lax"},
    {name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}
   ]);return c;
  };
  context=await createContext(sessions.owner,owner);
  const base=origin+"/api/go/workspaces/"+workspace+"/workspace-tools/settings?environment=live";
  const initialResponse=await context.request.get(base);
  assert.equal(initialResponse.status(),200,"Owner settings initial read denied");
  const initial=await initialResponse.json(),original=initial.body.timezone||"Asia/Dhaka",changed=original==="UTC"?"Asia/Dhaka":"UTC";
  const page=await context.newPage();page.on("pageerror",error=>pageErrors.push(error.message));page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  assert.equal((await page.goto(origin+"/settings/preferences")).status(),200);
  const waitLoaded=async value=>page.waitForFunction(expected=>{
   const field=document.querySelector('input[list="ws-common-timezones"]'),refresh=document.querySelector(".ws-refresh");
   return field&&field.value===expected&&refresh&&!refresh.disabled;
  },value);
  await waitLoaded(original);
  const save=async value=>{
   await page.locator('input[list="ws-common-timezones"]').fill(value);
   const [response]=await Promise.all([
    page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/workspace-tools/settings")&&r.request().method()==="POST"),
    page.getByRole("button",{name:"Save settings",exact:true}).click()
   ]);
   assert.equal(response.status(),200,"Owner business preference save failed");
  };
  await save(changed);
  await save(original); // A second save without reload must use the actual DB version.
  await save(changed);
  await page.reload();await waitLoaded(changed);
  await save(original);
  const restored=await context.request.get(base);
  assert.equal((await restored.json()).body.timezone,original,"Original preference was not restored");
  readOnly=await createContext(sessions.viewer,viewer);
  const viewerPage=await readOnly.newPage();viewerPage.on("pageerror",error=>pageErrors.push(error.message));viewerPage.setDefaultNavigationTimeout(90000);
  assert.equal((await viewerPage.goto(origin+"/settings/preferences")).status(),200);
  await viewerPage.locator('input[list="ws-common-timezones"]').waitFor();
  assert.equal(await viewerPage.locator('input[list="ws-common-timezones"]').isDisabled(),true);
  const view=await readOnly.request.get(base);assert.equal(view.status(),200);
  const current=await view.json();
  const denied=await readOnly.request.post(base,{headers:{Origin:origin},data:{expected_version:current.version,body:{...current.body,timezone:changed}}});
  assert.equal(denied.status(),403,"Viewer preference mutation was not forbidden by backend");
  assert.equal((await (await context.request.get(base)).json()).body.timezone,original,"Forbidden write modified settings");
  // Reuse the real support history with typed feedback, rather than claiming
  // that a decorative feedback route persists user reports.
  const feedback=origin+"/api/go/workspaces/"+workspace+"/workspace-tools/help?environment=live";
  assert.equal((await page.goto(origin+"/settings/help/feedback")).status(),200);
  await page.getByRole("button",{name:"Bug report",exact:true}).click();
  await page.locator("#support-subject").fill("Fixture browser bug report");
  await page.locator("#support-description").fill("This fictional browser report checks authorized durable feedback.");
  const [submitted]=await Promise.all([
   page.waitForResponse(r=>r.url().includes("/workspace-tools/help")&&r.request().method()==="POST"),
   page.getByRole("button",{name:"Submit request",exact:true}).click()
  ]);
  assert.equal(submitted.status(),200,"Bug report was not persisted by Go");
  await page.locator('[data-feedback="success"]').waitFor();
  for(const topic of ["feature","usability"]){
   const response=await context.request.post(feedback,{headers:{Origin:origin},data:{topic,subject:`Fixture ${topic} feedback`,message:"Fictional feature feedback is safely persisted here."}});
   assert.equal(response.status(),200,`Feedback topic ${topic} rejected`);
  }
  const entries=await db`SELECT topic FROM pg13_support WHERE workspace_id=${workspace}::uuid AND subject LIKE 'Fixture %' ORDER BY topic`;
  assert.deepEqual(entries.map(entry=>entry.topic),["bug","feature","usability"]);
  const privateView=await readOnly.request.get(feedback);
  assert.equal(privateView.status(),200);
  const viewerTickets=await privateView.json();
  assert.ok(!viewerTickets.items.some(ticket=>ticket.subject.startsWith("Fixture ")),"Viewer saw owner's private feedback");
  const invalid=await context.request.post(feedback,{headers:{Origin:origin},data:{topic:"untrusted",subject:"Fixture invalid",message:"This should never create a ticket."}});
  assert.equal(invalid.status(),422,"Unrecognized feedback topic was accepted");
  // Local device preferences must remain separate from authenticated
  // payment/mobile device pairing and must not imply server push delivery.
  assert.equal((await page.goto(origin+"/settings/account/devices")).status(),200);
  const sound=page.getByRole("checkbox",{name:/Allow a sound in this browser/});
  await expect(sound).toBeEnabled();await expect(sound).not.toBeChecked();
  await sound.check();assert.equal(await sound.isChecked(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem("ekmivo:device:notification-sound:v1")),"on");
  await page.reload();await expect(sound).toBeEnabled();await expect(sound).toBeChecked();
  assert.match(await page.getByRole("region",{name:"Browser permission"}).innerText(),/No push subscription or remote notification sender/);
  const manifest=await context.request.get(origin+"/manifest.webmanifest");
  assert.equal(manifest.status(),200);assert.equal((await manifest.json()).start_url,"/dashboard");
  const worker=await context.request.get(origin+"/ekmivo-pwa-sw.js");
  assert.equal(worker.status(),200);assert.doesNotMatch(await worker.text(),/caches\.open|fetch\(/,"PWA worker must not cache sensitive data");
  await page.setViewportSize({width:320,height:740});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,"Device preferences overflow 320px");
  await sound.uncheck();assert.equal(await sound.isChecked(),false);
  assert.equal((await viewerPage.goto(origin+"/settings/account/devices")).status(),200);
  const viewerSound=viewerPage.getByRole("checkbox",{name:/Allow a sound in this browser/});
  await expect(viewerSound).toBeEnabled();await expect(viewerSound).not.toBeChecked();
  for(const oldDocsPath of ["/settings/api-docs","/settings/developers/docs"]){
   const docs=await page.goto(origin+oldDocsPath);
   assert.equal(docs.status(),200,`Public API docs deep link ${oldDocsPath} failed`);
   assert.ok(new URL(page.url()).pathname.startsWith("/developers"),`API docs ${oldDocsPath} landed on a placeholder module`);
  }
  assert.deepEqual(pageErrors,[],"Settings browser reported a client runtime/hydration error");
  console.log("Phase3 REAL SETTINGS BROWSER PASS: owner settings save/restore, viewer denial, typed feedback persistence/route/privacy, per-browser device sound/PWA source/320px");
 }finally{
  if(context)await context.close();if(readOnly)await readOnly.close();
  // Settings writes create append-only control audit references. Never delete
  // those audit records for cleanup: this entire disposable CI DB is destroyed
  // by the workflow service teardown after the suite finishes.
  await db.end({timeout:3});
 }
}
