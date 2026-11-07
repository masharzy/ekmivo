import {database} from "../lib/server/db";
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
 const [memberships,primaryStoreId,adminRole,verification,jar,store]=await Promise.all([
  workspacesFor(user.id),primaryStoreFor(user.id),isPlatformAdmin(user.id),
  user.verified?Promise.resolve(false):verificationEnabled(),cookies(),
  database()`SELECT dashboard_store_read(${workspace.id}::uuid,${user.id}::uuid) AS profile`
   .then(rows => rows[0]?.profile?.body?.name as unknown)
   .catch(() => null)
 ]);
 // Never pass other membership-derived Store choices into a primary-bound
 // user's dashboard, including the global command-search shortcuts.
 const displayName=typeof store==="string"&&store.trim()?store.trim():workspace.name;
 const displayedWorkspace={...workspace,name:displayName};
 const visibleMemberships=primaryStoreId?memberships.filter(space=>space.id===primaryStoreId):memberships;
 const spaces=visibleMemberships.map(space=>space.id===workspace.id?{...space,name:displayName}:space);
 const platformAdmin=(user.verified || !verification) && adminRole;
 const value=jar.get("briofold-theme")?.value;
 const theme=value==="light"||value==="dark"?value:"system";
 const planFeatures=service==="payments"?await workspacePlanFeatures(workspace.id,paymentContext?.environment||"live"):undefined;
 return <DashboardFrame unified={unified} planFeatures={planFeatures} locale={locale} userName={user.name} workspace={displayedWorkspace} spaces={spaces} service={service} section={section} platformAdmin={platformAdmin} theme={theme} paymentContext={paymentContext} logout={<form action={logoutAction.bind(null,locale)}><button type="submit"><DashboardIcon name="logout"/>{locale==="bn"?"লগ আউট":"Sign out"}</button></form>}>{children}</DashboardFrame>;
}
