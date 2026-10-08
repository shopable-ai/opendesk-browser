import {createRunHost} from '../run-host.js';
import {permissionPattern} from '../environment.js';
import {base64ToBytes, decodeValue} from '../platform/page-port/codec.js';
import {hashArtifactBytes} from '../platform/downloads/blob-lifecycle.js';
import {BUDGETS, invariant} from '../platform/protocol.js';

function printable(value, depth = 0) {
  if (value === undefined) return 'undefined';
  const indent = '  '.repeat(depth), childIndent = `${indent}  `;
  if (Array.isArray(value)) return value.length
    ? `[\n${value.map(item => `${childIndent}${printable(item, depth + 1)}`).join(',\n')}\n${indent}]` : '[]';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    return keys.length ? `{\n${keys.map(key => `${childIndent}${JSON.stringify(key)}: ${printable(value[key], depth + 1)}`).join(',\n')}\n${indent}}` : '{}';
  }
  return JSON.stringify(value);
}

export function createScriptEditor({client, currentPageTarget, api = globalThis.chrome, document: doc = globalThis.document,
  hostFactory = createRunHost}) {
  const host = hostFactory({api, client, document: doc, templateModuleFactory: null});
  const find = id => doc.getElementById(id);
  const status = find('script-status'), output = find('script-result');
  const tab = find('script-tab'), frame = find('script-document'), mode = find('script-target-mode');
  const currentPageStatus = find('script-current-page-status'), currentPageDebug = find('script-current-page-debug'),
    runningTargetStatus = find('script-running-target');
  const revisions = new Map(), documents = new Map();
  const downloadable = new Map(), downloads = new Map(), preparations = new Map();
  const scriptList = find('script-list'), resultSelect = find('script-download-result'), downloadStatus = find('script-download-status');
  let downloading = false, projection, currentTask, editingBusy = false, stopping = false, previewBusy = false, snapshotSequence = 0;
  let scriptListSequence = 0, ownedDraftRunId = null;
  let currentRevision, currentPageState = currentPageTarget?.snapshot ?? {status:'unavailable',reason:'E_TARGET',message:'当前网页服务不可用'},
    selectionVersion = 0, running = false, disposed = false;
  const listeners = [];
  let browserListenersAttached = false;
  const listen = (element, event, listener) => {
    element.addEventListener(event, listener); listeners.push({element, event, listener});
  };
  function display(state, message, value) {
    if (disposed) return;
    status.dataset.state = state; status.textContent = message;
    if (value !== undefined) output.textContent = printable(value);
  }
  const fail = error => display('error', `${error.code || 'E_CONTROL_EXECUTION'}：${error.message || error}`);
  const scriptId = () => find('script-id').value.trim();
  function renderRevisionState() {
    const node = find('script-version');
    if (!currentRevision || currentRevision.scriptId !== scriptId()) {
      node.dataset.dirty = 'false';
      node.textContent = currentRevision ? '当前脚本 ID 尚未加载持久版本；仍可直接运行草稿' : '未保存草稿可直接运行；只有点击保存才创建正式版本';
      return;
    }
    if (currentRevision.revision !== Number(find('script-revision').value)) {
      node.dataset.dirty = 'false';
      node.textContent = `已加载 r${currentRevision.revision}；本次运行始终使用编辑器当前草稿`;
      return;
    }
    const dirty = find('script-source').value !== currentRevision.sourceUtf8;
    node.dataset.dirty = String(dirty);
    node.textContent = dirty
      ? `已保存 r${currentRevision.revision} · 存在未保存修改 · 运行草稿不会覆盖已保存版本`
      : `已保存 r${currentRevision.revision} · 可运行草稿；不自动创建新 revision`;
  }
  function update() {
    if (disposed) return;
    renderRevisionState();
    find('script-save').disabled = editingBusy; find('script-load').disabled = editingBusy;
    find('script-list-refresh').disabled = editingBusy; find('script-list-load').disabled = editingBusy || !scriptList.value;
    find('script-delete').disabled = editingBusy || !revisions.has(scriptId());
    find('script-run').disabled = editingBusy || previewBusy || running || !projection?.slotAvailable || !!host.currentRun ||
      !find('script-source').value.trim() || mode.value === 'current' && currentPageState?.status !== 'available';
    find('script-stop').disabled = stopping || !ownedDraftRunId || host.currentRun !== ownedDraftRunId;
    find('page-preview-run').disabled = previewBusy || editingBusy || running || !!host.currentRun ||
      !find('script-source').value.trim() || currentPageState?.status !== 'available';
    find('script-owned-url').disabled = mode.value !== 'owned';
    tab.disabled = mode.value !== 'borrowed'; frame.disabled = mode.value !== 'borrowed' || !documents.size;
    find('script-download').disabled = downloading || !downloadable.has(resultSelect.value);
  }
  function renderCurrentPage(next) {
    if (disposed) return;
    currentPageState = next;
    find('script-current-page-title').textContent = next?.status === 'available' ? next.title || next.url : '尚未识别可运行网页';
    find('script-current-page-url').textContent = next?.status === 'available' ? next.url : '';
    if (next?.status === 'available') {
      currentPageStatus.dataset.state = 'available';
      currentPageStatus.textContent = '可运行 · 当前窗口的 HTTP(S) 主文档';
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
  function renderRunningTarget(target, runId) {
    if (!target) {
      runningTargetStatus.dataset.state = 'idle';
      runningTargetStatus.textContent = '运行目标：尚未建立';
      runningTargetStatus.removeAttribute('title');
      return;
    }
    runningTargetStatus.dataset.state = 'running';
    runningTargetStatus.textContent = `运行目标：${target.url || target.allowedOrigin || '已冻结文档'}`;
    runningTargetStatus.title = JSON.stringify({runId,tabId:target.tabId,frameId:target.frameId,
      documentId:target.documentId,url:target.url,origin:target.allowedOrigin || target.origin});
  }
  const stateLabels = {preparing:'正在准备',running:'运行中',stopping:'正在停止',settling:'正在保存结果',
    retiring:'正在释放资源',completed:'已完成',failed:'失败',stopped:'已停止',interrupted:'已中断',paused_unknown:'状态待确认'};
  function renderTask(run) {
    if (disposed) return;
    currentTask = run;
    find('script-task-id').textContent = run ? `runId：${run.runId}` : '尚未运行';
    find('script-task-status').textContent = run ? `${stateLabels[run.state] || run.state} · ${run.retirementState === 'released' ? '资源已释放' : '以后台回执为准'}` : '';
    find('script-task-version').textContent = run?.revision
      ? run.sourceKind === 'draft' || run.revision.kind === 'draft'
        ? `草稿快照 · SHA-256 ${run.revision.sourceHash}`
        : `${run.revision.scriptId} · r${run.revision.revision} · ${run.revision.sourceHash}` : '';
    renderRunningTarget(run?.target, run?.runId);
    runningTargetStatus.dataset.state = run?.state || 'idle';
  }
  function remember(row, {head = true} = {}) {
    if (head) revisions.set(row.scriptId, row.revision);
    currentRevision = row;
    find('script-revision').value = String(row.revision);
    update(); return row;
  }
  function renderScriptList(rows) {
    const selected = scriptList.value || scriptId();
    revisions.clear();
    scriptList.replaceChildren(new Option(rows.length ? '选择已保存脚本' : '没有已保存脚本', ''));
    for (const row of rows) {
      revisions.set(row.scriptId, row.revision);
      scriptList.append(new Option(`${row.scriptId} · r${row.revision} · ${row.contentHash}`, row.scriptId));
    }
    if (rows.some(row => row.scriptId === selected)) scriptList.value = selected;
    update();
  }
  async function refreshScripts({silent = false} = {}) {
    const token = ++scriptListSequence;
    const rows = await host.controller.listControllerScripts({});
    if (disposed || token !== scriptListSequence) return;
    renderScriptList(rows);
    if (!silent) display('scripts', rows.length ? `已刷新 ${rows.length} 个已保存脚本` : '没有已保存脚本');
  }
  function clearDocuments() {
    selectionVersion++; documents.clear();
    frame.replaceChildren(new Option('请选择当前精确文档', '')); update();
  }
  async function refreshTabs() {
    clearDocuments(); tab.replaceChildren(new Option('请选择具体网页', ''));
    const rows = await api.tabs.query({});
    if (disposed) return;
    for (const row of rows) {
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
      return {target:{mode:'borrowed',tabId:candidate.tabId,frameId:0,documentId:candidate.documentId,expectedUrl:candidate.url,expectedWindowId:candidate.windowId},
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
    const id = scriptId(), source = find('script-source').value;
    const row = await host.controller.commitControllerScript({scriptId:id, expectedRevision:revisions.get(id) || 0,
      sourceUtf8:source});
    if (disposed) return;
    if (scriptId() === id) remember(row);
    await refreshScripts({silent: true});
    display('saved', `${id} · r${row.revision} 已持久保存；${host.currentRun ? '当前任务继续使用启动时的版本' : '保存不会运行脚本'}`);
  }
  async function load() {
    const id = scriptId(), revisionText = find('script-revision').value.trim(), source = find('script-source').value;
    const row = await host.controller.getControllerScript({scriptId:id,
      ...(revisionText ? {revision:Number(revisionText)} : {})});
    if (disposed) return;
    if (scriptId() !== id || find('script-revision').value.trim() !== revisionText || find('script-source').value !== source)
      throw {code:'E_REVISION',message:'加载期间编辑内容已变化，请重新加载'};
    find('script-source').value = row.sourceUtf8; remember(row, {head: !revisionText || revisions.get(id) === row.revision});
    display('loaded', `已加载持久版本 r${row.revision}`);
  }
  async function loadLatestFromList() {
    const id = scriptList.value, activeId = scriptId(), revisionText = find('script-revision').value.trim(), source = find('script-source').value;
    if (!id) throw {code:'E_REVISION',message:'请选择已保存脚本'};
    const selectedHead = revisions.get(id);
    const row = await host.controller.getControllerScript({scriptId:id});
    if (disposed) return;
    if (scriptList.value !== id || scriptId() !== activeId || find('script-revision').value.trim() !== revisionText || find('script-source').value !== source)
      throw {code:'E_REVISION',message:'加载期间编辑内容已变化，请重新加载'};
    find('script-id').value = id; find('script-source').value = row.sourceUtf8;
    remember(row);
    if (selectedHead !== row.revision) await refreshScripts({silent: true});
    display('loaded', `已加载 ${id} 最新 r${row.revision}`);
  }
  async function remove() {
    const id = scriptId(), expectedRevision = revisions.get(id);
    if (!expectedRevision) throw {code:'E_REVISION',message:'请先加载最新持久版本'};
    await host.controller.tombstoneControllerScript({scriptId:id,expectedRevision});
    revisions.delete(id); if (currentRevision?.scriptId === id) currentRevision = undefined;
    find('script-version').textContent = '脚本已删除'; update();
    await refreshScripts({silent: true});
    display('deleted','脚本已删除；已运行版本的源码保留至任务退休');
  }
  function showSnapshot(snapshot) {
    if (disposed) return;
    projection = snapshot;
    const previous = resultSelect.value;
    downloadable.clear(); resultSelect.replaceChildren(new Option('请选择要下载的结果', ''));
    const values = snapshot.results.map(row => {
      if (row.state === 'completed' && row.outcome?.ok === true) {
        downloadable.set(row.resultId,row);
        resultSelect.append(new Option(`${row.runId} · ${row.sourceKind === 'draft' ? '草稿' : 'r' + row.revision.revision}`,row.resultId));
      }
      return {tag:row.tag,runId:row.runId,resultId:row.resultId,state:row.state,sourceKind:row.sourceKind || 'saved',
        revision:row.revision && {scriptId:row.revision.scriptId,revision:row.revision.revision,sourceHash:row.revision.sourceHash},
        sourceHash:row.revision?.sourceHash,
        ...(row.outcome?.ok === true ? {value:decodeValue(row.outcome.valueWire)} : {error:row.outcome?.error})};
    });
    if (downloadable.has(previous)) resultSelect.value = previous;
    const task = currentTask && snapshot.runs.find(row=>row.runId === currentTask.runId);
    if (task) renderTask(task);
    else if (!running && !host.currentRun && snapshot.run) renderTask(snapshot.run);
    else if (!currentTask && !running && !host.currentRun && snapshot.runs.length) renderTask(snapshot.runs.at(-1));
    if (!snapshot.run) {
      const history = find('script-history-run'), selected = history.value;
      history.replaceChildren(new Option('选择历史任务', ''));
      for (const row of snapshot.runs) history.append(new Option(
        `${row.runId} · ${row.sourceKind === 'draft' ? '草稿' : 'r' + (row.revision?.revision ?? '?')} · ${stateLabels[row.state] || row.state}`,row.runId));
      if (snapshot.runs.some(row=>row.runId === selected)) history.value = selected;
      find('script-history').textContent = printable({runs:snapshot.runs,results:values,downloads:snapshot.downloads,resultDeliveryDenied:snapshot.resultDeliveryDenied});
    }
    update();
    const focused = snapshot.run || currentTask;
    display('results', focused ? `任务 ${focused.runId}：${stateLabels[focused.state] || focused.state}` : '已读取持久结果',
      {runId:focused?.runId,state:focused?.state,results:focused ? values.filter(row=>row.runId === focused.runId) : values,
        resultDeliveryDenied:snapshot.resultDeliveryDenied});
    // Reveal genuine outcome only for this session's own draft; old history
    // stays collapsed on ordinary entry, preserving editor working space.
    if (ownedDraftRunId && values.some(row => row.runId === ownedDraftRunId))
      find('developer-results-panel').open = true;
  }
  async function read(runId = find('script-run-id').value.trim()) {
    if (disposed) return;
    const token = ++snapshotSequence;
    try {
      const snapshot = await host.controller.snapshotControllerRun(runId ? {runId} : {});
      if (!disposed && token === snapshotSequence) showSnapshot(snapshot);
    } catch (error) {if (!disposed && token === snapshotSequence) throw error;}
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
    if (!event.isTrusted || disposed || running || previewBusy || editingBusy || host.currentRun) return;
    let chosen, params, permission, sourceUtf8;
    try {
      // Freeze exact editor bytes, params and target inside the trusted click
      // before permissions.request or any await.
      chosen = selection(); params = JSON.parse(find('script-params').value);
      sourceUtf8 = find('script-source').value;
      if (!sourceUtf8.trim()) throw {code:'E_SCHEMA',message:'请先输入草稿源码'};
      // The native permission request stays in the trusted click, before awaits.
      permission = api.permissions.request({origins:[permissionPattern(chosen.url)],
        ...(find('script-allow-cookies').checked ? {permissions:['cookies']} : {})});
    } catch (error) { fail(error); return; }
    const version = selectionVersion;
    let startError, admittedRunId;
    ownedDraftRunId = null; running = true; renderTask(null); update(); display('authorizing',`正在授权并验证已冻结候选：${chosen.url}`);
    (async () => {
      if (!await permission) throw {code:'E_PERMISSION',message:'授权被拒绝，未启动任务'};
      if (disposed) throw {code:'E_HOST_CLOSED',message:'Sidebar 已关闭，未启动任务'};
      if (chosen.candidate) await currentPageTarget.revalidate(chosen.candidate);
      else if (chosen.target.mode === 'borrowed' && version !== selectionVersion)
        throw {code:'E_DOCUMENT_STALE',message:'选定文档已变化，请重新选择'};
      const claim = await host.start({source:{kind:'draft',sourceUtf8},
        params, target:chosen.target, deadlineAt:Date.now() + 30000});
      admittedRunId = claim.runId;
      ownedDraftRunId = claim.runId;
      if (disposed) return;
      find('script-run-id').value = claim.runId;
      renderTask(claim);
      display('running', '已接受冻结草稿；等待脚本结束及持久结果',
        {runId:claim.runId,sourceKind:claim.sourceKind,sourceHash:claim.revision.sourceHash,
          runningTarget:claim.target.url || claim.target.allowedOrigin});
      update();
      const result = await host.completion;
      if (result.error) throw result.error;
    })().catch(error => {startError=error;admittedRunId ||= error.runId;fail(error);}).finally(async () => {
      running = false;
      if (disposed) return;
      if (admittedRunId) find('script-run-id').value = admittedRunId;
      // Observe all durable history; association comes from the admitted run,
      // never from an editable runId or the editor's current revision.
      try {await read('');}
      catch (error) {projection=undefined;display('unknown',`后台状态待确认：${error.code || 'E_EFFECT_UNKNOWN'}`);}
      if (startError) fail(startError);
      update();
    });
  }
  function previewPage(event) {
    if (!event.isTrusted || disposed || previewBusy || editingBusy || running || host.currentRun) return;
    let captured, permission, sourceUtf8, withJquery;
    const displayPreview=(state,message,result)=>{
      if(disposed)return;
      const node=find('page-preview-status');node.dataset.state=state;node.textContent=message;
      if(result!==undefined)find('page-preview-result').textContent=result;
    };
    try {
      // Freeze source, dependency and document during the trusted click,
      // before permission request or any asynchronous work.
      captured=currentPageTarget.capture();
      sourceUtf8=find('script-source').value;
      withJquery=find('page-preview-jquery').checked === true;
      if(!sourceUtf8.trim())throw {code:'E_SOURCE',message:'请输入 async function main()'};
      permission=api.permissions.request({origins:[permissionPattern(captured.url)]});
    } catch(error) {displayPreview('error',(error.code||'E_SOURCE')+'：'+(error.message||error));return;}
    previewBusy=true;update();displayPreview('running','正在核对当前文档并执行一次性页面脚本…');
    (async()=>{
      if(!await permission)throw {code:'E_PERMISSION',message:'用户拒绝网站授权'};
      if(disposed)throw {code:'E_HOST_CLOSED',message:'工作台已关闭'};
      await currentPageTarget.revalidate(captured);
      const result=await client.request('previewPageScript',{sourceUtf8,withJquery,
        target:{tabId:captured.tabId,frameId:0,documentId:captured.documentId,
          expectedUrl:captured.url,expectedWindowId:captured.windowId}});
      displayPreview('completed','当前精确文档试运行完成；不是正式 Task 结果，也不会安装自动执行。',
        result.resultText+' \n源码 SHA-256：'+result.sourceHash);
    })().catch(error=>displayPreview('error',(error.code||'E_PAGE_SCRIPT_EXECUTION')+'：'+(error.message||error)))
      .finally(()=>{previewBusy=false;update();});
  }
  const onNavigation = details => {
    if (String(details.tabId) === tab.value) clearDocuments();
  };
  const onRemoved = tabId => {if (String(tabId) === tab.value) {tab.value = ''; clearDocuments();}};
  const on = (id, event, operation) => listen(find(id), event, () => Promise.resolve().then(operation).catch(fail));
  const edit = operation => async () => {
    if (editingBusy || disposed) return;
    editingBusy = true; update();
    try {await operation();} finally {editingBusy = false; update();}
  };
  on('script-save','click',edit(save)); on('script-load','click',edit(load)); on('script-list-load','click',edit(loadLatestFromList));
  on('script-read','click',()=>read('')); on('script-delete','click',edit(remove)); on('script-list-refresh','click',()=>refreshScripts().catch(fail));
  on('script-read-run','click',()=>read());
  on('script-history-open','click',()=>read(find('script-history-run').value));
  on('script-download','click',downloadResult); on('script-download-result','change',update);
  on('script-refresh','click',refreshTabs); on('script-tab','change',refreshDocuments);
  on('script-target-mode','change',update); on('script-id','input',update); on('script-revision','input',update); on('script-source','input',update);
  listen(find('script-run'), 'click', start);
  listen(find('page-preview-run'), 'click', previewPage);
  on('script-stop','click',async () => {
    if (!ownedDraftRunId || host.currentRun !== ownedDraftRunId || stopping) return;
    stopping = true; update(); display('stopping','正在提交停止并等待持久收尾…');
    try {await host.stop({runId:ownedDraftRunId,controller:true});}
    finally {stopping = false; update();}
  });
  api.webNavigation.onCommitted.addListener(onNavigation); api.tabs.onRemoved.addListener(onRemoved);
  browserListenersAttached = true;
  const unsubscribeRun = host.subscribe(next => {
    if (disposed) return;
    if (currentTask?.runId === next.runId) renderTask({...currentTask,...next});
    update();
  });
  const unsubscribeCurrentPage = currentPageTarget?.subscribe(renderCurrentPage);
  currentPageTarget?.ready?.catch(fail);
  const recoverView = () => read('').catch(error=>{projection=undefined;update();fail(error);});
  const unsubscribeConnection = client.subscribeConnection?.(event=>{if(event.connected) recoverView();});
  client.ready.then(recoverView).catch(fail);
  refreshTabs().catch(fail); refreshScripts({silent: true}).catch(fail); update();
  return {host, resourceSnapshot: () => ({...host.resourceSnapshot(), editor:{
    timers:[...downloads.values(),...preparations.values()].filter(entry=>entry.timer != null).length,
    pending:Number(downloading)+preparations.size, subscriptions:listeners.length+2*Number(browserListenersAttached)+Number(Boolean(unsubscribeCurrentPage))}}), dispose() {
    if (disposed) return; disposed = true; unsubscribeConnection?.(); unsubscribeCurrentPage?.(); unsubscribeRun();
    api.webNavigation.onCommitted.removeListener(onNavigation); api.tabs.onRemoved.removeListener(onRemoved); host.dispose();
    browserListenersAttached = false;
    for (const {element, event, listener} of listeners) element.removeEventListener(event, listener);
    listeners.length = 0;
    for (const entry of downloads.values()) { clearTimeout(entry.timer); entry.timer = null; }
    for (const entry of preparations.values()) { clearTimeout(entry.timer); entry.timer = null; }
  }};
}
