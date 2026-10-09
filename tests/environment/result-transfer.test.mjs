import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeResultFrames,createResultAssembler,RESULT_TRANSFER_LIMITS} from '../../src/framework/control/result-transfer.js';
import {decodeValue} from '../../src/framework/control/value.js';

test('small scalar and object results retain the original single-frame protocol',()=>{
  for(const value of [undefined,null,0,-0,false,'',[],{x:undefined,n:-0}]){
    const frames=encodeResultFrames(value);
    assert.equal(frames.length,1);
    const result=createResultAssembler().accept(frames[0]);
    assert.deepEqual(decodeValue(result.wire),value);
  }
});
test('large strings and mixed Unicode objects survive ordered, bounded frames without truncation',()=>{
  const value={html:'<html>中😀\\\"'.repeat(9000),undefinedValue:undefined,zero:-0};
  const frames=encodeResultFrames(value);
  assert.equal(frames[0].kind,'result-begin');
  assert.equal(frames.at(-1).kind,'result-end');
  assert(frames[0].byteLength>65536&&frames[0].byteLength<=RESULT_TRANSFER_LIMITS.maxBytes);
  let out;
  const receiver=createResultAssembler();
  for(const frame of frames){
    if(frame.kind==='result-part')assert(frame.bytes.byteLength<=RESULT_TRANSFER_LIMITS.chunkBytes);
    const complete=receiver.accept(frame);
    if(complete)out=complete;
  }
  assert.deepEqual(decodeValue(out.wire,{maxBytes:RESULT_TRANSFER_LIMITS.maxBytes}),value);
});
test('over-limit results fail with a distinct code and never silently clip output',()=>{
  assert.throws(()=>encodeResultFrames('x'.repeat(300000)),{code:'E_RESULT_TOO_LARGE'});
});
test('tampered, reordered, duplicate and incomplete frames never resolve as a result',()=>{
  const frames=encodeResultFrames('a'.repeat(90000));
  for(const mutated of [
    [frames[0],frames[2]],
    [frames[0],frames.at(-1)],
    [{kind:'result-begin',byteLength:RESULT_TRANSFER_LIMITS.maxBytes+1}],
    [frames[0],frames[1],frames[1]]
  ]){
    const decoder=createResultAssembler();
    assert.throws(()=>{for(const frame of mutated)decoder.accept(frame);},{code:'E_RESULT_FORMAT'});
  }
  const mutated=structuredClone(frames);
  mutated[1].bytes[0]=0xff;
  const decoder=createResultAssembler();
  assert.throws(()=>{for(const frame of mutated)decoder.accept(frame);},{code:'E_RESULT_FORMAT'});
});
test('explicit reset wipes a pending transfer and prevents stale end/retry',()=>{
  const frames=encodeResultFrames('a'.repeat(90000)),decoder=createResultAssembler();
  decoder.accept(frames[0]);decoder.accept(frames[1]);decoder.reset();
  assert.throws(()=>decoder.accept(frames.at(-1)),{code:'E_RESULT_FORMAT'});
});
