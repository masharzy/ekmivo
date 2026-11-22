import {UnifiedMerchantRoute} from "../../../../components/unified-merchant-route";

export const dynamic="force-dynamic";
export default async function PaymentsPage({params,searchParams}:{
 params:Promise<{locale:string;view?:string[]}>;
 searchParams:Promise<{list?:string|string[]}>;
}){
 const {locale,view}=await params;
 const query=await searchParams;
 // Only this non-financial presentation mode is accepted from the URL.
 // The key is "list", not "view": "view" is this route's catch-all segment
 // name, and Next.js drops a search param with that name after the proxy
 // rewrite, so ?view=requests never reached the page (owner, 2026-11-22).
 // Tenant, financial realm and read permissions remain server-selected.
 return <UnifiedMerchantRoute locale={locale} root="payments" view={view??[]}
  paymentLinksMode={query.list==="requests"?"requests":undefined}/>;
}
