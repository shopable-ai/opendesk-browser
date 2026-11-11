// RunHost must never drop the trusted Controller's optional retained source
// before the original atomic run-admission transaction. This is not a Chrome test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunHost} from '../../../src/run-host.js';

const sha='a'.repeat(64);
function harness(){
  const accepted=[];
  const client={ready:Promise.resolve(),runCommands:{},
    controller:{async startControllerRun(input){
      accepted.push(input);
      throw Object.assign(new Error('admission captured'),{code:'E_TEST_ADMISSION'});
    }}};
  const host=createRunHost({api:{},client,document:null,clock:{now:()=>5000}});
  const base={source:{kind:'saved',scriptId:'task:example.task:0.3.0',revision:1,contentHash:sha},
    params:{prompt:'approved prompt',send:true},requestId:'request-submit',deadlineAt:25000,
    expectedTaskGeneration:2,expectedTaskInstallationId:'install-01',
    target:{mode:'borrowed',tabId:47,frameId:0,documentId:'original-draft',
      expectedUrl:'https://chatgpt.com/'}};
  return {host,accepted,base};
}
test('RunHost forwards exact original retained identity without rewriting target or params',async()=>{
  const f=harness(),retainedFrom={runId:'prepared-run',requestId:'request-prepared'};
  await assert.rejects(f.host.start({...f.base,retainedFrom}),{code:'E_TEST_ADMISSION'});
  assert.equal(f.accepted.length,1);
  const sent=f.accepted[0];
  assert.deepEqual(sent.retainedFrom,retainedFrom);
  assert.deepEqual(sent.target,f.base.target);
  assert.equal(sent.requestId,'request-submit');
  assert.equal(sent.expectedTaskInstallationId,'install-01');
  assert.equal(sent.expectedTaskGeneration,2);
  assert.notStrictEqual(sent.retainedFrom,retainedFrom);
  assert.notStrictEqual(sent.target,f.base.target);
  await f.host.dispose();
});
test('RunHost leaves old non-continuation admissions unchanged',async()=>{
  const f=harness();delete f.base.retainedFrom;
  await assert.rejects(f.host.start(f.base),{code:'E_TEST_ADMISSION'});
  assert.equal(f.accepted.length,1);
  assert.equal(Object.hasOwn(f.accepted[0],'retainedFrom'),false);
  await f.host.dispose();
});
