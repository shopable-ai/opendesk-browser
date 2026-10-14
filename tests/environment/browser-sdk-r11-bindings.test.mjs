import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedBrowserBindings} from '../../src/framework/sdk/browser-bindings.js';

const match=code=>error=>error?.code===code;
const ref='r'.repeat(32);

test('R11 finite bindings: approved operation invokes audited handler only after Host authorization',async()=>{
  const events=[],bindings=createApprovedBrowserBindings({
    'browser.tabs.getOwned':async (args,context)=>{
      events.push(['driver',args,context]);return {tabRef:args.tabRef};
    }
  });
  assert.equal(Object.isFrozen(bindings),true);
  assert.equal(bindings.has('browser.tabs.getOwned'),true);
  assert.equal(bindings.has('browser.tabs.query'),false);
  const context={packageHash:'trusted'},args={tabRef:ref};
  const result=await bindings.dispatch('browser.tabs.getOwned',args,context,{
    authorize:async(operation,input,owner)=>events.push(['authorize',operation,input,owner])
  });
  assert.deepEqual(result,{tabRef:ref});
  assert.deepEqual(events.map(x=>x[0]),['authorize','driver','authorize']);
  assert.equal(events[0][1],'browser.tabs.getOwned');
  assert.deepEqual(events[1][1],args);
  assert.strictEqual(events[1][2],context);
});

test('R11 finite bindings: unknown or unapproved operations do not execute',async()=>{
  assert.throws(()=>createApprovedBrowserBindings({
    'browser.bookmarks.getTree':async()=>[]
  }),match('E_CONTRACT'));
  assert.throws(()=>createApprovedBrowserBindings({'browser.tabs.getOwned':{}}),match('E_CONTRACT'));
  const bindings=createApprovedBrowserBindings({'browser.tabs.getOwned':async()=>{throw Error('must not execute')}});
  await assert.rejects(bindings.dispatch('browser.tabs.query',{},{}),match('E_SERVICE_UNSUPPORTED'));
  await assert.rejects(bindings.dispatch('__proto__',{},{}),match('E_SERVICE_UNSUPPORTED'));
  await assert.rejects(bindings.dispatch('browser.tabs.getOwned',{tabRef:ref},{}),match('E_CONTEXT'));
});

test('R11 finite bindings: strict Registry arguments are checked before native code',async()=>{
  let native=0,verified=0;
  const bindings=createApprovedBrowserBindings({'browser.tabs.getOwned':async()=>{
    native++;return {};
  }});
  await assert.rejects(bindings.dispatch('browser.tabs.getOwned',{tabRef:'raw-chrome-id'},{},{
    authorize:async()=>verified++
  }),match('E_SCHEMA'));
  assert.equal(native,0);
  assert.equal(verified,0);
});

test('R11 finite bindings: revocation suppresses read results; writes become UNKNOWN rather than replayed',async()=>{
  let called=0;
  const revoke=async()=>{if(++called===2)throw Object.assign(Error('revoked'),{code:'E_TOOL_DISABLED'})};
  const reading=createApprovedBrowserBindings({'browser.tabs.getOwned':async()=>({tabRef:ref})});
  await assert.rejects(reading.dispatch('browser.tabs.getOwned',{tabRef:ref},{},{authorize:revoke}),match('E_TOOL_DISABLED'));
  let effects=0,passes=0;
  const writing=createApprovedBrowserBindings({'browser.tabs.create':async()=>{effects++;return {tabRef:ref}}});
  await assert.rejects(writing.dispatch('browser.tabs.create',{url:'https://example.com/'},{},{
    authorize:async()=>{if(++passes===2)throw Error('revoked after effect')}
  }),match('E_OUTCOME_UNKNOWN'));
  assert.equal(effects,1,'mutating effect must never be reattempted by generic binding');
});

test('R11 finite bindings: oversized and non-JSON native receipts cannot cross the bridge',async()=>{
  const authorize=async()=>{};
  const tooLarge=createApprovedBrowserBindings({'browser.tabs.getOwned':async()=>({data:'x'.repeat(20000)})});
  await assert.rejects(tooLarge.dispatch('browser.tabs.getOwned',{tabRef:ref},{},{authorize}),match('E_LIMIT'));
  const poisoned=JSON.parse('{"__proto__":{"polluted":true}}');
  const nonJson=createApprovedBrowserBindings({'browser.tabs.getOwned':async()=>poisoned});
  await assert.rejects(nonJson.dispatch('browser.tabs.getOwned',{tabRef:ref},{},{authorize}),match('E_VALUE_SERIALIZATION'));
  assert.equal({}.polluted,undefined);
  const effect=createApprovedBrowserBindings({'browser.tabs.create':async()=>({data:'x'.repeat(20000)})});
  await assert.rejects(effect.dispatch('browser.tabs.create',{url:'https://example.com/'},{},{authorize}),match('E_OUTCOME_UNKNOWN'));
});
