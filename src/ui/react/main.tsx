import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {flushSync} from 'react-dom';
import {ExtensionRows,ExtensionDetail,ExtensionToolbar,ExtensionEmpty,ExtensionRecoveries,ExtensionStatus,ExtensionRowMenu} from './tabs/tools.tsx';
import {DeveloperActions,DeveloperFramework,DeveloperTargetText,DeveloperRunStatus,DeveloperResultText} from './tabs/develop.tsx';
import {WorkflowHeader,WorkflowSettingsSheet,WorkflowTranscript,WorkflowResultText} from './tabs/workflow.tsx';

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
      {rowMenuHost&&createPortal(<ExtensionRowMenu items={rowMenuItems}/>,rowMenuHost)}
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
    </>));
  }
  paint();
  return Object.freeze({
    owner:'extension-list',
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
      for(const node of additional)delete node.dataset.opendeskReactOwner;
      delete toolbar.dataset.opendeskReactOwner;
      delete detailContainer.dataset.opendeskReactOwner;
      delete container.dataset.opendeskReactOwner;
      host.remove();}
  });
}
