import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {digest, digestUtf8} from '../../src/platform/protocol.js';
import {createTaskPackage, verifyTaskPackage, validateTaskParams, taskScriptId,
  TASK_MANIFEST_FORMAT} from '../../src/platform/tasks/contract.js';
import {assertInstalledTask, taskMethods} from '../../src/platform/tasks/service.js';

// Repository/authority component test only. This is not a Chrome native receipt.
const source='async function main() { await page.click("#go"); return {ok:true}; }';
async function example() {
  const manifest={format:TASK_MANIFEST_FORMAT,taskId:'example.dom-click',version:'1.0.0',
    title:'示例网页点击',description:'点击页面的按钮并返回结果',
    author:'OpenDesk',source:'local-fixture',
    siteOrigins:['https://example.com'],permissions:['page.automation'],
    entryFormat:'async-main',program:{revision:1,sourceHash:await digestUtf8(source)},
    paramsSchema:{type:'object',properties:{name:{type:'string',title:'名称',minLength:1,maxLength:20}},
      required:['name'],additionalProperties:false}};
  return createTaskPackage(manifest,source);
}
function fixture() {
  const data=new Map();
  const read=store=>{if(!data.has(store))data.set(store,new Map());return data.get(store);};
  const tx={get:async(store,key)=>structuredClone(read(store).get(key)),
    put:async(store,value,key)=>{read(store).set(key,structuredClone(value));},
    delete:async(store,key)=>{read(store).delete(key);},
    all:async store=>[...read(store).values()].map(row=>structuredClone(row))};
  const storage={transaction:async(stores,mode,fn)=>fn(tx)};
  const host={namespace:'tool:fixture',registrationId:'host-1'};
  const service=taskMethods({storage,assertHost:async()=>host,currentHost:async()=>true,
    clock:{now:()=>1720000000000}});
  const send=(name,payload)=>service[name](payload,{});
  return {tx,read,send,namespace:host.namespace};
}
const errorCode=code=>error=>error?.code===code;

test('package hashes and closed schema reject forged status, altered source, extra permissions and invalid params',async()=>{
  const pkg=await example();
  assert.equal((await verifyTaskPackage(pkg)).manifest.taskId,'example.dom-click');
  assert.deepEqual(validateTaskParams(pkg.manifest.paramsSchema,{name:'Alice'}),{name:'Alice'});
  assert.throws(()=>validateTaskParams(pkg.manifest.paramsSchema,{name:''}),errorCode('E_PARAMS'));
  assert.throws(()=>validateTaskParams(pkg.manifest.paramsSchema,{name:'Alice',admin:true}),errorCode('E_SCHEMA'));
  await assert.rejects(verifyTaskPackage({...pkg,verified:true}),errorCode('E_SCHEMA'));
  await assert.rejects(verifyTaskPackage({...pkg,sourceUtf8:pkg.sourceUtf8+'//changed'}),errorCode('E_HASH'));
  await assert.rejects(verifyTaskPackage({...pkg,manifest:{...pkg.manifest,permissions:['page.automation','all_sites']}}),errorCode('E_PERMISSION'));
  await assert.rejects(verifyTaskPackage({...pkg,manifest:{...pkg.manifest,siteOrigins:['https://other.example']}}),errorCode('E_HASH'));
});

test('candidate cannot install without matching trustworthy native run, then exact Available version can install',async()=>{
  const f=fixture(),pkg=await example();
  const initial=await f.send('importTaskPackage',{package:pkg});
  assert.equal(initial.stage,'candidate');
  assert.equal((await f.send('listTaskCatalog',{})).catalog.length,1);
  await assert.rejects(f.send('installTask',{taskId:pkg.manifest.taskId,version:'1.0.0',
    manifestHash:pkg.manifestHash,expectedInstalledVersion:null}),errorCode('E_VERIFICATION'));
  await assert.rejects(f.send('verifyTaskCandidate',{taskId:pkg.manifest.taskId,version:'1.0.0',runId:'nonexistent'}),errorCode('E_VERIFICATION'));
  const runId='run-native-1',resultId='result-native-1';
  const run={tag:'controller-run',runId,namespace:f.namespace,state:'completed',
    retirementState:'released',workerRetired:true,scriptId:'draft:run-native-1',
    hostInstanceId:'host-instance',hostDocumentId:'host-document',
    revision:{sourceHash:pkg.manifest.program.sourceHash},
    target:{allowedOrigin:'https://example.com'},resultId};
  const result={tag:'controller-result',resultId,runId,namespace:f.namespace,state:'completed',
    revision:{sourceHash:pkg.manifest.program.sourceHash},outcome:{ok:true}};
  await f.tx.put('runs',run,runId);
  await f.tx.put('results',result,resultId);
  await assert.rejects(f.send('verifyTaskCandidate',{taskId:pkg.manifest.taskId,version:'1.0.0',runId}),errorCode('E_VERIFICATION'));
  const envelope={requestId:'native-op-1',
    identity:{tag:'controller-run',runId,scriptId:run.scriptId,
      hostInstanceId:run.hostInstanceId,hostDocumentId:run.hostDocumentId,
      contentHash:pkg.manifest.program.sourceHash},
    revision:{sourceHash:pkg.manifest.program.sourceHash},
    target:{allowedOrigin:'https://example.com'},
    operation:{kind:'packaged',method:'click',args:[]}};
  const reply={requestId:envelope.requestId,value:{kind:'undefined'}};
  await f.tx.put('commandJournal',{tag:'controller-operation',runId,state:'durable',
    requestDigest:await digest(envelope,{maxDepth:48}),envelope,reply,
    nativeReceipts:[{stage:'result',requestId:envelope.requestId,receipt:reply}]},'op-real');
  assert.equal((await f.send('verifyTaskCandidate',{taskId:pkg.manifest.taskId,version:'1.0.0',runId})).stage,'verified');
  assert.equal((await f.send('makeTaskAvailable',{taskId:pkg.manifest.taskId,version:'1.0.0',
    manifestHash:pkg.manifestHash})).stage,'available');
  assert.equal((await f.send('installTask',{taskId:pkg.manifest.taskId,version:'1.0.0',
    manifestHash:pkg.manifestHash,expectedInstalledVersion:null})).enabled,true);
  const scriptId=taskScriptId(pkg.manifest.taskId,pkg.manifest.version);
  assert.equal((await f.send('resolveInstalledTask',{taskId:pkg.manifest.taskId})).scriptId,scriptId);
  assert.equal((await f.send('listTaskCatalog',{})).installed[0].version,'1.0.0');
  await assertInstalledTask(f.tx,f.namespace,{scriptId,contentHash:pkg.manifest.program.sourceHash,
    origin:'https://example.com',params:{name:'Alice'}});
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{scriptId,contentHash:pkg.manifest.program.sourceHash,
    origin:'https://wrong.example',params:{name:'Alice'}}),errorCode('E_PERMISSION'));
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{scriptId,contentHash:'0'.repeat(64),
    origin:'https://example.com',params:{name:'Alice'}}),errorCode('E_PERMISSION'));
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{scriptId,contentHash:pkg.manifest.program.sourceHash,
    origin:'https://example.com',params:{name:''}}),errorCode('E_PARAMS'));
  await f.send('setInstalledTaskEnabled',{taskId:pkg.manifest.taskId,version:'1.0.0',enabled:false});
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{scriptId,contentHash:pkg.manifest.program.sourceHash,
    origin:'https://example.com',params:{name:'Alice'}}),errorCode('E_PERMISSION'));
  await f.send('uninstallTask',{taskId:pkg.manifest.taskId,version:'1.0.0'});
  assert.equal((await f.send('listTaskCatalog',{})).installed.length,0);
  assert.equal((await f.tx.all('scriptRevisions')).length,1,'uninstall keeps immutable version for result history');
});

test('same task version cannot replace bytes and install CAS rejects stale upgrades',async()=>{
  const f=fixture(),pkg=await example();
  await f.send('importTaskPackage',{package:pkg});
  const changed={...pkg,manifest:{...pkg.manifest,title:'换标题'}};
  await assert.rejects(f.send('importTaskPackage',{package:changed}),errorCode('E_HASH'));
  await assert.rejects(f.send('getTaskCandidate',{taskId:'no-such-id',version:'1.0.0'}),errorCode('E_OWNER'));
});


test('the checked-in sample is an authentic v1 package with exact manifest and source hashes',async()=>{
  const text=await readFile('examples/tasks/form-fill.v1.opendesk-task.json','utf8');
  const pkg=await verifyTaskPackage(JSON.parse(text));
  assert.equal(pkg.manifest.taskId,'sample.form-fill');
  assert.equal(pkg.manifest.siteOrigins[0],'http://127.0.0.1:43111');
  assert.deepEqual(validateTaskParams(pkg.manifest.paramsSchema,{}),{name:'Alice'});
});

test('formal verification refuses altered admission identity, failed effects and mismatched receipts',async()=>{
  const pkg=await example(),hash=pkg.manifest.program.sourceHash;
  const mutations=[
    ['caught native error',async ({op})=>{
      op.reply={requestId:op.envelope.requestId,error:{code:'E_TARGET',message:'Site operation failed'}};
      op.nativeReceipts[0].receipt=structuredClone(op.reply);
    }],
    ['forged receipt request ID',async ({op})=>{op.nativeReceipts[0].requestId='other';}],
    ['tampered operation digest',async ({op})=>{op.requestDigest='0'.repeat(64);}],
    ['different host document',async ({op})=>{
      op.envelope.identity.hostDocumentId='stale-document';
      op.requestDigest=await digest(op.envelope,{maxDepth:48});
    }],
    ['different script hash',async ({op})=>{
      op.envelope.identity.contentHash='0'.repeat(64);
      op.requestDigest=await digest(op.envelope,{maxDepth:48});
    }],
    ['unretired worker',async ({run})=>{run.workerRetired=false;}],
    ['result key mismatch',async ({result})=>{result.resultId='other-result';}]
  ];
  for(const [reason,mutate] of mutations){
    const f=fixture();await f.send('importTaskPackage',{package:pkg});
    const runId='verification-run',resultId='verification-result',requestId='page-op-1';
    const run={tag:'controller-run',runId,resultId,namespace:f.namespace,
      scriptId:'draft:verification-run',hostInstanceId:'host-run',hostDocumentId:'host-document',
      state:'completed',retirementState:'released',workerRetired:true,
      revision:{sourceHash:hash},target:{allowedOrigin:'https://example.com'}};
    const result={tag:'controller-result',resultId,runId,namespace:f.namespace,
      state:'completed',revision:{sourceHash:hash},outcome:{ok:true}};
    const envelope={requestId,identity:{tag:'controller-run',runId,scriptId:run.scriptId,
      hostInstanceId:run.hostInstanceId,hostDocumentId:run.hostDocumentId,contentHash:hash},
      revision:{sourceHash:hash},target:{allowedOrigin:'https://example.com'},
      operation:{kind:'packaged',method:'click',args:[]}};
    const reply={requestId,value:{kind:'undefined'}};
    const op={tag:'controller-operation',runId,state:'durable',envelope,reply,
      requestDigest:await digest(envelope,{maxDepth:48}),
      nativeReceipts:[{stage:'result',requestId,receipt:structuredClone(reply)}]};
    await mutate({run,result,op});
    await f.tx.put('runs',run,runId);await f.tx.put('results',result,resultId);
    await f.tx.put('commandJournal',op,requestId);
    await assert.rejects(f.send('verifyTaskCandidate',{taskId:pkg.manifest.taskId,
      version:pkg.manifest.version,runId}),errorCode('E_VERIFICATION'),reason);
  }
});

test('invalid task schema and origin return typed errors instead of generic exceptions',async()=>{
  const pkg=await example();
  assert.throws(()=>validateTaskParams({...pkg.manifest.paramsSchema,properties:null},{}),errorCode('E_SCHEMA'));
  await assert.rejects(createTaskPackage({...pkg.manifest,siteOrigins:['not a URL']},source),
    errorCode('E_PERMISSION'));
});
