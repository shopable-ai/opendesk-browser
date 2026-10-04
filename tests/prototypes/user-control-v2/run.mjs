import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const require = createRequire(import.meta.url);
const {chromium} = require('/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(root, 'fixture'), output = resolve(root, 'evidence/m5-round6-playwright-diagnostic-' + new Date().toISOString().replaceAll(':', '-'));
await mkdir(output, {recursive: true});
const executable = process.env.OPENDESK_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome for Testing';
const hits = [];
const server = createServer((request, response) => {
  hits.push(request.url);
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (request.url.startsWith('/probe')) { response.end('reachable'); return; }
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><title>OpenDesk real form</title><input id="name" value="Base"><button id="submit">Submit</button><script>
    document.querySelector('#submit').onclick=()=>setTimeout(()=>{let e=document.createElement('p');e.id='result';e.textContent=document.querySelector('#name').value;document.body.append(e)},60);
  </script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const logs = [], cases = [];
let context, report = {};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
try {
  context = await chromium.launchPersistentContext(resolve(output, 'profile'), {
    executablePath: executable, headless: false,
    args: [`--disable-extensions-except=${fixture}`, `--load-extension=${fixture}`]
  });
  const expectedManifest = JSON.parse(await readFile(resolve(fixture, 'manifest.json'), 'utf8'));
  let sw;
  const identityDeadline = Date.now() + 15000;
  while (!sw && Date.now() < identityDeadline) {
    for (const candidate of context.serviceWorkers()) {
      if (!candidate.url().startsWith('chrome-extension://') || new URL(candidate.url()).pathname !== '/sw.js') continue;
      const identity = await candidate.evaluate(() => ({id: chrome.runtime.id, manifest: chrome.runtime.getManifest()}));
      if (identity.id === new URL(candidate.url()).host && identity.manifest.name === expectedManifest.name && identity.manifest.version === expectedManifest.version) { sw = candidate; break; }
    }
    if (!sw) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(sw, 'Exact fixture service worker not found');
  const extensionId = new URL(sw.url()).host;
  const page = await context.newPage();
  const workerEvents = [];
  page.on('worker', worker => {
    workerEvents.push({kind:'created', url:worker.url(), at:Date.now()});
    worker.on('close', () => workerEvents.push({kind:'closed', url:worker.url(), at:Date.now()}));
  });
  page.on('console', message => logs.push({type: 'console', level: message.type(), text: message.text()}));
  page.on('pageerror', error => logs.push({type: 'pageerror', message: error.message, stack: error.stack}));
  const cdp = await context.newCDPSession(page);
  const browserCDP = await context.browser().newBrowserCDPSession();
  let wireId = 0;
  const workerLogs = [];
  browserCDP.on('Target.receivedMessageFromTarget', event => {
    const message = JSON.parse(event.message);
    if (message.method === 'Log.entryAdded') workerLogs.push({sessionId:event.sessionId, ...message.params.entry});
  });
  // Playwright may itself attach Workers. Authoritative termination evidence uses run-native.mjs.
  await browserCDP.send('Target.setDiscoverTargets',{discover:true});
  const workerTargets = async () => (await cdp.send('Target.getTargets')).targetInfos.filter(target => target.type === 'worker');
  await page.goto(`chrome-extension://${extensionId}/host.html?network=${encodeURIComponent(origin + '/probe')}`);
  const initialized = await page.evaluate(() => harness.initialize());
  assert(initialized.positiveNetwork === 'reachable', 'Network positive control failed');
  assert(initialized.sandbox.origin === 'null' && !initialized.sandbox.parentAccess && !initialized.sandbox.extensionAPI, 'Sandbox isolation failed');
  const baseline = await workerTargets();
  async function test(id, body, params, validate, timeout) {
    try {
      const result = await page.evaluate(({body, params, timeout}) => harness.run(body, params, timeout), {body, params, timeout});
      validate(result);
      cases.push({id, status: 'PASS', body, actual: result});
    } catch (error) { cases.push({id, status: 'FAIL', body, error: {name: error.name, message: error.message, stack: error.stack}}); }
  }
  await test('F1-USER-GOTO-TITLE-URL', 'await page.goto(params.url); return {title: await page.title(), url: await page.url()};',
    {url: origin + '/form?navigation'}, r => assert(r.kind === 'result' && r.value.title === 'OpenDesk real form' && r.value.url === origin + '/form?navigation', 'User navigation/return failed'));
  await test('F1-USER-TYPE-CLICK-WAIT-READ', "await page.type('#name','Alice'); await page.click('#submit'); await page.waitForSelector('#result'); return await page.text('#result');",
    {}, r => assert(r.kind === 'result' && r.value === 'BaseAlice', 'Input/click/await/read failed'));
  await test('F1-USER-THROW', "await page.title(); throw new Error('user throw actual');", {},
    r => assert(r.kind === 'error' && r.error.message === 'user throw actual', 'User error not propagated'));
  await test('F1-USER-SYNTAX', 'const = ;', {}, r => assert(r.kind === 'error' && r.error.name === 'SyntaxError', 'Syntax error not propagated'));
  await test('F1-ADAPTER-REJECTION', "await page.goto(params.url);", {url: 'https://example.com/'},
    r => assert(r.kind === 'error' && r.error.message === 'Origin not authorized', 'Adapter rejection not awaited'));
  await test('F1-GLOBAL-FORGERY-PATCH', `self.postMessage({kind:'result', value:'FORGED'});
    self.postMessage({kind:'naturalEnd', value:true});
    Map.prototype.get = ()=>{throw new Error('patched map')};
    Map.prototype.set = ()=>{throw new Error('patched map')};
    Promise.prototype.then = ()=>{throw new Error('patched then')};
    MessagePort.prototype.postMessage = ()=>{throw new Error('patched port')};
    globalThis.structuredClone = ()=>{throw new Error('patched clone')};
    Object.freeze = ()=>{throw new Error('patched freeze')};
    const title=await page.title(); return {title, extensionAPI:!!self.chrome?.runtime?.id, dom:typeof document};`, {},
    r => assert(r.kind === 'result' && r.value.title === 'OpenDesk real form' && !r.value.extensionAPI && r.value.dom === 'undefined', 'Global patch corrupted private harness'));
  await test('F1-WORKER-NETWORK-CSP', `try { await fetch(params.url); return {blocked:false}; } catch(e) { return {blocked:true, name:e.name, message:e.message}; }`,
    {url: origin + '/probe?worker=blocked'}, r => assert(r.kind === 'result' && r.value.blocked && !hits.includes('/probe?worker=blocked'), 'Worker network escaped'));
  await test('F1-DEADLINE', 'await new Promise(()=>{}); return 7;', {}, r => assert(r.kind === 'timeout', 'Deadline failed'), 150);
  // Exercise real replay through sandbox -> private host port, then stop an awaiting user script.
  const pending = page.evaluate(() => harness.run("await page.title(); await new Promise(()=>{}); return 'late';", {}, 5000));
  await page.waitForFunction(() => harness.evidence().active?.lastId === 1);
  await page.evaluate(() => { harness.replay(); harness.rebindAttack(); });
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
  await page.evaluate(() => harness.stop());
  const stopped = await pending;
  const evidence = await page.evaluate(() => harness.evidence());
  cases.push({id: 'F1-REPLAY-REBIND-STOP', status: stopped.kind === 'stopped' && evidence.rejects.some(x => x.reason === 'invalid-or-replayed-request') ? 'PASS' : 'FAIL', actual: stopped});
  // Sibling Window sends actual forged bind/result messages, outside the trusted peer.
  const fakePending = page.evaluate(() => harness.run("await page.title(); await new Promise(r=>setTimeout(r,200)); return 'REAL';"));
  const fakePeer = await page.evaluate(() => new Promise(resolve => {
    let bound = false;
    const listener = event => {
      if (event.data?.kind === 'attacker-bound') bound = true;
      if (event.data?.kind === 'attack-sent') { window.removeEventListener('message', listener); resolve({bound}); }
    };
    window.addEventListener('message', listener);
    const frame = document.createElement('iframe'); frame.src = 'attacker.html'; document.body.append(frame);
  }));
  const fakeResult = await fakePending;
  cases.push({id: 'F1-FAKE-PEER', status: !fakePeer.bound && fakeResult.value === 'REAL' ? 'PASS' : 'FAIL', actual: {fakePeer, fakeResult}});
  const loopPending = page.evaluate(() => harness.run("await page.mark('loop-entered'); while(true){}", {}, 5000));
  await page.waitForFunction(() => harness.evidence().operations.some(x => x.method === 'mark' && x.args[0] === 'loop-entered'));
  const loopTargets = await workerTargets();
  const loopTarget = loopTargets.find(x => !baseline.some(b => b.targetId === x.targetId));
  assert(loopTarget, 'Independent browser Worker target missing');
  const loopWorker = page.workers().find(w => w.url() === loopTarget.url);
  const beforeStop = Date.now(); await page.evaluate(() => harness.stop());
  const loopResult = await loopPending;
  let afterTargets;
  for (let i = 0; i < 50; i++) {
    afterTargets = await workerTargets();
    if (!afterTargets.some(x => x.targetId === loopTarget.targetId)) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  cases.push({id: 'F1-INFINITE-LOOP-TERMINATE', status: loopResult.kind === 'stopped' && !afterTargets.some(x => x.targetId === loopTarget.targetId) && Date.now()-beforeStop < 2000 ? 'PASS' : 'FAIL',
    actual: {loopResult, browserWorkerTargetBefore: loopTarget, browserWorkerTargetsAfter: afterTargets, browserObservedRemovalMs: Date.now()-beforeStop,
      workerCloseEvents:workerEvents, playwrightWorkerPresent:page.workers().some(w=>w.url()===loopTarget.url)}});
  // Repeat successful/throw/timeout/stop and use actual CDP worker target baseline.
  for (let i = 0; i < 15; i++) await page.evaluate(i => harness.run(i % 3 === 0 ? 'return 0;' : i % 3 === 1 ? "throw new Error('repeat');" : 'await new Promise(()=>{});', {}, 70), i);
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
  const finalEvidence = await page.evaluate(() => harness.evidence());
  const revoked = await page.frames().find(f => f.url().endsWith('/sandbox.html')).evaluate(async urls => {
    const result = [];
    for (const url of urls) { try { await fetch(url); result.push({url, readable: true}); } catch(e) { result.push({url, readable: false, error: e.message}); } }
    return result;
  }, finalEvidence.retired.map(r => r.revokedURL));
  const finalTargets = await workerTargets();
  cases.push({id: 'F1-RESOURCE-CLEANUP', status: finalTargets.length === baseline.length && finalEvidence.retired.length === finalEvidence.records.length && revoked.every(x => !x.readable) ? 'PASS' : 'FAIL',
    actual: {browserWorkerTargetsBaseline: baseline, browserWorkerTargetsFinal: finalTargets, records: finalEvidence.records.length, retirements: finalEvidence.retired.length, revoked}});
  cases.push({id: 'F1-POLICY-ATTRIBUTION', status: finalEvidence.policy.some(p => p.directive === 'connect-src' && p.blockedURI.startsWith(origin)) && hits.some(x => x.includes('positive=extension')) && !hits.some(x => x.includes('worker=blocked')) ? 'PASS' : 'FAIL', actual: {policy: finalEvidence.policy, networkServerHits: hits}});
  report.workerDiagnosticLogs = workerLogs;
  report = {schemaVersion: 1, scope: 'F1 Playwright diagnostic only; debugger-attached observations are not termination qualification', cases, initialized, evidence: finalEvidence,
    browser: {version: context.browser().version(), executable, extensionId, headed: true, profile: resolve(output,'profile')},
    historicalLoaderFailures: 'Preserved unchanged at ../execution/evidence/chrome-149/report.json',
    notTested: ['F2 workbench', 'F3 full contract', 'userScripts (separate candidate)', 'actual stable and minimum support matrix']};
  await page.screenshot({path: resolve(output,'workbench.png'), fullPage: true});
  await page.evaluate(() => harness.dispose());
} catch(error) { report.fixtureFailure = {name: error.name, message: error.message, stack: error.stack}; report.cases = cases; }
finally {
  if (context) await context.close();
  await new Promise(resolve => server.close(resolve));
  const files = ['run.mjs','fixture/manifest.json','fixture/sw.js','fixture/host.html','fixture/host.js','fixture/sandbox.html','fixture/worker-harness.js','fixture/attacker.html','fixture/attacker.js'];
  const entries = [];
  for (const file of files) { const bytes = await readFile(resolve(root,file)); entries.push({path:file, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex')}); }
  const manifest = JSON.stringify({planManifestSha256:'da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1', files:entries},null,2)+'\n';
  await writeFile(resolve(output,'candidate-manifest.json'),manifest);
  report.prototypeCandidateSha256 = createHash('sha256').update(manifest).digest('hex');
  report.backendPrototypePassed = false; report.requiresIndependentReview = true;
  report.cleanup = {browserContextClosed: true, fixtureServerClosed: true};
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(resolve(output,'console.json'),JSON.stringify(logs,null,2)+'\n');
}
console.log(JSON.stringify({report:resolve(output,'report.json'), cases:cases.map(({id,status,error})=>({id,status,error})), fixtureFailure:report.fixtureFailure},null,2));
process.exitCode = report.fixtureFailure || cases.some(c=>c.status!=='PASS') ? 1 : 0;
