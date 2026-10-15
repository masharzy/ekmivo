"use client";

export type PaymentLinkRow={id:string;reference:string;status:string;version:number;amount_minor:number;paid_minor:number;public_token?:string;body:{description?:string;expires_at?:string;max_uses?:number}};
export function LinkIcon({type="link"}:{type?:"link"|"plus"|"copy"|"open"}){
 return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{type==="plus"?<path d="M12 5v14M5 12h14"/>:type==="copy"?<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></>:type==="open"?<><path d="M14 4h6v6M20 4 10 14M10 4H4v16h16v-6"/></>:<><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0) scale(.9)"/></>}</svg>;
}
export function paymentLinkState(row:PaymentLinkRow,now:number){return row.status==="active"&&row.body.expires_at&&Date.parse(row.body.expires_at)<=now?"expired":row.status}
export function PaymentLinkCards({rows,now,locale,busy,onCopy,onView}:{rows:PaymentLinkRow[];now:number;locale:"en"|"bn";workspaceId:string;environment:string;busy:boolean;canWrite:boolean;onEdit:(row:PaymentLinkRow)=>void;onPublish:(row:PaymentLinkRow)=>void;onArchive:(row:PaymentLinkRow)=>void;onCopy:(url:string)=>void;onView?:(row:PaymentLinkRow)=>void}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const labels:Record<string,string>={active:t("Active","সক্রিয়"),expired:t("Expired","মেয়াদ শেষ"),archived:t("Archived","আর্কাইভ"),draft:t("Draft","খসড়া")};
 const money=(v:number)=>new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{style:"currency",currency:"BDT"}).format(v/100);
 return <div className="ekv2-links-table opw-scroll" role="region" tabIndex={0} aria-label={t("Payment links","পেমেন্ট লিংক")}>
  <table><thead><tr><th>{t("Reference","রেফারেন্স")}</th><th>{t("Amount","পরিমাণ")}</th><th>{t("Received","প্রাপ্ত")}</th><th>{t("Status","অবস্থা")}</th><th>{t("Expires","মেয়াদ")}</th><th>{t("Action","অ্যাকশন")}</th></tr></thead>
   <tbody>{rows.map(row=>{const state=paymentLinkState(row,now),publicPath=row.public_token?`/${locale}/pay/${row.public_token}`:null;return <tr key={row.id} className="ekv2-clickable-row" tabIndex={0} onClick={()=>onView?.(row)} onKeyDown={e=>{if((e.key==="Enter"||e.key===" ")&&e.target===e.currentTarget){e.preventDefault();onView?.(row)}}} aria-label={t("View link","লিংক দেখুন")+" "+row.reference}>
    <td><strong className="ekv2-table-name">{row.reference}</strong>{row.body.description&&<small className="ekv2-row-meta">{row.body.description}</small>}</td>
    <td className="opw-num">{money(row.amount_minor)}</td>
    <td className="opw-num">{money(row.paid_minor)}</td>
    <td><span className="pl-status" data-state={state}>{labels[state]||state}</span></td>
    <td>{row.body.expires_at?new Date(row.body.expires_at).toLocaleDateString(locale==="bn"?"bn-BD":"en-BD"):t("No expiry","মেয়াদ নেই")}</td>
    <td className="ekv2-row-actions">{publicPath&&state==="active"&&<button type="button" disabled={busy} onClick={e=>{e.stopPropagation();onCopy(publicPath)}}>{t("Copy","কপি")}</button>}<button type="button" onClick={e=>{e.stopPropagation();onView?.(row)}}>{t("Details","বিস্তারিত")}</button></td>
   </tr>})}</tbody>
  </table>
 </div>;
}
