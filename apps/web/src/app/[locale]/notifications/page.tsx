import {redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../../../lib/server/auth";
import {AppShell} from "../../../components/app-shell";
import {InboxAlerts} from "../../../components/inbox-alerts";
import {PaymentNotificationCenter} from "../../../components/payment-notification-center";
import {paymentContextFor} from "../../../lib/server/workspace-context";
export const dynamic="force-dynamic";
export default async function NotificationsPage({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params;const locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 const preferred=await preferredWorkspaceFor(user.id);
 if(!preferred||preferred.mode==="off")redirect("/workspaces");
 const aiEnabled=preferred.mode!=="commerce";
 const paymentContext=preferred.mode!=="ai"?await paymentContextFor(preferred,user.id,undefined):undefined;
 return <AppShell unified locale={locale} user={user} workspace={preferred}
   service={aiEnabled?"ai":"payments"} section="notifications" paymentContext={paymentContext}>
  {aiEnabled&&<InboxAlerts key={user.id+":"+preferred.id} workspaceId={preferred.id} bn={locale==="bn"}/>}
  {paymentContext&&<PaymentNotificationCenter key={preferred.id+paymentContext.environment} locale={locale} workspaceId={preferred.id} environment={paymentContext.environment}/>}
  {!aiEnabled&&!paymentContext&&<p role="alert">{locale==="bn"?"পেমেন্ট নোটিফিকেশনের তথ্য পাওয়া যাচ্ছে না।":"Payment notification source unavailable."}</p>}
 </AppShell>;
}
