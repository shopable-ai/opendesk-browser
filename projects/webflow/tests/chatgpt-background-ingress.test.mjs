import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWebTaskIngress} from '../../../src/page-events/web-task-ingress.js';
import {createChatGPTBridgeTriggerLedger,CHATGPT_BRIDGE_LEDGER_KEY,CHATGPT_BRIDGE_PROTOCOL}
  from '../../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {WEB_TASK_PROTOCOL} from '../../../src/page-events/web-task-contract.js';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {digestUtf8} from '../../../src/platform/protocol.js';
import {REVIEWED_BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';
import {requiresChatGPTOriginalAProof,assertOriginalADispatchIntent,assertOriginalAReceipt}
  from '../trusted/chatgpt-result-adapter.js';
const originalAProofPolicy=Object.freeze({requiresChatGPTOriginalAProof,assertOriginalADispatchIntent,assertOriginalAReceipt});
const strictVersions=['0.2.0','0.2.1','0.2.2'];
const strictManifests=Object.fromEntries(await Promise.all(strictVersions.map(async version=>[
  version,JSON.parse(await readFile(new URL(`../../../task-packs/chatgpt.conversation.create/releases/chatgpt.conversation.create.${version}.opendesk-task.json`,import.meta.url),'utf8')).manifest
])));

for(const version of strictVersions){
function strictAFixture(){
  const release=REVIEWED_BUILTIN_TASK_RELEASES.find(row=>
    row.taskId==='chatgpt.conversation.create'&&row.version===version);
  const taskScope={...scope,taskId:release.taskId,args:{prompt:'Review the issue',send:true},
    targetUrl:'https://chatgpt.com/',installation:{...scope.installation,version:release.version,
      scriptId:'task:'+release.taskId+':'+release.version,
      manifestHash:release.manifestHash,contentHash:release.sourceHash}};
  const h=fixture({taskScope});
  h.state.manifest=strictManifests[version];
  h.state.officialUserMessageId='official-source-a-0001';
  const conversationId='6af1df79-ab04-83e8-8e06-db19beebafab';
  h.state.resultValue={kind:'chatgpt.conversation.create.result',version:2,status:'reply-complete',
    send:true,messageConfirmed:true,conversationId,conversationUrl:'https://chatgpt.com/c/'+conversationId,
    sourceUrl:'https://chatgpt.com/',promptChars:taskScope.args.prompt.length,readbackConfirmed:true,
    observedAt:'2026-11-10T12:30:00.000Z',userMessageRef:'1e0eae89-91d5-4b79-9d95-4d02168447d5',
    assistantMessageRef:'b85c4321-cef3-41ba-b1bd-f66cbeff2611',replyText:'Complete B reply'};
  h.state.retainedRun={targetDisposition:'retain-on-success',
    target:{mode:'owned',tabId:22,frameId:0,documentId:'b-document',allowedOrigin:'https://chatgpt.com'},
    retainedTarget:{tabId:22,documentId:'b-document',origin:'https://chatgpt.com',
      url:h.state.resultValue.conversationUrl}};
  h.state.deliveryReplyFactory=async message=>({ok:true,data:{sent:true,userObserved:true,
    aiReplyObserved:false,messageId:'official-a-message-0001',contentSha256:await digestUtf8(message.text)}});
  const completed=h.completed;
  h.completed=()=>completed('fresh-candidate','run-0001','result-0001');
  return h;
}

if(version==='0.2.2')test('R11 0.2.2 non-official B turn references cannot authorize any A delivery',async()=>{
  for(const key of ['userMessageRef','assistantMessageRef']){
    const h=strictAFixture();h.state.resultValue[key]='turn:'+key;
    await h.approve();const row=await h.completed();
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_BRIDGE_RESULT'});
    h.restart();
    const history=await h.handle('history',{source},h.panel);
    assert.equal(history[0].receipt.persistence,'not-available');
    assert.equal(history[0].receipt.value,undefined);
    assert.equal((await h.ledger.inspectWebTask(row.requestId)).webDelivery,undefined);
    assert.equal(h.sent.filter(item=>['deliver','workflow-read-a'].includes(item.message.kind)).length,0);
    assert.equal(h.runs.length,1);assert.equal(h.results.length,1);
  }
});

test(`R11 ${version} new strict V1 and V2 requests without a trusted official A anchor cannot admit or run B`,async()=>{
  for(const v2 of [false,true]){
    const h=strictAFixture();delete h.state.officialUserMessageId;h.state.v2=v2;await h.approve();
    await assert.rejects(h.admit(),{code:'E_CHAT_DELIVERY_PROOF'});
    assert.deepEqual(await h.ledger.listWebTasks(),[]);
    assert.equal(await h.handle('claim'),null);
    await h.handle('reconcile');h.restart();
    assert.equal(await h.handle('claim'),null);
    assert.deepEqual(await h.ledger.listWebTasks(),[]);
    assert.equal(h.state.ensures,0);assert.equal(h.runs.length,0);assert.equal(h.results.length,0);
    assert.equal(h.sent.filter(item=>['deliver','workflow-read-a'].includes(item.message.kind)).length,0);
  }
});

test(`R11 ${version} reviewed send freezes original A text and requires complete matching official proof`,async()=>{
  for(const invalid of ['missing','id-only','sha-only','bad-id','bad-sha']){
    const h=strictAFixture();await h.approve();const row=await h.completed();
    h.state.deliveryReplyFactory=async message=>{
      const data={sent:true,userObserved:true,aiReplyObserved:false};
      if(!['missing','sha-only'].includes(invalid))data.messageId=invalid==='bad-id'?'bad id':'official-a-message-0001';
      if(!['missing','id-only'].includes(invalid))data.contentSha256=invalid==='bad-sha'?'a'.repeat(64):await digestUtf8(message.text);
      return {ok:true,data};
    };
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_CHAT_DELIVERY_PROOF'});
    const saved=await h.ledger.inspectWebTask(row.requestId);
    assert.equal(saved.webDelivery,'dispatching');assert.equal(saved.webObservation.delivery,'unknown');
    const original=h.sent.find(item=>item.message.kind==='deliver').message;
    assert.deepEqual(saved.webDispatchIntent,{runId:'run-0001',resultId:'result-0001',
      contentSha256:await digestUtf8(original.text),anchorMessageId:'official-source-a-0001',
      workflowId:row.requestId,deliveryKey:'result-0001',authorizationRef:saved.autoGrantId});
    // Even the ledger's direct confirmation path cannot downgrade strictness.
    const receipt={source,runId:'run-0001',resultId:'result-0001',aiReplyObserved:false};
    await assert.rejects(h.ledger.confirmWebTaskDelivery(row.requestId,receipt),{code:'E_CHAT_DELIVERY_PROOF'});
    await assert.rejects(h.ledger.confirmWebTaskDelivery(row.requestId,{...receipt,
      messageId:'official-a-message-0001',contentSha256:'0'.repeat(64)}),{code:'E_CHAT_DELIVERY_PROOF'});
    await assert.rejects(h.ledger.markWebTaskDelivery(row.requestId,'delivered'),{code:'E_CHAT_DELIVERY_PROOF'});
    h.restart();await h.handle('settle',{requestId:row.requestId});
    assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  }
});

test(`R11 ${version} reviewed original A proof confirms atomically and persists across worker restart`,async()=>{
  const h=strictAFixture();await h.approve();const row=await h.completed();
  const reply=h.state.deliveryReplyFactory;
  h.state.deliveryReplyFactory=async message=>{
    const receipt=await reply(message);h.state.replyValid=false;return receipt;
  };
  await h.handle('settle',{requestId:row.requestId});h.restart();
  const saved=await h.ledger.inspectWebTask(row.requestId);
  assert.equal(saved.webDelivery,'delivered');assert.equal(saved.webObservation.messageId,'official-a-message-0001');
  assert.equal(saved.webObservation.contentSha256,saved.webDispatchIntent.contentSha256);
  await h.handle('settle',{requestId:row.requestId});
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
});

test(`R11 ${version} missing or incomplete composed proof policy cannot dispatch or confirm`,async()=>{
  for(const policy of [undefined,Object.freeze({}),{...originalAProofPolicy}]){
    const h=strictAFixture();await h.approve();const row=await h.completed();
    h.state.originalAProofPolicy=policy;h.restart();
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_CHAT_DELIVERY_PROOF'});
    assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,0);
    assert.equal((await h.ledger.inspectWebTask(row.requestId)).webDelivery,undefined);
    h.state.originalAProofPolicy=originalAProofPolicy;h.restart();h.state.deliveryError=true;
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),/ACK lost/);
    const saved=await h.ledger.inspectWebTask(row.requestId);
    h.state.originalAProofPolicy=policy;h.restart();
    await assert.rejects(h.ledger.confirmWebTaskDelivery(row.requestId,{source,runId:'run-0001',resultId:'result-0001',
      aiReplyObserved:false,messageId:'official-a-message-0001',contentSha256:saved.webDispatchIntent.contentSha256}),
      {code:'E_CHAT_DELIVERY_PROOF'});
    assert.equal((await h.ledger.inspectWebTask(row.requestId)).webDelivery,'dispatching');
    assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  }
});

test(`R11 ${version} historical strict delivery without official proof is never projected as confirmed or replayed`,async()=>{
  const h=strictAFixture();await h.approve();const row=await h.completed();
  await h.handle('settle',{requestId:row.requestId});
  // Model an older durable row written by the previous optional-proof path.
  const saved=h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId];
  delete saved.webDispatchIntent;delete saved.webObservation.messageId;delete saved.webObservation.contentSha256;
  h.restart();
  assert.equal((await h.handle('settle',{requestId:row.requestId})).delivery,'unknown');
  assert.equal((await h.handle('history',{source},h.panel))[0].receipt.delivery,'unknown');
  assert.equal((await h.handle('query',{requestId:row.requestId},h.page)).delivery,'unknown');
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
});

test(`R11 ${version} lost strict A ACK without an official frozen anchor remains read-only UNKNOWN after restart`,async()=>{
  const h=strictAFixture();await h.approve();const row=await h.completed();h.state.deliveryError=true;
  // Model a historical admitted row; recovery must never backfill its missing anchor.
  delete h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].originalAAnchorMessageId;
  await assert.rejects(h.handle('settle',{requestId:row.requestId}),/ACK lost/);
  h.restart();h.state.deliveryError=false;
  await h.handle('reconcile');
  assert.equal((await h.handle('settle',{requestId:row.requestId})).delivery,'unknown');
  assert.equal(await h.handle('claim'),null);
  const saved=await h.ledger.inspectWebTask(row.requestId);
  assert.equal(saved.originalAAnchorMessageId,undefined);
  assert.equal(saved.webDispatchIntent.anchorMessageId,undefined);
  assert.equal(saved.webDelivery,'dispatching');
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  assert.equal(h.sent.filter(item=>item.message.kind==='workflow-read-a').length,0);
});

test(`R11 ${version} V2 uses the same strict original A receipt after its own existing candidate approval`,async()=>{
  for(const proof of [true,false]){
    const h=strictAFixture();h.state.v2=true;await h.approve();const row=await h.completed();
    assert.equal((await h.ledger.inspectWebTask(row.requestId)).intentProtocol,'webflow.task.intent.v2');
    if(!proof)h.state.deliveryReplyFactory=async()=>({ok:true,data:{sent:true,userObserved:true}});
    if(proof)await h.handle('settle',{requestId:row.requestId});
    else await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_CHAT_DELIVERY_PROOF'});
    assert.equal((await h.ledger.inspectWebTask(row.requestId)).webDelivery,proof?'delivered':'dispatching');
    h.restart();await h.handle('settle',{requestId:row.requestId});
    assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  }
});

test(`R11 ${version} strict receipt fences a late install change and an atomic receipt write failure without resending`,async()=>{
  for(const failure of ['late-version','write']){
    const h=strictAFixture();await h.approve();const row=await h.completed();
    if(failure==='write')h.state.failDeliveryReceiptWrite=true;
    else h.state.onTaskVerified=()=>{
      if(h.sent.some(item=>item.message.kind==='deliver'))
        h.state.onStorageRead=()=>{h.state.taskEpoch++;};
    };
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),
      {code:failure==='write'?'E_TEST_STORAGE':'E_REVISION'});
    h.state.onStorageRead=null;h.state.onTaskVerified=null;h.state.failDeliveryReceiptWrite=false;
    h.restart();await h.handle('settle',{requestId:row.requestId});
    assert.equal((await h.ledger.inspectWebTask(row.requestId)).webDelivery,'delivered');
    assert.equal(h.sent.filter(item=>item.message.kind==='workflow-read-a').length,1);
    assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  }
});

test(`R11 ${version} lost A ACK recovers by original read-a only across worker restart for V1 and V2`,async()=>{
  for(const v2 of [false,true]){
    const h=strictAFixture();h.state.v2=v2;h.state.officialUserMessageId='official-source-a-0001';
    await h.approve();const row=await h.completed();h.state.deliveryError=true;
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),/ACK lost/);
    const frozen=await h.ledger.inspectWebTask(row.requestId);
    assert.equal(frozen.originalAAnchorMessageId,'official-source-a-0001');
    assert.deepEqual(Object.keys(frozen.candidate).sort(),['answerKey','candidateId','text','turnKey']);
    assert.deepEqual(frozen.webDispatchIntent,{runId:'run-0001',resultId:'result-0001',
      contentSha256:await digestUtf8(h.sent.find(item=>item.message.kind==='deliver').message.text),
      anchorMessageId:'official-source-a-0001',workflowId:row.requestId,deliveryKey:'result-0001',
      authorizationRef:frozen.autoGrantId});
    h.state.replyValid=false;h.restart();
    await h.handle('reconcile');
    const saved=await h.ledger.inspectWebTask(row.requestId);
    assert.equal(saved.webDelivery,'delivered');assert.equal(saved.webObservation.messageId,'official-a-message-0001');
    assert.equal(saved.webObservation.contentSha256,frozen.webDispatchIntent.contentSha256);
    const reads=h.sent.filter(item=>item.message.kind==='workflow-read-a');assert.equal(reads.length,1);
    assert.equal(reads[0].tabId,source.tabId);assert.deepEqual(reads[0].options,{documentId:source.documentId});
    assert.equal(reads[0].message.anchorMessageId,'official-source-a-0001');
    await h.handle('settle',{requestId:row.requestId});await h.handle('reconcile');
    assert.equal((await h.handle('query',{requestId:row.requestId},h.page)).delivery,'delivered');
    assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
    assert.equal(h.sent.filter(item=>item.message.kind==='workflow-read-a').length,1);
    assert.equal(h.runs.length,1);assert.equal(h.results.length,1);assert.equal(await h.handle('claim'),null);
  }
});

test(`R11 ${version} read-a recovery refuses every mismatching echo, ambiguous or missing official message proof`,async()=>{
  for(const field of ['workflowId','deliveryKey','authorizationRef','sourceUrl','anchorMessageId',
    'contentSha256','messageId','readOnly','missing','ambiguous','original-anchor']){
    const h=strictAFixture();h.state.officialUserMessageId='official-source-a-0001';
    await h.approve();const row=await h.completed();h.state.deliveryError=true;
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),/ACK lost/);h.restart();
    h.state.onReadA=data=>{
      if(field==='missing')delete data.messageId;
      else if(field==='original-anchor')data.messageId=data.anchorMessageId;
      else if(field==='ambiguous')h.state.readAReply={ok:false,error:{code:'E_CHAT_A_READBACK',message:'ambiguous'}};
      else data[field]=field==='readOnly'?false:'wrong value';
    };
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_CHAT_DELIVERY_PROOF'});
    assert.equal((await h.ledger.inspectWebTask(row.requestId)).webDelivery,'dispatching');
    assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
    assert.equal(h.runs.length,1);
  }
});

test(`R11 ${version} read-a recovery checks source, install, authorization and original Durable Result before reading`,async()=>{
  for(const change of ['document','source','permission','revoke','version','denied-result','changed-result','hash']){
    const h=strictAFixture();h.state.officialUserMessageId='official-source-a-0001';
    await h.approve();const row=await h.completed();h.state.deliveryError=true;
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),/ACK lost/);h.restart();
    if(change==='document')h.state.documentChanged=true;
    if(change==='source')h.state.sourceValid=false;
    if(change==='permission')h.state.permissionDenied=true;
    if(change==='revoke')await h.ledger.revokeRequest({source,requestId:row.requestId});
    if(change==='version')h.state.taskError=Object.assign(Error('installed version changed'),{code:'E_BRIDGE_REVISION'});
    if(change==='denied-result')h.state.resultDenied=true;
    if(change==='changed-result')h.results[0].outcome.valueWire=encodeValue({...h.state.resultValue,replyText:'different B reply'});
    if(change==='hash')h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].webDispatchIntent.contentSha256='a'.repeat(64);
    await assert.rejects(h.handle('settle',{requestId:row.requestId}));
    assert.equal(h.sent.filter(item=>item.message.kind==='workflow-read-a').length,0);
    assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
    assert.equal((await h.ledger.inspectWebTask(row.requestId)).webDelivery,'dispatching');
  }
});

test(`R11 ${version} read-a recovery rechecks document, authorization and installation after awaiting the page`,async()=>{
  for(const change of ['document','revoke','version','late-version']){
    const h=strictAFixture();h.state.officialUserMessageId='official-source-a-0001';
    await h.approve();const row=await h.completed();h.state.deliveryError=true;
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),/ACK lost/);h.restart();
    h.state.onReadA=async()=>{
      if(change==='document')h.state.documentChanged=true;
      if(change==='revoke')await h.ledger.revokeRequest({source,requestId:row.requestId});
      if(change==='version')h.state.taskError=Object.assign(Error('installation replaced'),{code:'E_BRIDGE_REVISION'});
      if(change==='late-version')h.state.onTaskVerified=()=>{h.state.onStorageRead=()=>{h.state.taskEpoch++;};};
    };
    await assert.rejects(h.handle('settle',{requestId:row.requestId}));
    h.state.onStorageRead=null;
    assert.equal((await h.ledger.inspectWebTask(row.requestId)).webDelivery,'dispatching');
    assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  }
});

test(`R11 ${version} replacement worker host cannot acquire or recover original A execution ownership`,async()=>{
  const h=strictAFixture();h.state.officialUserMessageId='official-source-a-0001';
  await h.approve();const row=await h.completed();h.state.deliveryError=true;
  await assert.rejects(h.handle('settle',{requestId:row.requestId}),/ACK lost/);
  h.restart({newOwner:true});await h.handle('reconcile');
  await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_WEB_TASK_OWNER'});
  assert.equal(h.sent.filter(item=>item.message.kind==='workflow-read-a').length,0);
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  assert.equal(await h.handle('claim'),null);
});

test(`R11 ${version} strict A receipt stops when source document, permission, authorization or installed version changes`,async()=>{
  for(const change of ['source','document','permission','revoke','version']){
    const h=strictAFixture();await h.approve();const row=await h.completed();
    const reply=h.state.deliveryReplyFactory;
    h.state.deliveryReplyFactory=async message=>{
      const receipt=await reply(message);
      if(change==='source')h.state.sourceValid=false;
      if(change==='document')h.state.documentChanged=true;
      if(change==='permission')h.state.permissionDenied=true;
      if(change==='revoke')await h.ledger.revokeRequest({source,requestId:row.requestId});
      if(change==='version')h.state.taskError=Object.assign(Error('installed version changed'),{code:'E_BRIDGE_REVISION'});
      return receipt;
    };
    await assert.rejects(h.handle('settle',{requestId:row.requestId}));
    const saved=await h.ledger.inspectWebTask(row.requestId);
    assert.equal(saved.webDelivery,'dispatching');assert.notEqual(saved.webObservation.delivery,'confirmed');
    h.restart();
    await assert.rejects(h.handle('settle',{requestId:row.requestId}));
    assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  }
});

test(`R11 ${version} oversized complete B reply preserves full Durable Result and persistent separate A delivery refusal`,async()=>{
  for(const v2 of [false,true]){
    const h=strictAFixture();h.state.v2=v2;h.state.officialUserMessageId='official-source-a-0001';
    const fullReply='完整回复正文。'.repeat(1500);h.state.resultValue.replyText=fullReply;
    await h.approve();const row=await h.completed();
    const originalResult=structuredClone(h.results[0]);
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_CHAT_CREATE_RESULT'});
    const saved=await h.ledger.inspectWebTask(row.requestId);
    assert.equal(saved.webDelivery,undefined);assert.equal(saved.webDispatchIntent,undefined);
    assert.equal(saved.webObservation.delivery,'refused');
    assert.match(saved.webObservation.deliveryError.message,/8192/);
    assert.equal(saved.webObservation.execution,'completed');
    for(const restart of [false,true]){
      if(restart)h.restart();
      await h.handle('reconcile');
      assert.equal((await h.handle('settle',{requestId:row.requestId})).delivery,'refused');
      assert.equal((await h.handle('query',{requestId:row.requestId},h.page)).delivery,'refused');
      const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
      assert.equal(receipt.execution,'completed');assert.equal(receipt.persistence,'verified');
      assert.equal(receipt.delivery,'refused');assert.equal(receipt.value.replyText,fullReply);
      assert.deepEqual(receipt.deliveryError,saved.webObservation.deliveryError);
      assert.equal(receipt.error,undefined,'delivery refusal is separate from Task outcome');
    }
    assert.deepEqual(h.results[0],originalResult);
    assert.equal(h.sent.filter(item=>['deliver','workflow-read-a'].includes(item.message.kind)).length,0);
    h.state.resultDenied=true;
    const denied=(await h.handle('history',{source},h.panel))[0].receipt;
    assert.equal(denied.value,undefined);assert.equal(denied.deliveryError,undefined);
  }
});

test(`R11 ${version} original A readback failure stays visible with frozen SHA after restart without replay`,async()=>{
  const h=strictAFixture();h.state.officialUserMessageId='official-source-a-0001';
  await h.approve();const row=await h.completed();h.state.deliveryError=true;
  await assert.rejects(h.handle('settle',{requestId:row.requestId}),/ACK lost/);
  const before=await h.ledger.inspectWebTask(row.requestId),result=structuredClone(h.results[0]);
  h.state.readAReply={ok:false,error:{code:'E_CHAT_A_READBACK',message:'没有唯一匹配的官方新增用户消息'}};
  for(const restart of [false,true]){
    if(restart)h.restart();
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),error=>
      error.code==='E_CHAT_DELIVERY_PROOF'&&error.message.includes(before.webDispatchIntent.contentSha256)&&
      error.message.includes('没有唯一匹配的官方新增用户消息'));
    const saved=await h.ledger.inspectWebTask(row.requestId);
    assert.equal(saved.webDelivery,'dispatching');assert.equal(saved.webObservation.delivery,'unknown');
    assert.deepEqual(saved.webDispatchIntent,before.webDispatchIntent);
    const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
    assert.equal(receipt.execution,'completed');assert.equal(receipt.persistence,'verified');
    assert.equal(receipt.delivery,'unknown');assert.equal(receipt.value.replyText,h.state.resultValue.replyText);
    assert.deepEqual(receipt.deliveryError,saved.webObservation.deliveryError);
    assert.match(receipt.deliveryError.message,/保持 UNKNOWN，禁止重发/);
    assert.equal(receipt.error,undefined,'delivery failure does not replace completed Task outcome');
  }
  assert.deepEqual(h.results[0],result);assert.equal(h.runs.length,1);
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  h.state.resultDenied=true;
  const denied=(await h.handle('history',{source},h.panel))[0].receipt;
  assert.equal(denied.value,undefined);assert.equal(denied.deliveryError,undefined);
});

}

const source={tabId:4,documentId:'chat-document',url:'https://chatgpt.com/c/background-test'};
const scope={taskId:'baidu.search.top3',args:{query:'OpenDesk Browser',limit:3},targetUrl:'https://www.baidu.com/',
  sourceOrigin:'https://chatgpt.com',installation:{version:'1.1.2',scriptId:'task:baidu.search.top3:1.1.2',revision:1,
    manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),installationId:'install-one',generation:1}};
const event=()=>({addListener(){}});
function fixture({taskScope=scope}={}){
  const scope=taskScope;
  const values={},sent=[],runs=[],results=[],framework=new Map();
  let serial=0,replyChecks=0,taskChecks=0;
  const state={deliveryError:false,replyValid:true,sourceValid:true,ensures:0,resultDenied:false,taskEpoch:0,originalAProofPolicy};
  const storage={get:async key=>{state.onStorageRead?.();return {[key]:structuredClone(values[key])};},
    set:async next=>{
      if(state.failDeliveryReceiptWrite&&Object.values(next[CHATGPT_BRIDGE_LEDGER_KEY]??{})
        .some(row=>row.webDelivery==='delivered'))
        throw Object.assign(new Error('simulated atomic receipt write failure'),{code:'E_TEST_STORAGE'});
      Object.assign(values,structuredClone(next));state.onStorageWrite?.(next);
    }};
  const id='test-extension',getURL=path=>'chrome-extension://'+id+'/'+path;
  const page={id,frameId:0,documentId:source.documentId,url:source.url,tab:{id:4,url:source.url}};
  const owner={id,frameId:0,documentId:'original-offscreen',url:getURL('cloud-control/runner.html')};
  const panel={id,frameId:0,documentId:'panel',url:getURL('sidepanel.html?hostInstanceId=review')};
  const api={runtime:{id,getURL,getContexts:async filter=>[
    {contextType:'OFFSCREEN_DOCUMENT',documentId:owner.documentId,documentUrl:owner.url,frameId:0},
    {contextType:'SIDE_PANEL',documentId:panel.documentId,documentUrl:panel.url,frameId:0}]
    .filter(row=>(!filter.documentIds||filter.documentIds.includes(row.documentId))&&
      (!filter.documentUrls||filter.documentUrls.includes(row.documentUrl))&&filter.contextTypes.includes(row.contextType))},
    storage:{local:storage,onChanged:event()},permissions:{onRemoved:event(),contains:async()=>!state.permissionDenied},
    tabs:{onRemoved:event(),get:async()=>({id:4,url:state.sourceValid?source.url:'https://chatgpt.com/c/other'}),
      sendMessage:async(tabId,message,options)=>{sent.push({tabId,message,options});
        if(message.kind==='progress')return {ok:true};
        if(message.kind==='workflow-read-a'){
          if(state.readAError)throw state.readAError;
          const {protocol,kind,...identity}=message;
          const data={...identity,readOnly:true,messageId:'official-a-message-0001'};
          await state.onReadA?.(data,message);
          return state.readAReply??{ok:true,data};
        }
        if(state.deliveryError)throw Error('ACK lost');
        if(state.deliveryReply)return structuredClone(state.deliveryReply);
        if(state.deliveryReplyFactory)return state.deliveryReplyFactory(message);
        return {ok:true,data:{sent:true,userObserved:true,aiReplyObserved:true}};}},
    webNavigation:{onCommitted:event(),onHistoryStateUpdated:event(),onReferenceFragmentUpdated:event(),getFrame:async()=>({
      documentId:state.documentChanged?'replacement-document':source.documentId,url:source.url,documentLifecycle:'active'})}};
  const newLedger=()=>createChatGPTBridgeTriggerLedger({storage,originalAProofPolicy:state.originalAProofPolicy,
    generateId:()=>`11111111-1111-4111-8111-${String(++serial).padStart(12,'0')}`});
  let ledger=newLedger();
  const broker={storage:{transaction:async(stores,mode,read)=>read({
    get:async(_store,key)=>stores.includes('frameworkKV')?structuredClone(framework.get(key)):null,
    put:async(_store,key,value)=>{if(!stores.includes('frameworkKV'))throw Error('incorrect store');framework.set(key,structuredClone(value));},
    all:async name=>structuredClone(name==='runs'?runs:results)})},authority:{captureInstalledTaskFence:()=>{
      const ticket=state.taskEpoch;
      return ()=>{if(ticket!==state.taskEpoch)throw Object.assign(Error('installation changed'),{code:'E_REVISION'});};
    },resolveInstalledTask:async()=>state.issueInstalled||({taskId:scope.taskId,...scope.installation,manifest:{deadlineMs:120000}}),
    snapshotControllerRun:async({runId})=>{
      await state.onSnapshot?.();
      return {run:structuredClone(runs.find(row=>row.runId===runId)),results:state.resultDenied?[]:structuredClone(results),
        resultDeliveryDenied:state.resultDenied?[runId]:[]};}}};
  const newIngress=()=>createWebTaskIngress({api,ledger,loadFoundation:async()=>broker,ensureRunner:async()=>{state.ensures++;},
    verifyChatGPTCandidate:async()=>{replyChecks++;if(!state.replyValid)throw Object.assign(Error('reply changed'),{code:'E_BRIDGE_CONTEXT'});
      return state.officialUserMessageId?{officialUserMessageId:state.officialUserMessageId}:{};},
    verifyTaskScope:async()=>{taskChecks++;state.onTaskVerified?.();if(state.taskError)throw state.taskError;
      return {...(state.manifest??{title:'百度搜索',deadlineMs:30000}),installation:scope.installation};}});
  let ingress=newIngress();
  const handle=(kind,body={},sender=owner)=>ingress.handle({protocol:WEB_TASK_PROTOCOL,kind,...body},sender);
  const admit=(candidateId='fresh-candidate')=>ingress.handleChatGPT({protocol:CHATGPT_BRIDGE_PROTOCOL,kind:'auto-task',persistentAuto:true,
    candidateText:JSON.stringify({protocol:state.v2?'webflow.task.intent.v2':'webflow.task.intent.v1',candidateId,
      taskId:scope.taskId,args:scope.args,...(state.v2?{}:{targetUrl:scope.targetUrl})}),
    turnKey:'turn-new',answerKey:'answer-new'},page);
  const ready=async row=>ingress.handleChatGPT({protocol:CHATGPT_BRIDGE_PROTOCOL,kind:'background-ready',requestId:row.requestId},page);
  const completed=async(candidateId='fresh-candidate',runId='run-one',resultId='result-one',{lostStartAck=false}={})=>{
    const row=await admit(candidateId);
    if(state.v2){
      const saved=await ledger.inspectWebTask(row.requestId);
      await ledger.approveV2Pending({source,requestId:row.requestId,candidate:saved.candidate,scope:saved.scope});
    }
    await ready(row);const request=await handle('claim');
    const revision={scriptId:scope.installation.scriptId,revision:1,sourceHash:scope.installation.contentHash};
    const submit=()=>{
      runs.push({tag:'controller-run',namespace:'tool:'+id,requestId:row.requestId,hostDocumentId:owner.documentId,
        sourceKind:'saved',scriptId:revision.scriptId,contentHash:revision.sourceHash,revision,runId,resultId,
        state:'completed',retirementState:'released',...(state.retainedRun??{})});
      results.push({tag:'controller-result',runId,resultId,state:'completed',sourceKind:'saved',revision,
        outcome:{ok:true,valueWire:encodeValue(state.resultValue??{query:'OpenDesk Browser',results:[1,2,3]})}});
      if(lostStartAck)throw Error('start ACK lost');
      return {runId};
    };
    const starting=ledger.withControllerAdmission({...request,paramsWire:encodeValue(request.params)},submit,
      saved=>ingress.verifySubmission(saved,owner));
    if(lostStartAck)await assert.rejects(starting,/start ACK lost/);else await starting;
    return row;
  };
  return {state,values,sent,page,owner,panel,runs,results,handle,admit,ready,completed,
    get ledger(){return ledger;},get ingress(){return ingress;},
    restart:({newOwner=false}={})=>{if(newOwner)owner.documentId='replacement-offscreen';ledger=newLedger();ingress=newIngress();},
    get replyChecks(){return replyChecks;},get taskChecks(){return taskChecks;},
    approve:async()=>{await ledger.approveAuto(scope);await ledger.setAutoEnabled(true);}};
}
test('original SW grants fixed Issue workflow once and recovers the same scope after restart',async()=>{
 const h=fixture();
 const release=REVIEWED_BUILTIN_TASK_RELEASES.find(row=>
   row.taskId==='chatgpt.conversation.create'&&row.version==='0.2.0');
 assert.ok(release);
 const installation={version:'0.2.0',manifestHash:release.manifestHash,
   contentHash:release.sourceHash,scriptId:'task:chatgpt.conversation.create:0.2.0',
   revision:1,installationId:'issue-installation-001',generation:1};
 h.state.issueInstalled={taskId:'chatgpt.conversation.create',...installation,
   manifest:{targetDisposition:'retain-on-success',siteOrigins:['https://chatgpt.com']}};
 assert.equal(await h.handle('workflow-auth-read',{},h.panel),null);
 await assert.rejects(h.handle('workflow-auth-approve',{installation},h.page));
 const active=await h.handle('workflow-auth-approve',{installation},h.panel);
 assert.equal(active.state,'active');
 assert.equal(active.scope.send,true);
 assert.deepEqual(active.scope.capabilities,['github.issue.read','chatgpt.conversation.create.send',
   'controller.result.read','chatgpt.source-a.send']);
 assert.equal(active.scope.githubRepo,'shopable-ai/opendesk-browser');
 h.restart();
 const same=await h.handle('workflow-auth-read',{},h.panel);
 assert.equal(same.grantId,active.grantId);
 assert.equal(same.epoch,active.epoch);
 await assert.rejects(h.handle('workflow-auth-approve',
   {installation:{...installation,generation:2}},h.panel),
   {code:'E_ISSUE_WORKFLOW_INSTALLATION'});
 const revoked=await h.handle('workflow-auth-revoke',{},h.panel);
 assert.equal(revoked.state,'revoked');
 assert.equal((await h.handle('workflow-auth-read',{},h.panel)).state,'revoked');
 await assert.rejects(h.handle('workflow-auth-revoke',{},h.page));
});
test('fresh complete ChatGPT reply is owned by existing background queue without a Side Panel',async()=>{
  const h=fixture();await h.approve();const row=await h.admit();
  assert.equal(row.executionOwner,'background');assert.equal(await h.handle('claim'),null);
  await h.ready(row);const claimed=await h.handle('claim');
  assert.equal(claimed.requestId,row.requestId);assert.deepEqual(claimed.params,scope.args);
  assert(h.replyChecks>=2);assert(h.taskChecks>=2);
  assert.equal(await h.handle('claim'),null);
});
test('a pending range review is not an unknown execution and history cannot start it',async()=>{
  const h=fixture();await h.ledger.setAutoEnabled(true);const row=await h.admit();
  assert.equal(h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].pendingAuto,true);
  h.restart();
  const history=await h.handle('history',{source},h.panel);
  assert.equal(history[0].status,'prepared');assert.equal(history[0].pendingAuto,true);
  assert.deepEqual(history[0].receipt,{execution:'not-started',release:'not-started',
    persistence:'not-confirmed',delivery:'not-sent',runId:null,resultId:null});
  assert.equal(await h.handle('claim'),null);
  assert.equal(h.state.ensures,0);assert.equal(h.runs.length,0);assert.equal(h.sent.length,0);
});
for(const patch of [{consumedAt:0},{controllerSubmitted:true},{webHostDocumentId:'lost-owner'},
  {webDelivery:'dispatching'},{webObservation:{execution:'running'}}])
test(`missing Run with ${Object.keys(patch)[0]} remains unknown`,async()=>{
  const h=fixture();await h.ledger.setAutoEnabled(true);const row=await h.admit();
  Object.assign(h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId],patch);
  h.restart();const history=await h.handle('history',{source},h.panel);
  assert.equal(history[0].receipt.execution,'unknown');
  assert.equal(history[0].receipt.release,'unknown');
  assert.equal(h.runs.length,0);assert.equal(h.sent.length,0);
});
test('paused owned execution keeps its durable identity without inventing a persistent Result or retrying',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.runs[0].state='paused_unknown';h.runs[0].retirementState='not-started';h.results.splice(0);
  await h.ledger.recordWebTaskObservation(row.requestId,{runId:'stale-observation',resultId:'stale-result'});
  h.restart();const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
  assert.equal(receipt.execution,'paused_unknown');assert.equal(receipt.runId,h.runs[0].runId);
  assert.equal(receipt.resultId,h.runs[0].resultId);assert.equal(receipt.release,'not-started');
  assert.equal(receipt.persistence,'not-confirmed');assert.equal(receipt.value,undefined);
  assert.equal(await h.handle('claim'),null);assert.equal(h.sent.length,0);
  delete h.runs[0].resultId;
  assert.equal((await h.handle('history',{source},h.panel))[0].receipt.resultId,null,
    'a current Run must not borrow a Result identity from another observation');
});

test('lost Run lookup preserves observed IDs as unverified metadata and never discloses cached Result bytes',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  await h.ledger.recordWebTaskObservation(row.requestId,{runId:h.runs[0].runId,resultId:h.runs[0].resultId,
    persistence:'verified',value:'PRIVATE_CACHED_RESULT',error:{code:'CACHED_ERROR',message:'PRIVATE'}});
  h.runs.splice(0);h.results.splice(0);h.restart();
  const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
  assert.equal(receipt.execution,'unknown');assert.equal(receipt.runId,'run-one');assert.equal(receipt.resultId,'result-one');
  assert.equal(receipt.persistence,'not-confirmed');assert.equal(receipt.release,'unknown');
  assert.equal(receipt.value,undefined);assert.equal(receipt.error,undefined);
  assert.equal(await h.handle('claim'),null);assert.equal(h.sent.length,0);
});

test('changed complete reply or revoked authorization cannot submit',async()=>{
  const h=fixture();await h.approve();const row=await h.admit();await h.ready(row);h.state.replyValid=false;
  assert.equal(await h.handle('claim'),null);
  assert.equal(h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].status,'revoked');
  h.state.replyValid=true;await h.ledger.setAutoEnabled(false);
  await assert.rejects(h.admit('different-candidate'),{code:'E_WEBFLOW_AUTO_DENIED'});
});
test('durable result is delivered once to original chat with distinct stage receipts',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  const result=await h.handle('settle',{requestId:row.requestId});
  assert.equal(result.state,'completed');
  const delivery=h.sent.filter(item=>item.message.kind==='deliver');assert.equal(delivery.length,1);
  assert.equal(delivery[0].message.protocol,CHATGPT_BRIDGE_PROTOCOL);
  assert.equal(delivery[0].message.turnKey,'turn-new');assert.equal(delivery[0].options.documentId,source.documentId);
  const saved=h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId];
  assert.equal(saved.webObservation.persistence,'verified');assert.equal(saved.webObservation.release,'released');
  assert.equal(saved.webObservation.delivery,'confirmed');assert.equal(saved.webObservation.aiReplyObserved,true);
  await h.handle('settle',{requestId:row.requestId});
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
});
test('lost delivery ACK stays unknown through reconciliation and never resends',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();h.state.deliveryError=true;
  await assert.rejects(h.handle('settle',{requestId:row.requestId}));
  await h.handle('reconcile');await h.handle('settle',{requestId:row.requestId});
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  const history=await h.handle('history',{source},h.panel);
  assert.equal(history[0].receipt.delivery,'unknown');assert.equal(history[0].receipt.runId,'run-one');
});
for(const code of ['E_CHAT_FILL','E_CHAT_ANSWER'])test(`${code} delivery rejection remains diagnosable without another send`,async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.state.deliveryReply={ok:false,error:{code,message:'original delivery rejection',outcome:'OUTCOME_UNKNOWN'}};
  await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code,message:'original delivery rejection'});
  const observation=h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].webObservation;
  assert.equal(observation.delivery,'unknown');
  assert.deepEqual(observation.error,{code,message:'original delivery rejection'});
  await h.handle('reconcile');await h.handle('settle',{requestId:row.requestId});
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
});
test('final source rejection after dispatch fencing records the error without sending',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.state.onStorageWrite=next=>{
    if(next[CHATGPT_BRIDGE_LEDGER_KEY]?.[row.requestId]?.webDelivery==='dispatching')h.state.sourceValid=false;
  };
  await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_WEB_TASK_SOURCE'});
  const saved=h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId];
  assert.equal(saved.webDelivery,'dispatching');assert.equal(saved.webObservation.delivery,'unknown');
  assert.equal(saved.webObservation.error.code,'E_WEB_TASK_SOURCE');
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,0);
  h.state.sourceValid=true;
  await h.handle('settle',{requestId:row.requestId});
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,0);
});
test('new offscreen document can only read the original unknown run, never take it over',async()=>{
  const h=fixture();await h.approve();const row=await h.admit();await h.ready(row);await h.handle('claim');
  h.restart({newOwner:true});
  const history=await h.handle('history',{source},h.panel);
  assert.equal(history[0].receipt.execution,'unknown');assert.equal(await h.handle('claim'),null);
  await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_WEB_TASK_OWNER'});
});
test('navigation blocks delivery to a different chat',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();h.state.sourceValid=false;
  await assert.rejects(h.handle('settle',{requestId:row.requestId}));
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,0);
});
test('background cancellation revokes only the original request before requesting its Host stop',async()=>{
  const h=fixture();await h.approve();const row=await h.admit();await h.ready(row);
  const result=await h.ingress.handleChatGPT({protocol:CHATGPT_BRIDGE_PROTOCOL,kind:'background-stop',requestId:row.requestId},h.page);
  assert.equal(result.cancelled,true);assert.equal(await h.handle('claim'),null);
  assert.equal(h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].status,'revoked');
});
test('final delivery permission and history respect original Authority result denial',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  await h.ledger.markWebTaskDelivery(row.requestId,'dispatching');h.state.resultDenied=true;
  await assert.rejects(h.ingress.handleChatGPT({kind:'check-delivery',requestId:row.requestId,mode:'auto',
    runId:'run-one',resultId:'result-one'},h.page),{code:'E_BRIDGE_DURABLE'});
  const history=await h.handle('history',{source},h.panel);
  assert.equal(history[0].receipt.value,undefined);assert.notEqual(history[0].receipt.persistence,'verified');
});
test('request cancellation before or during final verification forbids result delivery',async()=>{
  for(const during of [false,true]){
    const h=fixture();await h.approve();const row=await h.completed();
    await h.ledger.markWebTaskDelivery(row.requestId,'dispatching');
    const revoke=()=>h.ledger.revokeRequest({source,requestId:row.requestId});
    if(during)h.state.onSnapshot=revoke;else await revoke();
    await assert.rejects(h.ingress.handleChatGPT({kind:'check-delivery',requestId:row.requestId,mode:'auto',
      runId:'run-one',resultId:'result-one'},h.page),{code:'E_BRIDGE_REVOKED'});
  }
});
test('two independent requests under one grant keep two original identities and single deliveries',async()=>{
  const h=fixture();await h.approve();
  const first=await h.completed();await h.handle('settle',{requestId:first.requestId});
  await assert.rejects(h.admit(),{code:'E_BRIDGE_REPLAY'});
  const second=await h.completed('second-candidate','run-two','result-two');
  await h.handle('settle',{requestId:second.requestId});await h.handle('reconcile');
  assert.notEqual(first.requestId,second.requestId);assert.equal(h.runs.length,2);
  assert.deepEqual(h.sent.filter(row=>row.message.kind==='deliver').map(row=>[row.message.requestId,row.message.runId,row.message.resultId]),
    [[first.requestId,'run-one','result-one'],[second.requestId,'run-two','result-two']]);
});
test('lost execution ACK and SW restart reconcile the same durable Run without starting again',async()=>{
  const h=fixture();await h.approve();const row=await h.completed('fresh-candidate','run-one','result-one',{lostStartAck:true});
  h.restart();await h.handle('reconcile');await h.handle('reconcile');
  assert.equal(h.runs.length,1);assert.equal(await h.handle('claim'),null);
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  assert.equal((await h.handle('history',{source},h.panel))[0].requestId,row.requestId);
});
test('installation change after task validation but during the final ledger read fences delivery',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  await h.ledger.markWebTaskDelivery(row.requestId,'dispatching');
  h.state.onTaskVerified=()=>{h.state.onTaskVerified=null;h.state.onStorageRead=()=>{
    h.state.onStorageRead=null;h.state.taskEpoch++;};};
  await assert.rejects(h.ingress.handleChatGPT({kind:'check-delivery',requestId:row.requestId,mode:'auto',
    runId:'run-one',resultId:'result-one'},h.page),{code:'E_REVISION'});
});

test('trusted restarted history reads original legacy ledger without inventing execution or result correlation',async()=>{
  const h=fixture(),rows={},candidate={candidateId:'legacy-candidate',turnKey:'original-turn',answerKey:'original-answer',
    text:JSON.stringify({protocol:'webflow.task.intent.v1',candidateId:'legacy-candidate',taskId:scope.taskId,
      args:scope.args,targetUrl:scope.targetUrl})};
  const cases=[['prepared',false],['approved',false],['revoked',false],['consumed',false],['revoked',true],['prepared',true]];
  for(const [index,[status,consumed]] of cases.entries()){
    const requestId=`22222222-2222-4222-8222-${String(index+1).padStart(12,'0')}`;
    rows[requestId]={source:structuredClone(source),scope:structuredClone(scope),status,createdAt:100,
      ...(index===0?{candidate}:{}),...(consumed?{consumedAt:0}:{}),
      webObservation:{execution:'completed',persistence:'verified',release:'released',delivery:'confirmed',value:'UNTRUSTED_RESULT'},
      webDelivery:'delivered'};
    // Same request alone is not proof of the old host document or durable result.
    h.runs.push({tag:'controller-run',namespace:'tool:test-extension',requestId,state:'completed',
      retirementState:'released',runId:'unrelated-run',resultId:'unrelated-result'});
  }
  rows['33333333-3333-4333-8333-333333333333']={...structuredClone(rows[Object.keys(rows)[0]]),kind:'conversation-grant'};
  rows['44444444-4444-4444-8444-444444444444']={source,scope:{taskId:'invalid task'},status:'consumed'};
  rows['55555555-5555-4555-8555-555555555555']={source:{...source,documentId:''},scope,status:'consumed'};
  h.values[CHATGPT_BRIDGE_LEDGER_KEY]=structuredClone(rows);h.restart({newOwner:true});
  const before=structuredClone(h.values);
  const history=await h.handle('history',{source},h.panel);
  assert.equal(history.length,cases.length);
  for(const [index,row] of history.entries()){
    const [status,consumed]=cases[index],unknown=consumed||status==='consumed';
    assert.equal(row.requestId,Object.keys(rows)[index]);assert.equal(row.status,status);
    assert.deepEqual(row.source,source);assert.deepEqual(row.scope,scope);
    assert.deepEqual(row.candidate,index===0?candidate:undefined);
    assert.deepEqual(row.receipt,{execution:unknown?'unknown':'not-started',release:unknown?'unknown':'not-started',
      delivery:unknown?'unknown':'not-sent',persistence:'not-confirmed',runId:null,resultId:null});
  }
  assert.deepEqual(await h.ledger.listWebTasks(),[]);
  assert.deepEqual(await h.ledger.listWebTasks({source}),[]);
  assert.equal(await h.ledger.inspectWebTask(Object.keys(rows)[0]),null);
  assert.deepEqual(await h.handle('history',{source:{...source,documentId:'another-document'}},h.panel),[]);
  await assert.rejects(h.handle('query',{requestId:Object.keys(rows)[0]},h.page),{code:'E_WEB_TASK_REQUEST'});
  assert.deepEqual(h.values,before);assert.equal(h.sent.length,0);assert.equal(h.state.ensures,0);
});

test('legacy history is denied to page, sandbox, runner and forged Side Panel before ledger reads',async()=>{
  const h=fixture();h.values[CHATGPT_BRIDGE_LEDGER_KEY]={
    '22222222-2222-4222-8222-222222222222':{source,scope,status:'consumed',consumedAt:1}};
  h.restart();const before=structuredClone(h.values);let reads=0;h.state.onStorageRead=()=>reads++;
  for(const sender of [h.page,h.owner,{...h.panel,url:'chrome-extension://test-extension/ui/tool.html?toolId=webflow'},
    {...h.panel,url:h.panel.url+'&toolId=webflow'},{...h.panel,id:'other-extension'}])
    await assert.rejects(h.handle('history',{source,includeLegacy:true},sender));
  assert.equal(reads,0);assert.deepEqual(h.values,before);assert.equal(h.sent.length,0);
});

for(const terminal of ['failed','stopped']){
  test(`${terminal} durable history survives restart without delivery or replay`,async()=>{
    const h=fixture();await h.approve();const row=await h.completed();
    h.runs[0].state=terminal;h.results[0].state=terminal;
    h.results[0].outcome={ok:false,error:{code:'E_TASK_TIMEOUT',message:'original timeout',details:'PRIVATE'},
      valueWire:encodeValue('PRIVATE')};
    await h.handle('settle',{requestId:row.requestId});h.restart({newOwner:true});
    const history=await h.handle('history',{source},h.panel),receipt=history[0].receipt;
    assert.equal(history[0].requestId,row.requestId);assert.equal(receipt.execution,terminal);
    assert.equal(receipt.persistence,'verified');assert.equal(receipt.release,'released');
    assert.deepEqual(receipt.error,{code:'E_TASK_TIMEOUT',message:'original timeout'});
    assert.equal(receipt.value,undefined);assert(!JSON.stringify(history).includes('PRIVATE'));
    await h.handle('reconcile');assert.equal(await h.handle('claim'),null);
    assert.equal(h.runs.length,1);assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,0);
  });
}

test('terminal history rejects denied, ambiguous and mismatched durable Results',async()=>{
  const mutations=[h=>{h.state.resultDenied=true;},h=>{h.results.push(structuredClone(h.results[0]));},
    ...['runId','resultId','sourceKind','state'].map(key=>h=>{h.results[0][key]='other';}),
    ...['scriptId','revision','sourceHash'].map(key=>h=>{h.results[0].revision[key]='other';}),
    h=>{h.results[0].outcome.ok=true;},h=>{h.runs[0].contentHash='other';},
    h=>{h.runs[0].sourceKind='draft';}];
  for(const mutate of mutations){
    const h=fixture();await h.approve();await h.completed();h.runs[0].state='failed';h.results[0].state='failed';
    h.results[0].outcome={ok:false,error:{code:'E_PRIVATE',message:'PRIVATE'},valueWire:encodeValue('PRIVATE')};
    mutate(h);h.restart();const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
    assert.notEqual(receipt.persistence,'verified');assert.equal(receipt.value,undefined);
    assert(!JSON.stringify(receipt).includes('PRIVATE'));
  }
});

test('history denies durable data after original auto grant or request revocation',async()=>{
  for(const terminal of ['completed','failed','stopped'])for(const revoke of ['grant','request']){
    const h=fixture();await h.approve();const row=await h.completed();
    h.runs[0].state=terminal;h.results[0].state=terminal;
    if(terminal!=='completed')h.results[0].outcome={ok:false,error:{code:'E_PRIVATE',message:'PRIVATE'}};
    if(revoke==='grant')await h.ledger.revokeAuto(scope.taskId);
    else await h.ledger.revokeRequest({source,requestId:row.requestId});
    h.restart();const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
    assert.notEqual(receipt.persistence,'verified');assert.equal(receipt.value,undefined);
    assert(!JSON.stringify(receipt).includes('PRIVATE'));
  }
});

test('history fences revocation during snapshot and final asynchronous ledger reads',async()=>{
  for(const phase of ['snapshot','final-read'])for(const revoke of ['grant','request','installation']){
    const h=fixture();await h.approve();const row=await h.completed();
    const deny=()=>revoke==='grant'?h.ledger.revokeAuto(scope.taskId):revoke==='request'?
      h.ledger.revokeRequest({source,requestId:row.requestId}):h.state.taskEpoch++;
    h.state.onSnapshot=async()=>{
      h.state.onSnapshot=null;
      if(phase==='snapshot')await deny();
      else h.state.onStorageRead=()=>{h.state.onStorageRead=null;void deny();};
    };
    const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
    assert.notEqual(receipt.persistence,'verified',`${phase}/${revoke}`);assert.equal(receipt.value,undefined);
  }
});

test('request revocation inside the last history ledger read denies durable disclosure',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.state.onSnapshot=()=>{
    h.state.onSnapshot=null;let reads=0;
    h.state.onStorageRead=()=>{
      // Post-snapshot settings, assertConsumed row, its settings, final row.
      if(++reads===4){h.state.onStorageRead=null;void h.ledger.revokeRequest({source,requestId:row.requestId});}
    };
  };
  const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
  assert.notEqual(receipt.persistence,'verified');assert.equal(receipt.value,undefined);
});


test('terminal diagnostics are bounded and history never trusts cached errors',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.runs[0].state='failed';h.results[0].state='failed';
  h.results[0].outcome={ok:false,error:{code:'C'.repeat(200),message:'M'.repeat(3000),private:'PRIVATE'}};
  const receipt=(await h.handle('history',{source},h.panel))[0].receipt;
  assert.equal(receipt.error.code.length,128);assert.equal(receipt.error.message.length,2048);
  assert.deepEqual(Object.keys(receipt.error).sort(),['code','message']);
  await h.ledger.recordWebTaskObservation(row.requestId,{persistence:'verified',error:{code:'E_PRIVATE',message:'PRIVATE'}});
  h.state.resultDenied=true;
  const denied=(await h.handle('history',{source},h.panel))[0].receipt;
  assert.equal(denied.persistence,'not-available');assert(!JSON.stringify(denied).includes('PRIVATE'));
});

test('revocation while another history row is pending also removes an earlier row result',async()=>{
  const h=fixture();await h.approve();const first=await h.completed('first-candidate','run-first','result-first');
  await h.completed('second-candidate','run-second','result-second');
  let reads=0;
  h.state.onSnapshot=async()=>{
    if(++reads!==2)return;
    // Let the first row finish all its asynchronous checks before revoking it.
    await new Promise(setImmediate);
    await h.ledger.revokeRequest({source,requestId:first.requestId});
  };
  const history=await h.handle('history',{source},h.panel);
  const earlier=history.find(item=>item.requestId===first.requestId).receipt;
  assert.notEqual(earlier.persistence,'verified');assert.equal(earlier.value,undefined);
});

test('foreground activation reservation is a durable one-use marker across worker restart',async()=>{
  const h=fixture();await h.approve();
  const row=await h.completed('one-shot-view-source');
  const requestId=row.requestId,runId='edce411c-487a-41d4-9bea-c86736d44f86';
  const first=await h.ledger.reserveWebTaskActivation({requestId,source,runId});
  assert.equal(first.reserved,true);
  assert.equal(h.values[CHATGPT_BRIDGE_LEDGER_KEY][requestId].webActivation.runId,runId);
  await assert.rejects(h.ledger.reserveWebTaskActivation({requestId,source,runId}),{code:'E_BRIDGE_REPLAY'});
  h.restart();
  await assert.rejects(h.ledger.reserveWebTaskActivation({requestId,source,runId}),{code:'E_BRIDGE_REPLAY'});
});

test('exact observed A message ID and delivery text hash survive a read-only restart',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.state.deliveryReplyFactory=async message=>({ok:true,data:{
    sent:true,userObserved:true,aiReplyObserved:false,messageId:'user-message-0001',
    contentSha256:await digestUtf8(message.text)
  }});
  await h.handle('settle',{requestId:row.requestId});
  const saved=h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId];
  assert.equal(saved.webObservation.messageId,'user-message-0001');
  assert.match(saved.webObservation.contentSha256,/^[a-f0-9]{64}$/);
  h.restart();
  const [history]=await h.handle('history',{source},h.panel);
  assert.equal(history.receipt.messageId,'user-message-0001');
  assert.equal(history.receipt.contentSha256,saved.webObservation.contentSha256);
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
});

test('mismatching A message identity or content hash stays UNKNOWN and never resends',async()=>{
  for(const mismatch of ['hash','messageId']){
    const h=fixture();await h.approve();const row=await h.completed();
    h.state.deliveryReplyFactory=async message=>({ok:true,data:{
      sent:true,userObserved:true,aiReplyObserved:false,
      messageId:mismatch==='messageId'?'not valid':'user-message-0001',
      contentSha256:mismatch==='hash'?'a'.repeat(64):await digestUtf8(message.text)
    }});
    await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_CHAT_DELIVERY_PROOF'});
    const saved=h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId];
    assert.equal(saved.webDelivery,'dispatching');
    assert.equal(saved.webObservation.delivery,'unknown');
    h.restart();
    await h.handle('settle',{requestId:row.requestId});
    assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  }
});

test('original A terminal status and durable message proof persist in one Ledger write',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  let commits=0;
  h.state.deliveryReplyFactory=async message=>({ok:true,data:{
    sent:true,userObserved:true,aiReplyObserved:false,messageId:'user-message-0001',
    contentSha256:await digestUtf8(message.text)
  }});
  h.state.onStorageWrite=next=>{
    const current=next[CHATGPT_BRIDGE_LEDGER_KEY]?.[row.requestId];
    if(current?.webDelivery==='delivered'){
      commits++;
      assert.equal(current.webObservation.delivery,'confirmed');
      assert.equal(current.webObservation.messageId,'user-message-0001');
      assert.match(current.webObservation.contentSha256,/^[a-f0-9]{64}$/);
    }
  };
  await h.handle('settle',{requestId:row.requestId});
  assert.equal(commits,1,'one atomic terminal receipt write');
  const persisted=h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId];
  assert.equal(persisted.webObservation.messageId,'user-message-0001');
  assert.equal(persisted.webDelivery,'delivered');
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
});

test('atomic A receipt storage failure never marks delivered or sends a second time',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.state.deliveryReplyFactory=async message=>({ok:true,data:{
    sent:true,userObserved:true,aiReplyObserved:false,messageId:'user-message-0001',
    contentSha256:await digestUtf8(message.text)
  }});
  h.state.failDeliveryReceiptWrite=true;
  await assert.rejects(h.handle('settle',{requestId:row.requestId}),{code:'E_TEST_STORAGE'});
  const saved=h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId];
  assert.equal(saved.webDelivery,'dispatching');
  assert.notEqual(saved.webObservation?.delivery,'confirmed');
  h.state.failDeliveryReceiptWrite=false;h.restart();
  await h.handle('settle',{requestId:row.requestId});
  assert.equal(h.sent.filter(item=>item.message.kind==='deliver').length,1);
  const [rowRead]=await h.handle('history',{source},h.panel);
  assert.equal(rowRead.receipt.delivery,'unknown');
});


test('confirmed A message receipt stays immutable when later observation tries to rewrite identity',async()=>{
  const h=fixture();await h.approve();const row=await h.completed();
  h.state.deliveryReplyFactory=async message=>({ok:true,data:{
    sent:true,userObserved:true,aiReplyObserved:false,messageId:'user-message-0001',
    contentSha256:await digestUtf8(message.text)
  }});
  await h.handle('settle',{requestId:row.requestId});
  const original=structuredClone(h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId]);
  for(const patch of [{runId:'different-run'}, {resultId:'different-result'},
    {delivery:'unknown'}, {persistence:'not-confirmed'},
    {error:{code:'TAMPER',message:'changed'}}]){
    await assert.rejects(h.ledger.recordWebTaskObservation(row.requestId,patch),
      {code:'E_BRIDGE_REPLAY'});
    assert.deepEqual(h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId],original);
  }
  const read=await h.ledger.recordWebTaskObservation(row.requestId,{
    runId:original.webObservation.runId,
    resultId:original.webObservation.resultId,
    delivery:'confirmed'
  });
  assert.equal(read.webObservation.messageId,'user-message-0001');
  assert.deepEqual(h.values[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId],original);
});
