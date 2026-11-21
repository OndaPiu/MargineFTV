'use client';
import {useState} from 'react';
import {Plus,X} from 'lucide-react';
import type {Job,Catalog} from '../../lib/procurement';
export default function JobExtras({job,catalog,onChange}:{job:Job;catalog:Catalog;onChange:(job:Job)=>void}){
 const [documentId,setDocumentId]=useState('');
 const extras=job.extras||[],locked=job.orders.some(o=>o.status!=='Da ordinare');
 const selected=[...new Set((job.materials||[]).map(m=>m.snapshot.documentId))];
 const documents=[...catalog.documents].sort((a,b)=>Number(selected.includes(b.id))-Number(selected.includes(a.id)));
 return <section className="p-job-extras" aria-label="Extra per listino"><h3>Extra per listino</h3>
  <p className="p-caption">Trasporto, installazione o altri costi di questa commessa. Ogni riga viene conteggiata una volta nel totale.</p>
  {!locked&&<div className="p-filter-row"><label>Listino per extra<select value={documentId} onChange={e=>setDocumentId(e.target.value)}><option value="">Seleziona il listino</option>{documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><button disabled={!documentId||extras.length>=100} onClick={()=>onChange({...job,extras:[...extras,{id:crypto.randomUUID(),documentId,description:'Extra',amountCents:null,vatIncluded:null}]})}><Plus size={15}/>Aggiungi extra</button></div>}
  {extras.map(extra=>{
   const name=extra.documentName||catalog.documents.find(d=>d.id===extra.documentId)?.name||extra.documentId;
   const update=(changes:Partial<typeof extra>)=>onChange({...job,extras:extras.map(e=>e.id===extra.id?{...e,...changes}:e)});
   return <article className="p-material-line" key={extra.id}><b>{name}</b><div className="p-editor-grid">
    <label>Descrizione extra<input aria-label={'Descrizione extra '+extra.id} disabled={locked} maxLength={500} value={extra.description} onChange={e=>update({description:e.target.value})} placeholder="Es. Trasporto o installazione"/></label>
    <label>Importo extra (€)<input aria-label={'Importo extra '+extra.id} disabled={locked} type="number" min="0" max="10000000000" step="0.01" value={extra.amountCents===null?'':extra.amountCents/100} onChange={e=>update({amountCents:e.target.value===''?null:Math.round(Number(e.target.value)*100)})}/></label>
    <label>IVA extra<select aria-label={'IVA extra '+extra.id} disabled={locked} value={extra.vatIncluded===null?'unknown':extra.vatIncluded?'included':'excluded'} onChange={e=>update({vatIncluded:e.target.value==='unknown'?null:e.target.value==='included'})}><option value="unknown">Da confermare</option><option value="excluded">IVA esclusa</option><option value="included">IVA inclusa</option></select></label>
   </div><button disabled={locked} aria-label={'Rimuovi extra '+extra.id} onClick={()=>onChange({...job,extras:extras.filter(e=>e.id!==extra.id)})}><X size={15}/>Rimuovi extra</button></article>;
  })}
  {!extras.length&&<p className="p-caption">Nessun extra inserito.</p>}
  {locked&&<p className="p-caption">Gli extra sono bloccati insieme ai materiali dopo la registrazione di un ordine.</p>}
 </section>;
}
