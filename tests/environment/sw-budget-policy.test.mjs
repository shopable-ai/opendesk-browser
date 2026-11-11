import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILD_POLICY,entryByteBudget} from '../../scripts/build-contract.mjs';
import config from '../../wxt.config.mjs';

test('SW in both modes has a 2 MiB cap with a non-blocking 512 KiB review line',()=>{
  assert.equal(BUILD_POLICY.serviceWorkerReviewBytes,512*1024);
  assert.equal(entryByteBudget('sw.js','production'),2*1024*1024);
  assert(BUILD_POLICY.serviceWorkerReviewBytes < entryByteBudget('sw.js','production'));
  assert(entryByteBudget('sw.js','production') > 320*1024,'old 320 KiB hard cap must not return');
  assert.equal(entryByteBudget('sw.js','development'),2*1024*1024);
  assert.equal(entryByteBudget('sw.js','development'),entryByteBudget('sw.js','production'));
});
test('other fixed entries can grow from 320 KiB to 512 KiB without weakening packaging',()=>{
  assert.equal(BUILD_POLICY.productionBytes,512*1024);
  assert.equal(BUILD_POLICY.fixedEntryReviewBytes,320*1024);
  assert(BUILD_POLICY.fixedEntryReviewBytes<BUILD_POLICY.productionBytes);
  for(const file of ['native-agent/transport.js','framework/sdk-main.js','agents/page-agent.js'])
    for(const mode of ['production','development'])assert.equal(entryByteBudget(file,mode),512*1024);
  assert.equal(entryByteBudget('ui/tool-shell.js','production'),3*1024*1024);
  assert.equal(entryByteBudget('ui/tool-shell.js','development'),3*1024*1024);
  assert.equal(BUILD_POLICY.toolShellReviewBytes,2*1024*1024);
  assert.throws(()=>entryByteBudget('sw.js','release'),/Unknown build mode/);
});
test('bounded shell budgets accept measured production and reject +1 byte in each mode',async t=>{
  t.mock.method(console,'error',()=>{});
  const enforce=(mode,bytes)=>{
    const build={mode,build:{lib:{},rollupOptions:{},terserOptions:{},sourcemap:false},plugins:[]};
    config.hooks['vite:build:extendConfig']([{name:'tool-shell',type:'unlisted-script'}],build);
    const gate=build.plugins.find(plugin=>plugin.name==='opendesk-fixed-tool-shell');
    const chunk={type:'chunk',fileName:'ui/tool-shell.js',imports:[],dynamicImports:[],modules:{},code:' '.repeat(bytes)};
    return gate.generateBundle({}, {'ui/tool-shell.js':chunk});
  };
  const observed=1098124;
  await assert.doesNotReject(enforce('development',observed));
  await assert.doesNotReject(enforce('production',observed));
  await assert.doesNotReject(enforce('production',3*1024*1024));
  await assert.rejects(enforce('production',3*1024*1024+1),{budgetBytes:3*1024*1024});
  await assert.doesNotReject(enforce('development',3*1024*1024));
  await assert.rejects(enforce('development',3*1024*1024+1),{budgetBytes:3*1024*1024});
});
test('security-sensitive classic packaging settings were not loosened',()=>{
  assert.equal(BUILD_POLICY.splitChunks,false);
  assert.equal(BUILD_POLICY.runtimeChunk,false);
  assert.deepEqual(BUILD_POLICY.formats,['iife']);
  assert.deepEqual(BUILD_POLICY.sourcemap,{production:false,development:true});
});

test('SW and ordinary entry byte gates enforce exact boundaries in both modes without a build',async t=>{
  t.mock.method(console,'error',()=>{});
  for(const mode of ['production','development']){
    for(const [entry,target,limit] of [
      [{name:'background',type:'background'},'sw.js',2*1024*1024],
      [{name:'page-agent',type:'unlisted-script'},'agents/page-agent.js',512*1024],
      [{name:'settings',type:'unlisted-script'},'native-agent/settings.js',576*1024]
    ]){
      const build={mode,build:{lib:{},rollupOptions:{},terserOptions:{},sourcemap:false},plugins:[]};
      config.hooks['vite:build:extendConfig']([entry],build);
      const gate=build.plugins.find(plugin=>plugin.name===`opendesk-fixed-${entry.name}`);
      const enforce=bytes=>gate.generateBundle({}, {[target]:{
        type:'chunk',fileName:target,imports:[],dynamicImports:[],modules:{},code:' '.repeat(bytes)
      }});
      await assert.doesNotReject(enforce(limit));
      await assert.rejects(enforce(limit+1),{target,budgetBytes:limit});
    }
  }
});

test('React Workspace allowance applies only to the exact settings entry',()=>{
  for(const mode of ['production','development']){
    assert.equal(entryByteBudget('native-agent/settings.js',mode),576*1024);
    for(const path of ['settings.js','native-agent/settings-copy.js','native-agent/transport.js'])
      assert.equal(entryByteBudget(path,mode),512*1024);
  }
});
