"use server";
import {requireUser,preferredWorkspaceFor} from "../lib/server/auth";
import {database} from "../lib/server/db";
import {studioUuid} from "../lib/ai-studio";
export type InboxAlert={id:string;thread_id:string;kind:string;created_at:string;customer_name:string;read_at:string|null};
async function actorFor(workspace:string){const user=await requireUser("en"),selected=await preferredWorkspaceFor(user.id);return selected?.id===workspace?user:null;}
export async function readInboxAlerts(workspace:string,offset:number,query:string,kind:string,unread:boolean):Promise<{items:InboxAlert[];error?:string}>{
 const actor=await actorFor(workspace);if(!actor)return {items:[],error:"forbidden"};
 if(!Number.isSafeInteger(offset)||offset<0||offset>10000||typeof query!=="string"||query.length>100||!["","assignment","handover","sla","ticket","ai-review"].includes(kind)||typeof unread!=="boolean")return {items:[],error:"invalid"};
 try{const [row]=await database()`SELECT briofold_inbox_alert_read(${workspace}::uuid,${actor.id}::uuid,${offset},${query},${kind},${unread}) AS data`;return row.data as {items:InboxAlert[]};}catch{return {items:[],error:"unavailable"};}
}
export async function markInboxAlert(workspace:string,alert:string):Promise<boolean>{const actor=await actorFor(workspace);if(!actor||!studioUuid.test(alert))return false;try{await database()`SELECT briofold_inbox_alert_mark(${workspace}::uuid,${actor.id}::uuid,${alert}::uuid)`;return true;}catch{return false;}}
