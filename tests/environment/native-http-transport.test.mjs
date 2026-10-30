import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeHttpTransport} from '../../src/platform/chrome/native-http-transport.js';
const target='http://127.0.0.1:43121/http-echo';
const context=()=>({runId:crypto.randomUUID(),requestId:crypto.randomUUID(),taskId:'capture.fixture',revision:1,sourceHash:'a'.repeat(64),
  deadlineAt:Date.now()+15000,namespace:'tool:fixture',principal:'extension-tool:fixture',grantIncarnation:crypto.randomUUID(),
  resultId:crypto.randomUUID(),browserSessionIncarnation:crypto.randomUUID(),installation:{version:'1.0.0',manifestHash:'b'.repeat(64),
    installationId:crypto.randomUUID(),generation:1}});
const options=signal=>({method:'GET',headers:{accept:'application/json'},signal});
test('only registered immutable Authority snapshot executes; no target Fetch is available',async()=>{
  const calls=[],ctx=context(),controller=new AbortController();let operation;
  const channel={rpc:async(method,body)=>{
    calls.push(method);
    if(method==='register'){operation=structuredClone(body);return{operationId:body.operationId,status:'registered'};}
    if(method==='execute')return{operationId:body.operationId,status:'running'};
    assert.equal(method,'status');return{operationId:body.operationId,status:'completed',result:{status:200,statusText:'OK',headers:{},body:'hello',executor:{pid:123}}};
  }};
  const driver=createNativeHttpTransport({enabled:true,channel}),opts=options(controller.signal);let checks=0;
  const response=await driver.request(target,opts,ctx,async()=>{checks++;if(checks===2)opts.headers.accept='mutated';});
  assert.equal(await response.text(),'hello');assert.equal(response.executor.pid,123);
  assert.equal(operation.headers.accept,'application/json');assert.deepEqual(operation.authority.installation,ctx.installation);
  assert.equal(operation.sourceHash,ctx.sourceHash);assert.equal(operation.requestId,ctx.requestId);
  assert.equal(operation.authority.resultId,ctx.resultId);assert.equal(operation.userAgent,'OpenDesk-NativeHTTP/1.0');
  assert.deepEqual(calls,['register','execute','status']);assert.equal(checks,3);
});
test('Stop confirms Node cancellation before rejecting; failed cancellation stays unknown',async()=>{
  for(const confirm of [true,false]){
    const controller=new AbortController(),calls=[];
    const channel={rpc:async(method,body)=>{calls.push(method);
      if(method==='register')return{operationId:body.operationId,status:'registered'};
      if(method==='execute'){controller.abort(Object.assign(Error('Stop'),{code:'E_CANCELLED'}));return{operationId:body.operationId,status:'running'};}
      assert.equal(method,'cancel');if(!confirm)throw Error('disconnected');return{operationId:body.operationId,status:'cancelled'};
    }};
    await assert.rejects(createNativeHttpTransport({enabled:true,channel}).request(target,options(controller.signal),context(),async()=>{}),
      {code:confirm?'E_CANCELLED':'E_EFFECT_UNKNOWN'});
    assert.deepEqual(calls,['register','execute','cancel']);
  }
});
test('revocation after register prevents execute and retires registered operation',async()=>{
  const calls=[];let checks=0;
  const channel={rpc:async(method,body)=>{calls.push(method);return{operationId:body.operationId,status:method==='register'?'registered':'cancelled'};}};
  await assert.rejects(createNativeHttpTransport({enabled:true,channel}).request(target,options(new AbortController().signal),context(),async()=>{
    if(++checks===2)throw Object.assign(Error('permission revoked'),{code:'E_PERMISSION'});
  }),{code:'E_PERMISSION'});
  assert.deepEqual(calls,['register','cancel']);
});
test('unavailable Node never falls back; old-generation and unknown status cannot deliver body',async()=>{
  for(const outcome of ['unavailable','unknown']){
    const calls=[];
    const channel={rpc:async(method,body)=>{calls.push(method);
      if(method==='register')return{operationId:body.operationId,status:'registered'};
      if(method==='execute')return{operationId:body.operationId,status:'running'};
      if(outcome==='unavailable')throw Object.assign(Error('offline'),{code:'E_NATIVE_UNAVAILABLE'});
      return{operationId:body.operationId,status:'unknown',result:{body:'late data'}};
    }};
    await assert.rejects(createNativeHttpTransport({enabled:true,channel}).request(target,options(new AbortController().signal),context(),async()=>{}),{code:'E_EFFECT_UNKNOWN'});
    assert.deepEqual(calls,['register','execute','status','cancel']);
  }
});
test('fixed target and expired authorization fail before any RPC',async()=>{
  const channel={rpc:()=>{assert.fail('must not dispatch');}};
  const driver=createNativeHttpTransport({enabled:true,channel});
  for(const url of ['https://example.com/','http://127.0.0.1:43122/rpc',target+'#fragment'])
    await assert.rejects(driver.request(url,options(new AbortController().signal),context(),async()=>{}),{code:'E_PERMISSION'});
  await assert.rejects(driver.request(target,options(new AbortController().signal),{...context(),deadlineAt:1},async()=>{}),{code:'E_TIMEOUT'});
});
