// Node 22+, ffmpeg with libvpx-vp9, and headed Chrome for Testing 155.
// Usage: node projects/video-auto-skip/demo/run-chrome.mjs [--chrome /path/to/CFT]
import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access, mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {developmentChromeArgs} from '../../../scripts/dev-chrome-config.mjs';

const demo = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(demo, '../../..');
const extension = path.join(root, 'dist/development');
const defaultChrome = path.join(root, 'tests/.cache/m5-browsers/155.0.8059.39',
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exec = promisify(execFile);
const js = JSON.stringify;
const node = selector => 'document.querySelector(' + js(selector) + ')';
const abort = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => abort.abort());

async function until(read, ms = 15_000) {
  const deadline = performance.now() + ms;
  do {
    abort.signal.throwIfAborted();
    const value = await read();
    if (value) return value;
    await delay(80, undefined, {signal: abort.signal});
  } while (performance.now() < deadline);
  throw new Error('timeout');
}

function fixtureServer(html, clips) {
  const server = createServer((req, res) => {
    const file = clips.get(req.url);
    if (req.headers.host !== '127.0.0.1:' + server.address()?.port ||
        !['GET', 'HEAD'].includes(req.method) || (!file && req.url !== '/fixture.html')) {
      res.writeHead(404).end();
      return;
    }
    const base = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
    if (!file) {
      res.writeHead(200, {...base, 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length});
      res.end(req.method === 'HEAD' ? undefined : html);
      return;
    }
    const headers = {...base, 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes'};
    let start = 0, end = file.size - 1;
    if (req.headers.range !== undefined) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (match?.[1]) {
        start = Number(match[1]);
        if (match[2]) end = Math.min(Number(match[2]), end);
      } else if (match?.[2]) start = Math.max(0, file.size - Number(match[2]));
      else start = file.size;
      if (start > end) {
        res.writeHead(416, {...headers, 'Content-Range': 'bytes */' + file.size}).end();
        return;
      }
      headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + file.size;
    }
    res.writeHead(headers['Content-Range'] ? 206 : 200, {...headers, 'Content-Length': end - start + 1});
    if (req.method === 'HEAD') return res.end();
    const stream = createReadStream(file.path, {start, end});
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
  server.on('connect', (_req, socket) => socket.destroy()); // Never forward proxy traffic.
  return server;
}

async function cdp(url) {
  const ws = new WebSocket(url), pending = new Map();
  let next = 0;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 5000);
      ws.addEventListener('open', () => {clearTimeout(timer); resolve();}, {once: true});
      ws.addEventListener('error', () => {clearTimeout(timer); reject(new Error('CDP connection'));}, {once: true});
    });
  } catch (error) {
    ws.close();
    throw error;
  }
  ws.addEventListener('message', ({data}) => {
    const {id, result, error} = JSON.parse(data);
    pending.get(id)?.(error ? new Error('CDP ' + error.code) : null, result);
  });
  ws.addEventListener('close', () => {
    for (const finish of pending.values()) finish(new Error('CDP disconnected'));
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    if (ws.readyState !== WebSocket.OPEN) return reject(new Error('CDP disconnected'));
    const id = ++next;
    const timer = setTimeout(() => pending.get(id)?.(new Error('timeout')), 5000);
    pending.set(id, (error, result) => {
      clearTimeout(timer);
      pending.delete(id);
      if (error) reject(error);
      else resolve(result);
    });
    try { ws.send(js({id, method, params, sessionId})); }
    catch (error) { pending.get(id)(error); }
  });
  return {call, close: () => ws.close(), async attach(targetId) {
    const {sessionId} = await call('Target.attachToTarget', {targetId, flatten: true});
    const send = (method, params) => call(method, params, sessionId);
    return {send, async read(expression) {
      const {result, exceptionDetails} = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
      assert.ok(!exceptionDetails, 'page observation');
      return result.value;
    }};
  }};
}

async function scrollTo(session, expression) {
  const {result, exceptionDetails} = await session.send('Runtime.evaluate', {expression});
  assert.ok(!exceptionDetails && result.objectId);
  try { await session.send('DOM.scrollIntoViewIfNeeded', {objectId: result.objectId}); }
  finally { await session.send('Runtime.releaseObject', {objectId: result.objectId}); }
}

async function click(session, expression, beforePress = async () => {}) {
  await scrollTo(session, expression);
  const point = await session.read('(' + (e => {
    if (!e || e.disabled) return null;
    const r = e.getBoundingClientRect();
    const x = (Math.max(0, r.left) + Math.min(innerWidth, r.right))/2;
    const y = (Math.max(0, r.top) + Math.min(innerHeight, r.bottom))/2;
    const hit = e.getRootNode().elementFromPoint?.(x,y) ?? document.elementFromPoint(x,y);
    return r.width && r.height && e.contains(hit) ? {x,y} : null;
  }) + ')(' + expression + ')');
  assert.ok(point);
  await beforePress();
  abort.signal.throwIfAborted();
  await session.send('Input.dispatchMouseEvent', {type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1});
  await session.send('Input.dispatchMouseEvent', {type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1});
}

async function drag(target, exactUrl) {
  await scrollTo(target, node('#scrub'));
  const box = await target.read('(' + (url => {
    const scrub = document.querySelector('#scrub');
    if (location.href !== url || document.querySelector('#report')?.dataset.stage !== 'manual-drag' ||
        scrub?.tagName !== 'BUTTON' || scrub.disabled) return null;
    const r = scrub.getBoundingClientRect(), y = r.top + r.height/2;
    const right = r.right-12, left = r.left+12;
    return r.width > 48 && [left,right].every(x => document.elementFromPoint(x,y) === scrub) ? {right,left,y} : null;
  }) + ')(' + js(exactUrl) + ')');
  assert.ok(box, 'scrub was not targetable');
  const mouse = (type, x, buttons, button = 'none', clickCount = 0) => target.send('Input.dispatchMouseEvent',
    {type, x, y: box.y, buttons, button, clickCount});
  abort.signal.throwIfAborted();
  await mouse('mouseMoved', box.right, 0);
  await mouse('mousePressed', box.right, 1, 'left', 1);
  for (let i = 1; i <= 8; i++) await mouse('mouseMoved', box.right + (box.left - box.right)*i/8, 1);
  await mouse('mouseReleased', box.left, 0, 'left', 1);
}

// Never copy resource URLs or raw browser errors to stdout.
function sanitize(value, depth = 0) {
  if (depth > 16) return '[omitted]';
  const resource = /(?:[a-z][a-z\d+.-]*:\/{1,3}|(?:data|blob|about|javascript|mailto):|\/\/|\.webm\b)/i;
  if (typeof value === 'string') return resource.test(value) ? '[resource redacted]' : value;
  if (Array.isArray(value)) return value.map(item => sanitize(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !resource.test(key) && !/^(?:url|uri|currentSrc|src|href|sourceUrl|resourceUrl)$/i.test(key))
    .map(([key, item]) => [key, sanitize(item, depth + 1)]));
  return value;
}

const report = {scope: 'loopback-fixture', status: 'failed'};
let phase = 'inputs', temp, server, chrome, exited, browser;
const fingerprints = async () => Object.fromEntries(await Promise.all(
  ['manifest.json', 'sw.js', 'sidepanel.html', 'ui/tool-shell.js', 'development-update.json']
    .map(async file => [file, sha(await readFile(path.join(extension, file)))])));
const inputs = async () => Object.fromEntries(await Promise.all(
  ['projects/video-auto-skip/demo/experiment.js', 'projects/video-auto-skip/demo/fixture.html',
    'projects/video-auto-skip/demo/run-chrome.mjs', 'scripts/dev-chrome-config.mjs']
    .map(async file => [file, sha(await readFile(path.join(root, file)))])));
const gitHead = async () => (await exec('git', ['rev-parse', 'HEAD'], {cwd: root, timeout: 5_000})).stdout.trim();
try {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--chrome' && args[1]));
  const binary = path.resolve(args[1] || process.env.CHROME_FOR_TESTING_BIN || defaultChrome);
  await access(binary);
  const [manifestBytes, html, source] = await Promise.all([
    readFile(path.join(extension, 'manifest.json')), readFile(path.join(demo, 'fixture.html')),
    readFile(path.join(demo, 'experiment.js'), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.name, 'GrayDove Developer');
  assert.equal(manifest.version, '2.0.0');
  assert.ok(source.trim() && !source.includes('\r'), 'textarea requires an LF draft');
  report.manifest = {name: manifest.name, version: manifest.version, sha256: sha(manifestBytes)};
  report.buildFiles = await fingerprints();
  report.gitHead = await gitHead();
  report.inputs = await inputs();
  report.sourceSha256 = sha(source);
  report.fixtureSha256 = sha(html);
  assert.equal(report.inputs['projects/video-auto-skip/demo/experiment.js'], report.sourceSha256);
  assert.equal(report.inputs['projects/video-auto-skip/demo/fixture.html'], report.fixtureSha256);
  assert.equal(report.buildFiles['manifest.json'], report.manifest.sha256);

  phase = 'generate-media';
  temp = await mkdtemp(path.join(tmpdir(), 'video-auto-skip-'));
  const clips = new Map();
  for (const [name, seconds, color] of [['clip-a.webm', 180, 'navy'], ['clip-b.webm', 210, 'teal']]) {
    const file = path.join(temp, name);
    await exec('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
      '-i', 'color=c=' + color + ':s=160x90:r=6', '-t', String(seconds), '-an',
      '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p', file],
    {timeout: 60_000, signal: abort.signal});
    clips.set('/' + name, {path: file, size: (await stat(file)).size});
  }
  phase = 'fixture-server';
  server = fixtureServer(html, clips);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const host = '127.0.0.1:' + server.address().port;
  const origin = 'http://' + host, exactUrl = origin + '/fixture.html';

  phase = 'launch-cft-155';
  const {stdout: binaryVersion} = await exec(binary, ['--version'], {timeout: 5000, signal: abort.signal});
  assert.match(binaryVersion.trim(), /^Google Chrome for Testing 155\.\d+\.\d+\.\d+$/);
  const profile = path.join(temp, 'profile');
  const chromeArgs = developmentChromeArgs({profile, extension});
  // The debug flag exposes Extensions.triggerAction; the userScripts grant still uses Chrome's UI.
  chromeArgs.unshift('--window-size=1200,900', '--disable-sync', '--disable-quic', '--enable-unsafe-extension-debugging',
    '--proxy-server=' + origin, '--proxy-bypass-list=<-loopback>;' + host);
  chrome = spawn(binary, chromeArgs, {stdio: 'ignore'});
  exited = new Promise(resolve => {chrome.once('error', resolve); chrome.once('exit', resolve);});
  const [port, endpoint] = await until(async () => {
    assert.ok(chrome.pid && chrome.exitCode === null && chrome.signalCode === null);
    const lines = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
      .then(value => value.trim().split('\n')).catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return [];
      });
    return /^\d+$/.test(lines[0]) && /^\/devtools\/browser\/[0-9a-f-]+$/.test(lines[1]) && lines;
  });
  browser = await cdp('ws://127.0.0.1:' + port + endpoint);
  const version = (await browser.call('Browser.getVersion')).product;
  assert.match(version, /^Chrome\/155\.\d+\.\d+\.\d+$/);
  assert.equal(version.split('/')[1], binaryVersion.trim().split(' ').at(-1));
  report.chromeVersion = version;

  const targets = async filter => (await browser.call('Target.getTargets', filter ? {filter} : {})).targetInfos;
  const newPage = async url => {
    const {targetId} = await browser.call('Target.createTarget', {url: 'about:blank'});
    const session = await browser.attach(targetId);
    assert.ok(!(await session.send('Page.navigate', {url})).errorText);
    return {targetId, session};
  };
  phase = 'exact-extension';
  const worker = await until(async () => (await targets()).find(t => t.type === 'service_worker' &&
    /^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(t.url)));
  const extensionId = new URL(worker.url).hostname;
  const runtime = await browser.attach(worker.targetId);
  await runtime.send('Runtime.enable');
  const identity = await until(() => runtime.read('globalThis.chrome?.runtime?.id&&({id:chrome.runtime.id,name:chrome.runtime.getManifest().name,version:chrome.runtime.getManifest().version})'));
  assert.deepEqual(identity, {id: extensionId, name: manifest.name, version: manifest.version});
  report.extensionId = extensionId;
  await until(() => runtime.read('chrome.sidePanel.getPanelBehavior().then(v=>v.openPanelOnActionClick)'));

  phase = 'user-scripts-consent';
  const userScriptsEnabled = () => runtime.read('(async()=>{try{await chrome.userScripts.getScripts();return true}catch{return false}})()');
  report.userScriptsToggleChanged = false;
  if (!await userScriptsEnabled()) {
    const detailsUrl = 'chrome://extensions/?id=' + extensionId;
    const {targetId, session: settings} = await newPage(detailsUrl);
    const detail = 'document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")';
    const toggle = '(' + detail + ')?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
    const exact = 'location.href===' + js(detailsUrl) + '&&(' + detail + ')?.data?.id===' + js(extensionId) +
      '&&(' + detail + ')?.shadowRoot?.querySelector("#name")?.textContent.trim()===' + js(manifest.name);
    await until(() => settings.read(exact + '&&!!(' + toggle + ')'));
    if (!await settings.read('(' + toggle + ').checked')) {
      await click(settings, toggle, async () => assert.equal(await settings.read(exact + '&&(' + toggle + ').checked===false'), true));
      report.userScriptsToggleChanged = true;
    }
    await until(() => settings.read(exact + '&&(' + toggle + ').checked===true'));
    await browser.call('Target.closeTarget', {targetId});
    await until(userScriptsEnabled);
  }

  phase = 'fixture-paused';
  const {session: target} = await newPage(exactUrl);
  const samePage = 'location.href===' + js(exactUrl);
  await until(() => target.read(samePage + '&&(' + (clipUrl => {
    const v = document.querySelector('#feature');
    return document.readyState === 'complete' && document.querySelector('#report')?.dataset.stage === 'idle' &&
      v?.paused && v.currentTime === 0 && v.readyState >= 2 && Math.abs(v.duration - 180) < 0.5 && v.currentSrc === clipUrl;
  }) + ')(' + js(origin + '/clip-a.webm') + ')'), 25_000);
  const actionTabs = (await targets([{type: 'tab', exclude: false}, {exclude: true}])).filter(t => t.url === exactUrl);
  assert.equal(actionTabs.length, 1);
  const fixtureIdentity = await runtime.read('(' + (async url => {
    const rows = (await chrome.tabs.query({})).filter(t => t.url === url);
    if (rows.length !== 1) return null;
    const frame = await chrome.webNavigation.getFrame({tabId: rows[0].id, frameId: 0});
    return frame?.url === url ? {tabId: rows[0].id, documentId: frame.documentId} : null;
  }) + ')(' + js(exactUrl) + ')');
  assert.ok(fixtureIdentity?.documentId);

  phase = 'native-side-panel';
  const contexts = () => runtime.read('chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
  assert.deepEqual(await contexts(), []);
  await browser.call('Target.activateTarget', {targetId: actionTabs[0].targetId});
  await browser.call('Extensions.triggerAction', {id: extensionId, targetId: actionTabs[0].targetId});
  const panelUrl = 'chrome-extension://' + extensionId + '/' + manifest.side_panel.default_path;
  const context = await until(async () => {
    const rows = (await contexts()).filter(row => row.documentUrl?.split('?')[0] === panelUrl && !row.incognito);
    return rows.length === 1 && rows[0];
  });
  assert.ok(context.documentId);
  report.nativeSidePanel = true;
  const panel = await until(async () => (await targets()).find(t => t.url === context.documentUrl));
  const sidebar = await browser.attach(panel.targetId);
  const develop = node('#tab-develop');
  await until(() => sidebar.read('!!' + develop));
  await click(sidebar, develop);
  const correctTarget = node('#script-current-page-status') + '?.dataset.state==="available"&&' +
    node('#script-current-page-url') + '?.textContent===' + js(exactUrl);
  await until(() => sidebar.read(correctTarget));
  report.sidePanelObserved = true;

  phase = 'draft-input';
  const editor = node('#script-source');
  await until(() => sidebar.read(editor + '?.tagName==="TEXTAREA" && !' + editor + '.readOnly'));
  const legacy = await sidebar.read('!!' + node('#page-preview-run'));
  const world = node('#script-javascript-world-page');
  // The current React surface has one Run button selected by the Page radio.
  if (!legacy && !await sidebar.read(world + '?.checked')) await click(sidebar, world + '?.closest("label")');
  if (!legacy) assert.equal(await sidebar.read(world + '?.checked'), true);
  await click(sidebar, editor);
  const selectAll = {key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: process.platform === 'darwin' ? 4 : 2};
  await sidebar.send('Input.dispatchKeyEvent', {type: 'rawKeyDown', ...selectAll, commands: ['selectAll']});
  await sidebar.send('Input.dispatchKeyEvent', {type: 'keyUp', ...selectAll});
  assert.equal(await sidebar.read('(' + (e => document.activeElement === e && e.selectionStart === 0 &&
    e.selectionEnd === e.value.length) + ')(' + editor + ')'), true);
  await sidebar.send('Input.insertText', {text: source});
  assert.equal(await sidebar.read(editor + '.value'), source);
  report.editorSourceSha256 = sha(source);

  const run = node(legacy ? '#page-preview-run' : '#script-run');
  if (legacy) {
    const disclosure = node('#page-preview-tools');
    if (!await sidebar.read(disclosure + '.open')) await click(sidebar, node('#page-preview-tools > summary'));
    await until(() => sidebar.read(disclosure + '.open'));
  }
  await until(() => sidebar.read('!!' + run + ' && !' + run + '.disabled'));
  report.previewControl = legacy ? 'legacy-page-preview' : 'page-mode-run';
  const technical = node('#page-preview-technical') + '?.textContent';
  const previous = await sidebar.read(technical);
  phase = 'preview-click';
  await click(sidebar, run, async () => {
    assert.equal(await target.read(samePage), true);
    assert.equal(await sidebar.read(correctTarget), true);
    if (!legacy) assert.equal(await sidebar.read(world + '?.checked'), true);
    assert.equal(await sidebar.read(editor + '.value'), source);
    report.previewClickAttempted = true;
  });

  phase = 'fixture-and-preview-receipt';
  let dragged = false, landed = false;
  const terminal = new Set(['completed', 'error', 'unknown', 'cancelled']);
  await until(async () => {
    const row = await target.read(samePage + '&&(' + (e => ({stage: e?.dataset.stage, text: e?.textContent})) + ')(' + node('#report') + ')');
    assert.ok(row, 'fixture target no longer matched');
    report.lastFixtureStage = row.stage;
    if (row.stage === 'manual-drag' && !dragged) {
      dragged = true; // A lost acknowledgment never replays the input.
      phase = 'native-drag';
      try {
        await drag(target, exactUrl);
        landed = true;
        report.drag = {input: 'right-to-left', dispatched: true};
      } catch (error) {
        // Keep reading the same fixture and preview after a failed input acknowledgment.
        report.drag = {status: 'unconfirmed', detail: /^scrub was not targetable$/.test(error.message)
          ? error.message : 'native input check failed'};
      }
      phase = 'fixture-and-preview-receipt';
    }
    if (['done', 'failed'].includes(row.stage) && !report.fixture) {
      assert.ok(typeof row.text === 'string' && row.text.length <= 131_072);
      report.fixture = {stage: row.stage, report: sanitize(JSON.parse(row.text))};
    }
    const status = node('#page-preview-status');
    const preview = await sidebar.read('({state:' + status + '?.dataset.state,text:' + status + '?.textContent,raw:' + technical + '})');
    if (!terminal.has(preview.state)) return false;
    report.preview = {uiState: preview.state};
    const code = /^E_[A-Z0-9_]+\b/.exec(preview.text || '')?.[0];
    if (code) report.preview.errorCode = code;
    if (preview.raw?.trim() && preview.raw !== previous) {
      const receipt = JSON.parse(preview.raw);
      report.preview.state = ['preview-evaluated', 'preview-failed'].includes(receipt.state) ? receipt.state : null;
      report.preview.world = ['USER_SCRIPT', 'MAIN', 'ISOLATED'].includes(receipt.world) ? receipt.world : null;
      report.preview.sourceHash = /^[a-f0-9]{64}$/.test(receipt.sourceHash) ? receipt.sourceHash : null;
      report.preview.idDigest = typeof receipt.previewId === 'string' && receipt.previewId ? sha(receipt.previewId) : null;
      if (preview.state === 'completed') {
        assert.equal(receipt.sourceHash, report.sourceSha256);
        assert.equal(receipt.documentId, fixtureIdentity.documentId);
        assert.equal(receipt.tabId, fixtureIdentity.tabId);
        assert.equal(receipt.world, 'USER_SCRIPT');
        assert.equal(receipt.state, 'preview-evaluated');
        report.preview.targetMatched = true;
        return Boolean(report.fixture);
      }
    }
    return preview.state !== 'completed' && (Boolean(report.fixture) || row.stage === 'idle');
  }, 60_000);
  assert.equal(report.preview?.uiState, 'completed');
  assert.equal(report.fixture?.stage, 'done');
  assert.equal(report.fixture?.report?.status, 'PASS');
  assert.ok(landed);
  phase = 'candidate-fingerprints';
  assert.equal(await gitHead(), report.gitHead);
  assert.deepEqual(await inputs(), report.inputs);
  assert.deepEqual(await fingerprints(), report.buildFiles);
  report.candidateUnchanged = true;
  report.status = 'passed';
} catch (error) {
  report.failure = {phase, reason: abort.signal.aborted ? 'interrupted' : error.message === 'timeout' ? 'timeout' :
    /^CDP -?\d+$/.test(error.message) ? error.message : 'check-failed'};
  if (/^(?:fixture target no longer matched|page observation)$/.test(error.message)) {
    report.failure.detail = error.message;
  }
  if (report.previewClickAttempted && (!['completed', 'error'].includes(report.preview?.uiState) ||
      report.preview?.errorCode === 'E_EFFECT_UNKNOWN')) report.previewOutcome = 'unknown';
} finally {
  if (browser) {
    await browser.call('Browser.close').catch(() => {});
    browser.close();
  }
  let stopped = !chrome;
  if (chrome) {
    const waitForExit = ms => Promise.race([exited.then(() => true), delay(ms, false, {ref: false})]);
    stopped = await waitForExit(1500);
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      if (stopped) break;
      chrome.kill(signal);
      stopped = await waitForExit(1500);
    }
  }
  if (server?.listening) await new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  });
  if (temp && stopped) {
    try { await rm(temp, {recursive: true, force: true}); }
    catch { report.cleanup = 'temporary-directory-retained'; }
  } else if (temp) report.cleanup = 'owned-chrome-exit-unconfirmed';
  if (report.cleanup) report.status = 'failed';
  if (report.status !== 'passed') process.exitCode = 1;
  console.log(js(report));
}
