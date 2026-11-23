// Neutral loader for customer checkout pages: no theme chrome, so the page
// never shows one design and then switches to another (owner, 2026-11-23).
export function CheckoutLoading({bn}:{bn:boolean}){
 return <main data-customer-checkout="true" role="status" aria-live="polite"
  style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#F4F5F7",color:"#5B6070",font:"500 14px/1.4 system-ui,sans-serif"}}>
  <div style={{display:"grid",justifyItems:"center",gap:12}}>
   <span aria-hidden="true" style={{width:28,height:28,borderRadius:"50%",border:"3px solid #D9DCE3",borderTopColor:"#15161C",animation:"bf-spin .8s linear infinite"}}/>
   <span>{bn?"পেমেন্ট লোড হচ্ছে…":"Loading payment…"}</span>
  </div>
  <style>{"@keyframes bf-spin{to{transform:rotate(360deg)}}"}</style>
 </main>;
}
