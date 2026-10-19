import Image from "next/image";

export type MerchantBrandInfo={checkout_theme?:string;logo_url?:string;title?:string;description?:string;support_url?:string;support_email?:string;legal_url?:string;locale?:string;website_url?:string;support_phone?:string;whatsapp?:string;address?:string;business_type?:string;statement_name?:string;receipt_note?:string};
function publicURL(value?:string){
 if(!value)return null;
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password?u.href:null}catch{return null}
}

export function MerchantBrand({name,brand,locale}:{name:string;brand?:MerchantBrandInfo|null;locale:"en"|"bn"}){
 const logo=publicURL(brand?.logo_url),support=publicURL(brand?.support_url),legal=publicURL(brand?.legal_url);
 return <section aria-label={locale==="bn"?"বিক্রেতার পরিচয়":"Merchant identity"}>
 {logo&&<Image unoptimized src={logo} width={72} height={72} alt={name} referrerPolicy="no-referrer" style={{objectFit:"contain"}}/>}
 <p><strong>{name}</strong></p>{brand?.title&&<h2>{brand.title}</h2>}{brand?.description&&<p>{brand.description}</p>}
 <nav aria-label={locale==="bn"?"বিক্রেতার সহায়তা ও নীতি":"Merchant support and policy"}>
 {support&&<a href={support} rel="noreferrer">{locale==="bn"?"সহায়তা":"Support"}</a>}{support&&legal&&" · "}{legal&&<a href={legal} rel="noreferrer">{locale==="bn"?"নীতিমালা":"Policy"}</a>}
 </nav>{brand?.support_email&&<p>{locale==="bn"?"সহায়তার ইমেইল":"Support email"}: {brand.support_email}</p>}
 </section>;
}
