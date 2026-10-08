import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createScriptEditor} from '../../src/ui/script-editor.js';
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
  append(child){this.children.push(child);}
  replaceChildren(...children){this.children=children;this.value=children[0]?.value||'';}
  removeAttribute(name){delete this[name];}
}
globalThis.Option=class extends Element {constructor(text,value){super();this.textContent=text;this.value=value;}};
const event=()=>{const e=new Element();return {addListener:fn=>e.addEventListener('event',fn),removeListener:fn=>e.removeEventListener('event',fn),emit:(...args)=>{for(const fn of e.listeners.get('event')||[])fn(...args);}};};
const html=await readFile('src/ui/tool.html','utf8');
async function fixture(persisted={scripts:[],runs:[],results:[]}) {
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
  const find=id=>nodes.get(id), view=new Element(), doc={getElementById:find,defaultView:view};
  find('script-id').value='my-script';find('script-source').value='return params.value;';find('script-params').value='{"value":1}';find('script-target-mode').value='current';
  const traces=[], permissions=[], starts=[], executions=[], snapshots=[], commits=[], terminal=deferred();
  let activeTab=11, permission=Promise.resolve(true), saveGate, loadGate;
  const tabs=new Map([[11,{id:11,windowId:7,url:'https://a.example/',title:'A',incognito:false}],[12,{id:12,windowId:7,url:'https://b.example/',title:'B',incognito:false}]]);
  const api={runtime:{getURL:p=>'chrome-extension://extension/'+p},permissions:{request:request=>{permissions.push(request);traces.push('permission');return permission;}},
    tabs:{onActivated:event(),onUpdated:event(),onRemoved:event(),query:async query=>[...tabs.values()].filter(row=>!query.active||row.id===activeTab).map(row=>({...row,active:row.id===activeTab}))},
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
      const saved=persisted.scripts.find(row=>row.scriptId===request.scriptId&&row.revision===request.revision);
      const run={tag:'controller-run',runId:'run-'+(persisted.runs.length+1),state:'running',deadlineAt:request.deadlineAt,
        revision:{scriptId:saved.scriptId,revision:saved.revision,sourceHash:saved.contentHash},target:{...request.target,url:request.target.expectedUrl,allowedOrigin:new URL(request.target.expectedUrl).origin}};
      persisted.runs.push(run);return {...run,sourceUtf8:saved.sourceUtf8,paramsWire:request.paramsWire,identity:{runId:run.runId,ownerEpoch:1}};},
    async snapshotControllerRun(request){snapshots.push(structuredClone(request));return {run:request.runId?persisted.runs.find(row=>row.runId===request.runId):null,runs:structuredClone(persisted.runs),results:structuredClone(persisted.results),downloads:[],resultDeliveryDenied:[],slotAvailable:!persisted.runs.some(row=>row.state==='running')};},
    async stopControllerRun(request){traces.push(['durable-stop',request.reason]);return {runId:request.runId,state:'stopping'};},
    async finishControllerRun(request){const run=persisted.runs.find(row=>row.runId===request.runId);run.state=request.status==='succeeded'?'completed':request.status==='host-closed'?'interrupted':request.status==='stopped'?'stopped':'failed';
      const result={tag:'controller-result',runId:run.runId,resultId:'result-'+run.runId,revision:run.revision,state:run.state,outcome:request.status==='succeeded'?{ok:true,valueWire:request.valueWire}:{ok:false,error:request.error}};
      persisted.results.push(result);return {run,result};},
    async retireControllerTarget({runId}){persisted.runs.find(row=>row.runId===runId).retirementState='released';return {state:'released',releaseCount:1};},
    controllerOperation:async()=>{throw Error('Unexpected page operation');}
  };
  const client={ready:Promise.resolve(),controller,runCommands:{},storage:{},pagePort:{},exportBridge:{},entitlement:{},resourceSnapshot:()=>({})};
  const target=createCurrentPageTarget({api});await target.ready;
  const editor=createScriptEditor({client,currentPageTarget:target,api,document:doc,hostFactory:options=>createRunHost({...options,controllerFactory:({context})=>({
    execute:async(source,params)=>{executions.push({source,params});context.signal.addEventListener('abort',()=>terminal.resolve({status:context.signal.reason.code==='E_HOST_CLOSED'?'host-closed':'stopped'}),{once:true});return terminal.promise;},
    retired:Promise.resolve({acknowledged:true}),stop(){traces.push('local-stop');},close(){traces.push('local-close');}
  })})});
  await tick();
  return {find,editor,target,persisted,api,view,permissions,starts,executions,snapshots,commits,traces,
    click:async id=>{find(id).fire('click',{isTrusted:true});await tick();},
    finish:async value=>{terminal.resolve({status:'succeeded',value:controlEncode(value)});await editor.host.completion;await tick();},
    setPermission:value=>{permission=value;},setSaveGate:value=>{saveGate=value;},setLoadGate:value=>{loadGate=value;},
    switchTab:async()=>{activeTab=12;api.tabs.onActivated.emit({windowId:7,tabId:12});await tick();},
    dispose(){editor.dispose();target.dispose();}};
}

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

test('Run freezes saved r1/params/page A; switch to B and Save r2 cannot replace its target or Result identity',async t=>{
  const f=await fixture();t.after(()=>f.dispose());await f.click('script-save');const r1=f.persisted.scripts[0];
  f.find('script-source').value='return 999;';f.find('script-source').fire('input');await f.click('script-run');
  assert.equal(f.traces[0],'permission');assert.equal(f.starts[0].revision,1);assert.equal(f.starts[0].contentHash,r1.contentHash);
  assert.equal(f.starts[0].target.documentId,'doc-11');assert.equal(f.starts[0].target.expectedUrl,'https://a.example/');
  assert.deepEqual(f.executions,[{source:r1.sourceUtf8,params:{value:1}}]);
  await f.switchTab();assert.equal(f.find('script-current-page-title').textContent,'B');assert.match(f.find('script-running-target').textContent,/a\.example/);
  await f.click('script-save');assert.equal(f.persisted.scripts[1].revision,2);assert.match(f.find('script-task-version').textContent,/r1/);
  f.find('script-id').value='another-script';f.find('script-params').value='{"value":777}';f.find('script-run-id').value='run-decoy';
  await f.finish(false);assert.equal(f.starts.length,1);assert.equal(f.persisted.results[0].revision.sourceHash,r1.contentHash);
  assert.match(f.find('script-result').textContent,/result-run-1/);assert.match(f.find('script-result').textContent,new RegExp(r1.contentHash));
  assert.doesNotMatch(f.find('script-result').textContent,/run-decoy/);assert.equal(f.find('script-run-id').value,'run-1');
  assert(!f.snapshots.some(row=>row.runId==='run-decoy'));assert.match(f.find('script-history').textContent,/result-run-1/);
});

test('permission preparation rejects a switched page; closing the editor during permission never admits a run',async t=>{
  for(const close of [false,true]) {
    const f=await fixture();t.after(()=>f.dispose());const permission=deferred();f.setPermission(permission.promise);await f.click('script-save');await f.click('script-run');
    if(close)f.dispose();else await f.switchTab();permission.resolve(true);await tick();await tick();
    assert.equal(f.starts.length,0);assert.equal(f.executions.length,0);if(!close)assert.match(f.find('script-status').textContent,/E_DOCUMENT_STALE/);
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
  assert.match(reopened.find('script-history').textContent,/interrupted/);assert.match(reopened.find('script-result').textContent,/result-run-1/);
});

test('late Save/Load replies do not overwrite another script selection or edits made during loading',async t=>{
  const f=await fixture();t.after(()=>f.dispose());const save=deferred();f.setSaveGate(save);await f.click('script-save');
  f.find('script-id').value='another-script';f.find('script-id').fire('input');save.resolve();await tick();
  assert.equal(f.find('script-revision').value,'');assert.match(f.find('script-version').textContent,/尚未保存/);
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
