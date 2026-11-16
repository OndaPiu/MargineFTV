import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eligiblePractice,paymentPlan,validateJob,firstPaymentReceived,offerWarnings,withCompletionDate} from '../lib/procurement.ts';
import {authorized,correctPassword,sessionCookie,sameOrigin} from '../lib/procurement-auth.ts';
const job=()=>({id:'job-p1',practiceId:'p1',version:0,installments:paymentPlan(2),connection:'Da aprire',works:'Da avviare',orders:[],notes:''});
test('requires both commercial conditions, ignoring case and whitespace',()=>{
 assert.equal(eligiblePractice({practiceStatus:'Vinta',state:' PREVENTIVO   ACCETTATO '}),true);
 assert.equal(eligiblePractice({practiceStatus:'Aperta',state:'Preventivo Accettato'}),false);
 assert.equal(eligiblePractice({practiceStatus:'Vinta',state:'In trattativa'}),false);
 assert.equal(eligiblePractice({practiceStatus:'Vinta',state:'✍️ Preventivo Accettato'}),true);
 assert.equal(eligiblePractice({practiceStatus:'Aperta',state:'✍️ Preventivo Accettato'}),false);
 assert.equal(eligiblePractice({practiceStatus:'Vinta',state:'✍️ Preventivo Accettato da verificare'}),false);
});
test('uses the requested payment sequences and flexible second installment',()=>{
 assert.deepEqual(paymentPlan(1).map(i=>i.kind),['Saldo']);
 assert.deepEqual(paymentPlan(2).map(i=>i.kind),['Acconto','Saldo']);
 assert.deepEqual(paymentPlan(3).map(i=>i.kind),['Deposito cauzionale','Acconto','Saldo']);
 assert.equal(paymentPlan(2)[1].milestone,'Durante i lavori / verso la fine');
 assert.ok(paymentPlan(3).every(i=>i.amountCents===null));
});
test('a linked paid Enerp invoice unlocks parallel activities; unpaid or unknown does not',()=>{
 const j=job();j.installments[0].invoiceId='i1';j.connection='Aperta';j.orders=[{status:'Ordinato'}];
 assert.throws(()=>validateJob(j,[{id:'i1',practiceId:'p1',paid:null}]),/pagamento iniziale/);
 assert.throws(()=>validateJob(j,[{id:'i1',practiceId:'p1',paid:false}]),/pagamento iniziale/);
 assert.doesNotThrow(()=>validateJob(j,[{id:'i1',practiceId:'p1',paid:true}]));
});
test('external payments require a reference and actual payment date',()=>{
 const j=job();j.installments[0].manualPaidDate='2026-11-16';
 assert.equal(firstPaymentReceived(j,[]),false);
 assert.throws(()=>validateJob(j,[]),/documento/);
 j.installments[0].manualReference='EST-123';
 assert.equal(firstPaymentReceived(j,[]),true);
});
test('cannot reuse an invoice across installments or use another practice invoice',()=>{
 const j=job();j.installments.forEach(i=>i.invoiceId='i1');
 assert.throws(()=>validateJob(j,[{id:'i1',practiceId:'p2',paid:true}]),/stessa pratica/);
 assert.throws(()=>validateJob(j,[{id:'i1',practiceId:'p1',paid:true}]),/due rate/);
 j.installments[1].invoiceId=null;j.installments[0].manualPaidDate='2026-11-16';
 assert.throws(()=>validateJob(j,[{id:'i1',practiceId:'p1',paid:true}]),/fattura collegata/);
});
test('password-derived signed sessions reject forgery, expiry and changed secrets',()=>{
 const before=process.env.PROCUREMENT_ACCESS_PASSWORD;
 process.env.PROCUREMENT_ACCESS_PASSWORD='a-long-random-password-for-testing';
 try{
  assert.equal(correctPassword('wrong'),false);
  assert.equal(correctPassword(process.env.PROCUREMENT_ACCESS_PASSWORD),true);
  const cookie=sessionCookie().split(';')[0];
  const req=c=>new Request('http://localhost/api/procurement',{headers:{cookie:c}});
  assert.equal(authorized(req(cookie)),true);
  assert.equal(authorized(req('procurement_session=1')),false);
  assert.equal(authorized(req(cookie.slice(0,-2)+'ff')),false);
  assert.equal(authorized(req(cookie.replace(/=\d+\./,'=1.'))),false);
  process.env.PROCUREMENT_ACCESS_PASSWORD+='new';
  assert.equal(authorized(req(cookie)),false);
 }finally{if(before===undefined)delete process.env.PROCUREMENT_ACCESS_PASSWORD;else process.env.PROCUREMENT_ACCESS_PASSWORD=before;}
});
test('mutations require a same-origin request',()=>{
 assert.equal(sameOrigin(new Request('https://app.test/api/procurement',{headers:{Origin:'https://evil.test'}})),false);
 assert.equal(sameOrigin(new Request('https://app.test/api/procurement',{headers:{Origin:'https://app.test'}})),true);
 assert.equal(sameOrigin(new Request('http://localhost:5180/api/procurement',{headers:{Origin:'http://127.0.0.1:5180',Host:'127.0.0.1:5180'}})),true);
});
test('expired offers remain identifiable and cannot look current',()=>{
 const warnings=offerWarnings({review:[],verified:false,validUntil:'2026-10-01',validityStatus:'dated',vatIncluded:null,stockStatus:'unknown'},'2026-11-16');
 assert.ok(warnings.includes('Offerta scaduta'));
 assert.ok(warnings.includes('IVA da confermare'));
 assert.ok(warnings.includes('Disponibilità da confermare'));
});
test('actual completion dates are recorded on closure and can be corrected historically',()=>{
 const old=job();old.works='In corso';
 const closed=withCompletionDate(old,{...old,works:'Conclusi'},'2026-11-16');
 assert.equal(closed.completedDate,'2026-11-16');
 const corrected=withCompletionDate(closed,{...closed,completedDate:'2026-11-12'},'2026-11-17');
 assert.equal(corrected.completedDate,'2026-11-12');
 assert.equal(withCompletionDate(corrected,{...corrected,completedDate:undefined},'2026-11-18').completedDate,'2026-11-12');
 const legacy={...job(),works:'Conclusi'};
 assert.equal(withCompletionDate(legacy,legacy,'2026-11-16').completedDate,'');
});
test('a completed date cannot accompany work still in progress',()=>{
 const j=job();j.installments[0].manualReference='DOC-1';j.installments[0].manualPaidDate='2026-11-01';
 j.works='In corso';j.completedDate='2026-11-16';
 assert.throws(()=>validateJob(j,[]),/stato Conclusi/);
});
