// Read-only synthetic SQL against the exact production selection query.
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../../backend/internal/checkout/customer_payer_read.go',import.meta.url),'utf8');
const match=/const verifiedPayerPaymentsSQL = `([\s\S]*?)`/.exec(source);
if(!match)throw Error('Payer selection SQL not found');
const ws="'00000000-0000-4000-8000-000000000001'::uuid";
const prefix=`WITH fixture AS (
 SELECT g,j,(g*1000+j) AS n FROM generate_series(1,51) g
 CROSS JOIN LATERAL generate_series(1,CASE WHEN g=1 THEN 100 ELSE 1 END) j
), payment_attempts AS (
 SELECT md5('attempt-'||n)::uuid AS id,${ws} AS workspace_id,'live'::text AS environment,'payer-'||g AS payer_hmac FROM fixture
 UNION ALL SELECT md5('other-'||n)::uuid,'00000000-0000-4000-8000-000000000002'::uuid,'live','payer-'||g FROM fixture
 UNION ALL SELECT md5('sandbox-'||n)::uuid,${ws},'sandbox','payer-'||g FROM fixture
),financial_payments AS (
 SELECT md5('payment-'||n)::uuid AS id,md5('attempt-'||n)::uuid AS attempt_id,${ws} AS workspace_id,'live'::text AS environment,now()-j*interval '1 minute' AS verified_at FROM fixture WHERE g<=50
 UNION ALL SELECT md5('other-payment-'||n)::uuid,md5('other-'||n)::uuid,'00000000-0000-4000-8000-000000000002'::uuid,'live',now() FROM fixture
 UNION ALL SELECT md5('sandbox-payment-'||n)::uuid,md5('sandbox-'||n)::uuid,${ws},'sandbox',now() FROM fixture
), wanted AS (
 SELECT jsonb_agg((('64'||substr(md5(${ws}::text||':live:payer-'||g),3))::uuid)::text) AS ids FROM generate_series(1,51) g
),`;
const query=match[1].replace(/^WITH /,'').replaceAll('$1',ws).replaceAll('$2',"'live'").replaceAll('$3','(SELECT ids FROM wanted)');
const split=query.indexOf('SELECT payment_id,customer_id FROM candidates');
const sql=prefix+query.slice(0,split)+', found AS ('+query.slice(split)+`),counts AS (SELECT customer_id,count(*) AS n FROM found GROUP BY customer_id)
SELECT count(*)=50 AS all_verified_customers_covered,sum(n)=52 AS bounded_candidates,max(n)=3 AS no_payer_starvation,
 NOT EXISTS(SELECT 1 FROM found f JOIN financial_payments p ON p.id::text=f.payment_id WHERE p.workspace_id<>${ws} OR p.environment<>'live') AS tenant_realm_isolated,
 NOT EXISTS(SELECT 1 FROM counts WHERE customer_id=(('64'||substr(md5(${ws}::text||':live:payer-51'),3))::uuid)::text) AS unverified_customer_excluded FROM counts`;
console.log(JSON.stringify({sql}));
