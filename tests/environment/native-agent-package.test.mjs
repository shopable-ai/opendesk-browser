import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectScript,verifyManifest} from '../../scripts/verify-package.mjs';
import {BUILD_POLICY,FIXED_OUTPUTS,PACKAGE_ENTRIES} from '../../scripts/build-contract.mjs';
import {installNativeTransport,NATIVE_TRANSPORT_KEY} from '../../src/native-agent/transport.js';

test('Native remains optional after merging the current permission catalog',async()=>{
  const manifest=JSON.parse(await readFile('manifest.json','utf8'));
  assert.equal(manifest.permissions.includes('nativeMessaging'),false);
  assert.equal(manifest.optional_permissions.filter(p=>p==='nativeMessaging').length,1);
  assert.doesNotThrow(()=>verifyManifest(manifest));
  assert.throws(()=>verifyManifest({...manifest,permissions:[...manifest.permissions,'nativeMessaging']}),/Unexpected required browser API permissions/);
});

test('strict production SW budget and fixed packaged Native transport entry',()=>{
  assert.equal(BUILD_POLICY.productionBytes,320*1024);
  assert.equal(PACKAGE_ENTRIES['native-agent/transport'],'./src/native-agent/transport.js');
  assert.equal(FIXED_OUTPUTS.transport,'native-agent/transport.js');
  // Sidebar Tools and R15 Page core remain separately reviewed fixed entries;
  // Native still has exactly one pinned same-extension transport script.
  assert.equal(PACKAGE_ENTRIES['sidebar-tools/bridge'],'./src/sidebar-tools/bridge.js');
  assert.equal(FIXED_OUTPUTS.bridge,'sidebar-tools/bridge.js');
  assert.equal(PACKAGE_ENTRIES['runtime/builtin-libraries/page-core'],'./src/entrypoints/page-core.js');
  assert.equal(FIXED_OUTPUTS['page-core'],'runtime/builtin-libraries/page-core.js');
  assert.equal(Object.keys(PACKAGE_ENTRIES).length,15);
  assert.deepEqual(Object.keys(PACKAGE_ENTRIES),[
    'sw','ui/tool-shell','native-agent/settings','native-agent/transport',
    'agents/health','agents/selection-entry','agents/bootstrap','agents/page-agent','agents/page-relay',
    'framework/sdk-main','scripting/packaged/page-session','scripting/sandbox/sandbox',
    'sidebar-tools/bridge','scripting/sandbox/worker-runtime','runtime/builtin-libraries/page-core'
  ]);
});

test('single exact same-extension static import allowed in SW only',()=>{
  const approved='var entry=(function(){importScripts("native-agent/transport.js");return 1})();';
  assert.doesNotThrow(()=>inspectScript(approved,'sw.js'));
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
