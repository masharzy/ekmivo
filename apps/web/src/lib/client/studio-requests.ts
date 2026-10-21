import type {InboxDraftStorage} from "./inbox-drafts";
import {studioUuid} from "../ai-studio";
// Store opaque fingerprints and retry keys, never prompts or generated content.
export function studioRequestKey(storage:InboxDraftStorage,actor:string,workspace:string,fingerprint:string,generate=()=>crypto.randomUUID()):string{
 if(!studioUuid.test(actor)||!studioUuid.test(workspace)||!/^([a-f0-9]{64})$/.test(fingerprint))throw Error("Invalid request scope");
 const key=`briofold:studio-requests:v1:${actor}:${workspace}`,raw=storage.getItem(key);
 const records:unknown=raw?JSON.parse(raw):[];
 if(!Array.isArray(records)||records.length>50)throw Error("Invalid request history");
 const active:{fingerprint:string;key:string;expires:number}[]=[];
 for(const record of records){
  if(!record||typeof record!=="object"||typeof record.fingerprint!=="string"||!/^([a-f0-9]{64})$/.test(record.fingerprint)||typeof record.key!=="string"||!/^studio-test:[0-9a-f-]{36}$/i.test(record.key)||typeof record.expires!=="number"||!Number.isFinite(record.expires))throw Error("Invalid request history");
  if(record.expires>Date.now())active.push(record);
 }
 const prior=active.find(x=>x.fingerprint===fingerprint);if(prior)return prior.key;
 if(active.length>=50)throw Error("Request history full; wait for older tests to expire");
 const id=generate();if(!studioUuid.test(id))throw Error("Invalid retry key");
 const request="studio-test:"+id;active.push({fingerprint,key:request,expires:Date.now()+86400000});storage.setItem(key,JSON.stringify(active));return request;
}
