// Standard Code 39 narrow/wide symbols for hexadecimal UUIDs. The scanner
// returns the order ID, which is reauthorized by the normal order read path.
const encodings=[0x034,0x121,0x061,0x160,0x031,0x130,0x070,0x025,0x124,0x064,0x109,0x049,0x148,0x019,0x118,0x058];
export function OrderBarcode({value}:{value:string}){
 const text=value.toUpperCase();if(!/^[0-9A-F-]{36}$/.test(text))return null;
 let x=20;const bars:{x:number;width:number}[]=[];
 for(const ch of `*${text}*`){const pattern=ch==='*'?0x094:ch==='-'?0x085:encodings[parseInt(ch,16)];for(let i=0;i<9;i++){const width=pattern&(1<<(8-i))?5:2;if(i%2===0)bars.push({x,width});x+=width;}x+=2;}
 return <svg role="img" aria-label={`Order barcode ${value}`} viewBox={`0 0 ${x+20} 70`} width="100%" height="70" preserveAspectRatio="xMinYMid meet"><rect width={x+20} height={70} fill="white"/>{bars.map(b=><rect key={b.x} x={b.x} y={5} width={b.width} height={60} fill="black"/>)}</svg>;
}
