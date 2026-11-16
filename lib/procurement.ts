export type Offer = {
 id:string; supplierId:string|null; supplierName:string; brand:string|null; code:string;
 label:string; description:string; category:string; section:string;
 listPriceCents:number|null; purchasePriceCents:number|null; priceBasis:'gross'|'net'|null;
 discountPercent:number|null; currency:string; vatIncluded:boolean|null; unit:string;
 documentId:string; documentDate:string|null; validUntil:string|null;
 validityStatus:string; stockStatus:string; page:number; review:string[]; verified:boolean;
};
export type Catalog = {
 schemaVersion:number;
 suppliers:{id:string;name:string;brands:string[];brandEvidence?:string}[];
 documents:{id:string;name:string;supplierId:string|null;date:string|null;validUntil:string|null;sourceFile:string;pages:number}[];
 offers:Offer[];
};
export type OperationalPractice={id:string;name:string;practiceStatus:string;state:string;acceptedDate?:string;customerCode:string;contractCode:string;power:number|null;storage:number|null};
export type OperationalInvoice={id:string;number:string;date:string;total:number;paid:boolean|null;practiceId:string|null;source:string};
export type Installment={
 id:string;kind:'Deposito cauzionale'|'Acconto'|'Saldo';milestone:string;
 amountCents:number|null;dueDate:string;invoiceId:string|null;
 manualReference:string;manualPaidDate:string;
};
export type Job={
 id:string;practiceId:string;version:number;installments:Installment[];
 connection:'Da aprire'|'Aperta'|'In lavorazione'|'Completata';
 works:'Da avviare'|'In corso'|'Conclusi';
 completedDate?:string;
 orders:{id:string;supplierId:string;reference:string;status:'Da ordinare'|'Ordinato'|'Consegnato'}[];
 notes:string;
};
export function eligiblePractice(p:Pick<OperationalPractice,'practiceStatus'|'state'>){
 const normalized=(s:string)=>s.trim().toLocaleLowerCase('it').replace(/\s+/g,' ');
 return ['vinta','won'].includes(normalized(p.practiceStatus))&&normalized(p.state)==='preventivo accettato';
}
export function paymentPlan(count:1|2|3):Installment[]{
 const kinds:Installment['kind'][]=count===1?['Saldo']:count===2?['Acconto','Saldo']:['Deposito cauzionale','Acconto','Saldo'];
 return kinds.map((kind,i)=>({id:'rata-'+(i+1),kind,milestone:i===0?'Accettazione':count===2?'Durante i lavori / verso la fine':i===1?'Inizio lavori':'Fine lavori',
 amountCents:null,dueDate:'',invoiceId:null,manualReference:'',manualPaidDate:''}));
}
export function installmentPaid(i:Installment,invoices:OperationalInvoice[]){
 if(i.invoiceId)return invoices.find(x=>x.id===i.invoiceId)?.paid===true;
 return Boolean(i.manualReference.trim()&&i.manualPaidDate);
}
export function firstPaymentReceived(job:Job,invoices:OperationalInvoice[]){
 return Boolean(job.installments[0]&&installmentPaid(job.installments[0],invoices));
}
export function withCompletionDate(previous:Job|undefined,updated:Job,today:string):Job{
 const next={...updated,completedDate:updated.completedDate??previous?.completedDate??''};
 // Existing concluded jobs without a date require a historical date, not today's date.
 if(next.works==='Conclusi'&&previous?.works!=='Conclusi'&&!next.completedDate)return {...next,completedDate:today};
 return next;
}
export function validateJob(job:Job,invoices:OperationalInvoice[]){
 if(![1,2,3].includes(job.installments.length))throw new Error('Seleziona da una a tre rate.');
 const expected=paymentPlan(job.installments.length as 1|2|3);
 const linked=new Set<string>();
 job.installments.forEach((i,index)=>{
  if(i.kind!==expected[index].kind)throw new Error('La sequenza delle rate non è valida.');
  if(i.amountCents!==null&&(!Number.isSafeInteger(i.amountCents)||i.amountCents<0))throw new Error('Importo rata non valido.');
  if(i.invoiceId){
   const invoice=invoices.find(x=>x.id===i.invoiceId&&x.practiceId===job.practiceId);
   if(!invoice)throw new Error('Collega una fattura della stessa pratica.');
   if(linked.has(i.invoiceId))throw new Error('Una fattura non può coprire due rate.');
   if(i.manualReference||i.manualPaidDate)throw new Error('Usa il pagamento della fattura collegata.');
   linked.add(i.invoiceId);
  }else if(i.manualPaidDate&&!i.manualReference.trim())throw new Error('Indica il documento del pagamento manuale.');
 });
 const active=job.orders.some(o=>o.status!=='Da ordinare')||job.connection!=='Da aprire'||job.works!=='Da avviare';
 if(active&&!firstPaymentReceived(job,invoices))throw new Error('Registra prima il pagamento iniziale per avviare ordini, connessione e lavori.');
 if(job.completedDate&&job.works!=='Conclusi')throw new Error('La fine effettiva dei lavori richiede lo stato Conclusi.');
}
export function offerWarnings(o:Offer,today:string){
 return [...o.review,...(!o.verified?['Dati estratti: da verificare']:[]),
 ...(o.validUntil&&o.validUntil<today?['Offerta scaduta']:o.validityStatus!=='dated'?['Validità da confermare']:[]),
 ...(o.vatIncluded===null?['IVA da confermare']:[]),...(o.stockStatus==='unknown'?['Disponibilità da confermare']:[])];
}
