import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deflateRawSync,constants} from 'node:zlib';
import {minify} from 'terser';
import {compactSchemaSource} from '../../scripts/compact-schema.mjs';

const schemaSource=await readFile(new URL('../../src/platform/schema.js',import.meta.url),'utf8');
const fixedSource=compactSchemaSource(schemaSource,{adaptive:true,fixedDeflate:true});
// Test the exact generated runtime decoder; this export exists only in Node tests.
const {unpackFixedSchema}=await import('data:text/javascript;base64,'+Buffer.from(fixedSource+'\nexport {unpackFixedSchema};\n').toString('base64'));
const packModuleFixed=value=>compactSchemaSource('export default '+JSON.stringify(value)+';',{fixedDeflate:true});

const encode=(bytes,options={level:9,strategy:constants.Z_FIXED})=>deflateRawSync(bytes,options).toString('base64');
const asJSON=value=>Buffer.from(JSON.stringify(value),'utf8');

test('fixed compression is explicit while default and upstream adaptive strategies remain available',async()=>{
  const fixedAgain=compactSchemaSource(schemaSource,{adaptive:true,fixedDeflate:true});
  assert.equal(fixedAgain,fixedSource);
  const defaultSource=compactSchemaSource(schemaSource),adaptiveSource=compactSchemaSource(schemaSource,{adaptive:true});
  assert.equal(defaultSource,compactSchemaSource(schemaSource,{fixedDeflate:false}));
  assert.equal(adaptiveSource,compactSchemaSource(schemaSource,{adaptive:true,fixedDeflate:false}));
  assert.doesNotMatch(defaultSource,/unpackFixedSchema/);
  const options={module:true,ecma:2022,compress:{passes:6,toplevel:true,unsafe:true},format:{comments:false}};
  const [fixed,adaptive]=await Promise.all([minify(fixedSource,options),minify(adaptiveSource,options)]);
  assert.ok(Buffer.byteLength(fixed.code)<Buffer.byteLength(adaptive.code),'SW codec selection uses emitted bytes, not unminified source length');
});

function bitsFrame(build){
  const bits=[];
  const raw=(value,count)=>{for(let i=0;i<count;i++) bits.push((value>>i)&1);};
  const code=(value,count)=>{for(let i=count-1;i>=0;i--) bits.push((value>>i)&1);};
  const literal=symbol=>{
    if(symbol<144)code(symbol+48,8);
    else if(symbol<256)code(symbol+256,9);
    else if(symbol<280)code(symbol-256,7);
    else code(symbol-88,8);
  };
  build({raw,code,literal});
  const bytes=Buffer.alloc(Math.ceil(bits.length/8));
  bits.forEach((bit,index)=>bytes[index>>3]|=bit<<(index&7));
  return bytes.toString('base64');
}

test('actual generated schema round-trips through fixed blocks before and after production Terser',async()=>{
  const source=await readFile(new URL('../../src/platform/schema.js',import.meta.url),'utf8');
  const expected=JSON.parse(source.slice(source.indexOf('export default ')+15).trim().replace(/;$/,''));
  const generated=packModuleFixed(expected);
  const compressed=(await minify(generated,{module:true,ecma:2022,compress:{passes:6,toplevel:true,unsafe:true},format:{comments:false}})).code;
  for(const source of [generated,compressed]){
    const decoded=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
    assert.deepEqual(decoded,expected);
    assert.equal(JSON.stringify(decoded),JSON.stringify(expected));
  }
  assert.ok(Buffer.byteLength(compressed)<10000);
  assert.doesNotMatch(generated,/\beval\s*\(|\bnew Function\s*\(|import\s*\(|fetch\s*\(/);
});

test('Unicode, empty values, dangerous property names, and overlapping long matches preserve JSON bytes',()=>{
  const keyCase=JSON.parse('{"__proto__":{"inherited":false},"constructor":"saved","prototype":["ok"]}');
  const values=[null,false,0,'',{},[],{text:'你好 ✓ 😀 東京 \u0000 " \\ \ud800'},keyCase,{long:'ab'.repeat(18000)}];
  for(const value of values){
    const raw=asJSON(value),decoded=unpackFixedSchema(encode(raw),raw.length);
    assert.deepEqual(decoded,value);
    assert.equal(JSON.stringify(decoded),raw.toString('utf8'));
  }
  assert.equal({}.inherited,undefined);
});

test('stored blocks and multiple fixed blocks decode through zlib-generated and independent bit fixtures',()=>{
  const value={stored:Array.from({length:15000},(_,index)=>`${index}:${index%97}`).join('|')};
  const raw=asJSON(value),stored=encode(raw,{level:0});
  assert.equal((Buffer.from(stored,'base64')[0]>>1)&3,0);
  assert.deepEqual(unpackFixedSchema(stored,raw.length),value);
  const twoBlocks=bitsFrame(({raw,literal})=>{
    raw(0,1);raw(1,2);literal(123);literal(256);
    raw(1,1);raw(1,2);literal(125);literal(256);
  });
  assert.deepEqual(unpackFixedSchema(twoBlocks,2),{});
});

test('every truncated prefix and wrong output length fail closed',()=>{
  const raw=asJSON({marker:'truncate me',repeat:'abcd'.repeat(50)}),packed=Buffer.from(encode(raw),'base64');
  for(let length=0;length<packed.length;length++)
    assert.throws(()=>unpackFixedSchema(packed.subarray(0,length).toString('base64'),raw.length));
  assert.throws(()=>unpackFixedSchema(packed.toString('base64'),raw.length-1));
  assert.throws(()=>unpackFixedSchema(packed.toString('base64'),raw.length+1));
  assert.throws(()=>unpackFixedSchema(Buffer.concat([packed,Buffer.from([0])]).toString('base64'),raw.length));
});

test('dynamic, reserved, malformed stored and invalid literal blocks fail closed',()=>{
  const malformed=[
    Buffer.from([5]).toString('base64'), // final dynamic-Huffman block
    Buffer.from([7]).toString('base64'), // final reserved block
    Buffer.from([1,2,0,0,0,123,125]).toString('base64'), // LEN/NLEN mismatch
    Buffer.from([1,2,0,253,255,123]).toString('base64'), // stored truncation
    ...[286,287].map(symbol=>bitsFrame(({raw,literal})=>{raw(1,1);raw(1,2);literal(symbol);})),
  ];
  for(const packed of malformed) assert.throws(()=>unpackFixedSchema(packed,2),/Invalid packaged schema/);
});

test('invalid back-reference distances, reserved distance symbols and output overflow fail closed',()=>{
  const beforeStart=bitsFrame(({raw,literal,code})=>{raw(1,1);raw(1,2);literal(257);code(0,5);});
  assert.throws(()=>unpackFixedSchema(beforeStart,3),/Invalid packaged schema/);
  for(const distance of [30,31]){
    const packed=bitsFrame(({raw,literal,code})=>{raw(1,1);raw(1,2);literal(65);literal(257);code(distance,5);});
    assert.throws(()=>unpackFixedSchema(packed,4),/Invalid packaged schema/);
  }
  const overflow=bitsFrame(({raw,literal,code})=>{raw(1,1);raw(1,2);literal(65);literal(285);code(0,5);});
  assert.throws(()=>unpackFixedSchema(overflow,10),/Invalid packaged schema/);
});

test('malformed UTF-8 and non-JSON output are rejected after bounded decompression',()=>{
  for(const raw of [Buffer.from([192,175]),Buffer.from('not-json')])
    assert.throws(()=>unpackFixedSchema(encode(raw),raw.length));
});
