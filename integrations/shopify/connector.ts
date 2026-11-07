import {createHash} from 'node:crypto';
import type {MerchantDatabase} from '../../examples/webhook-receiver/consumer';
import {checkoutForAuthorizedOrder} from '../website/checkout';

type Config=Parameters<typeof checkoutForAuthorizedOrder>[2]&{shop:string;adminToken:string;exactManualPaymentSupported:boolean};
type Order={id:string;cancelledAt:string|null;currencyCode:string;totalOutstandingSet:{shopMoney:{amount:string;currencyCode:string}}};
const selection='id cancelledAt currencyCode totalOutstandingSet { shopMoney { amount currencyCode } }';
function paisa(value:string){
 if(!/^\d+(\.\d{1,2})?$/.test(value))throw Error('Unsupported money precision');
 const [whole,fraction='']=value.split('.');const result=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
 if(result<=BigInt(0)||result>BigInt(100000000000))throw Error('Order has no supported outstanding amount');return Number(result);
}
async function graphql<T>(config:Config,query:string,variables:Record<string,unknown>):Promise<T>{
 if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(config.shop)||!config.adminToken)throw Error('Configured Shopify account required');
 const response=await fetch(`https://${config.shop}/admin/api/2026-10/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':config.adminToken},body:JSON.stringify({query,variables}),redirect:'error',signal:AbortSignal.timeout(10000)});
 const raw=await response.text();if(!response.ok||raw.length>1048576)throw Error('Shopify result unconfirmed');
 const result=JSON.parse(raw);if(result.errors?.length||!result.data)throw Error('Shopify operation unavailable');return result.data as T;
}
async function readOrder(config:Config,id:string){
 if(!/^gid:\/\/shopify\/Order\/\d+$/.test(id))throw Error('Invalid authorized order ID');
 const result=await graphql<{order:Order|null}>(config,`query($id:ID!){order(id:$id){${selection}}}`,{id});
 if(!result.order||result.order.cancelledAt||result.order.currencyCode!=='BDT'||result.order.totalOutstandingSet.shopMoney.currencyCode!=='BDT')throw Error('Order unavailable, cancelled or unsupported currency');
 return {order:result.order,amount:paisa(result.order.totalOutstandingSet.shopMoney.amount)};
}
/** The merchant server must authorize this Shopify order for the current buyer. */
export async function prepareShopifyCheckout(orderID:string,database:MerchantDatabase,config:Config){
 const {amount}=await readOrder(config,orderID);
 const reference='SHOPIFY-'+createHash('sha256').update(config.shop+'|'+orderID).digest('hex');
 await database.transaction(async tx=>{
  await tx.query('INSERT INTO merchant_orders(reference,amount_minor) VALUES($1,$2) ON CONFLICT DO NOTHING',[reference,amount]);
  const stored=await tx.query<{amount_minor:string|number}>('SELECT amount_minor FROM merchant_orders WHERE reference=$1 FOR UPDATE',[reference]);
  if(stored.rows.length!==1||Number(stored.rows[0].amount_minor)!==amount)throw Error('Order total changed; resolve the original checkout');
  await tx.query('INSERT INTO merchant_shopify_orders(reference,shop,order_gid) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[reference,config.shop,orderID]);
 });
 return checkoutForAuthorizedOrder(reference,database,config);
}
/** Call from the merchant worker AFTER canonical signed webhook consumption.
 * Records externally received funds; it never charges or refunds a customer.
 */
export async function recordVerifiedShopifyPayment(reference:string,database:MerchantDatabase,config:Config){
 if(!config.exactManualPaymentSupported)throw Error('Exact manual-payment capability unavailable; do not record a different amount');
 const job=await database.transaction(async tx=>{
  const result=await tx.query<{payment_id:string;amount_minor:string|number;order_gid:string;shop:string}>(
   'SELECT j.payment_id,o.amount_minor,s.order_gid,s.shop FROM merchant_fulfilment_jobs j JOIN merchant_orders o USING(reference) JOIN merchant_shopify_orders s USING(reference) WHERE j.reference=$1 FOR UPDATE OF j',[reference]);
  if(result.rows.length!==1||result.rows[0].shop!==config.shop)throw Error('Verified consumer job unavailable');
  const row=result.rows[0];
  const inserted=await tx.query('INSERT INTO merchant_shopify_recordings(reference,payment_id,state) VALUES($1,$2,\'sending\') ON CONFLICT DO NOTHING RETURNING reference',[reference,row.payment_id]);
  if(!inserted.rows.length){
   const state=await tx.query<{state:string;payment_id:string}>('SELECT state,payment_id FROM merchant_shopify_recordings WHERE reference=$1',[reference]);
   if(state.rows[0]?.payment_id!==row.payment_id)throw Error('Conflicting payment requires review');
   return {existing:state.rows[0]?.state};
  }
  return {row};
 });
 if('existing' in job)return {state:job.existing};
 const finish=async(state:'recorded'|'failed'|'unknown')=>database.transaction(tx=>tx.query('UPDATE merchant_shopify_recordings SET state=$2,finished_at=now() WHERE reference=$1 AND state=\'sending\'',[reference,state]));
 let mutationStarted=false;
 try{
  const {amount}=await readOrder(config,job.row.order_gid);
  if(amount!==Number(job.row.amount_minor))throw Error('Outstanding amount changed; seller review required');
  mutationStarted=true;
  const result=await graphql<{orderCreateManualPayment:{order:Order|null;userErrors:{message:string}[]}}>(config,
   `mutation($id:ID!,$amount:MoneyInput!,$name:String!){orderCreateManualPayment(id:$id,amount:$amount,paymentMethodName:$name){order{${selection}} userErrors{message}}}`,
   {id:job.row.order_gid,amount:{amount:(amount/100).toFixed(2),currencyCode:'BDT'},name:'Briofold '+job.row.payment_id});
  const record=result.orderCreateManualPayment;
  if(record.userErrors.length){await finish('failed');return {state:'failed'};}
  if(!record.order||record.order.id!==job.row.order_gid||record.order.totalOutstandingSet.shopMoney.amount!=='0.00'&&record.order.totalOutstandingSet.shopMoney.amount!=='0')throw Error('Recorded order outcome requires review');
  await finish('recorded');return {state:'recorded'};
 }catch{
  await finish(mutationStarted?'unknown':'failed');
  throw Error(mutationStarted?'Shopify write outcome unknown; do not retry blindly':'Shopify record deferred; fix configuration or review changed order');
 }
}
