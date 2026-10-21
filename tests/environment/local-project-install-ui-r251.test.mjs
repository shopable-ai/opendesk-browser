import {createDeveloperView} from '../../src/ui/develop-view.js';
import {developerTestFields} from './develop-view-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {sha256Utf8} from '../../src/scripting/user-scripts/page-program-package.js';
import {createLocalInstallUI} from '../../src/ui/local-project-install-ui.js';
import {sourceContract} from '../../src/ui/local-project-install.js';
globalThis.crypto ||= webcrypto;

// Component DOM/RPC fakes only. This is NOT a Chrome permission prompt or native
// effect receipt. Existing Page/Task services must still verify those authorities.
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function fixture({permission=true,kind='controller',lostInstallAck=false,pageMatches=null,managedUI=false,retireManagedPreview,readControllerRun}={}){
  const view=createDeveloperView();
  const get=developerTestFields(view);
  const binding={bindingId:'local-'+'a'.repeat(20),providerEpoch:'provider-A',generation:1};
  const target={status:'available',url:'https://example.com/form',origin:'https://example.com',
    tabId:11,windowId:3,frameId:0,documentId:'doc-one'};
  let page=target,epoch=binding.providerEpoch,preparation='ready-A',projectSourceId='source-A';
  const sourceUtf8=kind==='controller'?'async function main(){return await page.title();}':
    'async function main(){document.title="Page";return 42;}';
  const source={bindingId:binding.bindingId,projectId:'local-project',runtimeKind:kind,
    entryFormat:'async-main',sourceUtf8,sourceHash:await sha256Utf8(sourceUtf8),
    inputHash:'b'.repeat(64),sourceBytes:new TextEncoder().encode(sourceUtf8).length,
    siteOrigins:['https://example.com']};
  if(pageMatches)source.pageRules={matches:pageMatches,excludeMatches:[],
    runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
  if(managedUI)source.managedUI=true;
  let liveSource=source,approvals=0,installs=0,requests=[],candidateHash,installed=null,pageCatalog=[],taskCatalog=[],localRunBusy=false;
  let installAttempt=null,installReference=null;
  const client={request:async(name,args)=>{
    requests.push(name);
    if(name==='listTaskCatalog')return {catalog:structuredClone(taskCatalog),
      installed:installed?[structuredClone(installed)]:[]};
    if(name==='listPagePrograms')return {catalog:structuredClone(pageCatalog),
      installed:structuredClone(pageCatalog.flatMap(row=>row.installed?[row.installed]:[]))};
    if(name==='importPageCandidate'){
      const row={programId:args.programId,revision:args.revision,
        manifestHash:'d'.repeat(64),sourceHash:source.sourceHash,
        pageRules:structuredClone(args.pageRules),stage:'Candidate',installed:null};
      pageCatalog.push(row);return {stage:'Candidate',candidateId:'candidate-A',
        manifestHash:row.manifestHash};
    }
    if(name==='verifyPageCandidate'){
      pageCatalog.at(-1).stage='Verified';
      return {stage:'Verified',manifestHash:pageCatalog.at(-1).manifestHash};
    }
    if(name==='makePageAvailable'){
      pageCatalog.at(-1).stage='Available';
      return {stage:'Available',manifestHash:pageCatalog.at(-1).manifestHash};
    }
    if(name==='installPageProgram'){
      installs++;
      const result={programId:args.programId,revision:args.revision,sourceHash:source.sourceHash,
        manifestHash:args.manifestHash,pageRules:pageCatalog.at(-1).pageRules,
        nativeState:'registered',enabled:true,title:args.title,authorization:{status:'active'}};
      pageCatalog.at(-1).installed=result;
      return structuredClone(result);
    }
    if(name==='importTaskPackage'){
      candidateHash=args.package.manifestHash;
      taskCatalog.push({taskId:args.package.manifest.taskId,
        version:args.package.manifest.version,manifestHash:candidateHash,
        manifest:structuredClone(args.package.manifest),stage:'candidate'});
      return {stage:'candidate',manifestHash:candidateHash};
    }
    if(name==='verifyTaskCandidate'){
      assert.equal(args.runId,'verified-run-id');
      taskCatalog.at(-1).stage='verified';
      return {stage:'verified',manifestHash:candidateHash};
    }
    if(name==='makeTaskAvailable'){
      taskCatalog.at(-1).stage='available';
      return {stage:'available'};
    }
    if(name==='installTask'){
      installs++;
      installed={taskId:args.taskId,version:args.version,manifestHash:args.manifestHash,
        enabled:true,generation:1,installationId:'11111111-1111-4111-8111-111111111111'};
      if(lostInstallAck)throw Object.assign(new Error('ack lost after durable install'),
        {code:'E_EFFECT_UNKNOWN'});
      return structuredClone(installed);
    }
    throw Error('Unexpected request '+name);
  }};
  const listeners=new Set();
  const events={addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)};
  const api={permissions:{onAdded:events,onRemoved:events,
    contains:async request=>{
      assert.ok(request.origins?.length>=1&&request.origins.length<=(pageMatches?.length||1));
      assert.ok(request.origins.every(origin=>(pageMatches||['https://example.com/*']).includes(origin)),
        'Chrome permission checks preserve validated Page patterns and convert Controller origins');
      return permission;
    },request:request=>{
      assert.deepEqual(request,{origins:pageMatches||['https://example.com/*']},
        'trusted confirmation requests the same reviewed Chrome match pattern');
      approvals++;return Promise.resolve(false);
    }}};
  const project={active:()=>true,connected:()=>true,
    selectedBindingId:()=>binding.bindingId,providerEpoch:()=>epoch,
    preparationIdentity:()=>preparation,
    previousInstallAttempt:()=>installAttempt,
    rememberInstallAttempt:value=>{installAttempt=value?structuredClone(value):null;},
    previousInstallation:()=>installReference,
    rememberInstallation:value=>{installReference=structuredClone(value);},
    selectedProject:()=>({name:'本地控制器',sourceId:projectSourceId}),
    capture:()=>({...binding,providerEpoch:epoch}),
    resolve:async()=>structuredClone(liveSource),
    assertCaptured:captured=>{
      if(captured.providerEpoch!==epoch)throw Object.assign(new Error('changed'),{code:'E_DEV_CONFLICT'});
    }};
  const currentPageTarget={get snapshot(){return page;},revalidate:async captured=>{
    if(page.documentId!==captured.documentId)
      throw Object.assign(new Error('navigation'),{code:'E_DOCUMENT_STALE'});
  }};
  let stateEvents=0;const installedNotices=[];
  const ui=createLocalInstallUI({client,api,view,currentPageTarget,getProject:()=>project,retireManagedPreview,readControllerRun,
    isBusy:()=>localRunBusy,onState:()=>stateEvents++});
  return {ui,get,view,source,binding,target,requests,installedNotices,project,client,
    get taskCatalog(){return taskCatalog;},
    get installs(){return installs;},get approvals(){return approvals;},
    get stateEvents(){return stateEvents;},
    setSource:value=>{liveSource=value;},setPage:value=>{page=value;},
    setEpoch:value=>{epoch=value;},setPreparation:value=>{preparation=value;},
    setProjectSourceId:value=>{projectSourceId=value;},
    setPermission:value=>{permission=value;},setBusy:value=>{localRunBusy=value;},dispose(){ui.dispose();}};
}
async function settle(predicate){
  for(let i=0;i<100&&!predicate();i++)await tick();
  assert.ok(predicate(),'asynchronous UI operation did not settle');
}
test('an older passive proof cannot close a new explicit installation review',async t=>{
  let entered=false,release;
  const f=await fixture({readControllerRun:()=>{entered=true;return new Promise(resolve=>{release=resolve;});}});
  t.after(()=>f.dispose());
  f.project.previousVerification=()=>({kind:'controller',...f.binding,sourceId:'source-A',
    ...f.source,sourceContract:sourceContract(f.source),target:f.target,
    runId:'verified-run-id',resultId:'verified-result-id'});
  f.ui.update();await settle(()=>entered);
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
  await f.ui.prepare();
  assert.equal(f.get('local-install-review').hidden,false);
  release({runs:[{runId:'verified-run-id',resultId:'verified-result-id',state:'completed',
    retirementState:'released',revision:{sourceHash:f.source.sourceHash},
    target:{...f.target,mode:'borrowed',allowedOrigin:f.target.origin}}],
    results:[{runId:'verified-run-id',resultId:'verified-result-id',state:'completed',
      revision:{sourceHash:f.source.sourceHash},outcome:{ok:true}}]});
  await tick();await tick();
  assert.equal(f.get('local-install-review').hidden,false,'late passive reads cannot cancel explicit review');
  assert.equal(f.get('local-install-confirm').disabled,false);
  assert.equal(f.installs,0);
});
test('R40.10.1 a running Local program blocks an already-open install confirmation',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
  await f.ui.prepare();
  assert.equal(f.get('local-install-confirm').disabled,false);
  const before=f.requests.length;
  f.setBusy(true);f.ui.update();
  assert.equal(f.get('local-install-confirm').disabled,true);
  f.get('local-install-confirm').fire('click',{isTrusted:true});await tick();
  assert.equal(f.requests.length,before,'Run cannot start a second install transaction');
  assert.equal(f.installs,0);assert.equal(f.approvals,0);
  assert.equal(f.get('local-install-review').hidden,false,'existing review is preserved');
  f.setBusy(false);f.ui.update();
  assert.equal(f.get('local-install-confirm').disabled,false,'idle restores reviewed confirmation');
});

test('R25.1 passive target resolution blocks Save without discarding original proof in the same document',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
  assert.equal(f.ui.canSave(),true);
  f.setPage({status:'resolving',windowId:f.target.windowId});f.ui.update();
  assert.equal(f.ui.canSave(),false);
  f.setPage({...f.target});f.ui.update();assert.equal(f.ui.canSave(),true);
  await f.ui.prepare();f.get('local-install-confirm').fire('click',{isTrusted:true});
  await settle(()=>f.installs===1);
  assert.ok(f.requests.includes('verifyTaskCandidate'));
  assert.ok(!f.requests.some(name=>/start|run/i.test(name)),'installation only verifies original run');
});
test('R25.1 target resolution never preserves proof across changed document or source identity',async t=>{
  for(const changed of ['document','source','window']){
    const f=await fixture();t.after(()=>f.dispose());
    f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
    f.setPage({status:'resolving',windowId:f.target.windowId});f.ui.update();
    if(changed==='source')f.setPreparation('changed-input');
    f.setPage({...f.target,...(changed==='document'?{documentId:'new-document'}:changed==='window'?{windowId:4}:{})});
    f.ui.update();assert.equal(f.ui.canSave(),false);
    f.setPage({...f.target});f.setPreparation('ready-A');f.ui.update();
    assert.equal(f.ui.canSave(),false,'invalidated proof must not revive');
  }
});
test('R25.1 invalid installation name requests no permission or candidate effects and retains review',async t=>{
  for(const kind of ['controller','page-userscript']){
    const f=await fixture({kind});t.after(()=>f.dispose());
    f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:kind==='controller'?'verified-run-id':null});
    await f.ui.prepare();const count=f.requests.length;
    for(const value of ['   ','x'.repeat(101)]){
      f.get('local-install-title').value=value;
      f.get('local-install-confirm').fire('click',{isTrusted:true});await tick();
      assert.equal(f.requests.length,count);assert.equal(f.approvals,0);assert.equal(f.installs,0);
      assert.equal(f.get('local-install-review').hidden,false);
      assert.equal(f.get('local-install-status').dataset.state,'error');
      assert.equal(f.view.getSnapshot().focus.key,'local-install-title');
    }
  }
});
test('R25.1 bottom Save opens one actual fixed-version review and does not rerun Controller on installation',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  f.ui.setOnInstalled(result=>f.installedNotices.push(result));
  assert.equal(f.ui.canSave(),false);
  assert.equal(f.ui.saveLabel(),'保存为任务'); // R2.6: always-visible action, confirmation still gated.
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
  assert.equal(f.ui.canSave(),true);
  assert.equal(f.ui.saveLabel(),'保存为任务');
  await f.ui.prepare();assert.equal(f.get('local-install-review').hidden,false);
  assert.equal(f.view.getSnapshot().focus.key,'local-install-review',
    'sticky Save dock must focus the visible review for keyboard users');
  assert.equal(f.get('local-install-confirm').disabled,false);
  assert.match(f.get('local-install-summary').textContent,/https:\/\/example.com/);
  assert.match(f.get('local-install-summary').textContent,/源码 SHA-256/);
  f.ui.confirm({isTrusted:false});
  assert.equal(f.installs,0);
  f.ui.confirm({isTrusted:true});
  f.ui.confirm({isTrusted:true});
  await settle(()=>f.installedNotices.length===1);
  assert.equal(f.installs,1,'only one real installation transaction');
  assert.equal(f.approvals,0,'already-granted permission cannot show a second Chrome prompt');
  assert.equal(f.ui.saveLabel(),'管理已安装');
  assert.equal(f.get('local-install-review').hidden,true);
  assert.equal(f.requests.filter(name=>name==='verifyTaskCandidate').length,1);
  assert.equal(f.requests.filter(name=>name==='installTask').length,1);
  await f.ui.prepare();
  assert.equal(f.installs,1,'opening Management does not reinstall or execute');
  assert.equal(f.installedNotices.at(-1).focus,true);
});
test('R25.1 changed document/provider/preparation immediately invalidates Save proof',async t=>{
  for(const change of ['document','provider','preparation']){
    const f=await fixture();t.after(()=>f.dispose());
    f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
    await f.ui.prepare();
    if(change==='document')f.setPage({...f.target,documentId:'other-document'});
    if(change==='provider')f.setEpoch('provider-B');
    if(change==='preparation')f.setPreparation('source-changed');
    f.ui.update();
    assert.equal(f.ui.canSave(),false,change);
    assert.equal(f.get('local-install-review').hidden,true,change);
    f.ui.confirm({isTrusted:true});
    await tick();
    assert.equal(f.installs,0);
  }
});
test('R25.1 denied website permission is zero-dispatch and permits explicit rereview',async t=>{
  const f=await fixture({permission:false});t.after(()=>f.dispose());
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
  await f.ui.prepare();
  f.ui.confirm({isTrusted:true});
  await settle(()=>/尚未提交安装/.test(f.get('local-install-status').textContent));
  assert.equal(f.approvals,1);
  assert.equal(f.installs,0);
  assert.equal(f.ui.canSave(),true,'denied permission is not an unknown install effect');
  assert.equal(f.requests.includes('importTaskPackage'),false);
  f.setPermission(true);
  await f.ui.prepare();
  assert.equal(f.get('local-install-confirm').disabled,false);
});
test('R25.1 source metadata cannot change between a successful Run and review',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
  f.setSource({...f.source,siteOrigins:['https://changed.example']});
  await assert.rejects(()=>f.ui.prepare(),{code:'E_DEV_CONFLICT'});
  assert.equal(f.installs,0);
});
test('R25.1 Page Save warns before explicit second execution and installs only after trusted click',async t=>{
  const f=await fixture({kind:'page-userscript'});t.after(()=>f.dispose());
  f.ui.setOnInstalled(result=>f.installedNotices.push(result));
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target});
  assert.equal(f.ui.saveLabel(),'安装网页增强');
  await f.ui.prepare();
  assert.equal(f.get('local-install-confirm').disabled,false);
  assert.match(f.get('local-install-warning').textContent,/再次执行.*Page/);
  assert.match(f.get('local-install-summary').textContent,/https:\/\/example.com\/\*/);
  assert.equal(f.requests.filter(name=>name==='verifyPageCandidate').length,0,
    'review must never reexecute Page business code');
  assert.equal(f.requests.filter(name=>name==='installPageProgram').length,0);
  f.ui.confirm({isTrusted:false});
  assert.equal(f.installs,0);
  f.ui.confirm({isTrusted:true});
  await settle(()=>f.installedNotices.length===1);
  assert.equal(f.installs,1);
  assert.equal(f.requests.filter(name=>name==='verifyPageCandidate').length,1);
  assert.equal(f.requests.filter(name=>name==='installPageProgram').length,1);
  assert.equal(f.ui.saveLabel(),'管理已安装');
});
test('R25.1 unknown install receipt is recovered by reading original Task registry only',async t=>{
  const f=await fixture({lostInstallAck:true});t.after(()=>f.dispose());
  f.ui.setOnInstalled(result=>f.installedNotices.push(result));
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
  await f.ui.prepare();
  f.ui.confirm({isTrusted:true});
  await settle(()=>/禁止盲目重试/.test(f.get('local-install-status').textContent));
  assert.equal(f.installs,1);
  assert.equal(f.ui.saveLabel(),'核对安装状态');
  assert.equal(f.ui.canSave(),true,'read-only reconciliation remains available');
  const count=f.requests.filter(method=>method==='installTask').length;
  await f.ui.prepare(); // Bottom Save changes to a read-only outcome check.
  await settle(()=>f.installedNotices.length===1);
  assert.equal(f.requests.filter(method=>method==='installTask').length,count);
  assert.equal(f.requests.filter(method=>method==='verifyTaskCandidate').length,1);
  assert.equal(f.ui.saveLabel(),'管理已安装');
  assert.equal(f.installedNotices[0].focus,true);
});
test('R5.7 confirmed durable install remains manageable across a delayed passive lookup',async t=>{
  const f=await fixture({lostInstallAck:true});t.after(()=>f.dispose());
  f.ui.setOnInstalled(result=>f.installedNotices.push(result));
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
  await f.ui.prepare();
  f.ui.confirm({isTrusted:true});
  await settle(()=>/禁止盲目重试/.test(f.get('local-install-status').textContent));
  assert.equal(f.installs,1);
  const releases=[];
  f.project.resolve=()=>new Promise(resolve=>releases.push(()=>resolve(f.source)));
  // A passive target refresh may overlap the read-only recovery. Neither a
  // slow Provider nor a historical lookup can downgrade the durable receipt.
  f.setPage({status:'resolving',windowId:f.target.windowId});
  f.ui.update();
  assert.equal(f.ui.saveLabel(),'核对安装状态');
  await f.ui.prepare();
  await settle(()=>f.installedNotices.length===1);
  assert.equal(f.ui.saveLabel(),'管理已安装');
  assert.equal(f.installs,1,'recovery must not dispatch another installation');
  for(const release of releases)release();
  await tick();
  await tick();
  assert.equal(f.ui.saveLabel(),'管理已安装',
    'late passive lookup must not override an already-confirmed installed version');
  f.setPage({...f.target});f.ui.update();
  assert.equal(f.ui.saveLabel(),'管理已安装');
});

test('R25.1 confirmation freezes version and title before any async permission check',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  f.ui.setOnInstalled(result=>f.installedNotices.push(result));
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
  await f.ui.prepare();
  f.ui.confirm({isTrusted:true});
  f.get('local-install-version').value='99.99.99';
  f.get('local-install-title').value='Late unreviewed title';
  await settle(()=>f.installedNotices.length===1);
  assert.equal(f.taskCatalog.length,1);
  assert.equal(f.taskCatalog[0].version,'1.0.0');
  assert.equal(f.taskCatalog[0].manifest.title,'本地控制器');
  assert.equal(f.installedNotices[0].version,'1.0.0');
});
test('R25.1 source ID change after review cannot install under stale project identity',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
  await f.ui.prepare();
  f.setProjectSourceId('replaced-source');
  f.ui.confirm({isTrusted:true});
  await settle(()=>/项目来源身份已变化/.test(f.get('local-install-status').textContent));
  assert.equal(f.installs,0);
  assert.equal(f.requests.includes('importTaskPackage'),false);
  assert.equal(f.get('local-install-status').dataset.state,'error');
  assert.notEqual(f.ui.saveLabel(),'核对安装状态',
    'a rejection before Candidate submission must not create an unknown install');
  assert.equal(f.ui.canSave(),true,'the original verified Run can be reviewed again');
});

const verified=f=>f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id',
  previewId:'11111111-1111-4111-8111-111111111111'});
for(const change of ['binding','source']){
  test(`Local reconciliation cannot write an A receipt into changed ${change} B`,async t=>{
    const f=await fixture({lostInstallAck:true});t.after(()=>f.dispose());verified(f);await f.ui.prepare();
    f.ui.setOnInstalled(row=>f.installedNotices.push(row));
    f.ui.confirm({isTrusted:true});await settle(()=>f.ui.saveLabel()==='核对安装状态');
    const pending=structuredClone(f.project.previousInstallAttempt());
    const before=structuredClone(f.project.previousInstallation());
    let release,entered;
    const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
    const request=f.client.request;
    f.client.request=async(name,args)=>{if(name==='listTaskCatalog'){entered();await gate;}return request(name,args);};
    const read=f.ui.prepare();await started;
    if(change==='binding')f.project.selectedBindingId=()=> 'local-'+'c'.repeat(20);
    else f.setProjectSourceId('source-B');
    release();await read;
    assert.deepEqual(f.project.previousInstallation(),before,'A cannot become B installation hint');
    assert.deepEqual(f.project.previousInstallAttempt(),pending,'A recovery pointer cannot be cleared for B');
    assert.deepEqual(f.installedNotices,[],'A completion must not navigate the B selection');
    assert.equal(f.installs,1,'reconciliation only reads the original Task registry');
  });
}
for(const kind of ['controller','page-userscript']){
  for(const result of ['reject','resolve']){
    test(`Local close preserves ${kind} pending installation before ${result} acknowledgement`,async t=>{
      const f=await fixture({kind});t.after(()=>f.dispose());verified(f);await f.ui.prepare();
      const method=kind==='controller'?'installTask':'installPageProgram';
      let release,entered;
      const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
      const request=f.client.request;
      f.client.request=async(name,args)=>{
        if(name=== (kind==='controller'?'importTaskPackage':'importPageCandidate')){
          const attempt=f.project.previousInstallAttempt();
          assert.ok(attempt,'recovery must be recorded before the first Candidate mutation');
          assert.equal(attempt.bindingId,f.binding.bindingId);
        }
        if(name!==method)return request(name,args);
        const installed=await request(name,args);entered();await gate;
        if(result==='reject')throw Object.assign(new Error('closed before install ACK'),{code:'E_EFFECT_UNKNOWN'});
        return installed;
      };
      f.ui.confirm({isTrusted:true});await started;
      const pending=f.project.previousInstallAttempt();
      f.dispose();release();await tick();await tick();
      assert.ok(pending,'original owner must record the recovery pointer before installation dispatch');
      assert.match(pending.attemptedManifestHash,/^[a-f0-9]{64}$/);
      assert.equal(pending.bindingId,f.binding.bindingId);
      assert.equal(pending.projectSourceId,'source-A');
      assert.deepEqual(f.project.previousInstallAttempt(),pending,'closed UI cannot lose the pending outcome');
      const view=createDeveloperView();
      const reopened=createLocalInstallUI({client:f.client,api:{permissions:{contains:async()=>true}},view,
        currentPageTarget:{snapshot:f.target},getProject:()=>f.project});
      t.after(()=>reopened.dispose());
      reopened.update();assert.equal(reopened.saveLabel(),'核对安装状态');
      const count=f.requests.length;
      await reopened.prepare();
      assert.equal(f.project.previousInstallAttempt(),null,'only original durable registry confirmation clears recovery');
      assert.ok(f.requests.slice(count).every(name=>name=== (kind==='controller'?'listTaskCatalog':'listPagePrograms')));
      assert.equal(f.installs,1,'reopening must not execute or install again');
    });
  }
}
test('Save immediately exposes progress and ignores duplicate preparation',async t=>{
  const f=await fixture();t.after(()=>f.dispose());verified(f);await tick();
  let release,reads=0;
  f.project.resolve=()=>{reads++;return new Promise(resolve=>{release=()=>resolve(f.source);});};
  const pending=f.ui.prepare();
  try{
    assert.equal(f.get('local-install-review').hidden,false);
    assert.equal(f.get('local-install-status').dataset.state,'pending');
    assert.match(f.ui.saveLabel(),/正在准备/);
    assert.equal(f.ui.canSave(),false);
    await f.ui.prepare();assert.equal(reads,1);
  }finally{release();await pending;}
});
test('An open review survives another Save click without discarding edits',async t=>{
  const f=await fixture();t.after(()=>f.dispose());verified(f);await f.ui.prepare();
  f.get('local-install-title').value='Reviewed title';
  f.get('local-install-version').value='2.0.0';
  const reads=f.requests.length;await f.ui.prepare();
  assert.equal(f.get('local-install-title').value,'Reviewed title');
  assert.equal(f.get('local-install-version').value,'2.0.0');
  assert.equal(f.requests.length,reads);
});
test('Invalid versions are correctable with no permission or candidate dispatch',async t=>{
  for(const kind of ['controller','page-userscript']){
    const f=await fixture({kind});t.after(()=>f.dispose());verified(f);
    await settle(()=>f.requests.length===1); // Original background catalog observation precedes the measured action.
    await f.ui.prepare();
    const count=f.requests.length;f.get('local-install-version').value=kind==='controller'?'broken':'0';
    f.ui.confirm({isTrusted:true});await tick();
    assert.equal(f.requests.length,count);assert.equal(f.approvals,0);assert.equal(f.installs,0);
    assert.equal(f.get('local-install-status').dataset.state,'error');
    assert.equal(f.view.getSnapshot().focus.key,'local-install-version');
    assert.equal(f.get('local-install-confirm').disabled,false);
    assert.notEqual(f.ui.saveLabel(),'核对安装状态');
  }
});

test('Page installation preserves legal wildcard scheme and host permission patterns',async t=>{
  for(const permission of [true,false]){
    const f=await fixture({kind:'page-userscript',permission,
      pageMatches:['*://example.com/*','https://*.example.com/*']});
    t.after(()=>f.dispose());verified(f);await f.ui.prepare();
    assert.equal(f.get('local-install-review').hidden,false);
    assert.match(f.get('local-install-summary').textContent,/\*:\/\/example\.com/);
    f.ui.confirm({isTrusted:true});
    await settle(()=>permission?f.installs===1||['error','unknown'].includes(f.get('local-install-status').dataset.state):f.approvals===1);
    if(permission)assert.equal(f.get('local-install-status').dataset.state,'success',f.get('local-install-status').textContent);
    if(permission)assert.equal(f.installs,1);
    else {await tick();assert.equal(f.installs,0);assert.equal(f.requests.includes('importPageCandidate'),false);}
  }
});
test('Rechecking after closing unknown review shows pending feedback and reads only',async t=>{
  const f=await fixture({lostInstallAck:true});t.after(()=>f.dispose());verified(f);await f.ui.prepare();
  f.ui.confirm({isTrusted:true});await settle(()=>f.ui.saveLabel()==='核对安装状态');
  f.get('local-install-cancel').fire('click');assert.equal(f.get('local-install-review').hidden,true);
  const original=f.client.request;let release;
  f.client.request=(name,args)=>name==='listTaskCatalog'?new Promise(resolve=>{release=async()=>resolve(await original(name,args));}):original(name,args);
  const pending=f.ui.prepare();
  try{
    assert.equal(f.get('local-install-review').hidden,false);
    assert.equal(f.get('local-install-status').dataset.state,'pending');
    assert.match(f.ui.saveLabel(),/正在核对/);
    assert.equal(f.get('local-install-confirm').disabled,true);
    f.get('local-install-cancel').fire('click');assert.equal(f.get('local-install-review').hidden,false);
  }finally{await release();await pending;}
  assert.equal(f.installs,1);assert.equal(f.requests.filter(n=>n==='verifyTaskCandidate').length,1);
});
test('Read failures remain visible after reopening reconciliation',async t=>{
  const f=await fixture({lostInstallAck:true});t.after(()=>f.dispose());verified(f);await f.ui.prepare();
  f.ui.confirm({isTrusted:true});await settle(()=>f.ui.saveLabel()==='核对安装状态');
  f.get('local-install-cancel').fire('click');
  f.client.request=async()=>{throw Object.assign(new Error('offline'),{code:'E_HOST_CLOSED'});};
  await f.ui.prepare();assert.equal(f.get('local-install-review').hidden,false);
  assert.match(f.get('local-install-status').textContent,/offline/);
  assert.equal(f.ui.saveLabel(),'核对安装状态');assert.equal(f.installs,1);
});
test('Preparation failures are visible and do not become an unknown installation',async t=>{
  const f=await fixture();t.after(()=>f.dispose());verified(f);await tick();
  f.project.resolve=async()=>{throw Object.assign(new Error('provider offline'),{code:'E_HOST_CLOSED'});};
  await assert.rejects(()=>f.ui.prepare(),{code:'E_HOST_CLOSED'});
  assert.equal(f.get('local-install-review').hidden,false);
  assert.equal(f.get('local-install-status').dataset.state,'error');
  assert.match(f.get('local-install-status').textContent,/provider offline/);
  assert.equal(f.ui.canSave(),true);assert.equal(f.installs,0);
});

test('Managed Page Save retires the original verified preview before any formal candidate effects',async t=>{
  let f,retired=false,calls=0;
  f=await fixture({kind:'page-userscript',managedUI:true,retireManagedPreview:async args=>{
    calls++;assert.deepEqual(args.source,f.source);assert.deepEqual(args.binding,f.binding);
    assert.deepEqual(args.target,f.target);assert.equal(args.previewId,'11111111-1111-4111-8111-111111111111');
    assert.equal(f.requests.includes('importPageCandidate'),false);retired=true;
    return {previewId:args.previewId,sourceHash:args.source.sourceHash,state:'preview-retired',
      receipt:{ok:true,scope:'managed-ui-only'}};
  }});
  t.after(()=>f.dispose());f.ui.setOnInstalled(result=>f.installedNotices.push(result));verified(f);await f.ui.prepare();
  const original=f.client.request;
  f.client.request=(name,args)=>{if(name==='importPageCandidate')assert.equal(retired,true);return original(name,args);};
  f.ui.confirm({isTrusted:true});await settle(()=>f.installedNotices.length===1);
  assert.equal(calls,1);assert.equal(f.installs,1);
});
test('Unconfirmed managed retirement blocks installation and subsequent Save only reads original records',async t=>{
  for(const mismatch of ['previewId','sourceHash','state','scope','ok']){
    let calls=0;
    const f=await fixture({kind:'page-userscript',managedUI:true,retireManagedPreview:async args=>{
      calls++;const result={previewId:args.previewId,sourceHash:args.source.sourceHash,
        state:'preview-retired',receipt:{ok:true,scope:'managed-ui-only'}};
      if(mismatch==='scope')result.receipt.scope='all-page';
      else if(mismatch==='ok')result.receipt.ok=false;
      else result[mismatch]='wrong';
      return result;
    }});
    t.after(()=>f.dispose());verified(f);await f.ui.prepare();f.ui.confirm({isTrusted:true});
    await settle(()=>f.ui.saveLabel()==='核对安装状态');
    assert.equal(f.requests.includes('importPageCandidate'),false);assert.equal(f.installs,0);
    await f.ui.prepare();assert.equal(calls,1);assert.equal(f.requests.includes('verifyPageCandidate'),false);
  }
});
test('Navigation during confirmed managed retirement cannot dispatch Page verification',async t=>{
  let f;
  f=await fixture({kind:'page-userscript',managedUI:true,retireManagedPreview:async args=>{
    f.setPage({...f.target,documentId:'replacement-document'});
    return {previewId:args.previewId,sourceHash:args.source.sourceHash,state:'preview-retired',
      receipt:{ok:true,scope:'managed-ui-only'}};
  }});
  t.after(()=>f.dispose());verified(f);await f.ui.prepare();f.ui.confirm({isTrusted:true});
  await settle(()=>f.ui.saveLabel()==='核对安装状态');assert.equal(f.installs,0);
  assert.equal(f.requests.includes('importPageCandidate'),false);
});
test('Controller Save never invokes managed Page retirement',async t=>{
  let calls=0;const f=await fixture({retireManagedPreview:async()=>{calls++;throw Error('unexpected');}});
  t.after(()=>f.dispose());f.ui.setOnInstalled(result=>f.installedNotices.push(result));verified(f);await f.ui.prepare();f.ui.confirm({isTrusted:true});
  await settle(()=>f.installedNotices.length===1);assert.equal(calls,0);assert.equal(f.installs,1);
});

test('R2.6 review Escape/Cancel restores focus without dispatching installation',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  f.get('script-save').hidden=false;
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
  await f.ui.prepare();
  let prevented=false;
  f.get('local-install-review').fire('keydown',{key:'Escape',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(f.get('local-install-review').hidden,true);
  assert.equal(f.view.getSnapshot().focus.key,'script-save');
  assert.equal(f.installs,0);
  await f.ui.prepare();
  f.get('local-install-cancel').fire('click');
  assert.equal(f.get('local-install-review').hidden,true);
  assert.equal(f.view.getSnapshot().focus.key,'script-save');
  assert.equal(f.installs,0);
});
