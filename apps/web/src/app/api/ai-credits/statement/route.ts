import {NextResponse} from "next/server";
import {currentUser,preferredWorkspaceFor} from "../../../../lib/server/auth";
import {database} from "../../../../lib/server/db";
import {groupedStatement,parseStatementCursor,statementCursor,statementEntry} from "../../../../lib/server/briofold-ai-statement";

export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store, max-age=0"};
const forbidden=(status:number,code:string)=>NextResponse.json({error:code},{status,headers:noStore});

export async function GET(request:Request){
 const user=await currentUser();
 if(!user)return forbidden(401,"UNAUTHENTICATED");
 const workspace=await preferredWorkspaceFor(user.id);
 // The workspace ID is a stale-render guard, NOT a source of authority.
 // Authorization always comes from the server-resolved preferred business.
 const requestWorkspace=new URL(request.url).searchParams.get("workspace_id");
 if(!requestWorkspace||!workspace||requestWorkspace!==workspace.id)return forbidden(409,"ACTIVE_BUSINESS_CHANGED");
 if(!workspace||workspace.mode==="off"||workspace.mode==="commerce"||
   (workspace.role!=="owner"&&workspace.role!=="admin"))
  return forbidden(403,"ACCESS_DENIED");
 const url=new URL(request.url);
 let cursor:ReturnType<typeof parseStatementCursor>;
 try{cursor=parseStatementCursor(url.searchParams.get("cursor"));}
 catch{return forbidden(400,"INVALID_CURSOR");}
 try{
  const db=database();
  // Protect every page with *current* membership and billing capability.
  const [access]=await db`
   SELECT m.role,pg13_capability_override(${workspace.id}::uuid,${user.id}::uuid,'workspace:settings') AS capability_allowed
   FROM workspace_members m JOIN workspace_product_access p
    ON p.workspace_id=m.workspace_id AND p.product='ai' AND p.enabled=true
   WHERE m.workspace_id=${workspace.id}::uuid AND m.user_id=${user.id}::uuid
    AND pg13_capability_override(m.workspace_id,m.user_id,'product:ai') IS DISTINCT FROM false
    AND m.role IN ('owner','admin') LIMIT 1`;
  if(!access||access.capability_allowed===false)return forbidden(403,"ACCESS_DENIED");
  const [installed]=await db`SELECT to_regclass('public.briofold_ai_credit_journal') AS rel`;
  if(!installed?.rel)return forbidden(503,"AI_CREDITS_UNAVAILABLE");
  const rows=await groupedStatement(db,workspace.id,cursor,50);
  const entries=rows.slice(0,50).map(row=>statementEntry(row));
  return NextResponse.json({entries,next_cursor:rows.length>50?statementCursor(entries[entries.length-1]):null},
   {status:200,headers:noStore});
 }catch(error){
  console.error("[briofold ai statement]",error instanceof Error?error.name:"unknown");
  return forbidden(503,"AI_CREDITS_UNAVAILABLE");
 }
}
