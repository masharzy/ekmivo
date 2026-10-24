import {UnifiedMerchantRoute} from "../../../../components/unified-merchant-route";

export const dynamic="force-dynamic";
export default async function PaymentsPage({params,searchParams}:{
 params:Promise<{locale:string;view?:string[]}>;
 searchParams:Promise<{view?:string|string[]}>;
}){
 const {locale,view}=await params;
 const query=await searchParams;
 // Only this non-financial presentation mode is accepted from the URL.
 // Tenant, financial realm and read permissions remain server-selected.
 return <UnifiedMerchantRoute locale={locale} root="payments" view={view??[]}
  paymentLinksMode={query.view==="requests"?"requests":undefined}/>;
}
