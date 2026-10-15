"use client";
import {useEffect} from "react";
export default function WorkspaceLoadError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 useEffect(()=>{console.error("Workspace list could not load",error.name)},[error]);
 return <main className="wk2-root"><header className="wk2-header"><span className="wk2-logo">ekmivo</span></header><div className="wk2-content"><div className="wk2-titlebar"><h1>Workspaces</h1></div><div className="wk2-error"><p>Unable to load workspaces.</p><button type="button" className="wk2-button wk2-primary" onClick={reset}>Try again</button></div></div></main>;
}
