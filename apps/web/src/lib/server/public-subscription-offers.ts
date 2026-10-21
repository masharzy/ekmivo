import "server-only";
import {cache} from "react";
import {database} from "./db";
import {parsePublishedSubscriptionOffer,type PublishedSubscriptionOffer} from "../public-subscription-offers";

/** Public projection ONLY: no drafts, private plans, arbitrary prices, or buyer identifiers. */
export const publicSubscriptionOffers=cache(async function publicSubscriptionOffers():Promise<{offers:PublishedSubscriptionOffer[];unavailable:boolean}>{
 try {
  const rows=await database()`SELECT o.offer_key AS key,o.product,v.id::text AS version_id,v.term,
    v.amount_minor::text AS amount_minor,v.currency,v.payment_plan_version_id::text AS gateway_plan_version_id,
    v.terms->>'name' AS name,coalesce(v.terms->>'name_bn','') AS name_bn,
    coalesce(v.terms->>'description','') AS description,
    coalesce(v.terms->>'description_bn','') AS description_bn,
    v.terms->>'included_ai_credits' AS included_ai_credits
   FROM platform_subscription_offers o
   JOIN platform_subscription_offer_versions v
    ON v.offer_key=o.offer_key AND v.id=o.current_version_id
   LEFT JOIN payment_plan_catalog c ON c.current_version=v.payment_plan_version_id
   WHERE o.status='published' AND v.amount_minor>0 AND v.currency='BDT'
    AND (o.product='ai_credit' OR
      (c.status='published' AND c.visibility='public'))
   ORDER BY o.offer_key LIMIT 100`;
  const offers=rows.map(parsePublishedSubscriptionOffer).filter((v):v is PublishedSubscriptionOffer=>v!==null);
  return {offers,unavailable:false};
 }catch{
  // An unapplied additive catalog migration must never fabricate paid prices
  // or break the existing Gateway plan fallback.
  return {offers:[],unavailable:true};
 }
});
