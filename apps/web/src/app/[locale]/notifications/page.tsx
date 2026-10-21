import {redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor,workspacesFor} from "../../../lib/server/auth";
import {AppShell} from "../../../components/app-shell";
import {InboxAlerts} from "../../../components/inbox-alerts";
import {PaymentNotificationCenter} from "../../../components/payment-notification-center";
import {paymentContextFor} from "../../../lib/server/workspace-context";
export const dynamic="force-dynamic";
export default async function NotificationRedirect({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params;const locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 const [spaces,preferred]=await Promise.all([workspacesFor(user.id),preferredWorkspaceFor(user.id)]);
 if(preferred&&(preferred.mode==="ai"||preferred.mode==="both")){
  const paymentContext=preferred.mode==="both"?await paymentContextFor(preferred,user.id,undefined):undefined;
  return <AppShell unified locale={locale} user={user} workspace={preferred} service="ai" section="notifications"><InboxAlerts key={user.id+":"+preferred.id} workspaceId={preferred.id} bn={locale==="bn"}/>{paymentContext&&<PaymentNotificationCenter key={preferred.id+paymentContext.environment} locale={locale} workspaceId={preferred.id} environment={paymentContext.environment}/>}</AppShell>;
 }
 const eligible=spaces.filter(space=>space.mode==="commerce"||space.mode==="both");
 const target=eligible.find(space=>space.id===preferred?.id)??eligible[0];
 if(!target)redirect("/workspaces");
 redirect(`/w/${target.id}/payments/notifications`);
}
