import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createDeveloperView} from '../../src/ui/develop-view.js';
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
  await f.controller.refresh();
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
  await f.controller.refresh();
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
  await f.controller.refresh();
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
  await f.controller.grant({isTrusted:true});
  assert.equal(f.requests.length,0,'missing cookies does not re-request granted websites');
});

test('diagnostics groups Chrome permissions and keeps site recovery available outside Develop', async () => {
  const view=createDeveloperView();
  try {
    view.patch('site-access-status',{data:{websites:false}});
    view.patch('script-user-scripts-recovery',{hidden:false});
    const render=async activeTab=>parseHTML(await renderSidebarFixture({activeTab,developerView:view})).document;
    const task=await render('tasks');
    assert.ok(task.querySelector('#site-access-restore:not([disabled])'));
    assert.equal(task.getElementById('site-access-recovery').closest('[hidden], [role="tabpanel"]'),null);
    assert.ok(task.getElementById('browser-user-scripts-settings').closest('[hidden]'));

    const editor=await render('develop');
    assert.equal(editor.getElementById('script-user-scripts-settings').closest('[hidden]'),null);
    view.navigate('diagnostics');
    const diagnostics=await render('develop');
    const find=id=>diagnostics.getElementById(id);
    const ids=[...diagnostics.querySelectorAll('[id]')].map(node=>node.id);
    assert.equal(new Set(ids).size,ids.length,'DOM IDs must stay unique');
    const chromePermissions=find('develop-chrome-permissions-title').parentElement;
    assert.ok(chromePermissions.contains(find('site-access-grant')));
    assert.ok(chromePermissions.contains(find('browser-user-scripts-settings')));
    assert.equal(chromePermissions.closest('[hidden], details'),null);
    assert.ok(find('script-user-scripts-settings').closest('[hidden]'),'only one settings action is visible in diagnostics');
    for(const id of ['site-access-cookies','site-access-notifications'])assert.equal(find(id),null);
  } finally {view.dispose();}
});
