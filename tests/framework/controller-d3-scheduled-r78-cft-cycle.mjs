// Bounded R7.8 scheduled acceptance driver for the already-proven same
// Controller. This file only adds the UI cycle that turns the persisted R7.8
// revision into an installed Task and lets the existing visible Side Panel
// scheduled host fire it once against the already-open 43111 demo form.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {WebSocket} from 'ws';
import {decodeValue} from '../../src/platform/page-port/codec.js';

const PROGRAM = 'r78-controller-d3-chromepage';
const TASK_ID = 'r78-controller-d3-scheduled';
const TASK_VERSION = '7.8.0';
const DEMO_URL = 'http://127.0.0.1:43111/demo-form.html';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const selector = value => 'document.querySelector(' + JSON.stringify(value) + ')';

function localDateTimeInput(ms) {
  const date = new Date(ms);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function typeOnceTime(sidebar, clickReal, until, value) {
  await clickReal(sidebar, selector('#schedule-once'));
  const key = async (name, code, virtual, text) => {
    for (const type of ['keyDown', 'keyUp']) await sidebar.call('Input.dispatchKeyEvent', {
      type, key:name, code, windowsVirtualKeyCode:virtual, ...(type==='keyDown'&&text?{text,unmodifiedText:text}:{})
    });
  };
  // datetime-local is a native segmented control; pasting ISO text can leave
  // different minute bytes. Edit each displayed year/month/day/hour/minute
  // segment with genuine keyboard input and verify the serialized value.
  const parts=value.split(/[-T:]/);
  for(let index=0;index<parts.length;index++){
    for(let move=0;move<8;move++)await key('ArrowLeft','ArrowLeft',37);
    for(let move=0;move<index;move++)await key('ArrowRight','ArrowRight',39);
    await key('Backspace','Backspace',8);
    for(const digit of parts[index])await key(digit,'Digit'+digit,48+Number(digit),digit);
  }
  await key('Tab','Tab',9);
  await until(()=>sidebar.read(selector('#schedule-once')+'.value==='+JSON.stringify(value)),
    'native once date bytes '+value,10000);
}

function appendProof(report, proof) {
  if (Array.isArray(report?.tests)) report.tests.push(proof);
  else if (report?.tests && typeof report.tests === 'object') report.tests.R78_D3_SCHEDULED = proof;
}

async function readonlyIndexedDB(session) {
  return session.read('(async()=>{const out={plans:[],fires:[],runs:[],results:[],native:[],candidates:[],installed:[]};' +
    'const ns="tool:"+location.hostname;' +
    'const db=await new Promise((ok,bad)=>{const q=indexedDB.open("opendesk-browser");q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)});' +
    'try{const names=[...db.objectStoreNames];const getAll=name=>new Promise((ok,bad)=>{const q=db.transaction(name,"readonly").objectStore(name).getAll();q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)});' +
    'if(names.includes("frameworkKV")){const kv=await getAll("frameworkKV");' +
    'out.plans.push(...kv.filter(x=>x?.tag==="schedule-definition-v1"&&x.namespace===ns));' +
    'out.fires.push(...kv.filter(x=>x?.tag==="schedule-fire-v1"&&x.namespace===ns));' +
    'out.candidates.push(...kv.filter(x=>x?.tag==="task-candidate-v1"&&x.namespace===ns));' +
    'out.installed.push(...kv.filter(x=>x?.tag==="task-installed-v1"&&x.namespace===ns));}' +
    'if(names.includes("runs"))out.runs.push(...(await getAll("runs")).filter(x=>x?.tag==="controller-run"&&x.namespace===ns));' +
    'if(names.includes("results"))out.results.push(...(await getAll("results")).filter(x=>x?.tag==="controller-result"&&x.namespace===ns));' +
    'if(names.includes("commandJournal"))out.native.push(...(await getAll("commandJournal")).filter(x=>x?.tag==="controller-operation"&&out.runs.some(run=>run.runId===x.runId)));' +
    '}finally{db.close();}return out})()');
}


async function readDevToolsPortFromReport(report) {
  const launch = report?.launch || {};
  const directPort = launch.debugPort || launch.remoteDebuggingPort || launch.devtoolsPort || launch.debug?.port ||
    launch.debug?.remoteDebuggingPort || report?.debugPort || report?.remoteDebuggingPort || report?.devtoolsPort;
  if (Number.isSafeInteger(directPort)) return directPort;
  if (typeof directPort === 'string' && /^\d+$/.test(directPort)) return Number(directPort);
  const lines = Array.isArray(launch.lines) ? launch.lines : Array.isArray(report?.lines) ? report.lines : null;
  if (lines?.length && /^\d+$/.test(String(lines[0]))) return Number(lines[0]);
  const profile = launch.profile || report?.profile || launch.userDataDir || report?.userDataDir;
  if (typeof profile === 'string' && profile) {
    const file = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(file)) {
      const active = fs.readFileSync(file, 'utf8').trim().split('\n');
      if (active.length >= 2 && /^\d+$/.test(active[0]) && active[1].startsWith('/devtools/browser/')) {
        return Number(active[0]);
      }
    }
  }
  throw Error('Cannot find existing Chrome DevTools port from report.launch/profile');
}

async function connectTargetWebSocket(webSocketDebuggerUrl, label) {
  const socket = new WebSocket(webSocketDebuggerUrl), pending = new Map();
  let serial = 0, closed = false;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.terminate(); reject(Error('CDP connect timed out: '+label)); }, 10000);
    socket.once('open', () => { clearTimeout(timer); resolve(); });
    socket.once('error', error => { clearTimeout(timer); reject(error); });
  });
  const failPending = error => {
    closed = true;
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); }
    pending.clear();
  };
  socket.on('message', bytes => {
    const row = JSON.parse(String(bytes));
    const task = pending.get(row.id);
    if (!task) return;
    pending.delete(row.id);
    clearTimeout(task.timer);
    row.error ? task.reject(Object.assign(Error(row.error.message), {code:row.error.code})) : task.resolve(row.result);
  });
  socket.on('close', () => failPending(Error('CDP closed: '+label)));
  socket.on('error', error => failPending(error));
  const call = (method, params = {}, timeout = 20000) => new Promise((resolve, reject) => {
    if (closed) return reject(Error('CDP already closed: '+label));
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timed out: '+method)); }, timeout);
    pending.set(id, {resolve, reject, timer});
    try { socket.send(JSON.stringify({id, method, params})); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
  return {
    call,
    async read(expression, timeout = 20000) {
      const row = await call('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true}, timeout);
      if (row.exceptionDetails) throw Error('Runtime.evaluate '+expression.slice(0, 180)+': '+
        (row.exceptionDetails.text || JSON.stringify(row.exceptionDetails)));
      return row.result?.value;
    },
    close() { socket.terminate(); }
  };
}

async function connectCatalogSession({browser, until, report}, extensionOrigin, seenTargetIds = new Set()) {
  const port = await readDevToolsPortFromReport(report);
  const base = 'http://127.0.0.1:'+port;
  return until(async () => {
    const rootTargets = (await browser.call('Target.getTargets')).targetInfos || [];
    const rootTarget = rootTargets.find(row => row.type === 'page' && row.url?.startsWith(extensionOrigin) &&
      row.url.includes('/ui/tool.html') && !seenTargetIds.has(row.targetId));
    if (!rootTarget) return null;
    const list = await (await fetch(base + '/json/list')).json();
    const inspectable = list.find(row => row.id === rootTarget.targetId && row.webSocketDebuggerUrl);
    if (!inspectable) return null;
    const cdp = await connectTargetWebSocket(inspectable.webSocketDebuggerUrl, 'catalog '+rootTarget.targetId);
    const session = {info:rootTarget, webSocketDebuggerUrl:inspectable.webSocketDebuggerUrl,
      call:cdp.call, read:cdp.read, close:cdp.close};
    await session.call('Runtime.enable');
    await session.call('Page.enable');
    const state = await session.read('(()=>({href:location.href,host:location.hostname,ready:document.readyState,' +
      'catalog:!!document.querySelector("#catalog-verification"),' +
      'discoverHidden:document.querySelector("#workbench-discover")?.hidden??null,' +
      'devHidden:document.querySelector("#workbench-develop")?.hidden??null}))()').catch(error => ({error:String(error.message || error)}));
    if (!state.error && state.catalog && state.ready === 'complete' && state.discoverHidden === false) {
      await browser.call('Target.activateTarget', {targetId:rootTarget.targetId});
      return session;
    }
    session.close();
    return null;
  }, 'full-size catalog extension Target', 30000);
}

async function typeInSession(session, clickReal, domExpression, value) {
  assert.equal(typeof value, 'string');
  await clickReal(session, domExpression);
  const node = await session.call('Runtime.evaluate', {expression:domExpression, returnByValue:false});
  assert(node.result?.objectId, 'Native editable node required: '+domExpression);
  try {
    const snapshot = () => session.read('(()=>{const n='+domExpression+';return {value:n?.value??"",focus:document.activeElement===n,start:n?.selectionStart??null,end:n?.selectionEnd??null}})()');
    let state = await snapshot();
    if (!state.focus) await session.call('DOM.focus', {objectId:node.result.objectId});
    for (let attempt = 0; attempt < 2; attempt++) {
      await session.call('Input.dispatchKeyEvent', {type:attempt ? 'rawKeyDown' : 'keyDown', key:'a', code:'KeyA',
        windowsVirtualKeyCode:65, modifiers:process.platform === 'darwin' ? 4 : 2, commands:['selectAll']});
      await session.call('Input.dispatchKeyEvent', {type:'keyUp', key:'a', code:'KeyA',
        windowsVirtualKeyCode:65, modifiers:process.platform === 'darwin' ? 4 : 2});
      state = await snapshot();
      if (state.value === '' || state.start === 0 && state.end === state.value.length) break;
    }
    if (state.value && state.start !== null && !(state.start === 0 && state.end === state.value.length)) {
      throw Error('Native select-all did not focus/select '+domExpression+' '+JSON.stringify(state));
    }
    if (value) await session.call('Input.insertText', {text:value});
    else await session.call('Input.dispatchKeyEvent', {type:'rawKeyDown', key:'Backspace', code:'Backspace', windowsVirtualKeyCode:8});
    const result = await snapshot();
    if (result.value !== value) throw Error('Native typed field mismatch '+domExpression+
      ' actual='+JSON.stringify(result.value?.slice(0, 180))+' expected='+JSON.stringify(value.slice(0, 180)));
  } finally {
    await session.call('Runtime.releaseObject', {objectId:node.result.objectId}).catch(() => {});
  }
}

async function searchState(website) {
  return website.session.read('(()=>({keyword:document.querySelector("#keyword")?.value,' +
    'result:document.querySelector("#results")?.textContent,' +
    'count:Number((document.querySelector("#search-count")?.textContent||"").replace(/\\D/g,"")),' +
    'done:!!document.querySelector("#done")}))()');
}

async function scrollSearchFormIntoView(website, browser) {
  await browser.call('Target.activateTarget', {targetId:website.info.id});
  for (let i = 0; i < 16; i++) {
    const box = await website.session.read('(()=>{const e=document.querySelector("#search-form");const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()');
    if (box.top >= 16 && box.bottom <= box.height - 16) return box;
    await website.session.call('Input.dispatchMouseEvent', {type:'mouseWheel', x:Math.min(220, box.width / 2),
      y:Math.min(220, box.height / 2), deltaX:0, deltaY:box.top < 16 ? -420 : 420});
    await pause(120);
  }
  throw Error('search form was not reachable by native scroll');
}

function requireProofInput(proof) {
  assert(proof && typeof proof === 'object', 'R7.8 scheduled cycle requires proof');
  const saved = proof.savedRevision;
  const fixed = proof.fixedRun || proof.savedRun;
  assert(saved?.sourceUtf8 && saved.contentHash && Number.isSafeInteger(saved.revision),
    'proof.savedRevision must include sourceUtf8/contentHash/revision');
  assert(fixed?.runId && fixed.resultId && fixed.sourceHash,
    'proof.fixedRun must include runId/resultId/sourceHash');
  assert.equal(fixed.sourceHash, saved.contentHash,
    'fixed run sourceHash must match saved immutable revision contentHash');
  return {saved, fixed};
}

export async function runR78D3ScheduledCycle(ctx, proof) {
  const {sidebar, website, browser, until, clickReal, type, read, report} = ctx;
  const rawProof = {caseId:'R78-D3-SCHEDULED-ONCE', programId:PROGRAM,
    taskId:TASK_ID, version:TASK_VERSION, status:'IN_PROGRESS',
    limitations:[
      {caseId:'R78-D3-SCHEDULED-STOP', status:'NOT_TESTED', reason:'No same-candidate raw Host negative evidence supplied'},
      {caseId:'R78-D3-SCHEDULED-REVOKE', status:'NOT_TESTED', reason:'No same-candidate raw Host negative evidence supplied'}
    ]};
  appendProof(report, rawProof);
  let currentPhase = 'init';
  const phase = async (name, action) => {
    currentPhase = name;
    rawProof.phase = name;
    try {
      const result = await action();
      rawProof[name] = result ?? 'PASS';
      return result;
    } catch (error) {
      rawProof.status = 'CHROME_FAIL';
      rawProof.error = {phase:name, code:error.code || 'E_R78_SCHEDULED_CYCLE',
        message:String(error.message || error)};
      error.rawProof = rawProof;
      throw error;
    }
  };

  try {
    let catalogSession = null;
    const {saved, fixed} = await phase('validate-input-proof', () => requireProofInput(proof));
    rawProof.input = {savedRevision:{revision:saved.revision, contentHash:saved.contentHash,
      bytes:saved.sourceUtf8.length, header:saved.header ?? null},
    fixedRun:{runId:fixed.runId, resultId:fixed.resultId, sourceHash:fixed.sourceHash,
      rawdurable:fixed.rawdurable ?? fixed.durable ?? null}};

    await phase('create-task-candidate-ui', async () => {
      await clickReal(sidebar, selector('#tab-develop'));
      await until(() => read(selector('#script-id') + '.value===' + JSON.stringify(PROGRAM) + '&&Number(' +
        selector('#script-revision') + '.value)===' + String(saved.revision)),
      'saved R7.8 Controller revision still loaded in Developer', 12000);
      if (!await read(selector('#task-package-dev') + '.open')) {
        await clickReal(sidebar, selector('#task-package-dev > summary'));
        await until(() => read(selector('#task-package-dev') + '.open'), 'Task candidate details opened');
      }
      await type(selector('#task-dev-id'), TASK_ID);
      await type(selector('#task-dev-version'), TASK_VERSION);
      await type(selector('#task-dev-title'), 'R7.8 D3 scheduled once');
      await type(selector('#task-dev-description'), 'Runs the verified R7.8 ChromePage and D3 controller on the demo search form.');
      await type(selector('#task-dev-author'), 'local-developer');
      await type(selector('#task-dev-schema'), '{"type":"object","properties":{},"required":[],"additionalProperties":false}');
      await scrollSearchFormIntoView(website, browser);
      const extensionOrigin = await read('location.origin');
      const beforeTargets = new Set(((await browser.call('Target.getTargets')).targetInfos || []).map(row => row.targetId));
      await clickReal(sidebar, selector('#task-create-candidate'));
      await until(() => read(selector('#task-dev-status') + '.textContent.includes("已创建待验证候选")'),
        'TaskCandidate created from saved Controller revision', 30000);
      catalogSession = await connectCatalogSession({browser, until, report}, extensionOrigin, beforeTargets);
      rawProof.catalogTarget = {targetId:catalogSession.info.targetId, url:catalogSession.info.url};
      return {taskId:TASK_ID, version:TASK_VERSION, catalogTarget:rawProof.catalogTarget};
    });

    await phase('verify-publish-install-ui', async () => {
      const catalog = catalogSession ?? await connectCatalogSession({browser, until, report}, await read('location.origin'));
      const card='[...document.querySelectorAll("#task-catalog-cards .catalog-card")]'+
        '.find(node=>node.querySelector("strong")?.textContent==="R7.8 D3 scheduled once"&&node.textContent.includes("v7.8.0"))';
      await until(()=>catalog.read('!!('+card+')'),'the exact R7.8 Task candidate is listed');
      await clickReal(catalog,card);
      await until(()=>catalog.read(selector('#task-catalog-list')+'.value==='+JSON.stringify(TASK_ID+'@'+TASK_VERSION)+
        '&&!'+selector('#task-verify')+'.disabled'),'the R7.8 candidate is selected and ready for verification');
      if (!await catalog.read(selector('#catalog-verification') + '.open')) {
        await clickReal(catalog, selector('#catalog-verification > summary'));
        await until(() => catalog.read(selector('#catalog-verification') + '.open'), 'catalog verification details opened');
      }
      await typeInSession(catalog, clickReal, selector('#task-verify-run'), fixed.runId);
      await clickReal(catalog, selector('#task-verify'));
      await until(() => catalog.read(selector('#task-catalog-status') + '.textContent.includes("已核对本机持久运行")'),
        'fixed runId verified TaskCandidate', 30000);
      await clickReal(catalog, selector('#task-publish'));
      await until(() => catalog.read(selector('#task-catalog-status') + '.textContent.includes("已成为本地可安装版本")'),
        'TaskCandidate published as available', 30000);
      await clickReal(catalog, selector('#task-install'));
      await until(() => catalog.read(selector('#task-install-feedback') + '.textContent.includes("已安装")||' +
        selector('#task-catalog-status') + '.textContent.includes("已安装")'),
      'Task installed through visible catalog UI', 30000);
      const state = await readonlyIndexedDB(sidebar);
      rawProof.lastScheduledObservation=state;
      const installed = state.installed.find(row => row.taskId === TASK_ID && row.version === TASK_VERSION);
      assert(installed?.enabled, 'installed R7.8 scheduled task must be enabled');
      await browser.call('Target.closeTarget', {targetId:catalog.info.targetId});
      catalog.close?.();
      catalogSession = null;
      return {installed:{taskId:installed.taskId, version:installed.version,
        generation:installed.authorization?.generation ?? null,
        installationId:installed.authorization?.installationId ?? null}};
    });

    const before = await phase('prepare-open-demo-tab', async () => {
      await browser.call('Target.activateTarget', {targetId:website.info.id});
      await scrollSearchFormIntoView(website, browser);
      const value = await searchState(website);
      assert(Number.isSafeInteger(value.count), 'demo form search count is readable');
      return value;
    });

    await phase('create-once-schedule-ui', async () => {
      await clickReal(sidebar, selector('#tab-my-tasks'));
      await clickReal(sidebar, selector('#schedule-open'));
      await until(() => read('!' + selector('#scheduled-panel') + '.hidden'), 'My scheduled panel visible', 15000);
      await until(()=>read('!'+selector('#schedule-create')+'.hidden&&!'+selector('#schedule-create')+'.disabled'),'new plan action ready',15000);
      await clickReal(sidebar, selector('#schedule-create'));
      await until(() => read('!' + selector('#schedule-form') + '.hidden'), 'new plan form visible',15000);
      await until(()=>read('!'+selector('#schedule-manage-tasks')+'.disabled'),'installed-task manager finished loading',15000);
      await clickReal(sidebar, selector('#schedule-manage-tasks'));
      await until(() => read('!!document.querySelector("#schedule-manager-list .schedule-manager-card")'),
        'installed task manager lists the R7.8 task', 15000);
      await clickReal(sidebar, '[...document.querySelectorAll("#schedule-manager-list .schedule-manager-card")]' +
        '.find(card=>card.textContent.includes(' + JSON.stringify(TASK_ID) + '))?.querySelector(".schedule-actions button:first-child")');
      await until(() => read('!' + selector('#schedule-form') + '.hidden'), 'schedule form visible');
      assert.equal(await read(selector('#schedule-task-select') + '.value'), TASK_ID,
        'product UI bound the new schedule form to the installed R7.8 Task');
      await type(selector('#schedule-title'), 'R7.8 D3 once');
      await type(selector('#schedule-target'), DEMO_URL);
      await type(selector('#schedule-params'), '{}');
      assert.equal(await read(selector('#schedule-kind') + '.value'), 'once', 'schedule kind is once');
      await typeOnceTime(sidebar,clickReal,until,localDateTimeInput(Date.now()+90_000));
      await until(() => read(selector('#schedule-next') + '.dataset.state==="valid"'), 'once schedule time is valid', 12000);
      await clickReal(sidebar, selector('#schedule-save'));
      await until(() => read('!' + selector('#schedule-save-confirm') + '.hidden'), 'visible once schedule confirmation', 15000);
      await clickReal(sidebar, selector('#schedule-confirm-yes'));
      await until(() => read('!!document.querySelector("#schedule-plan-list .schedule-card")'),
        'approved once schedule persisted in My', 20000);
      const state = await readonlyIndexedDB(sidebar);
      const plan = state.plans.find(row => row.taskId === TASK_ID && row.triggerKind === 'once' && !row.deleted);
      assert(plan, 'readonly IndexedDB contains schedule-definition-v1');
      assert.equal(plan.sourceHash, saved.contentHash, 'schedule-definition-v1 pins saved revision contentHash');
      return {scheduleId:plan.scheduleId, generation:plan.generation, nextDueAt:plan.nextDueAt,
        triggerKind:plan.triggerKind, taskId:plan.taskId, sourceHash:plan.sourceHash};
    });

    const due = await phase('wait-real-scheduled-fire', async () => until(async () => {
      const state = await readonlyIndexedDB(sidebar);
      rawProof.lastScheduledObservation=state;
      const fires = state.fires.filter(row => row.scheduleId === rawProof['create-once-schedule-ui'].scheduleId);
      for (const fire of fires) {
        if (!fire.runId || !fire.resultId) continue;
        const run = state.runs.find(row => row.runId === fire.runId);
        const result = state.results.find(row => row.resultId === fire.resultId && row.runId === fire.runId);
        if (run?.state !== 'completed' || run.retirementState !== 'released' || run.workerRetired !== true) continue;
        if (result?.state !== 'completed' || result.outcome?.ok !== true) continue;
        if (run.revision?.sourceHash !== saved.contentHash || result.revision?.sourceHash !== saved.contentHash) continue;
        if (!state.native.some(row => row.runId === run.runId && row.state==='durable' && !row.reply?.error &&
          row.envelope?.identity?.runId===run.runId && row.envelope?.revision?.sourceHash===saved.contentHash &&
          row.nativeReceipts?.some(receipt=>receipt.stage==='result'&&receipt.requestId===row.envelope.requestId&&
            receipt.receipt?.requestId===row.reply?.requestId))) continue;
        return {fire, run, result, state};
      }
      return null;
    }, 'actual Side Panel scheduled host fired same R7.8 Controller once', 170000));

    await phase('verify-scheduled-result', async () => {
      const value = decodeValue(due.result.outcome.valueWire);
      const after = await searchState(website);
      assert.equal(due.fire.status, 'ADMITTED');
      await until(()=>read('document.querySelector("#schedule-plan-list").textContent.includes("成功")'),
        'product scheduled history reports completion',15000);
      assert.equal(due.fire.runId, due.run.runId);
      assert.equal(due.fire.resultId, due.result.resultId);
      assert.equal(due.run.scheduledFireId, due.fire.fireId);
      assert.equal(due.run.revision.sourceHash, saved.contentHash);
      assert.equal(due.result.revision.sourceHash, saved.contentHash);
      assert.equal(due.run.retirementState, 'released');
      assert.equal(value.maxValue, 5, 'D3 max result must remain 5');
      assert.equal(value.searchCountBefore, before.count);
      assert.equal(value.searchCountAfter, before.count + 1);
      assert.equal(after.count, before.count + 1, 'scheduled Controller increments search count once');
      assert.equal(after.keyword, 'OpenDesk');
      assert.match(after.result || '', /OpenDesk/);
      assert.equal(due.state.fires.filter(row => row.fireId === due.fire.fireId).length, 1);
      assert.equal(due.state.runs.filter(row => row.scheduledFireId === due.fire.fireId).length, 1);
      return {fireId:due.fire.fireId, runId:due.run.runId, resultId:due.result.resultId,
        sourceHash:due.result.revision.sourceHash, d3Max:value.maxValue,
        searchCountBefore:before.count, searchCountAfter:after.count,
        released:due.run.retirementState === 'released', workerRetired:due.run.workerRetired === true};
    });

    await phase('restore-developer-after-schedule', async () => {
      await clickReal(sidebar, selector('#tab-develop'));
      await until(() => read(selector('#script-id') + '.value===' + JSON.stringify(PROGRAM)),
        'Developer tab restored to R7.8 Controller id', 12000);
      assert.equal(await read('Number(' + selector('#script-revision') + '.value)'), saved.revision);
      assert.equal(await read(selector('#script-source') + '.value'), saved.sourceUtf8);
      return {scriptId:PROGRAM, revision:saved.revision, sourceHash:saved.contentHash};
    });

    rawProof.status = 'CHROME_PASS_R78_D3_SCHEDULED_ONCE';
    return rawProof;
  } catch (error) {
    rawProof.status = 'CHROME_FAIL';
    rawProof.error ??= {phase:currentPhase, code:error.code || 'E_R78_SCHEDULED_CYCLE',
      message:String(error.message || error)};
    error.rawProof = rawProof;
    throw error;
  }
}
