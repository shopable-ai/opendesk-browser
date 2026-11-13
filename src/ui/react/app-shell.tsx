import {TaskCatalogPage} from './tabs/task-catalog.tsx';
import * as React from 'react';
import {SidebarNavigation} from './tabs/navigation.tsx';
import {translateSidebarNavigation} from '../../i18n/sidebar-navigation.js';
import {ExtensionCenterPage} from './tabs/tools.tsx';
import {projectTrustedInlineUpdates} from '../extension-center-model.js';
import {CloudConnectionPage} from './tabs/cloud.tsx';
import {DeveloperPage,DeveloperDock} from './tabs/develop.tsx';
import {MyTasksPage,MyTasksDock} from './tabs/my-page.tsx';
import {TaskRunSheet} from './tabs/task-run-sheet.tsx';
import {MyAgentDock} from './tabs/my-agent.tsx';
import {WorkflowPage} from './tabs/workflow.tsx';
import {SharedProviderSettingsSheet} from './components/provider-settings.tsx';
import {ToolHost} from './tabs/tool-host.tsx';
import {NotificationViewport} from './components/notifications.tsx';
import {UpdateNoticeSlot,useUpdateNoticeController} from './components/update-notice.tsx';
import {WebflowAutoControls} from '../../../projects/webflow/trusted/AutoSettings.tsx';
import {DebugPage} from './tabs/debug.tsx';

const emptyToolSnapshot={fields:{}};
const readEmptyTool=()=>emptyToolSnapshot;
const subscribeEmptyTool=()=>()=>{};
const defaultUiLocale=()=> 'zh-CN';

export function SidebarAppShell({
  activeTab='tasks',pageSurface='sidebar',debugEnabled=false,appDebugEnabled=false,onNavigate=()=>{},
  onStopAppDebug=()=>{},onOpenUpdateReview=()=>false,
  extensionProps={},cloudModel={},cloudRequestsModel={},cloudSetupModel={},cloudPageModel={},
  developerView,myView,myAgent=null,toolView=null,workflowController=null,providerSettings=null,webflowAuto=null,
  providerSettingsOpen=false,onOpenProviderSettings=()=>{},onCloseProviderSettings=()=>{},
  onOpenNativeSettings=null,nativeConnection=null,
  debugModel={},debugActions={},development=null,
  browserHistoryModel=null,browserHistoryActions=null,localeController=null
}){
  // The existing trusted preference owner drives the entire React shell without remounts.
  const updateNotice=useUpdateNoticeController(snapshot=>{
    // Website "查看更新" navigates to the existing list, not an obsolete icon.
    if(pageSurface!=='app'&&onNavigate('tools')!==false){
      const item=snapshot?.records?.find(row=>row.kind==='sidebar-tool'&&
        row.viewedAt===snapshot.openRequestedAt);
      if(item)requestAnimationFrame(()=>{
        const key='app:'+item.id;
        const buttons=[...document.querySelectorAll('#extension-center-list [data-extension-key]')];
        const target=buttons.find(node=>node.dataset.extensionKey===key&&
          node.dataset.extensionAction==='update')||
          buttons.find(node=>node.dataset.extensionKey===key&&node.dataset.extensionAction==='main');
        target?.scrollIntoView?.({block:'nearest'});
        target?.focus?.({preventScroll:true});
      });
    }
  });
  const [appMoreOpen,setAppMoreOpen]=React.useState(false);
  const openUpdateHistory=()=>{
    updateNotice.setFilter('history');updateNotice.setOpened(true);
    void updateNotice.refresh();
  };
  React.useEffect(()=>{
    if(!appMoreOpen)return;
    const onKey=event=>{
      if(event.key==='Escape'){
        event.preventDefault();setAppMoreOpen(false);
        document.getElementById('od-app-more')?.focus({preventScroll:true});
      }
    };
    document.addEventListener('keydown',onKey);
    return ()=>document.removeEventListener('keydown',onKey);
  },[appMoreOpen]);
  // Release eligibility comes from the Worker, then matches the Controller's
  // source-pinned installed row. Only a projection can be reordered.
  const controls=extensionProps.toolbarModel||{};
  const list=extensionProps.rowsModel||{rows:[]};
  const defaultOrder=pageSurface!=='app'&&controls.scope==='smart'&&
    controls.kind==='all'&&!(controls.query||'').trim()&&
    !list.busy&&!list.pendingKey&&
    !document.activeElement?.closest?.('#extension-center-list');
  const inlineRows=projectTrustedInlineUpdates(list.rows||[],updateNotice.state,
    {promote:Boolean(defaultOrder)});
  // Focus moving from a row into its portal menu must not reorder the trigger.
  // Keep only display order: release eligibility is still recomputed above.
  const orderContext=JSON.stringify([pageSurface,controls.scope,controls.kind,controls.query||'']);
  const committedOrder=React.useRef({context:null,keys:[]});
  const rowInteraction=Boolean(list.busy||list.pendingKey||extensionProps.menuKey||
    extensionProps.rowMenuModel||globalThis.document?.activeElement?.closest?.(
      '#extension-center-list,#extension-center-row-menu'));
  if(rowInteraction&&committedOrder.current.context===orderContext){
    const rank=new Map(committedOrder.current.keys.map((key,index)=>[key,index]));
    inlineRows.sort((a,b)=>(rank.get(a.key)??Infinity)-(rank.get(b.key)??Infinity));
  }
  React.useLayoutEffect(()=>{
    committedOrder.current={context:orderContext,keys:inlineRows.map(row=>row.key)};
  });
  const inlineRowsModel={...list,rows:inlineRows,
    onInlineUpdate:(record,event)=>event?.isTrusted===true?onOpenUpdateReview(record):false};
  const inlineToolbarModel={...controls,
    onUpdateHistory:event=>{
      if(event?.isTrusted!==true)return;
      controls.onCloseMenu?.(false);openUpdateHistory();
    }};
  const uiLocale=React.useSyncExternalStore(localeController?.subscribe??subscribeEmptyTool,
    localeController?.getLocale??defaultUiLocale,localeController?.getLocale??defaultUiLocale);
  React.useEffect(()=>{document.documentElement.lang=uiLocale;},[uiLocale]);
  React.useSyncExternalStore(myView.subscribe,myView.getSnapshot,myView.getSnapshot);
  const developerSnapshot=React.useSyncExternalStore(developerView.subscribe,developerView.getSnapshot,developerView.getSnapshot);
  const toolSnapshot=React.useSyncExternalStore(toolView?.subscribe??subscribeEmptyTool,
    toolView?.getSnapshot??readEmptyTool,toolView?.getSnapshot??readEmptyTool);
  // Debug and Extensions share a single ToolHost. Conceal (do not unmount)
  // its live preview while showing the installed-app list.
  const isPanelPreview=appDebugEnabled&&toolSnapshot.fields['sidebar-tool-readonly-banner']?.hidden===false;
  const localeOpen=Boolean(extensionProps.toolbarModel?.localeManager);
  const siteAccess=developerSnapshot.fields['site-access-status'];
  const siteGrant=developerSnapshot.fields['site-access-grant'];
  // Page/React/Vue previews retain Stop authority outside Controller RunHost.
  const developerStop=developerSnapshot.fields['script-stop'];
  const developerCanStop=!developerStop.disabled&&!developerStop.hidden;
  const runDock=myView.data.runDock??{taskHidden:activeTab!=='tasks',developHidden:activeTab!=='develop',
    hidden:!['tasks','develop'].includes(activeTab),stopOnly:false};
  // app.html is a small presentation adapter around the existing React ToolHost.
  // Do not construct a second workbench, installer or SDK.
  if(pageSurface==='app')return <>
  <TaskRunSheet view={myView}/>
  <main id="workspace-content" className="opendesk-app-page-content">
    <div id="workbench-tools" className="od-page" data-workbench-page="tools">
      <section id="sidebar-tools" className="sidebar-tools" aria-label="当前已安装应用">
        <div className="od-app-update-entry">
          <button id="od-app-more" type="button" aria-label="更多工具设置"
            aria-haspopup="menu" aria-expanded={appMoreOpen}
            onClick={()=>setAppMoreOpen(value=>!value)}>⋯</button>
          {appMoreOpen&&<div className="od-app-more-menu" role="menu" aria-label="工具设置">
            <button type="button" role="menuitem" onClick={()=>{
              setAppMoreOpen(false);openUpdateHistory();
            }}>更新记录与提醒设置…</button>
          </div>}
          <UpdateNoticeSlot controller={updateNotice} surface="app"
            showTrigger={false} returnFocusSelector="#od-app-more"
            onOpenReview={onOpenUpdateReview}/>
        </div>
        {toolView&&<ToolHost view={toolView} active trustedControls={null} showListBack={false}/>}
      </section>
    </div>
  </main></>;
  return <>
    <TaskRunSheet view={myView}/>
    {toolView&&<NotificationViewport view={toolView} snapshot={toolSnapshot} locale={uiLocale}/>}
    <nav className="workbench-nav" role="tablist" aria-label={translateSidebarNavigation('sidebar.navigation',uiLocale)}
      aria-description={translateSidebarNavigation('sidebar.navigationHint',uiLocale)}
      data-debug-enabled={debugEnabled?'true':undefined}>
      <SidebarNavigation activeTab={activeTab} debugEnabled={debugEnabled}
        appDebugEnabled={appDebugEnabled} locale={uiLocale} onNavigate={onNavigate}
        updateCount={updateNotice.state.verified?updateNotice.state.badgeCount:0}/>
    </nav>
    <main id="workspace-content">
      <div id="site-access-recovery" className="row" role="status" hidden={siteAccess.data.websites!==false}>
        <span id="site-access-recovery-message">访问受限：Chrome 已限制网站访问。</span>
        <button id="site-access-restore" type="button" className="od-button"
          disabled={siteGrant.disabled} aria-describedby="site-access-recovery-message"
          onClick={event=>developerView.actions['site-access-restore']?.(event.nativeEvent)}>
          {siteGrant.textContent||'恢复全部网站访问'}
        </button>
      </div>
      <TaskCatalogPage view={myView} hidden={activeTab!=='catalog'} standalone={activeTab==='catalog'}/>
      <MyTasksPage view={myView} agent={myAgent} hidden={activeTab!=='tasks'}/>
      <div id="workbench-tools" role="tabpanel"
        aria-labelledby={activeTab==='app-debug'?'tab-app-debug':'tab-tools'}
        className="od-page" data-workbench-page={activeTab==='app-debug'?'app-debug':'tools'}
        hidden={activeTab!=='tools'&&activeTab!=='app-debug'}>
        <section id="sidebar-tools" className="sidebar-tools" aria-label="自定义工具">
          <div id="sidebar-tool-list-view" hidden={activeTab==='app-debug'||(toolSnapshot.fields['sidebar-tool-display']?.hidden===false&&!isPanelPreview&&!localeOpen)}>
            {activeTab==='tools'&&isPanelPreview&&<p className="hint" role="status">
              应用调试正在运行；打开已安装应用前，请先在「应用调试」停止。
            </p>}
            <section id="extension-center" aria-label="扩展管理">
              <ExtensionCenterPage {...extensionProps}
                rowsModel={inlineRowsModel} toolbarModel={inlineToolbarModel}
                preinstallModel={toolSnapshot.fields['sidebar-tool-preinstall']?.hidden===false?
                  toolSnapshot.fields['sidebar-tool-preinstall'].data:null}
                onPreinstallAction={(action,event)=>toolView?.dispatch('sidebar-tool-preinstall',action,event)}
                updateCenter={<UpdateNoticeSlot controller={updateNotice}
                  showTrigger={false} returnFocusSelector="#extension-center-more"
                  onOpenReview={onOpenUpdateReview}/>}/>
            </section>
          </div>
          {toolView&&<ToolHost view={toolView} renderNotifications={false} concealed={activeTab==='tools'&&(isPanelPreview||localeOpen)}
            trustedControls={<WebflowAutoControls webflowAuto={webflowAuto} noticeView={toolView}
              display={toolSnapshot.fields['sidebar-tool-display']}
              visible={activeTab==='tools'&&!isPanelPreview&&!localeOpen&&!providerSettingsOpen}/>}
            debugPreview={activeTab==='app-debug'&&isPanelPreview} onStopDebug={onStopAppDebug}
            active={activeTab==='tools'||activeTab==='app-debug'}/>}
        </section>
      </div>
      <WorkflowPage controller={workflowController} active={activeTab==='workflow'}
        onOpenProviderSettings={onOpenProviderSettings}
        providerSettings={providerSettings}
        sharedProviderSettings={Boolean(providerSettings)}/>
      <DeveloperPage view={developerView} hidden={activeTab!=='develop'}/>
      <CloudConnectionPage model={cloudModel} requestsModel={cloudRequestsModel}
        setupModel={cloudSetupModel}
        pageModel={cloudPageModel}
        hidden={activeTab!=='cloud'}/>
      {debugEnabled&&<DebugPage model={debugModel} actions={debugActions} development={development}
        browserHistoryModel={browserHistoryModel} browserHistoryActions={browserHistoryActions}
        hidden={activeTab!=='debug'}/>}
    </main>
    <MyAgentDock agent={myAgent} active={activeTab==='tasks'} onOpenSettings={onOpenProviderSettings}/>
    {providerSettings&&<SharedProviderSettingsSheet providerSettings={providerSettings} webflowAuto={webflowAuto}
      onOpenNativeSettings={onOpenNativeSettings} nativeConnection={nativeConnection}
      open={providerSettingsOpen} onClose={onCloseProviderSettings}/>}
    <footer id="workspace-dock" className="workspace-dock" hidden={runDock.hidden&&!developerCanStop} data-stop-only={String(runDock.stopOnly||developerCanStop&&activeTab!=='develop')}>
      <MyTasksDock view={myView} hidden={runDock.taskHidden}/>
      <DeveloperDock view={developerView} hidden={runDock.developHidden&&!developerCanStop}/>
    </footer>
   </>;
}
