import * as React from 'react';
import {TaskCatalogPage} from './tabs/task-catalog.tsx';
import {DeveloperPage,DeveloperDock} from './tabs/develop.tsx';
import {MyTasksPage,MyTasksDock} from './tabs/my-page.tsx';
import {TaskRunSheet} from './tabs/task-run-sheet.tsx';

// Only the serve entry can supply a scope. Reuse the production views in the
// same React root, without exposing an ordinary controller behind test controls.
export function TaskAcceptanceSurface({scope,disconnected,exit}){
  const {myView,developerView,view,identity}=scope;
  React.useSyncExternalStore(myView.subscribe,myView.getSnapshot,myView.getSnapshot);
  const developer=React.useSyncExternalStore(developerView.subscribe,developerView.getSnapshot,developerView.getSnapshot);
  const [query,setQuery]=React.useState('周末徒步');
  const [status,setStatus]=React.useState('');
  const [audit,setAudit]=React.useState(null);
  const busy=React.useSyncExternalStore(scope.subscribeBusy,scope.getBusy,scope.getBusy);
  const dock=myView.data.runDock;
  const developerCanStop=!developer.fields['script-stop'].disabled;
  if(disconnected)return <main id="workspace-content">
    <p role="alert">离线验收已断开。当前操作已停止，未使用日用数据重试。</p>
    <button type="button" className="od-button" onClick={event=>exit(event.nativeEvent)}>退出离线验收</button>
  </main>;
  return <>
    <TaskRunSheet view={myView}/>
    <nav className="workbench-nav" role="tablist" aria-label="离线验收工作区">
      {[['tasks','我的'],['develop','开发'],['catalog','任务目录']].map(([id,label])=>
        <button key={id} id={id==='tasks'?'tab-my-tasks':'tab-'+id} type="button" role="tab" aria-selected={view===id} disabled={busy}
          onClick={event=>{if(event.nativeEvent.isTrusted)scope.navigate(id);}}>{label}</button>)}
    </nav>
    <main id="workspace-content">
      <details className="od-disclosure">
        <summary>离线验收 · v{identity.installation.version}</summary>
        <p className="hint">仅使用固定测试页面和本次会话数据。</p>
        <form onSubmit={event=>{event.preventDefault();if(!event.nativeEvent.isTrusted||busy)return;
          void scope.selectQuery(query).then(()=>setStatus('离线网页已准备。'),error=>setStatus(error.message));}}>
          <label htmlFor="acceptance-query">离线网页关键词</label>
          <input id="acceptance-query" className="od-field" value={query} maxLength={120} required
            onChange={event=>setQuery(event.target.value)}/>
          <button type="submit" className="od-button od-button--secondary" disabled={busy}>准备离线网页</button>
        </form>
        <button type="button" className="od-button od-button--secondary" onClick={event=>{
          if(event.nativeEvent.isTrusted)void scope.inspect().then(setAudit,error=>setStatus(error.message));
        }}>读取验收记录</button>
        <button type="button" className="od-button od-button--secondary" disabled={busy}
          onClick={event=>exit(event.nativeEvent)}>退出离线验收</button>
        {status&&<p role="status">{status}</p>}
        {audit&&<pre className="od-result" aria-label="离线验收记录">{JSON.stringify(audit,null,2)}</pre>}
      </details>
      <TaskCatalogPage view={myView} hidden={view!=='catalog'} offline/>
      <MyTasksPage view={myView} hidden={view!=='tasks'} offline/>
      <DeveloperPage view={developerView} hidden={view!=='develop'} offline/>
    </main>
    <footer id="workspace-dock" className="workspace-dock" hidden={dock?.hidden&&!developerCanStop} data-stop-only={String(Boolean(dock?.stopOnly||developerCanStop&&view!=='develop'))}>
      <MyTasksDock view={myView} hidden={dock?.taskHidden}/>
      <DeveloperDock view={developerView} hidden={dock?.developHidden&&!developerCanStop} offline/>
    </footer>
  </>;
}
