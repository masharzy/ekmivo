import "server-only";
import {database} from "./db";
import {safeWalletMinor,statementCursor,statementEntry,type WalletStatementEntry} from "./briofold-ai-statement";

export type AiWalletView={
 status:"ready"|"unavailable";available_minor:number;reserved_minor:number;
 minimum_request_minor:number|null;
 entries:WalletStatementEntry[];next_cursor:string|null;
 topups:{id:string;amount_minor:number;status:"pending"|"credited";created_at:string}[]
};
const unavailable:AiWalletView={
 status:"unavailable",available_minor:0,reserved_minor:0,
 minimum_request_minor:null,entries:[],next_cursor:null,topups:[],
};
export async function readAiWallet(workspaceId:string,actorId:string):Promise<AiWalletView>{
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(workspaceId)||
  !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(actorId))return unavailable;
 try{
  const db=database();
  const [installed]=await db`SELECT to_regclass('public.briofold_ai_wallets') AS rel`;
  if(!installed?.rel)return unavailable;
  // Financial statement data is scoped to active AI and billing-authorized
  // owners/admins, not every contact-center agent in the workspace.
  const [member]=await db`
   SELECT m.role,pg13_capability_override(${workspaceId}::uuid,${actorId}::uuid,'workspace:settings') AS capability_allowed
   FROM workspace_members m JOIN workspace_product_access p
    ON p.workspace_id=m.workspace_id AND p.product='ai' AND p.enabled=true
   WHERE m.workspace_id=${workspaceId}::uuid AND m.user_id=${actorId}::uuid
    AND m.role IN ('owner','admin') LIMIT 1`;
  if(!member||member.capability_allowed===false)return unavailable;
  const [accountRows,journal,topups,tariff]=await Promise.all([
   db`SELECT available_minor,reserved_minor FROM briofold_ai_wallets WHERE workspace_id=${workspaceId}::uuid`,
   db`SELECT id,kind,available_delta_minor,reserved_delta_minor,available_after_minor,reserved_after_minor,created_at
     FROM briofold_ai_credit_journal WHERE workspace_id=${workspaceId}::uuid ORDER BY created_at DESC,id DESC LIMIT 31`,
   db`SELECT id,amount_minor,status,created_at FROM briofold_ai_topups WHERE workspace_id=${workspaceId}::uuid ORDER BY created_at DESC LIMIT 25`,
   db`SELECT min(ceil(((v.terms->>'max_input_tokens')::numeric * (v.terms->>'input_minor_per_million')::numeric
      + (v.terms->>'max_output_tokens')::numeric * (v.terms->>'output_minor_per_million')::numeric) / 1000000)::bigint) AS minimum_request_minor
     FROM briofold_ai_tariff_catalog c JOIN briofold_ai_tariff_versions v ON v.id=c.current_version`,
  ]);
  const row=accountRows[0],entries=journal.slice(0,30).map(e=>statementEntry(e));
  return {
   status:"ready",available_minor:safeWalletMinor(row?.available_minor??0),
   reserved_minor:safeWalletMinor(row?.reserved_minor??0),
   minimum_request_minor:tariff[0]?.minimum_request_minor==null?null:safeWalletMinor(tariff[0].minimum_request_minor),
   entries,next_cursor:journal.length>30?statementCursor(entries[entries.length-1]):null,
   topups:topups.map(x=>({id:String(x.id),amount_minor:safeWalletMinor(x.amount_minor),
    status:x.status as "pending"|"credited",created_at:new Date(x.created_at).toISOString()}))
  };
 }catch(error){
  console.error("[briofold AI credits]",error instanceof Error?error.name:"unknown");
  return unavailable;
 }
}
