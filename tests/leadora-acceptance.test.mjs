import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {blankPractice,romeDate} from '../lib/model.ts';
// Transpile the actual parser; Node's native TS loader does not resolve its
// extensionless bundler import. No parser behavior is replaced.
const model=new URL('../lib/model.ts',import.meta.url).href;
const source=readFileSync(new URL('../lib/integrations.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 .replace(/from ['"]\.\/model['"]/,()=>"from '"+model+"'");
const {parseLeadora}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const payload={location:{id:'test-location'},contact_id:'test-contact',id:'test-opportunity',opportunity_name:'Pratica di collaudo',pipleline_stage:'Preventivo Accettato'};
test('Leadora records an observed transition and retains it on replay',()=>{
 const previous={...blankPractice('leadora:test-location:opportunity:test-opportunity'),state:'In trattativa',name:'Pratica di collaudo'};
 const first=parseLeadora(payload,previous).practice;
 assert.equal(first.acceptedDate,romeDate());
 assert.ok(first.acceptedAt);
 const next=parseLeadora(payload,first).practice;
 assert.equal(next.acceptedAt,first.acceptedAt);
 assert.equal(next.acceptedDate,first.acceptedDate);
});
test('a first Leadora import already accepted is not given an invented historical date',()=>{
 const first=parseLeadora(payload).practice;
 assert.equal(first.acceptedDate,undefined);
});
test('a partial stage webhook updates the existing practice without losing its name',()=>{
 const previous={...blankPractice('leadora:test-location:opportunity:test-opportunity'),state:'In trattativa',name:'Nome esistente'};
 const partial={...payload};delete partial.opportunity_name;
 const updated=parseLeadora(partial,previous).practice;
 assert.equal(updated.acceptedDate,romeDate());
 assert.equal(updated.name,'Nome esistente');
});
