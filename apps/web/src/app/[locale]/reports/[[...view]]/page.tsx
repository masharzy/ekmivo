import {UnifiedMerchantRoute} from "../../../../components/unified-merchant-route";

export const dynamic="force-dynamic";
export default async function ReportsPage({params,searchParams}:{
 params:Promise<{locale:string;view?:string[]}>;
 searchParams:Promise<Record<string,string|string[]|undefined>>;
}){
 const {locale,view}=await params;
 return <UnifiedMerchantRoute locale={locale} root="reports" view={view??[]} reportFilters={await searchParams}/>;
}
