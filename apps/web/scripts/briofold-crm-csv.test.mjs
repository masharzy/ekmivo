import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source=readFileSync(new URL("../src/lib/crm-csv.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
vm.runInNewContext(compiled,{exports});
const {crmPageCsv}=exports;

test("CSV quotes Bengali and neutralizes spreadsheet formulas in every CRM field",()=>{
 const csv=crmPageCsv([{
  id:"store-owned",name:'=HYPERLINK("evil","tap")',stage:"qualified",temperature:"hot",tags:["বাংলা,লিড","+LOOKUP()"],
  assignee:"editor",email:"@cmd",phone:"+8801777777777"
 }],[{id:"editor",name:"-SUM(A1)"}]);
 assert.ok(csv.startsWith("\uFEFF\"Customer ID\""));
 for(const fragment of ["\"'=HYPERLINK(\"\"evil\"\",\"\"tap\"\")\"","\"'-SUM(A1)\"","\"'@cmd\"","\"'+8801777777777\"","বাংলা,লিড"])
  assert.ok(csv.includes(fragment),`missing formula-safe CSV field ${fragment}`);
 assert.equal(csv.trimEnd().split("\r\n").length,2);
});

test("CRM page CSV is explicitly bounded to the fifty records actually shown",()=>{
 const rows=Array.from({length:51},(_,i)=>({id:String(i),name:`Customer ${i}`,stage:"new",temperature:"warm",tags:[],assignee:null}));
 const csv=crmPageCsv(rows,[]);
 assert.equal(csv.trimEnd().split("\r\n").length,51);
 assert.ok(csv.includes("Customer 49"));
 assert.ok(!csv.includes("Customer 50"));
 assert.ok(csv.includes('"Unassigned"'));
});
