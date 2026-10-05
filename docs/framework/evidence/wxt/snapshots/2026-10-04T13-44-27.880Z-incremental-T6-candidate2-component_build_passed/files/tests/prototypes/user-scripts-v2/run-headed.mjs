import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import {dirname, resolve, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import os from 'node:os';

const require = createRequire(import.meta.url);
const playwrightPath = '/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const {chromium} = require(playwrightPath);
const root = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(root, 'fixture');
const project = resolve(root, '../../..');
const argv = process.argv.slice(2);
const focusLifecycle = argv.includes('--focus-lifecycle');
const notExecuted = [];
const option = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const label = option('--label', 'installed-cft-149');
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Unsafe label');
const executable = option('--executable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome for Testing');
const channel = option('--channel', 'Chrome for Testing (installed; historical channel unknown)');
const runId = `m5-${new Date().toISOString().replace(/[:.]/g, '-')}-${label}-${randomUUID().slice(0, 8)}`;
const output = resolve(root, 'evidence', runId);
const profile = resolve(root, 'profiles', runId);
await mkdir(output, {recursive: true});
await mkdir(profile, {recursive: true});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJSON = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
const errorRecord = error => ({name: error?.name || 'Error', message: String(error?.message || error), stack: error?.stack});
const sources = [];
for (const name of ['run-headed.mjs', ...((await readdir(fixture)).sort().map(name => `fixture/${name}`))]) {
  const bytes = await readFile(resolve(root, name));
  sources.push({path: name, bytes: bytes.length, sha256: sha(bytes)});
  await mkdir(dirname(resolve(output, 'source', name)), {recursive: true});
  await writeFile(resolve(output, 'source', name), bytes);
}
const audit = '/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85';
const inputs = [];
const approvedRoot = resolve(project, 'docs/framework/reviews/migration-execution-v5/round-6/candidate');
for (const path of [resolve(approvedRoot, 'candidate-manifest.json'), resolve(approvedRoot, 'execution-plan.md'), resolve(approvedRoot, 'stage0/f1-cases.json'), resolve(approvedRoot, 'stage0/user-scripts-switch-history-amendment.json'), resolve(approvedRoot, 'goal-constraints.md'), resolve(audit, 'outputs/design.md'), resolve(audit, 'outputs/test-spec.md')]) {
  const bytes = await readFile(path);
  inputs.push({path, bytes: bytes.length, sha256: sha(bytes)});
}
const candidate = {schema: 1, scope: 'F1 userScripts only; fixture, no F2', sources, frozenInputs: inputs,
  approvedPlanManifestSha256: 'da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1',
  designManifestSha256: 'acca60edf9031aafb4ecb740f5f0f33777a3694d23499f28ce37af63b38f592f'};
await writeJSON(resolve(output, 'candidate-manifest.json'), candidate);
const candidateSha256 = sha(await readFile(resolve(output, 'candidate-manifest.json')));
const logs = [];
const httpLog = [];
const holds = new Map();
const cases = [];
const screenshots = [];
const hostLifecycle = [];
let resourceBaseline;
let fixtureResources;
let context, host, settings, targetPage, otherPage, extensionId;
let actualBrowser;
let initializationFailure;
const startedAt = new Date().toISOString();
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  httpLog.push({method: request.method, url: request.url, host: request.headers.host, at: Date.now()});
  if (url.pathname === '/hold') {
    const token = url.searchParams.get('token');
    holds.set(token, response);
    response.on('close', () => { if (holds.get(token) === response) holds.delete(token); });
    return;
  }
  if (url.pathname === '/probe') {
    response.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    response.end(JSON.stringify({token: url.searchParams.get('token'), reachable: true}));
    return;
  }
  if (url.pathname === '/page-script.js') {
    response.writeHead(200, {'Content-Type': 'application/javascript'});
    response.end(`globalThis.__mainOnly = 'page-main'; globalThis.__callbacks = []; globalThis.ChromeBridgeOperationCompleted = (id, value) => __callbacks.push({id, value});`);
    return;
  }
  const id = url.searchParams.get('id') || url.pathname.slice(1) || 'top';
  const csp = url.pathname === '/csp' ? { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; connect-src 'none'" } : {};
  response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...csp});
  const port = server.address().port;
  response.end(`<!doctype html><html><meta charset="utf-8"><title>F1 ${id}</title><body data-page="${id}"><h1>Owned F1 document ${id}</h1><div id="marker">Untouched</div>${url.pathname === '/top' ? `<iframe id="same" src="http://127.0.0.1:${port}/frame?id=same"></iframe><iframe id="cross" src="http://localhost:${port}/frame?id=cross"></iframe>` : ''}<script src="/page-script.js"></script></body></html>`);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const attachLogs = page => {
  page.on('console', message => logs.push({at: Date.now(), url: page.url(), event: 'console', level: message.type(), text: message.text(), location: message.location()}));
  page.on('pageerror', error => logs.push({at: Date.now(), url: page.url(), event: 'pageerror', ...errorRecord(error)}));
};
const call = (method, argument) => host.evaluate(({method, argument}) => window.fixture[method](argument), {method, argument});
const rejected = value => value?.kind === 'rejected';
const matched = (value, target) => value?.kind === 'resolved' && value.results.length === 1 && value.results[0].documentId === target.documentId && value.results[0].frameId === target.frameId;
const snapshot = async (name, page = host) => {
  const path = resolve(output, `${name}.png`);
  await page.screenshot({path, fullPage: true});
  screenshots.push({name, path: relative(output, path), url: page.url()});
};
async function runCase(id, expectation, body, required = true) {
  if (focusLifecycle && !/^(SWITCH-(OFF|ON)$|.*-(SWITCH-|HOST-UI-|OLD-DOCUMENT-RACE|OWN-GRANT-|CANCEL-|DEADLINE-))/.test(id)) {
    notExecuted.push({id, required, expectation, status: 'not-tested', reason: 'Targeted operation lifecycle run; original full matrix case retained'});
    return;
  }
  const start = Date.now();
  const consoleStart = logs.length;
  const traceStart = host ? (await call('trace')).length : 0;
  const packagedStart = host ? (await call('packagedTrace')).length : 0;
  const httpStart = httpLog.length;
  const resourcesBefore = host ? await call('resources') : undefined;
  let actual, pass = false, error, evidenceBasisCaseId, assessmentOnly = false;
  try { const result = await body(); actual = result.actual; pass = result.pass === true; evidenceBasisCaseId = result.evidenceBasisCaseId; assessmentOnly = result.assessmentOnly === true; }
  catch (caught) { error = errorRecord(caught); }
  const item = {id, phase: 'F1', required, expectation, status: pass ? 'actual' : 'failed', pass, actual, error, elapsedMs: Date.now() - start, candidateSha256,
    approvedPlanManifestSha256: candidate.approvedPlanManifestSha256, sourceHashes: sources,
    assessmentOnly, evidenceBasisCaseId, cleanup: {before: resourcesBefore, after: host ? await call('resources') : undefined},
    input: {nativeInjections: host ? (await call('trace')).slice(traceStart) : [], packagedInjections: host ? (await call('packagedTrace')).slice(packagedStart) : []}, http: httpLog.slice(httpStart), console: logs.slice(consoleStart)};
  cases.push(item);
  await writeJSON(resolve(output, 'cases-live.json'), cases);
  console.log(JSON.stringify({id, status: item.status, error: error?.message}));
  return item;
}
async function switchState(enabled, screenshotName) {
  const hostBefore = await observeHost();
  // Chrome's rendered extension-details UI; no profile-preference edits/private API.
  await settings.goto(`chrome://extensions/?id=${extensionId}`);
  await settings.locator('extensions-detail-view').waitFor({state: 'visible'});
  const toggle = settings.locator('extensions-detail-view #allow-user-scripts cr-toggle');
  await toggle.waitFor({state: 'visible'});
  const before = await readToggle(toggle);
  if ((before === 'true') !== enabled) await toggle.click();
  await pollActual(async () => await readToggle(toggle) === String(enabled));
  const hostAfter = await reconnectHostIfNeeded(hostBefore);
  const after = await readToggle(toggle);
  await snapshot(screenshotName, settings);
  return {before, after, hostBefore, hostAfter, url: settings.url(), method: 'rendered Chrome extension details UI click'};
}
async function observeHost() {
  return host.evaluate(async () => {
    const tab = await chrome.tabs.getCurrent();
    const frame = await chrome.webNavigation.getFrame({tabId: tab.id, frameId: 0});
    const hostContext = (await chrome.runtime.getContexts({})).find(item => item.tabId === tab.id && item.documentUrl === location.href);
    return {tabId: tab.id, documentId: frame?.documentId ?? hostContext?.documentId, runtimeId: chrome.runtime.id, url: location.href, timeOrigin: performance.timeOrigin,
      operations: window.fixture?.operationSnapshots()};
  });
}
async function reconnectHostIfNeeded(before) {
  if (host.isClosed()) host = await context.newPage();
  try { await host.waitForFunction(() => Boolean(window.fixture), null, {timeout: 5000}); }
  catch { await host.goto(`chrome-extension://${extensionId}/host.html`); await host.waitForFunction(() => Boolean(window.fixture)); }
  const after = await observeHost();
  hostLifecycle.push({before, after, rebuilt: before.documentId !== after.documentId || before.timeOrigin !== after.timeOrigin,
    note: 'Actual host reconstruction is recorded; lost old pending is not broker settlement or backend impossibility'});
  return after;
}
async function readToggle(toggle) {
  const value = await toggle.getAttribute('aria-checked') ?? await toggle.getAttribute('aria-pressed');
  if (!['true', 'false'].includes(value)) throw new Error('Actual Chrome UI toggle state missing');
  return value;
}
async function pollActual(check) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(done => setTimeout(done, 25));
  }
  throw new Error('Actual browser/UI state did not reach requested value');
}
async function siteState(enabled, screenshotName) {
  const hostBefore = await observeHost();
  await settings.goto(`chrome://extensions/?id=${extensionId}`);
  const toggle = settings.locator('extensions-detail-view extensions-host-permissions-toggle-list #allHostsToggle cr-toggle');
  await toggle.waitFor({state: 'visible'});
  const before = await readToggle(toggle);
  if ((before === 'true') !== enabled) await toggle.click();
  const hostAfter = await reconnectHostIfNeeded(hostBefore);
  await pollActual(async () => await readToggle(toggle) === String(enabled) && await call('containsHosts') === enabled);
  const after = await readToggle(toggle);
  await snapshot(screenshotName, settings);
  return {before, after, enabled, hostBefore, hostAfter, url: settings.url(), method: 'rendered Chrome site access allHostsToggle click', permissions: await call('permissions'), events: await call('permissionEvents')};
}
const frameTarget = frame => ({tabId: targetTabId, frameId: frame.frameId, documentId: frame.documentId, url: frame.url});
let targetTabId, otherTabId;
async function topTarget() {
  const frames = await call('frames', targetTabId);
  const top = frames.find(frame => frame.frameId === 0);
  if (!top?.documentId) throw new Error('Real webNavigation top document missing');
  return frameTarget(top);
}
async function settle(id) {
  await host.waitForFunction(id => window.fixture.poll(id)?.state === 'settled', id, {timeout: 15000});
  return call('poll', id);
}
function release(token) {
  const response = holds.get(token);
  if (!response) return {released: false, reason: 'document fetch already ended'};
  response.writeHead(200, {'Content-Type': 'application/json'});
  response.end(JSON.stringify({token, released: true}));
  holds.delete(token);
  return {released: true};
}
function holdSource(token) {
  return `async () => { document.body.dataset.pending = ${JSON.stringify(token)}; const value = await (await fetch(${JSON.stringify(`${base}/hold?token=${token}`)})).json(); document.body.dataset.finished = ${JSON.stringify(token)}; return value; }`;
}

try {
  context = await chromium.launchPersistentContext(profile, {executablePath: executable, headless: false, viewport: {width: 1150, height: 850},
    args: [`--disable-extensions-except=${fixture}`, `--load-extension=${fixture}`, '--lang=en-US']});
  context.on('page', attachLogs);
  context.pages().forEach(attachLogs);
  const isFixture = worker => worker.url().startsWith('chrome-extension://') && worker.url().endsWith('/sw.js');
  let worker = context.serviceWorkers().find(isFixture);
  if (!worker) worker = await context.waitForEvent('serviceworker', {predicate: isFixture, timeout: 20000});
  worker.on('console', message => logs.push({event: 'serviceworker-console', level: message.type(), text: message.text(), at: Date.now()}));
  extensionId = new URL(worker.url()).host;
  actualBrowser = {version: context.browser().version(), executable, executableSha256: sha(await readFile(executable)), channel, headed: true, isolatedProfile: profile, extensionId,
    os: {platform: os.platform(), release: os.release(), arch: os.arch()}, playwrightVersion: require(`${playwrightPath}/package.json`).version};
  host = await context.newPage();
  await host.goto(`chrome-extension://${extensionId}/host.html`);
  await host.waitForFunction(() => Boolean(window.fixture));
  const fixtureIdentity = await host.evaluate(() => ({id: chrome.runtime.id, manifest: chrome.runtime.getManifest()}));
  if (fixtureIdentity.manifest.name !== 'OpenDesk F1 userScripts v2 fixture' || fixtureIdentity.id !== extensionId) throw new Error('Wrong extension worker');
  actualBrowser.fixtureIdentity = fixtureIdentity;
  resourceBaseline = await call('resources');
  settings = await context.newPage();
  await settings.goto(`chrome://extensions/?id=${extensionId}`);
  await settings.locator('extensions-detail-view').waitFor({state: 'visible'});
  await snapshot('initial-details', settings);
  if (argv.includes('--probe-ui')) {
    await writeFile(resolve(output, 'chrome-ui.txt'), await settings.locator('body').innerText());
    await writeFile(resolve(output, 'chrome-ui-dom.json'), JSON.stringify(await settings.evaluate(() => {
      const visit = node => ({tag: node.tagName, id: node.id, text: node.textContent?.slice(0, 300), attributes: [...(node.attributes || [])].map(a => [a.name, a.value]), children: [...(node.shadowRoot?.children || []), ...(node.children || [])].map(visit)});
      return visit(document.body);
    }), null, 2));
    console.log(JSON.stringify({output, actualBrowser}));
    if (argv.includes('--probe-sites')) {
      await writeJSON(resolve(output, 'site-ui-probe.json'), {off: await siteState(false, 'site-off'), on: await siteState(true, 'site-on')});
    }
  } else {
    targetPage = await context.newPage();
    otherPage = await context.newPage();
    await targetPage.goto(`${base}/top?id=target`);
    await otherPage.goto(`${base}/other?id=negative`);
    await targetPage.waitForFunction(() => document.querySelectorAll('iframe').length === 2);
    const tabs = await call('tabs');
    targetTabId = tabs.find(tab => tab.url === targetPage.url())?.id;
    otherTabId = tabs.find(tab => tab.url === otherPage.url())?.id;
    if (!Number.isInteger(targetTabId) || !Number.isInteger(otherTabId)) throw new Error('Explicit owned tab identity not found');
    let top = await topTarget();

    await runCase('SWITCH-OFF', 'UI off; real userScripts method unavailable and injection has no side effect', async () => {
      const ui = await switchState(false, 'switch-off');
      await host.reload(); await host.waitForFunction(() => Boolean(window.fixture));
      const availability = await call('availability');
      const raw = await call('raw', {target: {tabId: top.tabId, documentIds: [top.documentId]}, world: 'USER_SCRIPT', js: [{code: "document.body.dataset.denied = 'bad'; 1"}]});
      const denied = await targetPage.evaluate(() => document.body.dataset.denied);
      return {actual: {ui, availability, raw, denied: denied ?? null}, pass: !availability.available && rejected(raw) && denied === undefined};
    });
    await runCase('SWITCH-ON', 'UI on + context reload; execute available, messaging remains disabled', async () => {
      const ui = await switchState(true, 'switch-on');
      await host.reload(); await host.waitForFunction(() => Boolean(window.fixture));
      const availability = await call('availability');
      const configurations = await call('config');
      return {actual: {ui, availability, configurations}, pass: availability.available && availability.executeType === 'function' && configurations.every(item => item.messaging !== true)};
    });
    const enabled = await call('availability');
    if (!enabled.available) throw new Error('Switch enabled but real userScripts API unavailable; remaining cases not tested');

    for (const world of ['USER_SCRIPT', 'MAIN']) {
      await runCase(`${world}-RAW-PROMISE`, 'Native execute waits for Promise and returns exact document/frame', async () => {
        const raw = await call('raw', {target: {tabId: top.tabId, documentIds: [top.documentId]}, world, js: [{code: "(async()=>{await new Promise(r=>setTimeout(r,100));return {value:'awaited',page:document.body.dataset.page};})()"}]});
        return {actual: raw, pass: matched(raw, top) && raw.elapsedMs >= 80 && raw.results[0].result?.value === 'awaited' && raw.results[0].result?.page === 'target'};
      });
      for (const [name, code] of [['THROW', "(()=>{throw new TypeError('native-sync-error');})()"], ['REJECT', "Promise.reject(new RangeError('native-promise-error'))"]]) {
        await runCase(`${world}-RAW-${name}`, 'Record native throw/rejection error shape; no adapter error hiding', async () => {
          const raw = await call('raw', {target: {tabId: top.tabId, documentIds: [top.documentId]}, world, js: [{code}]});
          return {actual: raw, pass: rejected(raw) || (matched(raw, top) && raw.results[0].hasError && !raw.results[0].hasResult)};
        });
      }
      await runCase(`${world}-RAW-UNDEFINED`, 'Record native undefined presence and serialization separately', async () => {
        const raw = await call('raw', {target: {tabId: top.tabId, documentIds: [top.documentId]}, world, js: [{code: '(async()=>undefined)()'}]});
        return {actual: raw, pass: matched(raw, top) && !raw.results[0].hasError && (raw.results[0].resultIsUndefined || raw.results[0].result === null)};
      });
      await runCase(`${world}-CODE`, 'Generated code awaits typed JSON args, including quotes, Unicode and undefined', async () => {
        const source = "async (text, absent, obj) => { await new Promise(r=>setTimeout(r,60)); return {text, absent: absent === undefined, proto: obj['__proto__'], missing: undefined, page: document.body.dataset.page}; }";
        // prepare() receives args directly in the extension so undefined is not lost by Playwright JSON transport.
        const result = await host.evaluate(async ({target, world}) => window.fixture.evaluate({target, world, source: "async (text, absent, obj) => { await new Promise(r=>setTimeout(r,60)); return {text, absent: absent === undefined, proto: obj['__proto__'], missing: undefined, page: document.body.dataset.page}; }", args: ["\"'\\\n中文\u2028</script>", undefined, JSON.parse('{"__proto__":"safe"}')]}), {target: top, world});
        const value = result.accepted?.value;
        return {actual: {source, result}, pass: result.accepted?.kind === 'value' && value.type === 'object' && value.value.some(([key, item]) => key === 'absent' && item.value === true) && value.value.some(([key, item]) => key === 'missing' && item.type === 'undefined') && value.value.some(([key, item]) => key === 'proto' && item.value === 'safe')};
      });
      for (const [name, source, expected] of [
        ['PROMISE', "async () => {await new Promise(r=>setTimeout(r,90));return {ok:'awaited'};}", 'value'],
        ['THROW', "() => {throw new TypeError('wrapped-sync-error');}", 'evaluation-error'],
        ['REJECT', "async () => {await Promise.resolve();throw new RangeError('wrapped-promise-error');}", 'evaluation-error'],
        ['UNDEFINED', 'async () => undefined', 'value'],
        ['TRUE', 'async () => { await new Promise(r => setTimeout(r, 40)); return true; }', 'value'],
        ['FALSE', '() => false', 'value'], ['ZERO', '() => 0', 'value'], ['EMPTY', "() => ''", 'value'], ['NULL', '() => null', 'value'],
        ['BUSINESS', '() => ({PageBrigeCode:1,message:"domain"})', 'value'],
        ['CLOSURE', '() => missingClosureVariableF1', 'evaluation-error']
      ]) {
        await runCase(`${world}-ADAPTER-${name}`, 'Typed wrapper preserves awaited value/error/undefined; no closure capture', async () => {
          const result = await call('evaluate', {target: top, world, source});
          const accepted = result.accepted;
          const scalar = {TRUE: {type: 'boolean', value: true}, FALSE: {type: 'boolean', value: false}, ZERO: {type: 'number', value: 0}, EMPTY: {type: 'string', value: ''}, NULL: {type: 'null'}, UNDEFINED: {type: 'undefined'}};
          const pass = accepted?.kind === expected && (!scalar[name] || JSON.stringify(accepted.value) === JSON.stringify(scalar[name])) &&
            (name !== 'CLOSURE' || accepted.error?.name === 'ReferenceError') &&
            (name !== 'BUSINESS' || (accepted.value?.value?.some(([key, item]) => key === 'PageBrigeCode' && item.value === 1) && accepted.value?.value?.some(([key, item]) => key === 'message' && item.value === 'domain'))) &&
            (!['THROW', 'REJECT'].includes(name) || accepted.error?.message === `wrapped-${name === 'THROW' ? 'sync' : 'promise'}-error`);
          return {actual: result, pass};
        });
      }
      await runCase(`${world}-FILE`, 'ScriptSource file only executes actual packaged file and awaits result', async () => {
        const raw = await call('raw', {target: {tabId: top.tabId, documentIds: [top.documentId]}, world, js: [{file: 'file-source.js'}]});
        const effect = await targetPage.evaluate(() => document.body.dataset.fileSource);
        return {actual: {raw, effect}, pass: matched(raw, top) && raw.results[0].result?.kind === 'file' && effect === 'executed'};
      });
      await runCase(`${world}-WORLD`, 'USER_SCRIPT isolates page globals; MAIN sees page globals; messaging not exposed', async () => {
        const raw = await call('raw', {target: {tabId: top.tabId, documentIds: [top.documentId]}, world, js: [{code: "({pageGlobal: typeof globalThis.__mainOnly, extensionRuntime: typeof globalThis.chrome?.runtime?.sendMessage})"}]});
        return {actual: raw, pass: matched(raw, top) && raw.results[0].result?.pageGlobal === (world === 'MAIN' ? 'string' : 'undefined') && raw.results[0].result?.extensionRuntime === 'undefined'};
      });
      await runCase(`${world}-LEGACY`, 'Legacy statements ignore args and return true without awaiting detached work', async () => {
        const raw = await call('legacy', {target: top, world, statement: "document.body.dataset.legacy='ran'; globalThis.__legacyArguments = arguments.length;", ignoredArgs: ['ignored']});
        return {actual: raw, pass: matched(raw, top) && raw.results[0].result === true};
      });
      const frames = await call('frames', targetTabId);
      for (const name of ['top', 'same', 'cross']) {
        await runCase(`${world}-DOCUMENT-${name.toUpperCase()}`, 'Only selected real iframe document receives mutation; parent/sibling/other tab unchanged', async () => {
          const frame = frames.find(frame => name === 'top' ? frame.frameId === 0 : frame.url.endsWith(`id=${name}`));
          if (!frame) throw new Error(`Real ${name} iframe document not found`);
          const target = frameTarget(frame);
          const marker = `${world}-${name}`;
          const result = await call('evaluate', {target, world, source: `async () => {document.body.dataset.precise=${JSON.stringify(marker)};return document.body.dataset.page;}`});
          const observed = await Promise.all(targetPage.frames().map(async frame => ({url: frame.url(), page: await frame.evaluate(() => document.body.dataset.page), marker: await frame.evaluate(() => document.body.dataset.precise || null)})));
          const otherMarker = await otherPage.evaluate(() => document.body.dataset.precise || null);
          const expectedPage = name === 'top' ? 'target' : name;
          return {actual: {target, result, observed, otherMarker}, pass: result.accepted?.kind === 'value' && result.accepted.value?.value === expectedPage && observed.find(item => item.page === expectedPage)?.marker === marker && !observed.some(item => item.page !== expectedPage && item.marker === marker) && otherMarker === null};
        });
      }
      for (const name of ['top', 'same', 'cross']) {
        await runCase(`${world}-FILE-DOCUMENT-${name.toUpperCase()}`, 'Actual packaged file executes only selected real document; parent/siblings/other tab unchanged', async () => {
          for (const frame of targetPage.frames()) await frame.evaluate(() => delete document.body.dataset.fileSource);
          const frame = frames.find(frame => name === 'top' ? frame.frameId === 0 : frame.url.endsWith(`id=${name}`));
          const target = frameTarget(frame);
          const raw = await call('raw', {target: {tabId: target.tabId, documentIds: [target.documentId]}, world, js: [{file: 'file-source.js'}]});
          const observed = await Promise.all(targetPage.frames().map(async frame => ({url: frame.url(), marker: await frame.evaluate(() => document.body.dataset.fileSource || null)})));
          const other = await otherPage.evaluate(() => document.body.dataset.fileSource || null);
          return {actual: {target, raw, observed, other}, pass: matched(raw, target) && raw.results[0].result?.kind === 'file' && observed.filter(item => item.marker === 'executed').length === 1 && observed.find(item => item.url === target.url)?.marker === 'executed' && other === null};
        });
      }
    }

    for (const [id, change] of [
      ['SOURCE-BOTH', {js: [{code: "document.body.dataset.invalid='bad'", file: 'file-source.js'}]}],
      ['SOURCE-NEITHER', {js: [{}]}],
      ['SOURCE-FUNC-ARGS', {js: [{func: '() => 1', args: []}]}],
      ['TARGET-DOC-FRAME', {target: {tabId: top.tabId, documentIds: [top.documentId], frameIds: [0]}}],
      ['SOURCE-MISSING-FILE', {js: [{file: 'does-not-exist.js'}]}]
    ]) {
      await runCase(id, 'Real Chrome binding rejects invalid ScriptSource or conflicting document/frame target without page mutation; API invocation is separate from script dispatch', async () => {
        const raw = await call('raw', {target: {tabId: top.tabId, documentIds: [top.documentId]}, world: 'USER_SCRIPT', js: [{code: '1'}], ...change});
        const effects = await Promise.all([...targetPage.frames(), otherPage.mainFrame()].map(async frame => ({url: frame.url(), invalid: await frame.evaluate(() => document.body.dataset.invalid || null)})));
        return {actual: {raw, effects}, pass: rejected(raw) && effects.every(item => item.invalid === null)};
      });
    }
    for (const kind of ['native', 'bound', 'nonfinite', 'functionArg', 'bigint', 'cycle', 'missingTarget']) {
      await runCase(`PRE-DISPATCH-${kind.toUpperCase()}`, 'Invalid function/value/target rejected before actual Chrome dispatch (adapter validation, not browser backend proof)', async () => {
        const actual = await call('codecProbe', kind);
        return {actual, pass: Boolean(actual.error) && actual.dispatchCount === 0};
      });
    }
    await runCase('PACKAGED-MAIN-CALLBACK', 'Fixed packaged scripting func/args delivers same document callback once; separate API from userScripts', async () => {
      const value = {text: '中文\"\\\n', type: 'fixture'};
      const raw = await call('callback', {target: top, eventId: 'fixed-return', value});
      const observed = await targetPage.evaluate(() => globalThis.__callbacks);
      return {actual: {raw, observed}, pass: raw.length === 1 && raw[0].documentId === top.documentId && observed.length === 1 && observed[0].id === 'fixed-return' && observed[0].value.text === value.text};
    });

    for (const world of ['USER_SCRIPT', 'MAIN']) {
      await runCase(`${world}-SWITCH-REVOKE-INFLIGHT`, 'UI switch revocation blocks new injection; already-dispatched outcome kept raw and fenced from accepted result', async () => {
        const token = `revoke-${world}`;
        await host.evaluate(({token, spec}) => window.fixture.start(token, spec), {token, spec: {target: top, world, source: holdSource(token)}});
        await targetPage.waitForFunction(token => document.body.dataset.pending === token, token);
        if (!holds.has(token)) await new Promise(done => setTimeout(done, 100));
        if (!holds.has(token)) throw new Error('Network hold barrier not reached');
        const ui = await switchState(false, `revoke-${world}`);
        await host.waitForFunction(token => window.fixture.poll(token)?.availabilityObservations.some(item => item.available === false), token);
        const operationObservation = await call('poll', token);
        const availability = await call('availability');
        const next = await call('raw', {target: {tabId: top.tabId, documentIds: [top.documentId]}, world, js: [{code: `document.body.dataset.postRevoke=${JSON.stringify(token)};1`}]});
        const released = release(token);
        const settled = await settle(token);
        const effects = await targetPage.evaluate(() => ({finished: document.body.dataset.finished || null, postRevoke: document.body.dataset.postRevoke || null}));
        await switchState(true, `re-enabled-${world}`);
        return {actual: {ui, operationObservation, availability, next, released, settled, effects}, pass: !availability.available && rejected(next) && settled.result.accepted.kind === 'rejected' && settled.settlementCount === 1 && effects.postRevoke !== token};
      });
      await runCase(`${world}-OLD-DOCUMENT-RACE`, 'Navigation at actual pending barrier changes real document; no old result completes new target; no stale mutation reaches new doc', async () => {
        const old = await topTarget();
        const token = `navigate-${world}`;
        await host.evaluate(({token, spec}) => window.fixture.start(token, spec), {token, spec: {target: old, world, source: holdSource(token)}});
        await targetPage.waitForFunction(token => document.body.dataset.pending === token, token);
        await targetPage.goto(`${base}/top?id=after-${world}`);
        const current = await topTarget();
        const released = release(token);
        const settled = await settle(token);
        const stale = await call('raw', {target: {tabId: old.tabId, documentIds: [old.documentId]}, world, js: [{code: "document.body.dataset.stale='bad';1"}]});
        const fresh = await call('evaluate', {target: current, world, source: '() => document.body.dataset.page'});
        const staleEffect = await targetPage.evaluate(() => document.body.dataset.stale || null);
        const oldCallback = await call('callback', {target: old, eventId: 'old-return', value: {old: true}}).then(value => ({kind: 'resolved', value}), error => ({kind: 'rejected', error: errorRecord(error)}));
        const callbacks = await targetPage.evaluate(() => globalThis.__callbacks);
        top = current;
        return {actual: {old, current, released, settled, stale, fresh, staleEffect, oldCallback, callbacks}, pass: current.documentId !== old.documentId && settled.result.accepted.kind === 'rejected' && rejected(stale) && fresh.accepted.kind === 'value' && staleEffect === null && oldCallback.kind === 'rejected' && callbacks.length === 0};
      });
    }

    for (const world of ['USER_SCRIPT', 'MAIN']) {
      await runCase(`${world}-SWITCH-REVOKE-AFTER-NATIVE`, 'Original contract: real switch after native completion; operation-owned native observation fences old result after ON', async () => {
        const token = `switch-after-native-${world}`;
        await host.evaluate(({token, spec}) => window.fixture.start(token, spec), {token, spec: {target: top, world, source: `() => {document.body.dataset.finished=${JSON.stringify(token)};return true;}`, acceptanceBarrier: token}});
        await host.waitForFunction(token => Boolean(window.fixture.poll(token)?.nativeCompletedAt), token);
        const nativeCompleted = await call('poll', token);
        const off = await switchState(false, `switch-after-native-off-${world}`);
        await host.waitForFunction(token => window.fixture.poll(token)?.availabilityObservations.some(item => item.available === false), token);
        const operationObservation = await call('poll', token);
        const on = await switchState(true, `switch-after-native-on-${world}`);
        await call('releaseAcceptance', token);
        const settled = await settle(token);
        const effect = await targetPage.evaluate(() => document.body.dataset.finished);
        const fresh = await call('evaluate', {target: top, world, source: '() => true'});
        return {actual: {nativeCompleted, off, operationObservation, on, settled, effect, fresh}, pass: nativeCompleted.native?.kind === 'resolved' && operationObservation.fence?.observedBy === 'operation-owned chrome.userScripts.getScripts' && settled.result.accepted?.kind === 'rejected' && settled.settlementCount === 1 && effect === token && fresh.accepted?.value?.value === true};
      });
      await runCase(`${world}-HOST-UI-REVOKE-RESTORE`, 'Real site UI revokes before dispatch; actual browser permission and mutation negative control; only real restoration permits new exact-doc call', async () => {
        const before = await call('authorization', top);
        const off = await siteState(false, `host-off-${world}`);
        const revoked = await call('authorization', top);
        const token = `host-denied-${world}`;
        const wrappedDenied = await call('evaluate', {target: top, world, source: `() => {document.body.dataset.wrapperHostDenied=${JSON.stringify(token)};return true;}`});
        const denied = await call('observeRaw', {injection: {target: {tabId: top.tabId, documentIds: [top.documentId]}, world, js: [{code: `document.body.dataset.hostDenied=${JSON.stringify(token)};1`}]}});
        const effect = await targetPage.evaluate(() => document.body.dataset.hostDenied || null);
        const on = await siteState(true, `host-on-${world}`);
        const restored = await call('evaluate', {target: top, world, source: '() => true'});
        const effectAfterRestore = await targetPage.evaluate(() => document.body.dataset.hostDenied || null);
        return {actual: {before, off, revoked, wrappedDenied, denied, effectBeforeRestore: effect, effectAfterRestore, on, restored}, pass: before.kind === 'authorized' && off.after === 'false' && rejected(revoked) && wrappedDenied.accepted?.kind === 'rejected' && wrappedDenied.dispatchCount === 0 && (rejected(denied) || denied.kind === 'pending-at-observation-deadline') && effect !== token && on.after === 'true' && restored.accepted?.value?.value === true};
      });
      for (const phase of ['pending', 'native-completed']) {
        await runCase(`${world}-HOST-UI-RACE-${phase.toUpperCase()}`, 'Real site UI revocation fences original result once even after restoration; already issued effect/raw delivery recorded separately', async () => {
          const token = `host-${phase}-${world}`;
          const source = phase === 'pending' ? holdSource(token) : `() => {document.body.dataset.finished=${JSON.stringify(token)};return true;}`;
          await host.evaluate(({token, spec}) => window.fixture.start(token, spec), {token, spec: {target: top, world, source, acceptanceBarrier: token}});
          if (phase === 'pending') {
            await targetPage.waitForFunction(token => document.body.dataset.pending === token, token);
            await host.waitForFunction(() => true);
            for (let tries = 0; !holds.has(token) && tries < 100; tries++) await new Promise(done => setTimeout(done, 10));
            if (!holds.has(token)) throw new Error('Actual HTTP pending barrier missing');
          } else await host.waitForFunction(token => Boolean(window.fixture.poll(token)?.nativeCompletedAt), token);
          const beforeRevoke = await call('poll', token);
          const off = await siteState(false, `race-off-${phase}-${world}`);
          const wrappedNext = await call('evaluate', {target: top, world, source: '() => true'});
          const next = await call('observeRaw', {injection: {target: {tabId: top.tabId, documentIds: [top.documentId]}, world, js: [{code: `document.body.dataset.postHostRevoke=${JSON.stringify(token)};1`}]}});
          const effectBeforeRestore = await targetPage.evaluate(() => document.body.dataset.postHostRevoke || null);
          const released = phase === 'pending' ? release(token) : null;
          await host.waitForFunction(token => Boolean(window.fixture.poll(token)?.nativeCompletedAt), token);
          const rawCompleted = await call('poll', token);
          const on = await siteState(true, `race-on-${phase}-${world}`);
          await call('releaseAcceptance', token);
          const settled = await settle(token);
          const effects = await targetPage.evaluate(() => ({finished: document.body.dataset.finished, postHostRevoke: document.body.dataset.postHostRevoke || null}));
          const fresh = await call('evaluate', {target: top, world, source: '() => true'});
          return {actual: {beforeRevoke, off, wrappedNext, next, effectBeforeRestore, released, rawCompleted, on, settled, effectsAfterRestore: effects, fresh}, pass: settled.fence?.observedBy === 'chrome.permissions.onRemoved' && wrappedNext.accepted?.kind === 'rejected' && (rejected(next) || next.kind === 'pending-at-observation-deadline') && settled.result.accepted?.kind === 'rejected' && settled.settlementCount === 1 && effectBeforeRestore !== token && fresh.accepted?.value?.value === true};
        });
      }
      for (const phase of ['pending', 'native-completed']) {
        for (const cause of ['SWITCH-OBSERVED', 'OWN-GRANT', 'CANCEL', 'DEADLINE']) {
          await runCase(`${world}-${cause}-${phase.toUpperCase()}`, 'Existing contract strengthening: actual operation-owned invalidation sticks, old result rejects once, genuinely new operation works', async () => {
            const token = `${cause}-${phase}-${world}`;
            const source = phase === 'pending' ? holdSource(token) : `() => {document.body.dataset.finished=${JSON.stringify(token)};return true;}`;
            const spec = {target: top, world, source, acceptanceBarrier: token, ...(cause === 'DEADLINE' ? {deadlineMs: 150} : {})};
            const grantBefore = await call('ownGrantState');
            await host.evaluate(({token, spec}) => window.fixture.start(token, spec), {token, spec});
            if (phase === 'pending') {
              await targetPage.waitForFunction(token => document.body.dataset.pending === token, token);
              for (let tries = 0; !holds.has(token) && tries < 100; tries++) await new Promise(done => setTimeout(done, 10));
              if (!holds.has(token)) throw new Error('Actual pending HTTP barrier missing');
            } else await host.waitForFunction(token => Boolean(window.fixture.poll(token)?.nativeCompletedAt), token);
            let off, on, next, rawNext, offEffect;
            if (cause === 'SWITCH-OBSERVED') {
              off = await switchState(false, `${token}-off`);
              await host.waitForFunction(token => window.fixture.poll(token)?.availabilityObservations.some(item => item.available === false), token);
              next = await call('evaluate', {target: top, world, source: `() => {document.body.dataset.newOff=${JSON.stringify(token)};return true;}`});
              rawNext = await call('raw', {target: {tabId: top.tabId, documentIds: [top.documentId]}, world, js: [{code: `document.body.dataset.newOff=${JSON.stringify(token)};true`}]});
              offEffect = await targetPage.evaluate(() => document.body.dataset.newOff || null);
              on = await switchState(true, `${token}-on`);
            } else if (cause === 'OWN-GRANT') {
              await host.locator('#revoke-own-grant').click();
              off = await call('ownGrantState');
              // Caller-provided authority fields have no role in the host's private epoch.
              next = await call('evaluate', {target: top, world, source: '() => true', ownGrantEpoch: off.epoch, ownGrantEnabled: true});
              await snapshot(`${token}-revoked`);
              await host.locator('#renew-own-grant').click();
              on = await call('ownGrantState');
            } else if (cause === 'CANCEL') {
              await host.locator('#cancel-operations').click();
              off = await call('ownGrantState');
            } else await host.waitForFunction(token => window.fixture.poll(token)?.fence?.message === 'E_OPERATION_DEADLINE', token);
            const invalidated = await call('poll', token);
            const released = phase === 'pending' ? release(token) : null;
            await host.waitForFunction(token => Boolean(window.fixture.poll(token)?.nativeCompletedAt), token);
            const nativeCompleted = await call('poll', token);
            await call('releaseAcceptance', token);
            const settled = await settle(token);
            const effect = await targetPage.evaluate(() => document.body.dataset.finished || null);
            const fresh = await call('evaluate', {target: top, world, source: cause === 'SWITCH-OBSERVED' ? `() => {document.body.dataset.newOff=${JSON.stringify(token)};return true;}` : '() => true'});
            const restoredEffect = cause === 'SWITCH-OBSERVED' ? await targetPage.evaluate(() => document.body.dataset.newOff || null) : undefined;
            const grantAfter = await call('ownGrantState');
            const expectedReason = { 'OWN-GRANT': 'E_OWN_GRANT_REVOKED', CANCEL: 'E_OPERATION_CANCELLED', DEADLINE: 'E_OPERATION_DEADLINE' }[cause];
            const causeProved = cause === 'SWITCH-OBSERVED'
              ? invalidated.fence?.observedBy === 'operation-owned chrome.userScripts.getScripts' && next.accepted?.kind === 'rejected' && rejected(rawNext) && offEffect !== token
              : invalidated.fence?.message === expectedReason && (cause !== 'OWN-GRANT' || !off.enabled && on.enabled && on.epoch > off.epoch && next.accepted?.kind === 'rejected' && off.events.at(-1)?.isTrusted && on.events.at(-1)?.isTrusted);
            return {actual: {phase, cause, spec, grantBefore, off, on, next, rawNext, offEffect, invalidated, released, nativeCompleted, settled, effect, fresh, restoredEffect, grantAfter, runnerFenceWrites: false}, pass: causeProved && settled.result.accepted?.kind === 'rejected' && settled.settlementCount === 1 && settled.fence?.at === invalidated.fence?.at && effect === token && fresh.accepted?.value?.value === true && (cause !== 'SWITCH-OBSERVED' || restoredEffect === token)};
          });
        }
        const originalCycle = await runCase(`${world}-SWITCH-UNOBSERVED-ORIGINAL-${phase.toUpperCase()}`, 'UNCHANGED original history contract requires old result fenced; an unobserved real OFF/ON is still FAIL if old result is accepted', async () => {
          const token = `unobserved-original-${phase}-${world}`;
          const source = phase === 'pending' ? holdSource(token) : `() => {document.body.dataset.finished=${JSON.stringify(token)};return true;}`;
          await host.evaluate(({token, spec}) => window.fixture.start(token, spec), {token, spec: {target: top, world, source, acceptanceBarrier: token}});
          if (phase === 'pending') {
            await targetPage.waitForFunction(token => document.body.dataset.pending === token, token);
            for (let tries = 0; !holds.has(token) && tries < 100; tries++) await new Promise(done => setTimeout(done, 10));
            if (!holds.has(token)) throw new Error('Actual pending HTTP barrier missing');
          } else await host.waitForFunction(token => Boolean(window.fixture.poll(token)?.nativeCompletedAt), token);
          const beforeHost = await observeHost();
          const before = await call('poll', token);
          const authorityBefore = {grant: await call('ownGrantState'), permissions: await call('permissions')};
          await settings.goto(`chrome://extensions/?id=${extensionId}`);
          const toggle = settings.locator('extensions-detail-view #allow-user-scripts cr-toggle');
          await toggle.waitFor({state: 'visible'});
          // A real bounded host task blocks its event loop. The operation monitor
          // stays enabled; no timer/API/fence state is disabled or injected.
          const task = host.evaluate(({durationMs, token}) => {
            const started = Date.now();
            const monitorAtStart = {stopped: window.fixture.poll(token)?.monitorStopped, active: window.fixture.resources().authorizationMonitors};
            while (Date.now() - started < durationMs) {}
            const monitorAtEnd = {stopped: window.fixture.poll(token)?.monitorStopped, active: window.fixture.resources().authorizationMonitors};
            return {started, finished: Date.now(), durationMs, monitorAtStart, monitorAtEnd};
          }, {durationMs: 2500, token});
          const offStarted = Date.now();
          await toggle.click(); await pollActual(async () => await readToggle(toggle) === 'false');
          const offConfirmed = Date.now(); await snapshot(`${token}-off`, settings);
          const released = phase === 'pending' ? release(token) : null;
          await toggle.click(); await pollActual(async () => await readToggle(toggle) === 'true');
          const onConfirmed = Date.now(); await snapshot(`${token}-on`, settings);
          const hostTask = await task;
          const afterHost = await observeHost();
          const authorityAfter = {grant: await call('ownGrantState'), permissions: await call('permissions')};
          await host.waitForFunction(token => Boolean(window.fixture.poll(token)?.nativeCompletedAt), token);
          await call('releaseAcceptance', token);
          const settled = await settle(token);
          const fresh = await call('evaluate', {target: top, world, source: '() => true'});
          const effect = await targetPage.evaluate(() => document.body.dataset.finished || null);
          const actuallyObservedOff = settled.availabilityObservations.some(item => item.available === false);
          const cycleWithinHostTask = offConfirmed >= hostTask.started && onConfirmed <= hostTask.finished;
          const monitorAlwaysEnabled = hostTask.monitorAtStart.stopped === false && hostTask.monitorAtEnd.stopped === false && hostTask.monitorAtStart.active > 0 && hostTask.monitorAtEnd.active > 0;
          return {actual: {phase, beforeHost, before, authorityBefore, offStarted, offConfirmed, onConfirmed, hostTask, afterHost, authorityAfter, cycleWithinHostTask, actuallyObservedOff, settled, fresh, effect, originalExpected: 'old result fenced', originalExpectedRetained: true, monitorAlwaysEnabled}, pass: cycleWithinHostTask && monitorAlwaysEnabled && beforeHost.documentId === afterHost.documentId && beforeHost.timeOrigin === afterHost.timeOrigin && settled.result.accepted?.kind === 'rejected' && settled.settlementCount === 1 && fresh.accepted?.value?.value === true};
        });
        await runCase(`${world}-SWITCH-UNOBSERVED-CYCLE-LIMIT-${phase.toUpperCase()}`, 'Approved round6 limit assessment of the actual UI cycle: retain original FAIL separately; observed OFF must reject, genuinely unobserved cycle has no retrospective cancellation guarantee', async () => {
          if (!originalCycle?.actual) throw new Error('Actual original UI cycle evidence missing');
          const a = originalCycle.actual;
          const unchangedHost = a.beforeHost.documentId === a.afterHost.documentId && a.beforeHost.timeOrigin === a.afterHost.timeOrigin;
          const unchangedAuthority = a.authorityBefore.grant.enabled && a.authorityAfter.grant.enabled && a.authorityBefore.grant.epoch === a.authorityAfter.grant.epoch && JSON.stringify(a.authorityBefore.permissions) === JSON.stringify(a.authorityAfter.permissions);
          const observed = a.actuallyObservedOff;
          const acceptedKind = a.settled.result.accepted?.kind;
          return {assessmentOnly: true, evidenceBasisCaseId: originalCycle.id, actual: {world, phase, actualUICycleCaseId: originalCycle.id, nativeInputEvidenceCaseId: originalCycle.id, approvedSubcase: 'F1-PAGE-AUTH-CSP/UNOBSERVED-CYCLE-LIMIT', originalHistoryContractMet: originalCycle.pass, mechanismObservedOff: observed, unchangedAuthority, limitActuallyExercised: !observed, disposition: observed ? 'observed OFF: sticky rejection required; not limit confirmation' : 'unobserved cycle: limit confirmation only, not historical fence proof', cycle: a}, pass: a.cycleWithinHostTask && unchangedHost && unchangedAuthority && a.monitorAlwaysEnabled && a.settled.settlementCount === 1 && (observed ? acceptedKind === 'rejected' : acceptedKind === 'value' && !a.settled.fence) && a.fresh.accepted?.value?.value === true};
        });
      }
      await runCase(`${world}-OLD-DOCUMENT-RACE-AFTER-NATIVE`, 'Actual document replacement monotonically fences a held native-completed result; fresh exact-doc call succeeds', async () => {
        const token = `doc-completed-${world}`, old = top;
        await host.evaluate(({token, spec}) => window.fixture.start(token, spec), {token, spec: {target: old, world, source: '() => true', acceptanceBarrier: token}});
        await host.waitForFunction(token => Boolean(window.fixture.poll(token)?.nativeCompletedAt), token);
        await targetPage.goto(`${base}/top?id=${token}`); top = await topTarget();
        await call('releaseAcceptance', token);
        const settled = await settle(token);
        const fresh = await call('evaluate', {target: top, world, source: '() => true'});
        return {actual: {old, current: top, settled, fresh}, pass: old.documentId !== top.documentId && settled.fence?.observedBy === 'chrome.webNavigation.onCommitted' && settled.result.accepted?.kind === 'rejected' && settled.settlementCount === 1 && fresh.accepted?.value?.value === true};
      });
    }

    const queuedBeforeNavigation = {trace: await call('trace'), effects: await targetPage.evaluate(() => ({hostDenied: document.body.dataset.hostDenied || null, postHostRevoke: document.body.dataset.postHostRevoke || null}))};
    for (const pagePolicy of ['baseline', 'restrictive']) {
      await targetPage.goto(`${base}/${pagePolicy === 'restrictive' ? 'csp' : 'top'}?id=csp-${pagePolicy}`);
      top = await topTarget();
      for (const world of ['MAIN', 'USER_SCRIPT']) {
        for (const worldPolicy of (world === 'USER_SCRIPT' ? ['allow', 'deny'] : ['page'])) {
          await runCase(`CSP-${pagePolicy.toUpperCase()}-${world}-${worldPolicy.toUpperCase()}`, 'Exact-doc execution and effective page/world CSP measured using HTTP positive/negative controls and actual violations', async () => {
            const worldId = world === 'USER_SCRIPT' ? `m5-${pagePolicy}-${worldPolicy}` : undefined;
            const policy = worldPolicy === 'deny' ? "script-src 'self'; connect-src 'none'" : "script-src 'self'; connect-src *";
            const config = worldId ? await call('configureWorld', {worldId, csp: policy, messaging: false}) : await call('config');
            const token = `csp-${pagePolicy}-${world}-${worldPolicy}`;
            const source = `async () => {document.body.dataset.cspExecuted=${JSON.stringify(token)};try {const response=await fetch(${JSON.stringify(`${base}/probe?token=${token}`)});return {network:true,status:response.status};} catch(error) {return {network:false,error:String(error)};}}`;
            const start = httpLog.length;
            const result = await call('evaluate', {target: top, world, worldId, source});
            const http = httpLog.slice(start).filter(item => item.url.includes(token));
            const effect = await targetPage.evaluate(() => document.body.dataset.cspExecuted);
            const expectedNetwork = world === 'MAIN' ? pagePolicy === 'baseline' : worldPolicy === 'allow';
            const value = result.accepted?.value?.value;
            const network = value?.find(([key]) => key === 'network')?.[1]?.value;
            const inline = await targetPage.evaluate(() => { const script=document.createElement('script');script.textContent="document.body.dataset.inlineCsp='executed'";document.body.append(script);return document.body.dataset.inlineCsp || null; });
            const file = await call('raw', {target: {tabId: top.tabId, documentIds: [top.documentId]}, world, ...(worldId ? {worldId} : {}), js: [{file: 'file-source.js'}]});
            return {actual: {target: top, pagePolicy, world, worldId, policy, config, source, result, file, http, effect, inline}, pass: result.accepted?.kind === 'value' && effect === token && network === expectedNetwork && (expectedNetwork ? http.length === 1 : http.length === 0) && (pagePolicy === 'baseline' ? inline === 'executed' : inline === null) && matched(file, top) && file.results[0].result?.kind === 'file'};
          });
        }
      }
    }
    await writeJSON(resolve(output, 'queued-native-observations.json'), {beforeNavigation: queuedBeforeNavigation, afterNavigation: await call('trace'),
      note: 'Direct native calls issued while site access withheld may remain pending then resolve result:null on old document disposal; these are not adapter dispatches or proven native rejection.'});

    await runCase('HOST-PERMISSION-REVOKE', 'Actual host permission removal rejects execute, independent of userScripts switch', async () => {
      const before = await call('permissions');
      const removed = await call('removeHosts');
      const after = await call('permissions');
      const results = [];
      for (const world of ['USER_SCRIPT', 'MAIN']) results.push({world, raw: await call('raw', {target: {tabId: top.tabId, documentIds: [top.documentId]}, world, js: [{code: "document.body.dataset.hostDenied='bad';1"}]})});
      const hostDenied = await targetPage.evaluate(() => document.body.dataset.hostDenied || null);
      await snapshot('hosts-revoked', settings);
      return {actual: {before, removed, after, results, hostDenied, events: await call('permissionEvents')}, pass: removed === true && !after.origins?.includes('http://127.0.0.1/*') && results.every(item => rejected(item.raw)) && hostDenied === null};
    });
    await runCase('HOST-PERMISSION-RESTORE', 'Legacy request succeeds but preceding required-permission removal failed: this is not UI restoration proof', async () => {
      await host.getByRole('button', {name: 'Restore loopback host permissions'}).click();
      await host.waitForFunction(() => Boolean(window.restoreResult), {timeout: 10000});
      const restore = await host.evaluate(() => window.restoreResult);
      const permissions = await call('permissions');
      const results = [];
      for (const world of ['USER_SCRIPT', 'MAIN']) results.push(await call('evaluate', {target: top, world, source: '() => true'}));
      return {actual: {restore, permissions, results, restorationProven: false}, pass: restore.granted === true && results.every(item => item.accepted.kind === 'value')};
    });
    await host.evaluate(value => window.fixture.show(value), {candidateSha256, actualBrowser, results: cases.map(item => ({id: item.id, status: item.status, pass: item.pass}))});
    await snapshot('results');
    await snapshot('owned-target', targetPage);
    await writeJSON(resolve(output, 'raw-injections.json'), await call('trace'));
    await writeJSON(resolve(output, 'packaged-main-callbacks.json'), await call('packagedTrace'));
    fixtureResources = await call('resources');
    await writeJSON(resolve(output, 'fixture-resources.json'), {baseline: resourceBaseline, after: fixtureResources, baselineRestored: JSON.stringify(resourceBaseline) === JSON.stringify(fixtureResources)});
  }
} catch (error) {
  initializationFailure = errorRecord(error);
  console.log(JSON.stringify({initializationFailure}));
} finally {
  for (const response of holds.values()) response.destroy();
  holds.clear();
  let browserContextClosed = false;
  let cleanupError;
  try { if (context) await context.close(); browserContextClosed = true; } catch (error) { cleanupError = errorRecord(error); }
  await new Promise(done => server.close(done));
  const failed = cases.filter(item => item.status === 'failed');
  const report = {schema: 1, startedAt, finishedAt: new Date().toISOString(), runId, scope: 'F1 userScripts prototype only',
    requestedModel: {leader: 'gpt-6.1-sol', reasoning: 'xhigh', serverResolvedRuntime: 'unknown'},
    candidateSha256, approvedPlanManifestSha256: candidate.approvedPlanManifestSha256, designManifestSha256: candidate.designManifestSha256, frozenInputs: inputs, actualBrowser, httpServer: {base, requests: httpLog.length},
    actual: cases.filter(item => item.status === 'actual'), failed,
    executionMode: focusLifecycle ? 'targeted lifecycle under approved round6 contract' : 'full prototype matrix',
    notExecuted, contractExpectedRevision: 'approved round6; original history expectations retained separately',
    notTested: ['F2 product integration and atomic authority admission/settlement', 'F3 real workbench/revisions/persistence/download', 'Worker/CSP/RPC/termination: owned by leader', 'page infinite-loop termination: no general guarantee'],
    initializationFailure, screenshots, hostLifecycle, sourceHashes: sources, productPackageSha256: null,
    cleanup: {resourceBaseline, fixtureResources, browserContextClosed, loopbackServerClosed: !server.listening, outstandingHolds: holds.size, error: cleanupError},
    userScriptsRequiredCasesPassed: !focusLifecycle && !argv.includes('--probe-ui') && !initializationFailure && cases.length > 0 && failed.filter(item => item.required).length === 0,
    fullF1GateDecision: 'not made by this fixture; independent combined review required'};
  if (initializationFailure) report.notTested.push('remaining planned browser cases after the recorded initialization failure');
  const diagnosticIds = ['USER_SCRIPT-RAW-THROW', 'USER_SCRIPT-RAW-REJECT', 'MAIN-RAW-THROW', 'MAIN-RAW-REJECT', 'HOST-PERMISSION-REVOKE'];
  const originalHistoryCases = cases.filter(item => item.id.includes('-SWITCH-UNOBSERVED-ORIGINAL-'));
  report.accounting = {
    rawFunctionAttempts: cases.reduce((n, item) => n + item.input.nativeInjections.length, 0),
    chromeUserScriptsExecuteInvocations: cases.reduce((n, item) => n + item.input.nativeInjections.filter(raw => raw.apiInvoked).length, 0),
    unavailableBeforeChromeExecute: cases.flatMap(item => item.input.nativeInjections.filter(raw => !raw.apiInvoked)),
    chromeScriptingExecuteInvocations: cases.reduce((n, item) => n + item.input.packagedInjections.length, 0),
    adapterPrevalidation: cases.filter(item => item.id.startsWith('PRE-DISPATCH-')),
    nativeErrorDiagnostics: cases.filter(item => diagnosticIds.slice(0, 4).includes(item.id)),
    legacyRequiredRemove: cases.find(item => item.id === 'HOST-PERMISSION-REVOKE'),
    legacyRequestNotRestoration: cases.find(item => item.id === 'HOST-PERMISSION-RESTORE'),
    originalHistoryCases,
    limitAssessments: cases.filter(item => item.assessmentOnly),
    otherFailedRequiredCases: failed.filter(item => !diagnosticIds.includes(item.id) && !originalHistoryCases.includes(item)),
    note: 'Case totals are not counts of successful backend execution. Historical expectation failures remain failed; pending native observations are not rejection; no F1/F2 qualification decision.'
  };
  const contracts = JSON.parse(await readFile(resolve(approvedRoot, 'stage0/f1-cases.json'), 'utf8'));
  const coverage = {
    'F1-PAGE-SOURCE-DOC': item => /-CODE$|-FILE$|-DOCUMENT-|^SOURCE-|^TARGET-|OLD-DOCUMENT/.test(item.id),
    'F1-PAGE-TYPED-RESULTS': item => /ADAPTER-|PRE-DISPATCH-|-CODE$/.test(item.id),
    'F1-PAGE-NATIVE-DIAGNOSTICS': item => /RAW-(THROW|REJECT|UNDEFINED)/.test(item.id),
    'F1-PAGE-AUTH-CSP': item => /SWITCH-|HOST-UI-|OWN-GRANT-|CANCEL-|DEADLINE-|^CSP-/.test(item.id),
    'F1-PAGE-OLD-DOC-RACE': item => /OLD-DOCUMENT|PACKAGED-MAIN-CALLBACK/.test(item.id),
    'F1-VERSION-MATRIX': () => true
  };
  report.approvedContractCoverage = contracts.filter(item => coverage[item.id]).map(item => ({contract: item, observedCases: cases.filter(coverage[item.id]).map(test => ({id: test.id, pass: test.pass})), independentDisposition: 'pending', scope: 'page lane only; combined control/page version matrix belongs to main writer'}));
  const authContract = contracts.find(item => item.id === 'F1-PAGE-AUTH-CSP');
  const scenarios = new Map(authContract.requiredSubcases.map(item => [item.id, []]));
  const addScenario = (subcase, id, world, phase, authority, predicate) => {
    const item = cases.find(test => test.id === id), actual = item?.actual;
    let met = false;
    try { met = Boolean(item?.pass && predicate(actual, item)); } catch {}
    scenarios.get(`F1-PAGE-AUTH-CSP/${subcase}`).push({caseId: id, world, phase, authority, executed: Boolean(item), actualContractMet: met,
      nativeInputEvidenceCaseId: item?.evidenceBasisCaseId || id, assessmentOnly: item?.assessmentOnly || false,
      effect: actual?.effect ?? actual?.effectsAfterRestore ?? actual?.cycle?.effect,
      delivery: actual?.settled?.result?.accepted ?? actual?.cycle?.settled?.result?.accepted,
      cleanup: item?.cleanup});
  };
  for (const world of ['USER_SCRIPT', 'MAIN']) for (const phase of ['pending', 'native-completed']) {
    const observedId = `${world}-SWITCH-OBSERVED-${phase.toUpperCase()}`;
    addScenario('OFF-NEW-CALL', observedId, world, phase, 'native API availability', (a, item) =>
      a.off.after === 'false' && a.on.after === 'true' && a.next.accepted.kind === 'rejected' && a.next.dispatchCount === 0 && rejected(a.rawNext) &&
      item.input.nativeInjections.some(call => call.apiInvoked && call.outcome?.kind === 'rejected' && call.outcome.error.message.includes('not available')) &&
      a.offEffect !== a.spec.acceptanceBarrier && a.restoredEffect === a.spec.acceptanceBarrier && a.fresh.accepted.value.value === true);
    addScenario('OBSERVED-OFF-STICKY', observedId, world, phase, 'operation-owned native observation', a =>
      a.invalidated.availabilityObservations.some(probe => probe.available === false) && a.invalidated.fence.observedBy === 'operation-owned chrome.userScripts.getScripts' &&
      a.settled.fence.at === a.invalidated.fence.at && a.settled.result.accepted.kind === 'rejected' && a.settled.settlementCount === 1 && a.fresh.accepted.value.value === true);
    addScenario('UNOBSERVED-CYCLE-LIMIT', `${world}-SWITCH-UNOBSERVED-CYCLE-LIMIT-${phase.toUpperCase()}`, world, phase, 'explicit unobserved history limit', a =>
      a.unchangedAuthority && a.cycle.monitorAlwaysEnabled && a.cycle.cycleWithinHostTask &&
      (a.mechanismObservedOff ? a.cycle.settled.result.accepted.kind === 'rejected' : a.limitActuallyExercised && !a.originalHistoryContractMet));
    addScenario('REAL-AUTHORITY-FENCE', `${world}-HOST-UI-RACE-${phase.toUpperCase()}`, world, phase, 'origin permission', a =>
      a.off.after === 'false' && a.on.after === 'true' && a.settled.fence.observedBy === 'chrome.permissions.onRemoved' && a.settled.result.accepted.kind === 'rejected' && a.settled.settlementCount === 1 && a.fresh.accepted.value.value === true);
    addScenario('REAL-AUTHORITY-FENCE', `${world}-OWN-GRANT-${phase.toUpperCase()}`, world, phase, 'trusted host ownGrant epoch', a =>
      !a.off.enabled && a.on.enabled && a.on.epoch > a.off.epoch && a.off.events.at(-1).isTrusted && a.on.events.at(-1).isTrusted &&
      a.next.accepted.kind === 'rejected' && a.next.dispatchCount === 0 && a.settled.fence.observedBy === 'trusted host grant UI' && a.settled.settlementCount === 1 && a.fresh.accepted.value.value === true);
    addScenario('REAL-AUTHORITY-FENCE', `${world}-OLD-DOCUMENT-RACE${phase === 'pending' ? '' : '-AFTER-NATIVE'}`, world, phase, 'actual document invalidation', a =>
      a.old.documentId !== a.current.documentId && a.settled.fence.observedBy === 'chrome.webNavigation.onCommitted' && a.settled.result.accepted.kind === 'rejected' && a.settled.settlementCount === 1 && a.fresh.accepted.kind === 'value');
  }
  report.requiredSubcaseCoverage = authContract.requiredSubcases.map(item => ({contract: item, scenarios: scenarios.get(item.id), independentDisposition: 'pending'}));
  report.missingOrFailedRequiredSubcaseScenarios = report.requiredSubcaseCoverage.flatMap(item => item.scenarios.filter(s => !s.executed || !s.actualContractMet).map(s => ({subcaseId: item.contract.id, ...s})));
  report.currentContractFailureCaseIds = report.accounting.otherFailedRequiredCases.map(item => item.id);
  report.historyAccountingNote = 'Original raw/required-remove FAIL and original UI-history FAIL remain failed. Separate approved-limit assessments reuse named real UI evidence and are not additional Chrome executions or proof of historical fencing. Author does not qualify F1.';
  await writeJSON(resolve(output, 'console.json'), logs);
  await writeJSON(resolve(output, 'http.json'), httpLog);
  await writeJSON(resolve(output, 'report.json'), report);
  const files = [...(await readdir(output)).filter(name => name !== 'evidence-manifest.json' && name !== 'source'), ...sources.map(item => `source/${item.path}`)].sort();
  const evidence = [];
  for (const name of files) { const bytes = await readFile(resolve(output, name)); evidence.push({path: name, bytes: bytes.length, sha256: sha(bytes)}); }
  await writeJSON(resolve(output, 'evidence-manifest.json'), {candidateSha256, files: evidence});
  console.log(JSON.stringify({output, candidateSha256, actual: report.actual.length, failed: report.failed.length, userScriptsRequiredCasesPassed: report.userScriptsRequiredCasesPassed, initializationFailure: initializationFailure?.message}));
  process.exitCode = argv.includes('--probe-ui') ? (initializationFailure ? 1 : 0) : (report.userScriptsRequiredCasesPassed ? 0 : 1);
}
