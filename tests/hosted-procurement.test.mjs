import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {hostedReadOnly,procurementReadOnly} from '../lib/procurement-mode.mjs';
const source=readFileSync(new URL('../lib/procurement-catalog.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {decodePrivateCatalog}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('hosted work-in-progress mode is read-only in production independently from local preview',()=>{
 const saved={mode:process.env.PROCUREMENT_MODE,node:process.env.NODE_ENV,local:process.env.PROCUREMENT_LOCAL_PREVIEW};
 try{
  process.env.NODE_ENV='production';delete process.env.PROCUREMENT_LOCAL_PREVIEW;
  process.env.PROCUREMENT_MODE='read-only';
  assert.equal(hostedReadOnly(),true);assert.equal(procurementReadOnly(),true);
  delete process.env.PROCUREMENT_MODE;assert.equal(procurementReadOnly(),false);
  process.env.PROCUREMENT_LOCAL_PREVIEW='1';assert.equal(procurementReadOnly(),false);
 }finally{
  for(const [key,value] of Object.entries({PROCUREMENT_MODE:saved.mode,NODE_ENV:saved.node,PROCUREMENT_LOCAL_PREVIEW:saved.local})){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
test('private compressed catalog loads on the server without public asset files',()=>{
 const fixture={schemaVersion:1,suppliers:[{id:'qa',name:'Fornitore di prova',brands:[]}],
  documents:[{id:'doc'}],offers:[{id:'qa-1',label:'Prodotto di prova',description:'Dati sintetici',supplierId:'qa',documentId:'doc',purchasePriceCents:10000}]};
 const encoded=gzipSync(Buffer.from(JSON.stringify(fixture))).toString('base64');
 assert.deepEqual(decodePrivateCatalog(encoded),fixture);
 assert.throws(()=>decodePrivateCatalog('not-base64'));
 fixture.offers[0].supplierId='missing';
 assert.throws(()=>decodePrivateCatalog(gzipSync(Buffer.from(JSON.stringify(fixture))).toString('base64')),/Voce/);
});
