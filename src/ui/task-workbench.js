import {CONTROLLER_SOURCE_LIMIT,TASK_PACKAGE_LIMIT} from '../platform/source-budgets.js';
import {createMyWorkbenchView} from './my-workbench-view.js';
import {APP_DOCUMENT_PATH,SIDEPANEL_DOCUMENT_PATH} from '../tool-document-url.js';
import {patchDeveloperField,developerAction} from './develop-view.js';
import {permissionPattern} from '../environment.js';
import {createChromePermissionConsent,requireChromePermissions} from '../platform/chrome/permission-gate.js';
import {decodeValue} from '../platform/page-port/codec.js';
import {createTaskPackage, validateTaskParams, TASK_PACKAGE_FORMAT} from '../platform/tasks/contract.js';
import {digestUtf8} from '../platform/protocol.js';
import {PROGRAM_DRAFT_FORMAT, PROGRAM_DRAFT_V2_FORMAT, PROGRAM_DRAFT_INPUT_LIMIT, PROGRAM_DRAFT_LIMIT, validateProgramDraft} from './program-source.js';
import {formatTaskValue, presentTaskValue, formatTaskError, formatTaskRunTechnical,
  unresolvedTaskRunMessage} from './task-run-diagnostics.js';
import {formatRunValue} from './run-value-format.js';
import {matchTaskReviewHandoff,taskReviewHandoffKey} from './workflow/task-review-handoff.js';
import {sameTaskPin} from '../platform/tasks/delegation-contract.js';

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
  let sharedPreparation=null,sheetAuthorization=null,sheetBusy=false,sheetSequence=0,inspectionSequence=0;
  const taskIdentity=row=>{
    const info=candidateFor(row);
    return {...Object.fromEntries(['taskId','version','manifestHash','installationId','generation'].map(key=>[key,row?.[key]])),
      contentHash:info?.verification?.sourceHash||info?.manifest?.program?.sourceHash||row?.contentHash};
  };
  const sameInstallation=(a,b)=>sameTaskPin(a,b)&&a?.installationId===b?.installationId&&a?.generation===b?.generation;
  let sheetValidation=null;
  function sheetStatus(status,phase){
    const fields=['task-params-json',...(myView.data.taskParams||[]).map(({name})=>'task-param-'+name)]
      .filter(id=>status&&ui(id).error?.endsWith(status));
    sheetValidation=fields.length?{status,fields}:null;
    if(myView.data.taskRunSheet)myView.data.taskRunSheet={...myView.data.taskRunSheet,status,
      ...(phase?{phase}:{}),busy:sheetBusy};
    ui('task-status').text=status;myView.publish();
  }
  function selectSheetTask(taskId){
    if(!installed.some(row=>row.taskId===taskId))throw {code:'E_PERMISSION',message:'任务未安装'};
    ui('task-installed-list').value=taskId;renderInstalledSelection();
  }
  function showPreparation(preparation,snapshot,settled=false){
    sharedPreparation=preparation.state==='cancelled'||settled===true?null:preparation;
    if(!preparation.task){sheetStatus('原准备已取消，尚未提交的操作不会执行。','cancelled');return;}
    const row=installed.find(row=>sameInstallation(taskIdentity(row),preparation.task));
    const info=row&&candidateFor(row),schema=info?.manifest.paramsSchema;
    const recoveryOnly=!row||!row.enabled||!schema;
    if(row)selectSheetTask(row.taskId);
    if(schema){
      // A native single-line Input cannot display line breaks from saved runs.
      // Keep the original params in the existing JSON editor when recovering.
      const hasMultiline=Object.entries(schema.properties).some(([name,rule])=>
        rule.type==='string'&&!rule.enum&&typeof preparation.params[name]==='string'&&
        /[\r\n]/u.test(preparation.params[name]));
      if(hasMultiline)myView.data.taskParamsMode='json';
      for(const [name,rule]of Object.entries(schema.properties)){
        const control=ui('task-param-'+name),value=preparation.params[name];
        control.omitted=!Object.hasOwn(preparation.params,name);
        if(rule.type==='boolean'&&!rule.enum)control.checked=value===true;
        else control.value=control.omitted?'':String(value);
      }
      ui('task-params-json').value=JSON.stringify(preparation.params,null,2);persistParams();
    }
    myView.project('taskRunSheet',{identity:{...preparation.task},title:info?.manifest.title||preparation.task.taskId,
      source:'tool',target:preparation.target,recoveryOnly,originalParams:preparation.params,
      phase:preparation.state==='cancelled'?'cancelled':settled===true?'settled':preparation.state==='prepared'?'prepared':preparation.state==='unknown'?'unknown':'submitted',
      preparationId:preparation.preparationId,status:preparation.state==='cancelled'
        ?'原准备已取消；请关闭后打开新配置。'
        :settled===true?'原运行已结算并释放资源；'+(snapshot?.results?.some(result=>result.runId===snapshot.run?.runId&&result.resultId===snapshot.run?.resultId&&result.outcome)?'结果以持久回执为准。':'结果当前不可见。')+'请关闭后打开新配置。'
        :recoveryOnly?'原安装已不可用；原参数只读，仅可查询或取消原请求，不能执行。'
        :preparation.state==='prepared'?'参数和网页身份已持久保存并读回，尚未提交网页执行。'
        :'已恢复原请求，只能查询或停止；不会自动重新运行。',busy:false,
      ...(snapshot?{snapshot,resultText:preparationResultText(snapshot)}:{})});
  }
  function preparationResultText(snapshot){
    const outcome=snapshot.results?.find(result=>result.runId===snapshot.run?.runId&&result.resultId===snapshot.run?.resultId)?.outcome;
    if(!outcome)return '';
    if(!outcome.ok)return formatTaskError(outcome.error);
    try{return formatTaskValue(decodeValue(outcome.valueWire));}
    catch{return '结果已保存，但无法安全显示；请查看原运行记录。';}
  }
  async function inspectPreparation(id,{show=false}={}){
    const sequence=sheetSequence,request=++inspectionSequence;
    const originalId=myView.data.taskRunSheet?.preparationId;
    const reply=await client.request('inspectTaskRun',id?{preparationId:id}:{});
    if(disposed)return null;
    const preparation=reply?.preparation;
    if(!preparation){if(!id&&sequence===sheetSequence&&request===inspectionSequence)sharedPreparation=null;return null;}
    if(id&&preparation.preparationId!==id)return null;
    if(sequence!==sheetSequence||request!==inspectionSequence)return reply;
    sharedPreparation=preparation.state==='cancelled'||reply.settled===true?null:preparation;
    if(show&&myView.data.taskRunSheet&&myView.data.taskRunSheet.preparationId===originalId)
      showPreparation(preparation,reply.snapshot,reply.settled);
    return reply;
  }
  async function openTaskRunSheet({task,binding=null,preparationId=null,assertAuthorized=async()=>{},trigger=null}){
    if(disposed||sheetBusy)return false;
    const sequence=++sheetSequence;
    await client.ready;await refresh(undefined,{skipUnchanged:true});await assertAuthorized();
    const previous=await inspectPreparation(preparationId);
    await assertAuthorized();
    if(disposed||sequence!==sheetSequence)return false;
    if(preparationId&&(!previous?.preparation||!sameInstallation(previous.preparation.task,task)))
      throw {code:'E_REVISION',message:'原准备不存在或任务身份不匹配；不能打开新配置'};
    if(previous?.preparation){
      const original=previous.preparation;
      // Frame instances may reopen, but the installed task and App package /
      // revocation generation must still own this preparation. Never borrow
      // a global preparation under another caller's authorization callback.
      const sameBinding=!original.binding&&!binding||Boolean(original.binding&&binding&&
        ['appId','packageHash','generation'].every(key=>original.binding[key]===binding[key])&&
        sameInstallation(original.binding.task,binding.task));
      if(!sameInstallation(original.task,task)||!sameBinding)
        throw {code:preparationId?'E_REVISION':'E_TASK_BUSY',message:'已有其他任务或应用身份的准备占用；请从原入口查询或取消，不能确认执行'};
    }
    sheetAuthorization=assertAuthorized;
    if(previous?.preparation){showPreparation(previous.preparation,previous.snapshot,previous.settled);return true;}
    const resolved=await client.request('resolveInstalledTask',{taskId:task.taskId,purpose:'configure'});
    await assertAuthorized();
    if(disposed||sequence!==sheetSequence)return false;
    if(!sameInstallation(resolved,task))throw {code:'E_REVISION',message:'任务安装身份已变化，请刷新脚本列表'};
    selectSheetTask(task.taskId);
    myView.project('taskRunSheet',{identity:{...task},title:resolved.manifest.title,source:binding?'tool':'my',
      phase:'editing',binding,trigger,sites:resolved.manifest.siteOrigins,status:''});
    return true;
  }
  function prepareSheet(event,expected){
    const sheet=myView.data.taskRunSheet;
    if(!event?.isTrusted||sheetBusy||!sheet||sheet.phase!=='editing'||!sameInstallation(sheet.identity,expected))return false;
    let params,target;
    try{
      const row=installedRow(),info=candidateFor(row);
      if(!sameInstallation(taskIdentity(row),expected))throw {code:'E_REVISION',message:'任务安装身份已变化'};
      params=paramsFromForm(info.manifest.paramsSchema);
      const captured=currentPageTarget.capture();
      target={mode:'borrowed',tabId:captured.tabId,frameId:0,documentId:captured.documentId,
        expectedUrl:captured.url,expectedWindowId:captured.windowId};
    }catch(error){fail(error);sheetStatus(formatTaskError(error));return false;}
    // Allocate once before the first await. Lost persistence ACKs only inspect
    // this identity; they never mint a second request or submit a Run.
    const sequence=sheetSequence;
    const preparationId=sheet.preparationId||crypto.randomUUID();
    const current=()=>!disposed&&sequence===sheetSequence&&myView.data.taskRunSheet?.preparationId===preparationId;
    myView.data.taskRunSheet={...sheet,preparationId};sheetBusy=true;
    sheetStatus('正在保存并核对；尚未执行网页操作。','preparing');
    void (async()=>{
      await sheetAuthorization?.();
      if(!current())return;
      await client.request('prepareTaskRun',{preparationId,task:expected,params,target,
        ...(sheet.binding?{binding:sheet.binding}:{})});
      if(!current())return;
      const reply=await inspectPreparation(preparationId);
      if(!reply?.preparation||reply.preparation.preparationId!==preparationId)
        throw {code:'E_OUTCOME_UNKNOWN',message:'准备记录未能可靠读回；请查询原请求'};
      if(current())showPreparation(reply.preparation,reply.snapshot,reply.settled);
    })().catch(error=>{
      if(current())sheetStatus(formatTaskError(error)+'；仅可查询或取消同一准备身份。','unknown');
    }).finally(()=>{if(current()){sheetBusy=false;
      myView.data.taskRunSheet={...myView.data.taskRunSheet,busy:false};myView.publish();}});
    return false;
  }
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
    if(sheetValidation&&myView.data.taskRunSheet?.status===sheetValidation.status&&
      sheetValidation.fields.some(id=>!ui(id).error)){
      myView.data.taskRunSheet={...myView.data.taskRunSheet,status:''};sheetValidation=null;myView.publish();
    }
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
    const app=new URL(doc.location?.href||globalThis.location?.href||api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH)).pathname===`/${APP_DOCUMENT_PATH}`;
    // Only getCurrent identifies this extension document's Tab. The page target
    // may belong to another window and must never supply a PC draft scope.
    const tab=app?await api.tabs.getCurrent():null;
    const windowId=app?tab?.windowId:currentPageTarget?.snapshot?.windowId;
    if(!Number.isSafeInteger(windowId)||(app&&!Number.isSafeInteger(tab?.id)))return;
    const key=`opendesk.sidebar.task-params.v1:${windowId}${app?`:tab:${tab.id}`:''}`;
    const saved=(await api.storage.session.get(key))[key];
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
    const key=JSON.stringify(taskIdentity(installed.find(item=>item.taskId===row.taskId)||row));
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
  function paramsFromForm(schema,{draft=false}={}) {
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
      else if(rule.type==='integer'||rule.type==='number'){
        const number=control.value===''?NaN:Number(control.value);
        // An editor switch must retain unfinished numeric text. Non-finite
        // numbers would otherwise become null when serialized to JSON.
        value=draft&&(!String(control.value).trim()||!Number.isFinite(number))?control.value:number;
      }
      else value=control.value;
      if(rule.enum) {
        // Select serializes string representations; restore the declared primitive.
        const choice=rule.enum.find(item=>String(item)===String(control.value));
        if(choice!==undefined)value=choice;
      }
      result[name]=value;
    }
    if(draft)return result;
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
    const otherPreparedTask=Boolean(sharedPreparation)&&myView.data.taskRunSheet?.source!=='tool';
    ui('task-run').disabled=working||running||!!host.currentRun||otherPreparedTask||
      !available||!siteAvailable||!taskMatchesView(row,info,origin);
    myView.data.taskRunBlockedReason=working?'正在处理任务，请稍候':running||host.currentRun?'已有任务正在运行，请先停止或等待完成':
      otherPreparedTask?'Web Flow 有尚未释放的准备或执行身份，请先核对原步骤，不能从「我的」另起任务':
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
    // The trusted TaskWorkbench is the only file parser for My and the catalog.
    // Import is not verification, installation, association or execution.
    const file=fileOverride||ui('task-package-file').files?.[0];
    if(!file)return;
    if(!fileOverride)ui('task-package-file').value='';
    const filename=String(file.name||'');
    const isJavaScript=/\.js$/i.test(filename);
    const isJson=/\.json$/i.test(filename);
    if(!isJavaScript&&!isJson)
      throw {code:'E_TASK_FILE_KIND',message:/\.(zip|md)$/i.test(filename)?
        'ZIP/项目目录与 Web Flow Markdown 不是可直接安装的 Controller Task。请使用对应开发或工作流入口。':
        '不支持此文件格式；请选择 .js 源码、Task Package JSON 或 Program Draft JSON'};
    if(!Number.isFinite(file.size)||file.size<=0)
      throw {code:'E_TASK_FILE_EMPTY',message:'文件为空或无法读取，请选择实际的单个文件'};
    if(file.size>PROGRAM_DRAFT_INPUT_LIMIT)
      throw {code:'E_LIMIT',message:'文件超过程序草稿包大小上限，请缩小文件后重新选择'};
    let sourceUtf8;
    try{sourceUtf8=await file.text();}
    catch{throw {code:'E_TASK_FILE_READ',message:'文件读取失败，请检查文件权限后重新选择'};}
    if(!sourceUtf8.trim())throw {code:'E_TASK_FILE_EMPTY',message:'文件内容为空，未导入'};
    let parsed=null;
    if(isJson){
      try{parsed=JSON.parse(sourceUtf8);}
      catch{throw {code:'E_TASK_JSON',message:'JSON 语法错误，请检查括号、逗号与引号后重试'};}
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
        throw {code:'E_TASK_FILE_KIND',message:'JSON 必须是具有 format 的任务包或程序草稿对象'};
    }else if(sourceUtf8.trimStart().startsWith('{')){
      // Prevent a structured package named *.js being silently accepted as
      // executable source. A normal JS object/function remains an inert draft.
      let disguised=null;
      try{disguised=JSON.parse(sourceUtf8);}catch{/* Not JSON; treat as source draft. */}
      if(disguised&&typeof disguised.format==='string')
        throw {code:'E_TASK_FILE_KIND',message:'文件内容是结构化 JSON 包而不是 JavaScript 源码，请使用 .json 后重新导入'};
    }
    if(/\.opendesk-tool\.json$/i.test(filename)||
      ['opendesk.sidebar-tool.v1','opendesk.sidebar-tool.v2'].includes(parsed?.format))
      throw {code:'E_TASK_FILE_KIND',message:'这是 Sidebar Tool 扩展包，请在「扩展」使用原可信安装入口'};
    if(typeof parsed?.format==='string'&&/page|user.script|userscript/i.test(parsed.format))
      throw {code:'E_TASK_FILE_KIND',message:'这是 Page USER_SCRIPT/网页增强，不是 Controller Task；请前往「扩展 → 网页增强」'};
    const project=[PROGRAM_DRAFT_FORMAT,PROGRAM_DRAFT_V2_FORMAT].includes(parsed?.format)
      ? await validateProgramDraft(parsed):null;
    if(!project&&parsed&&parsed.format!==TASK_PACKAGE_FORMAT)
      throw {code:'E_TASK_FILE_KIND',message:'不支持该 JSON 格式；任务包需为 opendesk.task-package.v1，或合法 Program Draft'};
    if(!project && file.size>(parsed?TASK_PACKAGE_LIMIT:CONTROLLER_SOURCE_LIMIT))
      throw {code:'E_LIMIT',message:'文件超过任务包或 JavaScript 源码大小上限'};
    if(project||isJavaScript){
      const draft=project||sourceUtf8;
      if(catalogSurface){
        const response=await api.runtime.sendMessage({protocol:'opendesk.sidebar.draft-import.v1',
          ...(project?{draft}:{sourceUtf8})}).catch(error=>{
          const message=error?.message||String(error);
          if(message.includes('Receiving end does not exist'))return;
          throw {code:'E_DRAFT_TRANSPORT',message};
        });
        if(!response?.ok)throw response?.error||
          {code:'E_HOST_NOT_FOUND',message:'请在同一窗口打开 Sidebar，再重新导入 JavaScript 草稿'};
        return ui('task-catalog-status').text='文件已送到同窗口「开发」的未保存草稿；未安装、未运行、未授权。请前往开发核对。';
      }
      if(!importDraft)throw {code:'E_DRAFT_EDITOR_UNAVAILABLE',message:'开发编辑器尚未连接'};
      await importDraft(draft);
      navigate('develop');
      return ui('task-catalog-status').text='文件已进入「开发」的未保存草稿；请先审阅、验证，不会自动安装或运行。';
    }
    const value=await client.request('importTaskPackage',{package:parsed});
    await refresh(identity(value));announce();
    return ui('task-catalog-status').text=`已导入待验证任务 ${identity(value)}；请核对源码与 Manifest，尚未安装或授权。`;
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
  function run(event,agentIntent=null,expectedIdentity=null,preparation=null) {
    if(!event?.isTrusted||disposed||running||working||host.currentRun||
      (agentIntent===null&&!preparation&&ui('task-run').disabled)){
      if(agentIntent) return Promise.reject(Object.assign(new Error('运行宿主繁忙、已关闭或缺少用户确认'),{code:'E_TASK_BUSY'}));
      return expectedIdentity?false:undefined;
    }
    const writeAuthorization=preparation?sheetAuthorization:null;
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
      if(preparation){
        if(preparation.state!=='prepared'||!sameInstallation(preparation.task,expectedIdentity)||
          preparation.target.tabId!==captured.tabId||preparation.target.documentId!==captured.documentId||
          preparation.target.expectedUrl!==captured.url||preparation.target.expectedWindowId!==captured.windowId)
          throw {code:'E_DOCUMENT_STALE',message:'保存后的任务或目标网页已变化，请取消准备后重新核对'};
      }
      site=new URL(captured.url).origin;
      if(!info.manifest.siteOrigins.includes(site))throw {code:'E_PERMISSION',message:'此任务不适用于当前网站'};
      params=preparation?validateTaskParams(info.manifest.paramsSchema,preparation.params):agentIntent?validateTaskParams(info.manifest.paramsSchema,agentIntent.params):
        paramsFromForm(info.manifest.paramsSchema);
      chosen={...chosen,manifestHash:info.manifestHash,title:info.manifest.title};
      permission=requireChromePermissions({api,request:{origins:[permissionPattern(captured.url)]}});
    }catch(error){fail(error);return agentIntent?Promise.reject(error):(expectedIdentity?false:undefined);}
    const sequence=sheetSequence;
    // A reopened preparation has the same ID but owns a new sheet instance.
    const currentSheet=()=>!disposed&&sequence===sheetSequence&&
      myView.data.taskRunSheet?.preparationId===preparation?.preparationId;
    running=true;activeRunId=null;agentStopRequested=false;agentStartSubmitted=false;
    runOwnerKey=identity(chosen);runOwnerTitle=chosen.title||chosen.taskId;
    ui('task-result-panel').hidden=true;update();
    setTaskNotice(runOwnerKey,'正在检查访问权限并验证目标网页');
    const pendingRun=(async()=>{
      await permission;
      if(preparation){
        await sheetAuthorization?.();
        const checked=await inspectPreparation(preparation.preparationId);
        if(!checked?.preparation||checked.settled===true||checked.preparation.state!=='prepared'||
          JSON.stringify(checked.preparation.params)!==JSON.stringify(preparation.params))
          throw {code:'E_REVISION',message:'原准备身份已提交、取消或变化，只能查询原请求'};
      }
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
      if(disposed)throw {code:'E_HOST_CLOSED',message:'Sidebar 已关闭'};
      if(agentIntent&&(agentStopRequested||agentIntent.signal?.aborted))
        throw {code:'E_CANCELLED',message:'已请求停止，尚未启动任务'};
      if(writeAuthorization)await writeAuthorization();
      if(preparation)await currentPageTarget.revalidate(captured);
      agentStartSubmitted=Boolean(agentIntent);
      const claim=await host.start({source:{kind:'saved',scriptId:resolved.scriptId,revision:resolved.revision,
          contentHash:resolved.contentHash},params,expectedTaskGeneration:chosen.generation??null,expectedTaskInstallationId:chosen.installationId??null,
        target:{mode:'borrowed',tabId:captured.tabId,frameId:0,documentId:captured.documentId,
          expectedUrl:captured.url,expectedWindowId:captured.windowId},
        ...(preparation?{taskPreparationId:preparation.preparationId,
          requestId:preparation.preparationId,...(preparation.binding?{taskDelegation:preparation.binding}:{})}:{}),
        deadlineAt:preparation?.deadlineAt??Date.now()+(resolved.manifest.deadlineMs??30000)});
      activeRunId=claim.runId;agentStartSubmitted=false;
      if(preparation&&currentSheet())sheetStatus('已提交原运行；查询原请求查看真实结果。','submitted');
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
      if(preparation&&currentSheet())sheetStatus(formatTaskError(error)+'；请查询原请求，不要重跑。','unknown');
      if(agentIntent)throw error;
      return null;
    }).finally(async()=>{
      running=false;agentStopRequested=false;agentStartSubmitted=false;
      if(disposed)return;
      renderTaskStatus();update(); // Retire the visible Stop without waiting for history RPC.
      if(preparation&&currentSheet())await inspectPreparation(preparation.preparationId).then(reply=>{
        if(reply&&currentSheet())
          showPreparation(reply.preparation,reply.snapshot,reply.settled);
      }).catch(error=>{if(currentSheet())sheetStatus(formatTaskError(error),'unknown');});
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
      const input=ui('task-add-file');
      try{await importSelectedFiles(input.files,'add');}
      finally{
        input.files=null;
        const node=get('task-add-file');if(node)node.value='';
      }
    }));
  }
  // HTML file input and drag-and-drop both pass the same File to readFile.
  // There is no second parser, Host request or application-owned Task store.
  function isFileDrag(event){
    return Array.from(event?.dataTransfer?.types||[]).includes('Files');
  }
  function markImportDrag(source,active){
    const field=ui(source==='add'?'task-add-menu':'task-catalog-dropzone');
    if(field.dataset.importDragActive===String(active))return;
    field.dataset.importDragActive=String(active);
    myView.publish();
  }
  async function importSelectedFiles(fileList,source){
    const files=Array.from(fileList||[]);
    if(!files.length)return; // User canceled picker; no mutation.
    try{
      if(files.length!==1)
        throw {code:'E_TASK_FILE_COUNT',message:`一次只能导入 1 个文件；本次选择了 ${files.length} 个，均未导入。请逐个选择。`};
      const message=await readFile(files[0]);
      if(disposed)return;
      ui(source==='add'?'task-add-status':'task-catalog-status').text=message;
      success(message);
      if(source==='add'&&doc.documentElement?.dataset?.opendeskTab==='develop'){
        showTaskAddMenu(false);
        focus('tab-develop',{preventScroll:true});
      }
    }catch(error){
      const message=formatTaskError(error);
      ui(source==='add'?'task-add-status':'task-catalog-status').text=message;
      throw error;
    }finally{myView.publish();}
  }
  registerAction('taskFileDragEnter',(source,event)=>{
    if(!isFileDrag(event))return;
    event.preventDefault();markImportDrag(source,true);
  });
  registerAction('taskFileDragOver',(source,event)=>{
    if(!isFileDrag(event))return;
    event.preventDefault();
    if(event.dataTransfer)event.dataTransfer.dropEffect='copy';
  });
  registerAction('taskFileDragLeave',(source,event)=>{
    if(event.currentTarget?.contains?.(event.relatedTarget))return;
    markImportDrag(source,false);
  });
  const droppedFiles=asyncAction(({files,source})=>importSelectedFiles(files,source));
  registerAction('taskFileDrop',(source,event)=>{
    if(!isFileDrag(event))return;
    event.preventDefault();event.stopPropagation();
    markImportDrag(source,false);
    return droppedFiles({files:event.dataTransfer?.files,source});
  });
  registerAction('taskFileZoneKeydown',(source,event)=>{
    if(event.target!==event.currentTarget||event.isComposing||event.repeat)return;
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      get(source==='add'?'task-add-file':'task-package-file')?.click?.();
    }else if(source==='add'&&event.key==='Escape'){
      event.preventDefault();showTaskAddMenu(false);
    }
  });
  registerAction('taskManageToggleClick',event=>{
    if(!event.isTrusted||!installed.length)return;
    setTaskManagementMode(!taskManagementMode);
  });
  registerAction('taskSearchPanelKeydown',event=>{
    if(event.key!=='Escape'||event.defaultPrevented||event.isComposing||event.repeat||!taskManagementMode)return;
    event.preventDefault();
    const search=ui('local-discover-search');
    if(event.target===get('local-discover-search')&&search.value){
      // First Escape clears only the query; retain the filter and input focus.
      search.value='';localQuery='';renderInstalledCards();update();
      return;
    }
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
      const params=paramsFromForm(schema,{draft:mode==='json'});
      if(mode==='form'){
        const multiline=Object.entries(schema.properties).find(([name,rule])=>
          rule.type==='string'&&!rule.enum&&typeof params[name]==='string'&&/[\r\n]/u.test(params[name]));
        if(multiline)throw {code:'E_PARAMS',message:`「${multiline[1].title||multiline[0]}」包含换行符；请在 JSON 模式编辑，避免单行输入框丢失内容`};
      }
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
  registerAction('taskParamsMultilinePaste',({name,text,start,end})=>{
    const schema=candidateFor(installedRow())?.manifest.paramsSchema;
    const rule=schema?.properties?.[name];
    if(myView.data.taskParamsMode!=='form'||rule?.type!=='string'||rule.enum||
      typeof text!=='string'||!/[\r\n]/u.test(text))return;
    const control=ui('task-param-'+name),old=String(control.value??'');
    const from=Number.isInteger(start)?Math.max(0,Math.min(start,old.length)):old.length;
    const to=Number.isInteger(end)?Math.max(from,Math.min(end,old.length)):from;
    const params=paramsFromForm(schema,{draft:true});
    params[name]=old.slice(0,from)+text+old.slice(to);
    ui('task-params-json').value=JSON.stringify(params,null,2);
    ui('task-params-json').error='';
    myView.data.taskParamsMode='json';
    ui('task-status').text='已转入 JSON 编辑以完整保留粘贴文本中的换行符。';
    persistParams();myView.publish();
    focus('task-params-json',{preventScroll:true});
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
  registerAction('taskParametersOpen',(taskId,event,trigger)=>{
    if(!event?.isTrusted||disposed||sheetBusy)return false;
    const sequence=++sheetSequence;
    if(sharedPreparation){showPreparation(sharedPreparation);return true;}
    selectSheetTask(taskId);sheetAuthorization=null;
    myView.project('taskRunSheet',{identity:taskIdentity(installedRow()),title:candidateFor(installedRow())?.manifest.title,
      source:'my',phase:'editing',trigger,sites:candidateFor(installedRow())?.manifest.siteOrigins,status:''});
    // Discovery is read-only. A cross-host preparation is also enforced again
    // by Authority, even if this asynchronous hint has not reached the UI yet.
    void inspectPreparation(null,{show:true}).catch(error=>{
      if(!disposed&&sequence===sheetSequence&&myView.data.taskRunSheet)sheetStatus(formatTaskError(error));
    });
    return true;
  });
  registerAction('taskSheetClose',()=>{rememberParams();persistParams();sheetSequence++;sheetBusy=false;sheetValidation=null;myView.project('taskRunSheet',null);});
  registerAction('taskSheetPrepareClick',prepareSheet);
  registerAction('taskSheetConfirmClick',(event,expected)=>{
    const sheet=myView.data.taskRunSheet;
    if(!event?.isTrusted||sheetBusy||sheet?.phase!=='prepared'||sheet.recoveryOnly||!sharedPreparation||
      sharedPreparation.preparationId!==sheet.preparationId||!sameInstallation(sheet.identity,expected))return false;
    // Invalidate synchronously before any permission or persistence awaits.
    sheetStatus('正在复核原准备；只提交一次。','submitted');
    if(run(event,null,expected,sharedPreparation)!==true)
      sheetStatus(ui('task-status').text||'未提交，请查询或取消原准备。','prepared');
    return false;
  });
  registerAction('taskSheetQueryClick',event=>{
    const id=myView.data.taskRunSheet?.preparationId;
    if(!event?.isTrusted||sheetBusy||!id)return;
    const sequence=sheetSequence;
    const current=()=>!disposed&&sequence===sheetSequence&&myView.data.taskRunSheet?.preparationId===id;
    sheetBusy=true;
    myView.data.taskRunSheet={...myView.data.taskRunSheet,busy:true};myView.publish();
    void inspectPreparation(id,{show:true}).then(reply=>{
      if(current()&&!reply)sheetStatus('原准备尚未查明；保留身份，可取消同一准备。','unknown');
    }).catch(error=>{if(current())sheetStatus(formatTaskError(error),'unknown');}).finally(()=>{
      if(current()){sheetBusy=false;myView.data.taskRunSheet={...myView.data.taskRunSheet,busy:false};myView.publish();}});
  });
  registerAction('taskSheetCancelClick',event=>{
    const id=myView.data.taskRunSheet?.preparationId;
    if(!event?.isTrusted||sheetBusy||!id)return;
    const sequence=sheetSequence;
    const current=()=>!disposed&&sequence===sheetSequence&&myView.data.taskRunSheet?.preparationId===id;
    sheetBusy=true;
    myView.data.taskRunSheet={...myView.data.taskRunSheet,busy:true};myView.publish();
    void client.request('cancelTaskRun',{preparationId:id}).then(()=>{
      if(current())return inspectPreparation(id);
    }).then(reply=>{
      if(!current())return;
      if(reply?.preparation)showPreparation(reply.preparation,reply.snapshot,reply.settled);
      else sheetStatus('停止已请求；不代表撤销网页效果，请查询原请求确认资源释放。','submitted');
    }).catch(error=>{if(current())sheetStatus(formatTaskError(error),'unknown');}).finally(()=>{
      if(current()){sheetBusy=false;myView.data.taskRunSheet={...myView.data.taskRunSheet,busy:false};myView.publish();}});
  });
  registerAction('taskSheetStopClick',event=>myView.actions.taskSheetCancelClick?.(event));
  registerAction('taskStopClick',asyncAction(()=>activeRunId && host.currentRun===activeRunId?
    host.stop({runId:activeRunId,controller:true}):Promise.resolve()));
  registerAction('taskRefreshClick',asyncAction(()=>refresh()));
  registerAction('taskCatalogRefreshClick',asyncAction(()=>refresh()));
  registerAction('taskPackageFileChange',asyncAction(async()=>{
    const input=ui('task-package-file');
    try{await importSelectedFiles(input.files,'catalog');}
    finally{
      input.files=null;
      const node=get('task-package-file');if(node)node.value='';
    }
  }));
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
    if(!disposed){await refresh();await inspectPreparation().catch(error=>console.warn('Task preparation recovery unavailable',error));}
  }).catch(fail);
  navigate('tasks',{initial:true});update();
  // Subscribe to cross-document refresh hints only once the instance can be
  // returned and its existing dispose() can own the channel's lifetime.
  updates=typeof globalThis.BroadcastChannel==='function'
    ?new globalThis.BroadcastChannel('opendesk-task-catalog-updates-v1'):null;
  updates?.addEventListener?.('message',event=>{
    if(!disposed&&event.data?.type==='catalog-changed')refresh().catch(fail);
  });
  return {navigate,showCatalogPage,refresh,myView,openTaskRunSheet,setWorkflowRunOwner(runId) {
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
