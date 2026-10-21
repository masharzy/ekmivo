import {CustomerVerify} from "../../../components/customer-verify";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{locale:string}>}){const {locale}=await params;return <CustomerVerify bn={locale==="bn"}/>;}
