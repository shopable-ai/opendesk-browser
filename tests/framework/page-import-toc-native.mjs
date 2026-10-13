// Targeted React TOC local Page project acceptance.
// Preflight is offline. Real mode uses a fresh CFT profile, real installed
// extension package, Native Messaging, stdio MCP and typed USER_SCRIPT Page.
// CDP is limited to launcher control, trusted pointer input and evidence reads.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {setup, cleanup} from '../../native-agent/install.mjs';
import {installationRoot} from '../../native-agent/installation-root.mjs';
import {requestAgent} from '../../native-agent/cli.mjs';
import {AGENT_CONFIG_PROTOCOL} from '../../src/native-agent/protocol.js';
import {verifyPackage} from '../../scripts/verify-package.mjs';
import {approveNativePermission} from './native-chrome-consent.mjs';
import {launchLocalDevChrome} from './local-dev-cft-launcher.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const PROJECT = path.join(ROOT, 'examples/programs/page-ui-toc-react-direct');
const FIXTURE_FILE = path.join(ROOT, 'examples/tasks/demo-form.html');
const DEFAULT_FIXTURE_URL = 'http://127.0.0.1:43111/demo-form.html';
const FROZEN_DRAFT_SOURCE_HASH = '8d3eedccdf62d90ddafcad3752e184ccd975479b51f649cb0b12595028ab2146';
// Approved LAN additions only; exact byte lineage is preserved in
// resume-01a133b5/toc-source-lan-lineage.json alongside the original receipt.
const EXPECTED_SOURCE_HASH = 'cdbc28f693c5aed589d9aaf7ef3abaeca81976b2c2038f3e925b55b74b1329f4';
const HASH = /^[a-f0-9]{64}$/;
const DEFAULT_NATIVE_ROOT = path.join(os.homedir(), '.opendesk-browser', 'native-agent-r1');

const options = Object.fromEntries(process.argv.slice(2).map(arg => {
  assert(arg.startsWith('--'), 'Use --key or --key=value options');
  const at = arg.indexOf('=');
  return at < 0 ? [arg.slice(2), true] : [arg.slice(2, at), arg.slice(at + 1)];
}));
const allowed = new Set(['preflight', 'real', 'package', 'chrome', 'output', 'fixture-url', 'start-fixture']);
for (const key of Object.keys(options)) assert(allowed.has(key), 'Unknown option ' + key);
assert(!(options.preflight && options.real), 'Choose either --preflight or --real');
const realMode = Boolean(options.real);
const output = path.resolve(options.output || path.join(ROOT, 'docs/framework/evidence/page-import-toc-native-20261012',
  realMode ? 'real-' + new Date().toISOString().replaceAll(':', '-') : 'preflight'));
if (fs.existsSync(output)) throw new Error('Evidence output already exists: ' + output);
fs.mkdirSync(output, {recursive: true});

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const write = (name, value) => fs.writeFileSync(path.join(output, name),
  typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n');
const record = (type, value) => {
  const row = {at: new Date().toISOString(), type, value};
  fs.appendFileSync(path.join(output, 'events.jsonl'), JSON.stringify(row) + '\n');
  console.log(type + ' ' + JSON.stringify(value));
};
async function until(fn, label, ms = 30000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await pause(150);
  }
  throw new Error(label + ' timed out' + (last ? ': ' + last.message : ''));
}

async function cdp(wsURL, label) {
  const ws = new WebSocket(wsURL);
  const pending = new Map();
  const handlers = new Map();
  let seq = 0;
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, {once: true});
    ws.addEventListener('error', reject, {once: true});
  });
  ws.addEventListener('message', event => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      const task = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(task.timer);
      msg.error ? task.reject(new Error(msg.error.message)) : task.resolve(msg.result);
      return;
    }
    for (const handler of handlers.get(msg.method) || []) handler(msg.params, msg.sessionId);
  });
  ws.addEventListener('close', () => {
    for (const task of pending.values()) {
      clearTimeout(task.timer);
      task.reject(new Error(label + ' CDP closed'));
    }
    pending.clear();
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(method + ' timeout'));
    }, 30000);
    pending.set(id, {resolve, reject, timer});
    ws.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
  });
  const read = async expression => {
    const result = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  await call('Runtime.enable').catch(() => {});
  return {
    label, call, read,
    on(method, fn) {
      const rows = handlers.get(method) || new Set();
      rows.add(fn);
      handlers.set(method, rows);
      return () => rows.delete(fn);
    },
    async screenshot(name) {
      const image = await call('Page.captureScreenshot', {format: 'png'});
      fs.writeFileSync(path.join(output, name), Buffer.from(image.data, 'base64'));
    },
    close() { ws.close(); }
  };
}

async function clickNode(session, expression) {
  for (let scroll = 0; scroll < 16; scroll++) {
    const box = await session.read('(()=>{const e=(' + expression + ');if(!e||e.disabled||e.hidden)return null;' +
      'const r=e.getBoundingClientRect();let scroll=null;for(let p=e.parentElement;p;p=p.parentElement){' +
      'if(p.scrollHeight>p.clientHeight+1&&/auto|scroll/.test(getComputedStyle(p).overflowY)){' +
      'const a=p.getBoundingClientRect();scroll={x:Math.max(4,a.left+4),y:(Math.max(64,a.top)+Math.min(innerHeight-80,a.bottom))/2,id:p.id,top:p.scrollTop,max:p.scrollHeight-p.clientHeight};break;}}' +
      'return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,vw:innerWidth,vh:innerHeight,scroll,text:e.textContent||e.value||e.id}})()');
    assert.ok(box?.width > 0 && box.height > 0, 'real visible enabled node: ' + expression);
    record('trusted-input-observation', {surface: session.label, expression, attempt: scroll, box});
    const header = expression.includes('#tab-develop') || expression.includes('统计视图') ? 8 : 64;
    if (box.y >= header && box.y < box.vh - 80 && box.x >= 0 && box.x < box.vw) {
      record('trusted-input-target', {surface: session.label, expression, box});
      for (const type of ['mousePressed', 'mouseReleased'])
        await session.call('Input.dispatchMouseEvent', {type, x: box.x, y: box.y, button: 'left', clickCount: 1});
      return;
    }
    await session.call('Input.dispatchMouseEvent', {type: 'mouseWheel', x: box.scroll?.x ?? box.vw / 2, y: box.scroll?.y ?? box.vh / 2, deltaX: 0, deltaY: Math.max(-600, Math.min(600, box.y - box.vh / 2))});
    await pause(120);
  }
  throw new Error('Unable to scroll real control into view: ' + expression);
}

function mcp(projects) {
  const child = spawn(process.execPath, [path.join(ROOT, 'native-agent/local-dev/mcp.mjs'),
    ...projects.flatMap(project => ['--allow-project', project])], {stdio: ['pipe', 'pipe', 'pipe'], env: {...process.env, OPENDESK_NATIVE_INSTANCE: process.env.OPENDESK_NATIVE_INSTANCE || ''}});
  const pending = new Map();
  let seq = 0;
  let buffer = '';
  child.stderr.on('data', bytes => fs.appendFileSync(path.join(output, 'mcp-stderr.log'), bytes));
  child.stdout.on('data', bytes => {
    buffer += bytes;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      record('mcp.raw.response', {line});
      const value = JSON.parse(line);
      const task = pending.get(value.id);
      if (!task) continue;
      pending.delete(value.id);
      clearTimeout(task.timer);
      value.error ? task.reject(Object.assign(new Error(JSON.stringify(value.error)), value.error)) : task.resolve(value.result);
    }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('MCP timeout ' + method));
    }, 60000);
    pending.set(id, {resolve, reject, timer});
    const line = JSON.stringify({jsonrpc: '2.0', id, method, params});
    record('mcp.raw.request', {line});
    child.stdin.write(line + '\n');
  });
  return {
    child,
    request,
    notify(method, params) {
      const line = JSON.stringify({jsonrpc: '2.0', method, params});
      record('mcp.raw.notification', {line});
      child.stdin.write(line + '\n');
    },
    async tool(name, args = {}) {
      const result = await request('tools/call', {name: 'opendesk.dev.' + name, arguments: args});
      record('mcp.' + name, result.structuredContent);
      if (result.isError) {
        const error = Object.assign(new Error(result.structuredContent?.error?.message || name + ' failed'),
          result.structuredContent?.error || {});
        throw error;
      }
      return result.structuredContent;
    },
    close() {
      child.stdin.end();
      for (const task of pending.values()) {
        clearTimeout(task.timer);
        task.reject(new Error('MCP closed'));
      }
      pending.clear();
    }
  };
}

async function ensureFixture() {
  const fixtureURL = options['fixture-url'] || process.env.OPENDESK_TOC_FIXTURE_URL || DEFAULT_FIXTURE_URL;
  const expected = sha(fs.readFileSync(FIXTURE_FILE));
  let server = null;
  async function probe() {
    const response = await fetch(fixtureURL);
    assert.equal(response.status, 200, 'fixture URL must be reachable');
    assert.equal(sha(Buffer.from(await response.arrayBuffer())), expected, 'fixture bytes must match examples/tasks/demo-form.html');
  }
  try {
    await probe();
    return {url: fixtureURL, sha256: expected, server: null, ownership: 'existing standard 43111 service'};
  } catch (error) {
    if (!options['start-fixture']) throw error;
  }
  assert.equal(fixtureURL, DEFAULT_FIXTURE_URL, 'start-fixture only owns the standard 43111 demo-form URL');
  server = http.createServer((req, res) => {
    if (req.url.split('?')[0] !== '/demo-form.html') {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(FIXTURE_FILE));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(43111, '127.0.0.1', resolve);
  });
  await probe();
  return {url: fixtureURL, sha256: expected, server, ownership: 'this driver started standard 43111 service'};
}

async function preflightReport() {
  const packageJSON = JSON.parse(fs.readFileSync(path.join(PROJECT, 'package.json'), 'utf8'));
  const draft = JSON.parse(fs.readFileSync(path.join(PROJECT, 'page-ui-toc-react-direct.opendesk-draft.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(PROJECT, 'opendesk.remote-lock.json'), 'utf8'));
  const main = fs.readFileSync(path.join(PROJECT, 'src/main.js'), 'utf8');
  const remoteCache = fs.readdirSync(path.join(PROJECT, '.opendesk/remote-cache')).filter(name => name.endsWith('.mjs'));
  assert.equal(packageJSON.opendesk.runtimeKind, 'page-userscript');
  assert.equal(packageJSON.opendesk.entry, 'src/main.js');
  assert.equal(packageJSON.opendesk.framework, 'react');
  assert(packageJSON.opendesk.pageRules.matches.includes('http://127.0.0.1:43111/*'));
  assert.equal(lock.format, 'opendesk.remote-lock.v2');
  assert.equal(draft.build.sourceHash, FROZEN_DRAFT_SOURCE_HASH);
  assert.equal(sha(draft.sourceUtf8), FROZEN_DRAFT_SOURCE_HASH);
  assert.deepEqual(packageJSON.opendesk.pageRules.matches, ['http://127.0.0.1:43111/*', 'http://192.168.30.8:8000/*']);
  assert.deepEqual(packageJSON.opendesk.pageRules.excludeMatches, ['http://127.0.0.1:43111/private/*', 'http://192.168.30.8:8000/private/*']);
  for (const needle of [
    'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js',
    'https://cdn.jsdelivr.net/npm/echarts@5.6.0/core.js',
    'https://cdn.jsdelivr.net/npm/echarts@5.6.0/lib/chart/bar/install.js',
    'https://cdn.jsdelivr.net/npm/echarts@5.6.0/lib/component/grid/install.js',
    'https://cdn.jsdelivr.net/npm/echarts@5.6.0/lib/renderer/installSVGRenderer.js'
  ]) assert(main.includes(needle), 'visible static import missing: ' + needle);
  const report = {
    status: 'PREFLIGHT_PASS',
    mode: 'offline',
    project: PROJECT,
    fixture: DEFAULT_FIXTURE_URL,
    expectedSourceHash: EXPECTED_SOURCE_HASH,
    frozenDraftSourceHash: FROZEN_DRAFT_SOURCE_HASH,
    projectConfig: packageJSON.opendesk,
    remoteLock: {format: lock.format, profile: lock.profile, moduleCount: Object.keys(lock.modules).length},
    remoteCacheFiles: remoteCache.length,
    draft: {
      format: draft.format,
      sourceHash: draft.build.sourceHash,
      sourceBytes: draft.build.byteLength,
      jsonSha256: sha(fs.readFileSync(path.join(PROJECT, 'page-ui-toc-react-direct.opendesk-draft.json')))
    },
    requiredRealParameters: {
      package: '--package=<final extension candidate dist> or OPENDESK_TOC_PACKAGE_DIR',
      chrome: '--chrome=<Chrome for Testing binary> or CHROME_FOR_TESTING_BIN',
      fixture: '--fixture-url=http://127.0.0.1:43111/demo-form.html; use --start-fixture only if this driver owns that standard service'
    },
    isolation: {
      profile: 'fresh mkdtemp CFT profile',
      native: 'setup(extensionId, "cft", profile) writes only the CFT profile Native manifest; E_PROFILE_CONFLICT/E_PROVIDER_OWNERSHIP is reported as BLOCKED',
      mcp: 'single stdio MCP child with --allow-project pointing at the React TOC project',
      dailyChrome: 'not used'
    }
  };
  write('preflight-report.json', report);
  return report;
}

function headingCountsExpression() {
  return '(()=>{const counts=[0,0,0,0,0,0];' +
    'for(const n of document.querySelectorAll("main h1,main h2,main h3,main h4,main h5,main h6")){' +
    'if(n.closest("nav,aside,footer,pre,code,template,[hidden],[inert],[aria-hidden=true],[role=navigation],[contenteditable=true],[data-opendesk-ui-owner]"))continue;' +
    'const s=getComputedStyle(n);if(n.getClientRects().length&&s.display!=="none"&&s.visibility!=="hidden"&&n.textContent.trim())counts[Number(n.tagName.slice(1))-1]++}' +
    'return counts})()';
}

async function realRun() {
  const packageDir = path.resolve(options.package || process.env.OPENDESK_TOC_PACKAGE_DIR || '');
  const binary = path.resolve(options.chrome || process.env.CHROME_FOR_TESTING_BIN || '');
  const nativeInstance = process.env.OPENDESK_NATIVE_INSTANCE;
  assert(nativeInstance, 'real mode requires OPENDESK_NATIVE_INSTANCE, for example OPENDESK_NATIVE_INSTANCE=pi-01a130cc');
  const nativeInstanceRoot = installationRoot({instance: nativeInstance});
  assert.notEqual(nativeInstanceRoot, DEFAULT_NATIVE_ROOT, 'Native setup must not use default daily Native root');
  assert.equal(path.basename(nativeInstanceRoot), nativeInstance, 'Native root must be bound to OPENDESK_NATIVE_INSTANCE');
  const nativeEnv = {...process.env, OPENDESK_NATIVE_INSTANCE: nativeInstance};
  assert(packageDir && fs.existsSync(path.join(packageDir, 'manifest.json')), 'real mode requires --package final extension candidate dist');
  assert(binary && fs.existsSync(binary), 'real mode requires --chrome or CHROME_FOR_TESTING_BIN');
  const fixture = await ensureFixture();
  const report = await preflightReport();
  report.status = 'REAL_IN_PROGRESS';
  report.mode = 'real';
  report.startedAt = new Date().toISOString();
  report.fixture = {url: fixture.url, sha256: fixture.sha256, ownership: fixture.ownership};
  report.chrome = {binary, version: spawnSync(binary, ['--version'], {encoding: 'utf8'}).stdout.trim()};
  report.package = await verifyPackage(packageDir);
  write('package-before.json', report.package);
  const packageManifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'manifest.json'), 'utf8'));
  const backgroundWorker = packageManifest.background?.service_worker;
  assert(backgroundWorker, 'Candidate manifest must declare a background service worker');
  write('report.json', report);

  let chrome, browser, target, mcpClient, nativeInstalled = false;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'od-toc-native-'));
  let profile = path.join(workspace, 'profile');
  fs.mkdirSync(profile, {mode: 0o700});
  report.nativeIsolation = {
    instance: nativeInstance,
    defaultRoot: DEFAULT_NATIVE_ROOT,
    instanceRoot: nativeInstanceRoot,
    rootBeforeInstallExists: fs.existsSync(nativeInstanceRoot),
    browser: 'cft',
    manifestProfile: profile,
    setupArguments: {extensionId: null, browser: 'cft', profile},
    mcpEnv: {OPENDESK_NATIVE_INSTANCE: nativeInstance}
  };
  write('native-instance-binding.json', report.nativeIsolation);
  try {
    const argv = ['--no-first-run', '--no-default-browser-check', '--use-mock-keychain',
      '--disable-background-networking', '--disable-sync', '--disable-features=Translate',
      '--remote-debugging-port=0', '--user-data-dir=' + profile,
      '--disable-extensions-except=' + packageDir, '--load-extension=' + packageDir, 'about:blank'];
    if (process.platform === 'linux' && process.getuid?.() === 0) argv.unshift('--no-sandbox');
    const launched = await launchLocalDevChrome({root: ROOT, out: output, binary, argv, profile});
    chrome = launched.chrome;
    report.launch = launched.launch;
    profile = launched.profile;
    report.nativeIsolation.manifestProfile = profile;
    report.nativeIsolation.setupArguments.profile = profile;
    const base = 'http://127.0.0.1:' + launched.lines[0];
    browser = await cdp('ws://127.0.0.1:' + launched.lines[0] + launched.lines[1], 'browser');
    const newTab = async url => {
      const response = await fetch(base + '/json/new?about%3Ablank', {method: 'PUT'});
      assert.equal(response.status, 200);
      const tab = await response.json();
      const session = await cdp(tab.webSocketDebuggerUrl, url);
      await session.call('Page.enable');
      if (url !== 'about:blank') await session.call('Page.navigate', {url});
      return {tab, session};
    };
    const extensionId = await until(async () => {
      const list = await (await fetch(base + '/json/list')).json();
      const workers = list.filter(row => row.type === 'service_worker' && row.url?.startsWith('chrome-extension://'));
      report.browserEnvironment = {serviceWorkers: workers.map(row => ({url: row.url, title: row.title || '', id: row.url.split('/')[2]})),
        candidateBackground: backgroundWorker};
      write('browser-environment.json', report.browserEnvironment);
      const matches = workers.filter(row => row.url.endsWith('/' + backgroundWorker));
      assert(matches.length <= 1, 'Candidate background service worker is ambiguous: ' + JSON.stringify(report.browserEnvironment));
      return matches[0]?.url.split('/')[2];
    }, 'extension service worker');
    report.extensionId = extensionId;
    try {
      report.nativeIsolation.setupArguments.extensionId = extensionId;
      const install = setup(extensionId, 'cft', profile);
    assert.notEqual(nativeInstanceRoot, DEFAULT_NATIVE_ROOT, 'Native setup root stayed private');
    report.nativeIsolation.installResult = install;
    report.nativeIsolation.rootAfterInstallExists = fs.existsSync(nativeInstanceRoot);
    write('native-instance-binding.json', report.nativeIsolation);
      nativeInstalled = true;
      report.nativeInstall = install;
      record('native.install', install);
    } catch (error) {
      report.status = 'BLOCKED_NATIVE_SETUP';
      report.blocker = {code: error.code || error.name, message: error.message,
        alternative: 'Run real mode in a profile whose CFT Native manifest can be installed without changing daily Chrome/Native pairing; do not rewrite global daily pairing.'};
      write('report.json', report);
      return report;
    }
    async function currentCandidateWorker(excludeId = null) {
      const scriptURL = 'chrome-extension://' + extensionId + '/' + backgroundWorker;
      const rows = await (await fetch(base + '/json/list')).json();
      return rows.find(row => row.type === 'service_worker' && row.url === scriptURL && row.id !== excludeId);
    }
    async function waitUserScriptsNamespace(label) {
      const workerInfo = await until(() => currentCandidateWorker(), label + ' worker');
      const worker = await cdp(workerInfo.webSocketDebuggerUrl, label);
      try {
        const actual = await worker.read('({connectNative: typeof chrome.runtime.connectNative, userScripts: typeof chrome.userScripts})');
        assert.equal(actual.userScripts, 'object');
        record('page.user-scripts.namespace', {target: workerInfo.id, actual});
        return actual;
      } finally {
        worker.close();
      }
    }
    async function enableUserScripts() {
      const extensions = await newTab('chrome://extensions/?id=' + extensionId);
      const detail = 'document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")';
      const toggle = '(' + detail + ')?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
      await until(() => extensions.session.read('(()=>{const n=' + toggle + ';if(!n)return false;const r=n.getBoundingClientRect();return r.width>0&&r.height>0})()'), 'userScripts visible toggle');
      if (!await extensions.session.read('(' + toggle + ').checked')) {
        await browser.call('Target.activateTarget', {targetId: extensions.tab.id});
        await clickNode(extensions.session, toggle);
      }
      await until(() => extensions.session.read('(' + toggle + ').checked===true'), 'userScripts enabled');
      report.userScripts = {enabled: true, namespace: await waitUserScriptsNamespace('userScripts opt-in')};
    }
    async function openNativeSettings() {
      const settings = await newTab('chrome-extension://' + extensionId + '/native-agent/settings.html');
      await until(() => settings.session.read('document.querySelector("#bridge-status")?.textContent.includes(' +
        JSON.stringify('Extension ID：' + extensionId) + ')'), 'Native settings ready');
      return settings;
    }
    async function refreshNativeWorkerAfterGrant(statusSession) {
      const nativeStatus = () => statusSession.read('chrome.runtime.sendMessage(' +
        JSON.stringify({protocol: AGENT_CONFIG_PROTOCOL, type: 'status'}) + ')');
      const enabledState = await until(async () => {
        const state = await nativeStatus();
        return state?.ok && state.data?.enabled ? state.data : null;
      }, 'persisted Native enable state');
      record('native.enable.state', enabledState);
      if (!enabledState.requiresReload) return;
      const original = await until(() => currentCandidateWorker(), 'original Native service worker');
      const versions = new Map();
      const off = statusSession.on('ServiceWorker.workerVersionUpdated', event => {
        for (const version of event.versions) versions.set(version.versionId, version);
      });
      await statusSession.call('ServiceWorker.enable');
      const running = await until(() => [...versions.values()].find(version =>
        version.scriptURL === original.url && version.runningStatus === 'running'), 'original Native service worker version');
      await statusSession.call('ServiceWorker.stopWorker', {versionId: running.versionId});
      await until(async () => {
        const rows = await (await fetch(base + '/json/list')).json();
        return !rows.some(row => row.id === original.id);
      }, 'original Native worker target removed');
      record('native.permission.old-worker-removed', {targetId: original.id, versionId: running.versionId});
      await nativeStatus().catch(() => null);
      const fresh = await until(() => currentCandidateWorker(original.id), 'fresh Native service worker');
      const worker = await cdp(fresh.webSocketDebuggerUrl, 'Native worker after permission reload');
      try {
        const actual = await worker.read('({connectNative: typeof chrome.runtime.connectNative, userScripts: typeof chrome.userScripts})');
        assert.equal(actual.connectNative, 'function');
        assert.equal(actual.userScripts, 'object');
        record('native.permission.worker-restart', {oldTarget: original.id, newTarget: fresh.id, actual});
      } finally {
        worker.close();
        off();
      }
    }
    async function findSidePanel(excludeId) {
      return until(async () => {
        const rows = await (await fetch(base + '/json/list')).json();
        return rows.find(row => row.id !== excludeId && row.url.startsWith('chrome-extension://' + extensionId + '/ui/tool.html') && row.webSocketDebuggerUrl);
      }, 'Actual Native workbench Side Panel');
    }

    await enableUserScripts();
    const targetTab = await newTab(fixture.url);
    target = targetTab.session;
    await browser.call('Target.activateTarget', {targetId: targetTab.tab.id});
    await until(() => target.read('document.readyState==="complete"'), 'fixture loaded');
    const catalog = await newTab('chrome-extension://' + extensionId + '/ui/tool.html');
    await until(() => catalog.session.read('(()=>{const e=document.querySelector("#catalog-open-dev-sidebar");if(!e||e.disabled)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0})()'), 'Real visible develop sidebar entry');
    await browser.call('Target.activateTarget', {targetId: catalog.tab.id});
    await clickNode(catalog.session, 'document.querySelector("#catalog-open-dev-sidebar")');
    let sideInfo = await findSidePanel(catalog.tab.id);
    let side = await cdp(sideInfo.webSocketDebuggerUrl, 'Native workbench Side Panel');
    await until(() => side.read('document.querySelector("#tab-develop")&&location.href.includes("hostInstanceId=")'), 'Native workbench ready');
    await browser.call('Target.activateTarget', {targetId: targetTab.tab.id});

    const settings = await openNativeSettings();
    await browser.call('Target.activateTarget', {targetId: settings.tab.id});
    await clickNode(settings.session, 'document.querySelector("#bridge-enable")');
    if (process.env.OPENDESK_TOC_EXTERNAL_NATIVE_CONSENT === '1') {
      write('native-consent-ready.json', {
        actualChromePid: report.launch.pid,
        actualAppPath: binary,
        extensionId,
        settingsTab: settings.tab,
        packageHash: report.package.packageHash
      });
      record('native.permission.awaiting-external-consent', {pid: report.launch.pid, extensionId, settingsTab: settings.tab.id});
      await until(() => settings.session.read('chrome.permissions.contains({permissions:["nativeMessaging"]})'),
        'external native permission consent', 300000);
      record('native.permission.input', {kind: 'external-consent-observed'});
    } else if (await settings.session.read('chrome.permissions.contains({permissions:["nativeMessaging"]})')) {
      record('native.permission.input', {kind: 'already-granted-before-helper', pid: report.launch.pid});
    } else {
      try {
        record('native.permission.input', await approveNativePermission({pid: report.launch.pid, evidenceDirectory: output}));
      } catch (error) {
        if (await settings.session.read('chrome.permissions.contains({permissions:["nativeMessaging"]})')) {
          record('native.permission.input', {kind: 'granted-while-helper-waited', pid: report.launch.pid, helperError: error.message});
        } else {
          throw error;
        }
      }
    }
    const settingsAfterGrant = await openNativeSettings();
    assert.equal(await settingsAfterGrant.session.read('chrome.permissions.contains({permissions:["nativeMessaging"]})'), true);
    await refreshNativeWorkerAfterGrant(settingsAfterGrant.session);
    await browser.call('Target.closeTarget', {targetId: settings.tab.id}).catch(() => null);
    settings.session.close();
    await browser.call('Target.closeTarget', {targetId: settingsAfterGrant.tab.id}).catch(() => null);
    settingsAfterGrant.session.close();
    await browser.call('Target.closeTarget', {targetId: catalog.tab.id}).catch(() => null);
    catalog.session.close();
    record('driver.tabs.closed-before-target-current', {settings: settings.tab.id, settingsAfterGrant: settingsAfterGrant.tab.id, catalog: catalog.tab.id, sidePanel: sideInfo.id});
    report.nativeHandshake = await until(async () => {
      const state = await requestAgent('bridge.status', {}, crypto.randomUUID(), 3000);
      record('bridge.status.observe', state.result || state.error || null);
      return state.result?.nativeConnected && state.result.hostRegistrations?.length === 1 ? state.result : null;
    }, 'real Native bridge unique host');
    side.close();
    sideInfo = await findSidePanel(catalog.tab.id);
    side = await cdp(sideInfo.webSocketDebuggerUrl, 'Native workbench Side Panel after Native grant');
    await until(() => side.read('document.querySelector("#tab-develop")&&location.href.includes("hostInstanceId=")'), 'Native workbench ready after Native grant');
    await browser.call('Target.activateTarget', {targetId: targetTab.tab.id});
    await clickNode(side, 'document.querySelector("#tab-develop")');
    await until(() => side.read('document.querySelector("#tab-develop").getAttribute("aria-selected")==="true"'), 'Native Develop tab selected');
    await browser.call('Target.activateTarget', {targetId: targetTab.tab.id});
    await until(() => target.read('document.visibilityState==="visible"&&location.href===' + JSON.stringify(fixture.url)), 'fixture active after Native grant');
    report.sidebar = {target: sideInfo, context: await side.read('chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"],documentUrls:[location.href]}).then(rows=>rows[0])')};
    assert.equal(report.sidebar.context?.contextType, 'SIDE_PANEL');
    let lastTargetCurrent = null;
    const selected = await until(async () => {
      await browser.call('Target.activateTarget', {targetId: targetTab.tab.id});
      lastTargetCurrent = await requestAgent('target.current', {}, crypto.randomUUID(), 3000);
      record('target.current.observe', lastTargetCurrent.result?.target || lastTargetCurrent.error || null);
      return lastTargetCurrent.result?.target?.url === fixture.url ? lastTargetCurrent.result.target : null;
    }, 'real target.current points at demo-form', 60000);
    report.lastTargetCurrent = lastTargetCurrent;
    report.target = selected;

    mcpClient = mcp([PROJECT]);
    const initialized = await mcpClient.request('initialize', {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'toc-native-driver', version: '1'}});
    assert.equal(initialized.protocolVersion, '2025-11-25');
    mcpClient.notify('notifications/initialized');
    const binding = await mcpClient.tool('attach', {path: PROJECT});
    assert.equal(binding.runtimeKind, 'from-package');
    const started = await mcpClient.tool('run', {bindingId: binding.bindingId, requestId: 'toc-native-run-' + crypto.randomUUID()});
    assert.equal(started.kind, 'page-userscript');
    assert.ok(started.previewId);
    assert.equal(started.runId, undefined);
    assert.match(started.source.sourceHash, HASH);
    assert.equal(started.source.sourceHash, EXPECTED_SOURCE_HASH);
    assert.equal(started.target.documentId, selected.documentId);
    const result = await until(async () => {
      const row = await mcpClient.tool('result', {previewId: started.previewId});
      return row.state === 'preview-pending' ? null : row;
    }, 'React TOC Page preview receipt', 60000);
    assert.equal(result.state, 'preview-evaluated', JSON.stringify(result.error));
    assert.equal(result.result.world, 'USER_SCRIPT');
    assert.equal(result.result.sourceHash, EXPECTED_SOURCE_HASH);
    assert.equal(result.result.documentId, selected.documentId);
    write('preview-receipt.json', result);
    const host = 'document.querySelector(' + JSON.stringify('[data-od-id="sample.page-ui-toc-react-direct"]') + ')';
    await until(() => target.read('!!(' + host + ')?.shadowRoot'), 'visible React TOC host');
    await target.screenshot('react-toc-before-stats.png');
    await clickNode(target, '(' + host + ').shadowRoot.querySelector(' + JSON.stringify('[aria-label="统计视图"]') + ')');
    const expectedCounts = await target.read(headingCountsExpression());
    const visibleStats = await until(async () => {
      const value = await target.read('(()=>{const root=(' + host + ')?.shadowRoot;const chart=root?.querySelector(' +
        JSON.stringify('[role="img"][aria-label^="ECharts 标题层级分布"]') + ');const svg=chart?.querySelector("svg");' +
        'if(!svg)return null;const label=chart.getAttribute("aria-label");return {label,state:root.querySelector("[data-echarts-state]")?.dataset.echartsState,' +
        'counts:Array.from(label.matchAll(/H([1-6])：(\\d+)/g),m=>Number(m[2])),svgCount:chart.querySelectorAll("svg").length,' +
        'pathCount:svg.querySelectorAll("path").length,text:Array.from(svg.querySelectorAll("text"),n=>n.textContent),' +
        'rect:(()=>{const r=chart.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x,y:r.y}})()}})()');
      return value?.state === 'ready' && value.pathCount > 0 ? value : null;
    }, 'visible React TOC statistics and ECharts SVG');
    assert.deepEqual(visibleStats.counts, expectedCounts);
    await target.screenshot('react-toc-visible-stats.png');
    const stopped = await mcpClient.tool('stop', {previewId: started.previewId, requestId: 'toc-native-stop-' + crypto.randomUUID()});
    assert.equal(stopped.state, 'preview-retired');
    assert.equal(stopped.sourceHash, EXPECTED_SOURCE_HASH);
    assert.equal(stopped.receipt?.scope, 'managed-ui-only');
    assert.equal(stopped.receipt?.ok, true);
    await until(() => target.read('!(' + host + ')'), 'React TOC host removed after Stop');
    write('managed-host-removal.json', {previewId: started.previewId, documentId: selected.documentId,
      sourceHash: stopped.sourceHash, hostSelector: '[data-od-id="sample.page-ui-toc-react-direct"]',
      observedHostPresent: await target.read('!!(' + host + ')')});
    await target.screenshot('react-toc-after-stop.png');
    const retired = await mcpClient.tool('result', {previewId: started.previewId});
    assert.equal(retired.state, 'preview-retired');
    assert.equal(retired.sourceHash, EXPECTED_SOURCE_HASH);
    const slotRequest = {protocol: 'opendesk.foundation.v1', type: 'snapshotControllerRun', payload: {},
      registrationId: report.nativeHandshake.hostRegistrations[0]};
    record('host.slot.request', slotRequest);
    const slotResponse = await side.read('chrome.runtime.sendMessage(' + JSON.stringify(slotRequest) + ')');
    record('host.slot.response', slotResponse);
    assert.equal(slotResponse.ok, true);
    assert.equal(slotResponse.data.slotAvailable, true);
    report.status = 'PASS_REAL_NATIVE_MCP_REACT_TOC';
    report.preview = {previewId: started.previewId, sourceHash: EXPECTED_SOURCE_HASH, documentId: selected.documentId,
      world: result.result.world, receipt: result.result};
    report.visibleStatistics = {expectedCounts, observed: visibleStats};
    report.stop = stopped;
    report.retired = retired;
    report.slotAfterStop = slotResponse.data;
    report.tests = [
      {name: 'real-native-mcp-page-run', status: 'PASS', previewId: started.previewId, sourceHash: EXPECTED_SOURCE_HASH, documentId: selected.documentId},
      {name: 'visible-react-toc-title-statistics', status: 'PASS', headingCounts: expectedCounts, label: visibleStats.label, svgPaths: visibleStats.pathCount},
      {name: 'real-native-mcp-managed-page-stop', status: 'PASS', previewId: started.previewId, sourceHash: stopped.sourceHash, receipt: stopped.receipt}
    ];
    report.packageAfter = await verifyPackage(packageDir);
    write('package-after.json', report.packageAfter);
    assert.equal(report.packageAfter.packageHash, report.package.packageHash, 'Candidate package changed during TOC Native run');
    write('preview-receipt.json', result);
    write('stop-receipt.json', stopped);
    write('retired-query.json', retired);
    write('slot-after-stop.json', slotResponse);
    write('visible-statistics.json', report.visibleStatistics);
    write('report.json', report);
    return report;
  } finally {
    mcpClient?.close();
    if (browser) await browser.call('Browser.close').catch(() => {});
    await chrome?.cleanup?.().catch(error => record('chrome.cleanup.error', {message: error.message}));
    if (nativeInstalled) {
      try {
        assert.equal(process.env.OPENDESK_NATIVE_INSTANCE, nativeInstance, 'Native cleanup must stay in the same private instance');
        let cleaned, lastCleanupError;
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            cleaned = cleanup();
            lastCleanupError = null;
            break;
          } catch (error) {
            lastCleanupError = error;
            if (error.code !== 'E_SOCKET_IN_USE') throw error;
            await pause(500);
          }
        }
        if (lastCleanupError) throw lastCleanupError;
        record('native.cleanup', {instance: nativeInstance, instanceRoot: nativeInstanceRoot, cleaned});
      } catch (error) {
        record('native.cleanup.error', {code: error.code, message: error.message});
      }
    }
    if (fixture.server) await new Promise(resolve => fixture.server.close(resolve));
  }
}

try {
  const report = realMode ? await realRun() : await preflightReport();
  if (!realMode) record('preflight.pass', report);
  process.exitCode = report.status?.startsWith('BLOCKED') ? 2 : 0;
} catch (error) {
  const failure = {status: 'FAIL', error: {name: error.name, code: error.code, message: error.message, stack: error.stack}};
  write('report.json', failure);
  record('failure', failure);
  process.exitCode = 1;
}
