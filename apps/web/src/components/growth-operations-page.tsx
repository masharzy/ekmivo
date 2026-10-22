import "server-only";
import {database} from "../lib/server/db";
import {GrowthOperations,type GrowthOperationsData} from "./growth-operations";

export async function GrowthOperationsPage({workspaceId,actorId,bn,environment,kind}:{
 workspaceId:string;actorId:string;bn:boolean;environment:"live"|"sandbox";kind:"broadcast"|"post"|"booking";
}){
 let initial:GrowthOperationsData|null=null;
 try{
  const [row]=await database()`SELECT briofold_growth_operations_read(${workspaceId}::uuid,${environment},${actorId}::uuid,${kind}) AS data`;
  initial=row.data as GrowthOperationsData;
 }catch{/* Missing 0180 or unavailable database: do not invent empty records. */}
 return <GrowthOperations key={workspaceId+environment+kind} workspaceId={workspaceId} actorId={actorId} bn={bn} environment={environment} kind={kind} initial={initial}/>;
}
