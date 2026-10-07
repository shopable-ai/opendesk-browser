import test from 'node:test';
import assert from 'node:assert/strict';
import {configureSidePanel, createHealthProbe, isToolSender, PROTOCOL, httpUrl, permissionPattern} from '../../src/environment.js';
import {createEnvironmentHost} from '../../src/run-host.js';

const extension = 'fixture-extension';
const toolUrl = `chrome-extension://${extension}/ui/tool.html`;
test('product shell configures the Chrome Side Panel action and never creates a popup', async () => {
  let configured = 0, popups = 0;
  const api = {sidePanel:{setPanelBehavior:async options=>{configured++;assert.deepEqual(options,{openPanelOnActionClick:true});}},
    windows:{create:async()=>{popups++;}}};
  assert.deepEqual(await configureSidePanel(api), {openPanelOnActionClick:true});
  assert.equal(configured,1); assert.equal(popups,0);
});
test('tool sender rejects foreign id, URL, frame, inactive document and missing document', () => {
  const api = {runtime: {id: extension, getURL: () => toolUrl}};
  const good = {id: extension, url: toolUrl, frameId: 0, documentId: 'd', documentLifecycle: 'active'};
  assert.equal(isToolSender(api, good), true);
  for (const changed of [{id: 'evil'}, {url: 'https://example.com'}, {frameId: 1}, {documentId: ''}, {documentLifecycle: 'cached'}, {tab: {incognito: true}}]) {
    assert.equal(isToolSender(api, {...good, ...changed}), false);
  }
});
test('URL policy rejects restricted/file/credentials and preserves exact origin including port', () => {
  for (const value of ['chrome://settings', 'file:///tmp/test', 'javascript:alert(1)', 'https://user:pass@example.com/']) assert.throws(() => httpUrl(value));
  assert.equal(httpUrl('http://localhost:8001/list').origin, 'http://localhost:8001');
  assert.equal(permissionPattern('http://localhost:8001/list'), 'http://localhost/*');
});
function fixture() {
  let granted = true, currentOrigin = 'https://example.com', currentDoc = 'doc-1', tabOpen = true, forgedReply = false;
  let probe, calls = 0, injections = 0, hideUrlWhenRevoked = false;
  const event = {addListener() {}, removeListener() {}};
  const api = {
    runtime: {id: extension},
    permissions: {contains: async () => granted},
    tabs: {
      onUpdated: event, onRemoved: event,
      get: async id => { if (!tabOpen) throw Error('closed'); return {id, url: hideUrlWhenRevoked && !granted ? undefined : `${currentOrigin}/list`, status: 'complete'}; },
      sendMessage: async (id, message, target) => {
        calls++;
        assert.deepEqual(target, {documentId: 'doc-1', frameId: 0});
        if (currentDoc !== target.documentId) throw Error('no receiver');
        return {protocol: PROTOCOL, requestId: forgedReply ? 'other-request' : message.requestId,
          agentInstanceId: 'agent-1', origin: currentOrigin, readyState: 'complete'};
      }
    },
    scripting: {executeScript: async request => {
      injections++;
      assert.deepEqual(request, {target: {tabId: 3, frameIds: [0]}, files: ['agents/health.js'], world: 'ISOLATED'});
      setTimeout(() => probe.rememberReady({agentInstanceId: 'agent-1'}, {id: extension, tab: {id: 3}, frameId: 0, documentId: 'doc-1', documentLifecycle: 'active', url: `${currentOrigin}/list`}), 1);
      return [{frameId: 0, documentId: 'doc-1', result: {fakeSelection: 'never use file evaluation result'}}];
    }}
  };
  probe = createHealthProbe(api, {timeoutMs: 30});
  return {api, probe, state: {
    set granted(v) { granted = v; }, set currentOrigin(v) { currentOrigin = v; }, set currentDoc(v) {currentDoc = v;},
    set tabOpen(v) {tabOpen = v;}, set forgedReply(v) {forgedReply = v;}, get calls() { return calls; },
    set hideUrlWhenRevoked(v) {hideUrlWhenRevoked = v;}, get injections() { return injections; }
  }};
}
test('health waits for sender readiness and binds Chrome document metadata, not file result', async () => {
  const {probe} = fixture(); const data = await probe.bind(3, 'https://example.com', 'optional');
  assert.equal(data.target.documentId, 'doc-1'); assert.equal(data.selectionImplemented, false);
  assert.equal(data.fakeSelection, undefined);
});
test('revoked permission blocks even previously installed agent', async () => {
  const {probe, state} = fixture(); const {target} = await probe.bind(3, 'https://example.com', 'optional');
  state.granted = false;
  await assert.rejects(probe.ping(target), {code: 'E_PERMISSION'}); assert.equal(state.calls, 1);
});
test('reload, cross-origin and closed tab reject bound target without automatic reinjection', async () => {
  for (const change of [{currentDoc: 'doc-2'}, {currentOrigin: 'https://other.example'}, {tabOpen: false}]) {
    const {probe, state} = fixture(); const {target} = await probe.bind(3, 'https://example.com', 'optional');
    Object.assign(state, change); await assert.rejects(probe.ping(target), {code: 'E_TARGET'});
  }
});
test('forged health nonce and fake sender cannot satisfy exact target', async () => {
  const {probe, state} = fixture();
  assert.throws(() => probe.rememberReady({agentInstanceId: 'agent-1'}, {id: 'evil', tab: {id: 3}, frameId: 0, documentId: 'doc-1', documentLifecycle: 'active', url: 'https://example.com'}), {code: 'E_TARGET'});
  const {target} = await probe.bind(3, 'https://example.com', 'optional'); state.forgedReply = true;
  await assert.rejects(probe.ping(target), {code: 'E_TARGET'});
  await assert.rejects(probe.ping({...target, frameId: 1}), {code: 'E_TARGET'});
});
test('missing module has no capabilities or runner and can be mounted/disposed', () => {
  const host = createEnvironmentHost(); const root = {dataset: {}};
  host.module.mountToolPanel(root);
  assert.equal(root.dataset.moduleStatus, 'MODULE_NOT_INSTALLED');
  assert.deepEqual(host.handshake.capabilities, []);
  for (const method of ['compileTemplate', 'preview', 'createRunner', 'formatExport']) assert.throws(() => host.module[method](), {code: 'MODULE_NOT_INSTALLED'});
  assert.equal(host.productionRunHostImplemented, false); host.dispose();
});

test('Side Panel configuration failure is surfaced without a popup fallback', async () => {
  let popups=0;
  const api={sidePanel:{setPanelBehavior:async()=>{throw Error('configuration failed');}},windows:{create:async()=>{popups++;}}};
  await assert.rejects(configureSidePanel(api),{code:'E_TARGET'});assert.equal(popups,0);
});
test('unknown authorization mode is rejected before another injection', async () => {
  const {probe,state}=fixture(); await probe.bind(3,'https://example.com','optional');
  const injections=state.injections;
  await assert.rejects(probe.bind(3,'https://example.com','unknown'),{code:'E_PERMISSION'});
  assert.equal(state.injections,injections);
});
test('permission revoke reports permission failure even when Chrome hides tab URL', async () => {
  const {probe,state}=fixture(); const {target}=await probe.bind(3,'https://example.com','optional');
  state.hideUrlWhenRevoked=true; state.granted=false;
  await assert.rejects(probe.ping(target),{code:'E_PERMISSION'}); assert.equal(state.calls,1);
});
test('permission revoked during tabs.get is diagnosed before inspecting its hidden URL', async () => {
  const {api,probe,state}=fixture(); const {target}=await probe.bind(3,'https://example.com','optional');
  api.tabs.get=async id=>{state.granted=false;return{id,url:undefined,status:'complete'};};
  await assert.rejects(probe.ping(target),{code:'E_PERMISSION'}); assert.equal(state.calls,1);
});
test('repeated agent ready preserves optional authorization and cannot bypass revoke', async () => {
  const {probe,state}=fixture(); const {target}=await probe.bind(3,'https://example.com','optional');
  probe.rememberReady({agentInstanceId:'agent-1'},{id:extension,tab:{id:3},frameId:0,documentId:'doc-1',documentLifecycle:'active',url:'https://example.com/list'});
  state.granted=false; await assert.rejects(probe.ping(target),{code:'E_PERMISSION'});
});
test('same-document concurrent binding resolves all readiness waiters', async () => {
  const {probe}=fixture(); const [a,b]=await Promise.all([probe.bind(3,'https://example.com','optional'),probe.bind(3,'https://example.com','optional')]);
  assert.deepEqual(a.target,b.target);
});
test('document invalidation and revoke while awaiting reply reject late health success', async () => {
  for (const invalidate of ['reload','permission']) {
    let pending,started; const delivered=new Promise(done=>{started=done;});
    const api={runtime:{id:extension},permissions:{contains:async()=>granted},tabs:{get:async()=>({url:'https://example.com/list'}),sendMessage:async(id,message)=>{
      if(!hang)return {protocol:PROTOCOL,requestId:message.requestId,agentInstanceId:'agent-1',origin:'https://example.com',readyState:'complete'};
      started();return new Promise(done=>{pending=()=>done({protocol:PROTOCOL,requestId:message.requestId,agentInstanceId:'agent-1',origin:'https://example.com',readyState:'complete'});});
    }},scripting:{executeScript:async()=>{probe.rememberReady({agentInstanceId:'agent-1'},{id:extension,tab:{id:3},frameId:0,documentId:'doc-1',documentLifecycle:'active',url:'https://example.com/list'});return[{frameId:0,documentId:'doc-1'}];}}};
    let granted=true,hang=false;const probe=createHealthProbe(api,{timeoutMs:200});const {target}=await probe.bind(3,'https://example.com','optional');hang=true;
    const response=probe.ping(target);await delivered;
    if(invalidate==='reload')probe.forgetTab(3);else granted=false;
    pending();await assert.rejects(response,{code:invalidate==='reload'?'E_TARGET':'E_PERMISSION'});
  }
});
