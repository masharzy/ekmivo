// Invoked by the existing disposable PostgreSQL harness after PG04-PG09.
// These are fictional SQL cases, never provider/device acceptance evidence.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function runPaymentExtensions({db,live,control,workspace,otherWorkspace}){
 let count=0;const equal=(a,b,message)=>{assert.deepEqual(a,b,message);count++};
 const scoped=(ws,run)=>db.begin(async tx=>{await tx.unsafe("SET LOCAL ROLE ekmivo_finance_reader");await tx.unsafe("SELECT set_config('ekmivo.workspace_id',$1,true),set_config('ekmivo.environment','sandbox',true)",[ws]);return run(tx)});
 const reject=async fn=>{await assert.rejects(fn);count++};
 const create=async(kind,body,key=randomUUID())=>scoped(workspace,async tx=>{
  const input=[workspace,kind,db.json(body),key,hash(JSON.stringify(body)),hash(key)];
  try{return (await tx.unsafe("SELECT pg10_write($1::uuid,'sandbox',$2,NULL,'create',$3::jsonb,$4,$5,$6,NULL) result",input))[0].result;}
  catch(error){
   // Log only safe structure and SQLSTATE; no customer details or body values.
   console.error('PG10 create rejected:',JSON.stringify({kind,bodyKeys:Object.keys(body),keyLength:key.length,requestHashLength:input[4].length,capabilityHashLength:input[5].length,sqlstate:error.code,pgMessage:error.message}));
   throw error;
  }
 });
 const customerBody={reference:'CUSTOMER-'+randomUUID(),name:'CI fictional customer',email:'fictional@example.invalid'};
 const key=randomUUID(),customer=await create('customers',customerBody,key);
 equal((await create('customers',customerBody,key)).id,customer.id,'Lost-response customer retry must return one record');
 await reject(()=>create('customers',{...customerBody,name:'Changed'},key));
 await reject(()=>scoped(otherWorkspace,tx=>tx.unsafe("SELECT pg10_write($1::uuid,'sandbox','customers',$2::uuid,'edit',$3::jsonb,$4,$5,$6,NULL)",[otherWorkspace,customer.id,db.json({...customerBody,expected_version:1}),randomUUID(),hash('edit'),hash('cap')])));
 const invoiceBody={reference:'INVOICE-'+randomUUID(),customer_id:customer.id,items:[{title:'Physical sample',quantity:2,unit_amount_minor:5000}],tax_minor:500,fee_minor:0,shipping_minor:200,discount_minor:100};
 const invoice=await create('invoices',invoiceBody);equal(Number(invoice.amount_minor),10600,'Invoice total must be calculated in SQL');

 // Migrations 0078-0081: auto numbering and capability-protected invoice lifecycle.
 const autoBody={reference:'',items:[{title:'Fictional numbered invoice',quantity:1,unit_amount_minor:5500}],private_notes:'CI PRIVATE'};
 const autoKey=randomUUID(),autoCap=hash('invoice-'+autoKey),autoRequestHash=hash(JSON.stringify(autoBody));
 const autoCreate=(key,cap,bodyHash)=>scoped(workspace,async tx=>(await tx.unsafe(
  "SELECT pg10_invoice_auto_create($1::uuid,'sandbox',$2::jsonb,$3,$4,$5,NULL) result",
  [workspace,db.json(autoBody),key,bodyHash,cap]))[0].result);
 const numbered=await autoCreate(autoKey,autoCap,autoRequestHash);
 equal(numbered.reference,'INV-0001','First automatic invoice reference is sequential');
 equal((await autoCreate(autoKey,autoCap,autoRequestHash)).id,numbered.id,'Auto invoice replay returns original record');
 await reject(()=>autoCreate(autoKey,autoCap,hash('changed-body')));
 const secondKey=randomUUID(),second=await autoCreate(secondKey,hash('invoice-'+secondKey),hash('second-'+JSON.stringify(autoBody)));
 equal(second.reference,'INV-0002','Next auto invoice reference increments exactly once');
 const autoPublic=async()=> (await db.unsafe("SELECT pg10_public($1) data",[autoCap]))[0].data;
 const draftPublic=await autoPublic();
 equal(draftPublic.status,'draft','Draft invoice supports capability-only public preview');
 equal(Object.hasOwn(draftPublic.body,'private_notes'),false,'Public invoice never exposes internal notes');
 const numberAction=async(verb,expected)=>scoped(workspace,async tx=>(await tx.unsafe(
  "SELECT pg10_write($1::uuid,'sandbox','invoices',$2::uuid,$3,$4::jsonb,$5,$6,$7,NULL) result",
  [workspace,numbered.id,verb,db.json({expected_version:expected}),randomUUID(),hash(verb+expected),autoCap]))[0].result);
 const numberedIssued=await numberAction('issue',1);
 equal(numberedIssued.status,'issued','Numbered invoice can be issued without a second create');
 const issuedPublic=await autoPublic();
 equal(issuedPublic.status,'issued','Issued invoice becomes public and payable');
 equal(Boolean(issuedPublic.issued_at),true,'Issue timestamp is stored for public invoice');
 const numberedCancelled=await numberAction('cancel',2);
 equal(numberedCancelled.status,'cancelled','Issued invoice cancellation preserves its record');
 equal((await autoPublic()).status,'cancelled','Void invoice stays visible as non-payable public record');

 await reject(()=>create('invoices',{...invoiceBody,reference:randomUUID(),items:[{quantity:1,unit_amount_minor:100}]}));
 await reject(()=>create('invoices',{...invoiceBody,reference:randomUUID(),customer_id:randomUUID()}));
 const action=async(id,verb,body)=>scoped(workspace,async tx=>(await tx.unsafe("SELECT pg10_write($1::uuid,'sandbox','invoices',$2::uuid,$3,$4::jsonb,$5,$6,$7,NULL) result",[workspace,id,verb,db.json(body),randomUUID(),hash(verb+JSON.stringify(body)),hash('unused')]))[0].result);
 await reject(()=>action(invoice.id,'issue',{}));
 await action(invoice.id,'issue',{expected_version:1});
 await reject(()=>action(invoice.id,'cancel',{expected_version:1}));
 await reject(()=>action(invoice.id,'edit',{...invoiceBody,expected_version:2}));
 const corrected=await action(invoice.id,'correct',{...invoiceBody,expected_version:2,shipping_minor:300});equal(Number(corrected.amount_minor),10700,'Issued correction updates snapshot while retaining history');
 await reject(()=>action(invoice.id,'correct',{...invoiceBody,expected_version:2}));
 const history=await scoped(workspace,async tx=>(await tx.unsafe("SELECT pg10_read($1::uuid,'sandbox','invoices',$2::uuid,NULL,NULL) data",[workspace,invoice.id]))[0].data);
 equal(history.items[0].history.length,3,'Create/issue/correction each retain version');
 const linkKey=randomUUID(),link=await create('payment-links',{reference:'LINK-'+randomUUID(),amount_minor:12500,max_uses:0,max_quantity:3},linkKey);
 await scoped(workspace,tx=>tx.unsafe(`SELECT pg10_write($1::uuid,'sandbox','payment-links',$2::uuid,'publish','{"expected_version":1}',$3,$4,$5,NULL)`,[workspace,link.id,randomUUID(),hash('publish'),hash('unused')]));
 const visitorKey=randomUUID();const visit=async(quantity,key)=>db.unsafe("SELECT pg10_visit($1,$2,$3,$4,$5::jsonb) result",[hash(linkKey),key,hash(key+quantity),hash('intent-'+key),db.json({_quantity:quantity})]);
 const visitor=(await visit(2,visitorKey))[0].result;equal(Number(visitor.amount_minor),25000,'Link quantity must derive server total');
 equal((await visit(2,visitorKey))[0].result.id,visitor.id,'Per-visitor idempotency must not issue twice');
 await reject(()=>visit(4,randomUUID()));
 // Expiry and return destinations are hard server policies; browser UI
 // countdowns and client redirects cannot make an expired link payable or
 // authorize an arbitrary destination. All sources are disposable.
 const expiredKey=randomUUID(),expired=await create('payment-links',{
  reference:'EXPIRING-'+randomUUID(),amount_minor:4500,max_quantity:1,
  expires_at:new Date(Date.now()-60000).toISOString()
 },expiredKey);
 await scoped(workspace,tx=>tx.unsafe(
  "SELECT pg10_write($1::uuid,'sandbox','payment-links',$2::uuid,'publish','{\"expected_version\":1}',$3,$4,$5,NULL)",
  [workspace,expired.id,randomUUID(),hash('publish-expired'),hash('expired-cap')]
 ));
 await assert.rejects(()=>db.unsafe('SELECT pg10_visit($1,$2,$3,$4,$5::jsonb)',[
  hash(expiredKey),randomUUID(),hash('new expired visit'),hash('expired intent'),db.json({_quantity:1})
 ]),error=>error.code==='23514','Expired link unexpectedly issued a new payment capability');count++;
 await assert.rejects(()=>create('payment-links',{
  reference:'UNTRUSTED-RETURN-'+randomUUID(),amount_minor:4500,
  return_url:'https://unregistered-ci.invalid/after-payment'
 }),error=>error.code==='23514','Unregistered merchant return URL was accepted');count++;
 const registeredOrigin=`https://fixture-${randomUUID()}.example.invalid`;
 await db.unsafe("INSERT INTO pg12_integrations(workspace_id,environment,kind,name,origin,status) VALUES($1::uuid,'sandbox','website','Fictional checkout redirect source',$2,'configured')",[workspace,registeredOrigin]);
 // pg10_return_allowed is deliberately PRIVATE. Verify it through the
 // authorized security-definer document writer, never by granting execution
 // to the financial application role just to satisfy a fixture.
 const rejectedReturn=async(url,label)=>{
  await assert.rejects(()=>create('payment-links',{
   reference:'DENIED-RETURN-'+randomUUID(),amount_minor:4500,return_url:url
  }),error=>error.code==='23514',label);count++;
 };
 await rejectedReturn(registeredOrigin+'.attacker.invalid/thank-you','lookalike host bypassed registered return origin');
 await rejectedReturn(registeredOrigin+'/thank-you?secret=1','unapproved query-bearing redirect accepted');
 const otherRealmOrigin=`https://live-only-${randomUUID()}.example.invalid`;
 await db.unsafe("INSERT INTO pg12_integrations(workspace_id,environment,kind,name,origin,status) VALUES($1::uuid,'live','website','Other realm redirect source',$2,'configured')",[workspace,otherRealmOrigin]);
 await rejectedReturn(otherRealmOrigin+'/thank-you','live-only registered origin escaped into sandbox');
 const allowedKey=randomUUID(),allowed=await create('payment-links',{
  reference:'REGISTERED-RETURN-'+randomUUID(),amount_minor:4500,max_quantity:1,
  expires_at:new Date(Date.now()+86400000).toISOString(),return_url:registeredOrigin+'/thank-you'
 },allowedKey);
 await scoped(workspace,tx=>tx.unsafe(
  "SELECT pg10_write($1::uuid,'sandbox','payment-links',$2::uuid,'publish','{\"expected_version\":1}',$3,$4,$5,NULL)",
  [workspace,allowed.id,randomUUID(),hash('registered-return-publish'),hash(allowedKey)]));
 const allowedVisit=await db.unsafe('SELECT pg10_visit($1,$2,$3,$4,$5::jsonb) result',[
  hash(allowedKey),randomUUID(),hash('registered return visit'),hash('registered return intent'),db.json({_quantity:1})
 ]);
 equal(Number(allowedVisit[0].result.amount_minor),4500,'registered future-expiring redirect link failed its server-priced visit');
 await db.unsafe("UPDATE pg12_integrations SET status='disabled' WHERE workspace_id=$1::uuid AND environment='sandbox' AND origin=$2",[workspace,registeredOrigin]);
 await rejectedReturn(registeredOrigin+'/thank-you','disabled integration still authorizes a checkout redirect');
 // Reconciliation is merchant-imported evidence, not an independent source of
 // verified funds. Associate only an existing, exact-amount/account financial
 // payment and preserve its original immutable verification provenance.
 const verified=(await db.unsafe(
  "SELECT p.id AS payment_id,p.verified_amount_minor,p.verification_method,p.currency,a.receiving_account_id "+
  "FROM financial_payments p JOIN payment_attempts a ON a.id=p.attempt_id "+
  "WHERE p.workspace_id=$1::uuid AND p.environment='sandbox' LIMIT 1",[workspace]))[0];
 assert.ok(verified?.payment_id,'PG07 fictional verified financial source is required for reconciliation');count++;
 const addStatement=(line,amount,digest,sourceAccount=verified.receiving_account_id,direction='incoming')=>scoped(workspace,async tx=>(await tx.unsafe(
  "SELECT pg11_statement($1::uuid,'sandbox',$2::uuid,$3,$4,$5,'BDT',$6,now(),$7) id",
  [workspace,sourceAccount,line,'CI-merchant-statement',amount,direction,digest]))[0].id);
 const associate=(id)=>scoped(workspace,async tx=>(await tx.unsafe(
  "SELECT pg11_settlement($1::uuid,'sandbox',$2::uuid,$3::uuid,$4,NULL) result",
  [workspace,id,verified.payment_id,'CI reviewed imported bank statement']))[0].result);
 const mismatchedLine='WRONG-AMOUNT-'+randomUUID();
 const wrongStatement=await addStatement(mismatchedLine,Number(verified.verified_amount_minor)+1,hash(mismatchedLine));
 await assert.rejects(()=>associate(wrongStatement),error=>error.code==='23514',
  'Wrong-amount merchant statement was associated with a verified payment');count++;
 const outgoingLine='OUTGOING-'+randomUUID();
 const outgoing=await addStatement(outgoingLine,Number(verified.verified_amount_minor),hash(outgoingLine),verified.receiving_account_id,'outgoing');
 await assert.rejects(()=>associate(outgoing),error=>error.code==='23514',
  'Outgoing bank statement was associated with an incoming verified payment');count++;
 const alternate=(await db.unsafe(
  "SELECT id FROM financial_receiving_accounts WHERE workspace_id=$1::uuid AND environment='sandbox' AND id<>$2::uuid LIMIT 1",
  [workspace,verified.receiving_account_id]))[0];
 assert.ok(alternate?.id,'PG07 other fictional receiving account is required for reconciliation mismatch');count++;
 const wrongAccountLine='WRONG-ACCOUNT-'+randomUUID();
 const wrongAccount=await addStatement(wrongAccountLine,Number(verified.verified_amount_minor),hash(wrongAccountLine),alternate.id);
 await assert.rejects(()=>associate(wrongAccount),error=>error.code==='23514',
  'Other receiving account statement was attached to a verified payment');count++;
 const matchingLine='EXACT-AMOUNT-'+randomUUID();
 const matchingDigest=hash(matchingLine);
 const exactStatement=await addStatement(matchingLine,Number(verified.verified_amount_minor),matchingDigest);
 equal(await addStatement(matchingLine,Number(verified.verified_amount_minor),matchingDigest),exactStatement,
  'Lost-response statement import duplicated an identical source line');
 await assert.rejects(()=>addStatement(matchingLine,Number(verified.verified_amount_minor)+1,hash('changed-'+matchingLine)),
  error=>error.code==='23505','Reused statement line silently changed its original evidence');count++;
 const association=await associate(exactStatement);
 equal(association.payment_id,verified.payment_id,'Imported statement was linked to the wrong financial payment');
 equal(association.provider_verified,false,'Merchant statement was mislabeled as provider settlement');
 await assert.rejects(()=>associate(exactStatement),error=>error.code==='23514',
  'A statement linked twice to the same payment');count++;
 const financialAfter=(await db.unsafe('SELECT verification_method FROM financial_payments WHERE id=$1::uuid',
  [verified.payment_id]))[0].verification_method;
 equal(financialAfter,verified.verification_method,
  'Merchant statement association mutated the original verified receipt provenance');
 const publicView=(await db.unsafe('SELECT pg10_public($1) data',[hash(linkKey)]))[0].data;equal(publicView.paid_minor,0,'Link public page must not expose other visitors receipts');
 const isolated=(await live.unsafe('SELECT pg10_public($1) data',[hash(linkKey)]))[0].data;equal(isolated,null,'Sandbox capability must not cross into live');
 await reject(()=>scoped(workspace,tx=>tx.unsafe('SELECT * FROM pg10_documents')));
 await reject(()=>scoped(workspace,tx=>tx.unsafe("UPDATE pg10_versions SET body='{}' WHERE document_id=$1::uuid",[invoice.id])));
 equal((await db.unsafe("SELECT pg15_health() data"))[0].data.environment,'sandbox','Health reports physical realm');
 const importKey=randomUUID(), importedRows=[{reference:'BATCH-'+randomUUID(),name:'Fictional batch contact'}];
 const batch=async(csvHash,rows)=>scoped(workspace,async tx=>(await tx.unsafe("SELECT pg10_import($1::uuid,'sandbox',NULL,$2,$3,$4::jsonb) result",[workspace,importKey,csvHash,db.json(rows)]))[0].result);
 equal((await batch(hash('original-csv'),importedRows)).imported,1,'Batch creates atomically');
 equal((await batch(hash('original-csv'),importedRows)).imported,1,'Lost batch response returns original result');
 await reject(()=>batch(hash('truncated-csv'),[]));
 const retentionAccount=(await db.unsafe("SELECT id FROM financial_receiving_accounts WHERE workspace_id=$1::uuid AND environment='sandbox' LIMIT 1",[workspace]))[0].id;
 const ageEvidence=async()=>{
  const id=randomUUID(),observation=randomUUID();
  await db.unsafe("INSERT INTO financial_inbound_events(id,workspace_id,environment,source_kind,source_event_id,event_digest,encrypted_evidence,received_at) VALUES($1::uuid,$2::uuid,'sandbox','sandbox_fixture',$3,$4,decode($5,'hex'),now()-interval '31 days')",[id,workspace,'retention-'+id,hash(id),'ab'.repeat(32)]);
  await db.unsafe("INSERT INTO financial_receipt_observations(id,workspace_id,environment,inbound_event_id,receiving_account_id,method,direction,time_precision,parser_version) VALUES($1::uuid,$2::uuid,'sandbox',$3::uuid,$4::uuid,'bkash','unknown','unknown',1)",[observation,workspace,id,retentionAccount]);
  await db.unsafe("INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id,status) VALUES($1::uuid,'sandbox',$2::uuid,'cancelled')",[workspace,observation]);return id;
 };
 const erased=await ageEvidence();equal(Number((await db.unsafe('SELECT pg15_prune_receipt_evidence() n'))[0].n),0,'Unreviewed retention policy stays disabled');
 await db.unsafe("UPDATE pg15_receipt_policy SET enabled=true,review_reference='FICTIONAL CI POLICY ONLY' WHERE singleton");
 equal(Number((await db.unsafe('SELECT pg15_prune_receipt_evidence() n'))[0].n),1,'Reviewed fixture policy redacts raw evidence');
 const after=(await db.unsafe("SELECT event_digest,encode(encrypted_evidence,'hex') cipher FROM financial_inbound_events WHERE id=$1::uuid",[erased]))[0];
 equal(after.event_digest,hash(erased),'Financial source digest survives redaction');assert.notEqual(after.cipher,'ab'.repeat(32));count++;
 await reject(()=>db.unsafe("UPDATE financial_inbound_events SET encrypted_evidence=gen_random_bytes(32) WHERE id=$1::uuid",[erased]));
 const held=await ageEvidence();await db.unsafe("SELECT pg15_hold_evidence($1::uuid,'sandbox',$2::uuid,'Fictional legal hold test',now()+interval '1 day')",[workspace,held]);
 equal(Number((await db.unsafe('SELECT pg15_prune_receipt_evidence() n'))[0].n),0,'Explicit hold prevents raw erasure');
 await db.unsafe('UPDATE pg15_receipt_policy SET enabled=false WHERE singleton');
 // Run the actual matcher, not a fake success response, on isolated fixtures.
 const [authority]=await db.unsafe("SELECT status,entitlement_version FROM financial_workspace_registry WHERE workspace_id=$1::uuid AND environment='sandbox'",[workspace]);
 equal(authority.status,'active','Scenario workspace must have active authority');
 const scenarios=['exact-unique','wrong-payer','under-amount','over-amount','before-window','after-window','missing-time','outgoing','missing-payer','missing-amount','unknown-direction','wrong-account','wrong-method'];
 let exact;
 for(const scenario of scenarios){
  const scenarioKey=randomUUID(),actor=randomUUID();
  const run=await scoped(workspace,async tx=>(await tx.unsafe("SELECT pg14_run($1::uuid,$2::uuid,$3,$4,$5,$6) data",[workspace,actor,scenario,scenarioKey,hash('payer:'+scenarioKey),Buffer.alloc(48,7)]))[0].data);
  const again=await scoped(workspace,async tx=>(await tx.unsafe("SELECT pg14_run($1::uuid,$2::uuid,$3,$4,$5,$6) data",[workspace,actor,scenario,scenarioKey,hash('payer:'+scenarioKey),Buffer.alloc(48,8)]))[0].data);
  equal(again.id,run.id,'A lost scenario response retains one run');
  const result=await db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE ekmivo_financial_worker');return(await tx.unsafe('SELECT pg07_match($1::uuid,$2) state',[run.observation_id,authority.entitlement_version]))[0].state});
  equal(result,scenario==='exact-unique'?'matched':'unmatched',scenario+' uses five-field matcher');
  if(scenario==='exact-unique'){
   exact=run;
   await db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE ekmivo_financial_worker');await tx.unsafe('SELECT pg07_match($1::uuid,$2)',[run.observation_id,authority.entitlement_version])});
   const [proof]=await db.unsafe("SELECT (SELECT count(*) FROM financial_payments WHERE observation_id=$1::uuid) payments,(SELECT count(*) FROM financial_allocations WHERE intent_id=$2::uuid) allocations,(SELECT count(*) FROM pg07_events ev JOIN financial_payments p ON p.id=ev.payment_id WHERE p.observation_id=$1::uuid AND ev.event_type='payment.verified') events",[run.observation_id,run.intent_id]);
   equal([Number(proof.payments),Number(proof.allocations),Number(proof.events)],[1,1,1],'Matcher replay creates one payment/allocation/event');
  }
 }
 const [payment]=await db.unsafe('SELECT id FROM financial_payments WHERE observation_id=$1::uuid',[exact.observation_id]);
 const refundKey=randomUUID();
 const refund=await scoped(workspace,async tx=>(await tx.unsafe("SELECT pg11_refund($1::uuid,'sandbox',$2::uuid,5500,$3,'Fictional wrong item refund',$4,$5,NULL) data",[workspace,payment.id,Buffer.alloc(48,9),refundKey,hash('refund-body')]))[0].data);
 await reject(()=>scoped(workspace,tx=>tx.unsafe("SELECT pg11_refund($1::uuid,'sandbox',$2::uuid,1,$3,'Fictional second capped request',$4,$5,NULL)",[workspace,payment.id,Buffer.alloc(48,10),randomUUID(),hash('refund-over-cap')])));
 const page=await scoped(workspace,async tx=>(await tx.unsafe("SELECT pg11_page($1::uuid,'sandbox','refunds',NULL,NULL,'requested',NULL) data",[workspace]))[0].data);
 assert.ok(page.items.some(r=>r.id===refund.id));count++;
 await reject(()=>scoped(otherWorkspace,tx=>tx.unsafe("SELECT pg11_page($1::uuid,'sandbox','refunds',NULL,$2::uuid,NULL,NULL)",[otherWorkspace,refund.id])));
 await reject(()=>scoped(workspace,tx=>tx.unsafe("SELECT pg11_page($1::uuid,'sandbox','refunds',NULL,NULL,'made-up',NULL)",[workspace])));
 const orphan=randomUUID(),objectKey='sandbox/'+workspace+'/'+orphan;
 await scoped(workspace,tx=>tx.unsafe("SELECT pg10_upload_reserve($1::uuid,'sandbox',$2::uuid,$3,100)",[workspace,orphan,objectKey]));
 await reject(()=>scoped(workspace,tx=>tx.unsafe("SELECT pg10_upload_commit($1::uuid,'sandbox',$2::uuid)",[workspace,orphan])));
 await db.unsafe("UPDATE pg10_upload_intents SET expires_at=now()-interval '1 minute' WHERE id=$1::uuid",[orphan]);
 const [claimed]=await db.unsafe('SELECT pg15_orphan_claim() data');equal(claimed.data.id,orphan,'Lost upload tracked for private object cleanup');
 equal((await db.unsafe('SELECT pg15_orphan_deleted($1::uuid,$2::uuid) removed',[orphan,claimed.data.lease]))[0].removed,true,'Cleanup acknowledges the exact deletion lease');
 equal(Number((await db.unsafe('SELECT count(*) n FROM pg10_upload_intents WHERE id=$1::uuid AND deleted_at IS NOT NULL',[orphan]))[0].n),1,'Deleted orphan still counts toward reservation quota');
 const [owner]=await control.unsafe("SELECT m.user_id FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=$1::uuid AND m.role='owner' AND u.disabled_at IS NULL LIMIT 1",[workspace]);
 assert.ok(owner,'Fixture needs an active control owner');count++;
 const requestKey=randomUUID();
 const privacy=await control.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE ekmivo_financial_runtime');return(await tx.unsafe("SELECT pg13_privacy_request($1::uuid,$2::uuid,'export',$3) data",[workspace,owner.user_id,requestKey]))[0].data});
 equal(privacy.status,'requested','Privacy acceptance does not claim exported stores');
 const retry=(await control.unsafe("SELECT pg13_privacy_request($1::uuid,$2::uuid,'export',$3) data",[workspace,owner.user_id,requestKey]))[0].data;
 equal(retry.id,privacy.id,'Privacy request retry returns one request');
 await reject(()=>control.unsafe("SELECT pg13_privacy_request($1::uuid,$2::uuid,'delete',$3)",[workspace,owner.user_id,requestKey]));
 await reject(()=>control.unsafe('SELECT pg13_privacy_read($1::uuid,$2::uuid)',[otherWorkspace,owner.user_id]));
 await reject(()=>control.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE ekmivo_financial_runtime');return tx.unsafe("SELECT pg13_privacy_observe($1::uuid,$2::uuid,'control','exported',$3,'Fictional CI observation only',NULL)",[privacy.id,workspace,hash('fictional-evidence')])}));
 await control.unsafe("SELECT pg13_privacy_observe($1::uuid,$2::uuid,'control','exported',$3,'Fictional CI observation only',NULL)",[privacy.id,workspace,hash('fictional-evidence')]);
 equal((await control.unsafe('SELECT status FROM pg13_privacy_requests WHERE id=$1::uuid',[privacy.id]))[0].status,'processing','One store cannot claim all-store export complete');
 await reject(()=>control.unsafe("SELECT pg13_privacy_observe($1::uuid,$2::uuid,'financial_live','deleted',$3,'Fictional invalid export disposition',NULL)",[privacy.id,workspace,hash('wrong-disposition')]));
 await control.unsafe("SELECT pg13_privacy_observe($1::uuid,$2::uuid,'backups','blocked',$3,'Fictional missing backup evidence',NULL)",[privacy.id,workspace,hash('backup-blocker')]);
 equal((await control.unsafe('SELECT status FROM pg13_privacy_requests WHERE id=$1::uuid',[privacy.id]))[0].status,'blocked','Unproven backup disposition blocks completion');
 await reject(()=>control.unsafe("UPDATE pg13_privacy_observations SET status='deleted' WHERE request_id=$1::uuid",[privacy.id]));
 return count;
}
