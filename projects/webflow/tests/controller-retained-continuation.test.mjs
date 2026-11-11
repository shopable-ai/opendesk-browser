import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRetainedControllerContinuation,retainedContinuationKey}
  from '../../../src/platform/host/controller-retained-continuation.js';

const origin='https://example.com',url=origin+'/',hash='a'.repeat(64),manifestHash='b'.repeat(64);
const taskId='example.task',version='0.1.0',scriptId=`task:${taskId}:${version}`;
function fixture(){
  return {
    previous:{
      tag:'controller-run',runId:'run-prepared',requestId:'request-prepared',sourceKind:'saved',runRevision:4,
      namespace:'tool:test-extension',principal:'principal-a',browserSessionIncarnation:'session-a',
      scriptId,contentHash:hash,revision:{scriptId,sourceHash:hash,revision:1},
      installedTaskAuthorization:{taskId,version,manifestHash,
        authorization:{installationId:'install-a',generation:3}},
      targetDisposition:'retain-on-success',selection:{mode:'owned',url},
      target:{mode:'owned',tabId:91,frameId:0,documentId:'document-b',
        browserSessionIncarnation:'session-a',allowedOrigin:origin},
      retainedTarget:{tabId:91,documentId:'document-b',url,origin},
      state:'completed',retirementState:'released',workerRetired:true,retirementId:'retire-a'
    },
    retainedFrom:{runId:'run-prepared',requestId:'request-prepared'},
    selection:{mode:'borrowed',tabId:91,frameId:0,documentId:'document-b',expectedUrl:url},
    observed:{tabId:91,frameId:0,documentId:'document-b',url,allowedOrigin:origin},
    installedTask:{installation:{taskId,version,manifestHash,authorization:{
      installationId:'install-a',generation:3}},
      candidate:{package:{manifest:{program:{revision:1}}}}},
    current:{scriptId,contentHash:hash},
    host:{namespace:'tool:test-extension',principal:'principal-a'},session:'session-a'
  };
}
test('a completed reviewed retained target can be precisely and safely borrowed',()=>{
  const f=fixture();
  assert.deepEqual(assertRetainedControllerContinuation(f),{
    runId:'run-prepared',requestId:'request-prepared'});
  assert.equal(retainedContinuationKey(f.previous.runId),
    'controller-retained-continuation:run-prepared');
});
test('mismatched source Run or wrong immutable installation cannot continue',()=>{
  const changes=[
    f=>{f.retainedFrom.requestId='another-request';},
    f=>{f.previous.namespace='other-tool';},
    f=>{f.host.principal='different-user';},
    f=>{f.previous.scriptId='task:other:0.1.0';},
    f=>{f.previous.contentHash='f'.repeat(64);},
    f=>{f.previous.revision.revision=2;},
    f=>{f.installedTask.installation.authorization.generation=4;},
    f=>{f.installedTask.installation.authorization.installationId='install-b';},
    f=>{f.previous.installedTaskAuthorization.manifestHash='f'.repeat(64);},
    f=>{f.installedTask.installation.version='0.2.0';}
  ];
  for(const change of changes){
    const f=fixture();change(f);
    assert.throws(()=>assertRetainedControllerContinuation(f),{code:'E_TARGET_CONTINUATION'});
  }
});
test('changed page, reload, cross-session or absent retention fails closed',()=>{
  const changes=[
    f=>{f.previous.state='failed';},
    f=>{f.previous.tombstoned=true;},
    f=>{f.previous.runRevision=undefined;},
    f=>{f.previous.retainedContinuation={runId:'other-run'};},
    f=>{f.previous.retirementState='pending';},
    f=>{f.previous.workerRetired=false;},
    f=>{f.previous.targetDisposition='close';},
    f=>{f.previous.retainedTarget=null;},
    f=>{f.selection.mode='owned';},
    f=>{f.selection.tabId=92;},
    f=>{f.observed.documentId='reloaded-document';},
    f=>{f.observed.url='https://example.com/changed';},
    f=>{f.previous.retainedTarget.url='https://example.com/c/other';},
    f=>{f.session='session-after-restart';}
  ];
  for(const change of changes){
    const f=fixture();change(f);
    assert.throws(()=>assertRetainedControllerContinuation(f),{code:'E_TARGET_CONTINUATION'});
  }
});
