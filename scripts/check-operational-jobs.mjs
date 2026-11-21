import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const {PGlite}=createRequire(import.meta.url)(process.env.PROCUREMENT_PGLITE_MODULE||'@electric-sql/pglite');const db=await PGlite.create();
await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table records(id text primary key,kind text,data jsonb);insert into records values('p1','practice','{\"practiceStatus\":\"Vinta\"}'),('p2','practice','{\"practiceStatus\":\"Vinta\"}'),('open','practice','{\"practiceStatus\":\"Aperta\"}'),('i1','invoice','{\"practiceId\":\"p1\",\"paid\":true}'),('i2','invoice','{\"practiceId\":\"p2\",\"paid\":true}');");
for(const name of ['procurement.sql','procurement-catalog-edit.sql','procurement-operational-jobs.sql','procurement-operational-jobs.sql'])await db.exec(await readFile(new URL('../supabase/'+name,import.meta.url),'utf8'));
const fixture={schemaVersion:1,suppliers:[{id:'s1',name:'Fornitore QA',brands:['Marca QA']}],documents:[{id:'d1',name:'Listino QA',supplierId:'s1',date:'2026-11',pages:1}],offers:[{id:'o1',label:'Cavo QA',code:'QA-1',brand:'Marca QA',description:'Dati sintetici',category:'Cavi',section:'Cavi',supplierId:'s1',supplierName:'Fornitore QA',documentId:'d1',documentDate:'2026-11',page:1,unit:'metro',currency:'EUR',listPriceCents:121,purchasePriceCents:60.5,shippingCents:null,priceBasis:'gross',discountPercent:50,vatIncluded:false,validUntil:null,validityStatus:'to-confirm',stockStatus:'unknown',review:[],verified:false}]};
await db.query('select import_procurement_catalog($1::jsonb)',[JSON.stringify(fixture)]);
const draft=(id='j1',practiceId='p1')=>({id,practiceId,version:0,installments:[{id:'r1',kind:'Saldo',milestone:'Accettazione',amountCents:null,dueDate:'',invoiceId:null,manualReference:'',manualPaidDate:''}],connection:'Da aprire',works:'Da avviare',completedDate:'',materials:[{id:'m1',offerId:'o1',quantity:100,snapshot:{unitPriceCents:1}}],orders:[],notes:''});
const save=async job=>(await db.query('select save_procurement_job($1::jsonb) as job',[JSON.stringify(job)])).rows[0].job;
let job;
test('creation saves catalog-sourced prices and material history atomically, ignoring client prices',async()=>{
 job=await save(draft());assert.equal(job.version,1);assert.equal(job.materials[0].snapshot.unitPriceCents,60.5);assert.equal(job.materials[0].snapshot.vatIncluded,false);
 assert.equal(Number((await db.query('select quantity from procurement_job_materials')).rows[0].quantity),100);
 assert.equal((await db.query('select relrowsecurity from pg_class where relname=\'procurement_job_materials\'')).rows[0].relrowsecurity,true);
});
test('a changed price before the first save is rejected without creating a job',async()=>{
 const proposed=draft('changed-price','p2');proposed.materials[0].expectedPriceCents=1;
 await assert.rejects(()=>save(proposed),e=>e.code==='PT409');
 assert.equal((await db.query("select count(*)::int n from procurement_jobs where id='changed-price'")).rows[0].n,0);
});
test('catalog edits and archive do not change saved prices or descriptions',async()=>{
 const original=(await db.query("select value from procurement_catalog,jsonb_array_elements(data->'offers') where value->>'id'='o1'")).rows[0].value;
 await db.query('select update_procurement_offer($1,$2::jsonb,$3::jsonb)',['o1',JSON.stringify(original),JSON.stringify({purchasePriceCents:100,listPriceCents:200,label:'Nome aggiornato',active:false})]);
 job.materials[0].quantity=150;job.materials[0].snapshot.unitPriceCents=1;job=await save(job);assert.equal(job.materials[0].snapshot.unitPriceCents,60.5);assert.equal(job.materials[0].snapshot.label,'Cavo QA');
 await assert.rejects(()=>save(draft('j2','p2')),/catalogo attivo/);
 assert.equal((await db.query("select count(*)::int n from procurement_jobs where id='j2'")).rows[0].n,0);
});
test('stale versions, duplicate practices, non-won practices and invalid quantities are rejected',async()=>{
 await assert.rejects(()=>save(draft()),e=>e.code==='PT409');await assert.rejects(()=>save(draft('duplicate','p1')));
 await assert.rejects(()=>save({...draft('open-job','open'),materials:[]}),/stato pratica Vinta/);
 await assert.rejects(()=>save({...job,materials:[{...job.materials[0],quantity:0}]}));
 assert.equal((await db.query("select version from procurement_jobs where id='j1'")).rows[0].version,2);
});
test('orders, connection and works require a real first payment from the same practice',async()=>{
 await assert.rejects(()=>save({...job,connection:'Aperta'}),/pagamento iniziale/);
 await assert.rejects(()=>save({...job,installments:[{...job.installments[0],invoiceId:'i2'}]}),/stessa pratica/);
 const paid={...job,installments:[{...job.installments[0],invoiceId:'i1'}],connection:'Aperta',orders:[{id:'ord1',supplierId:'s1',reference:'QA',status:'Ordinato'}]};
 job=await save(paid);assert.equal(job.version,3);assert.equal(job.connection,'Aperta');
 await assert.rejects(()=>save({...job,materials:[]}),/già ordinati/);
});
test('selected catalog history cannot be deleted while referenced by a saved job',async()=>{
 await assert.rejects(()=>db.query("delete from procurement_offer_history where offer_id='o1'"));
 assert.equal((await db.query('select count(*)::int n from procurement_job_materials')).rows[0].n,1);
});
test('anonymous and ordinary authenticated roles cannot create jobs through RPC',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(()=>save(draft()));}finally{await db.exec('reset role');}}
});
test.after(async()=>{await db.close();});
