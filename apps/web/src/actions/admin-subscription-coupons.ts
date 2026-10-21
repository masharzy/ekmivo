"use server";
import {revalidatePath} from "next/cache";
import {requireSuperAdmin} from "../lib/server/platform-admin";
import {database} from "../lib/server/db";
import {parseBdtMinor,parsePercentageBps} from "../lib/subscription-coupons";

export type CouponAdminState={status:"idle"|"error"|"success";message:string};
const field=(form:FormData,key:string)=>String(form.get(key)||"").trim();
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const invalid=(message:string):CouponAdminState=>({status:"error",message});
function optionalInteger(v:string,max:number):number|null|undefined{
 if(!v)return null;
 if(!/^[1-9]\d*$/.test(v))return undefined;
 const n=Number(v);return Number.isSafeInteger(n)&&n<=max?n:undefined;
}
function errorMessage(e:unknown){
 const code=e&&typeof e==="object"&&"code" in e?String(e.code):"";
 if(code==="42501")return "Permission denied. Refresh your Admin session and MFA.";
 if(code==="40001")return "Another admin changed this coupon. Refresh and retry.";
 if(code==="23505")return "This coupon code already exists.";
 if(["22023","22P02","22007","22008","23514","P0002"].includes(code))return "Invalid coupon fields, eligibility, revision or status transition.";
 return "Coupon service is unavailable. No change was confirmed.";
}
export async function saveSubscriptionCoupon(_previous:CouponAdminState,form:FormData):Promise<CouponAdminState>{
 const admin=await requireSuperAdmin();if(!admin)return invalid("Super Admin and MFA verification are required.");
 const id=field(form,"id"),code=field(form,"code").toUpperCase(),kind=field(form,"discount_kind");
 const reason=field(form,"reason"),revision=field(form,"revision");
 const value=field(form,"discount_value");
 const percent=kind==="percent"?parsePercentageBps(value):null;
 const fixed=kind==="fixed"?parseBdtMinor(value):null;
 const minimum=parseBdtMinor(field(form,"min_subtotal")||"0");
 const cap=field(form,"max_discount")?parseBdtMinor(field(form,"max_discount")):null;
 const maximum=optionalInteger(field(form,"max_redemptions"),100000000);
 const perStore=optionalInteger(field(form,"max_per_store"),1000000);
 const starts=field(form,"starts_at"),expires=field(form,"expires_at");
 const eligible=field(form,"eligible_offers").split(",").map(x=>x.trim()).filter(Boolean);
 if((id&&!uuid.test(id))||(id&&!/^[1-9]\d*$/.test(revision))
  ||!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)||!(kind==="fixed"||kind==="percent")
  ||(kind==="percent"&&percent===null)||(kind==="fixed"&&(fixed===null||fixed<=0))
  ||minimum===null||cap!==null&&cap<=0||maximum===undefined||perStore===undefined
  ||reason.length<10||reason.length>500||eligible.length>100
  ||eligible.some(x=>!/^[a-z][a-z0-9_-]{2,63}$/.test(x))
  ||(starts&&!Number.isFinite(Date.parse(starts)))||(expires&&!Number.isFinite(Date.parse(expires)))
  ||(expires&&(!starts||Date.parse(expires)<=Date.parse(starts))))
  return invalid("Check the code, amount, offer keys, date range and 10–500 character audit reason.");
 const payload={id:id||null,revision:id?Number(revision):null,code,discount_kind:kind,
  percent_bps:percent,fixed_minor:fixed,max_discount_minor:cap,min_subtotal_minor:minimum,
  max_redemptions:maximum,max_per_store:perStore,
  first_purchase_only:form.get("first_purchase_only")==="on",
  stack_with_annual:form.get("stack_with_annual")==="on",
  stack_with_bundle:form.get("stack_with_bundle")==="on",
  eligible_offer_keys:eligible,starts_at:starts?starts+"Z":null,expires_at:expires?expires+"Z":null,reason};
 try{
  const sql=database();
  await sql`SELECT platform_subscription_coupon_admin(${admin.user.id}::uuid,'save',${sql.json(payload as never)}::jsonb)`;
  for(const loc of ["bn","en"])revalidatePath(`/${loc}/admin/billing/coupons`);
  return {status:"success",message:"Coupon saved as a draft. Publish it separately when ready."};
 }catch(e){return invalid(errorMessage(e));}
}

export async function transitionSubscriptionCoupon(_previous:CouponAdminState,form:FormData):Promise<CouponAdminState>{
 const admin=await requireSuperAdmin();if(!admin)return invalid("Super Admin and MFA verification are required.");
 const id=field(form,"id"),revision=field(form,"revision"),status=field(form,"status"),reason=field(form,"reason");
 if(!uuid.test(id)||!/^[1-9]\d*$/.test(revision)||!["active","scheduled","paused","archived","expired"].includes(status)
   ||reason.length<10||reason.length>500)return invalid("Choose a valid status and explain the change (10–500 characters).");
 try{
  const sql=database();
  await sql`SELECT platform_subscription_coupon_admin(${admin.user.id}::uuid,'transition',${sql.json({id,revision:Number(revision),status,reason} as never)}::jsonb)`;
  for(const loc of ["bn","en"])revalidatePath(`/${loc}/admin/billing/coupons`);
  return {status:"success",message:"Coupon status updated. Refresh to see the current revision."};
 }catch(e){return invalid(errorMessage(e));}
}
