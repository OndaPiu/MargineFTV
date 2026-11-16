import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {Catalog,Job} from './procurement';
const local=()=>process.env.NODE_ENV!=='production'&&process.env.PROCUREMENT_LOCAL_PREVIEW==='1';
const root=()=>path.resolve(process.cwd(),'private/procurement');
export const localPreview=local;
export async function catalog():Promise<Catalog>{
 if(local())return JSON.parse(await readFile(path.join(root(),'catalog.json'),'utf8'));
 const data=await request('procurement_catalog?select=data&id=eq.main');
 if(!data[0])throw new Error('Catalogo da importare.');
 return data[0].data;
}
async function request(resource:string,init:RequestInit={}){
 const base=process.env.SUPABASE_URL?.replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw new Error('Archivio commesse non configurato.');
 const res=await fetch(base+'/rest/v1/'+resource,{...init,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...init.headers},cache:'no-store'});
 if(!res.ok)throw new Error('Archivio commesse non disponibile ('+res.status+'). Verifica la migrazione.');
 const text=await res.text();return text?JSON.parse(text):null;
}
export async function allJobs():Promise<Job[]>{
 if(local())return [];
 const rows=await request('procurement_jobs?select=data,version&order=id.asc');
 return rows.map((r:{data:Job;version:number})=>({...r.data,version:r.version}));
}
export async function saveJob(job:Job){
 if(local())throw new Error('Anteprima: il salvataggio richiede il database configurato.');
 const next={...job,version:job.version+1};
 if(job.version===0){
  await request('procurement_jobs',{method:'POST',body:JSON.stringify({id:job.id,practice_id:job.practiceId,data:next,version:1})});
 }else{
  const rows=await request('procurement_jobs?id=eq.'+encodeURIComponent(job.id)+'&version=eq.'+job.version,
   {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data:next,version:next.version})});
  if(!rows.length)throw new Error('La commessa è cambiata. Ricarica prima di salvare.');
 }
 return next;
}
export async function sourceDocument(id:string){
 const c=await catalog();const document=c.documents.find(d=>d.id===id);
 if(!document||!local())return null;
 // Only basenames declared in the private manifest are accepted.
 if(path.basename(document.sourceFile)!==document.sourceFile)return null;
 return {name:document.sourceFile,bytes:await readFile(path.join(root(),document.sourceFile))};
}
