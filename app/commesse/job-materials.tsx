'use client';
import {useMemo,useState} from 'react';
import {Plus,Search,X} from 'lucide-react';
import JobExtras from './job-extras';
import {materialFromOffer,materialLineTotal,jobCosts,draftOrdersForMaterials,type Job,type Catalog,type Offer} from '../../lib/procurement';
const eur=(cents:number|null)=>cents===null?'Da quotare':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:3}).format(cents/100);
export default function JobMaterials({job,catalog,today,onChange}:{job:Job;catalog:Catalog;today:string;onChange:(job:Job)=>void}){
 const [search,setSearch]=useState(''),[supplier,setSupplier]=useState(''),[page,setPage]=useState(0);
 const lines=job.materials||[],locked=job.orders.some(o=>o.status!=='Da ordinare');
 const results=useMemo(()=>{
  const terms=search.trim().toLocaleLowerCase('it').split(/\s+/).filter(Boolean);
  return catalog.offers.filter(o=>o.active!==false&&(!supplier||o.supplierId===supplier)&&terms.every(t=>[o.label,o.code,o.brand,o.description,o.supplierName].join(' ').toLocaleLowerCase('it').includes(t)));
 },[catalog,search,supplier]);
 const groups=[...new Set(lines.map(m=>m.snapshot.supplierId))].map(id=>({id,lines:lines.filter(m=>m.snapshot.supplierId===id)}));
 const costs=jobCosts(job);
 function add(o:Offer){
  const existing=lines.find(m=>m.offerId===o.id);
  const materials=existing?lines.map(m=>m.id===existing.id?{...m,quantity:Math.min(1000000,m.quantity+1)}:m):[...lines,materialFromOffer(o,catalog,crypto.randomUUID())];
  onChange({...job,materials});
 }
 return <section className="p-job-materials" aria-label="Materiali della commessa"><h3>Materiali della commessa · {lines.length}</h3>
  <p className="p-caption">Seleziona i prodotti dai listini. Al salvataggio vengono fissati prezzo, descrizione e fornitore; gli aggiornamenti successivi del catalogo non li cambiano.</p>
  {locked?<p className="p-warning">I materiali sono bloccati perché è già stato registrato un ordine. Per modificarli occorre rivedere prima l’ordine.</p>:<>
   <div className="p-material-search"><label className="p-search"><Search size={16}/><input aria-label="Cerca prodotti per la commessa" placeholder="Nome, sigla, marca, caratteristiche…" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
    <label>Fornitore materiali<select value={supplier} onChange={e=>{setSupplier(e.target.value);setPage(0);}}><option value="">Tutti i fornitori</option>{catalog.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   </div><div className="p-material-results">{results.slice(page*8,(page+1)*8).map(o=><article key={o.id}>
    <div><b>{o.brand?o.brand+' · ':''}{o.label}</b><small>{o.supplierName} · {o.unit} · {eur(o.purchasePriceCents)} {o.vatIncluded===false?'IVA esclusa':o.vatIncluded===true?'IVA inclusa':'IVA da confermare'}</small>
     {o.validUntil&&o.validUntil<today&&<small className="p-attention">Offerta scaduta il {o.validUntil}: verificare le condizioni</small>}</div>
    <button disabled={lines.length>=500} aria-label={'Aggiungi '+o.label+' alla commessa'} onClick={()=>add(o)}><Plus size={15}/>Aggiungi</button>
   </article>)}{!results.length&&<p>Nessun prodotto attivo corrisponde ai filtri.</p>}</div>
   <div className="p-pagination"><span>{results.length} prodotti trovati · pagina {page+1} di {Math.max(1,Math.ceil(results.length/8))}</span><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Indietro prodotti</button><button disabled={(page+1)*8>=results.length} onClick={()=>setPage(p=>p+1)}>Altri prodotti</button></div>
  </>}
  {lines.map(m=>{
   const s=m.snapshot,current=catalog.offers.find(o=>o.id===m.offerId);
   const warnings=[...s.review,...(current&&current.purchasePriceCents!==s.unitPriceCents?['Il prezzo del catalogo è cambiato: la commessa mantiene il prezzo selezionato']:[]),...(current?.stockStatus==='unavailable'&&s.stockStatus!=='unavailable'?['Disponibilità attuale: prodotto non disponibile']:[]),...(!s.verified?['Caratteristiche da verificare']:[]),...(s.validUntil&&s.validUntil<today?['Offerta selezionata scaduta']:s.validityStatus!=='dated'?['Validità da confermare']:[]),...(s.stockStatus==='unknown'?['Disponibilità da confermare']:s.stockStatus==='unavailable'?['Prodotto non disponibile']:[]),...(!current||current.active===false?['Voce non più nel catalogo attivo: riga salvata conservata']:[])];
   return <article className="p-material-line" key={m.id}><div><b>{s.brand?s.brand+' · ':''}{s.label}</b><small>{s.code||'Codice non indicato'} · {s.supplierName}</small><p className="p-caption">{s.description}</p><small>{s.documentName}{s.page?' · pagina '+s.page:''} · {s.vatIncluded===false?'IVA esclusa':s.vatIncluded===true?'IVA inclusa':'IVA da confermare'}</small>
    {warnings.length>0&&<details><summary>Avvertenze · {warnings.length}</summary>{warnings.map((w,i)=><p className="p-caption" key={i}>{w}</p>)}</details>}</div>
    <div className="p-material-numbers"><label>Quantità · {s.unit}<input aria-label={'Quantità '+s.label} type="number" min="0.000001" max="1000000" step="any" disabled={locked} value={m.quantity} onChange={e=>onChange({...job,materials:lines.map(x=>x.id===m.id?{...x,quantity:Number(e.target.value)}:x)})}/></label><span>{eur(s.unitPriceCents)} / {s.unit}</span><strong>{eur(materialLineTotal(m))}</strong><button disabled={locked} aria-label={'Rimuovi '+s.label+' dalla commessa'} onClick={()=>onChange({...job,materials:lines.filter(x=>x.id!==m.id)})}><X size={15}/></button></div>
   </article>;
  })}
  {!lines.length&&<p className="p-caption">Nessun materiale selezionato. Puoi salvare la commessa e completare la distinta in seguito.</p>}
  <JobExtras job={job} catalog={catalog} onChange={onChange}/>
  <div className="p-material-total"><span>Materiali quotati</span><strong>{eur(costs.materials)}</strong></div>
  <div className="p-material-total"><span>Extra quotati</span><strong>{eur(costs.extras)}</strong></div>
  <div className="p-material-total"><span>Totale costi commessa · materiali + extra</span><strong>{eur(costs.total)}</strong></div>
  {costs.incomplete&&<p className="p-warning">Il totale è incompleto: alcuni materiali o extra sono ancora da quotare.</p>}
  <p className="p-caption">Somma degli importi inseriti, senza conversione IVA: le condizioni sono indicate per ciascuna riga. Trasporto e installazione vanno aggiunti negli extra. Per aggiornare un prezzo prima dell’ordine, rimuovi la riga e seleziona di nuovo il prodotto.</p>
  {lines.length>0&&<>
   <div className="p-material-groups">{groups.map(g=><div key={g.id||'unknown'}><b>{g.lines[0].snapshot.supplierName}</b><span>{g.lines.length} materiali + extra · {eur(g.lines.reduce((sum,m)=>sum+(materialLineTotal(m)??0),0)+(job.extras||[]).filter(e=>(e.supplierId||catalog.documents.find(d=>d.id===e.documentId)?.supplierId)===g.id).reduce((sum,e)=>sum+(e.amountCents??0),0))}</span></div>)}</div>
   <button disabled={locked||!groups.some(g=>g.id)} onClick={()=>onChange({...job,orders:draftOrdersForMaterials(job)})}>Prepara ordini per fornitore</button><p className="p-caption">Crea soltanto le bozze nella commessa: nessun ordine viene inviato al fornitore.</p>
  </>}
 </section>;
}
