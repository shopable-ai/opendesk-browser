// R5 AI -> Task product contract, using actual compiler and Task service.
// Every run/receipt in this file is SYNTHETIC IN-MEMORY TEST INPUT.
// This is NOT an external model, trusted Chrome effect, CFT test or public availability proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinIdentity} from '../../src/libs/identity.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
import {BUILTIN_ABI} from '../../src/libs/runtime-contract.js';
import {digest} from '../../src/platform/protocol.js';
import {createTaskPackage,TASK_MANIFEST_FORMAT,taskScriptId} from '../../src/platform/tasks/contract.js';
import {taskMethods,assertInstalledTask} from '../../src/platform/tasks/service.js';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';

const ORIGIN='http://127.0.0.1:43111';
const runtimeIdentity=builtinIdentity(fakeBuiltinSource);
const errorCode=code=>err=>err?.code===code;

function reviewedPlan(){
  const w=emptyWorkflow(ORIGIN,'acbd1234-1234-5678-abcd-123456789012');
  w.title='审核后复用搜索';
  w.description='在有权限的本机测试表单中查询指定关键词';
  w.paramsSchema={type:'object',properties:{
    keyword:{type:'string',title:'搜索关键词',minLength:1,maxLength:80,default:'OpenDesk'}
  },required:['keyword'],additionalProperties:false};
  w.steps=[
    {stepId:'searchValue',op:'fill',locatorKind:'label',selector:'搜索关键词',param:'keyword'},
    {stepId:'submit',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'},
    {stepId:'waitResults',op:'wait',locatorKind:'text',selector:'搜索完成',timeout:10000},
    {stepId:'readResults',op:'extract',locatorKind:'css',selector:'#results'}
  ];
  return w;
}
async function versionedPackage(workflow,version='1.0.0',revision=1){
  const compiled=await compileWorkflow(workflow);
  const manifest={format:TASK_MANIFEST_FORMAT,taskId:'gf.reviewed-search',version,
    title:'已审阅搜索工具',description:'合同单测：真实网页未由此文件执行',
    author:'OpenDesk Browser',source:'contract-test-only',
    siteOrigins:[ORIGIN],permissions:['page.automation'],entryFormat:'async-main',
    program:{revision,sourceHash:compiled.sourceHash},paramsSchema:workflow.paramsSchema};
  return {pkg:await createTaskPackage(manifest,compiled.sourceUtf8),compiled};
}
function inMemoryHost(){
  const stores=new Map();
  const read=store=>{if(!stores.has(store))stores.set(store,new Map());return stores.get(store);};
  const tx={
    get:async(store,key)=>structuredClone(read(store).get(key)),
    put:async(store,value,key)=>{read(store).set(key,structuredClone(value));},
    delete:async(store,key)=>{read(store).delete(key);},
    all:async store=>[...read(store).values()].map(row=>structuredClone(row))
  };
  const storage={transaction:async(stores,mode,fn)=>fn(tx)};
  const namespace='tool:global-first-r5-contract';
  const runtime={getURL:path=>'chrome-extension://r5-unit-only/'+path};
  const service=taskMethods({storage,api:{runtime},
    loadBuiltin:async({runtime:actual})=>{assert.equal(actual,runtime);return fakeBuiltinSource;},
    assertHost:async()=>({namespace,registrationId:'synthetic-test-host'}),
    currentHost:async()=>true,clock:{now:()=>1720000000000}
  });
  return {tx,namespace,call:(name,payload)=>service[name](payload,{})};
}
async function insertSyntheticEffect(host,hash,runId){
  const resultId='result:'+runId, requestId='op:'+runId;
  const run={builtinIdentity:runtimeIdentity,builtinAbi:BUILTIN_ABI,tag:'controller-run',
    namespace:host.namespace,runId,resultId,state:'completed',
    retirementState:'released',workerRetired:true,
    scriptId:'draft:'+runId,hostInstanceId:'unit-host-instance',
    hostDocumentId:'unit-page-document',revision:{sourceHash:hash},
    target:{allowedOrigin:ORIGIN}};
  const result={builtinIdentity:runtimeIdentity,tag:'controller-result',
    namespace:host.namespace,runId,resultId,state:'completed',
    revision:{sourceHash:hash},outcome:{ok:true}};
  const envelope={requestId,identity:{tag:'controller-run',runId,
    scriptId:run.scriptId,hostInstanceId:run.hostInstanceId,
    hostDocumentId:run.hostDocumentId,contentHash:hash},
    revision:{sourceHash:hash},target:{allowedOrigin:ORIGIN},
    operation:{kind:'packaged',method:'click',args:[]}};
  const reply={requestId,value:{kind:'undefined'}};
  const operation={tag:'controller-operation',runId,state:'durable',envelope,reply,
    requestDigest:await digest(envelope,{maxDepth:48}),
    nativeReceipts:[{stage:'result',requestId,receipt:structuredClone(reply)}]};
  await host.tx.put('runs',run,runId);
  await host.tx.put('results',result,resultId);
  await host.tx.put('commandJournal',operation,requestId);
}

test('AI-shaped reviewed steps compile and enter the original Candidate->Available->Installed service',async()=>{
  const host=inMemoryHost(),{pkg,compiled}=await versionedPackage(reviewedPlan());
  assert.match(compiled.sourceHash,/^[a-f0-9]{64}$/);
  assert.equal(pkg.manifest.program.sourceHash,compiled.sourceHash);
  assert.match(pkg.sourceUtf8,/async function main\(\)/);
  assert.doesNotMatch(pkg.sourceUtf8,/requestWorkflowPlan|openai|anthropic|\bfetch\(/i);
  const candidate=await host.call('importTaskPackage',{package:pkg});
  assert.equal(candidate.stage,'candidate');
  await assert.rejects(host.call('makeTaskAvailable',{taskId:pkg.manifest.taskId,
    version:pkg.manifest.version,manifestHash:pkg.manifestHash}),errorCode('E_VERIFICATION'));
  await assert.rejects(host.call('installTask',{taskId:pkg.manifest.taskId,
    version:pkg.manifest.version,manifestHash:pkg.manifestHash,expectedInstalledVersion:null}),
    errorCode('E_VERIFICATION'));

  const runId='synthetic-first-run';
  await assert.rejects(host.call('verifyTaskCandidate',{taskId:pkg.manifest.taskId,
    version:pkg.manifest.version,runId}),errorCode('E_VERIFICATION'));
  // This is a deliberately synthetic journal. Proving correct admission mechanics
  // here does not authenticate any Chrome page action or user consent.
  await insertSyntheticEffect(host,compiled.sourceHash,runId);
  assert.equal((await host.call('verifyTaskCandidate',{taskId:pkg.manifest.taskId,
    version:pkg.manifest.version,runId})).stage,'verified');
  assert.equal((await host.call('makeTaskAvailable',{taskId:pkg.manifest.taskId,
    version:pkg.manifest.version,manifestHash:pkg.manifestHash})).stage,'available');
  const installed=await host.call('installTask',{taskId:pkg.manifest.taskId,
    version:pkg.manifest.version,manifestHash:pkg.manifestHash,expectedInstalledVersion:null});
  assert.equal(installed.enabled,true);
  const resolved=await host.call('resolveInstalledTask',{taskId:pkg.manifest.taskId});
  assert.equal(resolved.version,'1.0.0');
  assert.equal(resolved.manifestHash,pkg.manifestHash);
  assert.equal(resolved.contentHash,compiled.sourceHash);
  assert.equal(resolved.generation,1);
  assert.ok(resolved.installationId.length>=8);
  assert.equal(resolved.scriptId,taskScriptId(pkg.manifest.taskId,'1.0.0'));
  // The original run authorization, not an AI session, gates each admission.
  for(const keyword of ['OpenDesk','Again']){
    const x=await assertInstalledTask(host.tx,host.namespace,{
      scriptId:resolved.scriptId,builtinIdentity:runtimeIdentity,
      contentHash:compiled.sourceHash,origin:ORIGIN,params:{keyword}
    });
    assert.equal(x.installation.authorization.installationId,resolved.installationId);
    assert.equal(x.installation.authorization.generation,1);
  }
  await assert.rejects(assertInstalledTask(host.tx,host.namespace,{
    scriptId:resolved.scriptId,builtinIdentity:runtimeIdentity,
    contentHash:'f'.repeat(64),origin:ORIGIN,params:{keyword:'Again'}
  }),errorCode('E_PERMISSION'));
  await assert.rejects(assertInstalledTask(host.tx,host.namespace,{
    scriptId:resolved.scriptId,builtinIdentity:runtimeIdentity,
    contentHash:compiled.sourceHash,origin:'https://wrong.example',params:{keyword:'Again'}
  }),errorCode('E_PERMISSION'));
});

test('a new AI revision cannot silently replace the fixed installed version or regain revoked permission',async()=>{
  const host=inMemoryHost(),workflow=reviewedPlan(),{pkg,compiled}=await versionedPackage(workflow);
  await host.call('importTaskPackage',{package:pkg});
  await insertSyntheticEffect(host,compiled.sourceHash,'synthetic-verification');
  await host.call('verifyTaskCandidate',{taskId:pkg.manifest.taskId,version:'1.0.0',runId:'synthetic-verification'});
  await host.call('makeTaskAvailable',{taskId:pkg.manifest.taskId,version:'1.0.0',manifestHash:pkg.manifestHash});
  await host.call('installTask',{taskId:pkg.manifest.taskId,version:'1.0.0',manifestHash:pkg.manifestHash,
    expectedInstalledVersion:null});
  const before=await host.call('resolveInstalledTask',{taskId:pkg.manifest.taskId});
  const amended=structuredClone(workflow);
  amended.steps[0].selector='新输入标签';
  const next=await versionedPackage(amended,'1.0.1',2);
  assert.notEqual(next.compiled.sourceHash,compiled.sourceHash);
  assert.notEqual(next.pkg.manifestHash,pkg.manifestHash);
  assert.equal((await host.call('importTaskPackage',{package:next.pkg})).stage,'candidate');
  await assert.rejects(host.call('installTask',{taskId:next.pkg.manifest.taskId,version:'1.0.1',
    manifestHash:next.pkg.manifestHash,expectedInstalledVersion:'1.0.0',
    expectedGeneration:before.generation,expectedInstallationId:before.installationId}),
  errorCode('E_VERIFICATION'));
  const unchanged=await host.call('resolveInstalledTask',{taskId:pkg.manifest.taskId});
  assert.equal(unchanged.manifestHash,before.manifestHash);
  assert.equal(unchanged.installationId,before.installationId);
  await host.call('setInstalledTaskEnabled',{taskId:pkg.manifest.taskId,version:'1.0.0',
    enabled:false,expectedGeneration:before.generation,expectedInstallationId:before.installationId});
  await assert.rejects(host.call('resolveInstalledTask',{taskId:pkg.manifest.taskId}),
    errorCode('E_PERMISSION'));
  await assert.rejects(assertInstalledTask(host.tx,host.namespace,{
    scriptId:before.scriptId,builtinIdentity:runtimeIdentity,
    contentHash:compiled.sourceHash,origin:ORIGIN,params:{keyword:'Again'}
  }),errorCode('E_PERMISSION'));
});
