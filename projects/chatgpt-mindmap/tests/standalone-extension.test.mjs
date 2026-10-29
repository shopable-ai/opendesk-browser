import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir, mkdtemp, rm, readdir, symlink, stat} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';
import {MessageChannel} from 'node:worker_threads';
import {Script} from 'node:vm';
import {spawnSync} from 'node:child_process';
import {buildStandalone, guardSnowbrush, TIMER_GUARD, parseStandaloneArgs} from '../scripts/build-standalone.mjs';
import {createLocalOwner} from '../standalone/owner.js';
import {installBootstrapBroker} from '../standalone/broker.js';
import {createStandaloneFrameFactory} from '../standalone/frame-factory.js';
import {startRelay} from '../standalone/relay.js';
import {startSandbox} from '../standalone/sandbox.js';
import {BOOTSTRAP, bootstrapMessage, CHATGPT_ORIGIN} from '../standalone/bootstrap.js';
import {createXmindFrameRenderer} from '../src/xmind-frame.js';
import {serveXmindFrame} from '../src/xmind-frame-child.js';
import {verifyXmindZip} from '../src/export.js';
import {verifyFixedXmindAssets} from '../preview/serve.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const repository = resolve(project, '../..');
const extension = 'chrome-extension://' + 'a'.repeat(32);
const identity = () => ({sessionId: randomUUID(), instanceId: 'answer-1', revision: 0});
const tick = () => new Promise(resolve => setImmediate(resolve));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hooks = () => {
  const listeners = new Set();
  return {addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
    emit: (...args) => { for (const fn of [...listeners]) fn(...args); }};
};
function message(window, {data, source, origin, ports = []}) {
  const event = new Event('message');
  Object.assign(event, {data, source, origin, ports});
  window.dispatchEvent(event);
}
function fakeWindow(href) {
  return Object.assign(new EventTarget(), {location: new URL(href), crypto: {randomUUID},
    MessageChannel, Event, setTimeout, clearTimeout, setInterval, clearInterval});
}
function pairedPorts(name, sender) {
  const client = {name, onMessage: hooks(), onDisconnect: hooks()};
  const server = {name, sender, onMessage: hooks(), onDisconnect: hooks()};
  let closed = false;
  client.postMessage = data => { if (!closed) queueMicrotask(() => { if (!closed) server.onMessage.emit(structuredClone(data)); }); };
  server.postMessage = data => { if (!closed) queueMicrotask(() => { if (!closed) client.onMessage.emit(structuredClone(data)); }); };
  client.disconnect = server.disconnect = () => {
    if (closed) return;
    closed = true; client.onDisconnect.emit(); server.onDisconnect.emit();
  };
  Object.defineProperty(client, 'closed', {get: () => closed});
  return {client, server};
}
function brokerHarness() {
  const runtime = {id: 'a'.repeat(32), onConnect: hooks(), getURL: path => extension + '/' + path};
  const stop = installBootstrapBroker(runtime), ports = [];
  const clientRuntime = sender => ({...runtime, connect({name}) {
    const pair = pairedPorts(name, {id: runtime.id, ...sender}); ports.push(pair.client);
    queueMicrotask(() => runtime.onConnect.emit(pair.server));
    return pair.client;
  }});
  return {runtime, clientRuntime, ports, stop};
}
const contentSender = {tab: {id: 42}, frameId: 0, documentId: 'content-document',
  origin: CHATGPT_ORIGIN, url: CHATGPT_ORIGIN + '/c/test'};

test('manifest allows the nested sandbox document from ChatGPT without exposing scripts', async () => {
  const manifest = JSON.parse(await readFile(join(project, 'standalone/manifest.json')));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.content_scripts, [{matches: ['https://chatgpt.com/*'], js: ['content.js'],
    run_at: 'document_idle', all_frames: false, match_about_blank: false, world: 'ISOLATED'}]);
  assert.deepEqual(manifest.web_accessible_resources,
    [{resources: ['relay.html', 'sandbox.html'], matches: ['https://chatgpt.com/*']}]);
  assert.deepEqual(manifest.sandbox.pages, ['sandbox.html']);
  assert.equal(manifest.permissions, undefined);
  assert.equal(manifest.host_permissions, undefined);
  for (const csp of Object.values(manifest.content_security_policy)) {
    assert(!csp.includes('unsafe-eval')); assert(!csp.includes('allow-same-origin'));
    assert(csp.includes("connect-src 'none'"));
  }
  assert(manifest.content_security_policy.sandbox.startsWith('sandbox allow-scripts;'));
});

test('local owner releases observations, handlers and timers once and waits for async disposal', async () => {
  const timers = new Map(), intervals = new Map(), observed = [];
  let next = 0, fired = 0, disposed = 0;
  const window = {setTimeout(fn) { timers.set(++next, fn); return next; }, clearTimeout: id => timers.delete(id),
    setInterval(fn) { intervals.set(++next, fn); return next; }, clearInterval: id => intervals.delete(id),
    MutationObserver: class { constructor(fn) { this.fn = fn; observed.push(this); }
      observe() { this.connected = true; } disconnect() { this.connected = false; } }};
  const owner = createLocalOwner(window), target = new EventTarget();
  const remove = owner.on(target, 'click', () => fired++);
  target.dispatchEvent(new Event('click')); remove(); remove();
  target.dispatchEvent(new Event('click')); assert.equal(fired, 1);
  owner.observe({}, () => fired++, {});
  const timer = owner.setTimeout(() => fired++, 1); timers.get(timer)();
  assert.equal(timers.size, 0); assert.equal(fired, 2);
  owner.setTimeout(() => fired++, 1); owner.setInterval(() => fired++, 1);
  const stale = [...timers.values(), ...intervals.values()];
  owner.onDispose(async () => { await tick(); disposed++; });
  const pending = owner.destroy(); assert.equal(owner.destroy(), pending);
  assert.equal(owner.active(), false); stale.forEach(fn => fn()); observed[0].fn([]);
  await pending;
  assert.equal(disposed, 1); assert.equal(fired, 2);
  assert.equal(timers.size, 0); assert.equal(intervals.size, 0); assert.equal(observed[0].connected, false);
  assert.equal(owner.setTimeout(() => {}, 1), null);
});

test('broker binds secret to top document and same-tab fixed relay, without trusting page-visible IDs', async t => {
  const h = brokerHarness(); t.after(h.stop);
  const channelId = randomUUID(), secret = randomUUID(), binding = identity();
  const content = h.clientRuntime(contentSender).connect({name: BOOTSTRAP + ':content'});
  const replies = []; content.onMessage.addListener(value => replies.push(value));
  content.postMessage({channelId, secret, identity: binding}); await tick();
  assert.equal(replies[0].kind, 'registered'); assert.equal(replies[0].secret, undefined);
  for (const sender of [
    {...contentSender, frameId: 1}, {...contentSender, url: 'https://evil.example/'},
    {...contentSender, url: undefined}, {...contentSender, documentId: ''},
    {...contentSender, origin: 'https://evil.example'}, {...contentSender, id: 'other-extension'}
  ]) {
    const port = h.clientRuntime(sender).connect({name: BOOTSTRAP + ':content'});
    port.postMessage({channelId: randomUUID(), secret, identity: binding}); await tick();
    assert.equal(port.closed, true);
  }
  const sender = {tab: {id: 42}, frameId: 7, documentId: 'relay-document',
    origin: extension, url: extension + '/relay.html#' + channelId};
  for (const invalid of [{...sender, tab: {id: 99}}, {...sender, url: extension + '/sandbox.html#' + channelId},
    {...sender, frameId: undefined}, {...sender, origin: CHATGPT_ORIGIN}]) {
    const port = h.clientRuntime(invalid).connect({name: BOOTSTRAP + ':relay'});
    port.postMessage({channelId}); await tick(); assert.equal(port.closed, true);
  }
  const relay = h.clientRuntime(sender).connect({name: BOOTSTRAP + ':relay'});
  const authorized = []; relay.onMessage.addListener(value => authorized.push(value));
  relay.postMessage({channelId}); await tick();
  assert.deepEqual(authorized, [{kind: 'authorized', channelId, identity: binding, secret}]);
  content.disconnect(); assert.equal(relay.closed, true);
  const late = h.clientRuntime(sender).connect({name: BOOTSTRAP + ':relay'});
  late.postMessage({channelId}); await tick(); assert.equal(late.closed, true);
});

// Node-only simulation of the three document worlds. Initial port transfers use
// structuredClone's real transfer list; subsequent traffic uses real MessagePorts.
function frameHarness({injectInvalid = false, holdSandbox = false} = {}) {
  const broker = brokerHarness(), content = fakeWindow(CHATGPT_ORIGIN + '/c/test');
  const calls = [], frames = [], children = [], connections = [], deliveries = [];
  let relayWindow, sandboxWindow;
  function deliver(target, event, invalid = []) {
    for (const overrides of invalid) message(target, {...event, ...overrides});
    const cloned = structuredClone({data: event.data, ports: event.ports || []}, {transfer: event.ports || []});
    queueMicrotask(() => message(target, {...event, ...cloned}));
  }
  const canvas = {append(frame) {
    frames.push(frame);
    relayWindow = fakeWindow(frame.src);
    const parent = {postMessage(data, targetOrigin, ports = []) {
      assert.equal(targetOrigin, CHATGPT_ORIGIN);
      deliveries.push(['relay-parent', data]);
      deliver(content, {data, ports, source: frame.contentWindow, origin: extension}, injectInvalid ? [
        {source: {}}, {origin: 'null'}, {data: {...data, revision: 100}}
      ] : []);
    }};
    relayWindow.parent = parent;
    frame.contentWindow = {postMessage(data, targetOrigin, ports = []) {
      assert.equal(targetOrigin, extension); deliveries.push(['parent-relay', data]);
      deliver(relayWindow, {data, ports, source: parent, origin: CHATGPT_ORIGIN}, injectInvalid ? [
        {source: {}}, {origin: 'https://evil.example'}, {data: {...data, secret: randomUUID()}},
        {data: {...data, sessionId: randomUUID()}}
      ] : []);
    }};
    const runtime = broker.clientRuntime({tab: {id: 42}, frameId: 3, documentId: 'relay-document',
      origin: extension, url: frame.src});
    const document = {createElement() { return {style: {}, remove() { this.removed = true; }}; },
      body: {append(child) {
        children.push(child); if (holdSandbox) return;
        sandboxWindow = fakeWindow(child.src);
        const relayParent = {postMessage(data, targetOrigin, ports = []) {
          assert.equal(targetOrigin, extension); deliveries.push(['sandbox-relay', data]);
          deliver(relayWindow, {data, ports, source: child.contentWindow, origin: 'null'}, injectInvalid ? [
            {source: {}}, {origin: extension}, {data: {...data, key: randomUUID()}}
          ] : []);
        }};
        sandboxWindow.parent = relayParent;
        child.contentWindow = {postMessage(data, targetOrigin, ports = []) {
          assert.equal(targetOrigin, '*'); deliveries.push(['relay-sandbox', data]);
          deliver(sandboxWindow, {data, ports, source: relayParent, origin: extension}, injectInvalid ? [
            {source: {}}, {origin: CHATGPT_ORIGIN}, {data: {...data, revision: 3}},
            {data: {...data, key: randomUUID()}}
          ] : []);
        }};
        const childCanvas = {};
        connections.push(startSandbox({window: sandboxWindow,
          document: {getElementById: () => childCanvas}, serve: input => {
            calls.push(['serve', input.identity]);
            return serveXmindFrame({...input, rendererFactory: options => {
              calls.push(['init', options.tree]);
              return {ready: Promise.resolve(), nodeCount: 3,
                async fit(value) { calls.push(['fit', value]); },
                async reflow() { calls.push(['reflow']); },
                async setTheme(value) { calls.push(['setTheme', value]); },
                async zoomBy(value) { calls.push(['zoomBy', value]); },
                async toggleAll() { return true; },
                async exportXmind() { return new Blob([new Uint8Array([80, 75, 3, 4, 0])]); },
                async exportPng() { return new Blob(['invalid png'], {type: 'image/png'}); },
                async destroy() { calls.push(['destroy']); }};
            }});
          }}));
      }}};
    connections.push(startRelay({window: relayWindow, document, runtime}));
  }};
  const document = {createElement() { return {style: {}, contentWindow: {}, remove() { this.removed = true; }}; }};
  const factory = createStandaloneFrameFactory({window: content, document,
    runtime: broker.clientRuntime(contentSender), timeoutMs: 100});
  return {factory, canvas, content, frames, children, calls, deliveries, broker,
    get relayWindow() { return relayWindow; },
    async close() { for (const item of connections.reverse()) await item.destroy(); broker.stop(); }};
}

test('thin frame adapter authenticates each world and preserves original command/Blob port protocol', async t => {
  const h = frameHarness({injectInvalid: true}); t.after(() => h.close());
  const tree = {id: 'root', title: 'Original answer', children: []};
  const renderer = createXmindFrameRenderer({window: h.content, canvas: h.canvas, tree,
    identity: {instanceId: 'answer-1', revision: 0}, frameFactory: h.factory, timeoutMs: 300});
  t.after(() => renderer.destroy());
  await renderer.ready;
  assert.equal(h.calls.filter(([name]) => name === 'serve').length, 1);
  assert.equal(h.calls.filter(([name]) => name === 'init').length, 1);
  assert.equal(renderer.nodeCount, 3);
  // Only startup uses runtime ports; MV3 worker suspension cannot end a view.
  assert(h.broker.ports.every(port => port.closed));
  await renderer.fit({resetManual: false}); await renderer.reflow(); await renderer.setTheme('light');
  await renderer.zoomBy(1.25); assert.equal(await renderer.toggleAll(), true);
  const blob = await renderer.exportXmind(); await verifyXmindZip(blob);
  assert.equal(blob.size, 5); assert.equal(typeof blob.arrayBuffer, 'function');
  await assert.rejects(renderer.exportPng());
  assert.equal(h.deliveries.filter(([name]) => name === 'parent-relay').length, 1);
  const secret = h.deliveries.find(([name]) => name === 'parent-relay')[1].secret;
  assert(!h.frames[0].src.includes(secret));
  assert(!JSON.stringify(h.deliveries.filter(([name]) => name === 'relay-parent')).includes(secret));
  const retiring = renderer.destroy(); assert.equal(renderer.destroy(), retiring); await retiring;
  assert.equal(h.calls.filter(([name]) => name === 'destroy').length, 1);
  assert.equal(h.frames[0].removed, true);
  assert(h.broker.ports.every(port => port.closed));
});

test('abort/timeout before sandbox readiness retires both frames and the broker registration', async t => {
  for (const abort of [true, false]) {
    const h = frameHarness({holdSandbox: true}); t.after(() => h.close());
    const controller = new AbortController();
    const pending = h.factory({canvas: h.canvas, identity: identity(), signal: controller.signal});
    await tick(); if (abort) controller.abort();
    await assert.rejects(pending, {code: abort ? 'E_XMIND_FRAME_DESTROYED' : 'E_XMIND_FRAME_TIMEOUT'});
    assert.equal(h.frames[0].removed, true); assert(h.broker.ports.every(port => port.closed));
    assert.equal(h.children[0].removed, true);
  }
});

test('default CLI refuses BLOCKED license; local output and ZIP switches cannot bypass scope', async () => {
  const missing = join(repository, 'artifacts/standalone-must-not-exist-' + randomUUID());
  await assert.rejects(buildStandalone({out: missing}), {code: 'E_XMIND_LICENSE_BLOCKED'});
  await assert.rejects(stat(missing), {code: 'ENOENT'});
  const cli = spawnSync(process.execPath, [join(project, 'scripts/build-standalone.mjs')], {encoding: 'utf8'});
  assert.equal(cli.status, 1); assert.match(cli.stderr, /E_XMIND_LICENSE_BLOCKED/);
  for (const out of [project, join(repository, 'artifacts'), join(repository, 'artifacts/../outside'),
    join(repository, 'artifacts/forbidden.zip'), join(repository, 'artifacts/forbidden.crx')]) {
    await assert.rejects(buildStandalone({localValidationOnly: true, out}), {code: 'E_STANDALONE_LOCAL_OUTPUT'});
  }
  for (const args of [['--zip'], ['--local-validation-only', '--zip'], ['--out'], ['--approval', 'true']]) {
    assert.throws(() => parseStandaloneArgs(args), {code: 'E_STANDALONE_ARGUMENT'});
  }
});

test('local build labels every artifact, verifies four original SHAs and retains single-source business imports', async t => {
  await mkdir(join(repository, 'artifacts'), {recursive: true});
  const temporary = await mkdtemp(join(repository, 'artifacts/mindmap-standalone-node-'));
  t.after(() => rm(temporary, {recursive: true, force: true}));
  const alias = join(temporary, 'alias'); await symlink(project, alias);
  await assert.rejects(buildStandalone({localValidationOnly: true, out: join(alias, 'escaped')}),
    {code: 'E_STANDALONE_LOCAL_OUTPUT'});
  const out = join(temporary, 'extension');
  const result = await buildStandalone({localValidationOnly: true, out});
  assert.equal(result.status, 'LOCAL_VALIDATION_ONLY');
  assert.equal(result.redistributionApproved, false); assert.equal(result.distributable, false);
  assert.equal(result.zipProduced, false); assert.equal(result.license.status, 'BLOCKED');
  assert.equal(result.browserValidation, 'NOT_TESTED');
  const metadata = JSON.parse(await readFile(join(out, 'metadata.json')));
  assert.equal(metadata.status, result.status);
  const names = (await readdir(out)).sort();
  assert.deepEqual(names, ['broker.js', 'content.js', 'manifest.json', 'metadata.json', 'relay.html', 'relay.js',
    'sandbox.html', 'xmind-runtime.js']);
  for (const file of result.files) {
    const bytes = await readFile(join(out, file.path));
    assert.equal(file.bytes, bytes.length); assert.equal(file.sha256, sha(bytes));
    if (file.path.endsWith('.js')) new Script(bytes.toString('utf8'), {filename: file.path});
  }
  const resources = await verifyFixedXmindAssets();
  assert.equal(result.originalResources.length, 4);
  for (const record of result.originalResources) {
    assert.equal(sha(resources.get(record.path)), record.sha256);
  }
  const runtime = await readFile(join(out, 'xmind-runtime.js'), 'utf8');
  const snowbrush = resources.get('/snowbrush-2c2b5d62b5.js');
  const guarded = guardSnowbrush(snowbrush).toString('utf8');
  assert.equal(guarded, snowbrush.toString('utf8').replace('eval(task)', TIMER_GUARD));
  assert(runtime.includes(guarded)); assert(!runtime.includes('eval(task)'));
  assert.throws(() => guardSnowbrush(Buffer.from('eval(task);eval(task)')));
  const inputs = result.inputs.map(input => input.path);
  for (const name of ['answer-registry.js', 'view.js', 'xmind-frame.js', 'xmind-frame-child.js', 'export.js']) {
    assert(inputs.includes('projects/chatgpt-mindmap/src/' + name));
  }
  assert(!inputs.some(path => path.startsWith('src/') || path.includes('vendor/') || path.includes('node_modules/')));
  const content = await readFile(join(out, 'content.js'), 'utf8');
  assert(!content.includes('@opendesk/ui'));
  for (const bytes of resources.values()) assert(!content.includes(bytes.toString('utf8')));
  assert(!content.includes('OpenDeskFrame')); assert(!content.includes('globalThis.OpenDesk'));
  await assert.rejects(buildStandalone({localValidationOnly: true, out}), {code: 'EEXIST'});
});
