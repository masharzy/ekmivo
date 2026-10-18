"use client";
import {useRouter} from "next/navigation";
import {useTransition} from "react";

/** Re-runs the real server-side Admin health probes; no mocked monitoring status. */
export function AdminRefreshButton({label="Run connection check"}:{label?:string}){
 const router=useRouter();
 const [pending,startTransition]=useTransition();
 return <button type="button" className="pa-button pa-button-primary" disabled={pending}
  onClick={()=>startTransition(()=>router.refresh())} aria-busy={pending}>
  {pending?"Checking…":label}
 </button>;
}
