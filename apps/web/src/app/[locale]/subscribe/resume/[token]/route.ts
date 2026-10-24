import {NextRequest,NextResponse} from "next/server";
import {resumePurchase,IntentError} from "../../../../../lib/server/purchase-intents";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{locale:string;token:string}>}){
 const {locale,token}=await params;
 if(locale!=="bn"&&locale!=="en")return new Response(null,{status:404});
 try{
  const result=await resumePurchase(token);
  const to=result.stage==="login"?"/login":result.stage==="verify"?"/verify-email":
   result.stage==="store"?"/workspaces":result.stage==="setup"?"/setup":`/checkout/order/${token}`;
  const response=NextResponse.redirect(new URL(to,request.url),303);
  response.headers.set("Cache-Control","no-store");
  response.headers.set("Referrer-Policy","no-referrer");
  return response;
 }catch(e){
  const status=e instanceof IntentError?e.code:"UNAVAILABLE";
  // Fixed local recovery destination: do not redirect to user-provided URLs.
  return NextResponse.redirect(new URL("/pricing?purchase="+encodeURIComponent(status),request.url),303);
 }
}
