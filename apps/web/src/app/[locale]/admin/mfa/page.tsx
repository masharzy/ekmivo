import {redirect} from "next/navigation";
import {requireUser,currentUser} from "../../../../lib/server/auth";
import {database} from "../../../../lib/server/db";
import {platformRole} from "../../../../lib/server/platform-admin";
import {mfaConfigured,sessionMfaValid} from "../../../../lib/server/mfa";
import {AdminMfaForm} from "../../../../components/admin-mfa-form";
export const dynamic="force-dynamic";
export default async function AdminMfaPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{reauth?:string}>}){
 const {locale:raw}=await params,locale=raw==="bn"?"bn":"en";
 if(!await currentUser())redirect("/"+locale+"/admin/sign-in");
 const user=await requireUser(locale);
 const role=await platformRole(user.id);
 if(!role)return <main className="pa-mfa-screen pa-admin-design"><div className="pa-mfa-card"><div className="pa-mfa-logo">ekmivo <small>Admin</small></div><h1>{locale==="bn"?"অ্যাডমিন অ্যাক্সেস নেই":"No admin access"}</h1><p style={{textAlign:"center"}}>{locale==="bn"?"এই অ্যাকাউন্টে অ্যাডমিন অনুমতি নেই।":"This account has no admin access."}</p><a className="pa-mfa-link" href={"/"+locale+"/workspaces"}>{locale==="bn"?"ড্যাশবোর্ডে ফিরুন":"Back to dashboard"}</a></div></main>;
 const {reauth}=await searchParams;
 if(reauth!=="1"&&await sessionMfaValid(user.id))redirect("/"+locale+"/admin");
 const rows=await database()`SELECT confirmed_at FROM platform_admin_mfa WHERE user_id=${user.id}::uuid LIMIT 1`;
 return <main className="pa-mfa-screen pa-admin-design"><AdminMfaForm locale={locale} ready={mfaConfigured()} enrolled={!!rows[0]?.confirmed_at}/></main>;
}
