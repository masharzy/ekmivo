import {cookies} from "next/headers";
import {redirect,notFound} from "next/navigation";
import {verifiedAdmin} from "../../../../lib/server/platform-admin";
import {requireUser} from "../../../../lib/server/auth";
import {AdminShell} from "../../../../components/platform-admin-shell";
import {MfaSecurityControls,GoSessionStatus} from "../../../../components/mfa-security-controls";
export const dynamic="force-dynamic";
export default async function Security({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params;
 if(raw!=="bn"&&raw!=="en")notFound();
 const locale=raw;
 const user=await requireUser(locale),admin=await verifiedAdmin();
 if(!admin||admin.user.id!==user.id)redirect("/"+locale+"/admin/verify");
 const cookie=await cookies(),pref=cookie.get("ekmivo-admin-theme")?.value;
 const theme=pref==="light"||pref==="dark"?pref:"system";
 return <AdminShell locale={locale} role={admin.role} name={user.name} theme={theme} production={process.env.NODE_ENV==="production"}>
 <div className="pa-page-head"><h1>{locale==="bn"?"আমার নিরাপত্তা":"My security"}</h1></div>
 <section className="pa-surface pa-security"><GoSessionStatus locale={locale}/><MfaSecurityControls locale={locale}/></section>
 </AdminShell>;
}
