import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {PaymentGatewayPage} from "../../../components/public-product-pages";

export const metadata:Metadata={title:"Payment Gateway | Ekmivo"};
export default async function Page({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(locale!=="en"&&locale!=="bn")notFound();
 return <PaymentGatewayPage locale={locale}/>;
}
