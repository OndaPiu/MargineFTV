import {jobCosts,materialLineTotal,firstPaymentReceived,type Job,type OperationalPractice,type OperationalInvoice} from '../../lib/procurement';
const eur=(cents:number|null)=>cents===null?'Da quotare':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(cents/100);
const date=(value?:string)=>value?value.split('-').reverse().join('/'):'Da registrare';
const qty=(value:number)=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:6}).format(value);
const vat=(value:boolean|null)=>value===true?'IVA inclusa':value===false?'IVA esclusa':'IVA da confermare';
export default function JobSummary({job,practice,invoices,onOpen}:{job:Job;practice?:OperationalPractice;invoices:OperationalInvoice[];onOpen:()=>void}){
 const costs=jobCosts(job),materials=job.materials||[],extras=job.extras||[];
 return <article className="p-job-summary" aria-label={'Commessa '+(practice?.name||job.practiceId)}>
  <div className="p-job-summary-head"><div><h3>{practice?.name||job.practiceId}</h3>
   {practice?.contractCode&&<p className="p-caption">{practice.contractCode}</p>}
   <div className="p-job-statuses"><span>{job.works}</span><span>{job.installments.length} rate</span><span>{firstPaymentReceived(job,invoices)?'Primo pagamento ricevuto':'In attesa del primo pagamento'}</span></div>
  </div><div className="p-job-cost"><span>Totale costi inseriti</span><strong>{eur(costs.total)}</strong><small>Materiali {eur(costs.materials)} · Extra {eur(costs.extras)}</small>{costs.incomplete&&<b>Totale parziale · voci da quotare</b>}<small>Importi secondo IVA delle righe</small></div></div>
  <div className="p-job-summary-body"><section><h4>Materiali · {materials.length}</h4>
   {materials.length?<ul>{materials.slice(0,4).map(m=><li key={m.id}><div><b>{qty(m.quantity)} {m.snapshot.unit} · {m.snapshot.brand?m.snapshot.brand+' · ':''}{m.snapshot.label}</b><small>{m.snapshot.supplierName} · {vat(m.snapshot.vatIncluded)}</small></div><strong>{eur(materialLineTotal(m))}</strong></li>)}</ul>:<p className="p-caption">Nessun materiale inserito</p>}
   {materials.length>4&&<p className="p-caption">Altri {materials.length-4} materiali: apri la commessa per la distinta completa.</p>}
  </section><section><h4>Extra · {extras.length}</h4>
   {extras.length?<ul>{extras.slice(0,3).map(e=><li key={e.id}><div><b>{e.description}</b><small>{e.supplierName||e.documentName||'Listino associato'} · {vat(e.vatIncluded)}</small></div><strong>{eur(e.amountCents)}</strong></li>)}</ul>:<p className="p-caption">Nessun extra inserito</p>}
   {extras.length>3&&<p className="p-caption">Altri {extras.length-3} extra nella commessa.</p>}
  </section></div>
  <div className="p-job-summary-footer"><div><span>Emmolo: <b>{job.connection}</b></span><span>Preventivo accettato: {date(practice?.acceptedDate)}</span><span>Fine effettiva lavori: {date(job.completedDate)}</span></div><button className="p-primary" onClick={onOpen}>Apri commessa</button></div>
 </article>;
}
