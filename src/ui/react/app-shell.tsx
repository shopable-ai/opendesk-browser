import {TaskCatalogPage} from './tabs/task-catalog.tsx';
import * as React from 'react';
import {SidebarNavigation} from './tabs/navigation.tsx';
import {ExtensionCenterPage} from './tabs/tools.tsx';
import {CloudConnectionPage} from './tabs/cloud.tsx';
import {DeveloperPage,DeveloperDock} from './tabs/develop.tsx';
import {MyTasksPage,MyTasksDock} from './tabs/my-page.tsx';
import {WorkflowPage} from './tabs/workflow.tsx';
import {SharedProviderSettingsSheet} from './components/provider-settings.tsx';
import {ToolHost} from './tabs/tool-host.tsx';
import {DebugPage} from './tabs/debug.tsx';

const emptyToolSnapshot={fields:{}};
const readEmptyTool=()=>emptyToolSnapshot;
const subscribeEmptyTool=()=>()=>{};

export function SidebarAppShell({
  activeTab='tasks',debugEnabled=false,onNavigate=()=>{},
  extensionProps={},cloudModel={},cloudRequestsModel={},cloudSetupModel={},cloudPageModel={},
  developerView,myView,myAgent=null,toolView=null,workflowController=null,providerRuntime=null,
  providerSettingsOpen=false,onOpenProviderSettings=()=>{},onCloseProviderSettings=()=>{},
  debugModel={},debugActions={},development=null,
  browserHistoryModel=null,browserHistoryActions=null
}){
  React.useSyncExternalStore(myView.subscribe,myView.getSnapshot,myView.getSnapshot);
  const developerSnapshot=React.useSyncExternalStore(developerView.subscribe,developerView.getSnapshot,developerView.getSnapshot);
  const toolSnapshot=React.useSyncExternalStore(toolView?.subscribe??subscribeEmptyTool,
    toolView?.getSnapshot??readEmptyTool,toolView?.getSnapshot??readEmptyTool);
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
        onNavigate={onNavigate}/>
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
      <MyTasksPage view={myView} agent={myAgent} hidden={activeTab!=='tasks'}
        onOpenSettings={onOpenProviderSettings}/>
      <div id="workbench-tools" role="tabpanel" aria-labelledby="tab-tools"
        className="od-page" data-workbench-page="tools" hidden={activeTab!=='tools'}>
        <section id="sidebar-tools" className="sidebar-tools" aria-label="自定义工具">
          <div id="sidebar-tool-list-view" hidden={toolSnapshot.fields['sidebar-tool-display']?.hidden===false}>
            <section id="extension-center" aria-label="扩展管理">
              <ExtensionCenterPage {...extensionProps}/>
            </section>
          </div>
          {toolView&&<ToolHost view={toolView}/>}
        </section>
      </div>
      <WorkflowPage controller={workflowController} active={activeTab==='workflow'}
        onOpenProviderSettings={onOpenProviderSettings}
        sharedProviderSettings={Boolean(providerRuntime)}/>
      <DeveloperPage view={developerView} hidden={activeTab!=='develop'}/>
      <CloudConnectionPage model={cloudModel} requestsModel={cloudRequestsModel}
        setupModel={cloudSetupModel}
        pageModel={cloudPageModel}
        hidden={activeTab!=='cloud'}/>
      {debugEnabled&&<DebugPage model={debugModel} actions={debugActions} development={development}
        browserHistoryModel={browserHistoryModel} browserHistoryActions={browserHistoryActions}
        hidden={activeTab!=='debug'}/>}
    </main>
    {providerRuntime&&<SharedProviderSettingsSheet providerRuntime={providerRuntime}
      open={providerSettingsOpen} onClose={onCloseProviderSettings}/>}
    <footer id="workspace-dock" className="workspace-dock" hidden={runDock.hidden&&!developerCanStop} data-stop-only={String(runDock.stopOnly||developerCanStop&&activeTab!=='develop')}>
      <MyTasksDock view={myView} hidden={runDock.taskHidden}/>
      <DeveloperDock view={developerView} hidden={runDock.developHidden&&!developerCanStop}/>
    </footer>
  </>;
}
