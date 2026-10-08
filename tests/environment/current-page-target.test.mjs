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
  const webNavigation = {onBeforeNavigate:event(),onCommitted:event(),onErrorOccurred:event(),onHistoryStateUpdated:event(),onReferenceFragmentUpdated:event(),
    getAllFrames: async ({tabId: id}) => id === state.tabId ? [{frameId:0,documentId:state.documentId,url:state.url,documentLifecycle:'active'}] : []};
  const windows = {onRemoved:event(),getCurrent:async()=>({id:state.windowId,incognito:false})};
  return {state,api:{tabs,webNavigation,windows}};
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

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
  const events=[api.tabs.onActivated,api.tabs.onUpdated,api.tabs.onRemoved,api.webNavigation.onBeforeNavigate,api.webNavigation.onCommitted,api.webNavigation.onErrorOccurred,
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
  assert.equal(target.snapshot.tabId,12); target.dispose();
});

test('a disposed Sidebar cannot capture or finish an in-flight candidate validation', async () => {
  const {api}=fixture(); const target=createCurrentPageTarget({api}); await target.ready;
  const captured=target.capture(), query=api.tabs.query; let release, blocked=true;
  api.tabs.query=async input=>{if(blocked){blocked=false;await new Promise(resolve=>{release=resolve;});} return query(input);};
  const validation=assert.rejects(target.revalidate(captured),{code:'E_HOST_CLOSED'});
  await tick(); target.dispose(); release(); await validation;
  assert.throws(()=>target.capture(),{code:'E_HOST_CLOSED'});
});
