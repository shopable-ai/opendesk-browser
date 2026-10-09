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
async function fixture(persisted={scripts:[],runs:[],results:[]}, draftStorage, {contextTabId}={}) {
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
  const find=id=>nodes.get(id), view=new Element(), doc={getElementById:find,defaultView:view,createElement:()=>new Element()};
  find('script-id').value='my-script';find('script-source').value='return params.value;';find('script-params').value='{"value":1}';find('script-target-mode').value='current';
  const traces=[], permissions=[], starts=[], executions=[], snapshots=[], commits=[], previews=[], dependencyInspections=[], terminal=deferred();
  let activeTab=11, permission=Promise.resolve(true), saveGate, loadGate;
  const tabs=new Map([[11,{id:11,windowId:7,url:'https://a.example/',title:'A',incognito:false}],[12,{id:12,windowId:7,url:'https://b.example/',title:'B',incognito:false}]]);
  const api={storage:draftStorage?{session:draftStorage}:undefined,runtime:{getURL:p=>'chrome-extension://extension/'+p},permissions:{request:request=>{permissions.push(request);traces.push('permission');return permission;}},
    tabs:{getCurrent:async()=>contextTabId?{id:contextTabId}:undefined,onActivated:event(),onUpdated:event(),onRemoved:event(),query:async query=>[...tabs.values()].filter(row=>!query.active||row.id===activeTab).map(row=>({...row,active:row.id===activeTab}))},
    windows:{getCurrent:async()=>({id:7}),onRemoved:event()},
    webNavigation:{onCommitted:event(),onHistoryStateUpdated:event(),onReferenceFragmentUpdated:event(),getAllFrames:async({tabId})=>[{frameId:0,documentId:'doc-'+tabId,url:tabs.get(tabId).url,documentLifecycle:'active'}]}};
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
  const editor=createScriptEditor({client,currentPageTarget:target,api,document:doc,hostFactory:options=>createRunHost({...options,controllerFactory:({context})=>({
    execute:async(source,params)=>{executions.push({source,params});context.signal.addEventListener('abort',()=>terminal.resolve({status:context.signal.reason.code==='E_HOST_CLOSED'?'host-closed':'stopped'}),{once:true});return terminal.promise;},
    retired:Promise.resolve({acknowledged:true}),stop(){traces.push('local-stop');},close(){traces.push('local-close');}
  })})});
  await tick();
  return {find,editor,client,target,persisted,api,view,permissions,starts,executions,snapshots,commits,previews,traces,dependencyInspections,
    click:async id=>{find(id).fire('click',{isTrusted:true});await tick();},
    finish:async value=>{terminal.resolve({status:'succeeded',value:controlEncode(value)});await editor.host.completion;await tick();},
    setPermission:value=>{permission=value;},setSaveGate:value=>{saveGate=value;},setLoadGate:value=>{loadGate=value;},
    switchTab:async()=>{activeTab=12;api.tabs.onActivated.emit({windowId:7,tabId:12});await tick();},
    dispose(){editor.dispose();target.dispose();}};
}

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
  assert.match(f.find('local-project-status').textContent,/本地开发服务未连接/);
  assert.doesNotMatch(f.find('local-project-status').textContent,/E_DEV_DISCONNECTED/);
  assert.match(f.find('local-project-status').title,/E_DEV_DISCONNECTED/);
  f.find('local-project-mode').checked=false;f.find('local-project-mode').fire('change');
  assert.equal(f.find('local-project-tools').hidden,true);
  assert.equal(f.find('manual-source-editor').hidden,false);
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
  f.api.storage={local:{get:async()=>({[key]:{local:true,bindingId:'old-project',paramsText:'{}'}}),set:async()=>{}}};
  f.client.requestLocalProject=async method=>method==='status'?{connected:true,providerEpoch:'new-epoch'}:
    method==='projects.list'?{providerEpoch:'new-epoch',projects:[{name:'Another project',bindingId:'new-project'}]}:
    assert.fail('stale project must not be resolved');
  f.editor.connectLocalProjects({});await tick();await tick();
  assert.equal(f.find('local-project-mode').checked,true);
  assert.equal(f.find('local-project-select').value,'old-project');
  assert.equal(f.find('local-project-status').dataset.state,'selection-needed');
  assert.equal(f.find('script-run').disabled,true);
  assert.equal(f.starts.length,0);
});

test('local project mode preserves manual draft and params while running fresh bytes through the same Host',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const manual=f.find('script-source').value;f.find('script-params').value='invalid manual parameter JSON';f.find('local-project-params').value='{}';
  const sourceUtf8='async function main(){return {local:3};}',sourceHash=createHash('sha256').update(sourceUtf8).digest('hex');
  f.api.permissions.contains=async()=>true;
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
  await f.click('script-run');for(let n=0;n<100&&!f.executions.length&&f.find('script-status').dataset.state!=='error';n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.starts.length,1,f.find('script-status').textContent);assert.equal(f.executions[0].source,sourceUtf8);assert.equal(f.commits.length,0);
  assert.equal(f.find('script-source').value,manual);assert.equal(f.find('script-params').value,'invalid manual parameter JSON');await f.finish({local:3});
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
 failMain=true;await f.click('script-run');await waitState('error');assert.equal(admitted.length,2);
 localChanged({connected:false});assert.equal(f.find('script-run').disabled,true);assert.equal(f.find('script-stop').disabled,false);
 f.find('local-project-select').value='local-'+'b'.repeat(20);f.find('local-project-select').fire('change');assert.equal(f.find('script-stop').disabled,true);
 f.find('local-project-select').value=bindingId;f.find('local-project-select').fire('change');assert.equal(f.find('script-stop').disabled,false);
 await f.click('script-stop');assert.equal(stops[0].previewId,admitted[1].managedUI.previewId);assert.notEqual(stops[0].previewId,admitted[0].managedUI.previewId);
 assert.equal(f.find('script-run').disabled,true);await f.click('script-run');assert.equal(admitted.length,2);
 gate.resolve();await waitState('completed');assert.equal(f.find('script-stop').disabled,true);assert.equal(f.starts.length,0);
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

test('imported legacy @require only reads previously approved versions and never adds a form or downloads code',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const source='// ==UserScript==\n// @require https://cdn.example/library.js\n// ==/UserScript==\nasync function main(){return document.title;}';
  f.editor.importDraft(source);await tick();
  assert.deepEqual(f.dependencyInspections,[{sourceUtf8:source,entryFormat:'async-main'}]);
  assert.equal(f.find('page-dependency-add'),undefined);
  assert.equal(f.find('page-dependency-lock'),undefined);
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
  assert.equal(f.traces[0],'permission');
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

test('the permission request remains synchronous in the click fixture; denied permission and invalid params execute nothing',async t=>{
  const f=await fixture();t.after(()=>f.dispose());await f.click('script-save');const permission=deferred();f.setPermission(permission.promise);
  f.find('script-run').fire('click',{isTrusted:true});assert.equal(f.permissions.length,1);assert.equal(f.starts.length,0);
  permission.resolve(false);await tick();await tick();assert.match(f.find('script-status').textContent,/E_PERMISSION/);assert.equal(f.starts.length,0);
  f.find('script-params').value='invalid json';await f.click('script-run');assert.equal(f.permissions.length,1);assert.equal(f.executions.length,0);
});

test('DOM preview binds frozen plain JavaScript and exact current document from trusted click',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  const pending=deferred();f.setPermission(pending.promise);
  const source='async function main(){document.title="frozen";return document.title;}';
  f.find('script-source').value=source;
  f.find('page-preview-run').fire('click',{isTrusted:false});
  assert.equal(f.permissions.length,0,'untrusted event must never open a permission prompt');
  f.find('page-preview-run').fire('click',{isTrusted:true});
  assert.equal(f.permissions.length,1,'only explicit native user gesture requests website permission');
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
  assert.match(frozen.sourceUtf8,/^\/\/ ==UserScript==\n\/\/ @match https:\/\/a\.example\/\*/);
  assert.equal(frozen.sourceUtf8.endsWith(source),true);
  assert.match(fx.find('page-candidate-status').textContent,/未完成 Page 类型验证、正式安装/);
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
