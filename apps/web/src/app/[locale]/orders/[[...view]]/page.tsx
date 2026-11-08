import {redirect} from "next/navigation";
import {UnifiedMerchantRoute} from "../../../../components/unified-merchant-route";

export const dynamic="force-dynamic";
export default async function OrdersPage({params}:{
 params:Promise<{locale:string;view?:string[]}>;
}){
 const {locale,view}=await params;
 // Products, stock and coupons moved to the Catalog menu; keep old links working.
 if(["products","inventory","coupons"].includes(view?.[0]??""))redirect(`/catalog/${view!.join("/")}`);
 return <UnifiedMerchantRoute locale={locale} root="orders" view={view??[]}/>;
}
