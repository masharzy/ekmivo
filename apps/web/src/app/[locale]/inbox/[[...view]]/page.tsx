import {UnifiedMerchantRoute} from "../../../../components/unified-merchant-route";

export const dynamic="force-dynamic";
export default async function InboxPage({params,searchParams}:{
 params:Promise<{locale:string;view?:string[]}>;searchParams:Promise<{thread?:string|string[]}>;
}){
 const {locale,view}=await params;const query=await searchParams;
 return <UnifiedMerchantRoute locale={locale} root="inbox" view={view??[]} thread={typeof query.thread==="string"?query.thread:undefined}/>;
}
