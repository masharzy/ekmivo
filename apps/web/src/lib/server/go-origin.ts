import "server-only";

export function goOrigin(sandboxTools = false): URL | null {
 try {
  // Never fall back from the simulator to a process holding live credentials.
  const configured=sandboxTools?process.env.GO_SANDBOX_API_URL:process.env.GO_API_URL||"https://api.briofold.tech";
  if(!configured)return null;
  const base=new URL(configured);
  const local=process.env.NODE_ENV==="development"&&base.protocol==="http:"&&["127.0.0.1","localhost","[::1]"].includes(base.hostname);
  return (base.protocol==="https:"||local)&&!base.username&&!base.password&&!base.search&&!base.hash&&(base.pathname==="/"||base.pathname==="")?base:null;
 }catch{return null}
}
