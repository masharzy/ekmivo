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
 if((service!=="ai"&&service!=="payments")||!serviceEnabled(service,workspace.mode)||!sectionInService(service,section))notFound();
 const query=await searchParams;
 // Legacy bookmarked ?env= links are normalized; environment selection is
 // intentionally hidden and no longer accepted from a dashboard URL.
 if(service==="payments"&&query.env!==undefined)
   redirect(`/w/${workspace.id}/payments/${section}`);
 const paymentContext=service==="payments"?await paymentContextFor(workspace,user.id,undefined):undefined;
 return <DashboardContent framed locale={locale} user={user} workspace={workspace} service={service} section={section} paymentContext={paymentContext}/>;
}
