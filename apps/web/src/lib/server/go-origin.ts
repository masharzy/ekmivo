import "server-only";

export function goOrigin(): URL | null {
 try {
  const base=new URL(process.env.GO_API_URL||"https://ekmivo-go-api.onrender.com");
  const local=process.env.NODE_ENV==="development"&&base.protocol==="http:"&&["127.0.0.1","localhost","[::1]"].includes(base.hostname);
  return (base.protocol==="https:"||local)&&!base.username&&!base.password?base:null;
 }catch{return null}
}
