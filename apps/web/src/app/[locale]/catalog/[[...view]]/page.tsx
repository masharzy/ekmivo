import {redirect} from "next/navigation";
import {UnifiedMerchantRoute} from "../../../../components/unified-merchant-route";

export const dynamic="force-dynamic";
export default async function CatalogPage({params}:{
 params:Promise<{locale:string;view?:string[]}>;
}){
 const {locale,view}=await params;
 if(!view?.length)redirect("/catalog/products");
 return <UnifiedMerchantRoute locale={locale} root="catalog" view={view}/>;
}
