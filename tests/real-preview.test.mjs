import {test} from 'node:test';
import assert from 'node:assert/strict';
import {realPreviewEnabled,realPreviewData} from '../lib/procurement-preview.ts';
function setup(){
 const original={node:process.env.NODE_ENV,local:process.env.PROCUREMENT_LOCAL_PREVIEW,url:process.env.PROCUREMENT_READ_ONLY_SOURCE_URL,fetch:globalThis.fetch};
 process.env.NODE_ENV='development';process.env.PROCUREMENT_LOCAL_PREVIEW='1';process.env.PROCUREMENT_READ_ONLY_SOURCE_URL='https://example.test/api/workspace';
 return ()=>{for(const [key,value] of Object.entries({NODE_ENV:original.node,PROCUREMENT_LOCAL_PREVIEW:original.local,PROCUREMENT_READ_ONLY_SOURCE_URL:original.url})){if(value===undefined)delete process.env[key];else process.env[key]=value;}globalThis.fetch=original.fetch;};
}
test('live preview reads the configured source with GET and preserves unknown historical data',async()=>{
 const restore=setup();const calls=[];
 try{
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return Response.json({entities:[
   {id:'practice-qa',kind:'practice',version:1,data:{name:'Cliente di prova',state:'✍️ Preventivo Accettato',practiceStatus:'Vinta',power:6,storage:10}},
   {id:'invoice-qa',kind:'invoice',version:1,data:{number:'QA-1',date:'2026-11-01',total:10000,paid:false,practiceId:'practice-qa',source:'Enerp'}},
   {id:'invoice-unknown',kind:'invoice',version:1,data:{number:'QA-2',total:20000,paid:null,practiceId:'practice-qa',source:'Enerp'}}
  ]});};
  const d=await realPreviewData();
  assert.equal(calls.length,1);assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.cache,'no-store');
  assert.equal(d.practices[0].state,'✍️ Preventivo Accettato');
  assert.equal(d.practices[0].acceptedDate,'');
  assert.equal(d.invoices[0].paid,false);assert.equal(d.invoices[1].paid,null);
 }finally{restore();}
});
test('real-data preview is disabled in production and rejects non-HTTPS sources',async()=>{
 const restore=setup();let calls=0;
 try{
  process.env.NODE_ENV='production';assert.equal(realPreviewEnabled(),false);
  await assert.rejects(()=>realPreviewData(),/non configurata/);
  process.env.NODE_ENV='development';process.env.PROCUREMENT_READ_ONLY_SOURCE_URL='http://example.test/api/workspace';
  globalThis.fetch=async()=>{calls++;return Response.json({entities:[]});};
  await assert.rejects(()=>realPreviewData(),/HTTPS/);assert.equal(calls,0);
 }finally{restore();}
});
