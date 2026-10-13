// Controlled CFT driver for the fixed React/Vue Sidebar Tool packages.
// No browser is launched unless OPENDESK_FIXED_TOOLS_CFT=1 is set.
// Product mutations use visible UI controls plus Chrome's real file input
// binding and trusted Input events. Runtime.evaluate is restricted to
// read-only observation and extension storage reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {launchLocalDevChrome} from './local-dev-cft-launcher.mjs';
import {verifyPackage} from '../../scripts/verify-package.mjs';
import {parse} from 'acorn';
import {
  validateSidebarToolPackage,
  serializeSidebarToolPackage,
  sidebarToolStorageKey,
  SIDEBAR_TOOL_STORE
} from '../../src/ui/sidebar-tools/package.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = 'page-import-fixed-tools-20261012';
const defaultCandidate = path.join(repo,
  '.runtime/tests/page-import-persistence-01a130cc-09d5/candidate/dist/production');
const defaultEvidence = path.join(repo, 'docs/framework/workstreams/evidence/page-import-fixed-tools-20261012');
const defaultChrome = path.join(repo,
  'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const fixedPackages = [
  {
    label: 'react-starter',
    expectedId: 'react-notes-starter',
    expectedVersion: '1.1.0',
    path: path.join(repo, 'evidence/page-import-fixed-tools-20261012/packages/react-starter.opendesk-tool.json'),
    expectedSha256: 'b0055adc6cfd45fc84d8441c9937fe1f8b06a7af2353bad85a5d2be7563ae173',
    visibleText: 'React 笔记'
  },
  {
    label: 'vue-starter',
    expectedId: 'vue-notes-starter',
    expectedVersion: '1.0.0',
    path: path.join(repo, 'evidence/page-import-fixed-tools-20261012/packages/vue-starter.opendesk-tool.json'),
    expectedSha256: 'cf34093674c692fcd732873b781f411eef67ffc3eeffb6c3c9b5cb005e3d977f',
    visibleText: 'Vue 笔记'
  }
];

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Optional probes bind the submitted bytes before launch, never a historical PASS.
function requestedPackages() {
  const options = [
    {env: 'OPENDESK_IMPORT_MAX_TOOL_PACKAGE', label: 'import-max-probe',
      expectedId: 'import-max-probe', expectedVersion: '1.0.0', expectedCapabilities: [],
      expectedFormat: 'opendesk.sidebar-tool.v1', result: 'Tool D3 max = 5'},
    {env: 'OPENDESK_IMPORT_CLASSIC_TOOL_PACKAGE', label: 'import-classic-probe',
      expectedId: 'import-classic-probe', expectedVersion: '1.0.0', expectedCapabilities: [],
      expectedFormat: 'opendesk.sidebar-tool.v2', result: 'Tool Classic mitt = 5',
      order: 'order = mitt>second>main; emits = 1'}
  ].filter(spec => process.env[spec.env]).map(spec => {
    const file = fs.realpathSync(path.resolve(process.env[spec.env]));
    return {...spec, probe: true, path: file, expectedSha256: sha256(fs.readFileSync(file))};
  });
  return options.length ? options : fixedPackages;
}

function inspectProbeCode(tool, spec) {
  assert.equal(tool.format, spec.expectedFormat);
  if (spec.order) assert.equal(tool.scripts?.length, 2, 'S10 has two fixed Classic assets');
  for (const asset of tool.scripts || []) {
    assert.equal(sha256(Buffer.from(asset.code, 'utf8')), asset.sha256, 'Actual fixed asset SHA ' + asset.name);
  }
  for (const code of [...(tool.scripts || []).map(asset => asset.code), tool.js]) {
    parse(code, {ecmaVersion: 'latest', sourceType: 'script'});
    assert(!/\b(?:import|fetch|importScripts|XMLHttpRequest|WebSocket)\s*\(/.test(code),
      spec.label + ' has no runtime network/import call');
  }
}
const packageHash = tool => sha256(Buffer.from(serializeSidebarToolPackage(tool), 'utf8'));
const json = value => JSON.stringify(value);
const node = selector => 'document.querySelector(' + json(selector) + ')';
const action = (id, name) =>
  '#sidebar-tool-list button[data-sidebar-tool-id="' + id + '"][data-sidebar-tool-action="' + name + '"]';

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function readPackage(spec) {
  const real = fs.realpathSync(spec.path);
  const bytes = fs.readFileSync(real);
  const parsed = validateSidebarToolPackage(JSON.parse(bytes));
  assert.equal(sha256(bytes), spec.expectedSha256, spec.label + ' package file hash');
  assert.equal(parsed.id, spec.expectedId, spec.label + ' tool id');
  assert.equal(parsed.version, spec.expectedVersion, spec.label + ' tool version');
  assert.deepEqual(parsed.capabilities, spec.expectedCapabilities || ['storage.local'], spec.label + ' capabilities');
  if (spec.probe) inspectProbeCode(parsed, spec);
  assert.equal(packageHash(parsed), spec.expectedSha256, spec.label + ' serialized package hash');
  return {spec, real, bytes: bytes.length, sha256: spec.expectedSha256, package: parsed};
}

function candidatePath() {
  const source = process.env.OPENDESK_FIXED_TOOLS_CANDIDATE_DIST ? 'env' : 'default-main-agent';
  const requested = process.env.OPENDESK_FIXED_TOOLS_CANDIDATE_DIST || defaultCandidate;
  const real = fs.realpathSync(path.resolve(requested));
  assert(fs.existsSync(path.join(real, 'manifest.json')), 'candidate manifest must exist');
  assert(['production', 'production-developer'].includes(path.basename(real)),
    'candidate must resolve to production or production-developer');
  return {real, source, requested};
}

async function connectBrowser(uri, append, label = 'browser') {
  const WebSocketImpl = globalThis.WebSocket ?? (await import('ws')).WebSocket;
  const socket = new WebSocketImpl(uri);
  const pending = new Map();
  const handlers = new Map();
  let serial = 0;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('CDP connect timeout: ' + label)), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once: true});
    socket.addEventListener('error', error => { clearTimeout(timer); reject(error); }, {once: true});
  });
  socket.addEventListener('message', event => {
    const row = JSON.parse(String(event.data));
    append('raw-cdp.jsonl', {at: new Date().toISOString(), label, direction: 'received', row});
    if (row.id) {
      const job = pending.get(row.id);
      if (!job) return;
      pending.delete(row.id);
      clearTimeout(job.timer);
      if (row.error) job.reject(Object.assign(Error(row.error.message), {code: row.error.code, cdp: row.error}));
      else job.resolve(row.result);
    } else {
      for (const handler of handlers.get(row.method) || []) handler(row.params, row);
    }
  });
  const rejectAll = () => {
    for (const job of pending.values()) {
      clearTimeout(job.timer);
      job.reject(Error('CDP closed: ' + label));
    }
    pending.clear();
  };
  socket.addEventListener('close', rejectAll);
  socket.addEventListener('error', rejectAll);
  const send = (method, params = {}, timeout = 20000, sessionId = null) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error('CDP timeout: ' + method));
    }, timeout);
    pending.set(id, {resolve, reject, timer});
    const row = {id, method, params, ...(sessionId ? {sessionId} : {})};
    append('raw-cdp.jsonl', {at: new Date().toISOString(), label, direction: 'sent', row});
    socket.send(JSON.stringify(row));
  });
  return {
    send,
    on(method, handler) {
      const list = handlers.get(method) || [];
      list.push(handler);
      handlers.set(method, list);
      return () => handlers.set(method, list.filter(item => item !== handler));
    },
    close() { socket.close(); }
  };
}

async function attach(browser, targetId, label) {
  const {sessionId} = await browser.send('Target.attachToTarget', {targetId, flatten: true});
  const target = {
    targetId,
    sessionId,
    label,
    send: (method, params = {}, timeout = 20000) => browser.send(method, params, timeout, sessionId)
  };
  await target.send('Runtime.enable');
  await target.send('Page.enable').catch(() => {});
  return target;
}

async function evaluate(target, expression) {
  const result = await target.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

async function until(fn, label, timeout = 20000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(100);
  }
  throw Error(label + ' timed out' + (last ? ': ' + last.message : ''));
}

async function clickReal(target, selector) {
  const point = await until(async()=>{
    const row=await evaluate(target,'(()=>{const el='+node(selector)+';if(!el||el.disabled||el.hidden)return null;const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,visible:r.width>0&&r.height>0&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&!!hit&&el.contains(hit),height:innerHeight};})()');
    if(!row)return null;if(row.visible)return row;
    await target.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:4,y:row.height/2,deltaX:0,deltaY:Math.max(-600,Math.min(600,row.y-row.height/2))});return null;
  }, 'visible real click target ' + selector);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await target.send('Input.dispatchMouseEvent', {type, x: point.x, y: point.y, button: 'left', clickCount: 1});
  }
}

async function inputText(target, selector, text) {
  await clickReal(target, selector);
  for (const type of ['keyDown', 'keyUp']) {
    await target.send('Input.dispatchKeyEvent', {
      type,
      key: 'a',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      modifiers: 2,
      commands: type === 'keyDown' ? ['selectAll'] : undefined
    });
  }
  await target.send('Input.insertText', {text});
}

async function setRealFileInput(target, file) {
  await clickReal(target, '#sidebar-tool-import-trigger');
  await target.send('DOM.enable');
  const document = await target.send('DOM.getDocument', {depth: 1});
  const {nodeId} = await target.send('DOM.querySelector', {
    nodeId: document.root.nodeId,
    selector: '#sidebar-tool-file'
  });
  assert(nodeId, 'real Sidebar Tool file input exists');
  await target.send('DOM.setFileInputFiles', {nodeId, files: [file]});
}

async function readStore(target, key) {
  return evaluate(target,
    'chrome.storage.local.get(' + json(key) + ').then(row=>row[' + json(key) + '])');
}

async function installedRows(target) {
  return (await readStore(target, SIDEBAR_TOOL_STORE)) || [];
}

async function openTool(browser, side, id, ready = '!!document.querySelector("textarea#note")') {
  await clickReal(side, action(id, 'open'));
  const frameInfo = await until(async () => {
    const rows = (await browser.send('Target.getTargets')).targetInfos;
    return rows.find(row => row.type === 'iframe' && row.url?.includes('/sidebar-tools/sandbox.html'));
  }, 'sandbox iframe for ' + id);
  const frame = await attach(browser, frameInfo.targetId, 'tool-' + id);
  await until(() => evaluate(frame, 'document.readyState==="complete"&&(' + ready + ')'),
    'tool content ready ' + id);
  return frame;
}

async function importPackage(side, spec, onPhase) {
  await onPhase?.('before-import');
  await setRealFileInput(side, spec.real);
  await until(() => evaluate(side, '!document.querySelector("#sidebar-tool-preview").hidden'),
    spec.spec.label + ' preview visible');
  const review = await evaluate(side, 'document.querySelector("#sidebar-tool-preview").textContent');
  assert(review.includes(spec.package.title), spec.spec.label + ' review includes title');
  assert(review.includes('v' + spec.package.version), spec.spec.label + ' review includes version');
  if (spec.package.capabilities.includes('storage.local')) {
    assert(review.includes('保存此工具的数据'), spec.spec.label + ' review explains storage.local capability');
  }
  await onPhase?.('review-before-install');
  await clickReal(side, '#sidebar-tool-install');
  await until(async () => (await installedRows(side)).some(row =>
    row.id === spec.package.id && row.version === spec.package.version),
  spec.spec.label + ' installed through review button');
  await onPhase?.('installed-before-open');
  return review;
}

async function assertNoToolFrames(browser, side, label) {
  await until(async () => {
    const dom = await evaluate(side, 'document.querySelectorAll("#sidebar-tool-frame iframe").length');
    const targets = (await browser.send('Target.getTargets')).targetInfos;
    return dom === 0 && !targets.some(row => row.type === 'iframe' && row.url?.includes('/sidebar-tools/sandbox.html'));
  }, label + ' no DOM or sandbox target residue');
}

// Observe newly attached iframe sessions before their scripts can run. Only the
// tool Side Panel's child sessions are watched, excluding browser startup traffic.
async function watchProbeNetwork(browser, side) {
  const attachedTargets = new Set(), requests = [], errors = [], jobs = [], sessions = new Set();
  const offAttached = browser.on('Target.attachedToTarget', (event, envelope) => {
    if (envelope.sessionId !== side.sessionId) return;
    const job = (async () => {
      if (event.targetInfo.type === 'iframe') {
        sessions.add(event.sessionId);
        attachedTargets.add(event.targetInfo.targetId);
        await browser.send('Network.enable', {}, 20000, event.sessionId);
      }
      await browser.send('Runtime.runIfWaitingForDebugger', {}, 20000, event.sessionId);
    })().catch(error => errors.push(error.message));
    jobs.push(job);
  });
  const offRequest = browser.on('Network.requestWillBeSent', (event, envelope) => {
    if (sessions.has(envelope.sessionId)) requests.push({sessionId: envelope.sessionId,
      url: event.request.url, type: event.type, initiator: event.initiator});
  });
  await side.send('Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: true, flatten: true});
  return {
    requests, attachedTargets,
    async finish() {
      await Promise.all(jobs);
      assert.deepEqual(errors, [], 'pre-execution network observer attached successfully');
      assert(attachedTargets.size > 0, 'observer saw sandbox sessions before execution');
      assert(!requests.some(row => /^(?:https?|wss?):/i.test(row.url)), 'probe runtime made no network imports/requests');
    },
    async stop() {
      await side.send('Target.setAutoAttach', {autoAttach: false, waitForDebuggerOnStart: false, flatten: true});
      offAttached(); offRequest();
    }
  };
}

async function exerciseProbe(browser, side, spec, write) {
  const observation = '({result:document.querySelector("#import-result")?.textContent,' +
    'environment:document.querySelector("#import-environment")?.textContent,' +
    'executions:document.querySelector("#import-executions")?.textContent,' +
    'order:document.querySelector("#import-order")?.textContent,' +
    'origin:globalThis.origin,chromeTabs:typeof globalThis.chrome?.tabs,page:typeof page,' +
    'url:location.href})';
  const screenshot = async phase => {
    const shot = await side.send('Page.captureScreenshot', {format: 'png'});
    write(spec.spec.label + '-' + phase + '.png', Buffer.from(shot.data, 'base64'));
  };
  const network = await watchProbeNetwork(browser, side);
  try {
    const review = await importPackage(side, spec, async phase => {
      await assertNoToolFrames(browser, side, spec.spec.label + ' ' + phase);
      assert.equal(network.attachedTargets.size, 0, 'import/review/install never attached a transient tool iframe');
      write(spec.spec.label + '-' + phase + '.json', {iframeCount: 0, packageSha256: spec.sha256});
      await screenshot(phase);
    });
    const row = (await installedRows(side)).find(item => item.id === spec.package.id);
    assert.equal(packageHash(row), spec.sha256, 'installed probe matches the submitted bytes');
    const frames = [], observations = [];
    for (const phase of ['open', 'reopen']) {
      const frame = await openTool(browser, side, spec.package.id,
        'document.querySelector("#import-result")?.textContent===' + json(spec.spec.result));
      assert(!frames.includes(frame.targetId), 'reopen creates a fresh sandbox target');
      assert(network.attachedTargets.has(frame.targetId), 'network watch armed before this frame executed');
      frames.push(frame.targetId);
      const seen = await evaluate(frame, observation);
      assert.equal(seen.result, spec.spec.result);
      assert.equal(seen.origin, 'null', 'actual effective iframe origin is opaque');
      assert.equal(seen.chromeTabs, 'undefined', 'no chrome.tabs in tool world');
      assert.equal(seen.page, 'undefined', 'no Controller page in tool world');
      assert(seen.environment.includes('typeof chrome.tabs = undefined'));
      assert(seen.environment.includes('typeof page = undefined'));
      assert.equal(seen.executions, 'Executions in this iframe = 1');
      if (spec.spec.order) assert.equal(seen.order, spec.spec.order);
      const hostFrame = await evaluate(side, '(()=>{const el=document.querySelector("#sidebar-tool-frame iframe");return {count:document.querySelectorAll("#sidebar-tool-frame iframe").length,src:el?.src,sandbox:el?.getAttribute("sandbox")};})()');
      assert.equal(hostFrame.count, 1);
      assert(hostFrame.src.endsWith('/sidebar-tools/sandbox.html'));
      observations.push({phase, targetId: frame.targetId, sessionId: frame.sessionId, hostFrame, seen});
      await clickReal(frame, 'summary');
      write(spec.spec.label + '-' + phase + '.json', observations.at(-1));
      await screenshot(phase);
      if (phase === 'open') {
        await clickReal(side, '#sidebar-tool-back');
        await assertNoToolFrames(browser, side, spec.spec.label + ' close');
        await screenshot('closed');
      }
    }
    // Uninstall the live reopened frame using the existing trusted review UI.
    await clickReal(side, '#sidebar-tool-remove');
    await until(() => evaluate(side, '!document.querySelector("#sidebar-tool-inline-remove").hidden'), 'uninstall review');
    await screenshot('uninstall-review');
    await clickReal(side, '#sidebar-tool-inline-remove-confirm');
    await until(async () => !(await installedRows(side)).some(item => item.id === spec.package.id), 'probe removed');
    await assertNoToolFrames(browser, side, spec.spec.label + ' uninstall');
    await screenshot('uninstalled');
    await network.finish();
    assert.equal(sha256(fs.readFileSync(spec.real)), spec.sha256, 'input package remained unchanged during CFT');
    const result = {label: spec.spec.label, id: spec.package.id, packageSha256: spec.sha256,
      installedDataPackageSha256: packageHash(row), capabilities: spec.package.capabilities,
      review, observations, networkRequests: network.requests, removed: true,
      negativeNative: 'NOT_TESTED', scope: 'positive real import/install/open/close/reopen/uninstall only'};
    write(spec.spec.label + '-lifecycle.json', result);
    return result;
  } finally {
    write(spec.spec.label + '-runtime-network.json', network.requests);
    await network.stop();
  }
}

async function saveAndReopen(browser, side, spec, note, write) {
  let frame = await openTool(browser, side, spec.package.id);
  assert((await evaluate(frame, 'document.body.textContent')).includes(spec.spec.visibleText),
    spec.spec.label + ' visible heading');
  await inputText(frame, 'textarea#note', note);
  write(spec.spec.label+'-before-save.json',await evaluate(frame,'({value:document.querySelector("textarea#note").value,active:document.activeElement?.outerHTML,status:document.querySelector("[role=status]")?.textContent,body:document.body.textContent})'));
  assert.equal(await evaluate(frame,'document.querySelector("textarea#note").value'),note,spec.spec.label+' trusted text input reached textarea');
  await clickReal(frame, 'button');
  try{await until(() => evaluate(frame,
    'document.querySelector("#tool-root [role=status]")?.textContent.includes("已保存")&&!document.querySelector("textarea#note").disabled'),
  spec.spec.label + ' save completed');}catch(error){
    write(spec.spec.label+'-save-error.json',await evaluate(frame,'({value:document.querySelector("textarea#note").value,active:document.activeElement?.outerHTML,status:document.querySelector("[role=status]")?.textContent,body:document.body.textContent})'));
    const shot=await side.send('Page.captureScreenshot',{format:'png'});write(spec.spec.label+'-save-error.png',Buffer.from(shot.data,'base64'));throw error;
  }
  const dataKey = sidebarToolStorageKey(spec.package.id);
  await until(async () => JSON.stringify(await readStore(side, dataKey)).includes(note),
    spec.spec.label + ' storage write observed');
  const saved = await readStore(side, dataKey);
  await clickReal(side, '#sidebar-tool-back');
  await until(()=>evaluate(side,'document.querySelectorAll("#sidebar-tool-frame iframe").length===0||!document.querySelector("#sidebar-tool-action-review").hidden'),spec.spec.label+' close or explicit leave review');
  if(await evaluate(side,'document.querySelectorAll("#sidebar-tool-frame iframe").length>0')){
    const message=await evaluate(side,'document.querySelector("#sidebar-tool-action-review").textContent');
    assert(message.includes('未保存'),spec.spec.label+' expected leave confirmation');
    write(spec.spec.label+'-leave-review.json',{message,savedNoteConfirmed:JSON.stringify(saved).includes(note)});
    await clickReal(side,'#sidebar-tool-action-continue');
  }
  await until(() => evaluate(side, 'document.querySelectorAll("#sidebar-tool-frame iframe").length===0'),
    spec.spec.label + ' iframe closed');
  frame = await openTool(browser, side, spec.package.id);
  await until(() => evaluate(frame, 'document.querySelector("textarea#note").value===' + json(note)),
    spec.spec.label + ' note persisted after reopen');
  await clickReal(side, '#sidebar-tool-back');
  return saved;
}

async function runCft() {
  assert.equal(process.platform, 'darwin', 'This driver uses the macOS controlled CFT launcher');
  const candidate = candidatePath();
  const evidenceRoot = path.resolve(process.env.OPENDESK_FIXED_TOOLS_EVIDENCE_DIR || defaultEvidence);
  const output = path.join(evidenceRoot, 'cft-' + nowStamp());
  fs.mkdirSync(output, {recursive: true});
  const append = (name, row) => fs.appendFileSync(path.join(output, name), JSON.stringify(row) + '\n');
  const write = (name, value) => fs.writeFileSync(path.join(output, name),
    Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n');
  const packageSpecs = requestedPackages().map(readPackage);
  const binary = fs.realpathSync(path.resolve(process.env.OPENDESK_FIXED_TOOLS_CHROME_BIN || defaultChrome));
  const manifest = JSON.parse(fs.readFileSync(path.join(candidate.real, 'manifest.json'), 'utf8'));
  const report = {
    workflow,
    status: 'IN_PROGRESS',
    startedAt: new Date().toISOString(),
    candidateDist: candidate.real,
    candidateSource: candidate.source,
    candidateRequestedPath: candidate.requested,
    candidatePackage: await verifyPackage(candidate.real, {mode: 'production'}),
    manifest: {name: manifest.name, version: manifest.version, manifest_version: manifest.manifest_version},
    browserBinary: binary,
    nativeHostConfiguredByDriver: false,
    dailyChromeTouched: false,
    packages: packageSpecs.map(item => ({
      label: item.spec.label,
      path: item.real,
      id: item.package.id,
      version: item.package.version,
      bytes: item.bytes,
      sha256: item.sha256
    })),
    phases: []
  };
  write('driver-source.mjs', fs.readFileSync(fileURLToPath(import.meta.url)));
  write('run-input.json', report);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesk-fixed-tools-cft-profile-'));
  const launched = await launchLocalDevChrome({
    root: repo,
    out: output,
    binary,
    profile,
    argv: [
      '--remote-debugging-port=0',
      '--use-mock-keychain',
      '--password-store=basic',
      '--no-first-run',
      '--disable-extensions-except=' + candidate.real,
      '--load-extension=' + candidate.real
    ]
  });
  report.launch = launched.launch;
  const port = Number(launched.lines[0]);
  const browser = await connectBrowser('ws://127.0.0.1:' + port + launched.lines[1], append);
  try {
    report.phases.push('find-extension');
    const sw = await until(async () => {
      const rows = (await browser.send('Target.getTargets')).targetInfos;
      return rows.find(row => row.type === 'service_worker' && row.url?.startsWith('chrome-extension://') &&
        row.url.endsWith('/' + manifest.background.service_worker));
    }, 'extension service worker');
    const extensionId = new URL(sw.url).host;
    report.extensionId = extensionId;

    report.phases.push('open-side-panel');
    const catalogUrl = 'chrome-extension://' + extensionId + '/ui/tool.html';
    const {targetId: catalogTargetId} = await browser.send('Target.createTarget', {url: catalogUrl});
    const catalog = await attach(browser, catalogTargetId, 'catalog');
    await until(() => evaluate(catalog, 'document.readyState==="complete"&&!!document.querySelector("#catalog-open-dev-sidebar")'),
      'catalog open side panel control');
    await clickReal(catalog, '#catalog-open-dev-sidebar');
    const sideInfo = await until(async () => {
      const rows = (await browser.send('Target.getTargets')).targetInfos;
      return rows.find(row => row.targetId !== catalogTargetId && row.url?.startsWith('chrome-extension://' + extensionId + '/ui/tool.html?hostInstanceId='));
    }, 'real side panel target');
    const side = await attach(browser, sideInfo.targetId, 'side-panel');
    const sideContext = await until(() => evaluate(side,
      'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"],documentUrls:[location.href]}).then(rows=>rows[0]||null)'),
    'SIDE_PANEL context identity');
    report.sidePanel = {targetId: sideInfo.targetId, documentUrl: sideInfo.url, context: sideContext};
    await clickReal(side, '#tab-tools');
    await until(() => evaluate(side, '!document.querySelector("#workbench-tools").hidden'),
      'tools tab visible');

    report.phases.push(packageSpecs.some(item => item.spec.probe)
      ? 'import-install-open-close-reopen-uninstall-probes'
      : 'import-install-open-save-reopen');
    report.installed = [];
    for (const spec of packageSpecs) {
      if (spec.spec.probe) {
        report.installed.push(await exerciseProbe(browser, side, spec, write));
        continue;
      }
      const review = await importPackage(side, spec);
      write(spec.spec.label+'-review.json',{visibleReview:review,capabilities:spec.package.capabilities});
      const registry = await installedRows(side);
      const row = registry.find(item => item.id === spec.package.id);
      assert(row, spec.spec.label + ' registry row');
      const installedHash = packageHash(row);
      assert.equal(installedHash, spec.sha256, spec.spec.label + ' installed data package hash');
      const note = spec.spec.label + ' fixed package CFT note ' + randomUUID();
      const saved = await saveAndReopen(browser, side, spec, note, write);
      report.installed.push({
        label: spec.spec.label,
        id: spec.package.id,
        version: spec.package.version,
        packageSha256: spec.sha256,
        installedDataPackageSha256: installedHash,
        storageKey: sidebarToolStorageKey(spec.package.id),
        savedNote: note,
        savedStore: saved
      });
    }

    report.finalRegistry = await installedRows(side);
    report.candidateAfter=await verifyPackage(candidate.real, {mode: 'production'});
    assert.equal(report.candidateAfter.packageHash,report.candidatePackage.packageHash,'Exact candidate remained unchanged');
    report.status = 'PASS';
    report.completedAt = new Date().toISOString();
    write('native-result.json', report);
  } catch (error) {
    report.status = 'FAIL';
    report.error = {message: error.message, stack: error.stack, code: error.code ?? null};
    report.completedAt = new Date().toISOString();
    write('native-result.json', report);
    throw error;
  } finally {
    browser.close();
    try {
      const cleanup = await launched.chrome.cleanup?.();
      if (cleanup) write('chrome-cleanup.json', cleanup);
    } catch (error) {
      write('chrome-cleanup-error.json', {message: error.message, stack: error.stack});
    }
  }
}

test('fixed React/Vue sidebar tools controlled import/install driver', {
  timeout: 720000,
  skip: process.env.OPENDESK_FIXED_TOOLS_CFT === '1'
    ? false
    : 'Set OPENDESK_FIXED_TOOLS_CFT=1 to launch CFT; OPENDESK_FIXED_TOOLS_CANDIDATE_DIST may override the coordinator candidate'
}, runCft);

test('fixed tools driver schema and package binding', {
  skip: Boolean(process.env.OPENDESK_IMPORT_MAX_TOOL_PACKAGE || process.env.OPENDESK_IMPORT_CLASSIC_TOOL_PACKAGE)
    && 'Optional probe run does not require historical React/Vue package files'
}, () => {
  const packages = fixedPackages.map(readPackage);
  assert.deepEqual(packages.map(item => item.package.id), ['react-notes-starter', 'vue-notes-starter']);
  assert.equal(path.resolve(defaultCandidate),
    path.join(repo, '.runtime/tests/page-import-persistence-01a130cc-09d5/candidate/dist/production'));
});

test('optional import probes bind current package bytes without launching Chrome', () => {
  const requested = requestedPackages();
  if (!requested.some(spec => spec.probe)) {
    assert.deepEqual(requested, fixedPackages);
    return;
  }
  for (const item of requested.map(readPackage)) {
    assert.equal(item.sha256, sha256(fs.readFileSync(item.real)));
    assert.deepEqual(item.package.capabilities, []);
    assert(item.package.html.includes('id="import-result"'));
  }
});

test('probe network observer enables observation before resuming each iframe', async () => {
  const handlers = new Map(), commands = [];
  const browser = {
    on(method, handler) {handlers.set(method, handler); return () => handlers.delete(method);},
    async send(method, params, timeout, sessionId) {commands.push({method, sessionId});}
  };
  const side = {sessionId: 'side', send: async () => {}};
  const watch = await watchProbeNetwork(browser, side);
  handlers.get('Target.attachedToTarget')({sessionId: 'child',
    targetInfo: {type: 'iframe', targetId: 'frame'}}, {sessionId: 'side'});
  await watch.finish();
  assert.deepEqual(commands.map(row => row.method), ['Network.enable', 'Runtime.runIfWaitingForDebugger']);
  assert(watch.attachedTargets.has('frame'));
  // Events outside the observed child session do not contaminate tool evidence.
  handlers.get('Network.requestWillBeSent')({request: {url: 'https://unrelated.invalid/'}}, {sessionId: 'other'});
  await watch.finish();
  handlers.get('Network.requestWillBeSent')({request: {url: 'https://runtime-import.invalid/'}}, {sessionId: 'child'});
  await assert.rejects(watch.finish(), /no network imports/);
  await watch.stop();
  assert.equal(handlers.size, 0);
});
