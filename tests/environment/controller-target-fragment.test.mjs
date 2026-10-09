import test from 'node:test';
import assert from 'node:assert/strict';
import {observeControllerTarget} from '../../src/platform/target/index.js';

function fixture() {
  const tab={id:11,windowId:7,active:true,incognito:false,url:'https://example.com/demo#search',status:'complete'};
  const frame={frameId:0,documentId:'doc-a',url:tab.url,documentLifecycle:'active'};
  const api={tabs:{get:async()=>({...tab}),query:async()=>[{...tab}]},
    webNavigation:{getAllFrames:async()=>[{...frame}]},permissions:{contains:async()=>true}};
  const captured={api,tabId:11,frameId:0,documentId:'doc-a',expectedWindowId:7,expectedUrl:tab.url};
  return {api,tab,frame,captured};
}

test('Controller accepts a fresh Current Page capture with a same-document fragment',async()=>{
  const f=fixture();
  const observed=await observeControllerTarget(f.captured);
  assert.equal(observed.documentId,'doc-a');
  assert.equal(observed.url,f.frame.url);
  assert.equal(observed.allowedOrigin,'https://example.com');
});

test('Controller rejects the old capture after a fragment change, including callers without window binding',async()=>{
  for(const expectedWindowId of [7,undefined]) {
    const f=fixture();
    await assert.rejects(observeControllerTarget({...f.captured,expectedWindowId,expectedUrl:'https://example.com/demo'}),
      {code:'E_DOCUMENT_STALE'});
  }
});

test('fragment acceptance keeps document identity and full page URL checks',async()=>{
  const replaced=fixture();replaced.frame.documentId='doc-b';
  await assert.rejects(observeControllerTarget(replaced.captured),{code:'E_DOCUMENT_STALE'});
  const otherPath=fixture();otherPath.frame.url='https://example.com/other#search';
  await assert.rejects(observeControllerTarget(otherPath.captured),{code:'E_DOCUMENT_STALE'});
  const pending=fixture();pending.tab.pendingUrl='https://example.com/next';
  await assert.rejects(observeControllerTarget(pending.captured),{code:'E_DOCUMENT_STALE'});
});

test('Controller rejects a fragment change during asynchronous permission validation',async()=>{
  const f=fixture();f.api.permissions.contains=async()=>{f.tab.url='https://example.com/demo#changed';return true;};
  await assert.rejects(observeControllerTarget(f.captured),{code:'E_DOCUMENT_STALE'});
});
