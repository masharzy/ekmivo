import {database} from "./db";

/** 0259 shipped with ৳30; 0260 lets a Super Admin change it. */
export const FREE_CREDIT_FALLBACK_MINOR=3000;

export type FreeCreditSetting={revision:string;amountMinor:number;changedBy:string|null;changedAt:string|null;settingAvailable:boolean};

/** Current free credit amount. If 0260 is not applied yet, the 0259 amount is the truth. */
export async function freeCreditSetting():Promise<FreeCreditSetting>{
 try{
  const [row]=await database()`SELECT v.revision::text AS revision,v.amount_minor,u.display_name,v.created_at
   FROM briofold_ai_free_credit_versions v JOIN app_users u ON u.id=v.actor_id ORDER BY v.revision DESC LIMIT 1`;
  if(!row)return {revision:"0",amountMinor:FREE_CREDIT_FALLBACK_MINOR,changedBy:null,changedAt:null,settingAvailable:true};
  return {revision:String(row.revision),amountMinor:Number(row.amount_minor),changedBy:String(row.display_name||""),
   changedAt:new Date(String(row.created_at)).toISOString(),settingAvailable:true};
 }catch{
  return {revision:"0",amountMinor:FREE_CREDIT_FALLBACK_MINOR,changedBy:null,changedAt:null,settingAvailable:false};
 }
}

/** What customers see: the flag must be on and the amount above zero. */
export async function publicFreeCredit():Promise<{enabled:boolean;amountMinor:number}>{
 if(process.env.BRIOFOLD_AI_FREE_CREDIT_ENABLED!=="true")return {enabled:false,amountMinor:0};
 const s=await freeCreditSetting();
 return {enabled:s.amountMinor>0,amountMinor:s.amountMinor};
}
