// R5 integration regression: real Workflow compiler + real Task v1 Service.
 // This uses an isolated memory DB and synthetic operation receipt IN TEST ONLY.
 // It cannot qualify as Mac Chrome native, real model tool use or real installed-run receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinIdentity} from '../../src/libs/identity.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
import {BUILTIN_ABI} from '../../src/libs/runtime-contract.js';
import {digest} from '../../src/platform/protocol.js';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';
import {createTaskPackage,taskScriptId, TASK_MANIFEST_FORMAT} from '../../src/platform/tasks/contract.js';
import {taskMethods,assertInstalledTask} from '../../src/platform/tasks/service.js';

const identity=builtinIdentity(fakeBuiltinSource);
const origin='http://127.0.0.1:43111';
const rejection=(code)=>error=>error?.code===code;

function authoredWorkflow(){
  const workflow=emptyWorkflow(origin,'12345678-aaaa-bbbb-cccc-123456789abc');
  workflow.title='每周复用演示搜索';
  workflow.description='在用户有权访问的演示网页填写关键词并检查结果';
  workflow.paramsSchema={type:'object',properties:{keyword:{type:'string',title:'关键词',
    minLength:1,maxLength:80,default:'OpenDesk'}},required:['keyword'],additionalProperties:false};
  workflow.steps=[
    {stepId:'keyword',op:'fill',locatorKind:'label',selector:'搜索关键词',param:'keyword'},
    {stepId:'submit',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'},
    {stepId:'ready',op:'wait',locatorKind:'text',selector:'搜索完成',timeout:10000},
    {stepId:'readResult',op:'extract',locatorKind:'css',selector:'#results'}];
  return workflow;
}
async function compilePackage(workflow,version='1.0.1'){
  const compiled=await compileWorkflow(workflow);
  const manifest={format:TASK_MANIFEST_FORMAT,taskId:workflow.workflowId,
    version,title:workflow.title,description:workflow.description,author:'OpenDesk Demo',
    source:'local-reviewed-workflow',siteOrigins:[workflow.siteOrigin],
    permissions:['page.automation'],entryFormat:'async-main',
    program:{revision:1,sourceHash:compiled.sourceHash},
    paramsSchema:workflow.paramsSchema};
  return {compiled,package:await createTaskPackage(manifest,compiled.sourceUtf8)};
}
function isolatedService(){
  const records=new Map();
  const bucket=name=>{if(!records.has(name))records.set(name,new Map());return records.get(name);};
  const tx={
    get:async(s,k)=>structuredClone(bucket(s).get(k)),
    put:async(s,value,k)=>{bucket(s).set(k,structuredClone(value));},
    delete:async(s,k)=>{bucket(s).delete(k);},
    all:async(s)=>[...bucket(s).values()].map(value=>structuredClone(value))
  };
  const namespace='global-first-r5:component-only';
  const api={runtime:{getURL:path=>'chrome-extension://r5-component-only/'+path}};
  const service=taskMethods({storage:{transaction:async(_stores,_mode,fn)=>fn(tx)},
    api,loadBuiltin:async()=>fakeBuiltinSource,
    assertHost:async()=>({namespace,registrationId:'fake-host-not-native'}),
    currentHost:async()=>true,clock:{now:()=>1791870000000}});
  return {tx,namespace,call:(method,params)=>service[method](params,{})};
}
async function syntheticReceipt(f,compiled,runId,{wrongHash=false}={}){
  const resultId='component-result-'+runId;
  const requestId='component-effect-'+runId;
  const sourceHash=wrongHash?'0'.repeat(64):compiled.sourceHash;
  const run={
    tag:'controller-run',builtinIdentity:identity,builtinAbi:BUILTIN_ABI,
    runId,resultId,namespace:f.namespace,scriptId:'draft:'+runId,
    hostInstanceId:'fake-host',hostDocumentId:'fake-document',
    state:'completed',retirementState:'released',workerRetired:true,
    revision:{sourceHash},target:{allowedOrigin:origin}};
  const result={
    tag:'controller-result',builtinIdentity:identity,namespace:f.namespace,
    runId,resultId,state:'completed',revision:{sourceHash},outcome:{ok:true}};
  const envelope={requestId,identity:{
    tag:'controller-run',runId,scriptId:run.scriptId,
    hostInstanceId:run.hostInstanceId,hostDocumentId:run.hostDocumentId,
    contentHash:sourceHash},revision:{sourceHash},
    target:{allowedOrigin:origin},
    operation:{kind:'packaged',method:'click',args:[]}};
  const reply={requestId,value:{kind:'undefined'}};
  const journal={tag:'controller-operation',runId,state:'durable',
    envelope,reply,requestDigest:await digest(envelope,{maxDepth:48}),
    nativeReceipts:[{stage:'result',requestId,receipt:reply}]};
  await f.tx.put('runs',run,runId);
  await f.tx.put('results',result,resultId);
  await f.tx.put('commandJournal',journal,requestId);
}

test('one reviewed Workflow compiles to immutable Task Candidate but cannot skip verification',async()=>{
  const f=isolatedService(),{compiled,package:pkg}=await compilePackage(authoredWorkflow());
  assert.match(compiled.sourceHash,/^[0-9a-f]{64}$/);
  assert.equal(pkg.manifest.program.sourceHash,compiled.sourceHash);
  assert.equal(pkg.sourceUtf8,compiled.sourceUtf8);
  const saved=await f.call('importTaskPackage',{package:pkg});
  assert.equal(saved.stage,'candidate');
  assert.equal(saved.manifestHash,pkg.manifestHash);
  await assert.rejects(f.call('makeTaskAvailable',{
    taskId:pkg.manifest.taskId,version:pkg.manifest.version,
    manifestHash:pkg.manifestHash}),rejection('E_VERIFICATION'));
  await assert.rejects(f.call('installTask',{
    taskId:pkg.manifest.taskId,version:pkg.manifest.version,
    manifestHash:pkg.manifestHash,expectedInstalledVersion:null}),rejection('E_VERIFICATION'));
  await assert.rejects(f.call('verifyTaskCandidate',{
    taskId:pkg.manifest.taskId,version:pkg.manifest.version,
    runId:'no-real-or-mock-run'}),rejection('E_VERIFICATION'));
});

test('real compiler + original Service binds exact source/manifest through mock verify-install and twice checks repeated admission',async()=>{
  const f=isolatedService(),{compiled,package:pkg}=await compilePackage(authoredWorkflow());
  const request={taskId:pkg.manifest.taskId,version:pkg.manifest.version};
  const imported=await f.call('importTaskPackage',{package:pkg});
  assert.equal(imported.stage,'candidate');
  const runId='synthetic-node-only-1';
  await syntheticReceipt(f,compiled,runId);
  const verified=await f.call('verifyTaskCandidate',{...request,runId});
  assert.equal(verified.stage,'verified');
  assert.equal(verified.verification.sourceHash,compiled.sourceHash);
  assert.equal(verified.verification.runId,runId);
  assert.equal((await f.call('makeTaskAvailable',{...request,manifestHash:pkg.manifestHash})).stage,'available');
  const installed=await f.call('installTask',{
    ...request,manifestHash:pkg.manifestHash,expectedInstalledVersion:null});
  assert.equal(installed.enabled,true);
  const current=await f.call('resolveInstalledTask',{taskId:request.taskId});
  assert.equal(current.scriptId,taskScriptId(request.taskId,request.version));
  assert.equal(current.contentHash,compiled.sourceHash);
  assert.equal(current.manifestHash,pkg.manifestHash);
  assert.match(current.installationId,/^[0-9a-f-]{36}$/);
  assert.equal(current.generation,1);
  const admissions=[];
  // This checks the same deterministic installed source against the *real*
  // Task admission guard twice; it DOES NOT fake separate Chrome executions.
  for(const keyword of ['OpenDesk','Again']){
    const row=await assertInstalledTask(f.tx,f.namespace,{
      scriptId:current.scriptId,contentHash:current.contentHash,
      builtinIdentity:identity,origin,params:{keyword}});
    admissions.push({
      sourceHash:row.candidate.package.manifest.program.sourceHash,
      installationId:row.installation.authorization.installationId,
      generation:row.installation.authorization.generation});
  }
  assert.equal(admissions.length,2);
  assert.ok(admissions.every(row=>row.sourceHash===compiled.sourceHash&&
    row.installationId===current.installationId&&row.generation===current.generation));
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{
    scriptId:current.scriptId,contentHash:current.contentHash,builtinIdentity:identity,
    origin:'https://unapproved.example',params:{keyword:'Bad'}}),rejection('E_PERMISSION'));
  await f.call('setInstalledTaskEnabled',{...request,enabled:false,
    expectedGeneration:current.generation,expectedInstallationId:current.installationId});
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{
    scriptId:current.scriptId,contentHash:current.contentHash,builtinIdentity:identity,
    origin,params:{keyword:'Again'}}),rejection('E_PERMISSION'));
});

test('a newly generated Workflow source cannot use an older verification run or silently replace a fixed Task version',async()=>{
  const f=isolatedService(),workflow=authoredWorkflow();
  const a=await compilePackage(workflow,'1.0.1');
  const changed=structuredClone(workflow);
  changed.steps[0].selector='另一输入字段';
  const b=await compilePackage(changed,'1.0.2');
  assert.notEqual(a.compiled.sourceHash,b.compiled.sourceHash);
  await f.call('importTaskPackage',{package:b.package});
  await syntheticReceipt(f,a.compiled,'synthetic-old-source-receipt');
  await assert.rejects(f.call('verifyTaskCandidate',{
    taskId:b.package.manifest.taskId,version:b.package.manifest.version,
    runId:'synthetic-old-source-receipt'}),rejection('E_VERIFICATION'));
  const catalog=(await f.call('listTaskCatalog',{})).catalog;
  assert.equal(catalog.length,1);
  assert.equal(catalog[0].stage,'candidate');
  await assert.rejects(f.call('installTask',{
    taskId:b.package.manifest.taskId,version:b.package.manifest.version,
    manifestHash:b.package.manifestHash,expectedInstalledVersion:null}),rejection('E_VERIFICATION'));
  const aManifest={...a.package.manifest,description:'altered under same version'};
  const {createTaskPackage:fromRealContract}=await import('../../src/platform/tasks/contract.js');
  const differentlyHashed=await fromRealContract(aManifest,a.compiled.sourceUtf8);
  await f.call('importTaskPackage',{package:a.package});
  await assert.rejects(f.call('importTaskPackage',{package:differentlyHashed}),rejection('E_REQUEST_CONFLICT'));
});
