import {UnifiedMerchantRoute} from "../../../../components/unified-merchant-route";
export const dynamic="force-dynamic";
export default async function SmsDataPage({params}:{params:Promise<{locale:string;view?:string[]}>}){
 const {locale,view}=await params;
 return <UnifiedMerchantRoute locale={locale} root="sms-data" view={view??[]}/>;
}
