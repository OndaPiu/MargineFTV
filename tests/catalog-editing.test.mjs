import {test} from 'node:test';import assert from 'node:assert/strict';
import {offerChanges,offerMutation,catalogEditingEnabled} from '../lib/procurement-catalog-edit.ts';
const fixture=()=>({label:'Prodotto QA',code:'QA-1',brand:'Marca QA',description:'Dati sintetici',category:'Cavi',section:'Cavi',supplierId:'s1',documentId:'d1',page:1,unit:'metro',currency:'EUR',listPriceCents:121,purchasePriceCents:60.5,shippingCents:null,priceBasis:'gross',discountPercent:50,vatIncluded:false,validUntil:null,validityStatus:'to-confirm',stockStatus:'unknown',review:[],verified:false});
test('the editor accepts fractional-cent unit costs and rejects inconsistent discount/net prices',()=>{
 assert.ok(offerChanges.safeParse(fixture()).success);
 assert.equal(offerChanges.safeParse({...fixture(),purchasePriceCents:61}).success,false);
 assert.equal(offerChanges.safeParse({...fixture(),priceBasis:'net'}).success,false);
 assert.ok(offerChanges.safeParse({...fixture(),priceBasis:'net',purchasePriceCents:121}).success);
 for(const change of [{purchasePriceCents:-1},{vatIncluded:'false'},{page:0},{validityStatus:'dated'},{validUntil:'2026-02-30'}])assert.equal(offerChanges.safeParse({...fixture(),...change}).success,false);
});
test('archive mutations cannot rename IDs or modify arbitrary source metadata',()=>{
 assert.ok(offerMutation.safeParse({id:'a',expected:{id:'a'},changes:{active:false}}).success);
 assert.equal(offerMutation.safeParse({id:'a',expected:{id:'a'},changes:{id:'b',active:false}}).success,false);
 assert.equal(offerMutation.safeParse({id:'a',expected:{id:'a'},changes:{...fixture(),rawPrice:'inventato'}}).success,false);
});
test('catalog writes require their own explicit switch even while operational jobs remain read-only',()=>{
 const keys=['PROCUREMENT_CATALOG_EDIT_ENABLED','PROCUREMENT_CATALOG_GZIP_BASE64','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NODE_ENV','PROCUREMENT_LOCAL_PREVIEW'];const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  process.env.NODE_ENV='production';process.env.SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';delete process.env.PROCUREMENT_CATALOG_GZIP_BASE64;delete process.env.PROCUREMENT_CATALOG_EDIT_ENABLED;
  assert.equal(catalogEditingEnabled(),false);process.env.PROCUREMENT_CATALOG_EDIT_ENABLED='1';assert.equal(catalogEditingEnabled(),true);
  process.env.PROCUREMENT_CATALOG_GZIP_BASE64='legacy';assert.equal(catalogEditingEnabled(),false);delete process.env.PROCUREMENT_CATALOG_GZIP_BASE64;
  process.env.NODE_ENV='development';process.env.PROCUREMENT_LOCAL_PREVIEW='1';assert.equal(catalogEditingEnabled(),false);
 }finally{for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
