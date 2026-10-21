import {NextResponse} from "next/server";
import {publicSubscriptionOffers} from "../../../../lib/server/public-subscription-offers";
import {quotePublishedPrice} from "../../../../lib/public-subscription-quote";
import type {SubscriptionTerm} from "../../../../lib/public-subscription-offers";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, max-age=0"};
/** Read-only price recheck; NEVER issues a payment intent or accepts a client amount. */
export async function GET(request:Request){
 const url=new URL(request.url),key=url.searchParams.get("offer")||"",
  version_id=url.searchParams.get("version")||"",term=url.searchParams.get("term")||"";
 if(url.searchParams.getAll("offer").length!==1||url.searchParams.getAll("version").length!==1
  ||url.searchParams.getAll("term").length!==1||!["monthly","yearly","one_time"].includes(term))
  return NextResponse.json({code:"INVALID_SELECTION"},{status:400,headers});
 const catalog=await publicSubscriptionOffers();
 if(catalog.unavailable)return NextResponse.json({code:"PRICING_UNAVAILABLE"},{status:503,headers});
 const result=quotePublishedPrice(catalog.offers,{key,version_id,term:term as SubscriptionTerm});
 if(result.status!=="ok")return NextResponse.json(
  {code:result.status==="price_changed"?"PRICE_CHANGED":result.status==="not_found"?"OFFER_UNAVAILABLE":"INVALID_SELECTION"},
  {status:result.status==="price_changed"?409:result.status==="not_found"?404:400,headers});
 // Catalog-only: no tax, coupon, grand total, order ID, wallet or activation claim.
 return NextResponse.json({
  offer_key:result.offer.key,version_id:result.offer.version_id,product:result.offer.product,
  term:result.offer.term,currency:result.currency,
  catalog_price_minor:result.catalog_price_minor,
  gateway_plan_version_id:result.offer.gateway_plan_version_id,
  included_ai_credits:result.offer.included_ai_credits,
  checkout_enabled:false
 },{headers});
}
