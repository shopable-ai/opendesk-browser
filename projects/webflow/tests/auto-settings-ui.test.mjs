import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {createChatGPTFixedBridgeHost} from '../../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {createChatGPTBridgeTriggerLedger} from '../../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {validateWebFlowTaskIntent} from '../../../src/native-agent/chatgpt-task-request.js';
import {assertAutoGrant} from '../src/auto-grants.js';
import {assertBuiltinIdentity} from '../../../src/libs/identity.js';

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
const scope={sourceOrigin:'https://chatgpt.com',taskId:'search',args:{query:'OpenDesk',limit:3},targetUrl:'https://search.example/',installation};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

function controller(){
 let snapshot={enabled:false,epoch:1,tasks:[task],grants:[],unavailable:[]};
 const calls=[];
 const api={
  readAutoSettings(){calls.push(['read']);return Promise.resolve(structuredClone(snapshot));},
  prepareAutoGrant(input){calls.push(['prepare',input]);return Promise.resolve({...input,taskName:task.name});},
  approveAutoTask(review,event){const {parameterPolicy,...scope}=review;calls.push(['approve',review,event]);snapshot={...snapshot,grants:[{
   taskId:review.taskId,grantId:'grant-one',state:'active',approvedAt:1793548800000,scope,
   ...(parameterPolicy?{parameterPolicy}:{})}]};return Promise.resolve(structuredClone(snapshot));},
  setAutoEnabled(value,event){calls.push(['enabled',value,event]);snapshot={...snapshot,enabled:value};return Promise.resolve(structuredClone(snapshot));},
  revokeAutoTask(taskId,event){calls.push(['revoke',taskId,event]);snapshot={...snapshot,grants:snapshot.grants.map(grant=>({...grant,state:'revoked'}))};return Promise.resolve(structuredClone(snapshot));}
 };
 return {api,calls,get snapshot(){return snapshot;},set snapshot(next){snapshot=next;}};
}

async function fixture(t,{sheet=false,entry=false,host=controller()}={}){
 const {window,document}=parseHTML('<html><body><div id="opendesk-react-app"></div></body></html>');
 const previous=new Map(['window','document','HTMLElement','Element','SVGElement','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,Element:window.Element,SVGElement:window.SVGElement,IS_REACT_ACT_ENVIRONMENT:true});
 // Linkedom lacks textarea.defaultValue reflection. React initializes a newly
 // mounted controlled textarea via that browser property before writing value.
 Object.defineProperty(window.HTMLTextAreaElement.prototype,'defaultValue',{configurable:true,
  get(){return this.textContent;},set(value){this.textContent=value;}});
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
   const options=[...node.querySelectorAll('option')];
   for(const option of options)option.selected=false;
   options.find(option=>option.value===value).selected=true;
  }else Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node),'value').set.call(node,value);
  node.dispatchEvent(new window.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));
 });
 await render();
 return {host,find,document,window,click,input,render,async setOpen(value){open=value;await render();},
  async setDisplay(value){display=value;await render();},async setHost(value){host=value;await render();},get saves(){return saves;},get closed(){return closed;}};
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
 assert.match(review.textContent,/同一窗口中各 ChatGPT 对话/);
 assert.ok(review.textContent.includes(target));
 assert.match(review.textContent,/结果返回触发任务的原聊天/);
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

for(const entry of [false,true])test(`automatic control keeps its slot through initial loading (${entry?'tool':'settings'})`,async t=>{
 const host=controller(),pending=deferred();
 host.api.readAutoSettings=()=>{host.calls.push(['read']);return pending.promise;};
 const f=await fixture(t,{host,entry});
 const slot=f.find('webflow-auto-control');
 assert.ok(slot,'reserve the control position before the first read completes');
 assert.equal(slot.querySelector('[role="switch"]'),null,'unknown must not appear off');
 assert.equal(f.find('webflow-auto-enabled').getAttribute('role'),'status');
 const emergency=f.find('webflow-auto-disable');
 assert.ok(emergency.closest('details'),'the emergency action has one stable management entry');
 if(entry)assert.equal(f.document.querySelector('[aria-label="Web Flow 运行状态"] #webflow-auto-disable'),null);
 await React.act(async()=>pending.resolve({...host.snapshot,enabled:true}));
 assert.equal(f.find('webflow-auto-control'),slot,'loading cannot move the control');
 assert.equal(f.find('webflow-auto-disable'),emergency,'successful reads cannot remove the recovery action');
 assert.equal(String(f.find('webflow-auto-enabled').checked),'true');
 assert.deepEqual(host.calls.map(([kind])=>kind),['read'],'opening never changes automatic authority');
});

test('saving and refreshing keep the same switch and emergency entry without adding a home action',async t=>{
 const host=controller(),f=await fixture(t,{entry:true,host}),pending=deferred();
 const input=f.find('webflow-auto-enabled'),slot=f.find('webflow-auto-control'),emergency=f.find('webflow-auto-disable');
 host.api.setAutoEnabled=(value,event)=>{host.calls.push(['enabled',value,event]);return pending.promise;};
 await f.click('webflow-auto-enabled',true);
 assert.equal(f.find('webflow-auto-enabled'),input);
 assert.equal(f.document.querySelector('[aria-label="Web Flow 运行状态"] #webflow-auto-disable'),null);
 await React.act(async()=>pending.resolve({...host.snapshot,enabled:true}));
 const reading=deferred();host.api.readAutoSettings=()=>reading.promise;
 await f.click('webflow-runtime-open');await f.click('webflow-runtime-tab-scope');
 await f.click('webflow-auto-refresh');
 assert.equal(f.find('webflow-auto-control'),slot);
 assert.equal(f.find('webflow-auto-enabled'),input);
 assert.equal(f.find('webflow-auto-disable'),emergency);
 await React.act(async()=>reading.resolve({...host.snapshot,enabled:true}));
 assert.equal(f.find('webflow-auto-enabled'),input);
});

test('every edited scope invalidates a review, including an in-flight preparation and edit-then-restore',async t=>{
 const host=controller(),pending=deferred();
 host.api.prepareAutoGrant=input=>{host.calls.push(['prepare',input]);return pending.promise;};
 const f=await fixture(t,{host});
 await f.click('webflow-auto-prepare');
 await f.input('webflow-auto-args','{"query":"changed","limit":3}');
 await f.input('webflow-auto-args',JSON.stringify(scope.args));
 await f.input('webflow-auto-source','https://source.example');
 await f.input('webflow-auto-source','https://chatgpt.com');
 await React.act(async()=>pending.resolve({...scope,taskName:task.name}));
 assert.equal(f.find('webflow-auto-approve'),null,'a stale async result cannot restore an invalidated review');
 host.api.prepareAutoGrant=async input=>({...input,taskName:task.name});
 for(const [id,value]of [['webflow-auto-source','https://source.example'],['webflow-auto-target',scope.targetUrl+'next'],['webflow-auto-args','{}'],['webflow-auto-task','search']]){
  await f.click('webflow-auto-prepare');assert.ok(f.find('webflow-auto-approve'));
  await f.input(id,value);assert.equal(f.find('webflow-auto-approve'),null,id);
 }
 await f.input('webflow-auto-args','{"bad":');
 const count=host.calls.filter(([kind])=>kind==='prepare').length;
 await f.click('webflow-auto-prepare');
 assert.equal(host.calls.filter(([kind])=>kind==='prepare').length,count);
 assert.match(f.find('webflow-auto-error').textContent,/JSON/);
});

function keywordController(){
 const host=controller(),search={...task,taskId:'baidu.search.top3',name:'百度搜索',paramsSchema:{type:'object',additionalProperties:false,
  required:['query','limit'],properties:{query:{type:'string',title:'搜索关键词',default:'OpenDesk',minLength:1,maxLength:120},
   limit:{type:'integer',title:'结果数量',enum:[3],default:3}}}};
 host.snapshot={...host.snapshot,tasks:[search]};
 host.api.prepareAutoGrant=async input=>{
  host.calls.push(['prepare',input]);return {...input,taskName:search.name,...(input.parameterPolicy?{
   parameterPolicy:{...input.parameterPolicy,paramsSchema:search.paramsSchema}}:{})};
 };
 return {host,search};
}
test('keyword approval defaults to variable search input and changing to exact invalidates the review',async t=>{
 const {host}=keywordController(),f=await fixture(t,{host});
 assert.equal(f.find('webflow-auto-parameter-policy').value,'variable');
 await f.click('webflow-auto-prepare');
 assert.deepEqual(host.calls.at(-1)[1].parameterPolicy,{mode:'schema',variableKeys:['query']});
 assert.match(f.find('webflow-auto-review').textContent,/1–120 字/);
 await f.input('webflow-auto-parameter-policy','exact');assert.equal(f.find('webflow-auto-review'),null);
 await f.click('webflow-auto-prepare');assert.equal(host.calls.at(-1)[1].parameterPolicy,undefined);
 await f.input('webflow-auto-parameter-policy','variable');await f.click('webflow-auto-prepare');
 await f.click('webflow-auto-approve',true);
 assert.match(f.find('webflow-auto-grants').textContent,/关键词不固定/);
 assert.deepEqual(host.snapshot.grants[0].parameterPolicy.variableKeys,['query']);
 assert.equal(host.snapshot.enabled,false,'task approval does not silently enable the global switch');
});
test('legacy keyword approval opens a review with its existing target and args without silently extending authority',async t=>{
 const {host,search}=keywordController(),oldScope={...scope,taskId:search.taskId,args:{query:'旧关键词',limit:3}};
 host.snapshot={...host.snapshot,enabled:true,grants:[{taskId:search.taskId,grantId:'old',state:'active',approvedAt:0,scope:oldScope}]};
 const f=await fixture(t,{host}),button=[...f.find('webflow-auto-grants').querySelectorAll('button')].find(node=>node.textContent==='改为允许更换关键词…');
 assert.ok(button);await React.act(async()=>button.dispatchEvent(new f.window.Event('click',{bubbles:true})));
 assert.equal(f.find('webflow-auto-task').value,search.taskId);
 assert.deepEqual(JSON.parse(f.find('webflow-auto-args').value),oldScope.args);
 assert.equal(f.find('webflow-auto-prepare').closest('details').open,true);
 assert.equal(host.snapshot.grants[0].parameterPolicy,undefined);
 assert.equal(host.calls.filter(([kind])=>kind==='approve'||kind==='enabled').length,0);
 await f.click('webflow-auto-prepare');await f.click('webflow-auto-approve',true);
 assert.equal(host.snapshot.enabled,true);assert.deepEqual(host.snapshot.grants[0].parameterPolicy.variableKeys,['query']);
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
 assert.match(f.document.body.textContent,/自动运行决定是否接收新任务/);
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

test('runtime mismatch explains the upgrade prerequisite while preserving the exact grant without offering execution',async t=>{
 let data={},starts=0;
 const storage={get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value))};
 const ledger=createChatGPTBridgeTriggerLedger({storage});
 await ledger.approveAuto(scope);await ledger.setAutoEnabled(true);
 const original=await ledger.readAutoSettings();
 const manifest={taskId:task.taskId,version:task.version,title:task.name,siteOrigins:task.siteOrigins,
  paramsSchema:task.paramsSchema,program:{revision:1,sourceHash:installation.contentHash}};
 const pinned={abi:'opendesk-builtins.v10',catalogSha256:'c'.repeat(64),bundleSha256:'d'.repeat(64)};
 const bridge=createChatGPTFixedBridgeHost({isVerifiedSidePanel:()=>true,
  api:{runtime:{async sendMessage(message){
   assert.equal(message.kind,'auto-settings','reading the failure cannot mutate approvals');
   return {ok:true,data:await ledger.readAutoSettings()};
  }},permissions:{contains:async()=>true}},
  client:{request:async method=>{
   if(method==='listTaskCatalog')return {installed:[{taskId:task.taskId,...installation,enabled:true}],
    catalog:[{taskId:task.taskId,version:task.version,manifestHash:installation.manifestHash,stage:'available',manifest}]};
   assert.equal(method,'resolveInstalledTask');
   assertBuiltinIdentity(pinned,{...pinned,bundleSha256:'e'.repeat(64)});
  },controller:{snapshotControllerRun:async()=>{throw Error('No run exists');}}},
  host:{start:async()=>{starts++;throw Error('No run permitted');}}});
 t.after(()=>bridge.dispose());
 const f=await fixture(t,{host:{api:bridge}});
 const snapshot=await bridge.readAutoSettings();
 assert.equal(snapshot.unavailable[0].code,'E_BUILTIN_VERSION_UNAVAILABLE');
 assert.equal(snapshot.tasks.length,0);
 assert.deepEqual(await ledger.readAutoSettings(),original,'the frozen approval and switch survive a runtime update');
 assert.match(f.find('webflow-auto-grants').textContent,/先.*验证.*升级/);
 assert.match(f.find('webflow-auto-grants').textContent,/原批准保留/);
 assert.ok(f.find('webflow-auto-grants').textContent.includes(scope.targetUrl));
 assert.equal(String(f.find('webflow-auto-enabled').checked),'true');
 assert.equal(f.find('webflow-auto-prepare').disabled,true);
 assert.equal(f.find('webflow-auto-grants').querySelector('textarea'),null);
 assert.equal([...f.find('webflow-auto-grants').querySelectorAll('button')].some(b=>b.textContent.includes('生成')),false);
 assert.equal(f.document.querySelector('[aria-label="撤销 search 的自动准入"]').disabled,false);
 assert.equal(starts,0);
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

test('approved task generates a fresh strict five-field ChatGPT instruction without enabling or dispatching',async t=>{
 const host=controller();
 const approvedScope={...scope,args:{query:'中文 / ``` <script> "引号"、反斜杠 \\ 与字面 \\u002f',limit:3}};
 host.snapshot={...host.snapshot,grants:[{taskId:'search',grantId:'one',state:'active',approvedAt:0,scope:approvedScope}]};
 const f=await fixture(t,{host});
 const button=()=>[...f.find('webflow-auto-grants').querySelectorAll('button')].find(b=>b.textContent.includes('生成'));
 const clickGenerate=()=>React.act(async()=>button().dispatchEvent(new f.window.Event('click',{bubbles:true})));
 await clickGenerate();
 const field=()=>f.find('webflow-auto-grants').querySelector('textarea');
 const prompt=field().value;
 assert.ok(field().hasAttribute('readOnly')||field().readOnly===true,field().outerHTML);
 assert.ok(prompt.includes('"targetUrl":"https://search.example/"'),'the visible instruction uses a readable URL');
 assert.ok(prompt.includes(JSON.stringify(approvedScope.args.query)),'parameter punctuation stays readable with only required JSON escaping');
 const json=prompt.slice(prompt.indexOf('{'));
 const intent=validateWebFlowTaskIntent(json);
 assert.deepEqual(validateWebFlowTaskIntent(json.replaceAll('/',String.raw`\u002f`)),intent,
  'legal JSON escapes are decoded internally without changing the task or literal backslash text');
 assert.deepEqual(Object.keys(intent).sort(),['args','candidateId','protocol','targetUrl','taskId']);
 assert.equal(intent.protocol,'webflow.task.intent.v1');
 assert.equal(intent.taskId,scope.taskId);assert.equal(intent.targetUrl,scope.targetUrl);
 assert.deepEqual(intent.args,approvedScope.args);
 assert.match(f.find('webflow-auto-grants').textContent,/总开关已关闭/);
 await clickGenerate();
 const next=JSON.parse(field().value.slice(field().value.indexOf('{')));
 assert.notEqual(next.candidateId,intent.candidateId);
 assert.deepEqual(host.calls.map(([kind])=>kind),['read'],'generation cannot prepare, approve, enable or start');
 assert.equal(f.document.querySelector('script'),null);
 host.snapshot={...host.snapshot,tasks:[{...task,installation:{...installation,generation:2}}]};
 await f.click('webflow-auto-refresh');
 assert.equal(button(),undefined,'an outdated installation cannot produce an approved instruction');
 assert.equal(field(),null,'refresh discards the old instruction');
});

for(const showExecutionTab of [undefined,false,true])test(`generated instruction preserves search visibility ${showExecutionTab??'default'} inside args`,async t=>{
 const host=controller(),args={query:'OpenDesk',limit:3,...(showExecutionTab===undefined?{}:{showExecutionTab})};
 host.snapshot={...host.snapshot,grants:[{taskId:'search',grantId:'visibility',state:'active',approvedAt:0,scope:{...scope,args}}]};
 const f=await fixture(t,{host});
 const button=[...f.find('webflow-auto-grants').querySelectorAll('button')].find(b=>b.textContent.includes('生成'));
 await React.act(async()=>button.dispatchEvent(new f.window.Event('click',{bubbles:true})));
 const prompt=f.find('webflow-auto-grants').querySelector('textarea').value;
 const intent=validateWebFlowTaskIntent(prompt.slice(prompt.indexOf('{')));
 assert.deepEqual(Object.keys(intent).sort(),['args','candidateId','protocol','targetUrl','taskId']);
 assert.deepEqual(intent.args,args);
 assert.equal(prompt.endsWith('\n'),false);
 assert.match(prompt,/两部分/);assert.match(prompt,/只放一个/);
 assert.deepEqual(host.calls.map(([kind])=>kind),['read']);
});

test('unknown, unverified or revoked approval never offers a generated automatic instruction',async t=>{
 const host=controller();host.snapshot={...host.snapshot,catalogVerified:false,
  grants:[{taskId:'search',grantId:'one',state:'active',approvedAt:0,scope}]};
 const f=await fixture(t,{host});
 const hasGenerate=()=>[...f.find('webflow-auto-grants').querySelectorAll('button')].some(b=>b.textContent.includes('生成'));
 assert.equal(hasGenerate(),false);
 host.snapshot={...host.snapshot,catalogVerified:true,grants:[{...host.snapshot.grants[0],state:'revoked'}]};
 await f.click('webflow-auto-refresh');assert.equal(hasGenerate(),false);
 host.api.readAutoSettings=async()=>{throw Error('read failed');};
 await f.click('webflow-auto-refresh');assert.equal(hasGenerate(),false);
 assert.equal(f.find('webflow-auto-disable').disabled,false,'deny-only management remains available');
});

test('copy preserves the exact generated instruction and clipboard failure keeps it available for manual copying',async t=>{
 const host=controller();host.snapshot={...host.snapshot,
  grants:[{taskId:'search',grantId:'one',state:'active',approvedAt:0,scope}]};
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let copied='';
 const clipboard={writeText:async text=>{copied=text;}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard}});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;});
 const f=await fixture(t,{host});
 const click=label=>React.act(async()=>[...f.find('webflow-auto-grants').querySelectorAll('button')]
  .find(b=>b.textContent===label).dispatchEvent(new f.window.Event('click',{bubbles:true})));
 await click('生成 ChatGPT 指令');
 const prompt=f.find('webflow-auto-grants').querySelector('textarea').value;
 assert.ok(prompt.includes('https://search.example/'));
 assert.equal(prompt.includes(String.raw`\u002f`),false);
 await click('复制指令');assert.equal(copied,prompt);
 assert.match(f.find('webflow-auto-grants').textContent,/指令已复制/);
 clipboard.writeText=async()=>{throw Error('permission denied');};
 await click('复制指令');assert.match(f.find('webflow-auto-grants').textContent,/⌘C \/ Ctrl\+C/);
 assert.equal(f.find('webflow-auto-grants').querySelector('textarea').value,prompt);
 assert.deepEqual(host.calls.map(([kind])=>kind),['read']);
});
test('generating an instruction reveals and selects its actual text without running a task',async t=>{
 const host=controller();host.snapshot={...host.snapshot,enabled:true,
  grants:[{taskId:'search',grantId:'one',state:'active',approvedAt:0,scope}]};
 const f=await fixture(t,{host}),events=[];
 const methods=[[f.window.HTMLElement.prototype,'scrollIntoView'],
  [f.window.HTMLTextAreaElement.prototype,'focus'],[f.window.HTMLTextAreaElement.prototype,'select']]
  .map(([prototype,key])=>[prototype,key,Object.getOwnPropertyDescriptor(prototype,key)]);
 t.after(()=>{for(const [prototype,key,descriptor]of methods){
  if(descriptor)Object.defineProperty(prototype,key,descriptor);else delete prototype[key];
 }});
 // Linkedom has no layout/focus selection. Observe the real component's calls
 // at these browser-only boundaries; native visibility is checked separately.
 f.window.HTMLElement.prototype.scrollIntoView=function(){events.push(['reveal',this]);};
 f.window.HTMLTextAreaElement.prototype.focus=function(){events.push(['focus',this]);};
 f.window.HTMLTextAreaElement.prototype.select=function(){events.push(['select',this]);};
 const generate=[...f.find('webflow-auto-grants').querySelectorAll('button')]
  .find(button=>button.textContent==='生成 ChatGPT 指令');
 await React.act(async()=>generate.dispatchEvent(new f.window.Event('click',{bubbles:true})));
 const field=f.find('webflow-auto-grants').querySelector('textarea');
 assert.ok(field.value.length>100);
 assert.ok(events.some(([kind,node])=>kind==='reveal'&&(node===field||node.contains(field))),
  'new instruction must be revealed inside the scrollable approval card');
 assert.ok(events.some(([kind,node])=>kind==='focus'&&node===field));
 assert.ok(events.some(([kind,node])=>kind==='select'&&node===field));
 assert.deepEqual(host.calls.map(([kind])=>kind),['read']);
});

test('refreshing unchanged approval preserves the generated draft; changed scope or failed verification removes it',async t=>{
 const host=controller();host.snapshot={...host.snapshot,enabled:true,epoch:11,
  grants:[{taskId:'search',grantId:'one',state:'active',approvedAt:0,scope}]};
 const f=await fixture(t,{entry:true,host});
 await f.click('webflow-runtime-open');await f.click('webflow-runtime-tab-scope');
 const field=()=>f.find('webflow-auto-grants').querySelector('textarea');
 const generate=()=>React.act(async()=>[...f.find('webflow-auto-grants').querySelectorAll('button')]
  .find(button=>button.textContent.includes('生成')).dispatchEvent(new f.window.Event('click',{bubbles:true})));
 await generate();const prompt=field().value;
 const pending=deferred();host.api.readAutoSettings=()=>pending.promise;
 await f.click('webflow-auto-refresh');
 assert.equal(field()?.value,prompt,'a read must not unmount the unsent instruction');
 assert.ok([...f.find('webflow-auto-grants').querySelectorAll('button')]
  .find(button=>button.textContent==='复制指令').disabled,'copy waits for scope verification');
 await React.act(async()=>pending.resolve(structuredClone(host.snapshot)));
 assert.equal(field().value,prompt);
 await f.click('webflow-runtime-tab-help');await f.click('webflow-runtime-tab-scope');
 const close=f.document.querySelector('[aria-label="关闭运行与授权"]');
 await React.act(async()=>close.dispatchEvent(new f.window.Event('click',{bubbles:true})));
 await f.click('webflow-runtime-open');assert.equal(field().value,prompt);
 host.snapshot={...host.snapshot,grants:[{...host.snapshot.grants[0],
  scope:{...scope,args:{query:'changed',limit:3}}}]};
 host.api.readAutoSettings=async()=>structuredClone(host.snapshot);
 await f.click('webflow-auto-refresh');assert.equal(field(),null,'a changed scope invalidates its old instruction');
 await generate();assert.equal(JSON.parse(field().value.slice(field().value.indexOf('{'))).args.query,'changed');
 host.api.readAutoSettings=async()=>{throw Error('verification unavailable');};
 await f.click('webflow-auto-refresh');assert.equal(field(),null);
 assert.deepEqual(host.calls.map(([kind])=>kind),['read'],'view changes never enable, approve or execute');
});

for(const taskId of ['search','google.search.top3'])test(`real Host ${taskId} exact Schema approval reaches UI and retains revocation fences`,async t=>{
 const selectedInstallation={...installation,scriptId:'task:'+taskId+':'+installation.version};
 const selectedTask={...task,taskId,installation:selectedInstallation};
 const selectedScope={...scope,taskId,installation:selectedInstallation};
 let data={},catalogReadFailure=false;
 const storage={get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value))};
 const ledger=createChatGPTBridgeTriggerLedger({storage});
 const manifest={taskId:selectedTask.taskId,version:selectedTask.version,title:selectedTask.name,siteOrigins:selectedTask.siteOrigins,
  paramsSchema:{type:'object',additionalProperties:false,required:['query','limit'],properties:{
   query:{type:'string',title:'关键词',default:'OpenDesk'},limit:{type:'integer',title:'数量',default:3},
   showExecutionTab:{type:'boolean',title:'显示执行页',default:true}}},
  program:{revision:selectedInstallation.revision,sourceHash:selectedInstallation.contentHash}};
 const installed={taskId:selectedTask.taskId,...selectedInstallation,enabled:true};
 const bridge=createChatGPTFixedBridgeHost({isVerifiedSidePanel:()=>true,
  api:{runtime:{async sendMessage(message){
   try{
    const result=await (message.kind==='auto-settings'?ledger.readAutoSettings():message.kind==='auto-grant'?ledger.approveAuto(message.scope):
     message.kind==='auto-revoke'?ledger.revokeAuto(message.taskId):ledger.setAutoEnabled(message.enabled));
    return {ok:true,data:result};
   }catch(error){return {ok:false,error:{code:error.code,message:error.message}};}
  }},permissions:{contains:async()=>true}},
  client:{request:async method=>{if(method==='listTaskCatalog'&&catalogReadFailure)throw Error('catalog read failed');
   return method==='listTaskCatalog'?{installed:[installed],catalog:[{taskId:selectedTask.taskId,
   version:selectedTask.version,manifestHash:selectedInstallation.manifestHash,stage:'available',manifest}]}:{...installed,manifest};},
   controller:{snapshotControllerRun:async()=>{throw Error('no run expected');}}},host:{start:async()=>{throw Error('no run expected');}}});
 t.after(()=>bridge.dispose());
 const f=await fixture(t,{host:{api:bridge}});
 await f.click('webflow-auto-prepare');await f.click('webflow-auto-approve',true);
 assert.match(f.find('webflow-auto-grants').textContent,/授权有效/);
 assert.equal((await bridge.readAutoSettings()).grants[0].taskId,taskId);
 assert.deepEqual((await bridge.readAutoSettings()).grants[0].parameterPolicy.variableKeys,[]);
 assert.match(f.find('webflow-auto-grants').textContent,/可选参数省略/);
 assert.doesNotMatch(f.find('webflow-auto-grants').textContent,/关键词不固定/);
 await f.click('webflow-auto-enabled',true);
 const settings=await ledger.readAutoSettings(),sourceUrl='https://chatgpt.com/c/ui-test-12345678';
 assert.ok(assertAutoGrant(settings,selectedScope,{sourceUrl}));
 assert.throws(()=>assertAutoGrant(settings,{...selectedScope,args:{...selectedScope.args,showExecutionTab:false}},{sourceUrl}));
 installed.generation=2;catalogReadFailure=true;
 await f.click('webflow-auto-refresh');await f.click('webflow-auto-disable',true);
 assert.match(f.find('webflow-auto-grants').textContent,/安装状态待核验/);
 assert.doesNotMatch(f.find('webflow-auto-grants').textContent,/授权有效/);
 const revoke=f.document.querySelector('[aria-label="撤销 '+taskId+' 的自动准入"]');assert.ok(revoke);
 const event=new f.window.Event('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});
 await React.act(async()=>revoke.dispatchEvent(event));
 assert.equal((await ledger.readAutoSettings()).grants[taskId].state,'revoked');
 const candidateId='wf-real-ui-revoked',candidate={candidateId,turnKey:'new-turn',answerKey:'new-answer',text:JSON.stringify({
  protocol:'webflow.task.intent.v1',candidateId,taskId,args:selectedScope.args,targetUrl:selectedScope.targetUrl})};
 await assert.rejects(ledger.admitAuto({source:{tabId:9,documentId:'doc',url:'https://chatgpt.com/c/ui-test-12345678'},...selectedScope,candidate}),
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
 assert.ok(f.document.querySelector('[role="dialog"]').closest('[hidden]'),'management is outside the application flow');
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

test('runtime details occupy a separate panel; navigation preserves scope drafts without authorizing',async t=>{
 const host=controller(),controls=[];
 host.api.readBridgeState=async()=>({session:null,receipt:null});
 host.api.controlBridge=async(...args)=>{controls.push(args);throw Error('navigation must not control a task');};
 const f=await fixture(t,{entry:true,host});
 const panel=()=>f.document.querySelector('[role="dialog"]');
 assert.ok(f.find('webflow-runtime-open'),'the application exposes one explicit management entry');
 assert.equal(panel().closest('[hidden]')!==null,true,'details take no application space by default');
 await f.click('webflow-runtime-open');
 assert.equal(panel().closest('[hidden]'),null);
 await f.click('webflow-runtime-tab-scope');
 await f.input('webflow-auto-args','{"query":"保留草稿","limit":3}');
 await f.click('webflow-runtime-tab-task');
 await f.click('webflow-runtime-tab-scope');
 assert.equal(f.find('webflow-auto-args').value,'{"query":"保留草稿","limit":3}');
 const imeEscape=new f.window.Event('keydown',{bubbles:true,cancelable:true});
 Object.defineProperties(imeEscape,{key:{value:'Escape'},isComposing:{value:true}});
 await React.act(async()=>f.find('webflow-auto-args').dispatchEvent(imeEscape));
 assert.equal(panel().closest('[hidden]'),null,'IME cancellation must not dismiss the runtime panel');
 const close=panel().querySelector('[aria-label="关闭运行与授权"]');
 await React.act(async()=>close.dispatchEvent(new f.window.Event('click',{bubbles:true})));
 await f.click('webflow-runtime-open');
 assert.equal(f.find('webflow-auto-args').value,'{"query":"保留草稿","limit":3}');
 const escape=new f.window.Event('keydown',{bubbles:true,cancelable:true});
 Object.defineProperty(escape,'key',{value:'Escape'});
 await React.act(async()=>f.find('webflow-auto-args').dispatchEvent(escape));
 assert.ok(panel().closest('[hidden]'),'ordinary Escape dismisses the panel');
 assert.deepEqual(f.host.calls.map(([kind])=>kind),['read'],'opening or switching views only reads settings');
 assert.deepEqual(controls,[]);
});

test('the compact summary preserves pre-request progress and rejection diagnostics',async t=>{
 const host=controller();
 let status='指令仍在草稿，请在 ChatGPT 亲自发送';
 host.api.readBridgeState=async()=>({source:{documentId:'doc'},session:{status,requestId:null,fields:{},tasks:[],actions:{}}});
 host.api.controlBridge=async()=>{throw Error('no request may run');};
 const f=await fixture(t,{entry:true,host});
 assert.equal(f.find('webflow-runtime-summary').textContent,status);
 await f.click('webflow-runtime-open');
 for(const next of ['等待同一新消息及完整任务协议','历史或未见证发送，不会自动运行']){
  status=next;
  const refresh=[...f.document.querySelector('[aria-label="Web Flow 当前任务"]').querySelectorAll('button')]
   .find(button=>button.textContent==='刷新状态');
  await React.act(async()=>refresh.dispatchEvent(new f.window.Event('click',{bubbles:true})));
  assert.equal(f.find('webflow-runtime-summary').textContent,status);
 }
});

test('trusted sidebar shows same-run execution, persistence, release and chat delivery separately; query never runs a task',async t=>{
 const host=controller(),calls=[];
 const view={source:{tabId:9,documentId:'doc',url:'https://chatgpt.com/c/sidebar-test-12345678'},
  session:{url:'https://chatgpt.com/c/sidebar-test-12345678',status:'脚本已完成',requestId:'request-one',runId:'run-one',resultId:'result-one',
   actions:{run:true,cancel:true},fields:{task:'search',query:'OpenDesk',target:'https://search.example/',args:'{}'},tasks:[]},
  receipt:{execution:'completed',persistence:'verified',release:'released',delivery:'unknown',value:{status:'success',count:3}}};
 host.api.readBridgeState=async()=>{calls.push(['read']);return structuredClone(view);};
 host.api.controlBridge=async(value,event)=>{calls.push(['control',value,event]);return structuredClone(view);};
 const f=await fixture(t,{entry:true,host});
 await f.click('webflow-runtime-open');
 assert.equal(f.document.querySelector('[role="dialog"]').closest('[hidden]'),null);
 const panel=f.document.querySelector('[aria-label="Web Flow 当前任务"]');assert.ok(panel);
 assert.match(panel.textContent,/持久结果已核实同一 Run \/ Result/);assert.match(panel.textContent,/资源释放已释放/);
 assert.match(panel.textContent,/原聊天交付结果未知/);assert.ok(panel.textContent.includes('"count": 3'));
 assert.equal(panel.querySelector('pre').closest('details').hasAttribute('open'),false,'raw results are available on demand');
 const click=async(label,trusted)=>{
  const button=[...panel.querySelectorAll('button')].find(node=>node.textContent===label);assert.ok(button);
  const event=new f.window.Event('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:trusted});
  await React.act(async()=>button.dispatchEvent(event));return event;
 };
 await click('查询原请求',true);assert.equal(calls.filter(([kind])=>kind==='control').length,0);
 await click('执行本次任务',false);assert.equal(calls.filter(([kind])=>kind==='control').length,0);
 const event=await click('执行本次任务',true),command=calls.find(([kind])=>kind==='control');
 assert.equal(command[1].requestId,'request-one');assert.deepEqual(command[1].source,view.source);assert.equal(command[2],event);
 view.session.requestId='request-two';view.session.runId=null;view.session.resultId=null;view.receipt=null;
 await click('查询原请求',true);assert.equal(panel.textContent.includes('"count": 3'),false);
});

test('source input defaults to ChatGPT, reviews the selected origin and invalidates stale reviews',async t=>{
 const host=controller(),f=await fixture(t,{host});
 assert.equal(f.find('webflow-auto-source').value,'https://chatgpt.com');
 await f.input('webflow-auto-source','https://source.example');await f.click('webflow-auto-prepare');
 assert.equal(host.calls.at(-1)[1].sourceOrigin,'https://source.example');
 assert.match(f.find('webflow-auto-review').textContent,/https:\/\/source.example/);
 await f.input('webflow-auto-source','https://other.example');
 assert.equal(f.find('webflow-auto-approve'),null);
 assert.equal(host.calls.some(([kind])=>kind==='approve'),false);
});
test('Generic grants describe standard events and never offer ChatGPT instruction generation',async t=>{
 const host=controller();host.snapshot={...host.snapshot,grants:[{taskId:'search',grantId:'generic',state:'active',approvedAt:0,
  scope:{...scope,sourceOrigin:'https://source.example'}}]};
 const f=await fixture(t,{host});
 assert.equal([...f.find('webflow-auto-grants').querySelectorAll('button')].some(b=>b.textContent.includes('生成')),false);
 assert.match(f.find('webflow-auto-grants').textContent,/标准事件/);
});

test('one-time ChatGPT instructions distinguish installed Schema capabilities from reviewed scopes without granting permission',async t=>{
 const host=controller();host.snapshot={...host.snapshot,catalogVerified:true,grants:[{taskId:'search',grantId:'one',state:'active',approvedAt:0,scope}]};
 const f=await fixture(t,{host});
 const instructions=f.find('webflow-chatgpt-instructions');assert.ok(instructions);
 assert.ok(instructions.value.includes('"targetUrl":"https://search.example/"'),'capability context shows readable URLs');
 assert.equal(instructions.value.includes(String.raw`\u002f`),false);
 const capabilities=instructions.value.slice(instructions.value.indexOf('[{'),instructions.value.indexOf('}]')+2);
 assert.equal(JSON.parse(capabilities)[0].targetUrl,scope.targetUrl);
 assert.deepEqual(JSON.parse(capabilities)[0].paramsSchema,task.paramsSchema);
 const scopes=instructions.value.slice(instructions.value.lastIndexOf('[{'),instructions.value.lastIndexOf('}]')+2);
 assert.equal(JSON.parse(scopes)[0].targetUrl,scope.targetUrl);
 assert.deepEqual(JSON.parse(scopes)[0].args,scope.args);
 assert.match(instructions.value,/本条首次接入只确认理解，不执行任务，不输出任务候选/);
 assert.match(instructions.value,/省略默认 true/);assert.match(instructions.value,/严格 boolean/);
 assert.match(instructions.value,/仍创建后台页、搜索并返回真实回执/);
 assert.ok(instructions.value.includes('尚未批准'));assert.ok(instructions.value.includes('等待本机可信审阅'));
 assert.ok(instructions.value.includes('OpenDesk'));assert.ok(instructions.value.includes('每次'));
 assert.ok(!instructions.value.includes(installation.installationId));
 let copied='';const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>{copied=text;}}}});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;});
 await f.click('webflow-chatgpt-copy');assert.equal(copied,instructions.value);
 assert.equal(host.calls.filter(([kind])=>kind!=='read').length,0);
 host.snapshot={...host.snapshot,epoch:3,grants:host.snapshot.grants.map(g=>({...g,state:'revoked'}))};
 await f.click('webflow-auto-refresh');
 assert.ok(f.find('webflow-chatgpt-instructions'),'installed capability remains available without an active exact grant');
 host.snapshot={...host.snapshot,catalogVerified:false};await f.click('webflow-auto-refresh');
 assert.equal(f.find('webflow-chatgpt-instructions'),null,'an unverified catalog cannot publish capabilities');
});

test('ordinary chat capability requests the installed 0.2 send operation without granting it',async t=>{
 const host=controller();host.snapshot={...host.snapshot,catalogVerified:true,grants:[],tasks:[{
  ...task,taskId:'chatgpt.conversation.create',version:'0.2.0',siteOrigins:['https://chatgpt.com'],
  paramsSchema:{type:'object',required:['prompt'],properties:{prompt:{type:'string'},send:{type:'boolean',default:false}}}
 }]};
 const f=await fixture(t,{host}),instructions=f.find('webflow-chatgpt-instructions').value;
 assert.ok(instructions.includes('args.send 必须为 true'));
 assert.ok(instructions.includes('必须等待本机精确审阅'));
 assert.ok(instructions.includes('独立 B 的单次发送和原 A 的单次结果回传'));
 assert.equal(host.calls.filter(([kind])=>kind!=='read').length,0);
 for(const version of ['0.2.1','0.2.2']){
  host.snapshot={...host.snapshot,tasks:[{...host.snapshot.tasks[0],version}]};
  await f.click('webflow-auto-refresh');
  assert.ok(f.find('webflow-chatgpt-instructions').value.includes('args.send 必须为 true'));
 }
 host.snapshot={...host.snapshot,tasks:[{...host.snapshot.tasks[0],version:'0.3.0'}]};
 await f.click('webflow-auto-refresh');
 assert.ok(!f.find('webflow-chatgpt-instructions').value.includes('args.send 必须为 true'));
});

test('pending candidate review shows exact parameters and identity; only a native click forwards this same review',async t=>{
 const host=controller(),calls=[];
 const pendingAuto={scope:{...scope,args:{query:'OpenDesk Browser SDK',limit:3}},
  candidate:{candidateId:'wf-pending-review',text:'candidate bytes',turnKey:'turn-sdk',answerKey:'answer-sdk'}};
 const source={tabId:9,documentId:'sdk-document',url:'https://chatgpt.com/c/sdk-review-12345678'};
 host.api.readBridgeState=async()=>({source,session:{url:source.url,status:'待批准，尚未执行',
  requestId:'pending-request',pendingAuto,fields:{},tasks:[],actions:{cancel:true}},receipt:null});
 host.api.controlBridge=async(value,event)=>{calls.push({value,event});return host.api.readBridgeState();};
 const f=await fixture(t,{entry:true,host});await f.click('webflow-runtime-open');
 const review=f.document.querySelector('[aria-label="任务范围审核"]');assert.ok(review);
 assert.ok(review.textContent.includes('OpenDesk Browser SDK'));assert.ok(review.textContent.includes(installation.installationId));
 assert.ok(review.textContent.includes(source.documentId));assert.match(review.textContent,/目标、参数或安装版本尚未获准/);
 const button=[...review.querySelectorAll('button')].find(n=>n.textContent==='批准此精确范围并执行');
 for(const trusted of [false,true]){
  const event=new f.window.Event('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:trusted});
  await React.act(async()=>button.dispatchEvent(event));assert.equal(calls.length,trusted?1:0);
 }
 assert.deepEqual(calls[0].value,{source,requestId:'pending-request',action:'approve-range',pendingAuto});
});
test('pending keyword review exposes one ordinary approval and forwards only the chosen policy with the original candidate',async t=>{
 const {host,search}=keywordController(),calls=[];
 const pendingAuto={scope:{...scope,taskId:search.taskId,args:{query:'时间清单',limit:3}},
  candidate:{candidateId:'wf-pending-keyword',text:'candidate bytes',turnKey:'turn-keyword',answerKey:'answer-keyword'}};
 const source={tabId:9,documentId:'keyword-document',url:'https://chatgpt.com/c/keyword-12345678'};
 host.api.readBridgeState=async()=>({source,session:{url:source.url,status:'待批准，尚未执行',
  requestId:'pending-keyword-request',pendingAuto,fields:{},tasks:[],actions:{cancel:true}},receipt:null});
 host.api.controlBridge=async(value,event)=>{calls.push({value,event});return host.api.readBridgeState();};
 const f=await fixture(t,{entry:true,host});await f.click('webflow-runtime-open');
 const review=f.document.querySelector('[aria-label="任务范围审核"]');
 assert.match(review.textContent,/时间清单/);assert.match(review.textContent,/1–120 字/);
 const button=[...review.querySelectorAll('button')].find(node=>node.textContent==='允许更换关键词并执行');
 assert.ok(button);assert.equal(button.closest('details'),null);
 for(const trusted of [false,true]){
  const event=new f.window.Event('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:trusted});
  await React.act(async()=>button.dispatchEvent(event));assert.equal(calls.length,trusted?1:0);
 }
 assert.deepEqual(calls[0].value,{source,requestId:'pending-keyword-request',action:'approve-range',pendingAuto,
  parameterPolicy:{mode:'schema',variableKeys:['query']}});
 const exact=[...review.querySelectorAll('button')].find(node=>node.textContent==='批准此精确范围并执行');
 assert.ok(exact.closest('details'));
 assert.equal(host.calls.filter(([kind])=>kind==='read').length,2,'successful approval refreshes the parent authorization summary');
});

test('compact Listener is reachable in runtime management; refresh requires authoritative permission and explicit trusted confirmation',async t=>{
 const host=controller(),calls=[];
 let view={source:{tabId:9,documentId:'listener-doc',url:'https://chatgpt.com/c/listener'},session:null,receipt:null,
  listener:{state:'refresh-required',reason:'旧文档尚未加载监听器',checkedAt:1,recovery:{allowed:true}},work:{state:'idle'}};
 host.api.readBridgeState=async()=>structuredClone(view);
 host.api.refreshBridge=async(value,event)=>{calls.push({value,event});return {...view,listener:{state:'ready',recovery:{allowed:false}}};};
 const f=await fixture(t,{entry:true,host});
 const status=f.find('webflow-listener');assert.ok(status);
 // Compare a scalar: formatting a failed DOM equality walks React's cyclic graph.
 assert.equal(Boolean(status.closest('[hidden]')),true,'compact homepage keeps diagnostic controls inside runtime management');
 assert.equal(f.document.querySelectorAll('#webflow-listener').length,1);
 await f.click('webflow-runtime-open');
 assert.equal(status.closest('[hidden]')===null,true,'the real management entry exposes Listener controls');
 assert.match(status.textContent,/需要刷新/);assert.ok(status.querySelector('[aria-hidden="true"]'));
 assert.equal(status.querySelectorAll('[aria-live]').length,1);
 assert.equal(status.querySelector('[aria-live]').querySelector('button'),null);
 await f.click('webflow-listener-refresh',true);assert.equal(calls.length,0);
 assert.match(f.find('webflow-listener-confirmation').textContent,/草稿/);
 await f.click('webflow-listener-confirm',false);assert.equal(calls.length,0);
 const event=await f.click('webflow-listener-confirm',true);
 assert.deepEqual(calls[0],{value:{source:view.source},event});
 assert.match(status.textContent,/消息检测就绪/);
 view={...view,listener:{state:'refresh-required',recovery:{allowed:false,reason:'仍有任务'}}};
 await f.click('webflow-listener-check');assert.equal(f.find('webflow-listener-refresh').disabled,true);
 view={...view,source:null,listener:{state:'refresh-required',recovery:{allowed:true}}};
 await f.click('webflow-listener-check');assert.equal(f.find('webflow-listener-refresh').disabled,true);
});

test('context invalidation removes stale ready immediately and ignores late reads; errors never preserve ready',async t=>{
 const host=controller();let invalidate,reads=0;
 const pending=deferred();
 const ready={source:{documentId:'old'},listener:{state:'ready',recovery:{allowed:false}},work:{state:'unknown'}};
 host.api.subscribeBridgeContext=fn=>{invalidate=fn;return ()=>{invalidate=null;};};
 host.api.readBridgeState=()=>++reads===1?Promise.resolve(ready):pending.promise;
 const f=await fixture(t,{entry:true,host});
 assert.match(f.find('webflow-listener').textContent,/消息检测就绪/);
 assert.ok(f.find('webflow-listener-records'));
 await f.click('webflow-listener-check');
 await React.act(async()=>invalidate());
 assert.doesNotMatch(f.find('webflow-listener').querySelector('[aria-live]').textContent,/消息检测就绪/);
 await React.act(async()=>pending.resolve(ready));
 assert.doesNotMatch(f.find('webflow-listener').querySelector('[aria-live]').textContent,/消息检测就绪/);
 host.api.readBridgeState=async()=>{throw Error('离线');};
 await f.click('webflow-listener-check');
 assert.match(f.find('webflow-listener').textContent,/未确认/);
});


test('Listener polling is single-flight across the closed and open task panel and recovers after timeout',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const host=controller(),pending=deferred();let reads=0;
 const ready={source:{documentId:'new'},session:null,listener:{state:'ready',checkedAt:1,recovery:{allowed:false}}};
 host.api.readBridgeState=()=>{reads++;return reads===1?pending.promise:Promise.resolve(ready);};
 const f=await fixture(t,{entry:true,host});
 await f.click('webflow-runtime-open');
 await React.act(async()=>t.mock.timers.tick(2400));assert.equal(reads,1);
 await React.act(async()=>t.mock.timers.tick(5600));
 assert.match(f.find('webflow-listener').querySelector('[aria-live]').textContent,/未确认/);
 await f.click('webflow-listener-check');assert.equal(reads,2);
 assert.equal(f.find('webflow-listener').querySelector('[aria-live]').textContent,'消息检测就绪');
 const live=f.find('webflow-listener').querySelector('[aria-live]');
 ready.listener.checkedAt=2;
 await React.act(async()=>t.mock.timers.tick(1200));assert.equal(reads,3);
 assert.equal(f.find('webflow-listener').querySelector('[aria-live]'),live,'poll timestamps do not replace the live region');
 await React.act(async()=>pending.resolve({listener:{state:'refresh-required'}}));
 assert.equal(live.textContent,'消息检测就绪','a timed out read cannot overwrite fresh state');
});

test('background listener checks keep the homepage text and controls stable until facts change',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const host=controller(),poll=deferred();let reads=0;
 const view={source:{documentId:'stable-home'},session:{status:'等待新的完整任务',fields:{},tasks:[],actions:{}},
  listener:{state:'ready',reason:'已连接当前对话，正在等待新的完整任务。',recovery:{allowed:true}},work:{state:'idle'}};
 host.api.readBridgeState=()=>++reads===1?Promise.resolve(structuredClone(view)):poll.promise;
 host.api.refreshBridge=async()=>view;
 const f=await fixture(t,{entry:true,host});
 const surface=f.document.querySelector('[aria-label="Web Flow 运行状态"]');
 const before=surface.textContent;
 const buttons=['webflow-listener-check','webflow-listener-refresh'].map(id=>f.find(id));
 assert.ok(buttons.every(button=>!button.disabled));
 await React.act(async()=>t.mock.timers.tick(1200));
 assert.equal(reads,2);
 assert.equal(surface.textContent,before,'a pending background check must not insert a temporary warning row');
 assert.ok(buttons.every(button=>!button.disabled),'background reads must not pulse the buttons between enabled and disabled');
 await React.act(async()=>t.mock.timers.tick(1200));assert.equal(reads,2,'quiet reads remain single-flight');
 await React.act(async()=>poll.resolve({...view,listener:{...view.listener,checkedAt:2}}));
 assert.equal(surface.textContent,before);
});

test('manual listener checks do not turn a safe refresh into a temporary blocked-reason paragraph',async t=>{
 const host=controller(),pending=deferred();let reads=0;
 const view={source:{documentId:'manual-check'},session:null,
  listener:{state:'ready',recovery:{allowed:true,reason:'刷新只重新连接当前对话，不重发消息或重跑任务。'}},work:{state:'idle'}};
 host.api.readBridgeState=()=>++reads===1?Promise.resolve(view):pending.promise;
 host.api.refreshBridge=async()=>view;
 const f=await fixture(t,{entry:true,host});
 const before=f.find('webflow-listener').textContent;
 await f.click('webflow-listener-check');
 assert.equal(f.find('webflow-listener-refresh').disabled,true,'manual checks still block competing recovery controls');
 assert.equal(f.find('webflow-listener').textContent,before);
 assert.equal(f.find('webflow-listener-refresh-reason'),null);
 await React.act(async()=>pending.resolve(view));
});

test('quiet listener checks still clear stale readiness on failure and recover without a loading pulse',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const host=controller(),poll=deferred();let reads=0;
 const view={source:{documentId:'quiet-failure'},session:null,
  listener:{state:'ready',recovery:{allowed:true}},work:{state:'idle'}};
 host.api.readBridgeState=()=>++reads===1?Promise.resolve(view):poll.promise;
 host.api.refreshBridge=async()=>view;
 const f=await fixture(t,{entry:true,host});
 const live=f.find('webflow-listener').querySelector('[aria-live]');
 await React.act(async()=>t.mock.timers.tick(1200));
 assert.equal(live.textContent,'消息检测就绪');
 await React.act(async()=>poll.reject(Error('连接已断开')));
 assert.equal(live.textContent,'监听状态未确认');
 assert.equal(f.find('webflow-listener-refresh').disabled,true);
 host.api.readBridgeState=async()=>view;
 await React.act(async()=>t.mock.timers.tick(1200));
 assert.equal(live.textContent,'消息检测就绪');
});

test('controller replacement rejects old reads and refresh replies; unmount unsubscribes',async t=>{
 const old=controller(),pending=deferred(),refresh=deferred();let unsubscribed=0;
 const source={documentId:'old'};
 old.api.readBridgeState=async()=>({source,listener:{state:'refresh-required',recovery:{allowed:true}}});
 old.api.refreshBridge=()=>refresh.promise;
 old.api.subscribeBridgeContext=()=>()=>{unsubscribed++;};
 const f=await fixture(t,{entry:true,host:old});
 await f.click('webflow-listener-refresh');await f.click('webflow-listener-confirm',true);
 const next=controller();next.api.readBridgeState=()=>pending.promise;
 await f.setHost(next);assert.equal(unsubscribed,1);
 await React.act(async()=>refresh.resolve({source,listener:{state:'ready'}}));
 assert.equal(f.find('webflow-listener').querySelector('[aria-live]').textContent,'正在检查监听状态…');
 await f.setOpen(false);
 await React.act(async()=>pending.resolve({source,listener:{state:'ready'}}));
 assert.equal(f.find('webflow-listener'),null);
});

test('unknown work opens original records and context changes dismiss a pending refresh confirmation',async t=>{
 const host=controller();let invalidate,refreshes=0;
 host.api.readBridgeState=async()=>({source:{documentId:'doc'},session:null,
  listener:{state:'refresh-required',recovery:{allowed:true}},work:{state:'unknown'},
  history:[{requestId:'original-unknown',scope:{taskId:'search'},createdAt:1,receipt:{execution:'unknown',delivery:'unknown'}}]});
 host.api.subscribeBridgeContext=fn=>{invalidate=fn;};
 host.api.refreshBridge=async()=>{refreshes++;};
 const f=await fixture(t,{entry:true,host});
 await f.click('webflow-listener-records');
 assert.equal(f.document.querySelector('[role="dialog"]').closest('[hidden]'),null);
 assert.equal(f.document.querySelector('[data-webflow-original-records]').open,true);
 assert.match(f.document.querySelector('[data-webflow-original-records]').textContent,/original-unknown/);
 await f.click('webflow-listener-refresh');assert.ok(f.find('webflow-listener-confirmation'));
 await React.act(async()=>invalidate());
 assert.equal(f.find('webflow-listener-confirmation'),null);assert.equal(refreshes,0);
 assert.equal(f.find('webflow-listener-refresh').disabled,true);
});

test('Listener exposes native keyboard buttons, stable state-only announcements and cancelable impact review',async t=>{
 const host=controller();let refreshes=0;
 let view={source:{documentId:'keyboard-doc'},listener:{state:'refresh-required',reason:'首次检查',checkedAt:1,recovery:{allowed:true}},work:{state:'idle'}};
 host.api.readBridgeState=async()=>structuredClone(view);
 host.api.refreshBridge=async()=>{refreshes++;return view;};
 const f=await fixture(t,{entry:true,host});
 for(const id of ['webflow-listener-check','webflow-listener-refresh']){
  assert.equal(f.find(id).tagName,'BUTTON');assert.equal(f.find(id).getAttribute('type'),'button');
 }
 const live=f.find('webflow-listener').querySelector('[aria-live]');
 assert.equal(live.textContent,'需要刷新当前对话');
 await f.click('webflow-listener-refresh');
 const confirm=f.find('webflow-listener-confirm');
 assert.ok(f.document.getElementById(confirm.getAttribute('aria-describedby')).textContent.includes('草稿'));
 const escape=new f.window.Event('keydown',{bubbles:true});Object.defineProperty(escape,'key',{value:'Escape'});
 await React.act(async()=>confirm.dispatchEvent(escape));
 assert.equal(f.find('webflow-listener-confirmation'),null);assert.equal(refreshes,0);
 for(const [state,label] of [['ready','消息检测就绪'],['not-applicable','当前页面不适用'],['unconfirmed','监听状态未确认']]){
  view={...view,listener:{state,reason:'新的原因',checkedAt:2,recovery:{allowed:false}}};
  await f.click('webflow-listener-check');
  assert.equal(live.textContent,label);assert.equal(f.find('webflow-listener').querySelector('[aria-live]'),live);
 }
 assert.equal(host.calls.filter(([kind])=>kind!=='read').length,0,'listener checks do not change authorization');
});

test('unavailable listener never reassures waiting for new work; work and refresh ACK remain independent',async t=>{
 const host=controller();
 let view={source:{documentId:'ack-doc'},session:null,receipt:null,
  listener:{state:'refresh-required',recovery:{allowed:true}},work:{state:'unknown',reason:'原运行尚待对账'}};
 host.api.readBridgeState=async()=>structuredClone(view);
 host.api.refreshBridge=async()=>({...view,listener:{state:'unconfirmed',reason:'刷新已确认，等待新文档核验',recovery:{allowed:false}}});
 const f=await fixture(t,{entry:true,host});
 assert.match(f.find('webflow-listener-work').textContent,/任务状态未知/);
 assert.doesNotMatch(f.find('webflow-runtime-summary').textContent,/等待 ChatGPT 新任务/);
 await f.click('webflow-runtime-open');
 assert.doesNotMatch(f.document.querySelector('[aria-label="Web Flow 当前任务"]').textContent,/等待 ChatGPT 新任务/);
 await f.click('webflow-listener-refresh');await f.click('webflow-listener-confirm',true);
 assert.equal(f.find('webflow-listener').querySelector('[aria-live]').textContent,'监听状态未确认');
 assert.equal(f.find('webflow-listener-refresh').disabled,true);
 assert.match(f.find('webflow-listener-work').textContent,/任务状态未知/);
 view={...view,listener:{state:'ready',recovery:{allowed:true}},work:{state:'running'}};
 await f.click('webflow-listener-check');
 assert.match(f.find('webflow-listener-work').textContent,/任务执行中/);
 assert.doesNotMatch(f.document.querySelector('[aria-label="Web Flow 当前任务"]').textContent,/等待 ChatGPT 新任务/);
});

test('refresh excludes polling and pre-existing reads until ACK without promoting ACK to ready',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const host=controller(),refresh=deferred(),read=deferred();let reads=0;
 const view={source:{documentId:'exclusive'},session:null,listener:{state:'ready',recovery:{allowed:true}},work:{state:'idle'}};
 host.api.readBridgeState=()=>{reads++;return reads===2?read.promise:Promise.resolve(view);};
 host.api.refreshBridge=()=>refresh.promise;
 const f=await fixture(t,{entry:true,host});
 await f.click('webflow-listener-refresh');
 await f.click('webflow-listener-check');
 assert.equal(reads,2);assert.equal(f.find('webflow-listener-refresh').disabled,true);
 await React.act(async()=>read.resolve(view));
 await f.click('webflow-listener-refresh');await f.click('webflow-listener-confirm',true);
 await React.act(async()=>t.mock.timers.tick(3600));assert.equal(reads,2,'refresh preflight and commit cannot be obsoleted by polling');
 await React.act(async()=>refresh.resolve({...view,listener:{state:'unconfirmed',recovery:{allowed:false}}}));
 assert.equal(f.find('webflow-listener').querySelector('[aria-live]').textContent,'监听状态未确认');
 await React.act(async()=>t.mock.timers.tick(1200));assert.equal(reads,3,'polling resumes after ACK');
});

test('failed history read removes green and recovery authority but retains the original records for reconciliation',async t=>{
 const host=controller();let fail=false;
 host.api.readBridgeState=async()=>{
  if(fail)throw Error('原记录查询失败');
  return {source:{documentId:'records'},session:null,listener:{state:'ready',recovery:{allowed:true}},work:{state:'idle'},
   history:[{requestId:'keep-original',scope:{taskId:'search'},createdAt:1,receipt:{execution:'unknown',delivery:'unknown'}}]};
 };
 host.api.refreshBridge=async()=>{throw Error('must not refresh');};
 const f=await fixture(t,{entry:true,host});fail=true;
 await f.click('webflow-listener-check');
 assert.equal(f.find('webflow-listener').querySelector('[aria-live]').textContent,'监听状态未确认');
 assert.equal(f.find('webflow-listener-refresh').disabled,true);
 assert.match(f.find('webflow-listener-work').textContent,/任务状态未知/);
 await f.click('webflow-listener-records');
 assert.match(f.document.querySelector('[data-webflow-original-records]').textContent,/keep-original/);
 assert.doesNotMatch(f.find('webflow-runtime-summary').textContent,/等待 ChatGPT 新任务/);
});

test('blocked refresh explains its own reason independently of ready status; first read announces checking only once',async t=>{
 const host=controller(),first=deferred(),poll=deferred();let reads=0;
 const view={source:{documentId:'reason-doc'},session:null,listener:{state:'ready',reason:'当前文档监听已核实',
  recovery:{allowed:false,reason:'请先保存当前草稿，再重新检查'}},work:{state:'idle'}};
 host.api.readBridgeState=()=>++reads===1?first.promise:poll.promise;
 host.api.refreshBridge=async()=>view;
 const f=await fixture(t,{entry:true,host});
 const live=f.find('webflow-listener').querySelector('[aria-live]');
 assert.equal(live.textContent,'正在检查监听状态…');
 await React.act(async()=>first.resolve(view));assert.equal(live.textContent,'消息检测就绪');
 assert.equal(live.style.color,'var(--od-sub)','closed automation keeps detection visually neutral');
 const button=f.find('webflow-listener-refresh');assert.equal(button.disabled,true);
 const reason=f.document.getElementById(button.getAttribute('aria-describedby'));
 assert.ok(reason);assert.match(reason.textContent,/请先保存当前草稿/);
 assert.match(f.find('webflow-listener').textContent,/当前文档监听已核实/);
 await f.click('webflow-listener-check');assert.equal(live.textContent,'消息检测就绪');
 await React.act(async()=>poll.resolve(view));
});

for(const controlAction of ['run','approve-range']){
test(`cancel supersedes pending ${controlAction} on the same original request and late reply cannot overwrite it`,async t=>{
 const host=controller(),run=deferred(),cancel=deferred(),calls=[];
 const view={source:{documentId:'cancel-doc',tabId:9},session:{requestId:'original-request',status:'待执行',fields:{},tasks:[],actions:{run:true,cancel:true}},
  listener:{state:'ready',recovery:{allowed:false}},work:{state:'idle'}};
 host.api.readBridgeState=async()=>view;
 if(controlAction==='approve-range')view.session.pendingAuto={scope,candidate:{candidateId:'pending-cancel-review'}};
 host.api.controlBridge=(value,event)=>{calls.push({value,event});return value.action==='cancel'?cancel.promise:run.promise;};
 const f=await fixture(t,{entry:true,host});await f.click('webflow-runtime-open');
 const click=async text=>{
  const button=[...f.document.querySelector('[aria-label="Web Flow 当前任务"]').querySelectorAll('button')].find(n=>n.textContent===text);
  const event=new f.window.Event('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});
  await React.act(async()=>button.dispatchEvent(event));
 };
 await click(controlAction==='run'?'执行本次任务':'批准此精确范围并执行');await click('停止/取消原请求');
 assert.deepEqual(calls.map(({value})=>[value.action,value.requestId,value.source]),[
  [controlAction,'original-request',view.source],['cancel','original-request',view.source]]);
 await React.act(async()=>cancel.resolve({...view,session:{...view.session,status:'原请求已停止',actions:{}},work:{state:'idle'}}));
 await React.act(async()=>run.resolve({...view,session:{...view.session,status:'迟到的执行回包'},work:{state:'running'}}));
 assert.match(f.find('webflow-runtime-summary').textContent,/原请求已停止/);
 assert.doesNotMatch(f.document.querySelector('[aria-label="Web Flow 当前任务"]').textContent,/迟到的执行回包/);
 assert.equal(host.calls.filter(([kind])=>kind==='read').length,1,'superseded approval cannot refresh authorization as successful');
});
}

test('task cancel cannot supersede an exclusive refresh or issue duplicate recovery',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const host=controller(),refresh=deferred();let refreshes=0,controls=0,reads=0;
 const view={source:{documentId:'refresh-guard'},session:{requestId:'original',status:'已完成',fields:{},tasks:[],actions:{cancel:true}},
  listener:{state:'ready',recovery:{allowed:true}},work:{state:'idle'}};
 host.api.readBridgeState=async()=>{reads++;return view;};
 host.api.refreshBridge=()=>{refreshes++;return refresh.promise;};
 host.api.controlBridge=async()=>{controls++;return view;};
 const f=await fixture(t,{entry:true,host});await f.click('webflow-runtime-open');
 await f.click('webflow-listener-refresh');await f.click('webflow-listener-confirm',true);
 const cancel=[...f.document.querySelector('[aria-label="Web Flow 当前任务"]').querySelectorAll('button')].find(n=>n.textContent==='停止/取消原请求');
 const event=new f.window.Event('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});
 await React.act(async()=>cancel.dispatchEvent(event));
 await React.act(async()=>t.mock.timers.tick(2400));
 assert.equal(controls,0);assert.equal(refreshes,1);assert.equal(reads,1);
 assert.equal(f.find('webflow-listener-refresh').disabled,true);
 await React.act(async()=>refresh.reject(Error('刷新未确认，请重新检查')));
 await React.act(async()=>t.mock.timers.tick(1200));
 assert.equal(refreshes,1,'polling must not retry the failed refresh');
});

test('refresh confirmation and its keyboard focus survive harmless polling; authority changes dismiss it',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const host=controller(),poll=deferred();let reads=0,refreshes=0;
 const view={source:{documentId:'focused-confirmation'},session:null,
  listener:{state:'ready',recovery:{allowed:true}},work:{state:'idle'}};
 host.api.readBridgeState=()=>++reads===1?Promise.resolve(view):poll.promise;
 host.api.refreshBridge=async()=>{refreshes++;return view;};
 const f=await fixture(t,{entry:true,host});
 // Linkedom has no browser focus implementation. Track actual focus calls and
 // active DOM identity so the test catches removal of the focused control.
 t.mock.method(f.window.HTMLElement.prototype,'focus',function(){
  Object.defineProperty(f.document,'activeElement',{configurable:true,value:this});
 });
 await f.click('webflow-listener-refresh');
 const group=f.find('webflow-listener-confirmation'),confirm=f.find('webflow-listener-confirm');
 assert.ok(f.document.activeElement===confirm);
 await React.act(async()=>t.mock.timers.tick(1200));assert.equal(reads,2);
 assert.ok(f.find('webflow-listener-confirmation')===group);
 assert.ok(f.find('webflow-listener-confirm')===confirm);assert.equal(confirm.isConnected,true);
 assert.ok(f.document.activeElement===confirm);
 assert.equal(confirm.getAttribute('aria-disabled'),'true');
 await f.click('webflow-listener-confirm',true);assert.equal(refreshes,0,'busy confirmation cannot commit refresh');
 await React.act(async()=>poll.resolve(structuredClone(view)));
 assert.ok(f.find('webflow-listener-confirmation')===group);
 assert.ok(f.document.activeElement===confirm);assert.notEqual(confirm.getAttribute('aria-disabled'),'true');
 host.api.readBridgeState=async()=>({...view,listener:{state:'ready',recovery:{allowed:false,reason:'草稿尚未保存'}}});
 await React.act(async()=>t.mock.timers.tick(1200));
 assert.equal(f.find('webflow-listener-confirmation'),null);
 assert.equal(f.find('webflow-listener-refresh').disabled,true);
});

test('status details preserve full explanations and disclosure focus across quiet reads',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const host=controller(),pending=deferred();let reads=0;
 const explanation='本条未执行：AI 已回复，但没有产生可执行任务候选。'+ '完整原因无需截断。'.repeat(20);
 const view={source:{documentId:'details-doc'},session:{status:explanation,messageStage:'no-candidate',fields:{},tasks:[],actions:{}},
  listener:{state:'ready',reason:'已连接当前对话',recovery:{allowed:false,reason:'请先保存草稿'}},work:{state:'idle'}};
 host.api.readBridgeState=()=>++reads===1?Promise.resolve(view):pending.promise;
 const f=await fixture(t,{entry:true,host});
 const details=f.find('webflow-status-details'),summary=details.querySelector('summary');
 assert.equal(details.hasAttribute('open'),false);
 assert.equal(summary.getAttribute('aria-label'),'状态详情与维护操作');
 assert.equal(f.find('webflow-runtime-summary').textContent,explanation);
 assert.equal(f.find('webflow-runtime-summary').closest('details'),details);
 assert.equal(f.find('webflow-home-notice').closest('details'),null);
 assert.match(f.find('webflow-home-notice').textContent,/未生成任务候选/);
 t.mock.method(f.window.HTMLElement.prototype,'focus',function(){
  Object.defineProperty(f.document,'activeElement',{configurable:true,value:this});
 });
 // Native summary toggling is covered in Chromium; Linkedom has no default action.
 details.open=true;summary.focus();
 await React.act(async()=>t.mock.timers.tick(1200));
 assert.equal(details.open,true);assert.equal(f.document.activeElement,summary);
 await React.act(async()=>pending.resolve(structuredClone(view)));
 assert.equal(f.find('webflow-status-details'),details);assert.equal(details.open,true);
 const escape=new f.window.Event('keydown',{bubbles:true,cancelable:true});
 Object.defineProperty(escape,'key',{value:'Escape'});
 await React.act(async()=>summary.dispatchEvent(escape));
 assert.equal(details.open,false);assert.equal(f.document.activeElement,summary);
 assert.deepEqual(host.calls.map(([name])=>name),['read'],'reading details does not authorize or execute');
});

test('pending approval, unknown results, errors and stop access remain outside collapsed details',async t=>{
 const host=controller();
 let view={source:{documentId:'attention-doc'},session:{status:'参数范围尚未批准',pendingAuto:{scope:{args:{}}},fields:{},tasks:[],actions:{}},
  listener:{state:'ready',recovery:{allowed:false}},work:{state:'idle'}};
 host.api.readBridgeState=async()=>structuredClone(view);
 const f=await fixture(t,{entry:true,host});
 assert.match(f.find('webflow-home-notice').textContent,/待批准/);
 assert.equal(f.find('webflow-home-notice').closest('details'),null);
 view={...view,session:{status:'完整错误原因',error:true,fields:{},tasks:[],actions:{}},work:{state:'running'}};
 await f.click('webflow-listener-check');
 assert.equal(f.find('webflow-home-notice').textContent,'完整错误原因');
 assert.equal(f.find('webflow-listener-records').textContent,'查看进度');
 assert.equal(f.find('webflow-listener-records').closest('details'),null);
 view={...view,session:{...view.session,error:false,actions:{cancel:true}},work:{state:'idle'}};
 await f.click('webflow-listener-check');
 assert.equal(f.find('webflow-listener-work').hasAttribute('hidden'),false,'waiting original requests must still expose stop access');
 assert.equal(f.find('webflow-listener-records').textContent,'查看进度');
 view={...view,session:{...view.session,error:false},receipt:{execution:'completed',delivery:'unknown'},work:{state:'unknown',reason:'请核对原请求'}};
 await f.click('webflow-listener-check');
 assert.match(f.find('webflow-home-notice').textContent,/结果未知/);
 assert.equal(f.find('webflow-listener-work').closest('details'),null);
 await f.click('webflow-listener-records');
 assert.equal(f.find('webflow-runtime-panel').closest('[hidden]'),null);
 assert.deepEqual(host.calls.map(([name])=>name),['read']);
});

test('a manual check joins and acknowledges a pending quiet read without duplicating it',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const host=controller(),poll=deferred();let reads=0;
 const view={source:{documentId:'manual-join'},session:null,
  listener:{state:'ready',recovery:{allowed:true}},work:{state:'idle'}};
 host.api.readBridgeState=()=>++reads===1?Promise.resolve(view):poll.promise;
 const f=await fixture(t,{entry:true,host});
 await React.act(async()=>t.mock.timers.tick(1200));
 const button=f.find('webflow-listener-check');
 assert.equal(button.disabled,false,'quiet polling alone never pulses manual controls');
 await f.click('webflow-listener-check');
 assert.equal(reads,2,'manual intent joins the existing request');
 assert.equal(button.disabled,true);
 assert.equal(button.getAttribute('aria-busy'),'true','manual check is now acknowledged');
 await React.act(async()=>poll.resolve({...view,listener:{...view.listener,state:'unconfirmed',reason:'需要核对原请求'}}));
 assert.equal(button.disabled,false);assert.equal(button.getAttribute('aria-busy'),'false');
 assert.equal(f.find('webflow-listener').querySelector('[aria-live]').textContent,'监听状态未确认');
});

test('an unknown receipt keeps its concrete error visible on the homepage',async t=>{
 const host=controller();
 const message='保存回执失败：原连接已断开；请核对原请求，不会补发。';
 host.api.readBridgeState=async()=>({source:{documentId:'combined-error'},
  session:{status:message,error:true,fields:{},tasks:[],actions:{}},
  listener:{state:'ready',recovery:{allowed:false}},work:{state:'unknown'},
  receipt:{execution:'unknown',delivery:'unknown'}});
 const f=await fixture(t,{entry:true,host});
 const notice=f.find('webflow-home-notice');
 assert.match(notice.textContent,/结果未知/);assert.ok(notice.textContent.includes(message));
 assert.equal(notice.closest('details'),null);assert.equal(f.find('webflow-status-details').hasAttribute('open'),false);
});

// Opening progress or Stop must never send a control or bury it in historical records.
test('home progress targets current status and stop targets the original guarded action',async t=>{
 const host=controller();let controls=0;
 const view={source:{documentId:'current-before-history'},
  session:{requestId:'current-request',status:'当前请求执行中',fields:{},tasks:[],actions:{cancel:true}},
  listener:{state:'ready',recovery:{allowed:false}},work:{state:'running'},
  history:[{requestId:'old-request',scope:{taskId:'search'},createdAt:1,receipt:{execution:'unknown',delivery:'unknown'}}]};
 host.api.readBridgeState=async()=>structuredClone(view);
 host.api.controlBridge=async()=>{controls++;return view;};
 const f=await fixture(t,{entry:true,host});
 t.mock.method(f.window.HTMLElement.prototype,'focus',function(){
  Object.defineProperty(f.document,'activeElement',{configurable:true,value:this});
 });
 await f.click('webflow-listener-records');
 assert.equal(f.document.activeElement.hasAttribute('data-webflow-current-status'),true);
 assert.equal(f.document.querySelector('[data-webflow-original-records]').hasAttribute('open'),false);
 assert.equal(controls,0);
 await React.act(async()=>f.document.querySelector('[aria-label="关闭运行与授权"]').click());
 await f.click('webflow-home-stop');
 assert.equal(f.document.activeElement.getAttribute('data-webflow-action'),'cancel');
 assert.equal(controls,0,'home Stop only opens the original controlled action');
 const button=f.document.activeElement;
 const event=new f.window.Event('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});
 await React.act(async()=>button.dispatchEvent(event));
 assert.equal(controls,1,'only original trusted cancel invokes the Host');
});
