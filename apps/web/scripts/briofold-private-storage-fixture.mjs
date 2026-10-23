import {createServer} from 'node:https';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
// Disposable TLS/SigV4 transport fixture. No production endpoint or credentials.
export async function startBriofoldPrivateStorage(control){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Private storage fixture refuses shared DB');
 const root=await mkdtemp(join(tmpdir(),'briofold-private-photo-')),keyPath=join(root,'key.pem'),certPath=join(root,'cert.pem');let server;
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-addext','basicConstraints=critical,CA:TRUE'],{stdio:'ignore'});
  const bucket='phase10-fixtures',access='phase10-fictional-access',secret='phase10-fictional-signing-key',region='phase10';
  const objects=new Map(),requests=[],pattern=/^commerce\/(?:live|sandbox)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f]{64}$/;
  const sha=value=>createHash('sha256').update(value).digest('hex'),hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
  server=createServer({key:await readFile(keyPath),cert:await readFile(certPath)},async(req,res)=>{
   const reject=status=>{res.writeHead(status);res.end('fixture request rejected');};
   try{
    const pathname=new URL(req.url,'https://127.0.0.1').pathname,objectKey=pathname.slice(('/'+bucket+'/').length);
    if(!pathname.startsWith('/'+bucket+'/')||!pattern.test(objectKey)||!['GET','PUT','DELETE'].includes(req.method))return reject(400);
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>5242880)return reject(413);chunks.push(chunk);}const body=Buffer.concat(chunks);
    const stamp=req.headers['x-amz-date'],hash=req.headers['x-amz-content-sha256'];
    if(typeof stamp!=='string'||!/^\d{8}T\d{6}Z$/.test(stamp)||hash!==sha(body))return reject(403);
    const scope=stamp.slice(0,8)+'/'+region+'/s3/aws4_request';
    const canonical=req.method+'\n'+pathname+'\n\nhost:'+req.headers.host+'\nx-amz-content-sha256:'+hash+'\nx-amz-date:'+stamp+'\n\nhost;x-amz-content-sha256;x-amz-date\n'+hash;
    const toSign='AWS4-HMAC-SHA256\n'+stamp+'\n'+scope+'\n'+sha(canonical),derived=hmac(hmac(hmac(hmac('AWS4'+secret,stamp.slice(0,8)),region),'s3'),'aws4_request');
    const expected='AWS4-HMAC-SHA256 Credential='+access+'/'+scope+', SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature='+hmac(derived,toSign).toString('hex');
    const auth=req.headers.authorization??'';if(auth.length!==expected.length||!timingSafeEqual(Buffer.from(auth),Buffer.from(expected)))return reject(403);
    requests.push({method:req.method,key:objectKey});
    if(req.method==='PUT'){objects.set(objectKey,body);res.writeHead(200);res.end();return;}
    if(req.method==='DELETE'){objects.delete(objectKey);res.writeHead(204);res.end();return;}
    const content=objects.get(objectKey);if(!content){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'private, no-store'});res.end(content);
   }catch{reject(400);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const endpoint='https://127.0.0.1:'+server.address().port;
  return {env:{PRIVATE_S3_ENDPOINT:endpoint,PRIVATE_S3_REGION:region,PRIVATE_S3_BUCKET:bucket,PRIVATE_S3_ACCESS_KEY:access,PRIVATE_S3_SECRET_KEY:secret,SSL_CERT_FILE:certPath},requests,
   put:(key,value)=>{if(!pattern.test(key))throw Error('fixture object key rejected');objects.set(key,Buffer.from(value));},
   close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}};
 }catch(error){if(server){server.closeAllConnections();server.close();}await rm(root,{recursive:true,force:true});throw error;}
}
