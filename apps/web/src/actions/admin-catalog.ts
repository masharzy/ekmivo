"use server";
import {revalidatePath} from "next/cache";
import {createHash} from "node:crypto";
import {database} from "../lib/server/db";
import {requireFreshSuperAdmin} from "../lib/server/platform-admin";
export type AdminCatalogState={status:"idle"|"success"|"error";message:string};
const codePattern=/^[a-z][a-z0-9_]{1,39}$/;
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const field=(form:FormData,key:string)=>String(form.get(key)||"").trim();
const result=(status:AdminCatalogState["status"],message:string):AdminCatalogState=>({status,message});
const supported=new Set(["bkash","nagad","rocket"]);
function validateLogo(s:string){
 if(!s)return true;
 if(/^\/api\/provider-logos\/[a-f0-9]{64}$/.test(s))return true;
 if(s.startsWith("/payment-assets/"))return /^[\/a-zA-Z0-9_.-]+$/.test(s);
 if(/^https:\/\//.test(s))return s.length<2048;
 return /^data:image\/(?:png|webp|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(s)&&s.length<=700000;
}
export async function saveAdminProvider(_previous:AdminCatalogState,form:FormData):Promise<AdminCatalogState>{
 const actor=await requireFreshSuperAdmin();if(!actor)return result("error","Super Admin MFA verification is required.");
 const code=field(form,"code").toLowerCase(),name=field(form,"name"),status=field(form,"status"),type=field(form,"type");
 const order=Number(field(form,"sort_order")),reason=field(form,"reason");
 const visible=form.get("visible")==="on",checkout=form.get("checkout")==="on",live=form.get("live")==="on";
 if(!codePattern.test(code)||name.length<2||name.length>90||!["draft","published","retired"].includes(status)
 ||!["Mobile wallet","Bank","Other"].includes(type)||!Number.isInteger(order)||order<0||order>100000||reason.length<10||reason.length>500)
  return result("error","Check required values and provide a reason (10–500 characters).");
 const runtimeSupported=supported.has(code);
 if(status==="published"&&!runtimeSupported)return result("error","This provider has no Go verification parser. Keep it as a draft until the runtime supports it.");
 if((live||checkout)&&status!=="published")return result("error","Checkout and live availability require a published provider.");
 if(live&&!checkout)return result("error","Live availability requires checkout to be enabled.");
 let logo=field(form,"logo_url");
 const uploaded=form.get("logo_file");
 let asset:{hash:string;contentType:string;bytes:Buffer}|null=null;
 if(uploaded instanceof File&&uploaded.size>0){
  if(uploaded.size>512000||!["image/png","image/webp","image/jpeg"].includes(uploaded.type))return result("error","Upload a PNG, WebP or JPEG up to 500 KB.");
  const bytes=Buffer.from(await uploaded.arrayBuffer());
  const png=bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=bytes.length>=12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
  if((uploaded.type==="image/png"&&!png)||(uploaded.type==="image/jpeg"&&!jpg)||(uploaded.type==="image/webp"&&!webp))
   return result("error","Image format and file contents do not match.");
  const hash=createHash("sha256").update(bytes).digest("hex");
  asset={hash,contentType:uploaded.type,bytes};
  logo="/api/provider-logos/"+hash;
 }
 if(!validateLogo(logo))return result("error","Logo must be a safe HTTPS URL, local asset path, or approved image upload.");
 try{
  await database().begin(async tx=>{
   const roles=await tx`SELECT 1 FROM platform_administrators WHERE user_id=${actor.user.id}::uuid AND role='super_admin' FOR UPDATE`;
   if(!roles.length)throw Error("PERMISSION");
   const prev=await tx`SELECT code,display_name,provider_type,status,visible_in_add_account,checkout_enabled,live_enabled,sort_order FROM platform_payment_providers WHERE code=${code} FOR UPDATE`;
   const action=prev.length?"updated":"created";
   if(asset){
    await tx`INSERT INTO platform_provider_assets(digest,content_type,bytes,created_by)
      VALUES (${asset.hash},${asset.contentType},${asset.bytes},${actor.user.id}::uuid)
      ON CONFLICT(digest) DO NOTHING`;
   }
   await tx`INSERT INTO platform_payment_providers(code,display_name,logo_url,provider_type,status,visible_in_add_account,checkout_enabled,live_enabled,verification_supported,sort_order,updated_by)
    VALUES (${code},${name},${logo},${type},${status},${visible},${checkout},${live},${runtimeSupported},${order},${actor.user.id}::uuid)
    ON CONFLICT(code) DO UPDATE SET display_name=EXCLUDED.display_name,logo_url=EXCLUDED.logo_url,provider_type=EXCLUDED.provider_type,
    status=EXCLUDED.status,visible_in_add_account=EXCLUDED.visible_in_add_account,checkout_enabled=EXCLUDED.checkout_enabled,
    live_enabled=EXCLUDED.live_enabled,sort_order=EXCLUDED.sort_order,updated_by=EXCLUDED.updated_by,updated_at=now()`;
   await tx`INSERT INTO platform_admin_audit(actor_id,action,description) VALUES(${actor.user.id}::uuid,${"provider."+action},${code+" | "+name+" | "+status+" | "+reason})`;
  });
  for(const locale of ["en","bn"])revalidatePath("/"+locale+"/admin/providers");
  revalidatePath("/api/payment-providers");
  return result("success","Payment provider saved.");
 }catch(e){console.error("[admin/catalog provider]",e instanceof Error?e.name:"unknown");return result("error","Provider could not be saved. Check the catalog migration and try again.");}
}
export async function adjustAdminAiCredits(_previous:AdminCatalogState,form:FormData):Promise<AdminCatalogState>{
 const actor=await requireFreshSuperAdmin();if(!actor)return result("error","Super Admin MFA verification is required.");
 const workspace=field(form,"workspace_id"),delta=Number(field(form,"delta")),reason=field(form,"reason");
 if(!uuid.test(workspace)||!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>1000000||reason.length<10||reason.length>500)
  return result("error","Choose a workspace, a nonzero credit amount (up to one million), and an audit reason.");
 try{
  await database().begin(async tx=>{
   const [actorRows,workspaces]=await Promise.all([
    tx`SELECT 1 FROM platform_administrators WHERE user_id=${actor.user.id}::uuid AND role='super_admin' FOR UPDATE`,
    tx`SELECT id FROM workspaces WHERE id=${workspace}::uuid LIMIT 1`
   ]);
   if(!actorRows.length||!workspaces.length)throw Error("PERMISSION");
   await tx`INSERT INTO platform_ai_credit_balances(workspace_id,balance) VALUES(${workspace}::uuid,0) ON CONFLICT(workspace_id) DO NOTHING`;
   const old=await tx`SELECT balance FROM platform_ai_credit_balances WHERE workspace_id=${workspace}::uuid FOR UPDATE`;
   const next=Number(old[0].balance)+delta;
   if(!Number.isSafeInteger(next)||next<0)throw Error("BALANCE");
   await tx`UPDATE platform_ai_credit_balances SET balance=${next},updated_at=now() WHERE workspace_id=${workspace}::uuid`;
   await tx`INSERT INTO platform_ai_credit_ledger(workspace_id,actor_id,delta,balance_after,reason)
    VALUES(${workspace}::uuid,${actor.user.id}::uuid,${delta},${next},${reason})`;
   await tx`INSERT INTO platform_admin_audit(actor_id,action,subject_id,description)
    VALUES(${actor.user.id}::uuid,'ai_credits.adjusted',${workspace}::uuid,${"delta="+delta+"; balance="+next+" | "+reason})`;
  });
  for(const locale of ["en","bn"])revalidatePath("/"+locale+"/admin/credits");
  return result("success","Credit adjustment saved to the immutable ledger.");
 }catch(e){console.error("[admin/credits]",e instanceof Error?e.message:"unknown");return result("error","Could not adjust credits. Check the balance, permissions or migration.");}
}

/** Super Admin can provision a workspace for an already-verified merchant, using the same
    workspaces/workspace_members schema as the normal onboarding action. */
export async function createAdminWorkspace(_previous:AdminCatalogState,form:FormData):Promise<AdminCatalogState>{
 const actor=await requireFreshSuperAdmin();if(!actor)return result("error","Fresh Super Admin MFA is required.");
 const name=field(form,"name"),email=field(form,"owner_email").toLowerCase(),mode=field(form,"mode"),reason=field(form,"reason");
 if(name.length<2||name.length>60||!/^\S+@\S+\.\S+$/.test(email)||!["commerce","ai","both"].includes(mode)||reason.length<10||reason.length>500)
  return result("error","Enter a name (2–60), existing owner email, product and audit reason.");
 try{
  await database().begin(async tx=>{
   const roles=await tx`SELECT 1 FROM platform_administrators WHERE user_id=${actor.user.id}::uuid AND role='super_admin' FOR UPDATE`;
   if(!roles.length)throw Error("PERMISSION");
   const owners=await tx`SELECT id FROM app_users WHERE lower(email)=${email} AND email_verified_at IS NOT NULL AND disabled_at IS NULL LIMIT 1`;
   if(!owners.length)throw Error("OWNER_NOT_VERIFIED");
   const w=await tx`INSERT INTO workspaces(name,service_mode,created_by) VALUES (${name},${mode},${owners[0].id}::uuid) RETURNING id`;
   await tx`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (${w[0].id}::uuid,${owners[0].id}::uuid,'owner')`;
   await tx`INSERT INTO platform_admin_audit(actor_id,action,subject_id,description)
    VALUES(${actor.user.id}::uuid,'workspace.admin_created',${w[0].id}::uuid,${"name="+name+"; owner="+email+"; mode="+mode+" | "+reason})`;
  });
  for(const locale of ["en","bn"])revalidatePath("/"+locale+"/admin/workspaces");
  return result("success","Workspace created for the verified owner.");
 }catch(e){console.error("[admin/workspace create]",e instanceof Error?e.name:"unknown");return result("error","Could not create workspace. Confirm the owner's email is verified and enabled.");}
}
