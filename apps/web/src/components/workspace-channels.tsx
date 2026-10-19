"use client";
import styles from "./workspace-messaging.module.css";
import {useState} from "react";
export function WorkspaceChannels({workspaceId,bn}:{workspaceId:string;bn:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(false);
 async function connect(provider:string){setBusy(true);setError(false);try{const r=await fetch(`/api/go/workspaces/${workspaceId}/inbox-connect?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider})});if(!r.ok)throw Error();const data=await r.json();const u=new URL(data.url);if(u.protocol!=="https:"||u.hostname!=="www.facebook.com")throw Error();window.location.assign(u.href)}catch{setError(true);setBusy(false)}}
 return <section className={styles.root}><header ><h1>{bn?"চ্যানেল":"Channels"}</h1></header><div className={styles.card}>{([['ms','Messenger'],['wa','WhatsApp'],['ig','Instagram']] as const).map(([id,name])=><div className={styles.row} key={id}><span>{name}</span><button  type="button" disabled={busy} onClick={()=>void connect(id)}>{bn?"সংযুক্ত করুন":"Connect"}</button></div>)}</div>{error?<p role="alert">{bn?"সংযোগ শুরু করা যায়নি। একটু পরে আবার চেষ্টা করুন।":"Unable to start the connection. Please try again."}</p>:null}</section>
}
