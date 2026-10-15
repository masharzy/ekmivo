import {headers} from "next/headers";
export default async function LoadingWorkspaces(){
 const h=await headers(),bn=h.get("x-ekmivo-locale")!=="en";
 return <main className="wk2-root" lang={bn?"bn":"en"}><header className="wk2-header"><span className="wk2-logo">ekmivo</span><div className="wk2-header-right"><span className="wk2-skeleton-control"/><span className="wk2-skeleton-control wk2-skeleton-theme"/><span className="wk2-avatar">·</span></div></header><div className="wk2-content"><div className="wk2-titlebar"><h1>{bn?"ওয়ার্কস্পেস":"Workspaces"}</h1></div><div className="wk2-list" role="status" aria-label={bn?"ওয়ার্কস্পেস লোড হচ্ছে":"Loading workspaces"}>{[0,1,2].map(n=><div className="wk2-skeleton-row" key={n}><i/><div className="wk2-skeleton-info"><i/><i/></div><b/></div>)}</div></div></main>;
}
