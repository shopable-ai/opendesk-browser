import {loadFakeBuiltin,fakeBuiltinSource} from './builtin-support.mjs';
import {builtinIdentity} from '../../src/libs/identity.js';
const environment=builtinIdentity(fakeBuiltinSource);
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {digest, digestUtf8} from '../../src/platform/protocol.js';
import {BUILTIN_ABI} from '../../src/libs/runtime-contract.js';
import {createTaskPackage, verifyTaskPackage, validateTaskParams, taskScriptId, taskKey, installedKey,
  TASK_MANIFEST_FORMAT} from '../../src/platform/tasks/contract.js';
import {assertInstalledTask, assertRunTaskAuthorization, taskMethods} from '../../src/platform/tasks/service.js';
import {selectInstalledTaskRoute} from '../../src/ui/workflow/installed-task-reuse.js';

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
  let builtinSource=fakeBuiltinSource;
  const runtime={getURL:path=>'chrome-extension://fixture/'+path};
  const service=taskMethods({storage,api:{runtime},loadBuiltin:async options=>{
    assert.deepEqual(Object.keys(options),['runtime']);assert.equal(options.runtime,runtime);return builtinSource;
  },assertHost:async()=>host,currentHost:async()=>true,
    clock:{now:()=>1720000000000}});
  const send=(name,payload)=>service[name](payload,{});
  return {tx,read,send,namespace:host.namespace,setBuiltin:value=>{builtinSource=value;}};
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
  const run={builtinIdentity:environment,builtinAbi:BUILTIN_ABI,tag:'controller-run',runId,namespace:f.namespace,state:'completed',
    retirementState:'released',workerRetired:true,scriptId:'draft:run-native-1',
    hostInstanceId:'host-instance',hostDocumentId:'host-document',
    revision:{sourceHash:pkg.manifest.program.sourceHash},
    target:{allowedOrigin:'https://example.com'},resultId};
  const result={builtinIdentity:environment,tag:'controller-result',resultId,runId,namespace:f.namespace,state:'completed',
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
  const realCatalog=(await f.send('listTaskCatalog',{})).catalog[0];
  assert.equal(realCatalog.verification.manifestHash,pkg.manifestHash,
    'Cloud UI must receive the real immutable verified manifest digest');
  assert.equal(realCatalog.verification.sourceHash,pkg.manifest.program.sourceHash);
  assert.equal((await f.send('installTask',{taskId:pkg.manifest.taskId,version:'1.0.0',
    manifestHash:pkg.manifestHash,expectedInstalledVersion:null})).enabled,true);
  await assert.rejects(f.send('installTask',{taskId:pkg.manifest.taskId,version:'1.0.0',
    manifestHash:pkg.manifestHash,expectedInstalledVersion:null}),errorCode('E_REVISION'));
  const scriptId=taskScriptId(pkg.manifest.taskId,pkg.manifest.version);
  assert.equal((await f.send('resolveInstalledTask',{taskId:pkg.manifest.taskId})).scriptId,scriptId);
  assert.equal((await f.send('listTaskCatalog',{})).installed[0].version,'1.0.0');
  await assertInstalledTask(f.tx,f.namespace,{scriptId,builtinIdentity:environment,contentHash:pkg.manifest.program.sourceHash,
    origin:'https://example.com',params:{name:'Alice'}});
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{scriptId,builtinIdentity:environment,contentHash:pkg.manifest.program.sourceHash,
    origin:'https://wrong.example',params:{name:'Alice'}}),errorCode('E_PERMISSION'));
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{scriptId,builtinIdentity:environment,contentHash:'0'.repeat(64),
    origin:'https://example.com',params:{name:'Alice'}}),errorCode('E_PERMISSION'));
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{scriptId,builtinIdentity:environment,contentHash:pkg.manifest.program.sourceHash,
    origin:'https://example.com',params:{name:''}}),errorCode('E_PARAMS'));
  // Historical verification can be perfectly self-consistent but comes from
  // a different built-in ABI. No install, replay or enable can reuse it.
  const storedKey=taskKey(f.namespace,pkg.manifest.taskId,pkg.manifest.version);
  const oldCandidate=await f.tx.get('frameworkKV',storedKey);
  await f.tx.put('frameworkKV',{...oldCandidate,
    verification:{...oldCandidate.verification,builtinAbi:'opendesk-builtins.v1'}},storedKey);
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{scriptId,
    contentHash:pkg.manifest.program.sourceHash,origin:'https://example.com',params:{name:'Alice'}}),
    errorCode('E_BUILTIN_VERSION_UNAVAILABLE'));
  await assert.rejects(f.send('makeTaskAvailable',{taskId:pkg.manifest.taskId,
    version:pkg.manifest.version,manifestHash:pkg.manifestHash}),
    errorCode('E_BUILTIN_VERSION_UNAVAILABLE'));
  await assert.rejects(f.send('installTask',{taskId:pkg.manifest.taskId,
    version:pkg.manifest.version,manifestHash:pkg.manifestHash,expectedInstalledVersion:'1.0.0'}),
    errorCode('E_BUILTIN_VERSION_UNAVAILABLE'));
  await f.tx.put('frameworkKV',oldCandidate,storedKey);
  const installationId=(await f.send('resolveInstalledTask',{taskId:pkg.manifest.taskId})).installationId;
  await f.send('setInstalledTaskEnabled',{taskId:pkg.manifest.taskId,version:'1.0.0',enabled:false,expectedGeneration:1,expectedInstallationId:installationId});
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{scriptId,builtinIdentity:environment,contentHash:pkg.manifest.program.sourceHash,
    origin:'https://example.com',params:{name:'Alice'}}),errorCode('E_PERMISSION'));
  await f.send('uninstallTask',{taskId:pkg.manifest.taskId,version:'1.0.0',expectedGeneration:2,expectedInstallationId:installationId});
  assert.equal((await f.send('listTaskCatalog',{})).installed.length,0);
  assert.equal((await f.tx.all('scriptRevisions')).length,1,'uninstall keeps immutable version for result history');
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{scriptId,builtinIdentity:environment,contentHash:pkg.manifest.program.sourceHash,
    origin:'https://example.com',params:{name:'Alice'}}),errorCode('E_PERMISSION'));
});

test('same task version cannot replace even a correctly hashed package',async()=>{
  const f=fixture(),pkg=await example();
  await f.send('importTaskPackage',{package:pkg});
  const changed={...pkg,manifest:{...pkg.manifest,title:'换标题'}};
  await assert.rejects(f.send('importTaskPackage',{package:changed}),errorCode('E_HASH'));
  const rehashed=await createTaskPackage({...pkg.manifest,title:'换标题'},pkg.sourceUtf8);
  await assert.rejects(f.send('importTaskPackage',{package:rehashed}),errorCode('E_REQUEST_CONFLICT'));
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
    ['stale library ABI',async ({run})=>{run.builtinAbi='opendesk-builtins.v1';}],
    ['result key mismatch',async ({result})=>{result.resultId='other-result';}]
  ];
  for(const [reason,mutate] of mutations){
    const f=fixture();await f.send('importTaskPackage',{package:pkg});
    const runId='verification-run',resultId='verification-result',requestId='page-op-1';
    const run={builtinIdentity:environment,builtinAbi:BUILTIN_ABI,tag:'controller-run',runId,resultId,namespace:f.namespace,
      scriptId:'draft:verification-run',hostInstanceId:'host-run',hostDocumentId:'host-document',
      state:'completed',retirementState:'released',workerRetired:true,
      revision:{sourceHash:hash},target:{allowedOrigin:'https://example.com'}};
    const result={builtinIdentity:environment,tag:'controller-result',resultId,runId,namespace:f.namespace,
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
      version:pkg.manifest.version,runId}),
      errorCode(reason==='stale library ABI'?'E_BUILTIN_VERSION_UNAVAILABLE':'E_VERIFICATION'),reason);
  }
});

test('invalid task schema and origin return typed errors instead of generic exceptions',async()=>{
  const pkg=await example();
  assert.throws(()=>validateTaskParams({...pkg.manifest.paramsSchema,properties:null},{}),errorCode('E_SCHEMA'));
  await assert.rejects(createTaskPackage({...pkg.manifest,siteOrigins:['not a URL']},source),
    errorCode('E_PERMISSION'));
});

// Component regression only: these identities are trusted fixture assets.
test('Task enable refuses stale installation, candidate or proof without changing authorization',async()=>{
  for(const scope of ['installation','candidate','proof'])for(const stale of [undefined,{...environment,abi:'old-runtime'}]){
    const f=fixture(),pkg=await example();await f.send('importTaskPackage',{package:pkg});
    const candidate=(await f.tx.all('frameworkKV'))[0];
    candidate.stage='available';candidate.verification={manifestHash:pkg.manifestHash,builtinIdentity:environment,builtinAbi:BUILTIN_ABI};
    const row={tag:'task-installed-v1',namespace:f.namespace,taskId:pkg.manifest.taskId,version:pkg.manifest.version,
      enabled:false,manifestHash:pkg.manifestHash,builtinIdentity:environment,
      authorization:{generation:1,installationId:'old-installation'}};
    if(scope==='installation')row.builtinIdentity=stale;
    else if(scope==='candidate')candidate.builtinIdentity=stale;
    else candidate.verification.builtinIdentity=stale;
    const installKey=installedKey(f.namespace,pkg.manifest.taskId);
    await f.tx.put('frameworkKV',candidate,taskKey(f.namespace,pkg.manifest.taskId,pkg.manifest.version));
    await f.tx.put('frameworkKV',row,installKey);
    await assert.rejects(f.send('setInstalledTaskEnabled',{taskId:row.taskId,version:row.version,enabled:true,
      expectedGeneration:1,expectedInstallationId:'old-installation'}),errorCode('E_BUILTIN_VERSION_UNAVAILABLE'));
    assert.deepEqual(await f.tx.get('frameworkKV',installKey),row);
  }
});

test('Task immutable runtime refuses missing legacy identity, changed ABI and changed fixed bytes',async()=>{
  for(const kind of ['missing','abi','bundle','catalog']){
    const f=fixture(),pkg=await example();await f.send('importTaskPackage',{package:pkg});
    const candidate=(await f.tx.all('frameworkKV'))[0];
    if(kind==='missing'){
      delete candidate.builtinIdentity;await f.tx.put('frameworkKV',candidate,taskKey(f.namespace,pkg.manifest.taskId,pkg.manifest.version));
    }else f.setBuiltin({...fakeBuiltinSource,...(kind==='abi'?{abi:'future-runtime'}:kind==='bundle'?{sha256:'b'.repeat(64)}:{catalogSha256:'c'.repeat(64)})});
    await assert.rejects(f.send('importTaskPackage',{package:pkg}),errorCode('E_BUILTIN_VERSION_UNAVAILABLE'));
    assert.equal((await f.tx.all('runs')).length,0);
    assert.equal((await f.tx.all('scriptRevisions')).length,0);
  }
});

test('R23.37 real Task Service versioned-intent import -> Verify -> Available -> Install -> natural-language match',async()=>{
  // Uses the actual catalog/installer and immutable package validators. The
  // journal below is an isolated native-receipt fixture, NOT a Chrome E2E.
  const f=fixture();
  const source='async function main(params) { await page.fill("#keyword",params.keyword); await page.click("#search"); return {ok:true}; }';
  const manifest={format:TASK_MANIFEST_FORMAT,taskId:'example.intent-search',version:'1.0.1',
    title:'搜索演示页',description:'当前网页搜索并核对结果',
    author:'OpenDesk',source:'local-developer',
    siteOrigins:['http://127.0.0.1:43111'],permissions:['page.automation'],
    entryFormat:'async-main',program:{revision:3,sourceHash:await digestUtf8(source)},
    paramsSchema:{type:'object',properties:{
      keyword:{type:'string',title:'搜索关键词',minLength:1,maxLength:80}
    },required:['keyword'],additionalProperties:false},
    intent:{templates:['在当前演示搜索页搜索 {keyword}，并核对结果'],
      resultTexts:['结果：{keyword}','提交次数：1']}
  };
  const pkg=await createTaskPackage(manifest,source);
  const candidate=await f.send('importTaskPackage',{package:pkg});
  assert.equal(candidate.stage,'candidate');
  assert.equal((await f.send('listTaskCatalog',{})).installed.length,0);
  await assert.rejects(f.send('makeTaskAvailable',{
    taskId:manifest.taskId,version:manifest.version,manifestHash:pkg.manifestHash
  }),errorCode('E_VERIFICATION'));
  const runId='native-intent-run',resultId='native-intent-result',requestId='native-intent-op';
  const run={builtinIdentity:environment,builtinAbi:BUILTIN_ABI,tag:'controller-run',
    runId,namespace:f.namespace,state:'completed',retirementState:'released',
    workerRetired:true,scriptId:'draft:native-intent-run',hostInstanceId:'host-instance',
    hostDocumentId:'host-document',revision:{sourceHash:manifest.program.sourceHash},
    target:{allowedOrigin:manifest.siteOrigins[0]},resultId};
  const result={builtinIdentity:environment,tag:'controller-result',resultId,runId,
    namespace:f.namespace,state:'completed',
    revision:{sourceHash:manifest.program.sourceHash},outcome:{ok:true}};
  await f.tx.put('runs',run,runId);
  await f.tx.put('results',result,resultId);
  const envelope={requestId,identity:{tag:'controller-run',runId,scriptId:run.scriptId,
    hostInstanceId:run.hostInstanceId,hostDocumentId:run.hostDocumentId,
    contentHash:manifest.program.sourceHash},
    revision:{sourceHash:manifest.program.sourceHash},
    target:{allowedOrigin:manifest.siteOrigins[0]},
    operation:{kind:'packaged',method:'click',args:[]}};
  const reply={requestId,value:{kind:'undefined'}};
  await f.tx.put('commandJournal',{tag:'controller-operation',runId,state:'durable',
    requestDigest:await digest(envelope,{maxDepth:48}),envelope,reply,
    nativeReceipts:[{stage:'result',requestId,receipt:reply}]},'intent-real-op');
  assert.equal((await f.send('verifyTaskCandidate',{
    taskId:manifest.taskId,version:manifest.version,runId})).stage,'verified');
  assert.equal((await f.send('makeTaskAvailable',{
    taskId:manifest.taskId,version:manifest.version,
    manifestHash:pkg.manifestHash})).stage,'available');
  const install=await f.send('installTask',{
    taskId:manifest.taskId,version:manifest.version,
    manifestHash:pkg.manifestHash,expectedInstalledVersion:null});
  assert.equal(install.enabled,true);
  const catalog=await f.send('listTaskCatalog',{});
  assert.equal(catalog.installed.length,1);
  assert.deepEqual(catalog.catalog[0].manifest.intent,manifest.intent);
  const target={status:'available',frameId:0,origin:manifest.siteOrigins[0]};
  const select=request=>selectInstalledTaskRoute({
    request,target,catalog:catalog.catalog,installed:catalog.installed
  });
  const selected=select('在当前演示搜索页搜索 OpenDesk，并核对结果。');
  assert.equal(selected.state,'MATCH');
  assert.equal(selected.candidate.taskId,manifest.taskId);
  assert.equal(selected.candidate.expected.manifestHash,pkg.manifestHash);
  assert.match(catalog.installed[0].installationId,/^[a-f0-9-]{36}$/,
    'installation identity is returned by the formal Catalog read, not installTask');
  assert.equal(selected.candidate.expected.installationId,catalog.installed[0].installationId);
  assert.deepEqual(selected.candidate.params,{keyword:'OpenDesk'});
  assert.deepEqual(selected.candidate.intent.resultTexts,manifest.intent.resultTexts);
  assert.equal(select('在当前演示搜索页搜索 ，并核对结果').state,'MISSING_PARAMS',
    'no Schema default may be substituted for missing natural-language input');
  assert.equal(select('在当前演示搜索页搜索 OpenDesk，然后删除订单，并核对结果').state,'NO_MATCH',
    'an additional dangerous operation cannot be dropped and treated as a match');
  const disabled=selectInstalledTaskRoute({request:'在当前演示搜索页搜索 OpenDesk，并核对结果',
    target,catalog:catalog.catalog,installed:[{...catalog.installed[0],enabled:false}]});
  assert.equal(disabled.state,'BLOCKED');
  const rehashed=await createTaskPackage({...manifest,intent:{
    ...manifest.intent,resultTexts:['结果：{keyword}','提交次数：2']}},source);
  await assert.rejects(f.send('importTaskPackage',{package:rehashed}),
    errorCode('E_REQUEST_CONFLICT'),'published exact version cannot be overwritten');
});


test('Task optional storage/network and bounded deadline are closed and covered by manifestHash',async()=>{
  const original=await example();
  for(const deadlineMs of [1000,30000,120000]){
    const pkg=await createTaskPackage({...original.manifest,permissions:['page.automation','storage.persistent'],deadlineMs},source);
    assert.equal((await verifyTaskPackage(pkg)).manifest.deadlineMs,deadlineMs);
    assert.notEqual(pkg.manifestHash,original.manifestHash);
    const {deadlineMs:ignored,...withoutDeadline}=pkg.manifest;
    await assert.rejects(verifyTaskPackage({...pkg,manifest:withoutDeadline}),{code:'E_HASH'});
    await assert.rejects(verifyTaskPackage({...pkg,manifest:{...pkg.manifest,permissions:['page.automation']}}),{code:'E_HASH'});
  }
  for(const deadlineMs of [0,999,120001,1.5,'30000',null])
    await assert.rejects(createTaskPackage({...original.manifest,deadlineMs},source),{code:'E_SCHEMA'});
  for(const permissions of [['page.automation','network'],['page.automation','storage.persistent','network'],
    ['page.automation','network','storage.persistent']]){
    const pkg=await createTaskPackage({...original.manifest,permissions},source);
    assert.deepEqual((await verifyTaskPackage(pkg)).manifest.permissions,permissions);
    assert.notEqual(pkg.manifestHash,original.manifestHash);
    await assert.rejects(verifyTaskPackage({...pkg,manifest:{...pkg.manifest,permissions:['page.automation']}}),{code:'E_HASH'});
  }
  for(const permissions of [[],['storage.persistent'],['page.automation','page.automation'],
    ['network','page.automation'],['page.automation','network','network'],
    ['page.automation','storage.session'],['page.automation','cookies'],
    ['page.automation','storage.persistent','network','network']])
    await assert.rejects(createTaskPackage({...original.manifest,permissions},source),{code:'E_PERMISSION'});
});


test('Task exact origin list rejects noncanonical, wildcard, duplicate and over-limit scope',async()=>{
  const base=await example();
  const eight=Array.from({length:8},(_,i)=>`https://s${i}.example`);
  assert.deepEqual((await createTaskPackage({...base.manifest,siteOrigins:eight},source)).manifest.siteOrigins,eight);
  for(const siteOrigins of [[],['<all_urls>'],['<all_urls>','https://a.example'],[''],
    ['https://a.example','https://a.example'],[...eight,'https://ninth.example'],['https://user@a.example'],
    ['https://*.example'],['http://*'],['https://a.example/path'],['https://a.example/'],['https://a.example:443'],['null'],['data:text/plain,x']])
    await assert.rejects(createTaskPackage({...base.manifest,siteOrigins},source),errorCode('E_PERMISSION'));
});

test('multi-origin Task verifies shared source on one declared origin and preserves origin and revocation fences',async()=>{
  const f=fixture(),base=await example();
  const origins=['https://a.example','https://b.example','http://localhost:43111'];
  const pkg=await createTaskPackage({...base.manifest,siteOrigins:origins},source);
  const request={taskId:pkg.manifest.taskId,version:pkg.manifest.version};
  await f.send('importTaskPackage',{package:pkg});
  const hash=pkg.manifest.program.sourceHash;
  async function proof(origin,index,{receipt=true,effectOrigin=origin}={}){
    const runId='multi-run-'+index,resultId='multi-result-'+index,requestId='multi-op-'+index;
    const run={builtinIdentity:environment,builtinAbi:BUILTIN_ABI,tag:'controller-run',runId,resultId,
      namespace:f.namespace,scriptId:'draft:multi',hostInstanceId:'multi-host',hostDocumentId:'multi-doc',
      state:'completed',retirementState:'released',workerRetired:true,
      revision:{sourceHash:hash},target:{allowedOrigin:origin}};
    await f.tx.put('runs',run,runId);
    await f.tx.put('results',{builtinIdentity:environment,tag:'controller-result',resultId,runId,
      namespace:f.namespace,state:'completed',revision:{sourceHash:hash},outcome:{ok:true}},resultId);
    const envelope={requestId,identity:{tag:'controller-run',runId,scriptId:run.scriptId,
      hostInstanceId:run.hostInstanceId,hostDocumentId:run.hostDocumentId,contentHash:hash},
      revision:{sourceHash:hash},target:{allowedOrigin:effectOrigin},operation:{kind:'packaged',method:'click',args:[]}};
    const reply={requestId,value:{kind:'undefined'}};
    await f.tx.put('commandJournal',{tag:'controller-operation',runId,state:'durable',envelope,reply,
      requestDigest:await digest(envelope,{maxDepth:48}),
      nativeReceipts:receipt?[{stage:'result',requestId,receipt:reply}]:[]},requestId);
    return f.send('verifyTaskCandidate',{...request,runId});
  }
  const available=()=>f.send('makeTaskAvailable',{...request,manifestHash:pkg.manifestHash});
  const install=()=>f.send('installTask',{...request,manifestHash:pkg.manifestHash,expectedInstalledVersion:null});
  await assert.rejects(proof(origins[2],2,{receipt:false}),errorCode('E_VERIFICATION'));
  await assert.rejects(proof(origins[2],3,{effectOrigin:origins[1]}),errorCode('E_VERIFICATION'));
  await assert.rejects(proof('https://outside.example',4),errorCode('E_VERIFICATION'));
  await assert.rejects(available(),errorCode('E_VERIFICATION'));
  await assert.rejects(install(),errorCode('E_VERIFICATION'));
  // A declared localhost fixture proves shared source, not remote-site success.
  const verified=await proof(origins[2],1);
  assert.equal(verified.stage,'verified');
  assert.equal(verified.verification.origin,origins[2]);
  assert.equal(verified.verification.manifestHash,pkg.manifestHash);
  await available();await install();
  const resolved=await f.send('resolveInstalledTask',{taskId:request.taskId});
  assert.deepEqual(resolved.manifest.siteOrigins,origins);
  const admission={scriptId:resolved.scriptId,contentHash:hash,builtinIdentity:environment,params:{name:'Alice'}};
  for(const origin of origins)await assertInstalledTask(f.tx,f.namespace,{...admission,origin});
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{...admission,origin:'https://outside.example'}),errorCode('E_PERMISSION'));
  // A proof from outside the manifest must close every entry point.
  const key=taskKey(f.namespace,request.taskId,request.version),candidate=await f.tx.get('frameworkKV',key);
  const incomplete=structuredClone(candidate);incomplete.verification.origin='https://outside.example';
  await f.tx.put('frameworkKV',incomplete,key);
  await assert.rejects(available(),errorCode('E_VERIFICATION'));
  await assert.rejects(assertInstalledTask(f.tx,f.namespace,{...admission,origin:origins[0]}),errorCode('E_VERIFICATION'));
  await assert.rejects(f.send('setInstalledTaskEnabled',{...request,enabled:false,
    expectedGeneration:resolved.generation,expectedInstallationId:resolved.installationId}),errorCode('E_VERIFICATION'));
  await f.tx.put('frameworkKV',candidate,key);
  const installation=await f.tx.get('frameworkKV',installedKey(f.namespace,request.taskId));
  const active={tag:'controller-run',runId:'multi-installed-active',namespace:f.namespace,scriptId:resolved.scriptId,
    state:'running',builtinAbi:BUILTIN_ABI,cancelSeq:0,ownerEpoch:1,runRevision:1,eventSeq:1,
    installedTaskAuthorization:{taskId:request.taskId,version:request.version,manifestHash:pkg.manifestHash,
      authorization:structuredClone(installation.authorization)}};
  await f.tx.put('runs',active,active.runId);
  await assertRunTaskAuthorization(f.tx,active);
  await f.send('setInstalledTaskEnabled',{...request,enabled:false,
    expectedGeneration:resolved.generation,expectedInstallationId:resolved.installationId});
  for(const origin of origins)
    await assert.rejects(assertInstalledTask(f.tx,f.namespace,{...admission,origin}),errorCode('E_PERMISSION'));
  await assert.rejects(assertRunTaskAuthorization(f.tx,active),errorCode('E_PERMISSION'));
  assert.equal((await f.tx.get('runs',active.runId)).state,'stopping');
});
