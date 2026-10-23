import {createMyWorkbenchView} from './my-workbench-view.js';
import {SIDEPANEL_DOCUMENT_PATH} from '../tool-document-url.js';
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

const states={candidate:'待验证',verified:'本机验证通过',available:'本地可用'};
const terminal=new Set(['completed','failed','stopped','interrupted']);
const runStateNames={preparing:'正在准备',running:'运行中',stopping:'正在停止',settling:'保存结果中',completed:'成功',failed:'失败',stopped:'已停止',interrupted:'已中断',paused_unknown:'状态待确认'};
const textValue=formatTaskValue;

export function createTaskWorkbench({client,host,currentPageTarget,api=globalThis.chrome,
  document:doc=globalThis.document,importDraft,executionSource,debugEnabled=false,onNavigate,onTabSelected,onTaskInstalled,
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
  let catalogSurface=false, catalogQuery='', catalogFilter='all';
  let localQuery='', localFilter='all', taskManagementMode=false, pendingTaskUninstall=null;
  const parameterDrafts=new Map();
  let parameterDraftKey, parametersEdited=false, parameterSerial='', parameterWrites=Promise.resolve();
  function rememberParams() {
    if(!renderKey)return;
    const prior={};
    for(const {name,rule} of myView.data.taskParams||[]){
      const control=ui('task-param-'+name);
      prior[name]=rule.type==='boolean'?{checked:control.checked}:{value:control.value};
    }
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
  function navigate(name,{initial=false}={}) {
    // Previous Discover URLs now open the local task search in My.
    if(name==='discover')name='tasks';
    if(name==='debug'&&!debugEnabled)return false;
    if(!['tasks','workflow','develop','tools','cloud','catalog','debug'].includes(name))return;
    if(name==='catalog'&&!catalogSurface) {
      // Package import and installation live only in a separate full-size
      // extension tab. Sidebar Discover is a view of installed local tasks.
    Promise.resolve().then(()=>api.tabs.create({url:api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH)})).catch(fail);
      return;
    }
    // Ask the live tool before changing panes or destroying its editor.
    if(toolsViewListener?.(name==='tools' && !catalogSurface,name)===false)return false;
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
    const taskHidden=catalogSurface || (taskOwns?false:scheduledSurfaceActive || scheduledOwns || draftOwns || workflowOwns || view!=='tasks' || toolActive);
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
      if(disposed||!catalogSurface||!api.storage?.session||!api.windows?.getCurrent)return;
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
      ui('task-catalog-status').text=selected.runId
        ? '已根据同窗口固定版本预选候选并预填真实运行 ID；仍需亲自核对运行证据、设为可用并确认安装。'
        : '已定位候选固定版本；请先用相同源码真实运行，然后核对证据。未自动验证或安装。';
    })().catch(error=>console.warn('Task review shortcut unavailable; use manual catalog review',error));
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
    return `${manifest.title} · v${row.version}\n${manifest.description}\n作者：${manifest.author} · 来源：${manifest.source}\n适用：${manifest.siteOrigins.join(', ')}\n权限：${manifest.permissions.join(', ')}\n状态：${states[row.stage] || row.stage}${row.verifiedAt?' · 有本机运行验证记录':''}`;
  };
  function renderForm(row) {
    const key=identity(row);
    if(renderKey===key)return;
    rememberParams();renderKey=key;
    const schema=row.manifest.paramsSchema,prior=parameterDrafts.get(key)||{};
    const fields=Object.entries(schema.properties).map(([name,rule])=>{
      const control=ui('task-param-'+name),saved=prior[name];
      if(rule.type==='boolean')control.checked=saved?.checked??(rule.default===true);
      else control.value=saved?.value??(Object.hasOwn(rule,'default')?String(rule.default):
        rule.enum&&schema.required.includes(name)?String(rule.enum[0]):'');
      return {name,rule,required:schema.required.includes(name)};
    });
    myView.project('taskParams',fields);
  }
  function paramsFromForm(schema) {
    const result={};
    for(const [name,rule] of Object.entries(schema.properties)) {
      const control=ui('task-param-'+name);
      if(!control)throw {code:'E_PARAMS',message:`缺少参数输入：${name}`};
      let value;
      if(rule.type==='boolean')value=control.checked;
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
    return validateTaskParams(schema,result);
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
    const available=row?.enabled && info?.stage==='available';
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
    ui('task-stop').disabled=!activeRunId || host.currentRun!==activeRunId;
    ui('task-fork-draft').disabled=!row||working;
    const toggleAction=ui('task-toggle'),toggleLabel=row?.enabled?'停用任务':'启用任务';
    toggleAction.disabled=!row||working;
    toggleAction.title=toggleLabel;toggleAction.attributes['aria-label']=toggleLabel;
    toggleAction.text=toggleLabel;
    ui('task-uninstall').disabled=!row||working;
    ui('task-uninstall-yes').disabled=!row||working||!pendingTaskUninstall;
    if(catalogList){
    ui('task-verify').disabled=working||!selected||selected.stage!=='candidate';
    ui('task-publish').disabled=working||!selected||selected.stage!=='verified';
    ui('task-install').disabled=working||!selected||selected.stage!=='available'||
      selected.installed&&selected.enabled||candidatePermission?.manifestHash!==selected?.manifestHash||!candidatePermission?.state;
    ui('task-install').text=selected?.installed?'已安装':addedTaskSites(selected).length?'确认新增权限并安装':'安装确定版本';
    patchDeveloperField(developerView,developer('task-create-candidate'),{disabled:working});
    }
    syncRunDock();myView.publish();
  }
  const taskSearchReturnFocus=()=>focus(ui('task-search-toggle').hidden?'task-open-catalog':'task-search-toggle',{preventScroll:true});
  function renderInstalledCards() {
    const selected=ui('task-installed-list').value;
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
        title:info?.manifest.title||row.taskId,description:info?.manifest.description||'已安装任务'};
    }),selectedId:selected,emptyText,manageMode:taskManagementMode,onManage:openTaskManagement,
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
    if(taskManagementMode){
      ui('task-tools').open=true;
      if(!installedRow()&&installed[0]){
        ui('task-installed-list').value=installed[0].taskId;
        renderInstalledSelection();
      }
    }else{
      dismissTaskUninstall();
      ui('task-tools').open=false;
    }
    renderInstalledCards();
  }
  function dismissTaskUninstall() {
    pendingTaskUninstall=null;
    ui('task-uninstall-confirm').hidden=true;
  }
  function renderInstalled() {
    ui('task-installed-count').text=installed.length+' 个';
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
      ...catalog.map(row=>({label:`${row.manifest.title} · v${row.version} · ${states[row.stage]}`,value:identity(row)}))
    ]);
    catalogList.value=catalog.some(row=>identity(row)===old)?old:'';
    renderCatalogCards();renderCandidate();
  }
  function renderCatalogCards() {
    const rows=catalog.filter(row=>{
      if(catalogFilter==='installed'&&!row.installed)return false;
      if(catalogFilter==='available'&&row.stage!=='available')return false;
      if(catalogFilter==='candidate'&&row.stage!=='candidate')return false;
      const manifest=row.manifest;
      return [manifest.title,manifest.description,manifest.author,manifest.source,...manifest.siteOrigins]
        .join(' ').toLocaleLowerCase().includes(catalogQuery);
    });
    ui('task-catalog-count').text=`共 ${rows.length} 个本地任务版本`;
    myView.project('catalogRows',{selectedKey:catalogList.value,filter:catalogFilter,rows:rows.map(row=>({
      key:identity(row),title:row.manifest.title,description:row.manifest.description,
      state:`${states[row.stage]||row.stage} · v${row.version}${row.installed?' · 已安装':''}`
    }))});
  }
  function renderCandidate() {
    const row=candidate();
    if(!row){myView.project('catalogDetail',null);update();return;}
    const schema=row.manifest.paramsSchema,paramFields=Object.entries(schema.properties);
    myView.project('catalogDetail',{
      key:identity(row),title:row.manifest.title,description:row.manifest.description,
      facts:[['版本',row.version],['作者',row.manifest.author],['来源',row.manifest.source],
        ['适用网站',row.manifest.siteOrigins.join('、')],['所需权限',row.manifest.permissions.join('、')],
        ['验证状态',states[row.stage]||row.stage]].map(([name,value])=>({name,value})),
      hashes:`源码 SHA-256：${row.manifest.program.sourceHash}\nManifest SHA-256：${row.manifestHash}`,
      paramsNote:paramFields.length?'运行参数：'+paramFields.map(([name,rule])=>
        (rule.title||name)+'（'+rule.type+(schema.required.includes(name)?'，必填':'，可选')+
        (Object.hasOwn(rule,'default')?'，默认 '+String(rule.default):'')+'）').join('；'):'运行参数：无',
      source:'展开后从正式任务目录读取固定版本；只查看，不运行。',sourceLoaded:false,
      note:row.stage==='available'?'只有当前确定版本通过本地可信验证后，才可明确安装。浏览器网站权限仍需单独批准。'
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
    if(skipUnchanged&&JSON.stringify([catalog,installed])===JSON.stringify([result.catalog,result.installed]))return;
    catalog=result.catalog;installed=result.installed;
    renderInstalled();renderCatalog(preferred);
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
    const manifest={format:'opendesk.task.v1',taskId:developer('task-dev-id').value.trim(),
      version:developer('task-dev-version').value.trim(),title:developer('task-dev-title').value.trim(),
      description:developer('task-dev-description').value.trim(),author:developer('task-dev-author').value.trim(),
      source:'local-developer',siteOrigins:[new URL(captured.url).origin],
      permissions:['page.automation'],entryFormat:'async-main',
      program:{revision:saved.revision,sourceHash:await digestUtf8(saved.sourceUtf8)},
      paramsSchema:JSON.parse(developer('task-dev-schema').value)};
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
    if(!project && file.size>100000)throw {code:'E_LIMIT',message:'文件超过任务包大小上限'};
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
  // Only a real trusted click is an active attempt; this is telemetry only,
  // never an execution requirement or a permission prompt.
  const reportTaskUsage=(kind,taskId,runId)=>{
    if(typeof taskId!=='string'||!taskId)return;
    void api.runtime.sendMessage({protocol:'opendesk.analytics.v1',
      kind,event:kind==='event.manual_attempt'?'tool.manual_attempt':'tool.manual_result',
      toolId:'opendesk',channel:'extension',toolIdentity:taskId,
      ...(runId?{runId}:{})}).catch(()=>{});
  };
  function run(event,agentIntent=null) {
    if(!event?.isTrusted||disposed||running||working||host.currentRun||
      (agentIntent===null&&ui('task-run').disabled)){
      if(agentIntent) return Promise.reject(Object.assign(new Error('运行宿主繁忙、已关闭或缺少用户确认'),{code:'E_TASK_BUSY'}));
      return;
    }
    let chosen,params,site,permission,captured;
    try {
      chosen=agentIntent?installed.find(row=>row.taskId===agentIntent.taskId):installedRow();
      if(chosen?.enabled)reportTaskUsage('event.manual_attempt',chosen.taskId);
      if(agentIntent?.expected&&(!chosen||
        ['version','manifestHash','generation','installationId'].some(key=>
          chosen[key]!==agentIntent.expected[key])))
        throw {code:'E_REVISION',message:'确认期间任务固定版本或安装授权已变化，请重新核查'};
      const info=candidateFor(chosen);
      if(!chosen?.enabled||info?.stage!=='available')throw {code:'E_PERMISSION',message:'当前任务未启用或不可安装'};
      captured=currentPageTarget.capture();
      site=new URL(captured.url).origin;
      if(!info.manifest.siteOrigins.includes(site))throw {code:'E_PERMISSION',message:'此任务不适用于当前网站'};
      params=agentIntent?validateTaskParams(info.manifest.paramsSchema,agentIntent.params):
        paramsFromForm(info.manifest.paramsSchema);
      chosen={...chosen,manifestHash:info.manifestHash,title:info.manifest.title};
      permission=requireChromePermissions({api,request:{origins:[permissionPattern(captured.url)]}});
    }catch(error){fail(error);return agentIntent?Promise.reject(error):undefined;}
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
      if(agentIntent&&agentStopRequested)
        throw {code:'E_CANCELLED',message:'已请求停止，尚未启动任务'};
      agentStartSubmitted=Boolean(agentIntent);
      const claim=await host.start({source:{kind:'saved',scriptId:resolved.scriptId,revision:resolved.revision,
          contentHash:resolved.contentHash},params,expectedTaskGeneration:chosen.generation??null,expectedTaskInstallationId:chosen.installationId??null,
        target:{mode:'borrowed',tabId:captured.tabId,frameId:0,documentId:captured.documentId,
          expectedUrl:captured.url,expectedWindowId:captured.windowId},
        deadlineAt:Date.now()+30000});
      activeRunId=claim.runId;agentStartSubmitted=false;
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
    return agentIntent?pendingRun:undefined;
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
    await refresh(identity(row));announce();
    onTaskInstalled?.(installedTask.taskId);
    ui('task-status').text=`已安装 ${installedTask.taskId} · v${installedTask.version}`;
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
    await refresh();announce();ui('task-status').text=row.enabled?'任务已停用':'任务已重新启用';
  }
  async function uninstall() {
    const row=installedRow();if(!row)throw {code:'E_SCHEMA',message:'请选择已安装任务'};
    await client.request('uninstallTask',{taskId:row.taskId,version:row.version,
      expectedGeneration:row.generation??null,expectedInstallationId:row.installationId??null});
    await refresh();announce();ui('task-status').text='已卸载确定版本；历史结果仍可保留';
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
  function setTaskSearchOpen(open){
    const panel=ui('task-search-panel'),toggle=ui('task-search-toggle');
    panel.hidden=!open;toggle.attributes['aria-expanded']=String(open);
    if(open){
      renderInstalledCards();update();
      focus('local-discover-search',{preventScroll:true});
    }else{
      localQuery='';localFilter='all';ui('local-discover-search').value='';
      renderInstalledCards();update();taskSearchReturnFocus();
    }
  }
  registerAction('taskManageToggleClick',event=>{
    if(!event.isTrusted)return;
    setTaskManagementMode(!taskManagementMode);
  });
  registerAction('taskSearchToggleClick',()=>setTaskSearchOpen(ui('task-search-panel').hidden));
  registerAction('taskSearchPanelKeydown',event=>{
    if(event.key!=='Escape'||event.defaultPrevented||event.isComposing)return;
    event.preventDefault();
    setTaskSearchOpen(false);
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
  registerAction('taskRunClick',run);
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
  },runInstalledForAgent({taskId,params,event,expected}){
    return run(event,{taskId,params,expected});
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
  },focusInstalledTask(taskId) {
    // Selecting an installed task for management is safe even when it is disabled.
    // The Run button is gated separately by the installed enabled state.
    const selectedRow=installed.find(row=>row.taskId===taskId);
    if(disposed||!selectedRow)return false;
    if(navigate('tasks')===false)return false;
    // A manager handoff must not leave its explicitly selected task filtered out.
    localQuery='';localFilter='all';ui('local-discover-search').value='';
    ui('task-search-panel').hidden=true;
    ui('task-search-toggle').attributes['aria-expanded']='false';
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
