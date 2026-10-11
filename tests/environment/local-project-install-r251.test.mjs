import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Utf8} from '../../src/scripting/user-scripts/page-program-package.js';
import {prepareLocalProjectInstallation,assertLocalInstallVersion,
  commitLocalProjectInstallation} from '../../src/ui/local-project-install.js';

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
  await assert.rejects(()=>commitLocalProjectInstallation({client,review:planned,
    source:{...source,inputHash:'e'.repeat(64)},target,title:'name',version:planned.version}),
    {code:'E_DEV_CONFLICT'});
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
