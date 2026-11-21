import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let PGlite;
try{({PGlite}=require(process.env.PROCUREMENT_PGLITE_MODULE||'@electric-sql/pglite'));}
catch{throw new Error('Installa @electric-sql/pglite per il collaudo SQL, oppure imposta PROCUREMENT_PGLITE_MODULE.');}
const db=await PGlite.create();
const schema=await readFile(new URL('../supabase/procurement.sql',import.meta.url),'utf8');
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table public.records(id text primary key,kind text not null,data jsonb not null,version integer not null default 1);
 insert into public.records values('p1','practice','{}',1),('p2','practice','{}',1),
 ('i1','invoice','{"practiceId":"p1","paid":true}',1),('i2','invoice','{"practiceId":"p2","paid":false}',1);
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
await db.exec(schema);
const fixture=()=>({schemaVersion:1,
 suppliers:[{id:'s1',name:'Fornitore di prova',brands:['Marca di prova']}],
 documents:[{id:'d1',name:'Listino dimostrativo',supplierId:'s1',date:'2026-11',sourceFile:'demo.pdf',vatIncluded:false}],
 offers:[{id:'o1',supplierId:'s1',supplierName:'Fornitore di prova',brand:'Marca di prova',code:'QA-1',label:'Prodotto di collaudo',description:'Dati sintetici',category:'Cavi',unit:'metro',currency:'EUR',documentId:'d1',page:1,listPriceCents:121,discountPercent:50,purchasePriceCents:60.5,priceBasis:'gross',vatIncluded:false,validUntil:null,review:[],verified:false,stockStatus:'unknown'}]});
const apply=data=>db.query('select public.import_procurement_catalog($1::jsonb) as result',[JSON.stringify(data)]);
await apply(fixture());

test('migration is repeatable and creates the 17 protected tables and a private document bucket',async()=>{
 await db.exec(schema);
 const tables=await db.query("select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' and relname like 'procurement_%'");
 assert.equal(tables.rows.length,17);assert.ok(tables.rows.every(r=>r.relrowsecurity));
 assert.equal((await db.query("select public from storage.buckets where id='margine-procurement-documents'")).rows[0].public,false);
});
test('import preserves prices, nullable VAT, month precision and the compatible catalog snapshot',async()=>{
 const row=(await db.query("select purchase_price_cents,vat_included,stock_status from procurement_supplier_offers where id='o1'")).rows[0];
 assert.equal(Number(row.purchase_price_cents),60.5);assert.equal(row.vat_included,false);assert.equal(row.stock_status,'unknown');
 const doc=(await db.query("select issued_on,source_date_label from procurement_documents where id='d1'")).rows[0];
 assert.equal(doc.issued_on,null);assert.equal(doc.source_date_label,'2026-11');
 assert.deepEqual((await db.query('select data from procurement_catalog')).rows[0].data,fixture());
});
test('replaying the same import does not add price-history rows',async()=>{
 const before=(await db.query('select count(*)::int as n from procurement_offer_history')).rows[0].n;
 const result=(await apply(fixture())).rows[0].result;assert.equal(result.alreadyImported,true);
 assert.equal((await db.query('select count(*)::int as n from procurement_offer_history')).rows[0].n,before);
});
test('a changed offer records history; confirmed product associations survive reimport',async()=>{
 await db.query("insert into procurement_products(id,name,provisional) values('curated-product','Prodotto verificato',false)");
 await db.query("update procurement_supplier_offers set product_id='curated-product' where id='o1'");
 const changed=fixture();changed.offers[0].purchasePriceCents=55;
 await apply(changed);
 const current=(await db.query("select product_id,purchase_price_cents from procurement_supplier_offers where id='o1'")).rows[0];
 assert.equal(current.product_id,'curated-product');assert.equal(Number(current.purchase_price_cents),55);
 const history=(await db.query("select purchase_price_cents from procurement_offer_history where offer_id='o1' order by revision")).rows;
 assert.ok(history.some(r=>Number(r.purchase_price_cents)===60.5));assert.equal(Number(history.at(-1).purchase_price_cents),55);
});
test('an invalid import rolls back suppliers, import history and the compatible snapshot',async()=>{
 const before=(await db.query('select data from procurement_catalog')).rows[0].data;
 const bad=fixture();bad.suppliers.push({id:'bad-new',name:'Non deve restare',brands:[]});bad.offers[0].purchasePriceCents=-1;
 await assert.rejects(()=>apply(bad));
 assert.equal((await db.query("select count(*)::int as n from procurement_suppliers where id='bad-new'")).rows[0].n,0);
 assert.deepEqual((await db.query('select data from procurement_catalog')).rows[0].data,before);
});
test('records of the wrong kind and invoices belonging to another practice are rejected',async()=>{
 await assert.rejects(()=>db.query("insert into procurement_jobs(id,practice_id,data) values('wrong','i1','{}')"));
 await db.query("insert into procurement_jobs(id,practice_id,data) values('j1','p1','{\"completedDate\":\"2026-11-20\"}')");
 await assert.rejects(()=>db.query("insert into procurement_installments(id,job_id,position,kind,invoice_id) values('bad-invoice','j1',1,'Saldo','i2')"));
 await db.query("insert into procurement_installments(id,job_id,position,kind,invoice_id) values('rate1','j1',1,'Saldo','i1')");
 await assert.rejects(()=>db.query("insert into procurement_installments(id,job_id,position,kind,invoice_id) values('duplicate-invoice','j1',2,'Saldo','i1')"));
 assert.equal((await db.query("select data->>'completedDate' as date from procurement_jobs where id='j1'")).rows[0].date,'2026-11-20');
});
test('order lines preserve the agreed price and round only after multiplying quantity',async()=>{
 await db.query("insert into procurement_purchase_orders(id,job_id,supplier_id) values('order1','j1','s1')");
 await db.query("insert into procurement_purchase_order_lines(id,order_id,description,quantity,unit,unit_price_cents) values('line1','order1','Cavo di prova',100,'metro',60.5)");
 assert.equal(Number((await db.query("select line_total_cents from procurement_purchase_order_lines where id='line1'")).rows[0].line_total_cents),6050);
 await db.query("update procurement_supplier_offers set purchase_price_cents=99 where id='o1'");
 assert.equal(Number((await db.query("select unit_price_cents from procurement_purchase_order_lines where id='line1'")).rows[0].unit_price_cents),60.5);
 await assert.rejects(()=>db.query("insert into procurement_purchase_order_lines(order_id,description,quantity,unit) values('order1','Quantità invalida',0,'pezzo')"));
});
test('product alternatives require an explicit compatibility note before approval',async()=>{
 await assert.rejects(()=>db.query("insert into procurement_product_alternatives(product_id,alternative_product_id,status,approved_at) values('source-product:o1','curated-product','approved',now())"));
 await db.query("insert into procurement_product_alternatives(product_id,alternative_product_id,status,approved_at,compatibility_notes) values('source-product:o1','curated-product','approved',now(),'Compatibilità verificata dal responsabile')");
});
test('anonymous and ordinary authenticated roles cannot access tables or import RPC',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  try{
   await assert.rejects(()=>db.query('select * from public.procurement_suppliers'));
   await assert.rejects(()=>db.query("select public.import_procurement_catalog('{}')"));
  }finally{await db.exec('reset role');}
 }
 await db.exec('set role service_role');
 try{assert.equal((await db.query('select count(*)::int as n from public.procurement_suppliers')).rows[0].n,1);}finally{await db.exec('reset role');}
});
test.after(async()=>{await db.close();});
