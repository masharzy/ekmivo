import "server-only";
import {readAiStudio} from "../lib/server/ai-studio";
import {AiStudio} from "./ai-studio";
export async function AiStudioPage({workspaceId,actorId,locale,view}:{workspaceId:string;actorId:string;locale:"en"|"bn";view:"assistant"|"knowledge"}){
 const initial=await readAiStudio(workspaceId,actorId);
 return <AiStudio key={actorId+":"+workspaceId+":"+view} workspaceId={workspaceId} actorId={actorId} locale={locale} initial={initial} view={view} runtimeEnabled={process.env.BRIOFOLD_AI_RUNTIME_ENABLED==="true"}/>;
}
