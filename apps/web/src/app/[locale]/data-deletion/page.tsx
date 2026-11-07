import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {DataDeletionPage} from "../../../components/legal-pages";

export const metadata:Metadata={title:"Data Deletion Instructions | Briofold",description:"Instructions for disconnecting Facebook, Instagram and WhatsApp integrations and requesting deletion of Briofold information."};
export default async function Page({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(locale!=="bn"&&locale!=="en")notFound();
 return <DataDeletionPage locale={locale}/>;
}
