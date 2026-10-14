// Bounded real CFT/UI driver. The leader executes this against an immutable
// candidate; importing it runs the driver. No build, Git or Native setup.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocket} from 'ws';
import vm from 'node:vm';
import {compileStaticESM} from '../../src/ui/static-esm-linker.mjs';
import {PAGE_BROWSER_COMPILER} from '../../src/libs/page-frameworks/contract.js';
const babelContext=vm.createContext({TextEncoder,TextDecoder});
vm.runInContext(fs.readFileSync(PAGE_BROWSER_COMPILER.source,'utf8'),babelContext,{timeout:5000});
const Babel=babelContext.Babel;
import {DEFAULT_MACOS_LAUNCHER, launchLocalDevChrome} from './local-dev-cft-launcher.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidate = path.join(root, '.runtime/tests/static-import-drafts-20261012/candidate/dist/production');
const defaultBinary = path.join(root, 'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const requireURL = 'https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/max.js';
const leafESMSource = url => `import max from '${url}';\nasync function main(){return {value:max([1,9,3]),title:document.title};}\n`;
let expectedBuiltSource, reviewedModuleCode;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const errorRecord = error => ({code:error.code || 'E_NETWORK_BROWSER_DRIVER', message:error.message, stack:error.stack});
const widthsOnly=process.env.OPENDESK_NETWORK_WIDTHS_ONLY==='1';
const controllerOnly=process.env.OPENDESK_STATIC_DRAFT_CONTROLLER_ONLY==='1';
const cases = [
  'real-catalog-sidebar-and-userScripts-optin', 'missing-lock-blocks-before-prepare',
  'live-prepare-and-read-cached-source-no-page-run', 'review-css-width-320', 'review-css-width-420',
  'explicit-consent-approval-no-page-run', 'explicit-leaf-esm-page-run',
  'fixed-cache-rerun-no-cdn-fetch', 'changed-require-refuses-old-lock',
  'http-import-refused-without-fetch', 'invalid-https-esm-refused-without-fetch',
  'controller-world-separate-approval-and-real-run',

];

async function until(fn, label, timeout = 20000) {
  const end = Date.now() + timeout;let lastNavigation;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch(error) {
      // Retrying a read during creation/navigation is not replaying a click,
      // approval or script. Keep every raw failure in the CDP evidence.
      if(error.code!==-32000||!/Inspected target navigated|Cannot find context/.test(error.message))throw error;
      lastNavigation=error.message;
    }
    await pause(100);
  }
  throw new Error(label + ' timed out'+(lastNavigation?': '+lastNavigation:''));
}

// Same artifact fingerprint recipe as scripts/verify-package.mjs, without
// importing its executable verifier or modifying the package.
function fingerprint(directory) {
  const paths = [];
  const walk = prefix => {
    for (const entry of fs.readdirSync(path.join(directory, prefix), {withFileTypes:true})) {
      const name = prefix ? prefix + '/' + entry.name : entry.name;
      assert(!entry.isSymbolicLink(), 'No package symlink: ' + name);
      if (entry.isDirectory()) walk(name);
      else { assert(entry.isFile(), 'Regular package file: ' + name); paths.push(name); }
    }
  };
  walk('');
  const files = paths.sort().map(name => {
    const bytes = fs.readFileSync(path.join(directory, name));
    return {path:name, bytes:bytes.length, sha256:hash(bytes)};
  });
  return {packageHash:hash(JSON.stringify(files)), files,
    hashRecipe:'SHA256 UTF-8 JSON.stringify(path-sorted [{path,bytes,sha256}]); exact file bytes'};
}

async function connect(uri, label, append) {
  const socket = new WebSocket(uri), pending = new Map(), handlers = new Map();
  let serial = 0;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.terminate(); reject(Error('CDP connect timed out: ' + label)); }, 10000);
    socket.once('open', () => { clearTimeout(timer); resolve(); });
    socket.once('error', error => { clearTimeout(timer); reject(error); });
  });
  socket.on('message', bytes => {
    const row = JSON.parse(String(bytes));
    append('raw-cdp.jsonl', {at:new Date().toISOString(), target:label, direction:'received', row});
    if (row.id) {
      const task = pending.get(row.id);
      if (!task) return;
      pending.delete(row.id); clearTimeout(task.timer);
      if (row.error) task.reject(Object.assign(Error(row.error.message), {code:row.error.code}));
      else task.resolve(row.result);
    } else for (const handler of handlers.get(row.method) || []) handler(row.params);
  });
  const closed = () => {
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(Error('CDP closed: ' + label)); }
    pending.clear();
  };
  socket.on('close', closed); socket.on('error', closed);
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timed out: ' + method)); }, 20000);
    pending.set(id, {resolve, reject, timer});
    append('raw-cdp.jsonl', {at:new Date().toISOString(), target:label, direction:'sent', id, method, params});
    try { socket.send(JSON.stringify({id, method, params})); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
  return {
    call,
    // All call sites below observe DOM only. No Chrome APIs, storage,
    // website executor, focus/select/scroll mutations or synthetic events.
    async read(expression) {
      const value = await call('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:false, throwOnSideEffect:true});
      if (value.exceptionDetails) throw Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text || 'DOM observation failed');
      return value.result?.value;
    },
    on(method, handler) {
      const list = handlers.get(method) || []; list.push(handler); handlers.set(method, list);
    },
    get open() { return socket.readyState === WebSocket.OPEN; },
    close() { socket.close(); }
  };
}

// Adapted from r243 real Input helpers. Scrolling/focus/selection are also
// trusted Input commands; Runtime remains read-only.
async function clickReal(session, expression) {
  for (let scroll = 0; scroll < 10; scroll++) {
    const box = await session.read('(()=>{const e=(' + expression + ');if(!e||e.disabled||e.hidden)return null;' +
      'const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight}})()');
    assert(box?.w > 0 && box.h > 0, 'Visible enabled real control: ' + expression);
    const footerClearance=expression.includes('#script-run')?8:132;
    const headerClearance=expression.includes('#tab-develop')?8:64;
    if (box.y >= headerClearance && box.y < box.vh - footerClearance && box.x >= 0 && box.x < box.vw) {
      for (const type of ['mousePressed', 'mouseReleased'])
        await session.call('Input.dispatchMouseEvent', {type, x:box.x, y:box.y, button:'left', clickCount:1});
      return;
    }
    await session.call('Input.dispatchMouseEvent', {type:'mouseWheel', x:box.vw - 6, y:box.vh / 2,
      deltaX:0, deltaY:Math.max(-600, Math.min(600, box.y - box.vh / 2))});
    await pause(120);
  }
  throw Error('Real control could not be scrolled into view: ' + expression);
}
const node = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
const text = selector => node(selector) + '?.textContent';

async function main() {
  assert.equal(process.platform, 'darwin', 'This bounded driver uses the original macOS isolated launcher');
  assert(process.env.OPENDESK_NETWORK_PACKAGE, 'OPENDESK_NETWORK_PACKAGE is required');
  const packageRoot = fs.realpathSync(path.resolve(process.env.OPENDESK_NETWORK_PACKAGE));
  const approvedCandidate=widthsOnly?path.join(root,'.runtime/tests/static-import-drafts-20261012/candidate-ui/dist/production'):candidate;
  assert.equal(packageRoot, fs.realpathSync(approvedCandidate), 'Use only the scoped leader immutable candidate, never daily dist');
  assert(!process.env.OPENDESK_DEV_CFT_LAUNCHER || process.env.OPENDESK_DEV_CFT_LAUNCHER === DEFAULT_MACOS_LAUNCHER,
    'Original isolated launcher only');
  assert.notEqual(process.env.OPENDESK_DEV_CHROME_RESTART, '1', 'No browser restart campaign');
  assert(process.env.OPENDESK_DEV_EVIDENCE, 'OPENDESK_DEV_EVIDENCE must name a new evidence directory');
  const output = path.resolve(process.env.OPENDESK_DEV_EVIDENCE);
  assert(output.startsWith(root + path.sep), 'Evidence stays in this repository');
  assert(!output.startsWith(path.join(root, '.runtime/tests/static-import-drafts-20261012/candidate') + path.sep),
    'Evidence cannot write inside candidate inputs');
  assert(!output.startsWith(path.join(root, '.runtime/tests/static-import-drafts-20261012/candidate-ui') + path.sep),
    'Evidence cannot write inside candidate CSS inputs');
  assert(!fs.existsSync(output), 'Preserve earlier evidence; choose an absent evidence directory');
  fs.mkdirSync(path.dirname(output), {recursive:true}); fs.mkdirSync(output);
  const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
  const append = (name, value) => fs.appendFileSync(path.join(output, name), JSON.stringify(value) + '\n');
  const retain = (name, bytes) => { fs.writeFileSync(path.join(output, name), bytes, {flag:'wx'}); return {path:name, sha256:hash(bytes), bytes:Buffer.byteLength(bytes)}; };
  const report = {status:'IN_PROGRESS', startedAt:new Date().toISOString(), scope:'bounded-real-static-import-drafts',
    packageRoot, output, sourceHead:process.env.GITHUB_SHA || null, sourceHeadAuthority:'caller supplied, no Git command',
    tests:cases.map(name => ({name, status:'NOT_TESTED'})),
    limitations:[
      {name:'cache-corruption-and-cache-missing', status:'NOT_TESTED', reason:'Browser storage writes prohibited; component evidence belongs to leader'},
      {name:'Native/MCP/React/Vue/installation/campaign/F3/ZIP', status:'NOT_TESTED'},
      {name:'Controller-native-effects-and-Stop', status:'NOT_TESTED', reason:'Controller check only computes and observes controlled lexical bindings'},
      {name:'sidebar-reopen-and-repeat-approval', status:'NOT_TESTED', reason:'Leader owns selected-lock component coverage'},
      {name:'physical-Side-Panel-95-plus', status:'NOT_TESTED', reason:'320/420 emulation is CSS-width evidence only'}
    ], nativeConfigurationChanged:false, receiptsForged:false, cleanup:{status:'PENDING'}};
  let chrome, browser, sidebar, website, site, currentCase, worker;
  const sessions = [], bodyJobs = new Set(), network = [], networkResponses = [], downloadedBodies = [];
  const step = async (name, operation) => {
    currentCase = report.tests.find(row => row.name === name); currentCase.startedAt = new Date().toISOString();
    const reuseFile=process.env.OPENDESK_STATIC_DRAFT_REUSE_RECEIPT;
    const independentCases=['review-css-width-320','review-css-width-420','fixed-cache-rerun-no-cdn-fetch',
      'changed-require-refuses-old-lock','http-import-refused-without-fetch'];
    if(reuseFile&&independentCases.includes(name)){
      const prior=JSON.parse(fs.readFileSync(reuseFile,'utf8'));
      assert.equal(prior.packageBefore.packageHash,report.packageBefore.packageHash,'Reuse requires identical candidate bytes');
      assert.equal(prior.packageAfter.packageHash,prior.packageBefore.packageHash,'Previous candidate must have stayed immutable');
      const row=prior.tests.find(row=>row.name===name);assert.equal(row?.status,'PASS','Only individual successful cases may be reused');
      Object.assign(currentCase,{status:'REUSED_PASS',details:{receipt:reuseFile,receiptSha256:hash(fs.readFileSync(reuseFile)),original:row.details},finishedAt:new Date().toISOString()});return;
    }
    try { const details = await operation(); Object.assign(currentCase, {status:'PASS', details, finishedAt:new Date().toISOString()}); }
    catch (error) { Object.assign(currentCase, {status:'FAIL', error:errorRecord(error), finishedAt:new Date().toISOString()}); throw error; }
  };
  const attach = async info => {
    const session = await connect(info.webSocketDebuggerUrl, info.id || 'browser', append); sessions.push(session); return session;
  };
  const observeNetwork = async (session, targetId) => {
    session.on('Network.requestWillBeSent', row => {
      const record = {at:new Date().toISOString(), targetId, requestId:row.requestId, url:row.request.url,
        method:row.request.method, initiator:row.initiator, redirectResponse:row.redirectResponse};
      network.push(record); append('network-requests.jsonl', record);
    });
    session.on('Network.responseReceived', row => {
      const record = {at:new Date().toISOString(), targetId, ...row};
      networkResponses.push(record); append('network-responses.jsonl', record);
    });
    const responses = new Map();
    session.on('Network.responseReceived', row => { responses.set(row.requestId, row.response); });
    session.on('Network.loadingFailed', row => append('network-failures.jsonl', {at:new Date().toISOString(), targetId, ...row}));
    session.on('Network.loadingFinished', row => {
      const response = responses.get(row.requestId);
      if (!response || response.url !== requireURL) return;
      const job = (async () => {
        try {
          const result = await session.call('Network.getResponseBody', {requestId:row.requestId});
          const bytes = Buffer.from(result.body, result.base64Encoded ? 'base64' : 'utf8');
          const evidence = retain('cdn-body-' + targetId + '-' + row.requestId.replace(/[^\w-]/g, '_') + '.js', bytes);
          const record = {targetId, requestId:row.requestId, status:response.status, url:response.url, evidence};
          downloadedBodies.push(record); append('downloaded-bodies.jsonl', record);
        } catch (error) { append('downloaded-body-observation-errors.jsonl', {targetId, requestId:row.requestId, error:errorRecord(error)}); }
      })();
      bodyJobs.add(job); void job.finally(() => bodyJobs.delete(job));
    });
    await session.call('Network.enable');
  };
  // Count the dependency origin, not unrelated marketplace/background traffic.
  // Every network event is still retained in raw evidence.
  const remoteRequests = () => network.filter(row => /^https?:\/\/cdn\.jsdelivr\.net(?:[/:]|$)/.test(row.url));
  const screenshot = async name => {
    const result = await sidebar.call('Page.captureScreenshot', {format:'png'});
    return retain(name + '.png', Buffer.from(result.data, 'base64'));
  };
  const snapshot = async name => {
    const ui = await sidebar.read('(()=>{const t=s=>document.querySelector(s)?.textContent,v=s=>document.querySelector(s)?.value;' +
      'return {source:v("#script-source"),networkStatus:t("#network-js-status"),metadata:v("#network-js-metadata"),' +
      'pageState:document.querySelector("#page-preview-status")?.dataset.state,pageStatus:t("#page-preview-status"),' +
      'result:t("#page-preview-result"),technical:t("#page-preview-technical"),target:t("#script-current-page-debug"),' +
      'consent:document.querySelector("#network-js-consent")?.checked,approveDisabled:document.querySelector("#network-js-approve")?.disabled}})()');
    save(name + '.json', ui); await screenshot(name); return ui;
  };
  const expand = async selector => {
    if(selector==='#page-preview-tools')await expand('#developer-results-panel');
    await until(() => sidebar.read(node(selector) + '!=null&&!'+node(selector)+'.hidden'), 'Runtime details available: ' + selector);
    if (!await sidebar.read(node(selector) + '.open')) await clickReal(sidebar, node(selector + ' > summary'));
    await until(() => sidebar.read(node(selector) + '.open'), 'Expanded details: ' + selector);
  };
  const typeSource = async (source, name, {compiled=false}={}) => {
    const evidence = retain(name + '.js', source);
    await clickReal(sidebar, node('#script-source'));
    await sidebar.call('Input.dispatchKeyEvent', {type:'keyDown', key:'a', code:'KeyA', windowsVirtualKeyCode:65, modifiers:4, commands:['selectAll']});
    await sidebar.call('Input.dispatchKeyEvent', {type:'keyUp', key:'a', code:'KeyA', windowsVirtualKeyCode:65, modifiers:4});
    await sidebar.call('Input.insertText', {text:source});
    if(compiled){
      // The existing source view recognizes built modules, hides the editable
      // textarea and exposes the fixed executable in its readonly disclosure.
      await until(() => sidebar.read(node('#script-source')+'.readOnly&&'+node('#script-source')+'.hidden&&'+
        text('#program-generated-source')+'==='+JSON.stringify(source)), 'Trusted input preserves fixed built source');
      await expand('#program-generated');
      const displayed=await sidebar.read(text('#program-generated-source'));
      assert.equal(hash(displayed),hash(source));retain(name+'-displayed.js',displayed);
    }else await until(() => sidebar.read(node('#script-source') + '.value===' + JSON.stringify(source)), 'Trusted input preserves complete source');
    return evidence;
  };
  const terminal = async previousReceipt => until(async () => {
    const status = await sidebar.read('(()=>{const e=document.querySelector("#page-preview-status");return {state:e?.dataset.state,text:e?.textContent,' +
      'receipt:document.querySelector("#page-preview-technical")?.textContent}})()');
    return status.state === 'error' || status.state === 'completed' && status.receipt !== previousReceipt ? status : null;
  }, 'New Page preview terminal status', 45000);
  const noExecution = async (before, name) => {
    const after = await snapshot(name);
    assert.equal(after.technical, before.technical, 'No new Page receipt during prepare/review/approve');
    assert.equal(after.result, before.result, 'No Page result produced during prepare/review/approve');
    assert.notEqual(after.pageState, 'running'); assert.notEqual(after.pageState, 'completed');
    return after;
  };
  const explicitRun = async (source, name, expectedValue) => {
    await expand('#page-preview-tools');
    await until(() => sidebar.read('!'+node('#page-preview-run')+'.disabled'), 'Explicit Page Run ready');
    const targetRaw = await sidebar.read(text('#script-current-page-debug'));
    const target = JSON.parse(targetRaw);
    assert.equal(target.url, report.websiteURL); assert.equal(target.frameId, 0); assert(target.documentId);
    const previous = await sidebar.read(text('#page-preview-technical'));
    await clickReal(sidebar, node('#page-preview-run'));
    const state = await terminal(previous);
    const ui = await snapshot(name);
    assert.equal(state.state, 'completed', state.text);
    assert.notEqual(ui.technical, previous, 'A separate trusted Run produces a fresh receipt');
    const receipt = JSON.parse(ui.technical);
    // Preserve the original receipt verbatim. Extension/package provenance is
    // a separate observation binding, never a fabricated receipt field.
    const raw = retain(name + '-receipt.txt', ui.technical);
    assert.equal(receipt.state, 'preview-evaluated'); assert.equal(receipt.world, 'USER_SCRIPT');
    assert.equal(receipt.sourceHash, hash(expectedBuiltSource)); assert.equal(receipt.documentId, target.documentId);
    assert.equal(receipt.tabId, target.tabId); assert.equal(receipt.durable, false); assert.equal(receipt.registered, false);
    assert.equal(await sidebar.read('location.href'), report.sidebarTarget.url);
    const value = JSON.parse(receipt.resultText);
    assert.equal(value.value, expectedValue);
    if (expectedValue === 9) assert.equal(value.title, await website.read('document.title'));
    assert.equal(await sidebar.read(text('#page-preview-result')), receipt.resultText);
    assert.deepEqual(JSON.parse(await sidebar.read(text('#script-current-page-debug'))), target,
      'Document identity stays exact through the receipt');
    const binding = {receipt:raw, authorSourceHash:hash(source), sourceHash:hash(expectedBuiltSource), target, extensionId:report.extensionId,
      packageHash:report.packageBefore.packageHash, sidebarTarget:report.sidebarTarget, websiteTarget:report.websiteTarget};
    save(name + '-binding.json', binding); return {receipt, binding};
  };
  const rejectRun = async (name, expression) => {
    await expand('#page-preview-tools');
    await until(() => sidebar.read('!'+node('#page-preview-run')+'.disabled'), 'Refusal must use the real enabled Run control');
    const before = await sidebar.read(text('#page-preview-technical')), count = remoteRequests().length;
    await clickReal(sidebar, node('#page-preview-run'));
    const state = await terminal(before); const ui = await snapshot(name);
    assert.equal(state.state, 'error', state.text); assert.match(state.text, expression);
    assert(!ui.technical||ui.technical===before, 'Rejected input cannot produce a new execution receipt; clearing the previous receipt is allowed');
    assert.equal(remoteRequests().length, count, 'Rejected input cannot fetch a remote dependency');
    return {status:state, ui, remoteRequestCountBefore:count, remoteRequestCountAfter:remoteRequests().length};
  };

  try {
    report.packageBefore = fingerprint(packageRoot); save('package-before.json', report.packageBefore);
    const manifestBytes = fs.readFileSync(path.join(packageRoot, 'manifest.json'));
    report.manifest = {sha256:hash(manifestBytes), value:JSON.parse(manifestBytes.toString('utf8'))};
    report.networkObservationScope = {targets:'owned SW, catalog, sidebar and demo page', dependencyOrigin:'cdn.jsdelivr.net',
      allEventsRetained:true, noFetchAssertions:'no additional HTTP(S) request to the declared dependency CDN'};
    const expectedPackage = process.env.OPENDESK_NETWORK_PACKAGE_SHA256;
    if (expectedPackage) assert.equal(report.packageBefore.packageHash, expectedPackage, 'Leader package hash must match');
    const binary = fs.realpathSync(process.env.CHROME_FOR_TESTING_BIN || defaultBinary);
    report.binary = binary;
    report.verificationInputs = [
      'tests/framework/static-import-drafts-cft.mjs', 'tests/framework/local-dev-cft-launcher.mjs','src/ui/static-esm-linker.mjs',PAGE_BROWSER_COMPILER.source,
      'examples/tasks/demo-form.html'
    ].map(file => ({path:file, sha256:hash(fs.readFileSync(path.join(root, file)))}));
    report.launcherSha256 = hash(fs.readFileSync(DEFAULT_MACOS_LAUNCHER));
    if (process.env.OPENDESK_NETWORK_INPUT_BINDING) {
      const file = path.resolve(process.env.OPENDESK_NETWORK_INPUT_BINDING), bytes = fs.readFileSync(file);
      report.leaderInputBinding = {originalPath:file, evidence:retain('leader-input-binding.json', bytes),
        value:JSON.parse(bytes.toString('utf8')), authority:'leader supplied; not a new product-source verification'};
    }
    const sample = fs.readFileSync(path.join(root, 'examples/tasks/demo-form.html'));
    report.pageInput = retain('demo-form.html', sample);
    site = http.createServer((req, res) => {
      append('http.jsonl', {at:new Date().toISOString(), method:req.method, url:req.url});
      if (req.url?.split('?')[0] !== '/demo-form.html') { res.writeHead(404); res.end(); return; }
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'}); res.end(sample);
    });
    await new Promise((resolve, reject) => { site.once('error', reject); site.listen(0, '127.0.0.1', resolve); });
    report.httpPort = site.address().port; report.websiteURL = 'http://127.0.0.1:' + report.httpPort + '/demo-form.html';
    const argv = ['--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-background-networking',
      '--disable-sync', '--remote-debugging-port=0', '--disable-extensions-except=' + packageRoot,
      '--load-extension=' + packageRoot, 'about:blank'];
    const launched = await launchLocalDevChrome({root, out:output, binary, argv}); chrome = launched.chrome;
    report.launch = launched.launch;
    assert.equal(report.launch.launcher, DEFAULT_MACOS_LAUNCHER); assert.equal(report.launch.kind, 'macos-launcher');
    assert(report.launch.argv.includes('--load-extension=' + packageRoot));
    const port = Number(launched.lines[0]), base = 'http://127.0.0.1:' + port;
    report.cdpPort = port;
    browser = await attach({id:'browser', webSocketDebuggerUrl:'ws://127.0.0.1:' + port + launched.lines[1]});
    report.browserVersion = await browser.call('Browser.getVersion');
    const list = async () => {
      const response = await fetch(base + '/json/list'); assert.equal(response.status, 200); return response.json();
    };
    const workerTarget = await until(async () => (await list()).find(target => target.type === 'service_worker' &&
      /^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(target.url)), 'Real packaged service worker');
    report.extensionId = workerTarget.url.split('/')[2]; report.workerTarget = workerTarget;
    worker = await attach(workerTarget); await observeNetwork(worker, workerTarget.id);
    const createTab = async url => {
      const response = await fetch(base + '/json/new?about%3Ablank', {method:'PUT'}); assert.equal(response.status, 200);
      const info = await response.json(), session = await attach(info);
      await session.call('Page.enable'); await observeNetwork(session, info.id); await session.call('Page.navigate', {url});
      return {info, session};
    };
    await step('real-catalog-sidebar-and-userScripts-optin', async () => {
      const settings = await createTab('chrome://extensions/?id=' + report.extensionId);
      const detail = node('extensions-manager') + '?.shadowRoot?.querySelector("extensions-detail-view")';
      const toggle = '(' + detail + ')?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
      await until(() => settings.session.read('(' + toggle + ')!=null'), 'Chrome real userScripts toggle');
      await browser.call('Target.activateTarget', {targetId:settings.info.id});
      if (!await settings.session.read('(' + toggle + ').checked')) await clickReal(settings.session, toggle);
      await until(() => settings.session.read('(' + toggle + ').checked===true'), 'Real userScripts opt-in');
      const siteTab = await createTab(report.websiteURL); website = siteTab.session; report.websiteTarget = siteTab.info;
      await until(() => website.read('document.readyState==="complete"'), 'Actual demo-form page ready');
      const catalog = await createTab('chrome-extension://' + report.extensionId + '/ui/tool.html');
      report.catalogTarget = catalog.info;
      await until(() => catalog.session.read('(()=>{const e='+node('#catalog-open-dev-sidebar')+';const r=e?.getBoundingClientRect();return !!r?.width&&!!r?.height&&!e.disabled})()'), 'Initialized visible full-catalog entry');
      await browser.call('Target.activateTarget', {targetId:catalog.info.id});
      await clickReal(catalog.session, node('#catalog-open-dev-sidebar'));
      await until(() => catalog.session.read(text('#catalog-dev-sidebar-status') + '?.includes("已打开侧栏")'), 'Real Side Panel opening acknowledgment');
      const panel = await until(async () => (await list()).find(target =>
        target.id !== catalog.info.id && target.url?.startsWith('chrome-extension://' + report.extensionId + '/ui/tool.html') && target.webSocketDebuggerUrl),
      'Actual Chrome Side Panel target');
      report.sidebarTarget = panel; sidebar = await attach(panel); await observeNetwork(sidebar, panel.id);
      await until(() => sidebar.read(node('#tab-develop') + '!=null'), 'Side Panel developer tab');
      await until(() => sidebar.read('location.href.includes("hostInstanceId=")'), 'Committed real Side Panel host identity');
      report.sidebarTarget={...panel,url:await sidebar.read('location.href')};
      await browser.call('Target.activateTarget', {targetId:siteTab.info.id});
      await clickReal(sidebar, node('#tab-develop'));
      await until(() => sidebar.read(node('#tab-develop') + '.getAttribute("aria-selected")==="true"'), 'Trusted Develop navigation');
      await until(() => sidebar.read(node('#script-current-page-status') + '?.dataset.state==="available"&&' +
        text('#script-current-page-url') + '===' + JSON.stringify(report.websiteURL)), 'Real exact current-page binding');
      assert.equal(await sidebar.read(node('#local-project-mode') + '.checked'), false);
      assert.equal(await sidebar.read(node('#page-component-javascript') + '.checked'), true);
      return {settingsTarget:settings.info, sidebarTarget:panel, target:JSON.parse(await sidebar.read(text('#script-current-page-debug')))};
    });
    if(controllerOnly){
      const file=process.env.OPENDESK_STATIC_DRAFT_REUSE_RECEIPT;
      assert(file,'Controller supplement must retain prior same-candidate evidence');
      const prior=JSON.parse(fs.readFileSync(file,'utf8'));
      assert.equal(prior.packageBefore.packageHash,report.packageBefore.packageHash);
      assert.equal(prior.packageAfter.packageHash,prior.packageBefore.packageHash);
      for(const row of report.tests)if(!['real-catalog-sidebar-and-userScripts-optin','controller-world-separate-approval-and-real-run'].includes(row.name)){
        const original=prior.tests.find(item=>item.name===row.name);
        assert(['PASS','REUSED_PASS'].includes(original?.status),'Cannot reuse failed or untested case: '+row.name);
        Object.assign(row,{status:'REUSED_PASS',details:{receipt:file,receiptSha256:hash(fs.readFileSync(file)),original:original.details}});
      }
    }
    if(!controllerOnly){
    const source = leafESMSource(requireURL);
    let initial, cachedHash;
    await step('missing-lock-blocks-before-prepare', async () => {
      const count = remoteRequests().length;
      report.leafESMInput = await typeSource(source, 'leaf-esm-input'); await expand('#network-js-review');
      await until(() => sidebar.read('!'+node('#network-js-prepare')+'.disabled'), 'Initial dependency inspection completes');
      const refusal = await rejectRun('missing-lock', /E_DEPENDENCY_UNLOCKED/);
      initial = refusal.ui; assert(!initial.technical, 'Fresh isolated profile has no prior Page receipt');
      assert.equal(remoteRequests().length, count, 'Draft input and missing-lock refusal cannot download');
      return refusal;
    });
    await step('live-prepare-and-read-cached-source-no-page-run', async () => {
      const count = remoteRequests().length;
      await clickReal(sidebar, node('#network-js-prepare'));
      await until(() => sidebar.read(node('#network-js-metadata') + '?.hidden===false&&' +
        text('#network-js-status') + '?.includes("下载准备完成")'), 'Live download prepared', 45000);
      await noExecution(initial, 'prepared-no-run');
      assert.equal(await sidebar.read(node('#network-js-approve') + '.disabled'), true, 'Unread cache cannot be approved');
      assert.equal(await sidebar.read('document.querySelectorAll("#network-js-sources button").length'), 1);
      await clickReal(sidebar, node('#network-js-sources button'));
      // UI verifies WebCrypto asynchronously. Await its completion notice,
      // not merely textarea insertion before its accepted hash is checked.
      await until(() => sidebar.read(node('#network-js-sources textarea') + '?.hidden===false&&' +
        text('#network-js-status') + '?.includes("已显示固定缓存原文")'), 'Actual cached-source hash verification', 20000);
      const cached = await sidebar.read(node('#network-js-sources textarea') + '.value');
      reviewedModuleCode=cached;
      assert.equal(await sidebar.read(node('#network-js-sources textarea') + '.readOnly'), true);
      const metadata = await sidebar.read(node('#network-js-metadata') + '.value');
      cachedHash = hash(cached);
      assert.match(metadata, new RegExp('SHA-256：' + cachedHash)); assert(metadata.includes(requireURL));
      const size = metadata.match(/大小：([0-9]+) B/); assert(size); assert.equal(Number(size[1]), Buffer.byteLength(cached));
      assert(cached.includes('export default function max'), 'Actual ESM leaf module');
      expectedBuiltSource = compileStaticESM({sourceUtf8:source,entries:[{url:requireURL,code:cached}],sourceFormat:'esm-page',babel:Babel}).sourceUtf8;
      retain('expected-offline-compiled-source.js',expectedBuiltSource);
      const evidence = retain('leaf-esm-cached-source.js', cached); retain('leaf-esm-review-metadata.txt', metadata);
      const fetched = remoteRequests().slice(count).filter(row => row.url === requireURL);
      assert(fetched.length > 0, 'Preparation genuinely requests the HTTPS CDN in this browser');
      const responses = networkResponses.filter(row => row.response.url === requireURL);
      assert(responses.some(row => row.response.status === 200 && !row.response.fromDiskCache), 'Live HTTPS 200 is observed, not a curl receipt');
      await Promise.all([...bodyJobs]);
      for (const body of downloadedBodies) assert.equal(body.evidence.sha256, cachedHash, 'Observed response body equals actual reviewed cache');
      const after = await noExecution(initial, 'cache-viewed-no-run');
      return {evidence, metadata, requests:fetched, responses, downloadedBodies, ui:after};
    });
    for (const width of [320, 420]) await step('review-css-width-' + width, async () => {
      try {
        await sidebar.call('Emulation.setDeviceMetricsOverride', {width, height:1000, deviceScaleFactor:1, mobile:false});
        // Layout-dependent DOM getters may trigger rendering and Chrome's
        // debugger side-effect guard. Observe geometry through CDP directly.
        await sidebar.call('DOM.enable');await sidebar.call('CSS.enable');
        const documentNode=await sidebar.call('DOM.getDocument',{depth:0});
        const query=async selector=>(await sidebar.call('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector})).nodeId;
        const rect=async nodeId=>{
          const {model}=await sidebar.call('DOM.getBoxModel',{nodeId});
          const {computedStyle}=await sidebar.call('CSS.getComputedStyleForNode',{nodeId});
          const {attributes}=await sidebar.call('DOM.getAttributes',{nodeId});
          const attribute=key=>{const index=attributes.indexOf(key);return index<0?null:attributes[index+1];};
          return {x:model.border[0],right:model.border[2],width:model.border[2]-model.border[0],
            whiteSpace:computedStyle.find(row=>row.name==='white-space')?.value,wrap:attribute('wrap')};
        };
        const viewport=await sidebar.call('Page.getLayoutMetrics');
        const {nodeIds}=await sidebar.call('DOM.querySelectorAll',{nodeId:documentNode.root.nodeId,selector:'#network-js-review textarea:not([hidden])'});
        const metrics={innerWidth:viewport.cssLayoutViewport.clientWidth,scrollWidth:viewport.cssContentSize.width,
          review:await rect(await query('#network-js-review')),label:await rect(await query('#network-js-review label')),
          textareas:await Promise.all(nodeIds.map(rect))};
        save('review-width-' + width + '.json', metrics); await screenshot('review-width-' + width);
        assert.equal(metrics.innerWidth, width); assert(metrics.scrollWidth <= width, 'No root horizontal overflow');
        assert(metrics.review.width <= width && metrics.label.width <= width, 'Review and consent label stay bounded');
        assert(metrics.textareas.length >= 2);
        for (const area of metrics.textareas) {
          assert(area.width <= width,
            'Readonly textarea content stays bounded');
          assert.notEqual(area.wrap, 'off');
        }
        assert.notEqual(metrics.label.whiteSpace, 'nowrap', 'Consent label allows wrapping');
        return {metrics, scope:'owned-target CSS-width emulation; not physical panel acceptance'};
      } finally { await sidebar.call('Emulation.clearDeviceMetricsOverride'); }
    });
    if(!widthsOnly){
    await step('explicit-consent-approval-no-page-run', async () => {
      assert.equal(await sidebar.read(node('#network-js-consent') + '.checked'), false);
      assert.equal(await sidebar.read(node('#network-js-approve') + '.disabled'), true);
      await clickReal(sidebar, node('#network-js-consent'));
      await until(() => sidebar.read(node('#network-js-consent') + '.checked&&!'+node('#network-js-approve')+'.disabled'), 'Explicit consent enables approval');
      await clickReal(sidebar, node('#network-js-approve'));
      await until(() => sidebar.read(text('#network-js-status') + '?.includes("明确批准这些固定字节")'), 'Explicit fixed-byte approval');
      return {ui:await noExecution(initial, 'approved-no-run'), approvedCacheSha256:cachedHash};
    });
    await step('explicit-leaf-esm-page-run', async () => {
      const result = await explicitRun(source, 'leaf-esm-run', 9);
      assert.equal(result.receipt.entryFormat, 'async-main');
      assert.equal(result.receipt.lockId, null, 'Fixed compiled code runs through the existing classic executor');
      assert.equal(result.receipt.dependencies.length, 0);
      return result;
    });
    await step('fixed-cache-rerun-no-cdn-fetch', async () => {
      assert(worker.open, 'SW network observer is live before the cache rerun');
      let blocked = false, blockError;
      try { await worker.call('Network.setBlockedURLs', {urls:['https://cdn.jsdelivr.net/*']}); blocked = true; }
      catch (error) { blockError = errorRecord(error); append('transport-observation.jsonl', {blockError}); }
      try {
        const count = remoteRequests().length, result = await explicitRun(source, 'leaf-esm-cache-rerun', 9);
        assert.equal(remoteRequests().length, count, 'Fixed cache rerun must make no additional remote request');
        assert(worker.open, 'SW observer remains connected throughout cache rerun');
        assert((await list()).some(target => target.id === workerTarget.id), 'Cache observer retains the exact SW target');
        assert.equal(result.receipt.sourceHash, report.tests.find(row => row.name === 'explicit-leaf-esm-page-run').details.receipt.sourceHash);
        return {...result, additionalRemoteRequests:0, transport:blocked ? 'CDN blocked on owned SW target' : 'observed no remote request; not offline transport proof', blockError};
      } finally { if (blocked) await worker.call('Network.setBlockedURLs', {urls:[]}); }
    });
    await step('changed-require-refuses-old-lock', async () => {
      const count = remoteRequests().length;
      await typeSource(leafESMSource('https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/min.js'), 'changed-require-input');
      await expand('#network-js-review');
      await until(() => sidebar.read('!'+node('#network-js-prepare')+'.disabled'), 'Changed declaration inspection completes');
      const result = await rejectRun('changed-require', /E_DEPENDENCY_UNLOCKED|E_DEPENDENCY_LOCK_STALE/);
      assert.equal(remoteRequests().length, count, 'Changed declaration input cannot download'); return result;
    });
    await step('http-import-refused-without-fetch', async () => {
      const count = remoteRequests().length;
      await typeSource(leafESMSource(requireURL.replace('https:', 'http:')), 'http-import-input');
      await expand('#network-js-review');
      await until(() => sidebar.read(text('#network-js-status') + '?.includes("E_DEPENDENCY_URL")'), 'HTTP declaration refusal');
      assert.equal(await sidebar.read(node('#network-js-prepare') + '.disabled'), true);
      const result = await rejectRun('http-import', /E_STATIC_ESM_URL|E_DEPENDENCY_URL|E_DEPENDENCY_INSPECT.*HTTPS/);
      assert.equal(remoteRequests().length, count, 'HTTP draft input cannot download'); return result;
    });
    await step('invalid-https-esm-refused-without-fetch', async () => {
      const count = remoteRequests().length;
      const raw = 'import {imaginary} from "https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/max.js";\nasync function main(){return {value:imaginary([1,9,3])};}\n';
      await typeSource(raw, 'raw-esm-input');
      const result = await rejectRun('raw-esm', /E_STATIC_ESM_ENTRY|E_STATIC_ESM_URL|E_DEPENDENCY_UNLOCKED|E_STATIC_ESM_EXPORT/);
      assert.equal(remoteRequests().length, count, 'Raw ESM draft input cannot fetch'); return result;
    });
    }
    }
    if(!widthsOnly)await step('controller-world-separate-approval-and-real-run',async()=>{
      const raw=`import max from '${requireURL}';\nasync function main(){return {value:max([2,8,5]),pageType:typeof page,paramsType:typeof params};}\n`;
      await typeSource(raw,'controller-esm-input');
      await expand('#network-js-review');
      if(process.env.OPENDESK_STATIC_DRAFT_NATIVE_WORLD==='1'){
        save('native-world-checkpoint.json',{websiteURL:report.websiteURL,extensionId:report.extensionId,sidebarTarget:report.sidebarTarget,action:'Use native CFT UI to choose Controller; no prepare or Run yet'});
      }else{
      // Keep the native macOS select popup closed: CDP targets the renderer,
      // whereas that popup owns OS keyboard focus. Tab is real trusted input.
      await clickReal(sidebar,node('#script-source'));
      for(let tabs=0;tabs<12&&await sidebar.read('document.activeElement?.id')!=='network-js-world';tabs++){
        await sidebar.call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
        await sidebar.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      }
      assert.equal(await sidebar.read('document.activeElement?.id'),'network-js-world','Trusted Tab focuses closed select');
      for(const [key,code,windowsVirtualKeyCode,nativeVirtualKeyCode] of [['ArrowDown','ArrowDown',40,125],['Tab','Tab',9,48]]){
        await sidebar.call('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code,windowsVirtualKeyCode,nativeVirtualKeyCode});
        await sidebar.call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode,nativeVirtualKeyCode});
      }
      }
      await until(()=>sidebar.read(node('#network-js-world')+'.value==="esm-controller"&&!'+node('#network-js-prepare')+'.disabled'),'Explicit Controller world',process.env.OPENDESK_STATIC_DRAFT_NATIVE_WORLD==='1'?180000:20000);
      const noRun=await snapshot('controller-before-prepare');
      await clickReal(sidebar,node('#network-js-prepare'));
      await until(()=>sidebar.read(text('#network-js-status')+'?.includes("下载准备完成")'),'Controller prepare');
      await clickReal(sidebar,node('#network-js-sources button'));
      await until(()=>sidebar.read(text('#network-js-status')+'?.includes("已显示固定缓存原文")'),'Controller fixed-source review');
      reviewedModuleCode=await sidebar.read(node('#network-js-sources textarea')+'.value');
      assert(reviewedModuleCode.includes('export default function max'));
      assert.equal(await sidebar.read(node('#network-js-consent')+'.checked'),false);
      await clickReal(sidebar,node('#network-js-consent'));
      await until(()=>sidebar.read('!'+node('#network-js-approve')+'.disabled'),'Controller consent');
      await clickReal(sidebar,node('#network-js-approve'));
      await until(()=>sidebar.read(text('#network-js-status')+'?.includes("明确批准这些固定字节")'),'Controller explicit approval');
      await noExecution(noRun,'controller-approved-no-run');
      const built=compileStaticESM({sourceUtf8:raw,entries:[{url:requireURL,code:reviewedModuleCode}],sourceFormat:'esm-controller',babel:Babel}).sourceUtf8;
      retain('expected-controller-compiled-source.js',built);
      const count=remoteRequests().length;
      await until(()=>sidebar.read('!'+node('#script-run')+'.disabled'),'Real Controller Run enabled');
      await clickReal(sidebar,node('#script-run'));
      await until(()=>sidebar.read(text('#script-task-status')+'?.includes("已完成")&&'+text('#script-task-status')+'?.includes("资源已释放")'),'Controller settled and released',35000);
      const observation={runId:await sidebar.read(node('#script-run-id')+'.value'),revision:await sidebar.read(text('#script-task-version')),
        task:await sidebar.read(text('#script-task-status')),result:await sidebar.read(text('#script-result')),kind:await sidebar.read(text('#script-result-kind')),
        history:await sidebar.read(text('#script-history'))};
      assert(observation.runId); assert(observation.revision.includes(hash(built)));
      const result=JSON.parse(observation.result);assert.equal(result.value,8);assert.equal(result.pageType,'object');assert.equal(result.paramsType,'object');
      const history=JSON.parse(observation.history),receipt=history.results.find(row=>row.runId===observation.runId);
      const run=history.runs.find(row=>row.runId===observation.runId);
      assert.equal(receipt.tag,'controller-result');assert(receipt.resultId);assert.equal(receipt.revision.sourceHash,hash(built));
      assert.equal(run.retirementState,'released');assert.equal(run.revision.sourceHash,hash(built));
      save('controller-result-and-retirement.json',{receipt,run});
      assert.equal(remoteRequests().length,count,'Controller Run compiles fixed cache without CDN request');
      save('controller-visible-result-and-revision.json',observation);await snapshot('controller-completed');
      return {...observation,sourceHash:hash(built),additionalRemoteRequests:0,scope:'actual RunHost, visible result and draft revision; no native effects or Stop proof'};
    });
    report.status = widthsOnly?'PASS_BOUNDED_CSS_BROWSER':'PASS_BOUNDED_BROWSER';
  } catch (error) {
    report.status = 'FAIL'; report.error = errorRecord(error);
    if (error.launchCleanup) report.launchFailureCleanup = error.launchCleanup;
    if (sidebar) {
      try { await snapshot('failure-final'); } catch (captureError) { report.failureCaptureError = errorRecord(captureError); }
    }
  } finally {
    const errors = [];
    const cleanupTask = async (name, operation) => {
      try { return await operation(); } catch (error) { errors.push({name, error:errorRecord(error)}); return null; }
    };
    // Flush completed download observers before closing CDP; retain errors.
    await cleanupTask('download-observers', () => Promise.all([...bodyJobs]));
    if (browser) await cleanupTask('Browser.close', () => browser.call('Browser.close'));
    for (const session of sessions) session.close();
    if (chrome?.cleanup) report.cleanup.launcher = await cleanupTask('original-launcher-cleanup', () => chrome.cleanup());
    if (site?.listening) {
      site.closeAllConnections();
      await cleanupTask('http-server-close', () => new Promise((resolve, reject) => site.close(error => error ? reject(error) : resolve())));
    }
    report.cleanup.serverListening = !!site?.listening;
    if (report.launch && !report.cleanup.launcher) errors.push({name:'launcher-cleanup', error:{message:'Missing verified launcher cleanup'}});
    if (report.cleanup.launcher && (report.cleanup.launcher.chromePidAlive || report.cleanup.launcher.launcherPidAlive ||
      !report.cleanup.launcher.profileRemoved || report.cleanup.launcher.error)) errors.push({name:'launcher-residual', details:report.cleanup.launcher});
    if (report.cleanup.serverListening) errors.push({name:'http-server-residual'});
    if (report.launchFailureCleanup && (report.launchFailureCleanup.chromePidAlive || report.launchFailureCleanup.launcherPidAlive ||
      report.launchFailureCleanup.profileRemoved !== true)) errors.push({name:'launcher-start-failure-residual', details:report.launchFailureCleanup});
    await cleanupTask('package-after', async () => {
      report.packageAfter = fingerprint(packageRoot); save('package-after.json', report.packageAfter);
      report.packageDrift = report.packageBefore?.packageHash !== report.packageAfter.packageHash;
      if (report.packageDrift) errors.push({name:'package-drift'});
    });
    await cleanupTask('verification-inputs-after', async () => {
      report.verificationInputsAfter = (report.verificationInputs || []).map(row => ({path:row.path, sha256:hash(fs.readFileSync(path.join(root, row.path)))}));
      report.verificationInputDrift = JSON.stringify(report.verificationInputsAfter) !== JSON.stringify(report.verificationInputs || []);
      if (report.verificationInputDrift) errors.push({name:'verification-input-drift'});
    });
    report.cleanup.errors = errors; report.cleanup.status = errors.length ? 'FAIL' : 'PASS';
    report.resourcesReleased = !errors.length;
    if (errors.length) report.status = 'FAIL_CLEANUP_OR_BINDING';
    report.finishedAt = new Date().toISOString();
    save('cleanup.json', report.cleanup); save('acceptance.json', report);
    console.log('STATIC_IMPORT_DRAFTS_CFT=' + JSON.stringify({status:report.status, packageHash:report.packageBefore?.packageHash,
      extensionId:report.extensionId, output, resourcesReleased:report.resourcesReleased,
      tests:report.tests.map(({name, status}) => ({name, status})), error:report.error}));
    if (!report.status.startsWith('PASS_')) process.exitCode = 1;
  }
}

await main();
