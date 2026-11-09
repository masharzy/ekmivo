import assert from "node:assert/strict";
import test from "node:test";
import {CATALOG_TEMPLATE,importBody,parseProducts,toBatches} from "../src/lib/client/catalog-import.ts";
import {csvCells} from "../src/lib/client/commerce-import.ts";

test("template parses into one product with two variants and no issues",()=>{
 const {products,issues}=parseProducts(csvCells(CATALOG_TEMPLATE));
 assert.deepEqual(issues,[]);assert.equal(products.length,1);
 assert.equal(products[0].variants.length,2);assert.deepEqual(products[0].tags,["eid","cotton"]);
 assert.equal(products[0].search_aliases[0],"পাঞ্জাবি");assert.equal(products[0].min_price_minor,90000);
 assert.equal(products[0].variants[1].options.size,"L");
});
test("bad rows are reported by line and do not hide good rows",()=>{
 const csv="product_id,name,sku,price_minor,stock,image_urls\nA,Shirt,A-1,5000,3,\nB,Bag,B-1,abc,,\nC,Cap,C-1,100,,http://insecure.example/x.jpg\nD,Belt,A-1,100,,\nE,Hat,E-1,100,-1,\n";
 const {products,issues}=parseProducts(csvCells(csv));
 assert.deepEqual(products.map(p=>p.external_id),["A"]);
 assert.deepEqual(issues,[{line:3,code:"PRICE_INVALID"},{line:4,code:"IMAGE_URL_INVALID"},{line:5,code:"DUPLICATE_SKU"},{line:6,code:"STOCK_INVALID"}]);
});
test("conflicting names for one product id are rejected",()=>{
 const {issues}=parseProducts(csvCells("product_id,name,sku,price_minor\nA,Shirt,A-1,100\nA,Other,A-2,100\n"));
 assert.deepEqual(issues,[{line:3,code:"NAME_CONFLICT_FOR_PRODUCT"}]);
});
test("unknown or missing columns fail the whole file",()=>{
 assert.throws(()=>parseProducts(csvCells("name,sku\nA,B\n")),/COLUMNS_REQUIRED/);
 assert.throws(()=>parseProducts(csvCells("product_id,name,sku,price_minor,surprise\nA,B,C,1,x\n")),/COLUMNS_REQUIRED/);
});
test("batches hold at most 25 products and body omits empty optionals",()=>{
 assert.deepEqual(toBatches(Array.from({length:60},(_,i)=>i)).map(b=>b.length),[25,25,10]);
 const {products}=parseProducts(csvCells("product_id,name,sku,price_minor\nA,Shirt,A-1,100\n"));
 const body=importBody(products[0]);assert.equal("image_urls" in body,false);assert.equal("min_price_minor" in body,false);assert.equal("stock" in body.variants[0],false);
});

test("plan-format rows use SKU as a stable fallback and reject ambiguous inputs",()=>{
 const {products,issues}=parseProducts(csvCells("name,sku,price,min_price,options,price_minor\nPanjabi,P-1,1200.05,900,size=M;color=Red,\nBag,B-1,20,,,2000\nCap,C-1,10,,size=M;size=L,\n"));
 assert.deepEqual(issues,[{line:3,code:"PRICE_INVALID"},{line:4,code:"OPTIONS_INVALID"}]);
 assert.equal(products[0].external_id,"P-1");
 assert.equal(products[0].min_price_minor,90000);
 assert.deepEqual(products[0].variants[0],{sku:"P-1",price_minor:120005,stock:null,options:{size:"M",color:"Red"}});
});
