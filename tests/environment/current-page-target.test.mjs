import test from 'node:test';
import assert from 'node:assert/strict';
import {createCurrentPageTarget} from '../../src/ui/current-page-target.js';

function event() {
  const listeners = new Set();
  return {addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); },
    emit(...args) { for (const fn of [...listeners]) fn(...args); }, get size() { return listeners.size; }};
}
function fixture({windowId = 7, tabId = 11, documentId = 'doc-a', url = 'https://example.com/a'} = {}) {
  const state = {windowId, tabId, documentId, url, title: 'A', incognito: false, pendingUrl: undefined, status: 'complete'};
  const tabs = {onActivated:event(), onUpdated:event(), onRemoved:event(),
    query: async query => query.windowId === state.windowId && query.active ? [{id:state.tabId,windowId:state.windowId,active:true,
      incognito:state.incognito,url:state.url,title:state.title,pendingUrl:state.pendingUrl,status:state.status}] : []};
  const webNavigation = {onBeforeNavigate:event(),onCommitted:event(),onCompleted:event(),onErrorOccurred:event(),onHistoryStateUpdated:event(),onReferenceFragmentUpdated:event(),
    getAllFrames: async ({tabId: id}) => id === state.tabId ? [{frameId:0,documentId:state.documentId,url:state.url,documentLifecycle:'active'}] : []};
  const windows = {onRemoved:event(),getCurrent:async()=>({id:state.windowId,incognito:false})};
  return {state,api:{tabs,webNavigation,windows}};
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const advance = async (t, ms) => { t.mock.timers.tick(ms); await flush(); };

async function retryFixture(t) {
  t.mock.timers.enable({apis:['setTimeout', 'Date'], now:0});
  const f = fixture(), query = f.api.tabs.query;
  let queries = 0;
  f.api.tabs.query = async input => { queries++; return query(input); };
  const target = createCurrentPageTarget({api:f.api});
  t.after(() => target.dispose());
  await target.ready;
  return {...f, target, queries:() => queries};
}

test('an early final completion recovers after loading settles without another browser event', async t => {
  const {api, state, target} = await retryFixture(t), captured = target.capture();
  api.webNavigation.onBeforeNavigate.emit({tabId:11,frameId:0});
  state.status = 'loading'; state.documentId = 'doc-next'; state.url = 'https://next.example/';
  api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
  assert.throws(() => target.capture(), {code:'E_DOCUMENT_UNRESOLVED'});
  await advance(t, 250);
  assert.throws(() => target.capture(), {code:'E_DOCUMENT_UNRESOLVED'});
  state.status = 'complete';
  await advance(t, 500);
  assert.equal(target.capture().documentId, 'doc-next');
  assert.equal(target.capture().origin, 'https://next.example');
  await assert.rejects(target.revalidate(captured), {code:'E_DOCUMENT_STALE'});
});

test('navigation re-observation is bounded and does not churn identical unavailable snapshots', async t => {
  const {api, state, target, queries} = await retryFixture(t);
  state.status = 'loading';
  api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
  const states = [], unsubscribe = target.subscribe(value => states.push(value));
  const initialQueries = queries();
  for (let i = 0; i < 40; i++) await advance(t, 250);
  assert.ok(queries() > initialQueries, 'navigation must actually schedule re-observation');
  assert.ok(queries() - initialQueries <= 6, 'the retry budget must terminate');
  assert.equal(states.length, 1, 'silent retries must not repeatedly invalidate sandbox tickets');
  const finalQueries = queries(); state.status = 'complete';
  await advance(t, 20000);
  assert.equal(queries(), finalQueries);
  assert.equal(target.snapshot.status, 'unavailable', 'exhaustion cannot admit a document');
  unsubscribe();
});

test('explicit quiet re-observation recovers after exhaustion without repeated pending notifications', async t => {
  const {api, state, target, queries} = await retryFixture(t);
  state.status = 'loading';
  api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
  for (let i = 0; i < 40; i++) await advance(t, 250);
  const states = []; target.subscribe(value => states.push(value));
  await target.refresh({quiet:true,preserveRetry:true});
  assert.equal(states.length, 1, 'an unchanged pending target must not restart sandbox requests');
  state.status = 'complete'; state.documentId = 'doc-after-budget';
  await target.refresh({quiet:true,preserveRetry:true});
  assert.equal(target.capture().documentId, 'doc-after-budget');
  assert.deepEqual(states.map(value => value.status), ['unavailable','available']);
  const finalQueries = queries(); await advance(t, 20000);
  assert.equal(queries(), finalQueries, 'manual observation must not start a new polling budget');
});

test('activation and disposal cancel a queued navigation retry', async t => {
  const {api, state, target, queries} = await retryFixture(t), captured = target.capture();
  state.status = 'loading';
  api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
  state.tabId = 12; state.documentId = 'doc-other'; state.url = 'https://other.example/'; state.status = 'complete';
  api.tabs.onActivated.emit({windowId:7,tabId:12}); await flush();
  const activatedQueries = queries(); await advance(t, 10000);
  assert.equal(queries(), activatedQueries);
  assert.equal(target.capture().documentId, 'doc-other');
  await assert.rejects(target.revalidate(captured), {code:'E_DOCUMENT_STALE'});
  state.status = 'loading';
  api.webNavigation.onCompleted.emit({tabId:12,frameId:0}); await flush();
  target.dispose(); const disposedQueries = queries();
  await advance(t, 10000);
  assert.equal(queries(), disposedQueries);
  assert.throws(() => target.capture(), {code:'E_HOST_CLOSED'});
});

test('a superseded in-flight retry cannot publish or re-arm after activation or disposal', async t => {
  for (const action of ['activate', 'dispose']) {
    await t.test(action, async t => {
      const {api, state, target, queries} = await retryFixture(t);
      state.status = 'loading';
      api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
      const query = api.tabs.query; let release;
      api.tabs.query = async input => {
        const selected = await query(input);
        if (!release) await new Promise(resolve => { release = resolve; });
        return selected;
      };
      await advance(t, 250);
      assert.equal(typeof release, 'function', 'a retry must be in flight');
      if (action === 'activate') {
        state.tabId = 12; state.documentId = 'doc-other'; state.status = 'complete';
        api.tabs.onActivated.emit({windowId:7,tabId:12}); await flush();
      } else target.dispose();
      const snapshot = target.snapshot; release(); await flush();
      const finalQueries = queries(); await advance(t, 10000);
      assert.equal(target.snapshot, snapshot);
      assert.equal(queries(), finalQueries);
    });
  }
});

test('new navigation, navigation error, tab/window removal and explicit refresh cancel old retries', async t => {
  for (const action of ['onBeforeNavigate', 'onErrorOccurred', 'tabRemoved', 'windowRemoved', 'refresh']) {
    await t.test(action, async t => {
      const {api, state, target, queries} = await retryFixture(t);
      state.status = 'loading';
      api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
      if (action === 'tabRemoved') api.tabs.onRemoved.emit(11, {windowId:7});
      else if (action === 'windowRemoved') api.windows.onRemoved.emit(7);
      else if (action === 'refresh') await target.refresh();
      else api.webNavigation[action].emit({tabId:11,frameId:0});
      await flush(); const finalQueries = queries();
      state.status = 'complete'; await advance(t, 10000);
      assert.equal(queries(), finalQueries);
      assert.equal(target.snapshot.status, 'unavailable');
    });
  }
});

test('unsupported, incognito, errored frames and API failures never retry navigation', async t => {
  for (const failure of ['unsupported', 'incognito', 'frame-error', 'permission', 'unresolved-exception']) {
    await t.test(failure, async t => {
      const {api, state, target, queries} = await retryFixture(t);
      if (failure === 'unsupported') state.url = 'chrome://settings/';
      if (failure === 'incognito') state.incognito = true;
      if (failure === 'frame-error') api.webNavigation.getAllFrames = async () => [{frameId:0,errorOccurred:true}];
      if (failure === 'permission' || failure === 'unresolved-exception')
        api.webNavigation.getAllFrames = async () => { throw Object.assign(Error('denied'),
          failure === 'permission' ? {code:'E_PERMISSION'} : {}); };
      api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
      const finalQueries = queries(); await advance(t, 10000);
      assert.equal(queries(), finalQueries);
      assert.equal(target.snapshot.status, 'unavailable');
    });
  }
});

test('stale revalidation cannot consume navigation recovery and successful revalidation stops it', async t => {
  const {api, state, target, queries} = await retryFixture(t), captured = target.capture();
  state.status = 'loading';
  api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
  await assert.rejects(target.revalidate(captured), {code:'E_DOCUMENT_STALE'});
  state.status = 'complete'; state.documentId = 'doc-next';
  await advance(t, 250);
  assert.equal(target.capture().documentId, 'doc-next');
  const current = target.capture(); state.status = 'loading';
  api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
  state.status = 'complete'; await target.revalidate(current);
  const finalQueries = queries(); await advance(t, 10000);
  assert.equal(queries(), finalQueries);
});

test('title-only observations preserve the existing navigation recovery budget', async t => {
  const {api, state, target} = await retryFixture(t);
  state.status = 'loading';
  api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
  await advance(t, 250);
  state.title = 'Updated title';
  api.tabs.onUpdated.emit(11, {title:state.title}, {windowId:7,active:true}); await flush();
  state.status = 'complete'; state.documentId = 'doc-settled';
  await advance(t, 500);
  assert.equal(target.capture().documentId, 'doc-settled');
});

test('navigation retries retain main-document URL and lifecycle admission checks', async t => {
  const {api, state, target} = await retryFixture(t), frames = api.webNavigation.getAllFrames;
  state.status = 'loading';
  api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
  state.status = 'complete'; state.url = 'https://next.example/'; state.documentId = 'doc-next';
  api.webNavigation.getAllFrames = async input => (await frames(input)).map(frame => ({...frame,url:'https://old.example/'}));
  await advance(t, 250);
  assert.throws(() => target.capture(), {code:'E_DOCUMENT_UNRESOLVED'});
  api.webNavigation.getAllFrames = async input => (await frames(input)).map(frame => ({...frame,documentLifecycle:'prerender'}));
  await advance(t, 500);
  assert.throws(() => target.capture(), {code:'E_DOCUMENT_UNRESOLVED'});
  api.webNavigation.getAllFrames = frames;
  await advance(t, 1000);
  assert.equal(target.capture().documentId, 'doc-next');
});

test('late timers and in-flight results cannot observe or publish beyond the ten-second budget', async t => {
  for (const inFlight of [false, true]) {
    await t.test(inFlight ? 'in-flight result' : 'overdue timer', async t => {
      const {api, state, target, queries} = await retryFixture(t);
      state.status = 'loading';
      api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
      const query = api.tabs.query; let release;
      if (inFlight) {
        api.tabs.query = async input => { const selected = await query(input);
          await new Promise(resolve => { release = resolve; }); return selected; };
        await advance(t, 250);
        assert.equal(typeof release, 'function');
      }
      const finalQueries = queries(); state.status = 'complete';
      await advance(t, 10000);
      if (inFlight) { release(); await flush(); }
      assert.equal(queries(), finalQueries);
      assert.equal(target.snapshot.status, 'unavailable');
    });
  }
});

test('incognito discovered by the final retry confirmation is terminal', async t => {
  const {api, state, target, queries} = await retryFixture(t);
  state.status = 'loading';
  api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await flush();
  state.status = 'complete';
  const query = api.tabs.query; let reads = 0;
  api.tabs.query = async input => (await query(input)).map(tab => ({...tab,incognito:++reads > 1}));
  await advance(t, 250);
  const finalQueries = queries();
  for (const delay of [500, 1000, 2000, 4000]) await advance(t, delay);
  assert.equal(queries(), finalQueries);
  assert.equal(target.snapshot.status, 'unavailable');
});

test('navigation starts invalidate the visible old document before tabs updates and recover after failure or commit', async () => {
  const {api, state} = fixture(), target = createCurrentPageTarget({api});
  await target.ready;
  api.webNavigation.onBeforeNavigate.emit({tabId:11,frameId:0,url:state.url});
  assert.equal(target.snapshot.status, 'unavailable');
  assert.throws(()=>target.capture(), {code:'E_DOCUMENT_UNRESOLVED'});
  api.webNavigation.onErrorOccurred.emit({tabId:11,frameId:0}); await tick();
  assert.equal(target.snapshot.status, 'available');
  api.webNavigation.onBeforeNavigate.emit({tabId:11,frameId:0,url:state.url});
  state.documentId = 'new-document';
  api.webNavigation.onCommitted.emit({tabId:11,frameId:0}); await tick();
  assert.equal(target.snapshot.documentId, 'new-document');
  target.dispose();
});

test('loading and unloaded tabs never expose their still-visible old document as a runnable candidate', async () => {
  for (const status of ['loading', 'unloaded']) {
    const {api, state} = fixture(); state.status = status;
    const target = createCurrentPageTarget({api}); await target.ready;
    assert.equal(target.snapshot.status, 'unavailable');
    assert.throws(() => target.capture(), {code: 'E_DOCUMENT_UNRESOLVED'});
    state.status = 'complete'; await target.refresh(); const captured = target.capture();
    state.status = status;
    await assert.rejects(target.revalidate(captured), {code: 'E_DOCUMENT_STALE'});
    target.dispose();
  }
});

test('restricted schemes are classified before loading state without observing a privileged document', async () => {
  for (const url of ['chrome-extension://example/options.html', 'chrome://settings/', 'file:///example.html']) {
    for (const status of ['complete', 'loading', 'unloaded']) {
      const {api, state} = fixture({url}); state.status = status;
      api.webNavigation.getAllFrames = async () => { throw Error('restricted frames must not be queried'); };
      const target = createCurrentPageTarget({api}); await target.ready;
      assert.equal(target.snapshot.reason, 'E_UNSUPPORTED_SCHEME', `${url} ${status}`);
      assert.throws(() => target.capture(), {code:'E_UNSUPPORTED_SCHEME'});
      assert.equal(target.snapshot.url, undefined);
      target.dispose();
    }
  }
});

test('pending destination decides restricted versus navigating state without reusing the old site', async () => {
  const {api, state} = fixture();
  const target = createCurrentPageTarget({api}); await target.ready;
  state.pendingUrl = 'chrome://settings/'; state.status = 'loading';
  await target.refresh();
  assert.equal(target.snapshot.reason, 'E_UNSUPPORTED_SCHEME');
  state.url = 'chrome://settings/'; state.pendingUrl = 'https://next.example/'; state.status = 'complete';
  await target.refresh();
  assert.equal(target.snapshot.reason, 'E_DOCUMENT_UNRESOLVED');
  assert.throws(() => target.capture(), {code:'E_DOCUMENT_UNRESOLVED'});
  target.dispose();
});

test('completion recovers a loading observation after commit without another tabs update', async () => {
  const {api, state} = fixture();
  const target = createCurrentPageTarget({api}); await target.ready;
  const captured = target.capture();
  api.webNavigation.onBeforeNavigate.emit({tabId:11,frameId:0});
  state.status = 'loading';
  api.tabs.onUpdated.emit(11, {status:'loading'}, {windowId:7,active:true}); await tick();
  state.url = 'https://next.example/'; state.documentId = 'doc-next';
  api.webNavigation.onCommitted.emit({tabId:11,frameId:0}); await tick();
  assert.throws(() => target.capture(), {code:'E_DOCUMENT_UNRESOLVED'});
  state.status = 'complete';
  api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await tick();
  assert.equal(target.snapshot.status, 'available');
  assert.equal(target.snapshot.documentId, 'doc-next');
  assert.equal(target.snapshot.origin, 'https://next.example');
  await assert.rejects(target.revalidate(captured), {code:'E_DOCUMENT_STALE'});
  target.dispose();
});

test('a restricted active tab can recover through main-document navigation events only', async () => {
  const {api, state} = fixture({url:'chrome-extension://example/options.html'});
  const target = createCurrentPageTarget({api}); await target.ready;
  assert.equal(target.snapshot.reason, 'E_UNSUPPORTED_SCHEME');
  state.url = 'https://example.com/'; state.documentId = 'doc-supported';
  api.webNavigation.onCommitted.emit({tabId:11,frameId:0}); await tick();
  assert.equal(target.snapshot.status, 'available');
  assert.equal(target.snapshot.documentId, 'doc-supported');
  target.dispose();
});

test('main-frame completion recovers a URL mismatch while unrelated navigation cannot admit it', async () => {
  const {api, state} = fixture();
  let frameUrl = state.url;
  api.webNavigation.getAllFrames = async () => [{frameId:0,documentId:state.documentId,
    url:frameUrl,documentLifecycle:'active'}];
  const target = createCurrentPageTarget({api}); await target.ready;
  state.url = 'https://example.com/next';
  api.tabs.onUpdated.emit(11, {url:state.url}, {windowId:7,active:true}); await tick();
  assert.equal(target.snapshot.reason, 'E_DOCUMENT_UNRESOLVED');
  frameUrl = state.url; state.documentId = 'doc-next';
  for (const details of [{tabId:12,frameId:0},{tabId:11,frameId:1}]) {
    api.webNavigation.onCompleted.emit(details); await tick();
    assert.equal(target.snapshot.reason, 'E_DOCUMENT_UNRESOLVED');
  }
  api.webNavigation.onCompleted.emit({tabId:11,frameId:0}); await tick();
  assert.equal(target.snapshot.documentId, 'doc-next');
  target.dispose();
});

test('activation retires the old event route before querying the new active tab', async () => {
  const {api, state} = fixture();
  const target = createCurrentPageTarget({api}); await target.ready;
  const query = api.tabs.query;
  let release, first = true;
  api.tabs.query = async input => {
    const selected = await query(input);
    if (first) { first = false; await new Promise(resolve => { release = resolve; }); }
    return selected;
  };
  state.tabId = 12; state.documentId = 'doc-b'; state.url = 'https://next.example/';
  api.tabs.onActivated.emit({windowId:7,tabId:12}); await tick();
  api.webNavigation.onBeforeNavigate.emit({tabId:11,frameId:0});
  release(); await tick();
  assert.equal(target.snapshot.status, 'available');
  assert.equal(target.snapshot.tabId, 12);
  assert.equal(target.snapshot.documentId, 'doc-b');
  target.dispose();
});

test('a tab becoming loading after frame observation fails the final candidate confirmation', async () => {
  const {api, state} = fixture(), frames = api.webNavigation.getAllFrames;
  api.webNavigation.getAllFrames = async input => {const value = await frames(input); state.status = 'loading'; return value;};
  const target = createCurrentPageTarget({api}); await target.ready;
  assert.equal(target.snapshot.status, 'unavailable'); target.dispose();
});

test('Sidebar binds to its own browser window and exposes only the active HTTP(S) main document', async () => {
  const {api} = fixture(); const target = createCurrentPageTarget({api});
  await target.ready;
  assert.deepEqual(target.snapshot, {status:'available',windowId:7,tabId:11,frameId:0,documentId:'doc-a',
    url:'https://example.com/a',origin:'https://example.com',title:'A'});
  assert.deepEqual(target.capture().windowId, 7);
  target.dispose();
});

test('same-URL tab switch cannot replace the captured run candidate', async () => {
  const {api,state} = fixture(); const target = createCurrentPageTarget({api}); await target.ready;
  const captured = target.capture();
  state.tabId = 12; state.documentId = 'doc-b'; state.title = 'B';
  await assert.rejects(target.revalidate(captured), {code:'E_DOCUMENT_STALE'});
  assert.equal(target.snapshot.tabId, 12); assert.equal(target.snapshot.documentId, 'doc-b');
  target.dispose();
});

test('SPA URL change before admission is stale even when documentId is unchanged', async () => {
  const {api,state} = fixture(); const target = createCurrentPageTarget({api}); await target.ready;
  const captured = target.capture(); state.url = 'https://example.com/b';
  await assert.rejects(target.revalidate(captured), {code:'E_DOCUMENT_STALE'});
  assert.equal(target.snapshot.documentId, 'doc-a'); assert.equal(target.snapshot.url, 'https://example.com/b');
  target.dispose();
});

test('reload/full navigation invalidates the old candidate instead of matching by URL', async () => {
  const {api,state} = fixture(); const target = createCurrentPageTarget({api}); await target.ready;
  const captured = target.capture(); state.documentId = 'doc-reloaded';
  await assert.rejects(target.revalidate(captured), {code:'E_DOCUMENT_STALE'});
  target.dispose();
});

test('Current Page follows activation events but never falls back to a previous valid page', async () => {
  const {api,state} = fixture(); const target = createCurrentPageTarget({api}); await target.ready;
  state.tabId = 20; state.documentId = 'chrome-doc'; state.url = 'chrome://settings'; state.title = 'Settings';
  api.tabs.onActivated.emit({windowId:7,tabId:20}); await tick();
  assert.equal(target.snapshot.status, 'unavailable'); assert.equal(target.snapshot.reason, 'E_UNSUPPORTED_SCHEME');
  assert.equal(target.snapshot.tabId, undefined);
  target.dispose();
});

test('two Sidebar instances bind independently to their containing browser windows', async () => {
  const left = fixture({windowId:1,tabId:10,documentId:'left-doc',url:'https://left.example/'});
  const right = fixture({windowId:2,tabId:20,documentId:'right-doc',url:'https://right.example/'});
  const a=createCurrentPageTarget({api:left.api}), b=createCurrentPageTarget({api:right.api});
  await Promise.all([a.ready,b.ready]);
  assert.deepEqual([a.capture().windowId,a.capture().tabId],[1,10]);
  assert.deepEqual([b.capture().windowId,b.capture().tabId],[2,20]);
  a.dispose(); b.dispose();
});

test('dispose releases all browser event subscriptions', async () => {
  const {api}=fixture(); const target=createCurrentPageTarget({api}); await target.ready;
  const events=[api.tabs.onActivated,api.tabs.onUpdated,api.tabs.onRemoved,api.webNavigation.onBeforeNavigate,api.webNavigation.onCommitted,api.webNavigation.onCompleted,api.webNavigation.onErrorOccurred,
    api.webNavigation.onHistoryStateUpdated,api.webNavigation.onReferenceFragmentUpdated,api.windows.onRemoved];
  assert.ok(events.every(item=>item.size===1)); target.dispose(); assert.ok(events.every(item=>item.size===0));
});

test('a late revalidation cannot overwrite a newer Current Page observation', async () => {
  const {api,state}=fixture(); const target=createCurrentPageTarget({api}); await target.ready;
  const captured=target.capture(), query=api.tabs.query;
  let release;
  api.tabs.query=async input=>{
    const observed=await query(input);
    if (!release) await new Promise(resolve=>{release=resolve;});
    return observed;
  };
  const validation=assert.rejects(target.revalidate(captured),{code:'E_DOCUMENT_STALE'});
  await tick(); state.tabId=12; state.documentId='doc-b'; state.title='B';
  await target.refresh(); release(); await validation;
  assert.equal(target.snapshot.tabId,12);
  api.webNavigation.onBeforeNavigate.emit({tabId:12,frameId:0});
  assert.equal(target.snapshot.status,'unavailable');
  target.dispose();
});

test('a disposed Sidebar cannot capture or finish an in-flight candidate validation', async () => {
  const {api}=fixture(); const target=createCurrentPageTarget({api}); await target.ready;
  const captured=target.capture(), query=api.tabs.query; let release, blocked=true;
  api.tabs.query=async input=>{if(blocked){blocked=false;await new Promise(resolve=>{release=resolve;});} return query(input);};
  const validation=assert.rejects(target.revalidate(captured),{code:'E_HOST_CLOSED'});
  await tick(); target.dispose(); release(); await validation;
  assert.throws(()=>target.capture(),{code:'E_HOST_CLOSED'});
});
