import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeContextReader} from './native-context-reader.mjs';

const extensionId='a'.repeat(32);
const root='chrome-extension://'+extensionId+'/';
const offscreen={type:'other',targetId:'real-offscreen-1',url:root+'cloud-control/runner.html'};
const panel={type:'page',targetId:'user-panel-1',url:root+'sidepanel.html'};
const contexts=[
  {type:'OFFSCREEN_DOCUMENT',url:offscreen.url,documentId:'real-offscreen-document'},
  {type:'SIDE_PANEL',url:panel.url,documentId:'real-panel-document'}
];
function fakeCdp(){
  const calls=[];
  return {calls,send:async(method,args,sessionId)=>{
    calls.push({method,args,sessionId});
    if(method==='Target.attachToTarget')return {sessionId:'side-panel-cdp-session'};
    return {};
  }};
}

test('reads native context IDs in the Side Panel, never the limited Offscreen runtime',async()=>{
  const c=fakeCdp();let evaluated=0;
  const read=createNativeContextReader(async(_c,source,sessionId)=>{
    evaluated++;
    assert.match(source,/chrome\.runtime\.getContexts/);
    assert.equal(sessionId,'side-panel-cdp-session');
    return contexts;
  });
  const before=await read(c,[offscreen,panel],extensionId);
  assert.deepEqual(before,{contexts,proof:'real-side-panel-runtime-getContexts'});
  assert.equal(c.calls[0].args.targetId,panel.targetId);
  assert.equal(c.calls.at(-1).method,'Target.detachFromTarget');
  // The panel has actually closed: same Offscreen CDP target/document ID,
  // no silent SW wakeup or Offscreen call to getContexts.
  const closed=await read(c,[offscreen],extensionId);
  assert.deepEqual(closed,{contexts:[contexts[0]],
    proof:'same-cdp-offscreen-target-after-panel-close'});
  assert.equal(evaluated,1);
  await assert.rejects(read(c,[{...offscreen,targetId:'replaced-offscreen'}],extensionId),
    /Original Offscreen target changed/);
  await assert.rejects(read(c,[offscreen],'b'.repeat(32)),
    /Original Offscreen target changed/);
});

test('without an attesting Side Panel there is no fabricated readiness',async()=>{
  const c=fakeCdp();
  const read=createNativeContextReader(async()=>{throw Error('unexpected');});
  await assert.rejects(read(c,[offscreen],extensionId),{code:'HUMAN_ACTION_REQUIRED'});
  assert.deepEqual(c.calls,[]);
});

test('Side Panel context enumeration failing does not downgrade to URL-only proof',async()=>{
  const c=fakeCdp();
  const read=createNativeContextReader(async()=>{throw Error('no runtime.getContexts');});
  await assert.rejects(read(c,[offscreen,panel],extensionId),
    /no runtime.getContexts/);
  assert.equal(c.calls.at(-1).method,'Target.detachFromTarget');
  await assert.rejects(read(c,[offscreen],extensionId),{code:'HUMAN_ACTION_REQUIRED'});
});
