import {currentUser,preferredWorkspaceFor} from "../../../../lib/server/auth";
import {database} from "../../../../lib/server/db";

export const dynamic="force-dynamic";

// The browser chooses neither Store nor financial realm. A server-resolved
// primary Store + SQL read capability are always rechecked at download time.
const fields={
 customers:["total","qualified","won","assigned","opted_in","due","upcoming","done"],
 commerce:["total","draft","confirmed","delivered","cancelled","returned","ai","api","manual"],
 inbox:["conversations","messages_7d"],
 campaigns:["broadcast_drafts","broadcast_planned","post_drafts","post_planned"],
 bookings:["booking_requested","booking_confirmed","booking_completed","booking_cancelled"],
 team:["assigned","unassigned","open","pending","resolved","overdue"],
 messages:["inbound_7d","human_outbound_7d","ai_outbound_7d"]
} as const;

function csvFromVerifiedReport(report:Record<string,unknown>){
 const core=report.core,operations=report.operations;
 if(!core||typeof core!=="object"||!operations||typeof operations!=="object")throw Error("INVALID_EXPORT");
 const rows=["section,metric,value"];
 for(const [section,names] of Object.entries(fields)){
  const source=(section in (core as object)?core:operations) as Record<string,unknown>;
  const group=source[section];
  if(!group||typeof group!=="object")throw Error("INVALID_GROUP");
  for(const name of names){
   const raw=(group as Record<string,unknown>)[name];
   if(raw===null||raw===undefined||typeof raw==="boolean")throw Error("MISSING_METRIC");
   const value=Number(raw);
   if(!Number.isSafeInteger(value)||value<0)throw Error("INVALID_NUMBER");
   rows.push(`${section},${name},${value}`);
  }
 }
 return "\uFEFF"+rows.join("\r\n")+"\r\n";
}

export async function GET(request:Request){
 if(process.env.BRIOFOLD_GROWTH_ANALYTICS_ENABLED!=="true")return Response.json({code:"NOT_AVAILABLE"},{status:404});
 const requested=new URL(request.url);
 if(requested.searchParams.size!==0)return Response.json({code:"INVALID_EXPORT_SCOPE"},{status:400});
 try{
  const user=await currentUser();
  if(!user)return Response.json({code:"UNAUTHENTICATED"},{status:401});
  const store=await preferredWorkspaceFor(user.id);
  if(!store||store.mode==="off"||!(["owner","admin"] as string[]).includes(store.role))return Response.json({code:"FORBIDDEN"},{status:403});
  // Export capability is enforced a second time in the SECURITY DEFINER SQL.
  const [row]=await database()`SELECT briofold_growth_export(${store.id}::uuid,'live',${user.id}::uuid) AS report`;
  const report=row?.report;
  if(!report||typeof report!=="object")throw Error("MISSING_EXPORT");
  const csv=csvFromVerifiedReport(report as Record<string,unknown>);
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8",
   "Content-Disposition":"attachment; filename=ekmivo-growth-metrics.csv",
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(error){
  console.error("BRIOFOLD_GROWTH_EXPORT_UNAVAILABLE",error instanceof Error?error.name:"unknown");
  return Response.json({code:"EXPORT_UNAVAILABLE"},{status:503,headers:{"Cache-Control":"private, no-store"}});
 }
}
