import {TaskCatalogPage} from './tabs/task-catalog.tsx';
import * as React from 'react';
import {SidebarNavigation} from './tabs/navigation.tsx';
import {ExtensionCenterPage} from './tabs/tools.tsx';
import {CloudConnectionPage} from './tabs/cloud.tsx';
import {DeveloperPage,DeveloperDock} from './tabs/develop.tsx';
import {MyTasksPage,MyTasksDock} from './tabs/my-page.tsx';
import {WorkflowPage} from './tabs/workflow.tsx';
import {ToolHost} from './tabs/tool-host.tsx';

const emptyToolSnapshot={fields:{}};
const readEmptyTool=()=>emptyToolSnapshot;
const subscribeEmptyTool=()=>()=>{};

// Product pages share one trusted React tree. Only the non-product diagnostic
// and standalone catalog scaffolds, and installed tool Hosts, are adopted.
export function prepareSidebarAppShell(doc){
  const nav=doc.querySelector('.workbench-nav');
  const main=doc.getElementById('workspace-content');
  const tools=doc.getElementById('workbench-tools');
  const sidebar=doc.getElementById('sidebar-tools');
  const list=doc.getElementById('sidebar-tool-list-view');
  const center=doc.getElementById('extension-center');
  const dock=doc.getElementById('workspace-dock');
  if(!nav||!main||!tools||!sidebar||!list||!center||!dock||
    doc.getElementById('opendesk-react-app')||
    tools.parentElement!==main||
    sidebar.parentElement!==tools||
    list.parentElement!==sidebar||center.parentElement!==list)
    throw new Error('E_REACT_APP_SHELL_STRUCTURE');
  const pages=Array.from(main.children).filter(page=>
    page.id!=='site-access-recovery'&&
    !['tasks','workflow','develop','cloud'].includes(page.dataset.workbenchPage));
  const toolIndex=pages.indexOf(tools);
  if(toolIndex<0)
    throw new Error('E_REACT_APP_SHELL_PAGES');
  const scaffold={
    beforeTools:pages.slice(0,toolIndex),
    afterTools:pages.slice(toolIndex+1),
    dock
  };
  const mount=doc.createElement('div');
  mount.id='opendesk-react-app';
  mount.className='opendesk-react-app';
  // No second WXT entry, Host, privileged UI root, or SDK. The abandoned
  // static wrappers are replaced only after their live children are captured.
  nav.before(mount);
  nav.remove();main.remove();dock.remove();
  return {mount,scaffold};
}

export function SidebarAppShell({
  scaffold,activeTab='tasks',debugEnabled=false,onNavigate=()=>{},
  extensionProps={},cloudModel={},cloudRequestsModel={},cloudSetupModel={},cloudPageModel={},
  developerView,myView,toolView=null,workflowController=null
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
  const mountMain=React.useCallback(node=>{
    if(!node)return;
    const tools=node.querySelector('#workbench-tools');
    if(!tools)throw new Error('E_REACT_APP_SHELL_TOOLS');
    for(const child of scaffold.beforeTools)
      if(child.parentElement!==node)node.insertBefore(child,tools);
    for(const child of scaffold.afterTools)
      if(child.parentElement!==node)node.append(child);
  },[scaffold]);
  // React is the sole writer for visible page selection. The legacy panels
  // remain opaque until their data/edit surfaces migrate; no Portal composes
  // the Tools page or its Extension Center.
  React.useLayoutEffect(()=>{
    for(const panel of [...scaffold.beforeTools,...scaffold.afterTools]){
      const page=panel.dataset?.workbenchPage;
      if(page)panel.hidden=page!==activeTab;
    }
  },[scaffold,activeTab]);
  return <>
    <nav className="workbench-nav" role="tablist" aria-label="工作台"
      aria-description="较窄时可以横向滚动；左右方向键以及 Home、End 切换页签"
      data-debug-enabled={debugEnabled?'true':undefined}>
      <SidebarNavigation activeTab={activeTab} debugEnabled={debugEnabled}
        onNavigate={onNavigate}/>
    </nav>
    <main id="workspace-content" ref={mountMain}>
      <div id="site-access-recovery" className="row" role="status" hidden={siteAccess.data.websites!==false}>
        <span id="site-access-recovery-message">访问受限：Chrome 已限制网站访问。</span>
        <button id="site-access-restore" type="button" className="od-button"
          disabled={siteGrant.disabled} aria-describedby="site-access-recovery-message"
          onClick={event=>developerView.actions['site-access-restore']?.(event.nativeEvent)}>
          {siteGrant.textContent||'恢复全部网站访问'}
        </button>
      </div>
      <TaskCatalogPage view={myView} hidden={activeTab!=='catalog'}/>
      <MyTasksPage view={myView} hidden={activeTab!=='tasks'}/>
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
      <WorkflowPage controller={workflowController} active={activeTab==='workflow'}/>
      <DeveloperPage view={developerView} hidden={activeTab!=='develop'}/>
      <CloudConnectionPage model={cloudModel} requestsModel={cloudRequestsModel}
        setupModel={cloudSetupModel}
        pageModel={cloudPageModel}
        hidden={activeTab!=='cloud'}/>
    </main>
    <footer id="workspace-dock" className="workspace-dock" hidden={runDock.hidden&&!developerCanStop} data-stop-only={String(runDock.stopOnly||developerCanStop&&activeTab!=='develop')}>
      <MyTasksDock view={myView} hidden={runDock.taskHidden}/>
      <DeveloperDock view={developerView} hidden={runDock.developHidden&&!developerCanStop}/>
    </footer>
  </>;
}
