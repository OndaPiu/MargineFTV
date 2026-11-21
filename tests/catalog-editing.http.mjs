// Run after next build. Uses only synthetic fixtures and an isolated local backend.
import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';import {once} from 'node:events';import {randomBytes} from 'node:crypto';
const original={id:'qa-offer',label:'Materiale QA',code:'QA-OLD',brand:'Marca QA',description:'Dati sintetici',category:'Cavi',section:'Cavi',supplierId:'s1',supplierName:'Fornitore QA',documentId:'d1',documentDate:'2026-11',page:1,unit:'metro',currency:'EUR',listPriceCents:121,purchasePriceCents:60.5,shippingCents:null,priceBasis:'gross',discountPercent:50,vatIncluded:false,validUntil:null,validityStatus:'to-confirm',stockStatus:'unknown',review:[],verified:false};let current={...original};let writes=0;
const backend=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.method==='POST'&&req.url==='/rest/v1/rpc/update_procurement_offer'){
  writes++;let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);
  assert.equal(req.headers.authorization,'Bearer synthetic-key');
  if(JSON.stringify(input.p_expected)!==JSON.stringify(current)){res.writeHead(409);res.end(JSON.stringify({message:'stale'}));return;}
  current={...current,...input.p_changes,manualUpdatedAt:new Date().toISOString()};res.end(JSON.stringify(current));return;
 }
 if(req.method!=='GET'){res.writeHead(405);res.end('{}');return;}
 res.end(JSON.stringify(req.url.startsWith('/rest/v1/procurement_catalog')?[{data:{schemaVersion:1,suppliers:[{id:'s1',name:'Fornitore QA',brands:['Marca QA']}],documents:[{id:'d1',name:'Listino QA',pages:1}],offers:[current]}}]:[]));
});
backend.listen(0,'127.0.0.1');await once(backend,'listening');
const base='http://127.0.0.1:5194',password=randomBytes(32).toString('hex');
const env={...process.env,NODE_ENV:'production',PROCUREMENT_ACCESS_PASSWORD:password,PROCUREMENT_MODE:'read-only',PROCUREMENT_CATALOG_EDIT_ENABLED:'1',SUPABASE_URL:'http://127.0.0.1:'+backend.address().port,SUPABASE_SERVICE_ROLE_KEY:'synthetic-key'};
for(const k of ['PROCUREMENT_CATALOG_GZIP_BASE64','PROCUREMENT_LOCAL_PREVIEW','PROCUREMENT_READ_ONLY_SOURCE_URL'])delete env[k];
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','5194'],{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
try{
 let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('Server non avviato');try{if((await fetch(base+'/api/procurement')).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(ready,true);
 const login=await fetch(base+'/api/procurement',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action:'login',password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const send=(mutation,{origin=base,authenticated=true}={})=>fetch(base+'/api/procurement',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(authenticated?{cookie}:{})},body:JSON.stringify({action:'update-offer',mutation})});
 const data=await(await fetch(base+'/api/procurement',{headers:{cookie}})).json();assert.equal(data.catalogEditable,true);assert.equal(data.readOnly,true);
 assert.equal((await send({id:current.id,expected:current,changes:{active:false}},{authenticated:false})).status,401);
 assert.equal((await send({id:current.id,expected:current,changes:{active:false}},{origin:'https://other.invalid'})).status,403);assert.equal(writes,0);
 assert.equal((await send({id:current.id,expected:current,changes:{active:false,id:'changed'}})).status,400);assert.equal(writes,0);
 const {id,supplierName,documentDate,...fields}=original;const edited=await send({id,expected:current,changes:{...fields,code:'QA-NEW',listPriceCents:200,purchasePriceCents:100}});assert.equal(edited.status,200);assert.equal((await edited.json()).offer.code,'QA-NEW');
 const stale=await send({id,expected:original,changes:{active:false}});assert.equal(stale.status,409);
 const archived=await send({id,expected:current,changes:{active:false}});assert.equal(archived.status,200);assert.equal((await archived.json()).offer.active,false);
 const restored=await send({id,expected:current,changes:{active:true}});assert.equal(restored.status,200);assert.equal((await restored.json()).offer.purchasePriceCents,100);
 const save=await fetch(base+'/api/procurement',{method:'POST',headers:{Origin:base,cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'save-job',job:{}})});assert.equal(save.status,403);assert.equal(writes,4);assert.ok(!logs.includes(password));
 console.log(JSON.stringify({passed:true,checks:['Autenticazione e origine richieste','Modifica scheda validata','Conflitto restituito come HTTP 409','Archiviazione e ripristino','Commesse ancora in sola lettura']}));
}finally{child.kill('SIGTERM');await once(child,'exit').catch(()=>{});backend.close();await once(backend,'close');}
