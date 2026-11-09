import {attachmentKey,readAttachment,type AttachmentDraft} from "./inbox-attachments";
import type {InboxDraftStorage} from "./inbox-drafts";
export type PendingMedia=AttachmentDraft&{mime:string;batchId?:string;replyTo?:string;durationMs?:number};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function mediaDraftKey(actor:string,workspace:string,thread:string){return attachmentKey(actor,workspace,thread)+":batch";}
export function readMediaDrafts(storage:InboxDraftStorage,key:string):PendingMedia[]{
 const raw=storage.getItem(key);if(!raw)return [];
 const value:unknown=JSON.parse(raw);if(!Array.isArray(value)||value.length>10)throw Error("Invalid media drafts");
 return value.filter(item=>{
  const checked=readAttachment({getItem:()=>JSON.stringify(item),setItem:()=>{},removeItem:()=>{}},key);
  if(!checked)return false;
  const d=item as PendingMedia;
  if(!d.uploaded||! /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain|audio\/(ogg|mp4|mpeg|webm|wav))$/.test(d.mime)||[d.batchId,d.replyTo].some(id=>id!==undefined&&!uuid.test(id))||(d.durationMs!==undefined&&(!Number.isSafeInteger(d.durationMs)||d.durationMs<1000)))throw Error("Invalid media draft intent");
  return true;
 });
}
export function saveMediaDrafts(storage:InboxDraftStorage,key:string,items:PendingMedia[]){
 if(!items.length){storage.removeItem(key);return;}
 // Validate on write as well as read; only private uploaded references belong here.
 const raw=JSON.stringify(items.map(({mediaId,sendKey,fingerprint,name,size,uploaded,expires,mime,batchId,replyTo,durationMs})=>({mediaId,sendKey,fingerprint,name,size,uploaded,expires,mime,batchId,replyTo,durationMs})));readMediaDrafts({getItem:()=>raw,setItem:()=>{},removeItem:()=>{}},key);storage.setItem(key,raw);
}
