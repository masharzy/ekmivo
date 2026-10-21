"use server";
import {revalidatePath} from "next/cache";
import {database} from "../lib/server/db";
import {requireSuperAdmin} from "../lib/server/platform-admin";
import {parseBdtMinor} from "../lib/subscription-coupons";

export type OfferActionState={status:"idle"|"error"|"success";message:string};
const fail=(message:string):OfferActionState=>({status:"error",message});
const field=(data:FormData,name:string)=>String(data.get(name)||"").trim();
const slug=/^[a-z][a-z0-9_-]{2,63}$/;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const success=(message:string):OfferActionState=>({status:"success",message});
function dbError(error:unknown):OfferActionState{
 const code=error&&typeof error==="object"&&"code" in error?String(error.code):"";
 if(code==="42501")return fail("Super Admin and MFA verification required.");
 if(code==="40001")return fail("Offer or source plan changed. Refresh and retry with the current version.");
 if(["22023","22P02","23514","P0002"].includes(code))return fail("Invalid offer, price or status. Verify the published Gateway plan and fields.");
 return fail("Offer catalog unavailable. No price update was confirmed.");
}
function refresh(){for(const locale of ["en","bn"])revalidatePath(`/${locale}/admin/billing/offers`);}

export async function draftSubscriptionOffer(_prior:OfferActionState,form:FormData):Promise<OfferActionState>{
 const admin=await requireSuperAdmin();if(!admin)return fail("Super Admin and MFA verification required.");
 const offer_key=field(form,"offer_key"),product=field(form,"product"),term=field(form,"term"),
  price=parseBdtMinor(field(form,"price_bdt")),plan=field(form,"payment_plan_version_id"),
  name=field(form,"name"),name_bn=field(form,"name_bn"),description=field(form,"description"),
  description_bn=field(form,"description_bn"),included=field(form,"included_ai_credits"),reason=field(form,"reason");
 if(!slug.test(offer_key)||!["payments","ai_credit","bundle"].includes(product)
  ||(product==="ai_credit"?term!=="one_time":!["monthly","yearly"].includes(term))
  ||price===null||price<=0||name.length<2||name.length>100||name_bn.length>120
  ||description.length>500||description_bn.length>500||reason.length<10||reason.length>500
  ||(product==="ai_credit"?!!plan:!uuid.test(plan))
  ||(product!=="payments"&&!/^[1-9][0-9]{0,11}$/.test(included)))return fail("Check the offer key, published plan, term, positive BDT price, AI credits and audit reason.");
 const terms:Record<string,string>={name,name_bn,description,description_bn};
 if(product!=="payments")terms.included_ai_credits=included;
 try{
  const sql=database();await sql`SELECT platform_subscription_offer_admin(${admin.user.id}::uuid,'draft',
   ${sql.json({offer_key,product,term,amount_minor:price,payment_plan_version_id:plan||null,terms,reason} as never)}::jsonb)`;
  refresh();return success("Immutable draft price saved. Publish a specific version after reviewing the offer.");
 }catch(error){return dbError(error);}
}

export async function transitionSubscriptionOffer(_prior:OfferActionState,form:FormData):Promise<OfferActionState>{
 const admin=await requireSuperAdmin();if(!admin)return fail("Super Admin and MFA verification required.");
 const offer_key=field(form,"offer_key"),op=field(form,"operation"),id=field(form,"version_id"),
  expected=field(form,"expected_current_version_id"),reason=field(form,"reason");
 if(!slug.test(offer_key)||!["publish","archive"].includes(op)||reason.length<10||reason.length>500
  ||(op==="publish"&&!uuid.test(id))||(expected!==""&&!uuid.test(expected)))return fail("Invalid version or audit reason.");
 try{
  const sql=database();await sql`SELECT platform_subscription_offer_admin(${admin.user.id}::uuid,${op},
   ${sql.json({offer_key,version_id:op==="publish"?id:null,expected_current_version_id:expected||null,reason} as never)}::jsonb)`;
  refresh();return success(op==="publish"?"Selected immutable offer version published.":"Offer archived. Existing invoices and versions are retained.");
 }catch(error){return dbError(error);}
}
