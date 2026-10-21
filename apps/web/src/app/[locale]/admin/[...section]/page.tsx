import {notFound} from "next/navigation";
import {PlatformAdminConsole} from "../../../../components/platform-admin-console";
export const dynamic="force-dynamic";
export default async function AdminSections({params,searchParams}:{params:Promise<{locale:string;section:string[]}>;searchParams:Promise<{q?:string;after?:string;coupon_status?:string}>}){
 const [{locale,section},search]=await Promise.all([params,searchParams]);
 if(locale!=="en"&&locale!=="bn")notFound();
 return <PlatformAdminConsole locale={locale} segments={section} query={search.q||""} after={search.after||""} couponStatus={search.coupon_status||"all"}/>;
}
