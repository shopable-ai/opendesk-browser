import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {MessageChannel} from 'node:worker_threads';
import * as foundation from '../../src/platform/page-port/codec.js';
import {encodeValue, decodeValue, PageError, VALUE_LIMITS} from '../../src/framework/control/value.js';
import {buildPageEvaluation, readPageEvaluationResult} from '../../src/scripting/user-scripts/page-evaluator.js';
import {installControlWorker} from '../../src/scripting/sandbox/worker-runtime.js';

// Literal semantic expectations, not an alternate codec. The worker unit fixture
// uses the actual fixed runtime/private ports; native opaque origin proof is separate.
const jsonHop = value => JSON.parse(JSON.stringify(value));
const target = {tabId:1, frameId:0, documentId:'codec-document'};
const revision = {scriptId:'codec-script', revision:1, sourceHash:'a'.repeat(64)};
export const accepted = [
  ['undefined', undefined], ['null', null], ['false', false], ['0', 0], ['-0', -0], ["''", ''],
  ["'中文 😀'", '中文 😀'], ['[undefined,null,-0]', [undefined,null,-0]],
  ['({present:undefined,nested:{empty:"",zero:-0},PageBrigeCode:1})', {present:undefined,nested:{empty:'',zero:-0},PageBrigeCode:1}],
  ['(()=>{const v=Object.create(null);v.z=undefined;v.a=-0;return v;})()', {z:undefined,a:-0}],
  ['JSON.parse(\'{"__proto__":{"inert":true},"constructor":"data"}\')', JSON.parse('{"__proto__":{"inert":true},"constructor":"data"}')]
];
export const rejected = [
  'NaN', 'Infinity', '1n', "Symbol('value')", '(()=>1)', 'new Date()', 'new Uint8Array([1])',
  "'\\ud800'", "'\\udc00'", "({['\\ud800']:1})", "({[Symbol('key')]:1})", '[Symbol()]',
  '(()=>{const v={};v.self=v;return v;})()',
  '(()=>{const v=[];Object.defineProperty(v,"0",{enumerable:true,get(){globalThis.__codecReads++;return 1;}});return v;})()',
  '({get value(){globalThis.__codecReads++;return 1;}})'
];
function realm() { return vm.createContext({TextEncoder, setTimeout, clearTimeout, performance, __codecReads:0}); }
async function generated(source, args = []) {
  const descriptor = buildPageEvaluation('evaluate', [{mode:'function',source:`(...args)=>(${source})`},args], {runId:'codec-run',operationId:'codec-operation'});
  const context = realm();
  const reply = jsonHop(await vm.runInContext(descriptor.code, context));
  return {reply, context, descriptor};
}
async function worker(source, operation) {
  const {port1,port2} = new MessageChannel();
  const identity = {runId:'codec-run',ownerEpoch:1,target};
  let bind;
  const scope = {location:{href:'blob:null/unit-fixture'},name:'codec-unit',origin:'null',
    addEventListener(kind, fn){if(kind==='message') bind=fn;},removeEventListener(){},postMessage(){}};
  const timeout = setTimeout(() => port1.close(), 2000);
  try {
    const result = new Promise((resolve,reject) => {
      port1.on('message', message => {
        if(message.kind==='bound') port1.postMessage({kind:'execute',...identity,body:`return (${source});`,params:{}});
        if(message.kind==='operation' && operation) {
          const value=operation(message.envelope);
          port1.postMessage({kind:'reply',...identity,id:message.id,reply:{requestId:message.envelope.requestId,value:encodeValue(value)}});
        }
        if(message.kind==='result'||message.kind==='error') resolve(jsonHop(message));
      });
      port1.on('close', () => reject(new Error('Worker fixture closed before settlement')));
    });
    installControlWorker(scope);
    bind({data:{kind:'bind',identity,revision,target},ports:[port2]});
    return await result;
  } finally { clearTimeout(timeout);port1.close();port2.close(); }
}

test('one self-contained factory exposes explicit frozen wire profiles in a fresh realm', () => {
  assert.equal(typeof foundation.createValueCodec, 'function');
  const context = realm();
  const factory = vm.runInContext(`(${foundation.createValueCodec.toString()})`,context);
  for(const profile of ['foundation','control']) {
    const codec = factory({profile});
    assert.ok(Object.isFrozen(codec));
    const wire = vm.runInContext('({z:undefined,a:-0})', context);
    const expected = profile==='foundation'
      ? {type:'object',value:[['a',{type:'number',value:0,negativeZero:true}],['z',{type:'undefined'}]]}
      : {t:'object',v:[['z',{t:'undefined'}],['a',{t:'negative-zero'}]]};
    assert.deepEqual(jsonHop(codec.encodeValue(wire)),expected);
  }
});

test('host, fixed Worker runtime and generated harness preserve the same literal values', async () => {
  for(const [source,expected] of accepted) {
    const input = vm.runInThisContext(`(${source})`);
    assert.deepEqual(foundation.decodeValue(jsonHop(foundation.encodeValue(input))),expected,source);
    assert.deepEqual(decodeValue(jsonHop(encodeValue(input))),expected,source);
    const page = await generated(source);
    assert.deepEqual(readPageEvaluationResult(page.reply),expected,source);
    const result = await worker(source);
    assert.equal(result.kind,'result',source);
    assert.deepEqual(decodeValue(result.value),expected,source);
    assert.deepEqual(result.value,page.reply.value,source);
  }
  assert.equal(Object.prototype.inert,undefined);
});

test('semantic violations are refused in every entry, without executing accessors', async () => {
  globalThis.__codecReads = 0;
  try {
    for(const source of rejected) {
      const input = vm.runInThisContext(`(${source})`);
      for(const encode of [foundation.encodeValue,encodeValue])
        assert.throws(()=>encode(input),error=>error.code==='E_VALUE_SERIALIZATION',source);
      const page = await generated(source);
      assert.equal(page.reply.ok,false,source);
      assert.equal(page.reply.error.code,'E_VALUE_SERIALIZATION',source);
      assert.equal(page.context.__codecReads,0,source);
      const result = await worker(source);
      assert.equal(result.kind,'error',source);
      assert.equal(result.error.code,'E_VALUE_SERIALIZATION',source);
    }
    assert.equal(globalThis.__codecReads,0);
  } finally { delete globalThis.__codecReads; }
});

test('profile decoder errors retain their codes and reject getters, Symbols and invalid strings', () => {
  let reads = 0;
  for(const [decode,tag,field,code] of [[foundation.decodeValue,'type','value','E_VALUE_SERIALIZATION'],[decodeValue,'t','v','E_RESULT_FORMAT']]) {
    const getter = Object.defineProperty({[tag]:'string'},field,{enumerable:true,get(){reads++;return 'forged';}});
    const cycle = {[tag]:'array',[field]:[]};cycle[field].push(cycle);
    for(const wire of [getter,{[tag]:'string',[field]:'\ud800'},{[tag]:'null',[Symbol('hidden')]:1},cycle,
      {[tag]:'object',[field]:[['same',{[tag]:'null'}],['same',{[tag]:'null'}]]}])
      assert.throws(()=>decode(wire),error=>error.code===code);
  }
  assert.equal(reads,0);
  assert.throws(()=>decodeValue({t:'wat'}),error=>error instanceof PageError && error.code==='E_RESULT_FORMAT');
});

test('foreign-realm tagged wires preserve original decode behavior and the Chrome JSON hop', async () => {
  const expected = {present:undefined,zero:-0,text:'中文 😀'};
  const wire = {type:'object',value:[['present',{type:'undefined'}],['zero',{type:'number',value:0,negativeZero:true}],['text',{type:'string',value:'中文 😀'}]]};
  const foreignWire = vm.runInNewContext(`(${JSON.stringify(wire)})`);
  assert.notEqual(Object.getPrototypeOf(foreignWire),Object.prototype);
  assert.deepEqual(foundation.decodeValue(foreignWire),expected);
  assert.deepEqual(foundation.decodeValue(jsonHop(foreignWire)),expected);
  const descriptor = buildPageEvaluation('evaluate',[{mode:'function',source:'()=>({present:undefined,zero:-0,text:"中文 😀"})'},[]],{runId:'foreign-run',operationId:'foreign-operation'});
  const raw = await vm.runInContext(descriptor.code,realm());
  assert.notEqual(Object.getPrototypeOf(raw.value),Object.prototype);
  assert.deepEqual(readPageEvaluationResult(raw),expected);
  assert.deepEqual(readPageEvaluationResult(jsonHop(raw)),expected);
});

test('UTF-8 byte boundaries and inclusive depth 12 remain identical across generated and Worker paths', async () => {
  for(const [encode,decode,wire] of [[foundation.encodeValue,foundation.decodeValue,{type:'string',value:'中😀'}],[encodeValue,decodeValue,{t:'string',v:'中😀'}]]) {
    const bytes = new TextEncoder().encode(JSON.stringify(wire)).byteLength;
    assert.deepEqual(encode('中😀',{maxBytes:bytes}),wire);
    assert.equal(decode(wire,{maxBytes:bytes}),'中😀');
    assert.throws(()=>encode('中😀',{maxBytes:bytes-1}),error=>error.code==='E_VALUE_SERIALIZATION');
    assert.throws(()=>decode(wire,{maxBytes:bytes-1}),error=>error.code==='E_VALUE_SERIALIZATION');
  }
  for(const depth of [12,13]) {
    const source = '['.repeat(depth)+'null'+']'.repeat(depth), input = vm.runInThisContext(source);
    const page = await generated(source), result = await worker(source);
    if(depth===12) {
      assert.deepEqual(decodeValue(encodeValue(input)),input);
      assert.deepEqual(foundation.decodeValue(foundation.encodeValue(input)),input);
      assert.deepEqual(readPageEvaluationResult(page.reply),input);
      assert.deepEqual(decodeValue(result.value),input);
    } else {
      assert.throws(()=>encodeValue(input),error=>error.code==='E_VALUE_SERIALIZATION');
      assert.throws(()=>foundation.encodeValue(input),error=>error.code==='E_VALUE_SERIALIZATION');
      assert.equal(page.reply.error.code,'E_VALUE_SERIALIZATION');assert.equal(result.error.code,'E_VALUE_SERIALIZATION');
    }
  }
  const source = `'é'.repeat(${VALUE_LIMITS.bytes/2})`;
  assert.throws(()=>encodeValue('é'.repeat(VALUE_LIMITS.bytes/2)),error=>error.code==='E_VALUE_SERIALIZATION');
  assert.equal((await generated(source)).reply.error.code,'E_VALUE_SERIALIZATION');
  assert.equal((await worker(source)).error.code,'E_VALUE_SERIALIZATION');
  // The foundation envelope has its separately approved 256 KiB budget.
  assert.ok(foundation.encodeValue('é'.repeat(VALUE_LIMITS.bytes/2)));
});

test('generated harness embeds the shared factory, with no imports or host constructors', async () => {
  assert.equal(typeof foundation.createValueCodec,'function');
  const {descriptor,reply} = await generated('({present:args[0],zero:args[1],unicode:args[2]})',[undefined,-0,'中文 😀']);
  assert.ok(descriptor.code.includes(foundation.createValueCodec.toString()));
  // The encoder/decoder bodies belong inside the factory. Only independently
  // serialized declarations would lose that factory's captured intrinsics.
  assert.ok(!descriptor.code.includes(`const encodeValue=${encodeValue.toString()}`));
  assert.ok(!descriptor.code.includes(`const decodeValue=${decodeValue.toString()}`));
  assert.doesNotMatch(descriptor.code,/\bimport\b|\beval\s*\(|new\s+(?:Function|AsyncFunction)\b/);
  assert.deepEqual(readPageEvaluationResult(reply),{present:undefined,zero:-0,unicode:'中文 😀'});
});

test('a factory captures serialization intrinsics before user global patches', () => {
  assert.equal(typeof foundation.createValueCodec,'function');
  const context = realm();
  vm.runInContext(`const codec=(${foundation.createValueCodec.toString()})({profile:'control'});`,context);
  const result = vm.runInContext(`JSON.stringify=()=>{throw Error('patched JSON');};Object.keys=()=>[];Object.getOwnPropertyDescriptor=()=>null;Number.isFinite=()=>false;Set.prototype.has=()=>true;String.prototype.charCodeAt=()=>0;codec.encodeValue({present:undefined,zero:-0,text:'中😀'});`,context);
  assert.deepEqual(jsonHop(result),{t:'object',v:[['present',{t:'undefined'}],['zero',{t:'negative-zero'}],['text',{t:'string',v:'中😀'}]]});
});


test('actual fixed Worker runtime injects frozen network/storage facades through its private run port', async () => {
  const methods=[];
  const result=await worker('(async()=>{await AppStorage.setItem("n",0); const n=await storage.get("n"); const r=await axiosx.get("https://example.test/x"); return [n,r.data,Object.isFrozen(axiosx),typeof chrome];})()',envelope=>{
    assert.equal(envelope.operation.kind,'service'); assert.equal(envelope.identity.runId,'codec-run'); methods.push(envelope.operation.method);
    return envelope.operation.method==='AXIOS_GET'?{data:false,status:200}:envelope.operation.method==='CHROME_LOCAL_GET'?0:undefined;
  });
  assert.deepEqual(decodeValue(result.value),[0,false,true,'undefined']);
  assert.deepEqual(methods,['APPSTORAGE_SETITEM','CHROME_LOCAL_GET','AXIOS_GET']);
});
