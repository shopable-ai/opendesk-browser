import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectScript,verifyManifest} from '../../scripts/verify-package.mjs';
import {BUILD_POLICY,FIXED_OUTPUTS,PACKAGE_ENTRIES} from '../../scripts/build-contract.mjs';
import {BUILTIN_CATALOG} from '../../src/libs/catalog.js';
import {installNativeTransport,NATIVE_TRANSPORT_KEY} from '../../src/native-agent/transport.js';

test('Native remains optional after merging the current permission catalog',async()=>{
  const manifest=JSON.parse(await readFile('manifest.json','utf8'));
  assert.equal(manifest.permissions.includes('nativeMessaging'),false);
  assert.equal(manifest.optional_permissions.filter(p=>p==='nativeMessaging').length,1);
  assert.doesNotThrow(()=>verifyManifest(manifest));
  assert.throws(()=>verifyManifest({...manifest,permissions:[...manifest.permissions,'nativeMessaging']}),/Unexpected required browser API permissions/);
});

test('independent SW budget and fixed packaged Native transport entry',()=>{
  assert.equal(BUILD_POLICY.productionBytes,512*1024);
  assert.equal(BUILD_POLICY.fixedEntryReviewBytes,320*1024);
  assert.equal(BUILD_POLICY.serviceWorkerReviewBytes,512*1024);
  assert.equal(BUILD_POLICY.serviceWorkerProductionBytes,1024*1024);
  assert.equal(BUILD_POLICY.developmentBytes,1536*1024);
  assert.equal(PACKAGE_ENTRIES['native-agent/transport'],'./src/native-agent/transport.js');
  assert.equal(FIXED_OUTPUTS.transport,'native-agent/transport.js');
  // Sidebar Tools and R15 Page core remain separately reviewed fixed entries;
  // Native still has exactly one pinned same-extension transport script.
  assert.equal(PACKAGE_ENTRIES['sidebar-tools/bridge'],'./src/sidebar-tools/bridge.js');
  assert.equal(FIXED_OUTPUTS.bridge,'sidebar-tools/bridge.js');
  assert.equal(PACKAGE_ENTRIES['libs/runtime/page-core'],'./src/entrypoints/page-core.js');
  assert.equal(FIXED_OUTPUTS['page-core'],'libs/runtime/page-core.js');
  // No second copy of the WXT entry registry: additions such as native
  // context menus must not require changing an arbitrary hardcoded count.
  const entries=Object.keys(PACKAGE_ENTRIES),unlisted=entries.filter(name=>name!=='sw');
  assert.equal(entries.filter(name=>name==='sw').length,1);
  assert.equal(new Set(unlisted.map(name=>name.split('/').at(-1))).size,unlisted.length);
  assert.equal(Object.keys(FIXED_OUTPUTS).length,unlisted.length);
  for(const name of unlisted)
    assert.equal(FIXED_OUTPUTS[name.split('/').at(-1)],name+'.js');
  const npmBundles=Object.values(BUILTIN_CATALOG.libraries)
    .filter(row=>row.origin==='npm').map(row=>row.output.slice(0,-3)).sort();
  assert.deepEqual(unlisted.filter(name=>name.startsWith('libs/packages/')).sort(),npmBundles,
    'every npm public library is an independent WXT output, not a shared SW entry');
  for(const entry of ['platform/context-menus','cloud-control/cloud-host',
    'time-review/time-review-host','sidebar-tools/bridge','libs/runtime/page-core'])
    assert.equal(typeof PACKAGE_ENTRIES[entry],'string','missing independently packaged feature: '+entry);
});

test('single exact same-extension static import allowed in SW only',()=>{
  const approved='var entry=(function(){importScripts("native-agent/transport.js");return 1})();';
  assert.doesNotThrow(()=>inspectScript(approved,'sw.js'));
  assert.doesNotThrow(()=>inspectScript('importScripts("knowledge/knowledge-host.js")','sw.js'));
  assert.doesNotThrow(()=>inspectScript('importScripts("cloud-control/cloud-host.js")','sw.js'));
  assert.doesNotThrow(()=>inspectScript('importScripts("time-review/time-review-host.js")','sw.js'));
  assert.doesNotThrow(()=>inspectScript('importScripts("agents/health-host.js")','sw.js'));
  assert.doesNotThrow(()=>inspectScript('importScripts("sidebar-tools/preinstall-intent.js")','sw.js'));
  assert.throws(()=>inspectScript('importScripts("agents/health-host.js")','agents/health.js'),/Dynamic execution/);
  assert.throws(()=>inspectScript('importScripts("sidebar-tools/"+"preinstall-intent.js")','sw.js'),/Dynamic execution/);
  assert.throws(()=>inspectScript('importScripts("knowledge/knowledge-host.js")','agents/page-relay.js'),/Dynamic execution/);
  assert.throws(()=>inspectScript(approved,'ui/tool-shell.js'),/Dynamic execution/);
  for(const source of [
    'importScripts("https://outside.example/code.js")',
    'importScripts("native-agent/transport2.js")',
    'importScripts("native-agent/"+"transport.js")',
    'globalThis.importScripts("native-agent/transport.js")',
    'const imp=importScripts;imp("native-agent/transport.js")',
    'importScripts("native-agent/transport.js","another.js")'
  ])assert.throws(()=>inspectScript(source,'sw.js'),/Dynamic execution/);
});

test('fixed transport registers listeners on the original SW APIs; default-off does not connect',async()=>{
  const event=()=>{const listeners=new Set();return {
    listeners,addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)};};
  let connections=0;
  const api={
    runtime:{id:'abcdefghijklmnopabcdefghijklmnop',onMessage:event(),onConnect:event(),
      getURL:page=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+page,
      getManifest:()=>({version:'0.1.0'}),connectNative:()=>{connections++;throw Error('Not enabled');}},
    storage:{local:{get:async()=>({}),set:async()=>{}}},
    permissions:{contains:async()=>false,onRemoved:event()}
  };
  const scope={chrome:api,__opendeskNativeHostPorts:new Map()};
  const agent=installNativeTransport(scope);
  await agent.ready;
  const descriptor=Object.getOwnPropertyDescriptor(scope,NATIVE_TRANSPORT_KEY);
  assert.equal(descriptor.value,true);
  assert.equal(descriptor.writable,false);
  assert.equal(descriptor.configurable,false);
  assert.equal(connections,0,'Native is disabled by default, so no connectNative is allowed');
  assert.equal(api.runtime.onMessage.listeners.size,1);
  assert.equal(api.runtime.onConnect.listeners.size,1);
  assert.throws(()=>installNativeTransport(scope),/E_NATIVE_TRANSPORT_CONFLICT/);
  agent.dispose();
});

// Pinned CommonJS packaging may preserve new.target without granting
// dynamic code execution or permitting ordinary constructor chains.
test('CryptoJS CommonJS new.target helper is narrowly reviewed, not a scanner bypass',()=>{
  const safe='Reflect.construct(Ctor,arguments,this.constructor);';
  assert.doesNotThrow(()=>inspectScript(safe,'libs/packages/crypto-js.js'));
  for(const file of ['sw.js','libs/packages/file-saver.js','ui/tool-shell.js'])
    assert.throws(()=>inspectScript(safe,file),/Unapproved dynamic constructor reference/);
  for(const source of [
    'Reflect.construct(Ctor,arguments,object.constructor)',
    'Reflect.construct(Ctor,arguments,this["constructor"])',
    'Reflect.construct(Ctor,arguments,this.constructor,other)',
    'new this.constructor("return 42")',
    'Function("return 42")()'
  ])assert.throws(()=>inspectScript(source,'libs/packages/crypto-js.js'),/Unapproved dynamic constructor|Dynamic execution/);
});
