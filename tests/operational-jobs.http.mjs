// Run after next build. Real SQL functions, synthetic fixtures, no live Supabase connection.
import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';import {once} from 'node:events';import {randomBytes} from 'node:crypto';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const {PGlite}=createRequire(import.meta.url)(process.env.PROCUREMENT_PGLITE_MODULE||'@electric-sql/pglite');const db=await PGlite.create();
await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table records(id text primary key,kind text,data jsonb,version integer default 1);grant all on records to service_role;insert into records(id,kind,data) values('p1','practice','{\"name\":\"Pratica QA\",\"practiceStatus\":\"Vinta\",\"state\":\"In trattativa\"}'),('p2','practice','{\"name\":\"Altra pratica QA\",\"practiceStatus\":\"Vinta\"}'),('i1','invoice','{\"practiceId\":\"p1\",\"paid\":false}');");
for(const name of ['procurement.sql','procurement-catalog-edit.sql','procurement-operational-jobs.sql'])await db.exec(await readFile(new URL('../supabase/'+name,import.meta.url),'utf8'));
const catalog={schemaVersion:1,suppliers:[{id:'s1',name:'Fornitore QA',brands:['Marca QA']}],documents:[{id:'d1',name:'Listino QA',supplierId:'s1',date:'2026-11',pages:1}],offers:[{id:'o1',label:'Cavo QA',code:'QA-1',brand:'Marca QA',description:'Dati sintetici',category:'Cavi',section:'Cavi',supplierId:'s1',supplierName:'Fornitore QA',documentId:'d1',documentDate:'2026-11',page:1,unit:'metro',currency:'EUR',listPriceCents:121,purchasePriceCents:60.5,shippingCents:null,priceBasis:'gross',discountPercent:50,vatIncluded:false,validUntil:null,validityStatus:'to-confirm',stockStatus:'unknown',review:[],verified:false}]};
await db.query('select import_procurement_catalog($1::jsonb)',[JSON.stringify(catalog)]);
const roleQuery=(sql,params=[])=>db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query(sql,params);});
const backend=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 try{
  assert.equal(req.headers.authorization,'Bearer synthetic-job-key');const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'){
   const query=url.pathname.endsWith('/procurement_catalog')?'select data from procurement_catalog':url.pathname.endsWith('/procurement_jobs')?'select data,version from procurement_jobs order by id':url.pathname.endsWith('/records')?'select id,kind,data,version from records order by id':null;
   res.end(JSON.stringify(query?(await roleQuery(query)).rows:[]));return;
  }
  if(req.method==='POST'&&url.pathname==='/rest/v1/rpc/save_procurement_job'){
   let text='';for await(const chunk of req)text+=chunk;const {p_job}=JSON.parse(text);const result=await roleQuery('select save_procurement_job($1::jsonb) as job',[JSON.stringify(p_job)]);res.end(JSON.stringify(result.rows[0].job));return;
  }
  res.writeHead(405);res.end('{}');
 }catch(e){res.writeHead(e.code==='PT409'||e.code==='23505'?409:400);res.end(JSON.stringify({message:e.message}));}
});
backend.listen(0,'127.0.0.1');await once(backend,'listening');
const base='http://127.0.0.1:5196',password=randomBytes(32).toString('hex');const env={...process.env,NODE_ENV:'production',PROCUREMENT_ACCESS_PASSWORD:password,PROCUREMENT_MODE:'read-only',PROCUREMENT_JOBS_ENABLED:'1',SUPABASE_URL:'http://127.0.0.1:'+backend.address().port,SUPABASE_SERVICE_ROLE_KEY:'synthetic-job-key'};
for(const k of ['PROCUREMENT_CATALOG_GZIP_BASE64','PROCUREMENT_LOCAL_PREVIEW','PROCUREMENT_READ_ONLY_SOURCE_URL'])delete env[k];
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','5196'],{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
try{
 let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('Server non avviato');try{if((await fetch(base+'/api/procurement')).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(ready,true);
 const login=await fetch(base+'/api/procurement',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action:'login',password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const get=async()=>{const r=await fetch(base+'/api/procurement',{headers:{cookie}});assert.equal(r.status,200);return r.json();};
 const post=(job,origin=base,auth=true)=>fetch(base+'/api/procurement',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{cookie}:{})},body:JSON.stringify({action:'save-job',job})});
 const initial=await get();assert.equal(initial.readOnly,false);assert.equal(initial.liveData,true);
 const draft={id:'j1',practiceId:'p1',version:0,installments:[{id:'r1',kind:'Acconto',milestone:'Accettazione',amountCents:null,dueDate:'',invoiceId:'i1',manualReference:'',manualPaidDate:''},{id:'r2',kind:'Saldo',milestone:'Durante i lavori / verso la fine',amountCents:null,dueDate:'',invoiceId:null,manualReference:'',manualPaidDate:''}],connection:'Da aprire',works:'Da avviare',completedDate:'',orders:[{id:'ord1',supplierId:'s1',reference:'',status:'Da ordinare'}],materials:[{id:'m1',offerId:'o1',quantity:100,snapshot:{unitPriceCents:1}}],notes:''};
 assert.equal((await post(draft,base,false)).status,401);assert.equal((await post(draft,'https://other.invalid')).status,403);
 let response=await post(draft);assert.equal(response.status,200);let job=(await response.json()).job;assert.equal(job.version,1);assert.equal(job.materials[0].snapshot.unitPriceCents,60.5);assert.equal((await get()).jobs.length,1);
 const offer=(await db.query("select value from procurement_catalog,jsonb_array_elements(data->'offers') where value->>'id'='o1'")).rows[0].value;
 await db.query('select update_procurement_offer($1,$2::jsonb,$3::jsonb)',['o1',JSON.stringify(offer),JSON.stringify({purchasePriceCents:100,listPriceCents:200,active:false})]);
 job.materials[0].quantity=150;response=await post(job);assert.equal(response.status,200);job=(await response.json()).job;assert.equal(job.materials[0].snapshot.unitPriceCents,60.5);
 assert.equal((await post(draft)).status,409);
 assert.equal((await post({...job,materials:[...job.materials,{id:'m2',offerId:'o1',quantity:1}]})).status,400);
 assert.equal((await post({...job,orders:[{...job.orders[0],status:'Ordinato'}]})).status,400);
 await db.query("update records set data=jsonb_set(data,'{paid}','true') where id='i1'");
 response=await post({...job,orders:[{...job.orders[0],status:'Ordinato'}],connection:'Aperta'});assert.equal(response.status,200);job=(await response.json()).job;assert.equal(job.version,3);
 assert.equal((await post({...job,materials:[]})).status,400);assert.ok(!logs.includes(password));
 console.log(JSON.stringify({passed:true,checks:['Creazione commessa vinta senza filtro fase commerciale','Salvataggio su PostgreSQL con ruolo server','Prezzo canonico e riapertura materiali','Prezzi congelati dopo modifica e archiviazione catalogo','Conflitti e richieste non autorizzate','Incasso iniziale e blocco materiali ordinati']}));
}finally{child.kill('SIGTERM');await once(child,'exit').catch(()=>{});backend.close();await once(backend,'close');await db.close();}
