import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {CheckoutExperience} from "../../../../components/checkout-experience";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Secure sandbox checkout · Ekmivo",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function CheckoutPage({params,searchParams}:{params:Promise<{locale:string;token:string}>;searchParams:Promise<{method?:string}>}){
 const [{locale,token},query]=await Promise.all([params,searchParams]);
 if(locale!=="bn"&&locale!=="en"||!/^[A-Za-z0-9_-]{43}$/.test(token))notFound();
 return <CheckoutExperience locale={locale} token={token} initialMethod={query.method==="bkash"||query.method==="nagad"||query.method==="rocket"?query.method:undefined}/>;
}
