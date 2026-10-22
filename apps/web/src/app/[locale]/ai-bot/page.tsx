import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {MarketingAiBotPage} from "../../../components/public-marketing-pages";

export const metadata:Metadata={title:"AI Bot | Ekmivo",description:"AI customer conversations with Store knowledge, a shared inbox and human handoff."};
export default async function Page({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(locale!=="en"&&locale!=="bn")notFound();
 return <MarketingAiBotPage locale={locale}/>;
}
