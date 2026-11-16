import type {OperationalInvoice,OperationalPractice} from './procurement';
type PreviewRecord={id:string;kind:string;data:Record<string,unknown>;version:number};
export function realPreviewEnabled(){
 return process.env.NODE_ENV!=='production'&&process.env.PROCUREMENT_LOCAL_PREVIEW==='1'
  &&Boolean(process.env.PROCUREMENT_READ_ONLY_SOURCE_URL);
}
export async function readPreviewSnapshot(){
 if(!realPreviewEnabled())throw new Error('Anteprima dati reali non configurata.');
 const url=new URL(process.env.PROCUREMENT_READ_ONLY_SOURCE_URL!);
 if(url.protocol!=='https:'||url.username||url.password)throw new Error('La fonte dati deve essere un indirizzo HTTPS.');
 const response=await fetch(url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error('Archivio reale non disponibile ('+response.status+').');
 const payload=await response.json() as {entities?:unknown;events?:unknown;seedAvailable?:boolean};
 if(!Array.isArray(payload.entities))throw new Error('Archivio reale in formato non valido.');
 const entities:PreviewRecord[]=payload.entities.filter((r):r is PreviewRecord=>
  r!==null&&typeof r==='object'&&typeof r.id==='string'&&typeof r.kind==='string'&&r.data!==null&&typeof r.data==='object'&&!Array.isArray(r.data));
 return {entities,events:Array.isArray(payload.events)?payload.events:[],seedAvailable:false,
  readOnly:true,updatedAt:new Date().toISOString()};
}
export async function realPreviewData(){
 const snapshot=await readPreviewSnapshot();
 const str=(value:unknown)=>typeof value==='string'?value:'';
 const num=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
 return {
  updatedAt:snapshot.updatedAt,
  practices:snapshot.entities.filter(r=>r.kind==='practice').map(({id,data:d})=>({
   id,name:str(d.name),practiceStatus:str(d.practiceStatus),state:str(d.state),
   customerCode:str(d.customerCode),contractCode:str(d.contractCode),
   power:num(d.power),storage:num(d.storage),acceptedDate:str(d.acceptedDate)
  })) as OperationalPractice[],
  invoices:snapshot.entities.filter(r=>r.kind==='invoice').map(({id,data:d})=>({
   id,number:str(d.number),date:str(d.date),total:num(d.total)??0,
   paid:d.paid===true?true:d.paid===false?false:null,
   practiceId:str(d.practiceId)||null,source:str(d.source)
  })) as OperationalInvoice[]
 };
}
