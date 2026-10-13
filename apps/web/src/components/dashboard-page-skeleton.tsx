"use client";
import {usePathname} from "next/navigation";
import {useInterfaceLocale} from "./interface-locale-provider";
import {sections,type SectionKey} from "../lib/dashboard-sections";
import {moduleViews} from "../lib/dashboard-views";

export function DashboardPageSkeleton({targetSection}:{targetSection?:SectionKey}={}){
 const pathname=usePathname(),locale=useInterfaceLocale();
 const candidate=pathname.match(/\/(?:bn\/|en\/)?w\/[^/]+\/(?:ai|payments)\/([^/?#]+)/)?.[1]??"overview";
 const section=targetSection??(Object.hasOwn(sections,candidate)?candidate:"overview") as SectionKey;
 const view=moduleViews[section];
 return <section className="ds-page-skeleton" role="status" aria-busy="true" aria-label={locale==="bn"?"পৃষ্ঠা লোড হচ্ছে":"Loading page"}>
  <div className="ds-page-heading"><div><div className="ds-skeleton-line ds-skeleton-short" aria-hidden="true"/><h1>{section==="overview"?(locale==="bn"?"আপনার কাজের সারসংক্ষেপ":"Your working overview"):sections[section][locale]}</h1><div className="ds-skeleton-line" aria-hidden="true"/></div></div>
  <div aria-hidden="true">
   {section==="overview"?<><div className="ds-metrics">{[0,1,2,3].map(i=><article key={i}><div className="ds-skeleton-line"/><div className="ds-skeleton-block"/><div className="ds-skeleton-line ds-skeleton-short"/></article>)}</div><div className="ds-panel ds-skeleton-panel"><div className="ds-skeleton-line"/><div className="ds-setup-grid">{[0,1,2,3].map(i=><div key={i} className="ds-skeleton-block"/>)}</div></div></>:section==="developers"?<div className="ds-panel ds-skeleton-panel"><div className="ds-skeleton-line"/><div className="ds-skeleton-line"/><div className="ds-skeleton-line ds-skeleton-short"/><div className="ds-skeleton-block"/><div className="ds-skeleton-block"/></div>:<div className="ds-panel ds-skeleton-panel"><div className="ds-skeleton-line"/>{view?.columns.length?<div className="ds-skeleton-table">{[0,1,2,3].map(i=><div className="ds-skeleton-line" key={i}/>)}</div>:<div className="ds-skeleton-block ds-skeleton-tall"/>}</div>}
  </div>
  <span className="sr-only">{locale==="bn"?"অনুমোদিত পৃষ্ঠার তথ্য লোড হচ্ছে।":"Loading authorized page content."}</span>
 </section>;
}
