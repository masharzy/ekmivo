import Link from "next/link";
import {database} from "../lib/server/db";
import {ApiKeyManager,type ApiKeyRow} from "./api-key-manager";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";
import type {Workspace} from "../lib/server/auth";

// This server-only view is reached after requireWorkspace + paymentContextFor.
// A non-admin does not receive even prefixes or scopes.
export async function DeveloperConsole({locale,workspace,environment}:{
 locale:Locale;workspace:Workspace;environment:PaymentEnvironment
}){
 const bn=locale==="bn",allowed=workspace.role==="owner"||workspace.role==="admin";
 let keys:ApiKeyRow[]=[];
 let unavailable=false;
 if(allowed){
  try{
   const rows=await database()`SELECT id,public_id,name,scopes,created_at,expires_at,revoked_at,last_used_at
    FROM merchant_api_keys WHERE workspace_id=${workspace.id}::uuid
    AND environment=${environment}
    ORDER BY created_at DESC LIMIT 100`;
   keys=rows.map(row=>({
    id:String(row.id),publicId:String(row.public_id).trim(),
    name:String(row.name),scopes:(row.scopes as string[]),
    createdAt:new Date(row.created_at).toISOString(),
    expiresAt:new Date(row.expires_at).toISOString(),
    revokedAt:row.revoked_at?new Date(row.revoked_at).toISOString():null,
    lastUsedAt:row.last_used_at?new Date(row.last_used_at).toISOString():null,
    expired:new Date(row.expires_at).getTime()<=Date.now()
   }));
  }catch(e){
   unavailable=true;
   console.error("[pg03 key listing]",e instanceof Error?e.name:"unknown");
  }
 }
 return <section className="ds-panel ds-developer-console" aria-label={bn?"ডেভেলপার ও API key":"Developer API keys"}>
  <div className="ds-panel-heading"><div>
   <h2>{bn?"ডেভেলপার ও API অ্যাক্সেস":"Developer API access"}</h2>
   <p>{bn?"এই ব্যবসার স্যান্ডবক্স ও লাইভ কী সম্পূর্ণ আলাদা।":"Sandbox and live credentials are strictly separated for this business."}</p>
  </div><span className="ds-availability">{environment==="sandbox"?"Sandbox":"Live"}</span></div>
  <p>{bn?"কী তৈরি বা ঘোরানো মানে পেমেন্ট লাইভ চালু হওয়া নয়। PG04–PG09-এর financial APIs প্রস্তুত না হওয়া পর্যন্ত টাকা নেওয়া যাবে না।":"Creating or rotating keys does not enable live payments. Financial APIs remain unavailable until PG04–PG09."}</p>
  <p><Link href={`/${locale}/docs/payments`}>{bn?"API contract ও integration নির্দেশিকা":"API contract and integration guide"} ↗</Link></p>
  {!allowed?<div role="alert" className="ds-empty">
   <h3>{bn?"API key পরিচালনার অনুমতি নেই":"Key management restricted"}</h3>
   <p>{bn?"শুধু ব্যবসার মালিক বা অ্যাডমিন API key দেখতে ও পরিবর্তন করতে পারবেন।":"Only the workspace owner or admin can view and manage keys."}</p>
  </div>:unavailable?<div role="alert" className="ds-empty">
   <h3>{bn?"Credential service পাওয়া যাচ্ছে না":"Credential service unavailable"}</h3>
   <p>{bn?"ডাটাবেস migration এবং service readiness নিশ্চিত করতে হবে। কোনো demo কী দেখানো হচ্ছে না।":"Database migration and service readiness must be checked. No demo keys are shown."}</p>
  </div>:<ApiKeyManager locale={locale} workspaceId={workspace.id} environment={environment} keys={keys}/>}
 </section>;
}
