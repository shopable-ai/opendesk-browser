import {TaskCatalogPage} from './tabs/task-catalog.tsx';
import * as React from 'react';
import {SidebarNavigation} from './tabs/navigation.tsx';
import {ExtensionCenterPage} from './tabs/tools.tsx';
import {CloudConnectionPage} from './tabs/cloud.tsx';
import {DeveloperPage,DeveloperDock} from './tabs/develop.tsx';
import {MyTasksPage,MyTasksDock} from './tabs/my-page.tsx';
import {MyAgentDock} from './tabs/my-agent.tsx';
import {WorkflowPage} from './tabs/workflow.tsx';
import {SharedProviderSettingsSheet} from './components/provider-settings.tsx';
import {ToolHost} from './tabs/tool-host.tsx';
import {DebugPage} from './tabs/debug.tsx';

const emptyToolSnapshot={fields:{}};
const readEmptyTool=()=>emptyToolSnapshot;
const subscribeEmptyTool=()=>()=>{};

export function SidebarAppShell({
  activeTab='tasks',debugEnabled=false,appDebugEnabled=false,onNavigate=()=>{},
  onStopAppDebug=()=>{},
  extensionProps={},cloudModel={},cloudRequestsModel={},cloudSetupModel={},cloudPageModel={},
  developerView,myView,myAgent=null,toolView=null,workflowController=null,providerSettings=null,
  providerSettingsOpen=false,onOpenProviderSettings=()=>{},onCloseProviderSettings=()=>{},
  onOpenNativeSettings=null,nativeConnection=null,
  debugModel={},debugActions={},development=null,
  browserHistoryModel=null,browserHistoryActions=null
}){
  React.useSyncExternalStore(myView.subscribe,myView.getSnapshot,myView.getSnapshot);
  const developerSnapshot=React.useSyncExternalStore(developerView.subscribe,developerView.getSnapshot,developerView.getSnapshot);
  const toolSnapshot=React.useSyncExternalStore(toolView?.subscribe??subscribeEmptyTool,
    toolView?.getSnapshot??readEmptyTool,toolView?.getSnapshot??readEmptyTool);
  // Debug and Extensions share a single ToolHost. Conceal (do not unmount)
  // its live preview while showing the installed-app list.
  const isPanelPreview=appDebugEnabled&&toolSnapshot.fields['sidebar-tool-readonly-banner']?.hidden===false;
  const siteAccess=developerSnapshot.fields['site-access-status'];
  const siteGrant=developerSnapshot.fields['site-access-grant'];
  // Page/React/Vue previews retain Stop authority outside Controller RunHost.
  const developerStop=developerSnapshot.fields['script-stop'];
  const developerCanStop=!developerStop.disabled&&!developerStop.hidden;
  const runDock=myView.data.runDock??{taskHidden:activeTab!=='tasks',developHidden:activeTab!=='develop',
    hidden:!['tasks','develop'].includes(activeTab),stopOnly:false};
  return <>
    <nav className="workbench-nav" role="tablist" aria-label="工作台"
      aria-description="较窄时可以横向滚动；左右方向键以及 Home、End 切换页签"
      data-debug-enabled={debugEnabled?'true':undefined}>
      <SidebarNavigation activeTab={activeTab} debugEnabled={debugEnabled}
        appDebugEnabled={appDebugEnabled} onNavigate={onNavigate}/>
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
          {activeTab==='app-debug'&&<div className="od-toolbar" role="group" aria-label="应用调试控制">
            <span className="hint">本地快照 · 未安装</span>
            <button type="button" className="od-button od-button--secondary"
              onClick={onStopAppDebug}>停止调试</button>
          </div>}
          <div id="sidebar-tool-list-view" hidden={activeTab==='app-debug'||(toolSnapshot.fields['sidebar-tool-display']?.hidden===false&&!isPanelPreview)}>
            {activeTab==='tools'&&isPanelPreview&&<p className="hint" role="status">
              应用调试正在运行；打开已安装应用前，请先在「应用调试」停止。
            </p>}
            <section id="extension-center" aria-label="扩展管理">
              <ExtensionCenterPage {...extensionProps}/>
            </section>
          </div>
          {toolView&&<ToolHost view={toolView} concealed={activeTab==='tools'&&isPanelPreview}
            debugPreview={activeTab==='app-debug'&&isPanelPreview}/>}
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
    {providerSettings&&<SharedProviderSettingsSheet providerSettings={providerSettings}
      onOpenNativeSettings={onOpenNativeSettings} nativeConnection={nativeConnection}
      open={providerSettingsOpen} onClose={onCloseProviderSettings}/>}
    <footer id="workspace-dock" className="workspace-dock" hidden={runDock.hidden&&!developerCanStop} data-stop-only={String(runDock.stopOnly||developerCanStop&&activeTab!=='develop')}>
      <MyTasksDock view={myView} hidden={runDock.taskHidden}/>
      <DeveloperDock view={developerView} hidden={runDock.developHidden&&!developerCanStop}/>
    </footer>
  </>;
}
