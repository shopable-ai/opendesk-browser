// Opt-in after the existing same-profile offline restart PASS. No launcher/main.
// The leader owns Browser.close, connections and disposable-profile cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {verifiedControllerESMAuthorSource} from '../../src/ui/controller-esm-source.js';

const DATABASE = 'opendesk-browser';
const SHA = '691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d';
const ASSET = 'userscript-asset:v1:sha256:' + SHA;
const WEBSITE = 'http://127.0.0.1:43111/demo-form.html';
const ORIGINS = ['http://127.0.0.1:43111/*', 'https://raw.githubusercontent.com/*'];
// verifiedAsset in dependency-manager.js emits this exact code for changed bytes.
const BAD_SHA_CODE = 'E_DEPENDENCY_HASH';
const deepNode = test => `(()=>{const roots=[document];while(roots.length){for(const el of roots.pop().querySelectorAll('*')){if(${test})return el;if(el.shadowRoot)roots.push(el.shadowRoot);}}return null;})()`;
const rawError = error => ({name:error.name, code:error.code, message:String(error.message || error), stack:error.stack});

// Runtime evaluates only observations. Abort unexpected DB creation/upgrades.
async function databaseObservation(database, assetKey, namespace, scriptId, revision) {
  if (!(await indexedDB.databases()).some(row => row.name === database)) throw Error('Existing DB missing');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(database);
    request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Schema writes forbidden')); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    if (!db.objectStoreNames.contains('frameworkKV')) throw Error('Existing frameworkKV missing');
    const records = [], saved = [];
    for (const name of ['frameworkKV', 'runs', 'results', 'scriptRevisions']) {
      if (!db.objectStoreNames.contains(name)) continue;
      const store = db.transaction(name, 'readonly').objectStore(name);
      const requestValue = request => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const [keys, rows] = await Promise.all([requestValue(store.getAllKeys()), requestValue(store.getAll())]);
      rows.forEach((row, index) => {
        if (row?.namespace !== namespace) return;
        if (['controller-run', 'controller-result'].includes(row.tag)) records.push({store:name, key:keys[index], row});
        if (row.tag === 'script-revision' && row.scriptId === scriptId && row.revision === revision)
          saved.push({store:name, key:keys[index], row});
      });
    }
    const asset = await new Promise((resolve, reject) => {
      const request = db.transaction('frameworkKV', 'readonly').objectStore('frameworkKV').get(assetKey);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    if (!asset || !(asset.bytes instanceof ArrayBuffer)) throw Error('Exact D3 ArrayBuffer asset missing');
    const bytes = new Uint8Array(asset.bytes);
    const hex = array => Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    const {bytes:ignored, ...metadata} = asset;
    return {database, records, saved, asset:{key:assetKey, metadata, byteLength:bytes.length,
      bytesHex:hex(bytes), actualSha256:hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))}};
  } finally { db.close(); }
}

export async function runR78D3SecurityCycle({browser, base, extensionId, website, sidebar, panelTarget,
  connect, until, clickReal, report, output, read}) {
  const proof = {caseId:'R78-D3-NATIVE-SECURITY', status:'IN_PROGRESS', startedAt:new Date().toISOString(),
    scope:'Leader-owned disposable same-profile CFT; only the exact D3 cache asset is faulted', requests:[],
    revocation:{caseId:'R78-D3-CHROME-ORIGIN-REVOKED', status:'IN_PROGRESS'},
    badSHA:{caseId:'R78-D3-CACHE-BAD-SHA', status:'IN_PROGRESS'}, cleanupErrors:[]};
  report.tests.push(proof);
  const targetsToClose = [], removers = [];
  const write = (name, value) => fs.writeFileSync(path.join(output, 'r78-d3-security-' + name),
    Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  const screenshot = async (session, name) => {
    const shot = await session.call('Page.captureScreenshot', {format:'png'});
    write(name + '.png', Buffer.from(shot.data, 'base64'));
  };
  const targets = async () => {
    const response = await fetch(base + '/json/list'); assert(response.ok); return response.json();
  };
  const key = async (session, name, code, windowsVirtualKeyCode) => {
    for (const type of ['keyDown', 'keyUp'])
      await session.call('Input.dispatchKeyEvent', {type, key:name, code, windowsVirtualKeyCode});
  };
  const permissions = async () => {
    const granted = [];
    for (const origin of ORIGINS) granted.push(await read('chrome.permissions.contains({origins:[' + JSON.stringify(origin) + ']})'));
    return {origins:ORIGINS, granted, all:await read('chrome.permissions.getAll()')};
  };
  const uiExpression = `(()=>{const get=id=>document.getElementById(id);return {
    scriptId:get('script-id')?.value,revision:Number(get('script-revision')?.value),source:get('script-source')?.value,
    params:get('script-params')?.value,runId:get('script-run-id')?.value,runDisabled:get('script-run')?.disabled,
    state:get('script-status')?.dataset.state,message:get('script-status')?.textContent,
    currentPageState:get('script-current-page-status')?.dataset.state,currentPageDebug:get('script-current-page-debug')?.textContent};})()`;
  let saved, baseline, workerTarget;
  const observe = async () => ({ui:await read(uiExpression), page:await website.session.read(`(()=>{
    const count=document.querySelector('#search-count');if(!count)throw Error('Demo counter missing');
    return {url:location.href,count:Number(count.textContent.replace(/\\D/g,'')),countText:count.textContent,
      keyword:document.querySelector('#keyword')?.value,result:document.querySelector('#results')?.textContent};})()`),
    durable:await read('(' + databaseObservation.toString() + ')(' +
      [DATABASE, ASSET, 'tool:' + extensionId, saved.scriptId, saved.revision].map(value => JSON.stringify(value)).join(',') + ')')});
  const unchanged = (before, after, {revoked = false} = {}) => {
    assert.deepEqual(after.page, before.page, 'Rejected Run must leave the website/count unchanged');
    for (const field of ['scriptId', 'revision', 'source', 'params', 'runId'])
      assert.equal(after.ui[field], before.ui[field], 'Rejected Run changed ' + field);
    // Permission removal deliberately revokes delivery of existing results.
    // Only that fail-closed marker may change; admission, results and identities stay exact.
    const expectedRecords = revoked ? before.durable.records.map(entry => entry.row.tag === 'controller-run'
      ? {...entry, row:{...entry.row, resultDeliveryRevoked:true}} : entry) : before.durable.records;
    assert.deepEqual(after.durable.records, expectedRecords, 'No new Controller admission/run/result or unexpected durable history change');
    assert.deepEqual(after.durable.saved, before.durable.saved, 'Same saved Revision must remain unchanged');
  };
  const offline = async (session, label) => {
    const remove = session.on('Network.requestWillBeSent', event => proof.requests.push({label, url:event.request.url, requestId:event.requestId}));
    if (typeof remove === 'function') removers.push(remove);
    await session.call('Network.enable');
    await session.call('Network.emulateNetworkConditions', {offline:true, latency:0, downloadThroughput:-1, uploadThroughput:-1});
  };
  const assertOffline = async () => {
    assert((await targets()).some(row => row.id === workerTarget.id), 'Offline SW changed; no unobserved online replacement allowed');
    proof.network = {offlineSW:true, offlineSidebar:true,
      dependencyRequests:proof.requests.filter(row => /^https?:\/\/(?:raw\.githubusercontent\.com|(?:[^/]+\.)?jsdelivr\.net)(?:[/:]|$)/i.test(row.url))};
    assert.deepEqual(proof.network.dependencyRequests, [], 'No dependency network fallback, including attempted requests');
  };
  const activateWebsite = async () => {
    await browser.call('Target.activateTarget', {targetId:website.info.id});
    await until(() => read('chrome.tabs.query({active:true,currentWindow:true}).then(rows=>rows.length===1&&rows[0].url===' +
      JSON.stringify(WEBSITE) + ')'), 'Real active tab is the demo website');
  };
  try {
    assert(output && fs.statSync(output).isDirectory(), 'Use the leader evidence directory');
    assert.match(extensionId, /^[a-p]{32}$/);
    assert.equal(new URL(base).hostname, '127.0.0.1');
    assert.equal(await read('chrome.runtime.id'), extensionId);
    assert.equal(await read('location.href'), panelTarget.url);
    const positive = report.tests.find(row => row.caseId === 'R78-A-CHROMEPAGE-D3');
    const restart = report.tests.findLast(row => row.caseId === 'R78-D3-SAME-PROFILE-OFFLINE-RESTART');
    assert.match(positive?.status || '', /^CHROME_PASS_R78_/);
    assert.equal(restart?.status, 'CHROME_PASS_R78_D3_SAME_PROFILE_OFFLINE_RESTART', 'Opt in only after restart positive PASS');
    assert.equal(restart.sameProfile, true); assert.equal(restart.profile, report.launch.profile);
    assert.equal(restart.packageBefore.packageHash, positive.packageBefore.packageHash);
    saved = positive.savedRevision;
    assert.deepEqual(restart.savedRevision, saved);
    const author = await verifiedControllerESMAuthorSource(saved.sourceUtf8);
    assert.equal(author?.programId, saved.scriptId);
    proof.identity = {extensionId, panelTarget, websiteTarget:website.info, profile:restart.profile,
      pid:restart.newPid, packageHash:restart.packageBefore.packageHash, savedRevision:saved};
    workerTarget = await until(async () => (await targets()).find(row => row.type === 'service_worker' &&
      row.url === 'chrome-extension://' + extensionId + '/sw.js' && row.webSocketDebuggerUrl), 'Existing restarted SW');
    const worker = await connect(workerTarget.webSocketDebuggerUrl);
    assert.equal(await worker.read('chrome.runtime.id'), extensionId);
    await offline(worker, 'service_worker'); await offline(sidebar, 'sidebar');
    await activateWebsite();
    await until(() => read('document.querySelector("#script-current-page-status")?.dataset.state==="available"'), 'Current page available');
    await until(() => read('!document.querySelector("#script-run").disabled'), 'Loaded saved Controller ready before withdrawal', 45000);
    baseline = await observe(); proof.before = baseline; write('before.json', baseline);
    assert.equal(baseline.page.url, WEBSITE); assert(Number.isSafeInteger(baseline.page.count));
    assert.equal(baseline.ui.scriptId, saved.scriptId); assert.equal(baseline.ui.revision, saved.revision);
    assert.equal(baseline.ui.source, author.authorSourceUtf8);
    assert.equal(baseline.ui.runId, restart.ui.runId);
    const run = baseline.durable.records.find(entry => entry.row.tag === 'controller-run' && entry.row.runId === baseline.ui.runId)?.row;
    assert.equal(run?.state, 'completed'); assert.equal(run.retirementState, 'released');
    assert.equal(run.revision.sourceHash, saved.contentHash);
    assert(baseline.durable.records.some(entry => entry.row.tag === 'controller-result' && entry.row.resultId === run.resultId));
    assert(baseline.durable.saved.some(entry => entry.row.sourceUtf8 === saved.sourceUtf8 && entry.row.contentHash === saved.contentHash));
    assert.equal(baseline.durable.asset.byteLength, 502); assert.equal(baseline.durable.asset.metadata.sha256, SHA);
    assert.equal(baseline.durable.asset.metadata.tag, 'userscript-asset-v1');
    assert.equal(baseline.durable.asset.actualSha256, SHA);
    proof.revocation.permissionsBefore = await permissions(); assert.deepEqual(proof.revocation.permissionsBefore.granted, [true, true]);

    const created = await browser.call('Target.createTarget', {url:'chrome://extensions/?id=' + extensionId});
    targetsToClose.push(created.targetId);
    const settingsTarget = await until(async () => (await targets()).find(row => row.id === created.targetId && row.webSocketDebuggerUrl), 'Real Chrome extensions settings');
    const settings = await connect(settingsTarget.webSocketDebuggerUrl);
    proof.revocation.settingsTarget = settingsTarget;
    const selector = deepNode('el.id==="newHostAccess"');
    const focused = '(()=>{let el=document.activeElement;while(el?.shadowRoot?.activeElement)el=el.shadowRoot.activeElement;return el===(' + selector + ');})()';
    const selectInfo = () => settings.read('(()=>{const el=(' + selector + ');return {value:el.value,selectedIndex:el.selectedIndex,options:Array.from(el.options,o=>({value:o.value,text:o.textContent}))};})()');
    const focusSelect = async () => {
      await browser.call('Target.activateTarget', {targetId:settingsTarget.id});
      await until(() => settings.read('(' + selector + ')!==null'), 'Chrome newHostAccess selector');
      for (let i = 0; i < 60 && !(await settings.read(focused)); i++) await key(settings, 'Tab', 'Tab', 9);
      assert.equal(await settings.read(focused), true, 'Native Tab must focus Chrome site access select');
    };
    await focusSelect(); proof.revocation.selectorBefore = await selectInfo();
    await screenshot(settings, 'revocation-selector-ready');
    if(process.env.OPENDESK_R78_SITE_ACCESS_NATIVE==='1'){
      write('site-access-ready.json',{phase:'withdraw',pid:restart.newPid,extensionId,settingsTarget,
        expectedValue:'ON_CLICK',entry:'Mac native Chrome site access control'});
    }else{
      await clickReal(settings,selector);
      await key(settings, 'Home', 'Home', 36);await key(settings,'Enter','Enter',13);
    }
    proof.revocation.selectorAfterHome = await selectInfo();
    await until(async () => (await permissions()).granted.every(value => value === false), 'Both website and raw GitHub permissions withdrawn',
      process.env.OPENDESK_R78_SITE_ACCESS_NATIVE==='1'?180000:15000);
    proof.revocation.selectorAfterHome = await selectInfo(); proof.revocation.permissionsAfter = await permissions();
    await screenshot(settings, 'revocation-selector-home');
    await activateWebsite();
    proof.revocation.beforeRun = await observe();
    if (proof.revocation.beforeRun.ui.runDisabled) {
      proof.revocation.blocked = {state:'disabled', ui:proof.revocation.beforeRun.ui};
    } else {
      await clickReal(sidebar, 'document.querySelector("#script-run")');
      proof.revocation.blocked = await until(async () => {
        const ui = await read(uiExpression); return ui.state === 'error' ? ui : null;
      }, 'Real Run refused after Chrome origin revocation', 30000);
      assert.match(proof.revocation.blocked.message, /\b(?:E_PERMISSION|E_DEPENDENCY_PERMISSION|E_PERMISSION_CHECK_REQUIRED)\b/, 'Only existing fail-closed permission codes accepted');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    proof.revocation.after = await observe(); unchanged(baseline, proof.revocation.after, {revoked:true});
    proof.revocation.permissionsBlocked = await permissions(); assert.deepEqual(proof.revocation.permissionsBlocked.granted, [false, false]);
    await screenshot(sidebar, 'revocation-blocked'); await assertOffline();
    write('revocation-observations.json', proof.revocation);
    await focusSelect();
    if(process.env.OPENDESK_R78_SITE_ACCESS_NATIVE==='1'){
      write('site-access-restore-ready.json',{phase:'restore',pid:restart.newPid,extensionId,settingsTarget,
        expectedValue:'ON_ALL_SITES',entry:'Mac native Chrome site access control'});
    }else{
      await clickReal(settings,selector);
      await key(settings, 'End', 'End', 35);await key(settings,'Enter','Enter',13);
    }
    await until(async () => (await permissions()).granted.every(value => value === true), 'Chrome selector restores both permissions',
      process.env.OPENDESK_R78_SITE_ACCESS_NATIVE==='1'?180000:15000);
    proof.revocation.selectorAfterEnd = await selectInfo(); proof.revocation.permissionsRestored = await permissions();
    await screenshot(settings, 'revocation-selector-end');
    await activateWebsite();
    await until(() => read('document.querySelector("#script-current-page-status")?.dataset.state==="available"'), 'Current page available after Chrome restoration');
    await until(() => read('!document.querySelector("#script-run").disabled'), 'Loaded Controller Run ready after restoration', 45000);
    proof.revocation.restored = await observe(); unchanged(proof.revocation.after, proof.revocation.restored);
    assert.equal(proof.revocation.restored.durable.asset.actualSha256, SHA);
    proof.revocation.status = 'CHROME_PASS_R78_D3_CHROME_ORIGIN_REVOKED';
    write('revocation-observations.json', proof.revocation);

    proof.badSHA.before = await observe();
    assert.equal(proof.badSHA.before.durable.asset.byteLength, 502);
    assert.equal(proof.badSHA.before.durable.asset.actualSha256, SHA);
    const command = `(async()=>{const database=${JSON.stringify(DATABASE)},key=${JSON.stringify(ASSET)},expected=${JSON.stringify(SHA)},originalHex=${JSON.stringify(proof.badSHA.before.durable.asset.bytesHex)};
      if(!(await indexedDB.databases()).some(row=>row.name===database))throw Error('Existing DB missing');
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(database);r.onupgradeneeded=()=>{r.transaction.abort();reject(Error('Schema writes forbidden'));};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      try{await new Promise((resolve,reject)=>{const tx=db.transaction('frameworkKV','readwrite'),store=tx.objectStore('frameworkKV'),r=store.get(key);
        r.onsuccess=()=>{try{const row=r.result;if(row?.tag!=='userscript-asset-v1'||row.sha256!==expected||row.byteLength!==502||!(row.bytes instanceof ArrayBuffer)||row.bytes.byteLength!==502)throw Error('Exact D3 asset mismatch');
          const bytes=new Uint8Array(row.bytes.slice(0));if(Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')!==originalHex)throw Error('D3 bytes changed before fault');
          bytes[0]^=1;store.put({...row,bytes:bytes.buffer},key);
        }catch(error){tx.abort();reject(error);}};
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Exact D3 fault aborted'));tx.onerror=()=>reject(tx.error);
      });console.info('OPENDESK_R78_EXACT_D3_XOR1_DONE');}finally{db.close();}})()`;
    proof.badSHA.command = command; proof.badSHA.expectedCode = BAD_SHA_CODE;
    write('fault-command.js', command + '\n');
    const native = await browser.call('Target.openDevTools', {targetId:panelTarget.id, panelId:'console'});
    assert(native.targetId, 'Chrome must open real Sidebar DevTools'); targetsToClose.push(native.targetId);
    const devtoolsTarget = await until(async () => (await targets()).find(row => row.id === native.targetId && row.webSocketDebuggerUrl), 'Native DevTools frontend');
    const devtools = await connect(devtoolsTarget.webSocketDebuggerUrl);
    proof.badSHA.devtoolsTarget = devtoolsTarget;
    await nativeConsoleCommand({browser, devtools, devtoolsTarget, command, until, clickReal, key, write, screenshot});
    proof.badSHA.faulted = await until(async () => {
      const observation = await observe(); return observation.durable.asset.actualSha256 !== SHA ? observation : null;
    }, 'Read-only observation of exact D3 XOR fault', 15000);
    unchanged(proof.badSHA.before, proof.badSHA.faulted);
    const damaged = proof.badSHA.faulted.durable.asset, pristine = proof.badSHA.before.durable.asset;
    assert.equal(damaged.byteLength, 502); assert.deepEqual(damaged.metadata, pristine.metadata);
    assert.equal(parseInt(damaged.bytesHex.slice(0, 2), 16), parseInt(pristine.bytesHex.slice(0, 2), 16) ^ 1);
    assert.equal(damaged.bytesHex.slice(2), pristine.bytesHex.slice(2)); assert.notEqual(damaged.actualSha256, SHA);
    write('bad-sha-faulted.json', proof.badSHA.faulted);
    await browser.call('Target.closeTarget', {targetId:devtoolsTarget.id});
    targetsToClose.splice(targetsToClose.indexOf(devtoolsTarget.id), 1);
    await activateWebsite();
    await until(() => read('document.querySelector("#script-current-page-status")?.dataset.state==="available"'), 'Website restored before bad SHA Run');
    await until(() => read('!document.querySelector("#script-run").disabled'), 'Real loaded Controller Run available for bad SHA test', 45000);
    await assertOffline(); assert.deepEqual((await permissions()).granted, [true, true]);
    await clickReal(sidebar, 'document.querySelector("#script-run")');
    proof.badSHA.blocked = await until(async () => {
      const ui = await read(uiExpression); return ui.state === 'error' && /\bE_DEPENDENCY_HASH\b/.test(ui.message) ? ui : null;
    }, 'Original Controller UI rejects E_DEPENDENCY_HASH', 30000);
    await new Promise(resolve => setTimeout(resolve, 1000));
    proof.badSHA.after = await observe(); unchanged(proof.badSHA.before, proof.badSHA.after);
    assert.deepEqual(proof.badSHA.after.durable.asset, damaged, 'Bad cache remains faulted; no replacement/download repair');
    await screenshot(sidebar, 'bad-sha-blocked'); await assertOffline();
    proof.badSHA.status = 'CHROME_PASS_R78_D3_CACHE_BAD_SHA'; write('bad-sha-observations.json', proof.badSHA);
    proof.status = 'CHROME_PASS_R78_D3_NATIVE_SECURITY';
  } catch (error) {
    proof.status = 'CHROME_FAIL'; proof.error = rawError(error);
    for (const part of [proof.revocation, proof.badSHA]) if (part.status === 'IN_PROGRESS') part.status = 'CHROME_FAIL';
    if (saved) try { proof.failureObservation = await observe(); } catch (failure) { proof.observationError = rawError(failure); }
    try { await screenshot(sidebar, 'failure'); } catch (failure) { proof.screenshotError = rawError(failure); }
    throw error;
  } finally {
    for (const targetId of targetsToClose) try { await browser.call('Target.closeTarget', {targetId}); }
    catch (error) { proof.cleanupErrors.push(rawError(error)); }
    for (const remove of removers) try { remove(); } catch (error) { proof.cleanupErrors.push(rawError(error)); }
    proof.finishedAt = new Date().toISOString();
    if (proof.cleanupErrors.length) proof.status = 'CHROME_FAIL';
    try { write('cycle.json', proof); } catch (error) {
      if (!proof.error) throw error; proof.evidenceWriteError = rawError(error);
    }
    if (!proof.error && proof.cleanupErrors.length) throw Error('R78 security UI cleanup failed; see raw cycle evidence');
  }
  return proof;
}

async function nativeConsoleCommand({browser, devtools, devtoolsTarget, command, until, clickReal, key, write, screenshot}) {
  await browser.call('Target.activateTarget', {targetId:devtoolsTarget.id});
  const consoleTab = deepNode('el.getAttribute("role")==="tab"&&/Console|控制台/.test(el.getAttribute("aria-label")||el.textContent||"")');
  await until(() => devtools.read('(' + consoleTab + ')!==null'), 'Real DevTools Console tab');
  await until(async () => {
    if (await devtools.read('(' + consoleTab + ')?.getAttribute("aria-selected")==="true"')) return true;
    await clickReal(devtools, consoleTab); return null;
  }, 'Visible Console panel selected');
  const prompt = deepNode('(el.id==="console-prompt"||el.classList.contains("cm-content")&&el.getAttribute("contenteditable")==="true")&&el.getBoundingClientRect().height>0');
  const messages = () => devtools.read(`(()=>{const roots=[document],rows=[];while(roots.length){for(const el of roots.pop().querySelectorAll('*')){
    if(el.shadowRoot)roots.push(el.shadowRoot);if(el.classList.contains('console-message-text'))rows.push(el.textContent);}}return rows;})()`);
  try {
    await screenshot(devtools, 'console-ready');
    await until(() => devtools.read('(' + prompt + ')!==null'), 'Deep visible Console prompt');
    await clickReal(devtools, prompt);
    await devtools.call('Input.insertText', {text:command});
    await screenshot(devtools, 'console-command-typed');
    await key(devtools, 'Enter', 'Enter', 13);
    await until(async () => (await messages()).some(text => /^OPENDESK_R78_EXACT_D3_XOR1_DONE$/.test(text.trim())), 'Real Console fault transaction committed', 15000);
    write('console-messages.json', await messages()); await screenshot(devtools, 'console-fault-done');
  } catch (error) {
    try { write('console-failure-messages.json', await messages()); await screenshot(devtools, 'console-failure'); }
    catch (failure) { write('console-evidence-error.json', rawError(failure)); }
    throw error;
  }
}
