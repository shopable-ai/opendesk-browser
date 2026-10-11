import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Utf8} from '../../src/scripting/user-scripts/page-program-package.js';
import {prepareLocalProjectInstallation,assertLocalInstallVersion,
  commitLocalProjectInstallation,readLocalInstallOutcome} from '../../src/ui/local-project-install.js';

const binding={bindingId:'local-'+'a'.repeat(20),providerEpoch:'epoch-a'};
const project={name:'开发项目',sourceId:'source-b'};
const target={tabId:5,frameId:0,windowId:2,documentId:'doc-a',
  url:'https://sample.example/form',origin:'https://sample.example'};
const makeSource=async(kind='controller')=>{
  const sourceUtf8=kind==='controller'
    ?'async function main(){return await page.title();}'
    :'async function main(){document.title="Page";return 42;}';
  return {bindingId:binding.bindingId,projectId:'local-project-a',runtimeKind:kind,
    entryFormat:'async-main',sourceUtf8,sourceHash:await sha256Utf8(sourceUtf8),
    inputHash:'c'.repeat(64),sourceBytes:new TextEncoder().encode(sourceUtf8).length,
    siteOrigins:['https://sample.example']};
};
test('Controller packages retain confirmed bytes and reuse Task v1 verification/installation',async()=>{
  const source=await makeSource();const calls=[],catalog={catalog:[],installed:[]};
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

test('read-only Save recognizes an exact installed Page and Task without allocating another version',async()=>{
  const page=await makeSource('page-userscript');
  const firstPage=await prepareLocalProjectInstallation({client:{request:async()=>({catalog:[]})},
    source:page,binding,project,target});
  const pageRules={matches:['https://sample.example/*'],excludeMatches:[],
    runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
  const installedPage={revision:1,manifestHash:'a'.repeat(64),sourceHash:page.sourceHash,
    pageRules,enabled:false,nativeState:'disabled'};
  const pageClient={request:async()=>({catalog:[{programId:firstPage.id,revision:1,
    manifestHash:installedPage.manifestHash,pageRules,installed:installedPage}]})};
  const samePage=await prepareLocalProjectInstallation({client:pageClient,source:page,binding,project,target});
  assert.equal(samePage.alreadyInstalled,true);
  assert.equal(samePage.installedVersion,1);
  assert.equal(samePage.version,'2');
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

test('read-only unknown receipt reconciliation confirms Page only with exact Available native state',async()=>{
  const review={id:'page-A',kind:'page-userscript',sourceHash:'a'.repeat(64),
    installedHash:null,pageRules:{matches:['https://example.com/*'],excludeMatches:[],
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
  install.nativeState='pending';
  assert.equal((await readLocalInstallOutcome({client,review,version:'2'})).state,'unconfirmed');
  install.nativeState='disabled';install.enabled=false;install.authorization.status='disabled';
  assert.equal((await readLocalInstallOutcome({client,review,version:'2'})).state,'confirmed');
  review.installedHash=row.manifestHash;
  assert.equal((await readLocalInstallOutcome({client,review,version:'2'})).state,'baseline-unchanged');
  assert.equal(calls,4);
});
test('read-only unknown receipt reconciliation refuses wrong Task version, source and baseline',async()=>{
  const review={kind:'controller',id:'task-A',sourceHash:'a'.repeat(64),
    installedHash:null,siteOrigins:['https://example.com']};
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
