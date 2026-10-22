import {NextRequest,NextResponse} from "next/server";
import {readPurchase,bindStore,cancelPurchase,IntentError} from "../../../../../lib/server/purchase-intents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{token:string}>};
function failure(error:unknown){
 if(error instanceof IntentError)return NextResponse.json({error:{code:error.code}},{status:error.status,headers:{"Cache-Control":"no-store"}});
 return NextResponse.json({error:{code:"PURCHASE_INTENT_UNAVAILABLE"}},{status:503,headers:{"Cache-Control":"no-store"}});
}
export async function GET(_request:NextRequest,{params}:Context){
 try{
  const {token}=await params,intent=await readPurchase(token);
  return NextResponse.json({intent},{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
 }catch(e){return failure(e)}
}
export async function POST(request:NextRequest,{params}:Context){
 if(request.headers.get("origin")!==request.nextUrl.origin)
  return NextResponse.json({error:{code:"ORIGIN_DENIED"}},{status:403});
 if(Number(request.headers.get("content-length")||0)>1024)
  return NextResponse.json({error:{code:"INVALID_INTENT"}},{status:422});
 try{
  const {token}=await params;
  const data=await request.json() as {action?:unknown;storeId?:unknown;revision?:unknown};
  if(data.action==="bind"&&typeof data.storeId==="string"){
   const intent=await bindStore(token,data.storeId);
   return NextResponse.json({intent},{headers:{"Cache-Control":"no-store"}});
  }
  if(data.action==="cancel"&&typeof data.revision==="number"){
   return NextResponse.json(await cancelPurchase(token,data.revision),{headers:{"Cache-Control":"no-store"}});
  }
  throw new IntentError("INVALID_ACTION",422);
 }catch(e){return failure(e)}
}
