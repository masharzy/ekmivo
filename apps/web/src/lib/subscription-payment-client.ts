// Store-session, same-origin Phase 6 API client.
// Intentionally NOT the merchant Bearer-key SDK and never an entitlement engine.
export type SubscriptionPaymentResult={
 intent_id:string;invoice_id:string;amount_minor:number;currency:"BDT";
 status:"pending"|"verifying"|"completed"|"expired"|"cancelled"|"recovery_required";
 expires_at:string;verified:boolean;
};
export type SubscriptionPaymentHandoff={
 intent_id:string;invoice_id:string;amount_minor:number;currency:"BDT";
 checkout_token:string;payment_path:string;status:string;
};
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const key=/^[A-Za-z0-9_.:-]{16,128}$/;
function target(workspace:string,intent:string){
 if(!uuid.test(workspace)||!uuid.test(intent))throw new Error("INVALID_SCOPE");
 return `/api/go/workspaces/${workspace}/subscription-purchases/${intent}/payment`;
}
async function responseJSON<T>(res:Response):Promise<T>{
 if(!res.ok)throw new Error(res.status===404?"NOT_FOUND":"SUBSCRIPTION_STATUS_UNAVAILABLE");
 return await res.json() as T;
}
export async function readSubscriptionPayment(workspace:string,intent:string,signal?:AbortSignal){
 const res=await fetch(target(workspace,intent),{credentials:"same-origin",cache:"no-store",signal});
 const next=await responseJSON<SubscriptionPaymentResult>(res);
 if(!uuid.test(next.invoice_id)||next.intent_id!==intent||next.currency!=="BDT"||
    !Number.isSafeInteger(next.amount_minor)||next.amount_minor<=0||
    !["pending","verifying","completed","expired","cancelled","recovery_required"].includes(next.status)||
    next.verified!==(next.status==="completed"))throw new Error("INVALID_SUBSCRIPTION_PROOF");
 return next;
}
export async function issueSubscriptionPayment(workspace:string,intent:string,quote:string,invoice:string,idempotencyKey:string,signal?:AbortSignal){
 if(!uuid.test(quote)||!uuid.test(invoice)||!key.test(idempotencyKey))
  throw new Error("INVALID_SUBSCRIPTION_HANDOFF");
 let res:Response;
 try{
  res=await fetch(target(workspace,intent),{
   method:"POST",credentials:"same-origin",cache:"no-store",signal,
   headers:{"Content-Type":"application/json","Idempotency-Key":idempotencyKey},
   body:JSON.stringify({quote_id:quote,invoice_id:invoice}),
  });
 }catch{
  // Do not issue a different payment or regenerate an idempotency key.
  // A caller must status-lookup the original confirmed invoice and reconcile.
  throw new Error("UNKNOWN_OUTCOME_CHECK_STATUS");
 }
 const result=await responseJSON<SubscriptionPaymentHandoff>(res);
 if(result.intent_id!==intent||result.invoice_id!==invoice||result.currency!=="BDT"||
    !Number.isSafeInteger(result.amount_minor)||result.amount_minor<=0||
    !/^[A-Za-z0-9_-]{43}$/.test(result.checkout_token)||
    result.payment_path!==`/pay/subscription/${result.checkout_token}`)
  throw new Error("INVALID_SUBSCRIPTION_HANDOFF");
 return result;
}
