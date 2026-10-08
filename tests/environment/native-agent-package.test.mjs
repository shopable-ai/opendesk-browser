import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectScript} from '../../scripts/verify-package.mjs';
import {BUILD_POLICY,FIXED_OUTPUTS,PACKAGE_ENTRIES} from '../../scripts/build-contract.mjs';
import {installNativeTransport,NATIVE_TRANSPORT_KEY} from '../../src/native-agent/transport.js';
import {createNativeAgentService} from '../../src/native-agent/service-worker.js';

test('strict production SW budget and fixed packaged Native transport entry',()=>{
  assert.equal(BUILD_POLICY.productionBytes,320*1024);
  assert.equal(PACKAGE_ENTRIES['native-agent/transport'],'./src/native-agent/transport.js');
  assert.equal(FIXED_OUTPUTS.transport,'native-agent/transport.js');
  assert.equal(Object.keys(PACKAGE_ENTRIES).length,13);
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

test('packaged transport installs an immutable factory, not another controller',()=>{
  const scope=Object.create(null);
  installNativeTransport(scope);
  const factory=Object.getOwnPropertyDescriptor(scope,NATIVE_TRANSPORT_KEY);
  assert.equal(factory.value,createNativeAgentService);
  assert.equal(factory.configurable,false);
  assert.equal(factory.writable,false);
  assert.equal(factory.enumerable,false);
  assert.throws(()=>installNativeTransport(scope),/E_NATIVE_TRANSPORT_CONFLICT/);
});
