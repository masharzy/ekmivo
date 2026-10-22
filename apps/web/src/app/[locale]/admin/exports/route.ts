import {NextRequest,NextResponse} from "next/server";
import {verifiedAdmin} from "../../../../lib/server/platform-admin";
import {database} from "../../../../lib/server/db";

export const dynamic="force-dynamic";
const enc=(value:unknown)=>{
 const raw=String(value??"");
 const safe=/^[ \t]*[=+@\-]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replaceAll('"','""').replace(/[\r\n\t]/g," ")+'"';
};
function csv(rows:unknown[][]){return "\ufeff"+rows.map(row=>row.map(enc).join(",")).join("\r\n")+"\r\n";}
export async function GET(request:NextRequest,{params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(locale!=="en"&&locale!=="bn")return NextResponse.json({error:"NOT_FOUND"},{status:404});
 const admin=await verifiedAdmin();
 if(!admin||admin.role!=="super_admin")return NextResponse.json({error:"ACCESS_DENIED"},{status:403,headers:{"Cache-Control":"no-store"}});
 const kind=request.nextUrl.searchParams.get("kind");
 if(!["workspaces","users","audit","staff","subscriptions","invoices","subscription-recovery","subscription-coupon-audit"].includes(kind||""))return NextResponse.json({error:"INVALID_EXPORT"},{status:400});
 const q=(request.nextUrl.searchParams.get("q")||"").trim().slice(0,80),term="%"+q+"%";
 let rows:unknown[][];
 if(kind==="subscription-recovery"||kind==="subscription-coupon-audit"){
  // Phase 7 exports are control-plane-only and fail closed if an unapplied
  // migration or missing grants would otherwise return a misleading blank CSV.
  const ready=await database()`SELECT to_regprocedure('public.platform_subscription_admin_export(uuid,text,text)') IS NOT NULL AS available`;
  if(!ready[0]?.available)return NextResponse.json({error:"SOURCE_UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store"}});
  try{
   const result=await database()`SELECT platform_subscription_admin_export(${admin.user.id}::uuid,${kind},${q}) AS records`;
   const records=result[0]?.records as Array<Record<string,unknown>>|undefined;
   if(!Array.isArray(records))throw Error("export not available");
   if(kind==="subscription-recovery"){
    rows=[["Case ID","Intent ID","Invoice ID","Store ID","Reason","Status","Created at"],
     ...records.map(x=>[x.id,x.intent_id,x.invoice_id,x.workspace_id,x.reason,x.status,x.created_at])];
   }else{
    rows=[["Redemption ID","Invoice ID","Coupon ID","Store ID","Reservation ID","Discount minor BDT","Redeemed at"],
     ...records.map(x=>[x.id,x.invoice_id,x.coupon_id,x.workspace_id,x.reservation_id,x.discount_minor,x.redeemed_at])];
   }
  }catch(error){
   console.error("[subscription export] source unavailable",error instanceof Error?error.name:"unknown");
   return NextResponse.json({error:"SOURCE_UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store"}});
  }
 }else if(kind==="workspaces"){
  const r=await database()`SELECT w.id,w.name,w.created_at,(SELECT u.email FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w.id AND m.role='owner' LIMIT 1) AS owner,
    EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=w.id AND p.product='payments' AND p.enabled) AS pay,
    EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=w.id AND p.product='ai' AND p.enabled) AS ai
    FROM workspaces w WHERE (${q}='' OR w.name ILIKE ${term} OR w.id::text ILIKE ${term}) ORDER BY w.created_at DESC LIMIT 5000`;
  rows=[["Workspace ID","Name","Owner email","Payments enabled","AI enabled","Created at"],...r.map(x=>[x.id,x.name,x.owner,x.pay,x.ai,x.created_at])];
 }else if(kind==="subscriptions"){
  const r=await database()`SELECT s.workspace_id,w.name,s.plan_id,s.plan_version_id,s.started_at,s.paid_until,s.grace_until
   FROM pg13_subscriptions s JOIN workspaces w ON w.id=s.workspace_id
   WHERE (${q}='' OR w.name ILIKE ${term} OR s.plan_id ILIKE ${term}) ORDER BY s.started_at DESC LIMIT 5000`;
  rows=[["Workspace ID","Workspace","Plan","Plan version ID","Started at","Paid until","Grace until"],
  ...r.map(x=>[x.workspace_id,x.name,x.plan_id,x.plan_version_id,x.started_at,x.paid_until,x.grace_until])];
 }else if(kind==="invoices"){
  const r=await database()`SELECT i.id,i.workspace_id,w.name,i.plan_id,i.amount_minor,i.status,i.created_at,i.paid_at
   FROM pg13_platform_invoices i JOIN workspaces w ON w.id=i.workspace_id
   WHERE (${q}='' OR w.name ILIKE ${term} OR i.id::text ILIKE ${term})
   ORDER BY i.created_at DESC LIMIT 5000`;
  rows=[["Invoice ID","Workspace ID","Workspace","Plan","Amount minor BDT","Status","Created at","Paid at"],
  ...r.map(x=>[x.id,x.workspace_id,x.name,x.plan_id,x.amount_minor,x.status,x.created_at,x.paid_at])];
 }else if(kind==="users"||kind==="staff"){
  const r=await database()`SELECT u.id,u.display_name,u.email,u.email_verified_at,u.disabled_at,u.created_at,p.role FROM app_users u LEFT JOIN platform_administrators p ON p.user_id=u.id
   WHERE (${q}='' OR u.display_name ILIKE ${term} OR u.email ILIKE ${term} OR u.id::text ILIKE ${term})
   AND (${kind}='users' OR p.user_id IS NOT NULL) ORDER BY u.created_at DESC LIMIT 5000`;
  rows=[["User ID","Name","Email","Verified","Disabled","Admin role","Created at"],...r.map(x=>[x.id,x.display_name,x.email,!!x.email_verified_at,!!x.disabled_at,x.role,x.created_at])];
 }else{
  const r=await database()`SELECT a.id,a.actor_id,a.action,a.subject_id,a.description,a.occurred_at,u.email FROM platform_admin_audit a LEFT JOIN app_users u ON u.id=a.actor_id
   WHERE (${q}='' OR a.action ILIKE ${term} OR u.email ILIKE ${term}) ORDER BY a.occurred_at DESC,a.id DESC LIMIT 5000`;
  rows=[["Audit ID","Time","Actor ID","Actor email","Action","Subject ID","Description"],...r.map(x=>[x.id,x.occurred_at,x.actor_id,x.email,x.action,x.subject_id,x.description])];
 }
 // Record the filter and size, never exported personal records, in the protected audit trail.
 await database()`INSERT INTO platform_admin_audit(actor_id,action,description)
  VALUES (${admin.user.id}::uuid,'admin.csv_export',${"Export "+kind+" | filter="+q.slice(0,80)+" | rows="+String(Math.max(0,rows.length-1))})`;
 return new NextResponse(csv(rows),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="ekmivo-admin-'+kind+'-'+new Date().toISOString().slice(0,10)+'.csv"',"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
