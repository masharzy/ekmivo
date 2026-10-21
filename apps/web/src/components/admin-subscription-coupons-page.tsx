import {database} from "../lib/server/db";
import {AdminSubscriptionCoupons} from "./admin-subscription-coupons";
import type {SubscriptionCouponList} from "../lib/subscription-coupons";

export async function AdminSubscriptionCouponsPage({locale,actor,query,status,after}:{locale:"bn"|"en";actor:string;query:string;status:string;after:string}){
 const q=query.trim().slice(0,80);
 const state=["draft","scheduled","active","paused","expired","archived"].includes(status)?status:"all";
 const offset=/^(?:0|[1-9]\d{0,5})$/.test(after)?Math.min(Number(after),100000):0;
 let data:SubscriptionCouponList|null=null;
 try{
  const sql=database();
  const rows=await sql`SELECT platform_subscription_coupon_admin(${actor}::uuid,'list',${sql.json({query:q,status:state,offset} as never)}::jsonb) AS data`;
  const raw=rows[0]?.data as SubscriptionCouponList|undefined;
  if(!raw||!Array.isArray(raw.coupons))throw Error("NO_COUPONS_RESPONSE");
  const coupons=raw.coupons.map(c=>({...c,redeemed:Number(c.redeemed),reserved:Number(c.reserved),revision:Number(c.revision),max_redemptions:c.max_redemptions===null?null:Number(c.max_redemptions),max_per_store:c.max_per_store===null?null:Number(c.max_per_store),min_subtotal_minor:Number(c.min_subtotal_minor),max_discount_minor:c.max_discount_minor===null?null:Number(c.max_discount_minor),fixed_minor:c.fixed_minor===null?null:Number(c.fixed_minor),percent_bps:c.percent_bps===null?null:Number(c.percent_bps)}));
  data={coupons,next_offset:raw.next_offset};
 }catch{data=null;}
 if(!data)return <section className="pa-surface pa-description" role="alert"><h2>{locale==="bn"?"কুপন সার্ভিস পাওয়া যাচ্ছে না":"Subscription coupon service unavailable"}</h2><p>{locale==="bn"?"Control DB migration 0134 বা সঠিক পারমিশন যাচাই করুন।":"Check control database migration 0134 and the admin runtime permissions."}</p></section>;
 return <AdminSubscriptionCoupons locale={locale} data={data} query={q} status={state} offset={offset}/>;
}
