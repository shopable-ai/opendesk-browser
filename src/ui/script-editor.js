import {createRunHost} from '../run-host.js';
import {permissionPattern} from '../environment.js';
import {base64ToBytes, decodeValue} from '../platform/page-port/codec.js';
import {hashArtifactBytes} from '../platform/downloads/blob-lifecycle.js';
import {BUDGETS, invariant} from '../platform/protocol.js';
import {createPageDependencyResolver, dependencyMessage} from './page-dependencies.js';
import {preparePageCandidateDraft} from './page-candidate-source.js';
import {parseUserScriptDependencies} from '../scripting/user-scripts/dependency-metadata.js';
import {createProgramSourceView,PROGRAM_DRAFT_INPUT_LIMIT} from './program-source.js';
import {createPageComponentRemote} from './page-component-remote.js';
import {inspectPageSource,validatePageSource,PAGE_BUNDLE_PREFIX} from '../scripting/user-scripts/page-bundle.js';
import {PAGE_PREVIEW_RECEIPT_FORMAT} from '../scripting/user-scripts/execution-source.js';
import {createBrowserPageComponentPreparer} from './page-component-preparer.js';
import {createLocalProjectView} from './local-project.js';
import {createLocalInstallUI} from './local-project-install-ui.js';
import {validateTaskParams} from '../platform/tasks/contract.js';
import {formatControllerRunResult, runValueKind} from './run-result-presentation.js';
import {formatTaskError} from './task-run-diagnostics.js';
import {inspectUserScriptsAccess, userScriptsSettingsURL} from './user-scripts-access.js';
import {createPageProgramLibrary} from './page-program-library.js';
import {requireChromePermissions} from '../platform/chrome/permission-gate.js';

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

export function createScriptEditor({client, currentPageTarget, development=false, api = globalThis.chrome, document: doc = globalThis.document,
  hostFactory = createRunHost,componentPreparerFactory=createBrowserPageComponentPreparer}) {
  const host = hostFactory({api, client, document: doc, templateModuleFactory: null});
  const find = id => doc.getElementById(id);
  const status = find('script-status'), output = find('script-result');
  const resultKind = find('script-result-kind'), copyResult = find('script-copy-result');
  const pageTechnicalPanel = find('page-preview-technical-panel'), pageTechnical = find('page-preview-technical');
  const scriptsRecovery = find('script-user-scripts-recovery');
  const scriptsRecoveryStatus = find('script-user-scripts-recovery-status');
  const scriptsSettings = find('script-user-scripts-settings');
  const scriptsCheck = find('script-user-scripts-check');
  const tab = find('script-tab'), frame = find('script-document'), mode = find('script-target-mode');
  const currentPageStatus = find('script-current-page-status'), currentPageHost = find('script-current-page-host'),
    currentPageDebug = find('script-current-page-debug'), runningTargetStatus = find('script-running-target');
  const revisions = new Map(), documents = new Map();
  const downloadable = new Map(), downloads = new Map(), preparations = new Map();
  const scriptList = find('script-list'), resultSelect = find('script-download-result'), downloadStatus = find('script-download-status');
  let downloading = false, projection, currentTask, editingBusy = false, stopping = false, previewBusy = false, snapshotSequence = 0;
  const componentSelector=find('page-component-framework'),componentStatus=find('page-component-status');
  const componentInputs=Object.freeze(Object.fromEntries(
    ['javascript','react','vue'].map(mode=>[mode,find('page-component-'+mode)])));
  const componentPresets=Object.freeze({
    react:"import {useState} from 'react';\n\nexport default function App(){\n  const [count,setCount]=useState(0);\n  return <button type=\"button\" onClick={()=>setCount(n=>n+1)}>已点击 {count} 次</button>;\n}",
    vue:"<script setup>\nimport {ref} from 'vue';\nconst count=ref(0);\n</script>\n<template>\n  <button type=\"button\" @click=\"count++\">已点击 {{ count }} 次</button>\n</template>\n<style scoped>\nbutton{padding:8px 14px;cursor:pointer}\n</style>"
  });
  let componentMode='javascript',browserManagedPreview=null,browserEffectUnknown=false;
  let componentRemote,browserPreparing=false,browserPrepareGeneration=0;
  let browserUnknownTarget=null;
  function quarantineBrowserEffect(target){
    // Effect-unknown is bound to the document where dispatch may have reached
    // USER_SCRIPT. No new Run or Stop can be inferred until a DIFFERENT actual
    // document becomes available; transient resolving/unavailable is not proof.
    browserEffectUnknown=true;
    browserUnknownTarget={tabId:target.tabId,documentId:target.documentId};
  }
  const syncComponentInputs=()=>{
    for(const [mode,node] of Object.entries(componentInputs))if(node)node.checked=mode===componentMode;
  };
  const componentDrafts={javascript:'',react:componentPresets.react,vue:componentPresets.vue};
  const browserPreparer=componentPreparerFactory({api});
  const browserBinding='browser-v1-'+crypto.randomUUID().replaceAll('-','').slice(0,24);
  function componentMessage(state,message){
    if(!componentStatus)return;
    componentStatus.hidden=componentMode==='javascript'&&!message;
    componentStatus.dataset.state=state;
    componentStatus.textContent=message||'';
  }
  const draftFields={source:'script-source',params:'script-params',id:'script-id',revision:'script-revision'};
  const captureDraft=()=>{
    const value=Object.fromEntries(Object.entries(draftFields).map(([key,id])=>[key,find(id).value]));
    value.source=programSource.source();
    value.componentMode=componentMode;
    value.componentDrafts={...componentDrafts,[componentMode]:value.source};
    const programDraft=programSource.snapshot();
    if(programDraft)value.programDraft=programDraft;
    return value;
  };
  let draftKey, draftSerial='', draftWrites=Promise.resolve();
  function persistDraft() {
    if(!draftKey)return;
    const value=captureDraft(),serial=JSON.stringify(value);
    if(serial===draftSerial)return;
    draftSerial=serial;
    draftWrites=draftWrites.then(()=>api.storage.session.set({[draftKey]:value}))
      .catch(error=>console.warn('Sidebar draft could not be retained',error));
  }
  let scriptListSequence = 0, ownedDraftRunId = null, ownedManagedPreview=null, lastPagePreview=null;
  let currentRevision, currentPageState = currentPageTarget?.snapshot ?? {status:'unavailable',reason:'E_TARGET',message:'当前网页服务不可用'},
    selectionVersion = 0, running = false, disposed = false;
  const listeners = [];
  let browserListenersAttached = false;
  let dependencyResolver;
  let localProject,localAdapter,localPollTimer,finishLocalPoll,localPageResult=null;
  const localInstaller=createLocalInstallUI({client,api,doc,currentPageTarget,getProject:()=>localProject,onState:()=>update()});
  const listen = (element, event, listener) => {
    element.addEventListener(event, listener); listeners.push({element, event, listener});
  };
  const programSource = createProgramSourceView({document:doc,listen,onChange:() => {dependencyResolver?.refresh();update();}});
  const initialDraft=JSON.stringify(captureDraft());
  function display(state, message) {
    if (disposed) return;
    // RunHost return values enter the result area only via an authorized Result
    // projection, never through transient claim/preview transport payloads.
    status.dataset.state = state; status.textContent = message;
    const taskStatus = find('script-task-status');
    taskStatus.hidden = state !== 'results' || !taskStatus.textContent;
  }
  function beginResult() {
    output.textContent = '正在运行…';
    resultKind.textContent = '等待返回值';
    copyResult.disabled = true;
    copyResult.textContent = '复制结果';
  }
  let scriptsCheckSequence = 0;
  if (scriptsRecovery) scriptsRecovery.hidden = true;
  function showUserScriptsRecovery(state = 'blocked', message = 'page.evaluate() 无法执行。请打开扩展设置，开启「允许用户脚本」后返回检测；不会自动重放任务。') {
    if (!scriptsRecovery || disposed) return;
    scriptsRecovery.hidden = false; scriptsRecovery.dataset.state = state;
    scriptsRecoveryStatus.textContent = message;
    scriptsSettings.hidden = state === 'available';
  }
  function hideUserScriptsRecovery() {
    scriptsCheckSequence++; // Fence a late read-only probe from an earlier run.
    if (scriptsRecovery) { scriptsRecovery.hidden = true; scriptsRecovery.dataset.state = 'idle'; }
  }
  const fail = error => {
    const help = formatTaskError(error);
    display('error', help);
    if (running) {
      // Failed admission/preview is not a still-running script return value.
      output.textContent='本次执行失败，未产生可显示的返回值';
      resultKind.textContent='执行失败';
      copyResult.disabled=true;
    }
    if (error?.code === 'E_USER_SCRIPTS_UNAVAILABLE') showUserScriptsRecovery();
    if (error?.code === 'E_PAGE_CONTENT_TOO_LARGE' ||
        error?.code === 'E_VALUE_SERIALIZATION') output.textContent = help;
  };
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
    const dirty = programSource.source() !== currentRevision.sourceUtf8;
    node.dataset.dirty = String(dirty);
    node.textContent = dirty
      ? `已保存 r${currentRevision.revision} · 存在未保存修改 · 运行草稿不会覆盖已保存版本`
      : `已保存 r${currentRevision.revision} · 可运行草稿；不自动创建新 revision`;
  }
  function otherTabOwnsBrowserUI(){
    return !!browserManagedPreview&&currentPageState?.status==='available'&&
      (browserManagedPreview.target.tabId!==currentPageState.tabId||
       browserManagedPreview.target.documentId!==currentPageState.documentId);
  }
  function canStopManaged(){
    if(browserManagedPreview&&!browserEffectUnknown&&!localProject?.active()&&!running&&!stopping&&!previewBusy&&!host.currentRun&&
      currentPageState?.status==='available'&&currentPageState.documentId===browserManagedPreview.target.documentId&&
      currentPageState.tabId===browserManagedPreview.target.tabId)return true;
    if(!ownedManagedPreview||!localProject?.active()||running||previewBusy||host.currentRun||!projection?.slotAvailable)return false;
    return localProject.selectedBindingId()===ownedManagedPreview.bindingId&&currentPageState?.status==='available'&&currentPageState.documentId===ownedManagedPreview.target.documentId&&currentPageState.tabId===ownedManagedPreview.target.tabId;
  }
  function localPageResultIsCurrent() {
    return !!localPageResult&&!!localProject?.active()&&!!localProject.connected()&&
      localPageResult.bindingId===localProject.selectedBindingId()&&
      localPageResult.providerEpoch===localProject.providerEpoch()&&
      currentPageState?.status==='available'&&
      localPageResult.tabId===currentPageState.tabId&&
      localPageResult.documentId===currentPageState.documentId&&
      localPageResult.url===currentPageState.url;
  }
  function update() {
    if (disposed) return;
    componentRemote?.update();
    localInstaller.update();
    if(localPageResult&&!localPageResultIsCurrent()){
      localPageResult=null;
      output.textContent='上次本地 Page 结果对应的项目、连接或网页已变化；请重新运行。';
      resultKind.textContent='上次结果已失效';copyResult.disabled=true;
      display('unknown','上次本地 Page 结果已失效，不能用于验证或安装当前源码');
    }
    persistDraft();
    renderRevisionState();
    // Describe the selected official source format instead of telling React /
    // Vue authors to write the legacy async function main() entry.
    const previewTitle=find('page-preview-mode-title');
    const previewHint=find('page-preview-mode-hint');
    const modeHint=find('page-component-hint');
    if(previewTitle)previewTitle.textContent=componentMode==='javascript'?
      '网页 JavaScript 试运行':componentMode==='react'?'网页 React JSX 组件试运行':'网页 Vue SFC 组件试运行';
    if(previewHint)previewHint.textContent=componentMode==='react'?
      '使用官方 React import、App JSX 和默认导出组件。系统按需编译并受管挂载；无需 main() 或手动 Vite。仅获授权网页可运行。':
      componentMode==='vue'?
        '使用官方 Vue script setup、template 与 scoped CSS。系统按需编译并受管挂载；无需 main() 或手动 Vite。仅获授权网页可运行。':
        '直接使用上方 JavaScript 源码操作当前网页 DOM；可写 async function main() 返回结果，也可直接编写顶层语句。运行前仍需网站授权。';
    if(modeHint)modeHint.textContent=componentMode==='javascript'?
      '保存草稿不会运行网页':
      '组件草稿保留在当前窗口会话；只有明确点击运行才操作网页，安装须另外授权。';
    find('script-save').disabled = editingBusy||isComponentDraft()&&!canPrepareComponentCandidate(); find('script-load').disabled = editingBusy;
    find('script-list-refresh').disabled = editingBusy; find('script-list-load').disabled = editingBusy || !scriptList.value;
    find('script-delete').disabled = editingBusy || !revisions.has(scriptId());
    find('script-run').disabled = stopping || editingBusy || previewBusy || running || !projection?.slotAvailable || !!host.currentRun ||
      (componentMode!=='javascript'||!programSource.source().trim()) || programSource.kind() === 'page-userscript' || mode.value === 'current' && currentPageState?.status !== 'available';
    find('script-stop').disabled = stopping || !browserPreparing&&!componentRemote?.busy&&!canStopManaged()&&(!ownedDraftRunId || host.currentRun !== ownedDraftRunId);
    find('script-stop').textContent=browserPreparing||componentRemote?.busy?'取消准备':canStopManaged()?'停止受管 UI':'停止';
    if(componentSelector)componentSelector.disabled=!!localProject?.active()||editingBusy||previewBusy||running||stopping||componentRemote?.busy||!!programSource.snapshot();
    if(componentStatus)componentStatus.hidden=componentMode==='javascript'&&!componentStatus.textContent;
    find('page-preview-run').disabled = stopping||browserEffectUnknown||browserManagedPreview?.recoveredOnly||otherTabOwnsBrowserUI()||previewBusy||componentRemote?.busy ||
      (componentMode==='javascript'&&dependencyResolver?.busy)||editingBusy||running||!!host.currentRun||
      !programSource.source().trim()||programSource.kind()==='controller'||
      currentPageState?.status!=='available';
    find('page-preview-run').textContent=componentMode==='javascript'?'在当前网页试运行':'运行'+(componentMode==='react'?' React':' Vue')+' 组件';
    const pageCandidateButton=find('page-candidate-save');
    if(pageCandidateButton)pageCandidateButton.disabled=!canSavePagePreview()&&!canPrepareComponentCandidate();
    find('script-owned-url').disabled = mode.value !== 'owned';
    tab.disabled = mode.value !== 'borrowed'; frame.disabled = mode.value !== 'borrowed' || !documents.size;
    find('script-download').disabled = downloading || !downloadable.has(resultSelect.value);
    if(localProject?.active()){
      for(const id of ['script-load','script-list-load','script-delete','page-preview-run','task-create-candidate'])if(find(id))find(id).disabled=true;
      find('script-save').disabled=editingBusy||running||stopping||previewBusy||!localInstaller.canSave();
      find('script-save').textContent=localInstaller.saveLabel();
      find('script-run').textContent='运行本地项目';
      find('script-run').disabled=stopping||editingBusy||previewBusy||running||!projection?.slotAvailable||!!host.currentRun||!localProject.connected()||currentPageState?.status!=='available';
      find('script-version').textContent='本地项目模式 · 手工草稿已保留；正式任务请使用打包安装流程';
    }else {find('script-run').textContent='运行草稿';find('script-save').textContent=isComponentDraft()?'准备并保存网页脚本':'保存版本';}
    find('script-library-tools').hidden=!!localProject?.active();
    find('page-preview-tools').hidden=!!localProject?.active();
  }
  function renderCurrentPage(next) {
    if (disposed) return;
    if(next?.status==='available'&&Number.isSafeInteger(next.tabId)&&
       typeof next.documentId==='string'&&next.documentId){
      if(browserManagedPreview&&browserManagedPreview.target.tabId===next.tabId&&
         browserManagedPreview.target.documentId!==next.documentId)
        browserManagedPreview=null; // The owning tab actually navigated; do not mistake a tab switch for cleanup.
      if(browserEffectUnknown&&browserUnknownTarget&&
         browserUnknownTarget.tabId===next.tabId&&
         browserUnknownTarget.documentId!==next.documentId){
        browserEffectUnknown=false;
        browserUnknownTarget=null;
        componentMessage('idle','已确认原标签页的新网页文档；未知结果不会重试，需重新明确点击运行');
      }
      if(browserManagedPreview&&browserManagedPreview.target.tabId!==next.tabId)
        componentMessage('idle','受管组件仍在另一标签页。请返回原网页停止后再切换运行目标。');
    }
    currentPageState = next;
    find('script-current-page-title').textContent = next?.status === 'available' ? next.title || next.url :
      next?.status === 'resolving' ? '正在识别…' : next?.message || '尚未识别可运行网页';
    find('script-current-page-url').textContent = next?.status === 'available' ? next.url : '';
    if (next?.status === 'available') {
      currentPageHost.textContent = new URL(next.url).host;
      currentPageHost.title = next.url;
      currentPageStatus.dataset.state = 'available';
      currentPageStatus.textContent = '可运行';
      currentPageStatus.title = '已识别可运行网页；执行时仍需检查网站授权及文档身份';
      currentPageDebug.textContent = JSON.stringify({windowId:next.windowId,tabId:next.tabId,frameId:next.frameId,
        documentId:next.documentId,url:next.url,origin:next.origin}, null, 2);
    } else if (next?.status === 'resolving') {
      currentPageHost.textContent = '正在识别…'; currentPageHost.title = '';
      currentPageStatus.dataset.state = 'resolving'; currentPageStatus.textContent = '检查中';
      currentPageStatus.title = '';
      currentPageDebug.textContent = next.windowId == null ? '' : JSON.stringify({windowId:next.windowId}, null, 2);
    } else {
      currentPageHost.textContent = '未识别'; currentPageHost.title = '';
      currentPageStatus.dataset.state = 'unavailable';
      currentPageStatus.textContent = '不可运行';
      currentPageStatus.title = next?.message || '未找到活动 HTTP(S) 主文档';
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
    if (selectedTab.incognito) throw {code:'E_PERMISSION',message:'不支持隐身网页'};
    for (const row of frames || []) {
      if (!row.documentId || row.errorOccurred || !/^https?:\/\//.test(row.url || '') ||
        row.documentLifecycle && row.documentLifecycle !== 'active') continue;
      documents.set(row.documentId, {mode:'borrowed',tabId,frameId:row.frameId,documentId:row.documentId,url:row.url});
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
    const id = scriptId(), source = programSource.source();
    const row = await host.controller.commitControllerScript({scriptId:id,expectedRevision:revisions.get(id) || 0,
      sourceUtf8:source});
    if (disposed) return;
    if (scriptId() === id) remember(row);
    await refreshScripts({silent: true});
    display('saved', `${id} · r${row.revision} 已持久保存；${host.currentRun ? '当前任务继续使用启动时的版本' : '保存不会运行脚本'}`);
  }
  async function load() {
    const id = scriptId(), revisionText = find('script-revision').value.trim(), source = programSource.source();
    const row = await host.controller.getControllerScript({scriptId:id,
      ...(revisionText ? {revision:Number(revisionText)} : {})});
    if (disposed) return;
    if (scriptId() !== id || find('script-revision').value.trim() !== revisionText || programSource.source() !== source)
      throw {code:'E_REVISION',message:'加载期间编辑内容已变化，请重新加载'};
    programSource.replaceSource(row.sourceUtf8); remember(row, {head: !revisionText || revisions.get(id) === row.revision});
    dependencyResolver.refresh();
    display('loaded', `已加载持久版本 r${row.revision}`);
  }
  async function loadLatestFromList() {
    const id = scriptList.value, activeId = scriptId(), revisionText = find('script-revision').value.trim(), source = programSource.source();
    if (!id) throw {code:'E_REVISION',message:'请选择已保存脚本'};
    const selectedHead = revisions.get(id);
    const row = await host.controller.getControllerScript({scriptId:id});
    if (disposed) return;
    if (scriptList.value !== id || scriptId() !== activeId || find('script-revision').value.trim() !== revisionText || programSource.source() !== source)
      throw {code:'E_REVISION',message:'加载期间编辑内容已变化，请重新加载'};
    find('script-id').value = id; programSource.replaceSource(row.sourceUtf8);
    dependencyResolver.refresh();
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
    // Controller history must not overwrite the current local Page result.
    if(localPageResultIsCurrent()){update();return;}
    const previous = resultSelect.value;
    downloadable.clear(); resultSelect.replaceChildren(new Option('请选择要下载的结果', ''));
    // Defense in depth: even a malformed/stale host projection cannot put a
    // revoked result in the visible text, history payload or download selector.
    const deniedRuns = new Set(snapshot.resultDeliveryDenied || []);
    const values = snapshot.results.filter(row => !deniedRuns.has(row.runId)).map(row => {
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
    display('results', focused ? '任务状态：' : '已读取持久结果');
    // The result is the decoded value, not runId/revision/sourceHash/transport metadata.
    // Authorized technical history stays available in the existing collapsed panel.
    output.textContent = formatControllerRunResult(values, focused?.runId, snapshot.resultDeliveryDenied);
    const currentValues = values.filter(row => row.runId === focused?.runId);
    const visibleResult = currentValues[0];
    resultKind.textContent = !visibleResult ? '暂无返回值' : currentValues.length > 1
      ? `共 ${currentValues.length} 项结果` : Object.hasOwn(visibleResult,'value')
        ? runValueKind(visibleResult.value) : '执行错误';
    copyResult.disabled = !visibleResult || deniedRuns.has(focused?.runId);
    copyResult.textContent = '复制结果';
    if (visibleResult?.error?.code === 'E_USER_SCRIPTS_UNAVAILABLE') {
      if (scriptsRecovery?.dataset.state !== 'available') showUserScriptsRecovery();
    } else if (visibleResult) hideUserScriptsRecovery();
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
    if (!event.isTrusted || disposed || stopping || running || previewBusy || editingBusy || host.currentRun) return;
    if(localProject?.active()){startLocal(event);return;}
    let chosen, params, permission, sourceUtf8;
    try {
      // Freeze exact editor bytes, params and target inside the trusted click
      // before any asynchronous permission check or other work.
      chosen = selection(); params = JSON.parse(find('script-params').value);
      sourceUtf8 = programSource.source();
      if (programSource.kind() === 'page-userscript') throw {code:'E_PROGRAM_KIND',message:'这是网页 JavaScript 项目，请使用“在当前网页试运行”'};
      if (!sourceUtf8.trim()) throw {code:'E_SCHEMA',message:'请先输入草稿源码'};
      if (parseUserScriptDependencies(sourceUtf8).hasHeader) throw {code:'E_PROGRAM_KIND',
        message:'当前源码含兼容性脚本声明，请使用“网页 JavaScript 试运行”；自动化任务运行不解析旧格式声明。'};
      permission = requireChromePermissions({api,request:{origins:[permissionPattern(chosen.url)],
        ...(find('script-allow-cookies').checked ? {permissions:['cookies']} : {})}});
    } catch (error) { fail(error); return; }
    hideUserScriptsRecovery();
    const version = selectionVersion;
    let startError, admittedRunId;
    ownedDraftRunId = null; running = true; renderTask(null); update(); beginResult(); display('checking',`正在检查访问权限并验证网页：${chosen.url}`);
    (async () => {
      await permission;
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
  function startLocal(event){
    if(!event.isTrusted||!localAdapter)return;
    let captured,binding,paramsText,permission;
    try{
      captured=currentPageTarget.capture();binding=localProject.capture();paramsText=find('local-project-params').value;
      permission=requireChromePermissions({api,request:{origins:[permissionPattern(captured.url)],...(find('script-allow-cookies').checked?{permissions:['cookies']}:{})}});
    }catch(error){fail(error);return;}
    hideUserScriptsRecovery();
    let admittedRunId,page=false,startError;
    ownedDraftRunId=null;localPageResult=null;localInstaller.reset();running=true;renderTask(null);update();beginResult();
    find('developer-results-panel').open=true;display('resolving','正在读取本地项目的当前源码…');
    (async()=>{
      await permission;
      if(disposed)throw {code:'E_HOST_CLOSED',message:'Sidebar 已关闭，本次未运行'};
      const source=await localProject.resolve(binding);
      await currentPageTarget.revalidate(captured);await localProject.assertReady(binding);localProject.assertCaptured(binding);
      page=source.runtimeKind==='page-userscript';
      const params=page?{}:JSON.parse(paramsText);
      if((!page||source.siteOrigins?.length)&&!source.siteOrigins?.includes(captured.origin))throw {code:'E_DEV_ORIGIN',message:'当前网站不在本地项目的允许范围内'};
      if(!page&&source.paramsSchema)validateTaskParams(source.paramsSchema,params);
      const {status:ignored,...target}=captured;
      const claim=await localAdapter.handle({method:page?'page.preview':'run.start',requestId:crypto.randomUUID(),params:{
        sourceHash:source.sourceHash,sourceBytes:source.sourceBytes,target,
          ...(page?{sourceUtf8:source.sourceUtf8,entryFormat:source.entryFormat,bindingId:source.bindingId,...(source.managedUI?{managedUI:true}:{}),...(source.pageRules?{pageRules:source.pageRules}:{})}:
          {source:{kind:'draft',sourceUtf8:source.sourceUtf8},params,deadlineMs:30000})}});
      if(page){
        find('script-task-id').textContent='previewId：'+claim.previewId;
        find('script-task-version').textContent='Page USER_SCRIPT · SHA-256 '+source.sourceHash;
        let result=claim;
        while(!disposed&&result.state==='preview-pending'){
          await new Promise(resolve=>{finishLocalPoll=resolve;localPollTimer=setTimeout(resolve,200);});localPollTimer=null;finishLocalPoll=null;
          if(disposed)return;result=await localAdapter.handle({method:'page.get',params:{previewId:claim.previewId}});
        }
        if(source.managedUI&&(!result.error||result.error.code==='E_PAGE_SCRIPT_EXECUTION'&&result.error.outcome==='FAILED_CONFIRMED'))ownedManagedPreview={previewId:claim.previewId,bindingId:source.bindingId,target,sourceHash:source.sourceHash};
        else if(!source.managedUI||result.error?.outcome==='OUTCOME_UNKNOWN')ownedManagedPreview=null;
        if(result.error)throw result.error;
        if(result.state!=='preview-evaluated'||result.sourceHash!==source.sourceHash||
          result.target?.documentId!==captured.documentId||result.target?.tabId!==captured.tabId||
          result.target?.url!==captured.url)
          throw {code:'E_DEV_HASH',message:'Page 预览回执与冻结源码或目标网页身份不符'};
        await currentPageTarget.revalidate(captured);localProject.assertCaptured(binding);
        localPageResult={bindingId:binding.bindingId,providerEpoch:binding.providerEpoch,
          tabId:captured.tabId,documentId:captured.documentId,url:captured.url,sourceHash:source.sourceHash};
        localInstaller.succeeded({source,binding,target:captured});
        display('completed',source.managedUI?'本地 Page 预览已完成；再次运行会先清理旧受管 UI。':'本地 Page 预览已完成；网页 UI 由项目管理。');
        const valueText=result.result?.resultText ?? 'undefined';
        find('page-preview-result').textContent=valueText;
        output.textContent=valueText;resultKind.textContent='本地 Page · 本次结果';
        copyResult.disabled=false;find('developer-results-panel').open=true;
        pageTechnicalPanel.hidden=false;pageTechnicalPanel.open=false;
        pageTechnical.textContent='源码 SHA-256：'+source.sourceHash;
      }else{
        admittedRunId=ownedDraftRunId=claim.runId;
        if(disposed)return;
        find('script-run-id').value=claim.runId;renderTask(claim);
        display('running','已运行本地源码快照；修改文件只影响下一次运行',{...claim,inputHash:source.inputHash});update();
        const result=await host.completion;
        if(result.error)throw result.error;
        if(result.pendingSettlement||result.state==='paused_unknown')throw {code:'E_EFFECT_UNKNOWN',message:'任务完成状态仍不明确'};
        // Only the original durable run/result projection can justify Task publication.
        const observed=await host.controller.snapshotControllerRun({runId:claim.runId});
        const durable=(observed.runs||[]).find(row=>row.runId===claim.runId)||observed.run;
        const returned=(observed.results||[]).find(row=>row.runId===claim.runId&&
          row.resultId===durable?.resultId&&row.revision?.sourceHash===source.sourceHash&&
          row.state==='completed'&&row.outcome?.ok===true);
        if(durable?.state==='completed'&&durable.retirementState==='released'&&
           durable.revision?.sourceHash===source.sourceHash&&returned)
          localInstaller.succeeded({source,binding,target:captured,runId:claim.runId});
      }
    })().catch(error=>{
      startError=error;admittedRunId||=error.runId;localPageResult=null;localInstaller.reset();fail(error);
      if(page||!admittedRunId){
        output.textContent=formatTaskError(error);
        resultKind.textContent=page?'本地 Page · 执行失败':'本地项目 · 未启动';
        copyResult.disabled=true;find('developer-results-panel').open=true;
      }
    }).finally(async()=>{
      running=false;if(disposed)return;
      if(admittedRunId)find('script-run-id').value=admittedRunId;
      try{if(page)projection=await host.controller.snapshotControllerRun({});else await read('');}catch{projection=undefined;}
      if(startError)fail(startError);update();
    });
  }
  function previewMatchesEditor(previous){
    return !!previous&&programSource.source()===(previous.authoringSourceUtf8??previous.sourceUtf8)&&
      (previous.componentMode===undefined||componentMode===previous.componentMode);
  }
  function isComponentDraft(){return componentMode!=='javascript'||programSource.snapshot()?.project.entryMode==='component';}
  function canPrepareComponentCandidate(){
    return isComponentDraft()&&!editingBusy&&!previewBusy&&!componentRemote?.busy&&!localProject?.active()&&
      !running&&!stopping&&!host.currentRun&&currentPageState?.status==='available'&&!!programSource.source().trim();
  }
  function canSavePagePreview(){
    return !editingBusy&&!previewBusy&&!componentRemote?.busy&&!localProject?.active()&&previewMatchesEditor(lastPagePreview)&&
      currentPageState?.status==='available'&&currentPageState.documentId===lastPagePreview.documentId&&
      currentPageState.tabId===lastPagePreview.tabId&&currentPageState.url===lastPagePreview.previewUrl;
  }
  function previewPage(event) {
    if (!event.isTrusted || disposed || previewBusy || componentRemote?.busy || (componentMode==='javascript'&&dependencyResolver?.busy) ||
      editingBusy || running || host.currentRun) return;
    if(localProject?.active())return;
    let captured, permission, pageSource,componentSnapshot,frozenComponent,prepareTicket;
    const displayPreview=(state,message,result)=>{
      if(disposed)return;
      const node=find('page-preview-status');node.dataset.state=state;node.textContent=message;
      if(result!==undefined)find('page-preview-result').textContent=result;
    };
    try {
      captured=currentPageTarget.capture();
      if (programSource.kind() === 'controller') throw {code:'E_PROGRAM_KIND',message:'这是 Controller 项目，请使用运行草稿'};
      const artifact=programSource.snapshot();
      if(componentMode!=='javascript'&&!artifact){
        componentSnapshot={framework:componentMode,source:programSource.source()};
        if(!componentSnapshot.source.trim())throw {code:'E_SOURCE',message:'请输入组件源码'};
      }else{
        pageSource=dependencyResolver.capture();
        if(!pageSource.sourceUtf8.trim())throw {code:'E_SOURCE',message:'请输入 JavaScript 源码'};
        if(artifact?.project.entryMode==='component'){
          const framework=/^\/\/ @opendesk-lib (react|vue)\s*$/m.exec(pageSource.sourceUtf8)?.[1];
          if(!framework)throw {code:'E_PROGRAM_DRAFT',message:'固定组件缺少唯一框架身份'};
          frozenComponent={framework,source:pageSource.sourceUtf8,sourceHash:artifact.build.sourceHash,projectId:artifact.project.id};
        }
      }
      if((componentSnapshot||frozenComponent)&&(browserEffectUnknown||browserManagedPreview?.recoveredOnly))
        throw {code:'E_EFFECT_UNKNOWN',message:'上次受管运行仍需清理；已查询到的原回执只用于停止，不会自动重新运行'};
      permission=requireChromePermissions({api,request:{origins:[permissionPattern(captured.url)]}});
    } catch(error) {displayPreview('error',(error.code||'E_SOURCE')+'：'+(error.message||error));return;}
    const managedInput=componentSnapshot||frozenComponent;
    if(managedInput){prepareTicket=++browserPrepareGeneration;browserPreparing=true;}
    const assertPreparation=()=>{
      if(disposed||prepareTicket!==browserPrepareGeneration)
        throw {code:'E_PAGE_COMPILER_STALE',message:'组件准备已取消；迟到结果不会运行'};
      if(programSource.source()!==managedInput.source||componentSnapshot&&componentMode!==componentSnapshot.framework)
        throw {code:'E_PAGE_COMPILER_STALE',message:'组件源码或框架已变化；旧结果不会运行'};
    };
    lastPagePreview=null;previewBusy=true;update();pageTechnicalPanel.hidden=true;pageTechnical.textContent='';
    displayPreview('running','正在核对当前文档与固定源码…','');
    (async()=>{
      await permission;
      if(disposed)throw {code:'E_HOST_CLOSED',message:'工作台已关闭'};
      if(managedInput)assertPreparation();
      await currentPageTarget.revalidate(captured);
      if(managedInput){
        assertPreparation();
        const built=await prepareManagedSource(managedInput,captured,assertPreparation,{frozen:!!frozenComponent,entryFormat:pageSource?.entryFormat});
        await currentPageTarget.revalidate(captured);assertPreparation();
        const previewId=crypto.randomUUID(),managedUI={previewId,bindingId:browserBinding,enabled:true};
        const identity={previewId,bindingId:browserBinding,target:captured,sourceHash:built.sourceHash,framework:managedInput.framework};
        browserPreparing=false;update(); // No further compile cancellation can undo a dispatched native effect.
        let result;
        try{
          result=await client.request('previewPageScript',{
            sourceUtf8:built.sourceUtf8,entryFormat:built.entryFormat,lockId:pageSource?.lockId??null,
            managedUI,target:{tabId:captured.tabId,frameId:0,documentId:captured.documentId,
              expectedUrl:captured.url,expectedWindowId:captured.windowId}});
          if(!result||result.state!=='preview-evaluated'||result.sourceHash!==built.sourceHash||
             result.tabId!==captured.tabId||result.documentId!==captured.documentId||result.managedUI!==true||result.managedPreviewId!==previewId){
            quarantineBrowserEffect(captured);
            throw {code:'E_PAGE_COMPILER_RECEIPT',message:'页面回执与固定源码身份不一致；正在核查原执行记录'};
          }
        }catch(error){
          const response=error?.response;
          if(response?.managedUI===true){
            if(response.managedPreviewId===previewId&&response.sourceHash===built.sourceHash&&
               response.tabId===captured.tabId&&response.documentId===captured.documentId)browserManagedPreview=identity;
            else quarantineBrowserEffect(captured);
          }
          if(error.code==='E_EFFECT_UNKNOWN'||error.code==='E_PAGE_COMPILER_RECEIPT'){
            quarantineBrowserEffect(captured);
            // Query the original record ONCE. This is never an execution retry.
            try{
              const observed=await client.request('queryPagePreview',{previewId,sourceHash:built.sourceHash,tabId:captured.tabId,documentId:captured.documentId});
              if(observed?.queryOnly===true&&observed.originalDocumentOnly===true&&
                ['preview-evaluated','preview-failed'].includes(observed.state)&&observed.managedUI===true&&
                observed.managedPreviewId===previewId&&observed.sourceHash===built.sourceHash&&observed.tabId===captured.tabId&&
                observed.documentId===captured.documentId&&observed.world==='USER_SCRIPT'&&
                observed.completion?.format===PAGE_PREVIEW_RECEIPT_FORMAT&&typeof observed.completion.ok==='boolean'&&
                typeof observed.receiptNonce==='string'&&observed.completion.nonce===observed.receiptNonce){
                browserManagedPreview={...identity,recoveredOnly:true};browserEffectUnknown=false;browserUnknownTarget=null;
                error.previewRecovered=true;
                pageTechnicalPanel.hidden=false;pageTechnical.textContent=JSON.stringify({originalPreview:observed},null,2);
              }
            }catch{} // No original completion remains unknown; never dispatch again.
          }
          throw error;
        }
        browserManagedPreview=identity;
        await currentPageTarget.revalidate(captured);
        lastPagePreview={sourceUtf8:built.sourceUtf8,entryFormat:built.entryFormat,lockId:pageSource?.lockId??null,
          importSourceUrl:pageSource?.importSourceUrl??null,authoringSourceUtf8:managedInput.source,componentMode,
          previewUrl:captured.url,documentId:captured.documentId,tabId:captured.tabId,target:captured,
          sourceHash:built.sourceHash,previewId};
        const editorChanged=!previewMatchesEditor(lastPagePreview);
        componentMessage('completed',editorChanged?'旧源码已运行，但编辑内容已变化；先停止旧组件，再运行最新源码':
          '组件已运行 · 可停止或保存固定版本 · 保存不会自动运行或安装');
        displayPreview('completed','组件已在当前网页运行；停止可清理受管 UI。可保存固定版本并单独审阅安装。',result.resultText ?? 'undefined');
        pageTechnicalPanel.hidden=false;pageTechnicalPanel.open=false;
        pageTechnical.textContent=JSON.stringify({...result,authoring:{framework:built.framework,compilerVersion:built.compilerVersion,
          sourceHash:built.sourceHash,cacheHit:built.cacheHit,prepareMs:built.prepareMs,remoteModules:built.remoteModules||[]}},null,2);
        return;
      }
      const result=await client.request('previewPageScript',{...pageSource,
        target:{tabId:captured.tabId,frameId:0,documentId:captured.documentId,expectedUrl:captured.url,expectedWindowId:captured.windowId}});
      lastPagePreview={sourceUtf8:pageSource.sourceUtf8,entryFormat:pageSource.entryFormat,lockId:pageSource.lockId,
        importSourceUrl:pageSource.importSourceUrl??null,previewUrl:captured.url,documentId:captured.documentId,
        tabId:captured.tabId,target:captured,sourceHash:result.sourceHash};
      displayPreview('completed','当前精确文档试运行完成；不是正式 Task 结果。可保存待验证 Page 候选；不会自动安装。',result.resultText ?? 'undefined');
      pageTechnicalPanel.hidden=false;pageTechnicalPanel.open=false;pageTechnical.textContent=JSON.stringify(result,null,2);
    })().catch(error=>{
      const recovered=error.previewRecovered?'；已读取原完成回执，可以停止原组件。未重放运行。':'';
      displayPreview('error',(error.code||'E_PAGE_SCRIPT_EXECUTION')+'：'+(error.message||error)+recovered,'');
      if(managedInput)componentMessage('error',(error.code||'E_PAGE_COMPILER')+'：'+(error.message||error)+recovered);
      if(error.response?.state==='preview-failed'){
        pageTechnicalPanel.hidden=false;pageTechnicalPanel.open=false;pageTechnical.textContent=JSON.stringify(error.response,null,2);
      }
    }).finally(()=>{browserPreparing=false;previewBusy=false;update();});
  }
  async function prepareManagedSource(input,captured,check,{frozen=false,entryFormat='async-main'}={}){
    if(frozen){
      // Frozen JSON executes its verified program.js; source snapshots remain data.
      await validatePageSource(input.source,{plainLimit:100000});check();
      return {sourceUtf8:input.source,sourceHash:input.sourceHash,entryFormat,framework:input.framework,
        projectId:input.projectId,compilerVersion:'frozen-json',cacheHit:true,prepareMs:0};
    }
    const compilerInput={componentSource:input.source,framework:input.framework};
    const remoteSnapshot=await componentRemote.loadForRun(compilerInput);check();
    const url=new URL(captured.url),projectId='browser-'+input.framework;
    const pageRules={matches:[url.origin+url.pathname+'*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
    const built=await browserPreparer.prepare({...compilerInput,projectId,pageRules,remoteSnapshot});check();return built;
  }
  async function savePreparedComponent(){
    if(!canPrepareComponentCandidate()||disposed)return;
    const captured=currentPageTarget.capture(),artifact=programSource.snapshot(),source=programSource.source();
    const frozen=artifact?.project.entryMode==='component';
    const framework=frozen?/^\/\/ @opendesk-lib (react|vue)\s*$/m.exec(source)?.[1]:componentMode;
    if(!framework)throw {code:'E_PROGRAM_DRAFT',message:'固定组件缺少框架身份'};
    const identity={source,framework,...(frozen?{sourceHash:artifact.build.sourceHash,projectId:artifact.project.id}:{})};
    const mode=componentMode,ticket=++browserPrepareGeneration;
    const check=()=>{
      if(disposed||ticket!==browserPrepareGeneration||programSource.source()!==source||componentMode!==mode)
        throw {code:'E_PAGE_COMPILER_STALE',message:'准备已取消或源码已变化；旧结果不会保存或运行'};
    };
    lastPagePreview=null;editingBusy=true;browserPreparing=true;update();
    componentMessage('preparing','正在离线准备固定 Candidate；此操作不会运行或安装网页脚本');
    try{
      const built=await prepareManagedSource(identity,captured,check,{frozen});
      await currentPageTarget.revalidate(captured);check();
      lastPagePreview={sourceUtf8:built.sourceUtf8,entryFormat:built.entryFormat,lockId:null,importSourceUrl:null,
        authoringSourceUtf8:source,componentMode:mode,previewUrl:captured.url,documentId:captured.documentId,
        tabId:captured.tabId,target:captured,sourceHash:built.sourceHash,preparedOnly:true};
      componentMessage('prepared','组件已准备；保存只创建 Candidate，尚未进行网页运行验收');
    }finally{editingBusy=false;browserPreparing=false;update();}
    await savePageCandidate();
  }
  async function savePageCandidate() {
    if(editingBusy||disposed||previewBusy||!lastPagePreview||localProject?.active())return;
    const previous=lastPagePreview,revisionText=find('script-revision').value.trim();
    const programId=scriptId(),revision=revisionText?Number(revisionText):1;
    if(!previewMatchesEditor(previous))
      throw {code:'E_REVISION',message:'源码已经修改，请重新试运行后保存'};
    const prepared=preparePageCandidateDraft({...previous,programId,revision});
    editingBusy=true;update();
    try {
      await currentPageTarget.revalidate(previous.target);
      const saved=await client.request('importPageCandidate',prepared.request);
      if(saved?.stage!=='Candidate'||typeof saved.candidateId!=='string'||typeof saved.manifestHash!=='string')
        throw {code:'E_PAGE_CANDIDATE',message:'未收到可信的固定候选身份'};
      const changed=!previewMatchesEditor(previous)||scriptId()!==programId||
        find('script-revision').value.trim()!==revisionText;
      const status=find('page-candidate-status');
      status.dataset.state='saved';
      status.textContent=`已保存 Page Candidate：${programId} · r${revision} · ${saved.manifestHash.slice(0,12)}…。`+
        ' '+prepared.summary+
        (changed?' 保存期间编辑器已变化，请重新核对当前版本。':'')+
        ' 请在已保存网页脚本中验证冻结版本，再明确安装。';
      await pageLibrary.refresh(programId+':'+revision);
    }finally{editingBusy=false;update();}
  }
  dependencyResolver=createPageDependencyResolver({client,getSource:()=>programSource.source(),onState:update});
  componentRemote=createPageComponentRemote({client,preparer:browserPreparer,api,document:doc,
    getInput:()=>({componentSource:programSource.source(),framework:localProject?.active()||programSource.snapshot()?'javascript':componentMode}),
    isBlocked:()=>editingBusy||previewBusy||running||stopping||!!host.currentRun,onState:update});
  const pageLibrary=createPageProgramLibrary({client,currentPageTarget,api,document:doc,onLoad:async row=>{
    if(editingBusy||localProject?.active())throw {code:'E_BUSY',message:'请先结束当前编辑操作并切换为手工草稿'};
    const source=programSource.source(),activeId=scriptId(),revisionText=find('script-revision').value;
    const saved=await client.request('getPageCandidate',{programId:row.programId,revision:row.revision});
    if(disposed||source!==programSource.source()||activeId!==scriptId()||revisionText!==find('script-revision').value)
      throw {code:'E_REVISION',message:'加载期间编辑器已变化，请重新核对'};
    programSource.replaceSource(saved.sourceUtf8);find('script-id').value=row.programId;
    find('script-revision').value=String(row.revision);dependencyResolver.refresh();lastPagePreview=null;update();
  }});
  const onNavigation = details => {
    if (String(details.tabId) === tab.value) clearDocuments();
  };
  const onRemoved = tabId => {
    // Closing the exact owning tab proves its document is gone. Merely
    // selecting a different tab is never evidence of successful Stop.
    if(browserManagedPreview?.target.tabId===tabId){
      browserManagedPreview=null;
      componentMessage('idle','原组件所属标签页已关闭；下次运行仍需明确授权');
    }
    if(browserUnknownTarget?.tabId===tabId){
      browserEffectUnknown=false;
      browserUnknownTarget=null;
    }
    if(String(tabId)===tab.value){tab.value='';clearDocuments();}
    update();
  };
  const on = (id, event, operation) => listen(find(id), event, () => Promise.resolve().then(operation).catch(fail));
  const edit = operation => async () => {
    if(editingBusy || disposed) return;
    if(localProject?.active())throw {code:'E_DEV_MODE',message:'请先切换到手工草稿模式'};
    editingBusy = true; update();
    try {await operation();} finally {editingBusy = false; update();}
  };
  listen(find('script-save'),'click',event=>{
    if(!event.isTrusted)return;
    Promise.resolve().then(()=>localProject?.active()?localInstaller.prepare():isComponentDraft()?savePreparedComponent():edit(save)()).catch(fail);
  }); on('script-load','click',edit(load)); on('script-list-load','click',edit(loadLatestFromList));
  on('script-read','click',()=>read('')); on('script-delete','click',edit(remove)); on('script-list-refresh','click',()=>refreshScripts().catch(fail));
  on('script-read-run','click',()=>read());
  on('script-history-open','click',()=>read(find('script-history-run').value));
  on('script-copy-result','click',async () => {
    if (disposed || copyResult.disabled) return;
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await globalThis.navigator.clipboard.writeText(output.textContent);
      if (!disposed) copyResult.textContent = '已复制';
    } catch {
      copyResult.textContent = '无法自动复制';
      copyResult.title = '请选中返回值后手动复制';
    }
  });
  on('script-download','click',downloadResult); on('script-download-result','change',update);
  on('script-refresh','click',refreshTabs); on('script-tab','change',refreshDocuments);
  // Native radio input events work with genuine pointer, Tab and arrow-key
  // interaction on macOS; no scripted change or OS-native popup is needed.
  // The fieldset disables all choices during preparation or an active project.
  for(const [next,input] of Object.entries(componentInputs))if(input)listen(input,'change',()=>{
    if(!input.checked)return;
    if(previewBusy||browserManagedPreview||browserEffectUnknown||localProject?.active()||programSource.snapshot()){
      syncComponentInputs();
      componentMessage('error','请先停止旧组件或打开新网页，再切换框架');
      return;
    }
    browserPreparer.cancel();browserPrepareGeneration++;
    componentDrafts[componentMode]=programSource.source();
    componentMode=next;
    syncComponentInputs();
    programSource.replaceSource(componentDrafts[next]??componentPresets[next]??'');
    dependencyResolver.refresh();lastPagePreview=null;componentRemote.refresh();
    componentMessage('idle',next==='javascript'?'':'官方组件源码 · 按需编译 · 明确点击运行');
    update();
  });
  on('script-target-mode','change',update); on('script-id','input',update); on('script-revision','input',update); on('script-source','input',() => {browserPreparer.cancel();browserPrepareGeneration++;programSource.replaceSource(programSource.source());componentDrafts[componentMode]=programSource.source();dependencyResolver.refresh();componentRemote.refresh();update();});
  on('script-params','input',update);
  listen(find('script-run'), 'click', start);
  listen(scriptsSettings, 'click', event => {
    if (!event.isTrusted || disposed || scriptsRecovery.hidden) return;
    const url = userScriptsSettingsURL(api);
    if (!url || typeof api.tabs?.create !== 'function') {
      showUserScriptsRecovery('blocked', '请手动打开 chrome://extensions，进入 OpenDesk Browser 详情并开启「允许用户脚本」。');
      return;
    }
    try {
      Promise.resolve(api.tabs.create({url})).catch(() =>
        showUserScriptsRecovery('blocked', 'Chrome 未打开扩展设置；请手动进入 chrome://extensions 的 OpenDesk Browser 详情。'));
    } catch {
      showUserScriptsRecovery('blocked', 'Chrome 未打开扩展设置；请手动进入 chrome://extensions 的 OpenDesk Browser 详情。');
    }
  });
  listen(scriptsCheck, 'click', event => {
    if (!event.isTrusted || disposed || scriptsRecovery.hidden || scriptsCheck.disabled) return;
    const sequence = ++scriptsCheckSequence;
    scriptsCheck.disabled = true;
    showUserScriptsRecovery('checking', '正在读取 Chrome 用户脚本能力（只检测，不申请权限）…');
    void inspectUserScriptsAccess(api).then(available => {
      if (disposed || sequence !== scriptsCheckSequence) return;
      showUserScriptsRecovery(available ? 'available' : 'blocked', available
        ? '能力初步检测通过。请主动点击「运行草稿」；实际执行时仍会重新验证权限，不会自动重放此前任务。'
        : 'Chrome 仍未开放用户脚本能力。请在扩展详情启用「允许用户脚本」后重新检测。');
    }).finally(() => {
      if (!disposed && sequence === scriptsCheckSequence) scriptsCheck.disabled = false;
    });
  });
  listen(find('page-preview-run'), 'click', previewPage);
  const candidateSaveButton=find('page-candidate-save');
  if(candidateSaveButton)listen(candidateSaveButton,'click',event=>{
    if(!event.isTrusted)return;
    (isComponentDraft()?savePreparedComponent():savePageCandidate()).catch(error=>{
      const node=find('page-candidate-status');node.dataset.state='error';
      node.textContent=(error.code||'E_PAGE_CANDIDATE')+'：'+(error.message||error);
    });
  });
  on('script-stop','click',async () => {
    if(browserPreparing||componentRemote?.busy){
      browserPrepareGeneration++;browserPreparing=false;browserPreparer.cancel();componentRemote.cancel();
      componentMessage('completed','已取消本次准备；迟到结果不会运行。');update();return;
    }
    if(browserManagedPreview&&canStopManaged()&&!stopping){
      const owned=browserManagedPreview;stopping=true;update();
      display('stopping','正在清理受管页面组件…');
      try{
        const result=await client.request('retirePagePreview',{previewId:owned.previewId});
        if(result.state!=='preview-retired'||result.sourceHash!==owned.sourceHash||
          result.receipt?.ok!==true||result.receipt.scope!=='managed-ui-only')
          throw {code:'E_UI_CLEANUP_FAILED',message:'没有收到可信的组件停止回执'};
        if(browserManagedPreview===owned)browserManagedPreview=null;
        componentMessage('completed','已停止 · 受管组件和样式已清理');
        pageTechnicalPanel.hidden=false;pageTechnicalPanel.open=false;
        pageTechnical.textContent=JSON.stringify({stop:result,framework:owned.framework},null,2);
        display('completed','受管组件已清理；网页业务效果不会回滚。');
      }catch(error){
        quarantineBrowserEffect(owned.target); // Uncertain Stop is document-bound; never blindly retry.
        componentMessage('error',(error.code||'E_UI_CLEANUP')+'：'+error.message+
          '；无法确认组件已清理，请重新加载目标网页');
        throw error;
      }
      finally{stopping=false;update();}
      return;
    }
    if(canStopManaged()&&!stopping){
      const owned=ownedManagedPreview;stopping=true;update();display('stopping','正在清理原网页中的受管资源…');
      try{
        const result=await localAdapter.handle({method:'page.dispose',requestId:crypto.randomUUID(),params:{previewId:owned.previewId}});
        if(result.sourceHash!==owned.sourceHash)throw {code:'E_EFFECT_UNKNOWN',message:'受管清理身份不一致'};
        if(ownedManagedPreview===owned)ownedManagedPreview=null;display('completed','受管 UI 已清理；网页业务效果不会回滚。',result);
      }finally{stopping=false;update();}
      return;
    }
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
    // RunHost releases its local owner after notifying terminal observers.
    queueMicrotask(update);
  });
  const unsubscribeCurrentPage = currentPageTarget?.subscribe(renderCurrentPage);
  currentPageTarget?.ready?.catch(fail);
  const recoverView = () => read('').catch(error=>{projection=undefined;update();fail(error);});
  const unsubscribeConnection = client.subscribeConnection?.(event=>{if(event.connected) recoverView();});
  client.ready.then(recoverView).catch(fail);
  if(api.storage?.session)Promise.resolve(currentPageTarget?.ready).then(async()=>{
    // A catalog tab retains a separate draft; never overwrite its Sidebar.
    const catalogTab=(await api.tabs.getCurrent?.())?.id;
    if(catalogTab&&!development)return;
    const windowId=currentPageTarget?.snapshot?.windowId;
    if(!Number.isSafeInteger(windowId))return;
    const key=catalogTab?`opendesk.development.catalog-draft.v1:${catalogTab}`:`opendesk.sidebar.editor-draft.v1:${windowId}`;
    const backupKey='opendesk.development.backup:'+key;
    const saved=(await api.storage.session.get(key))[key] || development&&(await api.storage.local.get(backupKey))[backupKey];
    if(disposed)return;
    if(JSON.stringify(captureDraft())===initialDraft && saved &&
        Object.keys(draftFields).every(name=>typeof saved[name]==='string') &&
        new TextEncoder().encode(saved.source).length<=(saved.programDraft?PROGRAM_DRAFT_INPUT_LIMIT:100000)){
      const unchanged=()=>!disposed && JSON.stringify(captureDraft())===initialDraft;
      const restored=saved.programDraft ? await programSource.importProject(saved.programDraft,unchanged) : unchanged();
      if(restored && !disposed){
        if(!saved.programDraft)programSource.replaceSource(saved.source);
        if(['javascript','react','vue'].includes(saved.componentMode)&&
          saved.componentDrafts&&typeof saved.componentDrafts==='object'&&!Array.isArray(saved.componentDrafts)){
          for(const modeName of ['javascript','react','vue']){
            const item=saved.componentDrafts[modeName];
            if(typeof item==='string'&&new TextEncoder().encode(item).length<=128*1024)
              componentDrafts[modeName]=item;
          }
          componentMode=saved.componentMode;
          syncComponentInputs();
        }
        for(const [name,id] of Object.entries(draftFields))if(name!=='source')find(id).value=saved[name]??'';
        dependencyResolver.refresh();componentRemote.refresh();
      }
    }
    draftKey=key;update();
  }).catch(error=>console.warn('Sidebar draft could not be restored',error));
  refreshTabs().catch(fail); refreshScripts({silent: true}).catch(fail); update();
  function applyImported(sourceUtf8) {
    browserPreparer.cancel();browserPrepareGeneration++;
    componentMode='javascript';syncComponentInputs();
    currentRevision = undefined;
    find('script-id').value = `import-${Date.now()}`;
    find('script-revision').value = '';
    programSource.replaceSource(sourceUtf8);
    dependencyResolver.refresh();componentRemote.refresh(); update();
    display('draft','已导入未保存草稿；请返回目标网页后明确点击运行');
  }
  return {host,async prepareDevelopmentReload(){
    const idle=()=>!disposed&&!editingBusy&&!stopping&&!running&&!previewBusy&&!ownedManagedPreview&&!browserManagedPreview&&
      !host.executionPending&&!host.currentRun&&!downloading&&!preparations.size&&!client.resourceSnapshot?.().pending;
    if(!idle()||!draftKey)return false;
    await draftWrites;
    if(!idle())return false;
    const value=captureDraft(),serial=JSON.stringify(value);
    await api.storage.session.set({[draftKey]:value});
    // Chrome clears storage.session on extension reload. This development-only
    // backup is restored only into an unchanged editor, never over fresh edits.
    await api.storage.local.set({['opendesk.development.backup:'+draftKey]:value});
    return idle()&&JSON.stringify(captureDraft())===serial;
  },connectLocalProjects(adapter,{onInstalled}={}){
    if(localProject||!find('local-project-mode'))return;
    localAdapter=adapter;localInstaller.setOnInstalled(onInstalled);
    localProject=createLocalProjectView({client,api,document:doc,onChange:update});update();
  },executionSource:()=>{
    if(localProject?.active())throw {code:'E_DEV_MODE',message:'本地开发项目请通过正式打包流程创建已安装任务'};
    return programSource.source();
  }, importDraft(sourceUtf8) {
    if(localProject?.active())throw {code:'E_DEV_MODE',message:'手工草稿已保留；请先切换到手工草稿模式再导入'};
    if (disposed || editingBusy || previewBusy || componentRemote?.busy || browserManagedPreview) throw {code:'E_BUSY',message:'请先停止当前受管组件，再导入或保存版本'};
    if (sourceUtf8 && typeof sourceUtf8 === 'object') {
      editingBusy = true; update();
      return programSource.importProject(sourceUtf8).then(value => {
        if (disposed) throw {code:'E_HOST_CLOSED',message:'编辑器已关闭'};
        applyImported(value.sourceUtf8);
      }).finally(() => {editingBusy=false;if(!disposed)update();});
    }
    if(typeof sourceUtf8==='string'&&sourceUtf8.startsWith(PAGE_BUNDLE_PREFIX)){
      inspectPageSource(sourceUtf8,{plainLimit:100000});editingBusy=true;update();
      return validatePageSource(sourceUtf8,{plainLimit:100000}).then(()=>{
        if(disposed)throw {code:'E_HOST_CLOSED',message:'编辑器已关闭'};applyImported(sourceUtf8);
      }).finally(()=>{editingBusy=false;if(!disposed)update();});
    }
    if (typeof sourceUtf8 !== 'string' || !sourceUtf8.trim() || new TextEncoder().encode(sourceUtf8).length > 100000)
      throw {code:'E_LIMIT',message:'导入草稿必须为非空 JavaScript，且不超过 100000 字节'};
    applyImported(sourceUtf8);
  }, resourceSnapshot: () => ({...host.resourceSnapshot(), editor:{
    timers:[...downloads.values(),...preparations.values()].filter(entry=>entry.timer != null).length+Number(localPollTimer!=null),
    pending:Number(downloading)+preparations.size, subscriptions:listeners.length+2*Number(browserListenersAttached)+Number(Boolean(unsubscribeCurrentPage))+(localProject?.resourceSnapshot().subscriptions||0)}}), dispose() {
    if (disposed) return; disposed = true; componentRemote.dispose(); browserPrepareGeneration++; browserPreparer.dispose(); scriptsCheckSequence++; localInstaller.dispose();localProject?.dispose();pageLibrary.dispose();clearTimeout(localPollTimer);finishLocalPoll?.();dependencyResolver.dispose(); unsubscribeConnection?.(); unsubscribeCurrentPage?.(); unsubscribeRun();
    api.webNavigation.onCommitted.removeListener(onNavigation); api.tabs.onRemoved.removeListener(onRemoved); host.dispose();
    browserListenersAttached = false;
    for (const {element, event, listener} of listeners) element.removeEventListener(event, listener);
    listeners.length = 0;
    for (const entry of downloads.values()) { clearTimeout(entry.timer); entry.timer = null; }
    for (const entry of preparations.values()) { clearTimeout(entry.timer); entry.timer = null; }
  }};
}
