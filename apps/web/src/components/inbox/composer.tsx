"use client";
/* eslint-disable @next/next/no-img-element -- previews are in-memory blob URLs */
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {PointerEvent as RPE} from "react";
import {I} from "./icons";
import {Sheet} from "./sheets";
import {fileToBase64,maxImages,sendReason,mmss,money,num,type Cap,type Msg,type Product} from "./lib";
import {chooseRecorder,finishRecording,type RecorderChoice} from "./voice";
import {useMedia} from "./bubbles";
import s from "./inbox.module.css";

export type Call=<T=unknown>(action:string,body?:object)=>Promise<T>;
type Item={id:string;mediaId:string;key:string;blob:Blob;url:string;name:string;mime:string};
const MAX_BYTES=5*1024*1024;

// Base64 travels through the web proxy: keep a photo well below its payload limit.
const PHOTO_BYTES=2*1024*1024;
async function normalizeImage(file:File):Promise<{blob:Blob;mime:string;name:string}|null>{
 if(!file.type.startsWith("image/"))return null;
 let source:CanvasImageSource|null=null,release=()=>{};
 try{
  try{const bmp=await createImageBitmap(file);source=bmp;release=()=>bmp.close();}
  catch{
   // Some mobile browsers cannot decode camera photos with createImageBitmap.
   const url=URL.createObjectURL(file);release=()=>URL.revokeObjectURL(url);
   const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error("IMAGE_DECODE_FAILED"));img.src=url;});source=img;
  }
  const width=source instanceof HTMLImageElement?source.naturalWidth:(source as ImageBitmap).width;
  const height=source instanceof HTMLImageElement?source.naturalHeight:(source as ImageBitmap).height;
  if(!width||!height)return null;
  if((file.type==="image/jpeg"||file.type==="image/png")&&file.size<=PHOTO_BYTES&&Math.max(width,height)<=2560)return {blob:file,mime:file.type,name:file.name||"photo"};
  const scale=Math.min(1,2560/Math.max(width,height));
  const c=document.createElement("canvas");c.width=Math.max(1,Math.round(width*scale));c.height=Math.max(1,Math.round(height*scale));
  const ctx=c.getContext("2d");if(!ctx)return null;ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(source,0,0,c.width,c.height);
  for(const q of [.88,.74,.6,.45]){const blob=await new Promise<Blob|null>(r=>c.toBlob(r,"image/jpeg",q));if(blob&&blob.size<=PHOTO_BYTES)return {blob,mime:"image/jpeg",name:(file.name||"photo").replace(/\.[^.]+$/,"")+".jpg"};}
 }catch{}
 finally{release();}
 return null;
}

function ProductRow({p,workspaceId,threadId,bn,onPick}:{p:Product;workspaceId:string;threadId:string;bn:boolean;onPick:(p:Product)=>void}){
 const {media}=useMedia(workspaceId,threadId,p.image_media_id);
 return <button type="button" className={s.lr} onClick={()=>onPick(p)}><span className={s.lth}>{media?.mime.startsWith("image/")?<img src={media.url} alt=""/>:<I n="bag" size={20}/>}</span><span className={s.lbody}><b>{p.name}</b><small>{p.sizes||""}</small></span><span className={s.lprice}>{money(p.price_minor,bn,p.currency)}</span></button>;
}

export function Composer(p:{workspaceId:string;threadId:string;bn:boolean;call:Call;caps:Cap;channel:string;canSend:boolean;windowOpen:boolean;offline:boolean;busy:boolean;
 text:string;onText:(v:string)=>void;onSendText:()=>void;replyTo:Msg|null;replyWho:string;onCancelReply:()=>void;onSent:()=>Promise<void>|void;toast:(t:string)=>void;onBusy:(b:boolean)=>void;productsEnabled:boolean}){
 const {bn,call,caps,toast}=p,t=(en:string,be:string)=>bn?be:en;
 const ta=useRef<HTMLTextAreaElement>(null),galRef=useRef<HTMLInputElement>(null),camRef=useRef<HTMLInputElement>(null),docRef=useRef<HTMLInputElement>(null);
 const [attach,setAttach]=useState(false),[items,setItems]=useState<Item[]>([]),[cur,setCur]=useState(0),[pvOpen,setPvOpen]=useState(false),[sending,setSending]=useState(false);
 const [prodOpen,setProdOpen]=useState(false),[products,setProducts]=useState<Product[]|null>(null);
 const has=p.text.trim().length>0,disabled=p.offline||sending;
 const itemsRef=useRef(items);itemsRef.current=items;
 useEffect(()=>{const el=ta.current;if(!el)return;el.style.height="38px";el.style.height=Math.min(96,Math.max(38,el.scrollHeight))+"px";},[p.text]);
 useEffect(()=>()=>{itemsRef.current.forEach(x=>URL.revokeObjectURL(x.url));},[]);
 useEffect(()=>{if(p.replyTo)ta.current?.focus();},[p.replyTo]);

 /* ---------- images ---------- */
 const addFiles=useCallback(async(files:FileList|File[]|null)=>{
  if(!files||!files.length)return;const room=maxImages-itemsRef.current.length;const list=Array.from(files).slice(0,Math.max(0,room));
  if(files.length>room)toast(t(`Up to ${maxImages} photos at a time`,`একসাথে সর্বোচ্চ ${num(maxImages,true)}টি ছবি`));
  const next:Item[]=[];
  for(const f of list){const n=await normalizeImage(f);if(!n){toast(t("This image can't be sent (max 5 MB)","এই ছবি পাঠানো যাবে না (সর্বোচ্চ ৫ MB)"));continue;}next.push({id:crypto.randomUUID(),mediaId:crypto.randomUUID(),key:crypto.randomUUID(),blob:n.blob,url:URL.createObjectURL(n.blob),name:n.name,mime:n.mime});}
  if(!next.length)return;setItems(prev=>{const all=[...prev,...next];setCur(prev.length);return all;});setPvOpen(true);
 },[toast,bn]);// eslint-disable-line react-hooks/exhaustive-deps
 function removeItem(i:number){setItems(prev=>{const x=prev[i];if(x)URL.revokeObjectURL(x.url);const n=prev.filter((_,j)=>j!==i);if(!n.length)setPvOpen(false);setCur(c=>Math.max(0,Math.min(c,n.length-1)));return n;});}
 function closePreview(){items.forEach(x=>URL.revokeObjectURL(x.url));setItems([]);setPvOpen(false);}
 const rs=(e:unknown)=>{const r=sendReason(e,bn);return r?" — "+r:"";};
 async function uploadAndSend(item:Item,extra:object,mime=item.mime,duration?:number){
  const data=await fileToBase64(item.blob);
  await call("media-upload",{media_id:item.mediaId,data,mime,name:item.name,...(duration?{duration_ms:duration}:{})});
  await call("send-media",{media_id:item.mediaId,idempotency_key:item.key,...extra});
 }
 async function sendImages(){
  if(sending||!items.length)return;setSending(true);p.onBusy(true);const batch=items.length>1?crypto.randomUUID():undefined;let done=0;
  try{
   for(let i=0;i<items.length;i++){await uploadAndSend(items[i],{...(batch?{batch_id:batch}:{}),...(i===0&&p.replyTo?{reply_to:p.replyTo.id}:{})});done++;}
   if(p.replyTo)p.onCancelReply();closePreview();await p.onSent();
  }catch(e){
   setItems(prev=>{prev.slice(0,done).forEach(x=>URL.revokeObjectURL(x.url));return prev.slice(done);});
   toast((items.length===1?t("Couldn't send this photo. It is kept for retry.","ছবিটি পাঠানো যায়নি। আবার পাঠানোর জন্য রাখা আছে।"):t("Couldn't send all photos. Remaining ones are kept.","সব ছবি যায়নি। বাকিগুলো রাখা আছে।"))+rs(e));
  }finally{setSending(false);p.onBusy(false);}
 }

 /* ---------- document / product ---------- */
 async function sendDoc(file:File|undefined){
  if(!file||sending)return;if(file.size>MAX_BYTES||!["application/pdf","text/plain"].includes(file.type)){toast(t("Only PDF or text up to 5 MB","শুধু ৫ MB পর্যন্ত PDF বা টেক্সট"));return;}
  setSending(true);p.onBusy(true);
  try{await uploadAndSend({id:"",mediaId:crypto.randomUUID(),key:crypto.randomUUID(),blob:file,url:"",name:file.name.slice(0,200),mime:file.type},p.replyTo?{reply_to:p.replyTo.id}:{});if(p.replyTo)p.onCancelReply();await p.onSent();}
  catch(e){toast(t("Couldn't send the file","ফাইল পাঠানো যায়নি")+rs(e));}finally{setSending(false);p.onBusy(false);}
 }
 async function openProducts(){setAttach(false);setProdOpen(true);if(products)return;try{const r=await call<{items:Product[]}>("products");setProducts(r.items);}catch{setProducts([]);toast(t("Couldn't load products","পণ্য আনা যায়নি"));}}
 async function sendProduct(prod:Product){
  if(sending)return;setSending(true);p.onBusy(true);setProdOpen(false);
  try{await call("send-product",{product_id:prod.id,idempotency_key:crypto.randomUUID(),...(p.replyTo?{reply_to:p.replyTo.id}:{})});if(p.replyTo)p.onCancelReply();await p.onSent();}
  catch{toast(t("Couldn't send the product","পণ্য পাঠানো যায়নি"));}finally{setSending(false);p.onBusy(false);}
 }

 /* ---------- voice ---------- */
 type Rec={stream:MediaStream;mr:MediaRecorder;parts:Blob[];choice:RecorderChoice;acc:number;seg:number;paused:boolean;ctx?:AudioContext;an?:AnalyserNode;raf?:number;timer?:ReturnType<typeof setInterval>;locked:boolean;x:number;y:number;pointer:number;cancelled:boolean;stopped:boolean};
 const rec=useRef<Rec|null>(null),starting=useRef(false),holdAt=useRef(0),released=useRef(false);
 const [phase,setPhase]=useState<"idle"|"holding"|"locked">("idle"),[elapsed,setElapsed]=useState(0),[levels,setLevels]=useState<number[]>([]),[dx,setDx]=useState(0),[lockP,setLockP]=useState(0),[armed,setArmed]=useState(false),[paused,setPaused]=useState(false),[cancelling,setCancelling]=useState(false);
 const micOk=useMemo(()=>typeof window!=="undefined"&&!!navigator.mediaDevices?.getUserMedia&&!!chooseRecorder(),[]);
 const elapsedMs=(r:Rec)=>r.acc+(r.paused?0:Date.now()-r.seg);
 const cleanup=useCallback((r:Rec)=>{if(r.timer)clearInterval(r.timer);if(r.raf)cancelAnimationFrame(r.raf);r.stream.getTracks().forEach(x=>x.stop());void r.ctx?.close().catch(()=>{});},[]);
 async function startRec(e:RPE){
  if(!micOk||starting.current||rec.current||disabled||!p.canSend){if(!micOk)toast(t("Voice recording isn't supported in this browser","এই ব্রাউজারে ভয়েস রেকর্ড চলবে না"));return;}
  starting.current=true;released.current=false;holdAt.current=Date.now();const pid=e.pointerId,x=e.clientX,y=e.clientY;(e.currentTarget as HTMLElement).setPointerCapture?.(pid);
  /* AudioContext must be created inside the gesture or Chrome keeps it suspended (flat waveform) */
  let ctx:AudioContext|undefined;try{ctx=new AudioContext();void ctx.resume();}catch{}
  setPhase("holding");setElapsed(0);setLevels([]);setDx(0);setLockP(0);setArmed(false);setPaused(false);setCancelling(false);
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
   const choice=chooseRecorder()!;const mr=new MediaRecorder(stream,{mimeType:choice.mime});
   const r:Rec={stream,mr,parts:[],choice,acc:0,seg:Date.now(),paused:false,locked:false,x,y,pointer:pid,cancelled:false,stopped:false};
   mr.ondataavailable=ev=>{if(ev.data.size)r.parts.push(ev.data);};
   try{if(ctx){void ctx.resume();const src=ctx.createMediaStreamSource(stream),an=ctx.createAnalyser();an.fftSize=512;an.smoothingTimeConstant=.4;src.connect(an);r.ctx=ctx;r.an=an;}}catch{}
   rec.current=r;
   if(r.stopped){cleanup(r);rec.current=null;return;}
   if(released.current){/* finger lifted while the mic permission/start was pending */
    if(Date.now()-holdAt.current<350){cleanup(r);rec.current=null;setPhase("idle");toast(t("Hold the mic to record","মাইক চেপে ধরে রাখুন"));return;}
    r.locked=true;setPhase("locked");}
   mr.start(250);navigator.vibrate?.(10);
   r.timer=setInterval(()=>setElapsed(elapsedMs(r)),200);
   const buf=new Uint8Array(512);let last=0;
   const tick=(now:number)=>{if(!rec.current)return;if(r.an&&now-last>55&&!r.paused){last=now;if(r.ctx?.state==="suspended")void r.ctx.resume();r.an.getByteTimeDomainData(buf);let sum=0;for(const v of buf){const d=(v-128)/128;sum+=d*d;}const rms=Math.sqrt(sum/buf.length);/* noise gate: room silence stays a flat dot, speech swings tall */const lv=Math.min(1,Math.pow(Math.max(0,rms-.012)*9,.75));setLevels(prev=>[...prev.slice(-159),lv]);}r.raf=requestAnimationFrame(tick);};r.raf=requestAnimationFrame(tick);
  }catch{void ctx?.close().catch(()=>{});setPhase("idle");toast(t("Allow microphone access to record","রেকর্ড করতে মাইক্রোফোনের অনুমতি দিন"));}
  finally{starting.current=false;}
 }
 function moveRec(e:RPE){const r=rec.current;if(!r||r.locked||phase!=="holding")return;const ddx=e.clientX-r.x,ddy=e.clientY-r.y;
  setDx(Math.min(0,ddx));setLockP(Math.max(0,Math.min(1,-ddy/72)));setArmed(-ddy>=61);
  if(ddx<=-96){endRec(false,true);}else if(ddy<=-72){r.locked=true;navigator.vibrate?.(12);setArmed(true);setTimeout(()=>setPhase("locked"),140);}}
 async function endRec(send:boolean,animate=false){
  const r=rec.current;if(!r){starting.current=false;setPhase("idle");return;}
  if(r.stopped)return;r.stopped=true;
  if(!send&&animate){setCancelling(true);}
  const ms=elapsedMs(r);r.cancelled=!send;
  const stopped=new Promise<void>(res=>{r.mr.onstop=()=>res();});
  try{if(r.mr.state!=="inactive")r.mr.stop();}catch{}
  await Promise.race([stopped,new Promise(res=>setTimeout(res,1500))]);
  cleanup(r);rec.current=null;
  setTimeout(()=>{setPhase("idle");setCancelling(false);setDx(0);},animate?220:0);
  if(!send)return;
  if(ms<1000){toast(t("Recording too short","রেকর্ডিং খুব ছোট"));return;}
  const out=await finishRecording(r.parts,r.choice,ms);if(!out){toast(t("Recording failed","রেকর্ড হয়নি"));return;}
  if(out.blob.size>MAX_BYTES){toast(t("Voice note is too long (max 5 MB)","ভয়েস অনেক বড় (সর্বোচ্চ ৫ MB)"));return;}
  setSending(true);p.onBusy(true);
  try{
   const ext=out.mime==="audio/ogg"?"ogg":out.mime==="audio/mp4"?"m4a":"audio";
   await uploadAndSend({id:"",mediaId:crypto.randomUUID(),key:crypto.randomUUID(),blob:out.blob,url:"",name:`voice-${Date.now()}.${ext}`,mime:out.mime},p.replyTo?{reply_to:p.replyTo.id}:{},out.mime,Math.max(1000,out.durationMs));
   if(p.replyTo)p.onCancelReply();await p.onSent();
  }catch(e){toast(t("Voice note couldn't be sent","ভয়েস পাঠানো যায়নি")+rs(e));}finally{setSending(false);p.onBusy(false);}
 }
 function upRec(){released.current=true;const r=rec.current;if(!r){return;}
  if(r.locked||phase==="locked")return;if(Date.now()-holdAt.current<350){void endRec(false);toast(t("Hold the mic to record","মাইক চেপে ধরে রাখুন"));return;}void endRec(true);}
 function togglePause(){const r=rec.current;if(!r)return;if(r.paused){r.mr.resume();r.seg=Date.now();r.paused=false;setPaused(false);}else{r.mr.pause();r.acc+=Date.now()-r.seg;r.paused=true;setPaused(true);}}
 useEffect(()=>()=>{const r=rec.current;if(r){r.stopped=true;try{if(r.mr.state!=="inactive")r.mr.stop();}catch{}cleanup(r);rec.current=null;}},[cleanup]);
 useEffect(()=>{if(!p.windowOpen&&rec.current)void endRec(false);},[p.windowOpen]);// eslint-disable-line react-hooks/exhaustive-deps

 if(!p.canSend)return <div className={`${s.comp} ${s.closed}`}><div className={s.wcl}><I n="info" size={20}/><div><b>{t("View only","শুধু দেখা যাবে")}</b><span>{t("You have read-only access to this conversation.","এই কথোপকথনে আপনার শুধু দেখার অনুমতি আছে।")}</span></div></div></div>;
 if(!p.windowOpen)return <div className={`${s.comp} ${s.closed}`}><div className={s.wcl}><I n="clk" size={20}/><div><b>{t("24 hours have passed","২৪ ঘণ্টা পার হয়ে গেছে")}</b><span>{t("You can reply again after the customer sends a new message.","কাস্টমার নতুন মেসেজ দিলে আবার উত্তর দেওয়া যাবে।")}</span></div></div></div>;

 const cls=`${s.comp} ${disabled?s.dis:""} ${phase==="holding"?`${s.holding} ${s.recing}`:""} ${phase==="locked"?s.locked:""} ${cancelling?s.cancelling:""}`;
 const canImg=caps.image!==false,canDoc=caps.document!==false&&p.channel!=="ig",canProd=p.productsEnabled&&caps.product!==false;
 return <>
  <div className={`${s.rbar} ${p.replyTo?s.show:""}`}><div><b>{p.replyWho}</b><span>{p.replyTo?(p.replyTo.body||(p.replyTo.type==="image"?t("Photo","ছবি"):p.replyTo.type==="audio"?t("Voice","ভয়েস"):t("Message","মেসেজ"))):""}</span></div><button type="button" className={s.ib} onClick={p.onCancelReply} aria-label={t("Cancel reply","রিপ্লাই বাতিল")}><I n="x"/></button></div>
  <div className={cls}>
   <div className={s.inw}>
    <textarea ref={ta} data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" spellCheck rows={1} value={p.text} maxLength={8000} placeholder={t("Write a message…","মেসেজ লিখুন…")} aria-label={t("Message","মেসেজ")} disabled={disabled}
     onChange={e=>p.onText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing&&window.matchMedia("(min-width:900px)").matches){e.preventDefault();if(has)p.onSendText();}}}/>
    <button type="button" className={s.ib} aria-label={t("Attach","সংযুক্ত করুন")} onClick={()=>setAttach(true)} disabled={disabled}><I n="clip"/></button>
    {canImg&&<button type="button" className={`${s.ib} ${s.cam} ${has?s.hide:""}`} aria-label={t("Camera","ক্যামেরা")} onClick={()=>camRef.current?.click()} disabled={disabled}><I n="cam"/></button>}
   </div>
   <button type="button" className={`${s.sendb} ${has?s.has:""} ${phase!=="idle"?s.recm:""}`} aria-label={has?t("Send","পাঠান"):t("Hold to record","ধরে রেকর্ড করুন")}
    onClick={()=>{if(has&&!p.busy)p.onSendText();}}
    onPointerDown={e=>{if(!has&&e.button===0){e.preventDefault();void startRec(e);}}} onPointerMove={moveRec} onPointerUp={()=>{if(!has)upRec();}} onPointerCancel={()=>{if(!has&&phase==="holding")void endRec(false);}} onContextMenu={e=>e.preventDefault()}>
    <I n="mic" className={s.s_mic}/><I n="snd" className={s.s_snd}/>
   </button>
   <div className={s.rec}><I n="mic" className={s.micdot}/><span className={s.recT}>{mmss(elapsed/1000,bn)}</span><div className={s.slc} style={{transform:`translateX(${dx*.6}px)`,opacity:Math.max(0,1+dx/110)}}><I n="back" size={14}/>{t("Slide to cancel","বাতিল করতে স্লাইড করুন")}</div></div>
   <div className={s.lockc} style={{["--lk" as string]:lockP} as React.CSSProperties} data-armed={armed}><I n="lko" className={s.lo}/><I n="lk" className={s.lc}/><I n="cu" className={s.cu}/></div>
   <div className={`${s.lkp} ${paused?s.paused:""}`}>
    <div className={s.lkr1}><span className={s.lkT}>{mmss(elapsed/1000,bn)}</span><div className={s.lkW}>{Array.from({length:160}).map((_,i)=>{const v=levels[levels.length-160+i]??0;return <b key={i} style={{height:3+v*38,opacity:v>.02?1:.45}}/>;})}</div></div>
    <div className={s.lkr2}><button type="button" className={s.lkx} aria-label={t("Delete","বাতিল")} onClick={()=>void endRec(false,true)}><I n="trash"/></button>
     <button type="button" className={s.lkpz} onClick={togglePause}>{paused?<><I n="mic"/>{t("Resume","চালু")}</>:<><I n="pause"/>{t("Pause","পজ")}</>}</button>
     <button type="button" className={s.lks} aria-label={t("Send","পাঠান")} onClick={()=>void endRec(true)}><I n="snd"/></button></div>
   </div>
  </div>
  <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={e=>{void addFiles(e.target.files);e.currentTarget.value="";}}/>
  <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={e=>{void addFiles(e.target.files);e.currentTarget.value="";}}/>
  <input ref={docRef} type="file" accept="application/pdf,text/plain" hidden onChange={e=>{void sendDoc(e.target.files?.[0]);e.currentTarget.value="";}}/>

  <Sheet open={attach} onClose={()=>setAttach(false)} label={t("Send","পাঠান")}>
   <h4>{t("Send","পাঠান")}</h4>
   <div className={s.grid4}>
    {canImg&&<div><button type="button" onClick={()=>{setAttach(false);galRef.current?.click();}}><I n="img"/></button>{t("Gallery","গ্যালারি")}</div>}
    {canImg&&<div><button type="button" onClick={()=>{setAttach(false);camRef.current?.click();}}><I n="cam"/></button>{t("Camera","ক্যামেরা")}</div>}
    {canDoc&&<div><button type="button" onClick={()=>{setAttach(false);docRef.current?.click();}}><I n="doc"/></button>{t("Document","ডকুমেন্ট")}</div>}
    {canProd&&<div><button type="button" onClick={()=>void openProducts()}><I n="bag"/></button>{t("Product","পণ্য")}</div>}
   </div>
  </Sheet>
  <Sheet open={prodOpen} onClose={()=>setProdOpen(false)} label={t("Send a product","পণ্য পাঠান")}>
   <h4>{t("Send a product","পণ্য পাঠান")}<button type="button" onClick={()=>setProdOpen(false)}>{t("Close","বন্ধ")}</button></h4>
   {products===null?<p className={s.sheetNote}>{t("Loading…","লোড হচ্ছে…")}</p>:products.length===0?<p className={s.sheetNote}>{t("No products yet. Add products to your catalogue to send them here.","এখনো কোনো পণ্য নেই।")}</p>:products.map(x=><ProductRow key={x.id} p={x} workspaceId={p.workspaceId} threadId={p.threadId} bn={bn} onPick={sendProduct}/>)}
  </Sheet>

  {pvOpen&&<div className={`${s.pvw} ${s.pvshow}`} role="dialog" aria-modal="true" aria-label={t("Photo preview","ছবির প্রিভিউ")}>
   <div className={s.vt}><button type="button" className={s.ib} style={{color:"#fff"}} onClick={closePreview} aria-label={t("Close","বন্ধ")}><I n="x"/></button><b className={s.pc2}>{num(cur+1,bn)}/{num(items.length,bn)}</b></div>
   {}
   {items[cur]&&<img className={s.pimg2} src={items[cur].url} alt=""/>}
   <div className={s.pth}>{items.map((x,i)=><button type="button" key={x.id} className={i===cur?s.on:undefined} onClick={()=>setCur(i)}>{}<img src={x.url} alt=""/><span className={s.rm} onClick={e=>{e.stopPropagation();removeItem(i);}}>×</span></button>)}
    {items.length<maxImages&&<button type="button" className={s.add} aria-label={t("Add more","আরও যোগ")} onClick={()=>galRef.current?.click()}>+</button>}</div>
   <div className={s.pvb}><button type="button" className={`${s.sendb} ${s.has}`} onClick={()=>void sendImages()} disabled={sending} aria-label={t("Send","পাঠান")}><I n="snd" className={s.s_snd}/>{items.length>1&&<span className={s.cnt}>{num(items.length,bn)}</span>}</button></div>
  </div>}
 </>;
}
