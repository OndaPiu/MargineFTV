import {gunzipSync} from 'node:zlib';
import type {Catalog} from './procurement';
/** Private server configuration; never import this module into client components. */
export function decodePrivateCatalog(encoded:string):Catalog{
 if(encoded.length>65536||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error('Catalogo riservato non valido.');
 const text=gunzipSync(Buffer.from(encoded,'base64'),{maxOutputLength:8*1024*1024}).toString('utf8');
 const data=JSON.parse(text) as Catalog;
 if(data.schemaVersion!==1||!Array.isArray(data.offers)||!Array.isArray(data.suppliers)||!Array.isArray(data.documents))
  throw new Error('Formato catalogo riservato non valido.');
 const ids=new Set<string>();
 for(const o of data.offers){
  if(typeof o.id!=='string'||ids.has(o.id)||typeof o.label!=='string'||typeof o.description!=='string'
   ||!data.documents.some(d=>d.id===o.documentId)
   ||(o.supplierId!==null&&!data.suppliers.some(s=>s.id===o.supplierId))
   ||(o.purchasePriceCents!==null&&(!Number.isFinite(o.purchasePriceCents)||o.purchasePriceCents<0)))
   throw new Error('Voce del catalogo riservato non valida.');
  ids.add(o.id);
 }
 return data;
}
