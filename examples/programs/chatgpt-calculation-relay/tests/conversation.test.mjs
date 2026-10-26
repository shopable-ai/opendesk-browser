import test from 'node:test';
import assert from 'node:assert/strict';
import {createConversationSession} from '../src/conversation.js';

// Deliberately non-calculation, non-JSON text: exercises the reusable module.
function fixture({stored, raw='  Arbitrary reply\n原文  ', rejectSave=false} = {}) {
  let step=stored ?? {state:'queued'}, draft='', messages=[], documentId='doc-1', route=null;
  const actions=[], writes=[];
  const read=async () => ({documentId, route, url:'https://chatgpt.com/' + (route ?? ''),
    messages:structuredClone(messages), draft, rich:false, idle:true, busy:false, sendReady:true});
  const site={
    bind:async () => documentId,
    newConversation:async () => {documentId='doc-2'; return documentId;},
    read,
    fill:async value => {
      assert.equal(step.state,'sending'); assert.equal(step.clickIntent,false);
      actions.push('fill'); draft=value.prompt;
    },
    send:async value => {
      assert.equal(step.clickIntent,true); actions.push('click');
      route='c/unique-conversation';
      messages=[{key:'user:unique',role:'user',text:value.prompt},
        {key:'assistant:unique',role:'assistant',text:raw,complete:true,streaming:false}];
      draft='';
    }
  };
  const session=createConversationSession({site, assertOwner:async () => {}, assertBudget:() => {},
    now:() => 123, limits:{send:5,reply:5}, wait:async (_timeout, check) => {
      for (let n=0;n<5;n++) {const result=await check(); if (result) return result;}
      throw new Error('test wait timeout');
    }});
  return {session,actions,writes, read, exchange:async (reconcile=false) => session.exchange({
    snapshot:await read(), prompt:'Summarize this topic.', nonce:'unique-nonce', reconcile,
    getStep:() => step, saveStep:async value => {
      if (rejectSave) throw new Error('E_RELAY_READBACK');
      step=structuredClone(value); writes.push(step.state);
    }})};
}

test('conversation exchange returns exact arbitrary raw reply and official identity, without JSON parsing', async () => {
  const h=fixture(), result=await h.exchange();
  assert.equal(result.raw,'  Arbitrary reply\n原文  ');
  assert.equal(result.conversation,'c/unique-conversation');
  assert.equal(result.documentId,'doc-1');
  assert.equal(result.userMessageId,'user:unique');
  assert.equal(result.assistantMessageId,'assistant:unique');
  assert.deepEqual(h.actions,['fill','click']);
  assert.deepEqual(h.writes,['sending','sending','sent','waiting_reply']);
  assert.equal(await h.session.bind(),'doc-1');
  assert.equal(await h.session.newConversation(500),'doc-2');
  assert.equal(await h.session.bind(),'doc-2');
});

test('generic conversation refuses reuse of an existing click or uncertain step', async () => {
  for (const state of ['sending','sent','waiting_reply','unknown','completed']) {
    const h=fixture({stored:{state,clickIntent:true}});
    await assert.rejects(h.exchange(),/E_RELAY_RECONCILE/);
    assert.deepEqual(h.actions,[]); assert.deepEqual(h.writes,[]);
  }
});

test('generic conversation write-ahead readback failure prevents even filling', async () => {
  const h=fixture({rejectSave:true});
  await assert.rejects(h.exchange(),/E_RELAY_READBACK/);
  assert.deepEqual(h.actions,[]);
});
