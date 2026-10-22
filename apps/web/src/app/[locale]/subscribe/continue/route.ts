import {NextRequest,NextResponse} from "next/server";
import {activePurchase} from "../../../../lib/server/purchase-intents";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 const token=await activePurchase();
 return NextResponse.redirect(new URL(token?`/subscribe/resume/${token}`:"/pricing",request.url),303);
}
