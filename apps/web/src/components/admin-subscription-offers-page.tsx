import {database} from "../lib/server/db";
import {publicPaymentPlans} from "../lib/server/payment-plans";
import {AdminSubscriptionOffers} from "./admin-subscription-offers";

export async function AdminSubscriptionOffersPage({locale,actor}:{locale:"bn"|"en";actor:string}){
 let offers:Parameters<typeof AdminSubscriptionOffers>[0]["offers"]|null=null;
 let plans:Parameters<typeof AdminSubscriptionOffers>[0]["plans"]|null=null;
 try{
  const sql=database();const [rows,catalogue]=await Promise.all([
   sql`SELECT platform_subscription_offer_admin(${actor}::uuid,'list','{}'::jsonb) AS data`,
   publicPaymentPlans()
  ]);
  if(catalogue.unavailable||!Array.isArray(rows[0]?.data?.offers))throw Error("OFFER_CATALOG_UNAVAILABLE");
  offers=rows[0].data.offers;
  plans=catalogue.plans.map(p=>({id:p.id,version_id:p.version_id,name:p.terms.name}));
 }catch{/* Render a safe unavailable state below. */}
 if(!offers||!plans)return <section role="alert" className="pa-surface pa-description">{locale==="bn"?"অফার ক্যাটালগ পাওয়া যাচ্ছে না। Control migration 0143 পরীক্ষা করুন।":"Offer catalog unavailable. Verify control migration 0143."}</section>;
 return <AdminSubscriptionOffers locale={locale} offers={offers} plans={plans}/>;
}
