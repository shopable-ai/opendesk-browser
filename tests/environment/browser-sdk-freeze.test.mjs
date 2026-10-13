import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
import {TRUSTED_COOKIE_OPERATIONS} from '../../src/platform/chrome/browser-cookie-host.js';
import {inspectBrowserSdkWrapper,checkBrowserSdkFreeze} from '../../scripts/check-browser-sdk-freeze.mjs';

test('public Browser SDK namespace exactly covers the current registry',()=>{
  const check=inspectBrowserSdkWrapper();
  assert.deepEqual(check.errors,[]);
  assert.equal(check.registered,Object.keys(BROWSER_OPERATIONS).length);
  assert.equal(check.wrappers,check.registered);
  // The convenience wrapper is deliberately not a second RPC operation.
  assert.equal(Object.hasOwn(BROWSER_OPERATIONS,'browser.network.watch'),false);
});

test('drift in missing methods or stale public aliases fails closed',()=>{
  const original=createBrowserSdk({request:async()=>null});
  const omitted={...original,tabs:{...original.tabs,create:undefined}};
  assert(inspectBrowserSdkWrapper(BROWSER_OPERATIONS,omitted).errors
    .some(e=>e.includes('browser.tabs.create')));
  const alias={...original,tabs:{...original.tabs,open:()=>null}};
  assert(inspectBrowserSdkWrapper(BROWSER_OPERATIONS,alias).errors
    .some(e=>e.includes('Unregistered public wrapper browser.tabs.open')));
});

test('Cookies Host operations exactly match the frozen public SDK roster',()=>{
  const registered=Object.keys(BROWSER_OPERATIONS)
    .filter(name=>name.startsWith('browser.cookies.')).sort();
  assert.equal(registered.length,11);
  assert.deepEqual([...TRUSTED_COOKIE_OPERATIONS].sort(),registered);
});

test('freeze executable verifies wrapper, matrix and eight pinned JSON files',async()=>{
  const result=await checkBrowserSdkFreeze();
  assert.equal(result.ok,true);
  assert.equal(result.registeredOperations,Object.keys(BROWSER_OPERATIONS).length);
  assert.equal(result.publicWrapperMethods,result.registeredOperations);
  assert.equal(result.cookieOperations,TRUSTED_COOKIE_OPERATIONS.length);
  assert.equal(result.sourceVerification,'PARTIAL_PINNED_JSON_ONLY');
  assert.equal(result.fullMatrixBytesReparsed,false);
  assert.equal(result.nativeChrome,'NOT_TESTED');
  assert(result.partialJsonSnapshot.pinnedAndByteVerifiedFiles>0);
  assert(result.fullMatrixSourceFiles>=result.partialJsonSnapshot.pinnedAndByteVerifiedFiles);
});
