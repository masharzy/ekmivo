import type {PublishedSubscriptionOffer,SubscriptionTerm} from "./public-subscription-offers";
export type PriceSelection={key:string;version_id:string;term:SubscriptionTerm};
export type PriceQuoteResult=
 |{status:"ok";offer:PublishedSubscriptionOffer;catalog_price_minor:string;currency:"BDT"}
 |{status:"invalid"|"not_found"|"price_changed"};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
/** Exact, version-pinned *catalog price* — not an issued invoice or payable tax quote. */
export function quotePublishedPrice(offers:readonly PublishedSubscriptionOffer[],request:PriceSelection):PriceQuoteResult{
 if(!/^[a-z][a-z0-9_-]{2,63}$/.test(request.key)||!uuid.test(request.version_id)
  ||!["monthly","yearly","one_time"].includes(request.term))return {status:"invalid"};
 const current=offers.find(o=>o.key===request.key);
 if(!current)return {status:"not_found"};
 if(current.version_id!==request.version_id||current.term!==request.term)return {status:"price_changed"};
 return {status:"ok",offer:current,catalog_price_minor:current.amount_minor,currency:"BDT"};
}
