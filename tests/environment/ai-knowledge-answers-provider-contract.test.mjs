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
  assert.throws(()=>createKnowledgeAnswerConsumer({model,conversation:{request(){},cancel(){}},readLibrary(){}}),/可信/);
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
  assert.equal(released,1);assert.equal(asserted,1);
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
  assert.match(KNOWLEDGE_ANSWER_INSTRUCTIONS,/未经信任的数据/);
  assert.match(KNOWLEDGE_ANSWER_INSTRUCTIONS,/禁止伪造引用/);
  assert.match(KNOWLEDGE_ANSWER_INSTRUCTIONS,/不可自动发送/);
});
