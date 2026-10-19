import {WorkspaceChannels} from "../../../../../../components/workspace-channels";
import {WorkspaceInbox} from "../../../../../../components/workspace-inbox";
import { notFound,redirect } from "next/navigation";
import { requireWorkspace } from "../../../../../../lib/server/auth";
import { paymentContextFor } from "../../../../../../lib/server/workspace-context";
import { DashboardContent } from "../../../../../../components/dashboard-content";
import { sectionInService, serviceEnabled } from "../../../../../../lib/dashboard-navigation";
export const dynamic = "force-dynamic";
export default async function ServiceSection({ params, searchParams }: {
 params: Promise<{ locale: string; workspaceId: string; section: string; serviceSection: string }>;
 searchParams: Promise<{ env?: string | string[] }>;
}) {
 const {locale:raw,workspaceId,section:service,serviceSection:section}=await params,locale=raw==="en"?"en":"bn";
 const {user,workspace}=await requireWorkspace(locale,workspaceId);
 if(service==="payments"&&["api-docs","integrations"].includes(section))redirect(`/${locale}/developers${section==="integrations"?"#overview":""}`);
 if(service==="payments"&&section==="settings")redirect(`/w/${workspaceId}/payments/store`);
 if(service==="payments"&&section==="payments")redirect(`/w/${workspaceId}/payments/transactions`);
 if((service!=="ai"&&service!=="payments")||!serviceEnabled(service,workspace.mode)||!sectionInService(service,section))notFound();
 if(service==="ai"&&section==="channels")return <WorkspaceChannels key={workspace.id} workspaceId={workspace.id} bn={locale==="bn"}/>;
 if(service==="ai"&&section==="inbox")return <WorkspaceInbox key={workspace.id} workspaceId={workspace.id} bn={locale==="bn"}/>;
 const query=await searchParams;
 // Legacy bookmarked ?env= links are normalized; environment selection is
 // intentionally hidden and no longer accepted from a dashboard URL.
 if(service==="payments"&&query.env!==undefined)
   redirect(`/w/${workspace.id}/payments/${section}`);
 const paymentContext=service==="payments"?await paymentContextFor(workspace,user.id,undefined):undefined;
 return <DashboardContent framed initialQuery={query} locale={locale} user={user} workspace={workspace} service={service} section={section} paymentContext={paymentContext}/>;
}
