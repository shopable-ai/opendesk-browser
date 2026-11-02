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

test('an empty workspace supports manual incremental editing without samples, AI or implicit execution',async t=>{
  const f=await fixture(t,{empty:true}),{get}=f;
  const read=()=>JSON.parse(get('config-json').value||get('config-json').defaultValue);
  assert.deepEqual(read(),{url:'',itemConfig:{}});assert.equal(get('target-url').value,'');
  assert.equal(get('start').disabled,true);assert.equal(get('save-config').disabled,true);
  f.edit('target-url',base.url);assert.equal(get('new-field').disabled,false);
  assert.deepEqual(read(),{url:base.url,itemConfig:{}});assert.equal(get('start').disabled,true);
  f.edit('config-json',JSON.stringify({url:base.url,itemConfig:{title:'h2::text'}}));
  assert.equal(get('start').disabled,false);assert.equal(get('save-config').disabled,false);
  assert.equal(f.calls.some(c=>c.operation==='ai.generate'||c.operation==='controllers.start'||c.operation==='tasks.start'||c.operation==='browser.downloads.text'),false);
  assert.equal(f.rows.get('capture-config').value,null);
});

test('an explicit AI configuration can initialize an empty draft only for the current page',async t=>{
  const config={url:base.url,itemConfig:{title:'h2::text'}};
  const f=await fixture(t,{empty:true,generate:async payload=>({requestId:payload.requestId,providerGeneration:1,proposal:{type:'config.proposal',config}})});
  f.get('open-ai-config').dispatch('click');f.edit('ai-requirement','把采集规则设为 title 字段，选择器 h2::text');
  f.get('ai-requirement').closest('form').dispatch('submit');await settle();await settle();await settle();
  assert.deepEqual(JSON.parse(f.get('config-json').value),config);
  assert.equal(f.rows.get('capture-config').value,null);
});

test('shared Chat applies an explicit lossless edit and saves a copy only through the original configuration library',async t=>{
  const original={url:'https://download.csdn.net/column/',itemConfig:{_listContainer:'.columns',_listItem:'.column',
    title:{selector:'h2 a',read:'text',cardinality:'one'},url:'h2 a::href',nested:{author:'.author'}},
    waitForSelector:'.column',timeoutMs:30000,validation:{version:1,rowShape:'column'},
    fieldRequirements:[{key:'title',required:true,valueType:'text'}],processing:{version:1,rules:[{op:'splitPublication',field:'title'}]}};
  const proposal=structuredClone(original);proposal.itemConfig.column_title=structuredClone(original.itemConfig.title);
  const catalog={schemaVersion:1,selectedId:'original',records:[{id:'original',name:'CSDN 核心',config:original}]};
  const rows=new Map([['capture-config',{value:structuredClone(catalog),etag:'0'}],['ai-pending-request',{value:null,etag:'0'}]]);
  const calls=[];let resolveProposal;
  const previous=Object.fromEntries(['OpenDeskTool','ScrapyAppModel','ScrapyAppSdk','requestAnimationFrame','FocusEvent'].map(key=>[key,globalThis[key]]));
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
    requestAnimationFrame:callback=>setTimeout(callback,0),
    FocusEvent:class extends Event{constructor(type,options){super(type,options);this.relatedTarget=options?.relatedTarget??null;}}});
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
  const config=()=>JSON.parse(get('config-json').value||get('config-json').defaultValue);
  assert.deepEqual(config(),proposal);
  assert.equal(get('chat-ai-config-preview'),null,'ordinary edits do not require a technical review');
  assert.match(ui.doc.querySelector('[role="log"]').textContent,/已更新配置草稿/);
  assert.equal(get('chat-ai-undo'),null);assert.equal(get('chat-ai-apply'),null);
  assert.deepEqual(rows.get('capture-config').value,catalog);assert.equal(writes().length,0);
  assert.equal(ui.doc.querySelector('#profile-naming').hidden,true);

  assert.equal(get('ai-requirement').value,'','a successful response leaves a fresh composer');
  assert.equal(get('ai-generate').disabled,true,'an empty composer cannot resend the reviewed request');
  get('ai-requirement').dispatch('keydown',{key:'Enter'});await settle();
  assert.equal(calls.filter(call=>call.operation==='ai.generate').length,1,'Enter cannot resend an unchanged reviewed proposal');

  assert.equal(get('profile-naming').hidden,true,'applying leaves naming to the explicit save action');
  assert.equal(get('chat-ai-panel').hidden,false,'applying remains in the business workspace with the Chat mounted');
  assert.equal(get('chat-ai-save'),null);assert.equal(get('chat-ai-run'),null);assert.equal(get('chat-ai-results'),null);
  get('manage-profiles').dispatch('click');get('copy-profile').dispatch('click');await settle();await settle();
  assert.equal(get('profile-naming').hidden,false);assert.equal(get('profile-name').value,'CSDN 核心 副本');
  assert.equal(get('start').disabled,true,'naming must finish before Run is available');
  assert.equal(writes().length,0,'applying a proposal only edits the local draft');
  assert.deepEqual(rows.get('capture-config').value,catalog,'original stays saved until explicit named save');
  get('profile-name').type='text'; // Browser default; linkedom otherwise reports a null input type to React.
  edit('profile-name','CSDN 核心');get('profile-name-submit').dispatch('click');await settle();await settle();
  assert.equal(get('profile-naming').hidden,false);assert.equal(writes().length,0);
  assert.doesNotMatch(get('chat-ai-feedback').textContent,/此提案的配置已保存/,'failed naming must not acknowledge a save');
  get('profile-name').type='text'; // React re-renders the default input type after the validation error.
  edit('profile-name','CSDN 标题副本');get('profile-name-submit').dispatch('click');await settle();await settle();
  const saved=rows.get('capture-config').value;
  assert.equal(writes().length,1);assert.equal(saved.records.length,2);assert.notEqual(saved.selectedId,'original');
  assert.deepEqual(saved.records.find(row=>row.id==='original'),catalog.records[0]);
  assert.deepEqual(saved.records.find(row=>row.id===saved.selectedId),{id:saved.selectedId,name:'CSDN 标题副本',config:proposal});
  assert.equal(get('profile-naming').hidden,true);assert.equal(get('start').disabled,false);
  assert.equal(rows.get('capture-config').value.records.length,2);
  assert.doesNotMatch(get('chat-ai-feedback').textContent,/未保存|命名保存/,'saved receipt replaces the pending naming instruction');
  assert.equal(calls.some(call=>call.operation.startsWith('tasks.')||call.operation.startsWith('controllers.')||call.operation.startsWith('browser.')),false,
    'AI, apply and save must never start capture, navigate or download');
});

const sample='<ul id="books"><li data-id="A"><h2>浏览器工具</h2><span class="price">19.50</span></li></ul><a class="next" href="page-2.html">下一页</a>';

for(const request of ['只解释 title 的 CSV 表头，不要修改配置','如果把 title 表头改为书名会怎样？','讨论把 title 表头改为书名的影响','把 title 表头改为书名有什么风险？','别人说把 title 的 CSV 表头改为书名。','有人建议把 title 的 CSV 表头改为书名。'])test('discussion cannot authorize a model-proposed configuration write: '+request,async t=>{
 const f=await fixture(t,{generate:async payload=>({requestId:payload.requestId,providerGeneration:1,
   proposal:{type:'actions',actions:[{kind:'csv.configure',fieldNames:{title:'书名'},fieldOrder:['title','id','price']}]}})});
 const read=()=>JSON.parse(f.get('config-json').value||f.get('config-json').defaultValue),before=read();
 f.get('open-ai-config').dispatch('click');f.edit('ai-requirement',request);f.get('ai-requirement').dispatch('keydown',{key:'Enter'});
 await settle();await settle();await settle();
 assert.deepEqual(read(),before);assert.equal(f.get('chat-ai-undo'),null);assert.equal(f.get('chat-ai-apply'),null);
 assert.match(f.ui.doc.querySelector('[role="log"]').textContent,/尚未修改配置/);
 assert.equal(f.calls.some(row=>row.operation==='storage.set'&&row.payload.key==='capture-config'),false);
});

test('a failed original save preserves the applied draft without a second Chat save or undo area',async t=>{
 const f=await fixture(t,{saveConfig:async()=>{throw Error('保存结果未知');},generate:async payload=>({requestId:payload.requestId,providerGeneration:1,
   proposal:{type:'actions',actions:[{kind:'csv.configure',fieldNames:{title:'书名'},fieldOrder:['title','id','price']}]}})});
 f.get('open-ai-config').dispatch('click');f.edit('ai-requirement','把 title 的 CSV 表头改为书名');f.get('ai-requirement').dispatch('keydown',{key:'Enter'});
 await settle();await settle();await settle();assert.equal(f.get('chat-ai-undo'),null);
 const read=()=>JSON.parse(f.get('config-json').value||f.get('config-json').defaultValue),draft=read();
 f.get('save-config').dispatch('click');await settle();await settle();await settle();
 assert.equal(Boolean(f.get('chat-ai-undo')),false);assert.deepEqual(read(),draft);
 assert.match(f.ui.doc.body.textContent,/保存结果未知|保存版本/);
});

test('an explicit CSV edit updates the original JSON without touching collection or saved records',async t=>{
 const f=await fixture(t,{generate:async payload=>({requestId:payload.requestId,providerGeneration:1,
   proposal:{type:'actions',actions:[{kind:'csv.configure',fieldNames:{title:'书名'},fieldOrder:['title','id','price']}]}})});
 const read=()=>JSON.parse(f.get('config-json').value||f.get('config-json').defaultValue),before=read();
 f.get('open-ai-config').dispatch('click');f.edit('ai-requirement','把 title 的 CSV 表头改为书名，列顺序改为 title、id、price');f.get('ai-requirement').dispatch('keydown',{key:'Enter'});
 await settle();await settle();await settle();
 assert.deepEqual(read(),{...before,output:{fieldNames:{title:'书名'},fieldOrder:['title','id','price']}});
 assert.equal(f.get('chat-ai-undo'),null);assert.equal(f.get('chat-ai-save'),null);
 assert.equal(f.calls.some(row=>row.operation==='storage.set'&&row.payload.key==='capture-config'||row.operation.startsWith('controllers.')||row.operation.startsWith('tasks.')),false);
});

test('AI button requires a bound structure and previews on the original runner without saving or starting full',async t=>{
 const f=await fixture(t,{generate:async payload=>({requestId:payload.requestId,providerGeneration:1,proposal:base,metadata:{turnId:'fixture-turn'}})}),{get}=f;
 get('open-local-runner').dispatch('click');await settle();await settle();
 const saved=structuredClone(f.rows.get('capture-config'));
 assert.ok(get('ai-trial'),'minimal AI action stays in original collection workspace');
 get('ai-trial').dispatch('click');await settle();
 assert.equal(f.calls.some(c=>c.operation==='ai.generate'||c.operation==='ai.cancel'),false,'no structure means no AI send');
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
 const f=await fixture(t,{pendingAi:true}),{get}=f;
 assert.equal(get('open-local-runner').disabled,false,'unresolved AI does not lock independent manual collection');
 get('open-local-runner').dispatch('click');await settle();await settle();
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

test('reopening a pending AI request exposes recovery without a host AI button',async t=>{
  const f=await fixture(t,{pendingAi:true}),{get,ui,calls,rows}=f;
  assert.equal(get('chat-ai-panel').hidden,false,'restored request must expose its recovery controls');
  assert.match(get('chat-ai-request-status').textContent,/unknown-ai/);
  assert.equal(get('chat-ai-query-original').disabled,false);
  assert.equal(get('start').disabled,true,'retain the unresolved request guard');
  ui.doc.querySelector('.od-conversation-close').dispatch('click');await settle();
  assert.equal(get('chat-ai-panel').hidden,true);
  assert.equal(get('ai-recovery').hidden,false,'collapsed busy Chat retains an actionable explanation');
  get('reopen-ai-request').dispatch('click');await settle();
  assert.equal(get('chat-ai-panel').hidden,false);
  get('chat-ai-query-original').dispatch('click');await settle();
  assert.equal(get('start').disabled,true,'unknown stop must not release the request');
  assert.deepEqual(rows.get('ai-pending-request').value,{schemaVersion:1,requestId:'unknown-ai'});
  assert.deepEqual(calls.filter(c=>c.operation==='ai.cancel').map(c=>c.payload.requestId),['unknown-ai']);
  assert.equal(calls.some(c=>c.operation==='ai.generate'||c.operation==='tasks.start'||c.operation==='controllers.start'||c.operation==='storage.set'),false);
});

test('a host without the conversation toolbar keeps a tool-local AI entry',async t=>{
  const f=await fixture(t),{get}=f;
  assert.ok(get('open-ai-config'),'older supported hosts retain access to AI');
  get('open-ai-config').dispatch('click');await settle();
  assert.equal(get('chat-ai-panel').hidden,false);
});

test('terminal AI recovery also retires the passive workspace guard for the same stored request',async t=>{
  const {get,rows}=await fixture(t,{pendingAi:true});
  const states=[],tool=globalThis.OpenDeskTool,request=tool.request;
  tool.setState=value=>states.push(value);
  tool.request=(operation,payload)=>operation==='ai.cancel'
    ?Promise.resolve({requestId:payload.requestId,state:'cancelled'}):request(operation,payload);
  get('chat-ai-query-original').dispatch('click');await settle();await settle();await settle();
  assert.equal(rows.get('ai-pending-request').value,null);
  assert.equal(states.at(-1).busy,false,'a second passive reader must not keep the Host locked after correlated recovery');
});


test('terminal workspace recovery also retires the passive Chat guard without a late proposal',async t=>{
  const {get,rows,calls}=await fixture(t,{pendingAi:true});
  const states=[],tool=globalThis.OpenDeskTool,request=tool.request;
  tool.setState=value=>states.push(value);
  tool.request=(operation,payload)=>operation==='ai.cancel'
    ?Promise.resolve({requestId:payload.requestId,state:'completed'}):request(operation,payload);
  get('ai-cancel').dispatch('click');for(let n=0;n<20&&states.at(-1)?.busy!==false;n++)await settle();
  assert.equal(rows.get('ai-pending-request').value,null);
  assert.equal(get('chat-ai-request-status'),null);
  assert.equal(states.at(-1).busy,false);
  assert.equal(get('chat-ai-review'),null);
  assert.equal(calls.some(c=>c.operation==='ai.generate'||c.operation==='tasks.start'),false);
});

for(const kind of ['wrong identity','unknown','lost cleanup receipt','changed stored identity'])
  test('AI recovery keeps both readers fenced after '+kind,async t=>{
    const {get,rows}=await fixture(t,{pendingAi:true});
    const states=[],tool=globalThis.OpenDeskTool,request=tool.request;
    tool.setState=value=>states.push(value);
    tool.request=async(operation,payload)=>{
      if(operation==='ai.cancel'){
        if(kind==='changed stored identity')rows.set('ai-pending-request',{value:{schemaVersion:1,requestId:'other-ai'},etag:'1'});
        return {requestId:kind==='wrong identity'?'other-ai':payload.requestId,state:kind==='unknown'?'unknown':'cancelled'};
      }
      if(kind==='lost cleanup receipt'&&operation==='storage.set'&&payload.key==='ai-pending-request')throw Error('cleanup receipt unavailable');
      return request(operation,payload);
    };
    get('chat-ai-query-original').dispatch('click');await settle();await settle();await settle();
    assert.equal(states.at(-1).busy,true);
    assert.equal(rows.get('ai-pending-request').value.requestId,kind==='changed stored identity'?'other-ai':'unknown-ai');
    assert.match(get('ai-status').textContent,/unknown-ai/);
    assert.ok(get('chat-ai-query-original'));
  });

test('Chat business requests leave start, stop and download solely to the original business UI',async t=>{
  const config={url:'https://example.com/',itemConfig:{title:'h2::text'},output:{fieldNames:{title:'原表头'}}};
  const rows=new Map([['capture-config',{value:config,etag:'0'}],['ai-pending-request',{value:null,etag:'0'}]]);
  const calls=[];let requestId,kind='capture.start',stopped=false;
  const previous=Object.fromEntries(['OpenDeskTool','ScrapyAppModel','ScrapyAppSdk','requestAnimationFrame','FocusEvent'].map(key=>[key,globalThis[key]]));
  const tool={setState(){},request:async(op,args)=>{
    calls.push({op,args:structuredClone(args)});
    if(op==='storage.get')return structuredClone(rows.get(args.key));
    if(op==='storage.set'){
      const row=rows.get(args.key);assert.equal(args.ifMatch,row.etag);
      rows.set(args.key,{value:structuredClone(args.value),etag:String(Number(row.etag)+1)});return {saved:true};
    }
    if(op==='currentPage.info')return {status:'available',title:'Page',url:config.url};
    if(op==='ai.info')return {generation:1};
    if(op==='ai.generate')return {requestId:args.requestId,providerGeneration:1,
      proposal:{type:'operation',operation:{kind,...(kind==='results.export'?{format:'csv',mode:'custom',settingsSource:'current'}:{})}}};
    if(op==='controllers.read'&&!args.clientRequestId)return {controller:{sourceHash:'a'.repeat(64)}};
    if(op==='controllers.start'){requestId=args.clientRequestId;return {clientRequestId:requestId,runId:'original-run',state:'running'};}
    if(op==='controllers.read')return {clientRequestId:args.clientRequestId,runId:'original-run',state:stopped?'cancelled':'running',
      retirementState:stopped?'released':'retained',value:{data:[{title:'Actual result'}],engine:{status:stopped?'cancelled':'running'}}};
    if(op==='controllers.stop'){stopped=true;return {clientRequestId:args.clientRequestId,runId:'original-run',state:'stopping',retirementState:'released'};}
    if(op==='browser.downloads.text')return {started:true};
    throw Error('Unexpected '+op);
  }};
  Object.assign(globalThis,{OpenDeskTool:tool,ScrapyAppModel:context.ScrapyAppModel,ScrapyAppSdk:context.ScrapyAppSdk,
    requestAnimationFrame:callback=>setTimeout(callback,0),
    FocusEvent:class extends Event{constructor(type,options){super(type,options);this.relatedTarget=options?.relatedTarget??null;}}});
  t.after(()=>Object.assign(globalThis,previous));
  const ui=createExtensionCenterDOM(t,{component:()=>{tool.root=globalThis.document.getElementById('opendesk-react-app');return React.createElement(App);}});
  ui.window.getSelection=()=>({anchorNode:null,anchorOffset:0,focusNode:null,focusOffset:0});
  await settle();await settle();const get=id=>ui.doc.getElementById(id);
  get('open-ai-config').dispatch('click');
  for(const operation of ['capture.start','results.show','capture.stop','results.export']) {
    kind=operation;get('ai-requirement').value=kind;get('ai-requirement').dispatch('input');
    const before=calls.filter(c=>['controllers.start','controllers.stop','browser.downloads.text'].includes(c.op)).length;
    get('ai-requirement').closest('form').dispatch('submit');await settle();await settle();
    assert.equal(calls.filter(c=>['controllers.start','controllers.stop','browser.downloads.text'].includes(c.op)).length,before,'proposal has no business side effects');
    assert.equal(get('chat-ai-confirm-operation'),null);
  }
  get('start').dispatch('click');await settle();await settle();
  get('stop').dispatch('click');await settle();await settle();
  get('download-csv').dispatch('click');await settle();await settle();
  assert.equal(calls.filter(c=>c.op==='controllers.start').length,1);assert.equal(calls.filter(c=>c.op==='controllers.stop').length,1);
  assert.equal(calls.find(c=>c.op==='controllers.stop').args.clientRequestId,requestId);
  const downloads=calls.filter(c=>c.op==='browser.downloads.text');assert.equal(downloads.length,1);
  assert.equal(downloads[0].args.filename,'scrapyjs-result.csv');assert.match(downloads[0].args.text,/title/);assert.match(downloads[0].args.text,/Actual result/);
  assert.equal(calls.some(c=>c.op==='storage.set'&&c.args.key==='capture-config'),false);
  assert.deepEqual(rows.get('capture-config').value,config);
});
