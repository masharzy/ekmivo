"use client";
import {merchantStatusLabel} from "../lib/dashboard-status-labels";
import {useEffect,useRef,useState,type MouseEvent} from "react";
import {createPortal} from "react-dom";

export type PaymentLinkRow={id:string;reference:string;status:string;version:number;amount_minor:number;paid_minor:number;public_token?:string;body:{description?:string;expires_at?:string;max_uses?:number}};
export function LinkIcon({type="link"}:{type?:"link"|"plus"|"copy"|"open"}){
 return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{type==="plus"?<path d="M12 5v14M5 12h14"/>:type==="copy"?<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></>:type==="open"?<><path d="M14 4h6v6M20 4 10 14M10 4H4v16h16v-6"/></>:<><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0) scale(.9)"/></>}</svg>;
}
export function paymentLinkState(row:PaymentLinkRow,now:number){return row.status==="active"&&row.body.expires_at&&Date.parse(row.body.expires_at)<=now?"expired":row.status}
export function PaymentLinkCards({rows,now,locale,busy,onCopy,onView,onEdit,onArchive,onDelete,onDuplicate,canWrite}:{rows:PaymentLinkRow[];now:number;locale:"en"|"bn";workspaceId:string;environment:string;busy:boolean;canWrite:boolean;onEdit:(row:PaymentLinkRow)=>void;onPublish:(row:PaymentLinkRow)=>void;onArchive:(row:PaymentLinkRow)=>void;onCopy:(url:string)=>void;onView?:(row:PaymentLinkRow)=>void;onDelete?:(row:PaymentLinkRow)=>void;onDuplicate?:(row:PaymentLinkRow)=>void}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const [menuId,setMenuId]=useState<string|null>(null);
 const [menuPosition,setMenuPosition]=useState<{top:number;left:number}|null>(null);
 const menuRef=useRef<HTMLDivElement>(null),popoverRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const dismiss=(e:PointerEvent)=>{if(!menuRef.current?.contains(e.target as Node)&&!popoverRef.current?.contains(e.target as Node))setMenuId(null)};
  const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setMenuId(null)};
  const scrolled=()=>setMenuId(null);
  document.addEventListener("pointerdown",dismiss);
  document.addEventListener("keydown",escape);
  window.addEventListener("resize",scrolled);
  window.addEventListener("scroll",scrolled,true);
  return()=>{document.removeEventListener("pointerdown",dismiss);document.removeEventListener("keydown",escape);window.removeEventListener("resize",scrolled);window.removeEventListener("scroll",scrolled,true)};
 },[]);
 function toggleMenu(rowId:string,event:MouseEvent<HTMLButtonElement>){
  if(menuId===rowId){setMenuId(null);return}
  const bounds=event.currentTarget.getBoundingClientRect(),popupHeight=285,popupWidth=192;
  setMenuPosition({top:bounds.bottom+popupHeight+8>window.innerHeight?Math.max(8,bounds.top-popupHeight-4):bounds.bottom+5,left:Math.max(8,Math.min(window.innerWidth-popupWidth-8,bounds.right-popupWidth))});
  setMenuId(rowId);
 }
 const money=(v:number)=>"BDT "+new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-GB",{minimumFractionDigits:2,maximumFractionDigits:2}).format(v/100);
 return <div className="ekv2-links-table opw-scroll" role="region" tabIndex={0} aria-label={t("Payment links","পেমেন্ট লিংক")}>
  <table><thead><tr><th>{t("Reference","রেফারেন্স")}</th><th className="opw-num">{t("Amount","পরিমাণ")}</th><th className="opw-num">{t("Received","প্রাপ্ত")}</th><th>{t("Status","অবস্থা")}</th><th>{t("Expires","মেয়াদ")}</th><th>{t("Action","অ্যাকশন")}</th></tr></thead>
   <tbody>{rows.map(row=>{const state=paymentLinkState(row,now),publicPath=row.public_token?`/${locale}/pay/${row.public_token}`:null;return <tr key={row.id} className="ekv2-clickable-row" tabIndex={0} onClick={()=>onView?.(row)} onKeyDown={e=>{if((e.key==="Enter"||e.key===" ")&&e.target===e.currentTarget){e.preventDefault();onView?.(row)}}} aria-label={t("View link","লিংক দেখুন")+" "+row.reference}>
    <td><strong className="ekv2-table-name" title={row.reference}>{row.reference.length>30?row.reference.slice(0,26)+"…":row.reference}</strong>{row.body.description&&<small className="ekv2-row-meta">{row.body.description}</small>}</td>
    <td className="opw-num">{money(row.amount_minor)}</td>
    <td className="opw-num">{money(row.paid_minor)}</td>
    <td><span className="pl-status ekv3-status" data-state={state} data-tone={state==="active"?"success":state==="expired"?"warning":"neutral"}>{merchantStatusLabel("link",state,locale)}</span></td>
    <td>{row.body.expires_at?new Date(row.body.expires_at).toLocaleDateString(locale==="bn"?"bn-BD":"en-BD",{day:"numeric",month:"short",year:"numeric"}):t("No expiry","মেয়াদ নেই")}</td>
    <td className="ekv2-row-actions"><div className="ekv3-row-menu" ref={menuId===row.id?menuRef:undefined} onClick={e=>e.stopPropagation()}><button type="button" className="ekv3-row-trigger" aria-label={t("Link actions","লিংকের অপশন")} aria-expanded={menuId===row.id} onClick={event=>toggleMenu(row.id,event)}>⋯</button>
    {menuId===row.id&&menuPosition&&createPortal(<div ref={popoverRef} className="ekv3-row-popover ekv3-portal-menu" role="menu" style={{position:"fixed",top:menuPosition.top,left:menuPosition.left}} onClick={e=>e.stopPropagation()}>{publicPath&&<><a role="menuitem" href={publicPath} target="_blank" rel="noopener noreferrer" onClick={()=>setMenuId(null)}>{t("Open checkout","চেকআউট খুলুন")}</a><button type="button" role="menuitem" disabled={busy} onClick={()=>{onCopy(publicPath);setMenuId(null)}}>{t("Copy link","লিংক কপি")}</button></>}
    <hr/><button type="button" role="menuitem" disabled={!canWrite||busy} onClick={()=>{onEdit(row);setMenuId(null)}}>{t("Edit","সম্পাদনা")}</button><button type="button" role="menuitem" disabled={!canWrite||!onDuplicate||busy} onClick={()=>{onDuplicate?.(row);setMenuId(null)}}>{t("Duplicate","ডুপ্লিকেট")}</button><button type="button" role="menuitem" disabled={!canWrite||busy} onClick={()=>{onArchive(row);setMenuId(null)}}>{t("Archive","আর্কাইভ")}</button>
    <hr/><button type="button" role="menuitem" className="ekv3-danger-menu" disabled={!canWrite||!onDelete||busy} onClick={()=>{onDelete?.(row);setMenuId(null)}}>{t("Delete","মুছুন")}</button></div>,document.body)}</div></td>
   </tr>})}</tbody>
  </table>
 </div>;
}
