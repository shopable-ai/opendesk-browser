import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createTrustedKnowledgeHost} from '../../projects/ai-knowledge-answers/trusted/host.js';
import {createSharedAIProviderRuntime} from '../../src/ui/ai/provider-runtime.js';
import {createKnowledgeConversation} from '../../projects/ai-knowledge-answers/trusted/ai-request.js';
import {KNOWLEDGE_ANSWER_INSTRUCTIONS} from '../../projects/ai-knowledge-answers/trusted/ai-request.js';

// Integration uses the actual shared runtime/consumer; model transport is fake.
const trusted={isTrusted:true},id='qa_test_refund01';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function setup(t,{transport,localTest=false}={}){
  let stored={version:1,items:[{id,question:'退款期限是多少',aliases:['多久可以退款'],
    answer:'7 天内可退款',scope:'',enabled:true}]},live=true,dirty=false;
  let providerPermitted=true,permissionWait=null;
  let connection;const removals=new Set(),calls=[],permissions=[],pageCalls=[];
  const runtime=createSharedAIProviderRuntime({hostInstanceId:'host-test',
    client:{requestWorkflowAI:async()=>assert.fail('fake HTTPS test must not call Native')},
    facadeFactory:()=>({generateStructured:async args=>{
      calls.push(args);return transport?transport(args):{proposal:{
        answer:'7天内可退款',sourceIds:[id],needsHuman:false},metadata:{provider:'custom_https'}};
    }})});
  runtime.updateSettings({source:'custom_https',endpoint:'https://ai.example/v1/chat/completions',
    model:'fixture',apiKey:'test-secret'});
  const conversation=createKnowledgeConversation({providerRuntime:runtime,
    hostInstanceId:'host-test',consumerId:'knowledge',instanceId:'instance-test',installEpoch:'install-test',
    api:{permissions:{request:args=>{permissions.push(args);return Promise.resolve(true);},contains:()=>permissionWait??Promise.resolve(providerPermitted),
      onRemoved:{addListener:fn=>removals.add(fn),removeListener:fn=>removals.delete(fn)}}}});
  const readLibrary=async()=>({value:structuredClone(stored),etag:createHash('sha256').update(JSON.stringify(stored)).digest('hex')});
  const pageCall=name=>{pageCalls.push(name);assert.fail('manual knowledge must not access the local test page');};
  const host=createTrustedKnowledgeHost({conversation,readLibrary,
    ...(localTest?{api:{scripting:{executeScript:()=>pageCall('executeScript')}},
      currentPageTarget:{capture:()=>pageCall('capture'),revalidate:()=>pageCall('revalidate'),
        refresh:()=>pageCall('refresh')}}:{}),
    assertIdentity:()=>{if(!live)throw Object.assign(Error('installation revoked'),{code:'E_TOOL_CHANGED'});},
    guardBlocked:()=>dirty,
    subscribeConnection:fn=>{connection=fn;return ()=>{connection=null;};}});
  t.after(()=>{host.dispose();runtime.dispose();});
  return {host,conversation,runtime,calls,permissions,pageCalls,readLibrary,
    denyProvider:()=>{providerPermitted=false;},
    holdProviderCheck:promise=>{permissionWait=promise;},
    disconnect:()=>connection({nativeConnected:false}),
    revoke:(grant={origins:['https://ai.example/*']})=>{for(const listener of [...removals])listener(grant);},
    invalidate:()=>{stored.items[0].answer='15 天内可退款';host.invalidate();},
    disable:()=>{live=false;},dirty:()=>{dirty=true;},
    selectLocal:()=>runtime.updateSettings({source:'local_codex'})};
}
test('fake integration: explicit external-data consent and original Send call stack are required',async t=>{
  const h=setup(t);await h.host.prepare({question:'退款需要多少天？'});
  assert.equal(h.permissions.length,0,'prepare cannot prompt Provider access');
  assert.equal(h.host.snapshot().prepared.references[0].id,id);
  assert.throws(()=>h.host.send({event:trusted}),{code:'E_KB_CONSENT'});
  assert.throws(()=>h.host.send({event:{isTrusted:false},approved:true}),{code:'E_USER_GESTURE'});
  const pending=h.host.send({event:trusted,approved:true});
  assert.equal(h.permissions.length,1,'origin request must start before returning from trusted Send');
  const result=await pending;
  assert.equal(h.calls[0].scope,'knowledge');
  assert.equal(h.calls[0].instructions,KNOWLEDGE_ANSWER_INSTRUCTIONS);
  assert.equal(h.calls[0].context.references[0].answer,'7 天内可退款');
  assert.deepEqual(Object.keys(h.calls[0].context.references[0]).sort(),['answer','id','question','scope']);
  assert.equal(result.status,'REVIEW_REQUIRED');assert.equal(result.needsHuman,true);
  assert.deepEqual(result.sourceIds,[id]);
  assert.equal(JSON.stringify(h.host.snapshot()).includes('test-secret'),false);
});
test('fake integration: aliases and missing facts never send model requests',async t=>{
  const h=setup(t);
  await h.host.prepare({question:'多久可以退款'});
  assert.equal((await h.host.send({event:trusted})).answer,'7 天内可退款');
  await h.host.prepare({question:'飞船位置'});
  assert.equal((await h.host.send({event:trusted})).status,'NO_MATCH');
  assert.equal(h.calls.length,0);assert.equal(h.permissions.length,0);
});
test('fake integration: available local test dependencies stay idle throughout manual question flow',async t=>{
  const h=setup(t,{localTest:true});
  assert.equal(h.host.snapshot().test.mode,'idle');
  await h.host.prepare({question:'多久可以退款'});
  assert.equal((await h.host.send({event:trusted})).status,'ANSWERED_FIXED');
  h.host.clearPrepared();assert.equal(h.host.snapshot().prepared,null);
  await h.host.prepare({question:'退款需要多少天？'});
  assert.equal((await h.host.send({event:trusted,approved:true})).status,'REVIEW_REQUIRED');
  await h.host.cancel();h.invalidate();h.host.dispose();await tick();
  assert.equal(h.calls.length,1);assert.deepEqual(h.pageCalls,[]);
  assert.equal(h.host.snapshot().test.mode,'idle');
});
test('fake integration: install read authority and unsaved knowledge block preparation',async t=>{
  const h=setup(t);h.dirty();await assert.rejects(h.host.prepare({question:'退款'}),{code:'E_KB_UNSAVED'});
  const other=setup(t);other.disable();
  await assert.rejects(other.host.prepare({question:'退款'}),{code:'E_TOOL_CHANGED'});
});
for(const trigger of ['invalidate','revoke','provider','cancel','clearPrepared'])test(`fake integration: ${trigger} drops late answer and requires fresh preparation`,async t=>{
  const wait=deferred(),h=setup(t,{transport:()=>wait.promise});
  await h.host.prepare({question:'退款需要多少天'});
  const pending=h.host.send({event:trusted,approved:true}),rejected=assert.rejects(pending);
  await tick();
  if(trigger==='provider')h.runtime.updateSettings({model:'changed'});
  else if(trigger==='cancel')await h.host.cancel();
  else if(trigger==='clearPrepared')h.host.clearPrepared();else h[trigger]();
  wait.resolve({proposal:{answer:'7天内可退款',sourceIds:[id],needsHuman:false}});
  await rejected;
  assert.equal(h.host.snapshot().result,null);assert.equal(h.host.snapshot().prepared,null);
  assert.throws(()=>h.host.send({event:trusted,approved:true}));
});
test('fake integration: disconnect clears a previously displayed local result',async t=>{
  const h=setup(t);
  // Fixed answer does not need a model. It still becomes stale on local disconnect.
  h.selectLocal();await h.host.prepare({question:'多久可以退款'});
  await h.host.send({event:trusted});assert.ok(h.host.snapshot().result);
  h.disconnect();assert.equal(h.host.snapshot().result,null);
});
test('fake integration: only the current Provider permission invalidates prepared/displayed knowledge',async t=>{
  const h=setup(t);await h.host.prepare({question:'退款需要多少天'});
  await h.host.send({event:trusted,approved:true});
  h.revoke({origins:['https://unrelated.example/*']});
  assert.ok(h.host.snapshot().result);assert.ok(h.host.snapshot().prepared);
  h.revoke();assert.equal(h.host.snapshot().result,null);assert.equal(h.host.snapshot().prepared,null);
});


const approvalInput={event:trusted,origin:'http://127.0.0.1:43111',
  documentId:'document-first-party',etag:'a'.repeat(64)};
test('trusted knowledge approval binds exact nonce, origin, document, ETag and consumer instance',async t=>{
  const a=setup(t),b=setup(t);
  for(const patch of [{event:{isTrusted:false}},{origin:'http://localhost:43111'},
    {origin:'https://example.com'},{documentId:''},{etag:'invalid'}])
    assert.throws(()=>a.conversation.beginKnowledgeTestApproval({...approvalInput,...patch}),{code:'E_KB_TEST_CONSENT'});
  assert.equal(a.permissions.length,0);
  const pending=a.conversation.beginKnowledgeTestApproval(approvalInput);
  assert.equal(a.permissions.length,1,'permission starts inside the real approval click');
  const grant=await pending;
  assert.equal(grant.documentId,'document-first-party');
  const send=(conversation,approvedKnowledgeTest=grant,knowledgeEtag=approvalInput.etag)=>
    conversation.request({request:'question',approvedKnowledgeTest,knowledgeEtag});
  await assert.rejects(send(a.conversation,{...grant}),{code:'E_USER_GESTURE'});
  await assert.rejects(send(b.conversation),{code:'E_USER_GESTURE'});
  await assert.rejects(send(a.conversation,grant,'b'.repeat(64)),{code:'E_MODEL_GRANT_REVOKED'});
  assert.equal(a.calls.length,0);
  const result=await send(a.conversation);
  assert.equal(a.permissions.length,1,'approved inference only checks existing permission');
  assert.equal(a.calls[0].instructions,KNOWLEDGE_ANSWER_INSTRUCTIONS);
  a.conversation.revokeKnowledgeTest();
  await assert.rejects(result.authorization.assertWrite(),{code:'E_MODEL_GRANT_REVOKED'});
  result.authorization.release();
  await assert.rejects(send(a.conversation),{code:'E_USER_GESTURE'});
});

for(const change of ['expiry','provider','revoke'])test('approved knowledge '+change+' rejects late inference and retained authorization',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const held=deferred(),h=setup(t,{transport:()=>held.promise});
  const grant=await h.conversation.beginKnowledgeTestApproval(approvalInput);
  const pending=h.conversation.request({request:'question',approvedKnowledgeTest:grant,knowledgeEtag:grant.etag});
  const rejected=assert.rejects(pending,error=>['E_MODEL_GRANT_REVOKED','E_TOOL_CHANGED'].includes(error.code));
  await tick();
  if(change==='expiry')now=grant.expiresAt+1;
  if(change==='provider')h.runtime.updateSettings({model:'changed'});
  if(change==='revoke')h.revoke();
  held.resolve({proposal:{answer:'late'}});await rejected;
});

test('approved knowledge authorization rechecks expiry after delivery on every write assertion',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const h=setup(t),grant=await h.conversation.beginKnowledgeTestApproval(approvalInput);
  const result=await h.conversation.request({request:'question',approvedKnowledgeTest:grant,knowledgeEtag:grant.etag});
  await result.authorization.assertWrite();now=grant.expiresAt+1;
  await assert.rejects(result.authorization.assertWrite(),{code:'E_MODEL_GRANT_REVOKED'});
  result.authorization.release();
});


test('knowledge approval cannot bypass current Provider permissions',async t=>{
  const h=setup(t),grant=await h.conversation.beginKnowledgeTestApproval(approvalInput);
  h.denyProvider();
  await assert.rejects(h.conversation.request({request:'question',approvedKnowledgeTest:grant,
    knowledgeEtag:grant.etag}),error=>['E_AI_PERMISSION','E_MODEL_GRANT_REVOKED'].includes(error.code));
  assert.equal(h.calls.length,0);
});

test('project knowledge revoke promptly aborts an approved unresolved inference with grant semantics',async t=>{
  const held=deferred(),h=setup(t,{transport:()=>held.promise});
  const grant=await h.conversation.beginKnowledgeTestApproval(approvalInput);
  const pending=h.conversation.request({request:'question',approvedKnowledgeTest:grant,knowledgeEtag:grant.etag});
  const rejected=assert.rejects(pending,{code:'E_MODEL_GRANT_REVOKED'});
  await tick();h.conversation.revokeKnowledgeTest();
  await rejected;
  assert.equal(h.calls[0].signal.aborted,true);
  held.resolve({proposal:{answer:'late'}});
});


test('approved authorization expires while a current permission assertion is pending',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const h=setup(t),grant=await h.conversation.beginKnowledgeTestApproval(approvalInput);
  const result=await h.conversation.request({request:'question',approvedKnowledgeTest:grant,knowledgeEtag:grant.etag});
  const held=deferred();h.holdProviderCheck(held.promise);
  const pending=result.authorization.assertWrite();
  const rejected=assert.rejects(pending,{code:'E_MODEL_GRANT_REVOKED'});
  now=grant.expiresAt+1;held.resolve(true);await rejected;
  result.authorization.release();
});


test('approved project request preserves conditional cancellation by the original parent signal',async t=>{
  const held=deferred(),h=setup(t,{transport:()=>held.promise});
  const grant=await h.conversation.beginKnowledgeTestApproval(approvalInput);
  const parent=new AbortController();
  const pending=h.conversation.request({request:'question',approvedKnowledgeTest:grant,
    knowledgeEtag:grant.etag,signal:parent.signal});
  const outcome=pending.then(value=>({value}),error=>({error}));
  await tick();await h.conversation.cancel({signal:parent.signal});
  const aborted=h.calls[0].signal.aborted;
  held.resolve({proposal:{answer:'late'}});
  const result=await outcome;
  result.value?.authorization.release();
  assert.equal(aborted,true,'conditional Stop must match the original caller signal');
  assert.equal(result.error?.code,'E_CANCELLED');
});
