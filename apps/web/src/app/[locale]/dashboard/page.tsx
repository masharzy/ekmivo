import {UnifiedMerchantRoute} from "../../../components/unified-merchant-route";

export const dynamic="force-dynamic";
export default async function DashboardPage({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 return <UnifiedMerchantRoute locale={locale} root="dashboard"/>;
}
