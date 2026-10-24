import "server-only";
import {database} from "../lib/server/db";
import {LinkedOrderConversion,type ConversionData} from "./linked-order-conversion";
export async function LinkedOrderConversionReport({workspaceId,actorId,environment,locale}:{workspaceId:string;actorId:string;environment:"live"|"sandbox";locale:"en"|"bn"}){
 let initial:ConversionData|null=null;
 try{const [row]=await database()`SELECT briofold_linked_order_conversion(${workspaceId}::uuid,${environment},${actorId}::uuid,30,0) AS data`;initial=row?.data as ConversionData|null;}catch{/* Render an explicit unavailable state; no inferred zero values. */}
 return <LinkedOrderConversion key={workspaceId+actorId+environment} workspaceId={workspaceId} environment={environment} bn={locale==="bn"} initial={initial}/>;
}
