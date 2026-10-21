import "server-only";
import Link from "next/link";
import {publicSubscriptionOffers} from "../lib/server/public-subscription-offers";
import {SubscriptionOfferPricing} from "./subscription-offer-pricing";

export async function PublicSubscriptionOfferSlot({
 locale,product
}:{locale:"en"|"bn";product:"ai_credit"|"bundle"}){
 const {offers,unavailable}=await publicSubscriptionOffers();
 const published=offers.filter(offer=>offer.product===product);
 if(unavailable)return <p role="status" className="mp-message">{locale==="bn"?"বর্তমানে অফারের তথ্য পাওয়া যাচ্ছে না।":"Offer pricing is temporarily unavailable."}</p>;
 if(!published.length)return <p className="mp-message">{locale==="bn"?"এই পণ্যের কোনো অনুমোদিত মূল্য এখনো প্রকাশ করা হয়নি।":"No approved price is published for this product yet."} <Link href="/pricing">{locale==="bn"?"সব প্ল্যান দেখুন":"View all plans"}</Link></p>;
 return <SubscriptionOfferPricing locale={locale} offers={published} compact/>;
}
