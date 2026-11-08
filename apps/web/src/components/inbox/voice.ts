/* Voice-note capture. Chrome records WebM/Opus, but the Inbox accepts Ogg/Opus, MP3, AAC and MP4 audio only.
   Opus packets are copied unchanged from WebM into an Ogg container, so no re-encoding (and no quality loss) happens. */
export type RecorderChoice={mime:string;remux:boolean};
export function chooseRecorder():RecorderChoice|null{
 if(typeof MediaRecorder==="undefined")return null;
 const ok=(m:string)=>{try{return MediaRecorder.isTypeSupported(m);}catch{return false;}};
 if(ok("audio/ogg;codecs=opus"))return {mime:"audio/ogg;codecs=opus",remux:false};
 if(ok("audio/mp4"))return {mime:"audio/mp4",remux:false};
 if(ok("audio/webm;codecs=opus"))return {mime:"audio/webm;codecs=opus",remux:true};
 return null;
}

const crcTable=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let r=i<<24;for(let j=0;j<8;j++)r=(r&0x80000000)?((r<<1)^0x04c11db7):(r<<1);t[i]=r>>>0;}return t;})();
function crc32(data:Uint8Array){let c=0;for(let i=0;i<data.length;i++)c=((c<<8)^crcTable[((c>>>24)^data[i])&0xff])>>>0;return c>>>0;}

function vint(b:Uint8Array,p:number,keepMarker:boolean){
 const first=b[p];if(first===undefined||first===0)return null;let len=1,mask=0x80;while(!(first&mask)){len++;mask>>=1;}
 if(p+len>b.length)return null;let v=keepMarker?first:first&(mask-1);let unknown=(first&(mask-1))===mask-1;
 for(let i=1;i<len;i++){v=v*256+b[p+i];if(b[p+i]!==0xff)unknown=false;}
 return {value:v,len,unknown};
}
const enter=new Set([0x18538067,0x1f43b675,0x1654ae6b,0xae,0xa0]);
export function extractOpus(webm:Uint8Array){
 const packets:Uint8Array[]=[];let head:Uint8Array|null=null,p=0;
 while(p<webm.length){
  const id=vint(webm,p,true);if(!id)break;const size=vint(webm,p+id.len,false);if(!size)break;
  const start=p+id.len+size.len;
  if(enter.has(id.value)){p=start;continue;}
  const end=size.unknown?webm.length:Math.min(webm.length,start+size.value);
  if(id.value===0x63a2&&!head)head=webm.slice(start,end);
  else if(id.value===0xa3||id.value===0xa1){const t=vint(webm,start,false);if(t){const frame=start+t.len+3;if(frame<end)packets.push(webm.slice(frame,end));}}
  p=end;
 }
 return {head,packets};
}
function packetSamples(pkt:Uint8Array){
 const toc=pkt[0],config=toc>>3,c=toc&3;let ms:number;
 if(config<12)ms=[10,20,40,60][config%4];else if(config<16)ms=[10,20][config%2];else ms=[2.5,5,10,20][config%4];
 const frames=c===0?1:c===3?(pkt[1]??1)&0x3f:2;
 return Math.round(ms*48*frames);
}
function page(type:number,granule:number,serial:number,seq:number,packets:Uint8Array[]){
 const lacing:number[]=[];for(const k of packets){let n=k.length;while(n>=255){lacing.push(255);n-=255;}lacing.push(n);}
 const body=packets.reduce((a,k)=>a+k.length,0),out=new Uint8Array(27+lacing.length+body),v=new DataView(out.buffer);
 out.set([0x4f,0x67,0x67,0x53,0,type]);
 v.setUint32(6,granule>>>0,true);v.setUint32(10,Math.floor(granule/4294967296),true);v.setUint32(14,serial,true);v.setUint32(18,seq,true);out[26]=lacing.length;out.set(lacing,27);
 let o=27+lacing.length;for(const k of packets){out.set(k,o);o+=k.length;}
 v.setUint32(22,crc32(out),true);return out;
}
export function webmToOgg(webm:Uint8Array):{ogg:Uint8Array;durationMs:number}|null{
 const {head,packets}=extractOpus(webm);if(!packets.length)return null;
 let opusHead=head&&head.length>=19&&String.fromCharCode(...head.slice(0,8))==="OpusHead"?head:null;
 if(!opusHead){opusHead=new Uint8Array(19);opusHead.set([0x4f,0x70,0x75,0x73,0x48,0x65,0x61,0x64,1,1,0x38,0x01,0x80,0xbb,0,0,0,0,0]);}
 const pre=opusHead[10]|(opusHead[11]<<8),serial=(Math.random()*0xffffffff)>>>0;
 const tags=new TextEncoder().encode("OpusTags");const vendor=new TextEncoder().encode("briofold");
 const tagBody=new Uint8Array(8+4+vendor.length+4);tagBody.set(tags);new DataView(tagBody.buffer).setUint32(8,vendor.length,true);tagBody.set(vendor,12);
 const pages:Uint8Array[]=[page(2,0,serial,0,[opusHead]),page(0,0,serial,1,[tagBody])];
 let seq=2,total=pre,group:Uint8Array[]=[],segs=0;
 const flush=(last:boolean)=>{if(!group.length)return;pages.push(page(last?4:0,total,serial,seq++,group));group=[];segs=0;};
 for(let i=0;i<packets.length;i++){
  const k=packets[i],need=Math.floor(k.length/255)+1;
  if(segs+need>255||group.length>=25)flush(false);
  group.push(k);segs+=need;total+=packetSamples(k);
  if(i===packets.length-1)flush(true);
 }
 const size=pages.reduce((a,x)=>a+x.length,0),ogg=new Uint8Array(size);let o=0;for(const x of pages){ogg.set(x,o);o+=x.length;}
 return {ogg,durationMs:Math.round((total-pre)/48)};
}
export async function finishRecording(parts:Blob[],choice:RecorderChoice,elapsedMs:number):Promise<{blob:Blob;mime:string;durationMs:number}|null>{
 const raw=new Blob(parts,{type:choice.mime});if(!raw.size)return null;
 if(!choice.remux)return {blob:raw,mime:choice.mime.split(";")[0],durationMs:elapsedMs};
 const out=webmToOgg(new Uint8Array(await raw.arrayBuffer()));if(!out)return null;
 return {blob:new Blob([out.ogg as BlobPart],{type:"audio/ogg"}),mime:"audio/ogg",durationMs:out.durationMs||elapsedMs};
}
