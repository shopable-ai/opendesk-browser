import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createWorkerPageProxy} from '../../src/scripting/sandbox/page-proxy.js';
import {encodeValue,decodeValue} from '../../src/framework/control/value.js';

const target = {tabId:7,frameId:0,documentId:'worker-A',targetVersion:1};
const revision = {scriptId:'worker-context',revision:1,sourceHash:'1'.repeat(64)};
const identity = {runId:'worker-context-run',ownerEpoch:1,target};

// Component fixture: production runtime uses an isolated Node Worker realm
// and real transferred MessagePorts. This is not a Chrome sandbox/CSP proof.
// These observations are never emitted as browser/native/formal receipts.
async function worker(body, {owner=identity,respond=()=>'A-title',duplicate=false}={}) {
  const calls=[],messages=[],channel=new MessageChannel();
  const thread=new Worker(`
    const {parentPort,workerData}=require('node:worker_threads'),listeners=new Map();
    Object.assign(globalThis,{location:{href:'blob:null/unit-only'},name:'unit-only',origin:'null',
      addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);},
      postMessage(data){parentPort.postMessage(data);}});
    parentPort.on('message',event=>listeners.get('message')?.({data:event.data,ports:[event.port]}));
    import(workerData.runtimeURL).then(({installControlWorker})=>installControlWorker(globalThis));
  `,{eval:true,workerData:{runtimeURL:new URL('../../src/scripting/sandbox/worker-runtime.js',import.meta.url).href}});
  let timer;
  const completion=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('Component worker did not complete')),1500);
    thread.on('error',reject);
    thread.on('message',data=>{
      messages.push(data);
      if(data.kind==='worker-ready')thread.postMessage({data:{kind:'bind',identity:owner,revision,target:owner.target},port:channel.port1},[channel.port1]);
    });
    channel.port2.onmessage=async({data})=>{
      try {
        messages.push(data);
        if(data.kind==='bound') {
          const packet={kind:'execute',runId:owner.runId,ownerEpoch:owner.ownerEpoch,body,params:{marker:'params-preserved'}};
          channel.port2.postMessage(packet);if(duplicate)channel.port2.postMessage(packet);
        } else if(data.kind==='operation') {
          calls.push(data.envelope);const value=await respond(data.envelope);
          channel.port2.postMessage({kind:'reply',runId:owner.runId,ownerEpoch:owner.ownerEpoch,id:data.id,
            reply:{requestId:data.envelope.requestId,...(value?.handoff ? value : {value:encodeValue(value)})}});
        } else if(data.kind==='result'||data.kind==='error')resolve(data);
      } catch(error){reject(error);}
    };
  });
  try {
    const result=await completion;
    await new Promise(resolve=>setImmediate(resolve));
    return {packet:result,value:result.kind==='result'?decodeValue(result.value):undefined,calls,messages};
  } finally {clearTimeout(timer);channel.port1.close();channel.port2.close();await thread.terminate();}
}

test('actual worker entry exposes the admitted constructor and readonly revision without private lifecycle', async()=>{
  const actual=await worker(`
    const a=new ctx.ChromePage(),b=new ctx.ChromePage({debug:true}),c=new ctx.ChromePage({debug:false}),d=new ctx.ChromePage({});
    let raw;try{new page.constructor();}catch(error){raw=error.code;}
    const titles=[await a.title(),await b.title(),await c.title(),await d.title()];
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,'ctx');
    const mutations=[Reflect.set(ctx.revision,'revision',99),Reflect.set(ctx.target,'documentId','forged'),
      Reflect.set(ctx,'ChromePage',()=>{}),Reflect.set(globalThis,'ctx',{}),Reflect.deleteProperty(globalThis,'ctx')];
    return {debug:[a.debug,b.debug,c.debug,d.debug],titles,keys:Object.keys(ctx).sort(),raw,params,
      descriptor:[descriptor.writable,descriptor.configurable,descriptor.enumerable],mutations,
      frozen:[Object.isFrozen(ctx),Object.isFrozen(ctx.revision),Object.isFrozen(ctx.target),Object.isFrozen(ctx.ChromePage)],
      revision:ctx.revision,target:ctx.target};
  `);
  assert.equal(actual.packet.kind,'result');
  assert.deepEqual(actual.value.debug,[true,true,false,undefined]);assert.deepEqual(actual.value.titles,Array(4).fill('A-title'));
  assert.deepEqual(actual.value.keys,['ChromePage','revision','target']);assert.deepEqual(actual.value.frozen,[true,true,true,true]);
  assert.deepEqual(actual.value.descriptor,[false,false,false]);assert.deepEqual(actual.value.mutations,[false,false,false,false,false]);
  assert.equal(actual.value.raw,'E_PAGE_CONTEXT_REQUIRED');assert.deepEqual(actual.value.params,{marker:'params-preserved'});
  assert.deepEqual(actual.value.revision,revision);assert.deepEqual(actual.value.target,target);
  assert.equal(actual.calls.length,4);
  for(const envelope of actual.calls){assert.deepEqual(envelope.identity,identity);assert.deepEqual(envelope.target,target);assert.deepEqual(envelope.revision,revision);}
});

test('worker constructor option rejection dispatches nothing and existing page stays usable', async()=>{
  const actual=await worker(`
    let code;try{new ctx.ChromePage({debug:'yes'});}catch(error){code=error.code;}
    return {code,title:await page.title()};
  `);
  assert.equal(actual.packet.kind,'result');assert.deepEqual(actual.value,{code:'E_OPTION_UNSUPPORTED',title:'A-title'});
  assert.equal(actual.calls.length,1);assert.equal(actual.calls[0].operation.method,'title');
});

test('actual Worker type errors retain the original codes and never reach its transferred port',async()=>{
  const actual=await worker(`
    const errors=[];
    for(const p of [page,new ctx.ChromePage()]) {
      try{await p.type('#text','x',{delay:-1});}catch(error){errors.push(error.code);}
      try{await p.type('#text',{});}catch(error){errors.push(error.code);}
    }
    return {errors,value:await new ctx.ChromePage().type('#text',false)};
  `,{respond:e=>decodeValue(e.operation.args)[1]});
  assert.equal(actual.packet.kind,'result');
  assert.deepEqual(actual.value,{errors:['E_OPTION_UNSUPPORTED','E_VALUE_SERIALIZATION','E_OPTION_UNSUPPORTED','E_VALUE_SERIALIZATION'],value:'false'});
  assert.equal(actual.calls.length,1);assert.deepEqual(decodeValue(actual.calls[0].operation.args),['#text','false',{delay:0}]);
  assert.deepEqual(actual.calls[0].identity,identity);assert.deepEqual(actual.calls[0].revision,revision);
});

test('constructed worker pages keep independent admitted owners and a trusted navigation handoff', async()=>{
  const b={...identity,runId:'worker-B-run',target:{...target,tabId:8,documentId:'worker-B'}};
  for(const owner of [identity,b]) {
    const actual=await worker('return await new ctx.ChromePage({}).title();',{owner,respond:e=>e.target.documentId});
    assert.equal(actual.value,owner.target.documentId);assert.deepEqual(actual.calls[0].identity,owner);
  }
  const next={...target,documentId:'worker-A-next',targetVersion:2};
  const actual=await worker(`await page.goto('https://example.test/next');return {title:await new ctx.ChromePage().title(),target:ctx.target,pin:ctx.revision};`,
    {respond:e=>e.operation.method==='goto'?{value:encodeValue(undefined),handoff:{from:target,to:next}}:e.target.documentId});
  assert.deepEqual(actual.value,{title:next.documentId,target:next,pin:revision});
  assert.deepEqual(actual.calls[1].target,next);assert.deepEqual(actual.calls[1].revision,revision);
});

test('duplicate execute cannot recreate a constructor owner or settle the script twice', async()=>{
  const actual=await worker('return await new ctx.ChromePage().title();',{duplicate:true});
  assert.equal(actual.value,'A-title');assert.equal(actual.calls.length,1);
  assert.equal(actual.messages.filter(m=>m.kind==='result'||m.kind==='error').length,1);
});

test('public constructor retains the disposed private context fence', async()=>{
  const channel=new MessageChannel(),proxy=createWorkerPageProxy({port:channel.port1,identity,revision,target});
  try {
    const page=new proxy.scriptContext.ChromePage();proxy.dispose('E_HOST_CLOSED');
    await assert.rejects(page.title(),{code:'E_HOST_CLOSED'});
    await assert.rejects(new proxy.scriptContext.ChromePage().title(),{code:'E_HOST_CLOSED'});
    assert.deepEqual(Object.keys(proxy.scriptContext).sort(),['ChromePage','revision','target']);
  } finally {proxy.dispose();channel.port2.close();}
});
