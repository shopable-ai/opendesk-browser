import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import schema from '../../src/platform/schema.js';
import {compactSchemaSource} from '../../scripts/compact-schema.mjs';

async function loadCompacted(source) {
  const compiled=compactSchemaSource(source);
  const uri='data:text/javascript;base64,'+Buffer.from(compiled,'utf8').toString('base64');
  return {compiled,decoded:(await import(uri)).default};
}

test('fixed production protocol Schema uses variable-width LZW and decodes byte-for-byte to the audited object',async()=>{
  const original=await readFile('src/platform/schema.js','utf8');
  const {compiled,decoded}=await loadCompacted(original);
  assert.match(compiled,/Math\.log2\(257\+index\)/,'each code width must track dictionary growth');
  assert.ok(Buffer.byteLength(compiled,'utf8') < 24000,'static packed Schema must remain smaller than the old 14-bit implementation');
  assert.deepEqual(decoded,schema);
  assert.equal(JSON.stringify(decoded),JSON.stringify(schema),'property order and JSON bytes remain unchanged');
  assert.doesNotMatch(compiled,/\beval\s*\(|\bnew Function\s*\(/);
});

test('small and non-ASCII schemas still round-trip through existing smaller-of-two-formats selection',async()=>{
  const value={message:'你好 ✓ 😀',nested:{a:[true,null,1],b:'東京'},count:0};
  const {decoded}=await loadCompacted('// reviewed inline JSON\nexport default '+JSON.stringify(value)+';\n');
  assert.deepEqual(decoded,value);
});
