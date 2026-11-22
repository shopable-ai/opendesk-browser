// Loopback and launcher-owned profile only. Never writes the distribution.
import assert from 'node:assert/strict';
import {execFile, spawn} from 'node:child_process';
import {copyFile, mkdtemp, readFile, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {parseArgs, promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {developmentChromeArgs} from '../../../scripts/dev-chrome-config.mjs';
import {attach, click, connect, nativeSelectToolPackage, nativeText, queryExpression as q, read, sha256, sleep, visible} from '../../../tests/native/dynamic-app-r14-helper.mjs';
import {clips, prefix, route, startFixture} from './fixtures/server.mjs';
import {runNativeR9} from './native-r9.mjs';
import {serializeSidebarToolPackage} from '../../../src/ui/sidebar-tools/package.js';

const exec = promisify(execFile), j = JSON.stringify;
const root = fileURLToPath(new URL('../../../', import.meta.url));
const dist = path.join(root, 'dist/development');
const chromeDefault = path.join(root, 'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64',
  'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const abort = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => abort.abort());
const report = {scope: 'local-loopback-only', result: 'BLOCKED', checks: {}, notCovered: {
  iyf: 'NOT_TESTED', chromeSitePermissionRevocation: 'NOT_TESTED', unknownDuration: 'NOT_TESTED',
}};
class Blocked extends Error {}
class Stopped extends Error {}
let phase = 'arguments', client, child, exited, temp, fixture, build, candidateSource, control, controlInput;
const segments = ['rules', 'playback', 'next', 'boundaries', 'sources', 'revocation', 'guards', 'timeline'];
const fingerprints = async () => Object.fromEntries(await Promise.all(
  ['manifest.json', 'sw.js', 'sidepanel.html', 'ui/tool-shell.js', 'development-update.json'].map(async name => {
    try { return [name, sha256(await readFile(path.join(dist, name)))]; }
    catch (error) { if (error.code !== 'ENOENT' || name !== 'development-update.json') throw error; return [name, null]; }
  })));
async function wait(test, timeout = 12_000) {
  const deadline = performance.now() + timeout;
  do {
    abort.signal.throwIfAborted();
    const result = await test();
    if (result) return result;
    await sleep(80, undefined, {signal: abort.signal});
  } while (performance.now() < deadline);
  throw new Error('observation timed out');
}
async function check(name, run) {
  phase = name;
  const evidence = await run();
  report.checks[name] = {result: 'PASS', ...(evidence ? {evidence} : {})};
}
async function checkpoint(name, observe) {
  phase = 'before-' + name;
  const state = await observe();
  (report.checkpoints ??= {})[name] = state;
  if (!control) return;
  const prompt = () => process.stderr.write(JSON.stringify({checkpoint: name, state: report.checkpoints[name]}) +
    '\nContinue with next; observe reads state only; quit ends this owned session.\n');
  prompt();
  for (;;) {
    const {value, done} = await control.next();
    const command = value?.trim();
    if (done || command === 'quit') throw new Stopped('Stopped at a verified checkpoint before ' + name);
    if (command === 'observe' || command === 'next') {
      const current = await observe();
      if (command === 'next') {
        if (canonicalJson(current) !== canonicalJson(state)) {
          report.checkpointChanged = current;
          throw new Blocked('Checkpoint changed; no action sent. Inspect this profile before replaying.');
        }
        return;
      }
      report.checkpoints[name] = current;
    }
    prompt();
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => j(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  return j(value);
}
async function key(session, key, code) {
  for (const type of ['rawKeyDown', 'keyUp'])
    await client.send('Input.dispatchKeyEvent', {type, key, code: key, windowsVirtualKeyCode: code}, session);
}
async function verifyFixture() {
  for (const [name, seconds] of Object.entries(clips)) {
    const {stdout} = await exec('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name:format=duration',
      '-of', 'json', path.join(temp, name + '.webm')], {timeout: 10_000});
    const probe = JSON.parse(stdout);
    assert.equal(probe.streams[0].codec_name, 'vp9');
    assert.ok(Math.abs(Number(probe.format.duration) - seconds) < 0.25);
  }
  for (const [episode, line] of [[1, 'primary'], [2, 'backup'], [3, 'primary']]) {
    const response = await fetch(fixture.origin + route(episode, line));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp('<main[^>]+data-od-episode="' + episode + '"[^>]+data-od-line="' + line + '"'));
    assert.equal([...html.matchAll(/<a data-od-episode="(\d)"/g)].map(match => match[1]).join(''), '332211');
    assert.match(html, /data-od-playlist-complete/);
    assert.equal((html.match(/<video data-od-feature/g) || []).length, 1);
  }
  const resource = fixture.origin + prefix + '/media/one.webm';
  const part = await fetch(resource, {headers: {Range: 'bytes=0-3'}});
  assert.equal(part.status, 206);
  assert.match(part.headers.get('content-range'), /^bytes 0-3\/\d+$/);
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  const tail = await fetch(resource, {headers: {Range: 'bytes=-8'}});
  assert.equal(tail.status, 206);
  assert.equal((await tail.arrayBuffer()).byteLength, 8);
  assert.equal((await fetch(resource, {headers: {Range: 'bytes=99999999-'}})).status, 416);
  assert.equal((await fetch(fixture.origin + route(4))).status, 404);
  return {vp9Clips: Object.keys(clips).length, featureDurations: [clips.one, clips.two, clips.three]};
}

// Keep the app locator contract independent of the OpenDesk host locators.
const ui = {
  status: '#vas-context', feedback: '#vas-feedback', scope: '#vas-scope',
  save: '#vas-save', cancel: '#vas-cancel', undo: '#vas-undo', refresh: '#vas-refresh',
  choice: name => '#vas-rule-' + name,
  restore: name => '#vas-restore-' + name,
  calibrate: name => '#vas-calibrate-' + name,
  field: (name, end) => '#vas-' + name + '-' + end,
  slider: (name, end) => '#vas-' + name + '-' + end + '-slider',
  summary: name => '#vas-summary-' + name,
  markEnd: '#vas-mark-intro-end',
  preview: name => '#vas-preview-' + name,
};
async function native(values) {
  phase = 'candidate-and-dist';
  const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json')));
  const bytes = values.package && await readFile(candidateSource = await realpath(values.package));
  const pkg = bytes && JSON.parse(bytes);
  const id = 'video-auto-skip';
  const candidate = pkg ? path.join(temp, id + '.opendesk-tool.json') : null;
  if (pkg) {
    assert.equal(pkg.id, id);
    assert.ok(pkg.pageModule && pkg.capabilities.includes('page.module'));
    report.candidate = {id, version: pkg.version, sha256: sha256(bytes)};
    await copyFile(candidateSource, candidate);
    assert.equal(sha256(await readFile(candidate)), report.candidate.sha256);
  }
  report.buildFiles = build = await fingerprints();
  report.head = (await exec('git', ['rev-parse', 'HEAD'], {cwd: root, timeout: 5000})).stdout.trim();
  const binary = await realpath(values.chrome || process.env.CHROME_FOR_TESTING_BIN || chromeDefault);
  const version = (await exec(binary, ['--version'], {timeout: 5000, signal: abort.signal})).stdout.trim();
  assert.match(version, /^Google Chrome for Testing 155\.\d+\.\d+\.\d+$/);
  const profile = path.join(temp, 'chrome');
  phase = 'launch-owned-profile';
  child = spawn(binary, ['--window-size=1280,960', '--disable-sync', '--disable-quic', '--enable-unsafe-extension-debugging',
    '--proxy-server=' + fixture.origin, '--proxy-bypass-list=<-loopback>;' + new URL(fixture.origin).host,
    ...developmentChromeArgs({profile, extension: dist})], {stdio: 'ignore'});
  exited = new Promise(resolve => {child.once('error', resolve); child.once('exit', resolve);});
  const [port, endpoint] = await wait(async () => {
    assert.ok(child.pid && child.exitCode === null && child.signalCode === null);
    const parts = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').then(x => x.trim().split('\n')).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return [];
    });
    return /^\d+$/.test(parts[0]) && /^\/devtools\/browser\/[0-9a-f-]+$/.test(parts[1]) && parts;
  });
  const bootCodes = new Set(), scriptWorlds = new Map();
  const c = client = connect('ws://127.0.0.1:' + port + endpoint, event => {
    if (event.method === 'Runtime.executionContextsCleared') scriptWorlds.delete(event.sessionId);
    if (event.method === 'Runtime.executionContextCreated') {
      const {name, auxData} = event.params.context;
      if (auxData?.type === 'isolated') {
        if (!scriptWorlds.has(event.sessionId)) scriptWorlds.set(event.sessionId, []);
        scriptWorlds.get(event.sessionId).push(name);
      }
    }
    if (event.method !== 'Runtime.consoleAPICalled') return;
    const args = event.params.args;
    if (args[0]?.value !== '[OpenDesk Page bootstrap]') return;
    const code = args[1]?.value;
    bootCodes.add(typeof code === 'string' && /^E_[A-Z0-9_]{1,90}$/.test(code) ? code : 'unclassified');
  });
  await c.ready;
  report.chrome = (await c.send('Browser.getVersion')).product;
  report.extensionSource = await realpath(dist);
  assert.equal(report.chrome, 'Chrome/' + version.split(' ').at(-1));
  const targets = async filter => (await c.send('Target.getTargets', filter ? {filter} : {})).targetInfos;
  const worker = await wait(async () => {
    const all = (await targets()).filter(t => t.type === 'service_worker' && /^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(t.url));
    assert.ok(all.length <= 1);
    return all[0];
  });
  const extensionId = report.extensionId = new URL(worker.url).hostname;
  phase = 'attach-extension-worker';
  const {sessionId: sw} = await c.send('Target.attachToTarget', {targetId: worker.targetId, flatten: true});
  await c.send('Runtime.enable', {}, sw);
  const runtime = expression => read(c, sw, expression);
  phase = 'verify-extension-manifest';
  assert.deepEqual(await wait(() => runtime('(()=>{const r=globalThis.chrome?.runtime;const m=r?.getManifest?.();return m&&{id:r.id,name:m.name,version:m.version}})()')),
    {id: extensionId, name: manifest.name, version: manifest.version});
  const openPage = async url => {
    const {targetId} = await c.send('Target.createTarget', {url: 'about:blank'});
    const session = await attach(c, targetId);
    assert.ok(!(await c.send('Page.navigate', {url}, session)).errorText);
    return {targetId, session};
  };
  const userScripts = () => runtime('(async()=>{try{await chrome.userScripts.getScripts();return true}catch{return false}})()');
  phase = 'check-user-scripts';
  if (pkg && !await userScripts()) {
    phase = 'user-scripts-consent';
    if (!values['allow-user-scripts']) throw new Blocked('The fresh profile requires Chrome Allow User Scripts. Pass --allow-user-scripts to use the native consent toggle.');
    const url = 'chrome://extensions/?id=' + extensionId;
    const settings = await openPage(url);
    const detail = 'document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")';
    const exact = 'location.href===' + j(url) + '&&(' + detail + ')?.data?.id===' + j(extensionId);
    const toggle = '(' + detail + ')?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
    await wait(() => read(c, settings.session, exact + '&&!!(' + toggle + ')'));
    const point = await read(c, settings.session, '(()=>{const n=(' + toggle + '),r=n.getBoundingClientRect();return r.width&&r.height&&r.y>=0&&r.bottom<=innerHeight?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()');
    assert.ok(point);
    assert.equal(await read(c, settings.session, exact + '&&(' + toggle + ').checked===false'), true);
    for (const type of ['mousePressed', 'mouseReleased'])
      await c.send('Input.dispatchMouseEvent', {type, ...point, button: 'left', clickCount: 1}, settings.session);
    await wait(userScripts);
    await c.send('Target.closeTarget', {targetId: settings.targetId});
  }
  const url = (episode, line) => fixture.origin + route(episode, line);
  const fixturePrefix = fixture.origin + prefix + '/ep-';
  phase = 'open-fixture-page';
  const page = await openPage(url(1));
  const pageRead = expression => read(c, page.session, expression);
  const media = () => pageRead('location.href.startsWith(' + j(fixturePrefix) + ')&&(()=>{const v=document.querySelector("video[data-od-feature]"),e=document.querySelector("#media-evidence");if(!v||!e)return null;return {time:v.currentTime,duration:Number.isFinite(v.duration)?v.duration:null,paused:v.paused,ended:v.ended,seeking:v.seeking,ready:v.readyState,line:document.querySelector("main").dataset.odLine,episode:Number(document.querySelector("main").dataset.odEpisode),events:JSON.parse(e.textContent)};})()');
  let side, frame;
  const panelUrl = 'chrome-extension://' + extensionId + '/' + manifest.side_panel.default_path;
  const contexts = async () => (await runtime('chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})'))
    .filter(row => row.documentUrl?.split('?')[0] === panelUrl && !row.incognito);
  const fixtureTab = () => runtime('chrome.tabs.query({active:true,currentWindow:true}).then(rows=>rows.length===1&&rows[0].url?.startsWith(' + j(fixturePrefix) + ')?rows[0].id:null)');
  async function openPanel() {
    const observation = report.panelOpening = {step: 'open-precondition'};
    assert.equal((await contexts()).length, 0);
    observation.step = 'activate-and-verify-fixture-tab';
    await c.send('Target.activateTarget', {targetId: page.targetId});
    assert.ok(await fixtureTab());
    const tab = (await targets([{type: 'tab', exclude: false}, {exclude: true}])).filter(t => t.url.startsWith(fixturePrefix));
    assert.equal(tab.length, 1);
    observation.step = 'trigger-browser-action';
    await c.send('Extensions.triggerAction', {id: extensionId, targetId: tab[0].targetId});
    observation.step = 'observe-native-side-panel-context';
    const context = await wait(async () => {const all = await contexts(); return all.length === 1 && all[0];});
    assert.ok(context.documentId);
    observation.step = 'observe-side-panel-debug-target';
    const target = await wait(async () => (await targets()).find(t => t.url === context.documentUrl));
    side = await attach(c, target.targetId);
    observation.step = 'observe-extension-tab';
    await wait(() => visible(c, side, '#tab-tools'));
    delete report.panelOpening;
  }
  async function closePanel() {
    const tabId = await fixtureTab();
    assert.ok(tabId);
    const windowId = await runtime('chrome.tabs.get(' + Number(tabId) + ').then(t=>t.windowId)');
    assert.ok(Number.isInteger(windowId));
    await runtime('chrome.sidePanel.close({windowId:' + windowId + '})');
    await wait(async () => (await contexts()).length === 0);
    side = frame = undefined;
  }
  const shell = selector => click(c, side, selector);
  const shown = selector => visible(c, side, selector);
  async function currentFrame() {
    const frameId = await wait(async () => {
      const {result} = await c.send('Runtime.evaluate', {expression: 'document.querySelector("#sidebar-tool-frame iframe")'}, side);
      if (!result.objectId) return false;
      try {
        return (await c.send('DOM.describeNode', {objectId: result.objectId}, side)).node.frameId;
      } catch (error) {
        // Opening the app can replace the sandbox frame while it mounts. Re-read the element only.
        if (!/Could not find (?:node|object) with given id/.test(error.message)) throw error;
        return false;
      } finally { await c.send('Runtime.releaseObject', {objectId: result.objectId}, side).catch(() => {}); }
    });
    frame = await wait(async () => {
      for (const target of (await targets()).filter(t => t.type === 'iframe' && t.url.startsWith('chrome-extension://' + extensionId + '/sidebar-tools/sandbox.html'))) {
        const session = await attach(c, target.targetId);
        if ((await c.send('Page.getFrameTree', {}, session)).frameTree.frame.id === frameId) return session;
        await c.send('Target.detachFromTarget', {sessionId: session});
      }
      return false;
    });
    await wait(() => visible(c, frame, values.segment === 'sidebar-status' ? '#vas-page-status' : ui.status));
  }
  const appRead = expression => read(c, frame, expression);
  await check('native-side-panel', async () => {
    await wait(async () => {const v = await media(); return v?.ready >= 2 && v.paused && v.duration === (values.segment === 'r9' ? 2700 : clips.one);});
    await wait(() => runtime('chrome.sidePanel.getPanelBehavior().then(x=>x.openPanelOnActionClick)'));
    await openPanel();
    if (['r9', 'timeline'].includes(values.segment) && await shown('#tab-debug')) {
      await shell('#tab-debug');
      report.developmentService = await read(c, side, '(()=>{const status=document.querySelector("#opendesk-development-status");return status&&{text:status.textContent,detail:status.title}})()');
    }
  });
  if (values.mode !== 'installed') {
    try { await check('developer-entry', async () => {
      await shell('#tab-develop');
      const mode = '#local-project-mode';
      await wait(() => read(c, side, '!!(' + q(mode) + ')'));
      if (!await read(c, side, q(mode) + '?.checked')) {
        const toggle = 'label[for="local-project-mode"]';
        await read(c, side, '(' + q(toggle) + ').scrollIntoView({block:"center"})');
        await shell(toggle);
      }
      const entry = await wait(() => read(c, side, '(()=>{const s=document.querySelector("#local-project-select"),h=document.querySelector("#local-project-preview-hint");' +
        'return s?.getClientRects().length && h?.textContent && !h.textContent.includes("检查完成后") && {own:[...s.options].flatMap((o,i)=>/video-auto-skip|连播助手/i.test(o.value+" "+o.textContent)?[i]:[]), disconnected:h.textContent.includes("连接本机后")};})()'));
      const {own} = entry;
      if (entry.disconnected || own.length !== 1) throw new Blocked('No unique authorized app project in this fresh profile. Direct debug requires the existing Native workspace connection.');
      await shell('#local-project-select');
      await key(side, 'Home', 36);
      for (let i = 0; i < own[0]; i++) await key(side, 'ArrowDown', 40);
      await key(side, 'Enter', 13);
      assert.equal(await read(c, side, q('#local-project-select') + '.selectedIndex'), own[0]);
      await shell('#local-project-preview');
      await currentFrame();
      await wait(() => appRead('document.querySelector("#vas-work")?.textContent === "连播助手"'));
      const feedback = await wait(() => appRead('(' + q(ui.feedback) + ')?.textContent'));
      assert.match(feedback, /安装|导入|网页|调试/);
      return {debugPanelMounted: true, installedPlayback: 'NOT_TESTED', snapshotIdentity: 'NOT_TESTED'};
    }); } catch (error) {
      if (values.mode !== 'both' || !(error instanceof Blocked)) throw error;
      report.checks['developer-entry'] = {result: 'BLOCKED', diagnostic: error.message};
    }
    if (values.mode === 'developer') return;
    if (await shown('#sidebar-tool-back')) await shell('#sidebar-tool-back');
  }
  const installedRecord = () => runtime('chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>' +
    '(v["opendesk.sidebar-tools.installed.v1"]??[]).filter(r=>r.id===' + j(id) + '))');
  const siteAllowed = () => runtime('chrome.permissions.contains({origins:["http://127.0.0.1/*"]})');
  async function verifyInstalled() {
    const rows = await installedRecord();
    assert.equal(rows.length, 1);
    if (serializeSidebarToolPackage(rows[0]) !== serializeSidebarToolPackage(pkg)) {
      throw new Blocked('Installed package differs from the frozen candidate. No import retried.');
    }
    const epoch = await runtime('chrome.storage.local.get("opendesk.sidebar-tools.revocation-epochs.v1").then(v=>' +
      'v["opendesk.sidebar-tools.revocation-epochs.v1"]?.[' + j(id) + '])');
    assert.ok(typeof epoch === 'string' && epoch.length);
    const generation = sha256(Buffer.from(epoch)).slice(0, 12);
    assert.equal(report.installGeneration ??= generation, generation);
    assert.equal(await siteAllowed(), true);
    return {id, version: pkg.version, sha256: report.candidate.sha256, generation, authorized: true};
  }
  await check('review-and-install', async () => {
    const existing = await installedRecord();
    if (existing.length) {
      const verified = await verifyInstalled();
      report.installSubmission = 'REUSED';
      return verified;
    }
    await shell('#tab-tools');
    if (!await shown('#sidebar-tool-import')) {
      await shell('#extension-center-more');
      await shell('#extension-center-import');
    }
    await nativeSelectToolPackage(c, side, candidate);
    const confirm = await wait(async () => {
      for (const selector of ['#sidebar-tool-import-confirm', '#sidebar-tool-install']) if (await shown(selector)) return selector;
      return false;
    });
    assert.equal(await read(c, side, 'document.body.innerText.includes(' + j(pkg.title) + ')'), true);
    report.installSubmission = 'UNKNOWN';
    await shell(confirm);
    await wait(async () => (await installedRecord()).length > 0);
    const installed = await verifyInstalled();
    report.installSubmission = 'CONFIRMED';
    return installed;
  });
  async function openApp() {
    if (await shown('#sidebar-tool-back')) await shell('#sidebar-tool-back');
    await shell('#tab-tools');
    await shell('[data-extension-key="app:' + id + '"][data-extension-action="main"]');
    await currentFrame();
  }
  if (values.segment === 'sidebar-status') {
    await openApp();
    await sidebarStatusChecks({c, page, pageRead, appRead, media, side, frame, contexts,
      firstUrl: url(1), secondUrl: url(2), loads: episode => fixture.episodeLoads(episode, 'primary')});
    return;
  }
  async function revokeChromeSiteAccess() {
    const permission = siteAllowed;
    assert.equal(await permission(), true);
    const settingsUrl = 'chrome://extensions/?id=' + extensionId;
    const settings = await openPage(settingsUrl);
    try {
      // This is the native WebUI control in the launcher-owned profile.
      const exact = 'location.href===' + j(settingsUrl) + '&&document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")?.data?.id===' + j(extensionId);
      const access = change => '(()=>{if(!(' + exact + '))return false;const matches=[];function walk(root){' +
        'for(const el of root.querySelectorAll("*")){if(el.tagName==="SELECT"&&[...el.options].some(o=>o.value==="ON_CLICK"))matches.push(el);if(el.shadowRoot)walk(el.shadowRoot);}}' +
        'walk(document);if(matches.length!==1||matches[0].disabled)return false;const s=matches[0];' +
        (change ? 's.value="ON_CLICK";s.dispatchEvent(new Event("change",{bubbles:true}));' : '') + 'return s.value;})()';
      await wait(() => read(c, settings.session, access(false)));
      assert.equal(await read(c, settings.session, access(true)), 'ON_CLICK');
      await wait(async () => await permission() === false);
    } finally {
      await c.send('Target.closeTarget', {targetId: settings.targetId});
      await c.send('Target.activateTarget', {targetId: page.targetId});
    }
    assert.equal(await permission(), false);
    return {authorizationBefore: true, authorizationAfter: false};
  }
  await check('installed-player-binding', async () => {
    const registrationCount = () => runtime('chrome.userScripts.getScripts().then(rows=>rows.filter(row=>row.matches?.includes(' +
      j(pkg.pageModule.pageRules.matches[0]) + ')&&row.world==="USER_SCRIPT"&&row.allFrames===false).length)');
    await wait(async () => await registrationCount() === 1);
    const loaderBefore = (await c.send('Page.getFrameTree', {}, page.session)).frameTree.frame.loaderId;
    await c.send('Page.reload', {}, page.session);
    const observations = report.bindingObservations = {};
    try {
      observations.reloaded = await wait(async () => {
        const current = (await c.send('Page.getFrameTree', {}, page.session)).frameTree.frame;
        return current.loaderId !== loaderBefore && current.url === url(1) && (await media())?.ready >= 2;
      });
      await openApp();
      observations.frameOpened = true;
      observations.seriesVisible = await wait(() => appRead('document.body.innerText.includes("Local Series")'));
    } catch (error) {
      observations.siteGranted = await runtime('chrome.permissions.contains({origins:["http://127.0.0.1/*"]})').catch(() => null);
      observations.nativeRegistrationCount = await registrationCount().catch(() => null);
      observations.isolatedWorlds = scriptWorlds.get(page.session)?.length ?? 0;
      observations.pageReceipts = await runtime(
        '(async()=>{if(!(await indexedDB.databases()).some(db=>db.name==="opendesk-browser"))return null;' +
        'const db=await new Promise((ok,no)=>{const req=indexedDB.open("opendesk-browser");req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error);});' +
        'try{return await new Promise((ok,no)=>{const req=db.transaction("frameworkKV","readonly").objectStore("frameworkKV").getAll();' +
        'req.onsuccess=()=>ok(req.result.filter(r=>r?.programId==="app.video-auto-skip"&&["page-installed-v1","page-execution-v1"].includes(r.tag))' +
        '.map(r=>({tag:r.tag,state:r.state??r.nativeState,grant:r.authorization?.status,code:r.error?.code,result:r.result?.result?.state})));req.onerror=()=>no(req.error);});}finally{db.close();}})()').catch(() => null);
      observations.bootstrapErrors = [...bootCodes];
      observations.pageModuleMounted = await pageRead('!!(' + q('[data-od-id="app.video-auto-skip"]') + ')').catch(() => null);
      if (frame) observations.sidebarStatus = await appRead('(()=>{const c=document.querySelector("#vas-context"),f=document.querySelector("#vas-feedback");return {context:c?.textContent?.trim().slice(0,100),feedback:f?.textContent?.trim().slice(0,100)}})()').catch(() => null);
      throw error;
    }
    const v = await wait(async () => {const m = await media(); return m?.episode === 1 && m.line === 'primary' && m.paused && m.ready >= 2 && m;});
    return {episode: v.episode, line: v.line, duration: v.duration};
  });
  if (values.segment === 'r9') {
    await runNativeR9({c, page, media, appRead, openApp, closePanel, openPanel, contexts, report, check, wait,
      side: () => side, frame: () => frame, output: values.screenshots, baseline: values.baseline,
      nextUrl: url(2), verifyInstalled, key});
    return;
  }
  if (!values['install-only']) await playbackChecks({page, media, pageRead, appRead, openApp, closePanel, openPanel,
    expectedTarget: url(2, 'primary'),
    verifyInstalled, revokeChromeSiteAccess, episodeLoads: () => fixture.episodeLoads(2, 'primary'),
    side: () => side, frame: () => frame, scope: values.segment});
}

async function sidebarStatusChecks({c, page, pageRead, appRead, media, side, frame, contexts, firstUrl, secondUrl, loads}) {
  const panelDocument = (await contexts())[0].documentId;
  const state = () => appRead(`(()=>{
    const el = name => document.querySelector('#vas-' + name);
    return {status:el('page-status').textContent, work:el('work').textContent, context:el('context').textContent,
      visible:el('settings').getBoundingClientRect().height > 0, editDisabled:el('scope').disabled,
      saveDisabled:el('save').disabled, previewDisabled:el('preview-intro').disabled,
      introEnd:el('intro-end').value, draft:!el('cancel').hidden, feedback:el('feedback').textContent};
  })()`);
  const observe = test => wait(async () => {
    const seen = report.lastSidebarState = await state();
    return test(seen) && seen;
  });
  const connected = seen => seen.status.startsWith('播放器已连接') && seen.visible && !seen.editDisabled;
  const episode = (seen, number) => seen.work === 'Local Series' && seen.context.split(' · ')[1] === String(number);
  const loader = async () => (await c.send('Page.getFrameTree', {}, page.session)).frameTree.frame;
  const samePanel = async () => assert.equal((await contexts())[0].documentId, panelDocument);
  const editIntro = async value => {
    await nativeText(c, frame, ui.field('intro', 'end'), value, side);
    await key(side, 'Enter', 13);
    return observe(s => s.draft && !s.saveDisabled && s.introEnd === value);
  };
  await check('first-install-on-open-player', async () => {
    assert.equal(report.installSubmission, 'CONFIRMED');
    const before = await loader(), visits = loads(1);
    assert.equal(before.url, firstUrl);
    assert.equal(visits, 1);
    const initial = await observe(s => connected(s) || s.status.includes('刷新当前播放页'));
    report.firstInstallInitial = initial;
    assert.ok(initial.visible);
    if (!connected(initial)) {
      assert.ok(initial.editDisabled && initial.saveDisabled);
      await c.send('Page.reload', {}, page.session);
      await wait(async () => (await loader()).loaderId !== before.loaderId && (await media())?.ready >= 2);
    }
    const after = await observe(s => connected(s) && episode(s, 1));
    assert.equal((await loader()).url, firstUrl);
    assert.equal(loads(1) - visits, Number(!connected(initial)));
    await samePanel();
    return {initial, after, reloads: loads(1) - visits, sidebarRemainedOpen: true};
  });
  await check('scroll-playback-offscreen', async () => {
    const viewport = () => pageRead(`(()=>{const r=document.querySelector('video[data-od-feature]').getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,scrollY,viewport:innerHeight};})()`);
    const before = await viewport();
    assert.ok(before.bottom > 0 && before.top < before.viewport);
    await pageRead('document.body.style.minHeight="250vh"; true');
    await click(c, page.session, '#fixture-play');
    await c.send('Input.dispatchMouseEvent', {type: 'mouseWheel', x: 620, y: 400, deltaX: 0, deltaY: 650}, page.session);
    const offscreen = await wait(async () => {const v = await viewport(); return v.bottom <= 0 && v.scrollY > 0 && v;});
    await observe(s => connected(s) && s.status.includes('视频在屏幕外'));
    await click(c, frame, ui.choice('intro'), side);
    const edited = await editIntro('00:30');
    const playing = await wait(async () => {const v = await media(); return !v?.paused && v?.time > 0.2 && v;});
    return {before, offscreen, edited, playbackSeconds: playing.time};
  });
  await check('temporary-detection-loss-keeps-draft', async () => {
    const before = await state();
    assert.ok(before.draft && !before.previewDisabled);
    await pageRead('document.querySelector("video[data-od-feature]").hidden=true; true');
    const missing = await observe(s => s.status.includes('等待正片识别'));
    assert.ok(missing.visible && missing.draft && missing.saveDisabled && missing.previewDisabled && missing.editDisabled);
    assert.equal(missing.work, before.work);
    assert.equal(missing.context, before.context);
    assert.equal(missing.introEnd, before.introEnd);
    await pageRead('document.querySelector("video[data-od-feature]").hidden=false; true');
    const recovered = await observe(connected);
    report.recoveryObservation = recovered;
    assert.equal(recovered.introEnd, before.introEnd, 'same player must recover the pending draft');
    assert.ok(recovered.draft && !recovered.saveDisabled && !recovered.previewDisabled);
    return {missing, recovered, editedAgain: await editIntro('00:35')};
  });
  await check('different-episode-does-not-reuse-draft', async () => {
    const before = await loader();
    const link = 'a[data-od-episode="2"][data-od-line="primary"]';
    await pageRead('document.querySelector(' + j(link) + ').scrollIntoView({block:"center"}); true');
    await click(c, page.session, link);
    await wait(async () => {const current = await loader(); return current.url === secondUrl && current.loaderId !== before.loaderId;});
    const after = await observe(s => connected(s) && episode(s, 2));
    assert.ok(!after.draft && after.saveDisabled && after.introEnd === '');
    assert.equal(loads(2), 1);
    await samePanel();
    return {after, sidebarRemainedOpen: true, secondEpisodeLoads: loads(2)};
  });
}

async function playbackChecks({page, media, pageRead, appRead, openApp, closePanel, openPanel, expectedTarget,
  verifyInstalled, revokeChromeSiteAccess, episodeLoads, side, frame, scope}) {
  const tap = selector => click(client, frame(), selector, side());
  const player = selector => click(client, page.session, selector);
  const set = (selector, value) => nativeText(client, frame(), selector, String(value), side());
  const readValue = selector => appRead('(' + q(selector) + ')?.value');
  const attr = (selector, name) => appRead('(' + q(selector) + ')?.getAttribute(' + j(name) + ')');
  const scopeValue = () => attr(ui.scope, 'data-scope');
  const checked = name => appRead('(' + q(ui.choice(name)) + ')?.checked');
  const toggle = async (name, enabled) => {
    if (await checked(name) !== enabled) await tap(ui.choice(name));
    assert.equal(await checked(name), enabled);
  };
  const switchTo = async wanted => {
    if (await scopeValue() !== wanted) await tap(ui.scope);
    await wait(async () => await scopeValue() === wanted);
  };
  const summary = name => appRead('(' + q(ui.summary(name)) + ').textContent');
  const calibrate = async name => {
    if (await appRead('!!document.querySelector("#vas-playback:not([open])")')) await tap('#vas-playback > summary');
    if (!await appRead('(' + q(ui.calibrate(name)) + ').parentElement.open')) await tap(ui.calibrate(name));
  };
  const sliderValue = async selector => Number(await attr(selector, 'aria-valuenow'));
  const dragHandle = async (selector, direction) => {
    await appRead('(' + q(selector) + ').scrollIntoView({block:"center"})');
    const track = await appRead('(()=>{const n=(' + q(selector) + '),r=n.getBoundingClientRect();' +
      'const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,width:n.ownerSVGElement.getBoundingClientRect().width,hit:n.contains(document.elementFromPoint(x,y))};})()');
    const frameBox = await read(client, side(), '(()=>{const f=document.querySelector("#sidebar-tool-frame iframe"),r=f.getBoundingClientRect();return {x:r.x,y:r.y,width:innerWidth,height:innerHeight}})()');
    const y = track.y + frameBox.y;
    const from = track.x + frameBox.x, to = from + direction * track.width / 10;
    assert.ok(track.hit && y > 0 && y < frameBox.height && Math.min(from, to) > 0 && Math.max(from, to) < frameBox.width);
    assert.equal(await read(client, side(), 'document.elementFromPoint(' + from + ',' + y + ')===document.querySelector("#sidebar-tool-frame iframe")'), true);
    const before = await sliderValue(selector);
    await client.send('Input.dispatchMouseEvent', {type: 'mousePressed', x: from, y, button: 'left', buttons: 1, clickCount: 1}, side());
    for (let step = 1; step <= 4; step++) {
      const x = from + (to - from) * step / 4;
      await client.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y, button: 'left', buttons: 1}, side());
    }
    await client.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: to, y, button: 'left', buttons: 0, clickCount: 1}, side());
    assert.ok((await sliderValue(selector) - before) * direction > 0, 'pointer moves the focused endpoint');
  };
  const decideScope = async discard => {
    const local = '#vas-scope-confirm[open] button[value="' + (discard ? 'discard' : 'stay') + '"]';
    const shared = discard ? '#sidebar-tool-action-continue' : '#sidebar-tool-action-cancel';
    const target = await wait(async () => {
      if (await visible(client, frame(), local)) return 'local';
      if (await visible(client, side(), shared) &&
          await read(client, side(), '(' + q(shared) + ').textContent.trim()===' + j(discard ? '放弃并切换' : '继续编辑'))) return 'host';
      return false;
    });
    if (target === 'local') await tap(local);
    else await click(client, side(), shared);
    await wait(() => appRead('(' + q(ui.scope) + ').disabled===false'));
    return target;
  };
  const feedback = matcher => wait(() => appRead('(' + String(matcher) + ').test((' + q(ui.feedback) + ')?.textContent||"")'));
  const save = async () => {
    await tap(ui.save);
    return wait(() => appRead('(()=>{const save=(' + q(ui.save) + '),cancel=(' + q(ui.cancel) + '),status=(' + q(ui.feedback) + ');return save.disabled&&cancel.hidden&&!status.hidden&&status.dataset.tone==="info"&&/已保存/.test(status.textContent)&&status.textContent;})()'));
  };
  const seek = async time => {
    await nativeText(client, page.session, '#fixture-time', String(time));
    const observed = (await media()).events.length;
    await player('#fixture-seek-submit');
    return wait(async () => { const v = await media(); return v?.paused && !v.seeking && Math.abs(v.time - time) < 0.25 &&
      v.events.slice(observed).some(e => e.type === 'seeked') && v; });
  };
  const eventCount = async () => (await media()).events.length;
  const reached = (value, after, checkFrom) => wait(async () => {
    const v = await media();
    const ev = v?.events.slice(after).find(e => e.type === 'seeked' && Math.abs(e.time - value) < 0.4 &&
      e.from < e.time && (!checkFrom || checkFrom(e.from)));
    return ev && {from: Number(ev.from.toFixed(3)), to: Number(ev.time.toFixed(3)), duration: ev.duration, paused: ev.paused};
  });
  const nextSeconds = async (time, label) => {
    const v = await wait(media);
    if (!v.paused) await player('#fixture-play');
    const anchored = await seek(time);
    assert.ok(anchored.paused, label);
    return anchored.events.length;
  };
  const setInterval = async (name, start, end) => {
    await toggle(name, true);
    await set(ui.field(name, 'end'), end);
    await set(ui.field(name, 'start'), start);
  };
  const setTail = async seconds => {
    const duration = (await media()).duration;
    assert.ok(Number.isFinite(duration));
    await setInterval('outro', duration - seconds, duration);
    assert.match(await summary('outro'), new RegExp('最后 ' + seconds + ' 秒'));
  };
  const readyApp = duration => wait(() => appRead('document.querySelector("#vas-work")?.textContent==="Local Series" && ' +
    '!!document.querySelector("#vas-settings:not([hidden]) #vas-intro-end:enabled")' +
    (duration ? ' && document.querySelector("#vas-media")?.textContent.includes(' + j(' / ' + duration) + ')' : '')));
  if (scope === 'page-toast') {
    await check('sidebar-ready-for-page-toast', () => wait(() => appRead(
      'document.querySelector("#vas-work")?.textContent==="Local Series" && ' +
      ['intro', 'outro'].map(kind => '(' + q(ui.choice(kind)) + ')?.matches(":enabled")').join(' && '))));
    await pageRead(`(() => {
      window.fixtureToastOpens = 0;
      document.addEventListener('beforetoggle', event => {
        if (event.newState === 'open' && event.target.matches?.('[data-opendesk-page-toast]')) window.fixtureToastOpens++;
      }, true);
    })()`);
    const toastOpens = () => pageRead('window.fixtureToastOpens');
    const toastOnPage = () => pageRead(`(() => {
      const hosts = document.querySelectorAll('[data-opendesk-page-toast]');
      if (!hosts.length) return null;
      const host = hosts[0], rect = host.getBoundingClientRect();
      return {count: hosts.length, visible: host.matches(':popover-open') && rect.width > 0 && rect.height > 0 &&
        rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        pointerEvents: getComputedStyle(host).pointerEvents, focus: document.activeElement?.id};
    })()`);
    await check('idle-and-manual-preview-have-no-skip-toast', async () => {
      await setInterval('intro', 30, 90);
      await setInterval('outro', 120, 130);
      await save();
      const cursor = await nextSeconds(28, 'before manual preview');
      assert.equal(await toastOnPage(), null);
      await calibrate('intro');
      await tap(ui.preview('intro'));
      const receipt = await reached(90, cursor);
      assert.equal(receipt.paused, true);
      assert.equal(await toastOnPage(), null);
      assert.equal(await toastOpens(), 0);
      return {preview: receipt, toast: false};
    });
    await closePanel();
    for (const [kind, start, end, label] of [['intro', 30, 90, '片头'], ['outro', 120, 130, '片尾']]) {
      await check('confirmed-' + kind + '-toast-with-panel-closed', async () => {
        const cursor = await nextSeconds(start - 0.7, 'before automatic ' + kind);
        assert.equal(await toastOnPage(), null);
        const before = await toastOpens();
        await player('#fixture-play');
        const receipt = await reached(end, cursor, from => from >= start - 1 && from < start + 2);
        assert.equal(receipt.paused, false);
        const toast = await wait(toastOnPage, 3000);
        assert.deepEqual(toast, {count: 1, visible: true, pointerEvents: 'none', focus: 'fixture-play'});
        // Read the rendered message through Chromium's accessibility tree; the toast uses closed Shadow DOM.
        const message = '连播助手：已跳过' + label;
        const {nodes} = await client.send('Accessibility.getFullAXTree', {}, page.session);
        assert.equal(nodes.filter(n => !n.ignored && n.role?.value === 'StaticText' && n.name?.value === message).length, 1);
        await wait(async () => !await toastOnPage(), 4000);
        const after = await media();
        assert.ok(!after.paused && after.time > end + 0.3, 'playback continues after toast dismissal');
        assert.equal(after.events.slice(cursor).filter(e => e.type === 'seeking').length, 1);
        const openings = await toastOpens() - before;
        assert.equal(openings, 1);
        return {receipt, message, ...toast, openings, dismissed: true, advanced: after.time};
      });
    }
    return;
  }
  await check('sidebar-editor-ready', () => readyApp());
  const inspect = async () => {
    const identity = await verifyInstalled();
    const player = await wait(media);
    const panel = frame() ? await appRead('(()=>{const el=id=>document.getElementById("vas-"+id);return {work:el("work")?.textContent,scope:el("scope")?.dataset.scope,dirty:!el("cancel")?.hidden}})()') : null;
    assert.ok(player.ready >= 2 && panel?.work === 'Local Series', 'Checkpoint needs a bound player and open native app');
    return {...identity, work: panel.work, season: 1, episode: player.episode, line: player.line,
      duration: player.duration, time: Number(player.time.toFixed(3)), paused: player.paused,
      seeking: player.seeking, scope: panel.scope, dirty: panel.dirty};
  };
  const enter = name => checkpoint(name, inspect);
  const covered = name => { delete report.notCovered[name]; };
  const receiptText = () => appRead('document.querySelector("#vas-action")?.textContent ?? ""');
  if (scope === 'timeline') {
    await enter('timeline');
    const intro = ui.slider('intro', 'start'), outro = ui.slider('outro', 'end');
    const end = (await media()).duration;
    const format = value => [Math.floor(value / 60), value % 60].map(n => String(n).padStart(2, '0')).join(':');
    const readTimes = () => Promise.all(['intro', 'outro'].flatMap(rule =>
      ['start', 'end'].map(part => readValue(ui.field(rule, part)))));
    const reopen = async () => {
      await closePanel();
      await openPanel();
      await openApp();
      await readyApp();
    };
    await check('native-default-anchors-drag-and-reset', async () => {
      const initial = await readTimes();
      assert.deepEqual(await Promise.all([sliderValue(intro), sliderValue(outro)]), [0, end]);
      const anchors = () => Promise.all([attr(intro, 'data-bound'), attr(outro, 'data-bound')]);
      assert.deepEqual(await anchors(), ['true', 'true']);
      await dragHandle(intro, 1);
      const start = await sliderValue(intro);
      assert.equal(await readValue(ui.field('intro', 'start')), format(start));
      await key(side(), 'Home', 36);
      assert.equal(await sliderValue(intro), 0);
      await dragHandle(outro, -1);
      const finish = await sliderValue(outro);
      assert.equal(await readValue(ui.field('outro', 'end')), format(finish));
      await key(side(), 'End', 35);
      assert.equal(await sliderValue(outro), end);
      assert.deepEqual(await anchors(), ['true', 'true']);
      assert.deepEqual(await readTimes(), initial);
      await dragHandle(intro, 1);
      await tap(ui.cancel);
      await reopen();
      assert.deepEqual(await readTimes(), initial);
      return {start, finish, duration: end, afterDiscardAndReopen: initial};
    });
    await check('native-timeline-save-and-reopen', async () => {
      await setInterval('intro', 20, 90);
      await setInterval('outro', 120, 190);
      const sliders = [intro, ui.slider('intro', 'end'), ui.slider('outro', 'start'), outro];
      assert.deepEqual(await Promise.all(sliders.map(sliderValue)), [20, 90, 120, 190]);
      const times = [];
      for (const [i, slider] of sliders.entries()) {
        await dragHandle(slider, i % 2 === 0 ? 1 : -1);
        assert.equal(await appRead('document.activeElement?.id'), slider.slice(1));
        const dragged = await sliderValue(slider);
        assert.equal((await readTimes())[i], format(dragged));
        await key(side(), 'ArrowLeft', 37);
        assert.equal(await sliderValue(slider), dragged - 1);
        times.push(format(dragged - 1));
      }
      assert.deepEqual(await readTimes(), times);
      const feedback = await save();
      await reopen();
      assert.deepEqual(await readTimes(), times);
      const player = await media();
      assert.equal(player.paused, true);
      assert.equal(player.time, 0);
      return {times, feedback, paused: player.paused};
    });
    covered('timeline');
    return;
  }
  if (scope === 'guards') {
    await enter('guards');
    await check('long-media-tab-order-and-numeric-endpoints', async () => {
      await player('#fixture-long-source');
      await readyApp('07:00');
      const order = [];
      for (const [name, start, end] of [['intro', 30, 90], ['outro', 320, 360]]) {
        await setInterval(name, start, end);
        const input = ui.field(name, 'start');
        const first = ui.slider(name, 'start'), last = ui.field(name, 'end');
        assert.equal(Number(await attr(ui.slider(name, 'end'), 'aria-valuemax')) - Number(await attr(first, 'aria-valuemin')), 300);
        await tap(first);
        for (const selector of [first, ui.slider(name, 'end'), input, last]) {
          const focus = await appRead('document.activeElement?.id');
          assert.equal(focus, selector.slice(1));
          order.push(focus);
          if (selector !== last) await key(side(), 'Tab', 9);
        }
        await tap(ui.cancel);
      }
      await setInterval('intro', 325, 335);
      await set(ui.field('intro', 'end'), 421);
      assert.equal(await appRead('document.querySelector("#vas-save").disabled'), true);
      assert.match(await appRead('(()=>{const f=document.querySelector("#vas-intro-end"),e=document.querySelector("#vas-error-intro");' +
        'return f.getAttribute("aria-invalid")==="true"&&!e.hidden&&e.textContent;})()'), /超出/);
      await set(ui.field('intro', 'end'), 335);
      await save();
      await closePanel(); await openPanel(); await openApp(); await readyApp('07:00');
      const saved = [await readValue(ui.field('intro', 'start')), await readValue(ui.field('intro', 'end'))];
      assert.deepEqual(saved, ['05:25', '05:35']);
      return {order, window: 300, rejected: 421, saved};
    });
    await check('same-source-new-element-discards-old-draft-and-return', async () => {
      await setInterval('intro', 0, 5);
      await toggle('next', true);
      await save();
      const before = await seek(2);
      await calibrate('intro');
      await tap(ui.preview('intro'));
      await reached(5, before.events.length);
      await wait(() => appRead('document.querySelector("#vas-undo")?.hidden===false'));
      await set(ui.field('intro', 'end'), 6);
      // Swap only the fixture element, keeping the same source and duration.
      assert.equal(await pageRead('(()=>{const v=document.querySelector("video[data-od-feature]");const n=v.cloneNode();' +
        'v.replaceWith(n);return !v.isConnected&&n.getAttribute("src")===v.getAttribute("src");})()'), true);
      const changed = await wait(async () => {const v = await media(); return v?.ready >= 2 && v.duration === clips.long && v;});
      assert.ok(changed.paused && changed.time === 0);
      await feedback(/旧草稿未保存/);
      assert.equal(await appRead('document.querySelector("#vas-undo")?.hidden'), true);
      assert.equal(await appRead('document.querySelector("#vas-cancel")?.hidden'), true);
      assert.equal(await readValue(ui.field('intro', 'end')), '00:05');
      return {duration: changed.duration, time: changed.time, paused: changed.paused, savedEnd: '00:05'};
    });
    const navigateManually = async (episode, line) => {
      await player('a[data-od-episode="' + episode + '"][data-od-line="' + line + '"]');
      await wait(async () => {const v = await media(); return v?.episode === episode && v.line === line && v.ready >= 2 && v.paused;});
      await readyApp();
      await wait(() => appRead('document.querySelector("#vas-context").textContent.split(" · ").includes(' + j(line) + ')'));
    };
    await check('different-line-document-does-not-inherit-a-draft', async () => {
      await set(ui.field('intro', 'end'), 6);
      await navigateManually(1, 'backup');
      assert.equal(await appRead('document.querySelector("#vas-cancel")?.hidden'), true);
      assert.equal(await appRead('document.querySelector("#vas-undo")?.hidden'), true);
      assert.equal(await readValue(ui.field('intro', 'end')), '00:05');
      await navigateManually(1, 'primary');
      return {line: 'backup', savedEnd: '00:05'};
    });
    await check('canceled-navigation-is-not-a-manual-arrival-receipt', async () => {
      // The local site cancels one actual navigation event, then allows manual selection.
      await pageRead('(()=>{navigation.addEventListener("navigate",e=>{' +
        'if(e.destination.url===' + j(expectedTarget) + '&&e.cancelable){e.preventDefault();' +
        'document.querySelector("main").dataset.fixtureCanceled="yes";}},{once:true});return true;})()');
      const before = episodeLoads();
      await nextSeconds(clips.one - 2.4, 'before canceled navigation');
      await player('#fixture-play');
      await wait(() => pageRead('document.querySelector("main").dataset.fixtureCanceled==="yes"'));
      assert.equal((await media()).episode, 1);
      assert.equal(episodeLoads(), before);
      await wait(() => pageRead('!navigation.currentEntry.getState()?.["opendesk.video-auto-skip.next"]'));
      await navigateManually(2, 'primary');
      await player('#fixture-play');
      await wait(async () => {const v = await media(); return !v.paused && v.time > 5.3;});
      assert.doesNotMatch(await receiptText(), /已到达|下一集已经开始播放/);
      assert.equal(episodeLoads() - before, 1);
      await player('#fixture-play');
      await navigateManually(1, 'primary');
      return {automaticLoads: 0, manualLoads: 1};
    });
    await check('next-intro-keeps-real-start-receipt', async () => {
      const before = episodeLoads();
      await player('#fixture-autoplay');
      await nextSeconds(clips.one - 2.4, 'before natural next and zero-start intro');
      await player('#fixture-play');
      await wait(async () => (await media())?.episode === 2 && (await receiptText()).includes('尚未确认起播'));
      const end = await wait(async () => {const v = await media(); return v.episode === 2 && v.time > 5.4 && !v.paused && v;});
      const seeks = end.events.filter(e => e.type === 'seeked');
      assert.equal(seeks.length, 1);
      assert.ok(Math.abs(seeks[0].time - 5) < 0.4);
      const status = await wait(async () => {const label = await receiptText(); return label.includes('下一集已经开始播放') && label.includes('片头') && label;});
      assert.equal(episodeLoads() - before, 1);
      return {episode: 2, seeks: seeks.length, landed: seeks[0].time, advanced: end.time, status};
    });
    covered('guards');
    return;
  }
  await enter('rules');
  await check('initial-rules-unset', async () => {
    for (const name of ['intro', 'outro', 'next']) {
      assert.equal(await checked(name), false);
      assert.equal(await summary(name), '未设置');
    }
    assert.equal(await appRead('document.querySelectorAll(".vas-track [role=slider]").length'), 4);
  });
  await check('save-paused-without-seek', async () => {
    const before = await seek(32);
    await setInterval('intro', 30, 90);
    await setInterval('outro', 120, 130);
    await toggle('next', true);
    await toggle('next', false);
    assert.match(await summary('intro'), /未保存.*当前生效/);
    const status = await save();
    assert.doesNotMatch(await appRead('(' + q(ui.summary('next')) + ').textContent'), /未保存/);
    const after = await media();
    assert.equal(after.paused, true);
    assert.ok(Math.abs(after.time - before.time) < 0.1);
    const actions = after.events.slice(before.events.length).filter(e => e.type === 'seeking' || e.type === 'play');
    assert.equal(actions.length, 0);
    return {feedback: status, before: before.time, after: after.time, paused: after.paused, actions: actions.length};
  });
  await check('reopen-saved-rules', async () => {
    const observation = report.panelReopening = {step: 'close-panel'};
    await closePanel();
    observation.step = 'open-panel';
    await openPanel();
    observation.step = 'open-installed-tool';
    await openApp();
    observation.step = 'wait-for-player-binding';
    await readyApp();
    observation.step = 'read-saved-rules';
    assert.equal(await checked('intro'), true);
    assert.equal(await checked('next'), false);
    assert.equal(await readValue(ui.field('intro', 'start')), '00:30');
    assert.equal(await readValue(ui.field('intro', 'end')), '01:30');
    assert.equal(await checked('outro'), true);
    assert.equal(await readValue(ui.field('outro', 'start')), '02:00');
    assert.equal(await readValue(ui.field('outro', 'end')), '02:10');
    delete report.panelReopening;
    return {intro: ['00:30', '01:30'], outro: ['02:00', '02:10'], next: 'off'};
  });
  covered('rules');
  if (scope === 'rules') return;
  await enter('playback');
  await check('natural-intro-with-panel-closed', async () => {
    const cursor = await nextSeconds(29.3, 'before intro');
    await closePanel();
    await player('#fixture-play');
    const receipt = await reached(90, cursor, from => from >= 29 && from < 32);
    const after = await wait(async () => {const v = await media(); return v.time > 90.3 && v;});
    assert.equal(receipt.paused, false);
    assert.ok(after.episode === 1 && !after.paused && !after.ended);
    assert.equal(after.events.slice(cursor).filter(e => e.type === 'seeking').length, 1);
    await player('#fixture-play');
    return {...receipt, advanced: after.time, episode: after.episode, seeks: 1};
  });
  await check('fixed-outro-keeps-remaining-content', async () => {
    const cursor = await nextSeconds(119.4, 'before fixed outro');
    await player('#fixture-play');
    const receipt = await reached(130, cursor, from => from >= 119 && from < 122);
    const after = await wait(async () => {const v = await media(); return v.time > 130.3 && v;});
    assert.ok(after.episode === 1 && !after.paused && !after.ended);
    assert.equal(after.events.slice(cursor).filter(e => e.type === 'seeking').length, 1);
    await player('#fixture-play');
    return {...receipt, advanced: after.time, episode: after.episode, seeks: 1};
  });
  await check('next-off-stays-on-episode-at-natural-end', async () => {
    const cursor = await nextSeconds(clips.one - 2.4, 'before natural end');
    await player('#fixture-play');
    await wait(async () => {const v = await media(); return v?.ended && v.events.slice(cursor).some(e => e.type === 'ended');});
    await sleep(650, undefined, {signal: abort.signal});
    const after = await media();
    assert.ok(after.episode === 1 && after.ended);
    return {episode: after.episode, line: after.line, ended: after.ended};
  });
  covered('playback');
  await openPanel(); await openApp(); await readyApp();
  await check('episode-off-overrides-only-intro', async () => {
    await switchTo('episode');
    await toggle('intro', false);
    await save();
    assert.equal(await checked('intro'), false);
    assert.match(await summary('intro'), /本集例外.*已关闭/);
    assert.equal(await checked('outro'), true);
    assert.equal(await checked('next'), false);
    assert.match(await summary('next'), /沿用作品默认/);
    assert.match(await appRead('(' + q(ui.summary('outro')) + ').textContent'), /沿用作品默认/);
  });
  await enter('next');
  const observation = report.nextObservation = {};
  const frameTree = async () => (await client.send('Page.getFrameTree', {}, page.session)).frameTree.frame;
  let arrival, previousLoads, appArrival;
  await check('next-target-arrival', async () => {
    // The saved fixed tail ends before the duration: finish this episode by natural playback.
    await tap(ui.refresh); await readyApp();
    await switchTo('series');
    await toggle('next', true);
    await save();
    observation.rulesSaved = true;
    await player('#fixture-autoplay');
    observation.fixturePlayerAutoplay = await pageRead('document.querySelector("#fixture-autoplay")?.checked');
    assert.equal(observation.fixturePlayerAutoplay, true);
    await nextSeconds(clips.one - 2.6, 'before natural end with next enabled');
    observation.anchorConfirmed = true;
    const original = await frameTree();
    previousLoads = episodeLoads();
    // Keep the real side panel open to observe both receipts across navigation.
    // Panel-independent rule execution is already checked with the panel closed.
    await player('#fixture-play');
    arrival = await wait(async () => {
      const doc = await frameTree();
      return doc.loaderId !== original.loaderId && doc.url === expectedTarget && doc;
    });
    observation.arrivalConfirmed = true;
    observation.browserEntry = await wait(() => pageRead('location.href===' + j(expectedTarget) +
      '&&({type:performance.getEntriesByType("navigation")[0]?.type,activation:window.navigation?.activation?.navigationType,' +
      'predecessorMarker:Boolean(window.navigation?.activation?.from?.getState()?.["opendesk.video-auto-skip.next"])})'));
    assert.equal(observation.browserEntry.predecessorMarker, true);
    return {episode: 2, line: 'primary', documentChanged: true};
  });
  // Capture this independently; an assertion about the panel must not erase player evidence.
  const arrivedReceipt = wait(async () => {
    const [v, status] = await Promise.all([media(), receiptText()]);
    observation.appStatus = status.includes('尚未确认起播') ? 'arrived' : status.includes('开始播放') ? 'playing' : status ? 'other' : 'empty';
    return v?.episode === 2 && v.paused && observation.appStatus === 'arrived';
  }).then(value => {appArrival = value;}, () => {appArrival = false;});
  await check('next-target-starts-and-advances', async () => {
    const start = await wait(async () => {
      const doc = await frameTree();
      const v = doc.loaderId === arrival.loaderId && doc.url === expectedTarget && await media();
      return v?.episode === 2 && v.line === 'primary' && v.ready >= 2 && !v.paused && v.time > 0.2 &&
        v.events.some(e => e.type === 'playing') && v;
    });
    assert.equal(start.duration, clips.two);
    const advanced = await wait(async () => {
      const doc = await frameTree();
      const v = doc.loaderId === arrival.loaderId && doc.url === expectedTarget && await media();
      return v?.episode === 2 && !v.paused && v.time > start.time + 0.4 && v;
    });
    const loads = episodeLoads() - previousLoads;
    assert.equal(loads, 1);
    return {episode: start.episode, line: start.line, time: start.time, advanced: advanced.time, loads};
  });
  await check('next-side-panel-arrival-and-start-receipts', async () => {
    await arrivedReceipt;
    assert.equal(appArrival, true);
    observation.appArrival = true;
    await wait(async () => (await receiptText()).includes('下一集已经开始播放'));
    observation.appPlaying = true;
  });
  await check('next-episode-inherits-series-not-prior-override', async () => {
    await readyApp();
    assert.equal(await scopeValue(), 'series');
    assert.equal(await checked('intro'), true);
    await switchTo('episode');
    assert.equal(await checked('intro'), true);
    assert.match(await summary('intro'), /沿用作品默认/);
  });
  covered('next');
  await check('return-to-episode-one-for-boundaries', async () => {
    await player('#fixture-autoplay');
    await closePanel();
    await player('a[data-od-episode="1"][data-od-line="primary"]');
    await wait(async () => {const v = await media(); return v?.episode === 1 && v.line === 'primary' && v.paused && v.ready >= 2;});
    await openPanel(); await openApp(); await readyApp();
    await switchTo('episode');
    await tap(ui.restore('intro'));
    await save();
    await switchTo('series');
    await toggle('next', false);
    await save();
  });
  await enter('boundaries');
  await check('reject-invalid-interval', async () => {
    await setInterval('intro', 6, 5);
    assert.equal(await appRead('(' + q(ui.save) + ').disabled'), true);
    assert.match(await appRead('document.querySelector("#vas-edit-status").textContent'), /早于|晚于|小于/);
    const invalidEnd = await appRead('(()=>{const e=document.querySelector("#vas-intro-end"),n=document.querySelector("#vas-error-intro");' +
      'return !n.hidden&&e.getAttribute("aria-invalid")==="true"&&e.getAttribute("aria-describedby").split(" ").includes(n.id)&&n.textContent;})()');
    assert.match(invalidEnd, /开始必须早于结束/);
    await set(ui.field('intro', 'end'), 8);
    assert.equal(await appRead('document.querySelector("#vas-error-intro").hidden'), true);
    await tap(ui.cancel);
    assert.equal(await checked('intro'), true);
  });
  await check('dirty-draft-does-not-cross-scopes', async () => {
    await setInterval('intro', 1, 5);
    await tap(ui.scope);
    const cancelSurface = await decideScope(false);
    assert.equal(await scopeValue(), 'series');
    assert.equal(await readValue(ui.field('intro', 'end')), '00:05');
    await tap(ui.scope);
    const confirmSurface = await decideScope(true);
    assert.equal(await scopeValue(), 'episode');
    assert.equal(await readValue(ui.field('intro', 'end')), '01:30');
    assert.equal(await checked('intro'), true);
    assert.match(await summary('intro'), /沿用作品默认/);
    await switchTo('series');
    assert.equal(await checked('intro'), true);
    return {cancelSurface, confirmSurface};
  });
  await check('both-timed-ranges-accept-pointer-and-focused-keys', async () => {
    const values = {};
    for (const name of ['intro', 'outro']) {
      if (name === 'intro') await setInterval(name, 20, 190);
      else await setInterval(name, 30, 180);
      for (const field of ['start', 'end']) {
        const slider = ui.slider(name, field);
        await dragHandle(slider, field === 'start' ? 1 : -1);
        assert.equal(await appRead('document.activeElement?.id'), slider.slice(1));
        const before = await sliderValue(slider);
        await key(side(), 'ArrowLeft', 37);
        const value = await sliderValue(slider);
        assert.equal(value, before - 1);
        const label = String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
        assert.equal(await readValue(ui.field(name, field)), label);
        values[name + '.' + field] = value;
      }
      const end = await sliderValue(ui.slider(name, 'end'));
      await tap(ui.slider(name, 'start'));
      await key(side(), 'End', 35);
      assert.equal(await sliderValue(ui.slider(name, 'start')), end - 1);
      await key(side(), 'ArrowRight', 39);
      assert.equal(await sliderValue(ui.slider(name, 'start')), end - 1);
    }
    await tap(ui.cancel);
    assert.equal(await checked('outro'), true);
    return values;
  });
  await check('manual-seek-inside-intro-does-not-retrigger', async () => {
    const cursor = await nextSeconds(32, 'manual seek inside intro');
    await player('#fixture-play');
    const observed = await wait(async () => {const v = await media(); return v.time > 32.5 && v;});
    assert.ok(observed.time < 34.5);
    assert.equal(observed.events.slice(cursor).some(e => e.type === 'seeking'), false);
    await player('#fixture-play');
  });
  await check('undo-automatic-skip-stays-paused-and-does-not-reskip', async () => {
    await readyApp();
    const cursor = await nextSeconds(29.3, 'before undo test intro');
    await player('#fixture-play');
    const skip = await reached(90, cursor, from => from >= 29 && from < 32);
    await player('#fixture-play');
    await wait(() => appRead('document.querySelector("#vas-undo")?.textContent==="撤销自动跳过"&&document.querySelector("#vas-undo")?.hidden===false'));
    const before = await eventCount();
    await tap(ui.undo);
    const back = await wait(async () => {
      const v = await media();
      const event = v.events.slice(before).find(e => e.type === 'seeked' && Math.abs(e.time - skip.from) < 0.5);
      return v.paused && event && v;
    });
    await player('#fixture-play');
    const after = await wait(async () => {const v = await media(); return v.time > back.time + 0.6 && v;});
    assert.ok(after.time < 34 && !after.events.slice(back.events.length).some(e => e.type === 'seeking'));
    await player('#fixture-play');
    return {skip, undoTime: back.time, paused: back.paused, resumedAt: after.time, repeated: false};
  });
  await check('mark-time-updates-only-draft', async () => {
    const before = await seek(45);
    await calibrate('intro');
    await tap(ui.markEnd);
    await feedback(/填入草稿/);
    assert.equal(await readValue(ui.field('intro', 'end')), '00:45');
    const after = await media();
    assert.equal(after.time, before.time);
    assert.equal(after.paused, true);
    await tap(ui.cancel);
    assert.equal(await readValue(ui.field('intro', 'end')), '01:30');
  });
  await check('preview-and-return-preserve-paused', async () => {
    const before = await seek(32);
    await calibrate('intro');
    await tap(ui.preview('intro'));
    await reached(90, before.events.length);
    assert.equal((await media()).paused, true);
    const cursor = await eventCount();
    await tap(ui.undo);
    const after = await wait(async () => {
      const v = await media(); return v.paused && Math.abs(v.time - 32) < 0.25 && v.events.slice(cursor).some(e => e.type === 'seeked') && v;
    });
    assert.equal(after.paused, true);
    await player('#fixture-play');
    const observed = await wait(async () => {const v = await media(); return v.time > 32.5 && v;});
    assert.ok(observed.time < 34.5 && !observed.events.slice(after.events.length).some(e => e.type === 'seeking'));
    await player('#fixture-play');
  });
  await check('manual-tail-preview-does-not-advance', async () => {
    await setTail(3);
    await toggle('next', true);
    await save();
    const stillPaused = await media();
    assert.ok(stillPaused.episode === 1 && stillPaused.paused);
    const before = await seek(clips.one - 6);
    await calibrate('outro');
    await tap(ui.preview('outro'));
    const receipt = await reached(clips.one - 3, before.events.length);
    assert.equal(receipt.paused, true);
    const cursor = await eventCount();
    await player('#fixture-play');
    await wait(async () => { const v = await media(); return v?.episode === 1 && v.ended && v.events.slice(cursor).some(e => e.type === 'ended'); });
    await sleep(850, undefined, {signal: abort.signal});
    assert.equal((await media()).episode, 1);
    return receipt;
  });
  covered('boundaries');
  await enter('sources');
  await check('relative-outro-source-duration-recomputed', async () => {
    await switchTo('series');
    await setTail(90);
    await save();
    const firstCursor = await nextSeconds(clips.one - 90 - 0.9, 'before initial relative outro');
    await player('#fixture-play');
    const first = await reached(clips.one, firstCursor, from => Math.abs(from - (clips.one - 90)) < 2);
    await player('#fixture-source');
    await wait(async () => {const v = await media(); return v?.duration === clips.alternate && v.ready >= 2 && v.paused;});
    const secondCursor = await nextSeconds(clips.alternate - 90 - 0.9, 'before recalculated relative outro');
    await player('#fixture-play');
    const second = await reached(clips.alternate, secondCursor, from => Math.abs(from - (clips.alternate - 90)) < 2);
    return {first, second};
  });
  await check('open-ended-media-retains-rules-without-timed-seek', async () => {
    await player('#fixture-open-stream');
    await wait(() => pageRead('(()=>{const v=document.querySelector("video[data-od-feature]");return v.duration===Infinity&&v.readyState>=2&&v.seekable.length===1&&v.seekable.end(0)>106;})()'));
    await tap(ui.refresh);
    await readyApp('—');
    await switchTo('series');
    assert.match(await summary('outro'), /最后 90 秒/);
    assert.equal(await readValue(ui.field('outro', 'start')), '');
    assert.equal(await appRead('(' + q(ui.preview('outro')) + ').disabled'), true);
    assert.equal(await attr(ui.slider('outro', 'end'), 'aria-disabled'), 'true');
    const anchor = clips.alternate - 90 - 0.8;
    const cursor = await nextSeconds(anchor, 'before the finite source’s relative outro point');
    await player('#fixture-play');
    const after = await wait(async () => {const v = await media(); return v?.time > anchor + 2 && v;});
    assert.equal(after.duration, null);
    assert.equal(after.paused, false);
    const seeks = after.events.slice(cursor).filter(e => e.type === 'seeking').length;
    assert.equal(seeks, 0);
    await player('#fixture-source');
    await wait(async () => {const v = await media(); return v?.duration === clips.alternate && v.ready >= 2 && v.paused;});
    await tap(ui.refresh);
    await readyApp('03:15');
    await switchTo('series');
    assert.match(await summary('outro'), /最后 90 秒/);
    assert.equal(await readValue(ui.field('outro', 'start')), '01:45');
    assert.equal(await readValue(ui.field('outro', 'end')), '03:15');
    const restoredCursor = await nextSeconds(anchor, 'before the restored relative outro point');
    await player('#fixture-play');
    const restored = await reached(clips.alternate, restoredCursor, from => Math.abs(from - (clips.alternate - 90)) < 2);
    delete report.notCovered.unknownDuration;
    return {openEnded: {before: anchor, after: after.time, seeks}, restored};
  });
  covered('sources');
  if (!(await media()).paused) await player('#fixture-play');
  await wait(async () => (await media())?.paused);
  await enter('revocation');
  await switchTo('series');
  await toggle('outro', false);
  await save();
  await check('chrome-site-access-revoked-stops-live-playback-actions', async () => {
    const control = await nextSeconds(29.3, 'before inherited intro');
    await player('#fixture-play');
    await reached(90, control);
    await nextSeconds(29.3, 'before revoked intro');
    await closePanel();
    const permissions = await revokeChromeSiteAccess();
    const before = await media();
    await player('#fixture-play');
    const after = await wait(async () => {const v = await media(); return v?.time > 31.25 && v;});
    assert.ok(!after.paused && after.time < 34 && after.episode === before.episode);
    const seeks = after.events.slice(before.events.length).filter(e => e.type === 'seeking').length;
    assert.equal(seeks, 0);
    await player('#fixture-play');
    delete report.notCovered.chromeSitePermissionRevocation;
    return {...permissions, before: before.time, after: after.time, seeks};
  });
  covered('revocation');
}

try {
  const {values} = parseArgs({options: {
    help: {type: 'boolean'}, 'verify-fixture': {type: 'boolean'}, 'allow-browser': {type: 'boolean'},
    'allow-user-scripts': {type: 'boolean'}, 'install-only': {type: 'boolean'}, chrome: {type: 'string'},
    package: {type: 'string'}, mode: {type: 'string', default: 'installed'}, port: {type: 'string', default: '0'},
    interactive: {type: 'boolean'}, segment: {type: 'string', default: 'all'},
    screenshots: {type: 'string'}, baseline: {type: 'boolean'},
  }});
  if (values.help) {
    console.log('node projects/video-auto-skip/tests/native.mjs --verify-fixture\n' +
      'Native (leader go-ahead required): --allow-browser --allow-user-scripts --package <candidate.json> [--install-only] [--chrome <CFT155>]\n' +
      'Optional: --mode developer or --mode both; direct debug requires an authorized local Native workspace in the temporary profile.\n' +
      'Optional: --interactive or --segment rules|guards|sidebar-status|page-toast|r9|timeline (r9 requires --screenshots <dir>).\n' +
      'Optional: --port <fixed loopback port> for a tightly scoped candidate. Node 22+, ffmpeg, ffprobe (fixture-only).');
  } else {
    assert.ok(['developer', 'installed', 'both'].includes(values.mode), 'invalid mode');
    assert.ok(['all', 'rules', 'guards', 'sidebar-status', 'page-toast', 'r9', 'timeline'].includes(values.segment), 'invalid segment');
    if (values.segment === 'r9') assert.ok(values.screenshots && values.package && values.mode === 'installed');
    if (['sidebar-status', 'page-toast'].includes(values.segment)) {
      assert.ok(values.package && values.mode === 'installed' && !values['install-only'], values.segment + ' requires an installed candidate and playback');
    }
    for (const segment of segments) report.notCovered[segment] = 'NOT_TESTED';
    report.requestedSegment = values.segment;
    assert.ok(/^\d+$/.test(values.port) && Number(values.port) <= 65535, 'invalid port');
    if (!values['verify-fixture'] && !values['allow-browser']) throw new Blocked('Browser start requires explicit --allow-browser after coordination.');
    if (!values['verify-fixture'] && values.mode !== 'developer' && !values.package) throw new Blocked('Supply the frozen package with --package.');
    if (values.interactive) {
      controlInput = createInterface({input: process.stdin, terminal: false});
      control = controlInput[Symbol.asyncIterator]();
      abort.signal.addEventListener('abort', () => controlInput.close(), {once: true});
    }
    temp = await mkdtemp(path.join(tmpdir(), 'video-auto-skip-native-'));
    phase = 'fixture-start';
    const durations = values.segment === 'r9' ? {...clips, one: 2700, two: 2880} : clips;
    fixture = await startFixture({directory: temp, port: Number(values.port), signal: abort.signal, durations});
    if (values['verify-fixture']) await check('webm-and-loopback-http', verifyFixture);
    else await native(values);
    report.result = 'PASS';
  }
} catch (error) {
  report.result = error instanceof Stopped ? 'NOT_TESTED' : error instanceof Blocked ? 'BLOCKED' : 'FAIL';
  let protocol;
  try { protocol = JSON.parse(error.message); } catch { /* Not a CDP error. */ }
  const exception = protocol?.exception?.description?.split('\n')[0];
  const diagnostic = error instanceof Blocked || error instanceof Stopped || /^CDP (?:timeout: [\w.]+|disconnected)$/.test(error.message) ||
    error.message === 'observation timed out' ? error.message : Number.isInteger(protocol?.code) &&
    typeof protocol.message === 'string' && /^[\w ()'.:-]{1,120}$/.test(protocol.message) ? protocol.message :
    typeof exception === 'string' && /^[\w ()'.:-]{1,150}$/.test(exception) ? exception : error.name;
  const sourceLine = error.stack?.match(/native\.mjs:(\d+):\d+/)?.[1];
  report.checks[phase] = {result: report.result, diagnostic, ...(sourceLine && {driverLine: Number(sourceLine)})};
  process.exitCode = 1;
} finally {
  controlInput?.close();
  if (client) {
    try { await client.send('Browser.close'); } catch { /* browser may close before acknowledging */ }
    client.close();
  }
  if (child && await Promise.race([exited.then(() => false), sleep(1500, true)])) {
    child.kill();
    if (await Promise.race([exited.then(() => false), sleep(1500, true)])) { child.kill('SIGKILL'); await exited; }
  }
  if (fixture) await fixture.close();
  if (temp) await rm(temp, {recursive: true, force: true});
  if (build) {
    try { assert.deepEqual(await fingerprints(), build); report.buildUnchanged = true; }
    catch { report.buildUnchanged = false; }
    if (candidateSource) {
      try { report.candidateUnchanged = sha256(await readFile(candidateSource)) === report.candidate.sha256; }
      catch { report.candidateUnchanged = false; }
    }
    if (!report.buildUnchanged || report.candidateUnchanged === false) { report.result = 'FAIL'; process.exitCode = 1; }
  }
  if (!process.argv.includes('--help')) console.log(JSON.stringify(report, null, 2));
}
