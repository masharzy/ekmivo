// Private operator recovery only. Authenticate the entire archive before output.
import {readFile,writeFile,stat} from 'node:fs/promises';import {decryptPrivacyArchive} from './archive-codec.mjs';
const [input,output,request,workspace,realm]=process.argv.slice(2);
if(!input||!output||process.env.BRIOFOLD_PRIVACY_DECRYPT_ENABLED!=='true'||!/^[a-f0-9]{64}$/i.test(process.env.BRIOFOLD_PRIVACY_EXPORT_KEY_HEX||''))throw Error('Explicit private archive decryption configuration required');
if((await stat(input)).size>536870912)throw Error('Bounded archive exceeded');
try{const rows=decryptPrivacyArchive(await readFile(input),Buffer.from(process.env.BRIOFOLD_PRIVACY_EXPORT_KEY_HEX,'hex'),{request,workspace,realm});await writeFile(output,rows.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:'authenticated_private_archive_decoded',records:rows.length,privacy_request_complete:false}))}catch{throw Error('Archive recovery unconfirmed; no raw content or credential output')}
