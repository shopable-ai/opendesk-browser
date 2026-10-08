import test from 'node:test';
import assert from 'node:assert/strict';
import {armScriptResourceFailure} from './k5-controller-resource-fault.mjs';

test('registered resource fault configures and clears only the exact SDK URL in the native target',async()=>{
  const calls=[],client={isOpen:true,async send(method,params){calls.push({method,params});return {};}};
  const url='chrome-extension://unit/framework/sdk-main.js',fault=await armScriptResourceFailure(client,url);
  assert.deepEqual(calls,[{method:'Network.setBlockedURLs',params:{urls:[url]}}]);
  assert.deepEqual(fault.snapshot(),{url,method:'Network.setBlockedURLs',params:{urls:[url]},reply:{}});
  await fault.dispose();assert.deepEqual(calls.at(-1),{method:'Network.setBlockedURLs',params:{urls:[]}});
});
test('invalid resources are refused, native command failure is not replaced and disconnected cleanup cannot send',async()=>{
  const calls=[],client={isOpen:true,async send(method,params){calls.push({method,params});return {};}};
  await assert.rejects(armScriptResourceFailure(client,'https://remote/code.js'));
  await assert.rejects(armScriptResourceFailure(client,'chrome-extension://unit/missing.js'));
  assert.deepEqual(calls,[]);
  const fault=await armScriptResourceFailure(client,'chrome-extension://unit/framework/sdk-main.js');
  client.isOpen=false;await fault.dispose();assert.equal(calls.length,1);
  const error=Object.assign(new Error('closed'),{code:'E_RUNNER_CDP_CLOSED'});
  await assert.rejects(armScriptResourceFailure({send:async()=>{throw error;}},'chrome-extension://unit/framework/sdk-main.js'),e=>e===error);
});
