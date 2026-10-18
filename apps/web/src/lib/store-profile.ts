export type StoreProfile={name:string;logo:string;area:string;address:string;phone:string};
export function validStoreProfile(value:unknown):value is StoreProfile{
 if(!value||typeof value!=="object")return false;
 const item=value as Record<string,unknown>;
 if(Object.keys(item).sort().join(",")!=="address,area,logo,name,phone")return false;
 for(const [key,limit] of [["name",100],["logo",1500000],["area",120],["address",250],["phone",30]] as const){
  if(typeof item[key]!=="string"||item[key].length>limit||/[\u0000-\u001f]/.test(item[key] as string))return false;
 }
 return (item.name as string).trim().length>=2&&((item.logo as string)===""||
 /^\/api\/checkout-logos\/[a-f0-9]{64}$/.test(item.logo as string)||
 (item.logo as string).startsWith("data:image/png;base64,"));
}
