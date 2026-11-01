import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,settle,base} from './capture-fixture.mjs';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as React from 'react';
import {createExtensionCenterDOM} from '../../../../tests/helpers/extension-center-react-dom.mjs';
import {App} from './react-fixture.mjs';

const context=vm.createContext({URL,TextEncoder,crypto:globalThis.crypto});
for(const path of ['../src/app-model.js','../adapters/app-sdk.js'])
  vm.runInContext(await readFile(new URL(path,import.meta.url),'utf8'),context);

test('shared Chat reviews a lossless proposal, applies explicitly and names an independent copy without Run',async t=>{
  const original={url:'https://download.csdn.net/column/',itemConfig:{_listContainer:'.columns',_listItem:'.column',
    title:{selector:'h2 a',read:'text',cardinality:'one'},url:'h2 a::href',nested:{author:'.author'}},
    waitForSelector:'.column',timeoutMs:30000,validation:{version:1,rowShape:'column'},
    fieldRequirements:[{key:'title',required:true,valueType:'text'}],processing:{version:1,rules:[{op:'splitPublication',field:'title'}]}};
  const proposal=structuredClone(original);proposal.itemConfig.column_title=structuredClone(original.itemConfig.title);
  const catalog={schemaVersion:1,selectedId:'original',records:[{id:'original',name:'CSDN 核心',config:original}]};
  const rows=new Map([['capture-config',{value:structuredClone(catalog),etag:'0'}],['ai-pending-request',{value:null,etag:'0'}]]);
  const calls=[];let resolveProposal;
  const previous=Object.fromEntries(['OpenDeskTool','ScrapyAppModel','ScrapyAppSdk','requestAnimationFrame'].map(key=>[key,globalThis[key]]));
  let conversationState;
  const tool={setState(){},setConversationState(value){conversationState=value;},request:async(operation,payload)=>{
    calls.push({operation,payload:structuredClone(payload)});
    if(operation==='storage.get')return structuredClone(rows.get(payload.key));
    if(operation==='storage.set'){
      const row=rows.get(payload.key);assert.equal(payload.ifMatch,row.etag);
      rows.set(payload.key,{value:structuredClone(payload.value),etag:String(Number(row.etag)+1)});return {saved:true};
    }
    if(operation==='currentPage.info')return {status:'available',title:'CSDN',url:original.url};
    if(operation==='ai.info')return {provider:'fixture',model:'deterministic',generation:1};
    if(operation==='ai.generate')return new Promise(resolve=>{resolveProposal=()=>resolve({
      requestId:payload.requestId,providerGeneration:payload.providerGeneration,proposal:JSON.stringify(proposal)
    });});
    throw Error('No real task, browser or model operation is allowed: '+operation);
  }};
  Object.assign(globalThis,{OpenDeskTool:tool,ScrapyAppModel:context.ScrapyAppModel,ScrapyAppSdk:context.ScrapyAppSdk,
    requestAnimationFrame:callback=>setTimeout(callback,0)});
  t.after(()=>Object.assign(globalThis,previous));
  const ui=createExtensionCenterDOM(t,{component:()=>{
    tool.root=globalThis.document.getElementById('opendesk-react-app');return React.createElement(App);
  }});
  ui.window.getSelection=()=>({anchorNode:null,anchorOffset:0,focusNode:null,focusOffset:0}); // React's selection plugin.
  await settle();await settle();
  const get=id=>ui.doc.getElementById(id);
  const edit=(id,value)=>{get(id).value=value;get(id).dispatch('input');};
  const writes=()=>calls.filter(call=>call.operation==='storage.set'&&call.payload.key==='capture-config');
  assert.equal(get('profile-list').value,'original');tool.root.dispatch('opendesk:conversation-action',{detail:{action:'toggle'}});
  edit('ai-requirement','保留全部规则，只增加与 title 相同的 column_title，仅采当前页。');
  get('chat-ai-use-page').checked=true;get('chat-ai-use-page').dispatch('click');
  get('ai-requirement').dispatch('keydown',{key:'Enter',shiftKey:true});
  get('ai-requirement').dispatch('keydown',{key:'Enter',isComposing:true});
  await settle();assert.equal(resolveProposal,undefined,'line breaks and IME must not send');
  get('ai-requirement').dispatch('keydown',{key:'Enter'});await settle();
  assert.equal(calls.filter(call=>call.operation==='ai.generate').length,1);
  const sent=calls.find(call=>call.operation==='ai.generate').payload;
  assert.deepEqual(sent.context.currentConfig,original);
  assert.equal(get('ai-requirement').disabled,true);assert.ok(get('chat-ai-cancel'));
  const editor=get('config-json'),target=get('target-url');
  ui.doc.querySelector('.od-conversation-close').dispatch('click');await settle();
  assert.equal(get('chat-ai-panel').hidden,true);assert.equal(conversationState.open,false);
  assert.equal(ui.doc.querySelector('.config-section').hidden,false);assert.equal(ui.doc.querySelector('.target-section').hidden,false);
  assert.equal(editor,get('config-json'));assert.equal(target,get('target-url'));
  assert.equal(get('start').disabled,true);assert.equal(get('profile-list').disabled,true);
  assert.equal(calls.some(call=>call.operation==='ai.cancel'),false,'collapsing must not cancel or retire a request');
  tool.root.dispatch('opendesk:conversation-action',{detail:{action:'toggle'}});await settle();
  assert.equal(get('ai-requirement').value,sent.request);assert.equal(get('ai-requirement').disabled,true);
  resolveProposal();await settle();await settle();
  const preview=get('chat-ai-config-preview');
  assert.deepEqual(JSON.parse(preview.value||preview.defaultValue),proposal); // linkedom does not reflect defaultValue into value.
  assert.match(ui.doc.querySelector('[role="log"]').textContent,/column_title/);
  assert.match(ui.doc.querySelector('.ai-diff').textContent,/新增 · column_title/);
  assert.deepEqual(rows.get('capture-config').value,catalog);assert.equal(writes().length,0);
  assert.equal(ui.doc.querySelector('#profile-naming').hidden,true);

  assert.equal(get('ai-generate').disabled,true,'a current proposal makes review the next step');
  get('ai-requirement').dispatch('keydown',{key:'Enter'});await settle();
  assert.equal(calls.filter(call=>call.operation==='ai.generate').length,1,'Enter cannot resend an unchanged reviewed proposal');

  edit('ai-requirement','纠正后的另一需求');assert.equal(get('chat-ai-apply').disabled,true,'changed input cannot apply old proposal');
  assert.equal(get('ai-generate').disabled,false,'a correction may generate a replacement proposal');
  edit('ai-requirement',sent.request);assert.equal(get('chat-ai-apply').disabled,false);
  assert.equal(get('ai-generate').disabled,true,'restoring the reviewed input restores the review step');
  get('chat-ai-apply').dispatch('click');await settle();await settle();
  assert.equal(get('profile-naming').hidden,false);assert.equal(get('profile-name').value,'CSDN 核心 副本');
  assert.equal(get('chat-ai-panel').hidden,false,'applying remains in the business workspace with the Chat mounted');
  assert.equal(get('start').disabled,true,'naming must finish before Run is available');
  assert.equal(writes().length,0,'applying a proposal only edits the local draft');
  assert.deepEqual(rows.get('capture-config').value,catalog,'original stays saved until explicit named save');
  get('profile-name').type='text'; // Browser default; linkedom otherwise reports a null input type to React.
  edit('profile-name','CSDN 核心');get('profile-name-submit').dispatch('click');await settle();await settle();
  assert.equal(get('profile-naming').hidden,false);assert.equal(writes().length,0);
  assert.match(get('chat-ai-feedback').textContent,/未保存草稿/,'failed naming must not acknowledge a saved proposal');
  get('profile-name').type='text'; // React re-renders the default input type after the validation error.
  edit('profile-name','CSDN 标题副本');get('profile-name-submit').dispatch('click');await settle();await settle();
  const saved=rows.get('capture-config').value;
  assert.equal(writes().length,1);assert.equal(saved.records.length,2);assert.notEqual(saved.selectedId,'original');
  assert.deepEqual(saved.records.find(row=>row.id==='original'),catalog.records[0]);
  assert.deepEqual(saved.records.find(row=>row.id===saved.selectedId),{id:saved.selectedId,name:'CSDN 标题副本',config:proposal});
  assert.equal(get('profile-naming').hidden,true);assert.equal(get('start').disabled,false);
  assert.match(get('chat-ai-feedback').textContent,/此提案的配置已保存/);
  assert.doesNotMatch(get('chat-ai-feedback').textContent,/未保存|命名保存/,'saved receipt replaces the pending naming instruction');
  assert.equal(calls.some(call=>call.operation.startsWith('tasks.')||call.operation.startsWith('browser.')),false,
    'AI, apply and save must never start capture, navigate or download');
});

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
