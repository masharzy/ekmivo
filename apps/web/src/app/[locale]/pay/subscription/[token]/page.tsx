import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {CheckoutExperience} from "../../../../../components/checkout-experience";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Pay Ekmivo · Secure checkout",robots:{index:false,follow:false},referrer:"no-referrer"};

// The platform subscription payment is intentionally separate from the
// seller-facing /pay/[token] document checkout and the order summary.
export default async function SubscriptionPaymentPage({params}:{params:Promise<{locale:string;token:string}>}){
 const {locale,token}=await params;
 if((locale!=="bn"&&locale!=="en")||!/^[A-Za-z0-9_-]{43}$/.test(token))notFound();
 return <CheckoutExperience locale={locale} token={token}/>;
}
