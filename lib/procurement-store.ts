import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {Catalog,Job,Offer} from './procurement';
import {procurementReadOnly} from './procurement-mode.mjs';
import {decodePrivateCatalog} from './procurement-catalog';
const local=()=>process.env.NODE_ENV!=='production'&&process.env.PROCUREMENT_LOCAL_PREVIEW==='1';
const root=()=>path.resolve(process.cwd(),'private/procurement');
export const localPreview=local;
export async function catalog():Promise<Catalog>{
 if(local())return JSON.parse(await readFile(path.join(root(),'catalog.json'),'utf8'));
 if(process.env.PROCUREMENT_CATALOG_GZIP_BASE64)return decodePrivateCatalog(process.env.PROCUREMENT_CATALOG_GZIP_BASE64);
 const data=await request('procurement_catalog?select=data&id=eq.main');
 if(!data[0])throw new Error('Catalogo da importare.');
 return data[0].data;
}
export class CatalogUpdateError extends Error{
 constructor(message:string,public status:number){super(message);}
}
export async function updateCatalogOffer(id:string,expected:Record<string,unknown>,changes:unknown):Promise<Offer>{
 return request('rpc/update_procurement_offer',{method:'POST',body:JSON.stringify({p_offer_id:id,p_expected:expected,p_changes:changes})});
}
async function request(resource:string,init:RequestInit={}){
 const base=process.env.SUPABASE_URL?.replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw new Error('Archivio commesse non configurato.');
 const res=await fetch(base+'/rest/v1/'+resource,{...init,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...init.headers},cache:'no-store'});
 if(!res.ok){
  if(resource==='rpc/update_procurement_offer'||resource==='rpc/save_procurement_job'){
   if(resource==='rpc/save_procurement_job'){
    if(res.status===409){const problem=await res.json().catch(()=>null) as {message?:unknown}|null;throw new CatalogUpdateError(typeof problem?.message==='string'&&problem.message.startsWith('Il prezzo del listino')?problem.message:'La commessa è cambiata. Ricarica i dati prima di salvare.',409);}
    if(res.status===400){const problem=await res.json().catch(()=>null) as {message?:unknown}|null;throw new CatalogUpdateError(typeof problem?.message==='string'?problem.message:'Controlla i dati della commessa.',400);}
    throw new CatalogUpdateError('Salvataggio commessa non disponibile. Verifica l’aggiornamento dell’archivio.',503);
   }
   if(res.status===409)throw new CatalogUpdateError('La voce è stata aggiornata. Ricarica il catalogo e riapri la scheda prima di salvare.',409);
   if(res.status===404)throw new CatalogUpdateError('Voce non trovata o aggiornamento del catalogo non ancora installato.',404);
   throw new CatalogUpdateError('Modifica non salvata. Controlla i dati e la configurazione del catalogo.',res.status===400?400:503);
  }
  throw new Error('Archivio commesse non disponibile ('+res.status+'). Verifica la migrazione.');
 }
 const text=await res.text();return text?JSON.parse(text):null;
}
export async function allJobs():Promise<Job[]>{
 if(procurementReadOnly())return [];
 const rows=await request('procurement_jobs?select=data,version&order=id.asc');
 return rows.map((r:{data:Job;version:number})=>({...r.data,version:r.version}));
}
export async function saveJob(job:Job){
 if(procurementReadOnly())throw new Error('Sezione in lavorazione: i salvataggi sono disabilitati.');
 return request('rpc/save_procurement_job',{method:'POST',body:JSON.stringify({p_job:job})});
}
export async function sourceDocument(id:string){
 const c=await catalog();const document=c.documents.find(d=>d.id===id);
 if(!document||!local())return null;
 // Only basenames declared in the private manifest are accepted.
 if(path.basename(document.sourceFile)!==document.sourceFile)return null;
 return {name:document.sourceFile,bytes:await readFile(path.join(root(),document.sourceFile))};
}
