import type {CSSProperties} from "react";
const p={
 act:"M22 12h-4l-3 9L9 3l-3 9H2",set:"M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0",msg:"M4 5h16v11H9l-5 4z",
 wa:"M12 4a8 8 0 00-6.9 12L4 20l4.1-1.1A8 8 0 1012 4zM9.5 9.5c.3 2 2.5 4.2 4.5 4.5",ig:"M16.5 7.5h0M9 5h6a4 4 0 014 4v6a4 4 0 01-4 4H9a4 4 0 01-4-4V9a4 4 0 014-4zM12 8.8a3.2 3.2 0 100 6.4 3.2 3.2 0 000-6.4z",ms:"M13 3L6 13h5l-1 8 7-10h-5z",web:"M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
 back:"M15 5l-7 7 7 7",snd:"M5 12h14M13 6l6 6-6 6",flt:"M4 6h16M7 12h10M10 18h4",alt:"M12 4l9 16H3zM12 10v4M12 17h0",clip:"M20 11l-8 8a5 5 0 01-7-7l8-8a3.5 3.5 0 015 5l-8 8a2 2 0 01-3-3l7-7",
 cam:"M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z",mic:"M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3",chk:"M5 12l5 5 9-10",x:"M6 6l12 12M18 6L6 18",
 rep:"M9 7L4 12l5 5M4 12h10a6 6 0 016 6v1",fwd:"M15 7l5 5-5 5M20 12H10a6 6 0 00-6 6v1",copy:"M8 8h10a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-8a2 2 0 012-2zM16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2",
 info:"M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 8h0",play:"M8 5l11 7-11 7z",lk:"M7 11h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2zM8 11V8a4 4 0 018 0v3",lko:"M7 11h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2zM8 11V8a4 4 0 017.6-1.8",
 cu:"M6 15l6-6 6 6",pause:"M8 5v14M16 5v14",img:"M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM9 8.4a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2zM3 17l5-4 4 3 3-2 6 4",
 doc:"M7 3h8l4 4v14H7zM14 3v5h5",bag:"M5 8h14l-1 12H6zM9 8a3 3 0 016 0",clk:"M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2",trash:"M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
 more:"M5 12h0M12 12h0M19 12h0",plus:"M12 5v14M5 12h14",search:"M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",tools:"M14.7 6.3a4 4 0 005 5L21 13l-8 8-3-3 8-8-1.3-1.3zM3 21l5-5",
 down:"M6 9l6 6 6-6",download:"M12 4v11M7 11l5 5 5-5M5 20h14",ext:"M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"
} as const;
export type IconName=keyof typeof p;
export function I({n,size=20,fill,style,className}:{n:IconName;size?:number;fill?:boolean;style?:CSSProperties;className?:string}){
 return <svg viewBox="0 0 24 24" width={size} height={size} fill={fill?"currentColor":"none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex:"none",...style}} className={className}><path d={p[n]}/></svg>;
}
export function ChannelBadge({channel,size=18}:{channel:string;size?:number}){
 const color=({ms:"#0A7CFF",ig:"#D6307A",wa:"#1FA855",web:"#6B6A64"} as Record<string,string>)[channel]??"#6B6A64";
 const n=(channel==="ms"||channel==="ig"||channel==="wa"||channel==="web"?channel:"web") as IconName;
 return <span style={{position:"absolute",right:-3,bottom:-3,width:size,height:size,borderRadius:"50%",border:"2px solid var(--bg)",background:color,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}><I n={n} size={Math.round(size*.55)} style={{strokeWidth:2.2}}/></span>;
}
