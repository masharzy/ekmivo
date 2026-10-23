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
import {runBriofoldCommerce} from "./briofold-commerce-acceptance.mjs";
import {runBriofoldCustomers} from "./briofold-customers-acceptance.mjs";
import {runBriofoldInboxAccess} from "./briofold-inbox-access.mjs";
import {runBriofoldPhase9Browser} from "./briofold-phase9-browser.mjs";
import {runBriofoldGrowthOperations} from "./briofold-growth-operations-acceptance.mjs";
import {runBriofoldOrderAssignment} from "./briofold-order-assignment-acceptance.mjs";
import {runBriofoldKeyLifecycle} from "./briofold-key-lifecycle-acceptance.mjs";

// Called after all control/financial extensions, not the earlier PG05 schema.
export async function runBriofoldSettingsAcceptance({control,sessions,apiBin,apiEnv,phase9Fixture}){
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
  // 0097's legacy theme reader omits presentation fields. The browser reuses
  // the server-returned theme in a PUT, so apply the 0100 reader/writer contract
  // in this disposable CONTROL fixture before testing that round trip.
  const [presentation]=await schema`SELECT position('beside-left' in pg_get_functiondef(to_regprocedure('public.dashboard_checkout_theme_read(uuid,uuid)')))>0 AS ready`;
  if(!presentation.ready)await apply("0100_checkout_logo_presentation.sql");
  // The independent financial smoke does not require the dashboard-reference
  // operator's 0073 topic migration. This fixture must install that known
  // predecessor itself before the additive feedback-category constraint.
  const [supportTopics]=await schema`SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pg13_support' AND column_name='topic') AS ready`;
  if(!supportTopics.ready)await apply("0073_dashboard_support_topic.sql");
  const [feedback]=await schema`SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.pg13_support'::regclass
      AND conname='pg13_support_topic_check'
      AND pg_get_constraintdef(oid) LIKE '%usability%') AS ready`;
  if(!feedback.ready)await apply("0190_briofold_feedback_topics.sql");
  await apply("0132_briofold_inbox_permissions.sql");
  await apply("0133_briofold_ai_studio.sql");
  await apply("0134_briofold_inbox_operations.sql");
  await apply("0135_briofold_ai_channel_execution.sql");
  await apply("0136_briofold_knowledge_import.sql");
  await apply("0137_briofold_website_chat.sql");
  await apply("0138_briofold_inbox_alerts.sql");
  await apply("0139_briofold_comments.sql");
  await apply("0140_briofold_customers.sql");
  await apply("0141_briofold_commerce.sql");
  await apply("0142_briofold_growth_reporting.sql");
  await apply("0180_briofold_growth_operations.sql");
  await apply("0181_briofold_growth_analytics_exports.sql");
  await apply("0182_briofold_growth_consent_safety.sql");
  await apply("0183_briofold_signed_channel_optouts.sql");
  await apply("0184_briofold_order_assignment.sql");
  await apply("0185_briofold_order_barcode_search.sql");
  await apply("0186_briofold_order_reporting.sql");
  await apply("0187_briofold_assignment_viewer_privacy.sql");
  await apply("0188_briofold_unified_activity.sql");
  await apply("0189_briofold_crm_viewer_privacy.sql");
 }finally{await schema.end({timeout:3});}
 const apiOrigin="http://127.0.0.1:17912",origin="http://127.0.0.1:17913";
 const api=spawn(apiBin,[],{env:{...apiEnv,PORT:"17912",GO_WEB_ORIGIN:apiOrigin,EKMIVO_REQUIRE_AUTHZ:"true",PG10_EXTENSIONS_ENABLED:"true",BRIOFOLD_GROWTH_CONSENT_ENABLED:"true",BRIOFOLD_COMMERCE_ASSIGNMENTS_ENABLED:"true",BRIOFOLD_COMMERCE_SCAN_ENABLED:"true",BRIOFOLD_COMMERCE_REPORTS_ENABLED:"true",BRIOFOLD_AI_RUNTIME_ENABLED:"false",BRIOFOLD_AI_TOPUPS_ENABLED:"false",BRIOFOLD_COMMENTS_ENABLED:"false",BRIOFOLD_COMMENT_DELIVERY_ENABLED:"false",META_APP_SECRET:"phase6-comment-test-secret"},stdio:["ignore","pipe","pipe"]});
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
   cwd:new URL("../",import.meta.url),env:{...process.env,NODE_ENV:"development",DATABASE_URL:control,GO_API_URL:apiOrigin,GO_WEB_ORIGIN:apiOrigin,BRIOFOLD_AI_RUNTIME_ENABLED:"true",BRIOFOLD_AI_TOPUPS_ENABLED:"false",BRIOFOLD_GROWTH_REPORTS_ENABLED:"true",BRIOFOLD_GROWTH_OPERATIONS_ENABLED:"true",BRIOFOLD_GROWTH_ANALYTICS_ENABLED:"true",BRIOFOLD_GROWTH_CONSENT_ENABLED:"true",BRIOFOLD_COMMERCE_ASSIGNMENTS_ENABLED:"true",BRIOFOLD_COMMERCE_SCAN_ENABLED:"true",BRIOFOLD_COMMERCE_REPORTS_ENABLED:"true",BRIOFOLD_ACTIVITY_UNIFIED_ENABLED:"true"},stdio:["ignore","pipe","pipe"]
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
  await runBriofoldCommerce({origin,browser,control,sessions,apiOrigin});
  await runBriofoldOrderAssignment({origin,browser,control,sessions});
  await runBriofoldGrowthOperations({origin,browser,control,sessions,apiOrigin});
  if(phase9Fixture)await runBriofoldPhase9Browser({origin,browser,control,sessions,...phase9Fixture});
  if(phase9Fixture)await runBriofoldKeyLifecycle({origin,browser,control,sessions,workspaceId:phase9Fixture.workspaceId});
 }catch(error){throw Error(error.message+"\nSettings acceptance service output:\n"+logs);}
 finally{if(browser)await browser.close();if(server)server.kill("SIGTERM");api.kill("SIGTERM");}
}
