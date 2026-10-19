import * as React from 'react';
import {SidebarNavigation} from './tabs/navigation.tsx';
import {ExtensionCenterPage} from './tabs/tools.tsx';
import {CloudConnectionPage} from './tabs/cloud.tsx';

// Migration boundary: the navigation, content container, Tools page and
// Extension Center are rendered in the ONE trusted React tree. Unmigrated
// business panels are adopted as opaque DOM children, not React Portals.
// Their Controller/Host and sandbox lifetimes do not change in this step.
export function prepareSidebarAppShell(doc){
  const nav=doc.querySelector('.workbench-nav');
  const main=doc.getElementById('workspace-content');
  const tools=doc.getElementById('workbench-tools');
  const sidebar=doc.getElementById('sidebar-tools');
  const list=doc.getElementById('sidebar-tool-list-view');
  const center=doc.getElementById('extension-center');
  const cloud=doc.getElementById('workbench-cloud');
  const cloudPanel=cloud?.querySelector(':scope > .cloud-panel');
  const cloudHeader=cloudPanel?.querySelector(':scope > .cloud-panel-head');
  const cloudOverview=cloudPanel?.querySelector(':scope > .cloud-overview');
  const dock=doc.getElementById('workspace-dock');
  if(!nav||!main||!tools||!sidebar||!list||!center||!dock||
    !cloud||!cloudPanel||!cloudHeader||!cloudOverview||
    doc.getElementById('opendesk-react-app')||
    tools.parentElement!==main||cloud.parentElement!==main||
    sidebar.parentElement!==tools||
    list.parentElement!==sidebar||center.parentElement!==list)
    throw new Error('E_REACT_APP_SHELL_STRUCTURE');
  const pages=Array.from(main.children);
  const toolIndex=pages.indexOf(tools);
  if(toolIndex<0||pages.indexOf(cloud)<=toolIndex)
    throw new Error('E_REACT_APP_SHELL_PAGES');
  const sidebarChildren=Array.from(sidebar.children);
  const listIndex=sidebarChildren.indexOf(list);
  if(listIndex<0)throw new Error('E_REACT_APP_SHELL_TOOL_LIST');
  const scaffold={
    beforeTools:pages.slice(0,toolIndex),
    afterTools:pages.slice(toolIndex+1).filter(node=>node!==cloud),
    cloudLegacySections:Array.from(cloudPanel.children)
      .filter(node=>node!==cloudHeader&&node!==cloudOverview),
    beforeList:sidebarChildren.slice(0,listIndex),
    afterList:sidebarChildren.slice(listIndex+1),
    listRemainder:Array.from(list.children).filter(node=>node!==center),
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
  extensionProps={},cloudModel={},cloudRequestsModel={},cloudSetupModel={},cloudActionsModel={}
}){
  const mountMain=React.useCallback(node=>{
    if(!node)return;
    const tools=node.querySelector('#workbench-tools');
    if(!tools)throw new Error('E_REACT_APP_SHELL_TOOLS');
    for(const child of scaffold.beforeTools)
      if(child.parentElement!==node)node.insertBefore(child,tools);
    for(const child of scaffold.afterTools)
      if(child.parentElement!==node)node.append(child);
  },[scaffold]);
  const mountSidebar=React.useCallback(node=>{
    if(!node)return;
    const list=node.querySelector('#sidebar-tool-list-view');
    if(!list)throw new Error('E_REACT_APP_SHELL_LIST');
    for(const child of scaffold.beforeList)
      if(child.parentElement!==node)node.insertBefore(child,list);
    for(const child of scaffold.afterList)
      if(child.parentElement!==node)node.append(child);
  },[scaffold]);
  const mountList=React.useCallback(node=>{
    if(!node)return;
    for(const child of scaffold.listRemainder)
      if(child.parentElement!==node)node.append(child);
  },[scaffold]);
  const mountDock=React.useCallback(node=>{
    if(node&&scaffold.dock.parentElement!==node)node.append(scaffold.dock);
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
      <div id="workbench-tools" role="tabpanel" aria-labelledby="tab-tools"
        className="od-page" data-workbench-page="tools" hidden={activeTab!=='tools'}>
        <section id="sidebar-tools" className="sidebar-tools" aria-label="自定义工具"
          ref={mountSidebar}>
          <div id="sidebar-tool-list-view" ref={mountList}>
            <section id="extension-center" aria-label="扩展管理">
              <ExtensionCenterPage {...extensionProps}/>
            </section>
          </div>
        </section>
      </div>
      <CloudConnectionPage model={cloudModel} requestsModel={cloudRequestsModel}
        setupModel={cloudSetupModel} actionsModel={cloudActionsModel}
        legacySections={scaffold.cloudLegacySections}
        hidden={activeTab!=='cloud'}/>
    </main>
    <div className="opendesk-react-dock-host" ref={mountDock}/>
  </>;
}
