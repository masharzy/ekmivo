import {verifyBriofold} from './verify';
type Event={id:string;data:{payment_id:string;merchant_reference:string;amount_minor:number;currency:string}};
type Transaction={query<T>(sql:string,values:unknown[]):Promise<{rows:T[]}>};
export type MerchantDatabase={transaction<T>(work:(tx:Transaction)=>Promise<T>):Promise<T>};
// Adapt transaction/query to your merchant DB driver. The transaction must
// commit both event dedup and fulfilment together; never acknowledge early.
export async function consume(raw:Uint8Array,headers:Record<string,string>,config:{secret:string;workspace:string;environment:'sandbox'|'live';apiOrigin:string;apiKey:string},database:MerchantDatabase){
 const event=verifyBriofold(Buffer.from(raw),new Headers(headers),config.secret,config.workspace,config.environment) as Event;
 const origin=new URL(config.apiOrigin);if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash)throw Error('HTTPS API origin required');
 const url=new URL(`/v1/workspaces/${config.workspace}/operations/payments/${event.data.payment_id}`,origin);url.searchParams.set('environment',config.environment);
 const response=await fetch(url,{headers:{Authorization:`Bearer ${config.apiKey}`},redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('Payment query unavailable');const text=await response.text();if(text.length>16384)throw Error('Response bound exceeded');const rows=JSON.parse(text).items;
 const p=event.data;if(!Array.isArray(rows)||rows.length!==1||rows[0].id!==p.payment_id||rows[0].merchant_reference!==p.merchant_reference||rows[0].verified_amount_minor!==p.amount_minor||rows[0].currency!=='BDT')throw Error('Payment query mismatch');
 return database.transaction(async tx=>{
  const expected=await tx.query<{amount_minor:string|number}>('SELECT amount_minor FROM merchant_orders WHERE reference=$1 FOR UPDATE',[p.merchant_reference]);if(expected.rows.length!==1||Number(expected.rows[0].amount_minor)!==p.amount_minor)throw Error('Order mismatch');
  const existing=await tx.query<{payment_id:string}>('SELECT payment_id FROM merchant_fulfilment_jobs WHERE reference=$1',[p.merchant_reference]);
  if(existing.rows.length&&existing.rows[0].payment_id!==p.payment_id)throw Error('Different payment already accepted; reconcile overpayment');
  const inserted=await tx.query('INSERT INTO merchant_webhook_events(event_id,payment_id,reference) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',[event.id,p.payment_id,p.merchant_reference]);
  if(inserted.rows.length)await tx.query('INSERT INTO merchant_fulfilment_jobs(reference,payment_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[p.merchant_reference,p.payment_id]);
  return {accepted:true,duplicate:inserted.rows.length===0};
 });
}
