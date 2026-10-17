import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstalledXmindFrameFactory} from '../src/xmind-installed-frame.js';

test('installed adapter uses the fixed public resource and preserves the live child when mounting',async()=>{
  const identity={instanceId:'answer-1'},frame={style:{}},port={};let request,moved;
  const destroy=async()=>{};
  const factory=createInstalledXmindFrameFactory({createFrame:async value=>{
    request=value;return {frame,port,destroy};
  }});
  const result=await factory({identity,canvas:{moveBefore:(node,before)=>{moved=[node,before];}}});
  assert.deepEqual(request,{resourceId:'xmind-runtime',data:{identity}});
  assert.deepEqual(moved,[frame,null]);assert.equal(result.port,port);assert.equal(result.destroy,destroy);
});

test('abort while the platform creates a child waits for its retirement',async()=>{
  const controller=new AbortController();let retired=false;
  const factory=createInstalledXmindFrameFactory({createFrame:async()=>{
    controller.abort();return {frame:{style:{}},port:{},destroy:async()=>{await Promise.resolve();retired=true;}};
  }});
  await assert.rejects(factory({identity:{},signal:controller.signal,canvas:{moveBefore(){throw Error('must not mount');}}}),
    {code:'E_XMIND_FRAME_DESTROYED'});
  assert.equal(retired,true);
});

test('missing platform resource propagates and unsupported moves never create a frame',async()=>{
  let calls=0;
  const factory=createInstalledXmindFrameFactory({createFrame:async()=>{calls++;throw Object.assign(Error('missing'),{code:'E_FRAME_RESOURCE'});}});
  await assert.rejects(factory({canvas:{}}),{code:'E_XMIND_FRAME_MOVE_UNAVAILABLE'});assert.equal(calls,0);
  await assert.rejects(factory({canvas:{moveBefore(){}}}),{code:'E_FRAME_RESOURCE'});assert.equal(calls,1);
});
