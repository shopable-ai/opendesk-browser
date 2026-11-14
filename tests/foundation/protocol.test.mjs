import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canonical, digest, digestUtf8, validate, sameIdentity} from '../../src/platform/protocol.js';

test('frozen byte oracle preserves Chinese, zero, false, empty and null', async () => {
  const oracle = JSON.parse(await readFile(new URL('../../contracts/fixtures/canonical.json', import.meta.url)));
  assert.equal(canonical(oracle.input), oracle.canonicalUtf8);
  assert.equal(await digest(oracle.input), oracle.sha256);
  assert.equal(canonical({fraction:12.5,negativeZero:-0}), '{"fraction":12.5,"negativeZero":0}');
});
test('hostile JSON cannot enter hashes or durable protocol', () => {
  for (const value of [NaN,Infinity,undefined,()=>{},'\ud800','\udc00',JSON.parse('{"__proto__":1}'),{constructor:1}]) {
    assert.throws(() => canonical(value), error => error.code === 'E_SCHEMA');
  }
  let deep = null; for (let i=0;i<14;i++) deep = [deep];
  assert.throws(() => canonical(deep), /depth/);
});
test('native and fallback UTF-16 admission retain exact canonical bytes and digest rejection', async () => {
  const native = Object.getOwnPropertyDescriptor(String.prototype, 'isWellFormed');
  const valid = ['', '中文\u0000"\\', '\ud800\udc00', '\udbff\udfff',
    'a'.repeat(8191)+'\ud83d\ude00'+'b'.repeat(8191), '\ufffd\ufeff'];
  const invalid = ['\ud800','\udbff','\udc00','\udfff','\ud800\ud800','\udc00\ud800',
    '\ud800a','a\udfff','\ud800\udc00\udfff','\ud800\ud800\udc00'];
  const expected = await Promise.all(valid.map(async value => ({bytes:JSON.stringify(value), hash:await digestUtf8(value)})));
  try {
    for (const fallback of [false,true]) {
      if (fallback) Object.defineProperty(String.prototype, 'isWellFormed', {configurable:true,writable:true,value:undefined});
      for (const [i,value] of valid.entries()) {
        assert.equal(canonical(value),expected[i].bytes);
        assert.equal(canonical({value}),'{"value":'+expected[i].bytes+'}');
        assert.equal(await digestUtf8(value),expected[i].hash);
      }
      for (const value of invalid) {
        assert.throws(() => canonical({value}),error => error.code === 'E_SCHEMA' && error.message === 'Unpaired UTF-16 surrogate');
        await assert.rejects(digestUtf8(value),error => error.code === 'E_SCHEMA' && error.message === 'Unpaired UTF-16 surrogate');
      }
    }
  } finally {
    if (native) Object.defineProperty(String.prototype, 'isWellFormed', native);
    else delete String.prototype.isWellFormed;
  }
});
test('strict wire shapes reject unknown keys and unsafe integers', async () => {
  const template = JSON.parse(await readFile(new URL('../../contracts/fixtures/transaction-template.json', import.meta.url)));
  assert.equal(validate('TemplateRevision', template), template);
  assert.throws(() => validate('TemplateRevision', {...template, javascript:'alert(1)'}), /unknown javascript/);
  assert.throws(() => validate('TemplateRevision', {...template, revision:9007199254740992}), /wrong type/);
  assert.throws(() => validate('TemplateRevision', {...template, pagination:{mode:'none', selector:'.next'}}), /variant/);
});
test('ignoring a control revision never ignores epoch/document identity', () => {
  const identity = {runRevision:1, ownerEpoch:1, target:{documentId:'document-a'}};
  assert.equal(sameIdentity(identity,{...identity,runRevision:2},{ignoreRevision:true}),true);
  assert.equal(sameIdentity(identity,{...identity,ownerEpoch:2},{ignoreRevision:true}),false);
  assert.equal(sameIdentity(identity,{...identity,target:{documentId:'document-b'}},{ignoreRevision:true}),false);
});
