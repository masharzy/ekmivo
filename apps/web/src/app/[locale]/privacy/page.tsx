import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {PrivacyPolicyPage} from "../../../components/legal-pages";

export const metadata:Metadata={title:"Privacy Policy | Ekmivo",description:"How Ekmivo handles account, payment and connected social-channel information, and how to request access or deletion."};
export default async function Page({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(locale!=="bn"&&locale!=="en")notFound();
 return <PrivacyPolicyPage locale={locale}/>;
}
