"use server";
import {revalidatePath} from "next/cache";
import {requireSuperAdmin} from "../lib/server/platform-admin";
import {database} from "../lib/server/db";
export async function managePaymentPlan(op:string,input:Record<string,unknown>){
 const admin=await requireSuperAdmin();
 if(!admin)return {ok:false,code:"ACCESS_DENIED",data:null};
 if(!["save","archive","read","workspace","assign","schedule","clear_schedule","expire","override"].includes(op)||JSON.stringify(input).length>16000)return {ok:false,code:"INVALID_REQUEST",data:null};
 try{
  const sql=database();
  const r=await sql`SELECT payment_plan_admin(${admin.user.id}::uuid,${op},${sql.json(input as never)}::jsonb) AS result`;
  if(!["read","workspace"].includes(op)){revalidatePath("/[locale]/pricing","page");revalidatePath("/[locale]","page");revalidatePath("/[locale]/admin/[...section]","page")}
  return {ok:true,code:"SAVED",data:r[0].result as Record<string,unknown>};
 }catch(e){const code=e&&typeof e==="object"&&"code" in e?String(e.code):"UNKNOWN";
 return {ok:false,code:code==="40001"?"CONFLICT_RELOAD":code==="42501"?"ACCESS_DENIED":["22023","22P02","22007","22008","23514"].includes(code)?"INVALID_FIELDS":code==="23505"?"CONFLICT":"PLANS_UNAVAILABLE",data:null}}
}
