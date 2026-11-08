export type InboxSyncOptions={run:()=>Promise<unknown>;visible?:()=>boolean;onError?:()=>void;delay?:number;schedule?:(callback:()=>void,delay:number)=>()=>void};
/** Coalesce hints, serialize snapshots and never lose an event received during a refresh. */
export function createInboxSyncScheduler({run,visible=()=>true,onError,delay=100,schedule=(callback,ms)=>{const id=setTimeout(callback,ms);return()=>clearTimeout(id);}}:InboxSyncOptions){
 let disposed=false,running=false,dirty=false,cancelTimer:(()=>void)|null=null;
 function request(){
  if(disposed)return;dirty=true;
  if(running||cancelTimer||!visible())return;
  cancelTimer=schedule(()=>{cancelTimer=null;void flush();},delay);
 }
 async function flush(){
  if(disposed)return;dirty=true;
  if(running||!visible())return;
  cancelTimer?.();cancelTimer=null;running=true;dirty=false;
  try{await run();}catch{if(!disposed)onError?.();}
  finally{running=false;if(dirty&&!disposed)request();}
 }
 function dispose(){disposed=true;cancelTimer?.();cancelTimer=null;}
 return {request,flush,dispose};
}
