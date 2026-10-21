export type AiStudioConfig={instructions:string;mode:"off"|"practice"|"live";language:"auto"|"bn"|"en";tone:"neutral"|"friendly"|"formal";model:string};
export type KnowledgeSource={id:string;current_version:string;title:string;kind:string;characters:number;updated_at:string};
export type KnowledgeDocument={id:string;version:string;title:string;kind:string;content:string};
export type KnowledgeMatch={id:string;source_id:string;title:string;content:string;score:number};
export type AiStudioData={revision:number;config:AiStudioConfig;published_id:string|null;published:AiStudioConfig|null;
 versions:{id:string;publication:number;reason:string;created_at:string}[];sources:KnowledgeSource[];models:string[];
 source_offset:number;version_offset:number;more_sources:boolean;more_versions:boolean};
export type AiStudioView={status:"ready";data:AiStudioData}|{status:"unavailable"|"forbidden"};
export type AiStudioCommand="draft"|"publish"|"rollback"|"source"|"archive";
export type AiStudioError="invalid"|"forbidden"|"stale-business"|"conflict"|"rate-limit"|"unavailable";
export type AiStudioResult={status:"success";data:AiStudioData}|{status:"error";code:AiStudioError};
export const studioUuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function validAiStudioConfig(value:unknown):value is AiStudioConfig{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const x=value as Record<string,unknown>;
 return Object.keys(x).length===5&&typeof x.instructions==="string"&&x.instructions.length<=16000&&!x.instructions.includes("\0")&&
  typeof x.mode==="string"&&["off","practice","live"].includes(x.mode)&&typeof x.language==="string"&&["auto","bn","en"].includes(x.language)&&
  typeof x.tone==="string"&&["neutral","friendly","formal"].includes(x.tone)&&typeof x.model==="string"&&
  (x.model===""||/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(x.model));
}
export function studioErrorCode(error:unknown):AiStudioError{
 const code=error&&typeof error==="object"&&"code" in error?String(error.code):"";
 if(code==="42501")return "forbidden";
 if(["40001","23505"].includes(code))return "conflict";
 if(code==="54000")return "rate-limit";
 if(["22023","22P02","23514"].includes(code))return "invalid";
 return "unavailable";
}
