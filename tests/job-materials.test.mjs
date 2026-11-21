import {test} from 'node:test';import assert from 'node:assert/strict';
import {materialFromOffer,materialLineTotal,draftOrdersForMaterials,validateMaterialChanges} from '../lib/procurement.ts';import {hostedReadOnly,procurementReadOnly} from '../lib/procurement-mode.mjs';
const offer={id:'o1',label:'Cavo QA',code:'QA',brand:'Marca QA',description:'Dati sintetici',supplierId:'s1',supplierName:'Fornitore QA',unit:'metro',purchasePriceCents:60.5,currency:'EUR',vatIncluded:false,documentId:'d1',validUntil:null,validityStatus:'to-confirm',stockStatus:'unknown',review:['Dato da confermare'],verified:false};
const catalog={documents:[{id:'d1',name:'Listino QA'}]};
test('a selected material keeps its own price, source and warnings and rounds after quantity',()=>{
 const source={...offer,review:[...offer.review]};const material=materialFromOffer(source,catalog,'m1',100);
 source.purchasePriceCents=999;source.review.push('Nuova nota');assert.equal(material.snapshot.unitPriceCents,60.5);assert.equal(materialLineTotal(material),6050);assert.equal(material.snapshot.review.length,1);assert.equal(material.snapshot.documentName,'Listino QA');
 assert.throws(()=>materialFromOffer({...source,active:false},catalog,'m2'),/archiviato/);
 assert.equal(materialLineTotal({...material,snapshot:{...material.snapshot,unitPriceCents:null}}),null);
});
test('draft orders group suppliers once, skip unidentified suppliers and do not mark orders as sent',()=>{
 const materials=[materialFromOffer(offer,catalog,'m1'),materialFromOffer(offer,catalog,'m2'),materialFromOffer({...offer,supplierId:null},catalog,'m3')];
 const existing={id:'ord1',supplierId:'s1',status:'Da ordinare',reference:''};assert.deepEqual(draftOrdersForMaterials({materials,orders:[existing]}),[existing]);
 const generated=draftOrdersForMaterials({materials,orders:[]});assert.equal(generated.length,1);assert.equal(generated[0].supplierId,'s1');assert.equal(generated[0].status,'Da ordinare');
});
test('changing a saved ordered quantity is rejected but billing updates remain possible',()=>{
 const material=materialFromOffer(offer,catalog,'m1');const old={materials:[material],orders:[{status:'Ordinato'}]};
 assert.doesNotThrow(()=>validateMaterialChanges(old,{...old,notes:'Fattura aggiornata'}));
 assert.throws(()=>validateMaterialChanges(old,{...old,materials:[{...material,quantity:2}]}),/revisione/);
});
test('the explicit jobs switch activates real saves without enabling local-preview writes',()=>{
 const keys=['NODE_ENV','PROCUREMENT_MODE','PROCUREMENT_JOBS_ENABLED','PROCUREMENT_LOCAL_PREVIEW'];const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{process.env.NODE_ENV='production';process.env.PROCUREMENT_MODE='read-only';process.env.PROCUREMENT_JOBS_ENABLED='0';assert.equal(procurementReadOnly(),true);process.env.PROCUREMENT_JOBS_ENABLED='1';assert.equal(hostedReadOnly(),false);assert.equal(procurementReadOnly(),false);process.env.NODE_ENV='development';process.env.PROCUREMENT_LOCAL_PREVIEW='1';assert.equal(procurementReadOnly(),true);}finally{for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}}
});
