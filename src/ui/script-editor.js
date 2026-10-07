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

export function createScriptEditor({client, currentPageTarget, api = globalThis.chrome, document: doc = globalThis.document}) {
  const host = createRunHost({api, client, document: doc, templateModuleFactory: null});
  const find = id => doc.getElementById(id);
  const status = find('script-status'), output = find('script-result');
  const tab = find('script-tab'), frame = find('script-document'), mode = find('script-target-mode');
  const currentPageStatus = find('script-current-page-status'), currentPageDebug = find('script-current-page-debug');
  const revisions = new Map(), documents = new Map();
  const downloadable = new Map(), downloads = new Map(), preparations = new Map();
  const resultSelect = find('script-download-result'), downloadStatus = find('script-download-status');
  let downloading = false, projection;
  let currentRevision, currentPageState = currentPageTarget?.snapshot ?? {status:'unavailable',reason:'E_TARGET',message:'当前网页服务不可用'},
    selectionVersion = 0, running = false, disposed = false;
  const listeners = [];
  let browserListenersAttached = false;
  const listen = (element, event, listener) => {
    element.addEventListener(event, listener); listeners.push({element, event, listener});
  };
  function display(state, message, value) {
    status.dataset.state = state; status.textContent = message;
    if (value !== undefined) output.textContent = printable(value);
  }
  const fail = error => display('error', `${error.code || 'E_CONTROL_EXECUTION'}：${error.message || error}`);
  const scriptId = () => find('script-id').value.trim();
  function renderRevisionState() {
    const node = find('script-version');
    if (!currentRevision || currentRevision.scriptId !== scriptId()) {
      node.dataset.dirty = 'false';
      node.textContent = currentRevision ? '当前脚本 ID 尚未加载持久版本' : '尚未保存；Run 不会执行编辑区中的未保存源码';
      return;
    }
    if (currentRevision.revision !== Number(find('script-revision').value)) {
      node.dataset.dirty = 'false';
      node.textContent = `已加载 r${currentRevision.revision}；请先加载要运行的明确版本`;
      return;
    }
    const dirty = find('script-source').value !== currentRevision.sourceUtf8;
    node.dataset.dirty = String(dirty);
    node.textContent = dirty
      ? `已保存 r${currentRevision.revision} · 存在未保存修改 · 本次 Run：r${currentRevision.revision}`
      : `已保存 r${currentRevision.revision} · 本次 Run：r${currentRevision.revision} · ${currentRevision.contentHash}`;
  }
  function update() {
    renderRevisionState();
    find('script-delete').disabled = !revisions.has(scriptId());
    find('script-run').disabled = running || !projection?.slotAvailable || !!host.currentRun || !currentRevision ||
      currentRevision.scriptId !== scriptId() || currentRevision.revision !== Number(find('script-revision').value) ||
      mode.value === 'current' && currentPageState?.status !== 'available';
    find('script-stop').disabled = !host.currentRun;
    find('script-owned-url').disabled = mode.value !== 'owned';
    tab.disabled = mode.value !== 'borrowed'; frame.disabled = mode.value !== 'borrowed' || !documents.size;
    find('script-download').disabled = downloading || !downloadable.has(resultSelect.value);
  }
  function renderCurrentPage(next) {
    currentPageState = next;
    if (next?.status === 'available') {
      currentPageStatus.dataset.state = 'available';
      currentPageStatus.textContent = `当前网页：${next.title || next.url}`;
      currentPageDebug.textContent = JSON.stringify({windowId:next.windowId,tabId:next.tabId,frameId:next.frameId,
        documentId:next.documentId,url:next.url,origin:next.origin}, null, 2);
    } else if (next?.status === 'resolving') {
      currentPageStatus.dataset.state = 'resolving'; currentPageStatus.textContent = '当前网页：正在识别…';
      currentPageDebug.textContent = next.windowId == null ? '' : JSON.stringify({windowId:next.windowId}, null, 2);
    } else {
      currentPageStatus.dataset.state = 'unavailable';
      currentPageStatus.textContent = `当前网页：不可运行（${next?.message || '未找到活动 HTTP(S) 主文档'}）`;
      currentPageDebug.textContent = JSON.stringify({windowId:next?.windowId ?? null,reason:next?.reason || 'E_TARGET'}, null, 2);
    }
    update();
  }
  function remember(row) {
    revisions.set(row.scriptId, row.revision); currentRevision = row;
    find('script-revision').value = String(row.revision);
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
    if (mode.value === 'current') {
      if (!currentPageTarget) throw {code:'E_TARGET',message:'当前网页服务不可用'};
      const candidate = currentPageTarget.capture();
      return {target:{mode:'borrowed',tabId:candidate.tabId,frameId:0,documentId:candidate.documentId},
        url:candidate.url,candidate};
    }
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
    projection = snapshot;
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
      {run:snapshot.run, runs:snapshot.runs, results:values, downloads:snapshot.downloads, resultDeliveryDenied:snapshot.resultDeliveryDenied});
  }
  async function read() {
    const runId = find('script-run-id').value.trim();
    showSnapshot(await host.controller.snapshotControllerRun(runId ? {runId} : {}));
  }
  async function observeDownload(attemptId) {
    const entry = downloads.get(attemptId);
    if (!entry || disposed) return;
    entry.timer=null;
    try {
      const view = await client.request('reconcileDownload',{attemptId});
      if (disposed) return;
      entry.attempt = view.attempt;
      downloadStatus.textContent = `下载 ${view.attempt.state} · ${entry.sha256}`;
      entry.localRevoked ||= host.artifactResources.release(view.attempt);
      if (entry.localRevoked) {
        await client.request('recordResourceRelease',{attemptId}); downloads.delete(attemptId);
        downloadStatus.textContent = view.receipt?.browserDownloadComplete === true
          ? `浏览器已完成下载 · 产物 SHA-256 ${entry.sha256}（磁盘文件待核对）` : `下载 ${view.attempt.state}，资源已释放 · ${entry.sha256}`;
      } else entry.timer = setTimeout(() => observeDownload(attemptId),1000);
    } catch (error) {
      downloadStatus.textContent = `${error.code || 'E_EFFECT_UNKNOWN'}：${error.message}；${entry.localRevoked ? '本地 Blob 已释放，等待后台确认' : '保留资源与原尝试'}`;
      if (!disposed) entry.timer = setTimeout(() => observeDownload(attemptId),1000);
    }
  }
  async function retirePreparation(entry) {
    entry.timer=null;
    try {
      const retired=await client.request('retirePreparedArtifact',{artifactId:entry.artifactId});
      for(const attemptId of retired.attemptIds) await client.request('recordResourceRelease',{attemptId});
      preparations.delete(entry.artifactId);
      downloadStatus.textContent='未提交的下载已取消，本地资源与后台记录已收尾';
    } catch(error) {
      downloadStatus.textContent=`${error.code || 'E_EFFECT_UNKNOWN'}：未提交的 Blob 已在本地释放，等待后台取消确认`;
      if(!disposed) entry.timer=setTimeout(()=>retirePreparation(entry),1000);
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
      const preparation={requestId:crypto.randomUUID(),artifactId:artifact.artifactId,blobUrl};
      preparations.set(artifact.artifactId,preparation);
      let attempt;
      try { attempt = await client.request('prepareAttempt',preparation); }
      catch(error) {
        host.artifactResources.releaseUnsubmitted(blobUrl);
        retirePreparation(preparation); throw error;
      }
      preparations.delete(artifact.artifactId);
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
      permission = api.permissions.request({origins:[permissionPattern(chosen.url)],
        ...(find('script-allow-cookies').checked ? {permissions:['cookies']} : {})});
    } catch (error) { fail(error); return; }
    const revision = currentRevision, version = selectionVersion;
    let startError;
    running = true; update(); display('authorizing','正在授权选定目标…');
    (async () => {
      if (!await permission) throw {code:'E_PERMISSION',message:'授权被拒绝，未启动任务'};
      if (chosen.candidate) await currentPageTarget.revalidate(chosen.candidate);
      else if (chosen.target.mode === 'borrowed' && version !== selectionVersion)
        throw {code:'E_DOCUMENT_STALE',message:'选定文档已变化，请重新选择'};
      const claim = await host.start({scriptId:revision.scriptId, revision:revision.revision, contentHash:revision.contentHash,
        params, target:chosen.target, deadlineAt:Date.now() + 30000});
      find('script-run-id').value = claim.runId;
      display('running', `已接受 r${revision.revision}；等待脚本结束及持久结果`, {runId:claim.runId,revision:claim.revision});
      update();
      const result = await host.completion;
      if (result.error) throw result.error;
      showSnapshot(await host.controller.snapshotControllerRun({runId:claim.runId}));
    })().catch(error => {startError=error;fail(error);}).finally(async () => {
      running = false;
      try {showSnapshot(await host.controller.snapshotControllerRun(find('script-run-id').value ? {runId:find('script-run-id').value} : {}));}
      catch (error) {projection=undefined;display('unknown',`后台状态待确认：${error.code || 'E_EFFECT_UNKNOWN'}`);}
      if (startError) fail(startError);
      update();
    });
  }
  const onNavigation = details => {
    if (String(details.tabId) === tab.value) clearDocuments();
  };
  const onRemoved = tabId => {if (String(tabId) === tab.value) {tab.value = ''; clearDocuments();}};
  const on = (id, event, operation) => listen(find(id), event, () => Promise.resolve().then(operation).catch(fail));
  on('script-save','click',save); on('script-load','click',load); on('script-read','click',read); on('script-delete','click',remove);
  on('script-download','click',downloadResult); on('script-download-result','change',update);
  on('script-refresh','click',refreshTabs); on('script-tab','change',refreshDocuments);
  on('script-target-mode','change',update); on('script-id','input',update); on('script-revision','input',update); on('script-source','input',update);
  listen(find('script-run'), 'click', start);
  on('script-stop','click',async () => {
    if (host.currentRun) {await host.stop({runId:host.currentRun,controller:true}); display('stopping','停止已提交，正在收尾…');}
  });
  api.webNavigation.onCommitted.addListener(onNavigation); api.tabs.onRemoved.addListener(onRemoved);
  browserListenersAttached = true;
  const unsubscribeCurrentPage = currentPageTarget?.subscribe(renderCurrentPage);
  currentPageTarget?.ready?.catch(fail);
  const recoverView = () => read().catch(error=>{projection=undefined;update();fail(error);});
  const unsubscribeConnection = client.subscribeConnection?.(event=>{if(event.connected) recoverView();});
  client.ready.then(recoverView).catch(fail);
  refreshTabs().catch(fail); update();
  return {host, resourceSnapshot: () => ({...host.resourceSnapshot(), editor:{
    timers:[...downloads.values(),...preparations.values()].filter(entry=>entry.timer != null).length,
    pending:Number(downloading)+preparations.size, subscriptions:listeners.length+2*Number(browserListenersAttached)+Number(Boolean(unsubscribeCurrentPage))}}), dispose() {
    if (disposed) return; disposed = true; unsubscribeConnection?.(); unsubscribeCurrentPage?.();
    api.webNavigation.onCommitted.removeListener(onNavigation); api.tabs.onRemoved.removeListener(onRemoved); host.dispose();
    browserListenersAttached = false;
    for (const {element, event, listener} of listeners) element.removeEventListener(event, listener);
    listeners.length = 0;
    for (const entry of downloads.values()) { clearTimeout(entry.timer); entry.timer = null; }
    for (const entry of preparations.values()) { clearTimeout(entry.timer); entry.timer = null; }
  }};
}
