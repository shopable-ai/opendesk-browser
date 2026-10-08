import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeValue} from '../../src/framework/control/value.js';
import {validateControllerEnvelope} from '../../src/framework/control/native-driver.js';

function request(revision) {
  const target={tabId:3,frameId:0,documentId:'exact-document'};
  return {requestId:'op-1',identity:{tag:'controller-run',runId:'run-123',ownerEpoch:1,target},
    revision,target,operation:{kind:'packaged',method:'click',args:encodeValue(['#go'])}};
}

test('packaged DOM driver accepts a frozen unsaved draft bound to the exact run',()=>{
  const revision={kind:'draft',scriptId:'draft:run-123',revision:1,sourceHash:'a'.repeat(64)};
  assert.deepEqual(validateControllerEnvelope(request(revision)),['#go']);
});
test('native driver still requires a genuine saved revision pin',()=>{
  const revision={scriptId:'saved',revision:1,sourceHash:'b'.repeat(64),pinKey:'controller-pin:run-123'};
  assert.deepEqual(validateControllerEnvelope(request(revision)),['#go']);
  assert.throws(()=>validateControllerEnvelope(request({...revision,pinKey:undefined})),error=>error.code==='E_PAGE_CONTEXT_REQUIRED');
});
test('a draft cannot spoof another run or pretend to be a saved pin',()=>{
  const revision={kind:'draft',scriptId:'draft:run-different',revision:1,sourceHash:'a'.repeat(64)};
  assert.throws(()=>validateControllerEnvelope(request(revision)),error=>error.code==='E_PAGE_CONTEXT_REQUIRED');
  assert.throws(()=>validateControllerEnvelope(request({...revision,scriptId:'draft:run-123',pinKey:'fake'})),
    error=>error.code==='E_PAGE_CONTEXT_REQUIRED');
});
