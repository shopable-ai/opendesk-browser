import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILD_POLICY,PACKAGE_ENTRIES,entryByteBudget} from '../../scripts/build-contract.mjs';
import config from '../../wxt.config.mjs';

test('SW keeps its 2 MiB production cap and allows 8 MiB in development',()=>{
  assert.equal(BUILD_POLICY.serviceWorkerReviewBytes,512*1024);
  assert.equal(entryByteBudget('sw.js','production'),2*1024*1024);
  assert(BUILD_POLICY.serviceWorkerReviewBytes < entryByteBudget('sw.js','production'));
  assert(entryByteBudget('sw.js','production') > 320*1024,'old 320 KiB hard cap must not return');
  assert.equal(entryByteBudget('sw.js','development'),8*1024*1024);
});
test('every fixed development entry allows 8 MiB while production budgets remain scoped',()=>{
  assert.equal(BUILD_POLICY.productionBytes,512*1024);
  assert.equal(BUILD_POLICY.fixedEntryReviewBytes,320*1024);
  assert(BUILD_POLICY.fixedEntryReviewBytes<BUILD_POLICY.productionBytes);
  for(const file of ['native-agent/transport.js','framework/sdk-main.js','agents/page-agent.js'])
    assert.equal(entryByteBudget(file,'production'),512*1024);
  for(const entry of Object.keys(PACKAGE_ENTRIES))
    assert.equal(entryByteBudget(entry+'.js','development'),8*1024*1024,entry);
  assert.equal(entryByteBudget('ui/tool-shell.js','production'),3*1024*1024);
  assert.equal(BUILD_POLICY.toolShellDevelopmentBytes,8*1024*1024);
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
  await assert.doesNotReject(enforce('development',8*1024*1024));
  await assert.rejects(enforce('development',8*1024*1024+1),{budgetBytes:8*1024*1024});
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
    for(const [entry,target,productionLimit] of [
      [{name:'background',type:'background'},'sw.js',2*1024*1024],
      [{name:'page-agent',type:'unlisted-script'},'agents/page-agent.js',512*1024],
      [{name:'settings',type:'unlisted-script'},'native-agent/settings.js',576*1024],
      [{name:'sidebar-tool-host',type:'unlisted-script'},'ui/sidebar-tool-host.js',1024*1024]
    ]){
      const limit=mode==='development'?8*1024*1024:productionLimit;
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

test('production React Workspace allowance applies only to the exact settings entry',()=>{
  assert.equal(entryByteBudget('native-agent/settings.js','production'),576*1024);
  for(const path of ['settings.js','native-agent/settings-copy.js','native-agent/transport.js'])
    assert.equal(entryByteBudget(path,'production'),512*1024);
});

test('development gate measures UTF-8 bytes rather than JavaScript string length',async t=>{
  t.mock.method(console,'error',()=>{});
  const target='agents/page-agent.js',limit=8*1024*1024;
  const build={mode:'development',build:{lib:{},rollupOptions:{},terserOptions:{},sourcemap:false},plugins:[]};
  config.hooks['vite:build:extendConfig']([{name:'page-agent',type:'unlisted-script'}],build);
  const gate=build.plugins.find(plugin=>plugin.name==='opendesk-fixed-page-agent');
  const enforce=code=>gate.generateBundle({}, {[target]:{
    type:'chunk',fileName:target,imports:[],dynamicImports:[],modules:{},code
  }});
  const code='é'.repeat(limit/2);
  await assert.doesNotReject(enforce(code));
  await assert.rejects(enforce(code+'é'),{target,bytes:limit+2,budgetBytes:limit});
});
