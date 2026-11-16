import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withAcceptanceDate} from '../lib/model.ts';
const now=new Date('2026-11-16T23:30:00.000Z');
test('records the first accepted transition with a Rome date and observed timestamp',()=>{
 const p=withAcceptanceDate({state:'In trattativa'},{state:' PREVENTIVO  ACCETTATO '},undefined,now);
 assert.equal(p.acceptedDate,'2026-11-17');
 assert.equal(p.acceptedAt,now.toISOString());
 assert.equal(p.acceptedDateSource,'automatic');
});
test('no historical acceptance date is invented for an initial accepted import or legacy accepted practice',()=>{
 assert.equal(withAcceptanceDate(undefined,{state:'Preventivo Accettato'},undefined,now).acceptedDate,undefined);
 assert.equal(withAcceptanceDate({state:'Preventivo Accettato'},{state:'Preventivo Accettato'},undefined,now).acceptedDate,undefined);
});
test('repeated imports and a commercial reopening retain the first accepted date',()=>{
 const previous={state:'Preventivo Accettato',acceptedDate:'2026-09-01',acceptedAt:'2026-09-01T10:00:00Z',acceptedDateSource:'automatic'};
 assert.equal(withAcceptanceDate(previous,{state:'Preventivo Accettato'},undefined,now).acceptedDate,'2026-09-01');
 const reopened=withAcceptanceDate(previous,{state:'In trattativa'},undefined,now);
 assert.equal(withAcceptanceDate(reopened,{state:'Preventivo Accettato'},undefined,now).acceptedDate,'2026-09-01');
});
test('manual historical dates are validated and take precedence over automatic dating',()=>{
 const p=withAcceptanceDate({state:'In trattativa'},{state:'Preventivo Accettato'},'2026-08-12',now);
 assert.equal(p.acceptedDate,'2026-08-12');
 assert.equal(p.acceptedDateSource,'manual');
 assert.throws(()=>withAcceptanceDate({state:'Aperta'},{state:'Preventivo Accettato'},'2026-02-30',now),/Data non valida/);
 assert.throws(()=>withAcceptanceDate({state:'Aperta'},{state:'Preventivo Accettato'},'garbage',now));
});
