import {NextRequest,NextResponse} from "next/server";
import {createPurchase,ensureGuestSession,IntentError} from "../../../../lib/server/purchase-intents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function failure(error:unknown){
 if(error instanceof IntentError)return NextResponse.json({error:{code:error.code}},{status:error.status,headers:{"Cache-Control":"no-store"}});
 return NextResponse.json({error:{code:"PURCHASE_INTENT_UNAVAILABLE"}},{status:503,headers:{"Cache-Control":"no-store"}});
}
export async function GET(){
 try{await ensureGuestSession();return new NextResponse(null,{status:204,headers:{"Cache-Control":"no-store"}})}
 catch(e){return failure(e)}
}
export async function POST(request:NextRequest){
 if(request.headers.get("origin")!==request.nextUrl.origin)
  return NextResponse.json({error:{code:"ORIGIN_DENIED"}},{status:403});
 const length=Number(request.headers.get("content-length")||0);
 if(!Number.isSafeInteger(length)||length>2048)return NextResponse.json({error:{code:"INVALID_SELECTION"}},{status:422});
 try{
  const data=await request.json() as {offerKey?:unknown;term?:unknown;quantity?:unknown;coupon?:unknown;legacyPlanId?:unknown;versionId?:unknown};
  if(!data||typeof data.offerKey!=="string"||typeof data.term!=="string"||
    (data.quantity!==undefined&&typeof data.quantity!=="number")||
    (data.coupon!==undefined&&typeof data.coupon!=="string")||
    (data.legacyPlanId!==undefined&&typeof data.legacyPlanId!=="string")||
    (data.versionId!==undefined&&typeof data.versionId!=="string"))
   throw new IntentError("INVALID_SELECTION",422);
  const token=await createPurchase({offerKey:data.offerKey,term:data.term,
   quantity:data.quantity as number|undefined,coupon:data.coupon as string|undefined,
   versionId:data.versionId as string|undefined,
   legacyPlanId:data.legacyPlanId as string|undefined,
   idempotencyKey:request.headers.get("Idempotency-Key")||undefined});
  return NextResponse.json({intent:token,resume_url:`/subscribe/resume/${token}`},
   {status:201,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 }catch(e){return failure(e)}
}
