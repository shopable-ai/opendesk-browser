import test from 'node:test';
import assert from 'node:assert/strict';
import {ALL_WEB_ORIGINS, siteAccessPermissionRequest, siteAccessSatisfies,
  createSiteAccess} from '../../src/ui/site-access.js';

function event() {
  const listeners = new Set();
  return {addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); },
    fire(value) { for (const fn of [...listeners]) fn(value); },
    get size() { return listeners.size; }};
}
function fixture() {
  const onAdded = event(), onRemoved = event(), requests = [], states = [];
  const native = {websites:false,cookies:false,notifications:false};
  let permissionOutcome = true;
  const api = {permissions:{
    onAdded,onRemoved,
    contains:async ({origins,permissions}) => origins?.length ? native.websites
      : (permissions || []).every(p => native[p] === true),
    request(request) {
      requests.push(structuredClone(request));
      if (!permissionOutcome) return Promise.resolve(false);
      native.websites = true;
      for (const p of request.permissions || []) native[p] = true;
      onAdded.fire(request);
      return Promise.resolve(true);
    }
  }};
  const controller = createSiteAccess({api,onState:state=>states.push(state)});
  return {api,native,controller,requests,states,onAdded,onRemoved,
    deny() { permissionOutcome = false; }};
}

test('centralized permission request is the exact declared optional HTTP(S) host range', () => {
  assert.deepEqual(ALL_WEB_ORIGINS,['http://*/*','https://*/*']);
  assert.deepEqual(siteAccessPermissionRequest(),{origins:['http://*/*','https://*/*']});
  assert.deepEqual(siteAccessPermissionRequest({cookies:true,notifications:true}),
    {origins:['http://*/*','https://*/*'],permissions:['cookies','notifications']});
  assert.throws(() => siteAccessPermissionRequest({cookies:'yes'}),{code:'E_SCHEMA'});
  assert.equal(siteAccessSatisfies({websites:true,cookies:false,notifications:false},{}),true);
  assert.equal(siteAccessSatisfies({websites:true,cookies:false,notifications:false},{cookies:true}),false);
});

test('explicit trusted click requests all websites and selected optional APIs before first await', async t => {
  const f = fixture(); t.after(() => f.controller.dispose());
  await f.controller.refresh();
  assert.equal(f.requests.length,0,'startup/refresh may never prompt');
  const granted = f.controller.grant({isTrusted:true},{cookies:true,notifications:true});
  assert.deepEqual(f.requests,[{origins:['http://*/*','https://*/*'],permissions:['cookies','notifications']}]);
  const state = await granted;
  assert.deepEqual(state,{websites:true,cookies:true,notifications:true});
  assert.equal(f.states.at(-1).phase,'granted');
  await f.controller.refresh();
  assert.equal(f.requests.length,1,'refresh and subsequent runs do not repeat the onboarding request');
});

test('untrusted events cannot grant permissions; native denial cannot turn into local approval', async t => {
  const f = fixture();t.after(() => f.controller.dispose());
  await assert.rejects(f.controller.grant({isTrusted:false}),{code:'E_GESTURE'});
  assert.equal(f.requests.length,0);
  f.deny();
  await assert.rejects(f.controller.grant({isTrusted:true},{cookies:true}),{code:'E_PERMISSION'});
  assert.equal(f.controller.snapshot.websites,false);
  assert.equal(f.states.at(-1).phase,'denied');
});

test('Chrome permission removal invalidates live status and disposal detaches listeners', async () => {
  const f = fixture();
  await f.controller.grant({isTrusted:true});
  f.native.websites = false;
  f.onRemoved.fire({origins:['http://*/*','https://*/*']});
  await f.controller.refresh();
  assert.equal(f.controller.snapshot.websites,false);
  assert.equal(f.states.at(-1).phase,'limited');
  assert.equal(f.requests.length,1,'permission removal is observed, not silently reapproved');
  f.controller.dispose();
  assert.equal(f.onAdded.size,0);
  assert.equal(f.onRemoved.size,0);
  await assert.rejects(f.controller.grant({isTrusted:true}),{code:'E_HOST_CLOSED'});
});

test('narrow browser permissions do not claim all-site access', async t => {
  const f = fixture(); t.after(() => f.controller.dispose());
  f.native.cookies = true;
  const state = await f.controller.refresh();
  assert.equal(state.websites,false);
  assert.equal(state.cookies,true);
  assert.equal(siteAccessSatisfies(state,{cookies:true}),false);
});
