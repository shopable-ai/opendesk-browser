import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {flushSync} from 'react-dom';
import {ExtensionRows,ExtensionDetail,ExtensionToolbar,ExtensionEmpty,ExtensionRecoveries,ExtensionStatus,ExtensionRowMenu} from './tabs/tools.tsx';
import {DeveloperActions,DeveloperFramework,DeveloperTargetText,DeveloperRunStatus,DeveloperResultText} from './tabs/develop.tsx';
import {WorkflowHeader,WorkflowSettingsSheet,WorkflowTranscript,WorkflowResultText} from './tabs/workflow.tsx';
import {DebugDiagnosticText} from './tabs/debug.tsx';
import {MyTaskCount,MyTaskRows,MyTaskDetail} from './tabs/tasks.tsx';
import {CloudOverviewText} from './tabs/cloud.tsx';
import {CookieTrustedPilot} from './tabs/cookie-pilot.tsx';
import './tabs/cookie-pilot.css';
// Fixed, reviewed Bookmark Manager sources only; no installed package scripts.
import '../../../examples/sidebar-tools/bookmark-manager/src/model.js';
import '../../../examples/sidebar-tools/bookmark-manager/src/service.js';
import BookmarkReactApp from '../../../examples/sidebar-tools/bookmark-manager/preview/react/src/App.jsx';
import bookmarkScopedCSS from '../../../examples/sidebar-tools/bookmark-manager/preview/react/src/style.css?raw';

// One trusted React root and three portals in the existing fixed Side Panel.
// Portals preserve the installed DOM IDs, CSS and Host wiring; they never run
// user tool packages, which stay in their opaque-origin sandbox iframe.
export function mountExtensionList(doc){
  const container=doc.getElementById('extension-center-list');
  const detailContainer=doc.getElementById('extension-center-detail-body');
  const toolbar=doc.querySelector('#extension-center-list-view > .ec-toolbar');
  const section=doc.getElementById('extension-center');
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

  // The toolbar's static HTML remains the non-React fallback for legacy test
  // harnesses. In the real shell it is replaced ONCE, before legacy handlers
  // are registered, and React exclusively owns its children thereafter.
  const host=doc.createElement('div');
  host.id='extension-center-react-root';
  host.hidden=true;
  section.append(host);
  toolbar.replaceChildren();
  // One-time handoff removes the legacy empty placeholder from this React-
  // owned region; the non-React fallback HTML remains intact for old hosts.
  empty.replaceChildren();
  if(myTasksMounted){
    // TaskWorkbench may already have installed live cards and a params form.
    myRows.after(myWorkspace);
    for(const node of [myRows,myCount,myDetail])node.replaceChildren();
    myRows.dataset.opendeskReactOwner='my-task-rows';
    myCount.dataset.opendeskReactOwner='my-task-count';
    myDetail.dataset.opendeskReactOwner='my-task-detail';
  }
  if(cloudOverviewMounted)for(const [key,node] of Object.entries(cloudNodes)){
    node.replaceChildren();node.dataset.opendeskReactOwner='cloud-'+key;
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
  const root=createRoot(host);
  let disposed=false,menuKey=null,detailModel=null;
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
  let developerActionsActive=false,developerActionsModel=null;
  let developerFrameworkActive=false,developerFrameworkModel=null;
  let developerResultActive=false,developerResultModel={
    text:developerResultOutput?.textContent||'',kind:developerResultKind?.textContent||''
  };
  let developerTargetModel={host:'正在识别…',hostTitle:'',status:'检查中',
    state:'resolving',statusTitle:'',title:'正在识别…',url:''};
  let debugModel=debugInitial;
  let myRowsModel={rows:[],selectedId:'',emptyText:'',onSelect:()=>{}};
  let cookiePilotHost=null;
  let bookmarkPilot=null;
  let myCountText=myInitialCount,myDetailText=myInitialDetail,cloudModel=cloudInitial;
  function paint(){
    if(disposed)return;
    // Extension Center restores focus immediately after draw(). Commit the
    // single React tree and all portals synchronously before that readback.
    flushSync(()=>root.render(<>
      {createPortal(<ExtensionToolbar model={toolbarModel}/>,toolbar)}
      {createPortal(<ExtensionRows {...model} menuKey={menuKey}/>,container)}
      {createPortal(<ExtensionDetail model={detailModel} container={detailContainer}/>,detailContainer)}
      {createPortal(<ExtensionRecoveries model={recoveryModel} container={cleanups}/>,cleanups)}
      {createPortal(<ExtensionEmpty model={feedbackModel} container={empty}/>,empty)}
      {createPortal(feedbackModel.countText,count)}
      {createPortal(<ExtensionStatus model={statusModel} container={status}/>,status)}
      {myTasksMounted&&createPortal(<MyTaskCount value={myCountText}/>,myCount)}
      {myTasksMounted&&createPortal(<MyTaskRows {...myRowsModel} workspace={myWorkspace}/>,myRows)}
      {myTasksMounted&&createPortal(<MyTaskDetail value={myDetailText}/>,myDetail)}
      {cloudOverviewMounted&&Object.entries(cloudNodes).map(([key,node])=>
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
      paint();
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
    renderWorkflowSettings(next){
      if(disposed||!workflowMounted)throw new Error('E_REACT_WORKFLOW_SHEET_OWNER');
      if(workflowSettingsModel.open===next.open&&
        workflowSettingsModel.onClose===next.onClose)return;
      workflowSettingsModel=next;paint();
    },
    developerActionsMounted,
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
      developerResultModel=next;paint();
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
      if(cloudOverviewMounted)for(const node of cloudValues)
        delete node.dataset.opendeskReactOwner;
      if(workflowMounted){
        delete workflowHeader.dataset.opendeskReactOwner;
        delete workflowTranscript.dataset.opendeskReactOwner;
        delete workflowSheetHost.dataset.opendeskReactOwner;
        if(workflowResultMounted)delete workflowResultOutput.dataset.opendeskReactOwner;
      }
      if(developerResultActive){
        delete developerResultOutput.dataset.opendeskReactOwner;
        delete developerResultKind.dataset.opendeskReactOwner;
      }
      if(developerStatusMounted)delete developerRunStatus.dataset.opendeskReactOwner;
      if(rowMenuHost)delete rowMenuHost.dataset.opendeskReactOwner;
      if(developerActionsActive)delete developerDock.dataset.opendeskReactOwner;
      if(developerFrameworkActive)delete developerChoices.dataset.opendeskReactOwner;
      if(developerTargetMounted)for(const node of developerNodes)
        delete node.dataset.opendeskReactOwner;
      if(debugMounted)for(const node of debugValues)
        delete node.dataset.opendeskReactOwner;
      for(const node of additional)delete node.dataset.opendeskReactOwner;
      delete toolbar.dataset.opendeskReactOwner;
      delete detailContainer.dataset.opendeskReactOwner;
      delete container.dataset.opendeskReactOwner;
      host.remove();}
  });
}
