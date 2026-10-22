import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../../../../../lib/server/auth";
import {SubscriptionPaymentStatus} from "../../../../../components/subscription-payment-status";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Subscription payment status · Ekmivo",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function SubscriptionOrderStatusPage({params}:{params:Promise<{locale:string;plan:string}>}){
 const {locale,plan}=await params;
 if((locale!=="en"&&locale!=="bn")||
  !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(plan)||
  process.env.EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED!=="true")notFound();
 const user=await requireUser(locale);
 const store=await preferredWorkspaceFor(user.id);
 if(!store)notFound();
 return <SubscriptionPaymentStatus workspace={store.id} intent={plan} locale={locale}/>;
}
