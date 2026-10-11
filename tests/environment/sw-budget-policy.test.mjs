import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILD_POLICY,entryByteBudget} from '../../scripts/build-contract.mjs';

test('SW review at 320 KiB is not the production hard cap',()=>{
  assert.equal(BUILD_POLICY.serviceWorkerReviewBytes,320*1024);
  assert.equal(entryByteBudget('sw.js','production'),512*1024);
  assert(BUILD_POLICY.serviceWorkerReviewBytes<entryByteBudget('sw.js','production'));
  assert.equal(entryByteBudget('sw.js','development'),768*1024);
});
test('other fixed entries can grow from 320 KiB to 512 KiB without weakening packaging',()=>{
  assert.equal(BUILD_POLICY.productionBytes,512*1024);
  assert.equal(BUILD_POLICY.fixedEntryReviewBytes,320*1024);
  assert(BUILD_POLICY.fixedEntryReviewBytes<BUILD_POLICY.productionBytes);
  for(const file of ['ui/tool-shell.js','native-agent/transport.js','framework/sdk-main.js','agents/page-agent.js'])
    for(const mode of ['production','development'])assert.equal(entryByteBudget(file,mode),512*1024);
  assert.throws(()=>entryByteBudget('sw.js','release'),/Unknown build mode/);
});
test('security-sensitive classic packaging settings were not loosened',()=>{
  assert.equal(BUILD_POLICY.splitChunks,false);
  assert.equal(BUILD_POLICY.runtimeChunk,false);
  assert.deepEqual(BUILD_POLICY.formats,['iife']);
  assert.deepEqual(BUILD_POLICY.sourcemap,{production:false,development:true});
});
