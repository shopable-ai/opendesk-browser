import {createDeveloperView} from '../../src/ui/develop-view.js';
import {developerTestFields} from './develop-view-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalProjectView} from '../../src/ui/local-project.js';
import {createLocalProjectRun} from '../../src/ui/local-project-run.js';
import {createNativeAgentHostAdapter} from '../../src/native-agent/host-adapter.js';
import {sha256Utf8} from '../../src/scripting/user-scripts/page-program-package.js';
import {createLocalInstallUI} from '../../src/ui/local-project-install-ui.js';
import {createControllerResultsView} from '../../src/ui/controller-results-view.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

// Component evidence only; these events do not claim trusted browser input.
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
const project={bindingId:'local-a',name:'TOC',sourceId:'source-a',runtimeKind:'page-userscript',preparation:{state:'ready'}};
const workspace={workspaceId:'workspace-00000000-0000-0000-0000-000000000001',name:'prompt-shortcuts',sourceId:'source-'+'a'.repeat(24),access:'read-write',leaseEpoch:'lease-'+'a'.repeat(24)};
// Exercise the real selection owner -> Local Run -> Native adapter circuit.
// Only external Chrome/RunHost effects and their async scheduling are simulated.
for(const kind of ['controller','page-userscript']){
  for(const boundary of ['target','permission','hash']){
    for(const change of ['selection','epoch','preparation','close','unchanged']){
      test(`Local final admission rejects ${kind} ${change} during adapter ${boundary}`,async t=>{
        const f=fixture(t,{connected:true}),entered=deferred(),release=deferred();
        const bindingId='local-'+'a'.repeat(20),otherBinding='local-'+'c'.repeat(20);
        const sourceUtf8='async function main(){return 1;}';
        const source={bindingId,providerEpoch:'epoch-a',projectId:'project-a',runtimeKind:kind,
          entryFormat:'async-main',sourceUtf8,sourceHash:await sha256Utf8(sourceUtf8),
          sourceBytes:new TextEncoder().encode(sourceUtf8).length,inputHash:'b'.repeat(64),
          siteOrigins:['https://example.com']};
        let preparation={state:'ready',sourceHash:source.sourceHash},closed=false,hashes=0,permissions=0;
        const catalog=()=>[{...project,bindingId,runtimeKind:kind,preparation},
          {...project,bindingId:otherBinding,sourceId:'source-c',runtimeKind:kind}];
        f.setProjects(catalog());f.find('local-project-refresh').fire('click');await tick();
        f.find('local-project-select').value=bindingId;f.find('local-project-select').fire('change');
        f.find('local-project-params').value='{}';
        f.client.requestLocalProject=async method=>method==='project.resolve'?structuredClone(source):
          method==='projects.list'?{providerEpoch:'epoch-a',projects:catalog()}:
          method==='workspaces.list'?fileCatalog([]):{connected:true,nativeConnected:true,providerEpoch:'epoch-a'};
        const target={status:'available',tabId:11,windowId:3,frameId:0,documentId:'doc-a',
          url:'https://example.com/form',origin:'https://example.com'};
        const pause=async()=>{entered.resolve();await release.promise;};
        const currentPageTarget={ready:Promise.resolve(),capture:()=>({...target}),
          refresh:async()=>{if(boundary==='target')await pause();},revalidate:async()=>{}};
        const api={permissions:{contains:async()=>{if(++permissions===2&&boundary==='permission')await pause();return true;}}};
        if(boundary==='hash'){
          const digest=crypto.subtle.digest.bind(crypto.subtle);
          t.mock.method(crypto.subtle,'digest',async(...args)=>{if(++hashes===2)await pause();return digest(...args);});
        }
        const effects=[],errors=[];
        const client={ready:Promise.resolve(),registration:{registrationId:'registration-a'},
          subscribeNativeAgent:()=>()=>{},request:async method=>{effects.push(method);throw Error('unexpected Page dispatch');}};
        const host={currentRun:null,start:async()=>{effects.push('run.start');throw Error('unexpected Controller dispatch');},
          controller:{snapshotControllerRun:async()=>({slotAvailable:true})}};
        const adapter=createNativeAgentHostAdapter({client,host,api,currentPageTarget});
        const owner=createLocalProjectRun({api,host,view:f.developerView,currentPageTarget,localProject:f.view,localAdapter:adapter,
          localInstaller:{reset(){},succeeded(){}},controllerResults:{projection:{slotAvailable:true},renderTask(){},read:async()=>{},setProjection(){},clearProjection(){}},
          getCurrentPageState:()=>target,isDisposed:()=>closed,isBlocked:()=>false,display(){},fail:error=>errors.push(error),
          hideUserScriptsRecovery(){},beginResult(){},update(){},setResultText(){},setResultKind(){}});
        t.after(()=>{release.resolve();owner.dispose();adapter.dispose();});
        owner.run({isTrusted:true});await entered.promise;
        if(change==='selection'){f.find('local-project-select').value=otherBinding;f.find('local-project-select').fire('change');}
        if(change==='epoch'){f.setState({connected:true,nativeConnected:true,providerEpoch:'epoch-b'});f.notify({connected:true,nativeConnected:true,providerEpoch:'epoch-b'});}
        if(change==='preparation'){preparation={state:'updating'};f.setProjects(catalog());f.notify({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});await tick();}
        if(change==='close')closed=true;
        release.resolve();
        for(let i=0;i<300&&owner.running;i++)await new Promise(resolve=>setTimeout(resolve,2));
        assert.equal(owner.running,false,'original Local operation must settle');
        if(change==='unchanged')assert.deepEqual(effects,[kind==='controller'?'run.start':'previewPageScript'],
          'unchanged Local draft must still reach the original execution owner');
        else {
          assert.deepEqual(effects,[],'stale Local operation must never reach RunHost or USER_SCRIPT dispatch');
          if(change!=='close')assert.ok(errors.some(error=>error.code==='E_DEV_CONFLICT'),JSON.stringify(errors));
        }
      });
    }
  }
}
const fileCatalog=workspaces=>({workspaces,sessionId:'files-session-'+'a'.repeat(24)});
for(const previousController of [false,true])for(const detach of [false,'pending','validation']){
test(`LocalPage claim displays its captured target through completion: previousController=${previousController}, stoppedWaiting=${detach}`,async t=>{
  const bindingId='local-'+'a'.repeat(20),sourceUtf8='async function main(){return document.title;}';
  const source={bindingId,providerEpoch:'epoch-a',projectId:'project-a',runtimeKind:'page-userscript',
    entryFormat:'async-main',sourceUtf8,sourceHash:await sha256Utf8(sourceUtf8),
    sourceBytes:new TextEncoder().encode(sourceUtf8).length,inputHash:'b'.repeat(64),siteOrigins:['https://example.com']};
  const f=fixture(t,{connected:true,saved:{bindingId,sourceId:project.sourceId,localMode:true,paramsText:'{}'}});
  f.setProjects([{...project,bindingId,preparation:{state:'ready',sourceHash:source.sourceHash}}]);await tick();
  const resolve=f.client.requestLocalProject;
  f.client.requestLocalProject=(method,args)=>method==='project.resolve'?Promise.resolve(structuredClone(source)):resolve(method,args);
  const captured={status:'available',tabId:11,windowId:3,frameId:0,documentId:'doc-local-page',
    url:'https://example.com/local-page',origin:'https://example.com'};
  const entered=deferred(),receipt=deferred(),validating=deferred(),validated=deferred(),errors=[],succeeded=[];let resultText='',checks=0;
  const currentPageTarget={ready:Promise.resolve(),capture:()=>({...captured}),refresh:async()=>{},
    revalidate:async()=>{if(++checks===3&&detach==='validation'){validating.resolve();await validated.promise;}}};
  const client={ready:Promise.resolve(),registration:{registrationId:'registration-a'},subscribeNativeAgent:()=>()=>{},
    request:async(method,args)=>{
      assert.equal(method,'previewPageScript');assert.equal(args.target.documentId,captured.documentId);
      entered.resolve();return receipt.promise;
    }};
  const api={permissions:{contains:async()=>true}};
  const host={currentRun:null,controller:{snapshotControllerRun:async()=>({slotAvailable:true,runs:[],results:[]})}};
  const controllerResults=createControllerResultsView({host,view:f.developerView,isDisposed:()=>false});
  controllerResults.setProjection({slotAvailable:true});
  if(previousController)controllerResults.renderTask({runId:'previous-controller',state:'completed',
    target:{tabId:91,frameId:0,documentId:'doc-old',url:'https://old.example/'}});
  const adapter=createNativeAgentHostAdapter({client,host,api,currentPageTarget});
  const owner=createLocalProjectRun({api,host,view:f.developerView,currentPageTarget,localProject:f.view,localAdapter:adapter,
    localInstaller:{reset(){},succeeded:value=>succeeded.push(value)},controllerResults,
    getCurrentPageState:()=>captured,isDisposed:()=>false,isBlocked:()=>false,display(){},fail:error=>errors.push(error),
    hideUserScriptsRecovery(){},beginResult(){},update(){},setResultText:value=>{resultText=value;},setResultKind(){}});
  t.after(()=>{receipt.resolve();validated.resolve();owner.dispose();adapter.dispose();});
  owner.run({isTrusted:true});await entered.promise;await tick();
  assert.match(f.find('script-task-id').textContent,/^previewId：/);
  const assertTarget=()=>{
    assert.equal(f.find('script-running-target').textContent,'运行目标：'+captured.url);
    assert.deepEqual(JSON.parse(f.find('script-running-target').title),{
      tabId:captured.tabId,frameId:0,documentId:captured.documentId,url:captured.url});
  };
  assertTarget();assert.equal(owner.running,true,'target is visible while the admitted Page receipt is pending');
  assert.equal(owner.canStopWaiting(),true);
  if(detach==='pending'){
    owner.stopWaiting();assert.equal(owner.canStopWaiting(),false);
    assert.match(resultText,/已停止等待.*可能仍在执行.*不会撤销/);
    assert.equal(owner.running,true,'Stop waiting retains the original execution until its receipt settles');
  }
  receipt.resolve({state:'preview-evaluated',sourceHash:source.sourceHash,world:'USER_SCRIPT',
    documentId:captured.documentId,tabId:captured.tabId,resultText:'LocalPage success'});
  if(detach==='validation'){
    await validating.promise;owner.stopWaiting();
    assert.match(resultText,/已停止等待/);validated.resolve();
  }
  for(let i=0;i<250&&owner.running;i++)await new Promise(resolve=>setTimeout(resolve,2));
  assert.equal(owner.running,false);assert.deepEqual(errors,[]);assert.equal(succeeded.length,detach?0:1);assertTarget();
  if(detach){assert.match(resultText,/已停止等待/);assert.equal(f.find('script-copy-result').disabled,true);}
});
}
for(const change of ['epoch','selection','mode','preparation','new-owner']){
test(`Local running Controller fences its original execution on session change: ${change}`,async t=>{
  const f=fixture(t,{connected:true,saved:{bindingId:project.bindingId,sourceId:project.sourceId,localMode:true,paramsText:'{}'}});
  f.setProjects([{...project,runtimeKind:'controller'},{...project,bindingId:'local-b',sourceId:'source-b'}]);await tick();
  const sourceUtf8='async function main(){return 1;}',source={bindingId:project.bindingId,providerEpoch:'epoch-a',projectId:'project-a',
    runtimeKind:'controller',entryFormat:'async-main',sourceUtf8,sourceHash:await sha256Utf8(sourceUtf8),
    sourceBytes:new TextEncoder().encode(sourceUtf8).length,inputHash:'b'.repeat(64),siteOrigins:['https://example.com']};
  const request=f.client.requestLocalProject;
  f.client.requestLocalProject=(method,args)=>method==='project.resolve'?Promise.resolve(structuredClone(source)):request(method,args);
  const target={status:'available',tabId:11,windowId:3,frameId:0,documentId:'doc-a',url:'https://example.com/form',origin:'https://example.com'};
  const currentPageTarget={ready:Promise.resolve(),capture:()=>({...target}),refresh:async()=>{},revalidate:async()=>{}};
  const completion=deferred(),stops=[],api={permissions:{contains:async()=>true}};
  const host={currentRun:null,completion:completion.promise,
    start:async()=>{host.currentRun='original-run';return {runId:'original-run',state:'running'};},
    stop:async value=>{stops.push(value);host.currentRun=null;completion.resolve({error:{code:'E_CANCELLED',message:'Original execution stopped'}});},
    controller:{snapshotControllerRun:async()=>({slotAvailable:!host.currentRun})}};
  const client={ready:Promise.resolve(),registration:{registrationId:'registration-a'},subscribeNativeAgent:()=>()=>{}};
  const adapter=createNativeAgentHostAdapter({client,host,api,currentPageTarget});
  const owner=createLocalProjectRun({api,host,view:f.developerView,currentPageTarget,localProject:f.view,localAdapter:adapter,
    localInstaller:{reset(){},succeeded(){}},controllerResults:{projection:{slotAvailable:true},renderTask(){},read:async()=>{},setProjection(){},clearProjection(){}},
    getCurrentPageState:()=>target,isDisposed:()=>false,isBlocked:()=>false,display(){},fail(){},hideUserScriptsRecovery(){},beginResult(){},update(){},setResultText(){},setResultKind(){}});
  t.after(()=>{completion.resolve({error:{code:'E_CANCELLED'}});owner.dispose();adapter.dispose();});
  owner.run({isTrusted:true});for(let i=0;i<300&&!owner.ownedRunId;i++)await new Promise(resolve=>setTimeout(resolve,2));
  assert.equal(owner.ownedRunId,'original-run');
  if(change==='selection'){f.find('local-project-select').value='local-b';f.find('local-project-select').fire('change');}
  else if(change==='mode'){f.find('local-project-mode').checked=false;f.find('local-project-mode').fire('change');}
  else if(change==='preparation'){
    f.setProjects([{...project,runtimeKind:'controller',preparation:{state:'updating'}}]);
    f.notify({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});await tick();
  }else{
    if(change==='new-owner')host.currentRun='new-run';
    f.setState({connected:true,nativeConnected:true,providerEpoch:'epoch-b'});
    f.notify({connected:true,nativeConnected:true,providerEpoch:'epoch-b'});
  }
  // The original Script Editor onChange calls this existing lifecycle entry.
  owner.refreshResultValidity();await tick();
  assert.deepEqual(stops,['epoch','selection','mode'].includes(change)?[{runId:'original-run',controller:true}]:[],
    'revoke the captured execution only; frozen source updates and another owner must remain untouched');
});
}
test('Local rejected preparation keeps its error while Controller history remains explicitly readable',async t=>{
  const f=fixture(t,{connected:true,saved:{bindingId:project.bindingId,sourceId:project.sourceId,localMode:true,paramsText:'{}'}});
  f.setProjects([{...project,runtimeKind:'controller'},{...project,bindingId:'local-b',sourceId:'source-b'}]);await tick();
  const entered=deferred(),reply=deferred(),request=f.client.requestLocalProject;
  f.client.requestLocalProject=(method,args)=>method==='project.resolve'?(entered.resolve(),reply.promise):request(method,args);
  const target={status:'available',tabId:11,windowId:3,frameId:0,documentId:'doc-a',url:'https://example.com/form',origin:'https://example.com'};
  const oldRun={runId:'previous-controller-A',state:'completed',retirementState:'released',sourceKind:'draft',
    revision:{kind:'draft',sourceHash:'a'.repeat(64)},target};
  const snapshot={run:oldRun,runs:[oldRun],results:[{runId:oldRun.runId,resultId:'result-a',state:'completed',
    revision:oldRun.revision,outcome:{ok:true,valueWire:encodeValue({scenario:'A_OLD_VALUE'})}}],downloads:[],slotAvailable:true};
  const host={currentRun:null,controller:{snapshotControllerRun:async()=>snapshot}};
  let owner,text='',kind='';
  const setResultText=value=>{text=value;},setResultKind=value=>{kind=value;};
  const controllerResults=createControllerResultsView({host,view:f.developerView,resultDownloads:{showResults(){}},
    isDisposed:()=>false,isRunning:()=>owner?.running||false,getOwnedRunId:()=>null,isLocalPageResultCurrent:()=>false,
    onUpdate(){},onStatus(){},setResultText,setResultKind,displayCopyResult(){},showRecovery(){},hideRecovery(){}});
  await controllerResults.read(oldRun.runId);assert.match(text,/A_OLD_VALUE/);
  owner=createLocalProjectRun({api:{permissions:{contains:async()=>true}},host,view:f.developerView,
    currentPageTarget:{capture:()=>target,revalidate:async()=>{}},localProject:f.view,
    localAdapter:{handle:async()=>{throw Error('rejected preparation must not dispatch');}},
    localInstaller:{reset(){},succeeded(){}},controllerResults,getCurrentPageState:()=>target,
    isDisposed:()=>false,isBlocked:()=>false,display(){},fail(){},hideUserScriptsRecovery(){},beginResult(){},update(){},setResultText,setResultKind});
  const sourceUtf8='async function main(){return 1;}',source={bindingId:project.bindingId,providerEpoch:'epoch-a',
    projectId:'project-a',runtimeKind:'controller',entryFormat:'async-main',sourceUtf8,sourceHash:await sha256Utf8(sourceUtf8),
    sourceBytes:new TextEncoder().encode(sourceUtf8).length,inputHash:'b'.repeat(64),siteOrigins:['https://example.com']};
  t.after(()=>{reply.resolve(source);owner.dispose();});
  owner.run({isTrusted:true});await entered.promise;
  f.find('local-project-select').value='local-b';f.find('local-project-select').fire('change');reply.resolve(source);
  for(let i=0;i<300&&owner.running;i++)await new Promise(resolve=>setTimeout(resolve,2));
  assert.equal(owner.running,false);assert.match(text,/E_DEV_CONFLICT/);assert.equal(kind,'本地项目 · 未启动');
  assert.equal(f.find('script-task-id').textContent,'尚未运行');
  await controllerResults.read(oldRun.runId,{reveal:true});assert.match(text,/A_OLD_VALUE/);
  assert.equal(f.find('script-task-id').textContent,'runId：'+oldRun.runId);
});
function fixture(t,{nativeConnected=true,connected=false,saved,files=[],tools=[],preparationDelayMs=0}={}){
  const developerView=createDeveloperView(),find=developerTestFields(developerView);
  find('local-project-mode').checked=true;
  let state={connected,nativeConnected,providerEpoch:connected?'epoch-a':null},projects=[project],listener;
  const calls=[],writes=[],opened=[];let changes=0,observedSnapshot,publications=0;
  const client={requestLocalProject:async method=>{calls.push(method);return method==='status'?state:method==='workspaces.list'?fileCatalog(files):{providerEpoch:state.providerEpoch,projects};},
    subscribeLocalProjects:callback=>{listener=callback;return ()=>{listener=null;};}};
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path,openOptionsPage:async()=>opened.push('options')},tabs:{create:async value=>opened.push(value)},storage:{local:{get:async()=>({'opendesk.sidebar-tools.installed.v1':tools,...(saved?{'opendesk.local-project.selection.v1':saved}:{})}),set:async value=>{writes.push(value);}}}};
  const view=createLocalProjectView({client,api,view:developerView,onChange:()=>changes++,preparationDelayMs});
  t.after(()=>view.dispose());
  return {view,developerView,api,find,calls,writes,opened,client,setState:value=>{state=value;},setProjects:value=>{projects=value;},setFiles:value=>{files=value;},notify:value=>listener(value),
    activity:()=>{
      const snapshot=developerView.getSnapshot();
      if(snapshot!==observedSnapshot){observedSnapshot=snapshot;publications++;}
      return {publications,changes,writes:writes.length};
    }};
}
for(const storageOutcome of ['resolve','reject','navigate','selection','close','new-B-attempt','new-A-attempt']){
test(`Local installation awaits real selection storage before effects: ${storageOutcome}`,async t=>{
  const f=fixture(t,{connected:true,saved:{bindingId:project.bindingId,sourceId:project.sourceId,localMode:true,paramsText:'{}'}});
  f.setProjects([{...project,runtimeKind:'controller'},
    {...project,bindingId:'local-b',sourceId:'source-b',runtimeKind:'controller'}]);await tick();
  const binding=f.view.capture(),sourceUtf8='async function main(){return 1;}';
  const source={bindingId:binding.bindingId,providerEpoch:binding.providerEpoch,projectId:'project-a',
    runtimeKind:'controller',entryFormat:'async-main',sourceUtf8,sourceHash:await sha256Utf8(sourceUtf8),
    sourceBytes:new TextEncoder().encode(sourceUtf8).length,inputHash:'b'.repeat(64),siteOrigins:['https://example.com']};
  const request=f.client.requestLocalProject;
  f.client.requestLocalProject=(method,args)=>method==='project.resolve'?Promise.resolve(structuredClone(source)):request(method,args);
  const target={status:'available',tabId:11,windowId:3,frameId:0,documentId:'doc-a',url:'https://example.com/form'};
  const gate=deferred(),entered=deferred(),storageGate=deferred(),storageEntered=deferred(),methods=[];
  let candidate,installed=null,held=false;
  const save=f.api.storage.local.set;
  f.api.storage.local.set=async value=>{
    if(value['opendesk.local-project.selection.v1'].lastUnknownInstall&&!held){
      held=true;storageEntered.resolve();await storageGate.promise;
    }
    return save(value);
  };
  f.client.request=async(method,args)=>{
    methods.push(method);
    if(method==='listTaskCatalog')return {catalog:candidate?[candidate]:[],installed:installed?[installed]:[]};
    if(method==='importTaskPackage'){
      assert.ok(f.writes.at(-1)['opendesk.local-project.selection.v1'].lastUnknownInstall,
        'the real selection owner completes recovery storage before any Candidate mutation');
      candidate={...args.package.manifest,manifest:args.package.manifest,manifestHash:args.package.manifestHash,stage:'candidate'};
      return candidate;
    }
    if(method==='verifyTaskCandidate'){candidate.stage='verified';return candidate;}
    if(method==='makeTaskAvailable'){candidate.stage='available';return candidate;}
    if(method==='installTask'){
      installed={taskId:args.taskId,version:args.version,manifestHash:args.manifestHash};
      entered.resolve();await gate.promise;
      throw Object.assign(new Error('closed before ACK'),{code:'E_EFFECT_UNKNOWN'});
    }
    throw Error('unexpected mutation '+method);
  };
  const options={client:f.client,api:{permissions:{contains:async()=>true}},currentPageTarget:{snapshot:target,revalidate:async()=>{}}};
  const ui=createLocalInstallUI({...options,view:f.developerView,getProject:()=>f.view});
  t.after(()=>{storageGate.resolve();gate.resolve();ui.dispose();});
  ui.succeeded({source,binding,target,runId:'run-a'});await ui.prepare();ui.confirm({isTrusted:true});await storageEntered.promise;
  await tick();
  assert.ok(methods.every(method=>method==='listTaskCatalog'),'pending storage must block every Candidate/Verify/Install effect');
  if(storageOutcome==='navigate')options.currentPageTarget.snapshot={...target,documentId:'doc-b'};
  if(['selection','new-B-attempt'].includes(storageOutcome)){
    f.find('local-project-select').value='local-b';f.find('local-project-select').fire('change');ui.reset();
  }
  if(storageOutcome==='close')ui.dispose();
  let replacement=null;
  if(['new-B-attempt','new-A-attempt'].includes(storageOutcome)){
    replacement={...f.view.previousInstallAttempt(),attemptId:'new-attempt-'+storageOutcome,
      bindingId:f.view.selectedBindingId(),projectSourceId:f.view.selectedProject().sourceId};
    await f.view.rememberInstallAttempt(replacement);
  }
  if(storageOutcome==='reject')storageGate.reject(Object.assign(new Error('disk write rejected'),{code:'E_STORAGE_WRITE'}));
  else storageGate.resolve();
  if(storageOutcome!=='resolve'){
    for(let i=0;i<8;i++)await tick();
    assert.ok(methods.every(method=>method==='listTaskCatalog'),'failed write or changed selection/target/owner must have zero effects');
    if(storageOutcome==='reject'){
      assert.match(f.find('local-install-status').textContent,/E_STORAGE_WRITE/);
      assert.equal(f.view.previousInstallAttempt(),null);
      assert.notEqual(ui.saveLabel(),'核对安装状态','a failed write cannot create an unknown installation');
    }
    assert.deepEqual(f.view.previousInstallAttempt(),replacement,'only the exact undispatched hint may be cleared');
    assert.deepEqual(f.writes.at(-1)['opendesk.local-project.selection.v1'].lastUnknownInstall,replacement,
      'late storage completion must preserve a newer hint');
    f.find('local-project-select').value=project.bindingId;f.find('local-project-select').fire('change');
    const returned=createLocalInstallUI({...options,view:f.developerView,getProject:()=>f.view});t.after(()=>returned.dispose());
    returned.reset();
    if(storageOutcome==='new-A-attempt')assert.equal(returned.saveLabel(),'核对安装状态');
    else{
      assert.notEqual(returned.saveLabel(),'核对安装状态','returning to A must not invent UNKNOWN before any submission');
      options.currentPageTarget.snapshot=target;
      returned.succeeded({source,binding:f.view.capture(),target,runId:'run-after-return'});await returned.prepare();
      assert.equal(f.find('local-install-confirm').disabled,false,'A can be reviewed again without replaying any installation');
    }
    return;
  }
  await entered.promise;
  const saved=structuredClone(f.writes.at(-1)['opendesk.local-project.selection.v1']);
  assert.match(saved.lastUnknownInstall.attemptedManifestHash,/^[a-f0-9]{64}$/);
  ui.dispose();f.view.dispose();gate.resolve();await tick();
  const restored=fixture(t,{connected:true,saved});restored.setProjects([{...project,runtimeKind:'controller'}]);await tick();
  const reopened=createLocalInstallUI({...options,view:restored.developerView,getProject:()=>restored.view});t.after(()=>reopened.dispose());
  reopened.reset();assert.equal(reopened.saveLabel(),'核对安装状态');
  const count=methods.length;await reopened.prepare();
  assert.deepEqual(methods.slice(count),['listTaskCatalog'],'recovery reads the original ledger without replay');
  assert.equal(restored.view.previousInstallAttempt(),null);
  assert.equal(restored.view.previousInstallation().bindingId,binding.bindingId);
});
}
for(const kind of ['controller','page-userscript'])for(const lostAck of [false,true,'new-B-attempt']){
test(`dispatched ${kind} preserves A recovery hash across B selection: lostAck=${lostAck}`,async t=>{
  const f=fixture(t,{connected:true,saved:{bindingId:project.bindingId,sourceId:project.sourceId,localMode:true,paramsText:'{}'}});
  f.setProjects([{...project,runtimeKind:kind},{...project,bindingId:'local-b',sourceId:'source-b',runtimeKind:kind}]);await tick();
  const binding=f.view.capture(),sourceUtf8=kind==='controller'?'async function main(){return 1;}':'async function main(){return document.title;}';
  const source={bindingId:binding.bindingId,providerEpoch:binding.providerEpoch,projectId:'project-a',
    runtimeKind:kind,entryFormat:'async-main',sourceUtf8,sourceHash:await sha256Utf8(sourceUtf8),
    sourceBytes:new TextEncoder().encode(sourceUtf8).length,inputHash:'b'.repeat(64),siteOrigins:['https://example.com']};
  if(kind==='page-userscript')source.pageRules={matches:['https://example.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
  const resolve=f.client.requestLocalProject;
  f.client.requestLocalProject=(method,args)=>method==='project.resolve'?Promise.resolve(structuredClone(source)):resolve(method,args);
  const gate=deferred(),entered=deferred(),methods=[];
  let held=false,candidate=null,installed=null;
  f.client.request=async(method,args)=>{
    methods.push(method);
    if(['listTaskCatalog','listPagePrograms'].includes(method)){
      if(!held&&f.view.previousInstallAttempt()){
        held=true;entered.resolve();await gate.promise;
      }
      return {catalog:candidate?[candidate]:[],installed:installed?[installed]:[]};
    }
    if(method==='importTaskPackage'){
      candidate={...args.package.manifest,manifest:args.package.manifest,manifestHash:args.package.manifestHash,stage:'candidate'};
      return candidate;
    }
    if(method==='importPageCandidate'){
      candidate={programId:args.programId,revision:args.revision,sourceHash:source.sourceHash,
        manifestHash:'d'.repeat(64),pageRules:args.pageRules,stage:'Candidate'};return candidate;
    }
    if(method==='verifyTaskCandidate'){candidate.stage='verified';return candidate;}
    if(method==='verifyPageCandidate'){candidate.stage='Verified';return candidate;}
    if(method==='makeTaskAvailable'){candidate.stage='available';return candidate;}
    if(method==='makePageAvailable'){candidate.stage='Available';return candidate;}
    if(method==='installTask'||method==='installPageProgram'){
      assert.equal(f.view.selectedBindingId(),'local-b','the original operation completes while B is selected');
      installed=kind==='controller'?{taskId:args.taskId,version:args.version,manifestHash:args.manifestHash}:
        {programId:args.programId,revision:args.revision,sourceHash:source.sourceHash,manifestHash:args.manifestHash,
          pageRules:candidate.pageRules,title:args.title,nativeState:'registered',enabled:true,authorization:{status:'active'}};
      if(lostAck===true)throw Object.assign(new Error('installation ACK lost'),{code:'E_EFFECT_UNKNOWN'});
      return installed;
    }
    throw Error('unexpected '+method);
  };
  const target={status:'available',tabId:11,windowId:3,frameId:0,documentId:'doc-a',url:'https://example.com/form'};
  const options={client:f.client,api:{permissions:{contains:async()=>true}},currentPageTarget:{snapshot:target,revalidate:async()=>{}}};
  const ui=createLocalInstallUI({...options,view:f.developerView,getProject:()=>f.view});t.after(()=>{gate.resolve();ui.dispose();});
  ui.succeeded({source,binding,target,runId:'run-a'});await ui.prepare();ui.confirm({isTrusted:true});await entered.promise;
  assert.equal(f.view.previousInstallAttempt().attemptedManifestHash,null);
  f.find('local-project-select').value='local-b';f.find('local-project-select').fire('change');ui.reset();
  let replacement=null;
  if(lostAck==='new-B-attempt'){
    replacement={...f.view.previousInstallAttempt(),attemptId:'new-dispatched-hint',
      bindingId:'local-b',projectSourceId:'source-b'};
    await f.view.rememberInstallAttempt(replacement);
  }
  gate.resolve();
  for(let i=0;i<8;i++)await tick();
  assert.ok(installed,'A installation reached its original authority');
  assert.equal(f.view.previousInstallation(),null,'A completion cannot install a reference under B');
  const pending=f.view.previousInstallAttempt();
  if(replacement){
    assert.deepEqual(pending,replacement,'late A hash and completion cannot replace a newer B hint');
    assert.deepEqual(f.writes.at(-1)['opendesk.local-project.selection.v1'].lastUnknownInstall,replacement);
    f.find('local-project-select').value=project.bindingId;f.find('local-project-select').fire('change');ui.reset();
    assert.notEqual(ui.saveLabel(),'核对安装状态','B hint cannot become A recovery authority');
    return;
  }
  assert.equal(pending.bindingId,binding.bindingId);assert.equal(pending.projectSourceId,project.sourceId);
  assert.equal(pending.attemptedManifestHash,installed.manifestHash,'the original A hint must retain its exact candidate hash');
  assert.equal(f.writes.at(-1)['opendesk.local-project.selection.v1'].lastUnknownInstall.attemptedManifestHash,installed.manifestHash);
  f.find('local-project-select').value=project.bindingId;f.find('local-project-select').fire('change');ui.reset();
  assert.equal(ui.saveLabel(),'核对安装状态');
  const count=methods.length;await ui.prepare();
  assert.deepEqual(methods.slice(count),[kind==='controller'?'listTaskCatalog':'listPagePrograms'],'return to A only reads the original ledger');
  assert.equal(f.view.previousInstallAttempt(),null);assert.equal(f.view.previousInstallation().bindingId,binding.bindingId);
});
}
for(const kind of ['controller','page-userscript'])for(const outcome of ['resolve','reject']){
test(`Local ${kind} awaits strict candidate hash storage: ${outcome}`,async t=>{
  const f=fixture(t,{connected:true});f.setProjects([{...project,runtimeKind:kind}]);await tick();
  const binding=f.view.capture(),sourceUtf8=kind==='controller'?'async function main(){return 1;}':'async function main(){return document.title;}';
  const source={bindingId:binding.bindingId,providerEpoch:binding.providerEpoch,projectId:'project-a',runtimeKind:kind,
    entryFormat:'async-main',sourceUtf8,sourceHash:await sha256Utf8(sourceUtf8),sourceBytes:new TextEncoder().encode(sourceUtf8).length,
    inputHash:'b'.repeat(64),siteOrigins:['https://example.com']};
  if(kind==='page-userscript')source.pageRules={matches:['https://example.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
  const resolve=f.client.requestLocalProject;
  f.client.requestLocalProject=(method,args)=>method==='project.resolve'?Promise.resolve(structuredClone(source)):resolve(method,args);
  const hashGate=deferred(),hashEntered=deferred(),methods=[];
  const save=f.api.storage.local.set;
  f.api.storage.local.set=async value=>{
    const hint=value['opendesk.local-project.selection.v1'].lastUnknownInstall;
    if(hint?.attemptedManifestHash){hashEntered.resolve(hint.attemptedManifestHash);await hashGate.promise;}
    return save(value);
  };
  let candidate=null,installed=null;
  f.client.request=async(method,args)=>{
    methods.push(method);
    if(['listTaskCatalog','listPagePrograms'].includes(method))return {catalog:candidate?[candidate]:[],installed:installed?[installed]:[]};
    if(method==='importTaskPackage'){
      candidate={...args.package.manifest,manifest:args.package.manifest,manifestHash:args.package.manifestHash,stage:'candidate'};return candidate;
    }
    if(method==='importPageCandidate'){
      candidate={programId:args.programId,revision:args.revision,sourceHash:source.sourceHash,
        manifestHash:'d'.repeat(64),pageRules:args.pageRules,stage:'Candidate'};return candidate;
    }
    if(method==='verifyTaskCandidate'){candidate.stage='verified';return candidate;}
    if(method==='verifyPageCandidate'){candidate.stage='Verified';return candidate;}
    if(method==='makeTaskAvailable'){candidate.stage='available';return candidate;}
    if(method==='makePageAvailable'){candidate.stage='Available';return candidate;}
    if(method==='installTask'||method==='installPageProgram'){
      installed=kind==='controller'?{taskId:args.taskId,version:args.version,manifestHash:args.manifestHash}:
        {programId:args.programId,revision:args.revision,sourceHash:source.sourceHash,manifestHash:args.manifestHash,
          pageRules:candidate.pageRules,title:args.title,nativeState:'registered',enabled:true,authorization:{status:'active'}};
      return installed;
    }
    throw Error('unexpected '+method);
  };
  const target={status:'available',tabId:11,windowId:3,frameId:0,documentId:'doc-a',url:'https://example.com/form'};
  const ui=createLocalInstallUI({client:f.client,api:{permissions:{contains:async()=>true}},view:f.developerView,
    currentPageTarget:{snapshot:target,revalidate:async()=>{}},getProject:()=>f.view});
  t.after(()=>{hashGate.resolve();ui.dispose();});
  ui.succeeded({source,binding,target,runId:'run-a'});await ui.prepare();ui.confirm({isTrusted:true});
  const attemptedHash=await hashEntered.promise;await tick();
  const hints=()=>f.writes.map(row=>row['opendesk.local-project.selection.v1'].lastUnknownInstall);
  assert.ok(hints().some(hint=>hint&&hint.attemptedManifestHash===null),'the original null hint must already be persisted');
  assert.equal(hints().some(hint=>hint?.attemptedManifestHash===attemptedHash),false,'the exact hash write is genuinely pending');
  const allowed=kind==='controller'?['listTaskCatalog']:['listPagePrograms','importPageCandidate'];
  assert.ok(methods.every(method=>allowed.includes(method)),
    'pending exact-hash storage blocks Controller import and Page Verify/Install');
  if(outcome==='reject')hashGate.reject(Object.assign(new Error('candidate hash write rejected'),{code:'E_STORAGE_WRITE'}));
  else hashGate.resolve();
  for(let i=0;i<50&&(outcome==='resolve'?!installed:!f.find('local-install-status').textContent.includes('E_STORAGE_WRITE'));i++)await tick();
  if(outcome==='reject'){
    assert.match(f.find('local-install-status').textContent,/E_STORAGE_WRITE/);
    assert.equal(installed,null,'failed exact-hash persistence cannot install');
    assert.ok(methods.every(method=>allowed.includes(method)),'failed storage cannot cross the next mutation boundary');
  }else{
    assert.ok(hints().some(hint=>hint?.attemptedManifestHash===attemptedHash));
    assert.equal(installed?.manifestHash,attemptedHash);
  }
});
}
test('Local attempt storage only propagates write failures for strict saves',async t=>{
  const f=fixture(t,{connected:true});await tick();
  const error=Object.assign(new Error('disk write rejected'),{code:'E_STORAGE_WRITE'});
  f.api.storage.local.set=async()=>{throw error;};
  await assert.doesNotReject(f.view.rememberInstallAttempt(null));
  await assert.rejects(f.view.rememberInstallAttempt(null,{strict:true}),error);
});
test('file-only catalog stays metadata-only and opens only through a trusted explicit action',async t=>{
  const f=fixture(t,{files:[workspace]});await tick();
  const binding='file-workspace:'+workspace.workspaceId;
  assert.equal(f.find('local-project-select').value,binding);
  assert.match(f.find('local-project-select').options[1].label,/prompt-shortcuts · 文件工作区/);
  assert.equal(f.find('local-project-select').disabled,false);
  assert.equal(f.find('local-project-status').dataset.state,'entry-unavailable');
  assert.match(f.find('local-project-status').textContent,/所选目录已连接.*实时开发预览.*不要求可运行源码 Provider/);
  assert.equal(f.find('local-project-connect').textContent,'打开文件工作区 ↗');
  assert.equal(f.view.connected(),false);
  assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
  await assert.rejects(f.view.resolve({generation:0,bindingId:binding,providerEpoch:null}),{code:'E_DEV_CONFLICT'});
  assert.deepEqual(f.opened,[]);
  f.find('local-project-select').fire('change');assert.deepEqual(f.opened,[]);
  f.find('local-project-connect').fire('click',{isTrusted:false});assert.deepEqual(f.opened,[]);
  f.find('local-project-connect').fire('click');await tick();
  assert.deepEqual(f.opened,[{url:'chrome-extension://test/native-agent/workspace.html?sourceId='+workspace.sourceId}]);
  assert.deepEqual(f.calls,['status','workspaces.list']);
  assert.equal(f.writes.at(-1)['opendesk.local-project.selection.v1'].bindingId,binding);
});
test('workspace without sourceId opens by workspaceId and saved file selection restores safely',async t=>{
  const {sourceId,...file}=workspace,binding='file-workspace:'+file.workspaceId;
  const f=fixture(t,{files:[file],saved:{bindingId:binding,name:file.name,paramsText:'{"saved":true}'}});await tick();
  assert.equal(f.view.selectedBindingId(),binding);
  assert.equal(f.find('local-project-params').value,'{"saved":true}');
  f.find('local-project-connect').fire('click');await tick();
  assert.equal(f.opened[0].url,'chrome-extension://test/native-agent/workspace.html?workspaceId='+file.workspaceId);
  assert.equal(f.view.connected(),false);
});
test('a directory without an executable binding allows file opening while Run stays unavailable',async t=>{
  const f=fixture(t,{files:[workspace]});await tick();
  assert.equal(f.view.selectionKind(),'file-workspace');
  assert.equal(f.view.canOpenWorkspace(),true);
  assert.equal(f.find('local-project-params-tools').hidden,true);
  assert.equal(f.view.canAttemptRun(),false);
  assert.equal(f.view.openWorkspace({isTrusted:false}),false);
  assert.equal(f.view.openWorkspace({isTrusted:true}),true);await tick();
  assert.equal(f.opened.length,1);
  f.setFiles([]);f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.view.selectionKind(),'missing');
  assert.equal(f.view.canOpenWorkspace(),false);
  assert.equal(f.view.openWorkspace({isTrusted:true}),false);
  assert.equal(f.opened.length,1);
});
test('workspace open failure names the operation and remains actionable across unchanged polling',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t,{files:[workspace]});await tick();
  // Component fixture only; actual browser actions are validated separately.
  const apiFailure=Object.assign(new Error('Tab creation failed'),{code:'E_TAB_CREATE'});
  f.opened.push=()=>{throw apiFailure;};
  f.view.openWorkspace({isTrusted:true});await tick();
  const message=f.find('local-project-status').textContent;
  assert.match(message,/未能打开文件工作区.*E_TAB_CREATE/);
  assert.match(message,/重试/);
  assert.doesNotMatch(message,/连接设置|扩展选项/);
  const before=f.activity();
  t.mock.timers.tick(4000);await tick();
  assert.equal(f.find('local-project-status').textContent,message);
  assert.deepEqual(f.activity(),before);
});
test('runnable source errors show the actual failing entry and repair direction',async t=>{
  const f=fixture(t,{connected:true});
  f.setProjects([{...project,preparation:{state:'source-error',error:{code:'E_ENTRY',message:'入口 src/missing.js 不存在'}}}]);
  await tick();
  assert.equal(f.view.selectionKind(),'program');
  assert.match(f.find('local-project-status').textContent,/E_ENTRY.*src\/missing\.js.*修改/);
  assert.equal(f.view.canAttemptRun(),false);
  assert.equal(f.view.openWorkspace({isTrusted:true}),false);
  assert.deepEqual(f.opened,[]);
});
test('preparation identity and diagnostics follow canonical input and artifact revisions',async t=>{
  const f=fixture(t,{connected:true}),sourceHash='a'.repeat(64);
  const row=(revision,artifact)=>({...project,preparation:{state:'ready',sourceHash,sourceRevision:revision,artifactId:artifact}});
  f.setProjects([row('b'.repeat(64),'c'.repeat(64))]);await tick();
  const initial=f.view.preparationIdentity();
  assert.match(f.find('local-project-diagnostics').textContent,new RegExp('输入版本：'+'b'.repeat(64)));
  f.setProjects([row('d'.repeat(64),'c'.repeat(64))]);f.notify({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});await tick();
  const changedInput=f.view.preparationIdentity();
  assert.notEqual(changedInput,initial,'changed input must invalidate a prepared install even when executable bytes are unchanged');
  assert.match(f.find('local-project-diagnostics').textContent,new RegExp('输入版本：'+'d'.repeat(64)));
  f.setProjects([row('d'.repeat(64),'e'.repeat(64))]);f.notify({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});await tick();
  assert.notEqual(f.view.preparationIdentity(),changedInput,'a new artifact must invalidate the captured preparation');
});
test('resolve rejects newer input under unchanged executable bytes and a stale ready catalog',async t=>{
  const f=fixture(t,{connected:true}),sourceUtf8='async function main(){return 1;}',
    sourceHash=(await import('node:crypto')).createHash('sha256').update(sourceUtf8).digest('hex'),revision='b'.repeat(64);
  f.setProjects([{...project,preparation:{state:'ready',sourceHash,sourceRevision:revision}}]);
  f.notify({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});await tick();
  assert.equal(f.view.capture().preparedSourceRevision,revision);
  const request=f.client.requestLocalProject;
  let returnedRevision=revision;
  f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?{
    bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:'page-userscript',sourceUtf8,
    sourceBytes:Buffer.byteLength(sourceUtf8),sourceHash,sourceRevision:returnedRevision,inputHash:returnedRevision
  }:request(method,params);
  assert.equal((await f.view.resolve(f.view.capture())).sourceHash,sourceHash,'matching prepared input remains runnable');
  returnedRevision='c'.repeat(64);
  await assert.rejects(f.view.resolve(f.view.capture()),{code:'E_DEV_CONFLICT'});
});
test('quiet discovery and revocation update availability without changing an empty or offline selection',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const other={...workspace,workspaceId:workspace.workspaceId.slice(0,-1)+'2',sourceId:'source-'+'b'.repeat(24),name:'other files'};
  for(const saved of [undefined,{bindingId:'old-project',name:'offline project',paramsText:'{}'}]){
    const f=fixture(t,{saved});await tick();
    assert.equal(f.find('local-project-select').disabled,true);
    f.setFiles([workspace,other]);t.mock.timers.tick(2000);await tick();
    assert.equal(f.find('local-project-select').disabled,false);
    assert.equal(f.view.selectedBindingId(),saved?.bindingId||'');
    assert.equal(f.find('local-project-status').dataset.state,'selection-needed');
    assert.match(f.find('local-project-status').textContent,/请选择已授权项目/);
    f.setFiles([]);t.mock.timers.tick(2000);await tick();
    assert.equal(f.find('local-project-select').disabled,true);
    assert.equal(f.view.selectedBindingId(),saved?.bindingId||'');
    f.view.dispose();
  }
});
test('mixed catalog deduplicates runnable workspace and keeps file selections unable to run',async t=>{
  const other={...workspace,workspaceId:workspace.workspaceId.slice(0,-1)+'2',sourceId:'source-'+'b'.repeat(24),name:'files only'};
  const f=fixture(t,{connected:true,files:[workspace,other]});
  f.setProjects([{...project,sourceId:workspace.sourceId}]);await tick();
  assert.deepEqual(f.find('local-project-select').options.map(row=>row.value),['',project.bindingId,'file-workspace:'+other.workspaceId]);
  f.find('local-project-select').value=project.bindingId;f.find('local-project-select').fire('change');
  const captured=f.view.capture();assert.equal(f.view.connected(),true);
  f.find('local-project-select').value='file-workspace:'+other.workspaceId;f.find('local-project-select').fire('change');
  assert.equal(f.view.connected(),false);assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
  assert.throws(()=>f.view.assertCaptured(captured),{code:'E_DEV_CONFLICT'});
  f.setProjects([{...project,workspaceId:workspace.workspaceId,sourceId:'source-other'}]);
  f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.find('local-project-select').options.length,4,'conflicting source identity must not hide a workspace');
});
test('file revocation removes live metadata, retains an offline selection and blocks opening',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t,{files:[workspace]});await tick();const binding=f.view.selectedBindingId();
  f.setFiles([]);t.mock.timers.tick(2000);await tick();
  assert.equal(f.view.selectedBindingId(),binding);
  assert.match(f.find('local-project-select').options.at(-1).label,/离线/);
  assert.equal(f.find('local-project-select').disabled,true);
  assert.notEqual(f.find('local-project-connect').textContent,'打开文件工作区 ↗');
  f.find('local-project-connect').fire('click');await tick();assert.deepEqual(f.opened,['options']);
  assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
  f.setFiles([workspace]);t.mock.timers.tick(2000);await tick();
  assert.equal(f.find('local-project-status').dataset.state,'entry-unavailable');
  f.notify({connected:false,nativeConnected:false,providerEpoch:null});
  assert.equal(f.find('local-project-select').disabled,true);assert.equal(f.view.connected(),false);
});
test('unchanged disconnected, file-only and runnable idle polls and duplicate notifications do not mutate DOM or notify editor',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  for(const config of [{nativeConnected:false},{},{files:[workspace]},{connected:true}]){
    const f=fixture(t,config);await tick();const before=f.activity(),options=f.find('local-project-select').options;
    for(let i=0;i<3;i++){t.mock.timers.tick(2000);await tick();}
    f.notify({connected:config.connected===true,nativeConnected:config.nativeConnected!==false,providerEpoch:config.connected?'epoch-a':null});await tick();
    assert.deepEqual(f.activity(),before,JSON.stringify(config));
    assert.equal(f.find('local-project-select').options,options);
    f.view.dispose();
  }
});
test('optional catalog rejects malformed metadata or unavailable bridge without breaking runnable flow',async t=>{
  for(const value of [{projects:[project]},fileCatalog([{...workspace,access:'owner'}]),{workspaces:[workspace]},fileCatalog([{...workspace,workspaceId:'javascript:alert(1)'}]),fileCatalog([{...workspace,sourceId:'bad'}]),fileCatalog([{...workspace,sourceId:''}]),fileCatalog([{...workspace,leaseEpoch:42}]),Object.assign(new Error('old bridge'),{code:'E_SCHEMA'}),Object.assign(new Error('offline'),{code:'E_FILES_DISCONNECTED'}),Object.assign(new Error('timeout'),{code:'E_FILES_TIMEOUT'})]){
    const f=fixture(t,{connected:true}),request=f.client.requestLocalProject;
    f.client.requestLocalProject=async(method,params)=>{if(method!=='workspaces.list')return request(method,params);if(value instanceof Error)throw value;return value;};
    await tick();assert.equal(f.view.connected(),true);assert.equal(f.find('local-project-select').options.length,2);
    assert.equal(f.view.capture().bindingId,project.bindingId);f.view.dispose();
  }
});
test('older statuses without explicit Native connectivity never query file metadata or infer file authority',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  for(const state of [{connected:true,providerEpoch:'epoch-a'},{connected:true,nativeConnected:false,providerEpoch:'epoch-a'},{connected:false}]){
    const f=fixture(t,{files:[workspace]});f.setState(state);await tick();
    t.mock.timers.tick(2000);await tick();
    assert.equal(f.calls.includes('workspaces.list'),false);
    assert.equal(f.view.connected(),state.connected);
    assert.equal(f.find('local-project-select').options.some(row=>/文件工作区/.test(row.label)),false);
    f.view.dispose();
  }
});
test('slow optional file catalog does not block runnable readiness or source metadata checks',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t,{connected:true}),gate=deferred(),request=f.client.requestLocalProject;
  let fileReads=0;
  f.client.requestLocalProject=async(method,params)=>{
    if(method==='workspaces.list'){fileReads++;return gate.promise;}
    return request(method,params);
  };
  await tick();assert.equal(f.view.connected(),true);
  const captured=f.view.capture();
  t.mock.timers.tick(2000);await f.view.assertReady(captured);await tick();
  assert.equal(fileReads,1);assert.equal(f.view.connected(),true);
  assert.equal(f.find('local-project-select').options.length,2);
  gate.resolve(fileCatalog([workspace]));await tick();
  assert.equal(f.find('local-project-select').options.length,3);
  f.view.assertCaptured(captured);
});
test('slow disconnected recovery stays quiet, skips timer ticks and invalidates late file discovery on mode switch',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t);await tick();const gate=deferred(),request=f.client.requestLocalProject;let reads=0;
  f.client.requestLocalProject=async(method,params)=>{if(method==='status'){reads++;return gate.promise;}return request(method,params);};
  const before=f.activity();
  t.mock.timers.tick(2000);await tick();t.mock.timers.tick(6000);await tick();
  assert.deepEqual(f.activity(),before);assert.equal(reads,1);
  f.find('local-project-mode').checked=false;f.find('local-project-mode').fire('change');
  const switched=f.activity();gate.resolve({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});await tick();
  assert.deepEqual(f.activity(),switched);assert.equal(f.view.connected(),false);
});
test('changing selection among live rows and reordered file metadata never rebuilds idle options',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const other={...workspace,workspaceId:workspace.workspaceId.slice(0,-1)+'2',name:'other files'};
  const f=fixture(t,{connected:true,files:[workspace,other]});await tick();
  f.find('local-project-select').value='file-workspace:'+other.workspaceId;f.find('local-project-select').fire('change');
  const before=f.activity(),options=f.find('local-project-select').options;
  f.setFiles([other,workspace]);t.mock.timers.tick(2000);await tick();
  assert.equal(f.find('local-project-select').options,options);assert.deepEqual(f.activity(),before);
});
test('file metadata remains independently available when the runnable catalog errors',async t=>{
  const f=fixture(t,{connected:true,files:[workspace]}),request=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>{if(method==='projects.list')throw Object.assign(new Error('provider unavailable'),{code:'E_DEV_CATALOG'});return request(method,params);};
  await tick();
  assert.equal(f.find('local-project-status').dataset.state,'entry-unavailable');
  assert.equal(f.view.connected(),false);assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
  f.find('local-project-connect').fire('click');await tick();assert.match(f.opened[0].url,/workspace.html\?sourceId=/);
});
test('Native online without a source provider is distinct from a disconnected bridge',async t=>{
  const f=fixture(t);await tick();
  assert.equal(f.find('local-project-status').dataset.state,'source-unavailable');
  assert.match(f.find('local-project-status').textContent,/本机 OpenDesk 已连接/);
  assert.match(f.find('local-project-status').textContent,/opendesk-dev/);
  assert.match(f.find('local-project-status').title,/E_DEV_PROVIDER_UNAVAILABLE/);
  assert.equal(f.find('local-project-select').disabled,true);
  assert.equal(f.view.connected(),false);
  assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
  assert.deepEqual(f.calls,['status','workspaces.list']);
  assert.equal(f.find('local-project-refresh').disabled,false);
});
test('a disconnected Native bridge retains the connection recovery message',async t=>{
  const f=fixture(t,{nativeConnected:false});await tick();
  assert.equal(f.find('local-project-status').dataset.state,'disconnected');
  assert.match(f.find('local-project-status').textContent,/本地项目服务未连接/);
  assert.match(f.find('local-project-status').title,/E_DEV_DISCONNECTED/);
});
test('refresh after the provider registers enables and selects the authorized project without executing',async t=>{
  const f=fixture(t);await tick();
  f.setState({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});
  f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.find('local-project-select').disabled,false);
  assert.equal(f.find('local-project-select').value,'local-a');
  assert.equal(f.view.connected(),true);
  assert.equal(f.view.capture().providerEpoch,'epoch-a');
  assert.deepEqual(f.calls,['status','workspaces.list','status','workspaces.list','projects.list']);
});
test('metadata polling recovers a missed online notification and stops on disposal',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t);await tick();
  f.setState({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});
  t.mock.timers.tick(2000);await tick();
  assert.equal(f.view.connected(),true);
  assert.deepEqual(f.calls,['status','workspaces.list','status','workspaces.list','projects.list']);
  f.view.dispose();t.mock.timers.tick(4000);await tick();
  assert.equal(f.calls.length,5);
});
test('provider disappearance invalidates an in-flight catalog and cannot enable a stale project',async t=>{
  const f=fixture(t,{connected:true});await tick();const captured=f.view.capture(),gate=deferred();
  f.client.requestLocalProject=async method=>method==='status'?{connected:true,nativeConnected:true,providerEpoch:'epoch-a'}:gate.promise;
  f.find('local-project-refresh').fire('click');await tick();
  f.notify({connected:false,nativeConnected:true,providerEpoch:null});
  gate.resolve({providerEpoch:'epoch-a',projects:[project]});await tick();
  assert.equal(f.view.connected(),false);
  assert.equal(f.find('local-project-select').disabled,true);
  assert.equal(f.find('local-project-status').dataset.state,'source-unavailable');
  assert.throws(()=>f.view.assertCaptured(captured),{code:'E_DEV_CONFLICT'});
});
test('a saved offline selection never silently switches to another authorized project',async t=>{
  const f=fixture(t,{connected:true,saved:{bindingId:'local-old',name:'Earlier project',sourceId:'source-old'}});await tick();
  assert.equal(f.view.selectedBindingId(),'local-old');
  assert.equal(f.view.connected(),false);
  assert.equal(f.find('local-project-select').disabled,false);
  f.find('local-project-select').value='local-a';f.find('local-project-select').fire('change');
  assert.equal(f.view.connected(),true);
  assert.deepEqual(f.calls,['status','workspaces.list','projects.list']);
});
test('an unsupported Native source transfer requires an update and metadata polls never disguise it as ready',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t,{connected:true});await tick();const request=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>{
    if(method==='project.resolve')throw Object.assign(new Error('Native source transfer unsupported'),{code:'E_NATIVE_UPDATE_REQUIRED'});
    return request(method,params);
  };
  await assert.rejects(f.view.resolve(f.view.capture()),{code:'E_NATIVE_UPDATE_REQUIRED'});
  assert.equal(f.find('local-project-status').dataset.state,'update-required');
  assert.match(f.find('local-project-status').textContent,/更新本机应用/);
  assert.doesNotMatch(f.find('local-project-status').textContent,/源码有错误/);
  assert.equal(f.view.connected(),false);
  assert.throws(()=>f.view.capture(),{code:'E_NATIVE_UPDATE_REQUIRED'});
  t.mock.timers.tick(2000);await tick();
  assert.equal(f.find('local-project-status').dataset.state,'update-required');
  assert.equal(f.view.connected(),false);
  f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.view.connected(),true,'an explicit refresh permits a new compatibility check');
});
test('a failed status request clears stale Native connectivity without inferring disconnect from a catalog failure',async t=>{
  const f=fixture(t,{connected:true});await tick();
  f.client.requestLocalProject=async method=>{
    if(method==='status')return {connected:true,nativeConnected:true,providerEpoch:'epoch-a'};
    throw Object.assign(new Error('catalog unavailable'),{code:'E_DEV_CATALOG'});
  };
  f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.find('local-project-status').dataset.state,'source-unavailable');
  f.client.requestLocalProject=async()=>{throw Object.assign(new Error('offline'),{code:'E_DEV_DISCONNECTED'});};
  f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.find('local-project-status').dataset.state,'disconnected');
  assert.match(f.find('local-project-status').textContent,/本地项目服务未连接/);
});
test('slow metadata polling skips timer ticks and readiness settles after the current catalog check',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t,{connected:true});await tick();const captured=f.view.capture(),gate=deferred();let reads=0;
  f.client.requestLocalProject=async method=>{if(method==='workspaces.list')return fileCatalog([]);reads++;return gate.promise;};
  t.mock.timers.tick(2000);await tick();
  let ready=false;const waiting=f.view.assertReady(captured).then(()=>{ready=true;});
  t.mock.timers.tick(6000);await tick();
  assert.equal(reads,1);assert.equal(ready,false);
  gate.resolve({providerEpoch:'epoch-a',projects:[project]});await waiting;
  assert.equal(reads,1);assert.equal(ready,true);
});
test('provider notifications queue at most one follow-up metadata check',async t=>{
  const f=fixture(t,{connected:true});await tick();const captured=f.view.capture(),first=deferred(),second=deferred();let reads=0;
  f.client.requestLocalProject=async method=>{if(method==='workspaces.list')return fileCatalog([]);reads++;return reads===1?first.promise:second.promise;};
  const online={connected:true,nativeConnected:true,providerEpoch:'epoch-a'};
  f.notify(online);await tick();f.notify(online);
  const waiting=f.view.assertReady(captured);
  first.resolve({providerEpoch:'epoch-a',projects:[project]});await tick();
  f.notify(online);second.resolve({providerEpoch:'epoch-a',projects:[project]});await waiting;
  assert.equal(reads,2);
});
test('an old source response is rejected after disconnect or a new provider epoch',async t=>{
  for(const state of [{connected:false,nativeConnected:false,providerEpoch:null},{connected:true,nativeConnected:true,providerEpoch:'epoch-b'}]){
    const f=fixture(t,{connected:true});await tick();const gate=deferred(),request=f.client.requestLocalProject;
    f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?gate.promise:request(method,params);
    const resolving=f.view.resolve(f.view.capture());
    f.setState(state);f.notify(state);await tick();
    gate.resolve({providerEpoch:'epoch-a',bindingId:project.bindingId});
    await assert.rejects(resolving,{code:'E_DEV_CONFLICT'});
    f.view.dispose();
  }
});
test('a late offline status response cannot refresh after switching modes or disposing',async t=>{
  for(const action of ['manual','dispose']){
    t.mock.timers.enable({apis:['setInterval']});
    const f=fixture(t);await tick();const gate=deferred();let reads=0;
    f.client.requestLocalProject=async method=>{if(method==='workspaces.list')return fileCatalog([]);reads++;return gate.promise;};
    t.mock.timers.tick(2000);await tick();
    if(action==='manual'){f.find('local-project-mode').checked=false;f.find('local-project-mode').fire('change');}else f.view.dispose();
    gate.resolve({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});await tick();
    assert.equal(reads,1);assert.equal(f.view.connected(),false);
    f.view.dispose();t.mock.timers.reset();
  }
});

test('local readiness hides connection help and Page parameters, without hiding offline recovery',async t=>{
  const f=fixture(t,{connected:true});await tick();
  assert.equal(f.find('local-project-recovery').hidden,true);
  assert.equal(f.find('local-project-connect').hidden,true);
  assert.equal(f.find('local-project-params-tools').hidden,true);
  assert.equal(f.view.readyForRun(),true);
  f.notify({connected:false,nativeConnected:false,providerEpoch:null});await tick();
  assert.equal(f.find('local-project-recovery').hidden,false);
  assert.equal(f.find('local-project-connect').hidden,false);
  assert.equal(f.view.readyForRun(),false);
});
for(const change of ['same','sourceHash','inputHash'])test(`resolved source stabilizes install review before background summary: ${change}`,async t=>{
  const f=fixture(t,{connected:true,preparationDelayMs:250});
  f.setProjects([{...project,runtimeKind:'controller',preparation:undefined}]);
  const sourceUtf8='async function main(){return 1;}';
  const source={bindingId:project.bindingId,providerEpoch:'epoch-a',projectId:'project-a',
    runtimeKind:'controller',entryFormat:'async-main',sourceUtf8,sourceHash:await sha256Utf8(sourceUtf8),
    sourceBytes:Buffer.byteLength(sourceUtf8),inputHash:'a'.repeat(64),siteOrigins:['https://example.com']};
  const request=f.client.requestLocalProject;let reads=0;
  const entered=deferred(),background=deferred();t.after(()=>background.resolve(source));
  f.client.requestLocalProject=async(method,args)=>{
    if(method!=='project.resolve')return request(method,args);
    if(++reads===3){entered.resolve();return background.promise;}
    return structuredClone(source);
  };
  f.client.request=async method=>{assert.equal(method,'listTaskCatalog');return {catalog:[],installed:[]};};
  await tick();
  const binding=f.view.capture(),resolved=await f.view.resolve(binding);
  const target={status:'available',tabId:11,windowId:3,frameId:0,documentId:'doc-a',url:'https://example.com/form'};
  const ui=createLocalInstallUI({client:f.client,api:{permissions:{contains:async()=>true}},
    view:f.developerView,getProject:()=>f.view,currentPageTarget:{snapshot:target,revalidate:async()=>{}}});
  t.after(()=>ui.dispose());
  ui.succeeded({source:resolved,binding,target,runId:'verified-run'});
  await ui.prepare();
  assert.equal(f.find('local-install-review').hidden,false);
  await entered.promise;
  const later=structuredClone(source);
  if(change==='inputHash')later.inputHash='b'.repeat(64);
  if(change==='sourceHash'){
    later.sourceUtf8='async function main(){return 2;}';
    later.sourceHash=await sha256Utf8(later.sourceUtf8);later.sourceBytes=Buffer.byteLength(later.sourceUtf8);
  }
  background.resolve(later);await tick();await tick();ui.update();
  assert.equal(f.find('local-install-review').hidden,change!=='same',
    'same validated bytes keep the review; changed source/input must invalidate it');
  assert.equal(f.find('local-install-confirm').disabled,change!=='same');
});
test('catalogs without preparation metadata only read selected authorized source and verify hash',async t=>{
  const f=fixture(t,{connected:true});f.setProjects([{...project,preparation:undefined}]);
  const sourceUtf8='async function main() { return 1; }';
  const {createHash}=await import('node:crypto');
  const sourceHash=createHash('sha256').update(sourceUtf8).digest('hex');
  const prior=f.client.requestLocalProject,reads=[];
  f.client.requestLocalProject=async(method,params)=>{
    if(method==='project.resolve'){
      reads.push(params.bindingId);
      return {bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:'page-userscript',
        sourceUtf8,sourceBytes:Buffer.byteLength(sourceUtf8),sourceHash,inputHash:'a'.repeat(64)};
    }
    return prior(method,params);
  };
  await tick();f.find('local-project-refresh').fire('click');
  for(let n=0;n<20&&!f.view.readyForRun();n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(reads.length>=1&&reads.length<=2&&reads.every(binding=>binding==='local-a'),
    'initial preparation and explicit Refresh may each read ONLY the selected authorized binding');
  assert.equal(f.view.readyForRun(),true);
  assert.equal(f.find('local-project-status').dataset.state,'ready');
  assert.match(f.find('local-project-diagnostics').textContent,/源码 SHA-256/);
  assert.equal((await f.view.resolve(f.view.capture())).sourceHash,sourceHash);
});
for(const runtimeKind of ['controller','page-userscript'])for(const preparationState of [undefined,'ready']){
test(`catalog runtime omission uses verified source for parameter visibility: ${runtimeKind}, preparation=${preparationState}`,async t=>{
  const sourceUtf8='async function main() { return 1; }',sourceHash=await sha256Utf8(sourceUtf8);
  const f=fixture(t,{connected:true});
  f.setProjects([{...project,runtimeKind:undefined,preparation:preparationState?
    {state:preparationState,sourceHash,sourceRevision:'a'.repeat(64)}:undefined}]);
  const prior=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?
    {bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind,sourceUtf8,
      sourceBytes:Buffer.byteLength(sourceUtf8),sourceHash,inputHash:'a'.repeat(64)}:prior(method,params);
  await tick();
  for(let n=0;n<20&&!f.view.readyForRun();n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.view.readyForRun(),true);
  assert.equal(f.find('local-project-params-tools').hidden,runtimeKind!=='controller');
  assert.match(f.find('local-project-diagnostics').textContent,new RegExp(`（${runtimeKind}）`));
  f.find('local-project-params').value='{"query":"OpenDesk Browser","limit":3}';
  f.find('local-project-mode').checked=false;f.find('local-project-mode').fire('change');
  assert.equal(f.find('local-project-params-tools').hidden,true);
  assert.equal(f.find('local-project-params').value,'{"query":"OpenDesk Browser","limit":3}');
  assert.ok(!f.calls.includes('run.start'),'preparing parameters must not execute');
});
}
for(const mismatch of ['sourceHash','sourceRevision']){
test(`catalog runtime omission rejects ready summary mismatch: ${mismatch}`,async t=>{
  const sourceUtf8='async function main() { return 1; }',sourceHash=await sha256Utf8(sourceUtf8);
  const sourceRevision='a'.repeat(64),entered=deferred(),reply=deferred();
  const f=fixture(t,{connected:true});
  f.setProjects([{...project,runtimeKind:undefined,preparation:{state:'ready',sourceHash,sourceRevision}}]);
  const prior=f.client.requestLocalProject,reads=[],effects=[];
  f.client.requestLocalProject=async(method,params)=>{
    if(method!=='project.resolve')return prior(method,params);
    reads.push(params.bindingId);entered.resolve();return reply.promise;
  };
  f.client.request=async method=>{effects.push(method);throw Error('preparing source must not dispatch');};
  t.after(()=>reply.resolve());
  await entered.promise;
  const captured=f.view.capture();
  assert.equal(f.view.readyForRun(),false,'a ready summary without a verified runtime is not runnable');
  assert.equal(f.find('local-project-params-tools').hidden,true);
  const returnedSource=mismatch==='sourceHash'?sourceUtf8+' // changed':sourceUtf8;
  reply.resolve({bindingId:project.bindingId,providerEpoch:'epoch-a',runtimeKind:'controller',
    sourceUtf8:returnedSource,sourceBytes:Buffer.byteLength(returnedSource),
    sourceHash:await sha256Utf8(returnedSource),inputHash:sourceRevision,
    sourceRevision:mismatch==='sourceRevision'?'b'.repeat(64):sourceRevision});
  for(let n=0;n<20&&f.find('local-project-status').dataset.state!=='source-error';n++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.find('local-project-status').dataset.state,'source-error');
  assert.match(f.find('local-project-diagnostics').textContent,/E_DEV_HASH/);
  assert.equal(f.find('local-project-params-tools').hidden,true,'rejected bytes cannot reveal Controller parameters');
  assert.equal(f.view.readyForRun(),false);
  assert.equal(f.view.canAttemptRun(),false);
  assert.throws(()=>f.view.capture(),{code:'E_DEV_SOURCE'});
  await assert.rejects(f.view.resolve(captured),{code:'E_DEV_CONFLICT'});
  assert.deepEqual(reads,[project.bindingId],'only the selected source is read; rejected source cannot be resolved again');
  assert.deepEqual(effects,[],'source preparation must never dispatch Page execution');
});
}
test('bad background SHA is non-executable and prior project stays visible offline',async t=>{
  const f=fixture(t,{connected:true,saved:{bindingId:'local-a',name:'TOC',localMode:true}});
  f.setProjects([{...project,preparation:undefined}]);
  const prior=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?
    {bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:'controller',
      sourceUtf8:'return 1',sourceBytes:8,sourceHash:'f'.repeat(64),inputHash:'a'.repeat(64)}:
    prior(method,params);
  await tick();f.find('local-project-refresh').fire('click');
  for(let n=0;n<20&&f.find('local-project-status').dataset.state!=='source-error';n++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.view.readyForRun(),false);
  assert.equal(f.find('local-project-status').dataset.state,'source-error');
  assert.throws(()=>f.view.capture(),{code:'E_DEV_SOURCE'});
  f.setProjects([]);f.find('local-project-refresh').fire('click');await tick();
  assert.match(f.find('local-project-select').options.at(-1).label,/离线/);
  assert.equal(f.view.readyForRun(),false);
});

test('Run admission rejects a changed authoritative source hash and runtime type',async t=>{
  for(const mismatch of ['source-hash','runtime-kind'])await t.test(mismatch,async t=>{
    const f=fixture(t,{connected:true});await tick();
    const {createHash}=await import('node:crypto');
    const hash=text=>createHash('sha256').update(text).digest('hex');
    const previous='async function main(){return 1}',next='async function main(){return 2}';
    f.setProjects([{...project,preparation:{state:'ready',sourceHash:hash(previous),sourceRevision:'a'.repeat(64)}}]);
    f.find('local-project-refresh').fire('click');await tick();
    const captured=f.view.capture(),original=f.client.requestLocalProject;
    f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?{
      bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:mismatch==='runtime-kind'?'controller':'page-userscript',
      sourceUtf8:mismatch==='runtime-kind'?previous:next,
      sourceHash:hash(mismatch==='runtime-kind'?previous:next),sourceBytes:Buffer.byteLength(mismatch==='runtime-kind'?previous:next)
    }:original(method,params);
    await assert.rejects(f.view.resolve(captured),{code:'E_DEV_CONFLICT'});
  });
});
test('read-only resolution does not claim the verified bytes already ran',async t=>{
  const f=fixture(t,{connected:true});await tick();
  const sourceUtf8='async function main(){return 1}',sourceHash=(await import('node:crypto')).createHash('sha256').update(sourceUtf8).digest('hex');
  const original=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?{
    bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:'page-userscript',sourceUtf8,
    sourceBytes:Buffer.byteLength(sourceUtf8),sourceHash
  }:original(method,params);
  await f.view.resolve(f.view.capture());
  assert.match(f.find('local-project-status').title,/最近读取源码（不代表已执行）/);
  assert.doesNotMatch(f.find('local-project-status').title,/上次运行源码/);
});

test('an authoritative updating source cannot dispatch a previously compiled valid hash',async t=>{
  const f=fixture(t,{connected:true});
  const sourceUtf8='async function main(){return 101;}';
  const sourceHash=(await import('node:crypto')).createHash('sha256').update(sourceUtf8).digest('hex');
  f.setProjects([{...project,preparation:{state:'updating',sourceHash}}]);
  const request=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?
    {bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:'page-userscript',
      sourceUtf8,sourceHash,sourceBytes:Buffer.byteLength(sourceUtf8)}:request(method,params);
  await tick();
  f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.view.readyForRun(),false);
  await assert.rejects(f.view.resolve(f.view.capture()),{code:'E_DEV_CONFLICT'});
  f.setProjects([{...project,preparation:{state:'ready',sourceHash}}]);
  f.notify({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});
  await tick();await tick();
  assert.equal(f.view.readyForRun(),true);
  assert.equal((await f.view.resolve(f.view.capture())).sourceHash,sourceHash);
});

test('final dispatch gate rejects an authoritative hash changed after a successful Resolve',async t=>{
  const f=fixture(t,{connected:true});
  const sourceUtf8='async function main(){return 102;}';
  const createHash=(await import('node:crypto')).createHash;
  const sourceHash=createHash('sha256').update(sourceUtf8).digest('hex');
  const laterHash=createHash('sha256').update(sourceUtf8+'// edited').digest('hex');
  f.setProjects([{...project,preparation:{state:'ready',sourceHash}}]);
  const request=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?
    {bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:'page-userscript',
      sourceUtf8,sourceHash,sourceBytes:Buffer.byteLength(sourceUtf8)}:request(method,params);
  await tick();
  f.find('local-project-refresh').fire('click');await tick();
  const binding=f.view.capture();
  assert.equal((await f.view.resolve(binding)).sourceHash,sourceHash);
  f.setProjects([{...project,preparation:{state:'ready',sourceHash:laterHash}}]);
  f.notify({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});
  await tick();await tick();
  await assert.rejects(f.view.assertReady(binding,sourceHash),{code:'E_DEV_CONFLICT'});
});


test('a selected directory follows its unique live program identity when the Provider registers',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t,{files:[workspace]});await tick();
  const prior=f.view.selectedBindingId();
  assert.equal(prior,'file-workspace:'+workspace.workspaceId);
  f.find('local-project-params').value='{"selected":true}';
  f.setProjects([{...project,sourceId:workspace.sourceId,workspaceId:workspace.workspaceId}]);
  f.setState({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});
  t.mock.timers.tick(2000);await tick();
  assert.equal(f.view.selectedBindingId(),project.bindingId);
  assert.equal(f.view.capture().bindingId,project.bindingId);
  assert.equal(f.view.canAttemptRun(),true);
  assert.equal(f.find('local-project-params').value,'{"selected":true}');
  assert.deepEqual(f.opened,[]);
  assert.ok(f.calls.every(method=>['status','workspaces.list','projects.list'].includes(method)), 'association must not resolve or execute source');
  const before=f.activity(),options=f.find('local-project-select').options;
  t.mock.timers.tick(6000);await tick();
  assert.deepEqual(f.activity(),before);
  assert.equal(f.find('local-project-select').options,options);
});

test('a restored directory selection associates only by matching current source, never project name',async t=>{
  for(const by of ['sourceId','workspaceId']){
    const saved={bindingId:'file-workspace:'+workspace.workspaceId,name:workspace.name,sourceId:workspace.sourceId};
    const f=fixture(t,{connected:true,files:[workspace],saved});
    f.setProjects([{...project,sourceId:undefined,name:'different display name',[by]:workspace[by]}]);await tick();
    assert.equal(f.view.capture().bindingId,project.bindingId);f.view.dispose();
  }
  for(const rows of [
    [{...project,name:workspace.name}],
    [{...project,workspaceId:workspace.workspaceId,sourceId:'source-'+'b'.repeat(24)}],
    [{...project,sourceId:workspace.sourceId},{...project,bindingId:'local-b',sourceId:workspace.sourceId}]
  ]){
    const f=fixture(t,{connected:true,files:[workspace],saved:{bindingId:'file-workspace:'+workspace.workspaceId,name:workspace.name}});
    f.setProjects(rows);await tick();
    assert.equal(f.view.selectedBindingId(),'file-workspace:'+workspace.workspaceId);
    assert.equal(f.view.canAttemptRun(),false);
    assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
    assert.deepEqual(f.opened,[]);f.view.dispose();
  }
});


test('restored directory identity cannot silently change to another source under the same workspaceId',async t=>{
  const oldSource='source-'+'b'.repeat(24),saved={bindingId:'file-workspace:'+workspace.workspaceId,name:'original',sourceId:oldSource};
  for(const connected of [false,true]){
    const f=fixture(t,{connected,files:[workspace],saved});
    f.setProjects([{...project,sourceId:workspace.sourceId,workspaceId:workspace.workspaceId}]);await tick();
    assert.equal(f.view.selectedBindingId(),saved.bindingId);
    assert.equal(f.view.canAttemptRun(),false);
    assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
    f.find('local-project-select').fire('change');
    assert.equal(f.view.canAttemptRun(),false,'reselecting an offline row cannot accept a different source');
    assert.ok(f.writes.every(row=>row['opendesk.local-project.selection.v1'].sourceId!==workspace.sourceId));
    if(connected){
      f.find('local-project-select').value=project.bindingId;f.find('local-project-select').fire('change');
      assert.equal(f.view.capture().bindingId,project.bindingId,'only an explicit new selection accepts the new source');
    }
    f.view.dispose();
  }
});


test('Local project tool choices retain more than thirteen valid packages and filter invalid or duplicate rows',async t=>{
  const tools=Array.from({length:24},(_,i)=>({format:'opendesk.sidebar-tool.v1',id:'local-tool-'+i,
    version:'1.0.0',title:'Local Tool '+i,description:'Local project fixture',capabilities:[],
    html:'<main>Local</main>',css:'',js:'void 0;'}));
  const f=fixture(t,{tools:[...tools,tools[0],{...tools[0],id:'invalid-tool',capabilities:['invalid.capability']}]});
  for(let i=0;i<40&&f.find('local-project-tool').options.length<25;i++)await tick();
  assert.deepEqual(f.find('local-project-tool').options.map(row=>row.value),['',...tools.map(tool=>tool.id)]);
});
