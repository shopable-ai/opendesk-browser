import test from 'node:test';
import assert from 'node:assert/strict';
import {annotateMindmapError,describeMindmapError,deserializeMindmapError,appendMindmapCleanup}
  from '../src/diagnostics.js';

test('annotation retains the original Error, fields, stack and first stage',()=>{
  const failure=Object.assign(new TypeError('editor mount failed'),{code:'E_EDITOR'});
  failure.stack='TypeError: editor mount failed\n    at mount (xmind-adapter.js:12:4)';
  const stack=failure.stack;
  assert.equal(annotateMindmapError(failure,'frame.init'),failure);
  assert.equal(annotateMindmapError(failure,'frame.fit'),failure);
  assert.deepEqual(describeMindmapError(failure),{stage:'frame.init',code:'E_EDITOR',
    name:'TypeError',message:'editor mount failed',stack});
});

test('describing an unannotated Error does not prevent a later precise annotation',()=>{
  const failure=new Error('not initialized');
  assert.equal(describeMindmapError(failure).stage,'unknown');
  assert.equal(failure.mindmapStage,undefined);
  assert.equal(annotateMindmapError(failure,'frame.init').mindmapStage,'frame.init');
});

test('non-Error and null throws become usable diagnostics without serializing objects',()=>{
  for(const value of [null,undefined,42,'mount failed',{message:'load failed',code:'E_LOAD',tree:'PRIVATE'}]){
    const error=annotateMindmapError(value,'frame.create');
    assert.ok(error instanceof Error);
    const diagnostic=describeMindmapError(error);
    assert.equal(diagnostic.stage,'frame.create');assert.ok(diagnostic.message);
    assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE/);
  }
  const frozen=Object.freeze(new TypeError('frozen failure'));
  assert.equal(annotateMindmapError(frozen,'frame.init').stack,frozen.stack);
});

test('serialization redacts sensitive text in messages, frames and nested failures',()=>{
  const failure=Object.assign(new TypeError(
    'fit failed https://chatgpt.com/c/private?token=secret person@example.com Bearer short-secret '+
    'token=short-secret account=someone sk-test-secret "private response excerpt"'),{code:'E_FIT'});
  failure.stack='TypeError: fit failed\n    at fit (https://private.example/source.js:10:2)\n'+
    '    at mount (xmind-adapter.js:24:8)\n token=secret person@example.com `private text`';
  failure.cause=new Error('response “another private excerpt” eyJabc.def.signature "multi\nline response"');
  failure.tree={title:'TREE_MUST_NOT_COPY'};failure.body='BODY_MUST_NOT_COPY';
  failure.cleanupErrors=[new Error('password=private')];
  const diagnostic=describeMindmapError(annotateMindmapError(failure,'frame.fit'));
  const wire=JSON.stringify(diagnostic);
  assert.doesNotMatch(wire,/chatgpt|private\.example|person@|short-secret|sk-test|private response|another private|eyJabc|TREE_MUST|BODY_MUST|password=private|line response/);
  assert.match(diagnostic.message,/fit failed/);
  assert.match(diagnostic.stack,/at mount \(xmind-adapter.js:24:8\)/);
  assert.match(diagnostic.stack,/\[url\]:10:2/);
  assert.equal(diagnostic.cause.name,'Error');assert.equal(diagnostic.cleanupErrors.length,1);
  assert.equal(failure.message.includes('person@example.com'),true);
});

test('diagnostics bound text, branching, cycles and nesting and round trip safely',()=>{
  const error=annotateMindmapError(new Error('x '.repeat(20000)),'frame.fit');
  error.stack='at frame.js:8:2\n'.repeat(1000);error.cause=error;
  error.errors=Array.from({length:20},()=>new Error('child'));
  const diagnostic=describeMindmapError(error);
  assert.ok(diagnostic.message.length<=800);assert.ok(diagnostic.stack.length<=2400);
  assert.equal(diagnostic.cause,undefined);assert.equal(diagnostic.errors.length,3);
  assert.ok(JSON.stringify(diagnostic).length<30000);
  const restored=deserializeMindmapError(diagnostic);
  assert.ok(restored instanceof Error);assert.equal(restored.mindmapStage,'frame.fit');
  assert.equal(restored.stack,diagnostic.stack);assert.equal(restored.errors.length,3);
});

test('peer payload validation rejects malformed and oversized diagnostics',()=>{
  for(const input of [null,'failure',{code:42},{code:'E_BAD',message:{}},
    {code:'E_BAD',stack:'x'.repeat(2401)},{code:'E_BAD',stage:[]},
    {code:'E_BAD',errors:[null]},{code:'E_BAD',cause:{message:'missing code'}},
    {code:'E_BAD',cleanupErrors:Array(4).fill({code:'E_CLOSE'})}]){
    assert.equal(deserializeMindmapError(input),null);
  }
  const error=deserializeMindmapError({code:'E_FIT',message:'https://private.example token=private',
    tree:{title:'never copy'}});
  assert.doesNotMatch(error.message,/private/);assert.equal(error.tree,undefined);
});

test('cleanup diagnostics append while the primary error and its cause remain intact',()=>{
  const cause=new Error('original cause');
  const primary=annotateMindmapError(new TypeError('init failed',{cause}),'frame.init');
  const cleanup=new RangeError('close failed');
  assert.equal(appendMindmapCleanup(primary,cleanup),primary);
  assert.equal(primary.cause,cause);assert.equal(primary.message,'init failed');
  assert.equal(primary.cleanupErrors[0],cleanup);
  const diagnostic=describeMindmapError(primary);
  assert.equal(diagnostic.stage,'frame.init');assert.equal(diagnostic.cleanupErrors[0].stage,'frame.destroy');
});
