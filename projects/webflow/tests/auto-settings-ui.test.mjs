import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {createChatGPTFixedBridgeHost} from '../../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {createChatGPTBridgeTriggerLedger} from '../../../src/native-agent/chatgpt-bridge-trigger-gate.js';

// React detects input event support once at import. Supply a DOM before loading
// its client so this fixture exercises onChange through real delegated events.
const bootstrap=parseHTML('<html><body></body></html>');
const bootstrapGlobals=new Map(['window','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
Object.assign(globalThis,{window:bootstrap.window,document:bootstrap.document});
bootstrap.document.oninput=null;
const {createRoot}=await import('react-dom/client');
for(const [key,value]of bootstrapGlobals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}

// Only transpile the real settings components in memory; no product output or Browser.
const compiled=await build({stdin:{contents:`
 export {WebflowAutoSettings,WebflowAutoControls} from './projects/webflow/trusted/AutoSettings.tsx';
 export {SharedProviderSettingsSheet} from './src/ui/react/components/provider-settings.tsx';
`,resolveDir:fileURLToPath(new URL('../../../',import.meta.url)),loader:'tsx'},
 bundle:true,write:false,packages:'external',format:'esm',jsx:'transform'});
const code=compiled.outputFiles[0].text.replace(/from "([^"]+)"/g,(_,name)=>
 `from ${JSON.stringify(import.meta.resolve(name))}`);
const {WebflowAutoSettings,WebflowAutoControls,SharedProviderSettingsSheet}=await import(
 'data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const installation={version:'1.1.1',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),
 scriptId:'task:search:1.1.1',revision:1,installationId:'install-one',generation:1};
const task={taskId:'search',name:'搜索任务',description:'读取搜索结果',version:'1.1.1',
 siteOrigins:['https://search.example'],installation,paramsSchema:{type:'object',
 required:['query','limit'],properties:{query:{type:'string',default:'OpenDesk'},limit:{type:'integer',default:3}}}};
const scope={taskId:'search',args:{query:'OpenDesk',limit:3},targetUrl:'https://search.example/',installation};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

function controller(){
 let snapshot={enabled:false,epoch:1,tasks:[task],grants:[],unavailable:[]};
 const calls=[];
 const api={
  readAutoSettings(){calls.push(['read']);return Promise.resolve(structuredClone(snapshot));},
  prepareAutoGrant(input){calls.push(['prepare',input]);return Promise.resolve({...input,taskName:task.name});},
  approveAutoTask(review,event){calls.push(['approve',review,event]);snapshot={...snapshot,grants:[{
   taskId:review.taskId,grantId:'grant-one',state:'active',approvedAt:1793548800000,scope:review}]};return Promise.resolve(structuredClone(snapshot));},
  setAutoEnabled(value,event){calls.push(['enabled',value,event]);snapshot={...snapshot,enabled:value};return Promise.resolve(structuredClone(snapshot));},
  revokeAutoTask(taskId,event){calls.push(['revoke',taskId,event]);snapshot={...snapshot,grants:snapshot.grants.map(grant=>({...grant,state:'revoked'}))};return Promise.resolve(structuredClone(snapshot));}
 };
 return {api,calls,get snapshot(){return snapshot;},set snapshot(next){snapshot=next;}};
}

async function fixture(t,{sheet=false,entry=false,host=controller()}={}){
 const {window,document}=parseHTML('<html><body><div id="opendesk-react-app"></div></body></html>');
 const previous=new Map(['window','document','HTMLElement','Element','SVGElement','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,Element:window.Element,SVGElement:window.SVGElement,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('opendesk-react-app'));
 const settings={source:'local_codex',endpoint:'',model:'',hasApiKey:false,generation:0};
 let open=true,closed=0,saves=0;
 let display={hidden:false,data:{toolId:'webflow',enabled:true,preview:false,settingsOpen:false}};
 const providerSettings={settingsSnapshot:()=>settings,updateSettings(){saves++;}};
 const render=()=>React.act(async()=>root.render(sheet
  ?React.createElement(SharedProviderSettingsSheet,{doc:document,open,providerSettings,webflowAuto:host.api,onClose(){closed++;}})
  :entry?React.createElement(WebflowAutoControls,{webflowAuto:host.api,display,visible:open})
  :React.createElement(WebflowAutoSettings,{webflowAuto:host.api})));
 t.after(async()=>{
  await React.act(async()=>root.unmount());
  for(const [key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
 });
 const find=id=>{const node=document.getElementById(id);return id==='webflow-auto-enabled'?(node?.querySelector('input')??node):node;};
 // isTrusted is injected ONLY in this DOM fixture to test the gate and event forwarding.
 // It cannot establish a real Chrome user gesture or Host authorization.
 const click=async(id,trusted=false)=>{
  const event=new window.Event('click',{bubbles:true,cancelable:true});
  Object.defineProperty(event,'isTrusted',{value:trusted});
  await React.act(async()=>find(id).dispatchEvent(event));return event;
 };
 const input=async(id,value)=>React.act(async()=>{
  const node=find(id);
  if(node.tagName==='SELECT'){
   for(const option of node.querySelectorAll('option'))option.selected=option.value===value;
  }else Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node),'value').set.call(node,value);
  node.dispatchEvent(new window.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));
 });
 await render();
 return {host,find,document,window,click,input,render,async setOpen(value){open=value;await render();},
  async setDisplay(value){display=value;await render();},get saves(){return saves;},get closed(){return closed;}};
}

test('defaults come from the catalog schema, preparation displays exact scope and never approves',async t=>{
 const f=await fixture(t);
 assert.equal(String(f.find('webflow-auto-enabled').checked),'false');
 assert.deepEqual(JSON.parse(f.find('webflow-auto-args').value),scope.args);
 assert.equal(f.find('webflow-auto-target').value,scope.targetUrl);
 assert.equal(f.find('webflow-auto-approve'),null);
 const target='https://search.example/path?query=%E4%B8%AD&limit=3';
 await f.input('webflow-auto-target',target);
 await f.input('webflow-auto-args','{"query":"<script>review</script>","limit":3}');
 await f.click('webflow-auto-prepare');
 assert.deepEqual(f.host.calls.at(-1),['prepare',{...scope,targetUrl:target,args:{query:'<script>review</script>',limit:3}}]);
 const review=f.find('webflow-auto-review');
 assert.ok(review);assert.match(review.textContent,/搜索任务/);assert.ok(review.textContent.includes(target));
 assert.match(review.textContent,/<script>review<\/script>/);assert.equal(review.querySelector('script'),null);
 assert.equal(review.querySelector('details').hasAttribute('open'),false);
 assert.equal(f.host.calls.filter(([kind])=>kind==='approve').length,0);
 await f.click('webflow-auto-approve');
 assert.equal(f.host.calls.filter(([kind])=>kind==='approve').length,0,'synthetic clicks must not authorize');
 const event=await f.click('webflow-auto-approve',true);
 assert.equal(f.host.calls.at(-1)[0],'approve');assert.equal(f.host.calls.at(-1)[2],event);
 assert.equal(f.find('webflow-auto-review'),null);
 assert.match(f.find('webflow-auto-grants').textContent,/搜索任务/);
 assert.equal(String(f.find('webflow-auto-enabled').checked),'false','approval does not enable auto mode');
});

test('every edited scope invalidates a review, including an in-flight preparation and edit-then-restore',async t=>{
 const host=controller(),pending=deferred();
 host.api.prepareAutoGrant=input=>{host.calls.push(['prepare',input]);return pending.promise;};
 const f=await fixture(t,{host});
 await f.click('webflow-auto-prepare');
 await f.input('webflow-auto-args','{"query":"changed","limit":3}');
 await f.input('webflow-auto-args',JSON.stringify(scope.args));
 await React.act(async()=>pending.resolve({...scope,taskName:task.name}));
 assert.equal(f.find('webflow-auto-approve'),null,'a stale async result cannot restore an invalidated review');
 host.api.prepareAutoGrant=async input=>({...input,taskName:task.name});
 for(const [id,value]of [['webflow-auto-target',scope.targetUrl+'next'],['webflow-auto-args','{}'],['webflow-auto-task','search']]){
  await f.click('webflow-auto-prepare');assert.ok(f.find('webflow-auto-approve'));
  await f.input(id,value);assert.equal(f.find('webflow-auto-approve'),null,id);
 }
 await f.input('webflow-auto-args','{"bad":');
 const count=host.calls.filter(([kind])=>kind==='prepare').length;
 await f.click('webflow-auto-prepare');
 assert.equal(host.calls.filter(([kind])=>kind==='prepare').length,count);
 assert.match(f.find('webflow-auto-error').textContent,/JSON/);
});

test('total switch and per-task revoke require native gestures and reflect only Host results',async t=>{
 const host=controller();host.snapshot={...host.snapshot,grants:[{taskId:'search',grantId:'one',state:'active',approvedAt:0,scope}]};
 const f=await fixture(t,{host}),pending=deferred();
 host.api.setAutoEnabled=(value,event)=>{host.calls.push(['enabled',value,event]);return pending.promise;};
 await f.click('webflow-auto-enabled');assert.equal(host.calls.at(-1)[0],'read');
 const event=await f.click('webflow-auto-enabled',true);
 assert.deepEqual(host.calls.at(-1),['enabled',true,event]);
 assert.equal(String(f.find('webflow-auto-enabled').checked),'false','no optimistic persistence');
 await React.act(async()=>pending.resolve({...host.snapshot,enabled:true}));
 assert.equal(String(f.find('webflow-auto-enabled').checked),'true');
 const revoke=[...f.find('webflow-auto-grants').querySelectorAll('button')][0];
 assert.ok(revoke);const revokeEvent=new f.window.Event('click',{bubbles:true});
 Object.defineProperty(revokeEvent,'isTrusted',{value:true});
 await React.act(async()=>revoke.dispatchEvent(revokeEvent));
 assert.deepEqual(host.calls.at(-1),['revoke','search',revokeEvent]);
 assert.match(f.find('webflow-auto-grants').textContent,/已撤销/);
 assert.match(f.document.body.textContent,/持续自动提交/);assert.match(f.document.body.textContent,/Controller/);
 assert.match(f.document.body.textContent,/不.*回滚.*已经开始/);
});

test('diagnostic refresh reports unavailable tasks and errors without inventing an enabled state',async t=>{
 const host=controller(),f=await fixture(t,{host});
 host.api.setAutoEnabled=async()=>{throw Error('installation changed');};
 await f.click('webflow-auto-enabled',true);
 assert.match(f.find('webflow-auto-error').textContent,/installation changed/);
 assert.equal(f.document.querySelector('[role="switch"]'),null);
 assert.equal(f.find('webflow-auto-enabled').hasAttribute('aria-checked'),false,'unknown is not a fake off state');
 host.snapshot={...host.snapshot,tasks:[],unavailable:[{taskId:'missing-task',reason:'缺少网站访问权限'}]};
 await f.click('webflow-auto-refresh');
 assert.match(f.document.body.textContent,/缺少网站访问权限/);
 assert.equal(f.find('webflow-auto-prepare').disabled,true);
 assert.equal(String(f.find('webflow-auto-enabled').checked),'false');
});

test('installation rejection clears approval and never retries; refresh exposes the new installation',async t=>{
 const host=controller(),f=await fixture(t,{host});
 await f.click('webflow-auto-prepare');assert.ok(f.find('webflow-auto-review'));
 host.api.approveAutoTask=(review,event)=>{
  host.calls.push(['approve',review,event]);return Promise.reject(Error('任务安装身份或 generation 已改变'));
 };
 await f.click('webflow-auto-approve',true);
 assert.equal(f.find('webflow-auto-review'),null);
 assert.match(f.find('webflow-auto-error').textContent,/generation/);
 const nextTask={...task,installation:{...installation,installationId:'new-install',generation:2}};
 host.snapshot={...host.snapshot,epoch:2,tasks:[nextTask]};
 await f.click('webflow-auto-refresh');
 assert.equal(host.calls.filter(([kind])=>kind==='approve').length,1);
 await f.click('webflow-auto-prepare');
 assert.deepEqual(host.calls.at(-1)[1].installation,nextTask.installation);
});

test('read failure or a pending catalog never removes the deny-only switch and known task revocation',async t=>{
 const host=controller();host.snapshot={...host.snapshot,enabled:true,
  grants:[{taskId:'search',grantId:'known',state:'active',approvedAt:0,scope}]};
 const f=await fixture(t,{host});
 host.api.readAutoSettings=async()=>{throw Error('catalog unavailable');};
 await f.click('webflow-auto-refresh');
 assert.equal(f.find('webflow-auto-enabled').hasAttribute('aria-checked'),false);
 assert.ok(f.find('webflow-auto-grants').textContent.includes('当前状态未确认'));
 assert.equal(f.find('webflow-auto-disable').disabled,false);
 await f.click('webflow-auto-disable',true);
 assert.equal(host.calls.at(-1)[0],'enabled');assert.equal(host.calls.at(-1)[1],false);
 assert.equal(String(f.find('webflow-auto-enabled').checked),'false');
 const pending=deferred();host.api.readAutoSettings=()=>pending.promise;
 await f.click('webflow-auto-refresh');
 await f.click('webflow-auto-disable',true);
 assert.equal(host.calls.at(-1)[1],false);
 await React.act(async()=>pending.resolve({...host.snapshot,enabled:true}));
 assert.equal(String(f.find('webflow-auto-enabled').checked),'false','late catalog cannot override confirmed shutdown');
});
test('same-version replacement is explained as invalid approval and scope discloses source and result delivery',async t=>{
 const host=controller();host.snapshot={...host.snapshot,grants:[{taskId:'search',grantId:'old',state:'active',approvedAt:0,scope}],
  tasks:[{...task,installation:{...installation,generation:2,installationId:'new'}}]};
 const f=await fixture(t,{host});
 assert.match(f.find('webflow-auto-grants').textContent,/安装已变化.*需重新批准/);
 assert.match(f.document.body.textContent,/ChatGPT.*各对话.*原聊天/);
 assert.equal(host.calls.some(([kind])=>kind==='approve'),false);
});
test('real Host projection reaches the settings UI; task revoke persists and denies the next automatic candidate',async t=>{
 let data={},catalogReadFailure=false;
 const storage={get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value))};
 const ledger=createChatGPTBridgeTriggerLedger({storage});
 const manifest={taskId:task.taskId,version:task.version,title:task.name,siteOrigins:task.siteOrigins,
  paramsSchema:{type:'object',additionalProperties:false,required:['query','limit'],properties:{
   query:{type:'string',title:'关键词',default:'OpenDesk'},limit:{type:'integer',title:'数量',default:3}}},
  program:{revision:installation.revision,sourceHash:installation.contentHash}};
 const installed={taskId:task.taskId,...installation,enabled:true};
 const bridge=createChatGPTFixedBridgeHost({isVerifiedSidePanel:()=>true,
  api:{runtime:{async sendMessage(message){
   try{
    const result=await (message.kind==='auto-settings'?ledger.readAutoSettings():message.kind==='auto-grant'?ledger.approveAuto(message.scope):
     message.kind==='auto-revoke'?ledger.revokeAuto(message.taskId):ledger.setAutoEnabled(message.enabled));
    return {ok:true,data:result};
   }catch(error){return {ok:false,error:{code:error.code,message:error.message}};}
  }},permissions:{contains:async()=>true}},
  client:{request:async method=>{if(method==='listTaskCatalog'&&catalogReadFailure)throw Error('catalog read failed');
   return method==='listTaskCatalog'?{installed:[installed],catalog:[{taskId:task.taskId,
   version:task.version,manifestHash:installation.manifestHash,stage:'available',manifest}]}:{...installed,manifest};},
   controller:{snapshotControllerRun:async()=>{throw Error('no run expected');}}},host:{start:async()=>{throw Error('no run expected');}}});
 t.after(()=>bridge.dispose());
 const f=await fixture(t,{host:{api:bridge}});
 await f.click('webflow-auto-prepare');await f.click('webflow-auto-approve',true);
 assert.match(f.find('webflow-auto-grants').textContent,/授权有效/);
 assert.equal((await bridge.readAutoSettings()).grants[0].taskId,'search');
 await f.click('webflow-auto-enabled',true);
 installed.generation=2;catalogReadFailure=true;
 await f.click('webflow-auto-refresh');await f.click('webflow-auto-disable',true);
 assert.match(f.find('webflow-auto-grants').textContent,/安装状态待核验/);
 assert.doesNotMatch(f.find('webflow-auto-grants').textContent,/授权有效/);
 const revoke=f.document.querySelector('[aria-label="撤销 search 的自动准入"]');assert.ok(revoke);
 const event=new f.window.Event('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});
 await React.act(async()=>revoke.dispatchEvent(event));
 assert.equal((await ledger.readAutoSettings()).grants.search.state,'revoked');
 const candidateId='wf-real-ui-revoked',candidate={candidateId,turnKey:'new-turn',answerKey:'new-answer',text:JSON.stringify({
  protocol:'webflow.task.intent.v1',candidateId,taskId:'search',args:scope.args,targetUrl:scope.targetUrl})};
 await assert.rejects(ledger.admitAuto({source:{tabId:9,documentId:'doc',url:'https://chatgpt.com/c/ui-test-12345678'},...scope,candidate}),
  {code:'E_WEBFLOW_AUTO_DENIED'});
 await assert.rejects(bridge.revokeAutoTask(undefined,{isTrusted:true}),{code:'E_BRIDGE_SCHEMA'});
});
test('a known task can be revoked while a catalog read is pending and late reads stay ignored',async t=>{
 const host=controller();host.snapshot={...host.snapshot,enabled:true,
  grants:[{taskId:'search',grantId:'known',state:'active',approvedAt:0,scope}]};
 const f=await fixture(t,{host}),pending=deferred();host.api.readAutoSettings=()=>pending.promise;
 await f.click('webflow-auto-refresh');
 const button=f.document.querySelector('[aria-label="撤销 search 的自动准入"]');assert.equal(button.disabled,false);
 const event=new f.window.Event('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});
 await React.act(async()=>button.dispatchEvent(event));assert.equal(host.calls.at(-1)[0],'revoke');
 await React.act(async()=>pending.resolve({...host.snapshot,grants:[{taskId:'search',grantId:'old',state:'active',approvedAt:0,scope}]}));
 assert.match(f.find('webflow-auto-grants').textContent,/已撤销/);
});

test('existing settings portal owns Web Flow; closing and reopening discards review without saving AI settings',async t=>{
 const f=await fixture(t,{sheet:true});
 assert.equal(f.document.querySelectorAll('[role="dialog"]').length,1);
 assert.equal(f.document.querySelectorAll('form').length,1);
 assert.ok(f.find('webflow-auto-title'));
 await f.click('webflow-auto-prepare');assert.ok(f.find('webflow-auto-review'));
 assert.equal(f.saves,0);assert.equal(f.closed,0);
 const event=new f.window.Event('keydown',{bubbles:true,cancelable:true});
 Object.defineProperty(event,'key',{value:'Enter'});
 await React.act(async()=>f.find('webflow-auto-target').dispatchEvent(event));
 assert.equal(event.defaultPrevented,true,'scope input Enter cannot submit the outer AI settings form');
 const ime=new f.window.Event('keydown',{bubbles:true,cancelable:true});
 Object.defineProperties(ime,{key:{value:'Enter'},isComposing:{value:true}});
 await React.act(async()=>f.find('webflow-auto-target').dispatchEvent(ime));
 assert.equal(ime.defaultPrevented,false,'IME confirmation retains its native editing behavior');
 for(const marker of ['isComposing','keyCode']){
  const escape=new f.window.Event('keydown',{bubbles:true,cancelable:true});
  Object.defineProperties(escape,{key:{value:'Escape'},[marker]:{value:marker==='isComposing'?true:229}});
  await React.act(async()=>f.find('webflow-auto-args').dispatchEvent(escape));
  assert.equal(f.closed,0,'IME Escape must preserve settings and review');
 }
 await f.setOpen(false);assert.equal(f.find('webflow-auto-review'),null);
 await f.setOpen(true);assert.equal(f.find('webflow-auto-review'),null);
 assert.equal(f.saves,0);
});


test('installed Web Flow exposes one real slider; other tools, previews and disabled installs do not',async t=>{
 const host=controller(),f=await fixture(t,{entry:true});
 const slider=()=>f.document.querySelector('[role="switch"]');
 assert.equal(slider().tagName,'INPUT');
 assert.ok(f.document.querySelector('[data-slot="switch-thumb"]'));
 assert.equal(f.document.querySelector('details').hasAttribute('open'),false);
 await f.click('webflow-auto-enabled',true);
 assert.equal(slider().checked,true);
 await f.setOpen(false);assert.equal(slider(),null);
 await f.setOpen(true);assert.equal(slider().checked,true,'reopening reads the saved Host value');
 const display={hidden:false,data:{toolId:'webflow',enabled:true,preview:false,settingsOpen:false}};
 for(const change of [{toolId:'other'},{enabled:false},{preview:true},{settingsOpen:true}]){
  await f.setDisplay({...display,data:{...display.data,...change}});assert.equal(slider(),null);
 }
 await f.setDisplay({...display,hidden:true});assert.equal(slider(),null);
 await f.setDisplay(display);assert.equal(slider().checked,true);
});
