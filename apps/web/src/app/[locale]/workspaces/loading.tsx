export default function LoadingWorkspaces(){
 return <main className="wk2-root"><header className="wk2-header"><span className="wk2-logo">ekmivo</span><span className="wk2-header-right"><span className="wk2-avatar">·</span></span></header><div className="wk2-content"><div className="wk2-titlebar"><h1>Workspaces</h1></div><div className="wk2-list" role="status" aria-label="Loading workspaces">{[0,1,2].map(n=><div className="wk2-skeleton-row" key={n}><i/><div className="wk2-skeleton-info"><i/><i/></div><b/></div>)}</div></div></main>;
}
