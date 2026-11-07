import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskPackage} from '../../src/platform/tasks/contract.js';
import {sha256Utf8} from '../../src/scripting/user-scripts/page-program-package.js';
import {prepareLocalProjectInstallation,assertLocalInstallVersion,
  commitLocalProjectInstallation,readLocalInstallOutcome} from '../../src/ui/local-project-install.js';

const binding={bindingId:'local-'+'a'.repeat(20),providerEpoch:'epoch-a'};
const project={name:'开发项目',sourceId:'source-b'};
const target={tabId:5,frameId:0,windowId:2,documentId:'doc-a',
  url:'https://sample.example/form',origin:'https://sample.example'};
test('R25.1 upgrades retain the original user title for Page and Task review',async()=>{
  for(const kind of ['controller','page-userscript']){
    const source=await makeSource(kind);let catalog=[],installed=[];
    const client={request:async()=>({catalog,installed})};
    const first=await prepareLocalProjectInstallation({client,source,binding,project,target,runId:'run-title'});
    if(kind==='page-userscript'){
      const grant={programId:first.id,title:'自定义表单助手',revision:1,
        manifestHash:'d'.repeat(64),sourceHash:'0'.repeat(64),pageRules:first.pageRules};
      catalog=[{programId:first.id,revision:1,manifestHash:grant.manifestHash,installed:grant}];
      installed=[grant];
    }
    else {catalog=[{taskId:first.id,version:'1.0.0',manifestHash:'d'.repeat(64),
      manifest:{title:'自定义表单助手',siteOrigins:first.siteOrigins,program:{sourceHash:'0'.repeat(64)}}}];
      installed=[{taskId:first.id,version:'1.0.0',manifestHash:'d'.repeat(64)}];}
    const next=await prepareLocalProjectInstallation({client,source,binding,project,target,runId:'run-title'});
    assert.equal(next.defaultTitle,'自定义表单助手');
  }
});
test('R25.1 invalid name is rejected before any installation RPC',async()=>{
  const client={request:()=>{throw Error('must not dispatch');}};
  for(const title of ['', ' ', 'x'.repeat(101)])
    await assert.rejects(commitLocalProjectInstallation({client,title}),{code:'E_SCHEMA'});
});
const makeSource=async(kind='controller')=>{
  const sourceUtf8=kind==='controller'
    ?'async function main(){return await page.title();}'
    :'async function main(){document.title="Page";return 42;}';
  return {bindingId:binding.bindingId,projectId:'local-project-a',runtimeKind:kind,
    entryFormat:'async-main',sourceUtf8,sourceHash:await sha256Utf8(sourceUtf8),
    inputHash:'c'.repeat(64),sourceBytes:new TextEncoder().encode(sourceUtf8).length,
    siteOrigins:['https://sample.example']};
};
for(const siteScope of ['exact','all-sites','storage'])test(`Controller packages retain confirmed bytes and reuse Task v1 verification/installation (${siteScope})`,async()=>{
  const source=await makeSource();const calls=[],catalog={catalog:[],installed:[]};
  if(siteScope==='all-sites')source.siteOrigins=['<all_urls>'];
  if(siteScope==='storage'){source.permissions=['page.automation','storage.persistent'];source.deadlineMs=120000;}
  let manifest;
  const client={request:async(method,payload)=>{
    calls.push(method);
    if(method==='listTaskCatalog')return structuredClone(catalog);
    if(method==='importTaskPackage'){
      manifest=payload.package.manifest;
      return {taskId:manifest.taskId,version:manifest.version,
        manifestHash:payload.package.manifestHash,stage:'candidate'};
    }
    if(method==='verifyTaskCandidate'){
      assert.equal(payload.runId,'real-run-a');
      return {stage:'verified',manifestHash:await sha256Utf8('wrong')};
    }
    if(method==='makeTaskAvailable')return {stage:'available'};
    if(method==='installTask')return {taskId:payload.taskId,version:payload.version,
      manifestHash:payload.manifestHash};
    throw Error('Unexpected '+method);
  }};
  // The fake verified candidate must retain its original package checksum.
  let savedHash;
  const origin=client.request;
  client.request=async(method,payload)=>{
    if(method==='importTaskPackage')savedHash=payload.package.manifestHash;
    if(method==='verifyTaskCandidate')return {stage:'verified',manifestHash:savedHash};
    return origin(method,payload);
  };
  const planned=await prepareLocalProjectInstallation({client,source,binding,project,target,runId:'real-run-a'});
  assert.equal(planned.version,'1.0.0');
  assert.deepEqual(planned.siteOrigins,['https://sample.example']);
  assert.equal(planned.needsReexecution,false);
  const result=await commitLocalProjectInstallation({client,review:planned,source,target,
    title:'浏览器任务',version:planned.version});
  assert.equal(result.kind,'controller');
  assert.equal(result.version,'1.0.0');
  assert.equal(manifest.program.sourceHash,source.sourceHash);
  assert.equal(manifest.source,'local-project');
  assert.deepEqual(manifest.permissions,source.permissions??['page.automation']);
  assert.equal(manifest.deadlineMs,source.deadlineMs);
  assert.deepEqual(manifest.siteOrigins,['https://sample.example'],'local all-sites scope never expands the installed Task');
  assert.ok(calls.indexOf('verifyTaskCandidate')<calls.indexOf('installTask'));
  assert.equal(calls.includes('run.start'),false,'installation never dispatches another Controller run');
});
test('Page review grants only tested host and documents explicit re-execution',async()=>{
  const source=await makeSource('page-userscript'),calls=[],catalog=[];
  const client={request:async(method,payload)=>{
    calls.push(method);
    if(method==='listPagePrograms')return {catalog:structuredClone(catalog)};
    if(method==='importPageCandidate'){
      const row={programId:payload.programId,revision:payload.revision,stage:'Candidate',
        manifestHash:'d'.repeat(64),sourceHash:source.sourceHash,pageRules:payload.pageRules};
      catalog.push(row);return {...row,candidateId:'page-a'};
    }
    if(method==='verifyPageCandidate'){catalog[0].stage='Verified';return {stage:'Verified'};}
    if(method==='makePageAvailable'){catalog[0].stage='Available';return {stage:'Available'};}
    if(method==='installPageProgram')return {manifestHash:payload.manifestHash,nativeState:'registered'};
    throw Error('Unexpected '+method);
  }};
  const planned=await prepareLocalProjectInstallation({client,source,binding,project,target});
  assert.equal(planned.needsReexecution,true);
  assert.deepEqual(planned.siteOrigins,['https://sample.example/*']);
  assert.equal(calls.includes('verifyPageCandidate'),false,'read-only review must not replay Page effects');
  await commitLocalProjectInstallation({client,review:planned,source,target,
    title:'网页工具',version:planned.version});
  assert.deepEqual(calls.filter(name=>name==='verifyPageCandidate'),['verifyPageCandidate']);
  assert.equal(calls.at(-1),'installPageProgram');
  assert.equal(catalog[0].pageRules.matches[0],'https://sample.example/*');
});
test('installation rejects stale source and changed provider identities without importing any candidate',async()=>{
  const source=await makeSource(),client={request:async()=>({catalog:[],installed:[]})};
  const planned=await prepareLocalProjectInstallation({client,source,binding,project,target,runId:'real-run-b'});
  assert.throws(()=>assertLocalInstallVersion(planned,{...source,sourceHash:'f'.repeat(64)},binding),
    {code:'E_DEV_CONFLICT'});
  assert.throws(()=>assertLocalInstallVersion(planned,source,{...binding,providerEpoch:'other'}),
    {code:'E_DEV_CONFLICT'});
  assert.throws(()=>assertLocalInstallVersion(planned,
    {...source,siteOrigins:['https://other.example']},binding),
    {code:'E_DEV_CONFLICT'},'changed website scope cannot reuse the same input hash');
  assert.throws(()=>assertLocalInstallVersion(planned,
    {...source,paramsSchema:{type:'object',properties:{changed:{type:'boolean',title:'Changed'}},
      required:[],additionalProperties:false}},binding),
    {code:'E_DEV_CONFLICT'},'changed parameter schema cannot reuse an old successful Run');
  await assert.rejects(()=>commitLocalProjectInstallation({client,review:planned,
    source:{...source,inputHash:'e'.repeat(64)},target,title:'name',version:planned.version}),
    {code:'E_DEV_CONFLICT'});
  await assert.rejects(()=>commitLocalProjectInstallation({client,review:planned,source,
    target:{...target,documentId:'different-document'},title:'name',version:planned.version}),
    {code:'E_DEV_CONFLICT'},'stale target must fail before any Candidate import');
  await assert.rejects(()=>commitLocalProjectInstallation({client,review:planned,source:
    {...source,siteOrigins:['https://new.example']},target,title:'name',version:planned.version}),
    {code:'E_DEV_CONFLICT'});
  await assert.rejects(()=>commitLocalProjectInstallation({client,review:planned,
    source:{...source,sourceUtf8:source.sourceUtf8+' // changed'},target,
    title:'name',version:planned.version}),{code:'E_DEV_CONFLICT'});
});
test('Task identities retain monotonic version under existing installed baseline',async()=>{
  const source=await makeSource();
  const first=await prepareLocalProjectInstallation({client:{request:async()=>({catalog:[],installed:[]})},
    source,binding,project,target,runId:'run'});
  const client={request:async()=>({catalog:[{taskId:first.id,version:'1.0.2',stage:'available'}],
    installed:[{taskId:first.id,version:'1.0.1',manifestHash:'e'.repeat(64)}]})};
  const updated=await prepareLocalProjectInstallation({client,source,binding,project,target,runId:'run'});
  assert.equal(updated.id,first.id);assert.equal(updated.version,'1.0.3');
  assert.equal(updated.installedVersion,'1.0.1');
});

test('Page import URL and dependency lock changes invalidate the frozen Run before any dispatch',async()=>{
  const source=await makeSource('page-userscript'),calls=[];
  const client={request:async method=>{calls.push(method);return {catalog:[]};}};
  const review=await prepareLocalProjectInstallation({client,source,binding,project,target});
  calls.length=0;
  for(const change of [{importSourceUrl:'https://sample.example/source.js'},{lockId:'replacement-lock'}]){
    const changed={...source,...change};
    assert.throws(()=>assertLocalInstallVersion(review,changed,binding),{code:'E_DEV_CONFLICT'});
    await assert.rejects(()=>commitLocalProjectInstallation({client,review,source:changed,target,
      title:'Page',version:review.version}),{code:'E_DEV_CONFLICT'});
  }
  assert.deepEqual(calls,[]);
});

test('read-only Save recognizes an exact installed Page and Task without allocating another version',async()=>{
  const page=await makeSource('page-userscript');
  const firstPage=await prepareLocalProjectInstallation({client:{request:async()=>({catalog:[]})},
    source:page,binding,project,target});
  const pageRules={matches:['https://sample.example/*'],excludeMatches:[],
    runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
  const installedPage={revision:1,manifestHash:'a'.repeat(64),sourceHash:page.sourceHash,
    pageRules,enabled:false,nativeState:'disabled'};
  const pageClient={request:async()=>({catalog:[{programId:firstPage.id,revision:1,
    entryFormat:page.entryFormat,sourceProfile:{importSourceUrl:null},dependencyLockId:null,
    manifestHash:installedPage.manifestHash,pageRules,installed:installedPage}],
    installed:[{...installedPage,programId:firstPage.id}]})};
  const samePage=await prepareLocalProjectInstallation({client:pageClient,source:page,binding,project,target});
  assert.equal(samePage.alreadyInstalled,true);
  assert.equal(samePage.installedVersion,1);
  assert.equal(samePage.version,'2');
  for(const change of [{importSourceUrl:'https://sample.example/source.js'},{lockId:'new-lock'}]){
    const changed=await prepareLocalProjectInstallation({client:pageClient,
      source:{...page,...change},binding,project,target});
    assert.equal(changed.alreadyInstalled,false,'same bytes do not imply the same installation inputs');
  }
  const changedScope=await prepareLocalProjectInstallation({client:pageClient,
    source:{...page,pageRules:{...pageRules,matches:['https://other.example/*']}},binding,
    project,target});
  assert.equal(changedScope.alreadyInstalled,false,'scope changes cannot be treated as installed');

  const controller=await makeSource('controller');
  const firstTask=await prepareLocalProjectInstallation({client:{request:async()=>({catalog:[],installed:[]})},
    source:controller,binding,project,target,runId:'real-run-z'});
  const schema={type:'object',properties:{},required:[],additionalProperties:false};
  const taskClient={request:async()=>({catalog:[{taskId:firstTask.id,version:'1.0.0',
    manifest:{program:{sourceHash:controller.sourceHash},siteOrigins:['https://sample.example'],
      paramsSchema:schema}}],
    installed:[{taskId:firstTask.id,version:'1.0.0',manifestHash:'b'.repeat(64),enabled:false}]})};
  const sameTask=await prepareLocalProjectInstallation({client:taskClient,source:controller,
    binding,project,target,runId:'real-run-z'});
  assert.equal(sameTask.alreadyInstalled,true);
  const changedSchema=await prepareLocalProjectInstallation({client:taskClient,
    source:{...controller,paramsSchema:{...schema,properties:{label:{type:'string',title:'Label'}}}},
    binding,project,target,runId:'real-run-z'});
  assert.equal(changedSchema.alreadyInstalled,false,'parameter contract changes require a new version');
});

test('R5.5 local Page review recognizes installed revision after development Candidate is gone',async()=>{
  const source=await makeSource('page-userscript');
  const baseline=await prepareLocalProjectInstallation({
    client:{request:async()=>({catalog:[],installed:[]})},
    source,binding,project,target});
  const old={programId:baseline.id,revision:7,manifestHash:'e'.repeat(64),
    title:'原已安装脚本',enabled:false,sourceHash:source.sourceHash,
    pageRules:baseline.pageRules};
  const client={request:async()=>({catalog:[],installed:[old]})};
  const review=await prepareLocalProjectInstallation({client,source,binding,project,target});
  assert.equal(review.installedHash,old.manifestHash);
  assert.equal(review.installedVersion,7);
  assert.equal(review.version,'8','revision must not reset when Candidate is removed');
  assert.equal(review.defaultTitle,old.title);
});

test('read-only unknown receipt reconciliation confirms Page only with exact Available native state',async()=>{
  const review={id:'page-A',kind:'page-userscript',sourceHash:'a'.repeat(64),
    installedHash:null,attemptedManifestHash:'b'.repeat(64),pageRules:{matches:['https://example.com/*'],excludeMatches:[],
      allFrames:false,runAt:'document_idle',world:'USER_SCRIPT'}};
  const row={programId:review.id,revision:2,manifestHash:'b'.repeat(64),sourceHash:review.sourceHash,
    pageRules:review.pageRules,stage:'Available'};
  const install={programId:review.id,revision:2,manifestHash:row.manifestHash,sourceHash:review.sourceHash,
    pageRules:review.pageRules,nativeState:'registered',enabled:true,
    authorization:{status:'active'}};
  let calls=0;
  const client={request:async(method)=>{
    assert.equal(method,'listPagePrograms');calls++;
    return {catalog:[{...row,installed:install}],installed:[install]};
  }};
  const confirmed=await readLocalInstallOutcome({client,review,version:'2'});
  assert.equal(confirmed.state,'confirmed');
  assert.equal(confirmed.manifestHash,row.manifestHash);
  review.attemptedManifestHash='c'.repeat(64);
  assert.equal((await readLocalInstallOutcome({client,review,version:'2'})).state,'unconfirmed');
  review.attemptedManifestHash=row.manifestHash;
  install.nativeState='pending';
  assert.equal((await readLocalInstallOutcome({client,review,version:'2'})).state,'unconfirmed');
  install.nativeState='disabled';install.enabled=false;install.authorization.status='disabled';
  assert.equal((await readLocalInstallOutcome({client,review,version:'2'})).state,'confirmed');
  review.installedHash=row.manifestHash;
  assert.equal((await readLocalInstallOutcome({client,review,version:'2'})).state,'baseline-unchanged');
  assert.equal(calls,5);
});
test('read-only unknown receipt reconciliation refuses wrong Task version, source and baseline',async()=>{
  const review={kind:'controller',id:'task-A',sourceHash:'a'.repeat(64),
    installedHash:null,attemptedManifestHash:'b'.repeat(64),siteOrigins:['https://example.com']};
  const installed={taskId:review.id,version:'1.0.2',manifestHash:'b'.repeat(64)};
  const candidate={taskId:review.id,version:'1.0.2',manifestHash:installed.manifestHash,
    stage:'available',manifest:{siteOrigins:review.siteOrigins,
      program:{sourceHash:review.sourceHash}}};
  const calls=[];
  const client={request:async(name)=>{
    calls.push(name);assert.equal(name,'listTaskCatalog');
    return {catalog:[candidate],installed:[installed]};
  }};
  assert.equal((await readLocalInstallOutcome({client,review,version:'1.0.2'})).state,'confirmed');
  assert.equal((await readLocalInstallOutcome({client,review,version:'1.0.1'})).state,'unconfirmed');
  candidate.manifest.program.sourceHash='f'.repeat(64);
  assert.equal((await readLocalInstallOutcome({client,review,version:'1.0.2'})).state,'unconfirmed');
  review.installedHash=installed.manifestHash;
  assert.equal((await readLocalInstallOutcome({client,review,version:'1.0.2'})).state,'baseline-unchanged');
  assert.deepEqual(calls,['listTaskCatalog','listTaskCatalog','listTaskCatalog','listTaskCatalog']);
});


test('Task install review binds permission and deadline changes and recognizes legacy 30s default',async()=>{
  const source=await makeSource(),state={catalog:[],installed:[]};
  const client={request:async()=>structuredClone(state)};
  const prepare=()=>prepareLocalProjectInstallation({client,source,binding,project,target,runId:'run-storage'});
  const first=await prepare();
  assert.deepEqual(first.permissions,['page.automation']);assert.equal(first.deadlineMs,30000);
  state.catalog=[{taskId:first.id,version:'1.0.0',manifestHash:'d'.repeat(64),manifest:{
    program:{sourceHash:source.sourceHash},siteOrigins:first.siteOrigins,paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}}}];
  state.installed=[{taskId:first.id,version:'1.0.0',manifestHash:'d'.repeat(64)}];
  assert.equal((await prepare()).alreadyInstalled,true);
  source.deadlineMs=30000;assert.equal((await prepare()).alreadyInstalled,true);
  source.deadlineMs=120000;const deadline=await prepare();
  assert.equal(deadline.alreadyInstalled,false);assert.equal(deadline.scopeChanged,true);
  assert.throws(()=>assertLocalInstallVersion(first,source,binding),{code:'E_DEV_CONFLICT'});
  source.permissions=['page.automation','storage.persistent'];const storage=await prepare();
  assert.deepEqual(storage.permissions,source.permissions);assert.equal(storage.deadlineMs,120000);
  assert.throws(()=>assertLocalInstallVersion(deadline,source,binding),{code:'E_DEV_CONFLICT'});
  assert.equal(storage.alreadyInstalled,false);assert.equal(storage.scopeChanged,true);
});

for(const outcome of ['verified','available','rejected'])test(`runtime recovery rechecks an existing available local Task before installation (${outcome})`,async()=>{
  const source=await makeSource(),calls=[];
  let hash;
  const client={request:async(method,input)=>{
    calls.push([method,input]);
    if(method==='listTaskCatalog')return {catalog:[],installed:[]};
    if(method==='importTaskPackage'){
      hash=input.package.manifestHash;
      return {stage:'available',runtimeCurrent:false,manifestHash:hash};
    }
    if(method==='verifyTaskCandidate'){
      assert.equal(input.runId,'fresh-local-run');
      if(outcome==='rejected')throw Object.assign(Error('No fresh proof'),{code:'E_VERIFICATION'});
      return {stage:outcome,runtimeCurrent:true,manifestHash:hash};
    }
    if(method==='makeTaskAvailable')return {stage:'available',manifestHash:hash};
    if(method==='installTask')return {...input};
    throw Error('Unexpected '+method);
  }};
  const review=await prepareLocalProjectInstallation({client,source,binding,project,target,runId:'fresh-local-run'});
  calls.length=0;
  const install=()=>commitLocalProjectInstallation({client,review,source,target,title:'恢复任务',version:review.version});
  if(outcome==='rejected')await assert.rejects(install,{code:'E_VERIFICATION'});
  else assert.equal((await install()).manifestHash,hash);
  assert.deepEqual(calls.map(([method])=>method),[
    'listTaskCatalog','importTaskPackage','verifyTaskCandidate',
    ...(outcome==='verified'?['makeTaskAvailable']:[]),
    ...(outcome==='rejected'?[]:['installTask'])]);
  assert.deepEqual(calls.find(([method])=>method==='verifyTaskCandidate')[1],{
    taskId:review.id,version:review.version,runId:'fresh-local-run'});
});

async function installedRecoveryFixture({candidateCurrent=false,installedCurrent=false}={}){
  const source=await makeSource(),calls=[];
  const first=await prepareLocalProjectInstallation({client:{request:async()=>({catalog:[],installed:[]})},
    source,binding,project,target,runId:'fresh-recovery-run'});
  const pkg=await createTaskPackage({format:'opendesk.task.v1',taskId:first.id,version:'1.0.4',
    title:'原固定任务',description:'保留原始描述',author:'original-author',source:'local-project',
    siteOrigins:first.siteOrigins,permissions:['page.automation'],entryFormat:'async-main',
    program:{revision:1,sourceHash:source.sourceHash},
    paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}},source.sourceUtf8);
  const candidate={taskId:first.id,version:pkg.manifest.version,manifestHash:pkg.manifestHash,
    manifest:pkg.manifest,stage:'available',runtimeCurrent:candidateCurrent};
  const installed={taskId:first.id,version:candidate.version,manifestHash:pkg.manifestHash,
    runtimeCurrent:installedCurrent,generation:3,installationId:'original-installation'};
  const client={request:async(method,input)=>{
    calls.push([method,input]);
    if(method==='listTaskCatalog')return {catalog:[structuredClone(candidate)],installed:[structuredClone(installed)]};
    if(method==='getTaskCandidate')return {...structuredClone(candidate),package:structuredClone(pkg)};
    if(method==='verifyTaskCandidate')return {...candidate,stage:candidateCurrent?'available':'verified',runtimeCurrent:true};
    if(method==='makeTaskAvailable')return {...candidate,stage:'available',runtimeCurrent:true};
    if(method==='installTask')return {...input};
    throw Error('Unexpected '+method);
  }};
  const prepare=()=>prepareLocalProjectInstallation({client,source,binding,project,target,runId:'fresh-recovery-run'});
  return {source,calls,pkg,candidate,installed,client,prepare};
}

for(const [candidateCurrent,installedCurrent] of [[false,false],[false,true],[true,false]])
  test(`runtime recovery local review and commit reuse immutable installed Task (${candidateCurrent}/${installedCurrent})`,async()=>{
    const f=await installedRecoveryFixture({candidateCurrent,installedCurrent});
    const review=await f.prepare();
    assert.equal(review.alreadyInstalled,false,'Save must reach installation review instead of returning early');
    assert.equal(review.version,f.installed.version,'runtime changes do not allocate a new Task version');
    assert.equal(review.defaultTitle,f.pkg.manifest.title);
    assert.equal(review.scopeChanged,false);
    f.calls.length=0;
    const hashes=[];
    const result=await commitLocalProjectInstallation({client:f.client,review,source:f.source,target,
      title:review.defaultTitle,version:review.version,onCandidate:hash=>hashes.push(hash)});
    assert.equal(result.manifestHash,f.pkg.manifestHash,'original author, description and complete manifest remain immutable');
    assert.deepEqual(hashes,[f.pkg.manifestHash]);
    assert.deepEqual(f.calls.map(([method])=>method),['listTaskCatalog','getTaskCandidate',
      'verifyTaskCandidate',...(candidateCurrent?[]:['makeTaskAvailable']),'installTask']);
    assert.deepEqual(f.calls.find(([method])=>method==='verifyTaskCandidate')[1],{
      taskId:review.id,version:f.installed.version,runId:'fresh-recovery-run'});
    assert.deepEqual(f.calls.at(-1)[1],{taskId:review.id,version:f.installed.version,
      manifestHash:f.pkg.manifestHash,expectedInstalledVersion:f.installed.version,
      expectedGeneration:f.installed.generation,expectedInstallationId:f.installed.installationId});
  });

test('runtime recovery local commit rejects edited version or title and drifted immutable package before verification',async()=>{
  for(const drift of ['version','title','package','proof']){
    const f=await installedRecoveryFixture(),review=await f.prepare();
    const request=f.client.request;
    f.client.request=async(method,input)=>{
      const value=await request(method,input);
      if(drift==='package'&&method==='getTaskCandidate'){
        const changed=await createTaskPackage({...f.pkg.manifest,description:'changed metadata'},f.pkg.sourceUtf8);
        return {...value,manifestHash:changed.manifestHash,package:changed};
      }
      if(drift==='proof'&&method==='verifyTaskCandidate')throw Object.assign(Error('Stale run'),{code:'E_VERIFICATION'});
      return value;
    };
    f.calls.length=0;
    await assert.rejects(()=>commitLocalProjectInstallation({client:f.client,review,source:f.source,target,
      title:drift==='title'?'改名':review.defaultTitle,version:drift==='version'?'1.0.5':review.version}),
      {code:drift==='proof'?'E_VERIFICATION':'E_REVISION'});
    assert.equal(f.calls.some(([method])=>['importTaskPackage','makeTaskAvailable','installTask'].includes(method)),false,drift);
    if(drift!=='proof')assert.equal(f.calls.some(([method])=>method==='verifyTaskCandidate'),false,drift);
  }
});

test('runtime recovery local review still allocates a new version for changed Controller contracts',async()=>{
  for(const change of [{sourceUtf8:'async function main(){return 99;}'},
    {permissions:['page.automation','storage.persistent']},{deadlineMs:120000},
    {paramsSchema:{type:'object',properties:{label:{type:'string',title:'Label'}},required:[],additionalProperties:false}}]){
    const f=await installedRecoveryFixture();Object.assign(f.source,change);
    f.source.sourceHash=await sha256Utf8(f.source.sourceUtf8);
    f.source.sourceBytes=new TextEncoder().encode(f.source.sourceUtf8).length;
    const review=await f.prepare();
    assert.equal(review.alreadyInstalled,false);
    assert.equal(review.version,'1.0.5');
  }
  const f=await installedRecoveryFixture({candidateCurrent:true,installedCurrent:true});
  assert.equal((await f.prepare()).alreadyInstalled,true,'current exact installations retain their existing shortcut');
});

test('runtime recovery flags leave exact installed Page recognition and revision allocation unchanged',async()=>{
  const source=await makeSource('page-userscript');
  const first=await prepareLocalProjectInstallation({client:{request:async()=>({catalog:[],installed:[]})},
    source,binding,project,target});
  const installed={programId:first.id,revision:4,manifestHash:'a'.repeat(64),sourceHash:source.sourceHash,
    pageRules:first.pageRules,runtimeCurrent:false};
  const client={request:async method=>{
    assert.equal(method,'listPagePrograms');
    return {catalog:[{...installed,entryFormat:source.entryFormat,runtimeCurrent:false}],installed:[installed]};
  }};
  const review=await prepareLocalProjectInstallation({client,source,binding,project,target});
  assert.equal(review.alreadyInstalled,true);assert.equal(review.version,'5');
});

async function lostRecoveryAcknowledgement(){
  const f=await installedRecoveryFixture(),review=await f.prepare();
  const pending={...review},request=f.client.request;
  f.client.request=async(method,input)=>{
    if(method==='installTask'){
      assert.equal(input.expectedInstallationId,review.installedInstallationId);
      assert.equal(input.expectedGeneration,review.installedGeneration);
      await request(method,input);
      Object.assign(f.candidate,{runtimeCurrent:true,stage:'available'});
      Object.assign(f.installed,{runtimeCurrent:true,generation:input.expectedGeneration+1});
      throw Object.assign(Error('Installation acknowledgement lost'),{code:'E_EFFECT_UNKNOWN'});
    }
    return request(method,input);
  };
  await assert.rejects(()=>commitLocalProjectInstallation({client:f.client,review,source:f.source,target,
    title:review.defaultTitle,version:review.version,
    onCandidate:hash=>{pending.attemptedManifestHash=hash;}}),{code:'E_EFFECT_UNKNOWN'});
  f.calls.length=0;
  return {...f,review:pending};
}

test('runtime recovery lost installation acknowledgement confirms same hash only at the expected next generation',async()=>{
  const f=await lostRecoveryAcknowledgement();
  assert.equal(f.review.installedInstallationId,f.installed.installationId);
  assert.equal(f.review.installedGeneration,f.installed.generation-1);
  const result=await readLocalInstallOutcome({client:f.client,review:f.review,version:f.review.version});
  assert.equal(result.state,'confirmed');assert.equal(result.manifestHash,f.pkg.manifestHash);
  assert.deepEqual(f.calls.map(([method])=>method),['listTaskCatalog'],'reconciliation must never replay installation or verification');
});

test('runtime recovery lost acknowledgement rejects replaced identities, unexpected generations and stale or conflicting proof',async()=>{
  const changes=[
    ['replacement',f=>{f.installed.installationId='replacement-installation';}],
    ['missing identity',f=>{delete f.installed.installationId;}],
    ['skipped generation',f=>{f.installed.generation++;}],
    ['older generation',f=>{f.installed.generation=f.review.installedGeneration-1;}],
    ['missing generation',f=>{delete f.installed.generation;}],
    ['missing baseline identity',f=>{delete f.review.installedInstallationId;}],
    ['missing baseline generation',f=>{delete f.review.installedGeneration;}],
    ['stale installation',f=>{f.installed.runtimeCurrent=false;}],
    ['unknown installation runtime',f=>{delete f.installed.runtimeCurrent;}],
    ['stale candidate',f=>{f.candidate.runtimeCurrent=false;}],
    ['unknown candidate runtime',f=>{delete f.candidate.runtimeCurrent;}],
    ['wrong package',f=>{f.installed.manifestHash='f'.repeat(64);}],
    ['wrong source',f=>{f.candidate.manifest.program.sourceHash='f'.repeat(64);}],
    ['wrong version',f=>{f.installed.version='1.0.5';}],
    ['wrong scope',f=>{f.candidate.manifest.siteOrigins=['https://other.example'];}],
    ['unavailable candidate',f=>{f.candidate.stage='verified';}],
    ['wrong attempt',f=>{f.review.attemptedManifestHash='f'.repeat(64);}]
  ];
  for(const [name,change] of changes){
    const f=await lostRecoveryAcknowledgement();change(f);
    assert.equal((await readLocalInstallOutcome({client:f.client,review:f.review,version:f.review.version})).state,'unconfirmed',name);
    assert.deepEqual(f.calls.map(([method])=>method),['listTaskCatalog'],name);
  }
  const f=await lostRecoveryAcknowledgement();
  f.installed.generation=f.review.installedGeneration;f.installed.runtimeCurrent=false;
  assert.equal((await readLocalInstallOutcome({client:f.client,review:f.review,version:f.review.version})).state,'baseline-unchanged',
    'an exact unchanged installation is not evidence that recovery committed');
});

test('runtime recovery rejects same-hash installation identity or generation conflicts against the reviewed CAS baseline',async()=>{
  for(const changed of ['identity','generation']){
    const f=await installedRecoveryFixture(),review=await f.prepare();
    if(changed==='identity')f.installed.installationId='replacement-installation';
    else f.installed.generation++;
    f.calls.length=0;
    await assert.rejects(()=>commitLocalProjectInstallation({client:f.client,review,source:f.source,target,
      title:review.defaultTitle,version:review.version}),{code:'E_REVISION'},changed);
    assert.deepEqual(f.calls.map(([method])=>method),['listTaskCatalog'],changed);
  }
});
