import {inboxDraftKey,type InboxDraftStorage} from "./inbox-drafts";
export type AttachmentDraft={mediaId:string;sendKey:string;fingerprint:string;name:string;size:number;uploaded:boolean;expires:number};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function attachmentKey(actor:string,workspace:string,thread:string){return inboxDraftKey(actor,workspace,thread).replace(":inbox-draft:",":inbox-attachment:");}
export function readAttachment(storage:InboxDraftStorage,key:string):AttachmentDraft|null{
 const raw=storage.getItem(key);if(!raw)return null;
 const value:unknown=JSON.parse(raw);if(!value||typeof value!=="object")throw Error("Invalid attachment draft");
 const d=value as AttachmentDraft;
 if(!uuid.test(d.mediaId)||!uuid.test(d.sendKey)||typeof d.fingerprint!=="string"||!/^([a-f0-9]{64})$/.test(d.fingerprint)||typeof d.name!=="string"||d.name.length>200||!Number.isSafeInteger(d.size)||d.size<1||d.size>5242880||typeof d.uploaded!=="boolean"||typeof d.expires!=="number"||!Number.isFinite(d.expires))throw Error("Invalid attachment draft");
 if(d.expires<=Date.now()){storage.removeItem(key);return null;}return d;
}
export function saveAttachment(storage:InboxDraftStorage,key:string,draft:AttachmentDraft|null){if(draft)storage.setItem(key,JSON.stringify(draft));else storage.removeItem(key);}
