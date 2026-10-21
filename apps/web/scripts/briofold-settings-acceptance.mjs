import {readFile} from "node:fs/promises";
import postgres from "postgres";
import {spawn} from "node:child_process";
import {chromium} from "@playwright/test";
import {runBriofoldSettingsBrowser} from "./briofold-settings-browser.mjs";
import {runBriofoldOnboardingBrowser} from "./briofold-onboarding-browser.mjs";
import {runBriofoldAiChannel} from "./briofold-ai-channel-acceptance.mjs";
import {runBriofoldInboxWorkflow} from "./briofold-inbox-workflow-acceptance.mjs";
import {runBriofoldInboxDrafts} from "./briofold-inbox-drafts-acceptance.mjs";
import {runBriofoldAiStudioAcceptance} from "./briofold-ai-studio-acceptance.mjs";
import {runBriofoldChannelExtensions} from "./briofold-channel-extensions-acceptance.mjs";
import {runBriofoldCustomers} from "./briofold-customers-acceptance.mjs";
import {runBriofoldInboxAccess} from "./briofold-inbox-access.mjs";

// Called after all control/financial extensions, not the earlier PG05 schema.
export async function runBriofoldSettingsAcceptance({control,sessions,apiBin,apiEnv}){
 const target=new URL(control);
 if(!["localhost","127.0.0.1","[::1]"].includes(target.hostname)||/prod/i.test(target.pathname))throw Error("Acceptance refuses shared database");
 const schema=postgres(control,{max:1,prepare:false});
 try{
  const apply=async name=>schema.unsafe(await readFile(new URL("../../../infra/migrations/"+name,import.meta.url),"utf8")).simple();
  if(!(await schema`SELECT to_regclass('public.pg13_plans') AS rel`)[0].rel)await apply("0024_pg13_billing.sql");
  if(!(await schema`SELECT to_regclass('public.payment_plan_catalog') AS rel`)[0].rel){
   await schema`INSERT INTO pg13_plans(id,name,amount_minor,period_days,grace_days,enabled) VALUES('phase4_fixture','Fictional CI Gateway tier',100,30,0,true) ON CONFLICT DO NOTHING`;
   await apply("0067_managed_payment_plans.sql");
  }
  if(!(await schema`SELECT to_regclass('public.checkout_theme_settings') AS rel`)[0].rel)await apply("0074_checkout_themes.sql");
  if(!(await schema`SELECT to_regclass('public.dashboard_store_profiles') AS rel`)[0].rel)await apply("0097_workspace_store_identity.sql");
  const [details]=await schema`SELECT position('receipt_note' in pg_get_functiondef(to_regprocedure('public.dashboard_store_write(uuid,uuid,jsonb,bigint,text,bytea)')))>0 AS ready`;
  if(!details.ready)await apply("0099_store_details.sql");
  await apply("0132_briofold_inbox_permissions.sql");
  await apply("0133_briofold_ai_studio.sql");
  await apply("0134_briofold_inbox_operations.sql");
  await apply("0135_briofold_ai_channel_execution.sql");
  await apply("0136_briofold_knowledge_import.sql");
  await apply("0137_briofold_website_chat.sql");
  await apply("0138_briofold_inbox_alerts.sql");
  await apply("0139_briofold_comments.sql");
  await apply("0140_briofold_customers.sql");
 }finally{await schema.end({timeout:3});}
 const apiOrigin="http://127.0.0.1:17912",origin="http://127.0.0.1:17913";
 const api=spawn(apiBin,[],{env:{...apiEnv,PORT:"17912",GO_WEB_ORIGIN:apiOrigin,EKMIVO_REQUIRE_AUTHZ:"true",PG10_EXTENSIONS_ENABLED:"true",BRIOFOLD_AI_RUNTIME_ENABLED:"false",BRIOFOLD_AI_TOPUPS_ENABLED:"false",BRIOFOLD_COMMENTS_ENABLED:"false",BRIOFOLD_COMMENT_DELIVERY_ENABLED:"false",META_APP_SECRET:"phase6-comment-test-secret"},stdio:["ignore","pipe","pipe"]});
 let server,browser,logs="";
 const capture=child=>{for(const stream of [child.stdout,child.stderr])stream.on("data",chunk=>{logs=(logs+String(chunk)).slice(-5000);});};
 capture(api);
 const ready=async(url,expected,child)=>{
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error("Settings acceptance process exited: "+logs);
   try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).status===expected)return;}catch{}
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error("Settings acceptance startup failed: "+logs);
 };
 try{
  await ready(apiOrigin+"/healthz",200,api);
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port","17913"],{
   cwd:new URL("../",import.meta.url),env:{...process.env,NODE_ENV:"development",DATABASE_URL:control,GO_API_URL:apiOrigin,GO_WEB_ORIGIN:apiOrigin,BRIOFOLD_AI_RUNTIME_ENABLED:"true",BRIOFOLD_AI_TOPUPS_ENABLED:"false"},stdio:["ignore","pipe","pipe"]
  });
  capture(server);await ready(origin+"/api/checkout/invalid",404,server);
  browser=await chromium.launch({headless:true});
  await runBriofoldSettingsBrowser({origin,browser,control,sessions});
  await runBriofoldOnboardingBrowser({origin,browser,control,sessions});
  await runBriofoldInboxAccess({origin,browser,control,sessions});
  await runBriofoldAiChannel({control,sessions});
  await runBriofoldAiStudioAcceptance({origin,browser,control,sessions});
  await runBriofoldInboxDrafts({origin,browser,control,sessions});
  await runBriofoldInboxWorkflow({origin,browser,control,sessions});
  await runBriofoldChannelExtensions({origin,browser,control,sessions,apiOrigin,apiBin,apiEnv});
  await runBriofoldCustomers({origin,browser,control,sessions,apiOrigin});
 }catch(error){throw Error(error.message+"\nSettings acceptance service output:\n"+logs);}
 finally{if(browser)await browser.close();if(server)server.kill("SIGTERM");api.kill("SIGTERM");}
}
