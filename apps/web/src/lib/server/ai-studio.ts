import "server-only";
import {database} from "./db";
import {studioErrorCode,studioUuid,type AiStudioData,type AiStudioView} from "../ai-studio";
export async function readAiStudio(workspace:string,actor:string,sourceOffset=0,versionOffset=0):Promise<AiStudioView>{
 if(!studioUuid.test(workspace)||!studioUuid.test(actor)||!Number.isSafeInteger(sourceOffset)||!Number.isSafeInteger(versionOffset))return {status:"forbidden"};
 try{
  const [row]=await database()`SELECT briofold_ai_studio_read(${workspace}::uuid,${actor}::uuid,${sourceOffset},${versionOffset}) AS data`;
  return {status:"ready",data:row.data as AiStudioData};
 }catch(error){return {status:studioErrorCode(error)==="forbidden"?"forbidden":"unavailable"};}
}
