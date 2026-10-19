"use server";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {currentUser,hashToken} from "../lib/server/auth";
import {googleFlowCookie} from "../lib/server/google-auth";
import {googleConfiguration,googleAuthorizationUrl,newGoogleFlow,sealGoogleFlow} from "../lib/google-oidc";
export async function beginGoogleAction(locale:"en"|"bn",mode:"signin"|"link"){
 const config=googleConfiguration(),user=await currentUser();
 const destination=mode==="link"?"/account":"/login";
 if(!config)redirect(destination+"?google=unavailable");
 if(mode==="signin"&&user)redirect("/workspaces/open");
 const jar=await cookies(),token=jar.get("ekmivo-session")?.value;
 if(mode==="link"&&(!user||!token||!user.verified))redirect("/account?google=reauth");
 const flow=newGoogleFlow(locale,mode==="link"?{userId:user!.id,sessionHash:hashToken(token!)}:undefined);
 jar.set(googleFlowCookie,await sealGoogleFlow(flow,config.secret,config.origin),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:600});
 redirect(googleAuthorizationUrl(flow,config.clientId,config.callback));
}
