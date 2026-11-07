// Read-only production rollout evidence. Never performs schema or financial writes.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
const require=createRequire(path.resolve('apps/web/package.json')),postgres=require('postgres');
const report={at:new Date().toISOString(),phase:process.argv.includes('--after')?'after':'before',targets:{}};
const test=new URL(fs.readFileSync(path.join(os.tmpdir(),'briofold-plans-neon-url.txt'),'utf8'));
for(const realm of ['control','sandbox','live']){
 const u=new URL(fs.readFileSync(path.join(os.tmpdir(),`briofold-plans-production-${realm}-url.txt`),'utf8'));
 if(u.hostname===test.hostname.replace('-pooler.','.')||u.hostname!==process.env.PLAN_ROLLOUT_PRODUCTION_HOST||u.hostname.includes('-pooler.'))throw Error('Explicit distinct direct production host required');
 const sql=postgres(u.href,{ssl:'require',prepare:false,max:1,onnotice:()=>{}});
 try{
 const [identity]=await sql`SELECT current_database() AS database,current_user AS actor`;
 if(realm==='control'){
 const [r]=await sql`SELECT (SELECT count(*)::int FROM pg13_plans) AS plans,(SELECT count(*)::int FROM pg13_subscriptions) AS subscriptions,(SELECT count(*)::int FROM pg13_platform_invoices) AS invoices,(SELECT count(*)::int FROM merchant_api_keys) AS keys,(SELECT count(*)::int FROM workspace_members) AS members,to_regclass('payment_plan_versions') IS NOT NULL AS migrated`;
 let verified={};if(r.migrated){const [v]=await sql`SELECT (SELECT count(*)::int FROM payment_plan_versions) AS versions,(SELECT count(*)::int FROM payment_plan_catalog WHERE status='published' AND visibility='public') AS public_plans,(SELECT count(*)::int FROM pg13_subscriptions WHERE plan_version_id IS NULL) AS missing_subscription_version,(SELECT count(*)::int FROM pg13_platform_invoices WHERE plan_version_id IS NULL) AS missing_invoice_version,has_function_privilege('ekmivo_financial_runtime','payment_plan_effective(uuid)','EXECUTE') AS runtime_effective_grant,(SELECT count(*)::int FROM pg13_subscriptions WHERE (payment_plan_effective(workspace_id)->>'active')::boolean) AS active_subscriptions`;verified=v;}
 report.targets[realm]={...identity,...r,...verified};
 }else{
 const [r]=await sql`SELECT (SELECT environment FROM financial_realm WHERE singleton) AS realm,(SELECT count(*)::int FROM payment_intents) AS intents,(SELECT count(*)::int FROM financial_payments) AS payments,(SELECT count(*)::int FROM financial_allocations) AS allocations,to_regclass('payment_allowance_slots') IS NOT NULL AS migrated`;
 if(r.realm!==realm)throw Error('Incorrect financial realm');
 let verified={};if(r.migrated){const [v]=await sql`SELECT (SELECT count(*)::int FROM payment_allowance_slots) AS metered_slots,(SELECT count(*)::int FROM pg_trigger WHERE tgname IN ('payment_allowance_reservation','payment_allowance_completion','payment_allowance_cancellation','payment_plan_phone_limit','payment_plan_device_limit','payment_plan_account_limit','payment_plan_account_reenable_limit') AND NOT tgisinternal) AS plan_triggers,has_function_privilege('ekmivo_finance_reader','payment_allowance_usage(uuid,text,timestamptz,timestamptz)','EXECUTE') AS reader_usage_grant,to_regclass('payment_allowance_open') IS NOT NULL AS active_index`;verified=v;}
 const [health]=await sql`SELECT pg15_health() AS workers`;
 report.targets[realm]={...identity,...r,...verified,...health};
 }
 }finally{await sql.end()}
}
console.log(JSON.stringify(report,null,2));
