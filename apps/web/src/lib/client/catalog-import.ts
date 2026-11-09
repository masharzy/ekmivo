// Product-catalog import (Phase 1). One CSV/XLSX row is one variant; rows that
// share product_id become one product. All checks here are a convenience for
// the seller; the server re-validates every field and every bound.
export type ImportProduct={external_id:string;name:string;description:string;category:string;tags:string[];search_aliases:string[];ai_notes:string;min_price_minor:number|null;image_urls:string[];variants:{sku:string;price_minor:number;stock:number|null;options:Record<string,string>}[]};
export type ImportIssue={line:number;code:string};
export const CATALOG_COLUMNS=["product_id","name","description","category","tags","search_aliases","ai_notes","min_price_minor","image_urls","sku","price_minor","stock","size","color"] as const;
export const CATALOG_TEMPLATE =
 "product_id,name,description,category,tags,search_aliases,sku,options,price,min_price,stock,image_urls\n" +
 "P-1001,Cotton Panjabi,Soft cotton panjabi,Panjabi,eid|cotton,পাঞ্জাবি|punjabi,P-1001-M,size=M;color=White,1200,900,10,https://example.com/p1001.jpg\n" +
 "P-1001,Cotton Panjabi,,,,,P-1001-L,size=L;color=White,1200,,5,\n";
const pipe=(v:string)=>v.split("|").map(x=>x.trim()).filter(Boolean);
// The plan's decimal BDT columns coexist with older whole-paisa imports.
function decimalMinor(value:string):string {
 const match=/^([0-9]{1,10})(?:\.([0-9]{1,2}))?$/.exec(value);
 return match ? String(Number(match[1])*100+Number((match[2]??"").padEnd(2,"0"))) : "invalid";
}
const wholeMinor=(v:string,max:number)=>/^[0-9]{1,12}$/.test(v)&&Number(v)<=max;
export function parseProducts(table:string[][]):{products:ImportProduct[];issues:ImportIssue[]}{
 const rows=table.map(r=>r.slice());const header=(rows.shift()??[]).map(s=>s.trim().replace(/^﻿/,"").toLowerCase());
 const known=new Set<string>([...CATALOG_COLUMNS,"price","min_price","options"]);
 if(!["name","sku"].every(k=>header.includes(k))||!["price","price_minor"].some(k=>header.includes(k))||new Set(header).size!==header.length||header.some(h=>!known.has(h)))throw Error("COLUMNS_REQUIRED_NAME_SKU_PRICE");
 if(rows.length<1||rows.length>500)throw Error("IMPORT_REQUIRES_1_TO_500_ROWS");
 const issues:ImportIssue[]=[];const byId=new Map<string,ImportProduct>();const skus=new Set<string>();const order:string[]=[];
 rows.forEach((values,i)=>{
  const line=i+2;const r:Record<string,string>=Object.fromEntries(CATALOG_COLUMNS.map(key=>{const n=header.indexOf(key);return [key,n<0?"":(values[n]??"").trim()];}));
  const bad=(code:string)=>{issues.push({line,code});};
  const cell=(key:string)=>(values[header.indexOf(key)]??"").trim();
  const price=cell("price"),minimum=cell("min_price");
  if(price&&r.price_minor)return bad("PRICE_INVALID");
  if(minimum&&r.min_price_minor)return bad("MIN_PRICE_INVALID");
  if(price)r.price_minor=decimalMinor(price);
  if(minimum)r.min_price_minor=decimalMinor(minimum);
  if(r.min_price_minor&&!wholeMinor(r.min_price_minor,100000000000))return bad("MIN_PRICE_INVALID");
  const options:Record<string,string>={};
  if(r.size)options.size=r.size;
  if(r.color)options.color=r.color;
  if(cell("options")){
   for(const entry of cell("options").split(";")){
    const match=/^(size|color)=([^=;]{1,80})$/.exec(entry.trim());
    if(!match||!match[2].trim()||Object.hasOwn(options,match[1]))return bad("OPTIONS_INVALID");
    options[match[1]]=match[2].trim();
   }
  }
  const id=r.product_id||r.sku;if(!id||id.length>200)return bad("PRODUCT_ID_REQUIRED");
  if(!r.sku||r.sku.length>80)return bad("SKU_REQUIRED");
  if(skus.has(r.sku))return bad("DUPLICATE_SKU");
  if(!wholeMinor(r.price_minor,100000000000)||Number(r.price_minor)<1)return bad("PRICE_INVALID");
  if(r.stock&&(!/^[0-9]{1,8}$/.test(r.stock)||Number(r.stock)>10000000))return bad("STOCK_INVALID");
  let product=byId.get(id);
  if(!product){
   if(!r.name||r.name.length>200)return bad("NAME_REQUIRED");
   if(r.description.length>4000||r.category.length>80||r.ai_notes.length>2000)return bad("TEXT_TOO_LONG");
   const tags=pipe(r.tags),aliases=pipe(r.search_aliases),images=pipe(r.image_urls);
   if(tags.length>30||tags.some(x=>x.length>40)||aliases.length>30||aliases.some(x=>x.length>60))return bad("TAGS_OR_ALIASES_INVALID");
   if(images.length>8||images.some(u=>!/^https:\/\/[^\s]{1,2040}$/.test(u)))return bad("IMAGE_URL_INVALID");
   product={external_id:id,name:r.name,description:r.description,category:r.category,tags,search_aliases:aliases,ai_notes:r.ai_notes,min_price_minor:r.min_price_minor?Number(r.min_price_minor):null,image_urls:images,variants:[]};
   byId.set(id,product);order.push(id);
  }else if(r.name&&r.name!==product.name)return bad("NAME_CONFLICT_FOR_PRODUCT");
  if(product.variants.length>=100)return bad("TOO_MANY_VARIANTS");
  skus.add(r.sku);product.variants.push({sku:r.sku,price_minor:Number(r.price_minor),stock:r.stock?Number(r.stock):null,options});
 });
 return {products:order.map(id=>byId.get(id)!).filter(p=>p.variants.length>0),issues};
}
// The server accepts at most 25 products per request; each product is saved on
// its own, so one bad product never blocks the rest of its batch.
export function toBatches<T>(items:T[],size=25):T[][]{const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out;}
export function importBody(p:ImportProduct):Record<string,unknown>{
 const body:Record<string,unknown>={external_id:p.external_id,name:p.name,description:p.description,category:p.category,tags:p.tags,search_aliases:p.search_aliases,ai_notes:p.ai_notes,variants:p.variants.map(v=>{const out:Record<string,unknown>={sku:v.sku,price_minor:v.price_minor,options:v.options};if(v.stock!==null)out.stock=v.stock;return out;})};
 if(p.min_price_minor!==null)body.min_price_minor=p.min_price_minor;if(p.image_urls.length)body.image_urls=p.image_urls;return body;
}
