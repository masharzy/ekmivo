// Draft storage is scoped by the authenticated account and selected business.
// A saved draft is never a sent message or provider acknowledgement.
export type InboxDraftStorage=Pick<Storage,"getItem"|"setItem"|"removeItem">;
export function inboxDraftKey(actor:string,workspace:string,thread:string):string{
 const id=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
 if(![actor,workspace,thread].every(x=>id.test(x)))throw Error("Invalid draft scope");
 return `briofold:inbox-draft:v1:${actor}:${workspace}:${thread}`;
}
export function readInboxDraft(storage:InboxDraftStorage,key:string):{text:string;sendKey:string;replyTo:string}{
 const raw=storage.getItem(key);if(!raw)return {text:"",sendKey:"",replyTo:""};
 const parsed:unknown=JSON.parse(raw);
 if(!parsed||typeof parsed!=="object")throw Error("Invalid saved draft");
 const value=parsed as {text?:unknown;expires?:unknown;sendKey?:unknown;replyTo?:unknown};
 if(typeof value.text!=="string"||value.text.length>8000||typeof value.expires!=="number")throw Error("Invalid saved draft");
 if(value.expires<=Date.now()){storage.removeItem(key);return {text:"",sendKey:"",replyTo:""};}
 if(typeof value.sendKey!=="string"||!/^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})?$/i.test(value.sendKey))throw Error("Invalid draft request key");
 const replyTo=value.replyTo===undefined?"":value.replyTo;
 if(typeof replyTo!=="string"||!/^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})?$/i.test(replyTo))throw Error("Invalid reply reference");
 return {text:value.text,sendKey:value.sendKey,replyTo};
}
export function writeInboxDraft(storage:InboxDraftStorage,key:string,text:string,sendKey="",replyTo=""):void{
 if(text.length>8000)throw Error("Draft exceeds message limit");
 if(!/^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})?$/i.test(replyTo))throw Error("Invalid reply reference");
 if(!text&&!replyTo){storage.removeItem(key);return;}
 storage.setItem(key,JSON.stringify({text,sendKey,replyTo,expires:Date.now()+24*60*60*1000}));
}
