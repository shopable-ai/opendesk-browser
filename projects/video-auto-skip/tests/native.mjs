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
const segments = ['rules', 'playback', 'next', 'boundaries', 'sources', 'revocation', 'guards'];
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
const ruleLabel = {intro: '跳过片头', outro: '跳过片尾', next: '自动下一集'};
const ui = {
  status: '#vas-context', feedback: '#vas-feedback', scope: '#vas-scope',
  save: '#vas-save', cancel: '#vas-cancel', undo: '#vas-undo', refresh: '#vas-refresh',
  choice: name => '#vas-rule-' + name,
  mode: name => '#vas-mode-' + name,
  edit: name => 'button[aria-controls="vas-editor-' + name + '"]',
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
    await wait(() => visible(c, frame, ui.status));
  }
  const appRead = expression => read(c, frame, expression);
  await check('native-side-panel', async () => {
    await wait(async () => {const v = await media(); return v?.ready >= 2 && v.paused && v.duration === clips.one;});
    await wait(() => runtime('chrome.sidePanel.getPanelBehavior().then(x=>x.openPanelOnActionClick)'));
    await openPanel();
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
      await wait(() => appRead('document.body.innerText.includes("Local Series")'));
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
  if (!values['install-only']) await playbackChecks({page, media, pageRead, appRead, openApp, closePanel, openPanel,
    expectedTarget: url(2, 'primary'),
    verifyInstalled, revokeChromeSiteAccess, episodeLoads: () => fixture.episodeLoads(2, 'primary'),
    side: () => side, frame: () => frame, scope: values.segment});
}

async function playbackChecks({page, media, pageRead, appRead, openApp, closePanel, openPanel, expectedTarget,
  verifyInstalled, revokeChromeSiteAccess, episodeLoads, side, frame, scope}) {
  const tap = selector => click(client, frame(), selector, side());
  const player = selector => click(client, page.session, selector);
  const set = (selector, value) => nativeText(client, frame(), selector, String(value), side());
  const readValue = selector => appRead('(' + q(selector) + ')?.value');
  const dragRange = async selector => {
    // Put the real editor in view before calculating the thumb and frame bounds.
    await tap(selector);
    const track = await appRead('(()=>{const n=(' + q(selector) + '),r=n.getBoundingClientRect();return {left:r.left,right:r.right,y:r.y+r.height/2}})()');
    const frameBox = await read(client, side(), '(()=>{const f=document.querySelector("#sidebar-tool-frame iframe"),r=f.getBoundingClientRect();return {x:r.x,y:r.y,width:innerWidth,height:innerHeight}})()');
    const y = track.y + frameBox.y;
    const from = (track.left + track.right) / 2 + frameBox.x;
    const to = from + (track.right - track.left) / 5;
    assert.ok(y > 0 && y < frameBox.height && from > 0 && to < frameBox.width);
    assert.equal(await read(client, side(), 'document.elementFromPoint(' + from + ',' + y + ')===document.querySelector("#sidebar-tool-frame iframe")'), true);
    const before = await readValue(selector);
    await client.send('Input.dispatchMouseEvent', {type: 'mousePressed', x: from, y, button: 'left', buttons: 1, clickCount: 1}, side());
    for (let step = 1; step <= 4; step++) {
      const x = from + (to - from) * step / 4;
      await client.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y, button: 'left', buttons: 1}, side());
    }
    await client.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: to, y, button: 'left', buttons: 0, clickCount: 1}, side());
    assert.notEqual(await readValue(selector), before);
  };
  const lastSelection = new Map();
  const select = async (selector, wanted, expected = wanted) => {
    // Type the first (unique) character into the closed native select, so no Mac popup or
    // global keyboard focus is needed. Observe a browser-generated input on the exact control.
    const previous = await readValue(selector);
    if (previous === wanted) return previous;
    const delay = 1100 - (performance.now() - (lastSelection.get(selector) ?? -Infinity));
    if (delay > 0) await sleep(delay, undefined, {signal: abort.signal});
    const sandbox = frame(), panel = side();
    const character = await appRead('(()=>{const e=(' + q(selector) + '),o=e?.options,b=[...o??[]].find(x=>x.value===' + j(wanted) +
      '),first=[...b?.textContent.trim()??""][0];if(!first||e.disabled||!e.getClientRects().length||' +
      '[...o].filter(x=>x.textContent.trim().startsWith(first)).length!==1)return null;' +
      'delete e.dataset.testTrustedChoice;e.addEventListener("input",event=>{if(event.isTrusted)e.dataset.testTrustedChoice=e.value;},{once:true});' +
      'e.focus();return document.activeElement===e?first:null;})()');
    assert.ok(character && sandbox === frame() && panel === side());
    assert.equal(await read(client, panel, 'document.activeElement===document.querySelector("#sidebar-tool-frame iframe")'), true);
    report.selectInput = 'native-select-keyboard-typeahead';
    report.lastSelection = {control: selector, wanted, expected};
    await client.send('Input.dispatchKeyEvent', {type: 'char', key: character, text: character, unmodifiedText: character}, panel);
    lastSelection.set(selector, performance.now());
    try {
      await wait(() => appRead('(' + q(selector) + ')?.dataset.testTrustedChoice===' + j(wanted)), 2500);
      assert.equal(await readValue(selector), expected);
      delete report.lastSelection;
      return expected;
    } catch (error) {
      report.lastSelection.observed = await readValue(selector);
      throw error;
    }
  };
  const edit = async name => {
    if (await visible(client, frame(), ui.mode(name))) return;
    const selector = ui.edit(name);
    try {
      await wait(() => visible(client, frame(), selector), 2500);
      await appRead('(' + q(selector) + ').scrollIntoView({block:"center",inline:"nearest"})');
      if (!await visible(client, frame(), ui.mode(name))) await tap(selector);
    } catch (error) {
      report.editObservation = await appRead('(()=>{const b=(' + q(selector) + '),r=b.getBoundingClientRect();' +
        'return {hidden:b.hidden,disabled:b.disabled,scope:document.querySelector("#vas-scope").value,' +
        'modeHidden:document.querySelector(b.getAttribute("aria-controls")?"#"+b.getAttribute("aria-controls"):"template").hidden,' +
        'choice:document.querySelector(' + j(ui.choice(name)) + ').value,top:Math.round(r.top),height:Math.round(r.height),viewport:innerHeight};})()');
      throw error;
    }
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
  const zeroTo = async (name, start, end) => {
    await select(ui.choice(name), 'on');
    await edit(name);
    await select(ui.mode(name), 'fixed');
    // Set end first so entering a positive start can leave the range valid.
    await set(ui.field(name, 'end'), end);
    await set(ui.field(name, 'start'), start);
  };
  const readyApp = duration => wait(() => appRead('document.querySelector("#vas-work")?.textContent==="Local Series" && ' +
    '!document.querySelector("#vas-settings")?.hidden && document.querySelector("#vas-scope")?.disabled===false' +
    (duration ? ' && document.querySelector("#vas-media")?.textContent.includes(' + j(' / ' + duration) + ')' : '')));
  await readyApp();
  const inspect = async () => {
    const identity = await verifyInstalled();
    const player = await wait(media);
    const panel = frame() ? await appRead('(()=>{const el=id=>document.getElementById("vas-"+id);return {work:el("work")?.textContent,scope:el("scope")?.value,dirty:!el("cancel")?.hidden}})()') : null;
    assert.ok(player.ready >= 2 && panel?.work === 'Local Series', 'Checkpoint needs a bound player and open native app');
    return {...identity, work: panel.work, season: 1, episode: player.episode, line: player.line,
      duration: player.duration, time: Number(player.time.toFixed(3)), paused: player.paused,
      seeking: player.seeking, scope: panel.scope, dirty: panel.dirty};
  };
  const enter = name => checkpoint(name, inspect);
  const covered = name => { delete report.notCovered[name]; };
  const receiptText = () => appRead('document.querySelector("#vas-action")?.textContent ?? ""');
  if (scope === 'guards') {
    await enter('guards');
    await check('long-media-tab-order-and-numeric-endpoints', async () => {
      await player('#fixture-long-source');
      await readyApp('07:00');
      const order = [];
      for (const [name, start, end] of [['intro', 30, 90], ['outro', 320, 360]]) {
        await zeroTo(name, start, end);
        const input = ui.field(name, 'start');
        const limit = await appRead('(()=>{const s=(' + q(ui.slider(name, 'end')) + ');return [+s.min,+s.max];})()');
        assert.equal(limit[1] - limit[0], 300);
        await tap(input);
        for (const selector of [input, ui.slider(name, 'start'), ui.field(name, 'end'), ui.slider(name, 'end')]) {
          const focus = await appRead('document.activeElement?.id');
          assert.equal(focus, selector.slice(1));
          order.push(focus);
          if (selector !== ui.slider(name, 'end')) await key(side(), 'Tab', 9);
        }
        await tap(ui.cancel);
      }
      await zeroTo('intro', 325, 335);
      await set(ui.field('intro', 'end'), 421);
      assert.equal(await appRead('document.querySelector("#vas-save").disabled'), true);
      assert.match(await appRead('(()=>{const f=document.querySelector("#vas-intro-end"),e=document.querySelector("#vas-intro-end-error");' +
        'return f.getAttribute("aria-invalid")==="true"&&!e.hidden&&e.textContent;})()'), /超出/);
      await set(ui.field('intro', 'end'), 335);
      await save();
      await closePanel(); await openPanel(); await openApp(); await readyApp('07:00');
      await edit('intro');
      const saved = [await readValue(ui.field('intro', 'start')), await readValue(ui.field('intro', 'end'))];
      assert.deepEqual(saved, ['05:25', '05:35']);
      return {order, window: 300, rejected: 421, saved};
    });
    await check('same-source-new-element-discards-old-draft-and-return', async () => {
      await zeroTo('intro', 0, 5);
      await select(ui.choice('next'), 'on');
      await save();
      await edit('intro');
      const before = await seek(2);
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
      await edit('intro');
      assert.equal(await readValue(ui.field('intro', 'end')), '00:05');
      return {duration: changed.duration, time: changed.time, paused: changed.paused, savedEnd: '00:05'};
    });
    const navigateManually = async (episode, line) => {
      await player('a[data-od-episode="' + episode + '"][data-od-line="' + line + '"]');
      await wait(async () => {const v = await media(); return v?.episode === episode && v.line === line && v.ready >= 2 && v.paused;});
      await readyApp();
      await wait(() => appRead('document.querySelector("#vas-context").textContent.endsWith(' + j(line) + ')'));
    };
    await check('different-line-document-does-not-inherit-a-draft', async () => {
      await set(ui.field('intro', 'end'), 6);
      await navigateManually(1, 'backup');
      assert.equal(await appRead('document.querySelector("#vas-cancel")?.hidden'), true);
      assert.equal(await appRead('document.querySelector("#vas-undo")?.hidden'), true);
      await edit('intro');
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
    for (const name of Object.keys(ruleLabel)) assert.equal(await readValue(ui.choice(name)), 'inherit');
  });
  await check('save-paused-without-seek', async () => {
    const before = await seek(32);
    await zeroTo('intro', 30, 90);
    await zeroTo('outro', 120, 130);
    await select(ui.choice('next'), 'off');
    assert.match(await appRead('(' + q(ui.summary('next')) + ').textContent'), /未保存.*当前生效/);
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
    await closePanel(); await openPanel(); await openApp(); await readyApp();
    assert.equal(await readValue(ui.choice('intro')), 'on');
    assert.equal(await readValue(ui.choice('next')), 'off');
    await edit('intro');
    assert.equal(await readValue(ui.field('intro', 'start')), '00:30');
    assert.equal(await readValue(ui.field('intro', 'end')), '01:30');
    assert.equal(await readValue(ui.choice('outro')), 'on');
    await edit('outro');
    assert.equal(await readValue(ui.field('outro', 'start')), '02:00');
    assert.equal(await readValue(ui.field('outro', 'end')), '02:10');
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
    await select(ui.scope, 'episode');
    await select(ui.choice('intro'), 'off');
    await save();
    assert.equal(await readValue(ui.choice('intro')), 'off');
    assert.equal(await readValue(ui.choice('outro')), 'inherit');
    assert.equal(await readValue(ui.choice('next')), 'inherit');
    assert.match(await appRead('(' + q(ui.summary('outro')) + ').textContent'), /沿用作品默认/);
  });
  await enter('next');
  const observation = report.nextObservation = {};
  const frameTree = async () => (await client.send('Page.getFrameTree', {}, page.session)).frameTree.frame;
  let arrival, previousLoads, appArrival;
  await check('next-target-arrival', async () => {
    // The saved fixed tail ends before the duration: finish this episode by natural playback.
    await tap(ui.refresh); await readyApp();
    await select(ui.scope, 'series');
    await select(ui.choice('next'), 'on');
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
    assert.equal(await readValue(ui.scope), 'series');
    assert.equal(await readValue(ui.choice('intro')), 'on');
    await select(ui.scope, 'episode');
    assert.equal(await readValue(ui.choice('intro')), 'inherit');
    assert.match(await appRead('(' + q(ui.summary('intro')) + ').textContent'), /沿用作品默认/);
  });
  covered('next');
  await check('return-to-episode-one-for-boundaries', async () => {
    await player('#fixture-autoplay');
    await closePanel();
    await player('a[data-od-episode="1"][data-od-line="primary"]');
    await wait(async () => {const v = await media(); return v?.episode === 1 && v.line === 'primary' && v.paused && v.ready >= 2;});
    await openPanel(); await openApp(); await readyApp();
    await select(ui.scope, 'episode');
    await select(ui.choice('intro'), 'inherit');
    await save();
    await select(ui.scope, 'series');
    await select(ui.choice('next'), 'off');
    await save();
  });
  await enter('boundaries');
  await check('reject-invalid-interval', async () => {
    await zeroTo('intro', 6, 5);
    assert.equal(await appRead('(' + q(ui.save) + ').disabled'), true);
    assert.match(await appRead('document.querySelector("#vas-edit-status").textContent'), /早于|晚于|小于/);
    const invalidEnd = await appRead('(()=>{const e=document.querySelector("#vas-intro-end"),n=document.querySelector("#vas-intro-end-error");' +
      'return !n.hidden&&e.getAttribute("aria-invalid")==="true"&&e.getAttribute("aria-describedby").split(" ").includes(n.id)&&n.textContent;})()');
    assert.match(invalidEnd, /终点必须晚于起点/);
    await set(ui.field('intro', 'end'), 8);
    assert.equal(await appRead('document.querySelector("#vas-intro-end-error").hidden'), true);
    await tap(ui.cancel);
    assert.equal(await readValue(ui.choice('intro')), 'on');
  });
  await check('dirty-draft-does-not-cross-scopes', async () => {
    await zeroTo('intro', 1, 5);
    await select(ui.scope, 'episode', 'series');
    assert.equal(await readValue(ui.scope), 'series');
    await tap(ui.cancel);
    await select(ui.scope, 'episode');
    assert.equal(await readValue(ui.choice('intro')), 'inherit');
    await select(ui.scope, 'series');
    assert.equal(await readValue(ui.choice('intro')), 'on');
  });
  await check('both-timed-ranges-accept-pointer-and-focused-keys', async () => {
    const values = {};
    for (const name of ['intro', 'outro']) {
      if (name === 'intro') await zeroTo(name, 20, 190);
      else await zeroTo(name, 30, 180);
      for (const field of ['start', 'end']) {
        const slider = ui.slider(name, field);
        await dragRange(slider);
        assert.equal(await appRead('document.activeElement?.id'), slider.slice(1));
        const before = Number(await readValue(slider));
        await key(side(), 'ArrowLeft', 37);
        const value = Number(await readValue(slider));
        assert.equal(value, before - 1);
        const label = String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
        assert.equal(await readValue(ui.field(name, field)), label);
        values[name + '.' + field] = value;
      }
    }
    await tap(ui.cancel);
    assert.equal(await readValue(ui.choice('outro')), 'on');
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
    await edit('intro');
    const before = await seek(45);
    await tap(ui.markEnd);
    await feedback(/填入草稿/);
    assert.equal(await readValue(ui.field('intro', 'end')), '00:45');
    const after = await media();
    assert.equal(after.time, before.time);
    assert.equal(after.paused, true);
    await tap(ui.cancel);
    if (!await visible(client, frame(), ui.field('intro', 'end'))) await edit('intro');
    assert.equal(await readValue(ui.field('intro', 'end')), '01:30');
  });
  await check('preview-and-return-preserve-paused', async () => {
    const before = await seek(32);
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
    await edit('outro');
    await select(ui.mode('outro'), 'common');
    await set(ui.field('outro', 'seconds'), 3);
    await select(ui.choice('next'), 'on');
    await save();
    const stillPaused = await media();
    assert.ok(stillPaused.episode === 1 && stillPaused.paused);
    const before = await seek(clips.one - 6);
    await edit('outro');
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
    await select(ui.scope, 'series');
    await edit('outro');
    await select(ui.mode('outro'), 'common');
    await set(ui.field('outro', 'seconds'), 90);
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
    await select(ui.scope, 'series');
    await edit('outro');
    assert.equal(await readValue(ui.mode('outro')), 'common');
    assert.equal(await readValue(ui.field('outro', 'seconds')), '01:30');
    assert.equal(await appRead('(' + q(ui.preview('outro')) + ').disabled'), true);
    assert.equal(await appRead('(' + q(ui.slider('outro', 'seconds')) + ').disabled'), true);
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
    await select(ui.scope, 'series');
    await edit('outro');
    assert.equal(await readValue(ui.field('outro', 'seconds')), '01:30');
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
  await select(ui.scope, 'series');
  await select(ui.choice('outro'), 'off');
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
  }});
  if (values.help) {
    console.log('node projects/video-auto-skip/tests/native.mjs --verify-fixture\n' +
      'Native (leader go-ahead required): --allow-browser --allow-user-scripts --package <candidate.json> [--install-only] [--chrome <CFT155>]\n' +
      'Optional: --mode developer or --mode both; direct debug requires an authorized local Native workspace in the temporary profile.\n' +
      'Optional: --interactive or --segment rules|guards (guards covers long fields and binding/receipt checks).\n' +
      'Optional: --port <fixed loopback port> for a tightly scoped candidate. Node 22+, ffmpeg, ffprobe (fixture-only).');
  } else {
    assert.ok(['developer', 'installed', 'both'].includes(values.mode), 'invalid mode');
    assert.ok(['all', 'rules', 'guards'].includes(values.segment), 'invalid segment');
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
    fixture = await startFixture({directory: temp, port: Number(values.port), signal: abort.signal});
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
