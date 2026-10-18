import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {SidebarNavigation} from './tabs/navigation.tsx';
import {prepareSidebarAppShell,SidebarAppShell} from './app-shell.tsx';
import {flushSync} from 'react-dom';
import {ExtensionCenterPage,ExtensionRowMenu} from './tabs/tools.tsx';
import {DeveloperActions,DeveloperFramework,DeveloperTargetText,DeveloperRunStatus,DeveloperResultText,DeveloperSourceEditor,DeveloperJavascriptWorld} from './tabs/develop.tsx';
import {WorkflowHeader,WorkflowHistory,WorkflowSourceName,WorkflowSettingsSheet,WorkflowTranscript,WorkflowResultText} from './tabs/workflow.tsx';
import {DebugDiagnosticText} from './tabs/debug.tsx';
import {MyTaskCount,MyTaskRows,MyTaskDetail} from './tabs/tasks.tsx';
import {SchedulePlanRows,ScheduleManagerRows} from './tabs/schedule.tsx';
import {CloudOverviewText} from './tabs/cloud.tsx';
import {CookieTrustedPilot} from './tabs/cookie-pilot.tsx';
import cookiePilotScopedCSS from './tabs/cookie-pilot.css?raw';
// Fixed, reviewed Bookmark Manager sources only; no installed package scripts.
import '../../../examples/sidebar-tools/bookmark-manager/src/model.js';
import '../../../examples/sidebar-tools/bookmark-manager/src/service.js';
import BookmarkReactApp from '../../../examples/sidebar-tools/bookmark-manager/src/react/App.jsx';
import bookmarkScopedCSS from '../../../examples/sidebar-tools/bookmark-manager/src/react/style.css?raw';
import bookmarkPilotLayoutCSS from './tabs/bookmark-pilot.css?raw';

// One trusted React root. Extension Center is a single React-owned subtree;
// the other legacy views still use temporary portals until migrated.
export function mountExtensionList(doc,{debugEnabled=false,onNavigate=null,appShell=false}={}){
  let section=doc.getElementById('extension-center');
  if(!section||section.dataset.opendeskReactOwner)
    throw new Error('E_REACT_EXTENSION_MOUNT');
  if(appShell&&typeof onNavigate!=='function')
    throw new Error('E_REACT_APP_SHELL_NAVIGATION');
  const initialTab=doc.documentElement?.dataset?.opendeskTab||'tasks';
  const navigationHost=!appShell&&typeof onNavigate==='function'
    ?doc.querySelector('.workbench-nav'):null;
  if(!appShell&&typeof onNavigate==='function'&&
    (!navigationHost||navigationHost.dataset.opendeskReactOwner))
    throw new Error('E_REACT_NAVIGATION_MOUNT');
  const shell=appShell?prepareSidebarAppShell(doc):null;
  const root=createRoot(shell?.mount||section);
  // The installed path commits the complete React App Shell first; legacy
  // Controller nodes are reparented intact before any subsequent binding.
  flushSync(()=>root.render(shell?<><style data-opendesk-trusted-react-css="">
    {cookiePilotScopedCSS+'\n'+bookmarkPilotLayoutCSS}</style>
    <SidebarAppShell scaffold={shell.scaffold} activeTab={initialTab}
      debugEnabled={debugEnabled} onNavigate={onNavigate}/></>:<ExtensionCenterPage/>));
  if(shell)section=doc.getElementById('extension-center');
  const container=doc.getElementById('extension-center-list');
  const detailContainer=doc.getElementById('extension-center-detail-body');
  const toolbar=doc.querySelector('#extension-center-list-view > .ec-toolbar');
  const cleanups=doc.getElementById('extension-center-cleanups');
  const empty=doc.getElementById('extension-center-empty');
  const count=doc.getElementById('extension-center-count');
  const status=doc.getElementById('extension-center-status');
  const additional=[cleanups,empty,count,status];
  const myCount=doc.getElementById('task-installed-count');
  const myRows=doc.getElementById('task-installed-cards');
  const myWorkspace=doc.getElementById('task-selected-workspace');
  const myDetail=doc.getElementById('task-installed-detail');
  const myNodes=[myCount,myRows,myWorkspace,myDetail],myTasksMounted=myNodes.every(Boolean);
  const schedulePlanList=doc.getElementById('schedule-plan-list');
  const schedulePlansMounted=Boolean(schedulePlanList);
  const scheduleManagerList=doc.getElementById('schedule-manager-list');
  const scheduleManagerMounted=Boolean(scheduleManagerList);
  if(scheduleManagerMounted&&
    (scheduleManagerList.dataset.opendeskReactOwner||scheduleManagerList.childElementCount))
    throw new Error('E_REACT_SCHEDULE_MANAGER_ALREADY_OWNED');
  if(schedulePlansMounted&&
    (schedulePlanList.dataset.opendeskReactOwner||schedulePlanList.childElementCount))
    throw new Error('E_REACT_SCHEDULE_ALREADY_OWNED');
  if(myNodes.some(Boolean)&&!myTasksMounted)throw new Error('E_REACT_MY_PARTIAL_MOUNT');
  if(myTasksMounted&&[myCount,myRows,myDetail].some(node=>node.dataset.opendeskReactOwner))
    throw new Error('E_REACT_MY_ALREADY_OWNED');
  const myInitialCount=myCount?.textContent||'',myInitialDetail=myDetail?.textContent||'';
  const cloudIds={myState:'cloud-my-state',summary:'cloud-overview-state',
    provider:'cloud-overview-provider',connection:'cloud-overview-connection',
    host:'cloud-overview-host',slot:'cloud-overview-slot',
    tasks:'cloud-overview-tasks',requests:'cloud-overview-requests'};
  const cloudNodes=Object.fromEntries(Object.entries(cloudIds).map(([key,id])=>[
    key,doc.getElementById(id)
  ]));
  const cloudValues=Object.values(cloudNodes),cloudOverviewMounted=cloudValues.every(Boolean);
  if(cloudValues.some(Boolean)&&!cloudOverviewMounted)throw new Error('E_REACT_CLOUD_PARTIAL_MOUNT');
  if(cloudOverviewMounted&&cloudValues.some(node=>node.dataset.opendeskReactOwner))
    throw new Error('E_REACT_CLOUD_ALREADY_OWNED');
  const cloudInitial=Object.fromEntries(Object.entries(cloudNodes).map(([key,node])=>[
    key,node?.textContent||''
  ]));
  const developer={
    host:doc.getElementById('script-current-page-host'),
    status:doc.getElementById('script-current-page-status'),
    title:doc.getElementById('script-current-page-title'),
    url:doc.getElementById('script-current-page-url')
  };
  // R23.10 uses the same root, not a second workflow React island.
  const workflowHeader=doc.querySelector('#workflow-editor .workflow-head-actions');
  const workflowSettings=doc.getElementById('workflow-provider-settings');
  const workflowSheetHost=doc.getElementById('workflow-settings-react-host');
  const workflowTranscript=doc.getElementById('workflow-ai-transcript');
  const workflowHistoryHost=doc.getElementById('workflow-history-react-host');
  const workflowSourceHost=doc.getElementById('workflow-source-react-host');
  const workflowResultOutput=doc.getElementById('workflow-output');
  const workflowResultInitialText=workflowResultOutput?.textContent||'';
  const workflowMounted=Boolean(workflowHeader&&workflowSettings&&workflowSheetHost&&workflowTranscript);
  if(workflowMounted&&[workflowHeader,workflowSettings,workflowSheetHost,workflowTranscript]
    .some(node=>node.dataset.opendeskReactOwner))
    throw new Error('E_REACT_WORKFLOW_ALREADY_OWNED');
  const workflowResultMounted=Boolean(workflowMounted&&workflowResultOutput);
  if(workflowResultMounted&&workflowResultOutput.dataset.opendeskReactOwner)
    throw new Error('E_REACT_WORKFLOW_RESULT_ALREADY_OWNED');
  const developerResultOutput=doc.getElementById('script-result');
  const developerResultKind=doc.getElementById('script-result-kind');
  const developerResultMounted=Boolean(developerResultOutput&&developerResultKind);
  if(Boolean(developerResultOutput)!==Boolean(developerResultKind)||
    [developerResultOutput,developerResultKind].some(node=>node?.dataset.opendeskReactOwner))
    throw new Error('E_REACT_DEVELOPER_RESULT_MOUNT');
  const developerRunStatus=doc.getElementById('script-status');
  const developerRunStatusInitialText=developerRunStatus?.textContent||'';
  const developerStatusMounted=Boolean(developerRunStatus);
  if(developerRunStatus?.dataset.opendeskReactOwner)
    throw new Error('E_REACT_DEVELOPER_STATUS_MOUNT');
  const developerChoices=doc.querySelector('#page-component-framework .page-component-choices');
  const developerFrameworkMounted=Boolean(developerChoices);
  if(developerFrameworkMounted&&(
    developerChoices.dataset.opendeskReactOwner||
    ['page-component-javascript','page-component-react','page-component-vue'].some(id=>
      doc.getElementById(id)?.closest('.page-component-choices')!==developerChoices)))
    throw new Error('E_REACT_DEVELOPER_FRAMEWORK_MOUNT');
  const developerSourceHost=doc.getElementById('script-source-react-host');
  const developerSourceInput=doc.getElementById('script-source');
  const developerSourceMounted=Boolean(developerSourceHost&&developerSourceInput);
  if(Boolean(developerSourceHost)!==Boolean(developerSourceInput)||
    developerSourceHost?.dataset.opendeskReactOwner||
    (developerSourceMounted&&developerSourceInput.parentElement!==developerSourceHost))
    throw new Error('E_REACT_DEVELOPER_SOURCE_MOUNT');
  const developerWorldHost=doc.getElementById('script-javascript-world-row');
  const developerWorldChoice=doc.getElementById('script-javascript-world');
  const developerWorldMounted=Boolean(developerWorldHost&&developerWorldChoice);
  if(Boolean(developerWorldHost)!==Boolean(developerWorldChoice)||
    developerWorldHost?.dataset.opendeskReactOwner||
    (developerWorldMounted&&developerWorldChoice.parentElement!==developerWorldHost))
    throw new Error('E_REACT_DEVELOPER_WORLD_MOUNT');
  const developerDock=doc.querySelector('#develop-dock .dock-buttons');
  const developerActionsMounted=Boolean(developerDock);
  if(developerActionsMounted&&(
    developerDock.dataset.opendeskReactOwner||
    ['script-run','script-save','script-stop'].some(id=>
      doc.getElementById(id)?.parentElement!==developerDock)))
    throw new Error('E_REACT_DEVELOPER_DOCK_MOUNT');
  // Debug text transfers atomically; the legacy controller remains sole Host reader.
  const debugIds={
    summary:'debug-cloud-summary',pairing:'debug-pairing',connection:'debug-connection',
    reconcile:'debug-reconcile',slot:'debug-slot',taskCount:'debug-task-count',
    requestCount:'debug-request-count',snapshot:'debug-snapshot',feedback:'debug-feedback'
  };
  const debugNodes=Object.fromEntries(Object.entries(debugIds).map(([key,id])=>[
    key,doc.getElementById(id)
  ]));
  const debugValues=Object.values(debugNodes);
  const debugMounted=debugValues.every(Boolean);
  if(debugValues.some(Boolean)&&!debugMounted)
    throw new Error('E_REACT_DEBUG_PARTIAL_MOUNT');
  if(debugMounted&&debugValues.some(node=>node.dataset.opendeskReactOwner||node.childElementCount))
    throw new Error('E_REACT_DEBUG_ALREADY_OWNED');
  const debugInitial=Object.fromEntries(Object.entries(debugNodes).map(([key,node])=>[
    key,node?.textContent||''
  ]));
  const developerNodes=Object.values(developer);
  const developerTargetMounted=developerNodes.every(Boolean);
  if(developerNodes.some(Boolean)&&!developerTargetMounted)
    throw new Error('E_REACT_DEVELOPER_PARTIAL_MOUNT');
  if(!container||!detailContainer||!toolbar||!section||
    additional.some(node=>!node||node.dataset.opendeskReactOwner)||
    developerNodes.some(node=>node?.dataset.opendeskReactOwner)||
    container.dataset.opendeskReactOwner||detailContainer.dataset.opendeskReactOwner||
    toolbar.dataset.opendeskReactOwner)
    throw new Error('E_REACT_EXTENSION_MOUNT');
  if(container.childElementCount||detailContainer.childElementCount)
    throw new Error('E_REACT_EXTENSION_NOT_EMPTY');

  // The old static Extension Center children are replaced by one React
  // subtree: no Portal targets, duplicate listeners or native child writes.
  section.dataset.opendeskReactOwner='extension-center';
  if(myTasksMounted){
    // TaskWorkbench may already have installed live cards and a params form.
    myRows.after(myWorkspace);
    for(const node of [myRows,myCount,myDetail])node.replaceChildren();
    myRows.dataset.opendeskReactOwner='my-task-rows';
    myCount.dataset.opendeskReactOwner='my-task-count';
    myDetail.dataset.opendeskReactOwner='my-task-detail';
  }
  if(schedulePlansMounted)schedulePlanList.dataset.opendeskReactOwner='schedule-plan-rows';
  if(scheduleManagerMounted)scheduleManagerList.dataset.opendeskReactOwner='schedule-manager-rows';
  if(cloudOverviewMounted)for(const [key,node] of Object.entries(cloudNodes)){
    // App Shell owns the Cloud overview content directly. Its React text must
    // not be deleted by the old Portal handoff. Legacy fallback is unchanged.
    if(!shell)node.replaceChildren();
    node.dataset.opendeskReactOwner='cloud-'+key;
  }
  container.dataset.opendeskReactOwner='extension-list';
  detailContainer.dataset.opendeskReactOwner='extension-detail';
  toolbar.dataset.opendeskReactOwner='extension-toolbar';
  for(const [node,name] of [[cleanups,'extension-cleanups'],[empty,'extension-empty'],
    [count,'extension-count'],[status,'extension-status']])
    node.dataset.opendeskReactOwner=name;
  if(workflowMounted){
    // Transfer these children before the business view attaches listeners.
    // Provider controls remain the original nodes, moved by the sheet component.
    workflowHeader.replaceChildren();
    workflowTranscript.replaceChildren();
    workflowTranscript.dataset.opendeskReactOwner='workflow-transcript';
    workflowHeader.dataset.opendeskReactOwner='workflow-header';
    workflowSheetHost.dataset.opendeskReactOwner='workflow-sheet';
    if(workflowHistoryHost)workflowHistoryHost.dataset.opendeskReactOwner='workflow-history';
    if(workflowSourceHost)workflowSourceHost.dataset.opendeskReactOwner='workflow-source';
    if(workflowResultMounted){
      workflowResultOutput.replaceChildren();
      workflowResultOutput.dataset.opendeskReactOwner='workflow-result';
    }
  }
  if(developerStatusMounted){
    // React portals do not automatically clear pre-existing static text.
    // Capture the original accessible loading message, then hand off the
    // entire text child to React before the first synchronous root render.
    developerRunStatus.replaceChildren();
    developerRunStatus.dataset.opendeskReactOwner='developer-run-status';
  }
  if(developerTargetMounted)for(const [name,node] of Object.entries(developer)){
    node.replaceChildren();
    node.dataset.opendeskReactOwner='developer-target-'+name;
  }
  if(debugMounted)for(const [key,node] of Object.entries(debugNodes)){
    node.replaceChildren();
    node.dataset.opendeskReactOwner='debug-'+key;
  }
  let disposed=false,menuKey=null,detailModel=null;
  let navigationTab=initialTab;
  if(navigationHost){
    // Replace the static tab button tree in one handoff. TaskWorkbench was
    // constructed with a navigation sink, so it has no competing DOM listeners.
    navigationHost.replaceChildren();
    navigationHost.dataset.opendeskReactOwner='sidebar-navigation';
    if(debugEnabled)navigationHost.dataset.debugEnabled='true';
  }
  const initialBack=()=>{};
  let extensionView='list',onExtensionBack=initialBack;
  let rowMenuHost=null,rowMenuItems=[];
  let model={rows:[],busy:false,pendingKey:null,onOpenRow:()=>{},onMore:()=>{}};
  let toolbarModel={query:'',kind:'all',scope:'smart',language:'zh-CN',menuOpen:false};
  let feedbackModel={showEmpty:false,emptyText:'',countText:'正在读取扩展…'};
  let recoveryModel={ids:[],busy:false,onRetry:()=>{}};
  let statusModel={text:'',state:'info'};
  let developerRunStatusModel={state:developerRunStatus?.dataset.state||'loading',
    text:developerRunStatusInitialText};
  let workflowMessages=[];
  let workflowResultText=workflowResultInitialText;
  let workflowActions=null;
  let workflowHeaderModel={saved:false,savedText:'',savedTitle:'',historyExpanded:false,
    busy:false,planning:false,sessionHint:'保留当前工作流'};
  let workflowSettingsModel={open:false,onClose:null};
  let workflowHistoryModel={open:false,rows:[],canResume:false,busy:false};
  let workflowSourceName='';
  let developerSourceActive=false,developerSourceRevision=0,developerSourceModel=null;
  let developerWorldActive=false,developerWorldModel=null;
  let developerActionsActive=false,developerActionsModel=null;
  let developerFrameworkActive=false,developerFrameworkModel=null;
  let developerResultActive=false,developerResultModel={
    text:developerResultOutput?.textContent||'',kind:developerResultKind?.textContent||''
  };
  let developerTargetModel={host:'正在识别…',hostTitle:'',status:'检查中',
    state:'resolving',statusTitle:'',title:'正在识别…',url:''};
  let debugModel=debugInitial;
  let myRowsModel={rows:[],selectedId:'',emptyText:'',onSelect:()=>{}};
  let scheduleRowsModel=null,scheduleManagerModel=null;
  let cookiePilotHost=null;
  let bookmarkPilot=null;
  let myCountText=myInitialCount,myDetailText=myInitialDetail,cloudModel=cloudInitial;
  let cloudRequestsModel={rows:[],pageText:'正在读取请求记录…',canPrev:false,canNext:false};
  const cloudRequestsMounted=Boolean(shell);
  const cloudSetupMounted=Boolean(shell);
  let cloudSetupModel={visible:false,nextStep:'请先连接可信提供者。',onConfigure:null};
  function paint(){
    if(disposed)return;
    const pageProps={rowsModel:model,menuKey,toolbarModel,detailModel,
      feedbackModel,recoveryModel,statusModel,view:extensionView,
      onBack:onExtensionBack,detailContainer};
    // Extension Center restores focus immediately after draw(). Commit the
    // single React tree and all portals synchronously before that readback.
    flushSync(()=>root.render(<>
      {/* WXT fixed entry is JS-only. Scope audited pilot CSS into the
          existing React tree; never emit an unlisted tool-shell.css asset. */}
      <style data-opendesk-trusted-react-css="">{cookiePilotScopedCSS+'\n'+bookmarkPilotLayoutCSS}</style>
      {shell?<SidebarAppShell scaffold={shell.scaffold} activeTab={navigationTab}
        debugEnabled={debugEnabled} onNavigate={onNavigate}
        extensionProps={pageProps} cloudModel={cloudModel}
        cloudRequestsModel={cloudRequestsModel}
        cloudSetupModel={cloudSetupModel}/>:<>
        {navigationHost&&createPortal(<SidebarNavigation
          activeTab={navigationTab} debugEnabled={debugEnabled}
          onNavigate={onNavigate}/>,navigationHost)}
        <ExtensionCenterPage {...pageProps}/>
      </>}
      {myTasksMounted&&createPortal(<MyTaskCount value={myCountText}/>,myCount)}
      {myTasksMounted&&createPortal(<MyTaskRows {...myRowsModel} workspace={myWorkspace}/>,myRows)}
      {myTasksMounted&&createPortal(<MyTaskDetail value={myDetailText}/>,myDetail)}
      {schedulePlansMounted&&scheduleRowsModel&&createPortal(
        <SchedulePlanRows {...scheduleRowsModel}/>,schedulePlanList)}
      {scheduleManagerMounted&&scheduleManagerModel&&createPortal(
        <ScheduleManagerRows {...scheduleManagerModel}/>,scheduleManagerList)}
      {cloudOverviewMounted&&!shell&&Object.entries(cloudNodes).map(([key,node])=>
        createPortal(<CloudOverviewText value={cloudModel[key]}/>,node,'cloud-'+key))}
      {rowMenuHost&&createPortal(<ExtensionRowMenu items={rowMenuItems}/>,rowMenuHost)}
      {cookiePilotHost&&createPortal(<CookieTrustedPilot/>,cookiePilotHost)}
      {bookmarkPilot&&createPortal(<>
        <style data-bookmark-trusted-style="">{bookmarkScopedCSS}</style>
        <BookmarkReactApp mode="trusted" runtime={bookmarkPilot.runtime}
          onStateChange={bookmarkPilot.onStateChange}/>
       </>,bookmarkPilot.container,'bookmark-react-trusted')}
      {workflowMounted&&createPortal(
        <WorkflowHeader model={workflowHeaderModel} actions={workflowActions}/>,workflowHeader)}
      {workflowMounted&&createPortal(
        <WorkflowTranscript rows={workflowMessages}/>,workflowTranscript)}
      {workflowMounted&&workflowHistoryHost&&createPortal(
        <WorkflowHistory model={workflowHistoryModel} actions={workflowActions}/>,workflowHistoryHost)}
      {workflowMounted&&workflowSourceHost&&createPortal(
        <WorkflowSourceName value={workflowSourceName}/>,workflowSourceHost)}
      {workflowResultMounted&&createPortal(
        <WorkflowResultText value={workflowResultText}/>,workflowResultOutput)}
      {workflowMounted&&createPortal(
        <WorkflowSettingsSheet open={workflowSettingsModel.open}
          onClose={workflowSettingsModel.onClose} settings={workflowSettings} doc={doc}/>,
        workflowSheetHost)}
      {developerResultActive&&createPortal(
        <DeveloperResultText value={developerResultModel.text}/>,developerResultOutput)}
      {developerResultActive&&createPortal(
        <DeveloperResultText value={developerResultModel.kind}/>,developerResultKind)}
      {developerStatusMounted&&createPortal(
        <DeveloperRunStatus model={developerRunStatusModel} node={developerRunStatus}/>,
        developerRunStatus)}
      {developerFrameworkActive&&createPortal(
        <DeveloperFramework model={developerFrameworkModel}/>,developerChoices)}
      {developerActionsActive&&createPortal(
        <DeveloperActions model={developerActionsModel}/>,developerDock)}
      {developerSourceActive&&createPortal(
        <DeveloperSourceEditor model={developerSourceModel}/>,developerSourceHost)}
      {developerWorldActive&&createPortal(
        <DeveloperJavascriptWorld model={developerWorldModel}/>,developerWorldHost)}
      {developerTargetMounted&&createPortal(
        <DeveloperTargetText value={developerTargetModel.host}
          node={developer.host} title={developerTargetModel.hostTitle}/>,developer.host)}
      {developerTargetMounted&&createPortal(
        <DeveloperTargetText value={developerTargetModel.status}
          node={developer.status} title={developerTargetModel.statusTitle}
          state={developerTargetModel.state}/>,developer.status)}
      {developerTargetMounted&&createPortal(
        <DeveloperTargetText value={developerTargetModel.title} node={developer.title}/>,
        developer.title)}
      {developerTargetMounted&&createPortal(
        <DeveloperTargetText value={developerTargetModel.url} node={developer.url}/>,
        developer.url)}
      {debugMounted&&Object.entries(debugNodes).map(([key,node])=>
        createPortal(<DebugDiagnosticText value={debugModel[key]}/>,node,key))}
    </>));
  }
  paint();
  return Object.freeze({
    owner:'extension-list',
    navigationMounted:Boolean(navigationHost||shell),
    appShellMounted:Boolean(shell),
    renderNavigation(view){
      if(disposed||!(navigationHost||shell))return;
      if(!['tasks','tools','workflow','develop','cloud','catalog','debug'].includes(view))
        throw new Error('E_REACT_NAVIGATION_SNAPSHOT');
      if(navigationTab===view)return;
      navigationTab=view;paint();
    },
    connectBack(handler){
      if(disposed||typeof handler!=='function'||onExtensionBack!==initialBack)
        throw new Error('E_REACT_EXTENSION_BACK_OWNER');
      onExtensionBack=handler;paint();
    },
    renderView(view){
      if(disposed||!['list','detail'].includes(view))
        throw new Error('E_REACT_EXTENSION_VIEW');
      extensionView=view;paint();
    },
    debugMounted,
    myTasksMounted,cloudOverviewMounted,
    mountBookmarkPilot({container,sdk,onStateChange}={}){
      if(disposed||bookmarkPilot||!container||container.ownerDocument!==doc||
        container.childNodes.length||container.dataset.opendeskReactOwner||
        typeof sdk?.bookmarks?.getTree!=='function'||
        typeof onStateChange!=='function'||!globalThis.BookmarkR2Service?.create||
        !globalThis.BookmarkR2Model)
        throw new Error('E_BOOKMARK_TRUSTED_PILOT_MOUNT');
      bookmarkPilot={container,
        runtime:Object.freeze({sdk,service:globalThis.BookmarkR2Service.create(sdk)}),
        onStateChange};
      container.dataset.opendeskReactOwner='bookmark-react-pilot';
      try{paint();}catch(error){
        // A failed initial React render must never leave a privileged portal
        // or stale private data owned by the shared root.
        bookmarkPilot=null;delete container.dataset.opendeskReactOwner;
        try{paint();}catch{/* Let Host fail closed and discard its slot. */}
        throw error;
      }
      let released=false;
      return ()=>{
        if(released)return;released=true;
        if(bookmarkPilot?.container===container){
          bookmarkPilot=null;
          if(!disposed)paint();
          delete container.dataset.opendeskReactOwner;
        }
      };
    },
    mountCookieEditorPilot(container){
      // An opt-in, development-only *data-free* demo. No package JS is read
      // and the real Cookie Tool keeps its original iframe and SDK Host.
      if(disposed||cookiePilotHost||!debugMounted||!container||
        container.ownerDocument!==doc||container.childNodes.length||
        container.dataset.opendeskReactOwner)
        throw new Error('E_COOKIE_TRUSTED_PILOT_MOUNT');
      cookiePilotHost=container;
      container.dataset.opendeskReactOwner='cookie-react-pilot';
      paint();
      let released=false;
      return ()=>{
        if(released)return;released=true;
        if(cookiePilotHost===container){
          cookiePilotHost=null;
          if(!disposed)paint();
          delete container.dataset.opendeskReactOwner;
        }
      };
    },
    renderMyTaskCount(value){
      if(disposed||!myTasksMounted)return;myCountText=String(value);paint();
    },
    renderMyTaskDetail(value){
      if(disposed||!myTasksMounted)return;myDetailText=String(value);paint();
    },
    renderMyTaskRows(next){
      if(disposed||!myTasksMounted)return;
      if(!next||!Array.isArray(next.rows)||typeof next.onSelect!=='function'||
        typeof next.selectedId!=='string'||typeof next.emptyText!=='string')
        throw new Error('E_REACT_MY_SNAPSHOT');
      myRowsModel=next;paint();
    },
    schedulePlansMounted,scheduleManagerMounted,
    renderScheduledManagerRows(next){
      if(disposed||!scheduleManagerMounted)throw new Error('E_REACT_SCHEDULE_MANAGER_OWNER');
      if(!next||!Array.isArray(next.rows)||
        !['onToggle','onCopy','onCreatePlan','onUninstall'].every(key=>typeof next[key]==='function'))
        throw new Error('E_REACT_SCHEDULE_MANAGER_SNAPSHOT');
      scheduleManagerModel=next;paint();
    },
    renderScheduledPlanRows(next){
      if(disposed||!schedulePlansMounted)throw new Error('E_REACT_SCHEDULE_OWNER');
      if(!next||!Array.isArray(next.plans)||
        !['onOpen','onToggle','onEdit','onStop'].every(name=>typeof next[name]==='function'))
        throw new Error('E_REACT_SCHEDULE_SNAPSHOT');
      scheduleRowsModel=next;paint();
    },
    renderScheduledCurrentRun(runId){
      if(disposed||!schedulePlansMounted||!scheduleRowsModel)return;
      const next=typeof runId==='string'?runId:'';
      if(scheduleRowsModel.currentRunId===next)return;
      scheduleRowsModel={...scheduleRowsModel,currentRunId:next};paint();
    },
    cloudSetupMounted,
    renderCloudSetup(next){
      if(disposed||!cloudSetupMounted)return;
      if(!next||typeof next.visible!=='boolean'||
        typeof next.nextStep!=='string'||typeof next.onConfigure!=='function')
        throw new Error('E_REACT_CLOUD_SETUP_SNAPSHOT');
      cloudSetupModel=next;paint();
    },
    cloudRequestsMounted,
    renderCloudRequests(next){
      if(disposed||!cloudRequestsMounted)return;
      if(!next||!Array.isArray(next.rows)||typeof next.pageText!=='string'||
        typeof next.canPrev!=='boolean'||typeof next.canNext!=='boolean'||
        !['onPrev','onNext','onDetail','onClose','onOpenResult']
          .every(key=>typeof next[key]==='function'))
        throw new Error('E_REACT_CLOUD_REQUEST_SNAPSHOT');
      cloudRequestsModel=next;paint();
    },
    renderCloudOverview(next){
      if(disposed||!cloudOverviewMounted)return;
      if(!next||typeof next!=='object'||Array.isArray(next))
        throw new Error('E_REACT_CLOUD_SNAPSHOT');
      for(const [key,value] of Object.entries(next))
        if(!Object.hasOwn(cloudNodes,key)||typeof value!=='string')
          throw new Error('E_REACT_CLOUD_SNAPSHOT');
      cloudModel={...cloudModel,...next};paint();
    },
    renderDebugDiagnostics(next){
      if(disposed||!debugMounted||!next||typeof next!=='object'||Array.isArray(next))
        throw new Error('E_REACT_DEBUG_OWNER');
      for(const [key,value] of Object.entries(next))
        if(!Object.hasOwn(debugNodes,key)||typeof value!=='string')
          throw new Error('E_REACT_DEBUG_SNAPSHOT');
      debugModel={...debugModel,...next};paint();
    },
    developerTargetMounted,
    workflowMounted,
    workflowResultMounted,
    renderWorkflowResult(value){
      if(disposed||!workflowResultMounted)throw new Error('E_REACT_WORKFLOW_RESULT_OWNER');
      workflowResultText=String(value);paint();
    },
    renderWorkflowMessages(rows){
      if(disposed||!workflowMounted)throw new Error('E_REACT_WORKFLOW_MESSAGES_OWNER');
      workflowMessages=rows;paint();
      workflowTranscript.scrollTop=workflowTranscript.scrollHeight;
    },
    connectWorkflowEvents(handlers){
      if(disposed||!workflowMounted||workflowActions)throw new Error('E_REACT_WORKFLOW_ACTION_OWNER');
      workflowActions=handlers;paint();
    },
    renderWorkflowHeader(next){
      if(disposed||!workflowMounted)throw new Error('E_REACT_WORKFLOW_HEADER_OWNER');
      workflowHeaderModel=next;paint();
    },
    renderWorkflowHistory(next){
      if(disposed||!workflowMounted||!workflowHistoryHost)throw new Error('E_REACT_WORKFLOW_HISTORY_OWNER');
      workflowHistoryModel=next;paint();
    },
    renderWorkflowSourceName(value){
      if(disposed||!workflowMounted||!workflowSourceHost)throw new Error('E_REACT_WORKFLOW_SOURCE_OWNER');
      workflowSourceName=String(value||'');paint();
    },
    renderWorkflowSettings(next){
      if(disposed||!workflowMounted)throw new Error('E_REACT_WORKFLOW_SHEET_OWNER');
      if(workflowSettingsModel.open===next.open&&
        workflowSettingsModel.onClose===next.onClose)return;
      workflowSettingsModel=next;paint();
    },
    developerActionsMounted,
    developerSourceMounted,
    developerWorldMounted,
    developerFrameworkMounted,
    developerStatusMounted,
    developerResultMounted,
    renderDeveloperResult(next){
      if(disposed||!developerResultMounted)throw new Error('E_REACT_DEVELOPER_RESULT_OWNER');
      if(!developerResultActive){
        // Script Editor switches its writer before this single DOM handoff.
        developerResultOutput.replaceChildren();
        developerResultKind.replaceChildren();
        developerResultOutput.dataset.opendeskReactOwner='developer-result';
        developerResultKind.dataset.opendeskReactOwner='developer-result-kind';
        developerResultActive=true;
      }
      developerResultModel={...developerResultModel,...next};paint();
    },
    renderDeveloperStatus(next){
      if(disposed||!developerStatusMounted)return;
      developerRunStatusModel=next;paint();
    },
    attachRowMenu(element){
      if(disposed||rowMenuHost||!element||element.dataset.opendeskReactOwner||
        element.childElementCount||element.id!=='extension-center-row-menu')
        throw new Error('E_REACT_EXTENSION_ROW_MENU_MOUNT');
      rowMenuHost=element;
      element.dataset.opendeskReactOwner='extension-row-menu';
      paint();
    },
    renderRowMenu(items){
      if(disposed||!rowMenuHost)throw new Error('E_REACT_EXTENSION_ROW_MENU_OWNER');
      rowMenuItems=items;paint();
    },
    renderDeveloperSource(next){
      if(disposed||!developerSourceMounted||typeof next.source!=='string'||
        typeof next.onInput!=='function')throw new Error('E_REACT_DEVELOPER_SOURCE_OWNER');
      const current=doc.getElementById('script-source');
      if(!developerSourceActive){
        if(current?.parentElement!==developerSourceHost||
          developerSourceHost.dataset.opendeskReactOwner)
          throw new Error('E_REACT_DEVELOPER_SOURCE_ALREADY_OWNED');
        developerSourceHost.replaceChildren();
        developerSourceHost.dataset.opendeskReactOwner='developer-source';
        developerSourceActive=true;
      }else if(current?.value!==next.source){
        developerSourceRevision++;
      }
      developerSourceModel={...next,revision:developerSourceRevision};paint();
    },
    renderDeveloperWorld(next){
      if(disposed||!developerWorldMounted||typeof next.onSelect!=='function')
        throw new Error('E_REACT_DEVELOPER_WORLD_OWNER');
      if(!developerWorldActive){
        if(developerWorldHost.dataset.opendeskReactOwner)
          throw new Error('E_REACT_DEVELOPER_WORLD_ALREADY_OWNED');
        developerWorldHost.replaceChildren();
        developerWorldHost.dataset.opendeskReactOwner='developer-world';
        developerWorldActive=true;
      }
      developerWorldModel=next;paint();
    },
    renderDeveloperFramework(next){
      if(disposed||!developerFrameworkMounted)throw new Error('E_REACT_DEVELOPER_FRAMEWORK_OWNER');
      if(!developerFrameworkActive){
        if(developerChoices.dataset.opendeskReactOwner)
          throw new Error('E_REACT_DEVELOPER_FRAMEWORK_ALREADY_OWNED');
        developerChoices.replaceChildren();
        developerChoices.dataset.opendeskReactOwner='developer-framework';
        developerFrameworkActive=true;
      }
      developerFrameworkModel=next;paint();
    },
    renderDeveloperActions(next){
      if(disposed||!developerActionsMounted)throw new Error('E_REACT_DEVELOPER_DOCK_OWNER');
      if(!developerActionsActive){
        if(developerDock.dataset.opendeskReactOwner)
          throw new Error('E_REACT_DEVELOPER_DOCK_ALREADY_OWNED');
        // One-time explicit handoff after Script Editor detaches legacy handlers.
        developerDock.replaceChildren();
        developerDock.dataset.opendeskReactOwner='developer-actions';
        developerActionsActive=true;
      }
      developerActionsModel=next;paint();
    },
    renderRows(next){if(disposed)return;model=next;paint();},
    setMenuKey(key){if(disposed||menuKey===key)return;menuKey=key;paint();},
    renderDetail(next){if(disposed)return;detailModel=next;paint();},
    renderToolbar(next){if(disposed)return;toolbarModel=next;paint();},
    renderFeedback(next){if(disposed)return;feedbackModel=next;paint();},
    renderRecoveries(next){if(disposed)return;recoveryModel=next;paint();},
    renderStatus(next){if(disposed)return;statusModel=next;paint();},
    renderDeveloperTarget(next){if(disposed||!developerTargetMounted)return;
      developerTargetModel=next;paint();},
    dispose(){if(disposed)return;disposed=true;root.unmount();
      if(cookiePilotHost){delete cookiePilotHost.dataset.opendeskReactOwner;cookiePilotHost=null;}
      if(bookmarkPilot){delete bookmarkPilot.container.dataset.opendeskReactOwner;bookmarkPilot=null;}
      if(myTasksMounted){
        myRows.after(myWorkspace);
        for(const node of [myRows,myCount,myDetail])delete node.dataset.opendeskReactOwner;
      }
      if(schedulePlansMounted)delete schedulePlanList.dataset.opendeskReactOwner;
      if(scheduleManagerMounted)delete scheduleManagerList.dataset.opendeskReactOwner;
      if(cloudOverviewMounted)for(const node of cloudValues)
        delete node.dataset.opendeskReactOwner;
      if(workflowMounted){
        delete workflowHeader.dataset.opendeskReactOwner;
        delete workflowTranscript.dataset.opendeskReactOwner;
        delete workflowSheetHost.dataset.opendeskReactOwner;
        if(workflowHistoryHost)delete workflowHistoryHost.dataset.opendeskReactOwner;
        if(workflowSourceHost)delete workflowSourceHost.dataset.opendeskReactOwner;
        if(workflowResultMounted)delete workflowResultOutput.dataset.opendeskReactOwner;
      }
      if(developerResultActive){
        delete developerResultOutput.dataset.opendeskReactOwner;
        delete developerResultKind.dataset.opendeskReactOwner;
      }
      if(developerStatusMounted)delete developerRunStatus.dataset.opendeskReactOwner;
      if(rowMenuHost)delete rowMenuHost.dataset.opendeskReactOwner;
      if(developerActionsActive)delete developerDock.dataset.opendeskReactOwner;
      if(developerSourceActive)delete developerSourceHost.dataset.opendeskReactOwner;
      if(developerWorldActive)delete developerWorldHost.dataset.opendeskReactOwner;
      if(developerFrameworkActive)delete developerChoices.dataset.opendeskReactOwner;
      if(developerTargetMounted)for(const node of developerNodes)
        delete node.dataset.opendeskReactOwner;
      if(debugMounted)for(const node of debugValues)
        delete node.dataset.opendeskReactOwner;
      for(const node of additional)delete node.dataset.opendeskReactOwner;
      delete toolbar.dataset.opendeskReactOwner;
      delete detailContainer.dataset.opendeskReactOwner;
      delete container.dataset.opendeskReactOwner;
      delete section.dataset.opendeskReactOwner;
      if(navigationHost)delete navigationHost.dataset.opendeskReactOwner;}
  });
}
