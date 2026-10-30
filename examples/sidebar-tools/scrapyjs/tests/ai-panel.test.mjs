import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {createExtensionCenterDOM} from '../../../../tests/helpers/extension-center-react-dom.mjs';
import {AiPanel} from './react-fixture.mjs';

// Exercise the actual React state transitions in a DOM fixture. No browser,
// Native request, real Provider, installation or layout evidence is claimed.
const settle=()=>new Promise(resolve=>setImmediate(resolve));
// linkedom does not implement a browser's default submit-button action.
const send=doc=>doc.getElementById('ai-requirement').closest('form').dispatch('submit');

test('lost claim receipt retains the local operation so explicit stop can retire preparation',async t=>{
  const previous=globalThis.OpenDeskTool,storage=storageFixture(),calls=[];let lost=true;
  globalThis.OpenDeskTool={request:async(operation,payload)=>{
    if(operation.startsWith('storage.')){
      const reply=await storage(operation,payload);
      if(operation==='storage.set'&&payload.value&&lost){lost=false;throw Object.assign(Error('lost claim receipt'),{code:'E_TOOL_TIMEOUT'});}
      return reply;
    }
    calls.push(operation);
    if(operation==='ai.info')return {provider:'test-fixture',generation:1};
    if(operation==='ai.cancel')return {requestId:payload.requestId,state:'unknown'};
    throw Error('must not generate');
  }};
  t.after(()=>{globalThis.OpenDeskTool=previous;});
  const state={config:{url:'https://example.com/',itemConfig:{title:'h2'}},target:{title:'Page',url:'https://example.com/'},profileEpoch:1};
  const ui=createExtensionCenterDOM(t,{component:AiPanel,props:{state,valid:true,onBusy(){},onDirty(){},onApply(){throw Error('must not apply');},onClose(){}}});
  await settle();const get=id=>ui.doc.getElementById(id);
  get('ai-requirement').value='preserve this input';get('ai-requirement').dispatch('input');
  get('ai-use-page').checked=true;get('ai-use-page').dispatch('click');
  send(ui.doc);await settle();
  assert.match(get('ai-request-status').textContent,/unknown/);assert.equal(get('ai-generate').disabled,true);
  get('ai-cancel').dispatch('click');await settle();
  assert.equal(get('ai-request-status')===null,true);assert.equal(get('ai-generate').disabled,false);
  assert.equal(get('ai-requirement').value,'preserve this input');assert.deepEqual(calls,['ai.info']);
});
function storageFixture(initial=null){
  let value=initial,revision=0;
  return async(operation,payload)=>{
    if(operation==='storage.get')return {value:structuredClone(value),etag:String(revision)};
    if(operation==='storage.set'){
      assert.equal(payload.key,'ai-pending-request');assert.equal(payload.ifMatch,String(revision),'CAS required');
      value=structuredClone(payload.value);revision++;return {saved:true};
    }
    throw Error('Unexpected storage operation');
  };
}

test('retry displays the same previous-error snapshot sent for that request',async t=>{
  const previous=globalThis.OpenDeskTool;
  const calls=[];
  const storage=storageFixture();
  let rejectRequest;
  globalThis.OpenDeskTool={request:async(operation,payload)=>{
    if(operation.startsWith('storage.'))return storage(operation,payload);
    if(operation==='ai.info')return {provider:'test-fixture',generation:1};
    if(operation==='ai.generate'){
      calls.push(structuredClone(payload));
      return new Promise((resolve,reject)=>{rejectRequest=reject;});
    }
    if(operation==='ai.cancel')return {requestId:payload.requestId,state:'cancelled'};
    throw Error('Unexpected operation '+operation);
  }};
  t.after(()=>{globalThis.OpenDeskTool=previous;});
  const state={config:{url:'https://download.csdn.net/list/',itemConfig:{title:'h2 a'}},
    target:{title:'CSDN',url:'https://download.csdn.net/list/'},profileEpoch:1,error:'采集错误 B'};
  const ui=createExtensionCenterDOM(t,{component:AiPanel,props:{state,valid:true,
    onBusy(){},onDirty(){},onApply(){throw Error('Must not apply');},onClose(){}}});
  await settle();
  const requirement=ui.doc.getElementById('ai-requirement');
  requirement.value='保留规则，增加标题副本';requirement.dispatch('input');
  const page=ui.doc.getElementById('ai-use-page');page.checked=true;page.dispatch('click');
  const generate=ui.doc.getElementById('ai-generate');
  assert.equal(generate.disabled,false,'fixture entered a valid request');
  send(ui.doc);await settle();
  assert.equal(calls.length,1);
  rejectRequest(Error('生成错误 A'));await settle();
  assert.match(ui.doc.querySelector('[role="alert"]').textContent,/生成错误 A/);
  send(ui.doc);await settle();
  assert.equal(calls.length,2);
  assert.equal(calls[1].context.previousError,'生成错误 A');
  const displayed=JSON.parse([...ui.doc.querySelectorAll('details')].find(node=>
    node.querySelector('summary').textContent.includes('配置与错误资料')).querySelector('pre').textContent);
  assert.equal(displayed.previousError,calls[1].context.previousError,
    'clearing the live error must not alter this request’s displayed context');
  assert.deepEqual(displayed.currentConfig,calls[1].context.currentConfig);
  assert.equal(requirement.value,'保留规则，增加标题副本');
  state.target={title:'网页已变化',url:'https://download.csdn.net/other/'};
  state.config={...state.config,itemConfig:{title:'h3'}};ui.paint();
  const during=JSON.parse([...ui.doc.querySelectorAll('details')].find(node=>
    node.querySelector('summary').textContent.includes('配置与错误资料')).querySelector('pre').textContent);
  assert.deepEqual(during,displayed,'a target/config refresh cannot rewrite the in-flight preview');
  assert.ok(ui.doc.body.textContent.includes(calls[1].context.page.url));
  rejectRequest(Error('生成错误 C'));await settle();
});

test('unknown permits next-input edits but fences generation/application and preserves the original request through stop and unmount',async t=>{
  const previous=globalThis.OpenDeskTool;
  const calls=[],busy=[],applied=[];
  const storage=storageFixture();
  let rejectRequest,cancelState='unknown';
  globalThis.OpenDeskTool={request:async(operation,payload)=>{
    if(operation.startsWith('storage.'))return storage(operation,payload);
    calls.push({operation,payload:structuredClone(payload)});
    if(operation==='ai.info')return {provider:'test-fixture',generation:1};
    if(operation==='ai.generate')return new Promise((resolve,reject)=>{rejectRequest=reject;});
    if(operation==='ai.cancel')return {requestId:payload.requestId,state:cancelState};
    throw Error('Unexpected operation '+operation);
  }};
  t.after(()=>{globalThis.OpenDeskTool=previous;});
  const state={config:{url:'https://example.com/',itemConfig:{title:'h2'}},target:{title:'Sent page',url:'https://example.com/'},profileEpoch:1,error:'original error'};
  const ui=createExtensionCenterDOM(t,{component:({show,...props})=>show?React.createElement(AiPanel,props):null,
    props:{show:true,state,valid:true,onBusy:value=>busy.push(value),onDirty(){},onApply:config=>applied.push(config),onClose(){}}});
  await settle();
  const get=id=>ui.doc.getElementById(id);
  const edit=(id,value)=>{get(id).value=value;get(id).dispatch('input');};
  const check=(id,value)=>{get(id).checked=value;get(id).dispatch('click');};
  const preview=()=>JSON.parse([...ui.doc.querySelectorAll('details')].find(node=>node.querySelector('summary').textContent.includes('配置与错误资料')).querySelector('pre').textContent);
  edit('ai-requirement','original requirement');edit('ai-sample','<h2>sent sample</h2>');check('ai-use-page',true);
  send(ui.doc);await settle();
  assert.equal(get('ai-requirement').disabled,true,'pending requests still lock edits');
  assert.equal(get('ai-use-page').closest('fieldset').hasAttribute('disabled'),true);
  const sent=calls.find(call=>call.operation==='ai.generate').payload;
  const sentPreview=preview();
  rejectRequest(Object.assign(Error('fixture outcome unknown'),{code:'E_AI_OUTCOME_UNKNOWN'}));await settle();
  assert.equal(get('ai-requirement').disabled,false,'unknown must allow preparing the next requirement');
  assert.equal(get('ai-use-page').closest('fieldset').hasAttribute('disabled'),false,'unknown must allow sample and selection edits');
  edit('ai-requirement','next requirement');edit('ai-sample','<p>next sample</p>');check('ai-use-config',false);check('ai-use-page',false);
  state.target={title:'Next page',url:'https://example.com/next'};state.config={...state.config,itemConfig:{title:'h3'}};ui.paint();
  assert.equal(get('ai-requirement').value,'next requirement');assert.equal(get('ai-sample').value,'<p>next sample</p>');
  assert.equal(get('ai-use-config').checked,false);assert.equal(get('ai-use-page').checked,false);
  const nextFields=get('ai-use-page').closest('fieldset');
  assert.match(nextFields.textContent,/下次待发送的资料/);assert.match(nextFields.textContent,/Next page/);
  assert.equal(nextFields.textContent.includes('Sent page'),false);
  assert.deepEqual(preview(),sentPreview,'edits must not rewrite the sent context');
  assert.ok(ui.doc.body.textContent.includes(sent.requestId),'show the unresolved request identity');
  assert.match(get('ai-request-status').textContent,/unknown/);
  assert.equal(get('ai-generate').disabled,true);assert.equal(get('ai-apply'),null);
  send(ui.doc);
  assert.equal(calls.filter(call=>call.operation==='ai.generate').length,1,'never replay unknown');
  assert.equal(get('ai-cancel').disabled,false);get('ai-cancel').dispatch('click');await settle();
  assert.deepEqual(calls.filter(call=>call.operation==='ai.cancel').map(call=>call.payload.requestId),[sent.requestId]);
  assert.equal(get('ai-generate').disabled,true);assert.match(get('ai-request-status').textContent,/unknown/);
  assert.deepEqual(preview(),sentPreview);assert.deepEqual(applied,[]);assert.equal(busy.at(-1),true);
  ui.state.show=false;ui.paint();await settle();
  assert.deepEqual(calls.filter(call=>call.operation==='ai.cancel').map(call=>call.payload.requestId),[sent.requestId,sent.requestId]);
  assert.equal(busy.at(-1),true,'unmount must not declare the unknown request resolved');
  assert.equal(calls.filter(call=>call.operation==='ai.generate').length,1);assert.deepEqual(applied,[]);
});

test('reopened pending identity and failed initial read block dispatch until a correlated terminal CAS clear',async t=>{
  const previous=globalThis.OpenDeskTool,calls=[];
  const stored={schemaVersion:1,requestId:'fixture-persisted-request'};
  const storage=storageFixture(stored);
  let stateReply='unknown',readFailed=true;
  globalThis.OpenDeskTool={request:async(operation,payload)=>{
    calls.push({operation,payload});
    if(operation==='storage.get'&&readFailed)throw Error('offline read');
    if(operation.startsWith('storage.'))return storage(operation,payload);
    if(operation==='ai.info')return {generation:1};
    if(operation==='ai.cancel')return {requestId:payload.requestId,state:stateReply};
    throw Error('Must not send');
  }};
  t.after(()=>{globalThis.OpenDeskTool=previous;});
  const state={config:{url:'https://example.com/',itemConfig:{title:'h2'}},target:{title:'page',url:'https://example.com/'},profileEpoch:1};
  const ui=createExtensionCenterDOM(t,{component:({show,...props})=>show?React.createElement(AiPanel,props):null,
    props:{show:true,state,valid:true,onBusy(){},onDirty(){},onApply(){throw Error('Must not apply');},onClose(){}}});
  await settle();
  const get=id=>ui.doc.getElementById(id);
  get('ai-requirement').value='new request';get('ai-requirement').dispatch('input');
  get('ai-use-page').checked=true;get('ai-use-page').dispatch('click');
  assert.equal(get('ai-generate').disabled,true,'failed initial read is fail closed');
  readFailed=false;ui.state.show=false;ui.paint();ui.state.show=true;ui.paint();await settle();
  assert.ok(ui.doc.body.textContent.includes(stored.requestId),'remount restores original ID');
  assert.equal(get('ai-generate').disabled,true);assert.equal(get('ai-cancel').disabled,false);
  get('ai-cancel').dispatch('click');await settle();
  assert.equal(get('ai-generate').disabled,true);assert.equal(calls.filter(c=>c.operation==='storage.set').length,0);
  stateReply='cancelled';get('ai-cancel').dispatch('click');await settle();
  const writes=calls.filter(c=>c.operation==='storage.set');assert.equal(writes.length,1);assert.equal(writes[0].payload.value,null);
  assert.deepEqual(calls.filter(c=>c.operation==='ai.cancel').map(c=>c.payload.requestId),[stored.requestId,stored.requestId]);
  assert.equal(calls.filter(c=>c.operation==='ai.generate').length,0);
});

test('local preview keeps the shared Chat draft across closing and reopening without dispatching AI',async t=>{
  const previous=globalThis.OpenDeskTool,storage=storageFixture(),calls=[];
  globalThis.OpenDeskTool={request:async(operation,payload)=>{
    calls.push(operation);
    if(operation.startsWith('storage.'))return storage(operation,payload);
    if(operation==='ai.info')throw Error('开发预览不允许真实写入、打开任务或控制网页');
    throw Error('Preview must not dispatch '+operation);
  }};
  t.after(()=>{globalThis.OpenDeskTool=previous;});
  const state={config:{url:'https://example.com/',itemConfig:{title:'h2'}},target:{title:'page',url:'https://example.com/'},profileEpoch:1};
  const ui=createExtensionCenterDOM(t,{component:({open,...props})=>React.createElement('div',{hidden:!open},React.createElement(AiPanel,{open,...props})),
    props:{open:false,state,valid:true,onBusy(){},onDirty(){},onApply(){throw Error('must not apply');},onClose(){}}});
  ui.window.getSelection=()=>({anchorNode:null,anchorOffset:0,focusNode:null,focusOffset:0}); // No native selection in linkedom.
  await settle();
  const get=id=>ui.doc.getElementById(id);
  assert.notEqual(ui.doc.activeElement,get('ai-requirement'),'a hidden assistant must not steal focus');
  ui.state.open=true;ui.paint();
  assert.equal(ui.doc.activeElement,get('ai-requirement'));
  get('ai-requirement').value='保留原规则，只增加 column_title';get('ai-requirement').dispatch('input');
  get('ai-sample').value='<h2>结构样本</h2>';get('ai-sample').dispatch('input');
  get('ai-use-page').checked=true;get('ai-use-page').dispatch('click');
  assert.equal(get('ai-generate').disabled,true);
  send(ui.doc);get('ai-requirement').dispatch('keydown',{key:'Enter'});await settle();
  ui.state.open=false;ui.paint();ui.state.open=true;ui.paint();
  assert.equal(get('ai-requirement').value,'保留原规则，只增加 column_title');
  assert.equal(get('ai-sample').value,'<h2>结构样本</h2>');assert.equal(get('ai-use-page').checked,true);
  assert.ok(ui.doc.querySelector('[data-opendesk-conversation-frame]'),'uses the actual shared frame');
  assert.match(ui.doc.querySelector('[role="alert"]').textContent,/开发预览/);
  assert.equal(calls.filter(op=>op==='ai.generate'||op==='ai.cancel').length,0);
});
