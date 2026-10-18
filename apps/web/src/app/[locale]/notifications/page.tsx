import {redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor,workspacesFor} from "../../../lib/server/auth";
export const dynamic="force-dynamic";
export default async function NotificationRedirect({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params;const locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 const [spaces,preferred]=await Promise.all([workspacesFor(user.id),preferredWorkspaceFor(user.id)]);
 const eligible=spaces.filter(space=>space.mode==="commerce"||space.mode==="both");
 const target=eligible.find(space=>space.id===preferred?.id)??eligible[0];
 if(!target)redirect("/workspaces");
 redirect(`/w/${target.id}/payments/notifications`);
}
