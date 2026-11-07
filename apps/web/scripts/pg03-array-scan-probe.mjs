// Read-only diagnostic: no table/secret query and no connection details printed.
import {mkdtemp,writeFile,rm,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'briofold-pg03-scan-'));
const file=join(dir,'main.go');
try{
 await writeFile(file,`package main
import("database/sql";"fmt";"os";_ "github.com/jackc/pgx/v5/stdlib")
func main(){db,e:=sql.Open("pgx",os.Getenv("DATABASE_URL"));if e!=nil{fmt.Println("Connection initialization failed; suppressed");os.Exit(1)};defer db.Close();var scopes []string;e=db.QueryRow("SELECT ARRAY['payments:read']::text[]").Scan(&scopes);if e!=nil{fmt.Println("text[] into []string Scan FAILED");fmt.Printf("%T\\n",e);var raw any;if db.QueryRow("SELECT ARRAY['payments:read']::text[]").Scan(&raw)==nil{fmt.Printf("database/sql array value type: %T\\n",raw)};os.Exit(2)};fmt.Println("text[] into []string Scan PASS")}
`);
 const run=spawnSync('go',['run',file],{cwd:'../../backend',env:process.env,encoding:'utf8',timeout:60000});
 console.log(run.stdout.trim());if(run.status!==0)process.exitCode=run.status||1;
}finally{await rm(file,{force:true});await rmdir(dir);}
