import {blankPractice,euro,isoDate,type Practice,type Invoice} from './model';
const addMonths=(base:Date,n:number)=>{const d=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+n,1));return d.toISOString().slice(0,10)};
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const field=(raw:Record<string,any>,name:string)=>{
 const templated=`{{opportunity.${name}}}`;
 const candidates=[raw[name],raw.opportunity?.[name],raw.customData?.[name],raw.customData?.[templated],raw.customData?.opportunity?.[name],raw.customData?.fields?.[name],raw.customData?.fields?.[templated]];
 const direct=candidates.find(v=>v!==undefined&&v!==null&&v!=='');if(direct!==undefined)return direct;
 const all={...raw,...(raw.customData||{})};
 const wanted=`opportunity.${name}`.toLowerCase();
 const found=Object.entries(all).find(([k,v])=>k.replace(/[{}]/g,'').toLowerCase()===wanted&&v!==undefined&&v!==null&&v!=='');
 return found?.[1];
};
export function parseLeadora(raw:Record<string,any>,existing?:Practice){
 const location=str(raw.location?.id),contact=str(raw.contact_id);if(!location||!contact)throw new Error('Servono location.id e contact_id');
 const contactData={id:`leadora:${location}:contact:${contact}`,name:str(raw.full_name),email:str(raw.email),phone:str(raw.phone),company:str(raw.company_name),country:str(raw.country),createdAt:str(raw.date_created)};
 if(!raw.id||!Object.hasOwn(raw,'opportunity_name'))return {contact:contactData,practice:null};
 const id=`leadora:${location}:opportunity:${str(raw.id)}`;const p:Practice=existing?structuredClone(existing):blankPractice(id);
 p.id=id;p.source='Leadora';p.contactId=contact;
 if(Object.hasOwn(raw,'opportunity_name'))p.name=str(raw.opportunity_name);
 if(Object.hasOwn(raw,'owner'))p.agent=str(raw.owner);
 if(field(raw,'fornitore')!==undefined)p.partner=str(field(raw,'fornitore'));
 if(field(raw,'misura')!==undefined)p.measure=str(field(raw,'misura'));
 if(field(raw,'codice_cliente_ondapiu')!==undefined)p.customerCode=str(field(raw,'codice_cliente_ondapiu'));
 if(Object.hasOwn(raw,'pipleline_stage'))p.state=str(raw.pipleline_stage);
 if(Object.hasOwn(raw,'lead_value'))p.amount=euro(raw.lead_value);
 if(field(raw,'_di_chiusura')!==undefined)p.probability=Number(field(raw,'_di_chiusura'));
 if(p.probability!==null)p.kind=p.probability>=100?'R':'S';
 if(!existing)p.closeDate=addMonths(new Date(),2);
 if(!p.marginDate&&p.closeDate)p.marginDate=addMonths(new Date(p.closeDate+'T00:00:00Z'),1);
 const weighted=p.amount!=null&&p.probability!=null?Math.round(p.amount*p.probability/100):null;
 if(weighted!=null){
  p.taxable=Math.round(weighted/1.1);
  const provisionalCost=p.cost??Math.round(weighted*.8), provisionalCommission=Math.round(weighted*(p.commissionRate??8)/100), provisionalSecond=weighted-provisionalCost-provisionalCommission;
  if(p.cost==null)p.cost=provisionalCost;
  p.secondMarginPercent=Number((provisionalSecond/p.taxable*100).toFixed(4));
  p.marginDate=addMonths(new Date(p.closeDate+'T00:00:00Z'),1);
  if(!p.revenues.length)p.revenues=[{date:p.marginDate,amount:weighted,number:'',sourceRow:0}];
 }
 if(Object.hasOwn(raw,'forecast_expected_close_date'))p.closeDate=isoDate(raw.forecast_expected_close_date);
 // No guessed field paths: source, user and Enerp descriptions never replace the description.
 p.review=[...new Set([...p.review,'Agente Leadora da verificare','Collegamento storico da verificare'])];
 return {contact:contactData,practice:p};
}
export function parseEnerp(raw:Record<string,unknown>):Invoice|null{
 const number=str(raw.NUMERO_DOCUMENTO);if(!number.startsWith('300-'))return null;
 const doc=str(raw.ID_DOCUMENTO);if(!doc)throw new Error('ID_DOCUMENTO mancante');
 const total=euro(raw.TOTALE),net=euro(raw.IMPONIBILE),tax=euro(raw.IVA),balance=euro(raw.TOTALE_PARTITARIO_CRAI);
 if(total==null||net==null||tax==null)throw new Error('Totale, imponibile e IVA sono obbligatori');
 const date=isoDate(raw.DATA_EMISSIONE);if(!date)throw new Error('Data emissione mancante');
 return {id:`enerp:document:${doc}`,number,date,dueDate:isoDate(raw.DATA_SCADENZA),customerCode:str(raw.CODICE_CLIENTE),customerName:str(raw.RAGIONE_SOCIALE),contractCode:str(raw.CODICE_CONTRATTO),total,net,tax,balance,paid:balance==null?null:balance<=0,practiceId:null,source:'Enerp',review:total!==net+tax?['Imponibile + IVA diversi dal totale']:[]};
}

