import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import schema from '../../src/platform/schema.js';
import {compactSchemaSource} from '../../scripts/compact-schema.mjs';

async function loadCompacted(source,options={}) {
  const compiled=compactSchemaSource(source,options);
  const uri='data:text/javascript;base64,'+Buffer.from(compiled,'utf8').toString('base64');
  return {compiled,decoded:(await import(uri)).default};
}

test('fixed production protocol Schema uses bounded data packing and decodes byte-for-byte to the audited object',async()=>{
  const original=await readFile('src/platform/schema.js','utf8');
  const {compiled,decoded}=await loadCompacted(original,{adaptive:true});
  assert.equal(compactSchemaSource(original,{adaptive:true}),compiled,'packing must be deterministic');
  assert.ok(Buffer.byteLength(compiled,'utf8') < 24000,'static packed Schema must remain smaller than the old 14-bit implementation');
  assert.deepEqual(decoded,schema);
  assert.equal(JSON.stringify(decoded),JSON.stringify(schema),'property order and JSON bytes remain unchanged');
  const legacy=await loadCompacted(original);
  assert.deepEqual(legacy.decoded,schema,'default non-SW encoding still gives identical old schema');
  assert.ok(compiled.length < legacy.compiled.length,'the SW-only option must save bundled bytes');
  assert.doesNotMatch(compiled,/\beval\s*\(|\bnew Function\s*\(/);
});

test('small and non-ASCII schemas still round-trip through existing smaller-of-two-formats selection',async()=>{
  const value={message:'你好 ✓ 😀',nested:{a:[true,null,1],b:'東京'},count:0};
  const {decoded}=await loadCompacted('// reviewed inline JSON\nexport default '+JSON.stringify(value)+';\n');
  assert.deepEqual(decoded,value);
});


// Exercise the selected fixed-Schema decoder, without widening the production
// API to accept arbitrary runtime data. All mutations stay in Node test modules.
async function loadPackedBytes(bytes,size) {
  const original=await readFile('src/platform/schema.js','utf8');
  const compiled=compactSchemaSource(original,{adaptive:true});
  const marker=/const packed="[A-Za-z0-9+/=]*",size=\d+;/;
  assert.match(compiled,marker,'the production Schema must select bounded back-references');
  const replacement='const packed='+JSON.stringify(Buffer.from(bytes).toString('base64'))+',size='+size+';';
  const changed=compiled.replace(marker,replacement);
  return (await import('data:text/javascript;base64,'+Buffer.from(changed).toString('base64'))).default;
}

test('bounded Schema back-references preserve overlap, UTF-8 and JSON ordering',async()=>{
  // Two literals followed by seven overlapping bytes at distance one, then quote.
  assert.equal(await loadPackedBytes([1,34,97,132,0,1,0,34],10),'aaaaaaaa');
  const value={message:'你好 ✓ 😀',literal:'{"type":"string"}',nested:{z:0,a:false}};
  const bytes=Buffer.from(JSON.stringify(value),'utf8');
  assert.ok(bytes.length<=128);
  const decoded=await loadPackedBytes([bytes.length-1,...bytes],bytes.length);
  assert.deepEqual(decoded,value);assert.equal(JSON.stringify(decoded),JSON.stringify(value));
});

test('bounded Schema decoder rejects truncated input, invalid distance and output length mismatch',async()=>{
  for(const [name,bytes,size] of [
    ['truncated literal',[1,34],2],
    ['truncated distance',[128,0],3],
    ['zero distance',[128,0,0],3],
    ['distance before output',[128,0,1],3],
    ['output overflow',[1,34,34],1],
    ['output underfill',[1,34,34],3],
    ['trailing data',[1,34,34,0,65],2],
    ['malformed UTF-8',[0,255],1],
    ['malformed JSON',[0,65],1]
  ])await assert.rejects(()=>loadPackedBytes(bytes,size),undefined,name);
});
