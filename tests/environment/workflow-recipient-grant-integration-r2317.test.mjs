// Controller integration, with test RunHost and HTTPS transport, not a live webpage.
// Uses real WorkflowView, provider, compiler and grant storage; preserves full
// Chromium / Native delivery gates for separate product-level verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowFixture,tick} from './workflow-react-fixture.mjs';

const grantKey='opendesk.sidebar.workflow-draft.v1:7:observation';
const endpoint='https://api.example.test/v1/chat/completions';
const receiverPattern='https://api.example.test/*';
const state=(fixture,id)=>fixture.state().controls[id]||{};

async function ready(fixture) {
  fixture.click('workflow-source-https');
  fixture.input('workflow-ai-endpoint',endpoint);
  fixture.input('workflow-ai-key','TEST_SESSION_ONLY_CREDENTIAL');
  fixture.input('workflow-ai-model','test-model');
  await tick();await tick();
  assert.equal(state(fixture,'workflow-ai-provider').value,'custom_https');
}

test('R23.17 Controller: first HTTPS disclosure, repeat without dialog, revoke then reauthorize',async t=>{
  const priorFetch=globalThis.fetch;
  const posts=[];
  globalThis.fetch=async (url,options)=>{
    posts.push({url,options});
    const proposal={title:'页面内容观察',description:'',
      paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false},
      steps:[{stepId:'observe-1',op:'observe'}]};
    return {ok:true,text:async()=>JSON.stringify({choices:[{
      message:{content:JSON.stringify(proposal)}
    }]})};
  };
  t.after(()=>{globalThis.fetch=priorFetch;});
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  await ready(f);
  f.input('workflow-ai-request','读取本页结构，然后说明。不要修改网页。');
  const first=f.click('workflow-ai-plan');
  await tick();await tick();
  assert.equal(state(f,'workflow-ai-approval').hidden,false,'first external disclosure must be explicit');
  assert.equal(f.starts.length,0,'model and RunHost may not observe before disclosure');
  await f.click('workflow-ai-approve');await first;await tick();await tick();
  assert.equal(state(f,'workflow-ai-approval').hidden,true);
  assert.equal(posts.length,1,'model receives the authorized observation exactly once');
  assert.equal(f.starts.length,2,'Send automatically dispatches once after independently authorized read-only observation');
  assert.equal(state(f,'workflow-run-review').hidden,true,'safe steps need no extra execution review');
  await f.click('workflow-run-review-confirm',false);
  await f.click('workflow-run-review-confirm');
  assert.equal(f.starts.length,2,'no pending review means no repeat dispatch, trusted or untrusted');
  assert.equal(f.session.get(grantKey)?.provider,'custom_https');
  assert.equal(f.session.get(grantKey)?.receiverPattern,receiverPattern);
  assert.ok(f.session.get(grantKey)?.recipientId.startsWith('custom_https:'));
  assert.doesNotMatch(JSON.stringify([...f.session]),/TEST_SESSION_ONLY_CREDENTIAL|\/v1\/chat\/completions/);

  f.input('workflow-ai-request','再次读取本页结构，核对现状，不要提交。');
  const second=f.click('workflow-ai-plan');
  await tick();await tick();
  assert.equal(state(f,'workflow-ai-approval').hidden,true,'same scope must reuse the data disclosure');
  await second;await tick();await tick();
  assert.equal(posts.length,2,'second user-requested turn still uses a fresh observation');
  assert.equal(f.starts.length,4,'second user Send independently observes and auto-executes once without review');
  assert.equal(state(f,'workflow-run-review').hidden,true);
  assert.ok(f.starts[2].source.sourceUtf8.includes('await page.observe('));
  assert.equal(f.requests.length,2,'granted origins require only the two trusted Send gestures, not an extra Run permission request');
  assert.ok(f.starts.every(call=>call.target.documentId==='document-one'));

  await f.revoke([receiverPattern]);
  await tick();
  assert.equal(f.session.get(grantKey),null,'revocation destroys the previous disclosure scope');
  f.input('workflow-ai-request','第三次读取当前网页，不修改任何输入。');
  const third=f.click('workflow-ai-plan');
  await tick();await tick();
  assert.equal(state(f,'workflow-ai-approval').hidden,false,'receiver revocation must require new disclosure');
  assert.equal(posts.length,2,'the provider must not receive unapproved page data');
  await f.click('workflow-ai-deny');await third;
  assert.equal(posts.length,2);
  assert.equal(f.starts.length,4,'denying a new disclosure never dispatches RunHost');
});

test('R23.17 Controller: read-only manual Run does not request second OpenDesk confirmation',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  assert.equal(state(f,'workflow-run-review').hidden,true);
  const done=await f.click('workflow-run');
  assert.equal(done.ok,true);
  assert.equal(f.starts.length,1);
  assert.equal(state(f,'workflow-run-review').hidden,true);
  assert.equal(f.requests.length,1);
});

test('R23.17 fixture: ordinary manually authored observe is not the privileged internal AI observation',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  const run=await f.click('workflow-run');await tick();
  assert.equal(run.ok,true);
  assert.equal(f.starts.length,1);
  assert.match(state(f,'workflow-output').text,/执行结果/);
  assert.doesNotMatch(state(f,'workflow-output').text,/semantic-dom-summary/);
});
