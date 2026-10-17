import {NextResponse} from "next/server";
import {database} from "../../../lib/server/db";
export const dynamic="force-dynamic";
/** Public names/logos only. No private receiving accounts, API keys, secrets or phone data. */
export async function GET(){
 try{
  const rows=await database()`SELECT code,display_name,logo_url,checkout_enabled,live_enabled
   FROM platform_payment_providers
   WHERE status='published' AND visible_in_add_account AND verification_supported
   ORDER BY sort_order,display_name LIMIT 50`;
  return NextResponse.json({providers:rows.map(x=>({code:String(x.code),name:String(x.display_name),
   logo:String(x.logo_url||""),checkout:x.checkout_enabled===true,live:x.live_enabled===true}))},
   {headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  console.error("[providers/public-catalog]",error instanceof Error?error.name:"unknown");
  return NextResponse.json({error:"PROVIDER_CATALOG_UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
