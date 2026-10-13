import {redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../../../../lib/server/auth";
export const dynamic="force-dynamic";
export default async function OpenWorkspace({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params,locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 const selected=await preferredWorkspaceFor(user.id);
 redirect(selected?`/${locale}/w/${selected.id}/dashboard`:`/${locale}/workspaces`);
}
