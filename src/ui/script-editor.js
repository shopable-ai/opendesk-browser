import {patchDeveloperField,developerAction} from './develop-view.js';
import {createControllerRevisionView} from './controller-revision-view.js';
import {createRunArtifactDownload} from './run-artifact-download.js';
import {createControllerResultsView} from './controller-results-view.js';
import {createControllerDraftRun,controllerESMInput} from './controller-draft-run.js';
import {createLocalProjectRun} from './local-project-run.js';
import {createRunHost} from '../run-host.js';
import {invariant, digestUtf8} from '../platform/protocol.js';
import {createPageDependencyResolver, dependencyMessage} from './page-dependencies.js';
import {createPageDependencyReview} from './page-dependency-review.js';
import {createPageDependencyInstaller} from './page-dependency-install.js';
import {validatePageCandidateAuthoring} from './page-candidate-source.js';
import {createPageCandidateActions} from './page-candidate-actions.js';
import {createProgramSourceView} from './program-source.js';
import {createPageComponentRemote} from './page-component-remote.js';
import {hasUnbuiltESM} from './esm-source-detector.js';
import {inspectPageSource,validatePageSource,PAGE_BUNDLE_PREFIX} from '../scripting/user-scripts/page-bundle.js';
import {createPagePreviewFlow} from './page-preview-flow.js';
import {createBrowserPageComponentPreparer} from './page-component-preparer.js';
import {createStaticESMPreparer} from './static-esm-preparer.js';
import {createLocalProjectView} from './local-project.js';
import {createLocalInstallUI} from './local-project-install-ui.js';
import {formatTaskError} from './task-run-diagnostics.js';
import {inspectUserScriptsAccess, userScriptsSettingsURL} from './user-scripts-access.js';
import {createPageProgramLibrary} from './page-program-library.js';
import {createControllerClassicReadiness} from './controller-classic-readiness.js';

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
  const scriptsRecovery = find('script-user-scripts-recovery');
  const scriptsRecoveryStatus = find('script-user-scripts-recovery-status');
  const scriptsSettings = find('script-user-scripts-settings');
  const scriptsCheck = find('script-user-scripts-check');
  const currentPageStatus = find('script-current-page-status'), currentPageHost = find('script-current-page-host'),
    currentPageDebug = find('script-current-page-debug');
  let editingBusy = false, pagePreviewFlow;
  const componentSelector=find('page-component-framework'),componentStatus=find('page-component-status');
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
  let componentMode='javascript',javascriptWorld='controller',loadedPageSource=false;
  let componentRemote,controllerRunner,candidatePreparing=false,browserPrepareGeneration=0;
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
  let localRunner=null;
  // The React view is the single presentation state. No duplicate result buffer.
  const setResultText=value=>patchDeveloperField(view,output,{textContent:value??''});
  const setResultKind=value=>patchDeveloperField(view,resultKind,{textContent:value??''});
  let currentPageState = currentPageTarget?.snapshot ?? {status:'unavailable',reason:'E_TARGET',message:'当前网页服务不可用'},
    disposed = false;
  // Execution owners retain mutable Run/Stop state. The editor only reads
  // their shared-slot occupancy to gate controls across environments.
  const isRunning=()=>!!controllerRunner?.running||!!localRunner?.running;
  const isStopping=()=>!!controllerRunner?.stopping||!!localRunner?.stopping||!!pagePreviewFlow?.stopping;
  const listeners = [];
  let dependencyResolver,dependencyReview,dependencyInstaller;
  let localProject;
  // Both field renderers share the original execution-ownership gate.
  const frameworkBusy=()=>editingBusy||isRunning()||isStopping()||pagePreviewFlow?.busy||candidatePreparing||
    !!host.currentRun||!!componentRemote?.busy||!!pagePreviewFlow?.managed||!!pagePreviewFlow?.unknown||
    !!localProject?.active()||!!programSource.snapshot();
  const localInstaller=createLocalInstallUI({client,api,doc,view,currentPageTarget,getProject:()=>localProject,readControllerRun:options=>host.controller.snapshotControllerRun(options),
    isBusy:()=>isRunning()||pagePreviewFlow?.busy||isStopping(),retireManagedPreview:args=>localRunner.retireManagedPreviewForInstall(args),onState:()=>update()});
  const listen = (element, event, listener) => {
    listeners.push(developerAction(view,element,event,listener));
  };
  const programSource = createProgramSourceView({view,listen,onChange:() => {
    // New Script explicitly exits the imported read-only package view.
    loadedPageSource=false;componentMode='javascript';javascriptWorld='controller';syncComponentInputs();
    sourceInput();
  }});
  const controllerRevisions=createControllerRevisionView({host,client,view,programSource,
    prepareESM:(...args)=>controllerRunner.prepareESM(...args),getGeneration:()=>browserPrepareGeneration,onUpdate:update,onStatus:display,
    onLoad:source=>{
      loadedPageSource=false;componentMode='javascript';javascriptWorld='controller';syncComponentInputs();
      pagePreviewFlow?.clearLast();componentMessage('idle','');
      programSource.replaceSource(source);sourceInput();
    }});
  const resultDownloads=createRunArtifactDownload({client,host,document:doc,view,onState:update});
  const controllerResults=createControllerResultsView({host,view,resultDownloads,
    isDisposed:()=>disposed,isRunning,getOwnedRunId:()=>controllerRunner?.ownedRunId||localRunner?.ownedRunId,
    isLocalPageResultCurrent:args=>localRunner?.pageResultIsCurrent(args)??false,onUpdate:update,onStatus:display,
    setResultText,setResultKind,displayCopyResult,
    showRecovery:showUserScriptsRecovery,hideRecovery:hideUserScriptsRecovery});

  const controllerClassic=createControllerClassicReadiness({api,getSource:programSource.source,
    isCurrent:()=>componentMode==='javascript'&&!isPageDraft()&&!localProject?.active()&&
      !hasUnbuiltESM(programSource.source()),
    onState:update});

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
    if (isRunning()) {
      // Failed admission/preview is not a running script return value.
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
    const managed=pagePreviewFlow?.managed;
    return !!managed&&currentPageState?.status==='available'&&
      (managed.target.tabId!==currentPageState.tabId||managed.target.documentId!==currentPageState.documentId);
  }
  const canStopManaged=()=>!!pagePreviewFlow?.canStop()||!!localRunner?.canStopManaged();
  const canStopWaiting=()=>!!pagePreviewFlow?.canStopWaiting()||!!localRunner?.canStopWaiting();
  let updatedContext=null,projectedMode=null;
  function update() {
    if (disposed) return;
    const pageExecution=isComponentDraft()||isPageDraft(),local=!!localProject?.active(),source=programSource.source();
    const context=local?'local':componentMode!=='javascript'&&!programSource.snapshot()?'component':
      pageExecution?'page':hasUnbuiltESM(source)?'controller-esm':'controller';
    const changed=context!==updatedContext,previous=updatedContext;
    updatedContext=context;
    // One contextual refresh per relevant owner; mode changes still clear
    // the previous panel. Ordinary Run/Result does not refresh every manager.
    if(context==='component'||context==='controller-esm'||changed)componentRemote?.update();
    if(context==='page'||changed){dependencyReview?.update();dependencyInstaller?.update();}
    if(context==='local'||previous==='local')localInstaller.update();
    // A target refresh is pending evidence, not a confirmed document change.
    // Keep the original result, but do not expose it as current until resolved.
    if(context==='controller'||context==='controller-esm'||changed)
      controllerRevisions.update({busy:editingBusy||!!componentRemote?.busy,local,page:pageExecution});
    // Static mode presentation is not a Run/Stop side effect. Project it only
    // when the visible execution intent changes; keep live controls below.
    const modeProjection=JSON.stringify([componentMode,javascriptWorld,loadedPageSource,local,pageExecution,!!programSource.snapshot()]);
    if(modeProjection!==projectedMode){
      projectedMode=modeProjection;
      // Component status text/visibility changes are already owned by componentMessage().
      if(componentStatus)patchDeveloperField(view,componentStatus,{hidden:componentMode==='javascript'&&!componentStatus.textContent});
      if(find('script-javascript-world-row'))patchDeveloperField(view,find('script-javascript-world-row'),{hidden:componentMode!=='javascript'||!!localProject?.active()||!!programSource.snapshot()});
      view.patch('manual-project-params-tools',{hidden:pageExecution||local});
      view.patch('script-version-identity',{hidden:local});
      // Page tools depend on the environment, not on Run/Result updates.
      view.patch('page-preview-tools',{hidden:local||!pageExecution});
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
      view.patch('page-component-hint',{hidden:componentMode==='javascript'&&!isPageDraft()&&browserCompilerEnabled,
         textContent:componentMode==='javascript'?
        (isPageDraft()?'Page JavaScript 使用当前网页 DOM；Controller 使用 page 自动化 API，二者执行环境不同。':browserCompilerEnabled?
          '编辑源码不会自动执行；点击「运行」才执行。':
          '标准版支持 JavaScript；React/Vue 需要 Developer Edition。'):
        '切换代码类型不会替换当前源码；点击「运行」才执行。'});
    }
    const worldChoice=find('script-javascript-world');
    if(worldChoice)patchDeveloperField(view,worldChoice,{value:javascriptWorld,disabled:frameworkBusy()});
    const blocked=isStopping()||editingBusy||pagePreviewFlow?.busy||isRunning()||!controllerResults.projection?.slotAvailable||!!host.currentRun||currentPageState?.status!=='available';
    let runDisabled=blocked;
    if(local)runDisabled||=!localProject.canAttemptRun();
    else if(pageExecution)runDisabled||=!source.trim()||!!pagePreviewFlow?.unknown||pagePreviewFlow?.managed?.recoveredOnly||
      otherTabOwnsBrowserUI()||componentRemote?.busy||dependencyInstaller?.busy||programSource.kind()==='controller'||
      (componentMode==='javascript'?(dependencyResolver?.busy||
        (dependencyResolver?.sourceFormat?!dependencyReview?.readyForRun:!dependencyInstaller?.readyForRun)):!componentRemote?.readyForRun);
    else runDisabled||=!source.trim()||(browserCompilerEnabled&&context==='controller-esm'&&
      (componentRemote?.busy||!componentRemote?.readyForRun))||!controllerClassic.readyForRun();
    const preparing=candidatePreparing||pagePreviewFlow?.preparing||controllerRunner?.preparing||controllerRevisions.preparing||componentRemote?.busy;
    const stopDisabled = isStopping() || !preparing&&!canStopManaged()&&!canStopWaiting()&&
      (!localRunner?.ownedRunId || host.currentRun !== localRunner.ownedRunId)&&
      (!controllerRunner?.ownedRunId || host.currentRun !== controllerRunner.ownedRunId);
    const stopLabel=preparing?'取消准备':canStopWaiting()?'停止等待':canStopManaged()?'停止受管 UI':'停止';
    if(componentSelector)patchDeveloperField(view,componentSelector,{disabled:frameworkBusy()});
    const pageCandidateButton=find('page-candidate-save');
    if(pageCandidateButton)patchDeveloperField(view,pageCandidateButton,{disabled:!canSavePagePreview()&&!canPrepareComponentCandidate(),title:''});
    if(local&&find('task-create-candidate'))patchDeveloperField(view,find('task-create-candidate'),{disabled:true});
    {
      const runButton=find('script-run'),stopButton=find('script-stop');
      patchDeveloperField(view,runButton,{disabled:runDisabled,textContent:local?'运行本地项目':'运行'});
      patchDeveloperField(view,find('script-save'),{
        disabled:!localProject?.active()||editingBusy||isRunning()||isStopping()||pagePreviewFlow?.busy||!localInstaller.hasSelection(),
        textContent:localProject?.active()?localInstaller.saveLabel():'检查并保存本地项目'});
      patchDeveloperField(view,stopButton,{disabled:stopDisabled,hidden:local&&stopDisabled,textContent:stopLabel});
    }
  }
  function renderCurrentPage(next) {
    if (disposed) return;
    pagePreviewFlow.onTarget(next);
    currentPageState = next;
    localRunner?.refreshResultValidity();
    const available=next?.status==='available',resolving=next?.status==='resolving';
    const blockedProjection=controllerResults.projection;
    if(available&&blockedProjection?.slotAvailable===false&&!isRunning()&&!isStopping()&&!host.currentRun&&!pagePreviewFlow?.busy){
      // A removed preview's durable fence can be released outside this view.
      // Refresh admission only; preserve the current result and newer owners.
      void host.controller.snapshotControllerRun({}).then(snapshot=>{
        if(disposed||currentPageState!==next||controllerResults.projection!==blockedProjection||
          isRunning()||isStopping()||host.currentRun||pagePreviewFlow?.busy)return;
        controllerResults.setProjection(snapshot);update();
      }).catch(error=>{if(!disposed&&currentPageState===next&&controllerResults.projection===blockedProjection&&
        !isRunning()&&!isStopping()&&!host.currentRun&&!pagePreviewFlow?.busy)
        display('error',formatTaskError(error));});
    }
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
  function start(event){
    // Leave the original trusted click intact: each execution owner requests
    // Chrome permission synchronously before the first await.
    if(!event?.isTrusted||disposed||isStopping()||isRunning()||pagePreviewFlow?.busy||editingBusy||host.currentRun)return;
    if(localProject?.active()){localRunner?.run(event);return;}
    if(isComponentDraft()||isPageDraft()){
      if(controllerResults.projection?.slotAvailable)pagePreviewFlow.run(event);
      return;
    }
    controllerRunner.run(event);
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
    return isComponentDraft()&&!editingBusy&&!pagePreviewFlow?.busy&&!componentRemote?.busy&&!localProject?.active()&&
      !isRunning()&&!isStopping()&&!host.currentRun&&currentPageState?.status==='available'&&!!programSource.source().trim();
  }
  function canSavePagePreview(){
    const previous=pagePreviewFlow?.last,target=currentPageState;
    return !editingBusy&&!pagePreviewFlow?.busy&&!componentRemote?.busy&&!localProject?.active()&&previewMatchesEditor(previous)&&
      target?.status==='available'&&target.documentId===previous.documentId&&
      target.tabId===previous.tabId&&target.url===previous.previewUrl;
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
    const mode=componentMode,ticket=++browserPrepareGeneration;
    const check=()=>{
      if(disposed||ticket!==browserPrepareGeneration||programSource.source()!==source||componentMode!==mode)
        throw {code:'E_PAGE_COMPILER_STALE',message:'准备已取消或源码已变化；旧结果不会保存或运行'};
    };
    pagePreviewFlow.clearLast();editingBusy=true;candidatePreparing=true;update();
    componentMessage('preparing','正在离线准备固定 Candidate；此操作不会运行或安装网页脚本');
    let prepared;
    try{
      prepared=await pageCandidates.prepareComponent({source,artifact,mode,captured,check,prepareManagedSource});
      componentMessage('prepared','组件已准备；保存只创建 Candidate，尚未进行网页运行验收');
    }finally{editingBusy=false;candidatePreparing=false;update();}
    await savePageCandidate(prepared);
  }
  async function savePageCandidate(previous=pagePreviewFlow?.last){
    if(editingBusy||disposed||pagePreviewFlow?.busy||!previous||localProject?.active())return;
    const programId=scriptId(),revisionText=find('script-revision').value.trim();
    editingBusy=true;update();
    try{
      await pageCandidates.save({previous,source:programSource.source(),componentDraft:isComponentDraft(),
        programId,revisionText,stillCurrent:()=>previewMatchesEditor(previous)&&scriptId()===programId&&
          find('script-revision').value.trim()===revisionText});
    }finally{editingBusy=false;update();}
  }
  dependencyResolver=createPageDependencyResolver({client,getSource:programSource.source,
    preparer:staticESMPreparer,getProgramId:scriptId,onState:update,autoRefresh:false});

  dependencyReview=createPageDependencyReview({client,resolver:dependencyResolver,api,document:doc,view,
    getSource:programSource.source,onState:update,
    isAvailable:()=>isPageDraft()&&!localProject?.active()&&!programSource.snapshot()&&
      !editingBusy&&!isRunning()&&!pagePreviewFlow?.busy&&!isStopping()&&!host.currentRun});

  dependencyInstaller=createPageDependencyInstaller({client,api,document:doc,view,resolver:dependencyResolver,
    getSource:programSource.source,getProgramId:scriptId,
    isVisible:()=>isPageDraft()&&!localProject?.active()&&programSource.kind()!=='controller',
    isBlocked:()=>disposed||editingBusy||pagePreviewFlow?.busy||isRunning()||isStopping()||!!host.currentRun,
    onState:update});
  componentRemote=createPageComponentRemote({client,preparer:browserPreparer,api,document:doc,view,
    getInput:()=>{
      const source=programSource.source();
      return componentMode==='javascript'&&!isPageDraft()&&browserCompilerEnabled&&!localProject?.active()&&
        !programSource.snapshot()&&hasUnbuiltESM(source)?
        controllerESMInput(source,scriptId()):
        {componentSource:source,framework:localProject?.active()||programSource.snapshot()?'javascript':componentMode};
    },
    isBlocked:()=>editingBusy||pagePreviewFlow?.busy||isRunning()||isStopping()||!!host.currentRun,onState:update});
  controllerRunner=createControllerDraftRun({client,api,host,currentPageTarget,programSource,view,
    componentRemote,browserPreparer,controllerClassic,controllerResults,
    getRevisions:()=>controllerRevisions,browserCompilerEnabled,
    isDisposed:()=>disposed,isBlocked:()=>isStopping()||pagePreviewFlow?.busy||editingBusy||!!localProject?.active(),
    isControllerDraft:()=>componentMode==='javascript'&&!isPageDraft()&&!localProject?.active(),
    display,fail,hideUserScriptsRecovery,beginResult,update});
  const pageLibrary=createPageProgramLibrary({client,currentPageTarget,api,document:doc,view,onLoad:async row=>{
    const loadBlocked=()=>editingBusy||isRunning()||pagePreviewFlow?.busy||isStopping()||host.currentRun||
      pagePreviewFlow?.managed||!!pagePreviewFlow?.unknown||localProject?.active()||programSource.snapshot();
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
    patchDeveloperField(view,find('script-revision'),{value:String(row.revision)});pagePreviewFlow?.clearLast();
    if(saved.manifest?.compilation)await dependencyResolver.restore(saved.manifest.compilation);
    else dependencyResolver.refresh();
    browserPreparer.cancel();browserPrepareGeneration++;
    dependencyInstaller.refresh();componentRemote.refresh();
    update();
  }});
  const pageCandidates=createPageCandidateActions({client,view,currentPageTarget,pageLibrary});
  pagePreviewFlow=createPagePreviewFlow({client,api,host,view,currentPageTarget,programSource,
    dependencyResolver,dependencyReview,dependencyInstaller,componentRemote,prepareManagedSource,
    browserCompilerEnabled,browserBinding,
    state:{
      get disposed(){return disposed;},get stopping(){return isStopping();},
      get editingBusy(){return editingBusy;},get running(){return isRunning();},
      get mode(){return componentMode;},get loadedPageSource(){return loadedPageSource;},
      get localActive(){return !!localProject?.active();},
      get currentPage(){return currentPageState;},
      get ticket(){return browserPrepareGeneration;},nextTicket(){return ++browserPrepareGeneration;}
    },
    ui:{update,display,componentMessage,showRecovery:showUserScriptsRecovery,
      hideRecovery:hideUserScriptsRecovery,setResultText,setResultKind,
      matches:previewMatchesEditor}});
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
  on('script-read','click',()=>controllerResults.read('')); on('script-delete','click',edit(()=>controllerRevisions.remove())); on('script-list-refresh','click',()=>controllerRevisions.refresh().catch(fail));
  on('script-read-run','click',()=>controllerResults.read());
  on('script-history-open','click',()=>controllerResults.read(find('script-history-run').value));
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
    loadedPageSource=false;pagePreviewFlow?.clearLast();
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
    javascriptWorld=next;loadedPageSource=false;pagePreviewFlow?.clearLast();
    // Controller and Page use one visible source, not two hidden buffers.
    sourceInput();
    componentMessage('idle',next==='page'?'网页 JavaScript 使用当前网页 DOM；运行前仍须网站授权':'');
  }
  const javascriptWorldSelect=find('script-javascript-world');
  function sourceInput(){
    browserPrepareGeneration++;
    const local=!!localProject?.active(),page=!local&&componentMode==='javascript'&&isPageDraft();
    const remote=!local&&!page&&(componentMode!=='javascript'||hasUnbuiltESM(programSource.source()));
    // Invalidate only preparation relevant to the edited/previous execution world.
    if(remote||updatedContext==='component'||updatedContext==='controller-esm')browserPreparer.cancel();
    if(updatedContext?.startsWith('controller')||!local&&!page&&!remote)controllerRunner?.invalidate();
    if(page)dependencyResolver.refresh({sourceFormat:'esm-page'});
    else dependencyResolver.suspend();
    if(remote)componentRemote.refresh();
    // The context-aware update below clears stale panels on mode transitions.
    // Plain Controller edits must not refresh Page or JSX preparation.
    if(!local&&!page&&!remote&&componentMode==='javascript')controllerClassic.schedule();
    else controllerClassic.cancel();
    // Page Classic's dependency key omits body-only edits. Project its Run
    // controls even when the resolver correctly skips a redundant inspection.
    if(local||page||programSource.snapshot())update();
  }
  listen(find('script-id'),'input',()=>{
    try{pagePreviewFlow?.clearLast();sourceInput();}
    catch(error){fail(error);}
  });
  on('script-revision','input',update);
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
    const componentPreparing=candidatePreparing||componentRemote?.busy||
      (pagePreviewFlow?.preparing&&isComponentDraft())||
      controllerRunner?.esmPreparing||controllerRevisions.esmPreparing;
    if(candidatePreparing||pagePreviewFlow?.preparing||controllerRunner?.preparing||controllerRevisions.preparing||componentRemote?.busy){
      browserPrepareGeneration++;candidatePreparing=false;
      if(pagePreviewFlow?.preparing)pagePreviewFlow.cancelPreparation();
      if(controllerRunner?.preparing)controllerRunner.invalidate();
      // Component owner cancels the compiler once. Classic/Page/Revision work
      // cannot cancel unrelated compiler preparation.
      if(componentPreparing)componentRemote.cancel();
      componentMessage('completed','已取消本次准备；迟到结果不会运行。');update();return;
    }
    if(pagePreviewFlow?.canStopWaiting())return pagePreviewFlow.stopWaiting();
    if(localRunner?.canStopWaiting())return localRunner.stopWaiting();
    if(pagePreviewFlow?.canStop())return pagePreviewFlow.stop();
    if(localRunner?.canStopManaged()&&!isStopping())return localRunner.stopManaged();
    if(controllerRunner?.ownedRunId&&host.currentRun===controllerRunner.ownedRunId)return controllerRunner.stop();
    return localRunner?.stopController();
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
    // Input identity must invalidate synchronously before the next trusted Run.
    listen(find('script-source'),'input',()=>{try{sourceInput();}catch(error){fail(error);}});
    listen(find('script-run'),'click',start);
    on('script-stop','click',stop);
  }
  api.tabs.onRemoved.addListener(pagePreviewFlow.onTabRemoved);
  const unsubscribeRun = host.subscribe(next => {
    if (disposed) return;
    if (controllerResults.currentTask?.runId === next.runId) controllerResults.renderTask({...controllerResults.currentTask,...next});
    // RunHost releases its local owner after notifying terminal observers.
    queueMicrotask(update);
  });
  const unsubscribeCurrentPage = currentPageTarget?.subscribe(renderCurrentPage);
  currentPageTarget?.ready?.catch(fail);
  const recoverView = () => controllerResults.read('').catch(error=>{controllerResults.clearProjection();update();fail(error);});
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
  sourceInput();
  return {host,model:view,async openRun(runId){
    invariant(typeof runId==='string'&&runId.trim()===runId&&runId.length>0&&runId.length<=200,
      'E_RUN','请选择有效的原始运行记录');
    await controllerResults.read(runId,{reveal:true});
  },async prepareDevelopmentReload(){
    // Preserve RunHost / Native / download idle gating during development
    // reload. There is no source backup or post-reload restoration.
    return !disposed&&!editingBusy&&!isStopping()&&!isRunning()&&!pagePreviewFlow?.busy&&
      !candidatePreparing&&!controllerRunner?.preparing&&!componentRemote?.busy&&!localRunner?.managed&&!pagePreviewFlow?.managed&&
      !host.executionPending&&!host.currentRun&&!resultDownloads.busy()&&
      !client.resourceSnapshot?.().pending;
  },connectLocalProjects(adapter,{onInstalled}={}){
    if(localProject||!find('local-project-mode'))return;
    localInstaller.setOnInstalled(onInstalled);
    localProject=createLocalProjectView({client,api,document:doc,view,
      onChange:()=>{localRunner?.refreshResultValidity();update();}});
    localRunner=createLocalProjectRun({api,host,view,currentPageTarget,localProject,localAdapter:adapter,
      localInstaller,controllerResults,getCurrentPageState:()=>currentPageState,
      isDisposed:()=>disposed,isBlocked:()=>editingBusy||pagePreviewFlow?.busy||isStopping(),
      display,fail,hideUserScriptsRecovery,beginResult,update,setResultText,setResultKind});
    update();
  },executionSource:()=>{
    if(localProject?.active())throw {code:'E_DEV_MODE',message:'本地开发项目请通过正式打包流程创建已安装任务'};
    // Task candidates still compare the exact persisted executable and revision.
    const source=programSource.source();
    return controllerRevisions.executionSource(source);
  }, importDraft(sourceUtf8) {
    if(localProject?.active())throw {code:'E_DEV_MODE',message:'请先退出本地项目，切换到直接编辑后再导入'};
    if (disposed || editingBusy || pagePreviewFlow?.busy || componentRemote?.busy || pagePreviewFlow?.managed) throw {code:'E_BUSY',message:'请先停止当前受管组件，再导入或保存版本'};
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
    timers:resultDownloads.resourceSnapshot().timers+(localRunner?.resourceSnapshot().timers||0),
    pending:resultDownloads.resourceSnapshot().pending, subscriptions:listeners.length+Number(!disposed)+Number(Boolean(unsubscribeCurrentPage))+(localProject?.resourceSnapshot().subscriptions||0)}}), dispose() {
    if (disposed) return; disposed = true; controllerRevisions.dispose();resultDownloads.dispose();controllerClassic.dispose();controllerRunner.dispose(); componentRemote.dispose(); browserPrepareGeneration++; browserPreparer.dispose();staticESMPreparer.dispose(); scriptsCheckSequence++; localInstaller.dispose();localRunner?.dispose();localProject?.dispose();pageLibrary.dispose();dependencyReview.dispose();dependencyResolver.dispose();dependencyInstaller.dispose(); unsubscribeConnection?.(); unsubscribeCurrentPage?.(); unsubscribeRun();
    api.tabs.onRemoved.removeListener(pagePreviewFlow.onTabRemoved); if(!sharedRunHost)host.dispose();
    for (const remove of listeners) remove();
    listeners.length = 0;
  }};
}
