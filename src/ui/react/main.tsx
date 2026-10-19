import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal,flushSync} from 'react-dom';
import {prepareSidebarAppShell,SidebarAppShell} from './app-shell.tsx';
import {ExtensionCenterPage} from './tabs/tools.tsx';
import {DebugDiagnosticText} from './tabs/debug.tsx';
import {createDeveloperView} from '../develop-view.js';
import {createMyWorkbenchView} from '../my-workbench-view.js';
import '../../../examples/sidebar-tools/bookmark-manager/src/model.js';
import '../../../examples/sidebar-tools/bookmark-manager/src/service.js';
import BookmarkReactApp from '../../../examples/sidebar-tools/bookmark-manager/src/react/App.jsx';
import bookmarkScopedCSS from '../../../examples/sidebar-tools/bookmark-manager/src/react/style.css?raw';
import bookmarkPilotLayoutCSS from './tabs/bookmark-pilot.css?raw';

// A single trusted root owns every product page. Existing controllers supply
// presentation snapshots and actions; installed tool code stays in its sandbox.
export function mountExtensionList(doc,{debugEnabled=false,onNavigate=null,appShell=false,
  developerView=createDeveloperView(),myView=createMyWorkbenchView(),toolView=null}={}){
  let section=doc.getElementById('extension-center');
  if(!section||section.dataset.opendeskReactOwner)throw new Error('E_REACT_EXTENSION_MOUNT');
  if(appShell&&typeof onNavigate!=='function')throw new Error('E_REACT_APP_SHELL_NAVIGATION');
  const initialTab=doc.documentElement?.dataset?.opendeskTab||'tasks';
  const shell=appShell?prepareSidebarAppShell(doc):null;
  const root=createRoot(shell?.mount||section);
  let disposed=false,navigationTab=initialTab,workflowController=null;
  let extensionView='list',onExtensionBack=()=>{},menuKey=null,detailModel=null;
  let model={rows:[],busy:false,pendingKey:null,onOpenRow:()=>{},onMore:()=>{}};
  let toolbarModel={query:'',kind:'all',scope:'smart',language:'zh-CN',menuOpen:false};
  let feedbackModel={showEmpty:false,emptyText:'',countText:'正在读取扩展…'};
  let recoveryModel={ids:[],busy:false,onRetry:()=>{}};
  let statusModel={text:'',state:'info'},cloudPageModel={};
  let rowMenuModel=null,bookmarkPilot=null;
  const debugIds={summary:'debug-cloud-summary',pairing:'debug-pairing',connection:'debug-connection',
    reconcile:'debug-reconcile',slot:'debug-slot',taskCount:'debug-task-count',requestCount:'debug-request-count',
    snapshot:'debug-snapshot',feedback:'debug-feedback'};
  const debugNodes=Object.fromEntries(Object.entries(debugIds).map(([key,id])=>[key,doc.getElementById(id)]));
  const debugMounted=Object.values(debugNodes).every(Boolean);
  let debugModel=Object.fromEntries(Object.entries(debugNodes).map(([key,node])=>[key,node?.textContent||'']));
  if(debugMounted)for(const [key,node]of Object.entries(debugNodes)){
    node.replaceChildren();node.dataset.opendeskReactOwner='debug-'+key;
  }
  function paint(){
    if(disposed)return;
    const extensionProps={rowsModel:model,menuKey,rowMenuModel,detailModel,toolbarModel,feedbackModel,recoveryModel,statusModel,
      view:extensionView,onBack:onExtensionBack};
    flushSync(()=>root.render(<>
      <style data-opendesk-trusted-react-css="">{bookmarkPilotLayoutCSS}</style>
      {shell?<SidebarAppShell scaffold={shell.scaffold} activeTab={navigationTab}
        debugEnabled={debugEnabled} onNavigate={onNavigate} extensionProps={extensionProps}
        developerView={developerView} myView={myView} toolView={toolView} workflowController={workflowController}
        cloudModel={cloudPageModel.overview} cloudRequestsModel={cloudPageModel.requests}
        cloudSetupModel={cloudPageModel.setup} cloudPageModel={cloudPageModel}/>
        :<ExtensionCenterPage {...extensionProps}/>}
      {bookmarkPilot&&createPortal(<><style>{bookmarkScopedCSS}</style>
        <BookmarkReactApp mode="trusted" runtime={bookmarkPilot.runtime} onStateChange={bookmarkPilot.onStateChange}/>
        </>,bookmarkPilot.container)}
      {debugMounted&&Object.entries(debugNodes).map(([key,node])=>
        createPortal(<DebugDiagnosticText value={debugModel[key]}/>,node,key))}
    </>));
  }
  paint();
  section=doc.getElementById('extension-center');
  const owners={'extension-center':'extension-center','extension-center-list':'extension-list',
    'extension-center-detail-body':'extension-detail','extension-center-cleanups':'extension-cleanups',
    'extension-center-empty':'extension-empty','extension-center-count':'extension-count',
    'extension-center-status':'extension-status'};
  for(const [id,owner]of Object.entries(owners)){
    const node=doc.getElementById(id);if(!node)throw new Error('E_REACT_EXTENSION_MOUNT');
    node.dataset.opendeskReactOwner=owner;
  }
  const toolbar=doc.querySelector('#extension-center-list-view > .ec-toolbar');
  if(toolbar)toolbar.dataset.opendeskReactOwner='extension-toolbar';
  return Object.freeze({
    owner:'extension-list',navigationMounted:Boolean(shell),appShellMounted:Boolean(shell),debugMounted,
    cloudPageMounted:Boolean(shell),cloudOverviewMounted:Boolean(shell),
    renderNavigation(view){
      if(disposed||!shell)return;
      if(!['tasks','tools','workflow','develop','cloud','catalog','debug'].includes(view))
        throw new Error('E_REACT_NAVIGATION_SNAPSHOT');
      if(navigationTab===view)return;
      if(navigationTab==='cloud'&&view!=='cloud')cloudPageModel.onHide?.();
      navigationTab=view;paint();
    },
    connectWorkflowPage(controller){
      if(disposed||workflowController||typeof controller?.subscribe!=='function')
        throw new Error('E_REACT_WORKFLOW_OWNER');
      workflowController=controller;paint();
    },
    connectBack(handler){if(disposed||typeof handler!=='function')throw new Error('E_REACT_EXTENSION_BACK_OWNER');
      onExtensionBack=handler;paint();},
    renderView(view){if(disposed||!['list','detail'].includes(view))throw new Error('E_REACT_EXTENSION_VIEW');
      extensionView=view;paint();},
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
    renderCloudPage(next){
      if(disposed||!shell)return;
      if(!next?.overview||!next.authorization||!next.pairing||!next.clients||!next.requests)
        throw new Error('E_REACT_CLOUD_PAGE_SNAPSHOT');
      cloudPageModel=next;paint();
    },
    renderCloudOverview(next){if(disposed||!shell)return;
      cloudPageModel={...cloudPageModel,overview:{...cloudPageModel.overview,...next}};paint();},
    renderDebugDiagnostics(next){
      if(disposed||!debugMounted)throw new Error('E_REACT_DEBUG_OWNER');
      for(const [key,value]of Object.entries(next))
        if(!Object.hasOwn(debugNodes,key)||typeof value!=='string')throw new Error('E_REACT_DEBUG_SNAPSHOT');
      debugModel={...debugModel,...next};paint();
    },
    renderRowMenu(items,options={}){if(disposed)return;rowMenuModel=items.length?{...options,items}:null;paint();},
    renderRows(next){if(disposed)return;model=next;paint();},
    setMenuKey(key){if(disposed||menuKey===key)return;menuKey=key;paint();},
    renderDetail(next){if(disposed)return;detailModel=next;paint();},
    renderToolbar(next){if(disposed)return;toolbarModel=next;paint();},
    renderFeedback(next){if(disposed)return;feedbackModel=next;paint();},
    renderRecoveries(next){if(disposed)return;recoveryModel=next;paint();},
    renderStatus(next){if(disposed)return;statusModel=next;paint();},
    dispose(){
      if(disposed)return;disposed=true;cloudPageModel.onHide?.();root.unmount();
      if(bookmarkPilot)delete bookmarkPilot.container.dataset.opendeskReactOwner;
      for(const node of Object.values(debugNodes))if(node)delete node.dataset.opendeskReactOwner;
      for(const id of Object.keys(owners)){const node=doc.getElementById(id);if(node)delete node.dataset.opendeskReactOwner;}
    }
  });
}
