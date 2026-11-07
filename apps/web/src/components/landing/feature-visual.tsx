/** Product-shaped illustrations. All records are fictional and never read merchant data. */
type VisualProps = {kind: string; chips: readonly string[]; locale: "bn" | "en"};

const iconByKind: Record<string, string> = {
 channels:"◉",inbox:"☷",intelligence:"✺",knowledge:"▤",crm:"↗",handover:"⇄",
 catalog:"▦",payments:"✓",fulfilment:"↗",integrations:"⌘",booking:"◷",devices:"▣",analytics:"▥"
};
const sample = {
 en:{illustration:"INTERFACE CONCEPT",online:"Preview mode",message:"Could you help with an order?",reply:"Of course. Let's check the catalog.",name:"Customer conversation",waiting:"Needs attention",takeover:"Human takes over",agent:"Assistant paused",sampleOrder:"Sample order",variant:"Navy · M",qty:"1 item",matched:"Evidence matched",notLive:"Example only",next:"Next action",status:"In progress",draft:"Answer draft",knowledge:"Source linked",confirm:"Review before publish",today:"Today",slot:"Available slot",labels:["New lead","Contacted","Qualified","Confirmed"],channels:"CONNECTED CHANNELS",total:"Example overview",history:"Activity history"},
 bn:{illustration:"ইন্টারফেসের নমুনা",online:"প্রিভিউ মোড",message:"একটা অর্ডারে সাহায্য করবেন?",reply:"অবশ্যই। পণ্যতালিকা দেখে নিই।",name:"কাস্টমারের কথোপকথন",waiting:"দেখা প্রয়োজন",takeover:"মানুষ দায়িত্ব নিলেন",agent:"AI বিরতিতে",sampleOrder:"নমুনা অর্ডার",variant:"নেভি · M",qty:"১টি পণ্য",matched:"প্রমাণ মিলেছে",notLive:"শুধুই উদাহরণ",next:"পরের কাজ",status:"চলমান",draft:"উত্তরের খসড়া",knowledge:"তথ্যসূত্র যুক্ত",confirm:"প্রকাশের আগে যাচাই",today:"আজ",slot:"খালি সময়",labels:["নতুন লিড","যোগাযোগ","যোগ্য লিড","নিশ্চিত"],channels:"সংযুক্ত চ্যানেল",total:"নমুনা সারাংশ",history:"কাজের ইতিহাস"}
} as const;

export function FeatureVisual({kind,chips,locale}:VisualProps) {
 const t=sample[locale];
 return <div className="v3-feature-visual" aria-label={t.illustration}>
   <div className="v3-visual-top"><span className="v3-leds"><i/><i/><i/></span><span>{t.illustration}</span><span className="v3-visual-live"><i/>{t.online}</span></div>
   <div className="v3-visual-body">
    {(kind==="channels"||kind==="integrations") && <div className="v3-network">
      <div className="v3-network-hub"><span>e.</span><small>BRIOFOLD</small></div>
      {chips.slice(0,5).map((ch,i)=><div className={`v3-network-node node-${i}`} key={ch}><span className="v3-network-ping"/>{ch}</div>)}
      <div className="v3-network-caption">{t.channels} <span>↔</span></div>
    </div>}
    {(kind==="inbox"||kind==="intelligence"||kind==="handover") && <div className="v3-inbox-mock">
      <div className="v3-inbox-sidebar"><div className="v3-inbox-search"/>{[0,1,2,3].map(i=><div key={i} className={`v3-inbox-item ${i===0?"active":""}`}><i/><div><b/><span/></div></div>)}</div>
      <div className="v3-inbox-thread"><div className="v3-thread-heading"><b>{t.name}</b><span>{kind==="handover"?t.waiting:"●"}</span></div>
      <p className="v3-bubble incoming">{t.message}</p><p className="v3-bubble outgoing">{kind==="handover"?t.takeover:t.reply}</p>
      <div className="v3-thread-footer"><span>{kind==="handover"?t.agent:kind==="intelligence"?"বাংলা / EN / Banglish":t.status}</span><span>↗</span></div></div>
    </div>}
    {kind==="knowledge"&& <div className="v3-knowledge-mock"><div className="v3-doc-stack"><span>PDF</span><span>DOC</span><span>URL</span></div><div className="v3-knowledge-arrow">↓</div><div className="v3-knowledge-box"><small>{t.draft}</small><p>{t.reply}</p><span>✓ {t.knowledge}</span></div><div className="v3-knowledge-bottom">◉ {t.confirm}</div></div>}
    {kind==="crm"&&<div className="v3-crm-mock"><div className="v3-pipeline-title">{t.history}<span>↗</span></div><div className="v3-pipeline">{t.labels.map((label,i)=><div className="v3-pipe" key={label}><small>{label}</small><span className="v3-pipe-card"><i/>{["01","02","03","04"][i]}</span></div>)}</div></div>}
    {kind==="catalog"&&<div className="v3-catalog-mock"><div className="v3-catalog-title"><span>◫</span><div><b>{t.sampleOrder}</b><small>{t.variant}</small></div><span className="v3-visual-ok">✓</span></div><div className="v3-stock-row"><span>SKU-NV-M</span><b>{t.qty}</b></div><div className="v3-stock-bars">{[54,78,43,88,65,37,91,59].map((v,i)=><i key={i} style={{height:`${v}%`}}/>)}</div><div className="v3-stock-bottom"><span>CATALOG</span><span>STOCK</span><span>ORDERS</span></div></div>}
    {kind==="payments"&&<div className="v3-pay-mock"><div className="v3-pay-icon">✓</div><h4>{t.matched}</h4><div className="v3-pay-rows">{chips.slice(0,5).map(ch=><p key={ch}><span>✓</span>{ch}<i/></p>)}</div><small>{t.notLive}</small></div>}
    {kind==="fulfilment"&&<div className="v3-delivery-mock"><div className="v3-delivery-path">{chips.map((c,i)=><div className="v3-delivery-stop" key={c}><div className={i<2?"done":""}>{i<2?"✓":i+1}</div><small>{c}</small></div>)}</div><div className="v3-delivery-footer"><span>ORDER → COURIER</span><span>{t.status}</span></div></div>}
    {kind==="booking"&&<div className="v3-booking-mock"><div className="v3-calendar-head"><b>{t.today}</b><span>← &nbsp; →</span></div><div className="v3-calendar-grid">{Array.from({length:21},(_,i)=><span className={i===10?"active":""} key={i}>{i+1}</span>)}</div><div className="v3-booking-slot"><span>◷</span>{t.slot}<b>↗</b></div></div>}
    {kind==="devices"&&<div className="v3-device-mock"><div className="v3-device-web"><span className="v3-device-top">BRIOFOLD / WEB</span><div className="v3-device-grid"><span/><span/><span/><span/></div></div><div className="v3-device-phone"><span/><div><b>e.</b><i/><i/><i/></div><span/></div><div className="v3-device-label">WEB ↔ MOBILE</div></div>}
    {kind==="analytics"&&<div className="v3-analytics-mock"><div className="v3-analytics-header"><small>{t.total}</small><span>↗</span></div><div className="v3-chart-bars">{[35,57,48,74,52,89,65,95,75,90,67,82].map((v,i)=><span key={i} style={{height:`${v}%`}}/>)}</div><div className="v3-analytics-bottom">{chips.slice(0,3).map(ch=><span key={ch}>{ch}</span>)}</div></div>}
   </div>
   <div className="v3-visual-foot"><span>{iconByKind[kind]??"◉"} &nbsp;{chips[0]}</span><span>EK / PREVIEW</span></div>
 </div>;
}
