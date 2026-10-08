import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
  // Fresh profile after install grants required hosts and required APIs by default.
  const native = {websites:true,cookies:true,notifications:true};
  let permissionOutcome = true;
  const api = {permissions:{
    onAdded,onRemoved,
    contains:async ({origins,permissions}) => origins?.length ? native.websites
      : (permissions || []).every(p => native[p] === true),
    request(request) {
      requests.push(structuredClone(request));
      if (!permissionOutcome) return Promise.resolve(false);
      native.websites = true;
      onAdded.fire(request);
      return Promise.resolve(true);
    }
  }};
  const controller = createSiteAccess({api,onState:state=>states.push(state)});
  return {api,native,controller,requests,states,onAdded,onRemoved,
    deny() { permissionOutcome = false; }};
}

test('required all-url host is the single source of truth; no optional host prompts at startup', async t => {
  assert.deepEqual(ALL_WEB_ORIGINS,['<all_urls>']);
  assert.deepEqual(siteAccessPermissionRequest(),{origins:['<all_urls>']});
  assert.equal(siteAccessSatisfies({websites:true,cookies:true,notifications:true}),true);
  assert.equal(siteAccessSatisfies({websites:true,cookies:false,notifications:true}),false);
  const f = fixture(); t.after(() => f.controller.dispose());
  const state = await f.controller.refresh();
  assert.deepEqual(state,{websites:true,cookies:true,notifications:true});
  assert.equal(f.states.at(-1).phase,'granted');
  assert.equal(f.requests.length,0,'required host is granted by Chrome at install time');
});

test('a trusted click can re-request withheld required host access without options', async t => {
  const f = fixture(); t.after(() => f.controller.dispose());
  f.native.websites = false;
  const pending = f.controller.grant({isTrusted:true});
  assert.deepEqual(f.requests,[{origins:['<all_urls>']}], 'request is synchronous with the click');
  const state = await pending;
  assert.equal(state.websites,true);
  assert.equal(f.states.at(-1).phase,'granted');
});

test('untrusted events cannot change permission; native denial never fabricates approval', async t => {
  const f = fixture(); t.after(() => f.controller.dispose());
  f.native.websites=false;
  await assert.rejects(f.controller.grant({isTrusted:false}),{code:'E_GESTURE'});
  assert.equal(f.requests.length,0);
  f.deny();
  await assert.rejects(f.controller.grant({isTrusted:true}),{code:'E_PERMISSION'});
  assert.equal(f.controller.snapshot.websites,false);
  assert.equal(f.states.at(-1).phase,'denied');
});

test('Chrome site access restrictions invalidate status and never auto-regrant', async () => {
  const f = fixture();
  await f.controller.refresh();
  f.native.websites=false;
  f.onRemoved.fire({origins:['<all_urls>']});
  await f.controller.refresh();
  assert.equal(f.controller.snapshot.websites,false);
  assert.equal(f.states.at(-1).phase,'limited');
  assert.equal(f.requests.length,0);
  f.controller.dispose();
  assert.equal(f.onAdded.size,0);
  assert.equal(f.onRemoved.size,0);
  await assert.rejects(f.controller.grant({isTrusted:true}),{code:'E_HOST_CLOSED'});
});

test('Chrome onAdded event cannot erase actual approved status during raced refresh', async t => {
  const f = fixture(); t.after(() => f.controller.dispose());
  f.native.websites=false;
  const original=f.api.permissions.contains;
  let trigger=true;
  f.api.permissions.contains=async query=>{
    const value=await original(query);
    if(trigger) {trigger=false;queueMicrotask(()=>f.onAdded.fire({origins:['<all_urls>']}));}
    return value;
  };
  const actual=await f.controller.grant({isTrusted:true});
  assert.equal(actual.websites,true);
  await f.controller.refresh();
  assert.equal(f.states.at(-1).phase,'granted');
  assert.equal(f.requests.length,1);
});

test('core API status is separately queried; it never grants applications automatically', async t => {
  const f = fixture(); t.after(() => f.controller.dispose());
  f.native.cookies=false;
  const state=await f.controller.refresh();
  assert.equal(state.websites,true);
  assert.equal(state.cookies,false);
  assert.equal(siteAccessSatisfies(state),false);
  assert.equal(f.requests.length,0);
});

test('developer site controls remain nested in the original three-tab workbench', async () => {
  const [html,shell,css]=await Promise.all([
    readFile('src/ui/tool.html','utf8'),
    readFile('src/ui/tool-shell.js','utf8'),
    readFile('src/ui/tool-shell.css','utf8')]);
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>id);
  assert.equal(new Set(ids).size,ids.length,'DOM IDs must stay unique');
  const develop=html.indexOf('id="workbench-develop"');
  const advanced=html.indexOf('id="script-advanced"');
  const access=html.indexOf('id="site-access"');
  const diagnostics=html.indexOf('id="tool-diagnostics"');
  assert.ok(develop>=0 && advanced>develop && access>advanced && access<diagnostics);
  for (const id of ['site-access-status','site-access-grant','site-access-refresh',
    'script-run','script-stop','task-run','task-stop','page-dependency-panel'])
    assert(ids.includes(id),id);
  for (const removed of ['site-access-cookies','site-access-notifications'])
    assert(!ids.includes(removed),removed+' must not imply an optional install-time permission');
  assert.match(shell,/createTaskWorkbench/);
  assert.match(shell,/createSiteAccess/);
  assert.match(shell,/siteAccess\.grant\(event\)/);
  assert.match(shell,/siteAccess\.dispose\(\); taskWorkbench\.dispose\(\)/);
  assert.match(css,/#site-access-status/);
});
