"use server";
import {revalidatePath} from "next/cache";
import {database} from "../lib/server/db";
import {requireSuperAdmin} from "../lib/server/platform-admin";

export type LegalActionState={status:"idle"|"error"|"success";message:string};
const field=(form:FormData,key:string)=>String(form.get(key)||"").trim();
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const fail=(msg:string):LegalActionState=>({status:"error",message:msg});
function legalUrl(raw:string){try{const u=new URL(raw);return u.protocol==="https:"&&u.username===""&&u.password===""&&!u.hash&&u.hostname.length>3&&raw.length<=2000?u.href:null;}catch{return null;}}
function respondError(error:unknown):LegalActionState{
 const code=error&&typeof error==="object"&&"code" in error?String(error.code):"";
 if(code==="23505")return fail("That policy version is already registered. Use a new immutable version label.");
 if(code==="42501")return fail("Super Admin and MFA verification required.");
 if(["22023","22P02","23514","P0002"].includes(code))return fail("Invalid policy or version transition. Refresh and check the submitted values.");
 return fail("Legal policy service unavailable. No change was confirmed.");
}
function refresh(){for(const locale of ["bn","en"]){revalidatePath(`/${locale}/admin/settings/legal-contact`);revalidatePath(`/${locale}/checkout/order/[intent]`,"page");}}

export async function createSubscriptionPolicy(_prev:LegalActionState,form:FormData):Promise<LegalActionState>{
 const admin=await requireSuperAdmin();if(!admin)return fail("Super Admin and MFA verification required.");
 const kind=field(form,"kind"),version_label=field(form,"version_label"),url=legalUrl(field(form,"url"));
 const content_sha256=field(form,"content_sha256").toLowerCase(),reason=field(form,"reason");
 if(!["terms","privacy","refund"].includes(kind)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version_label)
  ||!url||!/^[0-9a-f]{64}$/.test(content_sha256)||reason.length<10||reason.length>500)
  return fail("Provide the kind, immutable version, public HTTPS URL without fragments, SHA-256 and 10+ character reason.");
 try{
  const sql=database();await sql`SELECT platform_subscription_policy_admin(${admin.user.id}::uuid,'create',${sql.json({kind,version_label,url,content_sha256,reason} as never)}::jsonb)`;
  refresh();return {status:"success",message:"Draft legal policy recorded. Publish it only after approval."};
 }catch(error){return respondError(error);}
}
export async function transitionSubscriptionPolicy(_prev:LegalActionState,form:FormData):Promise<LegalActionState>{
 const admin=await requireSuperAdmin();if(!admin)return fail("Super Admin and MFA verification required.");
 const id=field(form,"id"),op=field(form,"op"),reason=field(form,"reason");
 if(!uuid.test(id)||!["publish","archive"].includes(op)||reason.length<10||reason.length>500)
  return fail("Select a document version and provide a 10–500 character audit reason.");
 try{
  const sql=database();await sql`SELECT platform_subscription_policy_admin(${admin.user.id}::uuid,${op},${sql.json({id,reason} as never)}::jsonb)`;
  refresh();return {status:"success",message:op==="publish"?"New version published; older version archived atomically.":"Policy archived. Checkout will require another published version."};
 }catch(error){return respondError(error);}
}
