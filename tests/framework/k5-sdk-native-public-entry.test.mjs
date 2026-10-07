import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {normalizeMethod} from '../../src/framework/sdk/registry.js';
import {createBackgroundServices} from '../../src/platform/chrome/background-services.js';
import {SDK_RESOURCE_PATHS} from '../../src/framework/sdk/resource-contract.js';
import {observePage,sdkInvocationExpression,observedSdkInvocation,bindPublicSdkPayload} from './b05-product-acceptance-20261003.mjs';

// Extract only the runner's actual orchestration functions. Importing the
// executable itself would launch Chrome. These fixtures are unit-only and
// produce neither native completion receipts nor browser/ledger verdicts.
const source=await readFile(new URL('./k5-sdk-native.mjs',import.meta.url),'utf8');
const {parse}=createRequire(import.meta.url)('acorn');
const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'});
function namedFunction(name){
  let found;
  function visit(node){if(!node||typeof node!=='object')return;
    if(node.type==='FunctionDeclaration'&&node.id?.name===name){assert(!found);found=node;}
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
  }
  visit(tree);assert(found,`Missing actual runner function ${name}`);return source.slice(found.start,found.end);
}
function harness({suppressEmission=false}={}){
  const listeners=new Map(),calls=[];let resolve;
  const payloads=[],page=vm.createContext({window:{addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent(){throw Error('Synthetic events forbidden');}},
    OpenDeskSDK:{call(method,args){calls.push({method,args});let normalized;
      try{normalized=normalizeMethod(method,structuredClone(args));}catch(error){return Promise.reject(error);}
      const payload={method,argsWire:encodeValue(normalized),requestId:`unit-sdk-${calls.length}`,deadlineAt:Date.now()+30000};payloads.push(payload);
      if(!suppressEmission)listeners.get('CHROME_BRIDGE_INTERFACE')({detail:JSON.stringify({type:'SDK_REQUEST',payload})});
      return new Promise(yes=>{resolve=yes;});
    }}});
  vm.runInContext(`(${observePage.toString()})()`,page);
  const notObserved=(message,observation)=>Object.assign(new Error(message),{code:'E_NATIVE_OBSERVATION_UNAVAILABLE',observation});
  const context=vm.createContext({assert,randomUUID,encodeValue,sdkInvocationExpression,observedSdkInvocation,bindPublicSdkPayload,page,notObserved,
    evaluate:async(_page,expression)=>structuredClone(await vm.runInContext(expression,page)),
    until:async(operation,description)=>{for(let n=0;n<3;n++){const value=await operation();if(value)return value;await new Promise(yes=>setImmediate(yes));}throw notObserved(description);}});
  const start=vm.runInContext(`(${namedFunction('startPublic')})`,context),complete=vm.runInContext(`(${namedFunction('publicCompletion')})`,context);
  return {page,calls,payloads,start,complete,resolve:value=>resolve(value),
    nativeResponse:response=>listeners.get('OPEN_DESK_SDK_RESULT')({detail:JSON.stringify({requestId:payloads.at(-1).requestId,response})})};
}
test('SDK entry binds the actually SDK-generated identity and normalized input before completion',async()=>{
  const x=harness(),invocation=await x.start('APPSTORAGE_SETITEM',{key:'unit',value:false});
  assert.equal(x.calls.length,1);assert.equal(invocation.payload.requestId,'unit-sdk-1');
  assert.deepEqual(invocation.binding.actual,x.payloads[0]);assert.equal(invocation.binding.source,'installed public OpenDeskSDK.call');
  assert.equal(x.page.__b05.requests[invocation.payload.requestId].settlements,0);
  x.nativeResponse({ok:true,data:{unitOnly:true}});
  await assert.rejects(x.complete(invocation),error=>error.code==='E_NATIVE_OBSERVATION_UNAVAILABLE','Native response alone cannot complete the original Promise');
  x.resolve(undefined);await new Promise(yes=>setImmediate(yes));
  const result=await x.complete(invocation);assert.equal(result.publicResponse.ok,true);assert.equal(result.publicResponse.undefinedResult,true);
  assert.equal(result.settlement.settlements,1);assert.equal(result.settlement.requestId,invocation.payload.requestId);
  assert.equal(result.nativeResponse.data.unitOnly,true);
});
test('SDK entry observes own-undefined schema rejection before emission and never invents a request ID',async()=>{
  const x=harness(),args={discarded:undefined};
  const invocation=await x.start('getTime',args,{allowPreEmissionRejection:true});
  assert(Object.hasOwn(x.calls[0].args,'discarded'));assert.equal(invocation.payload,undefined);
  assert.equal(invocation.publicRejection.response.error.code,'E_SCHEMA');assert.equal(x.payloads.length,0);
  const result=await x.complete(invocation);assert.equal(result.requestEmitted,false);assert.equal(result.nativeResponse,null);
});
test('SDK entry refuses a pre-emission denial when an admitted request is required',async()=>{
  const x=harness();await assert.rejects(x.start('getTime',{discarded:true}),error=>error.code==='E_NATIVE_OBSERVATION_UNAVAILABLE');
});
test('SDK entry refuses successful public completion without the emitted identity',async()=>{
  const x=harness({suppressEmission:true});const started=x.start('getTime',{});
  const rejected=assert.rejects(started,error=>error.code==='E_NATIVE_OBSERVATION_UNAVAILABLE');
  await new Promise(yes=>setImmediate(yes));x.resolve(123);
  await rejected;
});
test('Native schema vectors distinguish registry rejection from background resource rejection without external effects',async()=>{
  let initializer;
  function visit(node){if(!node||typeof node!=='object')return;
    if(node.type==='VariableDeclarator'&&node.id?.name==='attempts'){assert(!initializer);initializer=node.init;}
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
  }
  visit(tree);assert(initializer);
  const attempts=structuredClone(vm.runInNewContext(`(${source.slice(initializer.start,initializer.end)})`,{origin:'http://127.0.0.1:1234',seed:'unit',SDK_RESOURCE_PATHS}));
  const fetches=[],effects=[],background=createBackgroundServices({api:{runtime:{getURL:path=>`chrome-extension://${'a'.repeat(32)}/`+(path==='/'?'':path)}},
    fetchImpl:async url=>{fetches.push(url);throw Error('Invalid resource must not fetch');}});
  const context={authorize:async()=>{},assertDispatch(){},recordEffect:async value=>effects.push(value)};
  let beforeEmission=0,afterEmission=0;
  for(const [method,args,expectedCode,expectedEmission] of attempts){
    if(!expectedEmission){assert.throws(()=>normalizeMethod(method,args),error=>error.code===expectedCode);beforeEmission++;}
    else{const normalized=normalizeMethod(method,args);assert.equal(method,'requestResource');
      await assert.rejects(background.execute(method,normalized,context),error=>error.code===expectedCode);afterEmission++;}
  }
  assert.equal(beforeEmission,9);assert.equal(afterEmission,6);assert.equal(fetches.length,0);assert.equal(effects.length,0);
});
