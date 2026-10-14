import {randomUUID} from "node:crypto";
import {goOrigin} from "../../../../lib/server/go-origin";
import {boundedBody} from "../../../../lib/server/bounded-body";

export const dynamic="force-dynamic";
const TEST_KEY=/^ek_test_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export async function POST(request:Request){
 const url=new URL(request.url);
 url.host=request.headers.get("host")||url.host;
 if(request.headers.get("origin")!==url.origin)return Response.json({error:{code:"ORIGIN_DENIED"}},{status:403});
 const input=await boundedBody(request,2048);
 if(input===null)return Response.json({error:{code:"REQUEST_TOO_LARGE"}},{status:413});
 let data:{testKey?:string;action?:string;intentId?:string;idempotencyKey?:string;reference?:string};
 try{data=JSON.parse(input);if(!data||Array.isArray(data)||typeof data!=="object")throw Error("invalid");}catch{return Response.json({error:{code:"INVALID_JSON"}},{status:400})}
 if(typeof data.testKey!=="string"||!TEST_KEY.test(data.testKey))return Response.json({error:{code:"SANDBOX_KEY_REQUIRED"}},{status:401});
 if(data.action!=="create"&&data.action!=="status")return Response.json({error:{code:"INVALID_ACTION"}},{status:422});
 if(data.action==="status"&&(!data.intentId||!UUID.test(data.intentId)))return Response.json({error:{code:"INVALID_INTENT_ID"}},{status:422});
 if(data.action==="create"&&(!data.reference||!/^[A-Za-z0-9_.:-]{8,80}$/.test(data.reference)||!data.idempotencyKey||!/^[A-Za-z0-9_.:-]{16,128}$/.test(data.idempotencyKey)))
  return Response.json({error:{code:"INVALID_TEST_REFERENCE"}},{status:422});
 const origin=goOrigin();
 if(!origin)return Response.json({error:{code:"SANDBOX_API_UNAVAILABLE"}},{status:503});
 const target=new URL(data.action==="create"?"/v1/payment-intents":"/v1/payment-intents/"+data.intentId,origin);
 const headers:Record<string,string>={Authorization:"Bearer "+data.testKey,"Content-Type":"application/json"};
 if(data.action==="create")headers["Idempotency-Key"]=data.idempotencyKey!;
 // Never forward any environment or workspace from the browser. The signed key binds both.
 try{
  const response=await fetch(target,{method:data.action==="create"?"POST":"GET",
   headers,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000),
   ...(data.action==="create"?{body:JSON.stringify({merchant_reference:data.reference,
      amount_minor:12500,currency:"BDT",expires_in_minutes:30})}:{})});
  const raw=await boundedBody(response,65536);
  if(raw===null)return Response.json({error:{code:"SANDBOX_RESPONSE_TOO_LARGE"}},{status:502});
  let result:unknown;
  try{result=JSON.parse(raw)}catch{return Response.json({error:{code:"SANDBOX_RESPONSE_INVALID"}},{status:502})}
  return Response.json({sandbox:true,simulation:false,httpStatus:response.status,result},
    {status:response.ok?200:response.status,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
 }catch{return Response.json({error:{code:"SANDBOX_REQUEST_UNRESOLVED"}},{status:503})}
}
