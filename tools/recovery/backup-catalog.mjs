// Filesystem backup inventory/expiry. Managed-provider snapshots stay separate.
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import path from 'node:path';
import {validBackupRecord,expiryPlan,backupFile,hashBackup,authenticateBackup} from './backup-registry.mjs';
const [mode,catalog,recordFile,output]=process.argv.slice(2),root=process.env.BRIOFOLD_BACKUP_DIRECTORY;
if(!['register','plan','expire'].includes(mode)||!catalog||!root||!output)throw Error('Usage: backup-catalog.mjs register|plan|expire catalog.json reviewed-record.json|- output.json; dedicated backup directory required');
let records=[];try{records=JSON.parse(await readFile(catalog,'utf8'))}catch(e){if(mode!=='register'||e.code!=='ENOENT')throw Error('Backup catalog unavailable')}
if(!Array.isArray(records)||records.some(r=>!validBackupRecord(r)))throw Error('Reviewed backup records required');
const changed=[];
async function saveCatalog(){const temporary=path.resolve(catalog)+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,JSON.stringify(records,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,path.resolve(catalog))}catch(e){await unlink(temporary).catch(()=>{});throw e}}
if(mode==='register'){
 const record=JSON.parse(await readFile(recordFile,'utf8'));if(!validBackupRecord(record)||records.some(r=>r.sha256===record.sha256||r.file===record.file))throw Error('Unique reviewed backup reference required');
 const file=await backupFile(root,record.file);if(await hashBackup(file)!==record.sha256)throw Error('Backup hash mismatch');if(!/^[a-f0-9]{64}$/i.test(process.env.BRIOFOLD_BACKUP_KEY_HEX||''))throw Error('Independent backup key required');await authenticateBackup(file,Buffer.from(process.env.BRIOFOLD_BACKUP_KEY_HEX,'hex'));records.push({...record,status:'available',registered_at:new Date().toISOString()});changed.push(record.sha256);
}else{
 if(records.some(r=>r.status==='expiring'))throw Error('Prior expiry requires operator reconciliation; no new removal allowed');
 for(const item of expiryPlan(records)){
  if(mode==='plan'){changed.push({sha256:item.sha256,realm:item.realm,expires_at:item.expires_at,can_expire:item.can_expire});continue}
  if(process.env.BRIOFOLD_BACKUP_EXPIRE_ENABLED!=='true')throw Error('Explicit backup expiry execution authorization required');if(!item.can_expire)continue;
  // Verify a newer actual retained file, not just its catalog entry.
  const newer=records.filter(r=>r.realm===item.realm&&r.status==='available'&&Date.parse(r.created_at)>Date.parse(item.created_at)&&Date.parse(r.expires_at)>Date.now());let proven=false;
  for(const candidate of newer){try{if(await hashBackup(await backupFile(root,candidate.file))===candidate.sha256){proven=true;break}}catch{}}
  if(!proven)continue;const file=await backupFile(root,item.file);if(await hashBackup(file)!==item.sha256)throw Error('Expiry source hash changed');const target=records.find(r=>r.sha256===item.sha256);target.status='expiring';target.expiry_started_at=new Date().toISOString();await saveCatalog();await unlink(file);target.status='expired';target.expired_at=new Date().toISOString();await saveCatalog();changed.push(item.sha256);
 }
}
if(mode==='register')await saveCatalog()
await writeFile(output,JSON.stringify({mode,observed_at:new Date().toISOString(),results:changed,managed_provider_snapshots_verified:false,privacy_request_complete:false},null,2)+'\n',{flag:'wx',mode:0o600});
