import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {createChatGPTFixedBridgeHost} from '../../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {createChatGPTBridgeTriggerLedger} from '../../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {validateWebFlowTaskIntent} from '../../../src/native-agent/chatgpt-task-request.js';
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
 const approvedScope={...scope,args:{query:'包含 ``` 与 <script> 的关键词',limit:3}};
 host.snapshot={...host.snapshot,grants:[{taskId:'search',grantId:'one',state:'active',approvedAt:0,scope:approvedScope}]};
 const f=await fixture(t,{host});
 const button=()=>[...f.find('webflow-auto-grants').querySelectorAll('button')].find(b=>b.textContent.includes('生成'));
 const clickGenerate=()=>React.act(async()=>button().dispatchEvent(new f.window.Event('click',{bubbles:true})));
 await clickGenerate();
 const field=()=>f.find('webflow-auto-grants').querySelector('textarea');
 const prompt=field().value;
 assert.ok(field().hasAttribute('readOnly')||field().readOnly===true,field().outerHTML);
 assert.equal(prompt.includes('```'),false,'the sent instruction has no Markdown fences that the user-message renderer removes');
 assert.equal(prompt.includes('\n'),false,'the witnessed input is one plain paragraph');
 assert.equal(prompt.includes('https://'),false,'JSON URL escapes prevent the website composer from creating rich links');
 const intent=validateWebFlowTaskIntent(prompt.slice(prompt.indexOf('{')));
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
 assert.equal(instructions.value.includes('https://'),false,'capability context must not create a rich URL preview in the official composer');
 assert.equal(instructions.value.includes('\n'),false,'one-time context survives exact native text witnessing');
 const encodedScope=instructions.value.slice(instructions.value.indexOf('[{'),instructions.value.indexOf('}]')+2);
 assert.equal(JSON.parse(encodedScope)[0].targetUrl,scope.targetUrl);
 assert.deepEqual(JSON.parse(encodedScope)[0].paramsSchema,task.paramsSchema);
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
