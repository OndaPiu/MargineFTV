import {z} from 'zod';
import {authorized,authConfigured,correctPassword,sessionCookie,clearSessionCookie,sameOrigin,allowLogin} from '../../../lib/procurement-auth';
import {allRecords} from '../../../lib/store';
import {allJobs,catalog,localPreview,saveJob} from '../../../lib/procurement-store';
import {eligiblePractice,validateJob,withCompletionDate,type OperationalInvoice,type OperationalPractice,type Job} from '../../../lib/procurement';
import {romeDate} from '../../../lib/model';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store, private','Vary':'Cookie'};
const json=(data:unknown,status=200,extra:Record<string,string>={})=>Response.json(data,{status,headers:{...headers,...extra}});
const date=z.string().refine(v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v));
const schema=z.object({id:z.string().min(1).max(300),practiceId:z.string().min(1).max(300),version:z.number().int().min(0),
 installments:z.array(z.object({id:z.string().max(100),kind:z.enum(['Deposito cauzionale','Acconto','Saldo']),milestone:z.string().max(100),
 amountCents:z.number().int().min(0).nullable(),dueDate:date,invoiceId:z.string().max(300).nullable(),
 manualReference:z.string().max(200),manualPaidDate:date})).min(1).max(3),
 connection:z.enum(['Da aprire','Aperta','In lavorazione','Completata']),works:z.enum(['Da avviare','In corso','Conclusi']),
 completedDate:date.optional(),
 orders:z.array(z.object({id:z.string().max(100),supplierId:z.string().max(100),reference:z.string().max(200),status:z.enum(['Da ordinare','Ordinato','Consegnato'])})).max(100),
 notes:z.string().max(10000)});
async function commercialData(){
 if(localPreview())return {practices:[] as OperationalPractice[],invoices:[] as OperationalInvoice[]};
 const records=await allRecords();
 return {practices:records.filter(r=>r.kind==='practice').map(r=>({...r.data,id:r.id})) as OperationalPractice[],
 invoices:records.filter(r=>r.kind==='invoice').map(r=>({...r.data,id:r.id})) as OperationalInvoice[]};
}
export async function GET(req:Request){
 if(!authorized(req))return json({authenticated:false,configured:authConfigured()},401);
 try{
  const [data,jobs,commercial]=await Promise.all([catalog(),allJobs(),commercialData()]);
  return json({authenticated:true,localPreview:localPreview(),catalog:data,jobs,...commercial});
 }catch{return json({error:'Dati non disponibili. Configura archivio, migrazione e catalogo.'},503);}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Origine della richiesta non valida.'},403);
 try{
  const text=await req.text();if(text.length>100000)return json({error:'Richiesta troppo grande.'},413);
  const body=JSON.parse(text);
  if(body.action==='login'){
   if(!authConfigured())return json({error:'Configura una password riservata di almeno 16 caratteri.'},503);
   if(!allowLogin(req))return json({error:'Troppi tentativi. Riprova tra 15 minuti.'},429);
   if(typeof body.password!=='string'||!correctPassword(body.password))return json({error:'Password non valida.'},401);
   return json({ok:true},200,{'Set-Cookie':sessionCookie()});
  }
  if(!authorized(req))return json({error:'Accesso richiesto.'},401);
  if(body.action==='logout')return json({ok:true},200,{'Set-Cookie':clearSessionCookie()});
  if(body.action==='save-job'){
   const job=schema.parse(body.job) as Job;
   const [{practices,invoices},jobs]=await Promise.all([commercialData(),allJobs()]);
   const practice=practices.find(p=>p.id===job.practiceId);
   const existing=jobs.find(j=>j.id===job.id);
   if(existing&&existing.practiceId!==job.practiceId)throw new Error('La pratica della commessa non può cambiare.');
   if(!practice||(!existing&&!eligiblePractice(practice)))throw new Error('Sono richiesti stato Vinta e fase Preventivo Accettato.');
   if(!existing&&jobs.some(j=>j.practiceId===job.practiceId))throw new Error('Commessa già avviata per questa pratica.');
   if(existing&&existing.installments.length!==job.installments.length)throw new Error('Il piano rate già avviato richiede una revisione dedicata.');
   const dated=withCompletionDate(existing,job,romeDate());
   if(dated.completedDate&&dated.completedDate>romeDate())throw new Error('La data effettiva di fine lavori non può essere futura.');
   validateJob(dated,invoices);
   return json({job:await saveJob(dated)});
  }
  return json({error:'Azione non disponibile.'},400);
 }catch(e){return json({error:e instanceof z.ZodError?'Controlla i campi della commessa.':e instanceof SyntaxError?'Richiesta non valida.':e instanceof Error?e.message:'Operazione non riuscita.'},400);}
}
