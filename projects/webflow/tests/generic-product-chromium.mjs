// Real product only. Run from the repository root; --help documents native assistance.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir, realpath} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchChrome} from '../../../tests/framework/k5-sdk-native-launcher.mjs';
import {connect, evaluate} from '../../../tests/framework/sidebar-native-session.mjs';
import {selectControllerSidebar} from '../../../tests/framework/k5-controller-sidebar-entry.mjs';
import {packageFingerprint} from '../../../scripts/verify-package.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
if (args.includes('--help')) {
  console.log(`node projects/webflow/tests/generic-product-chromium.mjs /absolute/frozen/development
  --mode=development (default; isolated static build, not daily serve)
  --source-manifest=/absolute/source-manifest.json (or WEBFLOW_SOURCE_MANIFEST)
  --build-receipt=/absolute/build-receipt.json (or WEBFLOW_BUILD_RECEIPT)
  --binary=/absolute/CFT (or WEBFLOW_CHROME_BINARY)
  --ui-timeout=20000 --timeout=180000
Candidate may also be supplied as WEBFLOW_PRODUCT_CANDIDATE. No daily dist is allowed.
Evidence is written to an exclusive ignored artifacts/webflow/generic-product-* directory.
Native assistance: pending-native-ui.json identifies ONLY this owned PID/profile/endpoint.
An operator/parent may open/close its real Side Panel, approve original Chrome
permission prompts, and perform the requested native switch keyboard action.
No acknowledgement file is trusted as proof:
actual runtime contexts, trusted input witnesses, permissions and ledger are observed.
Missing native assistance aborts with a concrete bounded blocker; never use a panel tab.
The source manifest is evidence supplied by the frozen build owner, not proof of a
build by itself. Its bytes/hash and candidate fingerprint are recorded separately.`);
  console.log('Build receipt contract: {"status":"PASS","mode":"development","candidate":"/absolute/frozen/development","packageHash":"<packageFingerprint.packageHash>","sourceManifestSha256":"<SHA256 of source manifest bytes>"}');
  process.exit(0);
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const duration = (name, fallback, max) => {
  const value = Number(option(name, fallback));
  assert(Number.isInteger(value) && value >= 1000 && value <= max, `Invalid --${name}`);
  return value;
};
const timeout = duration('timeout', 180000, 600000), uiTimeout = duration('ui-timeout', 20000, 180000);
const mode = option('mode', 'development');
assert(['development', 'production'].includes(mode), 'Expected development or production candidate mode');
const directory = path.join(root, 'artifacts/webflow', `generic-product-${Date.now()}-${randomUUID()}`);
await mkdir(directory, {recursive: true});
const report = {status: 'NOT_TESTED', stage: 'candidate-preflight', startedAt: new Date().toISOString(),
  harness: fileURLToPath(import.meta.url), harnessSha256: sha(await readFile(fileURLToPath(import.meta.url))),
  runtime: `original frozen ${mode} extension`, buildMode: mode,
  environment: mode === 'development' ? 'isolated static development candidate; not daily serve-connected dev' : 'isolated production candidate',
  checks: [], inputs: [], events: [], screenshots: [],
  uiCases: [
    ['create-install','开发页创建并验证任务，经目录审阅原源码后安装成功'],
    ['review-edit','修改来源、目标、参数及恢复原值后，旧审核均失效且不批准或运行'],
    ['review-reopen','取消并重开设置后，没有持久化未批准的审核'],
    ['approve-enable','批准精确范围并开启，显示状态与持久状态一致'],
    ['background-result','关闭真实侧栏后，同一后台 Run/Result 完成并只交付一次'],
    ['replay','重复候选明确拒绝，新增 Run、副作用和交付均为零'],
    ['disable','重开侧栏保留状态；可见开关关闭后新候选明确拒绝且无新增效果'],
    ['keyboard-revoke','可信 Space 开启；撤销后新候选明确拒绝，重开仍显示撤销'],
  ].map(([id,condition])=>({id,condition,status:'NOT_TESTED'})),
  scope: 'generic local webpage, original developer save/run/install, review invalidation, offscreen execution, native switch keyboard action, disable/revoke/replay denial',
  notTested: ['ChatGPT', 'external model', 'browser restart', 'production release acceptance']};
let launched, client, workerSession, workerContextId, panelSession, server, sourceServer, watchdog;
const executionContexts = new Map();
let stopping = false, stopPromise, candidate, fingerprintBefore;
const deadline = Date.now() + timeout;
const effects = [];
let automaticFormHeld = false;
const save = () => writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const fail = (code, message) => Object.assign(new Error(message), {code});
async function until(operation, label, limit = 15000) {
  const end = Math.min(deadline, Date.now() + limit);
  while (!stopping && Date.now() < end) {
    const value = await operation();
    if (value) return value;
    await sleep(100);
  }
  throw fail('E_PRODUCT_NATIVE_BLOCKED', `Not observed: ${label}`);
}
async function phase(stage) { report.stage = stage; await save(); console.log(JSON.stringify({stage, directory})); }
async function captureUI(name, session = panelSession) {
  const shot = await client.send('Page.captureScreenshot', {format:'png'}, session);
  const file = path.join(directory, `${name}.png`);
  await writeFile(file, Buffer.from(shot.data,'base64'));
  report.screenshots.push({name,file,stage:report.stage,at:Date.now()});
  await save();
  return file;
}
async function completeCase(id, evidence) {
  const row = report.uiCases.find(item=>item.id===id);
  assert(row, `Unknown UI case ${id}`);
  Object.assign(row,{status:'PASS',evidence,at:Date.now()}); await save();
}
async function targets() { return (await client.send('Target.getTargets')).targetInfos; }
async function attach(targetId) { return (await client.send('Target.attachToTarget', {targetId, flatten: true})).sessionId; }
async function observe(expression, session = panelSession) {
  if (session !== workerSession || workerContextId === undefined) return evaluate(client, expression, session);
  assert(executionContexts.get(session)?.has(workerContextId), 'Original service-worker execution context retired');
  const reply = await client.send('Runtime.evaluate', {expression, contextId: workerContextId,
    awaitPromise: true, returnByValue: true}, session);
  if (reply.exceptionDetails) throw fail('E_SW_OBSERVATION', JSON.stringify(reply.exceptionDetails));
  return reply.result.value;
}
async function contexts() { return observe('chrome.runtime.getContexts({})', workerSession); }
async function nativeRequest(action, operation) {
  const request = {action, pid: launched.metadata.pid, launcherPid: launched.metadata.launcherPid,
    profile: launched.metadata.profile, endpoint: launched.endpoint, extensionId: report.extensionId,
    candidate, stage: report.stage, targetUrl: report.targetUrl, sourceUrl: `${report.sourceOrigin}/source`,
    windowTitle: 'Web Flow real local form', instruction: 'Use only the owned CFT native UI. No DOM grants, runtime calls, storage writes or replacement extension.',
    expiresAt: new Date(Math.min(deadline, Date.now() + uiTimeout)).toISOString()};
  await writeFile(path.join(directory, 'pending-native-ui.json'), JSON.stringify(request, null, 2) + '\n');
  console.log(JSON.stringify({nativeUIRequired: request, directory}));
  const observed = await until(operation, action, uiTimeout);
  report.events.push({action, observed, at: Date.now()});
  await writeFile(path.join(directory, 'pending-native-ui.json'), JSON.stringify({...request, completed: true}, null, 2) + '\n');
  return observed;
}
// Diagnostic listeners only; these neither change product inputs nor grant capabilities.
async function witness(session) {
  await observe(`(()=>{if(globalThis.__webflowNativeWitness)return;
    globalThis.__webflowNativeWitness=[];
    for(const type of ['click','input','change','keydown','keyup'])document.addEventListener(type,event=>{
      const node=event.target;globalThis.__webflowNativeWitness.push({type,id:node.id,
        key:event.key,trusted:event.isTrusted,tag:node.tagName,at:Date.now()});},true);})()`, session);
}
async function click(selector, session = panelSession) {
  const before = await observe('globalThis.__webflowNativeWitness?.length??0', session);
  await observe(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`, session);
  const point = await until(() => observe(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});
    if(!e)throw Error('Missing UI: '+${JSON.stringify(selector)});
    const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
    return hit&&(hit===e||e.contains(hit))?{x,y,width:r.width,height:r.height,disabled:e.disabled}:null;})()`, session),
  `unobstructed UI target ${selector}`);
  assert(point.width > 0 && point.height > 0 && !point.disabled, `Visible enabled UI required: ${selector}`);
  for (const type of ['mousePressed', 'mouseReleased']) await client.send('Input.dispatchMouseEvent',
    {type, x: point.x, y: point.y, button: 'left', clickCount: 1}, session);
  const events = await observe(`globalThis.__webflowNativeWitness.slice(${before})`, session);
  assert(events.some(event => event.type === 'click' && event.trusted), `Trusted click missing: ${selector}`);
  report.inputs.push({selector, method: 'CDP Input mouse', events});
}
async function key(key, code, session = panelSession, extra = {}) {
  for (const type of ['keyDown', 'keyUp']) await client.send('Input.dispatchKeyEvent', {type, key, code, ...extra}, session);
}
async function fill(selector, value) {
  await click(selector);
  await key('a', 'KeyA', panelSession, {modifiers: process.platform === 'darwin' ? 4 : 2, commands: ['selectAll'], windowsVirtualKeyCode: 65});
  const selected = await observe(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return {
    focused:document.activeElement===e,start:e.selectionStart,end:e.selectionEnd,length:e.value.length};})()`);
  assert(selected.focused && selected.start === 0 && selected.end === selected.length, `Native select-all failed: ${selector}`);
  await client.send('Input.insertText', {text: String(value)}, panelSession);
  assert.equal(await observe(`document.querySelector(${JSON.stringify(selector)}).value`), String(value));
}
async function select(selector, value) {
  const state = () => observe(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return {
    value:e.value,index:e.selectedIndex,focused:document.activeElement===e,options:[...e.options].map(o=>({value:o.value,disabled:o.disabled}))};})()`);
  const before = await state(), index = before.options.findIndex(row => row.value === value);
  assert(index >= 0 && !before.options[index].disabled, `Missing enabled option ${selector}: ${value}`);
  if (before.value === value) return;
  await click(selector); await key('Escape', 'Escape');
  const focused = await state(); assert(focused.focused, `Native select focus missing: ${selector}`);
  const delta = index - focused.index;
  for (let i = 0; i < Math.abs(delta); i++) await key(delta < 0 ? 'ArrowUp' : 'ArrowDown', delta < 0 ? 'ArrowUp' : 'ArrowDown');
  await key('Enter', 'Enter');
  assert.equal((await state()).value, value, `Native selection failed: ${selector}`);
}
async function disclose(selector) {
  if (await observe(`document.querySelector(${JSON.stringify(selector)})?.open===false`)) await click(`${selector} > summary`);
}
async function ledger() {
  return observe(`(async()=>{
    const databases=await indexedDB.databases(), output={};
    for(const info of databases){
      const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(info.name,info.version);
        q.onupgradeneeded=()=>{q.transaction.abort();reject(Error('Read-only observer refuses DB creation'))};
        q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
      try{const stores={};for(const name of [...db.objectStoreNames])stores[name]=await new Promise((resolve,reject)=>{
        const tx=db.transaction(name,'readonly'),q=tx.objectStore(name).getAll();let rows;
        q.onsuccess=()=>{rows=q.result};tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error);
      });output[info.name]=stores;}finally{db.close();}
    }
    return {databases:output,local:await chrome.storage.local.get(null),permissions:await chrome.permissions.getAll()};
  })()`, workerSession);
}
const rows = (snapshot, store) => Object.values(snapshot.databases).flatMap(db => db[store] ?? []);
async function shutdown() {
  if (stopPromise) return stopPromise;
  stopping = true;
  stopPromise = (async () => {
    clearTimeout(watchdog);
    client?.close();
    if (launched) {
      try { await launched.copyLog(); } catch (error) { report.logError = String(error); }
      report.cleanup = await launched.stop();
      if (report.cleanup.cleanupStatus !== 'PASS') { report.status = 'BLOCKED'; process.exitCode = 1; }
    }
    for (const owned of [server, sourceServer]) if (owned?.listening) {
      owned.closeAllConnections(); await new Promise(resolve => owned.close(resolve));
    }
    if (candidate && fingerprintBefore) {
      try { report.candidateAfter = await packageFingerprint(candidate);
        assert.equal(report.candidateAfter.packageHash, fingerprintBefore.packageHash, 'Frozen candidate changed during native run');
      } catch (error) { report.status = 'FAIL'; report.candidateDrift = String(error); process.exitCode = 1; }
    }
    report.effects = effects; report.finishedAt = new Date().toISOString(); await save();
  })();
  return stopPromise;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  report.status = 'BLOCKED'; report.error = {code: signal, message: 'Interrupted; unobserved checks remain NOT_TESTED'};
  process.exitCode = 1; void shutdown();
});

try {
  const supplied = args.find(arg => !arg.startsWith('--')) ?? process.env.WEBFLOW_PRODUCT_CANDIDATE;
  assert(supplied && path.isAbsolute(supplied), 'Absolute frozen candidate directory required');
  candidate = await realpath(supplied);
  assert(candidate !== await realpath(path.join(root, 'dist/development')).catch(() => ''), 'Daily dist/development forbidden');
  assert(!candidate.startsWith(path.join(root, 'dist') + path.sep), 'Use the build owner frozen candidate, not daily dist');
  const manifest = JSON.parse(await readFile(path.join(candidate, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert(manifest.side_panel?.default_path, 'Original Side Panel entry required');
  fingerprintBefore = await packageFingerprint(candidate);
  report.candidate = {path: candidate, manifest, ...fingerprintBefore};
  const receiptPath = option('build-receipt', process.env.WEBFLOW_BUILD_RECEIPT);
  const manifestPath = option('source-manifest', process.env.WEBFLOW_SOURCE_MANIFEST ?? receiptPath);
  assert(manifestPath && path.isAbsolute(manifestPath), 'Frozen build owner source-manifest required for source evidence');
  const sourceBytes = await readFile(manifestPath), sourceManifest = JSON.parse(sourceBytes);
  report.physicalSource = {path: await realpath(manifestPath), sha256: sha(sourceBytes), manifest: sourceManifest,
    provenance: 'supplied by frozen-build owner; not reconstructed from current dirty working tree'};
  // Fail closed for incomplete candidates. The build owner supplies this receipt
  // only after the original build for the selected mode succeeds; never infer success
  // from manifest existence or an output directory left by a failed build.
  assert(receiptPath && path.isAbsolute(receiptPath), 'Successful frozen build receipt required');
  const receiptBytes = await readFile(receiptPath), buildReceipt = JSON.parse(receiptBytes);
  assert.equal(buildReceipt.mode, mode, 'Build receipt mode mismatch');
  if (buildReceipt.builder && buildReceipt.report && Array.isArray(buildReceipt.sourceInputs)) {
    assert.equal(buildReceipt.status, 'passed', 'Original WXT build must pass');
    assert.deepEqual(buildReceipt.sourceDriftDuringBuild, [], 'Frozen source drift during original build');
    assert.equal(await realpath(path.join(buildReceipt.cwd, 'dist', mode)), candidate, 'Original build output mismatch');
    assert.equal(buildReceipt.report.packageHash, fingerprintBefore.packageHash, 'Original build fingerprint mismatch');
    const inputs = new Map(buildReceipt.sourceInputs.map(row => [row.path, row]));
    const recorded = Array.isArray(sourceManifest) ? sourceManifest : sourceManifest.sourceInputs;
    assert(Array.isArray(recorded), 'Physical source manifest must contain original source input records');
    for (const row of recorded) {
      assert.equal(inputs.get(row.path)?.sha256, row.sha256, `Source input binding mismatch: ${row.path}`);
      assert.equal(inputs.get(row.path)?.bytes, row.bytes, `Source input length mismatch: ${row.path}`);
    }
    report.physicalSource.sourceInputsSha256 = sha(JSON.stringify(buildReceipt.sourceInputs));
  } else {
    assert.equal(buildReceipt.status, 'PASS', 'Original build for the selected mode must pass');
    assert.equal(await realpath(buildReceipt.candidate), candidate, 'Build receipt candidate mismatch');
    assert.equal(buildReceipt.packageHash, fingerprintBefore.packageHash, 'Build receipt package fingerprint mismatch');
    assert.equal(buildReceipt.sourceManifestSha256, sha(sourceBytes), 'Build receipt physical source mismatch');
  }
  report.buildReceipt = {path: await realpath(receiptPath), sha256: sha(receiptBytes), receipt: buildReceipt};
  const binary = await realpath(option('binary', process.env.WEBFLOW_CHROME_BINARY ?? path.join(root,
    'tests/.cache/m5-browsers/138.0.7204.183/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')));
  assert(binary.includes('Google Chrome for Testing'), 'Explicit CFT binary required');
  report.binary = {path: binary, sha256: sha(await readFile(binary))};
  const taskId = `webflow.generic.${randomUUID().replaceAll('-', '')}`, candidateId = `generic-${randomUUID()}`;
  const value = `native-${randomUUID()}`, params = {value};
  const controller = `async function main() {\n  await page.waitForSelector('#submit');\n  await page.type('#value', params.value);\n  await page.click('#submit');\n  await page.waitForSelector('#done');\n  return await page.snapshot('#done');\n}`;
  report.program = {taskId, source: controller, sourceHash: sha(controller), params};
  const createFixture = kind => createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (kind === 'target' && req.url === '/ready') {
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ready: !automaticFormHeld})); return;
    }
    if (kind === 'target' && req.url === '/effect' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) { res.writeHead(413).end(); return; } }
      effects.push({at: Date.now(), body: JSON.parse(body)}); res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (kind === 'target') res.end(`<!doctype html><meta charset="utf-8"><title>Web Flow real local form</title>
      <label>Value <input id="value"></label><div id="form-controls">Waiting for local form availability</div><output id="result"></output>
      <script>async function ready(){if(!(await(await fetch('/ready')).json()).ready){setTimeout(ready,100);return;}
      const button=document.createElement('button');button.id='submit';button.textContent='Submit form';
      document.querySelector('#form-controls').replaceChildren(button);
      button.addEventListener('click',async e=>{
        const value=document.querySelector('#value').value;
        await fetch('/effect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value,trusted:e.isTrusted})});
        const out=document.querySelector('#result');out.id='done';out.textContent=value;});}void ready();</script>`);
    else res.end(`<!doctype html><meta charset="utf-8"><title>Web Flow standard event source</title>
      <button id="intent">Send standard task intent</button><button id="fresh-intent">Send a new task intent</button><pre id="events"></pre><script>
      const intent=${JSON.stringify({protocol: 'webflow.task.intent.v1', candidateId, taskId, targetUrl: report.targetUrl, args: params})};
      const events=[];for(const name of ['opendesk:task-receipt','opendesk:task-result'])window.addEventListener(name,e=>{
        events.push({name,detail:JSON.parse(e.detail)});document.querySelector('#events').textContent=JSON.stringify(events);});
      document.querySelector('#intent').addEventListener('click',()=>window.dispatchEvent(new CustomEvent('opendesk:task-intent',{detail:JSON.stringify(intent)})));
      document.querySelector('#fresh-intent').addEventListener('click',()=>window.dispatchEvent(new CustomEvent('opendesk:task-intent',{detail:JSON.stringify({...intent,candidateId:'generic-'+crypto.randomUUID()})})));
      </script>`);
  });
  server = createFixture('target'); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  report.targetUrl = `http://127.0.0.1:${server.address().port}/form`;
  sourceServer = createFixture('source'); await new Promise(resolve => sourceServer.listen(0, '127.0.0.1', resolve));
  report.sourceOrigin = `http://127.0.0.1:${sourceServer.address().port}`;
  await phase(`launch-frozen-static-${mode}`);
  launched = await launchChrome({root, binary, extension: candidate, headed: true, directory, label: 'webflow-generic'});
  report.launcher = launched.metadata;
  client = await connect(launched.endpoint, {onEvent(event) {
    if (event.method === 'Runtime.executionContextCreated') {
      if (!executionContexts.has(event.sessionId)) executionContexts.set(event.sessionId, new Map());
      executionContexts.get(event.sessionId).set(event.params.context.id, event.params.context);
    } else if (event.method === 'Runtime.executionContextDestroyed') executionContexts.get(event.sessionId)?.delete(event.params.executionContextId);
    else if (event.method === 'Runtime.executionContextsCleared') executionContexts.delete(event.sessionId);
  }});
  watchdog = setTimeout(() => { report.status = 'BLOCKED'; report.error = {code: 'E_BOUNDED_TIMEOUT', stage: report.stage};
    process.exitCode = 1; void shutdown(); }, Math.max(1, deadline - Date.now()));
  report.browser = await client.send('Browser.getVersion');
  // Open the actual target first: attaching to the transient startup worker
  // before Chrome has loaded a page can leave CDP bound to a retired target.
  const targetPage = await client.send('Target.createTarget', {url: report.targetUrl});
  await client.send('Target.activateTarget', {targetId: targetPage.targetId});
  const targetSession = await attach(targetPage.targetId);
  await until(() => observe(`document.readyState==='complete'`, targetSession), 'target fixture document');
  // Chrome exposes an early startup target before it is reliably attachable.
  // Require one unchanged target across a short observation window; keep all
  // later identity checks and never accept a replacement as the old session.
  let observedWorker, workerSeenAt;
  const sw = await until(async () => {
    const current = (await targets()).find(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://') && t.url.endsWith('/sw.js'));
    if (!current || current.targetId !== observedWorker) {
      observedWorker = current?.targetId; workerSeenAt = Date.now(); return false;
    }
    return Date.now() - workerSeenAt >= 5000 && current;
  }, 'stable original service worker');
  report.extensionId = new URL(sw.url).hostname; workerSession = await attach(sw.targetId);
  await client.send('Runtime.enable', {}, workerSession);
  report.workerBinding = await until(async () => {
    for (const context of executionContexts.get(workerSession)?.values() ?? []) {
      const reply = await client.send('Runtime.evaluate', {contextId: context.id, returnByValue: true,
        expression: `({url:globalThis.location?.href,extensionId:globalThis.chrome?.runtime?.id,ready:typeof globalThis.chrome?.runtime?.getContexts==='function'})`}, workerSession);
      if (!reply.exceptionDetails && reply.result.value?.ready && reply.result.value.extensionId === report.extensionId && reply.result.value.url === sw.url) {
        workerContextId = context.id;
        return {targetId: sw.targetId, sessionId: workerSession, context, observed: reply.result.value};
      }
    }
    return false;
  }, 'bound original service-worker execution context and extension identity');
  await phase('open-real-sidepanel');
  const entry = await nativeRequest('Open the original extension action in this owned CFT window to show its real Side Panel', async () =>
    selectControllerSidebar({contexts: await contexts(), targets: await targets(), extensionId: report.extensionId}));
  report.sidebar = entry; panelSession = await attach(entry.target.targetId);
  await until(() => observe(`document.readyState==='complete' && !!document.querySelector('#tab-develop')`, panelSession), 'original Sidebar workbench mounts');
  await witness(panelSession);
  await phase('original-developer-save-run');
  await click('#tab-develop');
  await until(() => observe(`document.querySelector('#script-current-page-url')?.textContent.includes(${JSON.stringify(report.targetUrl)})`), 'developer bound to the exact local target');
  await select('#script-javascript-world', 'controller');
  for (const selector of ['#developer-program-management', '#manual-project-params-tools', '#script-advanced', '#site-access']) await disclose(selector);
  await fill('#script-id', taskId); await fill('#script-source', controller); await fill('#script-params', JSON.stringify(params));
  if (!await observe(`chrome.permissions.contains({origins:[${JSON.stringify('http://127.0.0.1/*')}]})`, workerSession)) {
    await click('#site-access-grant');
    await nativeRequest('Approve the original Chrome site permission prompt for the local fixture', () => observe(`chrome.permissions.contains({origins:['http://127.0.0.1/*']})`, workerSession));
  }
  await click('#script-save-version');
  await until(() => observe(`Number(document.querySelector('#script-revision')?.value)>0`), 'saved original Controller revision');
  report.program.revision = await observe(`Number(document.querySelector('#script-revision').value)`);
  await click('#script-run');
  await until(() => observe(`document.querySelector('#script-running-target')?.dataset.state==='completed'`), 'original developer run completes', 40000);
  assert.equal(effects.length, 1); assert.equal(effects[0].body.value, value);
  const firstLedger = await until(async () => {
    const snapshot = await ledger();
    return rows(snapshot, 'runs').some(row => row.tag === 'controller-run' && row.state === 'completed' &&
      row.retirementState === 'released' && row.revision?.sourceHash === sha(controller)) && snapshot;
  }, 'original developer durable result and resource retirement');
  await writeFile(path.join(directory, 'developer-ledger.json'), JSON.stringify(firstLedger, null, 2));
  const developerRuns = rows(firstLedger, 'runs').filter(row => row.tag === 'controller-run' && row.state === 'completed' && row.revision?.sourceHash === sha(controller));
  assert.equal(developerRuns.length, 1, 'One original completed Controller run with the exact source hash');
  report.developerRunId = developerRuns[0].runId;
  await phase('original-task-candidate-verify-publish-install');
  await disclose('#task-package-dev');
  for (const [id, text] of Object.entries({'task-dev-id': taskId, 'task-dev-version': '1.0.0', 'task-dev-title': 'Generic local form',
    'task-dev-description': 'Submit one value to the isolated local form', 'task-dev-author': 'Native product test',
    'task-dev-schema': JSON.stringify({type: 'object', properties: {value: {type: 'string', title: 'Value'}}, required: ['value'], additionalProperties: false})})) await fill(`#${id}`, text);
  await click('#task-create-candidate');
  await until(() => observe(`document.querySelector('#task-dev-status')?.textContent.includes(${JSON.stringify(taskId)})`), 'original task candidate created');
  const sidebarSession = panelSession;
  const catalog = await until(async () => (await targets()).find(t => {
    if (t.type !== 'page') return false;
    try { const url = new URL(t.url); return url.protocol === 'chrome-extension:' && url.hostname === report.extensionId &&
      url.pathname === '/sidepanel.html' && !url.searchParams.has('hostInstanceId'); } catch { return false; }
  }), 'original full-page task catalog');
  panelSession = await attach(catalog.targetId);
  const candidateSelector = `[data-candidate-key=${JSON.stringify(`${taskId}@1.0.0`)}]`;
  await until(async () => {
    try{return await observe(`document.readyState==='complete'&&!!document.querySelector(${JSON.stringify(candidateSelector)})`);}
    catch(error){if(String(error.message).includes('Cannot find default execution context'))return false;throw error;}
  }, 'original task candidate card');
  await witness(panelSession);
  await click(candidateSelector);
  await until(() => observe(`document.querySelector('#task-catalog-detail')?.textContent.includes('Generic local form')`), 'original selected task candidate');
  await disclose('.catalog-source-review');
  await until(() => observe(`document.querySelector('.catalog-source-review pre')?.textContent===${JSON.stringify(controller)}`), 'original frozen candidate source review');
  await disclose('#catalog-verification'); await fill('#task-verify-run', report.developerRunId);
  await click('#task-verify'); await until(() => observe(`!document.querySelector('#task-publish').disabled`), 'original verification permits publishing');
  await click('#task-publish'); await until(() => observe(`!document.querySelector('#task-install').disabled`), 'original task becomes available');
  await click('#task-install');
  await until(() => observe(`document.querySelector('#task-install-feedback')?.textContent.includes('已安装')`), 'original task installed');
  await completeCase('create-install',{screenshot:await captureUI('01-task-installed'),developerRunId:report.developerRunId});
  panelSession = sidebarSession;
  await client.send('Target.activateTarget', {targetId: targetPage.targetId});
  await phase('original-auto-settings-approval');
  await click('#tab-workflow'); await click('#workflow-provider-toggle');
  await click('.workflow-source-option:last-child');
  await until(() => observe(`Array.from(document.querySelector('#webflow-auto-task')?.options??[]).some(o=>o.value===${JSON.stringify(taskId)}&&!o.disabled)`), 'original AutoSettings loaded installed task');
  await observe(`(()=>{globalThis.__webflowBusyWitness=[];new MutationObserver(records=>{
    for(const record of records){const section=record.target;
      if(section.matches?.('section[aria-labelledby="webflow-auto-title"]'))
        globalThis.__webflowBusyWitness.push({old:record.oldValue,current:section.getAttribute('aria-busy'),at:Date.now()});}
  }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['aria-busy'],attributeOldValue:true});})()`);
  await select('#webflow-auto-task', taskId);
  await fill('#webflow-auto-source', report.sourceOrigin); await fill('#webflow-auto-target', report.targetUrl);
  await fill('#webflow-auto-args', JSON.stringify(params)); await click('#webflow-auto-prepare');
  await until(() => observe(`!!document.querySelector('#webflow-auto-review')`), 'exact source/target/args review');
  await captureUI('02-prepared-review');
  // An edited scope invalidates the review even if the old text is restored.
  for (const [selector, original, changed] of [
    ['#webflow-auto-source', report.sourceOrigin, 'http://localhost:12345'],
    ['#webflow-auto-target', report.targetUrl, `${report.targetUrl}?changed=1`],
    ['#webflow-auto-args', JSON.stringify(params), JSON.stringify({value: `${value}-changed`})],
  ]) {
    await fill(selector, changed);
    assert.equal(await observe(`!!document.querySelector('#webflow-auto-approve')`), false, `Edited ${selector} must invalidate approval`);
    await captureUI(`03-review-invalidated-${selector.slice('#webflow-auto-'.length)}`);
    await fill(selector, original);
    assert.equal(await observe(`!!document.querySelector('#webflow-auto-approve')`), false, `Restoring ${selector} must not restore review`);
    await click('#webflow-auto-prepare');
    await until(() => observe(`!!document.querySelector('#webflow-auto-review')`), `fresh review after ${selector}`);
  }
  const draftLedger = await ledger();
  assert(!draftLedger.local['opendesk.webflow.auto-trigger-grants.v1']?.grants?.[taskId], 'Review edits must not approve a task');
  assert.equal(effects.length, 1, 'Review edits must not run the task');
  report.reviewEdits = {status:'PASS', fields:['source','target','args'], persistedGrant:false, effects:effects.length}; await save();
  await completeCase('review-edit',report.reviewEdits);
  await click('.od-shared-provider-actions button[type="button"]');
  await until(() => observe(`!document.querySelector('#webflow-auto-review')`), 'closing settings discards review');
  await click('#workflow-provider-toggle'); await click('.workflow-source-option:last-child');
  await until(() => observe(`!!document.querySelector('#webflow-auto-task')&&!document.querySelector('#webflow-auto-task').disabled`), 'settings reopened');
  assert.equal(await observe(`!!document.querySelector('#webflow-auto-review')`), false, 'Reopening settings must not restore unsaved review');
  assert(!((await ledger()).local['opendesk.webflow.auto-trigger-grants.v1']?.grants?.[taskId]), 'Closing without approval must not persist a grant');
  report.reviewReopen = {status:'PASS', restoredReview:false, persistedGrant:false}; await save();
  await completeCase('review-reopen',{...report.reviewReopen,screenshot:await captureUI('04-settings-reopened-unapproved')});
  await select('#webflow-auto-task', taskId);
  await fill('#webflow-auto-source', report.sourceOrigin); await fill('#webflow-auto-target', report.targetUrl);
  await fill('#webflow-auto-args', JSON.stringify(params)); await click('#webflow-auto-prepare');
  await until(() => observe(`!!document.querySelector('#webflow-auto-review')`), 'new review after settings reopen');
  report.autoReview = await observe(`document.querySelector('#webflow-auto-review').textContent`);
  assert(report.autoReview.includes(report.sourceOrigin) && report.autoReview.includes(report.targetUrl) && report.autoReview.includes(value));
  await click('#webflow-auto-approve');
  await until(async () => {
    const state=await observe(`({error:document.querySelector('#webflow-auto-error')?.textContent,
      approved:document.querySelector('#webflow-auto-grants')?.textContent.includes(${JSON.stringify(taskId)})})`);
    if(state.error)throw fail('E_PRODUCT_APPROVAL',state.error);
    return state.approved;
  }, 'saved original automatic approval');
  if (!await observe(`document.querySelector('#webflow-auto-enabled input')?.checked??document.querySelector('#webflow-auto-enabled')?.checked`)) await click('label:has(#webflow-auto-enabled)');
  await until(() => observe(`document.querySelector('#webflow-auto-enabled input')?.checked??document.querySelector('#webflow-auto-enabled')?.checked`), 'persisted original automatic enable');
  await until(() => observe(`document.querySelector('#webflow-auto-grants')?.textContent.includes('授权有效')`), 'effective original automatic approval');
  const sourcePage = await client.send('Target.createTarget', {url: `${report.sourceOrigin}/source`});
  const sourceSession = await attach(sourcePage.targetId); await until(() => observe(`document.readyState==='complete'`, sourceSession), 'source fixture document'); await witness(sourceSession);
  report.approvedLedger = await ledger(); await save();
  assert.equal(report.approvedLedger.local['opendesk.webflow.auto-trigger-grants.v1'].enabled,true);
  assert.equal(report.approvedLedger.local['opendesk.webflow.auto-trigger-grants.v1'].grants[taskId]?.state,'active');
  await completeCase('approve-enable',{screenshot:await captureUI('05-approved-enabled')});
  // A real generic admission starts the ORIGINAL offscreen host before closing
  // the panel. No direct ensureRunner call, fake dispatch or runtime message.
  await phase('standard-event-admission');
  automaticFormHeld = true;
  await click('#intent', sourceSession);
  const sourceEvents = () => observe(`JSON.parse(document.querySelector('#events').textContent||'[]')`, sourceSession);
  const receipt = await until(async () => (await sourceEvents()).find(e => e.name === 'opendesk:task-receipt'), 'original source admission receipt');
  assert.equal(receipt.detail.ok, true, JSON.stringify(receipt)); report.admission = receipt.detail;
  report.offscreen = await until(async () => (await contexts()).find(c => c.contextType === 'OFFSCREEN_DOCUMENT'), 'original offscreen host started');
  await phase('close-real-sidepanel');
  report.busyTransitions = await observe('globalThis.__webflowBusyWitness ?? []');
  await nativeRequest('Close the real Side Panel using its native Chrome close button; leave the source document open', async () =>
    !(await contexts()).some(c => c.contextType === 'SIDE_PANEL'));
  assert(!(await contexts()).some(c => c.contextType === 'SIDE_PANEL'));
  report.panelClosedAt = Date.now();
  assert.equal(effects.length, 1, 'Automatic form action has not occurred before native panel closure');
  automaticFormHeld = false;
  await phase('original-result-delivery');
  const delivery = await until(async () => (await sourceEvents()).find(e => e.name === 'opendesk:task-result'), 'original result delivered to original source document', 45000);
  const result = delivery.detail.result;
  assert.equal(result.status, 'completed'); assert.equal(result.taskId, taskId); assert.equal(result.sourceHash, sha(controller));
  assert(result.runId && result.resultId && delivery.detail.requestId);
  assert.equal(delivery.detail.requestId, receipt.detail.data?.requestId, 'Original admission and delivered request agree');
  assert(JSON.stringify(result.data).includes(value), 'Original source receives the actual local form result');
  report.delivered = delivery; report.durable = await ledger();
  await writeFile(path.join(directory, 'automatic-ledger.json'), JSON.stringify(report.durable, null, 2));
  const run = rows(report.durable, 'runs').find(row => row.runId === result.runId);
  const durableResult = rows(report.durable, 'results').find(row => row.resultId === result.resultId);
  assert(run && durableResult, 'Delivered IDs exist in original durable Run/Result stores');
  assert.equal(run.state, 'completed'); assert.equal(run.requestId, delivery.detail.requestId);
  assert.equal(run.hostDocumentId, report.offscreen.documentId, 'Same original offscreen document owns the durable run');
  assert.equal(run.resultId, result.resultId); assert.equal(run.revision?.sourceHash, sha(controller));
  assert.equal(durableResult.runId, result.runId); assert.equal(durableResult.revision?.sourceHash, sha(controller));
  assert.equal(durableResult.outcome?.ok, true, 'Original durable Controller result succeeded');
  assert.equal(run.retirementState, 'released', 'Original run released its resources');
  assert.equal(effects.length, 2, 'One developer verification effect and one automatic effect');
  assert.equal(effects[1].body.value, value);
  assert(effects[1].at >= report.panelClosedAt, 'Real automatic form effect occurs after panel closure');
  assert(!(await contexts()).some(c => c.contextType === 'SIDE_PANEL'), 'Panel remains closed');
  await completeCase('background-result',{runId:result.runId,resultId:result.resultId,screenshot:await captureUI('06-result-at-source',sourceSession)});
  await phase('same-candidate-denial');
  const eventCount = (await sourceEvents()).length, beforeRuns = rows(report.durable, 'runs').filter(row => row.tag === 'controller-run').map(row => row.runId).sort();
  await click('#intent', sourceSession);
  const denied = await until(async () => (await sourceEvents()).slice(eventCount).find(e => e.name === 'opendesk:task-receipt'), 'same candidate explicit denial');
  assert.equal(denied.detail.ok, false, JSON.stringify(denied)); assert(denied.detail.error?.code, 'Concrete denial code required');
  report.replay = denied;
  await sleep(2000);
  report.afterReplay = await ledger();
  assert.deepEqual(rows(report.afterReplay, 'runs').filter(row => row.tag === 'controller-run').map(row => row.runId).sort(), beforeRuns);
  assert.equal(effects.length, 2, 'Duplicate candidate has no additional form effect');
  assert.equal((await sourceEvents()).filter(e => e.name === 'opendesk:task-result').length, 1, 'No repeated delivery');
  await completeCase('replay',{denial:denied.detail.error,screenshot:await captureUI('07-replay-denied',sourceSession)});
  await phase('reopen-settings-disable-and-revoke');
  const reopened = await nativeRequest('Reopen the original extension Side Panel in this owned CFT window', async () =>
    selectControllerSidebar({contexts: await contexts(), targets: await targets(), extensionId: report.extensionId}));
  panelSession = await attach(reopened.target.targetId);
  await until(() => observe(`document.readyState==='complete'&&!!document.querySelector('#tab-workflow')`), 'reopened Side Panel mounts');
  await witness(panelSession);
  await click('#tab-workflow'); await click('#workflow-provider-toggle'); await click('.workflow-source-option:last-child');
  await until(() => observe(`document.querySelector('#webflow-auto-grants')?.textContent.includes(${JSON.stringify(taskId)})`), 'persisted approval after reopening Side Panel');
  assert.equal(await observe(`document.querySelector('#webflow-auto-enabled')?.checked`), true, 'Enabled state persisted after panel reopening');
  await click('label:has(#webflow-auto-enabled)');
  await until(() => observe(`document.querySelector('#webflow-auto-enabled')?.checked===false`), 'visible switch disables future admission');
  let state = (await ledger()).local['opendesk.webflow.auto-trigger-grants.v1'];
  assert.equal(state.enabled, false, 'Disabled state persisted');
  const assertDenied = async label => {
    const count = (await sourceEvents()).length;
    await click('#fresh-intent', sourceSession);
    const response = await until(async () => (await sourceEvents()).slice(count).find(e => e.name === 'opendesk:task-receipt'), `${label} explicit receipt`);
    assert.equal(response.detail.ok, false, JSON.stringify(response));
    assert(response.detail.error?.code, `${label} requires a concrete denial`);
    await sleep(2000);
    const current = await ledger();
    assert.deepEqual(rows(current, 'runs').filter(row => row.tag === 'controller-run').map(row => row.runId).sort(), beforeRuns);
    assert.equal(effects.length, 2, `${label}: no additional form effect`);
    assert.equal((await sourceEvents()).filter(e => e.name === 'opendesk:task-result').length, 1, `${label}: no additional result delivery`);
    return response;
  };
  report.disabledDenial = await assertDenied('disabled switch');
  await completeCase('disable',{denial:report.disabledDenial.detail.error,screenshot:await captureUI('08-disabled')});
  await save();
  // Saving temporarily disables the switch, so pointer focus need not survive.
  // Navigate back from the next disclosure using the real keyboard Tab order.
  await click('section[aria-labelledby="webflow-auto-title"] > details:first-of-type > summary');
  const keyboardWitnessStart = await observe('globalThis.__webflowNativeWitness.length');
  await nativeRequest('Use the native keyboard to move focus to the Web Flow automatic-run switch and press Space to enable it', async () =>
    observe(`document.querySelector('#webflow-auto-enabled')?.checked===true&&
      globalThis.__webflowNativeWitness.slice(${keyboardWitnessStart}).some(event=>
        event.type==='keydown'&&event.key===' '&&event.id==='webflow-auto-enabled'&&event.trusted)`));
  report.switchKeyboardEvents = await observe(`globalThis.__webflowNativeWitness.slice(${keyboardWitnessStart})`);
  assert(report.switchKeyboardEvents.some(event => event.type === 'keydown' && event.key === ' ' && event.id === 'webflow-auto-enabled' && event.trusted), 'Trusted Space key on the switch required');
  state = (await ledger()).local['opendesk.webflow.auto-trigger-grants.v1'];
  assert.equal(state.enabled, true, 'Keyboard-enabled state persisted');
  await click(`[aria-label=${JSON.stringify(`撤销 ${taskId} 的自动准入`)}]`);
  await until(() => observe(`document.querySelector('#webflow-auto-grants')?.textContent.includes('已撤销')`), 'revocation visibly confirmed');
  state = (await ledger()).local['opendesk.webflow.auto-trigger-grants.v1'];
  assert.equal(state.grants[taskId]?.state, 'revoked', 'Revocation persisted');
  report.revokedDenial = await assertDenied('revoked approval');
  await save();
  await click('.od-shared-provider-actions button[type="button"]');
  await click('#workflow-provider-toggle'); await click('.workflow-source-option:last-child');
  await until(() => observe(`document.querySelector('#webflow-auto-grants')?.textContent.includes('已撤销')`), 'revocation survives settings reopen');
  assert.equal(await observe(`document.querySelector('#webflow-auto-enabled')?.checked`), true, 'Switch survives settings reopen');
  await completeCase('keyboard-revoke',{denial:report.revokedDenial.detail.error,screenshot:await captureUI('09-revocation-persisted')});
  report.checks = ['real SIDE_PANEL', 'trusted native UI inputs', 'original saved Controller run', 'original Task verification/publication/installation',
    'review edits invalidate approval', 'unsaved review discarded on reopen', 'exact AutoSettings approval', 'standard generic event', 'original offscreen host', 'closed panel', 'durable original Run/Result IDs', 'original source delivery', 'same-candidate denial without extra effect', 'visible switch and keyboard activation', 'disabled and revoked fresh candidates denied without effects', 'revocation persists after reopen'];
  report.status = 'PASS';
} catch (error) {
  report.status = error.code === 'ERR_ASSERTION' && report.stage !== 'candidate-preflight' ? 'FAIL' : 'BLOCKED';
  report.error = {code: error.code ?? 'E_PRODUCT_NATIVE_BLOCKED', message: error.message, stack: error.stack, stage: report.stage};
  if (client && !stopping) {
    report.targetsAtFailure = await targets().catch(error => ({error: String(error)}));
    report.contextsAtFailure = await contexts().catch(error => ({error: String(error)}));
    if (workerSession && report.stage === 'original-auto-settings-approval')
      report.approvalStateAtFailure = await observe(`(async()=>({storage:await chrome.storage.local.get([
        'opendesk.web-task.site-profiles.v1','opendesk.webflow.auto-trigger-grants.v1']),
        registrations:await chrome.scripting.getRegisteredContentScripts()}))()`, workerSession).catch(error => ({error: String(error)}));
    if (panelSession) report.uiAtFailure = await observe(`({text:document.body.innerText,inputs:globalThis.__webflowNativeWitness,
      statuses:Object.fromEntries(['task-status','task-catalog-status','task-dev-status'].map(id=>[id,document.getElementById(id)?.textContent])),
      activeElement:{tag:document.activeElement?.tagName,id:document.activeElement?.id,text:document.activeElement?.textContent?.slice(0,160)},
      switchMarkup:document.querySelector('#webflow-auto-enabled')?.parentElement?.outerHTML,
      switchHit:(()=>{const e=document.querySelector('#webflow-auto-enabled');if(!e)return null;
        const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},hit:hit?.outerHTML.slice(0,700)};})()})`).catch(error => ({error: String(error)}));
  }
  process.exitCode = 1;
} finally {
  await shutdown();
  console.log(JSON.stringify({status: report.status, stage: report.stage, error: report.error, directory, cleanup: report.cleanup?.cleanupStatus}));
}
