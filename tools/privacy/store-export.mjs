import {createCipheriv,createHash,randomBytes} from 'node:crypto';
import {open,unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {redactExportRow,scopedExportTables,childExportQueries} from './store-registry.mjs';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url)),postgres=require('postgres');
const [requestId,workspace,store,output]=process.argv.slice(2);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
if(!uuid.test(requestId||'')||!uuid.test(workspace||'')||!['control','financial_live','financial_sandbox'].includes(store)||!output||process.env.BRIOFOLD_PRIVACY_EXPORT_ENABLED!=='true'||!/^[a-f0-9]{64}$/i.test(process.env.BRIOFOLD_PRIVACY_EXPORT_KEY_HEX||''))throw Error('Reviewed request, SQL store, private output and explicit export configuration required');
const urls={control:process.env.BRIOFOLD_PRIVACY_CONTROL_DATABASE_URL,financial_live:process.env.BRIOFOLD_PRIVACY_LIVE_DATABASE_URL,financial_sandbox:process.env.BRIOFOLD_PRIVACY_SANDBOX_DATABASE_URL};
if(!urls.control||!urls[store])throw Error('Dedicated operator connections required');
const connect=url=>postgres(url,{max:1,prepare:false,connect_timeout:10,idle_timeout:5,onnotice:()=>{}});
const control=connect(urls.control),database=store==='control'?control:connect(urls[store]);
let file,created=false,complete=false;
const counts={},iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.BRIOFOLD_PRIVACY_EXPORT_KEY_HEX,'hex'),iv),hash=createHash('sha256');
let bytes=0,rows=0;
async function write(chunk){hash.update(chunk);let offset=0;while(offset<chunk.length){const result=await file.write(chunk,offset,chunk.length-offset);if(!result.bytesWritten)throw Error("Private export write failed");offset+=result.bytesWritten}}
async function record(data){const plain=Buffer.from(JSON.stringify(data)+'\n');bytes+=plain.length;if(bytes>536870912||++rows>1000000)throw Error('Bounded export exceeded; reviewed partitioned export required');await write(cipher.update(plain))}
try{
 const [request]=await control.unsafe("SELECT r.kind,r.status,current_user=pg_get_userbyid(c.relowner) AS operator_owner,to_regclass('financial_realm') IS NULL AS control_boundary FROM pg13_privacy_requests r CROSS JOIN pg_class c WHERE r.id=$1::uuid AND r.workspace_id=$2::uuid AND EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=r.workspace_id AND m.user_id=r.actor_id AND m.role='owner' AND u.disabled_at IS NULL) AND c.oid='workspaces'::regclass",[requestId,workspace]);
 if(!request?.operator_owner||!request.control_boundary||request.kind!=='export'||!['requested','processing','blocked'].includes(request.status))throw Error('Open owner-reviewed export request required');
 file=await open(output,'wx',0o600);created=true;await write(Buffer.concat([Buffer.from('EKMPRIV1'),iv]));
 await database.begin('isolation level repeatable read read only',async tx=>{
  if(store!=='control'){
   const [realm]=await tx.unsafe('SELECT environment FROM financial_realm WHERE singleton');
   if(realm?.environment!==store.slice('financial_'.length))throw Error('Physical financial realm mismatch');
   const [boundary]=await tx.unsafe("SELECT current_user=pg_get_userbyid(c.relowner) AS owner FROM pg_class c WHERE c.oid='financial_workspace_registry'::regclass");if(!boundary?.owner)throw Error('Independent financial operator role required');
  }
  const columns=await tx.unsafe("SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN information_schema.tables t USING(table_catalog,table_schema,table_name) WHERE c.table_schema='public' AND t.table_type='BASE TABLE' ORDER BY c.table_name,c.ordinal_position");
  const tables=scopedExportTables(columns,store);
  await record({kind:'manifest',schema_version:1,workspace_id:workspace,request_id:requestId,store,observed_at:new Date().toISOString(),database_snapshot_scope:'one_store_repeatable_read',excluded:'authentication credentials, raw encrypted receipt evidence, other workspaces, external object bytes, global queue wakeups'});
  for(const table of tables){
   let count=0;const query=`SELECT to_jsonb(t) AS row FROM public."${table.name}" t WHERE t."${table.scope}"=$1::uuid`;
   for await(const batch of tx.unsafe(query,[workspace]).cursor(100)){for(const item of batch){await record({kind:'row',table:table.name,data:redactExportRow(item.row)});count++}}
   counts[table.name]=count;
  }
  for(const [name,query] of childExportQueries(store)){
   let count=0;for await(const batch of tx.unsafe(query,[workspace]).cursor(100)){for(const item of batch){await record({kind:'row',table:name,data:redactExportRow(item.row)});count++}}counts[name]=count;
  }
  await record({kind:'complete_store_snapshot',counts});
 });
 await write(cipher.final());await write(cipher.getAuthTag());await file.sync();complete=true;
 console.log(JSON.stringify({status:'encrypted_sql_store_snapshot_created',store,sha256:hash.digest('hex'),table_counts:counts,external_stores_complete:false,privacy_request_complete:false}));
}catch{throw Error('Store export unconfirmed. No request completion or deletion claimed; inspect restricted operator diagnostics.')}
finally{if(file)await file.close();if(created&&!complete)await unlink(output).catch(()=>{});if(database!==control)await database.end({timeout:3});await control.end({timeout:3})}
