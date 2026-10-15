import {goOrigin} from "../../../../lib/server/go-origin";
import {boundedBody} from "../../../../lib/server/bounded-body";
export const dynamic="force-dynamic";
const KEY=/^ek_test_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const privateHeaders={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
function failure(code:string,status:number){return Response.json({error:{code}},{status,headers:privateHeaders})}
// Thin UI transport only: existing bearer authentication selects the test realm.
// It neither issues credentials nor simulates a payment, callback or success.
export async function POST(request:Request){
 const origin=new URL(request.url);origin.host=request.headers.get("host")||origin.host;
 if(request.headers.get("origin")!==origin.origin)return failure("ORIGIN_DENIED",403);
 const raw=await boundedBody(request,4096);if(raw===null)return failure("REQUEST_TOO_LARGE",413);
 let input:{testKey?:unknown;action?:unknown;amount?:unknown;redirect_url?:unknown;invoice_id?:unknown;idempotencyKey?:unknown};
 try{input=JSON.parse(raw);if(!input||Array.isArray(input)||typeof input!=="object")throw Error()}catch{return failure("INVALID_JSON",400)}
 if(typeof input.testKey!=="string"||!KEY.test(input.testKey))return failure("SANDBOX_KEY_REQUIRED",401);
 if(process.env.DEVELOPER_SANDBOX_ENABLED==="false")return failure("PORTAL_SANDBOX_NOT_ENABLED",503);
 if(input.action!=="create"&&input.action!=="verify")return failure("INVALID_ACTION",422);
 if(input.action==="verify"&&(typeof input.invoice_id!=="string"||!UUID.test(input.invoice_id)))return failure("INVALID_INVOICE_ID",422);
 if(input.action==="create"){
  if(typeof input.amount!=="number"||!Number.isFinite(input.amount)||input.amount<=0||input.amount>1000000000||!/^\d+(?:\.\d{1,2})?$/.test(String(input.amount)))return failure("INVALID_AMOUNT",422);
  if(typeof input.idempotencyKey!=="string"||!/^[A-Za-z0-9_.:-]{16,128}$/.test(input.idempotencyKey))return failure("INVALID_IDEMPOTENCY_KEY",422);
  try{if(typeof input.redirect_url!=="string")throw Error();const u=new URL(input.redirect_url);if(u.protocol!=="https:"||u.username||u.password||u.hash||input.redirect_url.length>2048)throw Error()}catch{return failure("INVALID_REDIRECT_URL",422)}
 }
 const target=goOrigin();if(!target)return failure("SANDBOX_API_UNAVAILABLE",503);
 const headers:Record<string,string>={Authorization:"Bearer "+input.testKey,"Content-Type":"application/json"};
 if(input.action==="create")headers["Idempotency-Key"]=input.idempotencyKey as string;
 try{
  const response=await fetch(new URL("/v1/payment/"+input.action,target),{method:"POST",headers,body:JSON.stringify(input.action==="create"?{amount:input.amount,redirect_url:input.redirect_url}:{invoice_id:input.invoice_id}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
  const body=await boundedBody(response,65536);if(body===null)return failure("SANDBOX_RESPONSE_TOO_LARGE",502);
  // Never echo a credential, including an unexpected upstream error body.
  if(body.includes(input.testKey)||/ek_(?:live|test)_[a-f0-9]{16}_/.test(body))return failure("SANDBOX_RESPONSE_REDACTED",502);
  let result:unknown;try{result=JSON.parse(body)}catch{return failure("SANDBOX_RESPONSE_INVALID",502)}
  return Response.json({sandbox:true,simulation:false,httpStatus:response.status,result},{status:response.ok?200:response.status,headers:privateHeaders});
 }catch{return failure("SANDBOX_REQUEST_UNRESOLVED",503)}
}
