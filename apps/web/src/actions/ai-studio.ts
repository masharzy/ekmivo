"use server";
import {revalidatePath} from "next/cache";
import type postgres from "postgres";
import {requireUser,preferredWorkspaceFor} from "../lib/server/auth";
import {database} from "../lib/server/db";
import {readAiStudio} from "../lib/server/ai-studio";
import {studioErrorCode,studioUuid,validAiStudioConfig,type AiStudioCommand,type AiStudioData,type AiStudioResult,type KnowledgeDocument,type KnowledgeMatch} from "../lib/ai-studio";

async function context(workspace:string){
 const actor=await requireUser("en"),selected=await preferredWorkspaceFor(actor.id);
 if(!selected||selected.id!==workspace)return null;
 return {actor,workspace:selected};
}
export async function loadAiStudio(workspace:string,sourceOffset=0,versionOffset=0):Promise<AiStudioResult>{
 const ctx=await context(workspace);
 if(!ctx)return {status:"error",code:"stale-business"};
 const result=await readAiStudio(workspace,ctx.actor.id,sourceOffset,versionOffset);
 return result.status==="ready"?{status:"success",data:result.data}:{status:"error",code:result.status};
}
export async function saveAiStudio(workspace:string,operation:string,kind:AiStudioCommand,payload:unknown):Promise<AiStudioResult>{
 const ctx=await context(workspace);
 if(!ctx)return {status:"error",code:"stale-business"};
 if(!studioUuid.test(operation)||!["draft","publish","rollback","source","archive"].includes(kind)||!payload||typeof payload!=="object"||Array.isArray(payload))return {status:"error",code:"invalid"};
 const input=payload as Record<string,unknown>;
 if(kind==="draft"&&!validAiStudioConfig(input.config))return {status:"error",code:"invalid"};
 try{
  const encoded=JSON.stringify(payload);
  if(Buffer.byteLength(encoded)>120000||encoded.includes("\\u0000"))return {status:"error",code:"invalid"};
  const db=database();
  const data=await db.begin(async tx=>{
   await tx`SELECT briofold_ai_studio_write(${workspace}::uuid,${ctx.actor.id}::uuid,${operation}::uuid,${kind},${db.json(payload as postgres.JSONValue)})`;
   const [row]=await tx`SELECT briofold_ai_studio_read(${workspace}::uuid,${ctx.actor.id}::uuid,0,0) AS data`;
   return row.data as AiStudioData;
  });
  for(const path of ["/settings/ai","/settings/knowledge","/inbox/agent-desk"])revalidatePath(path);
  return {status:"success",data};
 }catch(error){return {status:"error",code:studioErrorCode(error)};}
}
export async function readAiKnowledge(workspace:string,source:string):Promise<{document:KnowledgeDocument|null;error?:string}>{
 const ctx=await context(workspace);
 if(!ctx)return {document:null,error:"stale-business"};
 if(!studioUuid.test(source))return {document:null,error:"invalid"};
 try{
  const [row]=await database()`SELECT briofold_ai_knowledge_read(${workspace}::uuid,${ctx.actor.id}::uuid,${source}::uuid) AS data`;
  return {document:row.data as KnowledgeDocument|null};
 }catch(error){return {document:null,error:studioErrorCode(error)};}
}
export async function searchAiKnowledge(workspace:string,query:string,published:boolean):Promise<{items:KnowledgeMatch[];error?:string}>{
 const ctx=await context(workspace);
 if(!ctx)return {items:[],error:"stale-business"};
 if(typeof query!=="string"||query.trim().length<1||query.length>1000||typeof published!=="boolean")return {items:[],error:"invalid"};
 try{
  const [row]=await database()`SELECT briofold_ai_knowledge_search(${workspace}::uuid,${ctx.actor.id}::uuid,${query},${published}) AS data`;
  return {items:row.data as KnowledgeMatch[]};
 }catch(error){return {items:[],error:studioErrorCode(error)};}
}
