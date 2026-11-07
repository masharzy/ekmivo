import {spawn} from "node:child_process";
import {createCipheriv,randomBytes,createDecipheriv} from "node:crypto";
import {createReadStream,createWriteStream} from "node:fs";
import {readFile,open,stat} from "node:fs/promises";
import {pipeline} from "node:stream/promises";
const [mode,filename]=process.argv.slice(2),keyHex=process.env.BRIOFOLD_BACKUP_KEY_HEX;
if(!["backup","restore"].includes(mode)||!filename||!/^[a-f0-9]{64}$/i.test(keyHex||"")){console.error("backup|restore, filename and 32-byte BRIOFOLD_BACKUP_KEY_HEX required");process.exit(2)}
const source=process.env.BRIOFOLD_BACKUP_DATABASE_URL,target=process.env.BRIOFOLD_RESTORE_DATABASE_URL;
function connection(raw){const u=new URL(raw||"");if(!["postgres:","postgresql:"].includes(u.protocol)||!u.hostname||!u.pathname.slice(1)||!u.username)return null;return u}
function pgEnvironment(u){return {...process.env,PGHOST:u.hostname,PGPORT:u.port||"5432",PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGSSLMODE:u.searchParams.get("sslmode")||"require"}}
function processDone(child){return new Promise((resolve,reject)=>{child.once("error",()=>reject(Error("PostgreSQL tool unavailable")));child.once("exit",code=>code===0?resolve():reject(Error("PostgreSQL tool failed; inspect operator logs privately")))})}
try{
 const a=connection(source);if(!a)throw Error("Named source database required");
 if(mode==="backup"){
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",Buffer.from(keyHex,"hex"),iv),output=createWriteStream(filename,{flags:"wx",mode:0o600});output.write(Buffer.concat([Buffer.from("EKMBACK1"),iv]));
  const child=spawn(process.env.BRIOFOLD_PG_DUMP||"pg_dump",["--format=custom","--no-owner","--no-acl"],{env:pgEnvironment(a),stdio:["ignore","pipe","ignore"]});const done=processDone(child);
  await pipeline(child.stdout,cipher,output,{end:false});await done;output.end(cipher.getAuthTag());await new Promise((resolve,reject)=>{output.once("finish",resolve);output.once("error",reject)});
  console.log(JSON.stringify({status:"encrypted_backup_created",created_at:new Date().toISOString(),restore_verified:false}));
 }else{
  const b=connection(target);if(!b||process.env.BRIOFOLD_ALLOW_ISOLATED_RESTORE!=="true"||a.hostname===b.hostname&&a.pathname===b.pathname||a.username===b.username)throw Error("Explicit isolated target and independent credentials required");
  const size=(await stat(filename)).size;if(size<36)throw Error("Invalid encrypted backup");const handle=await open(filename,"r");const header=Buffer.alloc(20),tag=Buffer.alloc(16);await handle.read(header,0,20,0);await handle.read(tag,0,16,size-16);await handle.close();if(header.subarray(0,8).toString()!=="EKMBACK1")throw Error("Invalid backup format");
  // Authenticate the complete backup before pg_restore can mutate any target.
  const decipher=createDecipheriv("aes-256-gcm",Buffer.from(keyHex,"hex"),header.subarray(8));decipher.setAuthTag(tag);const chunks=[];let length=0;for await(const chunk of createReadStream(filename,{start:20,end:size-17}).pipe(decipher)){length+=chunk.length;if(length>536870912)throw Error("Restore exceeds bounded 512MiB buffer; use reviewed large-backup runbook");chunks.push(chunk)}
  const child=spawn(process.env.BRIOFOLD_PG_RESTORE||"pg_restore",["--exit-on-error","--single-transaction","--no-owner","--no-acl","--dbname",decodeURIComponent(b.pathname.slice(1))],{env:pgEnvironment(b),stdio:["pipe","ignore","ignore"]});const done=processDone(child);child.stdin.end(Buffer.concat(chunks));await done;console.log(JSON.stringify({status:"isolated_restore_completed",completed_at:new Date().toISOString(),financial_reconciliation_verified:false}));
 }
}catch(e){console.error(e instanceof Error?e.message:"Recovery unavailable");process.exitCode=1}
