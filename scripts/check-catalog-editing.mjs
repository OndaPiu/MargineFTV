import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const {PGlite}=createRequire(import.meta.url)(process.env.PROCUREMENT_PGLITE_MODULE||'@electric-sql/pglite');const db=await PGlite.create();
await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table records(id text primary key,kind text,data jsonb);insert into records values('p1','practice','{}');");
await db.exec(await readFile(new URL('../supabase/procurement.sql',import.meta.url),'utf8'));
const migration=await readFile(new URL('../supabase/procurement-catalog-edit.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
const offer=id=>({id,supplierId:'s1',supplierName:'Fornitore QA',brand:'Marca QA',code:id,label:'Prodotto '+id,description:'Dati sintetici',category:'Inverter',section:'Listino',unit:'pezzo',currency:'EUR',documentId:'d1',documentDate:'2026-11',page:1,listPriceCents:10000,purchasePriceCents:10000,discountPercent:0,priceBasis:'net',vatIncluded:false,shippingCents:null,validUntil:null,validityStatus:'to-confirm',stockStatus:'unknown',review:[],verified:false,rawPrice:'100,00 EUR'});
await db.query('select import_procurement_catalog($1::jsonb)',[JSON.stringify({schemaVersion:1,suppliers:[{id:'s1',name:'Fornitore QA',brands:['Marca QA']}],documents:[{id:'d1',name:'Listino QA',date:'2026-11',supplierId:'s1',pages:2}],offers:[offer('a'),offer('b')]})]);
const current=async id=>(await db.query("select value from procurement_catalog c,jsonb_array_elements(c.data->'offers') where value->>'id'=$1",[id])).rows[0].value;
const update=async(id,changes,expected)=>db.query('select update_procurement_offer($1,$2::jsonb,$3::jsonb) as offer',[id,JSON.stringify(expected||await current(id)),JSON.stringify(changes)]);
const histories=async()=>(await db.query('select count(*)::int n from procurement_offer_history')).rows[0].n;
const initialA=await current('a'),initialB=await current('b');
await db.exec("insert into procurement_jobs(id,practice_id,data) values('j1','p1','{}');insert into procurement_purchase_orders(id,job_id) values('ord1','j1');insert into procurement_purchase_order_lines(id,order_id,offer_history_id,description,quantity,unit,unit_price_cents) values('line1','ord1',1,'Costo concordato',1,'pezzo',10000);");
test('editing updates catalog, supplier brands, provisional product and one price-history revision',async()=>{
 await update('a',{code:'NEW-A',label:'Nuovo prodotto A',brand:'Nuova marca',listPriceCents:12000,purchasePriceCents:12000});
 const a=await current('a');assert.equal(a.rawPrice,initialA.rawPrice);assert.equal(a.code,'NEW-A');assert.equal(a.manualRevision,1);
 const row=(await db.query("select purchase_price_cents,revision from procurement_supplier_offers where id='a'")).rows[0];assert.equal(Number(row.purchase_price_cents),12000);assert.equal(Number(row.revision),2);assert.equal(await histories(),3);
 assert.equal((await db.query("select code from procurement_products where id='source-product:a'")).rows[0].code,'NEW-A');
 assert.ok((await db.query('select data from procurement_catalog')).rows[0].data.suppliers[0].brands.includes('Nuova marca'));
});
test('a stale form is rejected, while editing another offer preserves concurrent changes',async()=>{
 await assert.rejects(()=>update('a',{code:'STALE'},initialA),e=>e.code==='PT409');
 await update('b',{description:'Scheda B aggiornata'},initialB);
 assert.equal((await current('a')).code,'NEW-A');assert.equal((await current('b')).description,'Scheda B aggiornata');
});
test('invalid prices, references and immutable fields roll back the whole transaction',async()=>{
 const before=await current('a'),n=await histories();
 for(const changes of [{purchasePriceCents:-1,listPriceCents:-1},{supplierId:'missing'},{documentId:'missing'},{page:999},{id:'renamed'}, {priceBasis:'gross',discountPercent:50,purchasePriceCents:11999},{vatIncluded:'false'}]){
  await assert.rejects(()=>update('a',changes));assert.deepEqual(await current('a'),before);assert.equal(await histories(),n);
 }
});
test('archive and restore synchronize both stores and retain historical purchase references',async()=>{
 const n=await histories();await update('a',{active:false});assert.equal((await current('a')).active,false);
 assert.equal((await db.query("select active from procurement_supplier_offers where id='a'")).rows[0].active,false);
 const archived=await current('a');await update('a',{active:false});assert.deepEqual(await current('a'),archived);assert.equal(await histories(),n+1);
 await update('a',{active:true});assert.equal((await current('a')).active,true);assert.equal((await current('a')).code,'NEW-A');assert.equal(await histories(),n+2);
 assert.equal(Number((await db.query("select unit_price_cents from procurement_purchase_order_lines where id='line1'")).rows[0].unit_price_cents),10000);
 assert.equal((await db.query('select count(*)::int n from procurement_supplier_offers')).rows[0].n,2);
});
test('a stale PDF import cannot overwrite manual corrections or reactivate archived offers',async()=>{
 await update('a',{active:false});const before=await current('a'),n=await histories();
 const stale={schemaVersion:1,suppliers:[{id:'s1',name:'Fornitore QA',brands:['Marca QA']},{id:'new-supplier',name:'Nuovo fornitore'}],documents:[{id:'d1',name:'Listino QA',date:'2026-11',supplierId:'s1',pages:2}],offers:[initialA,initialB]};
 await assert.rejects(()=>db.query('select import_procurement_catalog($1::jsonb)',[JSON.stringify(stale)]),e=>e.code==='PT409');
 assert.deepEqual(await current('a'),before);assert.equal(await histories(),n);
 assert.equal((await db.query("select count(*)::int n from procurement_suppliers where id='new-supplier'")).rows[0].n,0);
});
test('manual editing stores offer history without copying the entire catalog into new imports',async()=>{
 assert.equal((await db.query('select count(*)::int n from procurement_catalog_imports')).rows[0].n,1);
});
test('anonymous and ordinary authenticated users cannot execute the mutation RPC',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(()=>update('a',{active:false},{}));}finally{await db.exec('reset role');}}
});
test.after(async()=>{await db.close();});
