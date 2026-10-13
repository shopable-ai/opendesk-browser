import test from 'node:test';
import assert from 'node:assert/strict';
import {taskReviewHandoffKey,createTaskReviewHandoff,validateTaskReviewHandoff,matchTaskReviewHandoff}
  from '../../src/ui/workflow/task-review-handoff.js';

const now=Date.parse('2026-10-13T07:30:00Z');
const sourceHash='a'.repeat(64),manifestHash='b'.repeat(64);
const catalog=[{taskId:'wf-a01b2345',version:'1.0.1',manifestHash,
  stage:'candidate',manifest:{siteOrigins:['https://example.test'],
    program:{sourceHash},permissions:['page.automation']}}];
const create=rest=>createTaskReviewHandoff({windowId:7,taskId:'wf-a01b2345',version:'1.0.1',
  sourceHash,manifestHash,siteOrigin:'https://example.test',runId:'run-trusted-01',
  issuedAt:now,...rest});

test('handoff is a short-lived one-time candidate identity hint, never an installation receipt',()=>{
  const hint=create();
  assert.equal(taskReviewHandoffKey(7),'opendesk.workflow.task-review-handoff.v1:7');
  assert.equal(taskReviewHandoffKey(-1),null);
  assert.ok(validateTaskReviewHandoff(hint,7,now));
  assert.deepEqual(matchTaskReviewHandoff(hint,7,catalog,now),
    {candidateKey:'wf-a01b2345@1.0.1',runId:'run-trusted-01'});
  assert.ok(!('stage' in hint)&&!('approved' in hint)&&!('permissions' in hint));
  assert.equal(Object.isFrozen(hint),true);
});

test('one window cannot select a different window candidate and expires after 120 seconds',()=>{
  const hint=create();
  assert.equal(matchTaskReviewHandoff(hint,8,catalog,now),null);
  assert.equal(matchTaskReviewHandoff(hint,7,catalog,now+120001),null);
  assert.equal(matchTaskReviewHandoff(hint,7,catalog,now-1),null);
  assert.ok(matchTaskReviewHandoff(hint,7,catalog,now+120000));
});

test('altered source, manifest, site and candidate selection fail closed',()=>{
  const hint=create();
  for(const changed of [
    [{...catalog[0],manifestHash:'c'.repeat(64)}],
    [{...catalog[0],version:'1.0.2'}],
    [{...catalog[0],manifest:{...catalog[0].manifest,siteOrigins:['https://other.test']}}],
    [{...catalog[0],manifest:{...catalog[0].manifest,program:{sourceHash:'d'.repeat(64)}}}],
    [],[catalog[0],catalog[0]]
  ])assert.equal(matchTaskReviewHandoff(hint,7,changed,now),null);
});

test('untrusted or oversized handoff data cannot force verification or broaden permissions',()=>{
  const hint=create();
  for(const malicious of [
    {...hint,stage:'Installed'},
    {...hint,runId:'run-trusted-01;alert(1)'},
    {...hint,manifestHash:'not-a-hash'},
    {...hint,siteOrigin:'https://example.test.attacker.com'},
    {...hint,issuedAt:now+1},
    {...hint,runId:'x'.repeat(200)},
    {...hint,windowId:9},
    {...hint,taskId:'../other'}
  ])assert.equal(matchTaskReviewHandoff(malicious,7,catalog,now),null);
  assert.throws(()=>create({siteOrigin:'*://*/*'}),/Invalid Workflow Task review/);
});

test('a candidate without a trusted successful run preselects only; still requires explicit original Verify and Install clicks',()=>{
  const hint=create({runId:null});
  assert.deepEqual(matchTaskReviewHandoff(hint,7,catalog,now),
    {candidateKey:'wf-a01b2345@1.0.1',runId:null});
  const row=matchTaskReviewHandoff(hint,7,catalog,now);
  assert.ok(!('verified' in row)&&!('installed' in row));
});
