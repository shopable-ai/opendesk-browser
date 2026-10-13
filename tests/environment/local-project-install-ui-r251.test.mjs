import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {sha256Utf8} from '../../src/scripting/user-scripts/page-program-package.js';
import {createLocalInstallUI} from '../../src/ui/local-project-install-ui.js';
globalThis.crypto ||= webcrypto;

// Component DOM/RPC fakes only. This is NOT a Chrome permission prompt or native
// effect receipt. Existing Page/Task services must still verify those authorities.
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
class Node{
  constructor(){this.value='';this.textContent='';this.hidden=true;this.disabled=false;this.readOnly=false;this.listeners=new Map();this.dataset={};}
  addEventListener(name,fn){const group=this.listeners.get(name)||new Set();group.add(fn);this.listeners.set(name,group);}
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  fire(name,event={}){for(const fn of this.listeners.get(name)||[])fn(event);}
  focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}
}
const ids=['local-install-review','local-install-summary','local-install-title',
  'local-install-version','local-install-warning','local-install-status',
  'local-install-confirm','local-install-cancel'];
async function fixture({permission=true,kind='controller',lostInstallAck=false,pageMatches=null,managedUI=false,retireManagedPreview}={}){
  const nodes=new Map(ids.map(id=>[id,new Node()]));
  const doc={getElementById:id=>nodes.get(id),activeElement:null};
  for(const node of nodes.values())node.ownerDocument=doc;
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
  let liveSource=source,approvals=0,installs=0,requests=[],candidateHash,installed=null,pageCatalog=[],taskCatalog=[];
  const client={request:async(name,args)=>{
    requests.push(name);
    if(name==='listTaskCatalog')return {catalog:structuredClone(taskCatalog),
      installed:installed?[structuredClone(installed)]:[]};
    if(name==='listPagePrograms')return {catalog:structuredClone(pageCatalog)};
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
        nativeState:'registered',enabled:true};
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
  const ui=createLocalInstallUI({client,api,doc,currentPageTarget,getProject:()=>project,retireManagedPreview,
    onState:()=>stateEvents++});
  const get=id=>nodes.get(id);
  return {ui,get,doc,source,binding,target,requests,installedNotices,project,client,
    get taskCatalog(){return taskCatalog;},
    get installs(){return installs;},get approvals(){return approvals;},
    get stateEvents(){return stateEvents;},
    setSource:value=>{liveSource=value;},setPage:value=>{page=value;},
    setEpoch:value=>{epoch=value;},setPreparation:value=>{preparation=value;},
    setProjectSourceId:value=>{projectSourceId=value;},
    setPermission:value=>{permission=value;},dispose(){ui.dispose();}};
}
async function settle(predicate){
  for(let i=0;i<100&&!predicate();i++)await tick();
  assert.ok(predicate(),'asynchronous UI operation did not settle');
}
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
      assert.equal(f.doc.activeElement,f.get('local-install-title'));
    }
  }
});
test('R25.1 bottom Save opens one actual fixed-version review and does not rerun Controller on installation',async t=>{
  const f=await fixture();t.after(()=>f.dispose());
  f.ui.setOnInstalled(result=>f.installedNotices.push(result));
  assert.equal(f.ui.canSave(),false);
  assert.equal(f.ui.saveLabel(),'待运行验证');
  f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id'});
  assert.equal(f.ui.canSave(),true);
  assert.equal(f.ui.saveLabel(),'保存为任务');
  await f.ui.prepare();assert.equal(f.get('local-install-review').hidden,false);
  assert.equal(f.doc.activeElement,f.get('local-install-review'),
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
  assert.equal(f.ui.saveLabel(),'管理已安装版本');
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
  assert.equal(f.ui.saveLabel(),'保存到我的工具');
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
  assert.equal(f.ui.saveLabel(),'管理已安装版本');
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
  assert.equal(f.ui.saveLabel(),'管理已安装版本');
  assert.equal(f.installedNotices[0].focus,true);
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
});

const verified=f=>f.ui.succeeded({source:f.source,binding:f.binding,target:f.target,runId:'verified-run-id',
  previewId:'11111111-1111-4111-8111-111111111111'});
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
    assert.equal(f.doc.activeElement,f.get('local-install-version'));
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
