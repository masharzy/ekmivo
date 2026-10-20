import {redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../../../lib/server/auth";
import {defaultService} from "../../../lib/dashboard-navigation";
import {paymentContextFor} from "../../../lib/server/workspace-context";
import {DashboardContent} from "../../../components/dashboard-content";

// Public, bookmarkable dashboard route: /dashboard. The locale is resolved
// by the cookie-backed proxy, and the business is authorized server-side.
export const dynamic="force-dynamic";
export default async function DashboardPage({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params,locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 const workspace=await preferredWorkspaceFor(user.id);
 if(!workspace||workspace.mode==="off")redirect("/workspaces");
 const service=defaultService(workspace.mode);
 const paymentContext=service==="payments"?await paymentContextFor(workspace,user.id,undefined):undefined;
 return <DashboardContent locale={locale} user={user} workspace={workspace} section="overview" service={service} paymentContext={paymentContext}/>;
}
