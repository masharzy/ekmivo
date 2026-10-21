import {workspacePlanFeatures} from "../lib/server/plan-access";
import { cookies } from "next/headers";
import { logoutAction } from "../actions/account";
import { type User, type Workspace, workspacesFor, primaryStoreFor, isPlatformAdmin } from "../lib/server/auth";
import { type SectionKey } from "../lib/dashboard-sections";
import { type Locale, type Service, defaultService } from "../lib/dashboard-navigation";
import type { WorkspacePaymentContext } from "../lib/server/workspace-context";
import { verificationEnabled } from "../lib/server/email";
import { DashboardFrame } from "./dashboard-frame";
import { DashboardIcon } from "./dashboard-icon";
export async function AppShell({locale,user,workspace,section,service=defaultService(workspace.mode),paymentContext,unified=false,children}:{locale:Locale;user:User;workspace:Workspace;section:SectionKey;service?:Service;paymentContext?:WorkspacePaymentContext;unified?:boolean;children:React.ReactNode}){
 const [memberships,primaryStoreId,adminRole,verification,jar]=await Promise.all([
  workspacesFor(user.id),primaryStoreFor(user.id),isPlatformAdmin(user.id),
  user.verified?Promise.resolve(false):verificationEnabled(),cookies()
 ]);
 // Never pass other membership-derived Store choices into a primary-bound
 // user's dashboard, including the global command-search shortcuts.
 const spaces=primaryStoreId?memberships.filter(space=>space.id===primaryStoreId):memberships;
 const platformAdmin=(user.verified || !verification) && adminRole;
 const value=jar.get("ekmivo-theme")?.value;
 const theme=value==="light"||value==="dark"?value:"system";
 const planFeatures=service==="payments"?await workspacePlanFeatures(workspace.id,paymentContext?.environment||"live"):undefined;
 return <DashboardFrame unified={unified} planFeatures={planFeatures} locale={locale} userName={user.name} workspace={workspace} spaces={spaces} service={service} section={section} platformAdmin={platformAdmin} theme={theme} paymentContext={paymentContext} logout={<form action={logoutAction.bind(null,locale)}><button type="submit"><DashboardIcon name="logout"/>{locale==="bn"?"লগ আউট":"Sign out"}</button></form>}>{children}</DashboardFrame>;
}
