import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createTrustedKnowledgeHost} from '../../projects/ai-knowledge-answers/trusted/host.js';
import {createSharedAIProviderRuntime} from '../../src/ui/ai/provider-runtime.js';
import {createBusinessConversation} from '../../src/ui/conversation/provider-consumer.js';
import {KNOWLEDGE_ANSWER_INSTRUCTIONS} from '../../projects/ai-knowledge-answers/trusted/ai-request.js';

// Integration uses the actual shared runtime/consumer; model transport is fake.
const trusted={isTrusted:true},id='qa_test_refund01';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function setup(t,{transport,localTest=false}={}){
  let stored={version:1,items:[{id,question:'退款期限是多少',aliases:['多久可以退款'],
    answer:'7 天内可退款',scope:'',enabled:true}]},live=true,dirty=false;
  let connection;const removals=new Set(),calls=[],permissions=[],pageCalls=[];
  const runtime=createSharedAIProviderRuntime({hostInstanceId:'host-test',
    client:{requestWorkflowAI:async()=>assert.fail('fake HTTPS test must not call Native')},
    facadeFactory:()=>({generateStructured:async args=>{
      calls.push(args);return transport?transport(args):{proposal:{
        answer:'7天内可退款',sourceIds:[id],needsHuman:false},metadata:{provider:'custom_https'}};
    }})});
  runtime.updateSettings({source:'custom_https',endpoint:'https://ai.example/v1/chat/completions',
    model:'fixture',apiKey:'test-secret'});
  const conversation=createBusinessConversation({providerRuntime:runtime,
    hostInstanceId:'host-test',consumerId:'knowledge',instanceId:'instance-test',installEpoch:'install-test',
    api:{permissions:{request:args=>{permissions.push(args);return Promise.resolve(true);},contains:async()=>true,
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
  return {host,runtime,calls,permissions,pageCalls,readLibrary,
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
