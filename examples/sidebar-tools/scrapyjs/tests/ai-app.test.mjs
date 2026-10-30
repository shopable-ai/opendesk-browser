import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,settle,base} from './capture-fixture.mjs';
const sample='<ul id="books"><li data-id="A"><h2>浏览器工具</h2><span class="price">19.50</span></li></ul><a class="next" href="page-2.html">下一页</a>';

test('AI button requires a bound structure and previews on the original runner without saving or starting full',async t=>{
 const f=await fixture(t,{generate:async payload=>({requestId:payload.requestId,providerGeneration:1,proposal:base,metadata:{turnId:'fixture-turn'}})}),{get}=f;
 get('open-local-runner').dispatch('click');await settle();await settle();
 const saved=structuredClone(f.rows.get('capture-config'));
 assert.ok(get('ai-trial'),'minimal AI action stays in original collection workspace');
 get('ai-trial').dispatch('click');await settle();
 assert.equal(f.calls.some(c=>c.operation.startsWith('ai.')),false,'no structure means no AI send');
 assert.match(get('ai-status').textContent,/结构样本/);
 f.edit('runner-config',JSON.stringify(base));f.edit('ai-sample',sample);
 get('ai-trial').dispatch('click');get('ai-trial').dispatch('click');await settle();await settle();await settle();
 assert.equal(f.calls.filter(c=>c.operation==='ai.generate').length,1);
 const sent=f.calls.find(c=>c.operation==='ai.generate').payload;
 assert.equal(sent.context.sample,sample);assert.equal(sent.context.sampleUrl,base.url);assert.equal(sent.context.currentConfig.maxPages,50);
 assert.equal(f.posts().length,1);assert.deepEqual(f.posts()[0].payload.body.config,base);assert.equal(f.posts()[0].payload.body.mode,'preview');
 assert.equal(f.posts()[0].payload.body.previewPages,3);assert.deepEqual(f.rows.get('capture-config'),saved);
 assert.equal(get('runner-config').value,JSON.stringify(base));assert.equal(get('ai-sample').value,sample);
 assert.equal(get('runner-prepare-full').disabled,false);assert.match(get('ai-proposal').textContent,/fixture-turn/);
 f.edit('ai-sample',sample+' ');f.edit('ai-sample',sample);assert.equal(get('runner-prepare-full').disabled,true,'editing and reverting structure cannot revive AI certification');
 assert.equal(f.calls.some(c=>c.operation.startsWith('tasks.')),false);
});

test('reopened unknown AI stays queryable while manual trial remains available and sample survives closing',async t=>{
 const f=await fixture(t,{pendingAi:true}),{get}=f;get('open-local-runner').dispatch('click');await settle();await settle();
 assert.equal(get('ai-trial').disabled,true);assert.match(get('ai-status').textContent,/unknown-ai/);
 f.edit('ai-sample',sample);get('close-local-runner').dispatch('click');get('open-local-runner').dispatch('click');await settle();
 assert.equal(get('ai-sample').value,sample);assert.equal(get('runner-start-preview').disabled,false);
 get('runner-start-preview').dispatch('click');await settle();await settle();
 assert.equal(f.posts().length,1);assert.equal(f.rows.get('ai-pending-request').value.requestId,'unknown-ai');
 assert.equal(f.calls.filter(c=>c.operation==='ai.generate'||c.operation==='ai.cancel').length,0);
});

test('unknown cancellation unlocks manual collection before the original AI response settles and never applies it late',async t=>{
 let reply;const f=await fixture(t,{generate:payload=>new Promise(resolve=>{reply=()=>resolve({requestId:payload.requestId,providerGeneration:1,proposal:base});})}),{get}=f;
 get('open-local-runner').dispatch('click');await settle();await settle();f.edit('runner-config',JSON.stringify(base));f.edit('ai-sample',sample);
 get('ai-trial').dispatch('click');await settle();assert.equal(get('runner-start-preview').disabled,true);
 get('ai-cancel').dispatch('click');await settle();await settle();
 assert.equal(get('runner-start-preview').disabled,false,'unknown inference does not lock independent manual work');
 assert.equal(get('runner-config').disabled,false);assert.equal(get('close-local-runner').disabled,false);assert.equal(get('ai-trial').disabled,true);
 get('runner-start-preview').dispatch('click');await settle();await settle();assert.equal(f.posts().length,1);
 const id=f.rows.get('ai-pending-request').value.requestId;
 reply();await settle();await settle();assert.equal(f.posts().length,1);assert.equal(f.rows.get('ai-pending-request').value.requestId,id);assert.equal(get('ai-proposal'),null);
});

test('Stop while AI result awaits storage cleanup never creates a late preview',async t=>{
 let release;const clearGate={promise:new Promise(resolve=>{release=resolve;})};
 const f=await fixture(t,{clearGate,generate:async payload=>({requestId:payload.requestId,providerGeneration:1,proposal:base})}),{get}=f;
 get('open-local-runner').dispatch('click');await settle();await settle();f.edit('runner-config',JSON.stringify(base));f.edit('ai-sample',sample);
 get('ai-trial').dispatch('click');await settle();await settle();assert.equal(f.posts().length,0);
 get('ai-cancel').dispatch('click');await settle();release({saved:true});await settle();await settle();
 assert.equal(f.posts().length,0,'no preview is allowed after Stop during cleanup');assert.equal(get('ai-proposal'),null);
});
