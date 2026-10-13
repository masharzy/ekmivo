import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {ComingSoonPage} from "../../../components/public-product-pages";

export const metadata:Metadata={title:"AI Bot — Coming Soon | Ekmivo"};
export default async function Page({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(locale!=="en"&&locale!=="bn")notFound();
 return <ComingSoonPage locale={locale} kind="ai-bot"/>;
}
