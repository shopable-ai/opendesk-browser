#!/usr/bin/env node
// Leader-owned, already-running Chrome only. No build, launcher, RPC writes or injected clicks.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {connectLaunch, until, read, visible, click, nativeText, nativeSelectToolPackage, attach, openFixture, screenshot, sleep, sha256, queryExpression} from './dynamic-app-r14-helper.mjs';

const HELP = `node tests/native/dynamic-app-r14.mjs \\
  --launch=/abs/launch.json --extension=/abs/production \\
  --package=/abs/candidate.opendesk-tool.json --app-id=<post-freeze-app-id> \\
  --expected=/abs/project/expected.json [--extension-id=<actual-extension-id>] \\
  --step=install|schedule|read|all|open [--out=/abs/evidence] [--delay-ms=90000] [--wait-ms=15000]

install: real Side Panel import, installed identity readback, open sandbox, UI storage set/get/quota.
schedule: native ISO input + create + trusted approval; close real panel and manager; wait until due + grace.
read: reopen real panel, click storage-get, compare algorithm/payload with expected and check security.
open: only open the installed app; records OPENED, never normal-chain PASS.
all: install -> schedule -> read. Default: install. No Chrome launch/build/commit.
Evidence: driver-state.json, <step>-<timestamp>.json and PNGs in --out (default artifacts/dynamic-app-r14-native).
Do not rerun schedule after an unknown outcome; inspect saved phase/error first.\n`;

// Observations only: existing DB, readonly transactions, no product methods or message dispatch.
const nativeSnapshot = `(async()=>{
  const cloud=[];const databases=await indexedDB.databases();
  for(const info of databases.filter(d=>d.name==='opendesk-browser')){
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name,info.version);
      r.onupgradeneeded=()=>{r.transaction.abort();reject(Error('Readback must not create/migrate a database'));};
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try{if(db.objectStoreNames.contains('frameworkKV')){
      const value=await new Promise((resolve,reject)=>{const tx=db.transaction('frameworkKV','readonly');
        const r=tx.objectStore('frameworkKV').get('cloud:config');let value;
        r.onsuccess=()=>value=r.result;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
      cloud.push({database:info.name,present:value!==undefined,enabled:value?.enabled===true});
    }}finally{db.close();}
  }
  return {at:new Date().toISOString(),cloud,cloudDisabled:cloud.every(c=>!c.enabled),
    alarms:await chrome.alarms.getAll(),contexts:await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}),
    httpTabs:(await chrome.tabs.query({})).filter(t=>/^https?:/.test(t.url||t.pendingUrl||'')).map(t=>({id:t.id,url:t.url||t.pendingUrl}))};
})()`;

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    assert.ok(match, 'Expected --name=value: ' + arg);
    assert.ok(['launch','extension','package','expected','extension-id','app-id','step','out','delay-ms','wait-ms'].includes(match[1]), 'Unknown option ' + match[1]);
    assert.equal(args[match[1]], undefined, 'Duplicate option ' + match[1]); args[match[1]] = match[2];
  }
  for (const key of ['launch','extension','package','expected']) assert.ok(path.isAbsolute(args[key] || ''), '--' + key + ' must be absolute');
  assert.match(args['app-id'] || '', /^[a-z][a-z0-9-]{1,39}$/, '--app-id required');
  if(args['extension-id'])assert.match(args['extension-id'], /^[a-p]{32}$/, 'Invalid --extension-id');
  args.step ||= 'install'; assert.ok(['install','schedule','read','all','open'].includes(args.step), 'Invalid --step');
  args.out ||= path.resolve('artifacts/dynamic-app-r14-native');
  assert.ok(path.isAbsolute(args.out), '--out must be absolute');
  args.delay = Number(args['delay-ms'] || 90000); args.grace = Number(args['wait-ms'] || 15000);
  assert.ok(Number.isFinite(args.delay) && args.delay >= 30000 && args.delay <= 600000, '--delay-ms: 30000..600000');
  assert.ok(Number.isFinite(args.grace) && args.grace >= 0 && args.grace <= 60000, '--wait-ms: 0..60000');
  return args;
}

async function main() {
  if (process.argv.includes('--help')) { console.log(HELP); return; }
  const args = parseArgs(process.argv.slice(2));
  const packageBytes = await readFile(args.package), pkg = JSON.parse(packageBytes);
  assert.equal(pkg.id, args['app-id'], 'Candidate ID must exactly match --app-id');
  assert.ok(pkg.background, 'Candidate background entry required');
  const expectedPath = await realpath(args.expected);
  const expectedBytes = await readFile(expectedPath), expected = JSON.parse(expectedBytes);
  assert.ok(typeof expected.algorithm === 'string' && expected.algorithm.length > 0, 'Expected algorithm required');
  assert.ok(expected.payload && typeof expected.payload === 'object', 'Expected payload required');
  const expectedSha256 = sha256(expectedBytes);
  const extension = await realpath(args.extension);
  const manifestBytes = await readFile(path.join(extension, 'manifest.json'));
  const swSha256 = sha256(await readFile(path.join(extension, 'sw.js')));
  const report = {startedAt: new Date().toISOString(), step: args.step, appId: pkg.id,
    expected: expectedPath, expectedSha256, expectedResult: expected,
    package: args.package, packageSha256: sha256(packageBytes), extension, manifestSha256: sha256(manifestBytes), swSha256,
    driverSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
    helperSha256: sha256(await readFile(new URL('./dynamic-app-r14-helper.mjs', import.meta.url))), events: [], screenshots: [], status: 'RUNNING'};
  await mkdir(args.out, {recursive: true});
  const stateFile = path.join(args.out, 'driver-state.json');
  const reportFile = path.join(args.out, `${args.step}-${Date.now()}.json`);
  let state;
  try { state = JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = {appId: pkg.id, expected: expectedPath, expectedSha256, packageSha256: report.packageSha256, manifestSha256: report.manifestSha256, swSha256, extension}; }
  assert.equal(state.appId, pkg.id, 'Persisted app identity changed');
  assert.equal(state.packageSha256, report.packageSha256, 'Persisted candidate bytes changed; use another --out');
  assert.equal(state.manifestSha256, report.manifestSha256, 'Persisted extension manifest changed; use another --out');
  assert.equal(state.swSha256, swSha256, 'Persisted production worker changed; use another --out');
  assert.equal(state.extension, extension, 'Persisted extension directory changed');
  assert.equal(state.expected, expectedPath, 'Persisted expected file changed; use another --out');
  assert.equal(state.expectedSha256, expectedSha256, 'Persisted expected bytes changed; use another --out');
  report.expectedBoundAfterSchedule = state.expectedBoundAfterSchedule === true;
  const persist = async () => {
    state.updatedAt = new Date().toISOString();
    await writeFile(stateFile, JSON.stringify(state, null, 2) + '\n');
    await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  };
  const note = async (name, data = {}) => { const event = {at: new Date().toISOString(), name, ...data}; report.events.push(event); console.log(JSON.stringify(event)); await persist(); };
  let c, manager, side, frame, monitoringClosed = false;
  const closedHttpEvents = [];
  const shot = async name => { report.screenshots.push(await screenshot(c, side.session, path.join(args.out, `${path.basename(reportFile, '.json')}-${name}.png`))); await persist(); };
  const targets = async () => (await c.send('Target.getTargets')).targetInfos;
  const noHttp = async () => {
    const http = (await targets()).filter(t => /^https?:/i.test(t.url));
    assert.deepEqual(http, [], 'HTTP targets must be absent; driver never closes leader tabs');
    return http;
  };
  const installed = () => read(c, side.session, `chrome.storage.local.get('opendesk.sidebar-tools.installed.v1').then(v=>v['opendesk.sidebar-tools.installed.v1']?.find(t=>t.id===${JSON.stringify(pkg.id)})||null)`);
  const output = () => read(c, frame.session, `(()=>{const s=${queryExpression('#status')},o=${queryExpression('#output')};let value;try{value=JSON.parse(o?.textContent)}catch{}return {status:s?.textContent,error:s?.dataset.error==='true',output:o?.textContent,value};})()`);
  const appAction = async (selector, operation) => {
    await click(c, frame.session, selector, side.session);
    const result = await until(async () => {
      const current = await output();
      return current.value?.operation === operation && !/^正在/.test(current.status || '') ? current : false;
    }, 'UI receipt ' + operation);
    await note('app-action', {selector, ...result});
    assert.equal(result.error, false, 'App UI error: ' + result.output);
    assert.equal(result.value?.code, undefined, 'App SDK error');
    return result;
  };
  const open = async () => {
    if (side && (await targets()).some(t => t.targetId === side.targetId)) return;
    // Reuse only our persisted manager; unrelated documents are never navigated or closed.
    if (state.managerTargetId && (await targets()).some(t => t.targetId === state.managerTargetId)) {
      const target = (await targets()).find(t => t.targetId === state.managerTargetId);
      assert.equal(target.url, state.managerUrl, 'Persisted manager target URL changed');
      manager = {targetId: target.targetId, session: await attach(c, target.targetId)};
    } else {
      const url = `chrome-extension://${state.extensionId}/sidepanel.html?hostInstanceId=${randomUUID()}`;
      const {targetId} = await c.send('Target.createTarget', {url});
      manager = {targetId, session: await attach(c, targetId)};
      state.managerTargetId = targetId; state.managerUrl = url; await persist();
    }
    await c.send('Target.activateTarget', {targetId: manager.targetId});
    assert.equal(await read(c, manager.session, 'chrome.runtime.id'), state.extensionId, 'Actual manager extension ID must match the candidate');
    const before = await read(c, manager.session, `chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})`);
    assert.ok(before.every(x => x.documentId === state.sideDocumentId), 'Unowned real Side Panel is open; coordinate with leader');
    await click(c, manager.session, '#catalog-open-dev-sidebar');
    const context = await until(() => read(c, manager.session,
      `chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}).then(rows=>rows.find(x=>x.documentUrl.startsWith('chrome-extension://${state.extensionId}/sidepanel.html'))||null)`), 'Real SIDE_PANEL context');
    const target = await until(async () => (await targets()).find(t => t.url === context.documentUrl && t.targetId !== manager.targetId), 'Real Side Panel target');
    side = {targetId: target.targetId, session: await attach(c, target.targetId)};
    state.sideTargetId = side.targetId; state.sideDocumentId = context.documentId; state.sideUrl = context.documentUrl;
    await note('real-side-panel', {managerTargetId: manager.targetId, targetId: side.targetId, context});
  };
  try {
    const connection = await connectLaunch(args.launch, event => {
      if (['Target.targetCreated','Target.targetDestroyed','Target.targetInfoChanged'].includes(event.method))
        report.events.push({at: new Date().toISOString(), method: event.method, params: event.params});
      if (monitoringClosed && /^https?:/i.test(event.params?.targetInfo?.url || ''))
        closedHttpEvents.push({at: new Date().toISOString(), ...event.params.targetInfo});
    });
    c = connection.client;
    report.chrome = connection.version.Browser; report.profile = connection.launch.profile;
    if (state.profile) assert.equal(state.profile, report.profile, 'Persisted Chrome profile changed');
    state.profile = report.profile;
    const load = connection.launch.args?.find(a => a.startsWith('--load-extension='));
    assert.ok(load, 'launch.args must identify loaded extension directory');
    const loaded = await Promise.all(load.slice('--load-extension='.length).split(',').map(p => realpath(p)));
    assert.ok(loaded.includes(extension), '--extension must match actual launch --load-extension path');
    // Observe known URLs only; never attach to/debug the SW, including during its idle interval.
    const extensionIds = [...new Set((await targets()).filter(t => {
      if (!t.url.startsWith('chrome-extension://')) return false;
      const url = new URL(t.url);
      return (t.type === 'service_worker' && url.pathname === '/sw.js') ||
        (t.type === 'page' && url.pathname === '/sidepanel.html') ||
        (t.type === 'iframe' && url.pathname === '/sidebar-tools/sandbox.html');
    }).map(t => new URL(t.url).host))];
    assert.ok(extensionIds.length <= 1, 'Multiple extension identities; coordinate with leader');
    args['extension-id'] ||= state.extensionId || extensionIds[0];
    assert.match(args['extension-id'] || '', /^[a-p]{32}$/, 'Extension ID unavailable; pass --extension-id from the actual profile');
    if (extensionIds.length) assert.equal(extensionIds[0], args['extension-id'], 'Observed extension ID must match requested candidate');
    if (state.extensionId) assert.equal(state.extensionId, args['extension-id'], 'Persisted extension ID changed');
    state.extensionId = args['extension-id']; report.extensionId = state.extensionId;
    report.extensionIdentitySource = extensionIds.length ? 'observed-known-extension-url' : 'explicit-extension-id-verified-on-open';
    await c.send('Target.setDiscoverTargets', {discover: true});
    await note('connected-existing-chrome', {profile: state.profile, extensionId: state.extensionId});
    await noHttp();

    const steps = args.step === 'all' ? ['install','schedule','read'] : [args.step];
    for (const step of steps) {
      report.phase = step;
      if (step === 'open') {
        await open(); assert.deepEqual(await installed(), pkg, 'Installed app matches candidate');
        frame = await openFixture(c, side.session, pkg.id);
        report.openSnapshot = await read(c, side.session, nativeSnapshot);
        assert.equal(report.openSnapshot.cloudDisabled, true, 'Cloud must be disabled');
        assert.deepEqual(report.openSnapshot.httpTabs, [], 'No HTTP tabs');
        await noHttp(); await shot('app-open'); await note('app-open-only', {normalChain: 'NOT_TESTED'});
      }
      if (step === 'install') {
        await open(); await click(c, side.session, '#tab-tools');
        report.beforeInstall = await read(c, side.session, nativeSnapshot);
        assert.equal(report.beforeInstall.cloudDisabled, true, 'Cloud must be disabled');
        assert.deepEqual(report.beforeInstall.httpTabs, [], 'No HTTP tabs before install');
        const prior = await installed();
        await note('installed-baseline', {id: prior?.id || null, version: prior?.version || null});
        if (prior) assert.deepEqual(prior, pkg, 'Existing same ID has different bytes/version; no implicit upgrade');
        if (!prior) {
          if (!await visible(c, side.session, '#sidebar-tool-import')) {
            await click(c, side.session, '#extension-center-more');
            await click(c, side.session, '#extension-center-import');
          }
          await nativeSelectToolPackage(c, side.session, args.package);
          const confirm = await until(async () => {
            for (const selector of ['#sidebar-tool-import-confirm', '#sidebar-tool-install'])
              if (await visible(c, side.session, selector)) return selector;
            return false;
          }, 'Actual import confirmation button');
          await note('import-review', {confirm, review: await read(c, side.session, `document.querySelector('#sidebar-tool-preview')?.innerText||document.body.innerText`)});
          await shot('import-review');
          state.installAttempt = {at: new Date().toISOString(), status: 'SUBMITTING'}; await persist();
          await click(c, side.session, confirm);
          const row = await until(installed, 'Installer persisted original app ID');
          assert.deepEqual(row, pkg, 'Installed app must equal exact selected package');
          state.installAttempt.status = 'CONFIRMED';
        }
        frame = await openFixture(c, side.session, pkg.id);
        await appAction('#storage-set', 'browser.storage.local.set');
        const result = await appAction('#storage-get', 'browser.storage.local.get');
        assert.equal(result.value?.result?.items?.preflightUi?.value, 'storage-ok', 'Real app storage write/read');
        await appAction('#storage-quota', 'browser.storage.local.getQuota');
        state.installed = true; await shot('ui-storage'); await note('install-and-ui-complete');
      }
      if (step === 'schedule') {
        assert.ok(!state.scheduleAttempt, 'Schedule already attempted; inspect state/read instead of replaying');
        await open(); assert.deepEqual(await installed(), pkg, 'Installed app matches candidate');
        frame = await openFixture(c, side.session, pkg.id);
        const baselineResult = await appAction('#storage-get', 'browser.storage.local.get');
        assert.equal(baselineResult.value?.result?.items?.result, undefined, 'Existing result would make this Alarm proof ambiguous; use a fresh leader profile');
        state.baseline = baselineResult.value?.result?.items;
        await note('background-result-absent', {baseline: state.baseline});
        const baseline = await read(c, side.session, nativeSnapshot); report.beforeSchedule = baseline;
        assert.equal(baseline.cloudDisabled, true, 'Cloud must be disabled');
        await noHttp(); assert.deepEqual(baseline.httpTabs, [], 'No HTTP tabs before schedule');
        const due = new Date(Date.now() + args.delay).toISOString();
        await nativeText(c, frame.session, '#schedule-at', due, side.session);
        state.scheduleAttempt = {due, status: 'SUBMITTING', at: new Date().toISOString()}; await persist();
        await click(c, frame.session, '#schedule-once', side.session);
        await until(() => visible(c, side.session, '#sidebar-tool-action-continue'), 'Trusted schedule approval');
        report.approval = await read(c, side.session, `document.querySelector('#sidebar-tool-action-review')?.innerText||document.body.innerText`);
        await shot('schedule-review'); await note('trusted-schedule-review', {review: report.approval});
        await click(c, side.session, '#sidebar-tool-action-continue');
        const receipt = await until(async () => { const r = await output(); return r.value?.operation === 'browser.scheduler.create' && !/^正在/.test(r.status || '') ? r : false; }, 'Schedule UI receipt');
        report.scheduleReceipt = receipt; await note('schedule-receipt', receipt);
        assert.equal(receipt.error, false, 'Schedule UI failed: ' + receipt.output);
        assert.ok(receipt.value?.result, 'Nonempty schedule receipt required');
        state.scheduleAttempt.status = 'CONFIRMED'; state.scheduleAttempt.receipt = receipt.value.result;
        report.afterSchedule = await read(c, side.session, nativeSnapshot);
        assert.equal(report.afterSchedule.cloudDisabled, true, 'Cloud remains disabled');
        assert.ok(report.afterSchedule.alarms.some(a => a.name === 'opendesk.schedule.v1:'+receipt.value.result.scheduleRef && Math.abs(a.scheduledTime - Date.parse(due)) < 2000), 'Real native schedule Alarm exists');
        await shot('schedule-created');
        assert.equal((await c.send('Target.closeTarget', {targetId: side.targetId})).success, true, 'Close actual SIDE_PANEL');
        side = null; frame = null;
        await until(() => read(c, manager.session, `chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}).then(rows=>rows.length===0)`), 'No remaining real SIDE_PANEL');
        assert.equal((await c.send('Target.closeTarget', {targetId: manager.targetId})).success, true, 'Close manager tab');
        manager = null; state.managerTargetId = null; state.sideTargetId = null; state.sideDocumentId = null;
        state.closedAt = new Date().toISOString(); await note('all-owned-ui-closed', {due});
        assert.ok(Date.now() < Date.parse(due), 'UI must close before scheduled Alarm time');
        monitoringClosed = true;
        const end = Date.parse(due) + args.grace;
        while (Date.now() < end) {
          await noHttp();
          const remaining = Math.max(0, end - Date.now());
          console.log(JSON.stringify({name: 'waiting-natural-alarm', remainingMs: remaining}));
          await sleep(Math.min(5000, remaining));
        }
        await noHttp();
        monitoringClosed = false; report.closedHttpEvents = closedHttpEvents;
        assert.deepEqual(closedHttpEvents, [], 'No transient HTTP targets during closed UI interval');
        state.waitedUntil = new Date().toISOString(); await note('natural-alarm-wait-complete');
      }
      if (step === 'read') {
        assert.ok(state.closedAt && state.scheduleAttempt?.status === 'CONFIRMED', 'Successful schedule + panel close required before result proof');
        assert.ok(state.waitedUntil && Date.parse(state.waitedUntil) >= Date.parse(state.scheduleAttempt.due), 'Completed natural Alarm wait required before result proof');
        assert.ok(Date.now() >= Date.parse(state.scheduleAttempt.due), 'Alarm due time has not arrived');
        await noHttp(); await open();
        report.afterWait = await read(c, side.session, nativeSnapshot);
        assert.equal(report.afterWait.cloudDisabled, true, 'Cloud remains disabled after Alarm');
        assert.deepEqual(report.afterWait.httpTabs, [], 'No HTTP tabs after Alarm');
        assert.deepEqual(await installed(), pkg, 'Installed app still matches candidate');
        frame = await openFixture(c, side.session, pkg.id);
        const result = await appAction('#storage-get', 'browser.storage.local.get');
        await shot('background-result');
        const backgroundResult = result.value?.result?.items?.result;
        assert.ok(backgroundResult && typeof backgroundResult === 'object', 'Background result required');
        assert.equal(backgroundResult.algorithm, expected.algorithm, 'Background algorithm must match expected exactly');
        assert.deepEqual(backgroundResult.payload, expected.payload, 'Complete background payload must match expected exactly');
        const security = backgroundResult.security;
        for(const [name,value] of Object.entries(expected.security||{}))assert.deepEqual(security?.[name],value,'Expected security observation '+name);
        assert.ok(security && typeof security === 'object', 'Background security receipt required');
        assert.ok(security.opaqueOrigin === 'null' || security.opaqueOrigin === null, 'Background origin must be opaque (null string or null)');
        assert.equal(security.chromePrivilege, false, 'Background must not hold Chrome runtime privileges');
        assert.equal(security.foreignOwner, 'E_SCHEMA', 'Foreign owner override must be rejected with E_SCHEMA');
        assert.equal(security.tabs, false, 'Background tabs capability must remain unavailable');
        for (const operation of ['fetch','importScripts','dynamicImport']) {
          assert.ok(typeof security[operation] === 'string' && security[operation].length > 0, operation + ' rejection receipt required');
          assert.notEqual(security[operation], 'ACCEPTED', operation + ' must not be accepted');
        }
        for (const name of ['foreignWrite','foreignStorageKeyRejected']) assert.equal(security[name], 'E_SCHEMA', name+' must be rejected');
    assert.equal(security.readLimitHandled, 'E_LIMIT', 'Rejected large read must remain catchable');
    for (const field of ['appId','namespace','runId','generation','packageHash','codeHash','origin']) assert.equal(security.bindingForgeries?.[field], 'E_SCHEMA', 'Forged '+field+' rejected');
    assert.notEqual(security.webSocket, 'ACCEPTED', 'WebSocket must be rejected');
    assert.ok(Array.isArray(security.cspViolations), 'Actual CSP violation observations required');
    for (const [blocked,directive] of [['https://example.invalid/opendesk-r14-fetch','connect-src'],['https://example.invalid/opendesk-r14-script.js','script-src'],['https://example.invalid/opendesk-r14-module.js','script-src'],['wss://example.invalid/opendesk-r14','connect-src']]) {
      assert.ok(security.cspViolations.some(v=>v.blocked===blocked && v.directive.startsWith(directive)), 'CSP must explain blocked '+blocked);
    }
    const ledgerExpression = '('+ (async function(appId){
      const request=indexedDB.open('opendesk-browser');
      const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onupgradeneeded=()=>{request.transaction.abort();reject(Error('Existing database required'));};});
      const rows=async name=>{const tx=db.transaction(name,'readonly'),rq=tx.objectStore(name).getAll();return new Promise((resolve,reject)=>{let value;rq.onsuccess=()=>value=rq.result;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);});};
      try {const runs=(await rows('runs')).filter(r=>r.profile==='app-service' && r.appBinding?.appId===appId),ids=runs.map(r=>r.runId);return {runs,results:(await rows('results')).filter(r=>ids.includes(r.runId)),journal:(await rows('commandJournal')).filter(r=>ids.includes(r.runId))};}finally{db.close();}
    }).toString()+')('+JSON.stringify(pkg.id)+')';
    const firePrefix='sched:'+state.scheduleAttempt.receipt.scheduleRef+':';
    const ledger=await until(async()=>{const l=await read(c,side.session,ledgerExpression),r=l.runs.find(r=>r.scheduledFireId?.startsWith(firePrefix));return r?.workerRetired?l:false;}, 'This Alarm run and Worker settlement');
    const runs=ledger.runs.filter(r=>r.scheduledFireId?.startsWith(firePrefix));
    assert.equal(runs.length,1,'Exactly one Run for this approved once schedule');
    const run=runs[0],stored=ledger.results.find(r=>r.runId===run.runId && r.resultId===run.resultId);
    assert.equal(run.state,'completed','Persisted business data alone cannot prove Run completion');
    assert.equal(run.workerRetired,true,'Actual Worker retirement required');
    assert.equal(run.appBinding.packageHash,report.packageSha256,'Run package identity');
    assert.equal(run.appBinding.codeHash,pkg.background.sha256,'Run background identity');
    assert.equal(stored?.state,'completed','Matching durable Result required');
    assert.equal(stored?.outcome?.ok,true,'Matching successful outcome required');
    const journal=ledger.journal.filter(j=>j.runId===run.runId && j.envelope?.operation);
    assert.ok(journal.some(j=>j.envelope.operation.method==='browser.storage.local.set'),'Original SDK journal required');
    assert.ok(journal.every(j=>j.state==='durable'),'No unknown or pending SDK operations in normal chain');
    report.runEvidence={run,result:stored,journal};
    await note('alarm-run-result-journal-linked',{fireId:run.scheduledFireId,runId:run.runId,resultId:run.resultId,state:run.state});
    state.result = result.value.result.items; state.readAt = new Date().toISOString();
        await noHttp(); await note('background-result-expected-and-security', {result: backgroundResult});
      }
    }
    report.normalChain = (args.step === 'all' || args.step === 'read') &&
      state.baseline && !Object.hasOwn(state.baseline, 'result') ? 'PASS' : 'NOT_TESTED';
    report.status = args.step === 'open' ? 'OPENED' : 'PASS'; report.finishedAt = new Date().toISOString(); await persist();
    console.log(JSON.stringify({status: report.status, phase: args.step, stateFile, reportFile}));
  } catch (error) {
    report.status = 'FAIL'; report.error = {message: error.message, stack: error.stack};
    if (c && side) { try { await shot('failure'); } catch {} }
    await persist(); console.error(JSON.stringify({status: 'FAIL', phase: report.phase, error: error.message, stateFile, reportFile}));
    process.exitCode = 1;
  } finally { c?.close(); }
}

await main();
