import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal,flushSync} from 'react-dom';
import {SidebarAppShell} from './app-shell.tsx';
import {createDeveloperView} from '../develop-view.js';
import {createMyWorkbenchView} from '../my-workbench-view.js';
import '../../../examples/sidebar-tools/bookmark-manager/src/model.js';
import '../../../examples/sidebar-tools/bookmark-manager/src/service.js';
import BookmarkReactApp from '../../../examples/sidebar-tools/bookmark-manager/src/react/App.jsx';
import {TrustedConversationWorkspace} from './components/conversation.tsx';
import {createPromptReconciliationAdapter} from '../conversation/prompt-controller.js';
import conversationDockCSS from './components/conversation-dock.css?raw';
import bookmarkPilotLayoutCSS from './tabs/bookmark-pilot.css?raw';
import myAgentCSS from './tabs/my-agent.css?raw';

const PROMPT_PHASE_LABELS=Object.freeze({
 thinking:'正在理解提示词操作…',observing:'正在查找并核对提示词…',
 writing:'正在保存提示词并读回确认…',verifying:'正在核对提示词结果…'
});
const BOOKMARK_PHASE_LABELS=Object.freeze({
 thinking:'正在判断下一步…',observing:'正在查找并核对书签…',
 writing:'正在更新书签并读回确认…',verifying:'正在核实最终结果…'
});

// Prompt Shortcuts remains an installed opaque iframe. Only the trusted
// conversation and its stable frame target are rendered by the single React root.
function PromptSandboxBusiness({dock,onRequest}){
  React.useLayoutEffect(()=>{
    const adapter=Object.freeze({request:onRequest});
    dock.adapterRef.current=adapter;
    return ()=>{if(dock.adapterRef.current===adapter)dock.adapterRef.current=null;};
  },[dock.adapterRef,onRequest]);
  return <div className="od-prompt-frame-target" aria-label="原提示词管理界面"/>;
}

// A single trusted root owns every product page. Existing controllers supply
// presentation snapshots and actions; installed tool code stays in its sandbox.
const mountedDocuments=new WeakSet();

export function mountSidebarApp(doc,{debugEnabled=false,onNavigate,
  developerView=createDeveloperView(),myView=createMyWorkbenchView(),toolView=null,
  providerSettings=null,openNativeSettings=null,previewContents=null}={}){
  const mount=doc.getElementById('opendesk-react-app');
  if(!mount||mount.childNodes.length||mountedDocuments.has(doc))throw new Error('E_REACT_APP_MOUNT');
  if(typeof onNavigate!=='function')throw new Error('E_REACT_APP_SHELL_NAVIGATION');
  const initialTab=doc.documentElement?.dataset?.opendeskTab||'tasks';
  const root=createRoot(mount);
  // Only the offline signed preview document may add an extra portal to this same
  // trusted React root. Production pages and installed tools cannot enter this path.
  const previewPortal=doc.querySelector('meta[name="od-preview-proof"][content="UI_PREVIEW_ONLY"]')
    ?doc.getElementById('od-preview-gallery'):null;
  mountedDocuments.add(doc);
  let disposed=false,navigationTab=initialTab,workflowController=null,myAgent=null,settingsOpen=false;
  let extensionView='list',onExtensionBack=()=>{},menuKey=null,detailModel=null,uninstallModel=null;
  let model={rows:[],busy:false,pendingKey:null,onOpenRow:()=>{},onMore:()=>{}};
  let toolbarModel={query:'',kind:'all',scope:'smart',language:'zh-CN',menuOpen:false};
  let feedbackModel={showEmpty:false,emptyText:'',countText:'正在读取扩展…'};
  let recoveryModel={ids:[],busy:false,onRetry:()=>{}};
  let statusModel={text:'',state:'info'},cloudPageModel={};
  let rowMenuModel=null,bookmarkPilot=null,promptPilot=null;
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
  function openSharedProviderSettings(){if(disposed||!providerSettings)return;settingsOpen=true;paint();}
  function closeSharedProviderSettings(){if(disposed)return;settingsOpen=false;paint();}
  function paint(){
    if(disposed)return;
    const extensionProps={rowsModel:model,menuKey,rowMenuModel,detailModel,uninstallModel,toolbarModel,feedbackModel,recoveryModel,statusModel,
      view:extensionView,onBack:onExtensionBack};
    flushSync(()=>root.render(<>
      <style data-opendesk-trusted-react-css="">{bookmarkPilotLayoutCSS+'\n'+conversationDockCSS+'\n'+myAgentCSS}</style>
      <SidebarAppShell activeTab={navigationTab}
        debugEnabled={debugEnabled} debugModel={debugModel} debugActions={debugActions} development={development}
        browserHistoryModel={browserHistoryModel} browserHistoryActions={browserHistoryActions}
        onNavigate={onNavigate} extensionProps={extensionProps}
        providerSettings={providerSettings} providerSettingsOpen={settingsOpen}
        onOpenNativeSettings={openNativeSettings}
        onOpenProviderSettings={openSharedProviderSettings}
        onCloseProviderSettings={closeSharedProviderSettings}
        developerView={developerView} myView={myView} myAgent={myAgent} toolView={toolView} workflowController={workflowController}
        cloudModel={cloudPageModel.overview} cloudRequestsModel={cloudPageModel.requests}
        cloudSetupModel={cloudPageModel.setup} cloudPageModel={cloudPageModel}/>
      {previewContents&&previewPortal&&createPortal(previewContents,previewPortal)}
      {promptPilot&&createPortal(
        <TrustedConversationWorkspace controller={promptPilot.controller}
          headerTarget={promptPilot.headerTarget}
          title="提示词 AI 对话" emptyPrompt="想管理哪些提示词？" phaseLabels={PROMPT_PHASE_LABELS}
          onOpenSettings={openSharedProviderSettings}
          placeholder="例如：创建一条将中文翻译成日语的提示词"
          renderBusiness={dock=><PromptSandboxBusiness dock={dock} onRequest={promptPilot.onRequest}/>}/>,
        promptPilot.container)}
      {bookmarkPilot&&createPortal(<>
        <TrustedConversationWorkspace controller={bookmarkPilot.runtime.conversation}
          headerTarget={bookmarkPilot.headerTarget}
         title="AI 对话" emptyPrompt="想整理哪些书签？" phaseLabels={BOOKMARK_PHASE_LABELS}
         onOpenSettings={openSharedProviderSettings}
         placeholder="例如：创建一个文件夹并收藏当前网页"
         
         renderBusiness={dock=><BookmarkReactApp mode="trusted" runtime={bookmarkPilot.runtime}
           onStateChange={bookmarkPilot.onStateChange} dock={dock}/>}/>
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
    openProviderSettings:openSharedProviderSettings,
    cloudPageMounted:true,cloudOverviewMounted:true,
    renderNavigation(view){
      if(disposed)return;
      if(!['tasks','tools','workflow','develop','cloud','catalog','debug'].includes(view)||view==='debug'&&!debugEnabled)
        throw new Error('E_REACT_NAVIGATION_SNAPSHOT');
      if(navigationTab===view)return;
      if(navigationTab==='cloud'&&view!=='cloud')cloudPageModel.onHide?.();
      navigationTab=view;paint();
    },
    connectMyAgent(controller){
      if(disposed||myAgent||typeof controller?.subscribe!=='function')
        throw new Error('E_REACT_MY_AGENT_OWNER');
      myAgent=controller;paint();
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
    mountPromptConversation({container,conversation,onRequest,onReconcile,recovery=null}={}){
      if(disposed||promptPilot||!container||container.ownerDocument!==doc||
        container.childNodes.length||container.dataset.opendeskReactOwner||
        !conversation||typeof conversation.request!=='function'||
        typeof conversation.cancel!=='function'||typeof onRequest!=='function')
        throw new Error('E_PROMPT_TRUSTED_DOCK_MOUNT');
      const headerTarget=doc.getElementById('sidebar-tool-chat-slot');
      if(!headerTarget||!doc.getElementById('sidebar-tool-title'))
        throw new Error('E_PROMPT_TRUSTED_CHAT_HEADER');
      // Transcript is display-only. Executable references never survive a
      // tool instance change or cross into the Bookmark or Workflow sessions.
      let session={open:Boolean(recovery),draft:'',rows:recovery?[{
        id:'prompt-recovery-'+String(recovery.createdAt||0),speaker:'系统',
        message:'上次 AI 写入尚未核实。请使用下方「核对真实存储」按钮读取当前库；不要重试创建。'
      }]:[],needsReview:Boolean(recovery),refs:{matches:[],etag:null}};
      const recoveryAdapter=typeof onReconcile==='function'?
        createPromptReconciliationAdapter(onReconcile):null;
      const controller=Object.freeze({
        source:()=>conversation.source(),
        request:args=>conversation.request({...args,scope:'prompt'}),
        cancel:args=>conversation.cancel(args),
        reconcile:recoveryAdapter?.reconcile??null,
        readSession:()=>structuredClone(session),
        saveSession:next=>{
          if(!next||typeof next!=='object')return;
          session={open:next.open===true,
            draft:typeof next.draft==='string'?next.draft.slice(0,4000):'',
            needsReview:next.needsReview===true,
            rows:Array.isArray(next.rows)?next.rows.slice(-24).filter(row=>
              typeof row?.id==='string'&&typeof row?.message==='string'&&
              ['你','助手','系统'].includes(row.speaker)).map(row=>({
                id:row.id.slice(0,100),speaker:row.speaker,message:row.message.slice(0,3500)})):[],
            refs:{matches:Array.isArray(next.refs?.matches)?
              next.refs.matches.slice(0,12).filter(id=>typeof id==='string'&&id.length<=160):[],
              etag:typeof next.refs?.etag==='string'&&/^[a-f0-9]{64}$/.test(next.refs.etag)?
                next.refs.etag:null}};
        }
      });
      promptPilot={container,headerTarget,controller,onRequest};
      container.dataset.opendeskReactOwner='prompt-conversation-portal';
      try{paint();}catch(error){
        promptPilot=null;recoveryAdapter?.dispose();delete container.dataset.opendeskReactOwner;
        try{paint();}catch{/* Keep the first trusted render failure. */}
        throw error;
      }
      const frameTarget=container.querySelector('.od-prompt-frame-target');
      if(!frameTarget){
        promptPilot=null;recoveryAdapter?.dispose();delete container.dataset.opendeskReactOwner;paint();
        throw new Error('E_PROMPT_IFRAME_TARGET_MISSING');
      }
      let released=false;
      return {frameTarget,dispose(){
        if(released)return;released=true;recoveryAdapter?.dispose();
        if(promptPilot?.container===container){
          promptPilot=null;
          if(!disposed)paint();
          delete container.dataset.opendeskReactOwner;
        }
      }};
    },
    mountBookmarkPilot({container,sdk,onStateChange,conversation=null}={}){
      if(disposed||bookmarkPilot||!container||container.ownerDocument!==doc||
        container.childNodes.length||container.dataset.opendeskReactOwner||
        typeof sdk?.bookmarks?.getTree!=='function'||
        typeof onStateChange!=='function'||!globalThis.BookmarkR2Service?.create||
        !globalThis.BookmarkR2Model)
        throw new Error('E_BOOKMARK_TRUSTED_PILOT_MOUNT');
      // The trusted SDK token is new for each mount. A reopened tool may keep
      // a display-only draft/transcript, but MUST NOT inherit executable
      // bookmark object IDs or authority from a previous portal instance.
      const oldSession=conversation?.readSession?.()||{};
      const scopedConversation=conversation?Object.freeze({
        source:()=>conversation.source(),
        request:args=>conversation.request(args),
        cancel:options=>conversation.cancel(options),
        readSession:()=>({...oldSession,open:false,
          refs:{folderId:null,bookmarkId:null,matches:[]}}),
        saveSession:state=>conversation.saveSession(state)
      }):null;
      const headerTarget=doc.getElementById('sidebar-tool-chat-slot');
      if(!headerTarget||!doc.getElementById('sidebar-tool-title'))
        throw new Error('E_BOOKMARK_TRUSTED_CHAT_HEADER');
      bookmarkPilot={container,headerTarget,
        runtime:Object.freeze({sdk,service:globalThis.BookmarkR2Service.create(sdk),
          conversation:scopedConversation}),
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
