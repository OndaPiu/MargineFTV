// Dry run by default. Credentials come from the environment, never from arguments.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const args=process.argv.slice(2);
if(args.some(a=>a!=='--apply'))throw new Error('Uso: node --env-file=.env.local scripts/import-procurement-catalog.mjs [--apply]');
const data=JSON.parse(await readFile(path.resolve('private/procurement/catalog.json'),'utf8'));
if(data.schemaVersion!==1||!Array.isArray(data.offers)||!Array.isArray(data.suppliers)||!Array.isArray(data.documents))throw new Error('Catalogo non valido.');
const ids=new Set();
for(const o of data.offers){
 if(!o.id||ids.has(o.id))throw new Error('Identificativi catalogo non validi.');
 ids.add(o.id);
 if(o.supplierId&&!data.suppliers.some(s=>s.id===o.supplierId))throw new Error('Fornitore non trovato.');
 if(!data.documents.some(d=>d.id===o.documentId))throw new Error('Documento non trovato.');
 if(o.listPriceCents!==null&&o.priceBasis==='gross'&&o.purchasePriceCents!==null&&(o.discountPercent===null||o.discountPercent<0||o.discountPercent>100||Math.abs(o.purchasePriceCents-o.listPriceCents*(1-o.discountPercent/100))>0.0001))throw new Error('Sconto lordo non valido.');
 if(o.priceBasis==='net'&&o.purchasePriceCents!==o.listPriceCents)throw new Error('Prezzo netto modificato.');
}
console.log(JSON.stringify({offers:data.offers.length,suppliers:data.suppliers.length,documents:data.documents.length,mode:args.includes('--apply')?'apply':'dry-run'}));
if(args.includes('--apply')){
 const base=process.env.SUPABASE_URL?.replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw new Error('Configura SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
 delete data.extractionAudit;
 const response=await fetch(base+'/rest/v1/rpc/import_procurement_catalog',{method:'POST',
 headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
 body:JSON.stringify({p_catalog:data})});
 if(!response.ok)throw new Error('Importazione non riuscita: HTTP '+response.status);
 console.log(JSON.stringify(await response.json()));
 console.log('Catalogo e tabelle collegate importati nella stessa transazione.');
}
