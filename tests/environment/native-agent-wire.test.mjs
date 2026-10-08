import test from 'node:test';
import assert from 'node:assert/strict';
import {frame,NativeDecoder,LineDecoder,encode,requestShape,MAX_BYTES} from '../../native-agent/wire.mjs';
import {agentCanonical,agentDigest,agentValidateRequest} from '../../src/native-agent/protocol.js';

test('native framing uses UTF-8 byte length and handles split multibyte boundaries',()=>{
  const msg={v:1,kind:'hello',message:'中文 ✓'};
  const bytes=frame(msg);
  assert.equal(bytes.readUInt32LE(0),Buffer.byteLength(JSON.stringify(msg),'utf8'));
  const decoder=new NativeDecoder();
  assert.deepEqual(decoder.push(bytes.subarray(0,7)),[]);
  assert.deepEqual(decoder.push(bytes.subarray(7)),[msg]);
});
test('private CLI line framing has bounded buffer and independent messages',()=>{
  const decoder=new LineDecoder();
  assert.deepEqual(decoder.push(Buffer.from('{"v":1}\n{"v"')), [{v:1}]);
  assert.deepEqual(decoder.push(Buffer.from(':2}\n')), [{v:2}]);
  assert.throws(()=>new LineDecoder().push(Buffer.alloc(MAX_BYTES+1)),{code:'E_LIMIT'});
  assert.throws(()=>encode({text:'中'.repeat(MAX_BYTES)}),{code:'E_LIMIT'});
});
test('reject unsupported transport operations and malformed browser requests',()=>{
  assert.throws(()=>requestShape({v:1,kind:'request',requestId:'x',method:'executeScript',params:{}}),{code:'E_SCHEMA'});
  assert.throws(()=>agentValidateRequest({v:1,kind:'request',requestId:'x',method:'dom.eval',params:{}}),{code:'E_SCHEMA'});
});
test('stable digest pins equivalent JSON key order and rejects prototype pollution',async()=>{
  assert.equal(agentCanonical({z:{b:2,a:1},a:[true,null]}),
    agentCanonical({a:[true,null],z:{a:1,b:2}}));
  assert.equal(await agentDigest({z:1,a:2}),await agentDigest({a:2,z:1}));
  assert.notEqual(await agentDigest({a:2}),await agentDigest({a:3}));
  assert.throws(()=>agentCanonical(JSON.parse('{"__proto__":{"evil":true}}')),{code:'E_SCHEMA'});
});
