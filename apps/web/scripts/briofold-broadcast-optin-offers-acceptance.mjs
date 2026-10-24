import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import postgres from 'postgres';
export async function runSignedBroadcastOffers({control,sessions,apiOrigin}){
 const u=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||/prod/i.test(u.pathname))throw Error('Offer tests refuse shared DB');
 const db=postgres(control,{max:2,prepare:false,connection:{application_name:'phase10_signed_offers',statement_timeout:20000,lock_timeout:5000}});
 try{
  const owner=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.owner).digest('hex')}`)[0].user_id;
  const store=randomUUID(),account='optin-'+randomUUID(),sender='fictional-recipient';await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional signed offer Store','ai',${owner})`;await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner')`;
  const conn=(await db`SELECT inbox_connection(${store},'live','ms',${account},decode('abcd','hex')) id`)[0].id;
  const event=(text,id=randomUUID())=>JSON.stringify({object:'page',entry:[{id:account,messaging:[{sender:{id:sender},timestamp:Date.now(),message:{mid:id,text}}]}]});
  const signed=async(raw,sig='sha256='+createHmac('sha256','phase6-comment-test-secret').update(raw).digest('hex'))=>fetch(apiOrigin+'/v1/channels/meta/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':sig},body:raw});
  for(const role of ['ekmivo_financial_runtime','ekmivo_financial_projection']){
   assert.equal((await db`SELECT has_function_privilege(${role},'briofold_growth_provider_opt_in(uuid,text,text)','EXECUTE') ok`)[0].ok,true,'signed opt-in requires the restricted inbound role');
   assert.equal((await db`SELECT has_table_privilege(${role},'briofold_growth_channel_consents','INSERT') ok`)[0].ok,false,'callback permission must not grant direct consent writes');
  }
  const first=event('START OFFERS');assert.equal((await signed(first,'sha256='+'0'.repeat(64))).status,403);assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_channel_consents WHERE workspace_id=${store}`)[0].n),0,'forged callback minted consent');
  assert.equal((await signed(event('Please start my order'))).status,200);assert.equal((await signed(event('START'))).status,200);assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_channel_consents WHERE workspace_id=${store}`)[0].n),0,'unrelated text minted consent');
  assert.equal((await signed(first)).status,200);assert.equal((await signed(first)).status,200);assert.equal((await signed(event(' start offers '))).status,200);
  const proofs=await db`SELECT p.*,m.body,m.sender FROM briofold_growth_channel_consents p JOIN inbox_messages m ON m.id=p.provider_message_id WHERE p.workspace_id=${store}`;
  assert.equal(proofs.length,1);assert.equal(proofs[0].body,'START OFFERS');assert.equal(proofs[0].sender,'customer');assert.equal(proofs[0].evidence_digest,createHash('sha256').update(first).digest('hex'));assert.equal(proofs[0].channel,'messenger');assert.ok(proofs[0].identity_source_id);assert.equal(proofs[0].identity_proof_id,null);
  assert.equal((await db`SELECT briofold_growth_provider_opt_in(${conn},${JSON.parse(first).entry[0].messaging[0].message.mid},${'f'.repeat(64)}) ok`)[0].ok,false,'unbound digest accepted as provider evidence');
  const customer=proofs[0].customer_id;assert.equal((await db`SELECT preferences->>'marketing' marketing FROM briofold_customers WHERE id=${customer}`)[0].marketing,'opted-in');
  const reply=randomUUID();await db`SELECT briofold_inbox_work_write(${store},'live',${owner},NULL,${randomUUID()},'saved-reply',${db.json({id:reply,revision:0,title:'Fictional offer sequence',body:'Fictional audience offer only',messages:[{type:'text',text:'Fictional audience offer only'}],visibility:'team'})})`;
  const campaign=(await db`SELECT briofold_growth_operations_write(${store},'live',${owner},${randomUUID()},'draft-create',${db.json({kind:'broadcast',title:'Fictional signed offer campaign',body:'Planning only',audience:'all',time_zone:'Asia/Dhaka'})}) data`)[0].data.id;
  const coupon=(await db`INSERT INTO commerce_coupons(workspace_id,environment,code,kind,value,usage_limit,starts_at,expires_at,audience) VALUES(${store},'live',${'OFFER_'+randomUUID().slice(0,8).toUpperCase()},'fixed',1000,10,now()-interval '1 minute',now()+interval '4 hours',${db.array([customer])}::uuid[]) RETURNING id,code`)[0];
  const generic=(await db`INSERT INTO commerce_coupons(workspace_id,environment,code,kind,value,usage_limit,expires_at) VALUES(${store},'live',${'OPEN_'+randomUUID().slice(0,8).toUpperCase()},'fixed',1000,10,now()+interval '4 hours') RETURNING id`)[0];
  const input={campaign_id:campaign,campaign_revision:1,reply_id:reply,reply_revision:1,channel:'messenger',coupon_id:coupon.id};
  const command=async(action,body,key=randomUUID())=>(await db`SELECT briofold_broadcast_command(${store},'live',${owner},${key},${action},${db.json(body)}) data`)[0].data;
  const preview=await command('broadcast-preview',input);assert.equal(preview.recipients,1);assert.equal(preview.coupon.code,coupon.code);assert.equal((await command('broadcast-preview',{...input,coupon_id:null,coupon_code:coupon.code.toLowerCase()})).coupon.id,coupon.id);assert.notEqual(preview.token,(await command('broadcast-preview',{...input,coupon_id:null})).token);
  await assert.rejects(()=>command('broadcast-preview',{...input,coupon_id:generic.id}),e=>e.code==='42501','global coupon bound as private offer');await assert.rejects(()=>command('broadcast-preview',{...input,coupon_id:randomUUID()}),e=>e.code==='42501');
  const approval={...input,preview_token:preview.token,confirmed:true,due_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),time_zone:'Asia/Dhaka'};
  await assert.rejects(()=>command('broadcast-approve',{...approval,expires_at:new Date(Date.now()+5*3600000).toISOString()}),e=>e.code==='40001','delivery outlived authoritative offer');
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_broadcast_runs WHERE campaign_id=${campaign}`)[0].n),0,'rejected offer partially approved');
  const key=randomUUID(),run=await command('broadcast-approve',approval,key);assert.deepEqual(await command('broadcast-approve',approval,key),run);const record=(await db`SELECT coupon_id,coupon_revision,coupon_snapshot FROM briofold_broadcast_runs WHERE id=${run.id}`)[0];assert.equal(record.coupon_id,coupon.id);assert.equal(Number(record.coupon_revision),1);assert.equal(record.coupon_snapshot.code,coupon.code);
  await assert.rejects(()=>db`UPDATE briofold_broadcast_runs SET coupon_snapshot='{}' WHERE id=${run.id}`,e=>e.code==='42501','approved offer terms were mutable');
  const recipient=(await db`SELECT id FROM briofold_broadcast_recipients WHERE run_id=${run.id}`)[0];assert.equal((await db`SELECT briofold_broadcast_valid(${recipient.id}) ok`)[0].ok,true);
  try{await db.begin(async tx=>{
   const order=randomUUID();await tx`INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,customer_id,recipient,subtotal_minor,coupon_id,coupon_discount_minor,total_minor) VALUES(${order},${store},'live',${'FICTIONAL-CLAIM-'+order},'manual',${customer},'{}',10000,${coupon.id},1000,9000)`;
   await tx`INSERT INTO commerce_coupon_claims(coupon_id,order_id,customer_id,status) VALUES(${coupon.id},${order},${customer},'reserved')`;
   assert.equal((await tx`SELECT briofold_broadcast_valid(${recipient.id}) ok`)[0].ok,false,'per-customer reserved claim did not block offer dispatch');
   await tx`UPDATE commerce_coupon_claims SET status='released' WHERE order_id=${order}`;assert.equal((await tx`SELECT briofold_broadcast_valid(${recipient.id}) ok`)[0].ok,true,'released claim did not restore eligibility');throw Error('ROLLBACK_ONLY_OFFER_CLAIM');
  });}catch(e){if(e.message!=='ROLLBACK_ONLY_OFFER_CLAIM')throw e;}
  await db`UPDATE commerce_coupons SET active=false,revision=revision+1 WHERE id=${coupon.id}`;assert.equal((await db`SELECT briofold_broadcast_valid(${recipient.id}) ok`)[0].ok,false,'disabled offer retained dispatch approval');await db`SELECT briofold_broadcast_tick()`;assert.equal((await db`SELECT state FROM briofold_broadcast_recipients WHERE id=${recipient.id}`)[0].state,'blocked');
  assert.equal((await signed(event('STOP'))).status,200);assert.equal((await signed(event('START OFFERS'))).status,200);assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_suppressions WHERE customer_id=${customer}`)[0].n),1,'START reversed permanent suppression');assert.equal((await command('broadcast-preview',{...input,coupon_id:null})).recipients,0);
  assert.equal(Number((await db`SELECT count(*) n FROM briofold_growth_channel_consents WHERE workspace_id=${store}`)[0].n),1,'START minted another proof after STOP');
  const erased=(await db`INSERT INTO briofold_customers(workspace_id,environment,name,email) VALUES(${store},'live','Fictional privacy contact','erase-only@example.invalid') RETURNING id`)[0].id;
  const emailProof=(await db`INSERT INTO briofold_customer_proofs(workspace_id,environment,customer_id,kind,value) VALUES(${store},'live',${erased},'email','erase-only@example.invalid') RETURNING id`)[0].id;
  const consent=(await db`INSERT INTO briofold_growth_channel_consents(workspace_id,environment,customer_id,channel,identity_proof_id,source_kind,evidence_digest,verified_at) VALUES(${store},'live',${erased},'email',${emailProof},'confirmed-double-opt-in',${'a'.repeat(64)},now()) RETURNING id`)[0].id;
  await db`SELECT briofold_customers_write(${store},'live',${owner},${randomUUID()},'delete',${db.json({id:erased,revision:1,confirmed:true})})`;
  const privacy=(await db`SELECT c.email,c.deleted_at,p.value,p.revoked_at proof_revoked,g.revoked_at consent_revoked FROM briofold_customers c JOIN briofold_customer_proofs p ON p.customer_id=c.id JOIN briofold_growth_channel_consents g ON g.identity_proof_id=p.id WHERE c.id=${erased} AND g.id=${consent}`)[0];assert.equal(privacy.email,'');assert.equal(privacy.value,'');assert.ok(privacy.deleted_at&&privacy.proof_revoked&&privacy.consent_revoked,'erasure did not retire linked consent safely');
  console.log('SIGNED BROADCAST CONSENT/OFFERS SQL/Go PASS: real verified Meta START OFFERS versus forged/implicit/replay, exact message/source/raw digest, no opt-out reversal, audience-bound coupon preview/token/expiry/immutable snapshot/reserved claim and dispatch revocation, consent-linked PII erasure without history deletion; no outgoing provider request');
 }finally{await db.end();}
}
