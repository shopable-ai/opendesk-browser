import {patchDeveloperField,developerOptions,appendDeveloperOptions,developerAction} from './develop-view.js';
import {createControllerRevisionView} from './controller-revision-view.js';
import {createRunArtifactDownload} from './run-artifact-download.js';
import {createRunHost} from '../run-host.js';
import {permissionPattern} from '../environment.js';
import {decodeValue} from '../platform/page-port/codec.js';
import {invariant, digestUtf8} from '../platform/protocol.js';
import {createPageDependencyResolver, dependencyMessage} from './page-dependencies.js';
import {createPageDependencyReview} from './page-dependency-review.js';
import {createPageDependencyInstaller} from './page-dependency-install.js';
import {preparePageCandidateDraft,validatePageCandidateAuthoring} from './page-candidate-source.js';
import {parseUserScriptDependencies} from '../scripting/user-scripts/dependency-metadata.js';
import {parseControllerClassicDependencies} from '../scripting/user-scripts/controller-classic.js';
import {createProgramSourceView} from './program-source.js';
import {createPageComponentRemote} from './page-component-remote.js';
import {hasUnbuiltESM} from './esm-source-detector.js';
import {inspectPageSource,validatePageSource,PAGE_BUNDLE_PREFIX} from '../scripting/user-scripts/page-bundle.js';
import {inspectPageFrameSource} from '../scripting/user-scripts/page-frame-resources.js';
import {PAGE_PREVIEW_RECEIPT_FORMAT} from '../scripting/user-scripts/execution-source.js';
import {createBrowserPageComponentPreparer} from './page-component-preparer.js';
import {createStaticESMPreparer} from './static-esm-preparer.js';
import {createLocalProjectView} from './local-project.js';
import {localProjectAllowsOrigin} from '../platform/local-project-site-scope.js';
import {createLocalInstallUI} from './local-project-install-ui.js';
import {validateTaskParams} from '../platform/tasks/contract.js';
import {formatControllerRunResult, formatRunValue, runValueKind} from './run-result-presentation.js';
import {formatTaskError} from './task-run-diagnostics.js';
import {inspectUserScriptsAccess, userScriptsSettingsURL} from './user-scripts-access.js';
import {createPageProgramLibrary} from './page-program-library.js';
import {requireChromePermissions,createChromePermissionConsent} from '../platform/chrome/permission-gate.js';

export function createScriptEditor({client, currentPageTarget, development=false, api = globalThis.chrome, document: hostDocument = globalThis.document,view,
  hostFactory = createRunHost,sharedRunHost=null,componentPreparerFactory=createBrowserPageComponentPreparer,
  staticESMPreparerFactory=createStaticESMPreparer,
  browserCompilerEnabled=typeof __OPENDESK_BROWSER_COMPILER_ENABLED__==='undefined'||
    __OPENDESK_BROWSER_COMPILER_ENABLED__!==false}) {
  invariant(view,'E_DEVELOPER_VIEW','开发编辑器需要已连接的视图');
  const host = sharedRunHost ?? hostFactory({api, client, document: hostDocument, templateModuleFactory: null});
  // The complete React page consumes this UI projection. RunHost retains the
  // real host document; no user code is evaluated in the trusted React tree.
  const doc=hostDocument;
  const find = id => view.fields[id];
  const status = find('script-status'), output = find('script-result');
  const resultKind = find('script-result-kind'), copyResult = find('script-copy-result');
  const pageTechnicalPanel = find('page-preview-technical-panel'), pageTechnical = find('page-preview-technical');
  const scriptsRecovery = find('script-user-scripts-recovery');
  const scriptsRecoveryStatus = find('script-user-scripts-recovery-status');
  const scriptsSettings = find('script-user-scripts-settings');
  const scriptsCheck = find('script-user-scripts-check');
  const currentPageStatus = find('script-current-page-status'), currentPageHost = find('script-current-page-host'),
    currentPageDebug = find('script-current-page-debug'), runningTargetStatus = find('script-running-target');
  let projection, currentTask, editingBusy = false, stopping = false, previewBusy = false, snapshotSequence = 0;
  const componentSelector=find('page-component-framework'),componentStatus=find('page-component-status');
  const pagePreviewStatus=find('page-preview-status');
  const componentInputs=Object.freeze(Object.fromEntries(
    ['javascript','react','vue'].map(mode=>[mode,find('page-component-'+mode)])));
  // In Standard Edition the browser compiler is physically absent from the
  // package, so do not present JSX/SFC radio choices as usable actions.
  if(!browserCompilerEnabled){
    // Standard is a normal JS editor, not a three-way code-mode picker.
    // Keep the declared fields without advertising unavailable compiler modes.
    view.patch('page-component-editor-tools',{hidden:true});
    view.patch('developer-source-label',{textContent:'JavaScript 源码编辑器'});
    for(const mode of ['react','vue']){
      const choice=componentInputs[mode];
      if(choice)patchDeveloperField(view,choice,{disabled:true});
    }
  }
  let componentMode='javascript',javascriptWorld='controller',loadedPageSource=false,browserManagedPreview=null;
  let componentRemote,browserPreparing=false,browserPrepareGeneration=0;
  let browserUnknownTarget=null;
  function quarantineBrowserEffect(target){
    // Effect-unknown is bound to the document where dispatch may have reached
    // USER_SCRIPT. No new Run or Stop can be inferred until a DIFFERENT actual
    // document becomes available; transient resolving/unavailable is not proof.
    browserUnknownTarget={tabId:target.tabId,documentId:target.documentId};
  }
  const syncComponentInputs=()=>{
    for(const [mode,node] of Object.entries(componentInputs))if(node)patchDeveloperField(view,node,{checked:mode===componentMode});
  };
  const browserPreparer=componentPreparerFactory({api});
  const staticESMPreparer=staticESMPreparerFactory({api});
  const browserBinding='browser-v1-'+crypto.randomUUID().replaceAll('-','').slice(0,24);
  function componentMessage(state,message){
    if(!componentStatus)return;
    patchDeveloperField(view,componentStatus,{hidden:componentMode==='javascript'&&!message,
      data:{...componentStatus.data,state},textContent:message||''});
  }
  let ownedDraftRunId = null, ownedManagedPreview=null, lastPagePreview=null;
  // The React view is the single presentation state. No duplicate result buffer.
  const setResultText=value=>patchDeveloperField(view,output,{textContent:value??''});
  const setResultKind=value=>patchDeveloperField(view,resultKind,{textContent:value??''});
  let currentPageState = currentPageTarget?.snapshot ?? {status:'unavailable',reason:'E_TARGET',message:'当前网页服务不可用'},
    running = false, disposed = false;
  const listeners = [];
  let dependencyResolver,dependencyReview,dependencyInstaller;
  let localProject,localAdapter,localPollTimer,finishLocalPoll,localPageResult=null;
  // Both field renderers share the original execution-ownership gate.
  const frameworkBusy=()=>editingBusy||running||stopping||previewBusy||browserPreparing||
    !!host.currentRun||!!componentRemote?.busy||!!browserManagedPreview||!!browserUnknownTarget||
    !!localProject?.active()||!!programSource.snapshot();
  const localInstaller=createLocalInstallUI({client,api,doc,view,currentPageTarget,getProject:()=>localProject,readControllerRun:options=>host.controller.snapshotControllerRun(options),
    isBusy:()=>running||previewBusy||stopping,retireManagedPreview:retireLocalPreviewForInstall,onState:()=>update()});
  const listen = (element, event, listener) => {
    listeners.push(developerAction(view,element,event,listener));
  };
  const programSource = createProgramSourceView({view,listen,onChange:() => {
    // New Script explicitly exits the imported read-only package view.
    loadedPageSource=false;componentMode='javascript';javascriptWorld='controller';syncComponentInputs();
    sourceInput();
  }});
  const controllerRevisions=createControllerRevisionView({host,client,view,programSource,
    prepareESM:prepareControllerESM,getGeneration:()=>browserPrepareGeneration,onUpdate:update,onStatus:display,
    onLoad:source=>{
      loadedPageSource=false;componentMode='javascript';javascriptWorld='controller';syncComponentInputs();
      lastPagePreview=null;componentMessage('idle','');
      programSource.replaceSource(source);sourceInput();
    }});
  const resultDownloads=createRunArtifactDownload({client,host,document:doc,view,onState:update});

  // Controller Classic uses the existing native source-permission consent, not
  // a second grant registry. The read-only observation is primed on edit; only
  // a real Run click may request missing Chrome HTTPS origin access.
  let controllerClassicWarmEpoch=0,controllerClassicWarm=null,controllerClassicWarmError=null;
  const controllerClassicConsent=createChromePermissionConsent({api,
    onChange:()=>scheduleControllerClassicWarm()});
  function scheduleControllerClassicWarm(){
    const source=programSource.source(),epoch=++controllerClassicWarmEpoch;
    controllerClassicWarm=null;controllerClassicWarmError=null;
    let origins;
    try{
      const refs=parseControllerClassicDependencies(source);
      if(!refs.length){update();return;}
      origins=[...new Set(refs.map(row=>new URL(row.url).origin+'/*'))];
    }catch(cause){controllerClassicWarmError={source,cause};update();return;}
    controllerClassicConsent.prepare({origins}).then(observed=>{
      if(disposed||epoch!==controllerClassicWarmEpoch||source!==programSource.source())return;
      if(observed)controllerClassicWarm={source,origins};
      update();
    }).catch(cause=>{
      if(disposed||epoch!==controllerClassicWarmEpoch||source!==programSource.source())return;
      controllerClassicWarmError={source,cause};update();
    });
    update();
  }
  function controllerClassicReadyForRun(){
    const source=programSource.source();
    try{if(!parseControllerClassicDependencies(source).length)return true;}
    catch{return true;} // Let Run explain malformed source instead of hiding the error.
    return controllerClassicWarm?.source===source||controllerClassicWarmError?.source===source;
  }
  function confirmControllerClassicRun(event,source){
    const refs=parseControllerClassicDependencies(source);
    if(!refs.length)return Promise.resolve(true);
    if(controllerClassicWarmError?.source===source)return Promise.reject(controllerClassicWarmError.cause);
    if(controllerClassicWarm?.source!==source)return Promise.reject(Object.assign(
      new Error('正在只读检查 Classic 来源权限，请检查完成后再次点击 Run'),
      {code:'E_PERMISSION_PENDING'}));
    return controllerClassicConsent.confirm(event,{origins:controllerClassicWarm.origins});
  }

  function display(state, message) {
    if (disposed) return;
    // RunHost return values enter the result area only via an authorized Result
    // projection, never through transient claim/preview transport payloads.
    patchDeveloperField(view,status,{data:{...status.data,state},textContent:message});
    const taskStatus = find('script-task-status');
    patchDeveloperField(view,taskStatus,{hidden:state !== 'results' || !taskStatus.textContent});
  }
  function displayCopyResult(label) {
    // Feedback must not replace the icon subtree when results refresh asynchronously.
    patchDeveloperField(view,copyResult,{title:label,ariaLabel:label});
    const feedback = find('script-copy-feedback');
    if (feedback) {
      patchDeveloperField(view,feedback,{textContent:label === '复制结果' ? '' : label,hidden:label==='复制结果'});
    }
  }
  function beginResult() {
    setResultText('正在运行…');
    setResultKind('等待返回值');
    patchDeveloperField(view,copyResult,{disabled:true});
    displayCopyResult('复制结果');
  }
  let scriptsCheckSequence = 0;
  if (scriptsRecovery) patchDeveloperField(view,scriptsRecovery,{hidden:true});
  function showUserScriptsRecovery(state = 'blocked', message = 'page.evaluate() 无法执行。请打开扩展设置，开启「允许用户脚本」后返回检测；不会自动重放任务。') {
    if (!scriptsRecovery || disposed) return;
    patchDeveloperField(view,scriptsRecovery,{hidden:false,data:{...scriptsRecovery.data,state}});
    patchDeveloperField(view,scriptsRecoveryStatus,{textContent:message});
    patchDeveloperField(view,scriptsSettings,{hidden:state !== 'blocked'});
  }
  function hideUserScriptsRecovery() {
    scriptsCheckSequence++; // Fence a late read-only probe from an earlier run.
    if (scriptsRecovery) patchDeveloperField(view,scriptsRecovery,{hidden:true,data:{...scriptsRecovery.data,state:'idle'}});
  }
  const fail = error => {
    const help = formatTaskError(error);
    display('error', help);
    if (running) {
      // Failed admission/preview is not a still-running script return value.
      setResultText('本次执行失败，未产生可显示的返回值');
      setResultKind('执行失败');
      patchDeveloperField(view,copyResult,{disabled:true});
    }
    if (error?.code === 'E_USER_SCRIPTS_UNAVAILABLE') showUserScriptsRecovery();
    else if (error?.code === 'E_USER_SCRIPTS_NATIVE') showUserScriptsRecovery('error', help);
    if (error?.code === 'E_PAGE_CONTENT_TOO_LARGE' ||
        error?.code === 'E_VALUE_SERIALIZATION') setResultText(help);
  };
  const scriptId = () => find('script-id').value.trim();
  function otherTabOwnsBrowserUI(){
    return !!browserManagedPreview&&currentPageState?.status==='available'&&
      (browserManagedPreview.target.tabId!==currentPageState.tabId||
       browserManagedPreview.target.documentId!==currentPageState.documentId);
  }
  async function retireLocalPreviewForInstall({source,binding,target,previewId}) {
    const owned=ownedManagedPreview;
    if(!owned||owned.previewId!==previewId||owned.sourceHash!==source.sourceHash||
      owned.bindingId!==binding.bindingId||['tabId','windowId','documentId','url'].some(key=>owned.target[key]!==target[key]))
      throw {code:'E_DEV_CONFLICT',message:'本次验证的原受管预览所有权已变化'};
    stopping=true;update();
    try {
      const result=await localAdapter.handle({method:'page.dispose',requestId:crypto.randomUUID(),params:{previewId:owned.previewId}});
      if(result?.previewId!==owned.previewId||result.sourceHash!==owned.sourceHash||result.state!=='preview-retired'||
        result.receipt?.ok!==true||result.receipt.scope!=='managed-ui-only')
        throw {code:'E_EFFECT_UNKNOWN',message:'原受管预览清理回执未确认'};
      if(ownedManagedPreview!==owned)throw {code:'E_DEV_CONFLICT',message:'清理期间预览所有权变化'};
      ownedManagedPreview=null;return result;
    } finally {stopping=false;update();}
  }
  function canStopManaged(){
    if(browserManagedPreview&&!browserUnknownTarget&&!localProject?.active()&&!running&&!stopping&&!previewBusy&&!host.currentRun&&
      currentPageState?.status==='available'&&currentPageState.documentId===browserManagedPreview.target.documentId&&
      currentPageState.tabId===browserManagedPreview.target.tabId)return true;
    if(!ownedManagedPreview||!localProject?.active()||running||previewBusy||host.currentRun||!projection?.slotAvailable)return false;
    return localProject.selectedBindingId()===ownedManagedPreview.bindingId&&currentPageState?.status==='available'&&currentPageState.documentId===ownedManagedPreview.target.documentId&&currentPageState.tabId===ownedManagedPreview.target.tabId;
  }
  function localPageResultIsCurrent({allowResolving=false}={}) {
    return !!localPageResult&&!!localProject?.active()&&
      localPageResult.bindingId===localProject.selectedBindingId()&&
      (localPageResult.kind==='stop'||
       localPageResult.providerEpoch===localProject.providerEpoch()&&localProject.connected())&&
      (allowResolving&&currentPageState?.status==='resolving'||
       currentPageState?.status==='available'&&
       localPageResult.tabId===currentPageState.tabId&&
       localPageResult.documentId===currentPageState.documentId&&
       localPageResult.url===currentPageState.url);
  }
  function update() {
    if (disposed) return;
    componentRemote?.update();
    dependencyReview?.update();
    localInstaller.update();
    // A target refresh is pending evidence, not a confirmed document change.
    // Keep the original result, but do not expose it as current until resolved.
    if(localPageResult&&!localPageResultIsCurrent({allowResolving:true})){
      localPageResult=null;
      setResultText('上次本地 Page 结果对应的项目、连接或网页已变化；请重新运行。');
      setResultKind('上次结果已失效');patchDeveloperField(view,copyResult,{disabled:true});
      display('unknown','上次本地 Page 结果已失效，不能用于验证或安装当前源码');
    }
    if(localPageResult)patchDeveloperField(view,copyResult,{disabled:!localPageResultIsCurrent()});
    const pageExecution=isComponentDraft()||isPageDraft(),local=!!localProject?.active(),source=programSource.source();
    controllerRevisions.update({busy:editingBusy,local,page:pageExecution});
    const worldRow=find('script-javascript-world-row'),worldChoice=find('script-javascript-world');
    if(worldRow)patchDeveloperField(view,worldRow,{hidden:componentMode!=='javascript'||!!localProject?.active()||!!programSource.snapshot()});
    if(worldChoice)patchDeveloperField(view,worldChoice,{value:javascriptWorld,disabled:frameworkBusy()});
    view.patch('manual-project-params-tools',{hidden:pageExecution||local});
    view.patch('script-version-identity',{hidden:local});
    // Describe the selected official source format instead of telling React /
    // Vue authors to write the legacy async function main() entry.
    view.patch('developer-run-technical',{hidden:componentMode!=='javascript'||loadedPageSource});
    view.patch('page-preview-mode-title',{textContent:componentMode==='javascript'?
      '网页 JavaScript 试运行':componentMode==='react'?'网页 React JSX 组件试运行':'网页 Vue SFC 组件试运行'});
    view.patch('page-preview-mode-hint',{textContent:componentMode==='react'?
      '使用官方 React import、App JSX 和默认导出组件。系统按需编译并受管挂载；无需 main() 或手动 Vite。仅获授权网页可运行。':
      componentMode==='vue'?
        '使用官方 Vue script setup、template 与 scoped CSS。系统按需编译并受管挂载；无需 main() 或手动 Vite。仅获授权网页可运行。':
        '直接使用上方 JavaScript 源码操作当前网页 DOM；可写 async function main() 返回结果，也可直接编写顶层语句。运行前仍需网站授权。'});
    view.patch('page-component-hint',{textContent:componentMode==='javascript'?
      (isPageDraft()?'Page JavaScript 使用当前网页 DOM；Controller 使用 page 自动化 API，二者执行环境不同。':browserCompilerEnabled?
        '编辑源码不会自动执行；点击「运行」才执行。':
        '标准版支持 JavaScript；React/Vue 需要 Developer Edition。'):
      '切换代码类型不会替换当前源码；点击「运行」才执行。'});
    const blocked=stopping||editingBusy||previewBusy||running||!projection?.slotAvailable||!!host.currentRun||currentPageState?.status!=='available';
    let runDisabled=blocked;
    if(local)runDisabled||=!localProject.canAttemptRun();
    else if(pageExecution)runDisabled||=!source.trim()||!!browserUnknownTarget||browserManagedPreview?.recoveredOnly||
      otherTabOwnsBrowserUI()||componentRemote?.busy||dependencyInstaller?.busy||programSource.kind()==='controller'||
      (componentMode==='javascript'?(dependencyResolver?.busy||
        (dependencyResolver?.sourceFormat?!dependencyReview?.readyForRun:!dependencyInstaller?.readyForRun)):!componentRemote?.readyForRun);
    else runDisabled||=!source.trim()||(browserCompilerEnabled&&hasUnbuiltESM(source)&&!componentRemote?.readyForRun)||!controllerClassicReadyForRun();
    const preparing=browserPreparing||controllerRevisions.preparing||componentRemote?.busy;
    const stopDisabled = stopping || !preparing&&!canStopManaged()&&(!ownedDraftRunId || host.currentRun !== ownedDraftRunId);
    const stopLabel=preparing?'取消准备':canStopManaged()?'停止受管 UI':'停止';
    if(componentSelector)patchDeveloperField(view,componentSelector,{disabled:frameworkBusy()});
    if(componentStatus)patchDeveloperField(view,componentStatus,{hidden:componentMode==='javascript'&&!componentStatus.textContent});
    const pageCandidateButton=find('page-candidate-save');
    if(pageCandidateButton)patchDeveloperField(view,pageCandidateButton,{disabled:!canSavePagePreview()&&!canPrepareComponentCandidate(),title:''});
    if(local&&find('task-create-candidate'))patchDeveloperField(view,find('task-create-candidate'),{disabled:true});
    patchDeveloperField(view,find('page-preview-tools'),{hidden:!!localProject?.active()||!pageExecution});
    {
      const runButton=find('script-run'),stopButton=find('script-stop');
      patchDeveloperField(view,runButton,{disabled:runDisabled,textContent:local?'运行本地项目':'运行'});
      patchDeveloperField(view,find('script-save'),{
        disabled:!localProject?.active()||editingBusy||running||stopping||previewBusy||!localInstaller.hasSelection(),
        textContent:localProject?.active()?localInstaller.saveLabel():'检查并保存本地项目'});
      patchDeveloperField(view,stopButton,{disabled:stopDisabled,hidden:local&&stopDisabled,textContent:stopLabel});
    }
    dependencyInstaller?.update();
  }
  function renderCurrentPage(next) {
    if (disposed) return;
    if(next?.status==='available'&&Number.isSafeInteger(next.tabId)&&
       typeof next.documentId==='string'&&next.documentId){
      if(browserManagedPreview&&browserManagedPreview.target.tabId===next.tabId&&
         browserManagedPreview.target.documentId!==next.documentId)
        browserManagedPreview=null; // The owning tab actually navigated; do not mistake a tab switch for cleanup.
      if(browserUnknownTarget&&
         browserUnknownTarget.tabId===next.tabId&&
         browserUnknownTarget.documentId!==next.documentId){
        browserUnknownTarget=null;
        componentMessage('idle','已确认原标签页的新网页文档；未知结果不会重试，需重新明确点击运行');
      }
      if(browserManagedPreview&&browserManagedPreview.target.tabId!==next.tabId)
        componentMessage('idle','受管组件仍在另一标签页。请返回原网页停止后再切换运行目标。');
    }
    currentPageState = next;
    const available=next?.status==='available',resolving=next?.status==='resolving';
    patchDeveloperField(view,find('script-current-page-title'),{textContent:available?next.title||next.url:
      resolving?'正在识别…':next?.message||'尚未识别可运行网页'});
    patchDeveloperField(view,find('script-current-page-url'),{textContent:available?next.url:''});
    patchDeveloperField(view,currentPageHost,{textContent:available?new URL(next.url).host:resolving?'正在识别…':'未识别',title:available?next.url:''});
    patchDeveloperField(view,currentPageStatus,{data:{...currentPageStatus.data,state:available?'available':resolving?'resolving':'unavailable'},
      textContent:available?'网页可运行':resolving?'检查中':'不可运行',
      title:available?'目标网页可运行；运行时核对所选源码、网站授权及文档身份':resolving?'':next?.message||'未找到活动 HTTP(S) 主文档'});
    if(available)patchDeveloperField(view,currentPageDebug,{textContent:JSON.stringify({
      windowId:next.windowId,tabId:next.tabId,frameId:next.frameId,
      documentId:next.documentId,url:next.url,origin:next.origin},null,2)});
    else if(resolving)
      patchDeveloperField(view,currentPageDebug,{textContent:next.windowId==null?'':JSON.stringify({windowId:next.windowId},null,2)});
    else patchDeveloperField(view,currentPageDebug,{textContent:JSON.stringify({
      windowId:next?.windowId??null,reason:next?.reason||'E_TARGET'},null,2)});
    update();
  }
  const stateLabels = {preparing:'正在准备',running:'运行中',stopping:'正在停止',settling:'正在保存结果',
    retiring:'正在释放资源',completed:'已完成',failed:'失败',stopped:'已停止',interrupted:'已中断',paused_unknown:'状态待确认'};
  function renderTask(run) {
    if (disposed) return;
    currentTask = run;
    patchDeveloperField(view,find('script-task-id'),{textContent:run ? `runId：${run.runId}` : '尚未运行'});
    patchDeveloperField(view,find('script-task-status'),{textContent:run ? `${stateLabels[run.state] || run.state} · ${run.retirementState === 'released' ? '资源已释放' : '以后台回执为准'}` : ''});
    patchDeveloperField(view,find('script-task-version'),{textContent:run?.revision
      ? run.sourceKind === 'draft' || run.revision.kind === 'draft'
        ? `草稿快照 · SHA-256 ${run.revision.sourceHash}`
        : `${run.revision.scriptId} · r${run.revision.revision} · ${run.revision.sourceHash}` : ''});
    const target=run?.target;
    patchDeveloperField(view,runningTargetStatus,{data:{...runningTargetStatus.data,state:run?.state||'idle'},
      textContent:target?`运行目标：${target.url||target.allowedOrigin||'已冻结文档'}`:'运行目标：尚未建立',
      title:target?JSON.stringify({runId:run.runId,tabId:target.tabId,frameId:target.frameId,
        documentId:target.documentId,url:target.url,origin:target.allowedOrigin||target.origin}):''});
  }
  function captureCurrentPage(){
    if(!currentPageTarget)throw {code:'E_TARGET',message:'当前网页服务不可用'};
    // Preserve the single exact-document CurrentPageTarget handoff to the existing RunHost.
    const candidate=currentPageTarget.capture();
    return {target:{mode:'borrowed',tabId:candidate.tabId,frameId:0,
      documentId:candidate.documentId,expectedUrl:candidate.url,expectedWindowId:candidate.windowId},
      url:candidate.url,candidate};
  }
  function controllerESMInput(source,id){
    return {componentSource:source,framework:'controller',programId:id};
  }
  async function prepareControllerESM(source,id,check){
    if(!browserCompilerEnabled)
      throw {code:'E_ESM_BUILD_REQUIRED',message:'Standard Edition 不包含浏览器编译器；请使用本地 ESM 项目构建，或安装 Developer Edition。'};
    const input=controllerESMInput(source,id);
    try{
      const remoteSnapshot=await componentRemote.autoLoadForRun(input,check);check();
      const built=await browserPreparer.prepare({...input,projectId:'browser-controller',remoteSnapshot});check();
      if(built.authoringSourceHash!==await digestUtf8(source)||built.framework!=='controller')
        throw {code:'E_CONTROLLER_ESM_HASH',message:'编译产物未绑定当前 Controller 源码'};
      return {built,lockId:remoteSnapshot?.lockId??null};
    }finally{componentRemote.resumeRunPermissionWarm();}

  }
  function showSnapshot(snapshot) {
    if (disposed) return;
    projection = snapshot;
    // Controller history must not overwrite the current local Page result.
    if(localPageResultIsCurrent({allowResolving:true})){update();return;}
    // Defense in depth: even a malformed/stale host projection cannot put a
    // revoked result in the visible text, history payload or download selector.
    const deniedRuns = new Set(snapshot.resultDeliveryDenied || []);
    const values = snapshot.results.filter(row => !deniedRuns.has(row.runId)).map(row => {
      return {tag:row.tag,runId:row.runId,resultId:row.resultId,state:row.state,sourceKind:row.sourceKind || 'saved',
        revision:row.revision && {scriptId:row.revision.scriptId,revision:row.revision.revision,sourceHash:row.revision.sourceHash},
        sourceHash:row.revision?.sourceHash,
        ...(row.outcome?.ok === true ? {value:decodeValue(row.outcome.valueWire)} : {error:row.outcome?.error})};
    });
    resultDownloads.showResults(snapshot.results,deniedRuns);
    const task = currentTask && snapshot.runs.find(row=>row.runId === currentTask.runId);
    if (task) renderTask(task);
    else if (!running && !host.currentRun && snapshot.run) renderTask(snapshot.run);
    else if (!currentTask && !running && !host.currentRun && snapshot.runs.length) renderTask(snapshot.runs.at(-1));
    if (!snapshot.run) {
      const history = find('script-history-run'), selected = history.value;
      developerOptions(view,history,[{label:'选择历史任务',value:''}]);
      for (const row of snapshot.runs) appendDeveloperOptions(view,history,[{label:`${row.runId} · ${row.sourceKind === 'draft' ? '草稿' : 'r' + (row.revision?.revision ?? '?')} · ${stateLabels[row.state] || row.state}`,value:row.runId}]);
      if (snapshot.runs.some(row=>row.runId === selected)) patchDeveloperField(view,history,{value:selected});
      patchDeveloperField(view,find('script-history-open'),{disabled:!history.value});
      patchDeveloperField(view,find('script-history'),{textContent:formatRunValue({runs:snapshot.runs,results:values,downloads:snapshot.downloads,resultDeliveryDenied:snapshot.resultDeliveryDenied})});
    }
    update();
    const focused = snapshot.run || currentTask;
    display('results', focused ? '任务状态：' : '已读取持久结果');
    // The result is the decoded value, not runId/revision/sourceHash/transport metadata.
    // Authorized technical history stays available in the existing collapsed panel.
    setResultText(formatControllerRunResult(values, focused?.runId, snapshot.resultDeliveryDenied));
    const currentValues = values.filter(row => row.runId === focused?.runId);
    const visibleResult = currentValues[0];
    setResultKind(!visibleResult ? '暂无返回值' : currentValues.length > 1
      ? `共 ${currentValues.length} 项结果` : Object.hasOwn(visibleResult,'value')
        ? runValueKind(visibleResult.value) : '执行错误');
    patchDeveloperField(view,copyResult,{disabled:!visibleResult || deniedRuns.has(focused?.runId)});
    displayCopyResult('复制结果');
    if (visibleResult?.error?.code === 'E_USER_SCRIPTS_UNAVAILABLE') {
      if (scriptsRecovery?.data.state !== 'available') showUserScriptsRecovery();
    } else if (visibleResult) hideUserScriptsRecovery();
    // Reveal genuine outcome only for this session's own draft; old history
    // stays collapsed on ordinary entry, preserving editor working space.
    if (ownedDraftRunId && values.some(row => row.runId === ownedDraftRunId))
      patchDeveloperField(view,find('developer-results-panel'),{open:true});
  }
  async function read(runId = find('script-run-id').value.trim(),{reveal=false}={}) {
    if (disposed) return;
    const token = ++snapshotSequence;
    try {
      const snapshot = await host.controller.snapshotControllerRun(runId ? {runId} : {});
      if (!disposed && token === snapshotSequence){
        if(reveal)invariant(snapshot.run?.runId===runId,'E_RUN','原始运行记录不存在或身份已变化');
        showSnapshot(snapshot);
        if(reveal){
          patchDeveloperField(view,find('developer-results-panel'),{open:true});
          patchDeveloperField(view,find('script-history-panel'),{open:true});
        }
      }
    } catch (error) {if (!disposed && token === snapshotSequence) throw error;}
  }
  function start(event) {
    if (!event.isTrusted || disposed || stopping || running || previewBusy || editingBusy || host.currentRun) return;
    if(localProject?.active()){startLocal(event);return;}
    if(isComponentDraft()||isPageDraft()){
      if(!projection?.slotAvailable)return;
      previewPage(event);return;
    }
    let chosen, params, permission, sourceUtf8,esm,classic;
    const runKind=programSource.kind();
    try {
      // Freeze exact editor bytes, params and target inside the trusted click
      // before any asynchronous permission check or other work.
      chosen = captureCurrentPage(); params = JSON.parse(find('script-params').value);
      sourceUtf8 = programSource.source();
      if (programSource.kind() === 'page-userscript') throw {code:'E_PROGRAM_KIND',message:'这是网页 JavaScript 项目，请使用“在当前网页试运行”'};
      if (!sourceUtf8.trim()) throw {code:'E_SCHEMA',message:'请先输入草稿源码'};
      if (parseUserScriptDependencies(sourceUtf8).hasHeader) throw {code:'E_PROGRAM_KIND',
        message:'当前源码含兼容性脚本声明，请使用“网页 JavaScript 试运行”；自动化任务运行不解析旧格式声明。'};
      // Browser Controller always uses the pinned Controller ESM graph/linker.
      // The Page leaf-ESM resolver has a different world and is not a fallback.
      esm=hasUnbuiltESM(sourceUtf8);
      classic=parseControllerClassicDependencies(sourceUtf8).length>0;
      if(esm&&classic)throw {code:'E_CONTROLLER_CLASSIC_FORMAT',message:'Controller 不能同时使用 ESM import 与 Classic 声明'};
      permission=Promise.all([
        requireChromePermissions({api,request:{origins:[permissionPattern(chosen.url)],
          ...(find('script-allow-cookies').checked?{permissions:['cookies']}:{} )}}),
        esm&&browserCompilerEnabled?
          componentRemote.confirmRun(event,controllerESMInput(sourceUtf8,scriptId())):Promise.resolve(true),
        classic?confirmControllerClassicRun(event,sourceUtf8):Promise.resolve(true)
      ]);
    } catch (error) { fail(error); return; }
    hideUserScriptsRecovery();
    let startError, admittedRunId;
    const id=scriptId(),ticket=++browserPrepareGeneration;
    ownedDraftRunId=null;running=true;browserPreparing=esm||classic;renderTask(null);update();beginResult();
    display('checking',esm?'正在校验固定 ESM 依赖并编译 Controller 源码…':
      classic?'正在从 SHA 缓存准备固定 Controller Classic 库…':`正在检查访问权限并验证网页：${chosen.url}`);
    (async () => {
      await permission;
      if (disposed) throw {code:'E_HOST_CLOSED',message:'Sidebar 已关闭，未启动任务'};
      await currentPageTarget.revalidate(chosen.candidate);
      // Preserve the original trusted-click author snapshot while compiling.
      // Authority still receives the exact `sourceUtf8` that will execute, via
      // the same draft admission, immutable revision hash and original RunHost.
      const authorSourceUtf8=sourceUtf8;
      if(esm){
        const check=()=>{if(disposed||ticket!==browserPrepareGeneration||
          programSource.source()!==authorSourceUtf8||scriptId()!==id||
          programSource.kind()!==runKind||componentMode!=='javascript'||
          localProject?.active())
          throw {code:'E_CONTROLLER_ESM_STALE',message:'源码、程序、目标或运行模式已变化；不会启动过期代码'};};
        const prepared=await prepareControllerESM(authorSourceUtf8,id,check);check();
        sourceUtf8=controllerRevisions.savedControllerSource(authorSourceUtf8,prepared.built.sourceUtf8);
        browserPreparing=false;update();
      }else if(classic){
        const check=()=>{if(disposed||ticket!==browserPrepareGeneration||programSource.source()!==authorSourceUtf8||scriptId()!==id)
          throw {code:'E_CONTROLLER_CLASSIC_STALE',message:'源码已变化或准备已取消，不启动过期 Classic'};};
        const prepared=await client.request('prepareControllerClassicDependencies',{
          programId:id,sourceUtf8:authorSourceUtf8,explicitUserAction:true,allowDownload:true});check();
        if(prepared.world!=='CONTROLLER'||prepared.programId!==id||
          prepared.authorSourceHash!==await digestUtf8(authorSourceUtf8)||
          !/^controller-classic-[a-f0-9]{64}$/.test(prepared.lockId))
          throw {code:'E_CONTROLLER_CLASSIC_LOCK',message:'固定 Classic 版本或技术锁无效'};
        sourceUtf8=controllerRevisions.savedControllerSource(authorSourceUtf8,prepared.sourceUtf8);
        browserPreparing=false;update();
      }
      const claim = await host.start({source:{kind:'draft',sourceUtf8},
        params, target:chosen.target, deadlineAt:Date.now() + 30000});
      admittedRunId = claim.runId;
      ownedDraftRunId = claim.runId;
      if (disposed) return;
      patchDeveloperField(view,find('script-run-id'),{value:claim.runId});
      renderTask(claim);
      display('running', '已接受冻结草稿；等待脚本结束及持久结果');
      update();
      const result = await host.completion;
      if (result.error) throw result.error;
    })().catch(error => {startError=error;admittedRunId ||= error.runId;fail(error);}).finally(async () => {
      running = false;browserPreparing=false;
      if (disposed) return;
      if (admittedRunId) patchDeveloperField(view,find('script-run-id'),{value:admittedRunId});
      // Observe all durable history; association comes from the admitted run,
      // never from an editable runId or the editor's current revision.
      try {await read('');}
      catch (error) {projection=undefined;display('unknown',`后台状态待确认：${error.code || 'E_EFFECT_UNKNOWN'}`);}
      if (startError) fail(startError);
      update();
    });
  }
  function startLocal(event){
    if(!event.isTrusted||!localAdapter||!projection?.slotAvailable||!localProject.canAttemptRun()||currentPageState?.status!=='available')return;
    let captured,binding,paramsText,permission;
    try{
      binding=localProject.capture();captured=currentPageTarget.capture();paramsText=find('local-project-params').value;
      permission=requireChromePermissions({api,request:{origins:[permissionPattern(captured.url)],...(find('script-allow-cookies').checked?{permissions:['cookies']}:{})}});
    }catch(error){fail(error);return;}
    hideUserScriptsRecovery();
    let admittedRunId,page=false,startError;
    ownedDraftRunId=null;localPageResult=null;localInstaller.reset();running=true;renderTask(null);update();beginResult();
    patchDeveloperField(view,find('developer-results-panel'),{open:true});display('resolving','正在读取本地项目的当前源码…');
    (async()=>{
      await permission;
      if(disposed)throw {code:'E_HOST_CLOSED',message:'Sidebar 已关闭，本次未运行'};
      const source=await localProject.resolve(binding);
      await currentPageTarget.revalidate(captured);await localProject.assertReady(binding,source.sourceHash);localProject.assertCaptured(binding);
      if(disposed)throw {code:'E_HOST_CLOSED',message:'Sidebar 已关闭，本次未运行'};
      if(stopping||editingBusy||previewBusy||!projection?.slotAvailable||host.currentRun)
        throw {code:'E_RUN_ACTIVE',message:'运行状态已变化；请等待当前任务释放后重新运行'};
      page=source.runtimeKind==='page-userscript';
      const params=page?{}:JSON.parse(paramsText);
      if(!localProjectAllowsOrigin(source,captured.origin))throw {code:'E_DEV_ORIGIN',message:'当前网站不在本地项目的允许范围内；请检查项目 siteOrigins（所有网页使用 ["<all_urls>"]）'};
      if(!page&&source.paramsSchema)validateTaskParams(source.paramsSchema,params);
      const {status:ignored,...target}=captured;
      const claim=await localAdapter.handle({method:page?'page.preview':'run.start',requestId:crypto.randomUUID(),params:{
        sourceHash:source.sourceHash,sourceBytes:source.sourceBytes,target,
          ...(page?{sourceUtf8:source.sourceUtf8,entryFormat:source.entryFormat,bindingId:source.bindingId,...(source.managedUI?{managedUI:true}:{}),...(source.pageRules?{pageRules:source.pageRules}:{})}:
          {source:{kind:'draft',sourceUtf8:source.sourceUtf8},params,deadlineMs:30000})}});
      if(page){
        patchDeveloperField(view,find('script-task-id'),{textContent:'previewId：'+claim.previewId});
        patchDeveloperField(view,find('script-task-version'),{textContent:'Page USER_SCRIPT · SHA-256 '+source.sourceHash});
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
        localInstaller.succeeded({source,binding,target:captured,previewId:claim.previewId});
        display('completed',source.managedUI?'本地 Page 预览已完成；再次运行会先清理旧受管 UI。':'本地 Page 预览已完成；网页 UI 由项目管理。');
        const valueText=result.result?.resultText ?? 'undefined';
        setResultText(valueText);setResultKind('本地 Page · 本次结果');
        patchDeveloperField(view,copyResult,{disabled:false});patchDeveloperField(view,find('developer-results-panel'),{open:true});
        patchDeveloperField(view,pageTechnicalPanel,{hidden:false});patchDeveloperField(view,pageTechnicalPanel,{open:false});
        patchDeveloperField(view,pageTechnical,{textContent:'源码 SHA-256：'+source.sourceHash});
      }else{
        admittedRunId=ownedDraftRunId=claim.runId;
        if(disposed)return;
        patchDeveloperField(view,find('script-run-id'),{value:claim.runId});renderTask(claim);
        display('running','已运行本地源码快照；修改文件只影响下一次运行');update();
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
          localInstaller.succeeded({source,binding,target:captured,runId:claim.runId,resultId:returned.resultId});
      }
    })().catch(error=>{
      startError=error;admittedRunId||=error.runId;localPageResult=null;localInstaller.reset();fail(error);
      if(page||!admittedRunId){
        setResultText(formatTaskError(error));
        setResultKind(page?'本地 Page · 执行失败':'本地项目 · 未启动');
        patchDeveloperField(view,copyResult,{disabled:true});patchDeveloperField(view,find('developer-results-panel'),{open:true});
      }
    }).finally(async()=>{
      running=false;if(disposed)return;
      if(admittedRunId)patchDeveloperField(view,find('script-run-id'),{value:admittedRunId});
      try{if(page)projection=await host.controller.snapshotControllerRun({});else await read('');}catch{projection=undefined;}
      if(startError)fail(startError);update();
    });
  }
  function previewMatchesEditor(previous){
    return !!previous&&programSource.source()===(previous.authoringSourceUtf8??previous.sourceUtf8)&&
      (previous.programId===undefined||scriptId()===previous.programId)&&
      (previous.componentMode===undefined||componentMode===previous.componentMode);
  }
  function isComponentDraft(){return componentMode!=='javascript'||programSource.snapshot()?.project.entryMode==='component';}
  function isPageDraft(){return componentMode==='javascript'&&
    (javascriptWorld==='page'||loadedPageSource||programSource.kind()==='page-userscript');}
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
    if (!event.isTrusted || disposed || stopping || previewBusy ||
      componentRemote?.busy || (componentMode==='javascript'&&dependencyResolver?.busy) ||
      (componentMode==='javascript'&&(!dependencyResolver?.sourceFormat&&!dependencyInstaller?.readyForRun)) ||
      editingBusy || running || host.currentRun) return;
    if(localProject?.active())return;
    let captured, permission, pageSource,componentSnapshot,frozenComponent,fixedFrameSource,prepareTicket;
    const runKind=programSource.kind();
    const displayPreview=(state,message,result)=>{
      if(disposed)return;
      patchDeveloperField(view,pagePreviewStatus,{data:{...pagePreviewStatus.data,state},textContent:message});
      display(state,message);
      if(state==='error' && message.startsWith('E_USER_SCRIPTS_UNAVAILABLE')) showUserScriptsRecovery();
      else if(state==='error' && message.startsWith('E_USER_SCRIPTS_NATIVE')) showUserScriptsRecovery('error', message);
      else if(state==='completed') hideUserScriptsRecovery();
      setResultText(state==='running'?'正在运行…':state==='error'?'本次网页试运行失败，未产生可显示的返回值':result??'undefined');
      setResultKind(state==='completed'?'网页试运行结果':state==='error'?'网页试运行失败':'等待网页返回值');
      patchDeveloperField(view,copyResult,{disabled:state!=='completed'});
      patchDeveloperField(view,find('developer-results-panel'),{open:true});
    };
    try {
      captured=currentPageTarget.capture();
      if (programSource.kind() === 'controller') throw {code:'E_PROGRAM_KIND',message:'这是 Controller 项目，请使用「运行」'};
      const artifact=programSource.snapshot();
      if(componentMode!=='javascript'&&!artifact){
        if(!browserCompilerEnabled)throw {code:'E_PAGE_COMPILER_UNAVAILABLE',
          message:'标准版不附带浏览器 JSX/SFC 编译器；请使用本地开发工具或独立 Developer Edition'};
        componentSnapshot={framework:componentMode,source:programSource.source()};
        if(!componentSnapshot.source.trim())throw {code:'E_SOURCE',message:'请输入组件源码'};
      }else{
        pageSource=dependencyResolver.captureForRun();
        if(!pageSource.sourceUtf8.trim())throw {code:'E_SOURCE',message:'请输入 JavaScript 源码'};
        if(artifact?.project.entryMode==='component'){
          const framework=/^\/\/ @opendesk-lib (react|vue)\s*$/m.exec(pageSource.sourceUtf8)?.[1];
          if(!framework)throw {code:'E_PROGRAM_DRAFT',message:'固定组件缺少唯一框架身份'};
          frozenComponent={framework,source:pageSource.sourceUtf8,sourceHash:artifact.build.sourceHash,projectId:artifact.project.id};
        }else if(loadedPageSource||!pageSource.sourceFormat&&inspectPageFrameSource(pageSource.sourceUtf8)?.resources.length){
          // Explicitly loaded Page bytes keep their Page world and managed
          // lifecycle; reopening a frozen Vue/React version needs no compiler.
          // Fixed child resources need the same host-owned lifecycle as a
          // component, but their verified JavaScript is never recompiled.
          fixedFrameSource={source:pageSource.sourceUtf8};
        }
      }
      if((componentSnapshot||frozenComponent||fixedFrameSource)&&(!!browserUnknownTarget||browserManagedPreview?.recoveredOnly))
        throw {code:'E_EFFECT_UNKNOWN',message:'上次受管运行仍需清理；已查询到的原回执只用于停止，不会自动重新运行'};
      // Source permission is requested synchronously from this trusted Run
      // gesture if the editor has already observed a missing Chrome grant.
      // Website permission remains independently read-only/Authority gated.
      permission=Promise.all([
        requireChromePermissions({api,request:{origins:[permissionPattern(captured.url)]}}),
        componentMode==='javascript'?
          (dependencyResolver.sourceFormat?dependencyReview.confirmRun(event):dependencyInstaller.confirmRun(event)):
          componentSnapshot?componentRemote.confirmRun(event,{
            componentSource:componentSnapshot.source,framework:componentSnapshot.framework}):Promise.resolve(true)
      ]);
    } catch(error) {displayPreview('error',(error.code||'E_SOURCE')+'：'+(error.message||error));return;}
    const managedInput=componentSnapshot||frozenComponent||fixedFrameSource;
    prepareTicket=++browserPrepareGeneration;
    if(managedInput)browserPreparing=true;
    const assertPreparation=()=>{
      if(disposed||prepareTicket!==browserPrepareGeneration)
        throw {code:'E_PAGE_COMPILER_STALE',message:'组件准备已取消；迟到结果不会运行'};
      if(programSource.source()!==managedInput.source||componentSnapshot&&componentMode!==componentSnapshot.framework)
        throw {code:'E_PAGE_COMPILER_STALE',message:'组件源码或框架已变化；旧结果不会运行'};
      if(fixedFrameSource&&(componentMode!=='javascript'||programSource.kind()!==runKind))
        throw {code:'E_DEPENDENCY_STALE',message:'网页草稿或运行模式已变化；不会执行旧代码'};
    };
    lastPagePreview=null;previewBusy=true;update();patchDeveloperField(view,pageTechnicalPanel,{hidden:true});patchDeveloperField(view,pageTechnical,{textContent:''});
    displayPreview('running','正在核对当前文档与固定源码…','');
    (async()=>{
      await permission;
      if(disposed)throw {code:'E_HOST_CLOSED',message:'工作台已关闭'};
      if(managedInput)assertPreparation();
      await currentPageTarget.revalidate(captured);
      if(managedInput){
        assertPreparation();
        if(fixedFrameSource)pageSource=await dependencyResolver.resolveForRun(pageSource,assertPreparation);
        const built=await prepareManagedSource(managedInput,captured,assertPreparation,{frozen:!!frozenComponent||!!fixedFrameSource,entryFormat:pageSource?.entryFormat});
        await currentPageTarget.revalidate(captured);assertPreparation();
        const previewId=crypto.randomUUID(),managedUI={previewId,bindingId:browserBinding,enabled:true};
        const identity={previewId,bindingId:browserBinding,target:captured,sourceHash:built.sourceHash,
          ...(managedInput.framework?{framework:managedInput.framework}:{})};
        browserPreparing=false;update(); // No further compile cancellation can undo a dispatched native effect.
        let result;
        try{
          result=await client.request('previewPageScript',{
            sourceUtf8:built.sourceUtf8,entryFormat:built.entryFormat,lockId:pageSource?.lockId??null,
            ...(pageSource?.programId!==undefined?{programId:pageSource.programId}:{}),
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
                browserManagedPreview={...identity,recoveredOnly:true};browserUnknownTarget=null;
                error.previewRecovered=true;
                patchDeveloperField(view,pageTechnicalPanel,{hidden:false});patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify({originalPreview:observed},null,2)});
              }
            }catch{} // No original completion remains unknown; never dispatch again.
          }
          throw error;
        }
        browserManagedPreview=identity;
        await currentPageTarget.revalidate(captured);
        lastPagePreview={sourceUtf8:built.sourceUtf8,entryFormat:built.entryFormat,lockId:pageSource?.lockId??null,
          ...(pageSource?.programId!==undefined?{programId:pageSource.programId}:{}),
          importSourceUrl:pageSource?.importSourceUrl??null,authoringSourceUtf8:managedInput.source,componentMode,
          previewUrl:captured.url,documentId:captured.documentId,tabId:captured.tabId,target:captured,
          sourceHash:built.sourceHash,previewId};
        const editorChanged=!previewMatchesEditor(lastPagePreview);
        if(!fixedFrameSource)componentMessage('completed',editorChanged?'旧源码已运行，但编辑内容已变化；先停止旧组件，再运行最新源码':
          '组件已运行 · 可停止或保存固定版本 · 保存不会自动运行或安装');
        displayPreview('completed',fixedFrameSource?
          '当前精确文档试运行完成；不是正式 Task 结果。可保存待验证 Page 候选；不会自动安装。':
          '组件已在当前网页运行；停止可清理受管 UI。可保存固定版本并单独审阅安装。',result.resultText ?? 'undefined');
        patchDeveloperField(view,pageTechnicalPanel,{hidden:false});patchDeveloperField(view,pageTechnicalPanel,{open:false});
        patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify({...result,authoring:{framework:built.framework,compilerVersion:built.compilerVersion,
          sourceHash:built.sourceHash,cacheHit:built.cacheHit,prepareMs:built.prepareMs,remoteModules:built.remoteModules||[]}},null,2)});
        return;
      }
      const checkPage=()=>{if(disposed||prepareTicket!==browserPrepareGeneration)
        throw {code:'E_DEPENDENCY_STALE',message:'网页草稿已变化或准备取消；不会执行旧代码'};};
      pageSource=await dependencyResolver.resolveForRun(pageSource,checkPage);
      await currentPageTarget.revalidate(captured);checkPage();
      let executable=pageSource;
      if(pageSource.sourceFormat) {
        const built=await dependencyResolver.compile(pageSource);
        if(disposed||programSource.source()!==pageSource.sourceUtf8||programSource.kind()!==runKind||
          componentMode!=='javascript'||localProject?.active())
          throw {code:'E_STATIC_ESM_STALE',message:'离线编译期间作者源码或运行模式已变化'};
        await currentPageTarget.revalidate(captured);
        if(disposed||programSource.source()!==pageSource.sourceUtf8||programSource.kind()!==runKind||
          componentMode!=='javascript'||localProject?.active()||
          dependencyResolver.capture({sourceFormat:'esm-page'}).version!==pageSource.version)
          throw {code:'E_STATIC_ESM_STALE',message:'最终核对时作者源码、运行世界或批准锁已变化'};
        executable={sourceUtf8:built.sourceUtf8,entryFormat:'async-main',lockId:null,sourceHash:built.sourceHash};
        pageSource={...pageSource,compiledSourceUtf8:built.sourceUtf8,compilerVersion:built.compilerVersion};
      }
      const {sourceHash:compiledHash,...previewSource}=executable;
      const result=await client.request('previewPageScript',{
        ...previewSource,
        ...(pageSource.programId!==undefined?{programId:pageSource.programId}:{}),
        ...(pageSource.sourceFormat?{authorSourceUtf8:pageSource.sourceUtf8,authorLockId:pageSource.lockId,
          authorManifestDigest:pageSource.manifestDigest,compilerVersion:pageSource.compilerVersion}:{}),
        target:{tabId:captured.tabId,frameId:0,documentId:captured.documentId,
          expectedUrl:captured.url,expectedWindowId:captured.windowId}});
      if(pageSource.sourceFormat&&(result.state!=='preview-evaluated'||result.sourceHash!==compiledHash))
        throw {code:'E_STATIC_ESM_OUTPUT',message:'网页回执不属于本次固定编译产物'};
      lastPagePreview={sourceUtf8:pageSource.sourceUtf8,entryFormat:pageSource.entryFormat,
        lockId:pageSource.lockId,
        ...(pageSource.programId!==undefined?{programId:pageSource.programId,dependencyScope:'program'}:{}),
        importSourceUrl:pageSource.importSourceUrl??null,previewUrl:captured.url,documentId:captured.documentId,
        tabId:captured.tabId,target:captured,sourceHash:result.sourceHash,
        ...(pageSource.sourceFormat?{sourceFormat:pageSource.sourceFormat,
          compiledSourceUtf8:pageSource.compiledSourceUtf8,compilerVersion:pageSource.compilerVersion}:{})};
      displayPreview('completed',pageSource.sourceFormat?
        '当前精确文档试运行完成；可保存作者 import 源码、批准依赖锁与固定编译产物。保存不会自动安装。':
        '当前精确文档试运行完成；不是正式 Task 结果。可保存待验证 Page 候选；不会自动安装。',
        result.resultText ?? 'undefined');
      patchDeveloperField(view,pageTechnicalPanel,{hidden:false});patchDeveloperField(view,pageTechnicalPanel,{open:false});
        patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify(result,null,2)});
    })().catch(error=>{
      const recovered=error.previewRecovered?'；已读取原完成回执，可以停止原组件。未重放运行。':'';
      displayPreview('error',(error.code||'E_PAGE_SCRIPT_EXECUTION')+'：'+(error.message||error)+recovered,'');
      if(componentSnapshot||frozenComponent)componentMessage('error',(error.code||'E_PAGE_COMPILER')+'：'+(error.message||error)+recovered);
      if(error.response?.state==='preview-failed'){
        patchDeveloperField(view,pageTechnicalPanel,{hidden:false});patchDeveloperField(view,pageTechnicalPanel,{open:false});patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify(error.response,null,2)});
      }
    }).finally(()=>{browserPreparing=false;previewBusy=false;update();});
  }
  async function prepareManagedSource(input,captured,check,{frozen=false,entryFormat='async-main'}={}){
    if(frozen){
      // Frozen JSON and fixed frame JavaScript execute their verified bytes;
      // source snapshots remain data and do not select a framework compiler.
      await validatePageSource(input.source,{plainLimit:100000});check();
      const sourceHash=input.sourceHash??await digestUtf8(input.source);check();
      return {sourceUtf8:input.source,sourceHash,entryFormat,framework:input.framework,
        projectId:input.projectId,compilerVersion:'frozen-json',cacheHit:true,prepareMs:0};
    }
    const compilerInput={componentSource:input.source,framework:input.framework};
    try{
      const remoteSnapshot=await componentRemote.autoLoadForRun(compilerInput,check);check();
      const url=new URL(captured.url),projectId='browser-'+input.framework;
      const pageRules={matches:[url.origin+url.pathname+'*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
      const built=await browserPreparer.prepare({...compilerInput,projectId,pageRules,remoteSnapshot});check();
      return built;
    }finally{componentRemote.resumeRunPermissionWarm();}

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
    if(!isComponentDraft()&&hasUnbuiltESM(programSource.source())&&previous.sourceFormat!=='esm-page')
      throw {code:'E_STATIC_ESM_IDENTITY',message:'请先准备并试运行当前作者 import 源码'};
    const programId=scriptId(),revision=revisionText?Number(revisionText):1;
    if(!previewMatchesEditor(previous))
      throw {code:'E_REVISION',message:'源码已经修改，请重新试运行后保存'};
    // Only editable JSX/SFC has component author metadata. Frozen drafts and
    // managed JavaScript retain their exact executable source instead.
    const {authoringSourceUtf8,...candidate}=previous;
    const prepared=preparePageCandidateDraft({...candidate,programId,revision,
      ...(['react','vue'].includes(previous.componentMode)?{authoringSourceUtf8}:{})});
    editingBusy=true;update();
    try {
      await currentPageTarget.revalidate(previous.target);
      const saved=await client.request('importPageCandidate',prepared.request);
      if(saved?.stage!=='Candidate'||typeof saved.candidateId!=='string'||typeof saved.manifestHash!=='string')
        throw {code:'E_PAGE_CANDIDATE',message:'未收到可信的固定候选身份'};
      const changed=!previewMatchesEditor(previous)||scriptId()!==programId||
        find('script-revision').value.trim()!==revisionText;
      const status=find('page-candidate-status');
      patchDeveloperField(view,status,{data:{...status.data,state:'saved'}});
      patchDeveloperField(view,status,{textContent:`已保存 Page Candidate：${programId} · r${revision} · ${saved.manifestHash.slice(0,12)}…。`+
        ' '+prepared.summary+
        (changed?' 保存期间编辑器已变化，请重新核对当前版本。':'')+
        ' 请在已保存网页脚本中验证冻结版本，再明确安装。'});
      await pageLibrary.refresh(programId+':'+revision);
    }finally{editingBusy=false;update();}
  }
  dependencyResolver=createPageDependencyResolver({client,getSource:programSource.source,
    preparer:staticESMPreparer,getProgramId:scriptId,onState:update});

  dependencyReview=createPageDependencyReview({client,resolver:dependencyResolver,api,document:doc,view,
    getSource:programSource.source,onState:update,
    isAvailable:()=>componentMode==='javascript'&&!localProject?.active()&&!programSource.snapshot()&&
      !editingBusy&&!running&&!previewBusy&&!stopping&&!host.currentRun});

  dependencyInstaller=createPageDependencyInstaller({client,api,document:doc,view,resolver:dependencyResolver,
    getSource:programSource.source,getProgramId:scriptId,
    isVisible:()=>componentMode==='javascript'&&!localProject?.active()&&programSource.kind()!=='controller',
    isBlocked:()=>disposed||editingBusy||previewBusy||running||stopping||!!host.currentRun,
    onState:update});
  componentRemote=createPageComponentRemote({client,preparer:browserPreparer,api,document:doc,view,
    getInput:()=>{
      const source=programSource.source();
      return componentMode==='javascript'&&browserCompilerEnabled&&!localProject?.active()&&
        !programSource.snapshot()&&hasUnbuiltESM(source)?
        controllerESMInput(source,scriptId()):
        {componentSource:source,framework:localProject?.active()||programSource.snapshot()?'javascript':componentMode};
    },
    isBlocked:()=>editingBusy||previewBusy||running||stopping||!!host.currentRun,onState:update});
  const pageLibrary=createPageProgramLibrary({client,currentPageTarget,api,document:doc,view,onLoad:async row=>{
    const loadBlocked=()=>editingBusy||running||previewBusy||stopping||host.currentRun||
      browserManagedPreview||!!browserUnknownTarget||localProject?.active()||programSource.snapshot();
    if(loadBlocked())throw {code:'E_BUSY',message:'请先停止当前运行并切换为直接编辑'};
    const source=programSource.source(),activeId=scriptId(),revisionText=find('script-revision').value,
      editorTicket=browserPrepareGeneration,previousMode=componentMode,previousWorld=javascriptWorld;
    const saved=await client.request('getPageCandidate',{programId:row.programId,revision:row.revision});
    const changed=()=>disposed||loadBlocked()||editorTicket!==browserPrepareGeneration||
      source!==programSource.source()||activeId!==scriptId()||revisionText!==find('script-revision').value||
      previousMode!==componentMode||previousWorld!==javascriptWorld;
    if(changed())throw {code:'E_REVISION',message:'加载期间编辑器已变化，请重新核对'};
    const authoring=await validatePageCandidateAuthoring(saved);
    if(changed())throw {code:'E_REVISION',message:'加载期间编辑器已变化，请重新核对'};
    loadedPageSource=true;componentMode=authoring?.framework??'javascript';javascriptWorld='page';syncComponentInputs();
    programSource.replaceSource(authoring?.sourceUtf8??saved.authorSourceUtf8??saved.sourceUtf8);
    patchDeveloperField(view,find('script-id'),{value:row.programId});
    patchDeveloperField(view,find('script-revision'),{value:String(row.revision)});lastPagePreview=null;
    if(saved.manifest?.compilation)await dependencyResolver.restore(saved.manifest.compilation);
    else dependencyResolver.refresh();
    browserPreparer.cancel();browserPrepareGeneration++;
    dependencyInstaller.refresh();componentRemote.refresh();
    update();
  }});
  const onRemoved = tabId => {
    // Closing the exact owning tab proves its document is gone. Merely
    // selecting a different tab is never evidence of successful Stop.
    if(browserManagedPreview?.target.tabId===tabId){
      browserManagedPreview=null;
      componentMessage('idle','原组件所属标签页已关闭；下次运行仍需明确授权');
    }
    if(browserUnknownTarget?.tabId===tabId){
      browserUnknownTarget=null;
    }
    update();
  };
  const on = (id, event, operation) => listen(find(id), event, () => Promise.resolve().then(operation).catch(fail));
  const edit = operation => async () => {
    if(editingBusy || disposed) return;
    if(localProject?.active())throw {code:'E_DEV_MODE',message:'请先切换到直接编辑模式'};
    editingBusy = true; update();
    try {await operation();} finally {editingBusy = false; update();}
  };
  listen(find('script-save-version'),'click',event=>{
    if(!event?.isTrusted||disposed||localProject?.active()||isPageDraft()||isComponentDraft())return;
    edit(controllerRevisions.save)().catch(fail);
  });
  listen(find('script-save'),'click',event=>{
    if(!event?.isTrusted||disposed||!localProject?.active())return;
    Promise.resolve().then(()=>localInstaller.prepare()).catch(fail);
  });
  on('script-load','click',edit(controllerRevisions.load)); on('script-list-load','click',edit(controllerRevisions.loadLatest));
  on('script-read','click',()=>read('')); on('script-delete','click',edit(()=>controllerRevisions.remove())); on('script-list-refresh','click',()=>controllerRevisions.refresh().catch(fail));
  on('script-read-run','click',()=>read());
  on('script-history-open','click',()=>read(find('script-history-run').value));
  on('script-history-run','change',()=>{patchDeveloperField(view,find('script-history-open'),{disabled:!find('script-history-run').value});});
  on('script-copy-result','click',async () => {
    if (disposed || copyResult.disabled) return;
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await globalThis.navigator.clipboard.writeText(output.textContent);
      if (!disposed) displayCopyResult('已复制');
    } catch {
      if (disposed) return;
      displayCopyResult('无法自动复制');
      patchDeveloperField(view,copyResult,{title:'请选中返回值后手动复制'});
    }
  });
  on('script-download','click',resultDownloads.downloadResult); on('script-download-result','change',resultDownloads.update);
  // Native radio input events work with genuine pointer, Tab and arrow-key
  // interaction on macOS; no scripted change or OS-native popup is needed.
  // The fieldset disables all choices during preparation or an active project.
  function chooseComponentMode(next){
    if(next===componentMode)return;
    if(next!=='javascript'&&!browserCompilerEnabled){syncComponentInputs();return;}
    if(frameworkBusy()){
      syncComponentInputs();
      componentMessage('error','请先结束当前运行、保存或准备并停止受管组件，再切换代码类型');
      return;
    }
    componentMode=next;
    // Code type changes execution intent, never the current textarea bytes.
    loadedPageSource=false;lastPagePreview=null;
    syncComponentInputs();
    sourceInput();
    componentMessage('idle',next==='javascript'?'':'已切换代码类型；当前源码保持不变');
  }
  function chooseJavascriptWorld(next){
    if(next===javascriptWorld)return;
    if(!['controller','page'].includes(next)||disposed||componentMode!=='javascript'||frameworkBusy()){
      componentMessage('error','请先结束当前执行或退出已导入的固定源码视图，再切换执行环境');
      update();return;
    }
    javascriptWorld=next;loadedPageSource=false;lastPagePreview=null;
    // Controller and Page use one visible source, not two hidden buffers.
    sourceInput();
    componentMessage('idle',next==='page'?'网页 JavaScript 使用当前网页 DOM；运行前仍须网站授权':'');
  }
  const javascriptWorldSelect=find('script-javascript-world');
  function sourceInput(){
    browserPreparer.cancel();browserPrepareGeneration++;
    dependencyResolver.refresh();dependencyInstaller.refresh();componentRemote.refresh();
    scheduleControllerClassicWarm();
  }
  on('script-id','input',()=>{
    lastPagePreview=null;sourceInput();
  });
  on('script-revision','input',update);
  on('script-params','input',update);
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
    patchDeveloperField(view,scriptsCheck,{disabled:true});
    showUserScriptsRecovery('checking', '正在读取 Chrome 用户脚本能力（只检测，不申请权限）…');
    void inspectUserScriptsAccess(api).then(available => {
      if (disposed || sequence !== scriptsCheckSequence) return;
      showUserScriptsRecovery(available ? 'available' : 'blocked', available
        ? '能力初步检测通过。请主动点击「运行」；实际执行时仍会重新验证权限，不会自动重放此前任务。'
        : 'Chrome 仍未开放用户脚本能力。请在扩展详情启用「允许用户脚本」后重新检测。');
      if (available) return currentPageTarget?.refresh();
    }).catch(error => {
      if (disposed || sequence !== scriptsCheckSequence) return;
      showUserScriptsRecovery('error', `${error.code || 'E_USER_SCRIPTS_NATIVE'}：${error.message}`);
    }).finally(() => {
      if (!disposed && sequence === scriptsCheckSequence) patchDeveloperField(view,scriptsCheck,{disabled:false});
    });
  });
  const candidateSaveButton=find('page-candidate-save');
  if(candidateSaveButton)listen(candidateSaveButton,'click',event=>{
    if(!event.isTrusted)return;
    (isComponentDraft()?savePreparedComponent():savePageCandidate()).catch(error=>{
      const node=find('page-candidate-status');patchDeveloperField(view,node,{data:{...node.data,state:'error'}});
      patchDeveloperField(view,node,{textContent:(error.code||'E_PAGE_CANDIDATE')+'：'+(error.message||error)});
    });
  });
  async function stop(){
    if(browserPreparing||controllerRevisions.preparing||componentRemote?.busy){
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
        if(!disposed)patchDeveloperField(view,pagePreviewStatus,{data:{...pagePreviewStatus.data,state:'completed'},textContent:'已停止 · 受管组件和样式已清理'});
        patchDeveloperField(view,pageTechnicalPanel,{hidden:false});patchDeveloperField(view,pageTechnicalPanel,{open:false});
        patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify({stop:result,framework:owned.framework},null,2)});
        display('completed','受管组件已清理；网页业务效果不会回滚。');
      }catch(error){
        if(error?.code==='E_DEV_RELOADING'){
          // Dispatch was explicitly rejected; retain the original Stop right.
          display('blocked','源码更新暂缓了停止请求；原组件仍可停止，请稍后重试。');
          return;
        }
        quarantineBrowserEffect(owned.target); // Uncertain Stop is document-bound; never blindly retry.
        componentMessage('error',(error.code||'E_UI_CLEANUP')+'：'+error.message+
          '；无法确认组件已清理，请重新加载目标网页');
        if(!disposed)patchDeveloperField(view,pagePreviewStatus,{data:{...pagePreviewStatus.data,state:'error'},textContent:'无法确认组件已清理，请重新加载目标网页'});
        patchDeveloperField(view,pageTechnicalPanel,{hidden:false,open:false});
        patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify({error:{
          code:error.code||'E_UI_CLEANUP',message:error.message||String(error)}},null,2)});
        throw error;
      }
      finally{stopping=false;update();}
      return;
    }
    if(canStopManaged()&&!stopping){
      const owned=ownedManagedPreview;stopping=true;update();display('stopping','正在清理原网页中的受管资源…');
      try{
        const result=await localAdapter.handle({method:'page.dispose',requestId:crypto.randomUUID(),params:{previewId:owned.previewId}});
        if(result?.previewId!==owned.previewId||result.sourceHash!==owned.sourceHash||
          result.state!=='preview-retired'||result.receipt?.ok!==true||result.receipt.scope!=='managed-ui-only')
          throw {code:'E_EFFECT_UNKNOWN',message:'受管清理回执未确认'};
        if(ownedManagedPreview===owned)ownedManagedPreview=null;
        localInstaller.reset();
        // Cleanup is a receipt for the original preview, including a failed
        // main. It remains meaningful if its source Provider has gone offline.
        localPageResult={kind:'stop',bindingId:owned.bindingId,previewId:owned.previewId,
          sourceHash:owned.sourceHash,tabId:owned.target.tabId,
          documentId:owned.target.documentId,url:owned.target.url};
        setResultText(JSON.stringify(result,null,2));setResultKind('本地 Page · 停止回执');
        patchDeveloperField(view,copyResult,{disabled:false});patchDeveloperField(view,find('developer-results-panel'),{open:true});
        patchDeveloperField(view,pageTechnicalPanel,{hidden:false});patchDeveloperField(view,pageTechnicalPanel,{open:false});
        patchDeveloperField(view,pageTechnical,{textContent:JSON.stringify({stop:result},null,2)});
        display('completed','受管 UI 已清理；网页业务效果不会回滚。');
      }finally{stopping=false;update();}
      return;
    }
    if (!ownedDraftRunId || host.currentRun !== ownedDraftRunId || stopping) return;
    stopping = true; update(); display('stopping','正在提交停止并等待持久收尾…');
    try {await host.stop({runId:ownedDraftRunId,controller:true});}
    finally {stopping = false; update();}
  }
  // View actions and standalone DOM consumers share these control handlers.
  {
    for(const [next,input] of Object.entries(componentInputs))if(input)
      listen(input,'change',event=>{
        if(!event?.isTrusted){syncComponentInputs();return;}
        if(input.checked)chooseComponentMode(next);
      });
    if(javascriptWorldSelect)listen(javascriptWorldSelect,'change',event=>{
      if(!event?.isTrusted){update();return;}
      chooseJavascriptWorld(javascriptWorldSelect.value);
    });
    on('script-source','input',sourceInput);
    listen(find('script-run'),'click',start);
    on('script-stop','click',stop);
  }
  api.tabs.onRemoved.addListener(onRemoved);
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
  controllerRevisions.refresh({silent: true}).catch(fail); update();
  function applyImported(sourceUtf8) {
    const pageImport=programSource.kind()==='page-userscript'||sourceUtf8.startsWith(PAGE_BUNDLE_PREFIX);
    loadedPageSource=pageImport;componentMode='javascript';javascriptWorld=pageImport?'page':'controller';syncComponentInputs();
    controllerRevisions.clearCurrent();
    patchDeveloperField(view,find('script-id'),{value:`import-${Date.now()}`});
    patchDeveloperField(view,find('script-revision'),{value:''});
    programSource.replaceSource(sourceUtf8);
    sourceInput();
    display('draft','源码已导入，尚未保存为正式版本；请选择目标网页后点击运行');
  }
  scheduleControllerClassicWarm();
  return {host,model:view,async openRun(runId){
    invariant(typeof runId==='string'&&runId.trim()===runId&&runId.length>0&&runId.length<=200,
      'E_RUN','请选择有效的原始运行记录');
    await read(runId,{reveal:true});
  },async prepareDevelopmentReload(){
    // Preserve RunHost / Native / download idle gating during development
    // reload. There is no source backup or post-reload restoration.
    return !disposed&&!editingBusy&&!stopping&&!running&&!previewBusy&&
      !browserPreparing&&!componentRemote?.busy&&!ownedManagedPreview&&!browserManagedPreview&&
      !host.executionPending&&!host.currentRun&&!resultDownloads.busy()&&
      !client.resourceSnapshot?.().pending;
  },connectLocalProjects(adapter,{onInstalled}={}){
    if(localProject||!find('local-project-mode'))return;
    localAdapter=adapter;localInstaller.setOnInstalled(onInstalled);
    localProject=createLocalProjectView({client,api,document:doc,view,onChange:update});update();
  },executionSource:()=>{
    if(localProject?.active())throw {code:'E_DEV_MODE',message:'本地开发项目请通过正式打包流程创建已安装任务'};
    // Task candidates still compare the exact persisted executable and revision.
    const source=programSource.source();
    return controllerRevisions.executionSource(source);
  }, importDraft(sourceUtf8) {
    if(localProject?.active())throw {code:'E_DEV_MODE',message:'请先退出本地项目，切换到直接编辑后再导入'};
    if (disposed || editingBusy || previewBusy || componentRemote?.busy || browserManagedPreview) throw {code:'E_BUSY',message:'请先停止当前受管组件，再导入或保存版本'};
    if (sourceUtf8 && typeof sourceUtf8 === 'object') {
      const editorTicket=browserPrepareGeneration,original=programSource.source();
      editingBusy = true; update();
      return programSource.importProject(sourceUtf8,()=>!disposed&&editorTicket===browserPrepareGeneration&&original===programSource.source()).then(value => {
        if (disposed) throw {code:'E_HOST_CLOSED',message:'编辑器已关闭'};
        if(!value)throw {code:'E_SOURCE_CHANGED',message:'校验期间草稿已变化；不会覆盖最新编辑'};
        applyImported(value.sourceUtf8);
      }).finally(() => {editingBusy=false;if(!disposed)update();});
    }
    if(typeof sourceUtf8==='string'&&sourceUtf8.startsWith(PAGE_BUNDLE_PREFIX)){
      const editorTicket=browserPrepareGeneration,original=programSource.source();
      inspectPageSource(sourceUtf8,{plainLimit:100000});editingBusy=true;update();
      return validatePageSource(sourceUtf8,{plainLimit:100000}).then(()=>{
        if(disposed)throw {code:'E_HOST_CLOSED',message:'编辑器已关闭'};
        if(editorTicket!==browserPrepareGeneration||original!==programSource.source())
          throw {code:'E_SOURCE_CHANGED',message:'校验期间草稿已变化；不会覆盖最新编辑'};
        applyImported(sourceUtf8);
      }).finally(()=>{editingBusy=false;if(!disposed)update();});
    }
    if (typeof sourceUtf8 !== 'string' || !sourceUtf8.trim() || new TextEncoder().encode(sourceUtf8).length > 100000)
      throw {code:'E_LIMIT',message:'导入源码必须为非空 JavaScript，且不超过 100000 字节'};
    applyImported(sourceUtf8);
  }, resourceSnapshot: () => ({...host.resourceSnapshot(), editor:{
    timers:resultDownloads.resourceSnapshot().timers+Number(localPollTimer!=null),
    pending:resultDownloads.resourceSnapshot().pending, subscriptions:listeners.length+Number(!disposed)+Number(Boolean(unsubscribeCurrentPage))+(localProject?.resourceSnapshot().subscriptions||0)}}), dispose() {
    if (disposed) return; disposed = true; controllerRevisions.dispose();resultDownloads.dispose();controllerClassicConsent.dispose(); componentRemote.dispose(); browserPrepareGeneration++; browserPreparer.dispose();staticESMPreparer.dispose(); scriptsCheckSequence++; localInstaller.dispose();localProject?.dispose();pageLibrary.dispose();clearTimeout(localPollTimer);finishLocalPoll?.();dependencyReview.dispose();dependencyResolver.dispose();dependencyInstaller.dispose(); unsubscribeConnection?.(); unsubscribeCurrentPage?.(); unsubscribeRun();
    api.tabs.onRemoved.removeListener(onRemoved); if(!sharedRunHost)host.dispose();
    for (const remove of listeners) remove();
    listeners.length = 0;
  }};
}
