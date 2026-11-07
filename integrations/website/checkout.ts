import {createHash} from 'node:crypto';
import {BriofoldClient, type Environment} from '../../sdk/typescript';
import type {MerchantDatabase} from '../../examples/webhook-receiver/consumer';

/** Call after your server has authenticated the buyer and authorized this order.
 * No amount, workspace, environment or key comes from browser/bot input.
 * A timeout leaves an unknown result: retry this function with the SAME order.
 */
export async function checkoutForAuthorizedOrder(reference:string, database:MerchantDatabase,
 config:{workspace:string;environment:Environment;apiOrigin:string;checkoutOrigin:string;apiKey:string;locale:'en'|'bn'}) {
 const origin=new URL(config.checkoutOrigin);
 if(origin.pathname!=='/'||origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash)throw Error('Configured HTTPS checkout origin required');
 const order=await database.transaction(async tx=>{
  const result=await tx.query<{amount_minor:string|number}>('SELECT amount_minor FROM merchant_orders WHERE reference=$1 FOR UPDATE',[reference]);
  if(result.rows.length!==1)throw Error('Authorized order unavailable');
  const paid=await tx.query('SELECT reference FROM merchant_fulfilment_jobs WHERE reference=$1',[reference]);
  if(paid.rows.length)throw Error('Order payment already accepted');
  const amount=Number(result.rows[0].amount_minor);
  if(!Number.isSafeInteger(amount)||amount<=0||amount>100000000000)throw Error('Server order amount invalid');
  return amount;
 });
 const key=createHash('sha256').update(`checkout|${config.workspace}|${config.environment}|${reference}`).digest('hex');
 const client=new BriofoldClient(config.apiOrigin,config.apiKey,config.environment);
 const result=await client.request('createPaymentIntent',{path:{workspaceID:config.workspace},
  idempotencyKey:key,body:{merchant_reference:reference,amount_minor:order,currency:'BDT',expires_in_minutes:30}}) as {id:string;checkout_token:string};
 if(!result.id||!/^[A-Za-z0-9_-]{43}$/.test(result.checkout_token))throw Error('Checkout result unconfirmed');
 return {intentId:result.id,url:new URL(`/${config.locale}/checkout/${result.checkout_token}`,origin).toString()};
}
