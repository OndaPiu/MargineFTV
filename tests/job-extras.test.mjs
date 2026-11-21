import {test} from 'node:test';import assert from 'node:assert/strict';
import {jobCosts,validateMaterialChanges} from '../lib/procurement.ts';
test('extras are counted once, separately from material quantity, and unquoted lines remain incomplete',()=>{
 const job={materials:[{quantity:10,snapshot:{unitPriceCents:5000}}],extras:[{amountCents:5000},{amountCents:20000}]};
 assert.deepEqual(jobCosts(job),{materials:50000,extras:25000,total:75000,incomplete:false});
 assert.equal(jobCosts({...job,extras:[{amountCents:null}]}).incomplete,true);
 assert.deepEqual(jobCosts({}),{materials:0,extras:0,total:0,incomplete:false});
});
test('ordered extras cannot change while notes and unchanged extras can be saved',()=>{
 const extra={id:'e1',documentId:'d1',description:'Trasporto',amountCents:5000,vatIncluded:false};
 const old={orders:[{status:'Ordinato'}],extras:[extra]};
 assert.doesNotThrow(()=>validateMaterialChanges(old,{...old,notes:'Aggiornamento'}));
 assert.throws(()=>validateMaterialChanges(old,{...old,extras:[{...extra,amountCents:9000}]}),/extra/);
 assert.throws(()=>validateMaterialChanges(old,{...old,extras:[]}),/extra/);
});
