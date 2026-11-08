"use client";
/* eslint-disable @next/next/no-img-element -- previews are in-memory blob URLs */
import {memo,useEffect,useRef,useState} from "react";
import type {PointerEvent as RPE} from "react";
import {I} from "./icons";
import {Sheet} from "./sheets";
import {clock,isSticker,loadMedia,mediaReasons,mmss,money,num,type Msg} from "./lib";
import s from "./inbox.module.css";

export function useMedia(workspaceId:string,threadId:string,mediaId?:string|null){
 const [st,setSt]=useState<{id:string;media:{url:string;mime:string}|null}|null>(null),[tick,setTick]=useState(0);
 useEffect(()=>{if(!mediaId)return;let live=true;void loadMedia(workspaceId,threadId,mediaId).then(r=>{if(live)setSt({id:mediaId,media:r});});return()=>{live=false;};},[workspaceId,threadId,mediaId,tick]);
 const ready=!!mediaId&&st?.id===mediaId;
 const retry=()=>{setSt(null);setTick(x=>x+1);};
 return {media:ready?st.media:null,failed:ready&&!st.media,reason:ready&&!st.media?mediaReasons.get(workspaceId+mediaId)??"":"",retry};
}
export function reasonText(code:string,bn:boolean){
 if(/UNSUPPORTED|MIME|TYPE/i.test(code))return bn?"এই ফাইল টাইপ সাপোর্টেড নয়":"File type not supported";
 if(/LARGE|SIZE/i.test(code))return bn?"ফাইল অনেক বড়":"File too large";
 if(/EXPIRED|GONE|404|410/i.test(code))return bn?"চ্যানেল থেকে মিডিয়ার মেয়াদ শেষ":"Expired at the channel";
 if(/SCAN|MALWARE/i.test(code))return bn?"নিরাপত্তা স্ক্যান শেষ হয়নি":"Security scan unavailable";
 return bn?"মিডিয়া লোড হয়নি":"Media couldn't load";
}

export function Ticks({m,bn,onRetry}:{m:Msg;bn:boolean;onRetry?:(m:Msg)=>void}){
 if(m.sender==="customer")return null;
 const st=m.state;
 if(st==="failed"||st==="uncertain")return <button type="button" className={s.fail} aria-label={bn?"আবার পাঠান":"Retry"} onClick={e=>{e.stopPropagation();onRetry?.(m);}}>!</button>;
 if(st==="queued"||st==="sending")return <span className={s.tk}><I n="clk" size={13} style={{strokeWidth:2.2}}/></span>;
 if(st==="sent")return <span className={s.tk} key="sent"><I n="chk" size={13} style={{strokeWidth:2.2}}/></span>;
 return <span className={`${s.dbl} ${st==="seen"?s.seen:""} ${s.tk}`} key={st}><I n="chk" size={13} style={{strokeWidth:2.2}}/><I n="chk" size={13} style={{strokeWidth:2.2,marginLeft:-8}}/></span>;
}

const bars=(seed:string)=>{let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}return Array.from({length:30},()=>{h^=h<<13;h^=h>>>17;h^=h<<5;return 5+Math.abs(h%17);});};

function Voice({m,workspaceId,threadId,bn}:{m:Msg;workspaceId:string;threadId:string;bn:boolean}){
 const {media,failed,reason,retry}=useMedia(workspaceId,threadId,m.content?.media_id);
 const el=useRef<HTMLAudioElement>(null),[playing,setPlaying]=useState(false),[pos,setPos]=useState(0),[len,setLen]=useState(0),[rate,setRate]=useState(1);
 const dur=(m.content?.duration_ms??0)/1000,h=bars(m.content?.media_id??m.id);
 useEffect(()=>()=>{el.current?.pause();},[]);
 const toggle=()=>{const a=el.current;if(!a)return;if(a.paused){document.querySelectorAll("audio").forEach(x=>{if(x!==a)x.pause();});void a.play();}else a.pause();};
 const total=len>0?len:dur;
 const frac=total?Math.min(1,pos/total):0;
 return <div className={s.vn}>
  <button type="button" className={s.pl} onClick={e=>{e.stopPropagation();toggle();}} disabled={!media} aria-label={playing?(bn?"থামান":"Pause"):(bn?"চালান":"Play")}>{playing?<I n="pause" size={14} fill/>:<I n="play" size={14} fill/>}</button>
  <div className={s.wf} onClick={e=>{e.stopPropagation();const a=el.current;if(!a||!total)return;const r=e.currentTarget.getBoundingClientRect();a.currentTime=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*total;setPos(a.currentTime);}}>{h.map((v,i)=><i key={i} className={i/h.length<frac?s.f:undefined} style={{height:v}}/>)}</div>
  {failed?<button type="button" className={s.vd} title={reasonText(reason,bn)} onClick={e=>{e.stopPropagation();retry();}}>{bn?"আবার চেষ্টা":"Retry"}</button>:<><span className={s.vd}>{mmss(playing||pos>0?pos:dur,bn)}</span>{(playing||pos>0)&&<button type="button" className={s.spd} aria-label="Speed" onClick={e=>{e.stopPropagation();const n=rate===1?1.5:rate===1.5?2:1;setRate(n);if(el.current)el.current.playbackRate=n;}}>{rate}x</button>}</>}
  {media&&<audio ref={el} src={media.url} preload="metadata" onLoadedMetadata={e=>{const d=e.currentTarget.duration;if(Number.isFinite(d)&&d>0)setLen(d);}} onPlay={e=>{e.currentTarget.playbackRate=rate;setPlaying(true);}} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);setPos(0);}} onTimeUpdate={e=>setPos(e.currentTarget.currentTime)}/>}
 </div>;
}

export function Img({m,workspaceId,threadId,bn,className,onOpen}:{m:Msg;workspaceId:string;threadId:string;bn:boolean;className?:string;onOpen?:()=>void}){
 const {media,failed,reason,retry}=useMedia(workspaceId,threadId,m.content?.media_id);
 if(media&&media.mime.startsWith("image/"))return <img className={className} src={media.url} alt={m.content?.name||(bn?"ছবি":"Photo")} onClick={onOpen} draggable={false}/>;
 return <div className={`${s.imgph} ${className??""}`} >{failed?<button type="button" className={s.mfail} onClick={e=>{e.stopPropagation();retry();}}><I n="alt" size={20}/><span>{reasonText(reason,bn)}</span><u>{bn?"আবার চেষ্টা":"Tap to retry"}</u></button>:<span className={s.shimmer}/>}</div>;
}

function VideoBox({m,workspaceId,threadId,bn}:{m:Msg;workspaceId:string;threadId:string;bn:boolean}){
 const {media,failed,reason,retry}=useMedia(workspaceId,threadId,m.content?.media_id);
 if(media&&media.mime.startsWith("video/"))return <video className={s.vid} src={media.url} controls playsInline preload="metadata" onClick={e=>e.stopPropagation()}/>;
 return <div className={s.imgph}>{failed?<button type="button" className={s.mfail} onClick={e=>{e.stopPropagation();retry();}}><I n="alt" size={20}/><span>{reasonText(reason,bn)}</span><u>{bn?"আবার চেষ্টা":"Tap to retry"}</u></button>:<span className={s.shimmer}/>}</div>;
}

function Product({m,workspaceId,threadId,bn}:{m:Msg;workspaceId:string;threadId:string;bn:boolean}){
 const c=m.content??{};const {media}=useMedia(workspaceId,threadId,c.image_media_id);
 return <div className={s.pc}><div className={s.pimg}>{media?.mime.startsWith("image/")?<img src={media.url} alt="" draggable={false}/>:<I n="bag" size={40}/>}</div>
  <div className={s.pi}><b>{m.body||"—"}</b>{c.sizes?<span>{(bn?"সাইজ: ":"Sizes: ")+c.sizes}</span>:null}{typeof c.price_minor==="number"&&<div className={s.pp}>{money(c.price_minor,bn,c.currency)}</div>}</div></div>;
}

const SKIP_KEY="briofold-inbox-download-ok";
const EXT:Record<string,RegExp>={pdf:/^application\/pdf$/,txt:/^text\/plain$/,jpg:/^image\/jpeg$/,jpeg:/^image\/jpeg$/,png:/^image\/png$/,gif:/^image\/gif$/,webp:/^image\/webp$/,mp3:/^audio\//,ogg:/^audio\//,m4a:/^audio\//,aac:/^audio\//,mp4:/^(video|audio)\//};
const inlineMime=/^(application\/pdf|text\/plain|image\/(jpeg|png|gif|webp)|video\/(mp4|webm)|audio\/)/;
function File({m,workspaceId,threadId,bn}:{m:Msg;workspaceId:string;threadId:string;bn:boolean}){
 const [busy,setBusy]=useState(false),[ask,setAsk]=useState<{url:string;name:string;warn:boolean}|null>(null),[never,setNever]=useState(false),[err,setErr]=useState("");
 async function open(){
  if(busy||!m.content?.media_id)return;setBusy(true);setErr("");
  const tab=window.open("","_blank");// opened synchronously so the pop-up blocker allows it
  const r=await loadMedia(workspaceId,threadId,m.content.media_id);setBusy(false);
  if(!r){tab?.close();setErr(reasonText(mediaReasons.get(workspaceId+m.content.media_id)??"",bn));return;}
  const name=m.content.name||"file",ext=name.split(".").pop()?.toLowerCase()??"";
  const warn=!!EXT[ext]&&!EXT[ext].test(r.mime);// extension says one thing, the content is another
  if(inlineMime.test(r.mime)&&!warn&&tab){tab.location.href=r.url;tab.opener=null;return;}
  tab?.close();
  let skip=false;try{skip=localStorage.getItem(SKIP_KEY)==="1";}catch{}
  if(skip&&!warn){save(r.url,name);return;}
  setAsk({url:r.url,name,warn});
 }
 function save(url:string,name:string){const a=document.createElement("a");a.href=url;a.download=name;a.rel="noopener";document.body.appendChild(a);a.click();a.remove();}
 function confirm(){if(!ask)return;if(never&&!ask.warn){try{localStorage.setItem(SKIP_KEY,"1");}catch{}}save(ask.url,ask.name);setAsk(null);}
 const kb=Math.max(1,Math.round((m.content?.size_bytes??0)/1024));
 return <>
  <button type="button" className={s.fileb} onClick={e=>{e.stopPropagation();void open();}}><span className={s.fi}><I n="doc" size={18}/></span><span><b>{m.content?.name||(bn?"ফাইল":"File")}</b><span>{num(kb,bn)} KB{busy?" …":""}{err?` · ${err}`:""}</span></span></button>
  <Sheet open={!!ask} onClose={()=>setAsk(null)} label={bn?"ফাইল ডাউনলোড":"Download file"}>
   <h4>{bn?"এই ফাইল এখানে দেখা যাচ্ছে না":"This file can't be previewed here"}</h4>
   <p className={s.sheetNote}>{ask?.warn?(bn?"সতর্কতা: ফাইলের এক্সটেনশন আর আসল কনটেন্ট মিলছে না। ডাউনলোড করলে ঝুঁকি আপনার।":"Warning: the file extension doesn't match its real content. Download only if you trust the sender — at your own risk."):(bn?"ডাউনলোড করলে ফাইলটি ভাইরাস স্ক্যান করা হয় না। ঝুঁকি আপনার নিজের।":"Downloaded files are not virus-scanned. You download at your own risk.")}</p>
   {!ask?.warn&&<label className={s.dna}><input type="checkbox" checked={never} onChange={e=>setNever(e.target.checked)}/>{bn?"আর দেখাবেন না":"Don't show this again"}</label>}
   <div className={s.dlrow}><button type="button" onClick={()=>setAsk(null)}>{bn?"বাতিল":"Cancel"}</button><button type="button" className={s.dlgo} onClick={confirm}>{bn?"ডাউনলোড":"Download"}</button></div>
  </Sheet>
 </>;
}

const urlRe=/(https?:\/\/[^\s<>]+)/g;
function Text({body}:{body:string}){
 const parts=body.split(urlRe);
 return <>{parts.map((p,i)=>i%2?<a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" onClick={e=>e.stopPropagation()}>{p}</a>:p)}</>;
}

export type RowProps={msg:Msg;album?:Msg[];first:boolean;last:boolean;bn:boolean;workspaceId:string;threadId:string;customerName:string;byId:Map<string,Msg>;selected:boolean;fresh:boolean;flash:boolean;
 onSelect:(id:string,x:number,y:number)=>void;onReply:(m:Msg)=>void;onOpenImages:(list:Msg[],i:number)=>void;onRetry:(m:Msg)=>void;onJump:(id:string)=>void};

function RowImpl(p:RowProps){
 const {msg:m,album,bn}=p,right=m.sender!=="customer",ref=useRef<HTMLDivElement>(null);
 const g=useRef<{x:number;y:number;moved:boolean;hit:boolean;t?:ReturnType<typeof setTimeout>;id:number}|null>(null);
 const bc=()=>ref.current?.querySelector<HTMLElement>("[data-bc]")??null,rp=()=>ref.current?.querySelector<HTMLElement>("[data-rep]")??null;
 function down(e:RPE){if(e.button>0||(e.target as HTMLElement).closest("button,a,audio"))return;ref.current?.classList.add(s.pressing);
  const x=e.clientX,y=e.clientY;g.current={x,y,moved:false,hit:false,id:e.pointerId};
  g.current.t=setTimeout(()=>{if(g.current&&!g.current.moved){ref.current?.classList.remove(s.pressing);g.current=null;p.onSelect(m.id,x,y);if(navigator.vibrate)navigator.vibrate(12);}},430);}
 function move(e:RPE){const k=g.current;if(!k)return;const dx=e.clientX-k.x,dy=e.clientY-k.y;
  if(!k.moved&&Math.abs(dy)>10){clearTimeout(k.t);ref.current?.classList.remove(s.pressing);g.current=null;return;}
  if(Math.abs(dx)>8&&!k.moved){k.moved=true;clearTimeout(k.t);ref.current?.classList.remove(s.pressing);try{ref.current?.setPointerCapture(k.id);}catch{}bc()?.classList.remove(s.back);}
  if(k.moved){const raw=Math.max(0,dx),t=raw<56?raw:56+(raw-56)*.28,b=bc(),r=rp();if(b)b.style.transform=`translateX(${t}px)`;
   if(r){r.style.opacity=String(Math.min(1,Math.max(0,(t-10)/40)));r.style.transform=`scale(${.6+Math.min(.4,t/140)})`;}
   if(t>=56&&!k.hit){k.hit=true;if(navigator.vibrate)navigator.vibrate(10);if(r){r.style.background="var(--cr)";r.style.color="var(--ink)";}}else if(t<56&&k.hit){k.hit=false;if(r){r.style.background="";r.style.color="";}}}}
 function end(){const k=g.current;if(!k)return;clearTimeout(k.t);ref.current?.classList.remove(s.pressing);
  if(k.moved){const b=bc(),r=rp();b?.classList.add(s.back);if(b)b.style.transform="";if(r){r.style.opacity="0";r.style.background="";r.style.color="";}if(k.hit)p.onReply(m);}g.current=null;}
 useEffect(()=>()=>{if(g.current)clearTimeout(g.current.t);},[]);

 const sticker=isSticker(m)&&!m.reply_to,imgs=m.type==="image"?(album??[m]):[];
 const q=m.reply_to?{who:(p.byId.get(m.reply_to)?.sender??"")==="customer"?p.customerName:(p.byId.get(m.reply_to)?.sender==="ai"?"AI":(p.byId.get(m.reply_to)?bn?"আপনি":"You":"")),text:m.reply_body||p.byId.get(m.reply_to)?.body||(bn?"মেসেজ":"Message")}:null;
 const time=clock(m.created_at,bn);
 const meta=<span className={s.mt}>{time}<Ticks m={m} bn={bn} onRetry={p.onRetry}/></span>;
 const tone=m.sender==="ai"?s.ba:right?s.bs:"";
 let inner;
 if(m.type==="unsupported")inner=<div className={`${s.bub} ${tone}`}><span className={s.unsup}>{m.body||(bn?"এই মেসেজটি (ভিডিও/অন্য ফাইল) এখানে দেখানো যায়নি — চ্যানেল অ্যাপে দেখুন":"This message (video or another attachment) can't be shown here — open it in the channel app")}</span>{meta}</div>;
 else if((m.type as string)==="video")inner=<div className={`${s.bub} ${s.im} ${tone}`}>{q&&<Quote q={q} onClick={()=>m.reply_to&&p.onJump(m.reply_to)}/>}<div className={s.imgw}><VideoBox m={m} workspaceId={p.workspaceId} threadId={p.threadId} bn={bn}/><span className={s.ovm}>{time}<Ticks m={m} bn={bn} onRetry={p.onRetry}/></span></div>{m.body&&<div className={s.cap}><Text body={m.body}/></div>}</div>;
 else if((m.type as string)==="sticker")inner=<><div className={s.stkimg}><Img m={m} workspaceId={p.workspaceId} threadId={p.threadId} bn={bn}/></div><div className={s.mrow}>{meta}</div></>;
 else if(sticker)inner=<><div className={s.stk}>{m.body.trim()}</div><div className={s.mrow}>{meta}</div></>;
 else if(imgs.length){
  const n=imgs.length,shown=Math.min(n,4),cls=n===1?"":n===2?s.g2:n===3?s.g3:s.g4;
  inner=<div className={`${s.bub} ${s.im} ${tone}`}>
   {q&&<Quote q={q} onClick={()=>m.reply_to&&p.onJump(m.reply_to)}/>}
   {n===1?<div className={s.imgw}><Img m={m} workspaceId={p.workspaceId} threadId={p.threadId} bn={bn} onOpen={()=>p.onOpenImages(imgs,0)}/><span className={s.ovm}>{time}<Ticks m={m} bn={bn} onRetry={p.onRetry}/></span></div>
   :<div className={`${s.gw} ${cls} ${s.imgw}`}>{imgs.slice(0,shown).map((x,i)=><div key={x.id} className={s.gt} onClick={()=>p.onOpenImages(imgs,i)}><Img m={x} workspaceId={p.workspaceId} threadId={p.threadId} bn={bn}/>{i===3&&n>4&&<div className={s.more}>+{num(n-3,bn)}</div>}</div>)}<span className={s.ovm}>{time}<Ticks m={m} bn={bn} onRetry={p.onRetry}/></span></div>}
   {m.body&&n===1&&<div className={s.cap}><Text body={m.body}/></div>}
  </div>;
 }
 else if(m.type==="audio")inner=<div className={`${s.bub} ${tone}`}>{q&&<Quote q={q} onClick={()=>m.reply_to&&p.onJump(m.reply_to)}/>}<Voice m={m} workspaceId={p.workspaceId} threadId={p.threadId} bn={bn}/><div className={s.mrow}>{meta}</div></div>;
 else if(m.type==="document")inner=<div className={`${s.bub} ${tone}`}>{q&&<Quote q={q} onClick={()=>m.reply_to&&p.onJump(m.reply_to)}/>}<File m={m} workspaceId={p.workspaceId} threadId={p.threadId} bn={bn}/><div className={s.mrow}>{meta}</div></div>;
 else if(m.type==="product")inner=<div className={`${s.bub} ${s.pcb} ${tone}`}><Product m={m} workspaceId={p.workspaceId} threadId={p.threadId} bn={bn}/><div className={s.mrow}>{meta}</div></div>;
 else inner=<div className={`${s.bub} ${tone}`}>{q&&<Quote q={q} onClick={()=>m.reply_to&&p.onJump(m.reply_to)}/>}<Text body={m.body}/>{meta}</div>;

 return <div ref={ref} data-mid={m.id} className={`${s.mr} ${right?s.r:s.l} ${p.first?s.first:""} ${p.last?s.last:""} ${p.selected?s.sel:""} ${p.flash?s.flash:""} ${p.fresh?`${s.fresh} ${right?s.out:s.in}`:""}`}
  onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onContextMenu={e=>{e.preventDefault();p.onSelect(m.id,e.clientX,e.clientY);}}>
  <span className={s.rep} data-rep><I n="rep" size={16}/></span>
  <div className={s.bc} data-bc>
   {p.first&&right&&<span className={s.who}>{m.sender==="ai"?"AI":bn?"আপনি":"You"}</span>}
   {inner}
   {m.reaction&&<span className={s.rx}>{m.reaction}</span>}
  </div>
 </div>;
}
function Quote({q,onClick}:{q:{who:string;text:string};onClick:()=>void}){return <div className={s.qt} onClick={e=>{e.stopPropagation();onClick();}}>{q.who&&<b>{q.who}</b>}<span>{q.text}</span></div>;}
export const MessageRow=memo(RowImpl,(a,b)=>a.msg===b.msg&&a.album===b.album&&a.first===b.first&&a.last===b.last&&a.selected===b.selected&&a.flash===b.flash&&a.fresh===b.fresh&&a.bn===b.bn&&a.customerName===b.customerName&&a.byId.get(a.msg.reply_to??"")===b.byId.get(b.msg.reply_to??""));
