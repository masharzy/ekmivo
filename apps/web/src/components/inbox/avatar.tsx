"use client";
/* eslint-disable @next/next/no-img-element -- authenticated avatars go directly to VPS, never through an image optimizer */
import {useState} from "react";
import {initials} from "./lib";
import s from "./inbox.module.css";
export function AvatarPhoto({workspaceId,threadId,name}:{workspaceId:string;threadId:string;name:string}){
 const [failed,setFailed]=useState("");
 const url=`https://api.briofold.tech/v1/workspaces/${workspaceId}/inbox/avatar/${threadId}?environment=live`;
 return <>{initials(name)}{threadId&&failed!==url&&<img className={s.avPhoto} src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(url)}/>}</>;
}
