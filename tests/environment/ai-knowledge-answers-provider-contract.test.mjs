import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {createKnowledgeAnswerConsumer,KNOWLEDGE_ANSWER_INSTRUCTIONS}
  from '../../examples/sidebar-tools/ai-knowledge-answers/trusted/ai-request.js';

const modelSource=readFileSync(new URL('../../examples/sidebar-tools/ai-knowledge-answers/src/model.js',import.meta.url),'utf8');
const sandbox={TextEncoder,crypto:{randomUUID}};
runInNewContext(modelSource,sandbox);
const model=sandbox.OpenDeskKnowledgeAnswersModel;
const kb=model.save(model.empty(),{
  id:'qa_sampleabc123',question:'退款期限是多少',aliases:['多久可以退款'],
  answer:'7 天内可以退款',scope:'',enabled:true
});
const etagA='a'.repeat(64),etagB='b'.repeat(64);

test('trusted RAG consumer must be bound to an identity checker',()=>{
  assert.throws(()=>createKnowledgeAnswerConsumer({model,conversation:{request(){},cancel(){}},readLibrary(){}}),/真实 Host/);
});

test('trusted RAG consumer must reject untrusted event and missing verified storage',async()=>{
  const calls=[],provider={
    request:args=>{calls.push(args);return Promise.resolve({});},
    cancel:async()=>{}
  };
  const consumer=createKnowledgeAnswerConsumer({
    model,conversation:provider,assertIdentity:()=>{},readLibrary:async()=>({value:kb,etag:etagA})
  });
  assert.throws(()=>consumer.request({request:'退款需要多少天',event:{isTrusted:false}}),/可信/);
  assert.throws(()=>consumer.request({request:'退款需要多少天',event:{isTrusted:true}}),/先从可信/);
  assert.equal(calls.length,0);
  await consumer.refresh();
  const fixed=await consumer.request({request:'多久可以退款',event:{isTrusted:true}});
  assert.equal(fixed.status,'ANSWERED_FIXED');assert.equal(fixed.modelCalled,false);
  assert.equal(calls.length,0);
  consumer.dispose();
});

test('provider request starts synchronously with original trusted event; response is a reviewed draft (fake Provider contract only)',async()=>{
  const event={isTrusted:true},calls=[];let released=0,asserted=0;
  const consumer=createKnowledgeAnswerConsumer({
    model,assertIdentity:()=>{},
    conversation:{
      request:args=>{
        calls.push(args);
        return Promise.resolve({
          proposal:{answer:'7 天内可以退款',sourceIds:[kb.items[0].id],needsHuman:false},
          authorization:{assertWrite:async()=>{asserted++;},release:()=>released++}
        });
      },
      cancel:async()=>{}
    },
    readLibrary:async()=>({value:kb,etag:etagA})
  });
  await consumer.refresh();
  const pending=consumer.request({request:'退款需要多少天',event});
  assert.equal(calls.length,1);
  assert.strictEqual(calls[0].event,event);
  assert.equal(calls[0].scope,'knowledge');
  assert.deepEqual(Array.from(calls[0].context.references,row=>row.id),[kb.items[0].id]);
  const result=await pending;
  assert.equal(result.modelCalled,true);
  assert.equal(result.status,'REVIEW_REQUIRED');
  assert.equal(result.needsHuman,true);
  assert.equal(released,1);assert.equal(asserted,2);
  consumer.dispose();
});

test('stale ETag after inference must discard the old answer and release grant',async()=>{
  let changed=false,released=0;
  const consumer=createKnowledgeAnswerConsumer({
    model,assertIdentity:()=>{},
    conversation:{
      request:()=>{changed=true;return Promise.resolve({
        proposal:{answer:'7 天内可以退款',sourceIds:[kb.items[0].id],needsHuman:false},
        authorization:{assertWrite:async()=>{},release:()=>released++}
      });},
      cancel:async()=>{}
    },
    readLibrary:async()=>({value:kb,etag:changed?etagB:etagA})
  });
  await consumer.refresh();
  await assert.rejects(consumer.request({request:'退款需要多少天',event:{isTrusted:true}}),
    error=>error.code==='E_KB_STALE');
  assert.equal(released,1);
  consumer.dispose();
});

test('reference payload must be bounded and untrusted KB instructions cannot override system policy',()=>{
  assert.equal(KNOWLEDGE_ANSWER_INSTRUCTIONS.split('\n').length,7);
  assert.equal(KNOWLEDGE_ANSWER_INSTRUCTIONS.includes('\\n'),false);
  assert.match(KNOWLEDGE_ANSWER_INSTRUCTIONS,/未经信任的数据/);
  assert.match(KNOWLEDGE_ANSWER_INSTRUCTIONS,/禁止伪造引用/);
  assert.match(KNOWLEDGE_ANSWER_INSTRUCTIONS,/不可自动发送/);
});

test('fake Provider: evidence metadata copies identifiers only, without grants or keys',async()=>{
  for(const sample of [
    {provider:'local_codex',metadata:{provider:'ignored',threadId:'thread-fake',sessionId:'session-fake',turnId:'turn-fake'},
      expected:{provider:'local_codex',threadId:'thread-fake',sessionId:'session-fake',turnId:'turn-fake'}},
    {metadata:{provider:'custom_https',threadId:null,sessionId:{key:'FAKE_SECRET'},turnId:'bad\nidentifier'},
      expected:{provider:'custom_https'}},
    {metadata:{provider:'',threadId:'x'.repeat(257),sessionId:42,turnId:['FAKE_SECRET']},expected:{}},
    {expected:{}}
  ]){
    let released=0;
    const metadata={...sample.metadata,apiKey:'FAKE_SECRET',key:'FAKE_SECRET',
      authorization:{key:'FAKE_SECRET'},headers:{Authorization:'Bearer FAKE_SECRET'},
      grant:{key:'FAKE_SECRET'},lease:'FAKE_SECRET'};
    const consumer=createKnowledgeAnswerConsumer({model,assertIdentity:()=>{},
      readLibrary:async()=>({value:kb,etag:etagA}),
      conversation:{cancel:async()=>{},request:()=>Promise.resolve({
        provider:sample.provider,metadata,key:'FAKE_SECRET',
        proposal:{answer:'7 天内可以退款',sourceIds:[kb.items[0].id],needsHuman:false},
        authorization:{assertWrite:async()=>{},release:()=>{released++;}}
      })}
    });
    await consumer.refresh();
    const result=await consumer.request({request:'退款需要多少天',event:{isTrusted:true}});
    assert.deepEqual(result.metadata,sample.expected);
    assert.notStrictEqual(result.metadata,metadata);
    assert.equal(Object.hasOwn(result,'authorization'),false);
    assert.equal(JSON.stringify(result).includes('FAKE_SECRET'),false);
    assert.equal(released,1);
  }
});

// All lifecycle scenarios below use fake Provider/Host objects, never native inference.
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function fakeConsumer({answerWithAI=model.answerWithAI,onRead=()=>{},onAssert=()=>{}}={}){
  let etag=etagA,reads=0,assertions=0,released=0,cancelled=0,identity=true,providerChanged=false;
  const reply=deferred(),grantController=new AbortController(),calls=[];
  const authorization={signal:grantController.signal,
    assertWrite:async()=>{await onAssert(++assertions);
      if(providerChanged)throw Object.assign(new Error('fake Provider changed'),{code:'E_TOOL_CHANGED'});
      if(grantController.signal.aborted)
      throw Object.assign(new Error('fake grant revoked'),{code:'E_MODEL_GRANT_REVOKED'});},
    release:()=>{released++;}};
  const consumer=createKnowledgeAnswerConsumer({
    model:{...model,answerWithAI},
    conversation:{request:args=>{calls.push(args);return reply.promise;},
      cancel:async()=>{cancelled++;}},
    assertIdentity:check=>{
      if(!identity)throw Object.assign(new Error('fake disconnected identity'),{code:'E_TOOL_CHANGED'});
      if(check?.etag&&check.etag!==etag)
        throw Object.assign(new Error('fake Host ETag changed'),{code:'E_KB_STALE'});
    },
    readLibrary:async()=>{const value={value:kb,etag};await onRead(++reads);return value;}
  });
  return {consumer,calls,grantController,
    changeKnowledge:()=>{etag=etagB;},disconnect:()=>{identity=false;},switchProvider:()=>{providerChanged=true;},
    resolve:()=>reply.resolve({proposal:{answer:'7 天内可以退款',sourceIds:[kb.items[0].id],needsHuman:false},authorization}),
    counts:()=>({released,cancelled})};
}

for(const action of ['invalidate','cancel','dispose','abort']){
  test(`fake Provider: ${action} aborts the in-flight signal and rejects a late reply`,async()=>{
    const fake=fakeConsumer(),external=new AbortController();
    await fake.consumer.refresh();
    const pending=fake.consumer.request({request:'退款需要多少天',event:{isTrusted:true},signal:external.signal});
    const rejected=assert.rejects(pending,error=>['E_CANCELLED','E_TOOL_CHANGED'].includes(error.code));
    if(action==='abort')external.abort();else await fake.consumer[action]();
    assert.equal(fake.calls[0].signal.aborted,true);
    fake.resolve();await rejected;
    assert.equal(fake.counts().released,1);
    if(action!=='abort')assert.equal(fake.counts().cancelled,1);
  });
}

for(const action of ['knowledge','invalidate','cancel','disconnect','provider-switch','revocation']){
  test(`fake Provider: ${action} during async answer processing prevents delivery`,async()=>{
    const entered=deferred(),resume=deferred();
    const fake=fakeConsumer({answerWithAI:async(...args)=>{
      const answer=await model.answerWithAI(...args);entered.resolve();await resume.promise;return answer;
    }});
    await fake.consumer.refresh();
    const pending=fake.consumer.request({request:'退款需要多少天',event:{isTrusted:true}});
    const rejected=assert.rejects(pending,error=>
      ['E_KB_STALE','E_CANCELLED','E_TOOL_CHANGED','E_MODEL_GRANT_REVOKED'].includes(error.code));
    fake.resolve();await entered.promise;
    if(action==='knowledge')fake.changeKnowledge();
    else if(action==='disconnect')fake.disconnect();
    else if(action==='provider-switch')fake.switchProvider();
    else if(action==='revocation')fake.grantController.abort();
    else await fake.consumer[action]();
    resume.resolve();await rejected;
    assert.equal(fake.counts().released,1);
  });
}

for(const window of ['final-read','final-grant']){
  for(const action of ['knowledge','revocation']){
    test(`fake Provider: ${action} in ${window} async window cannot deliver`,async()=>{
      const entered=deferred(),resume=deferred();
      const pause=async()=>{entered.resolve();await resume.promise;};
      const fake=fakeConsumer({
        onRead:count=>window==='final-read'&&count===3?pause():undefined,
        onAssert:count=>window==='final-grant'&&count===2?pause():undefined
      });
      await fake.consumer.refresh();
      const pending=fake.consumer.request({request:'退款需要多少天',event:{isTrusted:true}});
      const rejected=assert.rejects(pending,error=>
        ['E_KB_STALE','E_CANCELLED','E_MODEL_GRANT_REVOKED'].includes(error.code));
      fake.resolve();await entered.promise;
      if(action==='knowledge')fake.changeKnowledge();else fake.grantController.abort();
      resume.resolve();await rejected;
      assert.equal(fake.counts().released,1);
    });
  }
}

test('fake Host: invalidation during preload cannot re-arm stale storage',async()=>{
  const entered=deferred(),resume=deferred();
  const fake=fakeConsumer({onRead:async()=>{entered.resolve();await resume.promise;}});
  const loading=fake.consumer.refresh();
  const rejected=assert.rejects(loading,{code:'E_KB_STALE'});
  await entered.promise;fake.consumer.invalidate();resume.resolve();await rejected;
  assert.throws(()=>fake.consumer.request({request:'退款需要多少天',event:{isTrusted:true}}),{code:'E_KB_NOT_READY'});
  assert.equal(fake.calls.length,0);
});

test('fake Host: preloaded snapshot is deeply frozen before synchronous Send',async()=>{
  let inspected=false;
  const consumer=createKnowledgeAnswerConsumer({
    model:{...model,lookup:(library,ask)=>{
      inspected=true;
      for(const value of [library,library.items,library.items[0],library.items[0].aliases])
        assert.equal(Object.isFrozen(value),true);
      return model.lookup(library,ask);
    }},
    conversation:{request:()=>{throw new Error('fake Send reached synchronously');},cancel:async()=>{}},
    assertIdentity:()=>{},readLibrary:async()=>({value:kb,etag:etagA})
  });
  await consumer.refresh();
  assert.throws(()=>consumer.request({request:'退款需要多少天',event:{isTrusted:true}}),/fake Send reached synchronously/);
  assert.equal(inspected,true);
});

test('fake Provider: pre-aborted Send never starts inference and synchronous failure permits retry',async()=>{
  const fake=fakeConsumer(),aborted=new AbortController();aborted.abort();
  await fake.consumer.refresh();
  assert.throws(()=>fake.consumer.request({request:'退款需要多少天',event:{isTrusted:true},signal:aborted.signal}),{code:'E_CANCELLED'});
  assert.equal(fake.calls.length,0);
  let attempts=0;
  const consumer=createKnowledgeAnswerConsumer({model,assertIdentity:()=>{},
    readLibrary:async()=>({value:kb,etag:etagA}),
    conversation:{request:()=>{attempts++;throw new Error('fake synchronous failure');},cancel:async()=>{}}
  });
  await consumer.refresh();
  for(let i=0;i<2;i++)assert.throws(()=>consumer.request({request:'退款需要多少天',event:{isTrusted:true}}),/fake synchronous failure/);
  assert.equal(attempts,2);
});
