import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MAX_BYTES,encode,requestShape} from '../../native-agent/wire.mjs';

const digest = source => createHash('sha256').update(source).digest('hex');
const sourceBytes = source => Buffer.byteLength(source,'utf8');
const target = {windowId:1,tabId:1,frameId:0,documentId:'test-document',
  url:'https://example.com/',origin:'https://example.com'};
function runStart(source) {
  return {v:1,kind:'request',method:'run.start',requestId:'esm-r21-admission',params:{
    registrationId:'host-registration',sourceHash:digest(source),sourceBytes:sourceBytes(source),
    target,source:{kind:'draft',sourceUtf8:source},params:{},deadlineMs:30000}};
}
function projectResponse(source) {
  return {v:1,kind:'dev.response',providerEpoch:'test-epoch',requestId:'esm-r21-resolve',result:{
    bindingId:'local-test',projectId:'test.controller',runtimeKind:'controller',
    entryFormat:'async-main',sourceUtf8:source,sourceHash:digest(source),
    sourceBytes:sourceBytes(source),inputHash:'b'.repeat(64),cacheHit:false,
    capturedAt:'2026-10-11T03:43:00Z',siteOrigins:['https://example.com']}};
}

test('controller build-length-valid source is rejected before oversized Native run.start admission',()=>{
  const source='/*'+'x'.repeat(61396)+'*/'; // Valid side-effect-free classic JS: 61,400 source bytes.
  assert.equal(sourceBytes(source),61400);
  assert.ok(sourceBytes(source)<=65536,'controller build source-byte contract');
  const request=runStart(source);
  assert.ok(Buffer.byteLength(JSON.stringify(request),'utf8')>MAX_BYTES);
  assert.throws(()=>requestShape(request),{code:'E_LIMIT'});
  const response=projectResponse(source);
  assert.ok(Buffer.byteLength(JSON.stringify(response),'utf8')>MAX_BYTES);
  assert.throws(()=>encode(response),{code:'E_LIMIT'});
});

test('escaped source characters count toward complete Native JSON, not raw source-byte size',()=>{
  const source='/*'+'\n'.repeat(34996)+'*/'; // 35,000 source bytes, 34,996 escaped newlines.
  assert.equal(sourceBytes(source),35000);
  assert.ok(sourceBytes(source)<=65536);
  const request=runStart(source);
  const response=projectResponse(source);
  assert.ok(Buffer.byteLength(JSON.stringify(request),'utf8')>MAX_BYTES);
  assert.ok(Buffer.byteLength(JSON.stringify(response),'utf8')>MAX_BYTES);
  assert.throws(()=>requestShape(request),{code:'E_LIMIT'});
  assert.throws(()=>encode(response),{code:'E_LIMIT'});
});

test('ordinary smaller source still encodes and an oversized Provider reply can return a bounded error',()=>{
  const source='/*'+'x'.repeat(49996)+'*/';
  const request=runStart(source);
  assert.equal(requestShape(request),request);
  assert.ok(encode(projectResponse(source)).length<=MAX_BYTES);
  const oversize=projectResponse('/*'+'x'.repeat(61396)+'*/');
  assert.throws(()=>encode(oversize),{code:'E_LIMIT'});
  const bounded={...oversize,result:undefined,
    error:{code:'E_LIMIT',message:'Local execution payload exceeds the Native message limit'}};
  assert.doesNotThrow(()=>encode(bounded));
});

test('full dev.response and run.start accept 61439/61440 and diagnose exactly 61441 bytes',()=>{
  for(const make of [projectResponse,runStart]){
    for(const size of [MAX_BYTES-1,MAX_BYTES,MAX_BYTES+1]){
      const base='/*'+'x'.repeat(59000)+'*/';
      const overhead=Buffer.byteLength(JSON.stringify(make(base)))-Buffer.byteLength(base);
      const source='/*'+'x'.repeat(size-overhead-4)+'*/',message=make(source);
      assert.equal(Buffer.byteLength(JSON.stringify(message)),size);
      const check=()=>make===runStart?requestShape(message):encode(message);
      if(size<=MAX_BYTES){assert.doesNotThrow(check);assert.equal(encode(message).length,size);}
      else assert.throws(check,error=>{
        assert.equal(error.code,'E_LIMIT');
        assert.match(error.message,/jsonBytes=61441, limitBytes=61440/);return true;
      });
    }
  }
});

test('each escaping class and UTF-8 is measured on full JSON without truncating execution source',()=>{
  for(const text of ['\n','"','\\','中文😀','\u0000\u001f']){
    const source='/*'+text.repeat(40000)+'*/';
    for(const message of [runStart(source),projectResponse(source)]){
      const bytes=Buffer.byteLength(JSON.stringify(message),'utf8');
      assert.ok(bytes>MAX_BYTES);
      assert.throws(()=>encode(message),error=>{
        assert.equal(error.code,'E_LIMIT');assert.ok(error.message.includes('jsonBytes='+bytes));return true;
      });
      assert.equal(message.params?.source.sourceUtf8||message.result.sourceUtf8,source);
      assert.doesNotThrow(()=>encode(projectResponse('async function main(){return 7;}')));
    }
  }
});
