import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser, workspacesFor, preferredWorkspaceFor } from "../../../lib/server/auth";
import {setDefaultWorkspaceAction} from "../../../actions/account";
import { WorkspaceOnboarding } from "../../../components/workspace-onboarding";
import { WorkspaceProductControls } from "../../../components/workspace-product-controls";
export const dynamic="force-dynamic";
export default async function WorkspacesPage({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params,locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 const spaces=await workspacesFor(user.id);
 const preferred=await preferredWorkspaceFor(user.id);
 return <main className="ek-app-shell ek-workspace-page">
  <div className="ek-app-topbar"><Link href={`/${locale}`} className="ek-wordmark">ekmivo.</Link><div><span>{user.name}</span><span className="ek-avatar">{user.name.slice(0,1).toUpperCase()}</span></div></div>
  <div className="ek-page-wrap">
   {spaces.length>0&&<section className="ek-existing" aria-labelledby="workspace-existing"><div className="ek-page-kicker">{locale==="bn"?"আপনার ব্যবসাসমূহ":"YOUR WORKSPACES"} / {spaces.length}</div><h2 id="workspace-existing">{locale==="bn"?"আপনার ওয়ার্কস্পেস":"Your workspaces"}</h2><p className="ek-workspace-default-help">{locale==="bn"?"যেটিকে ডিফল্ট করবেন, পরেরবার লগইন করলে সরাসরি সেটিই খুলবে।":"Your default opens immediately after sign-in."}</p><div className="ek-existing-grid">{spaces.map(w=><article className="ek-workspace-choice" key={w.id}><Link className="ek-existing-card" href={`/${locale}/w/${w.id}/dashboard`}><span className="ek-avatar">{w.name.slice(0,1).toUpperCase()}</span><div><strong>{w.name}</strong><small>{
 w.mode==="both"?(locale==="bn"?"AI ও পেমেন্ট":"AI & Payments"):
 w.mode==="ai"?(locale==="bn"?"AI যোগাযোগ":"AI communication"):
 w.mode==="off"?(locale==="bn"?"কোনো সেবা চালু নেই":"No enabled products"):
 (locale==="bn"?"পেমেন্ট গেটওয়ে":"Payment gateway")
 } · {({owner:{bn:"মালিক",en:"Owner"},admin:{bn:"অ্যাডমিন",en:"Admin"},editor:{bn:"সম্পাদক",en:"Editor"},viewer:{bn:"দর্শক",en:"Viewer"}} as const)[w.role][locale]}</small></div><span>↗</span></Link><form action={setDefaultWorkspaceAction.bind(null,locale,w.id)}><button className="ek-set-default" type="submit" disabled={preferred?.id===w.id}>{preferred?.id===w.id?(locale==="bn"?"★ ডিফল্ট ওয়ার্কস্পেস":"★ Default workspace"):(locale==="bn"?"☆ ডিফল্ট করুন":"☆ Set as default")}</button></form></article>)}</div></section>}
   {spaces.some(space=>space.role==="owner"||space.role==="admin")&&<section className="ek-product-management" aria-labelledby="pg02-product-access-heading">
    <h2 id="pg02-product-access-heading">{locale==="bn"?"ব্যবসার সেবা পরিচালনা":"Manage business products"}</h2>
    {spaces.filter(space=>space.role==="owner"||space.role==="admin").map(space=><div key={space.id} className="ek-product-managed-business">
     <strong>{space.name}</strong>
     <WorkspaceProductControls locale={locale} workspaceId={space.id} mode={space.mode}/>
    </div>)}
   </section>}
   <WorkspaceOnboarding locale={locale} userId={user.id}/>
  </div>
 </main>;
}
