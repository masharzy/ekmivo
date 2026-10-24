import {redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../../../../lib/server/auth";
import {cookies} from "next/headers";
import {onboardingState} from "../../../../lib/server/briofold-onboarding";
import {activePurchase} from "../../../../lib/server/purchase-intents";
export const dynamic="force-dynamic";
export default async function OpenWorkspace({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params,locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 // Password login, Google OAuth, email verification and Store creation all
 // eventually navigate here. Keep the original opaque intent across them.
 const active=await activePurchase();
 if(active)redirect(`/subscribe/resume/${active}`);
 const plan=(await cookies()).get("ekmivo-selected-plan")?.value;
 if(plan&&/^[a-z][a-z0-9_-]{1,39}$/.test(plan))redirect(`/subscribe/${plan}`);
 const selected=await preferredWorkspaceFor(user.id);
 if(selected){const stage=await onboardingState(selected,user.id);redirect(stage&&stage!=="complete"?"/setup":"/dashboard");}
 redirect("/workspaces");
}
