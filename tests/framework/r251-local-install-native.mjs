// Real Side Panel extension for local-dev-native-acceptance.mjs.
// No browser launcher, source edits, direct installation calls, or ACK replay.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {decodeValue} from '../../src/platform/page-port/codec.js';

const hashPattern = /^[a-f0-9]{64}$/;
const node = selector => `document.querySelector(${JSON.stringify(selector)})`;

/**
 * Required: tool, registrationId, controllerBindingId, pageBindingId, until,
 * clickNode, key, selectIndex, requestAgent, foundationProtocol, report, record.
 * Optional hooks reopenPanel/restartSameProfile return a NEW live
 * {tool, registrationId, documentId}; restart also returns
 * {previousPid, pid, previousProfile, profile}. They must update the parent's
 * mutable browser/options/target/tool sessions, not just return stale handles.
 * disconnectProvider closes only this runner's MCP after connected-only steps;
 * installed reuse and reopen/restart then run with the provider disconnected.
 * No hook supplied means NOT_TESTED, never an inferred lifecycle PASS.
 *
 * Extended interfaces: callback metadata is never an execution/installation ACK.
 * reloadTarget({view, installation, previousTarget, label}) performs
 * ONE real full-document reload/navigation of the owned demo tab and returns
 * {targetTool} addressing that exact tab. The helper independently reads
 * target.current and the original Page installation lastExecution.
 * pageUse: {hostSelector, actionSelector, readSelector, expectedDelta}; inner
 * selectors address the host's ShadowRoot. A real click proves installed UI use.
 * updateLocalProject({view, kind, version, bindingId, installation}) changes ONLY the parent's
 * authorized disposable project fixture, preserving its binding/project ID.
 * It waits for actual prepared state; return raw preparation metadata and optional
 * {expectedSourceHash}. This helper requests fixture version=2 for both kinds.
 * The next real Run proves source change; the callback return does not.
 * observeInstalledPage({label}) optionally returns extra readonly shadow/counter
 * observations. They supplement, never replace, original execution receipt/UI input.
 * dataProbes: array or async ({view, installations}) returning
 * [{kind, id, database, store, key, expected}] identify existing,
 * nonempty application data in the isolated extension profile. No seeding or
 * writes occur here. Missing probes => application-data preservation NOT_TESTED;
 * original run/result and Page execution/verification records are checked anyway.
 * taskParams: optional typed values keyed by the actual Task parameter name.
 * restartSameProfile calls the real launcher restart, reconnects parent's mutable
 * browser/target/options/tool and requestAgent closures, then calls openPanel.
 * Return actual {tool, registrationId, documentId, previousPid, pid,
 * previousProfile, profile}. The helper independently checks Native handshake.
 * Lifecycle callbacks must not silently reconnect a disconnected provider.
 */
export async function runR251LocalInstallation(ctx) {
  const {until, clickNode, key, selectIndex, requestAgent,
    foundationProtocol, report, record} = ctx;
  for (const name of ['until', 'clickNode', 'key', 'selectIndex', 'requestAgent', 'record'])
    assert.equal(typeof ctx[name], 'function', `R25.1 context requires ${name}`);
  assert.ok(ctx.tool && ctx.registrationId && foundationProtocol);
  assert.ok(ctx.controllerBindingId && ctx.pageBindingId);
  assert.notEqual(ctx.controllerBindingId, ctx.pageBindingId);
  assert.ok(Array.isArray(report.tests));
  let view = {tool: ctx.tool, registrationId: ctx.registrationId, documentId: ctx.panelDocumentId};
  const observer = '__r251NativeInputs_' + randomUUID().replaceAll('-', '');
  const evidence = {level: 'REAL_CFT_SIDE_PANEL_REGISTRY_OBSERVATION',
    cases: [], lifecycle: [], extensions: [], executions: [], upgrades: [],
    scope: 'Local Run → trusted Save/review/confirm → original registry identity',
    gaps: ['Installation response/ACK wire capture is NOT_TESTED; registry observation is not an ACK.',
      'Sidebar local Page preview adapter receipt is not exposed by the Native admission ledger; original preview receipt NOT_TESTED. Formal Page Verify receipt is observed separately.',
      'Historical offline/update NOT_TESTED receipts and failures are unchanged; new cases require new raw evidence. Revoked permission and unknown-ACK recovery remain NOT_TESTED.',
      'This helper does not prove Go provider, final F3, ZIP or the visual matrix.']};
  report.r251LocalInstallation = evidence;
  const emit = row => { report.tests.push(row); record('r251.local-install', row); };
  const currentInstallations = new Map();
  const durableExecutions = [];
  const extended = row => { evidence.extensions.push(row); emit(row); };
  const notTested = (name, reason) => extended({name, status: 'NOT_TESTED', reason});
  let providerDisconnected = false;

  async function observe(label) {
    const value = await view.tool.read(`(() => {
      const get=id=>document.getElementById(id);
      const inspect=id=>{const el=get(id);return el?{
        text:el.textContent,title:el.getAttribute('title'),hidden:el.hidden,
        dataset:{...el.dataset},attributes:Object.fromEntries(
          Array.from(el.attributes,a=>[a.name,a.value])),
        ...('value' in el?{value:el.value}:{}),
        ...('disabled' in el?{disabled:el.disabled}:{}),
        ...(el.options?{options:Array.from(el.options,o=>({value:o.value,
          text:o.textContent,selected:o.selected,disabled:o.disabled}))}:{})}:null;};
      return {url:location.href,registrationId:${JSON.stringify(view.registrationId)},
        panelDocumentId:${JSON.stringify(view.documentId ?? null)},observedAt:Date.now(),
        task:get('script-task-id')?.textContent,status:get('script-status')?.textContent,
        state:get('script-status')?.dataset.state,localState:get('local-project-status')?.dataset.state,
        localMode:get('local-project-mode')?.checked,bindingId:get('local-project-select')?.value,
        runDisabled:get('script-run')?.disabled,saveDisabled:get('script-save')?.disabled,
        reviewVisible:!!get('local-install-review')&&!get('local-install-review').hidden,
        installStatus:get('local-install-status')?.textContent,
        dom:Object.fromEntries(['script-status','script-task-status','script-task-id',
          'script-task-version','script-run-id','script-run','script-save',
          'script-result','script-result-kind','script-history','script-history-run',
          'script-current-page-host','script-current-page-status','script-current-page-title',
          'script-current-page-url','script-current-page-debug','script-running-target',
          'local-project-status','local-project-diagnostics','local-project-select',
          'local-project-params','local-install-status','page-preview-status',
          'page-preview-result','page-preview-technical'].map(id=>[id,inspect(id)])),
        observationLimit:'Private installer verified/preparationIdentity/providerEpoch are not exposed by DOM; DOM is not proof of their values.',
        inputs:globalThis[${JSON.stringify(observer)}]||[]};})()`);
    record('r251.observe', {label, value});
    return value;
  }
  async function observeRuntime(label, proof) {
    for (const method of ['target.current', 'bridge.status']) {
      try {
        const raw = await requestAgent(method, {}, randomUUID(), 3000);
        record('r251.runtime', {label, method, observedAt: Date.now(), raw});
      } catch (error) {
        record('r251.inspection-failure', {label, method, message: error.message});
      }
    }
    if (proof?.kind === 'controller') {
      try {
        const raw = await request('snapshotControllerRun', {runId: proof.id});
        record('r251.runtime', {label, method: 'snapshotControllerRun', runId: proof.id,
          observedAt: Date.now(), raw});
      } catch (error) {
        record('r251.inspection-failure', {label, method: 'snapshotControllerRun', message: error.message});
      }
    }
  }
  let lastExecution;
  async function request(method, payload = {}) {
    const reply = await view.tool.read(`chrome.runtime.sendMessage(${JSON.stringify({
      protocol: foundationProtocol, type: method, registrationId: view.registrationId, payload})})`);
    assert.equal(reply?.ok, true, `${method}: ${JSON.stringify(reply?.error)}`);
    return reply.data;
  }
  async function lists() {
    // Actual sender is the existing, authenticated Side Panel; no synthetic host.
    return {page: await request('listPagePrograms'), task: await request('listTaskCatalog')};
  }
  async function storedRows(tags) {
    return view.tool.read(`(async () => {
      const rows=[];
      for(const info of await indexedDB.databases()) {
        if(!info.name)continue;
        const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(info.name);
          q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
        try {for(const name of db.objectStoreNames) {
          const values=await new Promise((resolve,reject)=>{const q=db.transaction(name,'readonly').objectStore(name).getAll();
            q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
          rows.push(...values.filter(row=>${JSON.stringify(tags)}.includes(row?.tag))
            .map(row=>{const {installationToken,...publicRow}=row;return publicRow;}));
        }} finally {db.close();}
      }return rows;})()`);
  }
  const verificationRows = () => storedRows(['page-verification-v1']);
  async function armInputs() {
    await view.tool.read(`(() => {
      const name=${JSON.stringify(observer)};if(globalThis[name])return;
      globalThis[name]=[];
      document.addEventListener('click',event=>{
        const button=event.target.closest?.('button'),id=button?.id;
        if(!['script-run','script-save','local-install-confirm','task-run','task-toggle'].includes(id)&&
          !button?.dataset.taskId&&!button?.dataset.pageToolAction)return;
        const get=id=>document.getElementById(id);
        globalThis[name].push({id,isTrusted:event.isTrusted,at:performance.now(),
          bindingId:get('local-project-select')?.value,source:get('script-source')?.value,
          params:get('local-project-params')?.value,title:get('local-install-title')?.value,
          version:get('local-install-version')?.value,summary:get('local-install-summary')?.textContent,
          task:get('script-task-id')?.textContent,selectedTaskId:get('task-installed-list')?.value,
          taskId:button?.dataset.taskId,pageToolId:button?.dataset.pageToolId,
          pageToolAction:button?.dataset.pageToolAction,
          taskParams:Array.from(document.querySelectorAll('[data-task-param]'),e=>({
            name:e.dataset.taskParam,type:e.dataset.taskType,value:e.type==='checkbox'?e.checked:e.value}))});
      },true);})()`);
  }
  async function select(bindingId) {
    await clickNode(view.tool, node('#tab-develop'));
    if (!await view.tool.read(`${node('#local-project-mode')}.checked`))
      await clickNode(view.tool, `${node('#local-project-mode')}.closest('label')`);
    const index = await until(() => view.tool.read(`Array.from(${node('#local-project-select')}.options)
      .findIndex(o=>!o.disabled&&o.value===${JSON.stringify(bindingId)})`).then(i => i > 0 ? {index: i} : null),
    'R25.1 attached project option');
    if (await view.tool.read(`${node('#local-project-select')}.value`) !== bindingId)
      await selectIndex(view.tool, '#local-project-select', index.index);
    await until(() => view.tool.read(`!${node('#script-run')}.disabled`), 'R25.1 Run ready');
  }
  async function fill(selector, text) {
    await clickNode(view.tool, node(selector));
    await view.tool.call('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'a', code: 'KeyA',
      windowsVirtualKeyCode: 65, modifiers: 4, commands: ['selectAll']});
    await view.tool.call('Input.dispatchKeyEvent', {type: 'keyUp', key: 'a', code: 'KeyA',
      windowsVirtualKeyCode: 65, modifiers: 4});
    assert.equal(await view.tool.read(`(() => {const e=${node(selector)};
      return document.activeElement===e&&e.selectionStart===0&&e.selectionEnd===e.value.length})()`),
    true, 'trusted selectAll covers complete input');
    await view.tool.call('Input.insertText', {text});
    assert.equal(await view.tool.read(`${node(selector)}.value`), text);
    await key(view.tool, 'Tab', 'Tab', 9);
  }
  async function run(kind, bindingId) {
    lastExecution = null;
    await select(bindingId);
    const inputStart = await view.tool.read(`globalThis[${JSON.stringify(observer)}].length`);
    const previous = await view.tool.read(`${node('#script-task-id')}.textContent`);
    await clickNode(view.tool, node('#script-run'));
    const prefix = kind === 'controller' ? 'runId：' : 'previewId：';
    const id = await until(async () => {
      const text = await view.tool.read(`${node('#script-task-id')}.textContent`);
      const state = await view.tool.read(`${node('#script-status')}.dataset.state`);
      if (state === 'error') throw Error(await view.tool.read(`${node('#script-status')}.textContent`));
      return text !== previous && text.startsWith(prefix) ? text.slice(prefix.length).trim() : null;
    }, `R25.1 ${kind} fresh execution identity`, 30000);
    const current = await requestAgent('target.current', {}, randomUUID(), 3000);
    const target = current.result?.target;
    assert.ok(target?.documentId && Number.isSafeInteger(target.tabId));
    let raw, result, sourceHash;
    if (kind === 'controller') {
      raw = await until(async () => {
        const r = await request('snapshotControllerRun', {runId: id});
        const run = r.run || r.runs?.find(row => row.runId === id);
        return run?.retirementState === 'released' && r.results?.length ? {...r, run} : null;
      }, 'R25.1 original durable Controller result', 30000);
      result = raw.results.find(row => row.runId === id && row.resultId === raw.run.resultId);
      assert.equal(raw.run.state, 'completed');
      assert.equal(result?.outcome?.ok, true);
      sourceHash = result.revision.sourceHash;
      assert.equal(sourceHash, raw.run.revision.sourceHash);
      assert.equal(raw.run.target.documentId, target.documentId);
    } else {
      // Sidebar invokes its own adapter, not the Native admission ledger.
      // requestAgent('page.get') would reject this otherwise real preview.
      // Read actual completed UI; prove USER_SCRIPT execution through the
      // subsequent formal Verify's persisted receipt, never invent a receipt.
      raw = await until(() => view.tool.read(`(() => {
        if(${node('#script-status')}.dataset.state!=='completed'||${node('#script-save')}.disabled)return null;
        return {previewId:${node('#script-task-id')}.textContent,
          technical:${node('#page-preview-technical')}.textContent,
          resultText:${node('#page-preview-result')}.textContent};})()`), 'R25.1 Sidebar Page completion', 30000);
      assert.equal(raw.previewId, prefix + id);
      sourceHash = /源码 SHA-256：([a-f0-9]{64})/.exec(raw.technical)?.[1];
      result = {observation: raw, originalAdapterReceipt: 'NOT_TESTED'};
    }
    assert.match(sourceHash, hashPattern);
    const proof = {kind, bindingId, id, target, sourceHash, result, inputStart};
    if (kind === 'controller') durableExecutions.push({kind,runId:id,resultId:result.resultId,sourceHash,result});
    lastExecution = proof;
    // Preserve the original durable proof even when Save readiness times out.
    record('r251.execution', {kind, id, target, proof, raw});
    await observe('execution-before-save-ready');
    await observeRuntime('execution-before-save-ready', proof);
    await until(() => view.tool.read(`!${node('#script-save')}.disabled`), 'R25.1 verified Save ready');
    return proof;
  }
  function installedIdentity(all, proof, version, baseline, previous) {
    if (proof.kind === 'page-userscript') {
      const candidates = (all.page.catalog || []).filter(row => row.sourceHash === proof.sourceHash &&
        row.revision === Number(version) && row.stage === 'Available');
      return candidates.map(candidate => {
        const installed = (all.page.installed || []).find(row => row.programId === candidate.programId) || candidate.installed;
        return {candidate, installed};
      }).find(({candidate, installed}) => installed?.manifestHash === candidate.manifestHash &&
        installed.sourceHash === proof.sourceHash &&
        installed.nativeState === (previous?.identity.installed.enabled === false ? 'disabled' : 'registered') &&
        installed.enabled === (previous?.identity.installed.enabled ?? true) && installed.authorization?.status === 'active' &&
        (!previous || candidate.programId === previous.identity.installed.programId) &&
        !baseline.page.catalog?.some(row => row.programId === candidate.programId && row.manifestHash === candidate.manifestHash));
    }
    const candidates = (all.task.catalog || []).filter(row => row.version === version &&
      row.stage === 'available' && row.manifest?.program?.sourceHash === proof.sourceHash &&
      row.verification?.runId === proof.id && row.verification?.resultId === proof.result.resultId &&
      row.verification?.sourceHash === proof.sourceHash);
    return candidates.map(candidate => ({candidate,
      installed: all.task.installed?.find(row => row.taskId === candidate.taskId)}))
      .find(({candidate, installed}) => installed?.version === version &&
        installed.manifestHash === candidate.manifestHash &&
        installed.enabled === (previous?.identity.installed.enabled ?? true) &&
        (!previous || candidate.taskId === previous.identity.installed.taskId) &&
        !baseline.task.catalog?.some(row => row.taskId === candidate.taskId && row.manifestHash === candidate.manifestHash));
  }
  async function install(proof, previous) {
    const baseline = await lists();
    await clickNode(view.tool, node('#script-save'));
    const review = await until(() => view.tool.read(`(() => {const p=${node('#local-install-review')};
      if(!p||p.hidden||${node('#local-install-confirm')}.disabled)return null;
      return {summary:${node('#local-install-summary')}.textContent,
        warning:${node('#local-install-warning')}.textContent,
        version:${node('#local-install-version')}.value};})()`), 'R25.1 visible install review');
    assert.ok(review.summary.includes(proof.sourceHash));
    const inputHash = /输入版本：([a-f0-9]{64})/.exec(review.summary)?.[1];
    assert.match(inputHash || '', hashPattern, 'real review inputHash');
    if (proof.kind === 'page-userscript') assert.ok(review.warning.includes('再次执行'));
    else assert.ok(review.warning.includes('不再运行脚本'));
    const title = previous?.title || `R25.1 ${proof.kind} ${proof.id}`;
    await fill('#local-install-title', title);
    await fill('#local-install-version', review.version);
    record('r251.review', {proof, review, inputHash, title, baseline});
    // Exactly one confirmation. Unknown outcomes are inspected, never replayed.
    await clickNode(view.tool, node('#local-install-confirm'));
    let identity;
    try {
      identity = await until(async () => {
        const all = await lists();
        const found = installedIdentity(all, proof, review.version, baseline, previous);
        if (!found) return null;
        const status = await view.tool.read(`${node('#local-install-status')}.textContent`);
        const hidden = await view.tool.read(`${node('#local-install-review')}.hidden`);
        return hidden && status.includes('已安装固定版本') ? {...found, all, status} : null;
      }, 'R25.1 exact original registry and UI installation completion', 45000);
    } catch (error) {
      record('r251.install-outcome-unconfirmed', {kind: proof.kind, error: error.message,
        observed: await observe('unconfirmed'), lists: await lists(), replayed: false});
      throw error;
    }
    const inputs = (await observe('installed')).inputs.slice(proof.inputStart)
      .filter(row => row.bindingId === proof.bindingId);
    const confirms = inputs.filter(row => row.id === 'local-install-confirm');
    assert.equal(confirms.length, 1, 'one actual install confirmation per binding');
    assert.equal(confirms[0].isTrusted, true);
    assert.equal(confirms[0].title, title);
    assert.equal(confirms[0].version, review.version);
    assert.ok(confirms[0].summary.includes(proof.sourceHash) && confirms[0].summary.includes(inputHash));
    assert.ok(inputs.some(row => row.id === 'script-run' && row.isTrusted));
    assert.ok(inputs.some(row => row.id === 'script-save' && row.isTrusted));
    if (proof.kind === 'page-userscript') {
      assert.ok(identity.installed.authorization.installationId);
      assert.ok(Number.isSafeInteger(identity.installed.authorization.generation));
      const scripts = await view.tool.read('chrome.userScripts.getScripts()');
      assert.ok(identity.installed.nativeId, 'persisted native registration identity');
      const registered = scripts.filter(row => row.id === identity.installed.nativeId);
      if (identity.installed.enabled) {
        assert.equal(identity.installed.nativeState, 'registered');
        assert.equal(registered.length, 1, 'enabled Page has one real registration');
        assert.equal(registered[0].world, 'USER_SCRIPT');
      } else {
        assert.equal(identity.installed.enabled, false);
        assert.equal(identity.installed.nativeState, 'disabled');
        assert.equal(registered.length, 0, 'disabled Page upgrade has no native registration in any world');
      }
      identity.nativeScripts = scripts;
      const verifications = await verificationRows();
      const verification = verifications.find(row => row.candidateId === identity.candidate.candidateId &&
        row.manifestHash === identity.installed.manifestHash && row.sourceHash === proof.sourceHash);
      assert.ok(verification, 'actual persisted formal Page verification');
      assert.equal(verification.receipt?.world, 'USER_SCRIPT');
      assert.equal(verification.receipt?.documentId, proof.target.documentId);
      assert.equal(verification.receipt?.sourceHash, proof.sourceHash);
      identity.verification = verification;
    } else {
      assert.ok(identity.installed.installationId);
      assert.ok(Number.isSafeInteger(identity.installed.generation));
      assert.equal(identity.candidate.verification.runId, proof.id);
      assert.equal(identity.candidate.verification.resultId, proof.result.resultId);
    }
    const row = {name: `r251-local-${proof.kind}-${previous ? 'upgrade' : 'run-review-install'}-registry`, status: 'PASS',
      scope: evidence.scope, ...proof, inputHash, title, version: review.version, fixtureVersion:previous ? 2 : 1, identity, inputs,
      installationWireAck: 'NOT_TESTED'};
    if (previous) {
      const old = previous.identity.installed, next = identity.installed;
      assert.notEqual(proof.sourceHash, previous.sourceHash, 'upgrade ran changed actual source');
      assert.notEqual(next.manifestHash, old.manifestHash);
      const oldAuth = proof.kind === 'controller' ? old : old.authorization;
      const nextAuth = proof.kind === 'controller' ? next : next.authorization;
      assert.equal(nextAuth.installationId, oldAuth.installationId);
      assert.ok(nextAuth.generation > oldAuth.generation);
      assert.equal(next.enabled, false, 'upgrade must retain prior disabled state');
      evidence.upgrades.push(row);
    } else evidence.cases.push(row);
    currentInstallations.set(proof.kind, row);
    emit(row);
    await view.tool.screenshot(`r251-installed-${proof.kind}.png`);
    return row;
  }
  async function assertPersisted(label) {
    const all = await lists();
    for (const row of currentInstallations.values()) {
      const kind = row.kind === 'page-userscript' ? 'page' : 'task';
      const idKey = kind === 'page' ? 'programId' : 'taskId';
      const original = row.identity.installed;
      const installed = (all[kind].installed || []).find(item => item[idKey] === original[idKey]) ||
        all[kind].catalog?.find(item => item[idKey] === original[idKey] && item.installed)?.installed;
      assert.ok(installed, `${label}: original ${kind} installed record`);
      assert.equal(installed.manifestHash, original.manifestHash);
      assert.equal(installed.enabled, original.enabled);
      if (kind === 'page') {
        assert.equal(installed.sourceHash, row.sourceHash);
        assert.equal(installed.authorization?.installationId, original.authorization.installationId);
        assert.equal(installed.authorization?.generation, original.authorization.generation);
        assert.equal(installed.nativeState, original.enabled ? 'registered' : 'disabled');
        const scripts = await view.tool.read('chrome.userScripts.getScripts()');
        const registered = scripts.filter(script => script.id === installed.nativeId);
        if (installed.enabled) {
          assert.equal(registered.length, 1);
          assert.equal(registered[0].world, 'USER_SCRIPT');
        } else assert.equal(registered.length, 0, `${label}: disabled Page stays unregistered`);
      } else {
        assert.equal(installed.installationId, original.installationId);
        assert.equal(installed.generation, original.generation);
      }
    }
    record('r251.persisted', {label, all});
  }
  const installedId = row => row.kind === 'controller' ? row.identity.installed.taskId : row.identity.installed.programId;
  const auth = row => row.kind === 'controller' ? row.identity.installed : row.identity.installed.authorization;
  const inputCount = () => view.tool.read(`globalThis[${JSON.stringify(observer)}].length`);
  async function trustedInputs(start, label, matches) {
    const inputs = await view.tool.read(`globalThis[${JSON.stringify(observer)}].slice(${start})`);
    record('r251.trusted-inputs', {label, inputs});
    const relevant = inputs.filter(matches);
    assert.equal(relevant.length, 1, `${label}: exactly one original action, never replayed`);
    assert.equal(relevant[0].isTrusted, true, `${label}: original trusted input`);
    return relevant;
  }
  // Open only the collapsed ancestor summaries through original native clicks.
  async function reveal(selector) {
    const expression = `(() => {let e=${node(selector)},summary=null;if(!e)return null;
      for(e=e.parentElement;e;e=e.parentElement)
        if(e.tagName==='DETAILS'&&!e.open)summary=e.querySelector(':scope > summary');return summary;})()`;
    for (let i = 0; i < 8; i++) {
      if (!await view.tool.read(`!!${expression}`)) return;
      await clickNode(view.tool, expression);
    }
    throw Error(`R25.1 could not reveal original control ${selector}`);
  }
  async function selectTask(row) {
    await clickNode(view.tool, node('#tab-my-tasks'));
    const card = `Array.from(document.querySelectorAll('#task-installed-cards button[data-task-id]'))
      .find(e=>e.dataset.taskId===${JSON.stringify(installedId(row))})`;
    await until(() => view.tool.read(`!!(${card})`), 'R25.1 original installed Task card');
    await clickNode(view.tool, card);
    await until(() => view.tool.read(`${node('#task-installed-list')}.value===${JSON.stringify(installedId(row))}`),
      'R25.1 original Task selection');
  }
  async function fillTaskParams() {
    for (const [name, value] of Object.entries(ctx.taskParams || {})) {
      const selector = '#task-param-' + name;
      const field = await view.tool.read(`(() => {const e=${node(selector)};return e?{
        type:e.type,tag:e.tagName,checked:e.checked,options:e.options?
        Array.from(e.options,o=>({value:o.value,disabled:o.disabled})):null}:null;})()`);
      assert.ok(field, `real Task parameter ${name}`);
      if (field.options) {
        const index = field.options.findIndex(option => !option.disabled && option.value === String(value));
        assert.ok(index >= 0); await selectIndex(view.tool, selector, index);
      } else if (field.type === 'checkbox') {
        assert.equal(typeof value, 'boolean');
        if (field.checked !== value) await clickNode(view.tool, node(selector));
      } else if (field.type === 'number') {
        assert.equal(typeof value, 'number');
        await clickNode(view.tool, node(selector));
        await view.tool.call('Input.dispatchKeyEvent', {type:'rawKeyDown',key:'a',code:'KeyA',
          windowsVirtualKeyCode:65,modifiers:4,commands:['selectAll']});
        await view.tool.call('Input.dispatchKeyEvent', {type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:4});
        await view.tool.call('Input.insertText', {text:String(value)});
        assert.equal(await view.tool.read(`${node(selector)}.value`), String(value));
        await key(view.tool, 'Tab', 'Tab', 9);
      } else await fill(selector, String(value));
    }
  }
  async function runInstalledTask(label) {
    const row = currentInstallations.get('controller'), installed = row.identity.installed;
    assert.equal(installed.enabled, true);
    await selectTask(row); await fillTaskParams();
    await until(() => view.tool.read(`!${node('#task-run')}.disabled`), 'R25.1 installed Task Run ready');
    const baseline = await request('snapshotControllerRun');
    const priorIds = new Set(baseline.runs.map(run => run.runId));
    const targetReply = await requestAgent('target.current', {}, randomUUID(), 3000);
    const target = targetReply.result?.target;
    assert.ok(target?.documentId && Number.isSafeInteger(target.tabId));
    const start = await inputCount();
    await clickNode(view.tool, node('#task-run'));
    let admitted, lastRaw;
    const raw = await until(async () => {
      const snapshot = lastRaw = await request('snapshotControllerRun');
      const run = snapshot.runs.find(run => !priorIds.has(run.runId) &&
        run.revision?.scriptId === installed.scriptId);
      if (!run) return null;
      if (!admitted) {
        admitted = run.runId;
        record('r251.installed-task.admission', {label, installed, target, raw:snapshot});
      }
      assert.equal(run.runId, admitted, 'one saved Task invocation');
      if (['failed','stopped','interrupted','paused_unknown'].includes(run.state)) {
        record('r251.installed-task.failure', {label, raw:snapshot, replayed:false});
        throw Error(`R25.1 installed Task ${run.runId}: ${run.state}`);
      }
      return run.state === 'completed' && run.retirementState === 'released' ? {...snapshot, run} : null;
    }, 'R25.1 installed Task original durable completion', 45000).catch(error => {
      record('r251.installed-task.unconfirmed', {label, runId:admitted, raw:lastRaw, replayed:false}); throw error;
    });
    const result = raw.results.find(value => value.runId === raw.run.runId && value.resultId === raw.run.resultId);
    record('r251.installed-task.execution', {label, installed, target, raw});
    assert.equal(raw.run.sourceKind, 'saved');
    assert.equal(raw.run.revision.sourceHash, row.sourceHash);
    assert.equal(raw.run.target.documentId, target.documentId);
    assert.equal(raw.run.target.tabId, target.tabId);
    assert.equal(result?.state, 'completed'); assert.equal(result?.outcome?.ok, true);
    assert.equal(result.revision.sourceHash, row.sourceHash);
    const value = decodeValue(result.outcome.valueWire);
    assert.equal(value?.version, row.fixtureVersion, 'original installed fixture result matches executed version');
    const ledger = (await storedRows(['controller-run'])).find(value => value.runId === raw.run.runId);
    assert.equal(ledger?.installedTaskAuthorization?.taskId, installed.taskId);
    assert.equal(ledger.installedTaskAuthorization.version, installed.version);
    assert.equal(ledger.installedTaskAuthorization.manifestHash, installed.manifestHash);
    assert.equal(ledger.installedTaskAuthorization.authorization.installationId, installed.installationId);
    assert.equal(ledger.installedTaskAuthorization.authorization.generation, installed.generation);
    const inputs = await trustedInputs(start, label, input => input.id === 'task-run' && input.selectedTaskId === installed.taskId);
    const proof = {kind:'controller',runId:raw.run.runId,resultId:result.resultId,sourceHash:row.sourceHash,result};
    durableExecutions.push(proof);
    const execution = {name:`r251-${label}-installed-task-use`,status:'PASS',
      scope:'One trusted original Task Run; exact saved revision, installation admission, durable result and released retirement',
      ...proof, value, installed, target, inputs, ledger, wireAck:'NOT_TESTED'};
    evidence.executions.push(execution); extended(execution);
  }
  async function useInstalledPageUI(label, row, targetTool) {
    const config = ctx.pageUse || {hostSelector:'[data-od-id="sample.local-page-ui"]',
      actionSelector:'[data-action="count"]',readSelector:'output',expectedDelta:1};
    if (!targetTool?.read || !targetTool?.call)
      return notTested(`r251-${label}-installed-page-ui-use`, 'reloadTarget did not supply live read/call targetTool for original trusted click');
    for (const key of ['hostSelector','actionSelector','readSelector']) assert.equal(typeof config[key], 'string');
    const host = node(config.hostSelector), button = `${host}?.shadowRoot?.querySelector(${JSON.stringify(config.actionSelector)})`;
    const output = `${host}?.shadowRoot?.querySelector(${JSON.stringify(config.readSelector)})`;
    await until(() => targetTool.read(`!!(${button})&&!!(${output})`), 'R25.1 original installed Page UI');
    const inputName = observer + '_pageUse';
    await targetTool.read(`(() => {const button=${button};globalThis[${JSON.stringify(inputName)}]=[];
      button.addEventListener('click',e=>globalThis[${JSON.stringify(inputName)}].push({isTrusted:e.isTrusted,at:performance.now()}));})()`);
    const before = await targetTool.read(`({text:(${output}).textContent,count:(${output}).dataset.count})`);
    await clickNode(targetTool, button);
    const after = await until(() => targetTool.read(`(() => {const e=${output};
      return e&&e.textContent!==${JSON.stringify(before.text)}?{text:e.textContent,count:e.dataset.count}:null;})()`),
    'R25.1 installed Page trusted click effect');
    const inputs = await targetTool.read(`globalThis[${JSON.stringify(inputName)}]`);
    record('r251.installed-page.ui', {label, before, after, inputs});
    assert.equal(inputs.length, 1); assert.equal(inputs[0].isTrusted, true);
    const delta = row.pageUseExpectedDelta ?? config.expectedDelta;
    assert.ok(Number.isFinite(delta) && delta !== 0, 'actual fixture expectedDelta required');
    assert.equal(Number(after.count) - Number(before.count), delta);
    assert.equal(after.text, after.count);
    extended({name:`r251-${label}-installed-page-ui-use`,status:'PASS',
      scope:'Original installed Shadow UI button trusted click and observed counter effect',before,after,inputs});
  }
  async function runInstalledPage(label) {
    if (typeof ctx.reloadTarget !== 'function')
      return notTested(`r251-${label}-installed-page-use`, 'Owned trusted full-document navigation callback not supplied');
    const row = currentInstallations.get('page-userscript'), installed = row.identity.installed;
    assert.equal(installed.enabled, true);
    const before = await requestAgent('target.current', {}, randomUUID(), 3000);
    const previousTarget = before.result?.target;
    assert.ok(previousTarget?.documentId);
    record('r251.installed-page.navigation-before', {label, installed, raw:before});
    // Exactly one owned action. A timeout/unknown receipt never invokes it again.
    const next = await ctx.reloadTarget({view, installation:row, previousTarget, label});
    const target = await until(async () => {
      const raw = await requestAgent('target.current', {}, randomUUID(), 3000);
      const current = raw.result?.target;
      return current?.documentId && current.documentId !== previousTarget.documentId &&
        current.tabId === previousTarget.tabId && current.url === previousTarget.url ? current : null;
    }, 'R25.1 installed Page fresh exact document', 30000);
    const actual = await until(async () => {
      const all = await lists(), current = all.page.installed?.find(value => value.programId === installed.programId);
      const execution = current?.lastExecution;
      if (!execution || execution.documentId !== target.documentId) return null;
      if (['failed','outcome-unknown'].includes(execution.state)) {
        record('r251.installed-page.failure', {label, target, current, replayed:false});
        throw Error(`R25.1 installed Page execution ${execution.state}: ${execution.error?.code || ''}`);
      }
      return execution.state === 'completed' ? {current, execution} : null;
    }, 'R25.1 original Page installed execution receipt', 45000);
    record('r251.installed-page.execution', {label, target, raw:actual});
    assert.equal(actual.current.manifestHash, installed.manifestHash);
    assert.equal(actual.execution.manifestHash, installed.manifestHash);
    assert.equal(actual.execution.sourceHash, row.sourceHash);
    assert.equal(actual.execution.installationId, installed.authorization.installationId);
    assert.equal(actual.execution.grantGeneration, installed.authorization.generation);
    assert.equal(actual.execution.result?.state, 'page-installed-evaluated');
    assert.equal(actual.execution.result.world, 'USER_SCRIPT');
    assert.equal(actual.execution.result.documentId, target.documentId);
    assert.equal(actual.execution.result.sourceHash, row.sourceHash);
    const execution = (await storedRows(['page-execution-v1'])).find(value => value.receiptId === actual.execution.receiptId);
    assert.ok(execution); assert.equal(execution.state, 'completed');
    assert.deepEqual(execution.result, actual.execution.result);
    durableExecutions.push({kind:'page-userscript',receiptId:execution.receiptId,execution});
    const proof = {name:`r251-${label}-installed-page-use`,status:'PASS',
      scope:'New exact document; original installed bootstrap and USER_SCRIPT completion receipt',
      target, installation:installed, raw:actual, wireAck:'NOT_TESTED'};
    evidence.executions.push(proof); extended(proof);
    await useInstalledPageUI(label, row, next?.targetTool);
    if (typeof ctx.observeInstalledPage === 'function')
      record('r251.installed-page.parent-observation', {label, raw:await ctx.observeInstalledPage({label})});
  }
  async function useInstalled(label) {
    await runInstalledTask(label);
    await runInstalledPage(label);
  }
  async function setEnabled(kind, enabled, label) {
    const previous = currentInstallations.get(kind), original = previous.identity.installed;
    if (original.enabled === enabled) return;
    let expression;
    if (kind === 'controller') {
      await selectTask(previous); await reveal('#task-toggle'); expression = node('#task-toggle');
    } else {
      await clickNode(view.tool, node('#tab-tools'));
      await clickNode(view.tool, node('#installed-page-tools-refresh'));
      expression = `Array.from(document.querySelectorAll('[data-page-tool-action="toggle"]'))
        .find(e=>e.dataset.pageToolId===${JSON.stringify(installedId(previous))})`;
    }
    await until(() => view.tool.read(`!!(${expression})&&!(${expression}).disabled`), 'R25.1 original enable toggle');
    const start = await inputCount(); await clickNode(view.tool, expression);
    const current = await until(async () => {
      const all = await lists(), rows = kind === 'controller' ? all.task.installed : all.page.installed;
      const found = rows?.find(value => (value.taskId || value.programId) === installedId(previous));
      return found?.enabled === enabled && (kind === 'controller' || found.nativeState === (enabled ? 'registered' : 'disabled')) ? found : null;
    }, 'R25.1 original enabled-state receipt', 30000);
    assert.equal(current.manifestHash, original.manifestHash);
    const next = {...previous,identity:{...previous.identity,installed:current}};
    assert.equal(auth(next).installationId, auth(previous).installationId);
    assert.equal(auth(next).generation, auth(previous).generation + 1);
    const inputs = await trustedInputs(start, label, input => kind === 'controller' ?
      input.id === 'task-toggle' && input.selectedTaskId === installedId(previous) :
      input.pageToolAction === 'toggle' && input.pageToolId === installedId(previous));
    currentInstallations.set(kind, next);
    record('r251.enabled', {label,kind,previous:original,current,inputs,wireAck:'NOT_TESTED'});
    await assertPersisted(label);
  }
  async function assertDurableData(label) {
    for (const proof of durableExecutions) {
      if (proof.kind === 'controller') {
        const raw = await request('snapshotControllerRun', {runId:proof.runId});
        const result = raw.results.find(value => value.resultId === proof.resultId && value.runId === proof.runId);
        assert.deepEqual(result, proof.result, `${label}: original Controller result retained`);
        assert.equal(raw.run?.revision.sourceHash, proof.sourceHash);
        assert.equal(raw.run?.retirementState, 'released');
        record('r251.retained-result', {label,runId:proof.runId,raw});
      } else {
        const raw = (await storedRows(['page-execution-v1'])).find(value => value.receiptId === proof.receiptId);
        assert.deepEqual(raw, proof.execution, `${label}: original Page execution retained`);
        record('r251.retained-page-execution', {label,raw});
      }
    }
    const verifications = await verificationRows();
    for (const row of [...evidence.cases,...evidence.upgrades].filter(row => row.kind === 'page-userscript')) {
      const expected = row.identity.verification;
      assert.deepEqual(verifications.find(value => value.candidateId === expected.candidateId &&
        value.manifestHash === expected.manifestHash), expected, `${label}: original Page verification retained`);
    }
    extended({name:`r251-${label}-retained-results`,status:'PASS',
      scope:'Original Controller run/result, Page execution and formal verification records only; application storage separate',
      proofs:durableExecutions.map(({kind,runId,resultId,receiptId})=>({kind,runId,resultId,receiptId}))});
  }
  let dataBaseline;
  async function observeApplicationData(label) {
    if (!dataBaseline) {
      const probes = typeof ctx.dataProbes === 'function' ? await ctx.dataProbes({view,
        installations:[...currentInstallations.values()]}) : ctx.dataProbes;
      dataBaseline = probes || [];
      for (const kind of ['controller','page-userscript']) if (!dataBaseline.some(probe => probe.kind === kind))
        notTested(`r251-${kind}-application-data-preservation`, 'No original nonempty database/key/expected data probe supplied');
    }
    for (const probe of dataBaseline) {
      assert.ok(currentInstallations.has(probe.kind));
      assert.equal(probe.id, installedId(currentInstallations.get(probe.kind)), 'data probe bound to this installed program');
      assert.ok(probe.database && probe.store && Object.hasOwn(probe,'key') && probe.expected != null);
      const value = await view.tool.read(`(async () => {const p=${JSON.stringify(probe)};
        if(!(await indexedDB.databases()).some(d=>d.name===p.database))throw Error('Original data database absent');
        const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(p.database);
          q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
        try{return await new Promise((resolve,reject)=>{const q=db.transaction(p.store,'readonly').objectStore(p.store).get(p.key);
          q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}finally{db.close();}})()`);
      record('r251.application-data', {label,probe,value});
      assert.ok(value != null && (typeof value !== 'object' || Object.keys(value).length), 'nonempty original application data');
      assert.deepEqual(value, probe.expected, `${label}: original application data unchanged`);
      extended({name:`r251-${label}-${probe.kind}-application-data`,status:'PASS',
        scope:'Supplied original database/key data read only; data creation provenance NOT_TESTED',probe,value});
    }
  }
  async function upgradeInstalled() {
    if (typeof ctx.updateLocalProject !== 'function')
      return notTested('r251-upgrade-disabled-data-preservation', 'Owned fixture revision callback not supplied');
    await observeApplicationData('before-upgrade');
    const changes = new Map();
    for (const kind of ['controller','page-userscript']) {
      const previous = currentInstallations.get(kind);
      assert.equal(previous.identity.installed.enabled, true, 'old installation stays enabled during local source change');
      assert.equal(previous.fixtureVersion, 1, 'source change must precede the first installed upgrade');
      if (kind === 'page-userscript') currentInstallations.set(kind, {...previous,pageUseExpectedDelta:1});
      const change = await ctx.updateLocalProject({view,kind,version:2,bindingId:previous.bindingId,installation:previous});
      record('r251.fixture-upgrade', {kind,version:2,bindingId:previous.bindingId,raw:change,
        scope:'Fixture preparation metadata; not an execution proof'});
      assert.match(change?.expectedSourceHash || '', hashPattern, 'prepared fixture must supply expectedSourceHash');
      assert.notEqual(change.expectedSourceHash, previous.sourceHash, 'prepared v2 source must differ from installed v1');
      changes.set(kind, change);
    }
    await assertPersisted('old-installed-after-local-source-change');
    await useInstalled('old-installed-after-local-source-change');
    await assertPersisted('old-installed-after-local-source-change-after-use');
    record('r251.local-source-change', {label:'old-installed-after-local-source-change',
      installations:Array.from(currentInstallations.values()),changes:Array.from(changes.entries()),
      scope:'Enabled v1 registry identities retained after both local v2 preparations; real installed-use evidence recorded separately',
      wireAck:'NOT_TESTED'});
    for (const kind of ['controller','page-userscript']) await setEnabled(kind, false, 'disable-before-upgrade-' + kind);
    for (const kind of ['controller','page-userscript']) {
      const previous = currentInstallations.get(kind), change = changes.get(kind);
      const proof = await run(kind, previous.bindingId);
      assert.notEqual(proof.sourceHash, previous.sourceHash, 'upgrade must prove changed source before Save');
      assert.equal(proof.sourceHash, change.expectedSourceHash);
      const installed = await install(proof, previous);
      if (kind === 'page-userscript') currentInstallations.set(kind, {...installed,pageUseExpectedDelta:2});
      if (kind === 'controller') {
        await selectTask(installed);
        assert.equal(await view.tool.read(`${node('#task-run')}.disabled`), true, 'upgraded disabled Task cannot Run');
      }
    }
    await assertPersisted('upgrade-kept-disabled');
    await assertDurableData('upgrade-kept-disabled');
    await observeApplicationData('after-upgrade');
    extended({name:'r251-upgrade-kept-disabled',status:'PASS',scope:'Both changed versions installed under original identity while disabled; Page unregistered, Task Run blocked'});
    for (const kind of ['controller','page-userscript']) await setEnabled(kind, true, 'explicit-reenable-' + kind);
    await useInstalled('upgraded');
  }
  async function assertProviderFence(label) {
    await clickNode(view.tool, node('#tab-develop'));
    if (!await view.tool.read(`${node('#local-project-mode')}.checked`))
      await clickNode(view.tool, `${node('#local-project-mode')}.closest('label')`);
    await until(() => view.tool.read(`${node('#local-project-status')}.dataset.state==='disconnected'&&
      ${node('#script-run')}.disabled`), 'R25.1 disconnected local source fence');
    await observe(label);
  }
  try {
    await armInputs();
    // Existing local-controller does real page reads; Task Verify must accept
    // its actual native receipts. A mock result cannot reach this UI boundary.
    for (const [kind, binding] of [['controller', ctx.controllerBindingId], ['page-userscript', ctx.pageBindingId]])
      await install(await run(kind, binding));
    // Both original Save loops finish before these independent extension cases.
    await useInstalled('connected');
    await upgradeInstalled();
    await observeApplicationData('connected-baseline');
    if (typeof ctx.disconnectProvider === 'function') {
      await select(ctx.pageBindingId);
      await ctx.disconnectProvider(); providerDisconnected = true;
      await assertProviderFence('provider-disconnected');
      await assertPersisted('provider-disconnected');
      await useInstalled('provider-disconnected');
      await assertDurableData('provider-disconnected');
      await observeApplicationData('provider-disconnected');
      const row = {name:'r251-provider-disconnected-installed-identities',status:'PASS',
        scope:'Local source Run blocked and original installed identities retained; installed use has independent cases'};
      evidence.lifecycle.push(row); emit(row);
    } else {
      const row = {name:'r251-provider-disconnected',status:'NOT_TESTED',reason:'Owned provider disconnect callback not supplied'};
      evidence.lifecycle.push(row); emit(row);
    }
    for (const name of ['reopenPanel', 'restartSameProfile']) {
      if (typeof ctx[name] !== 'function') {
        const row = {name:`r251-${name}`,status:'NOT_TESTED',reason:'Owned session transition callback not supplied'};
        evidence.lifecycle.push(row); emit(row); continue;
      }
      const previous = view;
      const previousURL = await previous.tool.read('location.href');
      const next = await ctx[name]({view,evidence});
      assert.ok(next?.tool && next.registrationId && next.documentId);
      assert.notEqual(next.documentId,previous.documentId);
      assert.notEqual(next.registrationId,previous.registrationId);
      if (name === 'restartSameProfile') {
        assert.ok(Number.isSafeInteger(next.previousPid) && Number.isSafeInteger(next.pid));
        assert.notEqual(next.pid,next.previousPid);
        assert.ok(next.profile && next.previousProfile);
        assert.equal(next.profile,next.previousProfile);
      }
      view = next;
      assert.equal(new URL(await view.tool.read('location.href')).hostname,new URL(previousURL).hostname,
        'same extension identity after lifecycle transition');
      await armInputs();
      const bridge = await until(async () => {
        const raw = await requestAgent('bridge.status',{},randomUUID(),3000);
        return raw.result?.nativeConnected ? raw : null;
      },'R25.1 real Native handshake after '+name,30000);
      record('r251.lifecycle-transition',{name,previousURL,registrationId:next.registrationId,
        documentId:next.documentId,previousPid:next.previousPid,pid:next.pid,
        previousProfile:next.previousProfile,profile:next.profile,raw:bridge});
      if (providerDisconnected) await assertProviderFence(name+'-provider-still-disconnected');
      await assertPersisted(name);
      await assertDurableData(name);
      await observeApplicationData(name);
      await useInstalled(name);
      const row = {name:`r251-${name}-installed-identities`,status:'PASS',
        scope:'Registry identity, real Page registration and original persisted result retention; installed use has independent cases',
        registrationId:view.registrationId,documentId:view.documentId};
      evidence.lifecycle.push(row); emit(row);
    }
    evidence.status = 'PASS_POSITIVE_INSTALLATION_SCOPE_WITH_NOT_TESTED_GAPS';
    return evidence;
  } catch (error) {
    evidence.status = 'FAIL';
    evidence.error = {code: error.code || 'E_R251_NATIVE_INSTALL', message: error.message};
    emit({name: 'r251-local-installation', status: 'FAIL', error: evidence.error, replayed: false});
    try { await observe('failure'); } catch (inspection) { record('r251.inspection-failure', {message: inspection.message}); }
    await observeRuntime('failure', lastExecution);
    try {
      await view.tool.screenshot('r251-local-install-failure.png');
      record('r251.failure-screenshot', {file: 'r251-local-install-failure.png'});
    } catch (inspection) {
      record('r251.inspection-failure', {method: 'failure-screenshot', message: inspection.message});
    }
    throw error;
  }
}
