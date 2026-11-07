import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,settle,base} from './capture-fixture.mjs';
import {validateStructure} from '../src/capture-structure.js';
const settleRead=async()=>{for(let i=0;i<12;i++)await settle();};

test('foreign sources, stale input hashes and oversized samples cannot become the current structure',()=>{
 const config={url:'https://example.org/books',inputHash:'sha256:'+'a'.repeat(64),maxPages:20,previewPages:3};
 const run={runId:'source-run',requestId:'source-request',mode:'structure',status:'completed',workerExited:true,
   previewPassed:false,errors:[],pagesVisited:1,recordsCount:1,config};
 const row={format:'scrapyjs.static-structure.v1',url:config.url,inputHash:config.inputHash,
   sourceHash:'sha256:'+'b'.repeat(64),fetchedAt:new Date().toISOString(),sample:'<h2>图书</h2>',truncated:false};
 const reply=value=>({records:[value],total:1,offset:0});
 assert.deepEqual(validateStructure(run,reply(row),config),row);
 for(const change of [{url:'https://elsewhere.org/books'},{url:'https://user:password@example.org/books'},
   {inputHash:'sha256:'+'c'.repeat(64)},{sample:'图书'.repeat(2000)},{sourceHash:'unverified'},{fetchedAt:'not-a-date'}])
   assert.throws(()=>validateStructure(run,reply({...row,...change}),config));
 assert.throws(()=>validateStructure({...run,previewPassed:true},reply(row),config));
 assert.throws(()=>validateStructure(run,reply(row),{...config,maxPages:21}));
});

test('URL and Chinese demand read structure in the original workspace without AI or replacing collection results',async t=>{
 const f=await fixture(t,{pendingAi:true}),{get}=f;
 get('open-local-runner').dispatch('click');await settleRead();
 f.edit('capture-requirement','采集书名和价格');f.edit('capture-ai-mode','create');
 get('runner-start-preview').dispatch('click');await settleRead();
 const original=structuredClone(f.rows.get('local-runner-state'));
 assert.ok(get('capture-read-structure'),'normal structure action is present');
 get('capture-read-structure').dispatch('click');await settleRead();
 assert.equal(f.posts().length,2);const body=f.posts()[1].payload.body;
 assert.equal(body.mode,'structure');assert.equal(body.previewPages,1);
 assert.equal(body.config.previewPages,3);assert.equal(body.config.maxPages,10);
 assert.match(body.config.inputHash,/^sha256:[a-f0-9]{64}$/);
 assert.deepEqual(f.rows.get('local-runner-state'),original);
 assert.match(get('capture-structure-status').textContent,/已读取/);
 assert.match(get('capture-structure-source').textContent,/来源/);
 assert.equal(f.calls.filter(x=>['ai.generate','ai.cancel','ai.info'].includes(x.operation)).length,0);
 assert.equal(f.rows.get('ai-pending-request').value.requestId,'unknown-ai');
 f.edit('capture-requirement','只取价格');f.edit('capture-requirement','采集书名和价格');
 assert.match(get('capture-structure-source').textContent,/已失效/);
});

test('late structure cannot be adopted after target input changes',async t=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const f=await fixture(t,{structureGate:()=>gate}),{get}=f;
 get('open-local-runner').dispatch('click');await settleRead();
 get('capture-read-structure').dispatch('click');await settleRead();
 f.edit('capture-url','https://example.org/changed');
 release();await settleRead();
 assert.match(get('capture-structure-status').textContent,/输入已变化/);
 assert.equal(get('ai-sample').value,'');
 assert.equal(f.posts().length,1);
});

test('closing and reopening while the pointer is saved permanently retires the pending structure start',async t=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const f=await fixture(t,{structureStorageGate:()=>gate}),{get}=f;
 get('open-local-runner').dispatch('click');await settleRead();
 get('capture-read-structure').dispatch('click');await settleRead();
 assert.equal(f.rows.get('local-structure-state').value.mode,'structure');
 get('close-local-runner').dispatch('click');get('open-local-runner').dispatch('click');
 release();await settleRead();
 assert.equal(f.posts().length,0,'reopening must not revive the pre-close click');
 assert.equal(f.rows.get('local-structure-state').value,null,'undispatched pointer rolls back by CAS');
});

test('closing while structure creation replies prevents adopting the late sample',async t=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const f=await fixture(t,{structureGate:()=>gate}),{get}=f;
 get('open-local-runner').dispatch('click');await settleRead();
 get('capture-read-structure').dispatch('click');await settleRead();
 get('close-local-runner').dispatch('click');release();await settleRead();
 assert.equal(get('ai-sample').value,'');
 assert.equal(f.posts().length,1,'the dispatched read is retained by its original identity');
});

test('automatically read structure supplies bounded source provenance to the optional simulated AI path',async t=>{
 const f=await fixture(t,{generate:async payload=>({requestId:payload.requestId,providerGeneration:1,proposal:{...base,maxPages:10}})}),{get}=f;
 get('open-local-runner').dispatch('click');await settleRead();
 f.edit('capture-requirement','采集书名和价格');f.edit('capture-ai-mode','create');
 get('capture-read-structure').dispatch('click');await settleRead();
 get('ai-trial').dispatch('click');await settleRead();
 const sent=f.calls.find(c=>c.operation==='ai.generate').payload;
 assert.match(sent.context.sample,/<h2>图书/);
 assert.equal(sent.context.structureSource.runId,'structure-1');
 assert.equal(sent.context.structureSource.requestId,f.posts()[0].payload.body.requestId);
 assert.equal(Object.hasOwn(sent.context.structureSource,'sample'),false,'provenance must be JSON data, without undefined/duplicate sample');
 assert.equal(f.posts()[1].payload.body.mode,'preview');
 assert.equal(f.posts().some(p=>p.payload.body.mode==='full'),false);
});
