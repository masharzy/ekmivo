export type Cap={image?:boolean;audio?:boolean;document?:boolean;product?:boolean;forward?:boolean;reactions?:string[];delivered?:boolean;max_images?:number;max_bytes?:number};
export type Thread={id:string;name:string;channel:string;preview:string;preview_sender?:string;unread:number;status?:string;priority?:string;overdue?:boolean;last_activity_at?:string;ai_enabled?:boolean;window_open?:boolean;capabilities?:Cap};
export type Content={sticker?:boolean;media_id?:string;name?:string;mime?:string;size_bytes?:number;duration_ms?:number;id?:string;price_minor?:number;currency?:string;sizes?:string;image_media_id?:string};
export type Msg={id:string;sequence:number;sender:string;body:string;state:string;created_at:string;type?:string;sent_at?:string;delivered_at?:string;seen_at?:string;reply_to?:string|null;reply_body?:string|null;error_code?:string|null;content?:Content|null;batch_id?:string|null;reaction?:string|null};
export type ThreadInfo={name:string;send_allowed?:boolean;manage_allowed?:boolean;ai_enabled:boolean;window_open:boolean;capabilities?:Cap};
export type Conversation={items:Msg[];thread:ThreadInfo};
export type Product={id:string;name:string;price_minor:number;currency?:string;sizes?:string;image_media_id?:string|null};
export type OrderRow={id:string;reference:string;items:string;amount_minor:number;currency?:string;status:"ok"|"cx"|"rt"|"run";reason?:string;created_at:string};
export type Profile={id:string;name:string;channel:string;phone?:string|null;contact?:{phone?:string;address?:string;payment?:string;username?:string}|null;note?:string|null;note_version?:number;ai_enabled:boolean;store?:string;messages:number;talks:number;first?:{at:string;text:string}|null;summary?:{total:number};orders:OrderRow[]};

export const channelMeta:Record<string,{name:string;color:string}>={ms:{name:"Messenger",color:"#0A7CFF"},ig:{name:"Instagram",color:"#D6307A"},wa:{name:"WhatsApp",color:"#1FA855"},tg:{name:"Telegram",color:"#26A5E4"},web:{name:"Website",color:"#6B6A64"}};
export const maxImages=10;

const digits="০১২৩৪৫৬৭৮৯";
export function num(value:number|string,bn:boolean){const s=String(value);return bn?s.replace(/\d/g,d=>digits[Number(d)]):s;}
export function clock(iso:string|undefined,bn:boolean){if(!iso)return "";const d=new Date(iso);if(Number.isNaN(d.getTime()))return "";return num(`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`,bn);}
export function mmss(seconds:number,bn:boolean){const s=Math.max(0,Math.floor(seconds));return num(`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`,bn);}
export function dayKey(iso:string){const d=new Date(iso);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;}
export function dayLabel(iso:string,bn:boolean){
 const d=new Date(iso),now=new Date(),y=new Date(now.getTime()-86400000);
 if(dayKey(iso)===dayKey(now.toISOString()))return bn?"আজ":"Today";
 if(dayKey(iso)===dayKey(y.toISOString()))return bn?"গতকাল":"Yesterday";
 return d.toLocaleDateString(bn?"bn-BD":"en-GB",{day:"numeric",month:"short",year:d.getFullYear()===now.getFullYear()?undefined:"numeric"});
}
export function listTime(iso:string|undefined,bn:boolean){
 if(!iso)return "";const d=new Date(iso),now=new Date();
 if(dayKey(iso)===dayKey(now.toISOString()))return clock(iso,bn);
 if(dayKey(iso)===dayKey(new Date(now.getTime()-86400000).toISOString()))return bn?"গতকাল":"Yesterday";
 return d.toLocaleDateString(bn?"bn-BD":"en-GB",{day:"numeric",month:"short"});
}
export function fullDate(iso:string|undefined,bn:boolean){if(!iso)return "—";const d=new Date(iso);return `${d.toLocaleDateString(bn?"bn-BD":"en-GB",{day:"numeric",month:"short",year:"numeric"})}, ${clock(iso,bn)}`;}
export function money(minor:number,bn:boolean,currency="BDT"){const v=Math.round(minor/100);const s=v.toLocaleString("en-IN");return (currency==="BDT"?"৳":currency+" ")+num(s,bn);}
export function initials(name:string){const t=(name||"").trim();if(!t)return "?";const p=t.split(/\s+/);return ((p[0]?.[0]??"")+(p.length>1?p[p.length-1][0]:"")).toLocaleUpperCase();}
const emojiOnly=/^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1}$/u;
export function isSticker(m:Msg){return (m.type==="text"||!m.type)&&!!m.body&&m.body.length<=24&&emojiOnly.test(m.body.trim());}
export function preview(m:Msg|undefined,bn:boolean){
 if(!m)return "";
 if(m.type==="image")return bn?"📷 ছবি":"📷 Photo";if(m.type==="audio")return bn?"🎤 ভয়েস":"🎤 Voice";
 if(m.type==="document")return "📎 "+(m.content?.name||(bn?"ফাইল":"File"));if(m.type==="product")return "🛍 "+(m.body||(bn?"পণ্য":"Product"));
 return m.body;
}

/* ---- grouping ---- */
export type Row={kind:"day";key:string;label:string}|{kind:"unread";key:string;count:number}|{kind:"msg";key:string;msg:Msg;first:boolean;last:boolean;album?:Msg[]};
export function buildRows(items:Msg[],unreadFrom:number|null,unreadCount:number,bn:boolean):Row[]{
 const visible=items.filter(m=>m.type!=="reaction");const rows:Row[]=[];let prevDay="",prev:Msg|undefined,placed=false;
 for(let i=0;i<visible.length;i++){
  const m=visible[i];
  if(dayKey(m.created_at)!==prevDay){prevDay=dayKey(m.created_at);rows.push({kind:"day",key:"d"+prevDay,label:dayLabel(m.created_at,bn)});prev=undefined;}
  if(!placed&&unreadFrom!==null&&m.sequence>=unreadFrom&&m.sender==="customer"){placed=true;rows.push({kind:"unread",key:"u",count:unreadCount});prev=undefined;}
  // images sharing a batch collapse into one album row anchored at its last member
  if(m.type==="image"&&m.batch_id){
   const album=visible.filter(x=>x.batch_id===m.batch_id&&x.type==="image");
   if(album[0]!==m)continue;
   rows.push({kind:"msg",key:m.id,msg:album[album.length-1],album,first:!prev||prev.sender!==m.sender,last:false});prev=album[album.length-1];continue;
  }
  rows.push({kind:"msg",key:m.id,msg:m,first:!prev||(prev.sender!==m.sender),last:false});prev=m;
 }
 for(let i=0;i<rows.length;i++){const r=rows[i];if(r.kind!=="msg")continue;const n=rows[i+1];r.last=!n||n.kind!=="msg"||n.msg.sender!==r.msg.sender;}
 return rows;
}

/* ---- media (decoded once, shared by every bubble) ---- */
type Loaded={url:string;mime:string};
const urls=new Map<string,{p:Promise<Loaded|null>;at:number}>();
export const mediaReasons=new Map<string,string>();
const SIGNED_TTL=8*60*1000;// signed links last 10 minutes server-side
const safeMime=(m:string)=>/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|ogg|mp4|aac|webm|wav)|application\/pdf|text\/plain)$/.test(m.split(";")[0])?m.split(";")[0]:"application/octet-stream";
/** Media is streamed straight from the API through a short-lived signed URL (no size cap, Range-capable).
 *  Older backends that still answer with base64 data are handled as a fallback. */
export function loadMedia(workspaceId:string,threadId:string,mediaId:string,bust=false){
 const key=workspaceId+mediaId;const cur=urls.get(key);
 if(cur&&!bust&&Date.now()-cur.at<SIGNED_TTL)return cur.p;
 const get=(url:boolean)=>fetch(`/api/go/workspaces/${workspaceId}/inbox?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"media-get",thread_id:threadId,body:{media_id:mediaId,url}})});
 // Signed links need a configured media origin; without one the server can still return the (size-capped) bytes.
 const p=get(true).then(async r=>{if(r.status!==503)return r;const e=await r.clone().json().catch(()=>null) as {code?:unknown;error?:{code?:unknown}}|null;return (e?.error?.code??e?.code)==="MEDIA_ORIGIN_NOT_CONFIGURED"?get(false):r;})
  .then(async(r):Promise<Loaded>=>{
   if(!r.ok){const e=await r.json().catch(()=>null) as {code?:unknown;error?:unknown}|null;const c=typeof e?.code==="string"?e.code:typeof e?.error==="string"?e.error:e?.error&&typeof e.error==="object"&&"code" in e.error?String(e.error.code):String(r.status);mediaReasons.set(key,c);throw Error(c);}
   mediaReasons.delete(key);const j=await r.json() as {url?:unknown;data?:unknown;mime?:unknown};
   if(typeof j.mime!=="string")throw Error("BAD_RESPONSE");
   const mime=safeMime(j.mime);
   if(typeof j.url==="string"&&/^https:\/\//.test(j.url))return {url:j.url,mime};
   if(typeof j.data!=="string"||j.data.length>7000000)throw Error("BAD_RESPONSE");
   const bin=atob(j.data),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
   return {url:URL.createObjectURL(new Blob([bytes],{type:mime})),mime};})
  .catch(()=>{if(urls.get(key)?.p===p)urls.delete(key);return null;});
 urls.set(key,{p,at:Date.now()});
 if(urls.size>120){const old=urls.keys().next().value;if(old){const e=urls.get(old);urls.delete(old);void e?.p.then(v=>{if(v?.url.startsWith("blob:"))URL.revokeObjectURL(v.url);});}}
 return p;
}
export function fileToBase64(file:Blob){return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]??"");r.onerror=()=>reject(Error());r.readAsDataURL(file);});}

export function sendReason(e:unknown,bn:boolean){
 const x=e as {message?:string;code?:string}|null;const code=x?.code??"",st=x?.message??"";
 if(code==="VPS_LOGIN_REQUIRED")return bn?"সরাসরি VPS upload চালু করতে একবার সাইন আউট করে আবার লগইন করুন":"Sign out and sign in once to enable direct VPS uploads";
 if(/FILE_LIMIT|TOO_LARGE/i.test(code))return bn?"ফাইল ৫ MB-এর বেশি":"File is over 5 MB";
 if(/UNSUPPORTED|INVALID_MEDIA|INVALID_IMAGE/i.test(code))return bn?"ফাইলটি সাপোর্টেড নয়":"File type not supported";
 if(st==="429")return bn?"একটু পরে আবার চেষ্টা করুন":"Too many uploads, try again shortly";
 if(/WINDOW|CLOSED/i.test(code))return bn?"উত্তরের সময় শেষ":"Reply window closed";
 return code?code:st&&/^\d+$/.test(st)?`HTTP ${st}`:"";
}

/** Videos are too large for the JSON proxy; the API hands back a short-lived signed URL the browser streams from. */
export async function loadVideoUrl(workspaceId:string,threadId:string,mediaId:string):Promise<{url:string;mime:string}|null>{
 const key=workspaceId+mediaId;
 try{
  const r=await fetch(`/api/go/workspaces/${workspaceId}/inbox?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"media-get",thread_id:threadId,body:{media_id:mediaId,url:true}})});
  if(!r.ok){const e=await r.json().catch(()=>null) as {code?:unknown}|null;mediaReasons.set(key,typeof e?.code==="string"?e.code:String(r.status));return null;}
  const j=await r.json() as {url?:unknown;mime?:unknown};mediaReasons.delete(key);
  if(typeof j.url!=="string"||!/^https:\/\//.test(j.url)||typeof j.mime!=="string")return null;
  return {url:j.url,mime:j.mime.split(";")[0]};
 }catch{return null;}
}
