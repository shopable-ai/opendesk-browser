import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {REVIEWED_BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';
import {createSubagentResultReader} from '../trusted/result.js';
import {projectSubagentPageTaskResult} from '../trusted/page-task-result.js';
import {verifiedResult} from '../src/contract.js';

const logicalRequestId='71811b88-050a-4e7a-9dfa-00b10b906fe8';
const controllerRequestId='controller-request-original-01';
const pin=REVIEWED_BUILTIN_TASK_RELEASES.find(row=>
  row.taskId==='chatgpt.conversation.create'&&row.version==='0.2.0');
const conversationId='11111111-2222-4333-8444-555555555555';
const conversationUrl='https://chatgpt.com/c/'+conversationId;
const prompt='请介绍 WebFlow 的三个主要优势。';
function fixture(replyText='  完整回答\n\n'+('段落内容。'.repeat(300))+'\n  '){
  const installation={version:pin.version,manifestHash:pin.manifestHash,
    contentHash:pin.sourceHash,scriptId:'task:chatgpt.conversation.create:0.2.0',
    revision:1,installationId:'installation-original-01',generation:3};
  const revision={scriptId:installation.scriptId,revision:1,sourceHash:pin.sourceHash};
  const value={kind:'chatgpt.conversation.create.result',version:2,status:'reply-complete',
    send:true,messageConfirmed:true,conversationId,conversationUrl,
    sourceUrl:'https://chatgpt.com/',promptChars:prompt.length,readbackConfirmed:true,
    observedAt:'2026-11-12T12:50:00.000Z',userMessageRef:'native-user-message-01',
    assistantMessageRef:'native-assistant-message-01',replyText};
  const runId='controller-run-original-01',resultId='controller-result-original-01';
  return {
    logicalRequestId,
    request:{requestId:controllerRequestId,taskId:'chatgpt.conversation.create',
      targetUrl:'https://chatgpt.com/',args:{prompt,send:true},installation},
    resolvedInstallation:{...installation},runId,resultId,
    snapshot:{run:{tag:'controller-run',runId,requestId:controllerRequestId,resultId,
      state:'completed',retirementState:'released',workerRetired:true,sourceKind:'saved',
      scriptId:installation.scriptId,contentHash:pin.sourceHash,revision,
      taskInstallation:{taskId:'chatgpt.conversation.create',version:pin.version,
        manifestHash:pin.manifestHash,installationId:installation.installationId,generation:3},
      targetDisposition:'retain-on-success',
      target:{mode:'owned',tabId:22,frameId:0,documentId:'original-b-document',
        allowedOrigin:'https://chatgpt.com'},
      retainedTarget:{tabId:22,documentId:'original-b-document',
        origin:'https://chatgpt.com',url:conversationUrl}},
      results:[{tag:'controller-result',runId,resultId,state:'completed',sourceKind:'saved',
        revision,outcome:{ok:true,valueWire:encodeValue(value)}}],resultDeliveryDenied:[]},
    value
  };
}
function harness(binding=fixture()){
  const calls=[];
  const reader=createSubagentResultReader({
    async assertAuthorized(context){calls.push({op:'authorize',context});return true;},
    async readOriginalRun(query){calls.push({op:'read-original',query});return binding;}
  });
  return {binding,calls,read:()=>reader.read({requestId:logicalRequestId}),reader};
}

test('production SW projection binds the Page request to the original preparation and complete Result',async()=>{
  const binding=fixture(),preparationId=binding.request.requestId;
  binding.snapshot.run.taskPreparationId=preparationId;
  const input={request:{requestId:logicalRequestId,preparationId,
    pageBinding:{programId:'opendesk.subagent'},task:{taskId:binding.request.taskId,...binding.request.installation},
    params:binding.request.args,target:{mode:'owned',url:binding.request.targetUrl}},
    preparation:{preparationId,pageRequestId:logicalRequestId,runId:binding.runId,resultId:binding.resultId},
    snapshot:binding.snapshot,resolvedInstallation:binding.resolvedInstallation};
  let checks=0;
  const result=await projectSubagentPageTaskResult(input,{authorize:async()=>{checks++;return true;}});
  assert.equal(checks,2);assert.equal(result.replyText,binding.value.replyText);
  assert.equal(result.requestId,logicalRequestId);
  assert.equal(result.controllerRequestId,preparationId);
  assert.equal(await projectSubagentPageTaskResult({...input,request:{...input.request,
    pageBinding:{programId:'another.program'}}},{authorize:()=>assert.fail('another adapter owns this request')}),null);
  for(const mutate of [x=>{x.preparation.pageRequestId='other';},
    x=>{x.snapshot.run.taskPreparationId='other';},x=>{x.preparation.runId='other';}]){
    const wrong=structuredClone(input);mutate(wrong);
    await assert.rejects(projectSubagentPageTaskResult(wrong,{authorize:async()=>true}),{code:'E_SUBAGENT_RESULT'});
  }
  await assert.rejects(projectSubagentPageTaskResult(input,{authorize:async()=>false}),{code:'E_SUBAGENT_RESULT'});
  let revokeAfterRead=false;
  await assert.rejects(projectSubagentPageTaskResult(input,{authorize:async()=>{
    if(revokeAfterRead)throw Object.assign(new Error('revoked'),{code:'E_PERMISSION'});
    revokeAfterRead=true;return true;
  }}),{code:'E_PERMISSION'});
});
const reject=async change=>{
  const h=harness();change(h.binding);
  await assert.rejects(h.read(),error=>typeof error.code==='string');
  assert.equal(h.calls.filter(row=>row.op==='read-original').length,1);
};

test('trusted reader requires original Authority callbacks and only accepts a logical ID',async()=>{
  assert.throws(()=>createSubagentResultReader(),{code:'E_SUBAGENT_AUTHORITY'});
  const h=harness();
  for(const query of [null,{},{requestId:controllerRequestId},
    {requestId:logicalRequestId,trust:'host-verified'},
    {requestId:logicalRequestId,snapshot:h.binding.snapshot}])
    await assert.rejects(h.reader.read(query),{code:'E_SUBAGENT_RESULT'});
  assert.equal(h.calls.length,0);
});

test('logical UUID resolves the original admission ID and preserves the complete reply exactly',async()=>{
  const h=harness(),result=await h.read();
  assert.notEqual(logicalRequestId,controllerRequestId);
  assert.equal(result.requestId,logicalRequestId);
  assert.equal(result.controllerRequestId,controllerRequestId);
  assert.equal(result.replyText,h.binding.value.replyText);
  assert.ok(result.replyText.length>500);
  assert.equal(result.conversationUrl,conversationUrl);
  assert.equal(result.userMessageRef,h.binding.value.userMessageRef);
  assert.equal(result.assistantMessageRef,h.binding.value.assistantMessageRef);
  assert.equal(verifiedResult(result,logicalRequestId).answer,result.replyText);
  assert.deepEqual(h.calls.map(row=>row.op),['authorize','read-original','authorize']);
  assert.deepEqual(h.calls[1].query,{requestId:logicalRequestId});
  assert.equal(h.calls[2].context.controllerRequestId,controllerRequestId);
  assert.ok(Object.isFrozen(result));
});

test('missing or wrong persisted logical/request/Run/Result binding never falls back to snapshot identities',async()=>{
  for(const change of [
    b=>{b.logicalRequestId='11811b88-050a-4e7a-9dfa-00b10b906fe8';},
    b=>{b.request.requestId='other-controller-request';},
    b=>{b.request.requestId=12345678;},
    b=>{delete b.runId;},b=>{delete b.resultId;},
    b=>{b.runId='another-controller-run';},b=>{b.resultId='another-controller-result';},
    b=>{b.snapshot.run.requestId='other-controller-request';},
    b=>{b.snapshot.results[0].runId='other-controller-run';},
    b=>{b.snapshot.results[0].resultId='other-controller-result';},
    b=>{b.snapshot.results.push(structuredClone(b.snapshot.results[0]));}
  ])await reject(change);
});

test('a changed, revoked, missing or unreviewed installation cannot disclose a reply',async()=>{
  for(const change of [
    b=>{delete b.resolvedInstallation;},
    b=>{b.resolvedInstallation.generation++;},
    b=>{b.resolvedInstallation.installationId='different-installation';},
    b=>{b.resolvedInstallation.manifestHash='f'.repeat(64);},
    b=>{b.request.installation.version='0.3.0';},
    b=>{b.request.installation.contentHash='f'.repeat(64);},
    b=>{b.snapshot.run.taskInstallation.generation++;},
    b=>{delete b.snapshot.run.taskInstallation;},
    b=>{b.snapshot.resultDeliveryDenied=[b.runId];},
    b=>{b.snapshot.run.revision.sourceHash='f'.repeat(64);},
    b=>{b.snapshot.results[0].revision={...b.snapshot.results[0].revision,sourceHash:'f'.repeat(64)};}
  ])await reject(change);
});

test('only a completed and released original owned B has an eligible durable result',async()=>{
  for(const change of [
    b=>{b.snapshot.run.state='running';},b=>{b.snapshot.run.state='paused_unknown';},
    b=>{b.snapshot.run.retirementState='pending';},b=>{b.snapshot.run.workerRetired=false;},
    b=>{b.snapshot.results[0].outcome.ok=false;},
    b=>{b.snapshot.run.target.mode='borrowed';},
    b=>{b.snapshot.run.target.frameId=1;},
    b=>{b.snapshot.run.retainedFrom={runId:'old-prepare-run',requestId:'old-prepare-request'};},
    b=>{b.snapshot.run.retainedTarget.tabId++;},
    b=>{b.snapshot.run.retainedTarget.documentId='other-document';},
    b=>{b.snapshot.run.retainedTarget.url='https://chatgpt.com/c/21111111-2222-4333-8444-555555555555';},
    b=>{b.snapshot.run.targetDisposition='close';},
    b=>{delete b.snapshot.run.retainedTarget;}
  ])await reject(change);
});

test('page completion claims and preview-only data never become a full verified result',async()=>{
  for(const patch of [
    {replyText:undefined,replyPreview:'looks complete',replyPreviewComplete:true},
    {replyText:'',trust:'host-verified'},
    {status:'draft-prepared',send:false},{messageConfirmed:false},
    {assistantMessageRef:'native-user-message-01'},{assistantMessageRef:''},
    {conversationUrl:'https://example.com/c/'+conversationId},
    {replyText:'中'.repeat(21846)}
  ])await reject(b=>{
    const value={...b.value,...patch};
    if(value.replyText===undefined)delete value.replyText;
    b.snapshot.results[0].outcome.valueWire=encodeValue(value);
  });
});

test('native message references up to the original 160-character bound are retained',async()=>{
  const h=harness();
  h.binding.value.userMessageRef='u'.repeat(160);
  h.binding.value.assistantMessageRef='a'.repeat(160);
  h.binding.snapshot.results[0].outcome.valueWire=encodeValue(h.binding.value);
  const result=await h.read();
  assert.equal(result.userMessageRef,h.binding.value.userMessageRef);
  assert.equal(result.assistantMessageRef,h.binding.value.assistantMessageRef);
});

test('authorization failure before or after the async read prevents disclosure',async()=>{
  for(const blockedAt of [1,2]){
    let authorizations=0,reads=0;
    const reader=createSubagentResultReader({
      async assertAuthorized(){return ++authorizations!==blockedAt;},
      async readOriginalRun(){reads++;return fixture();}
    });
    await assert.rejects(reader.read({requestId:logicalRequestId}),{code:'E_SUBAGENT_AUTHORITY'});
    assert.equal(reads,blockedAt===1?0:1);
  }
  const denied=Object.assign(new Error('Authority denied original snapshot'),{code:'E_PERMISSION'});
  let reads=0;
  const reader=createSubagentResultReader({assertAuthorized:async()=>true,
    async readOriginalRun(){reads++;throw denied;}});
  await assert.rejects(reader.read({requestId:logicalRequestId}),error=>error===denied);
  assert.equal(reads,1);
});

test('repeated, concurrent and new-reader queries are read-only and keep the same original identities',async()=>{
  const h=harness();
  const results=await Promise.all([h.read(),h.read()]);
  results.push(await h.read());
  results.push(await harness(h.binding).read());
  for(const result of results){
    assert.equal(result.runId,h.binding.runId);assert.equal(result.resultId,h.binding.resultId);
    assert.equal(result.replyText,h.binding.value.replyText);
  }
  // The consumer can only authorize and read. No start, A send, B send,
  // browser input, or result-delivery callback is requested by this API.
  assert.equal(h.calls.filter(row=>row.op==='read-original').length,3);
  assert.ok(h.calls.every(row=>['authorize','read-original'].includes(row.op)));
});

test('a previously verified result is never served from cache after revocation',async()=>{
  let allowed=true,reads=0;
  const reader=createSubagentResultReader({assertAuthorized:async()=>allowed,
    async readOriginalRun(){reads++;return fixture();}});
  await reader.read({requestId:logicalRequestId});allowed=false;
  await assert.rejects(reader.read({requestId:logicalRequestId}),{code:'E_SUBAGENT_AUTHORITY'});
  assert.equal(reads,1);
});

test('successful and rejected reads perform zero Chrome message sends or tab creation',async()=>{
  const previous=globalThis.chrome;
  const effects=[];
  const forbidden=name=>(...args)=>{effects.push({name,args});throw new Error('Unexpected '+name);};
  globalThis.chrome={tabs:{sendMessage:forbidden('tabs.sendMessage'),create:forbidden('tabs.create')},
    runtime:{sendMessage:forbidden('runtime.sendMessage')}};
  try{
    const h=harness();await h.read();
    h.binding.snapshot.resultDeliveryDenied=[h.binding.runId];
    await assert.rejects(h.read());
    assert.deepEqual(effects,[]);
  }finally{
    if(previous===undefined)delete globalThis.chrome;else globalThis.chrome=previous;
  }
});
