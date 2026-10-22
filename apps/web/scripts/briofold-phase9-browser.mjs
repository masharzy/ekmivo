import assert from "node:assert/strict";
import {createCipheriv,createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import postgres from "postgres";

// Synthetic records in the disposable CI *live-realm database*. Nothing here
// claims to simulate a provider callback, connected phone, or real money.
// This verifies that the real Next -> authenticated Go -> restricted finance
// reader -> Next UI chain is unchanged between legacy and canonical routes.
export async function runBriofoldPhase9Browser({origin,browser,control,sessions,liveDatabase,sandboxDatabase,workspaceId}){
 const controlURL=new URL(control),financeURL=new URL(liveDatabase),sandboxURL=new URL(sandboxDatabase);
 for(const url of [controlURL,financeURL,sandboxURL]){
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname),"Phase9 browser forbids remote databases");
  assert.ok(!/prod/i.test(url.pathname),"Phase9 browser forbids production databases");
 }
 assert.equal(financeURL.pathname,"/ekmivo_pg04_live","Phase9 requires the disposable PG04 live-test realm");
 assert.equal(sandboxURL.pathname,"/ekmivo_pg04_sandbox","Phase9 phone lifecycle requires disposable PG04 sandbox realm");
 const db=postgres(control,{max:1,prepare:false}),finance=postgres(liveDatabase,{max:1,prepare:false}),sandbox=postgres(sandboxDatabase,{max:1,prepare:false});
 let context,viewerContext;
 const sessionUser=async token=>String((await db.unsafe("SELECT user_id FROM auth_sessions WHERE token_hash=$1",[createHash("sha256").update(token).digest("hex")]))[0].user_id);
 try{
  const owner=await sessionUser(sessions.owner),viewer=await sessionUser(sessions.viewer);
  const member=await db.unsafe("SELECT role FROM workspace_members WHERE workspace_id=$1::uuid AND user_id=$2::uuid",[workspaceId,owner]);
  assert.equal(member[0]?.role,"owner","Phase9 workspace is not an owner-authorized test tenant");
  // Live reports/invoice writes must pass the real server-side plan entitlement
  // check. This CONTROL fixture exists only in the loopback CI database, is
  // unpublished, and never grants a feature to a production Store. Do not
  // disable the gate in Go or SQL to make integration tests pass.
  const ciPlanId=`ci_phase9_${randomUUID().replaceAll("-","").slice(0,12)}`;
  const ciTerms={name:"Unpublished disposable Phase9 financial test",kind:"free",amount_minor:0,
   period_days:30,grace_days:3,free_days:30,payment_limit:null,quota_period:"billing",
   active_checkout_limit:100,create_per_minute:120,
   features:{invoices:true,payment_links:true,reports:true,exports:true},
   limits:{api_keys:null,team_members:null,devices:null,payment_methods:null}};
  const [validatedPlan]=await db.unsafe("SELECT payment_plan_validate($1::jsonb) AS terms",[db.json(ciTerms)]);
  await db.unsafe("INSERT INTO pg13_plans(id,name,amount_minor,period_days,grace_days,enabled) VALUES($1,$2,0,30,3,false)",
   [ciPlanId,ciTerms.name]);
  const [planVersion]=await db.unsafe("INSERT INTO payment_plan_versions(plan_id,version,terms,created_by) VALUES($1,1,$2::jsonb,$3::uuid) RETURNING id",
   [ciPlanId,db.json(validatedPlan.terms),owner]);
  await db.unsafe("INSERT INTO pg13_subscriptions(workspace_id,plan_id,plan_version_id,paid_until,grace_until) "+
   "VALUES($1::uuid,$2,$3::uuid,now()+interval '30 days',now()+interval '33 days') "+
   "ON CONFLICT(workspace_id) DO UPDATE SET plan_id=EXCLUDED.plan_id,plan_version_id=EXCLUDED.plan_version_id,paid_until=EXCLUDED.paid_until,grace_until=EXCLUDED.grace_until",
   [workspaceId,ciPlanId,planVersion.id]);
  const [entitlement]=await db.unsafe("SELECT payment_plan_effective($1::uuid) AS snapshot",[workspaceId]);
  assert.equal(entitlement.snapshot.active,true,"isolated Store test plan failed activation");
  assert.equal(entitlement.snapshot.terms.features.reports,true,"isolated report entitlement not installed");
  // Finance projection versions are monotonic. An arbitrary high synthetic
  // version cannot later be rolled back to the CONTROL source version and
  // would make authenticated phone writes correctly fail as stale. Seed the
  // disposable live realm with the actual active source version from day one.
  const [initialLiveProjection]=await db.unsafe("SELECT source_version,active FROM resolve_financial_projection($1::uuid,'live')",[workspaceId]);
  assert.equal(initialLiveProjection.active,true,"disposable live Store projection is inactive");
  const seededLive=await finance.unsafe("SELECT financial_sync_workspace($1::uuid,'live',$2,true) AS applied",
   [workspaceId,Number(initialLiveProjection.source_version)]);
  assert.equal(seededLive[0].applied,true,"disposable live Store projection was not seeded");
  const fingerprint=()=>createHash("sha256").update(randomUUID()).digest("hex");
  const reference="P9-FICTIONAL-"+randomUUID().slice(0,8).toUpperCase(),amount=23456,payer=fingerprint();
  const [account]=await finance.unsafe("INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix) VALUES($1,'live','bkash',$2,'7890') RETURNING id",[workspaceId,fingerprint()]);
  // This is a made-up Bangladeshi test number. The real Go phone reader must
  // decrypt the same AES-256-GCM/AAD envelope as the production writer; dummy
  // bytes here would incorrectly cause a visible 503 in the settings UI.
  const receivingNumber="01700007890",nonce=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",Buffer.alloc(32,88),nonce);
  cipher.setAAD(Buffer.from(`${workspaceId}|live`));
  const numberCipher=Buffer.concat([nonce,cipher.update(receivingNumber,"utf8"),cipher.final(),cipher.getAuthTag()]);
  await finance.unsafe("INSERT INTO pg06_account_configuration(workspace_id,environment,account_id,number_cipher) VALUES($1,'live',$2,$3)",[workspaceId,account.id,numberCipher]);
  const [intent]=await finance.unsafe("INSERT INTO payment_intents(workspace_id,environment,merchant_reference,amount_minor,expires_at) VALUES($1,'live',$2,$3,now()+interval '30 minutes') RETURNING id",[workspaceId,reference,amount]);
  const [attempt]=await finance.unsafe("INSERT INTO payment_attempts(workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,amount_minor,method,window_start,window_end,policy_version) VALUES($1,'live',$2,$3,$4,'1234',$5,'bkash',now()+interval '2 seconds',now()+interval '20 minutes',1) RETURNING id",[workspaceId,intent.id,account.id,payer,amount]);
  const [inbound]=await finance.unsafe("INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,event_digest,original_source_at,encrypted_evidence) VALUES($1,'live','device_sms',$2,$3,now()+interval '4 seconds',$4) RETURNING id",[workspaceId,"ci-only-"+randomUUID(),fingerprint(),Buffer.alloc(48,55)]);
  const [receipt]=await finance.unsafe("INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,receiving_account_id,provider_reference_hmac,payer_hmac,amount_minor,method,direction,original_transaction_at,time_precision,parser_version) VALUES($1,'live',$2,$3,$4,$5,$6,'bkash','incoming',now()+interval '4 seconds','second',1) RETURNING id",[workspaceId,inbound.id,account.id,fingerprint(),payer,amount]);
  const [payment]=await finance.unsafe("INSERT INTO financial_payments(workspace_id,environment,attempt_id,observation_id,verified_amount_minor,verification_method,policy_version) VALUES($1,'live',$2,$3,$4,'sms_match',1) RETURNING id",[workspaceId,attempt.id,receipt.id,amount]);
  await finance.unsafe("INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor) VALUES($1,'live',$2,$3,$4)",[workspaceId,payment.id,intent.id,amount]);
  const [device]=await finance.unsafe("INSERT INTO pg06_devices(workspace_id,environment,account_id,name,source,parser_id,binding) VALUES($1,'live',$2,'Fictional CI phone','device_sms','ci-parser','ci-binding') RETURNING id",[workspaceId,account.id]);
  const [transport]=await finance.unsafe("INSERT INTO pg06_transport(workspace_id,environment,device_id,event_id,digest,sequence,observation_id,observed_at) VALUES($1,'live',$2,$3,$4,1,$5,now()+interval '4 seconds') RETURNING id",[workspaceId,device.id,"ci-transport-"+randomUUID(),fingerprint(),receipt.id]);
  await finance.unsafe("INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id,status,reason,payment_id,processed_at) VALUES($1,'live',$2,'matched','', $3,now())",[workspaceId,receipt.id,payment.id]);
  const [webhook]=await finance.unsafe("INSERT INTO pg08_endpoints(workspace_id,environment,url,secret) VALUES($1,'live','https://fictional-ci.example.invalid/payment-webhook',$2) RETURNING id",[workspaceId,Buffer.alloc(48,67)]);

  const authenticated=async(token,actor)=>{
   const c=await browser.newContext();
   await c.addCookies([
    {name:"ekmivo-session",value:token,url:origin,httpOnly:true,sameSite:"Lax"},
    {name:"ekmivo-default-workspace",value:actor+":"+workspaceId,url:origin,httpOnly:true,sameSite:"Lax"},
    {name:"ekmivo-locale",value:"en",url:origin,sameSite:"Lax"}
   ]);
   return c;
  };
  context=await authenticated(sessions.owner,owner);
  viewerContext=await authenticated(sessions.viewer,viewer);
  const base=origin+`/api/go/workspaces/${workspaceId}`;
  const fetchRows=async(c,resource)=>{
   const response=await c.request.get(`${base}/operations/${resource}?environment=live`);
   assert.equal(response.status(),200,`${resource} authoritative Go reader failed: ${await response.text()}`);
   return (await response.json()).items;
  };
  const payments=await fetchRows(context,"payments");
  assert.deepEqual(payments.filter(r=>r.id===payment.id).map(r=>[r.merchant_reference,Number(r.verified_amount_minor),r.status]),[[reference,amount,"verified"]]);
  assert.equal(payments.filter(r=>r.id===payment.id).length,1,"double-confirmed payment in canonical source");
  assert.ok((await fetchRows(context,"incoming")).some(r=>r.id===transport.id&&r.payment_id===payment.id));
  assert.ok((await fetchRows(context,"gateways")).some(r=>r.id===account.id));
  assert.ok((await fetchRows(context,"webhooks")).some(r=>r.id===webhook.id));
  const phones=await context.request.get(`${base}/phones?environment=live`);
  assert.equal(phones.status(),200,`encrypted receiving-account UI reader failed: ${await phones.text()}`);
  assert.ok((await phones.json()).accounts?.some(a=>a.ID===account.id&&a.Number===receivingNumber),"payment settings reader disagrees with encrypted finance account");
  // Refunds must remain a seller-managed, authoritative finance process.
  // Use a fictional contact and a real scoped Go write, not a fake React row.
  const refundUrl=`${base}/refunds?environment=live`,refundKey=`briofold-ci-refund-${randomUUID()}`;
  const refundRequest={payment_id:payment.id,amount_minor:1234,name:"Fictional CI Customer",
   email:"fictional-refund@example.invalid",phone:"01700001234",
   reason:"Disposable integration refund; no money is transferred to any provider."};
  const refundCreate=()=>context.request.post(refundUrl,{
   headers:{Origin:origin,"Idempotency-Key":refundKey},data:refundRequest
  });
  const refundCreated=await refundCreate();
  assert.equal(refundCreated.status(),201,`finance refund request failed: ${await refundCreated.text()}`);
  const refund=await refundCreated.json();
  assert.equal(refund.payment_id,payment.id,"refund detached from its verified financial payment");
  assert.equal(refund.status,"requested");
  const refundReplay=await refundCreate();
  assert.equal(refundReplay.status(),201,"repeated refund idempotency did not preserve original response");
  assert.equal((await refundReplay.json()).id,refund.id,"same refund operation duplicated a request");
  const ownerRefundList=await context.request.get(refundUrl);
  assert.equal(ownerRefundList.status(),200);
  const ownerRefund=(await ownerRefundList.json()).items.find(x=>x.id===refund.id);
  // The Go financial writer normalizes Bangladesh local numbers to E.164
  // before encrypting; the authorized owner sees that canonical form.
  assert.equal(ownerRefund.customer?.phone,"+88"+refundRequest.phone,
   "owner refund contact failed authorized decrypt/normalization");
  assert.ok(!("customer_cipher" in ownerRefund),"encrypted refund contact escaped into the HTTP payload");
  const viewerRefundList=await viewerContext.request.get(refundUrl);
  assert.equal(viewerRefundList.status(),200);
  const viewerRefund=(await viewerRefundList.json()).items.find(x=>x.id===refund.id);
  assert.ok(viewerRefund&&!viewerRefund.customer&&!viewerRefund.customer_cipher,
   "viewer refund source exposed private customer contact or ciphertext");
  const deniedRefundReview=await viewerContext.request.post(`${base}/refunds/${refund.id}/review?environment=live`,{
   headers:{Origin:origin},data:{note:"Viewer cannot approve a financial refund",expected_version:refund.version,confirm_seller_action:true}
  });
  assert.equal(deniedRefundReview.status(),403,"viewer executed a seller-only refund transition");
  const reviewedRefund=await context.request.post(`${base}/refunds/${refund.id}/review?environment=live`,{
   headers:{Origin:origin},data:{note:"Seller reviewed this fictional request; no money sent",expected_version:refund.version,confirm_seller_action:true}
  });
  assert.equal(reviewedRefund.status(),200,`authorized seller review failed: ${await reviewedRefund.text()}`);
  assert.equal((await reviewedRefund.json()).status,"reviewing","refund seller state transition was not persisted");
  assert.equal(Number((await finance.unsafe("SELECT count(*) AS n FROM financial_payments WHERE id=$1::uuid",[payment.id]))[0].n),1,
   "seller refund review changed authoritative payment facts");
  // The Payments report must read the actual settled financial ledger, not
  // derive revenue from merchant orders/COD or seller refund-review status.
  // The fixture may coexist with earlier PG04 cases, so verify inclusion and
  // reconciliation invariants rather than assuming it is the sole payment.
  const reportRange={
   from:new Date(Date.now()-2*86400000).toISOString(),
   to:new Date(Date.now()+2*86400000).toISOString()
  };
  const financeReportResponse=await context.request.get(`${base}/reports?${new URLSearchParams({environment:"live",...reportRange})}`);
  assert.equal(financeReportResponse.status(),200,`authoritative payment report failed: ${await financeReportResponse.text()}`);
  const financeReport=await financeReportResponse.json();
  assert.equal(financeReport.currency,"BDT","report dropped authoritative BDT currency");
  assert.ok(financeReport.verified_gross_minor>=amount,"report omitted the verified fictional payment");
  assert.ok(financeReport.payment_count>=1,"report omitted payment count");
  assert.ok(financeReport.methods.some(row=>row.method==="bkash"&&row.amount_minor>=amount),
   "report method totals disagree with financial source");
  assert.equal(financeReport.refund_independently_verified,false,
   "seller refund request was mistaken for a provider-confirmed money return");
  assert.equal(financeReport.net_settled_minor,null,
   "unverified provider settlement was invented from payment receipts");
  assert.ok(financeReport.refunds.some(row=>row.status==="reviewing"&&row.amount_minor>=1234),
   "seller refund state missing from separately labeled report totals");
  const viewerReportResponse=await viewerContext.request.get(`${base}/reports?${new URLSearchParams({environment:"live",...reportRange})}`);
  assert.equal(viewerReportResponse.status(),200,
   `viewer report aggregate read failed: ${await viewerReportResponse.text()}`);
  const viewerReport=await viewerReportResponse.json();
  assert.equal(viewerReport.verified_gross_minor,financeReport.verified_gross_minor,
   "viewer lost the aggregate authorized financial total");
  assert.deepEqual(viewerReport.customers,[],"viewer report exposed invoice-linked customer identities");
  assert.deepEqual(viewerReport.accounts,[],"viewer report exposed receiving-account identifiers");
  // An invoice is a versioned seller document, not a payment confirmation.
  // Exercise its Go writer and SQL totals before opening the canonical UI.
  const invoiceUrl=`${base}/documents/invoices?environment=live`;
  const invoiceKey=`briofold-ci-invoice-${randomUUID()}`;
  const invoiceBody={reference:"",items:[{title:"Fictional test service",quantity:2,unit_amount_minor:5000}],
   tax_minor:500,shipping_minor:200,discount_minor:100,private_notes:"CI PRIVATE NOT FOR PUBLIC CHECKOUT"};
  const invoiceCreate=()=>context.request.post(invoiceUrl,{
   headers:{Origin:origin,"Idempotency-Key":invoiceKey},data:invoiceBody
  });
  const invoiceCreated=await invoiceCreate();
  assert.equal(invoiceCreated.status(),200,`authoritative invoice create failed: ${await invoiceCreated.text()}`);
  const invoice=await invoiceCreated.json();
  assert.equal(invoice.status,"draft","invoice creation incorrectly issued a payment or invoice");
  assert.equal(invoice.amount_minor,10600,"invoice amount was not calculated from server-side line items");
  assert.match(invoice.reference,/^INV-\d+$/,"invoice did not receive a durable server-issued reference");
  const invoiceReplay=await invoiceCreate();
  assert.equal(invoiceReplay.status(),200,"invoice retry lost idempotent source semantics");
  assert.equal((await invoiceReplay.json()).id,invoice.id,"invoice retry generated a duplicate document");
  const deniedInvoice=await viewerContext.request.post(invoiceUrl,{
   headers:{Origin:origin,"Idempotency-Key":`briofold-ci-denied-${randomUUID()}`},data:invoiceBody
  });
  assert.equal(deniedInvoice.status(),403,"viewer created a finance invoice");
  const invoiceIssued=await context.request.post(`${base}/documents/invoices/${invoice.id}/issue?environment=live`,{
   headers:{Origin:origin,"Idempotency-Key":`briofold-ci-issue-${randomUUID()}`},data:{expected_version:invoice.version}
  });
  assert.equal(invoiceIssued.status(),200,`authoritative invoice issuance failed: ${await invoiceIssued.text()}`);
  assert.equal((await invoiceIssued.json()).status,"issued","invoice issue did not persist the document state");
  const invoiceList=await context.request.get(invoiceUrl);
  assert.equal(invoiceList.status(),200,"owner invoice source read failed");
  assert.ok((await invoiceList.json()).items.some(row=>row.id===invoice.id&&row.amount_minor===10600&&row.status==="issued"),
   "canonical invoice source lost the issued document or its itemized total");
  const ownerInvoiceDetail=await context.request.get(`${base}/documents/invoices/${invoice.id}?environment=live`);
  const viewerInvoiceDetail=await viewerContext.request.get(`${base}/documents/invoices/${invoice.id}?environment=live`);
  assert.equal(ownerInvoiceDetail.status(),200,"owner lost the confidential invoice source detail");
  assert.equal(viewerInvoiceDetail.status(),200,"viewer could not read its masked authorized invoice");
  assert.equal((await ownerInvoiceDetail.json()).items?.[0]?.body?.private_notes,invoiceBody.private_notes,
   "owner invoice detail did not preserve seller-only notes");
  assert.equal(Object.hasOwn((await viewerInvoiceDetail.json()).items?.[0]?.body??{},"private_notes"),false,
   "viewer invoice source leaked private seller notes");
  // Real owner -> Next proxy -> Go -> FINANCE lifecycle, using only a fictional
  // disposable Store and deliberately NOT dispatching any SMS to a provider.
  const phoneRoute=`${base}/phones?environment=sandbox`,mutate={headers:{Origin:origin}};
  // Existing PG07 synthetic sandbox receiving-account envelope is deliberately
  // opaque, so make its read-only UI representation decryptable with this
  // disposable test Go instance's fixture key. No production data is changed.
  const sandboxNonce=randomBytes(12),sandboxCipher=createCipheriv("aes-256-gcm",Buffer.alloc(32,88),sandboxNonce);
  sandboxCipher.setAAD(Buffer.from(`${workspaceId}|sandbox`));
  const sandboxEnvelope=Buffer.concat([sandboxNonce,sandboxCipher.update("01700007890","utf8"),sandboxCipher.final(),sandboxCipher.getAuthTag()]);
  await sandbox.unsafe("UPDATE pg06_account_configuration SET number_cipher=$1 WHERE workspace_id=$2::uuid AND environment='sandbox'",[sandboxEnvelope,workspaceId]);
  const [sandboxProjection]=await db.unsafe("SELECT source_version,active FROM resolve_financial_projection($1::uuid,'sandbox')",[workspaceId]);
  assert.equal(sandboxProjection.active,true,"disposable sandbox Store projection is inactive");
  const [sandboxVersion]=await sandbox.unsafe("SELECT entitlement_version FROM financial_workspace_registry WHERE workspace_id=$1::uuid AND environment='sandbox'",[workspaceId]);
  if(Number(sandboxVersion.entitlement_version)!==Number(sandboxProjection.source_version))
   await sandbox.unsafe("SELECT financial_sync_workspace($1::uuid,'sandbox',$2,true)",[workspaceId,Number(sandboxProjection.source_version)]);
  const [sandboxEvidenceBefore]=await sandbox.unsafe("SELECT count(*) AS n FROM financial_receipt_observations WHERE workspace_id=$1::uuid AND environment='sandbox'",[workspaceId]);
  const createdResponse=await context.request.post(phoneRoute,{...mutate,data:{name:"Fictional CI handset"}});
  assert.equal(createdResponse.status(),200,`phone create failed: ${await createdResponse.text()}`);
  const createdPhone=await createdResponse.json(),physicalId=createdPhone.id;
  assert.match(physicalId,/^[0-9a-f-]{36}$/i);
  assert.match(createdPhone.pairing_token,/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  const firstPairDigest=createHash("sha256").update(createdPhone.pairing_token).digest("hex");
  const phoneDetail=()=>context.request.get(phoneRoute).then(r=>r.json());
  assert.equal((await phoneDetail()).items.filter(item=>item.id===physicalId).length,1,"physical phone create duplicated a device");
  const badPath=`${base}/phones/${physicalId}/delete?environment=sandbox`;
  const mismatched=await context.request.post(badPath,{...mutate,data:{phone_id:randomUUID()}});
  assert.equal(mismatched.status(),422,"phone deletion accepted a mismatched route and request body ID");
  assert.equal((await phoneDetail()).items.filter(item=>item.id===physicalId).length,1,"rejected delete removed the phone");
  const viewerCreate=await viewerContext.request.post(phoneRoute,{...mutate,data:{name:"Forbidden viewer phone"}});
  assert.equal(viewerCreate.status(),403,"viewer created an owner-managed physical phone");
  const revoked=await context.request.post(`${base}/phones/${physicalId}/revoke?environment=sandbox`,{...mutate,data:{}});
  assert.equal(revoked.status(),200,`phone disconnect failed: ${await revoked.text()}`);
  assert.ok((await phoneDetail()).items.find(item=>item.id===physicalId)?.revoked_at,"disconnect did not revoke original physical phone");
  const reissued=await context.request.post(`${base}/phones/${physicalId}/reconnect?environment=sandbox`,{...mutate,data:{phone_id:physicalId}});
  assert.equal(reissued.status(),200,`phone reconnect failed: ${await reissued.text()}`);
  const reconnected=await reissued.json();
  assert.equal(reconnected.id,physicalId,"reconnect created a second physical phone ID");
  assert.notEqual(reconnected.pairing_token,createdPhone.pairing_token,"reconnect reused an obsolete pairing capability");
  const afterReconnect=(await phoneDetail()).items.filter(item=>item.id===physicalId);
  assert.equal(afterReconnect.length,1,"reconnect introduced duplicate dashboard phone rows");
  assert.equal(afterReconnect[0].revoked_at,null,"reconnected phone remained disconnected");
  assert.ok(Date.parse(afterReconnect[0].pair_expires_at)>Date.now(),"reissued pairing capability expired");
  const prematureReconnect=await context.request.post(`${base}/phones/${physicalId}/reconnect?environment=sandbox`,{...mutate,data:{phone_id:physicalId}});
  assert.notEqual(prematureReconnect.status(),200,"active pairing accepted a second reconnect");
  await assert.rejects(()=>sandbox.unsafe("SELECT pg06_phone_claim($1,$2)",[firstPairDigest,Buffer.alloc(64,29)]),
   error=>error.code==="42501","old pairing code remained valid after reconnect");
  const freshDigest=createHash("sha256").update(reconnected.pairing_token).digest("hex");
  const paired=(await sandbox.unsafe("SELECT pg06_phone_claim($1,$2) AS data",[freshDigest,Buffer.alloc(64,29)]))[0].data;
  assert.equal(paired.id,physicalId,"reconnected physical phone lost identity on pairing");
  assert.equal((await viewerContext.request.post(badPath,{...mutate,data:{phone_id:physicalId}})).status(),403,
   "viewer deleted an owner-managed paired handset");
  const deleted=await context.request.post(badPath,{...mutate,data:{phone_id:physicalId}});
  assert.equal(deleted.status(),200,`physical phone delete failed: ${await deleted.text()}`);
  assert.equal((await phoneDetail()).items.some(item=>item.id===physicalId),false,"deleted phone remained in the Store list");
  const retained=(await sandbox.unsafe("SELECT deleted_at,revoked_at FROM pg06_phones WHERE id=$1::uuid",[physicalId]))[0];
  assert.ok(retained?.deleted_at&&retained?.revoked_at,"phone delete discarded durable tombstone or revocation");
  assert.equal(Number((await sandbox.unsafe("SELECT count(*) AS n FROM financial_receipt_observations WHERE workspace_id=$1::uuid AND environment='sandbox'",[workspaceId]))[0].n),
   Number(sandboxEvidenceBefore.n),"phone deletion removed sandbox historical receipt evidence");
  assert.equal(Number((await finance.unsafe("SELECT count(*) AS n FROM financial_receipt_observations WHERE id=$1::uuid",[receipt.id]))[0].n),1,
   "phone lifecycle unexpectedly modified separate authoritative live receipt evidence");
  assert.notEqual((await context.request.post(`${base}/phones/${physicalId}/reconnect?environment=sandbox`,{...mutate,data:{phone_id:physicalId}})).status(),200,
   "deleted phone accepted reconnect");
  assert.ok((await fetchRows(viewerContext,"payments")).some(r=>r.id===payment.id),"viewer cannot read authorized masked financial facts");
  const missing=await context.request.get(`${base}/operations/payments/${randomUUID()}?environment=live`);
  assert.equal(missing.status(),200,"opaque absent record did not use constrained empty result");
  assert.deepEqual((await missing.json()).items,[],"foreign/absent payment exposed records");
  const unrelated=await context.request.get(`${origin}/api/go/workspaces/${randomUUID()}/operations/payments?environment=live`);
  assert.ok([403,404,409].includes(unrelated.status()),"tenant scope accepted an unrelated workspace");
  const rejected=await viewerContext.request.post(`${base}/operations/webhooks/${webhook.id}/disable?environment=live`,{headers:{Origin:origin},data:{}});
  assert.ok([403,405].includes(rejected.status()),"viewer mutated an endpoint");
  assert.ok((await fetchRows(context,"webhooks")).some(r=>r.id===webhook.id&&r.active),"denied mutation changed webhook state");

  const page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  const errors=[];page.on("pageerror",err=>errors.push(err.message));
  // The canonical single-Store settings route reads the authoritative *live*
  // financial phone projection. Exercise heartbeat -> Next -> rendered health
  // and deletion without claiming a physical Android/provider test.
  // Phone writes require the exact CONTROL projection version. Recheck here
  // after other fixture calls; provisioning may only advance, never roll back.
  const [liveProjection]=await db.unsafe("SELECT source_version,active FROM resolve_financial_projection($1::uuid,'live')",[workspaceId]);
  assert.equal(liveProjection.active,true,"disposable live Store projection is inactive");
  const [liveVersion]=await finance.unsafe("SELECT entitlement_version FROM financial_workspace_registry WHERE workspace_id=$1::uuid AND environment='live'",[workspaceId]);
  assert.ok(Number(liveVersion.entitlement_version)<=Number(liveProjection.source_version),
   "disposable financial projection advanced beyond CONTROL and cannot be reconciled safely");
  if(Number(liveVersion.entitlement_version)<Number(liveProjection.source_version)){
   const [synced]=await finance.unsafe("SELECT financial_sync_workspace($1::uuid,'live',$2,true) AS applied",
    [workspaceId,Number(liveProjection.source_version)]);
   assert.equal(synced.applied,true,"disposable live Store entitlement could not advance to CONTROL version");
  }
  const heartbeatCreate=await context.request.post(`${base}/phones?environment=live`,{...mutate,data:{name:"CI live heartbeat handset"}});
  assert.equal(heartbeatCreate.status(),200,`disposable live phone create failed: ${await heartbeatCreate.text()}`);
  const heartbeatPhone=await heartbeatCreate.json();
  const heartbeatDigest=createHash("sha256").update(heartbeatPhone.pairing_token).digest("hex");
  const liveClaim=(await finance.unsafe("SELECT pg06_phone_claim($1,$2) AS data",[heartbeatDigest,Buffer.alloc(64,31)]))[0].data;
  assert.equal(liveClaim.id,heartbeatPhone.id,"live health fixture did not claim its exact phone");
  const [heartbeatAck]=await finance.unsafe("SELECT pg06_phone_heartbeat($1::uuid,$2::boolean,$3::integer,$4::text,$5::text,$6::bigint,$7::text) AS ok",
   [heartbeatPhone.id,true,3,"CI Android device","ci-1.0",0,""]);
  assert.equal(heartbeatAck.ok,true,"authenticated phone heartbeat was not persisted in disposable finance");
  const livePhoneRead=await context.request.get(`${base}/phones?environment=live`);
  assert.equal(livePhoneRead.status(),200);
  const liveHealth=(await livePhoneRead.json()).items.find(item=>item.id===heartbeatPhone.id);
  assert.ok(liveHealth?.heartbeat_at&&liveHealth.permission_ok===true&&liveHealth.backlog===3,
   "live phone heartbeat/projection did not carry its permission and backlog");
  await page.goto(origin+"/settings/devices");
  await page.getByRole("heading",{name:"SMS devices",exact:true}).waitFor();
  const healthRow=page.getByRole("row").filter({hasText:"CI live heartbeat handset"});
  await healthRow.getByText("Online",{exact:true}).waitFor();
  assert.ok((await healthRow.innerText()).includes("CI live heartbeat handset"),"heartbeat status detached from the correct physical phone");
  const liveDelete=await context.request.post(`${base}/phones/${heartbeatPhone.id}/delete?environment=live`,{
   ...mutate,data:{phone_id:heartbeatPhone.id}});
  assert.equal(liveDelete.status(),200,`disposable live phone delete failed: ${await liveDelete.text()}`);
  await page.reload();await page.getByRole("heading",{name:"SMS devices",exact:true}).waitFor();
  await page.getByRole("row").filter({hasText:"CI live heartbeat handset"}).waitFor({state:"detached"});
  assert.equal(await page.getByRole("row").filter({hasText:"CI live heartbeat handset"}).count(),0,
   "deleted live phone stayed visible after the canonical settings refresh");
  // A previously reported dashboard regression returned the stored checkout
  // design only after navigating away and back. Prove that a fresh canonical
  // visit server-renders the actual persisted version and survives reload.
  const themeEndpoint=`${origin}/api/workspaces/${workspaceId}/checkout-theme`;
  const initialThemeResponse=await context.request.get(themeEndpoint);
  assert.equal(initialThemeResponse.status(),200,"authorized checkout design source unavailable");
  const initialTheme=await initialThemeResponse.json();
  assert.ok(initialTheme.body?.theme&&Number.isInteger(initialTheme.version),
   "checkout design source returned no stable persisted version");
  const firstChoice=initialTheme.body.theme==="studio"?"receipt":"studio";
  const themePut=async(c,body,version)=>c.request.put(themeEndpoint,{
   headers:{Origin:origin},data:{body,version}
  });
  const seededThemeResponse=await themePut(context,{...initialTheme.body,theme:firstChoice},initialTheme.version);
  assert.equal(seededThemeResponse.status(),200,`checkout design seed failed: ${await seededThemeResponse.text()}`);
  const seededTheme=await seededThemeResponse.json();
  let clientThemeGets=0;
  const onThemeRequest=request=>{
   if(request.method()==="GET"&&request.url().startsWith(themeEndpoint))clientThemeGets++;
  };
  page.on("request",onThemeRequest);
  const selectedTheme=()=>page.locator(".ref-checkout-editor .themes button.th[aria-pressed='true']");
  await page.goto(origin+"/settings/checkout");
  await page.getByRole("heading",{name:"Checkout themes",exact:true}).waitFor();
  await selectedTheme().waitFor();
  assert.ok((await selectedTheme().innerText()).includes(firstChoice==="studio"?"Studio":"Receipt"),
   "fresh checkout page ignored the persisted server-side design");
  assert.equal(clientThemeGets,0,"initial checkout theme was deferred to a fragile client refetch");
  const nextChoice=firstChoice==="studio"?"receipt":"studio";
  await page.locator(".ref-checkout-editor .themes button.th").filter({hasText:nextChoice==="studio"?"Studio":"Receipt"}).click();
  await page.getByRole("button",{name:"Save changes",exact:true}).click();
  await page.locator("#toast.on").getByText("Saved",{exact:true}).waitFor();
  const persistedTheme=await (await context.request.get(themeEndpoint)).json();
  assert.equal(persistedTheme.body.theme,nextChoice,"checkout edit did not persist to CONTROL database");
  assert.equal(persistedTheme.version,seededTheme.version+1,"checkout save missed revision control");
  await page.reload();
  await selectedTheme().waitFor();
  assert.ok((await selectedTheme().innerText()).includes(nextChoice==="studio"?"Studio":"Receipt"),
   "checkout theme disappeared after a hard reload");
  const viewerThemePage=await viewerContext.newPage();
  await viewerThemePage.goto(origin+"/settings/checkout");
  await viewerThemePage.getByRole("heading",{name:"Checkout themes",exact:true}).waitFor();
  assert.equal(await viewerThemePage.getByRole("button",{name:"Save changes",exact:true}).isDisabled(),true,
   "viewer checkout editor unexpectedly permitted a write");
  const viewerThemeMutation=await themePut(viewerContext,{...persistedTheme.body,theme:firstChoice},persistedTheme.version);
  assert.equal(viewerThemeMutation.status(),403,"viewer bypassed checkout design authorization");
  assert.equal((await (await context.request.get(themeEndpoint)).json()).version,persistedTheme.version,
   "denied viewer theme write changed persisted version");
  await viewerThemePage.close();
  const restoredTheme=await themePut(context,initialTheme.body,persistedTheme.version);
  assert.equal(restoredTheme.status(),200,"disposable checkout design restore failed");
  page.off("request",onThemeRequest);
  console.log("Phase9 checkout design SSR/browser PASS: first-load persisted version, owner save/reload, viewer read-only/denial and restore");
  await page.goto(origin+"/payments/refunds");
  await page.getByRole("heading",{name:"Refunds",exact:true}).waitFor();
  const refundTableRow=page.locator(".refund-table tbody tr").filter({hasText:refund.id.slice(0,12)});
  await refundTableRow.waitFor();
  assert.ok((await refundTableRow.innerText()).includes("12.34"),"canonical refunds UI lost its financial minor-unit amount");
  await refundTableRow.click();
  await page.getByRole("heading",{name:"Refund details",exact:true}).waitFor();
  assert.ok((await page.locator("aside.dr").innerText()).includes(refund.id),"refund details lost the finance record ID");
  await page.goto(origin+"/reports/payments");
  await page.getByRole("heading",{name:"Reports",exact:true}).waitFor();
  const verifiedReportAmount="BDT "+new Intl.NumberFormat("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})
   .format(financeReport.verified_gross_minor/100);
  await page.locator(".fin-volume-card").getByText(verifiedReportAmount,{exact:true}).waitFor();
  assert.equal(await page.locator('main [role="alert"]').count(),0,
   "canonical payment report displayed an unconfirmed source or validation error");
  await page.goto(origin+"/invoices");
  await page.getByRole("heading",{name:"Invoices",exact:true}).waitFor();
  await page.getByText(invoice.reference,{exact:true}).first().waitFor();
  assert.ok((await page.locator("main").innerText()).includes("106.00"),
   "canonical invoices lost the real database-computed document amount");
  for(const [canonical,legacy,expected] of [
   ["/payments",`/w/${workspaceId}/payments/transactions`,reference],
   [`/payments/transactions/${payment.id}`,`/w/${workspaceId}/payments/transactions/${payment.id}`,reference],
   ["/sms-data",`/w/${workspaceId}/payments/incoming`,"234.56"],
   [`/sms-data/${transport.id}`,`/w/${workspaceId}/payments/incoming/${transport.id}`,"234.56"]
  ]){
   let oldText="",newText="",oldRecord="",newRecord="";
   for(const [path,record] of [[legacy,false],[canonical,true]]){
    const response=await page.goto(origin+path);assert.equal(response.status(),200,`route ${path} did not render`);
    if(path.includes("transactions/")||path.includes("/sms-data/")||path.includes("incoming/"))await page.locator(".pg-operation-detail").waitFor();
    else await page.locator("table tbody tr").first().waitFor();
    const content=await page.locator("main").innerText();
    assert.ok(content.includes(expected),`${path} missing same financial record ${expected}`);
    const data=path.includes("transactions/")||path.includes("/sms-data/")||path.includes("incoming/")
     ?await page.locator(".pg-operation-detail").innerText()
     :await page.locator("table tbody tr").first().innerText();
    if(record){newText=content;newRecord=data;}else{oldText=content;oldRecord=data;}
   }
   assert.ok(oldText.includes(expected)&&newText.includes(expected),"legacy/canonical readers changed financial record semantics");
   assert.equal(newRecord,oldRecord,`${canonical} changed authorized record facts vs ${legacy}`);
   if(canonical==="/payments")assert.ok(newRecord.includes("234.56"),"UI verified amount disagrees with finance ledger");
  }
  await page.goto(origin+"/payments/links?view=requests");
  await page.getByRole("heading",{name:"One-time requests",exact:true}).waitFor();
  assert.ok(await page.getByRole("link",{name:"One-time requests"}).count(),"canonical links do not expose one-time requests");
  assert.ok(await page.getByRole("region",{name:"One-time requests"}).count(),"one-time source table missing behind reusable-link entitlement");
  // The same mounted UI must not reveal a provider HMAC, raw payer number, or
  // cached cross-tenant session when opened by a viewer.
  const viewerPage=await viewerContext.newPage();
  await viewerPage.goto(origin+"/payments");
  await viewerPage.getByText(reference,{exact:true}).first().waitFor();
  const viewerText=await viewerPage.locator("main").innerText();
  assert.ok(!viewerText.includes(payer)&&!viewerText.includes("01712345678"),"viewer UI leaked raw payer identity");
  await viewerPage.close();

  const evidence=new URL("../test-results/pg09/phase9/",import.meta.url);await mkdir(evidence,{recursive:true});
  let cases=0;
  const routes=["/payments",`/payments/transactions/${payment.id}`,"/sms-data",`/sms-data/${transport.id}`,"/settings/payment-methods","/settings/webhooks","/settings/checkout","/payments/refunds","/reports/payments","/invoices"];
  for(const locale of ["en","bn"]){
   await context.addCookies([{name:"ekmivo-locale",value:locale,url:origin,sameSite:"Lax"}]);
   for(const theme of ["light","dark"]){
    await context.addCookies([{name:"ekmivo-theme",value:theme,url:origin,sameSite:"Lax"}]);
    await page.emulateMedia({colorScheme:theme});
    for(const width of [320,360,768,1440]){
     await page.setViewportSize({width,height:900});
     for(const route of routes){
      const response=await page.goto(origin+route);
      assert.equal(response.status(),200,`${route} HTTP failed at ${locale}/${theme}/${width}`);
      const ready=route.includes("/transactions/")||route.startsWith("/sms-data/")
       ?".pg-operation-detail":route==="/settings/payment-methods"?".pg-phone-panel"
       :route==="/settings/webhooks"?".int-workspace":route==="/settings/checkout"?".ref-checkout-editor":route==="/payments/refunds"?".refund-table":route==="/reports/payments"?".fin-volume-card":"main h1";
      try{await page.locator(ready).first().waitFor({timeout:10000});}
      catch(error){
       const snapshot=await page.evaluate(()=>({pathname:location.pathname,headings:[...document.querySelectorAll("main h1,main h2")].map(node=>node.textContent?.trim()).slice(0,5),sections:[...document.querySelectorAll("main section")].map(node=>node.className).slice(0,9),excerpt:document.querySelector("main")?.textContent?.trim().slice(0,300)}));
       throw Error(`Phase9 responsive route ${route} ${locale}/${theme}/${width} did not mount ${ready}: ${JSON.stringify(snapshot)}; ${String(error)}`);
      }
      assert.equal(await page.locator("html").getAttribute("data-theme"),theme);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route} overflows ${locale}/${theme}/${width}`);
      assert.equal(await page.locator('main [role="alert"]').count(),0,`${route} shows data/UI error`);
      if(width===320&&route==="/payments")await page.screenshot({path:fileURLToPath(new URL(`${locale}-${theme}-${width}.png`,evidence)),fullPage:true});
      cases++;
     }
    }
   }
  }
  assert.equal(cases,160,"Phase9 complete responsive matrix missing");
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(origin+"/payments");
  assert.ok(await page.evaluate(()=>matchMedia("(prefers-reduced-motion: reduce)").matches),"reduced-motion preference was not honored");
  assert.deepEqual(errors,[],"Phase9 UI hydration/runtime errors");
  const after=await fetchRows(context,"payments");
  assert.equal(after.filter(r=>r.id===payment.id).length,1,"UI read caused a duplicate financial confirmation");
  console.log(`Phase9 VERIFIED SOURCE+UI PASS: authenticated Go/live-test PG09 reader, exact record+amount, canonical/legacy detail parity, seller-managed refund idempotency, financial-source reporting, invoice create/issue/replay and viewer denial, cross-tenant scope, webhook write denial, one-time request access, ${cases} responsive cases across EN/BN, light/dark, 320/360/768/1440, 10 routes; synthetic CI financial evidence only`);
 }finally{
  if(context)await context.close();if(viewerContext)await viewerContext.close();
  await sandbox.end({timeout:3});await finance.end({timeout:3});await db.end({timeout:3});
 }
}
