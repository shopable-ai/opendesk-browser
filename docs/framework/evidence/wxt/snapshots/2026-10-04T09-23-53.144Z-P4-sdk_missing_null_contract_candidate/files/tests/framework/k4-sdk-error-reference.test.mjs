import test from 'node:test';
import assert from 'node:assert/strict';
import {FoundationError, projectFoundationError} from '../../src/platform/protocol.js';
import {createWindowTransport} from '../../src/framework/sdk/transport.js';
import {PROTOCOL, SDK_REQUEST_EVENT, SDK_RESULT_EVENT} from '../../src/framework/sdk/registry.js';

const invocation = {requestId:'original-request',runId:'original-run',opId:'original-op',grantIncarnation:'original-grant'};

test('typed error projection preserves original reference and existing details without leaking internal fields',() => {
  const error = Object.assign(new FoundationError('E_EFFECT_UNKNOWN','No durable receipt'),{
    stage:'delivery',status:0,response:false,invocation:{...invocation,namespace:'private',args:{secret:true}},stack:'private stack',payload:'private payload'
  });
  const projected = projectFoundationError(error);
  assert.deepEqual(JSON.parse(JSON.stringify(projected)),{code:error.code,message:error.message,stage:'delivery',status:0,response:false,invocation});
  assert.notEqual(projected.invocation,error.invocation);
  for (const reference of [null,{}, {...invocation,opId:0},Object.create(invocation)])
    assert.equal(Object.hasOwn(projectFoundationError({code:'E_EFFECT_UNKNOWN',invocation:reference}),'invocation'),false);
  assert.deepEqual(projectFoundationError(new FoundationError('E_PERMISSION','Denied')),{code:'E_PERMISSION',message:'Denied'});
});

test('window transport rejects original promise once with the wire reference and releases its pending timer',async () => {
  class DetailEvent extends Event { constructor(type,{detail}) { super(type); this.detail = detail; } }
  const window = new EventTarget(), timers = new Set();
  const transport = createWindowTransport({window,CustomEvent:DetailEvent,
    setTimer:callback => { const timer = {callback}; timers.add(timer); return timer; },clearTimer:timer => timers.delete(timer)});
  window.addEventListener(SDK_REQUEST_EVENT,event => {
    const request = JSON.parse(event.detail);
    const reply = {protocol:PROTOCOL,requestId:request.payload.requestId,response:{ok:false,
      error:projectFoundationError(Object.assign(new FoundationError('E_EFFECT_UNKNOWN','No durable receipt'),{invocation}))}};
    const detail = JSON.stringify(reply);
    window.dispatchEvent(new DetailEvent(SDK_RESULT_EVENT,{detail}));
    window.dispatchEvent(new DetailEvent(SDK_RESULT_EVENT,{detail}));
  });
  let settlements = 0;
  await assert.rejects(transport.request({requestId:invocation.requestId,method:'APPLOCAL_GETITEM',args:{key:'x'},deadlineAt:Date.now()+1000})
    .catch(error => { settlements++; throw error; }),error => {
    assert.equal(error.code,'E_EFFECT_UNKNOWN'); assert.deepEqual(error.invocation,invocation); return true;
  });
  assert.equal(settlements,1); assert.equal(transport.diagnostics().pending,0); assert.equal(timers.size,0);
  transport.dispose();
});
