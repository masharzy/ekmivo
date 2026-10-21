import "server-only";
import {cache} from "react";
import {database} from "./db";
import {parsePublishedSubscriptionOffer,type PublishedSubscriptionOffer} from "../public-subscription-offers";

/** Public projection ONLY: no drafts, private plans, arbitrary prices, or buyer identifiers. */
export const publicSubscriptionOffers=cache(async function publicSubscriptionOffers():Promise<{offers:PublishedSubscriptionOffer[];unavailable:boolean}>{
 try {
  // SECURITY DEFINER projection v0144: the runtime cannot bypass owner-only RLS
  // on the raw tables. This function returns only published, current, public offers.
  const rows=await database()`SELECT public.platform_subscription_offers_public() AS offers`;
  const raw=rows[0]?.offers;
  if(!Array.isArray(raw))return {offers:[],unavailable:true};
  const offers=raw.map(parsePublishedSubscriptionOffer).filter((v):v is PublishedSubscriptionOffer=>v!==null);
  return {offers,unavailable:false};
 }catch{
  // An unapplied additive catalog migration must never fabricate paid prices
  // or break the existing Gateway plan fallback.
  return {offers:[],unavailable:true};
 }
});
