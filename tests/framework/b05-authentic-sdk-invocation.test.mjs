import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {observePage, sdkInvocationExpression, observedSdkInvocation, bindPublicSdkPayload, until, nativeResourceCleanup} from './b05-product-acceptance-20261003.mjs';

function invocation() {
  const listeners=new Map(),calls=[];let resolve,reject;
  const context=vm.createContext({window:{addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent(){throw Error('Runner synthetic events forbidden');}},
    OpenDeskSDK:{call(method,args){calls.push({method,args});return new Promise((yes,no)=>{resolve=yes;reject=no;});}}});
  vm.runInContext(`(${observePage.toString()})()`,context);
  const packet=(name,message)=>listeners.get(name)({detail:JSON.stringify(message)});
  return {context,calls,packet,resolve:value=>resolve(value),reject:error=>reject(error)};
}

// Unit-only observer inputs; no native receipt, browser report or ledger is
// generated. The SDK Promise is held so the observer cannot invent settlement.
test('B05 invokes the public SDK and records only its actual Promise completion', async()=>{
  const x=invocation(),method='AXIOS_POST',args={url:'http://127.0.0.1:1234/hold',data:{f:false,z:0}};
  vm.runInContext(sdkInvocationExpression(method,args,'unit-slot'),x.context);
  assert.equal(x.calls.length,1);assert.equal(x.calls[0].method,method);
  assert.equal(x.context.__b05.settlements['unit-slot'].settlements,0);
  const payload={method,argsWire:encodeValue(args),requestId:'SDK-generated-unit-id',deadlineAt:12345};
  x.packet('CHROME_BRIDGE_INTERFACE',{type:'SDK_REQUEST',payload});
  x.packet('OPEN_DESK_SDK_RESULT',{requestId:payload.requestId,response:{ok:true,data:{unitOnly:true}}});
  assert.equal(x.context.__b05.requests[payload.requestId].settlements,0,'A transport packet is not a public Promise settlement');
  x.resolve({f:false,z:0});await new Promise(yes=>setImmediate(yes));
  const entry=x.context.__b05.requests[payload.requestId];
  assert.equal(entry.settlements,1);assert.equal(entry.originalSdkSlot,'unit-slot');assert.equal(entry.response.ok,true);
  assert.equal(entry.response.value.f,false);assert.equal(entry.response.value.z,0);assert.equal(entry.nativeResponse.data.unitOnly,true);
});
test('Public SDK invocation preserves own undefined and schema rejection without inventing an emitted request',async()=>{
  const x=invocation(),args={discarded:undefined,nested:{u:undefined},array:[undefined,false,0]};
  vm.runInContext(sdkInvocationExpression('getTime',args,'schema-slot'),x.context);
  assert(Object.hasOwn(x.calls[0].args,'discarded'));assert.equal(x.calls[0].args.discarded,undefined);
  assert(Object.hasOwn(x.calls[0].args.nested,'u'));assert(Object.hasOwn(x.calls[0].args.array,0));
  x.reject(Object.assign(new Error('Invalid own key'),{code:'E_SCHEMA'}));await new Promise(yes=>setImmediate(yes));
  assert.equal(x.context.__b05.settlements['schema-slot'].response.error.code,'E_SCHEMA');
  assert.equal(x.context.__b05.settlements['schema-slot'].settlements,1);
  assert.equal(observedSdkInvocation(x.context.__b05.events,{since:0,method:'getTime'}),null);
  assert.equal(Object.keys(x.context.__b05.requests).length,0);
});

test('B05 retains the original public rejection and keeps its keys separate from native transport packets',async()=>{
  const x=invocation(),method='AXIOS_POST',payload={method,argsWire:encodeValue({}),requestId:'unit-rejection',deadlineAt:12345};
  vm.runInContext(sdkInvocationExpression(method,{},'reject-slot'),x.context);
  x.packet('CHROME_BRIDGE_INTERFACE',{type:'SDK_REQUEST',payload});
  const error=Object.assign(new Error('real Promise rejected'),{code:'E_EFFECT_UNKNOWN',invocation:{requestId:payload.requestId}});
  x.reject(error);await new Promise(yes=>setImmediate(yes));
  const entry=x.context.__b05.requests[payload.requestId];
  assert.equal(entry.settlements,1);assert.equal(entry.response.ok,false);assert.equal(entry.response.error.code,'E_EFFECT_UNKNOWN');
  assert.equal(entry.response.error.invocation.requestId,payload.requestId);assert.equal(entry.nativeResponse,undefined);
});

test('B05 binds the generated ID/deadline and approved normalized input without retaining a planned fake ID',()=>{
  const planned={requestId:'planned-only',method:'APPSTORAGE_SETITEM',argsWire:encodeValue({key:'unit',value:false}),deadlineAt:1};
  const actual={requestId:'public-SDK-id',method:planned.method,argsWire:encodeValue({key:'unit',value:'false'}),deadlineAt:23456};
  const binding=bindPublicSdkPayload(planned,actual);
  assert.equal(binding.planned.requestId,'planned-only');assert.deepEqual(binding.actual,actual);assert.deepEqual(planned,actual);
  const wrong={...actual,argsWire:encodeValue({key:'other',value:'false'})};
  assert.throws(()=>bindPublicSdkPayload({...binding.planned},wrong),/SDK input differs/);
  assert.throws(()=>bindPublicSdkPayload({...binding.planned},{...actual,deadlineAt:undefined}),/deadline/);
});

test('B05 refuses ambiguous or unrelated SDK request observations instead of selecting by method alone',()=>{
  const event=id=>({name:'CHROME_BRIDGE_INTERFACE',message:{type:'SDK_REQUEST',payload:{requestId:id,method:'AXIOS_POST'}}});
  assert.equal(observedSdkInvocation([],{since:0,method:'AXIOS_POST'}),null);
  assert.equal(observedSdkInvocation([event('old'),event('actual')],{since:1,method:'AXIOS_POST'}).requestId,'actual');
  assert.throws(()=>observedSdkInvocation([event('one'),event('two')],{since:0,method:'AXIOS_POST'}),error=>error.code==='E_NATIVE_NOT_OBSERVED');
  assert.throws(()=>observedSdkInvocation([event('one')],{since:0,method:'APPLOCAL_GETITEM'}),error=>error.code==='E_NATIVE_NOT_OBSERVED');
});

test('B05 observation timeout remains NOT_TESTED while actual operation failures preserve their source',async()=>{
  await assert.rejects(until(()=>undefined,'unit-only unavailable observation',0),error=>error.code==='E_NATIVE_NOT_OBSERVED');
  const actual=new Error('actual assertion failed');
  await assert.rejects(until(()=>{throw actual;},'unit-only product failure'),error=>error===actual);
  assert.equal(nativeResourceCleanup({}).status,'NOT_TESTED');
  assert.equal(nativeResourceCleanup({nativeResourceBaseline:{before:{counts:{pending:0}},status:'NOT_TESTED'}}).status,'NOT_TESTED');
  assert.throws(()=>nativeResourceCleanup({nativeResourceBaseline:{before:{counts:{pending:0}},after:{counts:{pending:0}},status:'PASS'}}));
});
