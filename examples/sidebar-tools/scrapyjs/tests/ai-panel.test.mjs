import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {createExtensionCenterDOM} from '../../../../tests/helpers/extension-center-react-dom.mjs';
import {AiPanel} from './react-fixture.mjs';
import '../src/app-model.js';

// Exercise the actual React state transitions in a DOM fixture. No browser,
// Native request, real Provider, installation or layout evidence is claimed.
const settle=()=>new Promise(resolve=>setImmediate(resolve));
// linkedom does not implement a browser's default submit-button action.
const send=doc=>doc.getElementById('ai-requirement').closest('form').dispatch('submit');
// Unknown uses the business query/stop action; the shared composer stop button
// is only rendered while generation is actively pending.

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
  send(ui.doc);await settle();
  assert.match(get('chat-ai-request-status').textContent,/unknown/);assert.equal(get('ai-generate').disabled,true);
  get('chat-ai-query-original').dispatch('click');await settle();
  assert.equal(get('chat-ai-request-status')===null,true);assert.equal(get('ai-generate').disabled,false);
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

test('default Chat exposes the shared message and composer without auxiliary business controls',async t=>{
  const previous=globalThis.OpenDeskTool,storage=storageFixture();
  globalThis.OpenDeskTool={request:async(op,args)=>op.startsWith('storage.')?storage(op,args):{generation:1}};
  t.after(()=>{globalThis.OpenDeskTool=previous;});
  const state={config:{url:'',itemConfig:{}},target:null,profileEpoch:0};
  const ui=createExtensionCenterDOM(t,{component:AiPanel,props:{state,valid:true,onBusy(){},onDirty(){},onClose(){}}});
  await settle();
  assert.ok(ui.doc.querySelector('[role="log"]'));assert.ok(ui.doc.getElementById('ai-requirement'));
  assert.ok(ui.doc.getElementById('ai-generate'));assert.ok(ui.doc.querySelector('.od-conversation-close'));
  assert.equal(ui.doc.querySelectorAll('#chat-ai-panel button').length,2);
});

test('ordinary conversation remains available without a ready capture and follows the previous reply',async t=>{
  const previous=globalThis.OpenDeskTool,storage=storageFixture(),calls=[];
  globalThis.OpenDeskTool={request:async(operation,payload)=>{
    if(operation.startsWith('storage.'))return storage(operation,payload);
    if(operation==='ai.info')return {provider:'local_codex',model:'fixture',generation:1};
    if(operation==='ai.generate'){
      calls.push(structuredClone(payload));
      return {requestId:payload.requestId,providerGeneration:1,
        proposal:{type:'explain',message:calls.length===1?'可以先讨论需求，再准备采集规则。':'上条说的是先讨论需求。'}};
    }
    throw Error('Unexpected '+operation);
  }};
  t.after(()=>{globalThis.OpenDeskTool=previous;});
  const state={config:{url:'https://example.com/',itemConfig:{title:'h2'}},target:null,profileEpoch:1,
    clientRequestId:'retired-capture',snapshot:{status:'stopped'},retired:true};
  const ui=createExtensionCenterDOM(t,{component:AiPanel,props:{state,valid:false,locked:true,businessLocked:true,
    onBusy(){},onDirty(){},onApply(){throw Error('must not apply');},onBusinessAction(){throw Error('must not execute');},onClose(){}}});
  ui.window.getSelection=()=>({anchorNode:null,anchorOffset:0,focusNode:null,focusOffset:0});
  await settle();const get=id=>ui.doc.getElementById(id);
  get('ai-requirement').value='先聊聊怎么使用';get('ai-requirement').dispatch('input');
  assert.equal(get('ai-generate').disabled,false,'capture readiness must not prevent ordinary questions');
  send(ui.doc);await settle();await settle();
  const log=ui.doc.querySelector('[role="log"]');
  assert.match(log.textContent,/先聊聊怎么使用/);assert.match(log.textContent,/可以先讨论需求/);
  assert.equal(get('ai-requirement').value,'','a conversational reply leaves a fresh composer');
  get('ai-requirement').value='你上条说了什么？';get('ai-requirement').dispatch('input');send(ui.doc);
  await settle();await settle();
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1].context.conversation,[{role:'user',content:'先聊聊怎么使用'},
    {role:'assistant',content:'可以先讨论需求，再准备采集规则。'}]);
  assert.match(log.textContent,/上条说的是先讨论需求/);
  assert.equal(get('chat-ai-apply'),null);assert.equal(get('chat-ai-confirm-operation'),null);
  assert.deepEqual(state.config.itemConfig,{title:'h2'});
});

test('stop in the terminal cleanup window leaves no proposal or unknown deadlock after reopening',async t=>{
  const previous=globalThis.OpenDeskTool,storage=storageFixture(),calls=[],busy=[],applied=[];
  let releaseClear,clearing=false;
  const clearGate=new Promise(resolve=>{releaseClear=resolve;});
  globalThis.OpenDeskTool={request:async(operation,payload)=>{
    calls.push({operation,payload:structuredClone(payload)});
    if(operation==='storage.set'&&payload.value===null){clearing=true;await clearGate;}
    if(operation.startsWith('storage.'))return storage(operation,payload);
    if(operation==='ai.info')return {generation:1};
    if(operation==='ai.generate')return {requestId:payload.requestId,providerGeneration:1,
      proposal:{type:'actions',actions:[{kind:'field.upsert',key:'copy',rule:'h2::text'}]}};
    if(operation==='ai.cancel')return {requestId:payload.requestId,state:'unknown'};
    throw Error('Unexpected operation '+operation);
  }};
  t.after(()=>{globalThis.OpenDeskTool=previous;releaseClear();});
  const state={config:{url:'https://example.com/',itemConfig:{title:'h2::text'}},target:{title:'Page',url:'https://example.com/'},profileEpoch:1};
  const ui=createExtensionCenterDOM(t,{component:AiPanel,props:{open:true,state,valid:true,
    onBusy:(working,details)=>busy.push({working,...details}),onDirty(){},onApply:config=>applied.push(config),onClose(){}}});
  ui.window.getSelection=()=>({anchorNode:null,anchorOffset:0,focusNode:null,focusOffset:0});
  await settle();const get=id=>ui.doc.getElementById(id);
  get('ai-requirement').value='add copy';get('ai-requirement').dispatch('input');
  send(ui.doc);await settle();assert.equal(clearing,true);
  get('chat-ai-cancel').dispatch('click');await settle();
  const during=busy.at(-1);
  releaseClear();await settle();
  assert.equal(get('chat-ai-apply')===null,true,'stopped candidate must never reach review or export');
  ui.state.open=false;ui.paint();await settle();ui.state.open=true;ui.paint();await settle();
  assert.equal(get('chat-ai-export'),null);assert.equal(get('chat-ai-request-status'),null);
  assert.equal(get('ai-generate').disabled,false,'stop must release the fence after confirmed cleanup');
  assert.equal(during.unknown,false,'waiting for known terminal cleanup is not an unknown cancellation');
  assert.deepEqual(busy.at(-1),{working:false,unknown:false});assert.deepEqual(applied,[]);
  assert.equal(get('ai-requirement').value,'add copy');
  assert.equal(calls.filter(call=>call.operation==='ai.generate').length,1,'no replay');
  assert.equal(calls.filter(call=>call.operation==='ai.cancel').length,0,'retain the real completed response');
});

test('retry sends a stable snapshot of the previous error and original config',async t=>{
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
  const generate=ui.doc.getElementById('ai-generate');
  assert.equal(generate.disabled,false,'fixture entered a valid request');
  send(ui.doc);await settle();
  assert.equal(calls.length,1);
  rejectRequest(Error('生成错误 A'));await settle();
  assert.match(ui.doc.querySelector('[role="alert"]').textContent,/生成错误 A/);
  send(ui.doc);await settle();
  assert.equal(calls.length,2);
  assert.equal(calls[1].context.previousError,'生成错误 A');
  const sent=structuredClone(calls[1].context);
  state.target={title:'网页已变化',url:'https://download.csdn.net/other/'};
  state.config={...state.config,itemConfig:{title:'h3'}};ui.paint();
  assert.deepEqual(calls[1].context,sent);
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
    props:{show:true,open:true,state,valid:true,onBusy:value=>busy.push(value),onDirty(){},onApply:config=>applied.push(config),onClose(){}}});
  await settle();
  const get=id=>ui.doc.getElementById(id);
  const edit=(id,value)=>{get(id).value=value;get(id).dispatch('input');};
  edit('ai-requirement','original requirement');
  send(ui.doc);await settle();
  assert.equal(get('ai-requirement').disabled,true,'pending requests still lock edits');
  const sent=calls.find(call=>call.operation==='ai.generate').payload;
  const sentContext=structuredClone(sent.context);
  rejectRequest(Object.assign(Error('fixture outcome unknown'),{code:'E_AI_OUTCOME_UNKNOWN'}));await settle();
  assert.equal(get('ai-requirement').disabled,false,'unknown must allow preparing the next requirement');
  edit('ai-requirement','next requirement');
  state.target={title:'Next page',url:'https://example.com/next'};state.config={...state.config,itemConfig:{title:'h3'}};ui.paint();
  assert.equal(get('ai-requirement').value,'next requirement');
  assert.deepEqual(sent.context,sentContext);
  assert.ok(ui.doc.body.textContent.includes(sent.requestId),'show the unresolved request identity');
  assert.match(get('chat-ai-request-status').textContent,/unknown/);
  assert.equal(get('ai-generate').disabled,true);assert.equal(get('chat-ai-apply'),null);
  const input=get('ai-requirement');
  ui.state.open=false;ui.paint();await settle();
  assert.equal(get('chat-ai-panel').hidden,true);assert.equal(ui.doc.querySelector('.od-conversation-close').disabled,false,'unknown can be collapsed without clearing its lock');
  assert.equal(calls.filter(call=>call.operation==='ai.cancel').length,0,'hiding has no request side effect');
  assert.equal(busy.at(-1),true);assert.equal(input,get('ai-requirement'));
  ui.state.open=true;ui.paint();await settle();
  assert.equal(get('ai-requirement').value,'next requirement');assert.match(get('chat-ai-request-status').textContent,/unknown/);
  assert.equal(get('ai-generate').disabled,true,'reopening never releases unknown');
  send(ui.doc);
  assert.equal(calls.filter(call=>call.operation==='ai.generate').length,1,'never replay unknown');
  assert.equal(get('chat-ai-query-original').disabled,false);get('chat-ai-query-original').dispatch('click');await settle();
  assert.deepEqual(calls.filter(call=>call.operation==='ai.cancel').map(call=>call.payload.requestId),[sent.requestId]);
  assert.equal(get('ai-generate').disabled,true);assert.match(get('chat-ai-request-status').textContent,/unknown/);
  assert.deepEqual(sent.context,sentContext);assert.deepEqual(applied,[]);assert.equal(busy.at(-1),true);
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
  assert.equal(get('ai-generate').disabled,true,'failed initial read is fail closed');
  readFailed=false;ui.state.show=false;ui.paint();ui.state.show=true;ui.paint();await settle();
  assert.ok(ui.doc.body.textContent.includes(stored.requestId),'remount restores original ID');
  assert.equal(get('ai-generate').disabled,true);assert.equal(get('chat-ai-query-original').disabled,false);
  get('chat-ai-query-original').dispatch('click');await settle();
  assert.equal(get('ai-generate').disabled,true);assert.equal(calls.filter(c=>c.operation==='storage.set').length,0);
  stateReply='cancelled';get('chat-ai-query-original').dispatch('click');await settle();
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
  assert.equal(ui.doc.activeElement,get('ai-requirement'),'opening the bottom Dock focuses the shared composer');
  get('ai-requirement').value='保留原规则，只增加 column_title';get('ai-requirement').dispatch('input');
  assert.equal(get('ai-generate').disabled,true);
  send(ui.doc);get('ai-requirement').dispatch('keydown',{key:'Enter'});await settle();
  ui.state.open=false;ui.paint();ui.state.open=true;ui.paint();
  assert.equal(get('ai-requirement').value,'保留原规则，只增加 column_title');
  assert.ok(ui.doc.querySelector('[data-opendesk-conversation-frame]'),'uses the actual shared frame');
  assert.match(ui.doc.querySelector('[role="alert"]').textContent,/开发预览/);
  assert.equal(calls.filter(op=>op==='ai.generate'||op==='ai.cancel').length,0);
});

// The original business-action tests now live at App level: Chat never dispatches
// collection/export. These races cover automatic configuration writes instead.
for(const drift of ['profile','config','page','locked','provider','pending','unmount'])
  test('automatic configuration editing rejects '+drift+' drift before applying',async t=>{
    const previous=globalThis.OpenDeskTool,storage=storageFixture(),applied=[];
    let release,requestId;
    const gate=new Promise(resolve=>{release=resolve;});
    const state={config:{url:'https://example.com/',itemConfig:{title:'h2'}},target:{url:'https://example.com/'},profileEpoch:1};
    globalThis.OpenDeskTool={request:async(op,args)=>{
      if(op.startsWith('storage.'))return storage(op,args);
      if(op==='ai.info')return {generation:drift==='provider'&&requestId?2:1};
      if(op==='ai.generate'){requestId=args.requestId;return gate;}
      if(op==='ai.cancel')return {requestId:args.requestId,state:'cancelled'};
      throw Error('Unexpected '+op);
    }};
    t.after(()=>{globalThis.OpenDeskTool=previous;});
    const ui=createExtensionCenterDOM(t,{component:({show,...props})=>show?React.createElement(AiPanel,props):null,
      props:{show:true,state,valid:true,onBusy(){},onDirty(){},onApply:value=>applied.push(value),onClose(){}}});
    await settle();const input=ui.doc.getElementById('ai-requirement');input.value='新增 copy 字段';input.dispatch('input');send(ui.doc);await settle();
    if(drift==='profile')state.profileEpoch++;
    if(drift==='config')state.config={...state.config,maxPages:2};
    if(drift==='page')state.target={url:'https://example.com/other'};
    if(drift==='locked')ui.state.locked=true;
    if(drift==='unmount')ui.state.show=false;
    ui.paint();
    // A different persisted identity must survive the old round's cleanup.
    if(drift==='pending')await storage('storage.set',{key:'ai-pending-request',ifMatch:'1',value:{schemaVersion:1,requestId:'other'}});
    release({requestId,providerGeneration:1,proposal:{type:'actions',actions:[{kind:'field.upsert',key:'copy',rule:'h2'}]}});
    await settle();await settle();assert.deepEqual(applied,[]);
  });
