import test from 'node:test';
import assert from 'node:assert/strict';
import {Socket} from 'node:net';
import {COOKIE_ACCOUNT_PROTOCOL} from '../trusted/account-contract.js';
import {createCookieAccountService,installCookieAccountService} from '../trusted/account-service.js';
import {createContextMenuHost} from '../../../../src/platform/chrome/context-menus.js';
import {BROWSER_HOST_PROTOCOL} from '../../../../src/framework/sdk/browser-contract.js';

// Negative probes, NOT new API names or an account/source identity mapping.
const missingOperations=['quota','usage','openManagement'];
// Same component sender shape as browser-sdk-r7-trusted-cookies.test.mjs.
// This is not a real Chrome sender or an authenticated website/OAuth account.
const hostInstanceId='01234567-89ab-4def-8123-456789abcdef';
const sender={id:'cookie-test-ext',frameId:0,documentId:'trusted-host-document-1',
  documentLifecycle:'active',
  url:'chrome-extension://cookie-test-ext/sidepanel.html?hostInstanceId='+hostInstanceId};

function boundaryFixture(t){
  const effects=[];
  const forbidden=name=>(..._args)=>{
    effects.push(name);
    throw new Error('Unexpected boundary effect: '+name);
  };
  // Fail closed before any real TCP/IPC connection or fetch (including loopback).
  // Only external boundaries are replaced; never the service/router/validator.
  t.mock.method(globalThis,'fetch',forbidden('node.fetch'));
  t.mock.method(Socket.prototype,'connect',forbidden('node.socket.connect'));
  const listeners=[];
  const api={runtime:{id:sender.id,getURL:path=>'chrome-extension://'+sender.id+'/'+path,
    onMessage:{addListener:listener=>listeners.push(listener)},
    sendMessage:forbidden('chrome.runtime.sendMessage'),
    sendNativeMessage:forbidden('chrome.runtime.sendNativeMessage'),
    connectNative:forbidden('chrome.runtime.connectNative')},
    storage:{local:{get:forbidden('chrome.storage.local.get'),set:forbidden('chrome.storage.local.set')}},
    permissions:{contains:forbidden('chrome.permissions.contains'),request:forbidden('chrome.permissions.request')},
    cookies:Object.fromEntries(['get','getAll','set','remove','getAllCookieStores','getPartitionKey']
      .map(name=>[name,forbidden('chrome.cookies.'+name)])),
    tabs:Object.fromEntries(['get','query','create','update','reload']
      .map(name=>[name,forbidden('chrome.tabs.'+name)]))};
  // Minimal external boundary subset of serviceFixture / fixture in the
  // existing account-switch-host / browser-sdk-r7-trusted-cookies tests.
  // They are file-local, so importing them would register unrelated test suites.
  const storage=forbidden('foundation.storage');
  return {api,storage,listeners,effects};
}

test('original Cookie Account dispatch rejects missing usage operations before any effect',async t=>{
  const f=boundaryFixture(t),service=createCookieAccountService(f);
  for(const operation of missingOperations){
    for(const trustedClick of [false,true]){
      await assert.rejects(service.dispatch({protocol:COOKIE_ACCOUNT_PROTOCOL,
        toolId:'cookie-editor',operation,payload:{},trustedClick},sender),
      {code:'E_ACCOUNT_REQUEST'});
      assert.deepEqual(f.effects,[],operation+' must not dispatch an effect');
    }
  }
  // Control: a supported operation reaches the actual sender validator.
  await assert.rejects(service.dispatch({protocol:COOKIE_ACCOUNT_PROTOCOL,
    toolId:'cookie-editor',operation:'status',payload:{}},{}),{code:'E_ACCOUNT_SENDER'});
  assert.deepEqual(f.effects,[]);
});

test('original fixed SW listener delivers rejection, without Node or Chrome dispatch',async t=>{
  const f=boundaryFixture(t);
  installCookieAccountService(f);
  assert.equal(f.listeners.length,1);
  const listener=f.listeners[0];
  assert.equal(listener({protocol:'unrelated'},sender,()=>assert.fail('wrong protocol replied')),false);
  for(const operation of missingOperations){
    let replies=0;
    const response=await new Promise(resolve=>{
      assert.equal(listener({protocol:COOKIE_ACCOUNT_PROTOCOL,toolId:'cookie-editor',
        operation,payload:{},trustedClick:false},sender,value=>{replies++;resolve(value);}),true);
    });
    assert.deepEqual(response,{ok:false,error:{code:'E_ACCOUNT_REQUEST',message:'E_ACCOUNT_REQUEST'}});
    await Promise.resolve();
    assert.equal(replies,1);
    assert.deepEqual(f.effects,[]);
  }
});

test('original Browser Host handleHost refuses unknown Cookie operations and forged senders',async t=>{
  const f=boundaryFixture(t),locks=[];
  const host=createContextMenuHost({api:f.api,
    lockManager:{request:async(name,work)=>{locks.push(name);return work();}}});
  for(const operation of missingOperations){
    // Deliberately nonexistent probe; no SDK method or authority is added.
    const request={protocol:BROWSER_HOST_PROTOCOL,operation:'browser.cookies.'+operation,
      toolId:'cookie-editor',hostInstanceId};
    const before=locks.length;
    await assert.rejects(host.handleHost(request,{...sender,url:'https://bad.test/'}),{code:'E_OWNER'});
    assert.equal(locks.length,before,'forged sender must not enter installed-tool locks');
    await assert.rejects(host.handleHost(request,sender),{code:'E_SERVICE_UNSUPPORTED'});
    assert.deepEqual(locks.slice(before),['opendesk.sidebar-tools:tool:cookie-editor',
      'opendesk.sidebar-tools:catalog']);
    assert.deepEqual(f.effects,[]);
  }
});
