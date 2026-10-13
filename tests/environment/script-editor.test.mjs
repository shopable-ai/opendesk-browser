import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createScriptEditor} from '../../src/ui/script-editor.js';
import {createNativeAgentHostAdapter} from '../../src/native-agent/host-adapter.js';
import {createCurrentPageTarget} from '../../src/ui/current-page-target.js';
import {createRunHost} from '../../src/run-host.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {encodeValue as controlEncode} from '../../src/framework/control/value.js';
import {PAGE_BROWSER_UI_HELPER} from '../../src/libs/page-frameworks/contract.js';
import {parseStaticESMSource,STATIC_ESM_WORLDS} from '../../src/scripting/user-scripts/static-esm.js';

// Component fixtures only: no Chrome gesture, native effect or retirement proof.
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
class Element {
  value='';textContent='';dataset={};checked=false;disabled=false;children=[];listeners=new Map();
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  fire(name,event={}){for(const fn of this.listeners.get(name)||[])fn(event);}
  append(...children){this.children.push(...children);}
  setAttribute(name,value){this[name]=String(value);}
  replaceChildren(...children){this.children=children;this.value=children[0]?.value||'';}
  removeAttribute(name){delete this[name];}
}
globalThis.Option=class extends Element {constructor(text,value){super();this.textContent=text;this.value=value;}};
const event=()=>{const e=new Element();return {addListener:fn=>e.addEventListener('event',fn),removeListener:fn=>e.removeEventListener('event',fn),emit:(...args)=>{for(const fn of e.listeners.get('event')||[])fn(...args);}};};
const html=await readFile('src/ui/tool.html','utf8');
async function fixture(persisted={scripts:[],runs:[],results:[]}, draftStorage,
  {contextTabId,componentPreparerFactory,staticESMPreparerFactory,wrapTarget}={}) {
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
  const walk=(node,id)=>node.id===id?node:node.children.map(child=>walk(child,id)).find(Boolean);
  const find=id=>nodes.get(id)||[...nodes.values()].map(node=>walk(node,id)).find(Boolean);
  const view=new Element(), doc={getElementById:find,defaultView:view,createElement:()=>new Element()};
  find('script-id').value='my-script';find('script-source').value='return params.value;';find('script-params').value='{"value":1}';find('script-target-mode').value='current';
  const traces=[], permissions=[], permissionChecks=[], starts=[], executions=[], snapshots=[], commits=[], previews=[], dependencyInspections=[], terminal=deferred();
  let activeTab=11, permission=Promise.resolve(true), saveGate, loadGate, documentVersion=0;
  const tabDocuments=new Map([[11,'doc-11'],[12,'doc-12']]);
  const tabs=new Map([[11,{id:11,windowId:7,url:'https://a.example/',title:'A',incognito:false}],[12,{id:12,windowId:7,url:'https://b.example/',title:'B',incognito:false}]]);
  const api={storage:draftStorage?{session:draftStorage}:undefined,runtime:{getURL:p=>'chrome-extension://extension/'+p},permissions:{contains:request=>{permissionChecks.push(request);traces.push('permission-check');return permission;},request:request=>{permissions.push(request);return Promise.resolve(false);}},
    tabs:{getCurrent:async()=>contextTabId?{id:contextTabId}:undefined,onActivated:event(),onUpdated:event(),onRemoved:event(),query:async query=>[...tabs.values()].filter(row=>!query.active||row.id===activeTab).map(row=>({...row,active:row.id===activeTab}))},
    windows:{getCurrent:async()=>({id:7}),onRemoved:event()},
    webNavigation:{onCommitted:event(),onHistoryStateUpdated:event(),onReferenceFragmentUpdated:event(),getAllFrames:async({tabId})=>[{frameId:0,documentId:tabDocuments.get(tabId),url:tabs.get(tabId).url,documentLifecycle:'active'}]}};
  const controller={
    async commitControllerScript(request){if(saveGate)await saveGate.promise;commits.push(structuredClone(request));
      const head=persisted.scripts.filter(row=>row.scriptId===request.scriptId&&!row.tombstoned).at(-1);
      if((head?.revision||0)!==request.expectedRevision)throw {code:'E_REVISION',message:'Script head CAS conflict'};
      const revision=(head?.revision||0)+1;
      const row={scriptId:request.scriptId,revision,sourceUtf8:request.sourceUtf8,contentHash:createHash('sha256').update(request.sourceUtf8).digest('hex')};persisted.scripts.push(row);return row;},
    async getControllerScript(request){if(loadGate)await loadGate.promise;return persisted.scripts.findLast(row=>row.scriptId===request.scriptId&&(!request.revision||row.revision===request.revision));},
    async listControllerScripts(){const heads=new Map();for(const row of persisted.scripts)if(!row.tombstoned)heads.set(row.scriptId,row);
      return [...heads.values()].map(row=>({scriptId:row.scriptId,revision:row.revision,contentHash:row.contentHash})).sort((a,b)=>a.scriptId.localeCompare(b.scriptId));},
    async tombstoneControllerScript(request){const head=persisted.scripts.filter(row=>row.scriptId===request.scriptId&&!row.tombstoned).at(-1);
      if(head?.revision!==request.expectedRevision)throw {code:'E_REVISION',message:'Script tombstone CAS conflict'};head.tombstoned=true;return {tombstoned:true};},
    async startControllerRun(request){starts.push(structuredClone(request));traces.push('start');
      const isDraft=request.source?.kind==='draft';
      const saved=isDraft?null:persisted.scripts.find(row=>row.scriptId===request.scriptId&&row.revision===request.revision);
      const sourceUtf8=isDraft?request.source.sourceUtf8:saved?.sourceUtf8;
      if(typeof sourceUtf8!=='string')throw {code:'E_REVISION',message:'Explicit saved revision required'};
      const runId='run-'+(persisted.runs.length+1);
      const revision=isDraft
        ? {kind:'draft',scriptId:'draft:'+runId,revision:1,sourceHash:createHash('sha256').update(sourceUtf8).digest('hex')}
        : {scriptId:saved.scriptId,revision:saved.revision,sourceHash:saved.contentHash};
      const run={tag:'controller-run',runId,sourceKind:isDraft?'draft':'saved',state:'running',deadlineAt:request.deadlineAt,
        revision,target:{...request.target,url:request.target.expectedUrl,allowedOrigin:new URL(request.target.expectedUrl).origin}};
      persisted.runs.push(run);return {...run,sourceUtf8,paramsWire:request.paramsWire,identity:{runId:run.runId,ownerEpoch:1}};},
    async snapshotControllerRun(request){snapshots.push(structuredClone(request));return {run:request.runId?persisted.runs.find(row=>row.runId===request.runId):null,runs:structuredClone(persisted.runs),results:structuredClone(persisted.results),downloads:[],resultDeliveryDenied:[],slotAvailable:!persisted.runs.some(row=>row.state==='running')};},
    async stopControllerRun(request){traces.push(['durable-stop',request.reason]);return {runId:request.runId,state:'stopping'};},
    async finishControllerRun(request){const run=persisted.runs.find(row=>row.runId===request.runId);run.state=request.status==='succeeded'?'completed':request.status==='host-closed'?'interrupted':request.status==='stopped'?'stopped':'failed';
      const result={tag:'controller-result',runId:run.runId,resultId:'result-'+run.runId,sourceKind:run.sourceKind,revision:run.revision,state:run.state,outcome:request.status==='succeeded'?{ok:true,valueWire:request.valueWire}:{ok:false,error:request.error}};
      persisted.results.push(result);return {run,result};},
    async retireControllerTarget({runId}){persisted.runs.find(row=>row.runId===runId).retirementState='released';return {state:'released',releaseCount:1};},
    controllerOperation:async()=>{throw Error('Unexpected page operation');}
  };
  const client={ready:Promise.resolve(),controller,runCommands:{},storage:{},pagePort:{},exportBridge:{},entitlement:{},resourceSnapshot:()=>({}),
    async request(type,payload){
      if(type==='inspectPageDependencies'){
        dependencyInspections.push(structuredClone(payload));
        return {requires:[{order:0,url:'https://cdn.example/library.js',raw:'https://cdn.example/library.js',
          name:'Imported dependency',sourceKind:'https',cacheChoices:[]}],locks:[],
          admission:{status:'needs-review',blockers:[],warnings:[]}};
      }
      if(type!=='previewPageScript')throw Error('Unexpected preview request: '+type);
      previews.push(structuredClone(payload));
      return {state:'preview-evaluated',resultText:'{"ok":true}',sourceHash:'a'.repeat(64)};
    }};
  const target=createCurrentPageTarget({api});await target.ready;
  const testedTarget=wrapTarget?wrapTarget(target):target;
  const editor=createScriptEditor({client,currentPageTarget:testedTarget,api,document:doc,
    ...(staticESMPreparerFactory?{staticESMPreparerFactory}:{}),
    ...(componentPreparerFactory?{componentPreparerFactory}:{}),hostFactory:options=>createRunHost({...options,controllerFactory:({context})=>({
    execute:async(source,params)=>{executions.push({source,params});context.signal.addEventListener('abort',()=>terminal.resolve({status:context.signal.reason.code==='E_HOST_CLOSED'?'host-closed':'stopped'}),{once:true});return terminal.promise;},
    retired:Promise.resolve({acknowledged:true}),stop(){traces.push('local-stop');},close(){traces.push('local-close');}
  })})});
  await tick();
  return {find,editor,client,target,persisted,api,view,permissions,permissionChecks,starts,executions,snapshots,commits,previews,traces,dependencyInspections,
    click:async id=>{find(id).fire('click',{isTrusted:true});await tick();},
    finish:async value=>{terminal.resolve({status:'succeeded',value:controlEncode(value)});await editor.host.completion;await tick();},
    setPermission:value=>{permission=value;},setSaveGate:value=>{saveGate=value;},setLoadGate:value=>{loadGate=value;},
    switchTab:async()=>{activeTab=12;api.tabs.onActivated.emit({windowId:7,tabId:12});await tick();},
    activateTab:async id=>{activeTab=id;api.tabs.onActivated.emit({windowId:7,tabId:id});await tick();await tick();},
    navigateTab:async(id=activeTab)=>{
      const row=tabs.get(id),url=new URL(row.url);
      url.pathname='/new-document-'+(++documentVersion);
      tabDocuments.set(id,'doc-'+id+'-nav-'+documentVersion);
      tabs.set(id,{...row,url:url.href,status:'complete'});
      api.webNavigation.onCommitted.emit({tabId:id,frameId:0,
        documentId:tabDocuments.get(id),url:url.href});
      await tick();await tick();
    },
    removeTab:async id=>{
      tabs.delete(id);tabDocuments.delete(id);
      api.tabs.onRemoved.emit(id,{windowId:7});
      await tick();
    },
    dispose(){editor.dispose();target.dispose();}};
}

test('Developer shows one terminal status line and hides it for unrelated feedback',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  await f.click('script-run');await f.finish(7);
  assert.equal(f.find('script-status').dataset.state,'results');
  assert.equal(f.find('script-status').textContent,'任务状态：');
  assert.equal(f.find('script-task-status').textContent,'已完成 · 资源已释放');
  assert.equal(f.find('script-task-status').hidden,false);
  await f.click('script-save');
  assert.match(f.find('script-status').textContent,/已持久保存/);
  assert.equal(f.find('script-task-status').hidden,true);
});

async function componentFixture(t,framework,{compilerError,previewError,compileGate}={}) {
  const compiled=[];
  class ComponentWorker {
    terminate(){}
    postMessage(payload){
      if(payload.action==='inspect'){
        queueMicrotask(()=>this.onmessage({data:{requestId:payload.requestId,ok:true,result:{
          framework:payload.framework,projectId:payload.projectId,
          sourceHash:createHash('sha256').update(payload.componentSource).digest('hex'),
          remoteRoots:[],missingUrls:[],modules:[],complete:true}}}));
        return;
      }
      assert.equal(payload.action,'prepare');
      compiled.push(payload);
      queueMicrotask(async()=>{if(compileGate)await compileGate.promise;this.onmessage({data:{requestId:payload.requestId,
        ok:!compilerError,...(compilerError?{error:compilerError}:{result:{
          framework:payload.framework,projectId:payload.projectId,entryFormat:'async-main',
          sourceUtf8:'// @opendesk-lib '+payload.framework+'\nasync function main(){}'}})}});});
    }
  }
  const oldWorker=globalThis.Worker;globalThis.Worker=ComponentWorker;
  t.after(()=>{if(oldWorker===undefined)delete globalThis.Worker;else globalThis.Worker=oldWorker;});
  const helper=await readFile(PAGE_BROWSER_UI_HELPER.source,'utf8');
  t.mock.method(globalThis,'fetch',async url=>({ok:true,redirected:false,url,text:async()=>helper}));
  const f=await fixture();t.after(()=>f.dispose());
  const request=f.client.request;
  f.client.request=async(type,payload)=>{
    if(type!=='previewPageScript')return request(type,payload);
    if(previewError)throw previewError;
    f.previews.push(structuredClone(payload));
    return {state:'preview-evaluated',resultText:'component mounted',
      sourceHash:createHash('sha256').update(payload.sourceUtf8).digest('hex'),
      tabId:payload.target.tabId,documentId:payload.target.documentId,managedUI:true,managedPreviewId:payload.managedUI.previewId};
  };
  const componentInput=f.find('page-component-'+framework);
  componentInput.checked=true;
  componentInput.fire('change');await tick();
  return {...f,compiled,settle:async()=>{
    for(let n=0;n<100&&f.find('script-status').dataset.state==='running';n++)await tick();
    assert.notEqual(f.find('script-status').dataset.state,'running','preview must settle');
  }};
}

for(const framework of ['react','vue'])test(framework+' primary Run compiles a managed Page preview and shows its result',async t=>{
  const f=await componentFixture(t,framework);
  assert.equal(f.find('script-run').disabled,false);
  assert.match(f.find('script-run').textContent,new RegExp(framework==='react'?'React':'Vue'));
  f.find('script-run').fire('click',{isTrusted:false});await tick();
  assert.equal(f.compiled.length,0);assert.equal(f.previews.length,0);
  const source=f.find('script-source').value,pending=deferred();f.setPermission(pending.promise);
  await f.click('script-run');
  assert.equal(f.find('script-run').disabled,true);
  assert.equal(f.find('script-status').dataset.state,'running');
  f.find('script-run').fire('click',{isTrusted:true});
  pending.resolve(true);await f.settle();
  assert.equal(f.compiled.length,1);assert.equal(f.compiled[0].componentSource,source);
  assert.equal(f.previews.length,1);assert.equal(f.previews[0].managedUI.enabled,true);
  assert.equal(f.previews[0].target.documentId,'doc-11');
  assert.equal(f.find('script-status').dataset.state,'completed');
  assert.equal(f.find('script-result').textContent,'component mounted');
  assert.equal(f.find('script-result-kind').textContent,'网页试运行结果');
  assert.equal(f.find('script-task-status').hidden,true);
  assert.equal(f.find('script-copy-result').disabled,false);
  assert.equal(f.find('script-stop').disabled,false);
  assert.equal(f.starts.length,0);assert.equal(f.commits.length,0);
});

for(const failure of ['permission','document','compiler','unknown'])test('component primary Run preserves '+failure+' protection and visible feedback',async t=>{
  const f=await componentFixture(t,'react',{
    ...(failure==='compiler'?{compilerError:{code:'E_PAGE_COMPILER_WORKER',message:'Invalid JSX'}}:{}),
    ...(failure==='unknown'?{previewError:{code:'E_EFFECT_UNKNOWN',message:'Unknown native outcome'}}:{})
  });
  const pending=deferred();f.setPermission(failure==='permission'?Promise.resolve(false):pending.promise);
  await f.click('script-run');
  if(failure==='document')await f.switchTab();
  pending.resolve(true);await f.settle();
  assert.equal(f.find('script-status').dataset.state,'error');
  assert.match(f.find('script-status').textContent,/E_/);
  assert.equal(f.find('script-copy-result').disabled,true);
  assert.equal(f.previews.length,0);assert.equal(f.starts.length,0);
  if(failure==='permission'||failure==='document')assert.equal(f.compiled.length,0);
  if(failure==='unknown'){
    assert.equal(f.find('script-run').disabled,true);
    await f.click('script-run');assert.equal(f.compiled.length,1,'unknown effect must not be replayed');
  }
});

test('component primary Run retains the shared execution slot gate',async t=>{
  const f=await componentFixture(t,'react');
  const snapshot=f.editor.host.controller.snapshotControllerRun;
  f.editor.host.controller.snapshotControllerRun=async request=>({...await snapshot(request),slotAvailable:false});
  await f.click('script-read');
  assert.equal(f.find('script-run').disabled,true);
  await f.click('script-run');assert.equal(f.compiled.length,0);assert.equal(f.previews.length,0);
  f.editor.host.controller.snapshotControllerRun=snapshot;await f.click('script-read');
  assert.equal(f.find('script-run').disabled,false);
});

for(const changed of ['source','document'])test('component primary Run refuses '+changed+' changes during compilation',async t=>{
  const compileGate=deferred(),f=await componentFixture(t,'react',{compileGate});
  await f.click('script-run');
  for(let n=0;n<100&&!f.compiled.length;n++)await tick();
  assert.equal(f.compiled.length,1);
  assert.match(f.find('script-status').textContent,/核对当前文档/);
  assert.equal(f.find('script-run').disabled,true);assert.equal(f.find('script-stop').disabled,false);
  assert.equal(f.find('script-stop').textContent,'取消准备');
  if(changed==='source'){
    f.find('script-source').value='export default function Changed(){return <div/>;}';
    f.find('script-source').fire('input');
  }else await f.switchTab();
  compileGate.resolve();await f.settle();
  assert.equal(f.previews.length,0);assert.equal(f.starts.length,0);
  assert.equal(f.find('script-status').dataset.state,'error');
});

test('Dev Run has no per-Origin axiosx form or prompt; backend discovers HTTP targets at request time',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  for(const id of ['script-network-scope','script-network-origins','script-network-http-test'])
    assert.equal(f.find(id),undefined);
  await f.click('script-run');await f.finish(200);
  assert.equal(Object.hasOwn(f.starts[0],'networkOrigins'),false);
  assert.ok(f.permissionChecks.some(p=>p.origins.includes('https://a.example/*')));
  assert.equal(f.permissions.length,0);
});
test('twenty Controller runs and twenty Page previews reuse Chrome grants with zero request calls',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  for(let n=0;n<20;n++){
    await f.click('script-run');await f.finish(n);await tick();
    assert.equal(f.starts.length,n+1);assert.equal(f.persisted.results.length,n+1);
  }
  f.find('script-source').value='async function main(){return document.title;}';
  for(let n=0;n<20;n++){await f.click('page-preview-run');await tick();assert.equal(f.previews.length,n+1);}
  assert.equal(f.permissions.length,0);assert.ok(f.permissionChecks.length>=40);
  f.setPermission(Promise.resolve(false));
  await f.click('script-run');await f.click('page-preview-run');await tick();
  assert.equal(f.starts.length,20);assert.equal(f.previews.length,20);assert.equal(f.permissions.length,0);
});

test('developer source switch hides local controls until enabled and reports a missing local connection',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  f.client.requestLocalProject=async method=>method==='status'?{connected:false}:assert.fail('no projects without a connection');
  f.editor.connectLocalProjects({});
  assert.equal(f.find('local-project-mode').checked,false);
  assert.equal(f.find('local-project-tools').hidden,true);
  assert.equal(f.find('manual-source-editor').hidden,false);
  f.find('local-project-mode').checked=true;f.find('local-project-mode').fire('change');await tick();
  assert.equal(f.find('local-project-tools').hidden,false);
  assert.equal(f.find('manual-source-editor').hidden,true);
  assert.equal(f.find('script-run').disabled,true);
  assert.match(f.find('local-project-status').textContent,/本地项目服务未连接/);
  assert.doesNotMatch(f.find('local-project-status').textContent,/E_DEV_DISCONNECTED/);
  assert.match(f.find('local-project-status').title,/E_DEV_DISCONNECTED/);
  f.find('local-project-mode').checked=false;f.find('local-project-mode').fire('change');
  assert.equal(f.find('local-project-tools').hidden,true);
  assert.equal(f.find('manual-source-editor').hidden,false);
});

test('local project can open the packaged native connection settings only by a trusted click',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  let opened=0;
  f.api.runtime.openOptionsPage=async()=>{opened++;};
  f.editor.connectLocalProjects({});
  await tick();
  f.find('local-project-connect').fire('click',{isTrusted:true});
  assert.equal(opened,0,'direct editing never triggers Native setup');
  f.find('local-project-mode').checked=true;f.find('local-project-mode').fire('change');
  await tick();
  f.find('local-project-connect').fire('click',{isTrusted:false});
  assert.equal(opened,0,'synthetic interaction cannot open settings');
  f.find('local-project-connect').fire('click',{isTrusted:true});
  await tick();
  assert.equal(opened,1);
  assert.equal(f.starts.length,0,'opening native settings never executes a script');
});

test('local project setup guide opens only after a trusted user click in local mode',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const opened=[];f.api.tabs.create=async ({url})=>{opened.push(url);};
  f.editor.connectLocalProjects({});await tick();
  f.find('local-project-guide-open').fire('click',{isTrusted:true});await tick();
  assert.equal(opened.length,0,'hidden help must not be usable in direct edit mode');
  f.find('local-project-mode').checked=true;f.find('local-project-mode').fire('change');await tick();
  f.find('local-project-guide-open').fire('click',{isTrusted:false});await tick();
  assert.equal(opened.length,0,'a synthetic click cannot open the docs');
  f.find('local-project-guide-open').fire('click',{isTrusted:true});await tick();
  assert.equal(opened.length,1);
  assert.match(opened[0],/^https:\/\/github\.com\/shopable-ai\/opendesk-browser\//);
});

test('developer current-page summary follows the actual tab without exposing document internals',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  assert.equal(f.find('script-current-page-host').textContent,'a.example');
  assert.equal(f.find('script-current-page-status').textContent,'可运行');
  await f.switchTab();
  assert.equal(f.find('script-current-page-host').textContent,'b.example');
  assert.equal(f.find('script-current-page-status').textContent,'可运行');
  assert.equal(f.find('script-current-page-title').textContent,'B');
  assert.match(f.find('script-current-page-debug').textContent,/documentId/);
});

test('one authorized local project is selected automatically without starting execution',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  f.client.requestLocalProject=async method=>method==='status'?{connected:true,providerEpoch:'epoch-a'}:
    method==='projects.list'?{providerEpoch:'epoch-a',projects:[{name:'Only project',bindingId:'local-only'}]}:
    assert.fail('source must not be read before an explicit run');
  f.editor.connectLocalProjects({});await tick();
  f.find('local-project-mode').checked=true;f.find('local-project-mode').fire('change');await tick();
  assert.equal(f.find('developer-source-switch').dataset.mode,'local');
  assert.equal(f.find('local-project-select').value,'local-only');
  assert.equal(f.find('local-project-status').dataset.state,'connected');
  assert.equal(f.find('local-project-select').disabled,false);
  assert.equal(f.find('script-run').textContent,'运行本地项目');
  assert.equal(f.starts.length,0);
  f.find('local-project-mode').checked=false;f.find('local-project-mode').fire('change');
  assert.equal(f.find('developer-source-switch').dataset.mode,'manual');
});

test('a remembered project is never silently replaced by a different sole authorized project',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const key='opendesk.local-project.selection.v1';
  const saved=[];
  f.api.storage={local:{get:async()=>({[key]:{local:true,bindingId:'old-project',paramsText:'{}'}}),set:async value=>{saved.push(value[key]);}}};
  const requests=[];
  f.client.requestLocalProject=async method=>{requests.push(method);return method==='status'?{connected:true,providerEpoch:'new-epoch'}:
    method==='projects.list'?{providerEpoch:'new-epoch',projects:[{name:'Another project',bindingId:'new-project'}]}:
    assert.fail('stale project must not be resolved');};
  f.editor.connectLocalProjects({});await tick();await tick();
  assert.equal(f.find('local-project-mode').checked,false,'persisted true must not re-enable local mode');
  assert.equal(f.find('manual-source-editor').hidden,false);
  assert.equal(f.find('local-project-tools').hidden,true);
  assert.equal(requests.length,0,'opening the Sidebar must not contact a local project provider');
  assert.equal(f.find('local-project-select').value,'old-project','retain prior project selection');
  f.find('local-project-mode').checked=true;f.find('local-project-mode').fire('change');await tick();await tick();
  assert.equal(f.find('local-project-status').dataset.state,'selection-needed');
  assert.equal(f.find('script-run').disabled,true);
  assert.equal(f.starts.length,0);
  assert.equal(Object.hasOwn(saved.at(-1),'local'),false,'do not persist active mode');
});

test('preparation-only same-epoch updates preserve pending resolve; catalog changes still invalidate it',async t=>{
  for(const changed of ['preparation','preparation-repeat','removed','identity','epoch','disconnected','source-error','query-error']){
    const f=await fixture();t.after(()=>f.dispose());f.find('local-project-params').value='{}';const gate=deferred(),metadataGate=deferred();let notify,preparing='updating',catalog=true,sourceId='source-a',holdMetadata=false;
    const sourceUtf8='async function main(){return {local:3};}',sourceHash=createHash('sha256').update(sourceUtf8).digest('hex');
    f.client.registration={registrationId:'local-host'};f.client.subscribeNativeAgent=()=>()=>{};f.client.replyNativeAgent=()=>{};
    f.client.subscribeLocalProjects=fn=>{notify=fn;return()=>{};};
    f.client.requestLocalProject=async(method,params)=>{
      if(method==='status')return {connected:true,providerEpoch:'epoch-a'};
      if(method==='projects.list'){if(holdMetadata){await metadataGate.promise;if(changed==='query-error')throw Object.assign(new Error('status query failed'),{code:'E_DEV_TIMEOUT'});}return {providerEpoch:'epoch-a',projects:catalog?[{name:'A',bindingId:'local-a',sourceId,preparation:{state:preparing}}]:[]};}
      await gate.promise;return {providerEpoch:'epoch-a',bindingId:params.bindingId,sourceUtf8,sourceHash,sourceBytes:Buffer.byteLength(sourceUtf8),runtimeKind:'controller',siteOrigins:['https://a.example']};
    };
    const adapter=createNativeAgentHostAdapter({client:f.client,host:f.editor.host,currentPageTarget:f.target,api:f.api});t.after(()=>adapter.dispose());
    f.editor.connectLocalProjects(adapter);await tick();f.find('local-project-mode').checked=true;f.find('local-project-mode').fire('change');await tick();await tick();
    f.find('local-project-select').value='local-a';f.find('local-project-select').fire('change');
    f.click('script-run');await tick();
    preparing=changed==='source-error'?'source-error':'ready';if(changed==='removed')catalog=false;if(changed==='identity')sourceId='source-b';
    holdMetadata=true;notify({connected:changed!=='disconnected',providerEpoch:changed==='epoch'?'epoch-b':'epoch-a'});await tick();gate.resolve();await new Promise(resolve=>setTimeout(resolve,50));
    if(changed==='preparation-repeat')notify({connected:true,providerEpoch:'epoch-a'});
    assert.equal(f.starts.length,0,'pending catalog check must precede dispatch');metadataGate.resolve();
    if(changed.startsWith('preparation'))await f.finish(3);
    for(let i=0;i<100&&!['completed','results','error'].includes(f.find('script-status').dataset.state);i++)await new Promise(resolve=>setTimeout(resolve,5));
    if(changed.startsWith('preparation')){assert.equal(f.starts.length,1,f.find('script-status').textContent);assert.equal(f.persisted.results.at(-1)?.state,'completed');assert.equal(f.find('local-project-select').value,'local-a');}
    else{assert.equal(f.starts.length,0,changed+' must not dispatch stale resolve');assert.match(f.find('script-status').textContent,/E_DEV_CONFLICT/);}
  }
});
test('local project mode preserves manual draft and params while running fresh bytes through the same Host',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const manual=f.find('script-source').value;f.find('script-params').value='invalid manual parameter JSON';f.find('local-project-params').value='{}';
  const sourceUtf8='async function main(){return {local:3};}',sourceHash=createHash('sha256').update(sourceUtf8).digest('hex');
  f.client.registration={registrationId:'local-host'};
  f.client.subscribeNativeAgent=()=>()=>{};f.client.replyNativeAgent=()=>{};
  f.client.requestLocalProject=async(method,params)=>method==='status'?{connected:true,providerEpoch:'epoch-a'}:
    method==='projects.list'?{providerEpoch:'epoch-a',projects:[{name:'A',bindingId:'local-a'}]}:
    {providerEpoch:'epoch-a',bindingId:params.bindingId,sourceUtf8,sourceHash,sourceBytes:Buffer.byteLength(sourceUtf8),runtimeKind:'controller',siteOrigins:['https://a.example'],paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}};
  const adapter=createNativeAgentHostAdapter({client:f.client,host:f.editor.host,currentPageTarget:f.target,api:f.api});t.after(()=>adapter.dispose());
  f.editor.connectLocalProjects(adapter);await tick();
  f.find('local-project-mode').checked=true;f.find('local-project-mode').fire('change');await tick();
  f.find('local-project-select').value='local-a';f.find('local-project-select').fire('change');
  assert.equal(f.find('script-save').disabled,true);assert.equal(f.find('manual-source-editor').hidden,true);
  assert.throws(()=>f.editor.importDraft('return 99;'),{code:'E_DEV_MODE'});
  for(let repeat=0;repeat<20;repeat++){
    await f.click('script-run');for(let n=0;n<100&&f.executions.length<=repeat&&f.find('script-status').dataset.state!=='error';n++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(f.starts.length,repeat+1,f.find('script-status').textContent);assert.equal(f.executions[repeat].source,sourceUtf8);
    await f.finish({local:3});
  }
  assert.equal(f.commits.length,0);assert.equal(f.permissions.length,0);assert.ok(f.permissionChecks.length>=20);
  assert.equal(f.find('script-source').value,manual);assert.equal(f.find('script-params').value,'invalid manual parameter JSON');
  f.setPermission(Promise.resolve(false));await f.click('script-run');await tick();
  assert.equal(f.starts.length,20);assert.equal(f.permissions.length,0);assert.match(f.find('script-status').textContent,/E_PERMISSION/);
  f.find('local-project-mode').checked=false;f.find('local-project-mode').fire('change');assert.equal(f.find('script-source').value,manual);assert.equal(f.find('manual-source-editor').hidden,false);
});
test('local source response after mode switch is rejected before Host admission',async t=>{
  const f=await fixture();t.after(()=>f.dispose());const gate=deferred();f.find('local-project-params').value='{}';
  f.client.requestLocalProject=async method=>method==='status'?{connected:true,providerEpoch:'epoch-a'}:
    method==='projects.list'?{providerEpoch:'epoch-a',projects:[{name:'A',bindingId:'local-a'}]}:gate.promise;
  f.editor.connectLocalProjects({handle:()=>assert.fail('late source must not be admitted')});await tick();
  f.find('local-project-mode').checked=true;f.find('local-project-mode').fire('change');await tick();
  f.find('local-project-select').value='local-a';f.find('local-project-select').fire('change');await f.click('script-run');
  f.find('local-project-mode').checked=false;f.find('local-project-mode').fire('change');gate.resolve({sourceUtf8:'old'});await tick();
  assert.equal(f.starts.length,0);assert.match(f.find('script-status').textContent,/E_DEV_CONFLICT/);
});
test('local managed Page Stop owns a confirmed failing main, survives provider disconnect and blocks overlapping Run',async t=>{
 const f=await fixture();t.after(()=>f.dispose());const bindingId='local-'+'a'.repeat(20),sourceUtf8='async function main(){return 1}',sourceHash=createHash('sha256').update(sourceUtf8).digest('hex');
 const admitted=[],stops=[],gate=deferred();let localChanged,failMain=false;
 f.api.permissions.contains=async()=>true;f.client.registration={registrationId:'local-host'};
 f.client.subscribeNativeAgent=()=>()=>{};f.client.replyNativeAgent=()=>{};
 f.client.subscribeLocalProjects=callback=>{localChanged=callback;return()=>{};};
 f.client.requestLocalProject=async(method,params)=>method==='status'?{connected:true,providerEpoch:'epoch-a'}:
   method==='projects.list'?{providerEpoch:'epoch-a',projects:[{name:'A',bindingId}]}:
   {providerEpoch:'epoch-a',bindingId:params.bindingId,sourceUtf8,sourceHash,sourceBytes:Buffer.byteLength(sourceUtf8),runtimeKind:'page-userscript',entryFormat:'async-main',managedUI:true,siteOrigins:['https://a.example']};
 const original=f.client.request.bind(f.client);
 f.client.request=async(type,payload)=>{
  if(type==='previewPageScript'){
   admitted.push(payload);if(failMain)throw Object.assign(new Error('main failed after managed UI mount'),{code:'E_PAGE_SCRIPT_EXECUTION'});
   return {state:'preview-evaluated',sourceHash,world:'USER_SCRIPT',tabId:11,documentId:'doc-11',managedUI:true,managedPreviewId:payload.managedUI.previewId,resultText:'1'};
  }
  if(type==='retirePagePreview'){stops.push(payload);await gate.promise;return {previewId:payload.previewId,sourceHash,state:'preview-retired',receipt:{ok:true,scope:'managed-ui-only'}};}
  return original(type,payload);
 };
 const adapter=createNativeAgentHostAdapter({client:f.client,host:f.editor.host,currentPageTarget:f.target,api:f.api});t.after(()=>adapter.dispose());
 f.editor.connectLocalProjects(adapter);await tick();f.find('local-project-mode').checked=true;f.find('local-project-mode').fire('change');await tick();
 f.find('local-project-select').value=bindingId;f.find('local-project-select').fire('change');
 const waitState=async state=>{for(let i=0;i<100&&f.find('script-status').dataset.state!==state;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.find('script-status').dataset.state,state,f.find('script-status').textContent);};
 await f.click('script-run');await waitState('completed');assert.equal(f.find('script-stop').disabled,false);
 assert.equal(f.find('page-preview-tools').hidden,true);
 assert.equal(f.find('script-result').textContent,'1','local Page returns in visible result panel');
 assert.equal(f.find('developer-results-panel').open,true);
 assert.equal(f.find('script-copy-result').disabled,false);
 failMain=true;await f.click('script-run');await waitState('error');assert.equal(admitted.length,2);
 assert.equal(f.find('developer-results-panel').open,true);
 assert.notEqual(f.find('script-result').textContent,'正在运行…');
 localChanged({connected:false});assert.equal(f.find('script-run').disabled,true);assert.equal(f.find('script-stop').disabled,false);
 f.find('local-project-select').value='local-'+'b'.repeat(20);f.find('local-project-select').fire('change');assert.equal(f.find('script-stop').disabled,true);
 f.find('local-project-select').value=bindingId;f.find('local-project-select').fire('change');assert.equal(f.find('script-stop').disabled,false);
 await f.click('script-stop');assert.equal(stops[0].previewId,admitted[1].managedUI.previewId);assert.notEqual(stops[0].previewId,admitted[0].managedUI.previewId);
 assert.equal(f.find('script-run').disabled,true);await f.click('script-run');assert.equal(admitted.length,2);
 gate.resolve();await waitState('completed');assert.equal(f.find('script-stop').disabled,true);assert.equal(f.starts.length,0);
});

async function localPageResultFixture(t,{failMain=false}={}) {
  const f=await fixture();t.after(()=>f.dispose());
  const bindingId='local-'+'a'.repeat(20),sourceUtf8='async function main(){return 1}',
    sourceHash=createHash('sha256').update(sourceUtf8).digest('hex');
  let localChanged,previewId,stopReceipt;
  f.api.permissions.contains=async()=>true;f.client.registration={registrationId:'local-host'};
  f.client.subscribeNativeAgent=()=>()=>{};f.client.replyNativeAgent=()=>{};
  f.client.subscribeLocalProjects=callback=>{localChanged=callback;return()=>{};};
  f.client.requestLocalProject=async(method,params)=>method==='status'?{connected:true,providerEpoch:'epoch-a'}:
    method==='projects.list'?{providerEpoch:'epoch-a',projects:[{name:'A',bindingId}]}:
    {providerEpoch:'epoch-a',bindingId:params.bindingId,sourceUtf8,sourceHash,sourceBytes:Buffer.byteLength(sourceUtf8),runtimeKind:'page-userscript',entryFormat:'async-main',managedUI:true,siteOrigins:['https://a.example']};
  const original=f.client.request.bind(f.client);
  f.client.request=async(type,payload)=>{
    if(type==='previewPageScript'){
      previewId=payload.managedUI.previewId;
      if(failMain)throw Object.assign(new Error('main failed after managed UI mount'),{code:'E_PAGE_SCRIPT_EXECUTION'});
      return {state:'preview-evaluated',sourceHash,world:'USER_SCRIPT',tabId:11,documentId:'doc-11',managedUI:true,managedPreviewId:previewId,resultText:'1'};
    }
    if(type==='retirePagePreview')return stopReceipt??{previewId:payload.previewId,sourceHash,state:'preview-retired',receipt:{ok:true,scope:'managed-ui-only'}};
    return original(type,payload);
  };
  const adapter=createNativeAgentHostAdapter({client:f.client,host:f.editor.host,currentPageTarget:f.target,api:f.api});t.after(()=>adapter.dispose());
  f.editor.connectLocalProjects(adapter);await tick();
  f.find('local-project-mode').checked=true;f.find('local-project-mode').fire('change');await tick();
  await f.click('script-run');
  const expectedState=failMain?'error':'completed';
  for(let i=0;i<100&&f.find('script-status').dataset.state!==expectedState;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.find('script-status').dataset.state,expectedState,f.find('script-status').textContent);
  return {...f,previewId,sourceHash,localChanged,setStopReceipt:value=>{stopReceipt=value;}};
}

test('local Page result survives target refresh and shows the confirmed Stop receipt',async t=>{
  const f=await localPageResultFixture(t),gate=deferred(),query=f.api.tabs.query;
  f.api.tabs.query=async params=>{await gate.promise;return query(params);};
  const refresh=f.target.refresh();
  assert.equal(f.target.snapshot.status,'resolving');
  assert.equal(f.find('script-result').textContent,'1','resolving is not a changed document');
  assert.equal(f.find('script-copy-result').disabled,true,'pending identity is not a current result');
  await f.click('script-read');assert.equal(f.find('script-result').textContent,'1','Controller history cannot overwrite the pending Page result');
  gate.resolve();await refresh;f.api.tabs.query=query;
  assert.equal(f.find('script-copy-result').disabled,false);
  await f.click('script-stop');
  assert.equal(f.find('script-status').dataset.state,'completed');
  assert.equal(f.find('script-result-kind').textContent,'本地 Page · 停止回执');
  const receipt=JSON.parse(f.find('script-result').textContent);
  assert.deepEqual(receipt,{previewId:f.previewId,sourceHash:f.sourceHash,state:'preview-retired',receipt:{ok:true,scope:'managed-ui-only'}});
  assert.equal(f.find('script-stop').disabled,true);assert.equal(f.find('script-run').disabled,false);
  assert.equal(f.find('script-copy-result').disabled,false);
  assert.deepEqual(JSON.parse(f.find('page-preview-technical').textContent),{stop:receipt});
  await f.click('script-read');assert.deepEqual(JSON.parse(f.find('script-result').textContent),receipt);
  await f.navigateTab();assert.equal(f.find('script-result-kind').textContent,'上次结果已失效');
  assert.equal(f.find('script-copy-result').disabled,true);
});

test('local Page result still expires on confirmed disconnect or a different tab',async t=>{
  for(const reason of ['disconnect','tab'])await t.test(reason,async t=>{
    const f=await localPageResultFixture(t);
    if(reason==='disconnect')f.localChanged({connected:false});else await f.switchTab();
    assert.equal(f.find('script-result-kind').textContent,'上次结果已失效');
    assert.equal(f.find('script-copy-result').disabled,true);
  });
});

test('local Page Stop retains receipt identity after failed main and provider disconnect',async t=>{
  const f=await localPageResultFixture(t,{failMain:true});
  f.localChanged({connected:false});
  assert.equal(f.find('script-stop').disabled,false);
  await f.click('script-stop');
  assert.equal(f.find('script-status').dataset.state,'completed');
  assert.equal(f.find('script-result-kind').textContent,'本地 Page · 停止回执');
  const text=f.find('script-result').textContent,receipt=JSON.parse(text);
  assert.equal(receipt.previewId,f.previewId);assert.equal(receipt.sourceHash,f.sourceHash);
  assert.equal(f.find('script-copy-result').disabled,false);
  await f.click('script-read');assert.equal(f.find('script-result').textContent,text);
  await f.navigateTab();assert.equal(f.find('script-result-kind').textContent,'上次结果已失效');
  assert.equal(f.find('script-copy-result').disabled,true);
});

test('local Page Stop never displays success for a mismatched cleanup receipt',async t=>{
  const mutations={previewId:r=>({...r,previewId:'other'}),sourceHash:r=>({...r,sourceHash:'b'.repeat(64)}),
    state:r=>({...r,state:'preview-evaluated'}),ok:r=>({...r,receipt:{...r.receipt,ok:false}}),
    scope:r=>({...r,receipt:{...r.receipt,scope:'all-effects'}})};
  for(const [field,mutate] of Object.entries(mutations))await t.test(field,async t=>{
    const f=await localPageResultFixture(t);
    f.setStopReceipt(mutate({previewId:f.previewId,sourceHash:f.sourceHash,state:'preview-retired',receipt:{ok:true,scope:'managed-ui-only'}}));
    await f.click('script-stop');
    assert.equal(f.find('script-status').dataset.state,'error');
    assert.match(f.find('script-status').textContent,/E_EFFECT_UNKNOWN/);
    assert.notEqual(f.find('script-result-kind').textContent,'本地 Page · 停止回执');
  });
});

test('local Page Stop receipt cannot become current after navigation while cleanup is pending',async t=>{
  const f=await localPageResultFixture(t),gate=deferred();
  f.setStopReceipt(gate.promise);
  await f.click('script-stop');assert.equal(f.find('script-status').dataset.state,'stopping');
  await f.navigateTab();
  gate.resolve({previewId:f.previewId,sourceHash:f.sourceHash,state:'preview-retired',receipt:{ok:true,scope:'managed-ui-only'}});
  await tick();await tick();
  assert.equal(f.find('script-result-kind').textContent,'上次结果已失效');
  assert.equal(f.find('script-copy-result').disabled,true);
  await f.click('script-read');assert.equal(f.find('script-copy-result').disabled,true);
});

test('reopening the editor restores window-scoped source and params without starting or saving',async t=>{
  const values={};
  const storage={get:async key=>({[key]:structuredClone(values[key])}),set:async next=>Object.assign(values,structuredClone(next))};
  const first=await fixture(undefined,storage);
  first.find('script-source').value='async function main() { return "unsaved reopen"; }';
  first.find('script-source').fire('input');
  first.find('script-params').value='{"value":42}';first.find('script-params').fire('input');
  await tick();first.dispose();
  const second=await fixture(undefined,storage);t.after(()=>second.dispose());
  assert.equal(second.find('script-source').value,'async function main() { return "unsaved reopen"; }');
  assert.equal(second.find('script-params').value,'{"value":42}');
  assert.equal(second.permissions.length,0);assert.equal(second.starts.length,0);assert.equal(second.commits.length,0);
  assert.equal(second.editor.host.currentRun,null);
});

test('another window draft and the catalog editor never replace the Sidebar draft',async t=>{
  const other={source:'other window source',params:'{}',id:'other',revision:''};
  const values={'opendesk.sidebar.editor-draft.v1:8':other};let reads=0,writes=0;
  const storage={get:async key=>{reads++;return {[key]:structuredClone(values[key])};},
    set:async next=>{writes++;Object.assign(values,structuredClone(next));}};
  const sidebar=await fixture(undefined,storage);t.after(()=>sidebar.dispose());
  assert.equal(sidebar.find('script-source').value,'return params.value;');
  assert.deepEqual(values['opendesk.sidebar.editor-draft.v1:8'],other);
  const before={reads,writes};
  const catalog=await fixture(undefined,storage,{contextTabId:99});t.after(()=>catalog.dispose());
  catalog.editor.importDraft('async function main() { return "catalog"; }');await tick();
  assert.deepEqual({reads,writes},before,'catalog never reads or writes the Sidebar draft key');
});

test('reopening a project draft preserves the source view and compiled execution bytes',async t=>{
  const {programDraft}=await import('../fixtures/program-draft.mjs');
  const draft=await programDraft(),values={};
  const storage={get:async key=>({[key]:structuredClone(values[key])}),
    set:async next=>Object.assign(values,structuredClone(next))};
  const first=await fixture(undefined,storage);
  await first.editor.importDraft(draft);
  first.find('script-params').value='{"value":42}';first.find('script-params').fire('input');
  await tick();first.dispose();
  const second=await fixture(undefined,storage);t.after(()=>second.dispose());
  for(let i=0;i<50&&!second.find('script-source').readOnly;i++)await tick();
  assert.equal(second.find('script-source').readOnly,true);
  assert.equal(second.find('script-source').value,draft.sourceUtf8);
  assert.equal(second.editor.executionSource(),draft.sourceUtf8);
  assert.equal(second.find('script-params').value,'{"value":42}');
  assert.equal(second.starts.length,0);assert.equal(second.permissions.length,0);
  await second.click('script-save');
  assert.equal(second.persisted.scripts[0].sourceUtf8,draft.sourceUtf8);
  assert.equal(second.persisted.scripts[0].contentHash,draft.build.sourceHash);
});

test('a delayed draft restore never overwrites newly imported source',async t=>{
  const gate=deferred(),values={};
  const storage={get:async key=>{await gate.promise;return {[key]:{source:'old stored source',params:'{}',id:'old',revision:''}};},
    set:async next=>Object.assign(values,structuredClone(next))};
  const f=await fixture(undefined,storage);t.after(()=>f.dispose());
  f.editor.importDraft('async function main() { return "new import"; }');gate.resolve();await tick();await tick();
  assert.equal(f.find('script-source').value,'async function main() { return "new import"; }');
  assert.equal(Object.values(values)[0].source,f.find('script-source').value);
  assert.equal(f.permissions.length,0);assert.equal(f.starts.length,0);
});

test('importing a JS draft leaves saved versions and running source independent',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  await f.click('script-save');
  const source='async function main() { return "imported B"; }';
  f.editor.importDraft(source);
  assert.match(f.find('script-id').value,/^import-/);
  assert.equal(f.find('script-revision').value,'');
  assert.equal(f.find('script-source').value,source);
  assert.equal(f.persisted.scripts.length,1);
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  await f.click('script-run');
  f.editor.importDraft('async function main() { return "imported C"; }');
  assert.equal(f.starts.length,1);
  assert.equal(f.starts[0].source.sourceUtf8,source);
  assert.equal(f.persisted.scripts.length,1);
  await f.finish('imported B');
});

test('draft import rejects empty/oversized sources and active saves without overwriting the editor',async t=>{
  const f=await fixture();t.after(()=>f.dispose());const before=f.find('script-source').value;
  for(const value of ['',null,'中'.repeat(33334)])assert.throws(()=>f.editor.importDraft(value),error=>error.code==='E_LIMIT');
  assert.equal(f.find('script-source').value,before);
  const gate=deferred();f.setSaveGate(gate);await f.click('script-save');
  assert.throws(()=>f.editor.importDraft('async function main() {}'),error=>error.code==='E_BUSY');
  assert.equal(f.find('script-source').value,before);gate.resolve();await tick();
});

test('imported Classic @require inspects per-program grants without any implicit download, approval or run',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const source='// ==UserScript==\n// @require https://cdn.example/library.js\n// ==/UserScript==\nasync function main(){return document.title;}';
  f.editor.importDraft(source);await tick();
  assert.deepEqual(f.dependencyInspections,[{sourceUtf8:source,entryFormat:'async-main',programId:f.find('script-id').value}]);
  assert.equal(f.find('page-dependency-add'),undefined);
  assert.equal(f.find('page-preview-entry'),undefined);
  await f.click('page-preview-run');
  assert.match(f.find('page-preview-status').textContent,/E_DEPENDENCY_UNLOCKED/);
  assert.equal(f.permissions.length,0,'missing approval never triggers a site or CDN permission prompt');
  f.editor.importDraft('async function main(){return 1;}');await tick();
  assert.equal(f.find('page-preview-run').disabled,false);
  assert.equal(f.permissions.length,0);assert.equal(f.starts.length,0);
  assert.equal(f.previews.length,0);assert.equal(f.persisted.scripts.length,0);
});

test('Save persists revision/hash without requesting permission, creating a Run, or executing code',async t=>{
  const f=await fixture();t.after(()=>f.dispose());await f.click('script-save');
  assert.equal(f.persisted.scripts[0].revision,1);assert.match(f.persisted.scripts[0].contentHash,/^[a-f0-9]{64}$/);
  assert.equal(f.find('script-list').children.some(row=>row.value==='my-script'),true);
  assert.equal(f.permissions.length,0);assert.equal(f.starts.length,0);assert.equal(f.executions.length,0);
  f.find('script-source').value='unsaved changes';f.find('script-source').fire('input');await tick();assert.match(f.find('script-version').textContent,/存在未保存修改/);
});

test('reopened editor lists saved scripts without running and loads the selected latest head explicitly',async t=>{
  const contentHash=createHash('sha256').update('return "saved";').digest('hex');
  const f=await fixture({scripts:[{scriptId:'saved-script',revision:1,sourceUtf8:'return "saved";',contentHash}],runs:[],results:[]});
  t.after(()=>f.dispose());await tick();
  assert.equal(f.starts.length,0);assert.equal(f.executions.length,0);assert.equal(f.permissions.length,0);
  assert.equal(f.find('script-source').value,'return params.value;');
  assert.equal(f.find('script-list').children.some(row=>row.value==='saved-script'),true);
  f.find('script-list').value='saved-script';await f.click('script-list-load');
  assert.equal(f.find('script-id').value,'saved-script');assert.equal(f.find('script-revision').value,'1');
  assert.equal(f.find('script-source').value,'return "saved";');assert.match(f.find('script-version').textContent,/r1/);
});

test('loading a historical revision does not turn it into the latest Save CAS head',async t=>{
  const r1={scriptId:'my-script',revision:1,sourceUtf8:'return 1;',contentHash:createHash('sha256').update('return 1;').digest('hex')};
  const r2={scriptId:'my-script',revision:2,sourceUtf8:'return 2;',contentHash:createHash('sha256').update('return 2;').digest('hex')};
  const f=await fixture({scripts:[r1,r2],runs:[],results:[]});t.after(()=>f.dispose());await tick();
  f.find('script-revision').value='1';await f.click('script-load');
  assert.equal(f.find('script-source').value,'return 1;');
  f.find('script-source').value='return 3;';f.find('script-source').fire('input');await f.click('script-save');
  assert.equal(f.commits.at(-1).expectedRevision,2);
  assert.equal(f.persisted.scripts.at(-1).revision,3);
});

test('Delete tombstones the latest head and refreshes the saved-script selector',async t=>{
  const contentHash=createHash('sha256').update('return "saved";').digest('hex');
  const f=await fixture({scripts:[{scriptId:'my-script',revision:1,sourceUtf8:'return "saved";',contentHash}],runs:[],results:[]});
  t.after(()=>f.dispose());await tick();await f.click('script-load');await f.click('script-delete');
  assert.equal(f.persisted.scripts[0].tombstoned,true);
  assert.equal(f.find('script-list').children.some(row=>row.value==='my-script'),false);
});

test('saved A stays immutable; Run freezes unsaved B/params/page A; editing C and Save do not replace B',async t=>{
  const f=await fixture();t.after(()=>f.dispose());await f.click('script-save');const r1=f.persisted.scripts[0];
  const b='return {draft:"B"};', c='return {draft:"C"};';
  const bHash=createHash('sha256').update(b).digest('hex');
  f.find('script-source').value=b;f.find('script-source').fire('input');await f.click('script-run');
  assert.equal(f.traces[0],'permission-check');
  assert.deepEqual(f.starts[0].source,{kind:'draft',sourceUtf8:b});
  assert.equal(f.starts[0].scriptId,undefined);assert.equal(f.persisted.scripts.length,1);
  assert.equal(f.starts[0].target.documentId,'doc-11');assert.equal(f.starts[0].target.expectedUrl,'https://a.example/');
  assert.deepEqual(f.executions,[{source:b,params:{value:1}}]);
  await f.switchTab();assert.equal(f.find('script-current-page-title').textContent,'B');assert.match(f.find('script-running-target').textContent,/a\.example/);
  f.find('script-source').value=c;f.find('script-source').fire('input');
  await f.click('script-save');assert.equal(f.persisted.scripts.length,2);assert.equal(f.persisted.scripts[1].revision,2);
  assert.equal(f.persisted.scripts[0].sourceUtf8,r1.sourceUtf8);assert.equal(f.persisted.scripts[1].sourceUtf8,c);
  assert.match(f.find('script-task-version').textContent,/草稿快照/);
  f.find('script-id').value='another-script';f.find('script-params').value='{"value":777}';f.find('script-run-id').value='run-decoy';
  await f.finish(false);assert.equal(f.starts.length,1);assert.equal(f.persisted.results[0].revision.sourceHash,bHash);
  assert.equal(f.find('script-result').textContent,'false','only the actual decoded value is the default result');
  assert.equal(f.find('developer-results-panel').open,true,'completed own draft opens Results without crowding initial editor');
  assert.doesNotMatch(f.find('script-result').textContent,/run-decoy/);assert.equal(f.find('script-run-id').value,'run-1');
  assert(!f.snapshots.some(row=>row.runId==='run-decoy'));assert.match(f.find('script-history').textContent,/result-run-1/);
});


test('a brand-new unsaved draft runs with an empty script ID and never creates a saved revision',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  f.find('script-id').value='';
  f.find('script-source').value='return {newDraft:true};';
  f.find('script-source').fire('input');
  await f.click('script-run');
  assert.equal(f.starts.length,1);assert.equal(f.starts[0].source.kind,'draft');
  assert.equal(f.starts[0].scriptId,undefined);
  assert.deepEqual(f.executions,[{source:'return {newDraft:true};',params:{value:1}}]);
  assert.equal(f.persisted.scripts.length,0);
  await f.finish({newDraft:true});
  assert.equal(f.persisted.scripts.length,0);
  assert.equal(f.persisted.results[0].sourceKind,'draft');
});

test('permission preparation rejects a switched page; closing the editor during permission never admits a run',async t=>{
  for(const close of [false,true]) {
    const f=await fixture();t.after(()=>f.dispose());const permission=deferred();f.setPermission(permission.promise);await f.click('script-save');await f.click('script-run');
    if(close)f.dispose();else await f.switchTab();permission.resolve(true);await tick();await tick();
    assert.equal(f.starts.length,0);assert.equal(f.executions.length,0);if(!close)assert.match(f.find('script-status').textContent,/E_DOCUMENT_STALE/);
  }
});

test('shared RunHost completion or Stop restores the draft Run button after another consumer settles',async t=>{
  for (const stop of [false,true]) {
    const f=await fixture();t.after(()=>f.dispose());
    assert.equal(f.find('script-run').disabled,false);
    const claim=await f.editor.host.start({source:{kind:'draft',sourceUtf8:'return params.value;'},
      params:{value:7},target:{mode:'borrowed',tabId:11,frameId:0,documentId:'doc-11',expectedUrl:'https://a.example/'},
      deadlineAt:Date.now()+30000});
    await tick();
    assert.equal(f.find('script-run').disabled,true);
    if(stop){await f.editor.host.stop({runId:claim.runId,controller:true});await f.editor.host.completion;await tick();}
    else await f.finish(7);
    assert.equal(f.persisted.runs[0].retirementState,'released');
    assert.equal(f.editor.host.currentRun,null);
    assert.equal(f.find('script-run').disabled,false,'a settled task must not leave the editor disabled');
  }
});

test('Stop uses the formal RunHost abort/retirement path and persists stopped with the original pin',async t=>{
  const f=await fixture();t.after(()=>f.dispose());await f.click('script-save');await f.click('script-run');
  f.find('script-run-id').value='run-decoy';await f.click('script-stop');await f.editor.host.completion;await tick();
  assert.equal(f.persisted.results[0].state,'stopped');assert.equal(f.persisted.runs[0].retirementState,'released');
  assert(f.traces.indexOf('local-stop')<f.traces.findIndex(row=>Array.isArray(row)&&row[0]==='durable-stop'));
  assert.match(f.find('script-task-status').textContent,/已停止/);
});

test('pagehide invokes RunHost host-close; reopened editor only reads the durable interrupted Result',async t=>{
  const f=await fixture();await f.click('script-save');await f.click('script-run');f.view.fire('pagehide');f.dispose();await f.editor.host.completion;
  assert(f.traces.includes('local-close'));assert(f.traces.some(row=>Array.isArray(row)&&row[1]==='E_HOST_CLOSED'));
  assert.equal(f.persisted.results[0].state,'interrupted');assert.equal(f.persisted.runs[0].retirementState,'released');
  const reopened=await fixture(f.persisted);t.after(()=>reopened.dispose());assert.equal(reopened.starts.length,0);assert.equal(reopened.executions.length,0);
  assert.match(reopened.find('script-history').textContent,/interrupted/);assert.doesNotMatch(reopened.find('script-result').textContent,/result-run-1/);
});

test('late Save/Load replies do not overwrite another script selection or edits made during loading',async t=>{
  const f=await fixture();t.after(()=>f.dispose());const save=deferred();f.setSaveGate(save);await f.click('script-save');
  f.find('script-id').value='another-script';f.find('script-id').fire('input');save.resolve();await tick();
  assert.equal(f.find('script-revision').value,'');assert.match(f.find('script-version').textContent,/未保存草稿可直接运行/);
  f.find('script-id').value='my-script';const load=deferred();f.setLoadGate(load);await f.click('script-load');
  f.find('script-source').value='new edit while loading';load.resolve();await tick();
  assert.equal(f.find('script-source').value,'new edit while loading');assert.match(f.find('script-status').textContent,/E_REVISION/);
});

test('late saved-script selector load cannot overwrite edits made during loading',async t=>{
  const contentHash=createHash('sha256').update('return "saved";').digest('hex');
  const f=await fixture({scripts:[{scriptId:'saved-script',revision:1,sourceUtf8:'return "saved";',contentHash}],runs:[],results:[]});
  t.after(()=>f.dispose());await tick();const load=deferred();f.setLoadGate(load);
  f.find('script-list').value='saved-script';await f.click('script-list-load');
  f.find('script-id').value='manual-edit';f.find('script-id').fire('input');load.resolve();await tick();
  assert.equal(f.find('script-id').value,'manual-edit');
  assert.equal(f.find('script-source').value,'return params.value;');
  assert.match(f.find('script-status').textContent,/E_REVISION/);
});

test('an older snapshot reply cannot disable Run after a newer durable observation',async t=>{
  const f=await fixture();t.after(()=>f.dispose());await f.click('script-save');const old=deferred();
  const snapshot=f.editor.host.controller.snapshotControllerRun;let first=true;
  f.editor.host.controller.snapshotControllerRun=async request=>{if(first){first=false;return old.promise;}return snapshot(request);};
  await f.click('script-read-run');await f.click('script-read');
  old.resolve({run:null,runs:[],results:[],downloads:[],resultDeliveryDenied:[],slotAvailable:false});await tick();
  assert.equal(f.find('script-run').disabled,false);
});

test('an older snapshot error cannot overwrite a newer successful durable view',async t=>{
  const f=await fixture();t.after(()=>f.dispose());await f.click('script-save');const old=deferred();
  const snapshot=f.editor.host.controller.snapshotControllerRun;let first=true;
  f.editor.host.controller.snapshotControllerRun=async request=>{if(first){first=false;await old.promise;throw {code:'E_TRANSPORT',message:'old reply'};}return snapshot(request);};
  await f.click('script-read-run');await f.click('script-read');old.resolve();await tick();
  assert.equal(f.find('script-status').dataset.state,'results');assert.equal(f.find('script-run').disabled,false);
});

test('Run silently checks Chrome permission; denied permission and invalid params never request or execute',async t=>{
  const f=await fixture();t.after(()=>f.dispose());await f.click('script-save');const permission=deferred();f.setPermission(permission.promise);
  f.find('script-run').fire('click',{isTrusted:true});assert.equal(f.permissions.length,0);assert.equal(f.starts.length,0);
  permission.resolve(false);await tick();await tick();assert.match(f.find('script-status').textContent,/E_PERMISSION/);assert.equal(f.starts.length,0);
  f.find('script-params').value='invalid json';await f.click('script-run');assert.equal(f.permissions.length,0);assert.equal(f.executions.length,0);
});

test('R24.3 browser component help follows official syntax, never demands main() from JSX/SFC',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  assert.equal(f.find('page-preview-mode-title').textContent,'网页 JavaScript 试运行');
  for(const [mode,expected] of [['react',/React.*JSX/],['vue',/Vue.*SFC/]]){
    const choice=f.find('page-component-'+mode);
    choice.checked=true;choice.fire('change');await tick();
    assert.match(f.find('page-preview-mode-title').textContent,expected);
    assert.match(f.find('page-preview-mode-hint').textContent,/无需 main\(\)/);
    assert.match(f.find('page-component-hint').textContent,/不会自动运行|明确点击运行才操作网页/);
  }
  const choice=f.find('page-component-javascript');
  choice.checked=true;choice.fire('change');await tick();
  assert.equal(f.find('page-preview-mode-title').textContent,'网页 JavaScript 试运行');
});

test('R24.3 final asynchronous document check refuses a React component edited before admission',async t=>{
  const release=deferred(),entered=deferred();
  let revalidationCount=0;
  const f=await fixture(undefined,undefined,{
    componentPreparerFactory:()=>({
      async prepare({framework,projectId}){
        return {sourceUtf8:'// @opendesk-lib '+framework+'\nasync function main(){}',
          entryFormat:'async-main',sourceHash:'a'.repeat(64),framework,projectId,
          compilerVersion:'7.29.9',cacheHit:false,prepareMs:1};
      },
      cancel(){},dispose(){}
    }),
    wrapTarget:original=>Object.freeze({
      ...original,
      // The real currentPageTarget is frozen; a Proxy cannot replace its
      // non-configurable revalidate property. Create a separate test facade.
      revalidate:async captured=>{
        revalidationCount++;
        if(revalidationCount===2){entered.resolve();await release.promise;}
        return original.revalidate(captured);
      },
      get snapshot(){return original.snapshot;},
      get windowId(){return original.windowId;}
    })
  });
  t.after(()=>{release.resolve();f.dispose();});
  const radio=f.find('page-component-react');
  radio.checked=true;radio.fire('change');await tick();
  const first=f.find('script-source').value;
  assert.match(first,/from 'react'/);
  f.find('page-preview-run').fire('click',{isTrusted:true});
  const reached=await Promise.race([entered.promise.then(()=>true),
    new Promise(resolve=>setTimeout(()=>resolve(false),1200))]);
  assert.equal(reached,true,'Component did not reach the final async document fence; checks='+
    revalidationCount+' previewStatus='+f.find('page-preview-status').textContent+
    ' componentStatus='+f.find('page-component-status').textContent);
  f.find('script-source').value=first+'\n// user edited while Chrome checked the document';
  f.find('script-source').fire('input');
  release.resolve();
  await tick();await tick();
  assert.equal(revalidationCount,2);
  assert.equal(f.previews.length,0,'stale compiled bytes must never reach the existing Page executor');
  assert.equal(f.find('page-preview-status').dataset.state,'error');
  assert.match(f.find('page-preview-status').textContent,/E_PAGE_COMPILER_STALE/);
  assert.equal(f.find('page-preview-run').disabled,false,'new source can be explicitly run after stale admission rejected');
});

test('DOM preview binds frozen plain JavaScript and exact current document from trusted click',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const pending=deferred();f.setPermission(pending.promise);
  const source='async function main(){document.title="frozen";return document.title;}';
  f.find('script-source').value=source;
  f.find('page-preview-run').fire('click',{isTrusted:false});
  assert.equal(f.permissions.length,0,'untrusted event must never open a permission prompt');
  f.find('page-preview-run').fire('click',{isTrusted:true});
  assert.equal(f.permissions.length,0,'trusted Run also never requests website permission');
  assert.equal(f.permissionChecks.length,1,'permission is checked before admission');
  f.find('script-source').value='async function main(){return "modified";}';
  assert.equal(f.find('page-preview-run').disabled,true,'no overlapping user-script preview while permission is pending');
  assert.equal(f.find('script-run').disabled,true,'do not start Controller while page preview is pending');
  f.find('script-run').fire('click',{isTrusted:true});
  assert.equal(f.starts.length,0,'trusted click must not start Controller while preview is pending');
  pending.resolve(true);
  await tick();await tick();
  assert.equal(f.previews.length,1);
  assert.equal(f.previews[0].sourceUtf8,source);
  assert.equal(f.previews[0].entryFormat,'async-main');
  assert.equal(f.previews[0].lockId,null);
  assert.deepEqual(f.previews[0].target,{tabId:11,frameId:0,documentId:'doc-11',
    expectedUrl:'https://a.example/',expectedWindowId:7});
  const previewStatus=f.find('page-preview-status').textContent;
  assert.match(previewStatus,/待验证/);
  assert.match(previewStatus,/不会自动安装/);
  assert.equal(f.starts.length,0,'preview must not create a Controller Run');
  assert.equal(f.commits.length,0,'preview must not Save a revision');
});

test('DOM preview refuses to inject when the active document changes while permission is pending',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const pending=deferred();f.setPermission(pending.promise);
  f.find('script-source').value='async function main(){return document.title;}';
  f.find('page-preview-run').fire('click',{isTrusted:true});
  await f.switchTab();
  pending.resolve(true);
  await tick();await tick();
  assert.equal(f.previews.length,0,'stale document cannot be sent to the Broker');
  assert.match(f.find('page-preview-status').textContent,/E_DOCUMENT_STALE/);
});

test('Developer Stop cannot cancel the formal Task or another view using the shared RunHost',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const selected=f.target.capture();
  const claim=await f.editor.host.start({source:{kind:'draft',sourceUtf8:'return "other view";'},
    params:{value:1},target:{mode:'borrowed',tabId:selected.tabId,frameId:0,
      documentId:selected.documentId,expectedUrl:selected.url,expectedWindowId:selected.windowId}});
  assert.equal(typeof claim.runId,'string');
  assert.equal(f.find('script-stop').disabled,true,'this editor has not admitted that run');
  f.find('script-stop').fire('click',{isTrusted:true});
  await tick();
  assert.equal(f.traces.some(row=>Array.isArray(row)&&row[0]==='durable-stop'),false);
  assert.equal(f.editor.host.currentRun,claim.runId,'foreign run must remain active');
  await f.finish({ok:true});
});

test('project import displays source while Save and Run freeze compiled bytes and the original hash',async t=>{
  const {programDraft}=await import('../fixtures/program-draft.mjs');
  const f=await fixture();t.after(()=>f.dispose());const draft=await programDraft();
  await f.editor.importDraft(draft);
  assert.equal(f.find('script-source').readOnly,true);
  assert.equal(f.find('script-source').value,draft.sourceUtf8);
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  await f.click('script-save');
  assert.equal(f.persisted.scripts[0].sourceUtf8,draft.sourceUtf8);
  assert.equal(f.persisted.scripts[0].contentHash,draft.build.sourceHash);
  await f.click('script-run');
  assert.equal(f.starts[0].source.sourceUtf8,draft.sourceUtf8);
  assert.equal(f.persisted.runs[0].revision.sourceHash,draft.build.sourceHash);
  await f.finish(42);
  await f.click('script-load');
  assert.equal(f.find('script-source').value,draft.sourceUtf8);
});

test('invalid project envelope leaves the previous editor source and no execution or saved revision',async t=>{
  const {programDraft}=await import('../fixtures/program-draft.mjs');
  const f=await fixture();t.after(()=>f.dispose());const before=f.find('script-source').value;
  const draft=await programDraft();draft.build.sourceHash='0'.repeat(64);
  await assert.rejects(f.editor.importDraft(draft),error=>error.code==='E_PROGRAM_HASH');
  assert.equal(f.find('script-source').value,before);assert.equal(f.starts.length,0);assert.equal(f.persisted.scripts.length,0);
});


test('R12: real Page preview gates explicit immutable Candidate import, never auto installs',async t=>{
  const fx=await fixture();t.after(()=>fx.dispose());
  const requests=[],originalRequest=fx.client.request.bind(fx.client);
  fx.client.request=(type,payload)=>{
    if(type==='listPagePrograms')return Promise.resolve({catalog:[],installed:[]});
    if(type==='importPageCandidate'){
      requests.push(structuredClone(payload));
      return Promise.resolve({stage:'Candidate',candidateId:'page-'+'0'.repeat(64),manifestHash:'f'.repeat(64)});
    }
    return originalRequest(type,payload);
  };
  const source='async function main(){document.title="candidate";return document.title;}';
  fx.find('script-source').value=source;fx.find('script-source').fire('input');
  assert.equal(fx.find('page-candidate-save').disabled,true,'not available before native preview success');
  fx.find('page-candidate-save').fire('click',{isTrusted:true});await tick();
  assert.equal(requests.length,0,'cannot import Candidate without proof of preview');
  await fx.click('page-preview-run');await tick();
  assert.equal(fx.previews.length,1);
  assert.equal(fx.find('page-candidate-save').disabled,false);
  fx.find('page-candidate-save').fire('click',{isTrusted:false});await tick();
  assert.equal(requests.length,0,'only deliberate trusted save can import');
  await fx.click('page-candidate-save');
  assert.equal(requests.length,1);
  const frozen=requests[0];
  assert.equal(frozen.programId,'my-script');assert.equal(frozen.revision,1);
  assert.equal(frozen.entryFormat,'async-main');assert.equal(frozen.lockId,null);
  assert.equal(frozen.importSourceUrl,null);
  assert.equal(frozen.sourceUtf8,source,'native source is preserved without adding compatibility metadata');
  // Source-only candidates default only to the preview's scheme and host.
  // This remains a Candidate; explicit install authorization is still required.
  assert.deepEqual(frozen.pageRules,{matches:['https://a.example/*'],excludeMatches:[],
    runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'});
  assert.equal(Object.hasOwn(frozen,'capabilities'),false,'scheduling settings do not grant privileged services');
  assert.match(fx.find('page-candidate-status').textContent,/源码保持原样/);
  assert.match(fx.find('page-candidate-status').textContent,/验证冻结版本，再明确安装/);
  assert.equal(fx.commits.length,0,'must not save a Controller revision');
  assert.equal(fx.starts.length,0,'must not initiate Controller run or Page install');
  fx.find('script-source').value=source+'// edit';fx.find('script-source').fire('input');await tick();
  assert.equal(fx.find('page-candidate-save').disabled,true,
    'modified source invalidates successful preview: '+JSON.stringify({current:fx.find('script-source').value,last:source,sourceMismatch:fx.find('script-source').value!==source}));
  fx.find('page-candidate-save').fire('click',{isTrusted:true});await tick();
  assert.equal(requests.length,1,'stale source cannot be imported');
});

test('R12: navigating the actual page or a rejected preview cannot save a Page Candidate',async t=>{
  const fx=await fixture();t.after(()=>fx.dispose());
  const source='async function main(){return document.title;}';
  fx.find('script-source').value=source;fx.find('script-source').fire('input');
  await fx.click('page-preview-run');await tick();
  assert.equal(fx.find('page-candidate-save').disabled,false);
  const imports=[];
  const original=fx.client.request.bind(fx.client);
  fx.client.request=async(type,payload)=>{if(type==='importPageCandidate'){imports.push(payload);return {stage:'Candidate',candidateId:'candidate',manifestHash:'f'.repeat(64)};}return original(type,payload);};
  await fx.switchTab();
  assert.equal(fx.find('page-candidate-save').disabled,true,'different tab is not the same frozen document');
  fx.find('page-candidate-save').fire('click',{isTrusted:true});await tick();
  assert.equal(imports.length,0,'revalidation must precede Broker call');
  assert.match(fx.find('page-candidate-status').textContent,/E_DOCUMENT_STALE/);
  fx.client.request=async(type,payload)=>{
    if(type==='previewPageScript')throw {code:'E_PAGE_SCRIPT_EXECUTION',message:'source failed'};
    return original(type,payload);
  };
  await fx.click('page-preview-run');await tick();
  assert.equal(fx.find('page-candidate-save').disabled,true,'failure must not reactivate last successful preview');
});

test('denied results never populate visible values, technical history or download choices',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const revision={scriptId:'draft:private',revision:1,sourceHash:'a'.repeat(64)};
  const run={runId:'run-private',state:'completed',sourceKind:'draft',revision,retirementState:'released'};
  const result={runId:'run-private',resultId:'result-private',state:'completed',sourceKind:'draft',revision,
    outcome:{ok:true,valueWire:encodeValue('SENSITIVE-HTML')}};
  f.editor.host.controller.snapshotControllerRun=async()=>({run,runs:[run],results:[result],downloads:[],
    resultDeliveryDenied:['run-private'],slotAvailable:true});
  await f.click('script-read');
  assert.match(f.find('script-result').textContent,/无权查看/);
  assert.doesNotMatch(f.find('script-result').textContent,/SENSITIVE-HTML/);
  assert.equal(f.find('script-download').disabled,true);
  assert(!f.find('script-download-result').children.some(row=>row.value==='result-private'));
  assert.doesNotMatch(f.find('script-history').textContent,/SENSITIVE-HTML/);
});

test('failed HTML content read displays actionable advice, not the internal controller envelope',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const revision={scriptId:'draft:failed',revision:1,sourceHash:'b'.repeat(64)};
  const run={runId:'run-failed',state:'failed',sourceKind:'draft',revision};
  const result={runId:'run-failed',resultId:'result-failed',state:'failed',sourceKind:'draft',revision,
    outcome:{ok:false,error:{code:'E_PAGE_CONTENT_TOO_LARGE',message:'HTML exceeds the 8 MiB snapshot budget'}}};
  f.editor.host.controller.snapshotControllerRun=async()=>({run,runs:[run],results:[result],downloads:[],
    resultDeliveryDenied:[],slotAvailable:true});
  await f.click('script-read');
  assert.match(f.find('script-result').textContent,/8 MiB/);
  assert.doesNotMatch(f.find('script-result').textContent,/resultId|sourceHash|result-failed/);
});

test('a failed evaluate surfaces Chrome settings and read-only recovery without replaying a run', async t => {
  const f=await fixture();t.after(()=>f.dispose());
  const id='a'.repeat(32),urls=[];
  f.api.runtime.id=id;
  f.api.tabs.create=async request=>{urls.push(request.url);return {id:99};};
  let enabled=false,probes=0;
  f.api.userScripts={getScripts:async()=>{probes++;if(!enabled)throw Error('disabled');return [];},execute:()=>assert.fail('UI check cannot execute scripts')};
  const revision={scriptId:'draft:unavailable',revision:1,sourceHash:'c'.repeat(64)};
  const run={runId:'run-unavailable',state:'failed',sourceKind:'draft',revision};
  const result={runId:run.runId,resultId:'result-unavailable',state:'failed',sourceKind:'draft',revision,
    outcome:{ok:false,error:{code:'E_USER_SCRIPTS_UNAVAILABLE',message:'E_USER_SCRIPTS_UNAVAILABLE'}}};
  f.editor.host.controller.snapshotControllerRun=async()=>({run,runs:[run],results:[result],downloads:[],
    resultDeliveryDenied:[],slotAvailable:true});
  await f.click('script-read');
  assert.equal(f.find('script-user-scripts-recovery').hidden,false);
  assert.match(f.find('script-result').textContent,/允许用户脚本/);
  f.find('script-user-scripts-settings').fire('click',{isTrusted:false});await tick();
  assert.equal(urls.length,0,'untrusted event cannot navigate');
  await f.click('script-user-scripts-settings');
  assert.deepEqual(urls,['chrome://extensions/?id='+id]);
  await f.click('script-user-scripts-check');await tick();
  assert.equal(f.find('script-user-scripts-recovery').dataset.state,'blocked');
  enabled=true;
  await f.click('script-user-scripts-check');await tick();
  assert.equal(f.find('script-user-scripts-recovery').dataset.state,'available');
  assert.match(f.find('script-user-scripts-recovery-status').textContent,/主动点击/);
  assert.equal(probes,2);
  assert.equal(f.starts.length,0);
  assert.equal(f.executions.length,0);
  assert.equal(f.permissions.length,0);
});

test('R17 accepts 32 scoped sources with same-name directories but rejects an unbounded catalog',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  let count=32;
  const rows=()=>Array.from({length:count},(_,n)=>({
    name:n<2?'同名目录':'项目-'+n,
    bindingId:'local-'+n.toString(16).padStart(20,'0'),
    sourceId:'source-'+n.toString(16).padStart(24,'0'),
    runtimeKind:'controller'
  }));
  f.client.requestLocalProject=async method=>method==='status'?
    {connected:true,providerEpoch:'r17-aggregate'}:method==='projects.list'?
    {providerEpoch:'r17-aggregate',projects:rows()}:
    assert.fail('project.resolve must require an explicit run');
  f.editor.connectLocalProjects({});
  f.find('local-project-mode').checked=true;f.find('local-project-mode').fire('change');await tick();
  const select=f.find('local-project-select');
  assert.equal(select.children.length,33);
  assert.notEqual(select.children[1].textContent,select.children[2].textContent,
    'same basename is disambiguated by source identity rather than merged');
  assert.equal(f.find('local-project-status').dataset.state,'selection-needed');
  assert.equal(f.starts.length,0);
  count=33;
  f.find('local-project-refresh').fire('click',{isTrusted:true});await tick();
  assert.equal(f.find('local-project-status').dataset.state,'disconnected');
  assert.equal(select.children.length,1,'invalid list must not retain stale online projects');
});

test('R24.3 React and Vue modes keep independent official source drafts without Native',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const group=f.find('page-component-framework');
  const react=f.find('page-component-react');
  const vue=f.find('page-component-vue');
  const javascriptRadio=f.find('page-component-javascript');
  const editor=f.find('script-source');
  const javascript=editor.value;
  assert.equal(group.disabled,false);
  react.checked=true;react.fire('change');await tick();
  assert.equal(react.checked,true);
  assert.equal(javascriptRadio.checked,false);
  assert.match(editor.value,/from 'react'/);
  assert.match(editor.value,/export default function App/);
  assert.match(f.find('page-component-status').textContent,/官方组件源码/);
  const reactDraft=editor.value+'\n// unsaved react';
  editor.value=reactDraft;editor.fire('input');await tick();
  vue.checked=true;vue.fire('change');await tick();
  assert.equal(vue.checked,true);
  assert.equal(react.checked,false);
  assert.match(editor.value,/<script setup>/);
  assert.match(editor.value,/<style scoped>/);
  javascriptRadio.checked=true;javascriptRadio.fire('change');await tick();
  assert.equal(editor.value,javascript,'Legacy JavaScript must not be overwritten by components');
  react.checked=true;react.fire('change');await tick();
  assert.equal(editor.value,reactDraft,'Switch must recover exact unsaved React source');
  assert.equal(f.find('script-save').disabled,false,'Components can prepare and save a frozen Page Candidate without running');
  assert.equal(f.find('script-run').disabled,f.find('page-preview-run').disabled,'Component primary run follows page-preview availability');
  assert.equal(f.find('script-run').textContent,'运行 React 组件');
  assert.equal(f.find('page-preview-run').textContent,'运行 React 组件');
  f.click('script-run');await tick();
  assert.equal(f.starts.length,0,'Component source cannot enter Controller RunHost');
});

async function waitForComponentUI(check,label){
  for(let i=0;i<80;i++){
    if(check())return;
    await tick();
  }
  assert.fail(label);
}
function browserComponentFixture(){
  return {prepare:async({framework,projectId})=>({
    framework,projectId,entryFormat:'async-main',
    sourceUtf8:'// @opendesk-lib '+framework+'\nasync function main(){}',
    sourceHash:'a'.repeat(64)
  }),cancel(){},dispose(){}};
}
async function selectBrowserReact(f){
  const input=f.find('page-component-react');
  input.checked=true;input.fire('change');await tick();
  assert.equal(input.checked,true);
  assert.equal(f.find('page-preview-run').textContent,'运行 React 组件');
}
test('R24.3 an outcome-unknown browser component blocks the SAME document, but a genuinely new document permits explicit Run',async t=>{
  const f=await fixture(undefined,undefined,{componentPreparerFactory:browserComponentFixture});
  t.after(()=>f.dispose());
  let dispatched=0;
  const original=f.client.request.bind(f.client);
  f.client.request=async(method,payload)=>{
    if(method==='previewPageScript'){
      dispatched++;
      throw Object.assign(new Error('Browser receipt was lost'),{code:'E_EFFECT_UNKNOWN'});
    }
    return original(method,payload);
  };
  await selectBrowserReact(f);
  await f.click('page-preview-run');
  await waitForComponentUI(()=>f.find('page-preview-status').dataset.state==='error',
    'unknown page effect must be reported');
  assert.match(f.find('page-preview-status').textContent,/E_EFFECT_UNKNOWN/);
  assert.equal(f.find('page-preview-run').disabled,true,'unknown effect fences additional Run');
  f.find('page-component-vue').checked=true;f.find('page-component-vue').fire('change');await tick();
  assert.equal(f.find('page-component-react').checked,true,'framework switch cannot bypass uncertain execution');
  assert.equal(dispatched,1,'no duplicate dispatch after unknown receipt');
  await f.switchTab();
  assert.equal(f.find('page-preview-run').disabled,true,
    'switching tabs does not prove the unknown original document was retired');
  await f.activateTab(11);
  assert.equal(f.find('page-preview-run').disabled,true,
    'returning to the same potentially affected document must stay blocked');
  await f.navigateTab(11);
  await waitForComponentUI(()=>f.find('page-preview-run').disabled===false,
    'only a new document in the original tab can release the uncertain effect');
  assert.match(f.find('page-component-status').textContent,/新网页文档/);
  assert.equal(dispatched,1,'navigation alone must never replay user code');
  await f.click('page-preview-run');
  await waitForComponentUI(()=>dispatched===2,'new document requires a NEW explicit Run');
});
test('R24.3 malformed Page receipt is quarantined and cannot be retried in the same document',async t=>{
  const f=await fixture(undefined,undefined,{componentPreparerFactory:browserComponentFixture});
  t.after(()=>f.dispose());
  let dispatches=0;
  const original=f.client.request.bind(f.client);
  f.client.request=async(method,payload)=>{
    if(method==='previewPageScript'){
      dispatches++;
      return {state:'preview-evaluated',sourceHash:'b'.repeat(64),
        documentId:payload.target.documentId,managedUI:false,
        managedPreviewId:payload.managedUI.previewId};
    }
    return original(method,payload);
  };
  await selectBrowserReact(f);
  await f.click('page-preview-run');
  await waitForComponentUI(()=>f.find('page-preview-status').dataset.state==='error',
    'untrusted Page receipt must be rejected');
  assert.match(f.find('page-preview-status').textContent,/E_PAGE_COMPILER_RECEIPT/);
  assert.equal(f.find('page-preview-run').disabled,true);
  assert.equal(dispatches,1);
  await f.switchTab();
  assert.equal(f.find('page-preview-run').disabled,true,
    'an unrelated tab must not unlock a mismatched receipt');
  await f.activateTab(11);
  assert.equal(f.find('page-preview-run').disabled,true);
  await f.navigateTab(11);
  await waitForComponentUI(()=>f.find('page-preview-run').disabled===false,
    'only the original tab navigating to a new document can release a mismatched receipt');
  assert.equal(dispatches,1,'new document must not auto-run');
});

test('R24.3 switching tabs retains the original confirmed managed preview for a later authentic Stop',async t=>{
  const f=await fixture(undefined,undefined,{componentPreparerFactory:browserComponentFixture});
  t.after(()=>f.dispose());
  const original=f.client.request.bind(f.client);
  const retirements=[];
  f.client.request=async(method,payload)=>{
    if(method==='previewPageScript'){
      f.previews.push(structuredClone(payload));
      return {state:'preview-evaluated',sourceHash:'a'.repeat(64),
        tabId:payload.target.tabId,documentId:payload.target.documentId,managedUI:true,
        managedPreviewId:payload.managedUI.previewId,resultText:'{"ok":true}'};
    }
    if(method==='retirePagePreview'){
      retirements.push(payload.previewId);
      return {state:'preview-retired',previewId:payload.previewId,
        sourceHash:'a'.repeat(64),receipt:{ok:true,scope:'managed-ui-only',instances:1}};
    }
    return original(method,payload);
  };
  await selectBrowserReact(f);
  await f.click('page-preview-run');
  await waitForComponentUI(()=>f.find('page-preview-status').dataset.state==='completed',
    'original Page preview must be confirmed before changing tabs');
  assert.equal(f.previews.length,1);
  const previewId=f.previews[0].managedUI.previewId;
  assert.equal(f.find('script-stop').disabled,false,'original document can Stop');
  await f.switchTab();
  assert.equal(f.find('page-preview-run').disabled,true,
    'a different tab cannot orphan the original live managed UI');
  assert.equal(f.find('script-stop').disabled,true,
    'a different document cannot Stop the original one');
  await f.activateTab(11);
  assert.equal(f.find('script-stop').disabled,false,
    'returning to the owning document restores Stop without losing its identity');
  await f.click('script-stop');
  await waitForComponentUI(()=>f.find('page-component-status').textContent.includes('已停止'),
    'original Stop receipt must be acknowledged');
  assert.deepEqual(retirements,[previewId],
    'Stop uses the original real preview ID, not a new or fabricated ID');
  assert.equal(f.find('page-preview-run').disabled,false,
    'normal explicit Run becomes available after confirmed retirement');
});
test('R24.3 confirmed closure of the owning tab retires the editor ownership without replay',async t=>{
  const f=await fixture(undefined,undefined,{componentPreparerFactory:browserComponentFixture});
  t.after(()=>f.dispose());
  const original=f.client.request.bind(f.client);
  let count=0;
  f.client.request=async(method,payload)=>{
    if(method==='previewPageScript'){
      count++;
      return {state:'preview-evaluated',sourceHash:'a'.repeat(64),
        tabId:payload.target.tabId,documentId:payload.target.documentId,managedUI:true,
        managedPreviewId:payload.managedUI.previewId,resultText:'ok'};
    }
    return original(method,payload);
  };
  await selectBrowserReact(f);
  await f.click('page-preview-run');
  await waitForComponentUI(()=>f.find('page-preview-status').dataset.state==='completed',
    'managed Page ownership was established');
  await f.switchTab();
  assert.equal(f.find('page-preview-run').disabled,true);
  await f.removeTab(11);
  await waitForComponentUI(()=>f.find('page-preview-run').disabled===false,
    'actual tab removal proves the previous document cannot still own the UI');
  assert.equal(count,1,'removal must never auto-dispatch user source');
});

test('R24.3 a confirmed failed component retains exact managed Stop rights',async t=>{
  const f=await fixture(undefined,undefined,{componentPreparerFactory:browserComponentFixture});
  t.after(()=>f.dispose());
  const original=f.client.request.bind(f.client),retired=[];
  let admittedId;
  f.client.request=async(method,payload)=>{
    if(method==='previewPageScript'){
      admittedId=payload.managedUI.previewId;
      throw Object.assign(new Error('Component threw after mount'),{
        code:'E_PAGE_SCRIPT_EXECUTION',response:{
          state:'preview-failed',managedUI:true,managedPreviewId:admittedId,
          sourceHash:'a'.repeat(64),tabId:payload.target.tabId,
          documentId:payload.target.documentId
        }
      });
    }
    if(method==='retirePagePreview'){
      retired.push(payload.previewId);
      return {state:'preview-retired',previewId:payload.previewId,
        sourceHash:'a'.repeat(64),receipt:{ok:true,scope:'managed-ui-only',instances:1}};
    }
    return original(method,payload);
  };
  await selectBrowserReact(f);
  await f.click('page-preview-run');
  await waitForComponentUI(()=>f.find('page-preview-status').dataset.state==='error',
    'confirmed failed component must be reported');
  assert.match(f.find('page-preview-status').textContent,/E_PAGE_SCRIPT_EXECUTION/);
  assert.equal(f.find('script-stop').disabled,false,
    'confirmed managed failure must expose Stop for a partially mounted UI');
  await f.click('script-stop');
  await waitForComponentUI(()=>f.find('page-component-status').textContent.includes('已停止'),
    'failed component must be removable by original Stop');
  assert.deepEqual(retired,[admittedId]);
});
test('R24.3 missing or forged browser results never allow a second same-document dispatch',async t=>{
  for(const malformed of ['null-success','forged-managed-failure']){
    const f=await fixture(undefined,undefined,{componentPreparerFactory:browserComponentFixture});
    t.after(()=>f.dispose());
    let calls=0;
    const original=f.client.request.bind(f.client);
    f.client.request=async(method,payload)=>{
      if(method!=='previewPageScript')return original(method,payload);
      calls++;
      if(malformed==='null-success')return null;
      throw Object.assign(new Error('Bad failed receipt'),{code:'E_PAGE_SCRIPT_EXECUTION',
        response:{state:'preview-failed',managedUI:true,
          managedPreviewId:payload.managedUI.previewId,sourceHash:'b'.repeat(64),
          tabId:payload.target.tabId,documentId:payload.target.documentId}});
    };
    await selectBrowserReact(f);
    await f.click('page-preview-run');
    await waitForComponentUI(()=>f.find('page-preview-status').dataset.state==='error',
      'invalid receipt must not complete');
    assert.equal(f.find('page-preview-run').disabled,true);
    assert.equal(f.find('script-stop').disabled,true,
      'untrusted response cannot authorize a Stop in an unknown world');
    await f.switchTab();
    assert.equal(f.find('page-preview-run').disabled,true,
      'new tab is not proof the original document was retired');
    await f.activateTab(11);
    assert.equal(f.find('page-preview-run').disabled,true);
    assert.equal(calls,1,'no replay after invalid result');
    await f.navigateTab(11);
    await waitForComponentUI(()=>f.find('page-preview-run').disabled===false,
      'only the original document changing can release the quarantine');
  }
});

function browserPageResponses(f){
  const original=f.client.request.bind(f.client),requests=[],hashes=new Map();
  f.client.request=async(method,payload)=>{
    if(['previewPageScript','retirePagePreview','importPageCandidate'].includes(method))requests.push({method,payload:structuredClone(payload)});
    if(method==='listPagePrograms')return {catalog:[],installed:[]};
    if(method==='importPageCandidate')return {stage:'Candidate',candidateId:'fixed-candidate',manifestHash:'f'.repeat(64)};
    if(method==='previewPageScript'){const sourceHash=createHash('sha256').update(payload.sourceUtf8).digest('hex');hashes.set(payload.managedUI.previewId,sourceHash);
      return {state:'preview-evaluated',sourceHash,tabId:payload.target.tabId,documentId:payload.target.documentId,managedUI:true,managedPreviewId:payload.managedUI.previewId};}
    if(method==='retirePagePreview')return {state:'preview-retired',sourceHash:hashes.get(payload.previewId)||createHash('sha256').update('// @opendesk-lib react\nasync function main(){}').digest('hex'),
      receipt:{ok:true,scope:'managed-ui-only',instances:1}};
    return original(method,payload);
  };
  return requests;
}
function honestComponentFixture(){
  const compiler=browserComponentFixture(),original=compiler.prepare;
  compiler.prepare=async input=>{const output=await original(input);output.sourceHash=createHash('sha256').update(output.sourceUtf8).digest('hex');return output;};
  return compiler;
}
async function frozenComponentDraft(v2=false){
  const source="// ==UserScript==\n// @name frozen-react\n// @match https://a.example/*\n// @opendesk-lib react\n// ==/UserScript==\nasync function main(){return {frozen:true}};";
  const file={path:'src/App.jsx',sourceUtf8:"import React from 'react';export default function App(){return <b>frozen</b>}"};
  file.sha256=createHash('sha256').update(file.sourceUtf8).digest('hex');
  let sourceUtf8=source,remoteLock;
  if(v2){
    const {createPageBundle}=await import('../../src/scripting/user-scripts/page-bundle.js');
    const url='https://example.org/frozen/v1/index.js',module={url,sha256:'a'.repeat(64),bytes:200000};
    // Two immutable pins satisfy the existing 128 KiB single-module policy.
    module.bytes=100000;
    const second={url:'https://example.org/frozen/v1/part.js',sha256:'b'.repeat(64),bytes:100000};
    remoteLock={format:'opendesk.remote-lock.v2',profile:'page-library-v1',imports:{},modules:{
      [url]:{sha256:module.sha256,bytes:module.bytes},[second.url]:{sha256:second.sha256,bytes:second.bytes}}};
    sourceUtf8=await createPageBundle(source+'\n/*'+('frozen '.repeat(22000))+'*/',{
      remoteModules:[module,second],remoteImports:[url],remoteLock});
  }
  return {format:v2?'opendesk.program-draft.v2':'opendesk.program-draft.v1',runtimeKind:'page-userscript',
    project:{id:'frozen-react',version:'1.0.0',entry:'src/App.jsx',entryMode:'component'},sourceUtf8,
    build:{mode:'production',sourceHash:createHash('sha256').update(sourceUtf8).digest('hex'),byteLength:Buffer.byteLength(sourceUtf8)},
    authoring:{files:[file],...(v2?{remoteLock}:{})}};
}

test('browser component Save prepares a frozen Candidate with zero Page execution, installation or Controller commit',async t=>{
  const f=await fixture(undefined,undefined,{componentPreparerFactory:honestComponentFixture});t.after(()=>f.dispose());
  const requests=browserPageResponses(f);await selectBrowserReact(f);const source=f.find('script-source').value;
  await f.click('script-save');
  await waitForComponentUI(()=>f.find('page-candidate-status').dataset.state==='saved','prepared component Candidate should save');
  assert.deepEqual(requests.map(row=>row.method),['importPageCandidate']);
  assert.match(requests[0].payload.sourceUtf8,/async function main/);
  assert.notEqual(requests[0].payload.sourceUtf8,source);assert.equal(f.find('script-source').value,source);
  assert.equal(f.starts.length,0);assert.equal(f.commits.length,0);assert.equal(f.permissions.length,0);
  assert.match(f.find('page-component-status').textContent,/尚未进行网页运行验收/);
  await f.click('page-preview-run');
  await waitForComponentUI(()=>f.find('page-preview-status').dataset.state==='completed','explicit Run should receive managed result');
  const dispatch=requests.find(row=>row.method==='previewPageScript');assert.ok(dispatch.payload.managedUI.previewId);
  assert.equal(dispatch.payload.sourceUtf8,requests[0].payload.sourceUtf8);
  await f.click('script-stop');
  await waitForComponentUI(()=>requests.some(row=>row.method==='retirePagePreview'),'Stop should use managed preview');
  assert.equal(requests.find(row=>row.method==='retirePagePreview').payload.previewId,dispatch.payload.managedUI.previewId);
});

test('frozen v1 and versioned v2 JSON components Save and Run exact verified bytes without recompilation, and Stop owns the same preview',async t=>{
  for(const v2 of [false,true]){
    let compiled=0;
    const f=await fixture(undefined,undefined,{componentPreparerFactory:()=>({prepare:async()=>{compiled++;throw Error('frozen code must not compile');},cancel(){},dispose(){}})});
    t.after(()=>f.dispose());const requests=browserPageResponses(f),draft=await frozenComponentDraft(v2);
    await f.editor.importDraft(draft);assert.equal(requests.length,0);assert.equal(f.find('script-source').readOnly,true);
    await f.click('script-save');await waitForComponentUI(()=>f.find('page-candidate-status').dataset.state==='saved','frozen JSON should save directly');
    assert.equal(requests[0].method,'importPageCandidate');assert.equal(requests[0].payload.sourceUtf8,draft.sourceUtf8);
    await f.click('page-preview-run');await waitForComponentUI(()=>f.find('page-preview-status').dataset.state==='completed','frozen JSON managed preview should complete');
    const preview=requests.find(row=>row.method==='previewPageScript');
    assert.equal(preview.payload.sourceUtf8,draft.sourceUtf8);assert.equal(preview.payload.managedUI.enabled,true);assert.equal(compiled,0);
    assert.equal(f.find('script-stop').disabled,false);await f.click('script-stop');
    await waitForComponentUI(()=>requests.some(row=>row.method==='retirePagePreview'),'frozen JSON Stop should use original managed preview');
    assert.equal(requests.find(row=>row.method==='retirePagePreview').payload.previewId,preview.payload.managedUI.previewId);
    assert.equal(f.commits.length,0);assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  }
});

test('Stop during browser component preparation prevents a late compiler result from dispatching or saving',async t=>{
  for(const save of [false,true]){
    const ready=deferred(),value=await honestComponentFixture().prepare({framework:'react',projectId:'browser-react'});let started=false;
    const f=await fixture(undefined,undefined,{componentPreparerFactory:()=>({prepare:async()=>{started=true;return ready.promise;},cancel(){},dispose(){}})});
    t.after(()=>f.dispose());const requests=browserPageResponses(f);await selectBrowserReact(f);
    await f.click(save?'script-save':'page-preview-run');await waitForComponentUI(()=>started,'compiler should be pending');
    assert.equal(f.find('script-stop').disabled,false);assert.equal(f.find('script-stop').textContent,'取消准备');
    await f.click('script-stop');ready.resolve(value);await tick();await tick();await tick();
    assert.equal(requests.length,0,'a canceled operation may not dispatch or save stale source');
    assert.equal(f.find('page-preview-run').disabled,false);
  }
});

test('effect unknown reads one original completion, restores only Stop ownership and never reruns; forged queries stay quarantined',async t=>{
  for(const forged of [false,true]){
    const f=await fixture(undefined,undefined,{componentPreparerFactory:honestComponentFixture});t.after(()=>f.dispose());
    const requests=browserPageResponses(f),original=f.client.request.bind(f.client);let queries=0,dispatches=0;
    f.client.request=async(method,payload)=>{
      if(method==='previewPageScript'){dispatches++;throw Object.assign(new Error('lost'),{code:'E_EFFECT_UNKNOWN'});}
      if(method==='queryPagePreview'){
        queries++;return {state:'preview-evaluated',managedUI:true,managedPreviewId:payload.previewId,sourceHash:payload.sourceHash,
          tabId:payload.tabId,documentId:payload.documentId,world:'USER_SCRIPT',worldId:'managed-world',queryOnly:true,originalDocumentOnly:true,
          receiptNonce:'original-nonce',completion:{format:'opendesk.page-preview-receipt.v1',nonce:forged?'wrong-nonce':'original-nonce',ok:true}};
      }
      return original(method,payload);
    };
    await selectBrowserReact(f);await f.click('page-preview-run');
    await waitForComponentUI(()=>f.find('page-preview-status').dataset.state==='error','unknown effect should remain a visible error');
    assert.equal(queries,1);assert.equal(dispatches,1);assert.equal(f.find('page-preview-run').disabled,true);
    assert.equal(f.find('script-stop').disabled,forged);
    if(!forged){await f.click('script-stop');await waitForComponentUI(()=>requests.some(row=>row.method==='retirePagePreview'),'original confirmed ownership permits cleanup');}
    assert.equal(dispatches,1,'receipt recovery never causes a second execution');
  }
});

test('reopening a large v2 component draft revalidates the envelope and restores exact frozen bytes without execution',async t=>{
  const saved=new Map(),storage={get:async key=>({[key]:structuredClone(saved.get(key))}),
    set:async values=>{for(const [key,value] of Object.entries(values))saved.set(key,structuredClone(value));}};
  const first=await fixture(undefined,storage),draft=await frozenComponentDraft(true);
  await first.editor.importDraft(draft);await tick();await tick();
  assert.ok(Buffer.byteLength(draft.sourceUtf8)>100000);first.dispose();
  const second=await fixture(undefined,storage);t.after(()=>second.dispose());
  await waitForComponentUI(()=>second.find('script-source').value===draft.sourceUtf8,'v2 frozen source should restore from its validated snapshot');
  assert.equal(second.find('script-source').readOnly,true);
  assert.equal(second.editor.executionSource(),draft.sourceUtf8);
  assert.match(second.find('program-source-info').textContent,new RegExp(draft.build.sourceHash));
  assert.equal(second.starts.length,0);assert.equal(second.previews.length,0);assert.equal(second.commits.length,0);
});

async function staticESMFixture(t,{sourceUtf8='import value from "https://library.example.org/value.js";\nexport default async function main(){return value;}',compileGate,approved=true,badReceipt=false}={}) {
  const hash=value=>createHash('sha256').update(value).digest('hex'),compiled=[],staticRequests=[];
  const preparer={cancel(){},dispose(){},async prepare(input){
    compiled.push(structuredClone(input));if(compileGate)await compileGate.promise;
    const sourceUtf8=input.sourceFormat==='esm-controller'
      ?'async function main(){return {title:await page.title(),value:params.value};}'
      :'async function main(){return 7;}';
    return {sourceUtf8,entryFormat:'async-main',sourceHash:hash(sourceUtf8),authorSourceHash:hash(input.sourceUtf8),
      sourceFormat:input.sourceFormat,lockId:input.lockId,manifestDigest:input.manifestDigest,compilerVersion:'7.29.9'};
  }};
  const f=await fixture(undefined,undefined,{staticESMPreparerFactory:()=>preparer});t.after(()=>f.dispose());
  const originalRequest=f.client.request;
  f.client.request=async(type,payload)=>{
    if(['inspectPageDependencies','loadPageESMForCompilation'].includes(type)){
      staticRequests.push({type,payload:structuredClone(payload)});
      const {requires}=parseStaticESMSource(payload.sourceUtf8),world=STATIC_ESM_WORLDS[payload.sourceFormat];
      const manifestDigest=hash(JSON.stringify([payload.sourceFormat,requires.map(row=>row.url)]));
      const lock={lockId:'dep-lock-'+hash(manifestDigest),manifestDigest,world,sourceFormat:payload.sourceFormat};
      if(type==='inspectPageDependencies')return {manifestDigest,requires,world,sourceFormat:payload.sourceFormat,
        locks:approved&&requires.length?[lock]:[]};
      assert.equal(payload.lockId,requires.length?lock.lockId:null);
      return {manifestDigest,world,sourceFormat:payload.sourceFormat,lockId:payload.lockId,
        entries:requires.map(row=>({url:row.url,order:row.order,code:'export default 7;',sha256:hash('export default 7;')}))};
    }
    const result=await originalRequest(type,payload);
    if(type==='previewPageScript')return {...result,sourceHash:badReceipt?'b'.repeat(64):hash(payload.sourceUtf8),resultText:'7'};
    return result;
  };
  f.find('script-source').value=sourceUtf8;f.find('script-source').fire('input');
  for(let n=0;n<8;n++)await tick();
  return {...f,compiled,staticRequests,sourceUtf8,
    async world(value){f.find('network-js-world').value=value;f.find('network-js-world').fire('change');for(let n=0;n<8;n++)await tick();},
    async settle(){for(let n=0;n<100&&f.find('script-status').dataset.state==='running';n++)await tick();}
  };
}
test('Page static imports save author source and approved lock alongside the actual compiled bytes',async t=>{
  const f=await staticESMFixture(t);
  const imports=[],originalRequest=f.client.request;
  f.client.request=async(method,payload)=>{
    if(method==='importPageCandidate'){imports.push(structuredClone(payload));return {stage:'Candidate',candidateId:'page-fixed',manifestHash:'f'.repeat(64)};}
    return originalRequest(method,payload);
  };
  assert.equal(f.find('script-save').disabled,true);
  assert.match(f.find('script-save').title,/试运行后保存/);
  await f.click('page-preview-run');await f.settle();
  assert.equal(f.previews.length,1);assert.equal(f.starts.length,0);
  assert.equal(f.compiled.length,1);
  assert.deepEqual(f.previews[0],{sourceUtf8:'async function main(){return 7;}',entryFormat:'async-main',lockId:null,
    authorSourceUtf8:f.sourceUtf8,authorLockId:f.compiled[0].lockId,
    authorManifestDigest:f.compiled[0].manifestDigest,compilerVersion:'7.29.9',
    target:{tabId:11,frameId:0,documentId:'doc-11',expectedUrl:'https://a.example/',expectedWindowId:7}});
  assert.equal(f.find('script-source').value,f.sourceUtf8);
  assert.equal(f.find('page-preview-result').textContent,'7');
  assert.equal(f.find('page-candidate-save').disabled,false);
  await f.click('page-candidate-save');await tick();
  assert.equal(f.commits.length,0);assert.equal(imports.length,1);
  assert.equal(imports[0].sourceUtf8,'async function main(){return 7;}');
  assert.equal(imports[0].authorSourceUtf8,f.sourceUtf8);
  assert.equal(imports[0].lockId,null);
  assert.equal(imports[0].authorLockId,f.compiled[0].lockId);
  assert.equal(imports[0].compilerVersion,'7.29.9');
  f.find('script-source').value=f.sourceUtf8+'\n// changed';f.find('script-source').fire('input');
  await tick();
  assert.equal(f.find('page-candidate-save').disabled,true);
  await f.click('page-candidate-save');assert.equal(imports.length,1);
});
test('loading a saved Page import restores author bytes and Page lock without running',async t=>{
  const f=await staticESMFixture(t);
  await f.click('page-preview-run');await f.settle();
  const frozen=f.compiled[0],original=f.client.request;
  const row={programId:'saved-esm',revision:1,stage:'Candidate',manifestHash:'f'.repeat(64),
    sourceHash:createHash('sha256').update('async function main(){return 7;}').digest('hex'),
    pageRules:{matches:['https://a.example/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}};
  f.client.request=async(method,input)=>{
    if(method==='listPagePrograms')return {catalog:[row]};
    if(method==='getPageCandidate')return {sourceUtf8:'async function main(){return 7;}',authorSourceUtf8:f.sourceUtf8,
      manifest:{compilation:{sourceFormat:'esm-page',authorSourceHash:createHash('sha256').update(f.sourceUtf8).digest('hex'),
        dependencyLockId:frozen.lockId,dependencyManifestDigest:frozen.manifestDigest}}};
    return original(method,input);
  };
  await f.world('esm-controller');
  await f.click('page-program-refresh');for(let n=0;n<10;n++)await tick();
  f.find('page-program-list').value='saved-esm:1';f.find('page-program-list').fire('change');
  await f.click('page-program-load');for(let n=0;n<16;n++)await tick();
  assert.equal(f.find('script-source').value,f.sourceUtf8);
  assert.equal(f.find('network-js-world').value,'esm-page');
  assert.equal(f.previews.length,1);assert.equal(f.starts.length,0);assert.equal(f.commits.length,0);
  assert.equal(f.find('page-candidate-save').disabled,true);
  await f.click('page-preview-run');await f.settle();
  assert.equal(f.previews.length,2);assert.equal(f.compiled.at(-1).lockId,frozen.lockId);
});
test('Controller Run refuses Page approval until an explicit world choice, then starts only the compiled draft',async t=>{
  const f=await staticESMFixture(t);
  await f.click('script-run');await f.settle();
  assert.equal(f.starts.length,0);assert.equal(f.compiled.length,0);
  assert.equal(f.find('network-js-world').value,'esm-page');
  assert.match(f.find('script-status').textContent,/E_DEPENDENCY_WORLD/);
  await f.world('esm-controller');
  await f.click('script-run');for(let n=0;n<12&&!f.executions.length;n++)await tick();
  assert.equal(f.starts.length,1);assert.equal(f.previews.length,0);
  assert.deepEqual(f.starts[0].source,{kind:'draft',sourceUtf8:f.executions[0].source});
  assert.match(f.executions[0].source,/async function main\(\)/);
  assert.equal(f.executions[0].source,f.compiled.length&&'async function main(){return {title:await page.title(),value:params.value};}');
  assert.deepEqual(f.executions[0].params,{value:1});
  assert.equal(f.staticRequests.findLast(row=>row.type==='loadPageESMForCompilation').payload.sourceFormat,'esm-controller');
  assert.equal(f.find('script-source').value,f.sourceUtf8);
  await f.finish({title:'fixture title',value:1});
  assert.match(f.find('script-task-status').textContent,/已完成/);
});
for(const world of ['esm-page','esm-controller'])test(world+' no-import ESM entry runs without a dependency lock',async t=>{
  const f=await staticESMFixture(t,{sourceUtf8:'export default async function main(){return 7;}',approved:false});
  if(world==='esm-controller')await f.world(world);
  await f.click(world==='esm-controller'?'script-run':'page-preview-run');
  if(world==='esm-page')await f.settle();else for(let n=0;n<12&&!f.executions.length;n++)await tick();
  assert.equal(f.compiled.length,1);assert.deepEqual(f.compiled[0].entries,[]);
  assert.equal(f.compiled[0].lockId,null);
  assert.equal(f.staticRequests.findLast(row=>row.type==='loadPageESMForCompilation').payload.lockId,null);
  if(world==='esm-controller'){assert.equal(f.starts.length,1);await f.finish(7);}
  else assert.equal(f.previews.length,1);
});
for(const change of ['source','world','document','target-mode'])test('Page import compilation discards '+change+' changes before dispatch',async t=>{
  const gate=deferred(),f=await staticESMFixture(t,{compileGate:gate});
  await f.click('page-preview-run');for(let n=0;n<12&&!f.compiled.length;n++)await tick();
  assert.equal(f.compiled.length,1);
  if(change==='source'){f.find('script-source').value=f.sourceUtf8+'\n// changed';f.find('script-source').fire('input');}
  else if(change==='world')await f.world('esm-controller');
  else if(change==='document')await f.navigateTab();
  else {f.find('script-target-mode').value='borrowed';f.find('script-target-mode').fire('change');await tick();}
  gate.resolve();await f.settle();
  assert.equal(f.previews.length,0);assert.equal(f.starts.length,0);
  assert.equal(f.find('page-preview-status').dataset.state,'error');
});
test('Page ESM result must carry the actual compiled source hash',async t=>{
  const f=await staticESMFixture(t,{badReceipt:true});
  await f.click('page-preview-run');await f.settle();
  assert.match(f.find('page-preview-status').textContent,/E_STATIC_ESM_OUTPUT/);
  assert.equal(f.find('page-candidate-save').disabled,true);
});
test('missing ESM approval never loads a compiler or starts a run',async t=>{
  const f=await staticESMFixture(t,{approved:false});
  await f.click('page-preview-run');await f.settle();
  await f.world('esm-controller');await f.click('script-run');await f.settle();
  assert.equal(f.compiled.length,0);assert.equal(f.previews.length,0);assert.equal(f.starts.length,0);
  assert.equal(f.staticRequests.some(row=>row.type==='loadPageESMForCompilation'),false);
});
