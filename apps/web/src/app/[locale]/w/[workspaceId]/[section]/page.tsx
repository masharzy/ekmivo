import {notFound} from "next/navigation";
import {requireWorkspace} from "../../../../../lib/server/auth";
import {sections,allowedSection,type SectionKey} from "../../../../../lib/dashboard-sections";
import {sectionService} from "../../../../../lib/dashboard-navigation";
import {redirectLegacyDashboard} from "../../../../../lib/server/legacy-dashboard";
export const dynamic="force-dynamic";
export default async function LegacySection({params}:{params:Promise<{locale:string;workspaceId:string;section:string}>}){
 const p=await params,locale=p.locale==="en"?"en":"bn";
 const {workspace}=await requireWorkspace(locale,p.workspaceId);
 if(!Object.hasOwn(sections,p.section)||!allowedSection(p.section,workspace.mode))notFound();
 return redirectLegacyDashboard(locale,p.workspaceId,sectionService(p.section as SectionKey,workspace.mode),p.section);
}
