import {UnifiedMerchantRoute} from "../../../../components/unified-merchant-route";

export const dynamic="force-dynamic";
export default async function PaymentsPage({params}:{
 params:Promise<{locale:string;view?:string[]}>;
}){
 const {locale,view}=await params;
 return <UnifiedMerchantRoute locale={locale} root="payments" view={view??[]}/>;
}
