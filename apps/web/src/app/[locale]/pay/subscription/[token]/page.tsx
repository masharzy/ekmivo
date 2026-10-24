import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {requireUser,hashToken} from "../../../../../lib/server/auth";
import {database} from "../../../../../lib/server/db";
import {CheckoutExperience} from "../../../../../components/checkout-experience";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Pay Ekmivo subscription · Secure checkout",robots:{index:false,follow:false},referrer:"no-referrer"};

// A seller /pay/{documentToken} is never accepted as an Ekmivo subscription.
// The URL token alone does not authorize a Store Billing lookup: require the
// current verified session, exact primary Store and issued capability digest.
export default async function SubscriptionPaymentPage({params}:{params:Promise<{locale:string;token:string}>}){
 const {locale,token}=await params;
 if((locale!=="bn"&&locale!=="en")||!/^[A-Za-z0-9_-]{43}$/.test(token)||
   process.env.EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED!=="true")notFound();
 const user=await requireUser(locale);
 let purchase:{intent_id:string;workspace_id:string}|null=null;
 try{
  const [row]=await database()`SELECT platform_subscription_payment_capability(${user.id}::uuid,${hashToken(token)}) AS payment`;
  const value=row?.payment;
  if(value && typeof value==="object"&&typeof value.intent_id==="string"&&typeof value.workspace_id==="string")
   purchase={intent_id:value.intent_id,workspace_id:value.workspace_id};
 }catch{notFound()}
 if(!purchase)notFound();
 return <CheckoutExperience locale={locale} token={token}
  subscriptionReturnPath={`/checkout/order/${purchase.intent_id}/status`}/>;
}
