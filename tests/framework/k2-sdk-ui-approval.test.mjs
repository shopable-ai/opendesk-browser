import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotSdkApproval, sdkNativePermissionRequest, createSdkApproval, sdkHttpLabPreset} from '../../src/ui/sdk-approval.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no;}); return {promise,resolve,reject}; };
const originPattern = value => { const url = new URL(value); return `${url.protocol}//${url.hostname}/*`; };
const source = {tabId:21, frameId:2, documentId:'document-A', url:'https://a.example/source'};
const selection = () => ({document:{...source}, capabilities:['network'], targetText:'https://b.example'});
function fixture() {
  let inputs = selection();
  const calls = [], states = [], busy = [], requestGate = deferred();
  const nativeOrigins = new Set(['https://a.example/*','https://b.example/*']);
  const api = {
    permissions:{
      request(request) { calls.push(['permissions.request',structuredClone(request)]); return requestGate.promise; },
      contains:async ({origins,permissions=[]}) => origins.every(origin => nativeOrigins.has(origin)) && permissions.every(value => value === 'notifications')
    },
    tabs:{get:async id => ({id,incognito:false})},
    webNavigation:{getAllFrames:async () => [{...source,documentLifecycle:'active'}]}
  };
  const client = {ready:Promise.resolve(), request:async (method,payload) => {
    calls.push([method,structuredClone(payload)]);
    const scope = snapshotSdkApproval({document:source,capabilities:payload.capabilities,targetText:payload.targetOrigins.join('\n')});
    return {installed:true,documentId:source.documentId,sourceOrigin:scope.sourceOrigin,
      capabilities:[...scope.capabilities], targetOrigins:[...scope.targetOrigins],allowedOrigins:[...scope.allowedOrigins],
      grantIncarnation:'grant-1',requiresReapprovalAfterWorkerRestart:scope.targetOrigins.length > 0};
  }};
  const controller = createSdkApproval({api,client,permissionPattern:originPattern,
    readSelection:() => inputs,onState:state=>states.push(state),onBusy:value=>busy.push(value)});
  return {api,client,controller,calls,states,busy,requestGate,nativeOrigins,
    get inputs() {return inputs;}, set inputs(value) {inputs=value;}};
}
const click = {isTrusted:true};
const installs = f => f.calls.filter(([method]) => method === 'installSdk');

test('HTTP lab preset only supplies inert, immutable UI inputs for exact loopback demo', () => {
  const preset = sdkHttpLabPreset('http://127.0.0.1:43111/demo-form.html?test-response=1');
  assert.deepEqual(preset, {capabilities:['network'], targetText:'https://httpbingo.org'});
  assert.throws(() => preset.capabilities.push('notifications'), TypeError);
  const fallback = sdkHttpLabPreset('http://127.0.0.1:43112/demo-form.html');
  assert.deepEqual(fallback,preset);
  for (const url of ['https://127.0.0.1:43111/demo-form.html',
    'http://localhost:43111/demo-form.html','http://127.0.0.1:43113/demo-form.html',
    'http://127.0.0.1:43111/not-demo.html','http://127.0.0.1.evil.test:43111/demo-form.html',
    'http://user:pass@127.0.0.1:43111/demo-form.html','not-a-url']) {
    assert.equal(sdkHttpLabPreset(url), null, url);
  }
  const selected = {tabId:21,frameId:0,documentId:'real-document',url:'http://127.0.0.1:43111/demo-form.html'};
  const approval = snapshotSdkApproval({document:selected,...preset});
  assert.deepEqual(approval.allowedOrigins,['http://127.0.0.1:43111','https://httpbingo.org']);
  // A preset alone cannot invoke Chrome permissions or the Host authority.
});

test('snapshot shares authority target contract: exact, bounded, sorted, source retained, immutable', () => {
  const input = selection(); input.targetText = 'HTTPS://B.example:443/\n\n https://b.example \nhttp://127.0.0.1:43111';
  const snapshot = snapshotSdkApproval(input);
  assert.deepEqual(snapshot.targetOrigins,['http://127.0.0.1:43111','https://b.example']);
  assert.deepEqual(snapshot.allowedOrigins,['http://127.0.0.1:43111','https://a.example','https://b.example']);
  assert.throws(() => snapshot.capabilities.push('notifications'), TypeError);
  input.capabilities.push('notifications'); assert.deepEqual(snapshot.capabilities,['network']);
  assert.deepEqual(snapshotSdkApproval({...selection(),targetText:''}).allowedOrigins,['https://a.example']);
  for (const text of ['https://b.example/path','https://u:p@b.example','https://*.example','https://b.example?x','ftp://b.example',Array(9).fill('https://b.example').join('\n')])
    assert.throws(() => snapshotSdkApproval({...selection(),targetText:text}),{code:'E_SCHEMA'});
  assert.throws(() => snapshotSdkApproval({...selection(),capabilities:['storage.persistent']}),{code:'E_CAPABILITY'});
});

test('native host patterns are not application port authorization', () => {
  const value = snapshotSdkApproval({...selection(),targetText:'https://b.example:443\nhttps://b.example:444'});
  assert.deepEqual(value.targetOrigins,['https://b.example','https://b.example:444']);
  assert.deepEqual(sdkNativePermissionRequest(value,originPattern),{origins:['https://a.example/*','https://b.example/*']});
  assert.equal(value.allowedOrigins.includes('https://b.example:445'),false);
});

test('trusted click requests A and B synchronously, even while host readiness is pending; receipt matches authority', async () => {
  const f=fixture(), ready=deferred(); f.client.ready=ready.promise;
  const pending=f.controller.approve(click);
  assert.deepEqual(f.calls,[['permissions.request',{origins:['https://a.example/*','https://b.example/*']}] ]);
  assert.equal(installs(f).length,0);
  f.requestGate.resolve(true); ready.resolve();
  const receipt=await pending;
  assert.equal(installs(f).length,1);
  assert.deepEqual(installs(f)[0][1],{tabId:21,frameId:2,documentId:'document-A',capabilities:['network'],targetOrigins:['https://b.example']});
  assert.equal(f.states.at(-1).state,'installed'); assert.equal(receipt.grantIncarnation,'grant-1');
  assert.deepEqual(f.busy,[true,false]);
});

test('untrusted events and duplicate clicks cannot invoke a second native or application operation', async () => {
  const f=fixture(); await assert.rejects(f.controller.approve({isTrusted:false}),{code:'E_GESTURE'});
  assert.equal(f.calls.length,0);
  const pending=f.controller.approve(click);
  await assert.rejects(f.controller.approve(click),{code:'E_BUSY'});
  assert.equal(f.calls.length,1); f.requestGate.resolve(true); await pending; assert.equal(installs(f).length,1);
});

test('native denial creates no application grant, including when B already has a native permission', async () => {
  const f=fixture(); assert.equal(f.nativeOrigins.has('https://b.example/*'),true);
  const pending=f.controller.approve(click); f.requestGate.resolve(false);
  await assert.rejects(pending,{code:'E_PERMISSION'}); assert.equal(installs(f).length,0);
  assert.equal(f.states.at(-1).state,'denied');
});

for (const [label,change] of [
  ['document',f=>{f.inputs.document.documentId='new-document';}],
  ['frame',f=>{f.inputs.document.frameId=3;}],
  ['capabilities',f=>{f.inputs.capabilities.push('notifications');}],
  ['targets',f=>{f.inputs.targetText='https://c.example';}],
  ['edit and revert',f=>{f.controller.invalidate();}]
]) test(`pending permission cannot authorize changed ${label}`, async () => {
  const f=fixture(), pending=f.controller.approve(click); change(f); f.requestGate.resolve(true);
  await assert.rejects(pending,{code:'E_DOCUMENT_STALE'}); assert.equal(installs(f).length,0);
});

test('navigation at a deterministic native frame-lookup barrier rejects before dispatch', async () => {
  const f=fixture(), entered=deferred(), release=deferred();
  f.api.webNavigation.getAllFrames=()=>{entered.resolve();return release.promise;};
  const pending=f.controller.approve(click); f.requestGate.resolve(true); await entered.promise;
  release.resolve([{...source,documentId:'next-document',documentLifecycle:'active'}]);
  await assert.rejects(pending,{code:'E_DOCUMENT_STALE'}); assert.equal(installs(f).length,0);
});

for (const [label,alter] of [
  ['incognito',f=>{f.api.tabs.get=async()=>({incognito:true});}],
  ['inactive frame',f=>{f.api.webNavigation.getAllFrames=async()=>[{...source,documentLifecycle:'cached'}];}],
  ['source permission',f=>{f.nativeOrigins.delete('https://a.example/*');}],
  ['target permission',f=>{f.nativeOrigins.delete('https://b.example/*');}]
]) test(`lost ${label} is rejected independently`,async()=>{
  const f=fixture(); alter(f); const pending=f.controller.approve(click); f.requestGate.resolve(true);
  await assert.rejects(pending); assert.equal(installs(f).length,0);
});

test('input changes after application dispatch preserve ORIGINAL receipt but cannot mark new inputs installed', async () => {
  const f=fixture(), entered=deferred(), release=deferred(), original=f.client.request;
  f.client.request=async(...args)=>{const receipt=await original(...args);entered.resolve();await release.promise;return receipt;};
  const pending=f.controller.approve(click); f.requestGate.resolve(true); await entered.promise;
  f.inputs.targetText='https://c.example'; f.controller.invalidate(); release.resolve();
  await assert.rejects(pending,{code:'E_DOCUMENT_STALE'});
  assert.equal(f.states.at(-1).state,'stale'); assert.equal(installs(f).length,1);
  assert.deepEqual(f.states.at(-1).lastConfirmedReceipt.targetOrigins,['https://b.example']);
});

test('a rejected expansion does not claim an existing grant was expanded or revoked', async () => {
  const f=fixture(); f.requestGate.resolve(true); await f.controller.approve(click);
  f.inputs.targetText='https://c.example'; f.controller.invalidate(); f.api.permissions.request=()=>Promise.resolve(false);
  await assert.rejects(f.controller.approve(click),{code:'E_PERMISSION'});
  assert.equal(installs(f).length,1); assert.equal(f.states.at(-1).state,'denied');
  assert.deepEqual(f.states.at(-1).lastConfirmedReceipt.targetOrigins,['https://b.example']);
});

test('observed removal then quick native reapproval cannot revive an in-progress UI approval',async()=>{
  const f=fixture(),entered=deferred(),release=deferred();
  f.api.permissions.contains=async()=>{entered.resolve();await release.promise;return true;};
  const pending=f.controller.approve(click);f.requestGate.resolve(true);await entered.promise;
  f.controller.invalidate('权限撤销已被观察');release.resolve();
  await assert.rejects(pending,{code:'E_DOCUMENT_STALE'});assert.equal(installs(f).length,0);
});

test('no success claim or retry on mismatched authority receipt or lost RPC response',async()=>{
  for(const replacement of [async()=>({installed:true}),async()=>{throw new Error('transport disconnected');}]){
    const f=fixture();let count=0;f.client.request=async()=>{count++;return replacement();};
    const pending=f.controller.approve(click);f.requestGate.resolve(true);await assert.rejects(pending);
    assert.equal(f.states.at(-1).state,'unknown');assert.equal(count,1);
    assert.equal(f.states.at(-1).lastConfirmedReceipt,undefined);
  }
});

test('permission loss after install prevents a green success state',async()=>{
  const f=fixture(),original=f.client.request;
  f.client.request=async(...args)=>{const receipt=await original(...args);f.nativeOrigins.delete('https://b.example/*');return receipt;};
  const pending=f.controller.approve(click);f.requestGate.resolve(true);
  await assert.rejects(pending,{code:'E_PERMISSION'});assert.equal(f.states.at(-1).state,'unknown');
  assert.equal(f.states.at(-1).lastConfirmedReceipt.grantIncarnation,'grant-1');
});

test('disposed window sends no new application operation and receives no late UI mutation',async()=>{
  const f=fixture(),pending=f.controller.approve(click);f.controller.dispose();const count=f.states.length;
  f.requestGate.resolve(true);await assert.rejects(pending,{code:'E_DOCUMENT_STALE'});
  assert.equal(installs(f).length,0);assert.equal(f.states.length,count);
});

test('read-only SDK inspection never requests extra Chrome permission or installs SDK',async()=>{
  const f=fixture(),original=f.client.request;
  f.client.request=async(method,payload)=>{
    if(method==='inspectSdkGrant'){
      f.calls.push([method,structuredClone(payload)]);
      return {present:false,documentId:'document-A',sourceOrigin:'https://a.example'};
    }
    return original(method,payload);
  };
  const result=await f.controller.inspectGrant();
  assert.equal(result.present,false);
  assert.deepEqual(f.calls,[['inspectSdkGrant',{tabId:21,frameId:2,documentId:'document-A'}]]);
  assert.equal(f.controller.currentGrant,undefined);
  assert.equal(f.states.at(-1).state,'absent');
});

test('revoke is a real gesture on one document/incarnation and opens no new Chrome permission prompt',async()=>{
  const f=fixture(),original=f.client.request;
  f.requestGate.resolve(true);await f.controller.approve(click);
  assert.equal(f.controller.currentGrant.grantIncarnation,'grant-1');
  f.client.request=async(method,payload)=>{
    if(method==='revokeSdkGrant'){f.calls.push([method,structuredClone(payload)]);return {revoked:true,...payload};}
    return original(method,payload);
  };
  await assert.rejects(f.controller.revoke({isTrusted:false}),{code:'E_GESTURE'});
  const count=f.calls.filter(([name])=>name==='permissions.request').length;
  const receipt=await f.controller.revoke(click);
  assert.equal(receipt.revoked,true);
  assert.deepEqual(f.calls.at(-1),['revokeSdkGrant',{tabId:21,frameId:2,documentId:'document-A',grantIncarnation:'grant-1'}]);
  assert.equal(f.calls.filter(([name])=>name==='permissions.request').length,count);
  assert.equal(f.controller.currentGrant,undefined);
  assert.equal(f.states.at(-1).state,'revoked');
  await assert.rejects(f.controller.revoke(click),{code:'E_GRANT_REVOKED'});
});

test('lost SDK revocation acknowledgement is unknown, without silent retry or fake success',async()=>{
  const f=fixture();f.requestGate.resolve(true);await f.controller.approve(click);
  let count=0;
  f.client.request=async method=>{assert.equal(method,'revokeSdkGrant');count++;throw Error('disconnected');};
  await assert.rejects(f.controller.revoke(click),/disconnected/);
  assert.equal(count,1);
  assert.equal(f.controller.currentGrant,undefined);
  assert.equal(f.states.at(-1).state,'unknown');
  assert.equal(f.states.at(-1).lastConfirmedReceipt.grantIncarnation,'grant-1');
});
