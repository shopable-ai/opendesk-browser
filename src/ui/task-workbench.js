import {CONTROLLER_SOURCE_LIMIT,TASK_PACKAGE_LIMIT} from '../platform/source-budgets.js';
import {createMyWorkbenchView} from './my-workbench-view.js';
import {SIDEPANEL_DOCUMENT_PATH} from '../tool-document-url.js';
import {patchDeveloperField,developerAction} from './develop-view.js';
import {permissionPattern} from '../environment.js';
import {createChromePermissionConsent,requireChromePermissions} from '../platform/chrome/permission-gate.js';
import {decodeValue} from '../platform/page-port/codec.js';
import {createTaskPackage, validateTaskParams, TASK_PACKAGE_FORMAT} from '../platform/tasks/contract.js';
import {sidebarToolStorageKey} from './sidebar-tools/package.js';
import {digestUtf8} from '../platform/protocol.js';
import {PROGRAM_DRAFT_FORMAT, PROGRAM_DRAFT_V2_FORMAT, PROGRAM_DRAFT_INPUT_LIMIT, PROGRAM_DRAFT_LIMIT, validateProgramDraft} from './program-source.js';
import {formatTaskValue, presentTaskValue, formatTaskError, formatTaskRunTechnical,
  unresolvedTaskRunMessage} from './task-run-diagnostics.js';
import {formatRunValue} from './run-value-format.js';
import {matchTaskReviewHandoff,taskReviewHandoffKey} from './workflow/task-review-handoff.js';

const states={candidate:'待验证',verified:'本机验证通过',available:'本地可用'};
const validTaskId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/.test(value);
const builtinRelease=row=>row?.verification?.kind==='builtin-release';
const candidateState=row=>row.runtimeCurrent===false?'运行时已更新，待重新验证':
  builtinRelease(row)?'内置发行 · '+(row.stage==='available'?'可安装':states[row.stage]||row.stage):states[row.stage]||row.stage;
const terminal=new Set(['completed','failed','stopped','interrupted']);
const runStateNames={preparing:'正在准备',running:'运行中',stopping:'正在停止',settling:'保存结果中',completed:'成功',failed:'失败',stopped:'已停止',interrupted:'已中断',paused_unknown:'状态待确认'};
const textValue=formatTaskValue;

export function createTaskWorkbench({client,host,currentPageTarget,api=globalThis.chrome,
  document:doc=globalThis.document,importDraft,executionSource,debugEnabled=false,
  isAppDebugAllowed=()=>false,onNavigate,onTabSelected,onTaskInstalled,notify,
  reactNavigation=null,developerView=null,myView=createMyWorkbenchView({document:doc})}) {
  const get=id=>doc.getElementById(id),ui=id=>myView.field(id);
  // A React Side Panel has no standalone catalog controls. Its installed
  // task snapshot must still load without binding that separate DOM surface.
  const catalogList=ui('task-catalog-list');
  const developer=id=>developerView?.fields[id]??get(id);
  const editorSource=executionSource || (() => developer('script-source').value);
  let disposed=false, working=false, running=false, activeRunId=null, catalog=[], installed=[], renderKey=null;
  let toolActive=false, toolsViewListener=null, workflowRunId=null, workflowClaimPending=false;
  let agentStopRequested=false,agentStartSubmitted=false;
  let scheduledSurfaceActive=false, scheduledRunId=null;
  let catalogSequence=0, catalogSelectionEpoch=0, historySequence=0, currentPage=currentPageTarget?.snapshot;
  let permissionSequence=0,candidatePermission=null;
  const permissionRequest=row=>({origins:row.manifest.siteOrigins.map(origin=>permissionPattern(origin))});
  const permissionConsent=createChromePermissionConsent({api,onChange(){candidatePermission=null;void prepareCandidatePermission(candidate());}});
  async function prepareCandidatePermission(row){
    const sequence=++permissionSequence;candidatePermission=null;update();
    if(!row||disposed)return;
    try{
      const state=await permissionConsent.prepare(permissionRequest(row));
      if(disposed||sequence!==permissionSequence||candidate()?.manifestHash!==row.manifestHash)return;
      candidatePermission={manifestHash:row.manifestHash,state};update();
    }catch(error){if(!disposed&&sequence===permissionSequence)fail(error);}
  }
  function addedTaskSites(row){
    const previous=installed.find(value=>value.taskId===row?.taskId);
    const manifest=previous&&catalog.find(value=>value.taskId===previous.taskId&&value.version===previous.version)?.manifest;
    return previous&&row?row.manifest.siteOrigins.filter(origin=>!manifest?.siteOrigins.includes(origin)):[];
  }
  let latestResultDisplay=null;
  let catalogSurface=false, catalogQuery='', catalogFilter='all', catalogInitialization=null;
  let localQuery='', localFilter='all', taskManagementMode=false, pendingTaskUninstall=null;
  const parameterDrafts=new Map();
  let parameterDraftKey, parametersEdited=false, parameterSerial='', parameterWrites=Promise.resolve();
  function rememberParams() {
    if(!renderKey)return;
    const prior={};
    for(const {name,rule} of myView.data.taskParams||[]){
      const control=ui('task-param-'+name);
      prior[name]={...(rule.type==='boolean'&&!rule.enum?{checked:control.checked}:{value:control.value}),omitted:control.omitted===true};
    }
    prior.$editor={mode:myView.data.taskParamsMode||'form',value:ui('task-params-json').value};
    parameterDrafts.set(renderKey,prior);
  }
  function persistParams() {
    parametersEdited=true;rememberParams();
    if(!parameterDraftKey)return;
    const value=[...parameterDrafts],serial=JSON.stringify(value);
    if(serial===parameterSerial)return;
    parameterSerial=serial;
    parameterWrites=parameterWrites.then(()=>api.storage.session.set({[parameterDraftKey]:value}))
      .catch(error=>console.warn('Task parameter drafts could not be retained',error));
  }
  async function restoreParams() {
    if(!api.storage?.session)return;
    await currentPageTarget?.ready;
    if((await api.tabs?.getCurrent?.())?.id)return;
    const windowId=currentPageTarget?.snapshot?.windowId;
    if(!Number.isSafeInteger(windowId))return;
    const key=`opendesk.sidebar.task-params.v1:${windowId}`,saved=(await api.storage.session.get(key))[key];
    if(disposed)return;
    if(!parametersEdited&&Array.isArray(saved)&&JSON.stringify(saved).length<=100000){
      for(const entry of saved){
        if(Array.isArray(entry)&&typeof entry[0]==='string'&&entry[1]&&typeof entry[1]==='object')
          parameterDrafts.set(entry[0],entry[1]);
      }
      renderKey=null;
    }
    parameterDraftKey=key;
    if(parametersEdited)persistParams();
  }
  // A late RunHost event must update the launching task, never the newly selected one.
  const taskNotices=new Map();
  let runOwnerKey=null, runOwnerTitle='';
  const listeners=[];
  // This channel is a hint only. The recipient always re-reads the authoritative
  // Task Catalog through the existing Host Client; no task data crosses it.
  // Do not acquire a BroadcastChannel before the synchronous UI/controller
  // wiring succeeds. A failed constructor has no dispose() owner to close it.
  let updates=null;
  const announce=()=>updates?.postMessage({type:'catalog-changed'});
  const focus=(id,options)=>{
    myView.publish();queueMicrotask(()=>get(id)?.focus?.(options));
  };
  const actionName=(id,event)=>id.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())+event[0].toUpperCase()+event.slice(1);
  function registerAction(name,fn){
    const callback=myView.action(fn);myView.actions[name]=callback;
    listeners.push({remove:()=>{if(myView.actions[name]===callback)delete myView.actions[name];}});
  }
  const fail=error=>{
    if(disposed)return;
    const message=formatTaskError(error);
    ui('task-status').text=message;
    if(catalogList)ui('task-catalog-status').text=message;
    myView.publish();
  };
  function success(message,options={}) {
    if(disposed)return;
    if(notify)notify(message,{...options,type:'success'});
    else ui('task-status').text=message;
  }
  function navigate(name,{initial=false}={}) {
    // Previous Discover URLs now open the local task search in My.
    if(name==='discover')name='tasks';
    if(name==='debug'&&!debugEnabled||name==='app-debug'&&!isAppDebugAllowed())return false;
    if(!['tasks','workflow','develop','app-debug','tools','cloud','catalog','debug'].includes(name))return;
    if(name==='catalog'&&!catalogSurface) {
      // Package import and installation live only in a separate full-size
      // extension tab. Sidebar Discover is a view of installed local tasks.
    Promise.resolve().then(()=>api.tabs.create({url:api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH)})).catch(fail);
      return;
    }
    // Ask the live tool before changing panes or destroying its editor.
    if(toolsViewListener?.((name==='tools'||name==='app-debug')&&!catalogSurface,name)===false)return false;
    reactNavigation?.select(name);
    syncRunDock(name);
    if(doc.documentElement?.dataset)doc.documentElement.dataset.opendeskTab=name;
    if(name==='tasks')renderInstalledCards();
    if(name==='debug')onNavigate?.('debug');
    if(name==='cloud')onNavigate?.('cloud');
    if(!reactNavigation?.select)
      doc.querySelector?.('.workbench-nav button[aria-selected="true"]')?.scrollIntoView?.({block:'nearest',inline:'nearest'});
    // Only an accepted top-level navigation may update the Sidebar preference.
    onTabSelected?.(name,{initial});
  }
  // Keep the owning Stop control visible across Sidebar tab changes;
  // do not move or restart the run when the user enters Discover/Developer.
  function syncRunDock(view=doc.documentElement?.dataset?.opendeskTab) {
    const taskOwns=Boolean(activeRunId && host.currentRun===activeRunId);
    // Task admission may claim RunHost before start() returns its exact runId.
    // That pending task is never a Developer draft with a borrowed Stop control.
    const workflowOwns=Boolean(workflowClaimPending || workflowRunId && host.currentRun===workflowRunId);
    const scheduledOwns=Boolean(scheduledRunId && host.currentRun===scheduledRunId);
    // Scheduled runs are owned by the visible plan's Stop, never the Developer draft dock.
    const draftOwns=Boolean(host.currentRun && !taskOwns && !workflowOwns && !scheduledOwns && !running);
    // Idle scheduled plans have no ordinary manual Run. If a manual Task is
    // already running, keep its original Stop control visible across views.
    // Manual Run now lives in the selected task detail. Only the owning
    // running task may reserve a persistent Stop dock, including across tabs.
    const taskHidden=catalogSurface || !taskOwns;
    const developHidden=catalogSurface || (draftOwns?false:taskOwns || workflowOwns || scheduledOwns || view!=='develop');
    const workflowHidden=catalogSurface || (workflowOwns?false:taskOwns || draftOwns || scheduledOwns || view!=='workflow');
    // The dock follows the real RunHost owner, not the selected task or visible tab.
    // On another view (or another task), expose only that owner's Stop control.
    const selected=installedRow();
    const stopOnly=taskOwns && (scheduledSurfaceActive || view!=='tasks' || toolActive || runOwnerKey!== (selected && identity(selected))) ||
      draftOwns && view!=='develop' || workflowOwns && view!=='workflow';
    ui('task-dock').hidden=taskHidden;
    ui('task-stop').attributes['aria-label']=taskOwns
      ? `停止「${runOwnerTitle || '当前任务'}」` : '停止当前任务';
    myView.project('runDock',{taskHidden,developHidden,workflowHidden,stopOnly:Boolean(stopOnly),
      // Workflow actions belong to its React page, rather than this footer.
      hidden:taskHidden&&developHidden});

  }
  function catalogNotice(message='') {
    const state=catalogInitialization;
    const failure=state?.status==='failed'
      ? [state.code||'E_TASK_INITIALIZATION',state.causeCode,state.taskId,state.message].filter(Boolean).join('：') : '';
    ui('task-catalog-status').text=[message,failure].filter(Boolean).join('\n');
    myView.publish();
  }
  function selectTaskReview(taskId) {
    // URL data is only a selection hint. Resolve identity from the authoritative
    // catalog; no URL, source, permission or installation data is accepted.
    catalogQuery='';catalogFilter='all';
    ui('task-search').value='';
    const matches=catalog.filter(row=>row.taskId===taskId&&row.runtimeCurrent!==false)
      .sort((a,b)=>b.version.localeCompare(a.version,'en',{numeric:true}));
    const selected=matches.find(row=>row.stage==='available')||matches[0];
    catalogList.value=selected?identity(selected):'';
    ui('task-verify-run').value='';
    renderCatalogCards();renderCandidate();
    catalogNotice(selected
      ? `已定位 ${identity(selected)} 固定版本；请审阅来源、源码与权限后确认安装。未自动安装、启用或运行。`
      : 'E_TASK_NOT_AVAILABLE：此任务暂无可审阅候选，请导入任务包或完成内置目录初始化后重试。');
  }
  function showCatalogPage() {
    const selectionAtOpen=catalogSelectionEpoch;
    catalogSurface=true;
    if(doc.documentElement?.dataset) doc.documentElement.dataset.opendeskSurface='catalog';
    navigate('catalog');
    // Navigation is a user-facing convenience, never a Verify, Available,
    // Install or permissions grant. The original Task Catalog stays authoritative.
    void (async()=>{
      await client.ready;
      if(disposed||!catalogSurface)return;
      await refresh();
      if(disposed||!catalogSurface||catalogSelectionEpoch!==selectionAtOpen)return;
      const reviewId=new URL(doc.location?.href||globalThis.location?.href||api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH)).searchParams.get('taskReviewId');
      if(reviewId!==null){
        if(validTaskId(reviewId))selectTaskReview(reviewId);
        else fail({code:'E_SCHEMA',message:'任务标识无效；请从目录重新选择或导入任务包'});
        return;
      }
      if(!api.storage?.session||!api.windows?.getCurrent)return;
      const windowId=(await api.windows.getCurrent())?.id;
      const key=taskReviewHandoffKey(windowId);
      if(!key)return;
      const handoff=(await api.storage.session.get(key))?.[key];
      if(!handoff)return;
      await api.storage.session.remove?.(key); // Consume once, even when stale/forged.
      if(disposed||!catalogSurface)return;
      const selected=matchTaskReviewHandoff(handoff,windowId,catalog);
      // Old persisted/default choices must not hide a fresh Workflow candidate.
      // Only an actual choice made while this review was loading takes priority.
      if(!selected || catalogSelectionEpoch!==selectionAtOpen)return;
      ui('task-catalog-list').value=selected.candidateKey;
      renderCatalogCards();renderCandidate();
      // Never carry a prior candidate's verification receipt into this version.
      ui('task-verify-run').value=selected.runId || '';
      catalogNotice(selected.runId
        ? '已根据同窗口固定版本预选候选并预填真实运行 ID；仍需亲自核对运行证据、设为可用并确认安装。'
        : '已定位候选固定版本；请先用相同源码真实运行，然后核对证据。未自动验证或安装。');
    })().catch(error=>{fail(error);console.warn('Task review shortcut unavailable; use manual catalog review',error);});
  }
  const identity=row=>`${row.taskId}@${row.version}`;
  const candidate=()=>catalogList?catalog.find(row=>identity(row)===catalogList.value):undefined;
  const installedRow=()=>installed.find(row=>row.taskId===ui('task-installed-list').value);
  const candidateFor=row=>row && catalog.find(value=>value.taskId===row.taskId&&value.version===row.version);
  function renderTaskStatus() {
    const row=installedRow(),selectedKey=row?identity(row):null;
    const otherOwner=runOwnerKey && runOwnerKey!==selectedKey && (running || (activeRunId && host.currentRun===activeRunId));
    ui('task-status').text=otherOwner
      ? `「${runOwnerTitle}」${activeRunId && host.currentRun===activeRunId?'正在运行，底部可停止':'正在准备，暂不可启动其他任务'}`
      :selectedKey?taskNotices.get(selectedKey)||'':'';
  }
  function setTaskNotice(taskKey,message) {
    if(disposed||!taskKey)return;
    taskNotices.set(taskKey,message);
    renderTaskStatus();
  }
  const formatCandidate=row=>{
    if(!row)return '尚无候选任务';
    const manifest=row.manifest;
    return `${manifest.title} · v${row.version}\n${manifest.description}\n作者：${manifest.author} · 来源：${manifest.source}\n适用：${manifest.siteOrigins.join(', ')}\n权限：${manifest.permissions.join(', ')}\n最长运行：${(manifest.deadlineMs??30000)/1000} 秒\n状态：${candidateState(row)}${row.verifiedAt&&!builtinRelease(row)?' · 有本机运行验证记录':''}`;
  };
  function renderForm(row) {
    const key=identity(row);
    if(renderKey===key)return;
    rememberParams();renderKey=key;
    const schema=row.manifest.paramsSchema,prior=parameterDrafts.get(key)||{};
    const fields=Object.entries(schema.properties).map(([name,rule])=>{
      const control=ui('task-param-'+name),saved=prior[name];
      control.error='';
      control.omitted=saved?saved.omitted===true:
        rule.type==='boolean'&&!rule.enum&&!schema.required.includes(name)&&!Object.hasOwn(rule,'default');
      if(rule.type==='boolean'&&!rule.enum)control.checked=saved?.checked??(rule.default===true);
      else control.value=saved?.value??(Object.hasOwn(rule,'default')?String(rule.default):
        rule.enum&&schema.required.includes(name)?String(rule.enum[0]):'');
      return {name,rule,required:schema.required.includes(name)};
    });
    myView.data.taskParamsMode=prior.$editor?.mode==='json'?'json':'form';
    ui('task-params-json').value=typeof prior.$editor?.value==='string'?prior.$editor.value:'';
    ui('task-params-json').error='';
    myView.project('taskParams',fields);
  }
  function paramsFromForm(schema) {
    if(myView.data.taskParamsMode==='json'){
      try{return validateTaskParams(schema,JSON.parse(ui('task-params-json').value));}
      catch(error){
        const failure=error instanceof SyntaxError?{code:'E_PARAMS',message:'参数 JSON 格式无效，请检查括号、引号和逗号'}:error;
        ui('task-params-json').error=formatTaskError(failure);throw failure;
      }
    }
    const result={};
    for(const [name,rule] of Object.entries(schema.properties)) {
      const control=ui('task-param-'+name);
      if(!control)throw {code:'E_PARAMS',message:`缺少参数输入：${name}`};
      if(control.omitted===true)continue;
      let value;
      if(rule.type==='boolean'&&!rule.enum)value=control.checked;
      else if(rule.enum&&control.value===''&&!schema.required.includes(name)&&!Object.hasOwn(rule,'default'))continue;
      else if(control.value===''&&!schema.required.includes(name)&&!Object.hasOwn(rule,'default'))continue;
      else if(rule.type==='integer'||rule.type==='number')value=control.value===''?NaN:Number(control.value);
      else value=control.value;
      if(rule.enum) {
        // Select serializes string representations; restore the declared primitive.
        const choice=rule.enum.find(item=>String(item)===String(control.value));
        if(choice!==undefined)value=choice;
      }
      result[name]=value;
    }
    try{return validateTaskParams(schema,result);}
    catch(error){
      // Use the same authoritative validator to locate the offending field;
      // presentation must not invent a second interpretation of the schema.
      for(const [name,rule]of Object.entries(schema.properties)){
        try{validateTaskParams({...schema,properties:{[name]:rule},required:schema.required.includes(name)?[name]:[]},
          Object.hasOwn(result,name)?{[name]:result[name]}:{});}
        catch(fieldError){ui('task-param-'+name).error=`${rule.title}：${formatTaskError(fieldError)}`;}
      }
      throw error;
    }
  }
  // Filtering never changes the selected Task, but a hidden selection must not be runnable.
  function taskMatchesView(row,info,origin) {
    if(!row)return false;
    if(localFilter==='disabled' && row.enabled)return false;
    if(localFilter==='current' && (!row.enabled || !origin ||
      !info?.manifest.siteOrigins.includes(origin)))return false;
    return !localQuery || [info?.manifest.title,info?.manifest.description,
      row.taskId,...(info?.manifest.siteOrigins||[])].join(' ').toLocaleLowerCase().includes(localQuery);
  }
  function update() {
    if(disposed)return;
    const row=installedRow(),info=candidateFor(row),selected=candidate();
    const available=row?.enabled && row.runtimeCurrent!==false && info?.runtimeCurrent!==false && info?.stage==='available';
    let siteAvailable=false,origin='';
    if(currentPage?.status==='available') {
      origin=new URL(currentPage.url).origin;
      siteAvailable=info?.manifest.siteOrigins.includes(origin)===true;
    }
    const siteState=origin?(siteAvailable?'matched':'unmatched'):'unavailable';
    const siteMessage=origin?(siteAvailable?'适用于当前网页':'当前网页不适用'):'当前网页不可运行';
    ui('task-current-site').text=siteMessage;
    ui('task-current-site').dataset.state=siteState;
    ui('task-current-site').title=origin || '';
    ui('task-run').disabled=working||running||!!host.currentRun||!available||!siteAvailable||
      !taskMatchesView(row,info,origin);
    myView.data.taskRunBlockedReason=working?'正在处理任务，请稍候':running||host.currentRun?'已有任务正在运行，请先停止或等待完成':
      !row?'请先选择任务':!row.enabled?'此任务已停用，请在「更多操作」中启用':
      !available?'此固定版本当前不可运行，请在任务目录核查状态':!siteAvailable?siteMessage:
      !taskMatchesView(row,info,origin)?'此任务不在当前筛选结果中，请重新选择':'';
    ui('task-stop').disabled=!activeRunId || host.currentRun!==activeRunId;
    ui('task-fork-draft').disabled=!row||working;
    const toggleAction=ui('task-toggle'),toggleLabel=row?.enabled?'停用任务':'启用任务';
    toggleAction.disabled=!row||working;
    toggleAction.title=toggleLabel;toggleAction.attributes['aria-label']=toggleLabel;
    toggleAction.text=toggleLabel;
    ui('task-uninstall').disabled=!row||working;
    ui('task-uninstall-yes').disabled=!row||working||!pendingTaskUninstall;
    if(catalogList){
    const selectedInstallation=installed.find(item=>item.taskId===selected?.taskId&&item.version===selected?.version);
    const needsReinstall=selectedInstallation?.runtimeCurrent===false;
    ui('catalog-verification').hidden=builtinRelease(selected)&&selected.runtimeCurrent!==false;
    ui('task-verify').disabled=working||!selected||selected.stage!=='candidate'&&selected.runtimeCurrent!==false;
    ui('task-publish').disabled=working||!selected||selected.stage!=='verified'||selected.runtimeCurrent===false;
    ui('task-install').disabled=working||!selected||selected.stage!=='available'||selected.runtimeCurrent===false||
      selected.installed&&selected.enabled&&!needsReinstall||candidatePermission?.manifestHash!==selected?.manifestHash||!candidatePermission?.state;
    ui('task-install').text=needsReinstall?'确认更新运行时安装':selected?.installed?'已安装':addedTaskSites(selected).length?'确认新增权限并安装':'安装确定版本';
    patchDeveloperField(developerView,developer('task-create-candidate'),{disabled:working});
    }
    syncRunDock();myView.publish();
  }
  const taskSearchReturnFocus=()=>focus('task-manage-toggle',{preventScroll:true});
  function renderInstalledCards() {
    const selected=ui('task-installed-list').value;
    const selectedTask=installed.find(row=>row.taskId===selected);
    let origin=null;
    if(currentPage?.status==='available'){
      try{origin=new URL(currentPage.url).origin;}catch{/* No stale URL fallback. */}
    }
    const visible=installed.filter(row=>taskMatchesView(row,candidateFor(row),origin));
    for(const value of ['all','current','disabled'])
      ui('local-filter-'+value).attributes['aria-pressed']=String(localFilter===value);
    ui('local-discover-count').text=`显示 ${visible.length} 个任务 · 共安装 ${installed.length} 个`;
    const emptyText=!installed.length?'暂无任务。点击上方「添加」导入本地任务。'
      :localFilter==='current'&&!origin?'当前网页不可用。选择「全部」查看已安装任务。'
      :localFilter==='disabled'&&!localQuery?'没有已停用任务。':'没有匹配的任务。试试其他关键词或选择「全部」。';
    myView.project('taskRows',{rows:visible.map(row=>{
      const info=candidateFor(row);
      return {taskId:row.taskId,version:row.version,enabled:row.enabled===true,
        title:info?.manifest.title||row.taskId,description:info?.manifest.description||'已安装任务',
        siteLabel:String(info?.manifest.siteOrigins?.[0]||'网站待核对').replace(/^https?:\/\//u,'').replace(/\/.*$/u,''),
        parameterCount:Object.keys(info?.manifest.paramsSchema?.properties||{}).length};
    }),selectedId:selected,identity:selectedTask?Object.fromEntries(
      ['taskId','version','manifestHash','generation','installationId'].map(key=>[key,selectedTask[key]])):null,
      emptyText,manageMode:taskManagementMode,onManage:openTaskManagement,
      onSelect:taskId=>{
        if(disposed||!installed.some(row=>row.taskId===taskId))return;
        ui('task-installed-list').value=taskId;renderInstalledSelection();
      }});
  }
  function openTaskManagement(taskId) {
    if(disposed||!installed.some(row=>row.taskId===taskId))return;
    if(ui('task-installed-list').value!==taskId) {
      ui('task-installed-list').value=taskId;renderInstalledSelection();
    }
    ui('task-tools').open=true;
    renderInstalledCards();
  }
  function setTaskManagementMode(open) {
    taskManagementMode=Boolean(open);
    ui('task-manage-toggle').attributes['aria-pressed']=String(taskManagementMode);
    // Search belongs to the existing management context, not a fifth header action.
    ui('task-search-panel').hidden=!taskManagementMode||!installed.length;
    if(taskManagementMode){
      ui('task-tools').open=true;
      if(!installedRow()&&installed[0]){
        ui('task-installed-list').value=installed[0].taskId;
        renderInstalledSelection();
      }
    }else{
      // Never strand a task behind a search/filter when management closes.
      localQuery='';localFilter='all';ui('local-discover-search').value='';
      dismissTaskUninstall();
      ui('task-tools').open=false;
    }
    renderInstalledCards();update();
  }
  function dismissTaskUninstall() {
    pendingTaskUninstall=null;
    ui('task-uninstall-confirm').hidden=true;
  }
  function renderInstalled() {
    ui('task-installed-count').text=installed.length+' 个';
    ui('task-manage-toggle').disabled=installed.length===0;
    ui('task-search-panel').hidden=!taskManagementMode||!installed.length;
    const sel=ui('task-installed-list'),prior=sel.value;
    myView.options('task-installed-list',[
      {label:installed.length?'请选择已安装任务':'暂无已安装任务',value:''},
      ...installed.map(row=>({label:`${candidateFor(row)?.manifest.title||row.taskId} · v${row.version}${row.enabled?'':'（已停用）'}`,value:row.taskId}))
    ]);
    sel.value=installed.some(row=>row.taskId===prior)?prior:installed[0]?.taskId||'';
    renderInstalledSelection();
  }
  function renderInstalledSelection() {
    const currentSelection=ui('task-installed-list').value;
    if(pendingTaskUninstall&&pendingTaskUninstall.taskId!==currentSelection)
      dismissTaskUninstall();
    if(taskManagementMode)ui('task-tools').open=true;
    const row=installedRow(),info=candidateFor(row);
    const detailText=info
      ?`适用网站：${info.manifest.siteOrigins.join('、')}\n所需能力：${info.manifest.permissions.join('、')}\n来源：${info.manifest.source} · v${row.version}`
      :'';
    myView.project('taskDetail',detailText);
    ui('task-result-panel').hidden=true;
    ui('task-history-panel').hidden=true;
    ui('task-result').text='';
    latestResultDisplay=null;
    ui('task-result-reveal').hidden=true;
    renderTaskStatus();
    if(info)renderForm(info);
    else{rememberParams();renderKey=null;myView.project('taskParams',[]);}
    renderInstalledCards();
    update();refreshHistory().catch(fail);
  }
  function renderCatalog(preserve) {
    const old=preserve||catalogList.value;
    myView.options('task-catalog-list',[
      {label:catalog.length?'请选择候选版本':'目录中没有任务',value:''},
      ...catalog.map(row=>({label:`${row.manifest.title} · v${row.version} · ${candidateState(row)}`,value:identity(row)}))
    ]);
    catalogList.value=catalog.some(row=>identity(row)===old)?old:'';
    renderCatalogCards();renderCandidate();
  }
  function renderCatalogCards() {
    const rows=catalog.filter(row=>{
      if(catalogFilter==='installed'&&!row.installed)return false;
      if(catalogFilter==='available'&&(row.stage!=='available'||row.runtimeCurrent===false))return false;
      if(catalogFilter==='candidate'&&row.stage!=='candidate'&&row.runtimeCurrent!==false)return false;
      const manifest=row.manifest;
      return [manifest.title,manifest.description,manifest.author,manifest.source,...manifest.siteOrigins]
        .join(' ').toLocaleLowerCase().includes(catalogQuery);
    });
    ui('task-catalog-count').text=`共 ${rows.length} 个本地任务版本`;
    myView.project('catalogRows',{selectedKey:catalogList.value,filter:catalogFilter,rows:rows.map(row=>({
      key:identity(row),title:row.manifest.title,description:row.manifest.description,
      state:`${candidateState(row)} · v${row.version}${row.installed?' · 已安装':''}`
    }))});
  }
  function renderCandidate() {
    const row=candidate();
    if(!row){myView.project('catalogDetail',null);update();return;}
    const schema=row.manifest.paramsSchema,paramFields=Object.entries(schema.properties);
    myView.project('catalogDetail',{
      key:identity(row),title:row.manifest.title,description:row.manifest.description,
      facts:[['版本',row.version],['作者',row.manifest.author],['来源',builtinRelease(row)?'内置发行（随扩展提供）':row.manifest.source],
        ['适用网站',row.manifest.siteOrigins.join('、')],['所需权限',row.manifest.permissions.join('、')],
        ['验证状态',candidateState(row)]].map(([name,value])=>({name,value})),
      hashes:`源码 SHA-256：${row.manifest.program.sourceHash}\nManifest SHA-256：${row.manifestHash}`,
      paramsNote:paramFields.length?'运行参数：'+paramFields.map(([name,rule])=>
        (rule.title||name)+'（'+rule.type+(schema.required.includes(name)?'，必填':'，可选')+
        (Object.hasOwn(rule,'default')?'，默认 '+String(rule.default):'')+'）').join('；'):'运行参数：无',
      source:'展开后从正式任务目录读取固定版本；只查看，不运行。',sourceLoaded:false,
      note:row.runtimeCurrent===false?'保留原固定包和历史证明。请在当前运行时明确试运行同一源码，再核对新运行证据、设为可用并确认更新安装；云控需重新批准。':builtinRelease(row)?'此固定候选来自内置发行，无需填写本机运行 ID；请审阅后明确安装。浏览器网站权限仍需单独批准。':row.stage==='available'?'只有当前确定版本通过本地可信验证后，才可明确安装。浏览器网站权限仍需单独批准。'
        :'此任务尚未达到本地可安装状态；导入与作者自述不构成可信审核结果。',
      addedSites:addedTaskSites(row)
    });
    void prepareCandidatePermission(row);update();
  }
  async function readCandidateSource(key){
    const row=candidate(),detail=myView.data.catalogDetail;
    if(!row||identity(row)!==key||detail?.key!==key||detail.sourceLoaded||detail.loading)return;
    detail.loading=true;detail.sourceError='';detail.source='正在读取固定版本源码…';myView.publish();
    try{
      const frozen=await client.request('getTaskCandidate',{taskId:row.taskId,version:row.version});
      if(frozen?.manifestHash!==row.manifestHash || frozen.package?.manifestHash!==row.manifestHash ||
        frozen.package?.manifest?.taskId!==row.taskId || frozen.package?.manifest?.version!==row.version ||
        frozen.package?.manifest?.program?.sourceHash!==row.manifest.program.sourceHash ||
        typeof frozen.package?.sourceUtf8!=='string')
        throw {code:'E_REVIEW_IDENTITY',message:'固定源码身份已变化，请刷新目录后重新审阅'};
      if(!disposed&&myView.data.catalogDetail===detail){detail.source=frozen.package.sourceUtf8;detail.sourceLoaded=true;}
    }catch(error){if(!disposed&&myView.data.catalogDetail===detail)detail.sourceError=formatTaskError(error);}
    finally{detail.loading=false;myView.publish();}
  }
  async function refresh(preferred,{skipUnchanged=false}={}) {
    const seq=++catalogSequence;
    const result=await client.request('listTaskCatalog',{});
    if(disposed||seq!==catalogSequence)return;
    const initializationChanged=JSON.stringify(catalogInitialization)!==JSON.stringify(result.initialization??null);
    const hadInitializationFailure=catalogInitialization?.status==='failed';
    catalogInitialization=result.initialization??null;
    if(initializationChanged&&(hadInitializationFailure||catalogInitialization?.status==='failed'))catalogNotice();
    if(skipUnchanged&&JSON.stringify([catalog,installed])===JSON.stringify([result.catalog,result.installed]))return;
    catalog=result.catalog;installed=result.installed;
    renderInstalled();renderCatalog(preferred);
    if(catalogInitialization?.status==='failed')catalogNotice();
  }
  function describeHistoryResult(run,result) {
    if(!result)return run?.state==='paused_unknown'
      ?unresolvedTaskRunMessage():'结果尚未交付或受权限限制';
    if(!result.outcome?.ok)return formatTaskError(result.outcome?.error);
    try{return textValue(decodeValue(result.outcome.valueWire));}
    catch{return formatTaskError({code:'E_RESULT_FORMAT',message:'持久结果无法在当前界面解码'});}
  }
  function taskResultView(run,result) {
    if(!result || !result.outcome?.ok)return {text:describeHistoryResult(run,result)};
    try {
      const decoded=decodeValue(result.outcome.valueWire);
      const preview=presentTaskValue(decoded);
      return {text:preview.text, fullText:preview.redacted||preview.truncated ? formatRunValue(decoded) : null};
    } catch {return {text:formatTaskError({code:'E_RESULT_FORMAT',message:'持久结果无法在当前界面解码'})};}
  }
  async function refreshHistory() {
    const seq=++historySequence,row=installedRow();
    if(!row){
      latestResultDisplay=null;ui('task-result-reveal').hidden=true;
      myView.project('taskHistory',[]);
      ui('task-history-panel').hidden=true;
      ui('task-result-panel').hidden=true;
      return;
    }
    const view=await client.controller.snapshotControllerRun({});
    if(disposed||seq!==historySequence||installedRow()?.taskId!==row.taskId)return;
    const runs=view.runs.filter(value=>value.revision?.scriptId===row.scriptId).slice(-8).reverse();
    const matching=view.results.filter(value=>value.revision?.scriptId===row.scriptId);
    if(!runs.length){
      latestResultDisplay=null;ui('task-result-reveal').hidden=true;
      myView.project('taskHistory',[]);
      ui('task-history-panel').hidden=true;ui('task-result-panel').hidden=true;return;
    }
    myView.project('taskHistory',runs.map((run,index)=>{
      const result=matching.find(value=>value.runId===run.runId);
      return {runId:run.runId,state:runStateNames[run.state]||run.state||'状态待确认',
        ordinal:index+1,...taskResultView(run,result),technical:formatTaskRunTechnical(run,result)};
    }));
    ui('task-history-panel').hidden=false;
    ui('task-result-panel').hidden=false;
    const latest=matching.find(value=>value.runId===runs[0].runId);
    const presented=taskResultView(runs[0],latest);
    latestResultDisplay={...presented,taskKey:identity(row)};
    ui('task-result').text=presented.text;
    const reveal=ui('task-result-reveal');
    reveal.hidden=typeof presented.fullText!=='string';
    reveal.dataset.revealed='false';reveal.text='查看完整原值';
    if(activeRunId&&identity(row)===runOwnerKey&&runs.some(value=>value.runId===activeRunId)){
      const live=matching.find(value=>value.runId===activeRunId);
      if(live)setTaskNotice(identity(row),`本次任务：${runStateNames[live.state]||live.state}`);
    }
    update();
  }
  async function createCandidate() {
    const id=developer('script-id').value.trim(),revision=Number(developer('script-revision').value);
    if(!id || id.startsWith('task:') || !Number.isSafeInteger(revision)||revision<1)
      throw {code:'E_REVISION',message:'请先保存普通程序版本'};
    const captured=currentPageTarget.capture(); // Freeze site before first await.
    const saved=await client.controller.getControllerScript({scriptId:id,revision});
    if(developer('script-id').value.trim()!==id || Number(developer('script-revision').value)!==revision ||
      saved.sourceUtf8!==editorSource())
      throw {code:'E_REVISION',message:'脚本版本或编辑内容已变化，请重新确认并保存'};
    // These author-entered declarations become part of the immutable,
    // hash-covered Manifest. Blank fields preserve pre-intent Task versions;
    // a readback assertion without a match contract is never imported.
    const templatesText=developer('task-dev-intent-templates').value.trim();
    const resultTextsText=developer('task-dev-intent-result-texts').value.trim();
    if(resultTextsText&&!templatesText)
      throw {code:'E_SCHEMA',message:'请先填写自然语言匹配模板，再定义独立结果核验'};
    const splitLines=text=>text.split(/\r?\n/u).map(value=>value.trim()).filter(Boolean);
    const intent=templatesText?{
      templates:splitLines(templatesText),
      ...(resultTextsText?{resultTexts:splitLines(resultTextsText)}:{})
    }:null;
    const manifest={format:'opendesk.task.v1',taskId:developer('task-dev-id').value.trim(),
      version:developer('task-dev-version').value.trim(),title:developer('task-dev-title').value.trim(),
      description:developer('task-dev-description').value.trim(),author:developer('task-dev-author').value.trim(),
      source:'local-developer',siteOrigins:[new URL(captured.url).origin],
      permissions:['page.automation'],entryFormat:'async-main',
      program:{revision:saved.revision,sourceHash:await digestUtf8(saved.sourceUtf8)},
      paramsSchema:JSON.parse(developer('task-dev-schema').value),
      ...(intent?{intent}:{})};
    const pkg=await createTaskPackage(manifest,saved.sourceUtf8);
    await currentPageTarget.revalidate(captured); // Reject wrong-site candidate after async work.
    const value=await client.request('importTaskPackage',{package:pkg});
    await refresh(identity(value));announce();
    patchDeveloperField(developerView,developer('task-dev-status'),{textContent:`已创建待验证候选 ${identity(value)}；请先运行相同源码并提供真实 runId`});
    navigate('catalog');
  }
  async function readFile(fileOverride=null) {
    // Both Sidebar and full catalog share one parser, Host import and validation.
    const file=fileOverride||ui('task-package-file').files?.[0];
    if(!file)return;
    if(!fileOverride)ui('task-package-file').value='';
    if(file.size>PROGRAM_DRAFT_INPUT_LIMIT)throw {code:'E_LIMIT',message:'文件超过程序草稿包大小上限'};
    const sourceUtf8=await file.text();
    const parsed=file.name.toLowerCase().endsWith('.js') ? null : JSON.parse(sourceUtf8);
    if(/\.opendesk-tool\.json$/i.test(file.name)||['opendesk.sidebar-tool.v1','opendesk.sidebar-tool.v2'].includes(parsed?.format))
      throw {code:'E_TASK_FILE_KIND',message:'这是扩展工具包，请到「扩展」选择「导入本地工具包」，不能作为自动化任务安装'};
    const project=[PROGRAM_DRAFT_FORMAT,PROGRAM_DRAFT_V2_FORMAT].includes(parsed?.format) ? await validateProgramDraft(parsed) : null;
    if(!project&&parsed&&parsed.format!==TASK_PACKAGE_FORMAT)
      throw {code:'E_TASK_FILE_KIND',message:'支持任务包 opendesk.task-package.v1、程序草稿 JSON 或 .js 源码；扩展包请到「扩展」导入'};
    if(!project && file.size>(parsed?TASK_PACKAGE_LIMIT:CONTROLLER_SOURCE_LIMIT))throw {code:'E_LIMIT',message:'文件超过任务包大小上限'};
    if(project || file.name.toLowerCase().endsWith('.js')) {
      const draft=project || sourceUtf8;
      if(catalogSurface) {
        const response=await api.runtime.sendMessage({protocol:'opendesk.sidebar.draft-import.v1',
          ...(project ? {draft} : {sourceUtf8})}).catch(error=>{
          const message=error?.message || String(error);
          if(message.includes('Receiving end does not exist'))return;
          throw {code:'E_DRAFT_TRANSPORT',message};
        });
        if(!response?.ok)throw response?.error || {code:'E_HOST_NOT_FOUND',message:'请在同一窗口打开 Sidebar，再重新导入 JavaScript 草稿'};
        return ui('task-catalog-status').text='已导入同窗口 Sidebar 的未保存草稿；返回目标网页，在「开发」明确运行。未保存、未安装、未自动执行。';
      }
      if(!importDraft)throw {code:'E_DRAFT_EDITOR_UNAVAILABLE',message:'开发编辑器尚未连接'};
      await importDraft(draft);
      navigate('develop');
      return ui('task-catalog-status').text='JavaScript 已进入未保存草稿；不能跳过任务验证直接安装';
    }else{
      const value=await client.request('importTaskPackage',{package:parsed});
      await refresh(identity(value));announce();
      return ui('task-catalog-status').text=`已导入待验证任务 ${identity(value)}；未自动赋予可信状态`;
    }
  }

  // The same workbench owns My and Web Flow task preparation. This is a
  // durable, UI-only guard; it never executes scripts or mints RunHost results.
  const SHEET_KEY='opendesk.shared-task-run-sheet.webflow.v1';
  const SHEET_LOCK='opendesk.shared-task-run-sheet.webflow.lock.v1';
  const pinFields=['taskId','version','manifestHash','generation','installationId'];
  let sheetCounter=0,prepared=null,preparationLoaded=false,preparationBusy=false,confirmClaimed=false;
  const samePin=(a,b)=>Boolean(a&&b&&pinFields.every(k=>a[k]===b[k]));
  const sameTarget=(a,b)=>Boolean(a&&b&&['tabId','windowId','documentId','url'].every(k=>a[k]===b[k]));
  const prepError=(code,message)=>Object.assign(new Error(message),{code});
  const serial=v=>JSON.stringify(v,(_k,x)=>x&&!Array.isArray(x)&&typeof x==='object'
    ?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
  const settled=v=>!v||v.state==='retired'||v.state==='cancelled';
  const sheetStatus=(stage,message='')=>{
    myView.data.taskSheetStage=stage;myView.data.taskSheetMessage=message;myView.publish();
  };
  async function sheetLock(fn){
    if(!globalThis.navigator?.locks?.request)throw prepError('E_LOCK_UNAVAILABLE','跨页面互斥锁不可用，拒绝运行');
    return globalThis.navigator.locks.request(SHEET_LOCK,{mode:'exclusive'},fn);
  }
  async function readSheet(){
    if(!api.storage?.local)throw prepError('E_STORAGE_UNAVAILABLE','可信存储不可用');
    const v=(await api.storage.local.get(SHEET_KEY))[SHEET_KEY];
    if(v==null)return null;
    if(v.format!=='opendesk.task-preparation.v1'||typeof v.id!=='string'||
      !['ready','submitted','unknown','retired','cancelled'].includes(v.state))
      throw prepError('E_PREPARE_CORRUPT','准备记录损坏；禁止重新提交');
    return v;
  }
  async function hasLegacyPending(){
    if(!api.storage?.local)throw prepError('E_STORAGE_UNAVAILABLE','无法读取旧请求');
    const key=sidebarToolStorageKey('webflow'),v=(await api.storage.local.get(key))[key];
    return Boolean(v&&typeof v==='object'&&v['webflow.pending.v1']);
  }
  function openSheet(taskId,source,trigger){
    const row=installed.find(r=>r.taskId===taskId),info=candidateFor(row);
    if(!preparationLoaded||disposed||!row?.enabled||row.runtimeCurrent===false||
      info?.stage!=='available'||info.runtimeCurrent===false)return false;
    if(ui('task-installed-list').value!==taskId){ui('task-installed-list').value=taskId;renderInstalledSelection();}
    const ready=prepared?.state==='ready'&&samePin(prepared.task,row);
    const blocked=!settled(prepared);
    sheetStatus(source==='webflow'?(blocked?(ready?'ready':'unknown'):'editing'):'editing',
      source==='webflow'&&blocked?(ready?'已恢复此前保存的参数；仍需明确确认，未自动执行。':
        '存在未释放的准备或执行记录，禁止新建请求。'):'');
    if(source==='webflow'&&ready){
      myView.data.taskParamsMode='json';ui('task-params-json').value=JSON.stringify(prepared.params,null,2);
      ui('task-params-json').error='';
    }
    myView.data.taskSheetRequest={requestId:++sheetCounter,source,trigger,
      identity:Object.fromEntries(pinFields.map(k=>[k,row[k]])),title:info.manifest.title};
    myView.publish();return true;
  }
  async function prepareSheet(event,expected){
    if(!event?.isTrusted||disposed||!preparationLoaded||preparationBusy||running||working||host.currentRun||
      myView.data.taskSheetRequest?.source!=='webflow'||myView.data.taskSheetStage!=='editing')return false;
    preparationBusy=true;let wrote=false;sheetStatus('saving','保存并核对参数中，此步骤不会调用 RunHost。');
    try{
      const row=installedRow(),info=candidateFor(row),target=currentPageTarget.capture();
      if(!row?.enabled||!samePin(row,expected)||info?.stage!=='available'||row.runtimeCurrent===false||
        info.runtimeCurrent===false)throw prepError('E_REVISION','任务安装身份或版本已变化');
      if(!info.manifest.siteOrigins.includes(new URL(target.url).origin))
        throw prepError('E_PERMISSION','当前网站不在固定任务授权范围');
      const params=paramsFromForm(info.manifest.paramsSchema);
      if(await hasLegacyPending())throw prepError('E_PENDING_LEGACY','Web Flow 旧请求未释放，先核对原记录');
      const resolved=await client.request('resolveInstalledTask',{taskId:row.taskId});
      await currentPageTarget.revalidate(target);
      if(!samePin(row,resolved)||resolved.manifestHash!==info.manifestHash)
        throw prepError('E_REVISION','Task Authority 的安装身份已改变');
      const item={format:'opendesk.task-preparation.v1',id:'webflow:'+globalThis.crypto.randomUUID(),
        state:'ready',task:Object.fromEntries(pinFields.map(k=>[k,row[k]])),
        contentHash:resolved.contentHash,params,target:Object.fromEntries(
          ['tabId','windowId','documentId','url'].map(k=>[k,target[k]])),createdAt:Date.now()};
      await sheetLock(async()=>{
        if(!settled(await readSheet())||await hasLegacyPending())
          throw prepError('E_PREPARE_BUSY','已有未释放的准备记录或旧请求');
        wrote=true;await api.storage.local.set({[SHEET_KEY]:item});
        if(serial(await readSheet())!==serial(item))
          throw prepError('E_SAVE_UNKNOWN','持久保存未能一致读回，禁止重跑');
      });
      prepared=item;confirmClaimed=false; // Only a distinct, durably read-back ready ID may be confirmed again.
      myView.data.taskParamsMode='json';ui('task-params-json').value=JSON.stringify(item.params,null,2);
      sheetStatus('ready','参数、安装身份和目标文档已冻结并读回；尚未执行网页操作。');
      return true;
    }catch(e){
      if(wrote){preparationLoaded=false;sheetStatus('unknown','准备保存结果未知；禁止重新创建执行身份。');}
      else sheetStatus('editing',formatTaskError(e));
      fail(e);return false;
    }finally{preparationBusy=false;}
  }
  async function cancelSheet(event,expected){
    if(!event?.isTrusted||preparationBusy||prepared?.state!=='ready'||!samePin(prepared.task,expected)||
      myView.data.taskSheetRequest?.source!=='webflow')return false;
    preparationBusy=true;sheetStatus('saving','正在取消尚未执行的准备。');
    try{
      const cancelled=await sheetLock(async()=>{
        const saved=await readSheet();
        if(saved?.id!==prepared.id||saved.state!=='ready')
          throw prepError('E_PREPARE_CHANGED','准备可能已被提交，禁止取消');
        const value={...saved,state:'cancelled'};
        await api.storage.local.set({[SHEET_KEY]:value});
        if(serial(await readSheet())!==serial(value))throw prepError('E_SAVE_UNKNOWN','取消回执未知');
        return value;
      });
      prepared=cancelled;confirmClaimed=false;sheetStatus('editing','准备已取消，没有发送执行请求。');
      return true;
    }catch(e){preparationLoaded=false;sheetStatus('unknown','取消状态未知；请核对原记录。');fail(e);return false;}
    finally{preparationBusy=false;}
  }
  async function claimSheet(item){
    return sheetLock(async()=>{
      const saved=await readSheet();
      if(saved?.id!==item.id||saved.state!=='ready'||!samePin(saved.task,item.task)||
        !sameTarget(saved.target,item.target)||serial(saved.params)!==serial(item.params)||
        saved.contentHash!==item.contentHash)
        throw prepError('E_PREPARE_CHANGED','准备已提交或改变，禁止重放');
      if(await hasLegacyPending())throw prepError('E_PENDING_LEGACY','旧请求未释放');
      const next={...saved,state:'submitted',submittedAt:Date.now()};
      await api.storage.local.set({[SHEET_KEY]:next});
      if(serial(await readSheet())!==serial(next))
        throw prepError('E_SAVE_UNKNOWN','提交标记读回失败；禁止再次确认');
      prepared=next;sheetStatus('submitted','唯一准备身份已占用，将调用原 RunHost。');
    });
  }
  async function querySheet(event,expected){
    if(!event?.isTrusted||myView.data.taskSheetRequest?.source!=='webflow')return false;
    try{
      const saved=await readSheet();
      if(!saved||!samePin(saved.task,expected))
        throw prepError('E_PREPARE_CHANGED','原准备记录已改变，不能查询其他身份');
      prepared=saved;
      if(saved.state==='ready'){
        sheetStatus('ready','原准备仍未提交 RunHost，可以继续核对并明确确认。');
        return true;
      }
      if(saved.state==='submitted'||saved.state==='unknown'){
        if(!saved.runId){
          sheetStatus('unknown','原准备已标记提交，但未取得可靠的 runId；禁止重跑。');
          return true;
        }
        const snapshot=await client.controller.snapshotControllerRun({});
        const current=installed.find(x=>samePin(x,saved.task));
        const run=snapshot.runs?.find(x=>x.runId===saved.runId&&
          current?.scriptId===x.revision?.scriptId);
        const result=snapshot.results?.find(x=>x.runId===saved.runId&&
          current?.scriptId===x.revision?.scriptId);
        const label=run?.state?runStateNames[run.state]||run.state:'尚未读到可信运行记录';
        sheetStatus('unknown','原 RunHost '+label+'。'+(result?'持久结果存在；':'结果尚未确认；')+
          '资源释放尚未独立确认，不能自动重跑。');
        return true;
      }
      sheetStatus(saved.state==='retired'?'retired':'editing',
        saved.state==='retired'?'原 RunHost 已明确释放资源。':'尚未运行的准备已取消。');
      return true;
    }catch(e){sheetStatus('unknown','查询失败或状态未知；禁止新建执行。');fail(e);return false;}
  }
  async function stopSheet(event,expected){
    if(!event?.isTrusted||myView.data.taskSheetRequest?.source!=='webflow')return false;
    try{
      const saved=await readSheet();
      if(!saved||!samePin(saved.task,expected)||!['submitted','unknown'].includes(saved.state)||
        !saved.runId||host.currentRun!==saved.runId)
        throw prepError('E_STOP_UNAVAILABLE','原 RunHost 在当前窗口无可停止的运行槽；请使用原运行记录核对');
      await host.stop({runId:saved.runId,controller:true,reason:'E_CANCELLED'});
      sheetStatus('unknown','已向原 RunHost 请求停止；已产生的网页副作用不会撤销。请查询原请求验证收尾。');
      return true;
    }catch(e){sheetStatus('unknown','停止回执或运行槽未确认，不能自动重跑。');fail(e);return false;}
  }
  function confirmSheet(event,expected){
    if(!event?.isTrusted||!preparationLoaded||preparationBusy||confirmClaimed||
      myView.data.taskSheetRequest?.source!=='webflow'||myView.data.taskSheetStage!=='ready'||
      prepared?.state!=='ready'||!samePin(prepared.task,expected))return false;
    confirmClaimed=true; // Consume the second, real, user gesture synchronously.
    const accepted=run(event,null,expected,prepared);
    if(accepted!==true)confirmClaimed=false;
    return accepted===true;
  }
  // Only a real trusted click is an active attempt; this is telemetry only,
  // never an execution requirement or a permission prompt.
  const reportTaskUsage=(kind,taskId,runId)=>{
    if(typeof taskId!=='string'||!taskId)return;
    void api.runtime.sendMessage({protocol:'opendesk.analytics.v1',
      kind,event:kind==='event.manual_attempt'?'tool.manual_attempt':'tool.manual_result',
      toolId:'opendesk',channel:'extension',toolIdentity:taskId,
      ...(runId?{runId}:{})}).catch(()=>{});
  };
  function run(event,agentIntent=null,expectedIdentity=null,preparedAttempt=null) {
    if(!event?.isTrusted||disposed||running||working||host.currentRun||!preparationLoaded||
      (agentIntent===null&&ui('task-run').disabled)||
      (preparedAttempt&&!samePin(preparedAttempt.task,expectedIdentity))){
      if(agentIntent) return Promise.reject(Object.assign(new Error('运行宿主繁忙、已关闭或缺少用户确认'),{code:'E_TASK_BUSY'}));
      return expectedIdentity?false:undefined;
    }
    let chosen,params,site,permission,captured;
    try {
      chosen=agentIntent?installed.find(row=>row.taskId===agentIntent.taskId):installedRow();
      if(!agentIntent)for(const {name}of myView.data.taskParams||[])ui('task-param-'+name).error='';
      if(chosen?.enabled)reportTaskUsage('event.manual_attempt',chosen.taskId);
      const expected=agentIntent?.expected||expectedIdentity;
      if(expected&&(!chosen||(expectedIdentity&&chosen.taskId!==expectedIdentity.taskId)||
        ['version','manifestHash','generation','installationId'].some(key=>
          chosen[key]!==expected[key])))
        throw {code:'E_REVISION',message:'确认期间任务固定版本或安装授权已变化，请重新核查'};
      const info=candidateFor(chosen);
      if(chosen?.runtimeCurrent===false||info?.runtimeCurrent===false)throw {code:'E_BUILTIN_VERSION_UNAVAILABLE',message:'运行时已更新，请对同一固定任务重新验证并确认安装'};
      if(!chosen?.enabled||info?.stage!=='available')throw {code:'E_PERMISSION',message:'当前任务未启用或不可安装'};
      captured=currentPageTarget.capture();
      if(preparedAttempt&&!sameTarget(preparedAttempt.target,captured))
        throw prepError('E_TARGET_CHANGED','确认时网页文档身份已改变，不能重放');
      site=new URL(captured.url).origin;
      if(!info.manifest.siteOrigins.includes(site))throw {code:'E_PERMISSION',message:'此任务不适用于当前网站'};
      params=preparedAttempt?validateTaskParams(info.manifest.paramsSchema,preparedAttempt.params):
        agentIntent?validateTaskParams(info.manifest.paramsSchema,agentIntent.params):
        paramsFromForm(info.manifest.paramsSchema);
      chosen={...chosen,manifestHash:info.manifestHash,title:info.manifest.title};
      permission=requireChromePermissions({api,request:{origins:[permissionPattern(captured.url)]}});
    }catch(error){fail(error);return agentIntent?Promise.reject(error):(expectedIdentity?false:undefined);}
    running=true;activeRunId=null;agentStopRequested=false;agentStartSubmitted=false;
    runOwnerKey=identity(chosen);runOwnerTitle=chosen.title||chosen.taskId;
    ui('task-result-panel').hidden=true;update();
    setTaskNotice(runOwnerKey,'正在检查访问权限并验证目标网页');
    const pendingRun=(async()=>{
      await permission;
      if(disposed)throw {code:'E_HOST_CLOSED',message:'Sidebar 已关闭'};
      await currentPageTarget.revalidate(captured);
      const resolved=await client.request('resolveInstalledTask',{taskId:chosen.taskId});
      await currentPageTarget.revalidate(captured); // Close resolve -> start document race.
      if(resolved.taskId!==chosen.taskId || resolved.version!==chosen.version || resolved.manifestHash!==chosen.manifestHash)
        throw {code:'E_REVISION',message:'安装的任务版本已改变，请重新选择'};
      if((resolved.generation??null)!==(chosen.generation??null)||
        (resolved.installationId??null)!==(chosen.installationId??null))throw {code:'E_REVISION',message:'任务安装或授权已改变，请重新运行'};
      if(!resolved.manifest.siteOrigins.includes(site))throw {code:'E_PERMISSION',message:'安装网站权限不匹配'};
      // The Agent's initial check predates asynchronous document/version reads.
      // Recheck its retained model grant at the actual RunHost write boundary.
      // Manual Run keeps the original synchronous Chrome permission entry.
      if(agentIntent?.assertWrite)await agentIntent.assertWrite();
      if(preparedAttempt){
        if(resolved.contentHash!==preparedAttempt.contentHash)
          throw prepError('E_REVISION','准备的脚本内容身份已经变化');
        await claimSheet(preparedAttempt);
      }else{
        const outstanding=await readSheet();
        if(!settled(outstanding))throw prepError('E_PREPARE_BUSY','Web Flow 有未释放准备或执行，不能从「我的」绕过');
        if(await hasLegacyPending())throw prepError('E_PENDING_LEGACY','Web Flow 旧请求未释放，先核对');
      }
      if(disposed)throw {code:'E_HOST_CLOSED',message:'Sidebar 已关闭'};
      if(agentIntent&&(agentStopRequested||agentIntent.signal?.aborted))
        throw {code:'E_CANCELLED',message:'已请求停止，尚未启动任务'};
      agentStartSubmitted=Boolean(agentIntent);
      const claim=await host.start({source:{kind:'saved',scriptId:resolved.scriptId,revision:resolved.revision,
          contentHash:resolved.contentHash},params,expectedTaskGeneration:chosen.generation??null,expectedTaskInstallationId:chosen.installationId??null,
        target:{mode:'borrowed',tabId:captured.tabId,frameId:0,documentId:captured.documentId,
          expectedUrl:captured.url,expectedWindowId:captured.windowId},
        deadlineAt:Date.now()+(resolved.manifest.deadlineMs??30000)});
      activeRunId=claim.runId;agentStartSubmitted=false;
      if(preparedAttempt){
        try{await sheetLock(async()=>{
          const saved=await readSheet();
          if(saved?.id!==preparedAttempt.id||saved.state!=='submitted')
            throw prepError('E_PREPARE_CHANGED','运行已提交但保存的准备身份变化');
          const value={...saved,runId:claim.runId};
          await api.storage.local.set({[SHEET_KEY]:value});
          if(serial(await readSheet())!==serial(value))
            throw prepError('E_SAVE_UNKNOWN','真实 runId 持久读回失败');
          prepared=value;
        });}catch(e){
          // The RunHost may already be executing. Never retry the start.
          setTaskNotice(runOwnerKey,'原 RunHost 已收到执行；运行 ID 保存未知，禁止重新执行：'+formatTaskError(e));
        }
      }
      if(agentIntent&&agentStopRequested){
        // Stop can arrive while the RunHost admission RPC has been sent but
        // before its runId is known. Cancel the late run exactly once, and
        // never claim that possible web side effects were rolled back.
        try { await host.stop({runId:claim.runId,controller:true,reason:'E_CANCELLED'}); }
        catch { throw {code:'E_OUTCOME_UNKNOWN',message:'停止已提交但 Worker 收尾未知，请勿重放'}; }
        throw {code:'E_OUTCOME_UNKNOWN',message:'已请求停止；任务可能已经产生网页效果，请勿重放'};
      }
      setTaskNotice(runOwnerKey,`运行中：${resolved.manifest.title} · v${resolved.version}`);
      update(); // Expose the owning Stop immediately; do not rely on a later host event.
      const completion=await host.completion;
      if(preparedAttempt&&!host.currentRun&&!completion?.pendingSettlement&&terminal.has(completion?.state)&&
        completion.retirement?.state==='released'&&completion.result){
        try{await sheetLock(async()=>{
          const v=await readSheet();if(v?.id!==preparedAttempt.id||v.state!=='submitted')return;
          const next={...v,state:'retired',runId:claim.runId,retiredAt:Date.now()};
          await api.storage.local.set({[SHEET_KEY]:next});
          if(serial(await readSheet())!==serial(next))throw prepError('E_SAVE_UNKNOWN','释放记录读回失败');
          prepared=next;sheetStatus('retired','原运行完成且资源释放。');
        });}catch(e){setTaskNotice(identity(chosen),'释放证据未确认；禁止新请求：'+formatTaskError(e));}
      }
      reportTaskUsage('event.manual_result',resolved.taskId,claim.runId);
      if(completion?.state==='paused_unknown'||completion?.pendingSettlement)
        setTaskNotice(runOwnerKey,unresolvedTaskRunMessage());
      else if(completion?.error)setTaskNotice(runOwnerKey,formatTaskError(completion.error));
      return {runId:claim.runId,completion,taskId:resolved.taskId,
        version:resolved.version,installationId:resolved.installationId};
    })().catch(async error=>{
      if(agentIntent&&agentStartSubmitted)
        error={code:'E_OUTCOME_UNKNOWN',
          message:'RunHost.start 已提交但未取得可靠 runId；可能已产生网页变化，请勿重放'};
      if(activeRunId)reportTaskUsage('event.manual_result',chosen.taskId,activeRunId);
      if(error.code==='E_REVISION'&&!disposed)await refresh(undefined,{skipUnchanged:true}).catch(fail);
      setTaskNotice(identity(chosen),formatTaskError(error));
      if(agentIntent)throw error;
      return null;
    }).finally(async()=>{
      running=false;agentStopRequested=false;agentStartSubmitted=false;
      if(disposed)return;
      renderTaskStatus();update(); // Retire the visible Stop without waiting for history RPC.
      try{
        // A proven legacy installation gains its durable identity only inside
        // first-run admission. Refresh it before the next explicit Run click.
        if(!chosen.installationId)await refresh(undefined,{skipUnchanged:true});
        await refreshHistory();
      }catch(error){fail(error);}
      renderTaskStatus();update();
    });
    return agentIntent?pendingRun:(expectedIdentity?true:undefined);
  }
  async function verify() {
    const row=candidate();
    if(!row)throw {code:'E_SCHEMA',message:'先选择候选'};
    const runId=ui('task-verify-run').value.trim()||developer('script-run-id')?.value?.trim();
    if(!runId)throw {code:'E_VERIFICATION',message:'需要真实运行的 runId'};
    const result=await client.request('verifyTaskCandidate',{taskId:row.taskId,version:row.version,runId});
    await refresh(identity(result));announce();
    ui('task-catalog-status').text=`${identity(result)}：已核对本机持久运行及页面原生回执；不代表第三方审核`;
  }
  async function publish() {
    const row=candidate();if(!row)throw {code:'E_SCHEMA',message:'先选择候选'};
    const value=await client.request('makeTaskAvailable',{taskId:row.taskId,version:row.version,manifestHash:row.manifestHash});
    await refresh(identity(value));announce();ui('task-catalog-status').text=`${identity(value)} 已成为本地可安装版本`;
  }
  async function install(event) {
    const row=structuredClone(candidate());if(!row)throw {code:'E_SCHEMA',message:'先选择任务'};
    const previous=structuredClone(installed.find(value=>value.taskId===row.taskId));
    await permissionConsent.confirm(event,permissionRequest(row));
    if(disposed)throw {code:'E_HOST_CLOSED',message:'任务面板已关闭'};
    const installedTask=await client.request('installTask',{taskId:row.taskId,version:row.version,
      manifestHash:row.manifestHash,expectedInstalledVersion:previous?.version ?? null,
      expectedGeneration:previous?.generation??null,expectedInstallationId:previous?.installationId??null});
    if(disposed)return;
    await refresh(identity(row));
    if(disposed)return;
    announce();onTaskInstalled?.(installedTask.taskId);
    success(`已安装 ${installedTask.taskId} · v${installedTask.version}`,{
      caption:'返回目标网页，在 Sidebar「我的」填写参数并运行。'});
    const installedMessage=`已安装「${row.manifest.title}」v${installedTask.version}。返回目标网页，在 Sidebar「我的」填写参数并运行。`;
    ui('task-catalog-status').text=installedMessage;
    ui('task-install-feedback').text=installedMessage;
    // The full-page catalog has no visible Sidebar tabs/dock. Never navigate
    // it to a hidden task pane after installation.
    if(!catalogSurface)navigate('tasks');
  }
  async function toggle() {
    const row=structuredClone(installedRow());if(!row)throw {code:'E_SCHEMA',message:'请选择已安装任务'};
    if(!row.enabled)await requireChromePermissions({api,request:permissionRequest(candidateFor(row))});
    if(disposed)throw {code:'E_HOST_CLOSED',message:'任务面板已关闭'};
    await client.request('setInstalledTaskEnabled',{taskId:row.taskId,version:row.version,enabled:!row.enabled,
      expectedGeneration:row.generation??null,expectedInstallationId:row.installationId??null});
    if(disposed)return;
    await refresh();
    if(disposed)return;
    announce();success(row.enabled?'任务已停用':'任务已重新启用');
  }
  async function uninstall() {
    const row=installedRow();if(!row)throw {code:'E_SCHEMA',message:'请选择已安装任务'};
    await client.request('uninstallTask',{taskId:row.taskId,version:row.version,
      expectedGeneration:row.generation??null,expectedInstallationId:row.installationId??null});
    if(disposed)return;
    await refresh();
    if(disposed)return;
    announce();success('已卸载确定版本；历史结果仍可保留');
  }
  async function fork() {
    const row=installedRow();if(!row)throw {code:'E_SCHEMA',message:'请选择任务'};
    const value=await client.request('getTaskCandidate',{taskId:row.taskId,version:row.version});
    if(!importDraft)throw {code:'E_DRAFT_EDITOR_UNAVAILABLE',message:'开发编辑器尚未连接'};
    await importDraft(value.package.sourceUtf8);
    navigate('develop');
    patchDeveloperField(developerView,developer('task-dev-status'),{textContent:'已复制独立未保存草稿；原已安装版本未变化'});
  }
  const asyncAction=fn=>async event=>{
    if(working||disposed)return;
    working=true;update();
    try{await fn(event);}catch(error){fail(error);}finally{working=false;update();}
  };
  reactNavigation?.connect(tab=>{
    if(navigate(tab)===false)return false;
    if(tab==='tasks')refresh(undefined,{skipUnchanged:true}).catch(fail);
    return true;
  });
  registerAction('openCatalogClick',()=>navigate('catalog'));
  const taskAddMenu=ui('task-add-menu');
  function showTaskAddMenu(open){
    if(!taskAddMenu){if(open)navigate('catalog');return;}
    taskAddMenu.hidden=!open;
    ui('task-open-catalog').attributes['aria-expanded']=String(open);
    if(open){
      get('workspace-content')?.scrollTo?.({top:0});
      focus('task-add-import',{preventScroll:true});
    }else if(doc.documentElement?.dataset?.opendeskTab==='tasks')
      focus('task-open-catalog',{preventScroll:true});
  }
  registerAction('taskOpenCatalogClick',()=>showTaskAddMenu(taskAddMenu?.hidden!==false));
  if(taskAddMenu){
    taskAddMenu.hidden=true;
    registerAction('taskAddCloseClick',()=>showTaskAddMenu(false));
    registerAction('taskAddImportClick',()=>get('task-add-file')?.click?.());
    registerAction('taskAddCatalogClick',()=>{
      showTaskAddMenu(false);navigate('catalog');
    });
    registerAction('taskAddDevelopClick',()=>{
      if(navigate('develop')!==false){
        showTaskAddMenu(false);
        get('tab-develop').focus?.({preventScroll:true});
      }
    });
    registerAction('taskAddFileChange',asyncAction(async()=>{
      const input=ui('task-add-file'),file=input.files?.[0];
      if(!file)return;
      try{
        const status=await readFile(file);
        ui('task-add-status').text=status+
          (file.name.toLowerCase().endsWith('.js')?'':'；需要安装时，请打开「浏览任务目录」审阅和验证');
        if(doc.documentElement?.dataset?.opendeskTab==='develop'){
          showTaskAddMenu(false);
          get('tab-develop').focus?.({preventScroll:true});
        }
      }catch(error){
        ui('task-add-status').text=formatTaskError(error);
        throw error;
      }finally{input.value='';}
    }));
  }
  registerAction('taskManageToggleClick',event=>{
    if(!event.isTrusted||!installed.length)return;
    setTaskManagementMode(!taskManagementMode);
  });
  registerAction('taskSearchPanelKeydown',event=>{
    if(event.key!=='Escape'||event.defaultPrevented||event.isComposing||!taskManagementMode)return;
    event.preventDefault();
    setTaskManagementMode(false);
    taskSearchReturnFocus();
  });
  registerAction('localDiscoverSearchInput',()=>{
    localQuery=ui('local-discover-search').value.trim().toLocaleLowerCase();
    renderInstalledCards();update();
  });
  for(const value of ['all','current','disabled'])
    registerAction(actionName('local-filter-'+value,'click'),()=>{
      localFilter=value;renderInstalledCards();update();
    });
  registerAction('taskSearchInput',()=>{catalogQuery=ui('task-search').value.trim().toLocaleLowerCase();renderCatalogCards();});
  registerAction('taskCatalogFilterClick',filter=>{
    if(!['all','installed','available','candidate'].includes(filter))return;
    catalogFilter=filter;renderCatalogCards();
  });
  const selectCandidate=key=>{
    if(key&&!catalog.some(row=>identity(row)===key))return;
    catalogSelectionEpoch++;catalogList.value=key;ui('task-verify-run').value='';
    renderCatalogCards();renderCandidate();
  };
  registerAction('taskCatalogSelect',selectCandidate);
  registerAction('taskCatalogSourceOpen',readCandidateSource);
  registerAction('taskParamsFormSubmit',event=>event.preventDefault());
  registerAction('taskParamsFormInput',persistParams);
  registerAction('taskParamsFormChange',persistParams);
  registerAction('taskParamsModeChange',mode=>{
    if(!['form','json'].includes(mode)||(myView.data.taskParamsMode||'form')===mode)return;
    const row=installedRow(),schema=candidateFor(row)?.manifest.paramsSchema;
    if(!schema)return;
    try{
      const params=paramsFromForm(schema);
      if(mode==='json')ui('task-params-json').value=JSON.stringify(params,null,2);
      else for(const [name,rule]of Object.entries(schema.properties)){
        const control=ui('task-param-'+name);
        control.omitted=!Object.hasOwn(params,name);control.error='';
        if(rule.type==='boolean'&&!rule.enum)control.checked=params[name]===true;
        else control.value=control.omitted?'':String(params[name]);
      }
      ui('task-params-json').error='';myView.data.taskParamsMode=mode;
      persistParams();myView.publish();
    }catch(error){fail(error);}
  });
  registerAction('taskInstalledListChange',renderInstalledSelection);
  registerAction('taskResultRevealClick',()=>{
    const entry=latestResultDisplay,row=installedRow();
    if(!row || entry?.taskKey!==identity(row) || typeof entry.fullText!=='string')return;
    const button=ui('task-result-reveal'), showing=button.dataset.revealed==='true';
    ui('task-result').text=showing?entry.text:entry.fullText;
    button.dataset.revealed=String(!showing);
    button.text=showing?'查看完整原值':'隐藏完整原值';
  });
  registerAction('taskCatalogListChange',()=>selectCandidate(catalogList.value));
  registerAction('taskRunClick',(event,expected)=>run(event,null,expected));
  registerAction('taskRunSheetOpen',(event,taskId,trigger)=>event?.isTrusted&&openSheet(taskId,'my',trigger));
  registerAction('taskRunSheetClose',()=>{myView.data.taskSheetRequest=null;myView.publish();});
  registerAction('taskRunSheetPrepare',prepareSheet);
  registerAction('taskRunSheetConfirm',confirmSheet);
  registerAction('taskRunSheetCancel',cancelSheet);
  registerAction('taskRunSheetQuery',querySheet);
  registerAction('taskRunSheetStop',stopSheet);
  registerAction('taskStopClick',asyncAction(()=>activeRunId && host.currentRun===activeRunId?
    host.stop({runId:activeRunId,controller:true}):Promise.resolve()));
  registerAction('taskRefreshClick',asyncAction(()=>refresh()));
  registerAction('taskCatalogRefreshClick',asyncAction(()=>refresh()));
  registerAction('taskPackageFileChange',asyncAction(()=>readFile()));
  registerAction('taskVerifyClick',asyncAction(verify));
  registerAction('taskPublishClick',asyncAction(publish));
  registerAction('taskInstallClick',asyncAction(install));
  const createCandidateButton=developer('task-create-candidate');
  if(createCandidateButton)listeners.push({remove:developerAction(developerView,createCandidateButton,'click',asyncAction(createCandidate))});
  registerAction('taskToggleClick',asyncAction(toggle));
  registerAction('taskUninstallClick',event=>{
    if(!event.isTrusted||working)return;
    const row=installedRow();if(!row)return;
    pendingTaskUninstall={taskId:row.taskId,version:row.version,
      generation:row.generation??null,installationId:row.installationId??null};
    const info=candidateFor(row);
    ui('task-uninstall-summary').text=
      '卸载「'+(info?.manifest.title||row.taskId)+'」v'+row.version+'？历史结果仍可能保留。';
    ui('task-uninstall-confirm').hidden=false;
    focus('task-uninstall-cancel',{preventScroll:true});
    update();
  });
  registerAction('taskUninstallCancelClick',event=>{
    if(!event.isTrusted)return;
    dismissTaskUninstall();
    focus('task-uninstall',{preventScroll:true});
    update();
  });
  registerAction('taskUninstallYesClick',asyncAction(async event=>{
    if(!event.isTrusted||!pendingTaskUninstall)return;
    const selected=installedRow(),pending=pendingTaskUninstall;
    if(!selected||selected.taskId!==pending.taskId||selected.version!==pending.version||
      (selected.generation??null)!==pending.generation||
      (selected.installationId??null)!==pending.installationId){
      dismissTaskUninstall();
      throw {code:'E_TASK_CHANGED',message:'安装版本已变化，请重新检查后卸载'};
    }
    try{await uninstall();}finally{dismissTaskUninstall();}
  }));
  registerAction('taskToolsToggle',()=>{
    if(!ui('task-tools').open)dismissTaskUninstall();
  });
  registerAction('taskForkDraftClick',asyncAction(fork));
  const unsubscribePage=currentPageTarget?.subscribe(next=>{
    currentPage=next;update();renderInstalledCards();
  });
  const unsubscribeRun=host.subscribe(value=>{
    if(disposed)return;
    if(value?.runId&&value.runId===activeRunId) {
      setTaskNotice(runOwnerKey,`任务状态：${runStateNames[value.state]||value.state||'运行中'}`);
      if(terminal.has(value.state))refreshHistory().catch(fail);
    }
    renderTaskStatus();update();
  });
  const unsubscribeConn=client.subscribeConnection?.(state=>{if(state.connected)refresh().catch(fail);});
  client.ready.then(async()=>{
    await restoreParams().catch(error=>console.warn('Task parameter drafts could not be restored',error));
    try{prepared=await readSheet();preparationLoaded=true;}
    catch(error){preparationLoaded=false;fail(error);}
    if(!disposed)return refresh();
  }).catch(fail);
  navigate('tasks',{initial:true});update();
  // Subscribe to cross-document refresh hints only once the instance can be
  // returned and its existing dispose() can own the channel's lifetime.
  updates=typeof globalThis.BroadcastChannel==='function'
    ?new globalThis.BroadcastChannel('opendesk-task-catalog-updates-v1'):null;
  updates?.addEventListener?.('message',event=>{
    if(!disposed&&event.data?.type==='catalog-changed')refresh().catch(fail);
  });
  return {navigate,showCatalogPage,refresh,myView,setWorkflowRunOwner(runId) {
    workflowClaimPending=runId==='pending';
    workflowRunId=runId && runId!=='pending'?runId:null;
    if(!disposed)syncRunDock();
  },connectToolsView(listener) {
    toolsViewListener=listener;
    listener?.(doc.documentElement?.dataset?.opendeskTab==='tools' && !catalogSurface);
  },setToolActive(value) {
    toolActive=Boolean(value);
    if(!disposed)syncRunDock();
  },setScheduledSurfaceActive(value) {
    scheduledSurfaceActive=Boolean(value);
    if(!disposed)syncRunDock();
  },setScheduledRunOwner(runId) {
    scheduledRunId=typeof runId==='string'&&runId?runId:null;
    if(!disposed)syncRunDock();
  },runInstalledForAgent({taskId,params,event,expected,signal,assertWrite}){
    return run(event,{taskId,params,expected,signal,assertWrite});
  },stopAgentTask({taskId,event}){
    if(!event?.isTrusted||disposed||!running||
      runOwnerKey!==identity(installed.find(row=>row.taskId===taskId)))
      throw Object.assign(new Error('未找到该任务正在运行的有效执行槽'),{code:'E_RUN_NOT_ACTIVE'});
    if(agentStopRequested)return Promise.resolve({requested:true,pending:true});
    agentStopRequested=true;
    if(activeRunId&&host.currentRun===activeRunId)
      return host.stop({runId:activeRunId,controller:true,reason:'E_CANCELLED'});
    // No runId yet: run() checks this flag before host.start, then cancels
    // the late claim if the RPC already crossed the RunHost boundary.
    return Promise.resolve({requested:true,pending:agentStartSubmitted});
  },async openTaskRunSheet(taskId,{expectedPin,assertAuthorized=()=>{}}={}){
    if(!validTaskId(taskId)||expectedPin?.taskId!==taskId)
      throw prepError('E_SCHEMA','配置请求缺少有效任务身份');
    await client.ready;await refresh();await assertAuthorized();
    const row=installed.find(r=>r.taskId===taskId),info=candidateFor(row);
    if(!row?.enabled||row.runtimeCurrent===false||info?.stage!=='available'||info.runtimeCurrent===false||
      ['taskId','version','manifestHash','contentHash'].some(k=>
        (k==='contentHash'?info?.manifest?.program?.sourceHash:row[k])!==expectedPin[k]))
      throw prepError('E_REVISION','固定 Task 安装身份不符合工具审阅版本');
    const latest=await readSheet();
    await assertAuthorized();prepared=latest;preparationLoaded=true;
    return openSheet(taskId,'webflow');
  },async openTaskReview(taskId,{assertAuthorized=()=>{}}={}) {
    if(!validTaskId(taskId))throw {code:'E_SCHEMA',message:'任务标识无效'};
    await client.ready;
    await refresh();
    await assertAuthorized();
    if(disposed)return false;
    if(installed.some(row=>row.taskId===taskId))return this.focusInstalledTask(taskId);
    if(catalogSurface){selectTaskReview(taskId);return true;}
    const url=new URL(api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH));
    url.searchParams.set('taskReviewId',taskId);
    await api.tabs.create({url:url.href});
    return true;
  },focusInstalledTask(taskId) {
    // Selecting an installed task for management is safe even when it is disabled.
    // The Run button is gated separately by the installed enabled state.
    const selectedRow=installed.find(row=>row.taskId===taskId);
    if(disposed||!selectedRow)return false;
    if(navigate('tasks')===false)return false;
    // A manager handoff must not leave its explicitly selected task filtered out.
    localQuery='';localFilter='all';ui('local-discover-search').value='';
    setTaskManagementMode(false);
    ui('task-installed-list').value=taskId;
    renderInstalledSelection();
    return true;
  },receiveDraft(sourceUtf8) {
    if(disposed || catalogSurface || typeof importDraft !== 'function')throw {code:'E_HOST_NOT_FOUND',message:'Sidebar 编辑器不可用'};
    const applied=importDraft(sourceUtf8);
    if(applied?.then)return applied.then(() => {if(!disposed)navigate('develop');});
    navigate('develop');
  },dispose() {
    if(disposed)return;disposed=true;
    permissionSequence++;permissionConsent.dispose();
    unsubscribePage?.();unsubscribeRun?.();unsubscribeConn?.();
    for(const {remove} of listeners)remove();
    listeners.length=0;updates?.close?.();
  }};
}
