import "server-only";
import {database} from "./db";
export type AiWalletView={
 status:"ready"|"unavailable";available_minor:number;reserved_minor:number;
 entries:{kind:string;available_delta_minor:number;reserved_delta_minor:number;created_at:string}[];
 topups:{id:string;amount_minor:number;status:"pending"|"credited";created_at:string}[]
};
export async function readAiWallet(workspaceId:string,actorId:string):Promise<AiWalletView>{
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(workspaceId))return {status:"unavailable",available_minor:0,reserved_minor:0,entries:[],topups:[]};
 try{
  const db=database();
  const [installed]=await db`SELECT to_regclass('public.briofold_ai_wallets') AS rel`;
  if(!installed?.rel)return {status:"unavailable",available_minor:0,reserved_minor:0,entries:[],topups:[]};
  const [member]=await db`SELECT 1 FROM workspace_members WHERE workspace_id=${workspaceId}::uuid AND user_id=${actorId}::uuid`;
  if(!member)return {status:"unavailable",available_minor:0,reserved_minor:0,entries:[],topups:[]};
  const rows=await db`SELECT available_minor,reserved_minor FROM briofold_ai_wallets WHERE workspace_id=${workspaceId}::uuid`;
  const entries=await db`SELECT kind,available_delta_minor,reserved_delta_minor,created_at FROM briofold_ai_credit_journal WHERE workspace_id=${workspaceId}::uuid ORDER BY created_at DESC LIMIT 30`;
  const topups=await db`SELECT id,amount_minor,status,created_at FROM briofold_ai_topups WHERE workspace_id=${workspaceId}::uuid ORDER BY created_at DESC LIMIT 25`;
  const account=rows[0];
  return {status:"ready",available_minor:Number(account?.available_minor??0),reserved_minor:Number(account?.reserved_minor??0),entries:entries.map(e=>({kind:String(e.kind),available_delta_minor:Number(e.available_delta_minor),reserved_delta_minor:Number(e.reserved_delta_minor),created_at:new Date(e.created_at).toISOString()})),topups:topups.map(x=>({id:String(x.id),amount_minor:Number(x.amount_minor),status:x.status as "pending"|"credited",created_at:new Date(x.created_at).toISOString()}))};
 }catch(error){
  console.error("[briofold AI credits]",error instanceof Error?error.name:"unknown");
  return {status:"unavailable",available_minor:0,reserved_minor:0,entries:[],topups:[]};
 }
}
