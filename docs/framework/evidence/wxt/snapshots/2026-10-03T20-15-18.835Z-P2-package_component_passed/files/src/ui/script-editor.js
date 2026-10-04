import {createRunHost} from '../run-host.js';
import {permissionPattern} from '../environment.js';
import {base64ToBytes, decodeValue} from '../platform/page-port/codec.js';
import {hashArtifactBytes} from '../platform/downloads/blob-lifecycle.js';
import {BUDGETS, invariant} from '../platform/protocol.js';

function printable(value) {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(printable).join(', ')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value).map(key => `${JSON.stringify(key)}: ${printable(value[key])}`).join(', ')}}`;
  return JSON.stringify(value);
}

export function createScriptEditor({client, api = globalThis.chrome, document: doc = globalThis.document}) {
  const host = createRunHost({api, client, document: doc});
  const find = id => doc.getElementById(id);
  const status = find('script-status'), output = find('script-result');
  const tab = find('script-tab'), frame = find('script-document'), mode = find('script-target-mode');
  const revisions = new Map(), documents = new Map();
  const downloadable = new Map(), downloads = new Map();
  const resultSelect = find('script-download-result'), downloadStatus = find('script-download-status');
  let downloading = false;
  let currentRevision, selectionVersion = 0, running = false, disposed = false;
  function display(state, message, value) {
    status.dataset.state = state; status.textContent = message;
    if (value !== undefined) output.textContent = printable(value);
  }
  const fail = error => display('error', `${error.code || 'E_CONTROL_EXECUTION'}：${error.message || error}`);
  const scriptId = () => find('script-id').value.trim();
  function update() {
    find('script-delete').disabled = !revisions.has(scriptId());
    find('script-run').disabled = running || !currentRevision ||
      currentRevision.scriptId !== scriptId() || currentRevision.revision !== Number(find('script-revision').value);
    find('script-stop').disabled = !running;
    find('script-owned-url').disabled = mode.value !== 'owned';
    tab.disabled = mode.value !== 'borrowed'; frame.disabled = mode.value !== 'borrowed' || !documents.size;
    find('script-download').disabled = downloading || !downloadable.has(resultSelect.value);
  }
  function remember(row) {
    revisions.set(row.scriptId, row.revision); currentRevision = row;
    find('script-revision').value = String(row.revision);
    find('script-version').textContent = `已保存 r${row.revision} · ${row.contentHash}`;
    update(); return row;
  }
  function clearDocuments() {
    selectionVersion++; documents.clear();
    frame.replaceChildren(new Option('请选择当前精确文档', '')); update();
  }
  async function refreshTabs() {
    clearDocuments(); tab.replaceChildren(new Option('请选择具体网页', ''));
    for (const row of await api.tabs.query({})) {
      if (!row.incognito && Number.isSafeInteger(row.id) && /^https?:\/\//.test(row.url || ''))
        tab.append(new Option(`[${row.id}] ${row.title || row.url} · ${row.url}`, String(row.id)));
    }
  }
  async function refreshDocuments() {
    clearDocuments(); if (!tab.value) return;
    const version = selectionVersion, tabId = Number(tab.value);
    const [selectedTab, frames] = await Promise.all([api.tabs.get(tabId), api.webNavigation.getAllFrames({tabId})]);
    if (disposed || version !== selectionVersion || tab.value !== String(tabId)) return;
    if (selectedTab.incognito) throw {code:'E_PERMISSION', message:'不支持隐身网页'};
    for (const row of frames || []) {
      if (!row.documentId || row.errorOccurred || !/^https?:\/\//.test(row.url || '') ||
        row.documentLifecycle && row.documentLifecycle !== 'active') continue;
      documents.set(row.documentId, {mode:'borrowed', tabId, frameId:row.frameId, documentId:row.documentId, url:row.url});
      frame.append(new Option(`frame ${row.frameId} · ${row.documentId} · ${row.url}`, row.documentId));
    }
    update();
  }
  function selection() {
    if (mode.value === 'owned') {
      const url = find('script-owned-url').value.trim(); permissionPattern(url);
      return {target:{mode:'owned',url},url};
    }
    const selected = documents.get(frame.value);
    if (!selected) throw {code:'E_TARGET',message:'请选择具体网页及其当前文档'};
    const {url, ...target} = selected; return {target,url};
  }
  async function save() {
    const id = scriptId();
    const row = await host.controller.commitControllerScript({scriptId:id, expectedRevision:revisions.get(id) || 0,
      sourceUtf8:find('script-source').value});
    remember(row); display('saved', `r${row.revision} 已持久保存；正在运行的旧版本保持原版本`, {scriptId:row.scriptId,revision:row.revision,contentHash:row.contentHash});
  }
  async function load() {
    const revisionText = find('script-revision').value.trim();
    const row = await host.controller.getControllerScript({scriptId:scriptId(),
      ...(revisionText ? {revision:Number(revisionText)} : {})});
    find('script-source').value = row.sourceUtf8; remember(row);
    display('loaded', `已加载持久版本 r${row.revision}`);
  }
  async function remove() {
    const id = scriptId(), expectedRevision = revisions.get(id);
    if (!expectedRevision) throw {code:'E_REVISION',message:'请先加载最新持久版本'};
    await client.request('tombstoneControllerScript',{scriptId:id,expectedRevision});
    revisions.delete(id); if (currentRevision?.scriptId === id) currentRevision = undefined;
    find('script-version').textContent = '脚本已删除'; update();
    display('deleted','脚本已删除；已运行版本的源码保留至任务退休');
  }
  function showSnapshot(snapshot) {
    const previous = resultSelect.value;
    downloadable.clear(); resultSelect.replaceChildren(new Option('请选择要下载的结果', ''));
    const values = snapshot.results.map(row => {
      if (row.state === 'completed' && row.outcome?.ok === true) {
        downloadable.set(row.resultId,row);
        resultSelect.append(new Option(`${row.runId} · r${row.revision.revision}`,row.resultId));
      }
      return {runId:row.runId,resultId:row.resultId,state:row.state,
        ...(row.outcome?.ok === true ? {value:decodeValue(row.outcome.valueWire)} : {error:row.outcome?.error})};
    });
    if (downloadable.has(previous)) resultSelect.value = previous;
    update();
    display('results', snapshot.run ? `任务 ${snapshot.run.runId}：${snapshot.run.state}` : '已读取持久结果',
      {run:snapshot.run, results:values});
  }
  async function read() {
    const runId = find('script-run-id').value.trim();
    showSnapshot(await host.controller.snapshotControllerRun(runId ? {runId} : {}));
  }
  async function observeDownload(attemptId) {
    const entry = downloads.get(attemptId);
    if (!entry || disposed) return;
    try {
      const view = await client.request('reconcileDownload',{attemptId});
      if (disposed) return;
      entry.attempt = view.attempt;
      downloadStatus.textContent = `下载 ${view.attempt.state} · ${entry.sha256}`;
      if (host.artifactResources.release(view.attempt)) {
        await client.request('recordResourceRelease',{attemptId}); downloads.delete(attemptId);
        downloadStatus.textContent = view.receipt?.browserDownloadComplete === true
          ? `浏览器已完成下载 · SHA-256 ${entry.sha256}` : `下载 ${view.attempt.state}，资源已释放 · ${entry.sha256}`;
      } else entry.timer = setTimeout(() => observeDownload(attemptId),1000);
    } catch (error) {
      downloadStatus.textContent = `${error.code || 'E_EFFECT_UNKNOWN'}：${error.message}；保留资源与原尝试`;
      if (!disposed) entry.timer = setTimeout(() => observeDownload(attemptId),1000);
    }
  }
  async function downloadResult() {
    if (downloading) return;
    const row = downloadable.get(resultSelect.value);
    if (!row) throw {code:'E_RESULT',message:'请选择已完成的持久结果'};
    downloading = true; update(); downloadStatus.textContent = '正在准备持久结果文件…';
    try {
      const prepared = await client.request('prepareArtifact',{requestId:crypto.randomUUID(),runId:row.runId,
        resultId:row.resultId,filename:`result-${row.runId}.json`,format:'typed-json'});
      const {artifact,blocks} = await client.request('readArtifact',{artifactId:prepared.artifactId});
      invariant(artifact.artifactId === prepared.artifactId && Array.isArray(blocks) && blocks.length > 0 && blocks.length <= 64,
        'E_SCHEMA','Invalid artifact blocks');
      const parts = blocks.map(block => base64ToBytes(block));
      const size = parts.reduce((sum,part) => sum + part.length,0);
      invariant(size <= BUDGETS.maxArtifactBytes && size === artifact.bytes,'E_LIMIT','Artifact byte count differs');
      const bytes = new Uint8Array(size); let offset = 0;
      for (const part of parts) {bytes.set(part,offset); offset += part.length;}
      invariant(await hashArtifactBytes(bytes) === artifact.sha256,'E_HASH','Artifact hash differs');
      const blobUrl = host.artifactResources.create(bytes,artifact.mime);
      const attempt = await client.request('prepareAttempt',{requestId:crypto.randomUUID(),artifactId:artifact.artifactId,blobUrl});
      downloads.set(attempt.attemptId,{attempt,sha256:artifact.sha256});
      // Accepted dispatch is distinct from browser download completion.
      try {
        await client.request('dispatchDownload',{attemptId:attempt.attemptId});
        downloadStatus.textContent = `已提交下载，等待浏览器完成 · ${artifact.sha256}`;
      } finally {observeDownload(attempt.attemptId);}
    } catch (error) {downloadStatus.textContent = `${error.code || 'E_EFFECT_UNKNOWN'}：${error.message || error}`;}
    finally {downloading = false; update();}
  }
  function start(event) {
    if (!event.isTrusted || running) return;
    let chosen, params, permission;
    try {
      chosen = selection(); params = JSON.parse(find('script-params').value);
      if (!currentRevision || currentRevision.scriptId !== scriptId() || currentRevision.revision !== Number(find('script-revision').value))
        throw {code:'E_REVISION',message:'请先保存或加载要运行的持久版本'};
      // The native permission request stays in the trusted click, before awaits.
      permission = api.permissions.request({origins:[permissionPattern(chosen.url)]});
    } catch (error) { fail(error); return; }
    const revision = currentRevision, version = selectionVersion;
    running = true; update(); display('authorizing','正在授权选定目标…');
    (async () => {
      if (!await permission) throw {code:'E_PERMISSION',message:'授权被拒绝，未启动任务'};
      if (mode.value === 'borrowed' && version !== selectionVersion)
        throw {code:'E_DOCUMENT_STALE',message:'选定文档已变化，请重新选择'};
      const claim = await host.start({scriptId:revision.scriptId, revision:revision.revision, contentHash:revision.contentHash,
        params, target:chosen.target, deadlineAt:Date.now() + 30000});
      find('script-run-id').value = claim.runId;
      display('running', `已接受 r${revision.revision}；等待脚本结束及持久结果`, {runId:claim.runId,revision:claim.revision});
      const result = await host.completion;
      if (result.error) throw result.error;
      showSnapshot(await host.controller.snapshotControllerRun({runId:claim.runId}));
    })().catch(fail).finally(() => {running = false; update();});
  }
  const onNavigation = details => {
    if (String(details.tabId) === tab.value) clearDocuments();
  };
  const onRemoved = tabId => {if (String(tabId) === tab.value) {tab.value = ''; clearDocuments();}};
  const on = (id, event, operation) => find(id).addEventListener(event, () => Promise.resolve().then(operation).catch(fail));
  on('script-save','click',save); on('script-load','click',load); on('script-read','click',read); on('script-delete','click',remove);
  on('script-download','click',downloadResult); on('script-download-result','change',update);
  on('script-refresh','click',refreshTabs); on('script-tab','change',refreshDocuments);
  on('script-target-mode','change',update); on('script-id','input',update); on('script-revision','input',update);
  find('script-run').addEventListener('click',start);
  on('script-stop','click',async () => {
    if (host.currentRun) {await host.stop({runId:host.currentRun,controller:true}); display('stopping','停止已提交，正在收尾…');}
  });
  api.webNavigation.onCommitted.addListener(onNavigation); api.tabs.onRemoved.addListener(onRemoved);
  client.ready.then(() => display('ready','公共运行入口已就绪，请保存脚本并选择目标')).catch(fail);
  refreshTabs().catch(fail); update();
  return {host, dispose() {
    if (disposed) return; disposed = true;
    api.webNavigation.onCommitted.removeListener(onNavigation); api.tabs.onRemoved.removeListener(onRemoved); host.dispose();
    for (const entry of downloads.values()) clearTimeout(entry.timer);
  }};
}
