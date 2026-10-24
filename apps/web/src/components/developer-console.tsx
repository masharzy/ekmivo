import {database} from "../lib/server/db";
import {CredentialEnvironmentSwitcher} from "./credential-environment-switcher";
import type {ApiKeyRow} from "./api-key-manager";

import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";
import type {Workspace} from "../lib/server/auth";

// This server-only view is reached after requireWorkspace + paymentContextFor.
// A non-admin does not receive even prefixes or scopes.
export async function DeveloperConsole({locale,workspace,environment,userId}:{
 locale:Locale;workspace:Workspace;environment:PaymentEnvironment;userId:string
}){
 const bn=locale==="bn",allowed=workspace.role==="owner"||workspace.role==="admin";
 const keys:{live:ApiKeyRow[];sandbox:ApiKeyRow[]}={live:[],sandbox:[]};

 let unavailable=false;
 let enabled:PaymentEnvironment[]=[];
 if(allowed){
  try{
   const [environments,...groups]=await Promise.all([
    database()`SELECT environment FROM workspace_environments WHERE workspace_id=${workspace.id}::uuid AND status='active' AND environment IN ('live','sandbox')`,
    ...(["live","sandbox"] as const).map(realm=>database()`SELECT id,public_id,name,scopes,created_at,expires_at,revoked_at,last_used_at,(expires_at<=now()) AS expired
      FROM merchant_api_keys WHERE workspace_id=${workspace.id}::uuid AND environment=${realm}
      AND EXISTS(SELECT 1 FROM workspace_environments e WHERE e.workspace_id=${workspace.id}::uuid AND e.environment=${realm} AND e.status='active')
      ORDER BY created_at DESC LIMIT 100`)
   ]);
   enabled=environments.map(row=>String(row.environment)).filter((value):value is PaymentEnvironment=>value==="sandbox"||value==="live");
   for(const [index,realm] of (["live","sandbox"] as const).entries())keys[realm]=groups[index].map(row=>({
    id:String(row.id),publicId:String(row.public_id).trim(),
    name:String(row.name),scopes:(row.scopes as string[]),
    createdAt:new Date(row.created_at).toISOString(),
    expiresAt:String(row.expires_at)==="infinity"?"infinity":new Date(row.expires_at).toISOString(),
    revokedAt:row.revoked_at?new Date(row.revoked_at).toISOString():null,
    lastUsedAt:row.last_used_at?new Date(row.last_used_at).toISOString():null,
    expired:Boolean(row.expired)
   }));
  }catch(e){
   unavailable=true;
   console.error("[pg03 key listing]",e instanceof Error?e.name:"unknown");
  }
 }
 const keyPanel=(realm:PaymentEnvironment)=>!allowed?<div role="alert" className="ds-empty">
   <h3>{bn?"API key পরিচালনার অনুমতি নেই":"Key management restricted"}</h3>
   <p>{bn?"শুধু ব্যবসার মালিক বা অ্যাডমিন API key দেখতে ও পরিবর্তন করতে পারবেন।":"Only the business owner or admin can view and manage keys."}</p>
  </div>:unavailable?<div role="alert" className="ds-empty">
   <h3>{bn?"Credential service পাওয়া যাচ্ছে না":"Credential service unavailable"}</h3>
   <p>{bn?"ডাটাবেস migration এবং service readiness নিশ্চিত করতে হবে। কোনো demo কী দেখানো হচ্ছে না।":"Database migration and service readiness must be checked. No demo keys are shown."}</p>
  </div>:<CredentialEnvironmentSwitcher locale={locale} userId={userId} workspaceId={workspace.id} initialEnvironment={realm} enabled={enabled} keys={keys}/>;
 return <section className="ref-api-key-page">{keyPanel(environment)}</section>;
}
