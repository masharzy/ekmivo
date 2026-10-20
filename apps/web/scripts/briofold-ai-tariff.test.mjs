import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
const source=readFileSync(new URL("../src/lib/ai-credit-tariff.ts",import.meta.url),"utf8");
const exports={};
runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
test("BDT is converted to exact integer paisa without float rounding",()=>{
 for(const [value,expected] of [["0",0],["0.01",1],["0.29",29],["50",5000],["50.5",5050],["1000000",100000000]])assert.equal(exports.aiMoneyMinor(value),expected);
 for(const value of ["","-1","1e3","NaN","Infinity","0.001","1.234","1000000.01"," 1","1,000"])assert.equal(exports.aiMoneyMinor(value),null,value);
});
const fields={input_rate:"10",cached_rate:"1",output_rate:"20",request_cap:"1",max_input:"10000",max_output:"2000"};
function form(changes={}){const f=new FormData();for(const [key,value] of Object.entries({...fields,...changes}))f.set(key,value);return f;}
test("version terms use exact rates, explicit bounds and a fixed disclosed rounding policy",()=>{
 const terms=exports.aiTariffTerms(form());
 assert.equal(terms.input_minor_per_million,1000);assert.equal(terms.cached_input_minor_per_million,100);
 assert.equal(terms.max_request_minor,100);assert.equal(terms.rounding,"ceil_minor");
});
test("underfunded bounds, invalid limits and invalid rates fail closed",()=>{
 for(const changes of [{request_cap:"0.13"},{max_input:"0"},{max_output:"-1"},{max_output:"1.1"},{max_input:"100000001"},
  {input_rate:"0",output_rate:"0",cached_rate:"0"},{cached_rate:"10.01"},{input_rate:""},{output_rate:"0.001"}])assert.equal(exports.aiTariffTerms(form(changes)),null);
});
