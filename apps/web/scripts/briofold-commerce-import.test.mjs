import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/lib/client/commerce-import.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseCatalogCSV,catalogRows}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('CSV imports quoted commas, embedded newlines and exact paisa without float coercion',()=>{const rows=parseCatalogCSV('name,sku,price_minor,group\r\n"Cotton, blue",SKU-1,12345,SHIRT\r\n"Cotton\nred",SKU-2,5,SHIRT\r\n');assert.equal(rows.length,2);assert.equal(rows[0].name,'Cotton, blue');assert.equal(rows[1].name,'Cotton\nred');assert.equal(rows[0].price_minor,12345);assert.equal(rows[1].group,'SHIRT');});
test('Duplicate SKUs, decimal/exponent prices, missing columns and unbounded imports fail before any mutation',()=>{for(const value of ['name,sku,price_minor\nOne,A,1.5','name,sku,price_minor\nOne,A,1e3','name,sku,price_minor\nOne,A,100000000001','name,sku,price_minor\nOne,A,1\nTwo,A,2','name,sku\nOne,A','name,sku,price_minor\n"broken,A,1'])assert.throws(()=>parseCatalogCSV(value));assert.throws(()=>catalogRows([['name','sku','price_minor'],...Array.from({length:501},(_,i)=>['Name','SKU-'+i,'1'])]));});
