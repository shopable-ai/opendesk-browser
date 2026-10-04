import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeValue, decodeValue, encodeOutcome, decodeOutcome, canonicalValue,
  encodeBase64, decodeBase64, bytesToBase64, base64ToBytes} from '../../src/platform/page-port/codec.js';

const jsonHop = value => JSON.parse(JSON.stringify(value));
const typedError = stage => error => error.code === 'E_VALUE_SERIALIZATION' && error.stage === stage;

test('Chrome JSON hop retains undefined, falsy values, nested presence and business PageBrigeCode', () => {
  for (const value of [undefined, false, 0, -0, '', null, [], [undefined, null],
    {PageBrigeCode:1, message:'domain', data:undefined}, {nested:{undefined:undefined}, text:'中文 😀'}]) {
    const actual = decodeValue(jsonHop(encodeValue(value)));
    assert.deepEqual(actual, value);
    if (typeof value === 'number') assert.ok(Object.is(actual, value));
  }
  assert.ok(Object.hasOwn(decodeValue(jsonHop(encodeValue({present:undefined}))), 'present'));
});

test('outcome protocol separates actual errors from all user business objects', () => {
  const business = {ok:false, PageBrigeCode:1, error:{message:'domain'}, data:undefined};
  assert.deepEqual(decodeOutcome(jsonHop(encodeOutcome({ok:true, value:business}))), {ok:true, value:business});
  assert.deepEqual(decodeOutcome(jsonHop(encodeOutcome({ok:true, value:undefined}))), {ok:true, value:undefined});
  const error = Object.assign(new TypeError('failure'), {code:'E_CUSTOM'});
  assert.deepEqual(decodeOutcome(jsonHop(encodeOutcome({ok:false, error}))),
    {ok:false, error:{name:'TypeError', code:'E_CUSTOM', message:'failure'}});
  assert.throws(() => decodeOutcome({ok:true, value:encodeValue(1)}), typedError('outcome'));
  assert.throws(() => decodeOutcome({...encodeOutcome({ok:true, value:1}), error:{}}), typedError('outcome'));
});

test('encoder rejects unsupported values, cycles and getters without evaluating a getter', () => {
  let reads = 0;
  const accessor = Object.defineProperty({}, 'value', {enumerable:true, get(){ reads++; return 1; }});
  const cycle = {}; cycle.self = cycle;
  for (const value of [NaN, Infinity, 1n, Symbol('value'), () => 1, new Date(), accessor, cycle, '\ud800'])
    assert.throws(() => encodeValue(value), typedError('encode'));
  assert.equal(reads, 0);
  assert.throws(() => encodeValue('12345', {maxBytes:8}), typedError('encode'));
  assert.throws(() => encodeValue([[1]], {maxDepth:1}), typedError('encode'));
});

test('decoder rejects forged tags, duplicate fields and byte limits; prototype names remain inert data', () => {
  for (const node of [{type:'undefined', value:1}, {type:'number', value:'0'}, {type:'boolean', value:0},
    {type:'number', value:1, negativeZero:true}, {type:'wat'},
    {type:'object', value:[['same', {type:'null'}], ['same', {type:'null'}]]}])
    assert.throws(() => decodeValue(node), typedError('decode'));
  const input = JSON.parse('{"__proto__":{"inert":true},"constructor":"data"}');
  const actual = decodeValue(jsonHop(encodeValue(input)));
  assert.deepEqual(actual, input);
  assert.equal(Object.getPrototypeOf(actual), Object.prototype);
  assert.equal(Object.prototype.inert, undefined);
  assert.throws(() => decodeValue(encodeValue('12345'), {maxBytes:8}), typedError('decode'));
});

test('typed canonical input is stable across key order and distinguishes missing from undefined', () => {
  assert.equal(canonicalValue({a:0, b:undefined}), canonicalValue({b:undefined, a:0}));
  assert.notEqual(canonicalValue({a:undefined}), canonicalValue({}));
  assert.notEqual(canonicalValue([undefined]), canonicalValue([null]));
});

test('Base64 string API preserves UTF-8 and rejects malformed Base64 and UTF-8', () => {
  for (const text of ['', '中文 😀', '"quotes"\n\\slashes']) assert.equal(decodeBase64(encodeBase64(text)), text);
  for (const encoded of ['YQ', 'YQ===', 'YR==', 'YQ==\n', '!!!!']) assert.throws(() => decodeBase64(encoded), typedError('base64'));
  assert.throws(() => decodeBase64('/w=='), typedError('utf8'));
  assert.throws(() => encodeBase64('\ud800'), typedError('utf8'));
  assert.deepEqual(base64ToBytes(bytesToBase64(new Uint8Array([0, 255, 1]))), new Uint8Array([0, 255, 1]));
  assert.throws(() => bytesToBase64(new Uint8Array(3), {maxBytes:2}), typedError('base64'));
});
