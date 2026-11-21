// Run after next build. Uses synthetic data and an isolated local backend.
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {gzipSync} from 'node:zlib';
import {randomBytes} from 'node:crypto';
const requests=[];
const backend=http.createServer((req,res)=>{
 requests.push({method:req.method,path:req.url});
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 const records=[{id:'qa-practice',kind:'practice',version:1,data:{name:'Pratica di collaudo',practiceStatus:'Vinta',state:'✍️ Preventivo Accettato'}}];
 res.setHeader('Content-Type','application/json');
 res.end(JSON.stringify(req.url.startsWith('/rest/v1/records')?records:[]));
});
backend.listen(0,'127.0.0.1');await once(backend,'listening');
const catalog={schemaVersion:1,suppliers:[{id:'qa',name:'Fornitore di prova',brands:[]}],
 documents:[{id:'doc'}],offers:[{id:'qa-item',label:'Prodotto di prova',description:'Dati sintetici',supplierId:'qa',documentId:'doc',purchasePriceCents:10000}]};
const base='http://127.0.0.1:5192';const password=randomBytes(32).toString('hex');
const env={...process.env,NODE_ENV:'production',PROCUREMENT_MODE:'read-only',PROCUREMENT_JOBS_ENABLED:'0',PROCUREMENT_ACCESS_PASSWORD:password,
 PROCUREMENT_CATALOG_GZIP_BASE64:gzipSync(Buffer.from(JSON.stringify(catalog))).toString('base64'),
 SUPABASE_URL:'http://127.0.0.1:'+backend.address().port,SUPABASE_SERVICE_ROLE_KEY:'synthetic-test-key'};
delete env.PROCUREMENT_LOCAL_PREVIEW;delete env.PROCUREMENT_READ_ONLY_SOURCE_URL;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','5192'],{env,stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',chunk=>{logs+=chunk;});child.stderr.on('data',chunk=>{logs+=chunk;});
try{
 let ready=false;
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw new Error('Il server di collaudo non si è avviato.');
  try{const r=await fetch(base+'/api/procurement');if(r.status===401){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.equal(ready,true);
 const login=await fetch(base+'/api/procurement',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action:'login',password})});
 assert.equal(login.status,200);
 const session=login.headers.get('set-cookie');assert.match(session,/HttpOnly/);assert.match(session,/Secure/);
 const cookie=session.split(';')[0];
 const response=await fetch(base+'/api/procurement',{headers:{cookie}});assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.readOnly,true);assert.equal(data.liveData,true);
 assert.equal(data.localPreview,false);assert.equal(data.catalog.offers.length,1);assert.equal(data.practices.length,1);
 assert.deepEqual(data.jobs,[]);
 const save=await fetch(base+'/api/procurement',{method:'POST',headers:{Origin:base,cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'save-job',job:{}})});
 assert.equal(save.status,403);
 const commercial=await fetch(base+'/api/workspace');assert.equal(commercial.status,200);
 assert.equal((await commercial.json()).readOnly,undefined);
 assert.ok(requests.every(r=>r.method==='GET'));
 assert.ok(requests.every(r=>!r.path.includes('procurement_jobs')));
 assert.ok(!logs.includes(password));
 console.log(JSON.stringify({passed:true,checks:['Accesso riservato in produzione','Cookie firmato Secure e HttpOnly','Catalogo privato caricato sul server','Pratiche lette dall’archivio configurato','Salvataggi commesse disabilitati','Area commerciale invariata','Nessuna scrittura al backend']}));
}finally{
 child.kill('SIGTERM');await once(child,'exit').catch(()=>{});backend.close();await once(backend,'close');
}
