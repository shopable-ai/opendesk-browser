import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal,flushSync} from 'react-dom';
import {SidebarAppShell} from './app-shell.tsx';
import {createDeveloperView} from '../develop-view.js';
import {createMyWorkbenchView} from '../my-workbench-view.js';
import '../../../examples/sidebar-tools/bookmark-manager/src/model.js';
import '../../../examples/sidebar-tools/bookmark-manager/src/service.js';
import BookmarkReactApp from '../../../examples/sidebar-tools/bookmark-manager/src/react/App.jsx';
import bookmarkScopedCSS from '../../../examples/sidebar-tools/bookmark-manager/src/react/style.css?raw';
import bookmarkPilotLayoutCSS from './tabs/bookmark-pilot.css?raw';

// A single trusted root owns every product page. Existing controllers supply
// presentation snapshots and actions; installed tool code stays in its sandbox.
const mountedDocuments=new WeakSet();

export function mountSidebarApp(doc,{debugEnabled=false,onNavigate,
  developerView=createDeveloperView(),myView=createMyWorkbenchView(),toolView=null}={}){
  const mount=doc.getElementById('opendesk-react-app');
  if(!mount||mount.childNodes.length||mountedDocuments.has(doc))throw new Error('E_REACT_APP_MOUNT');
  if(typeof onNavigate!=='function')throw new Error('E_REACT_APP_SHELL_NAVIGATION');
  const initialTab=doc.documentElement?.dataset?.opendeskTab||'tasks';
  const root=createRoot(mount);
  mountedDocuments.add(doc);
  let disposed=false,navigationTab=initialTab,workflowController=null;
  let extensionView='list',onExtensionBack=()=>{},menuKey=null,detailModel=null,uninstallModel=null;
  let model={rows:[],busy:false,pendingKey:null,onOpenRow:()=>{},onMore:()=>{}};
  let toolbarModel={query:'',kind:'all',scope:'smart',language:'zh-CN',menuOpen:false};
  let feedbackModel={showEmpty:false,emptyText:'',countText:'正在读取扩展…'};
  let recoveryModel={ids:[],busy:false,onRetry:()=>{}};
  let statusModel={text:'',state:'info'},cloudPageModel={};
  let rowMenuModel=null,bookmarkPilot=null;
  let debugModel={},debugActions={},development=null;
  let browserHistoryModel=null,browserHistoryActions=null;
  const ownedNodes=[];
  function dispose(){
    if(disposed)return;disposed=true;
    try{cloudPageModel.onHide?.();}
    finally{
      try{root.unmount();}
      finally{
        mountedDocuments.delete(doc);
        if(bookmarkPilot?.container.dataset.opendeskReactOwner==='bookmark-react-pilot')
          delete bookmarkPilot.container.dataset.opendeskReactOwner;
        bookmarkPilot=null;
        for(const [node,owner]of ownedNodes)
          if(node.dataset.opendeskReactOwner===owner)delete node.dataset.opendeskReactOwner;
        ownedNodes.length=0;
      }
    }
  }
  function paint(){
    if(disposed)return;
    const extensionProps={rowsModel:model,menuKey,rowMenuModel,detailModel,uninstallModel,toolbarModel,feedbackModel,recoveryModel,statusModel,
      view:extensionView,onBack:onExtensionBack};
    flushSync(()=>root.render(<>
      <style data-opendesk-trusted-react-css="">{bookmarkPilotLayoutCSS}</style>
      <SidebarAppShell activeTab={navigationTab}
        debugEnabled={debugEnabled} debugModel={debugModel} debugActions={debugActions} development={development}
        browserHistoryModel={browserHistoryModel} browserHistoryActions={browserHistoryActions}
        onNavigate={onNavigate} extensionProps={extensionProps}
        developerView={developerView} myView={myView} toolView={toolView} workflowController={workflowController}
        cloudModel={cloudPageModel.overview} cloudRequestsModel={cloudPageModel.requests}
        cloudSetupModel={cloudPageModel.setup} cloudPageModel={cloudPageModel}/>
      {bookmarkPilot&&createPortal(<><style>{bookmarkScopedCSS}</style>
        <BookmarkReactApp mode="trusted" runtime={bookmarkPilot.runtime} onStateChange={bookmarkPilot.onStateChange}/>
        </>,bookmarkPilot.container)}
    </>));
  }
  const owners={'extension-center':'extension-center','extension-center-list':'extension-list',
    'extension-center-detail-body':'extension-detail','extension-center-cleanups':'extension-cleanups',
    'extension-center-empty':'extension-empty','extension-center-count':'extension-count',
    'extension-center-status':'extension-status'};
  try{
    paint();
    for(const [id,owner]of Object.entries(owners)){
      const node=doc.getElementById(id);if(!node)throw new Error('E_REACT_EXTENSION_MOUNT');
      node.dataset.opendeskReactOwner=owner;ownedNodes.push([node,owner]);
    }
    const toolbar=doc.querySelector('#extension-center-list-view > .ec-toolbar');
    if(toolbar){toolbar.dataset.opendeskReactOwner='extension-toolbar';ownedNodes.push([toolbar,'extension-toolbar']);}
  }catch(error){
    try{dispose();}catch{/* Preserve the initial mount failure after attempting all cleanup. */}
    throw error;
  }
  return Object.freeze({
    owner:'extension-list',navigationMounted:true,appShellMounted:true,debugMounted:debugEnabled,
    cloudPageMounted:true,cloudOverviewMounted:true,
    renderNavigation(view){
      if(disposed)return;
      if(!['tasks','tools','workflow','develop','cloud','catalog','debug'].includes(view)||view==='debug'&&!debugEnabled)
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
    mountBookmarkPilot({container,sdk,onStateChange,conversation=null}={}){
      if(disposed||bookmarkPilot||!container||container.ownerDocument!==doc||
        container.childNodes.length||container.dataset.opendeskReactOwner||
        typeof sdk?.bookmarks?.getTree!=='function'||
        typeof onStateChange!=='function'||!globalThis.BookmarkR2Service?.create||
        !globalThis.BookmarkR2Model)
        throw new Error('E_BOOKMARK_TRUSTED_PILOT_MOUNT');
      bookmarkPilot={container,
        runtime:Object.freeze({sdk,service:globalThis.BookmarkR2Service.create(sdk),conversation}),
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
      if(disposed)return;
      if(!next?.overview||!next.authorization||!next.pairing||!next.clients||!next.requests)
        throw new Error('E_REACT_CLOUD_PAGE_SNAPSHOT');
      cloudPageModel=next;paint();
    },
    renderCloudOverview(next){if(disposed)return;
      cloudPageModel={...cloudPageModel,overview:{...cloudPageModel.overview,...next}};paint();},
    connectDebugActions(next){
      if(disposed||!debugEnabled)throw new Error('E_REACT_DEBUG_OWNER');
      debugActions=next??{};paint();
    },
    renderDevelopmentStatus(next){if(disposed||!debugEnabled)return;development=next;paint();},
    renderBrowserHistory(next){if(disposed)return;browserHistoryModel=next;paint();},
    connectBrowserHistoryActions(next){if(disposed)return;browserHistoryActions=next??null;paint();},
    renderDebugDiagnostics(next){
      if(disposed||!debugEnabled)throw new Error('E_REACT_DEBUG_OWNER');
      debugModel={...debugModel,...next};paint();
    },
    renderRowMenu(items,options={}){if(disposed)return;rowMenuModel=items.length?{...options,items}:null;paint();},
    renderRows(next){if(disposed)return;model=next;paint();},
    setMenuKey(key){if(disposed||menuKey===key)return;menuKey=key;paint();},
    renderDetail(next){if(disposed)return;detailModel=next;paint();},
    renderUninstall(next){if(disposed)return;uninstallModel=next;paint();},
    renderToolbar(next){if(disposed)return;toolbarModel=next;paint();},
    renderFeedback(next){if(disposed)return;feedbackModel=next;paint();},
    renderRecoveries(next){if(disposed)return;recoveryModel=next;paint();},
    renderStatus(next){if(disposed)return;statusModel=next;paint();},
    dispose
  });
}
