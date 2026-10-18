import * as React from 'react';
// Pure escaped text: CloudHosting keeps the only read/claim/authority/revoke owner.
export function CloudOverviewText({value=''}) {return <>{String(value??'')}</>;}


// React owns the Cloud tab header and connection overview. The existing Cloud
// Host is still the ONLY authority for pairing, approval, task selection,
// remote requests and stop/revoke. Its mutable forms/lists are adopted intact
// below the React-owned overview until their controllers expose action/snapshot
// contracts. Do not import Host/SDK or run user code inside this component.
export function CloudConnectionPage({model={},legacySections=[],hidden=false}){
  const attachRest=React.useCallback(node=>{
    if(!node)return;
    for(const child of legacySections)
      if(child.parentElement!==node)node.append(child);
  },[legacySections]);
  return <div id="workbench-cloud" role="tabpanel" aria-labelledby="tab-cloud"
    className="od-page" data-workbench-page="cloud" hidden={hidden}>
    <section className="cloud-panel od-stack" aria-label="云控管理" ref={attachRest}>
      <header className="cloud-panel-head od-toolbar">
        <strong className="od-page-title">云控</strong>
        <div className="cloud-panel-actions od-action-group">
          <button type="button" id="cloud-open-console" className="od-icon-button"
            title="在大页面打开云控控制台" aria-label="在新标签页打开只读云控控制台">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5h5v5m0-5-9 9M19 14v5H5V5h5"/>
            </svg>
          </button>
          <button type="button" id="cloud-overview-refresh" className="od-icon-button"
            title="刷新云控状态" aria-label="刷新云控状态">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 11a8 8 0 0 0-14-5L4 8m0-5v5h5M4 13a8 8 0 0 0 14 5l2-2m0 5v-5h-5"/>
            </svg>
          </button>
        </div>
      </header>
      <section className="cloud-overview od-surface" aria-label="云控连接状态">
        <p id="cloud-overview-state" role="status" aria-live="polite">
          <CloudOverviewText value={model.summary??'正在检查连接与授权…'}/>
        </p>
        <div className="cloud-overview-metrics">
          <div><span>连接</span><strong id="cloud-overview-connection">
            <CloudOverviewText value={model.connection??'检测中'}/>
          </strong></div>
          <div><span>已授权任务</span><strong id="cloud-overview-tasks">
            <CloudOverviewText value={model.tasks??'—'}/>
          </strong></div>
        </div>
        <details className="cloud-diagnostics od-disclosure od-disclosure--flat">
          <summary>运行环境与历史统计</summary>
          <div className="cloud-overview-secondary">
            <div>提供者 <strong id="cloud-overview-provider">
              <CloudOverviewText value={model.provider??'检测中'}/>
            </strong></div>
            <div>执行宿主 <strong id="cloud-overview-host">
              <CloudOverviewText value={model.host??'检测中'}/>
            </strong></div>
            <div>执行槽 <strong id="cloud-overview-slot">
              <CloudOverviewText value={model.slot??'检测中'}/>
            </strong></div>
            <div>云请求 <strong id="cloud-overview-requests">
              <CloudOverviewText value={model.requests??'—'}/>
            </strong></div>
          </div>
          <p id="cloud-my-state" className="cloud-overview-detail">
            <CloudOverviewText value={model.myState??'托管未启用'}/>
          </p>
        </details>
      </section>
    </section>
  </div>;
}
