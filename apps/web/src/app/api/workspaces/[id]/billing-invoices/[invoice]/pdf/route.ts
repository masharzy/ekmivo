import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {currentUser} from '../../../../../../../lib/server/auth';
import {database} from '../../../../../../../lib/server/db';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string;invoice:string}>}){
 const {id,invoice}=await params;if(![id,invoice].every(v=>/^[0-9a-f-]{36}$/i.test(v)))return new Response(null,{status:404});
 const user=await currentUser();if(!user)return new Response(null,{status:401});
 try{
  const sql=database();const [record]=await sql`SELECT pg13_billing_read(${id}::uuid,${user.id}::uuid) AS body`;
  const inv=record.body.invoices?.find((i:{id:string})=>i.id===invoice);if(!inv)return new Response(null,{status:404});
  const [workspace]=await sql`SELECT name FROM workspaces WHERE id=${id}::uuid`;
  const [plan]=await sql`SELECT terms->>'name' AS name FROM payment_plan_versions WHERE id=${inv.plan_version_id}::uuid`;
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await pdf.embedFont(await readFile(path.join(process.cwd(),'src/fonts/HindSiliguri-Regular.ttf')),{subset:true});
  const page=pdf.addPage([595.28,841.89]);let y=780;
  const line=(value:string,size=12)=>{const lines=font.widthOfTextAtSize(value,size)>490?value.match(/.{1,62}/gu)??[value]:[value];for(const text of lines){page.drawText(text,{x:50,y,size,font,color:rgb(.08,.09,.11)});y-=size+12}};
  line('ekmivo.',24);line('Subscription invoice',18);y-=12;
  for(const [label,value] of [['Invoice',invoice],['Workspace',workspace?.name??id],['Created',inv.created_at],['Plan',plan?.name??inv.plan_id],['Period',`${inv.period_days} days`],['Amount',`BDT ${(Number(inv.amount_minor)/100).toFixed(2)}`],['Status',inv.status],...(inv.paid_at?[['Paid at',inv.paid_at]]:[]),...(inv.source_payment_id?[['Verified payment',inv.source_payment_id]]:[])])line(`${label}: ${value}`);
  pdf.setTitle('Briofold subscription invoice '+invoice);const bytes=await pdf.save();return new Response(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="ekmivo-invoice-${invoice}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({code:'INVOICE_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
