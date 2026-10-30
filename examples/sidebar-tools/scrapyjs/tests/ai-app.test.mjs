import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as React from 'react';
import {createExtensionCenterDOM} from '../../../../tests/helpers/extension-center-react-dom.mjs';
import {App} from './react-fixture.mjs';

const context=vm.createContext({URL,TextEncoder,crypto:globalThis.crypto});
for(const path of ['../src/app-model.js','../adapters/app-sdk.js'])
  vm.runInContext(await readFile(new URL(path,import.meta.url),'utf8'),context);
const settle=()=>new Promise(resolve=>setImmediate(resolve));

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
  const tool={setState(){},request:async(operation,payload)=>{
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
  assert.equal(get('profile-list').value,'original');get('open-ai').dispatch('click');
  edit('ai-requirement','保留全部规则，只增加与 title 相同的 column_title，仅采当前页。');
  get('ai-use-page').checked=true;get('ai-use-page').dispatch('click');
  get('ai-requirement').dispatch('keydown',{key:'Enter',shiftKey:true});
  get('ai-requirement').dispatch('keydown',{key:'Enter',isComposing:true});
  await settle();assert.equal(resolveProposal,undefined,'line breaks and IME must not send');
  get('ai-requirement').dispatch('keydown',{key:'Enter'});await settle();
  assert.equal(calls.filter(call=>call.operation==='ai.generate').length,1);
  const sent=calls.find(call=>call.operation==='ai.generate').payload;
  assert.deepEqual(sent.context.currentConfig,original);
  assert.equal(get('ai-requirement').disabled,true);assert.ok(get('ai-cancel'));
  resolveProposal();await settle();await settle();
  const preview=get('ai-config-preview');
  assert.deepEqual(JSON.parse(preview.value||preview.defaultValue),proposal); // linkedom does not reflect defaultValue into value.
  assert.match(ui.doc.querySelector('[role="log"]').textContent,/column_title/);
  assert.match(ui.doc.querySelector('.ai-diff').textContent,/新增 · column_title/);
  assert.deepEqual(rows.get('capture-config').value,catalog);assert.equal(writes().length,0);
  assert.equal(ui.doc.querySelector('#profile-naming').hidden,true);

  edit('ai-requirement','纠正后的另一需求');assert.equal(get('ai-apply').disabled,true,'changed input cannot apply old proposal');
  edit('ai-requirement',sent.request);assert.equal(get('ai-apply').disabled,false);
  get('ai-apply').dispatch('click');await settle();await settle();
  assert.equal(get('profile-naming').hidden,false);assert.equal(get('profile-name').value,'CSDN 核心 副本');
  assert.equal(get('start').disabled,true,'naming must finish before Run is available');
  assert.equal(writes().length,0,'applying a proposal only edits the local draft');
  assert.deepEqual(rows.get('capture-config').value,catalog,'original stays saved until explicit named save');
  get('profile-name').type='text'; // Browser default; linkedom otherwise reports a null input type to React.
  edit('profile-name','CSDN 标题副本');get('profile-name-submit').dispatch('click');await settle();await settle();
  const saved=rows.get('capture-config').value;
  assert.equal(writes().length,1);assert.equal(saved.records.length,2);assert.notEqual(saved.selectedId,'original');
  assert.deepEqual(saved.records.find(row=>row.id==='original'),catalog.records[0]);
  assert.deepEqual(saved.records.find(row=>row.id===saved.selectedId),{id:saved.selectedId,name:'CSDN 标题副本',config:proposal});
  assert.equal(get('profile-naming').hidden,true);assert.equal(get('start').disabled,false);
  assert.equal(calls.some(call=>call.operation.startsWith('tasks.')||call.operation.startsWith('browser.')),false,
    'AI, apply and save must never start capture, navigate or download');
});
