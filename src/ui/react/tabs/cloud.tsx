import * as React from 'react';
// Pure escaped text: CloudHosting keeps the only read/claim/authority/revoke owner.
export function CloudOverviewText({value=''}) {return <>{String(value??'')}</>;}


// React owns the Cloud tab header and connection overview. The existing Cloud
// Host is still the ONLY authority for pairing, approval, task selection,
// remote requests and stop/revoke. Its mutable forms/lists are adopted intact
// below the React-owned overview until their controllers expose action/snapshot
// contracts. Do not import Host/SDK or run user code inside this component.

// React owns the first-run connection prompt; the existing CloudHosting
// controller opens its trusted pairing form. No provider secrets enter React.
export function CloudFirstRun({model={}}){
  return <div id="cloud-first-run" className="cloud-first-run od-surface"
    hidden={!model.visible}>
    <p id="cloud-next-step">{model.nextStep||'请先连接可信提供者。'}</p>
    <button type="button" id="cloud-configure" className="od-button"
      onClick={event=>{
        if(event.nativeEvent?.isTrusted===true)model.onConfigure?.();
      }}>连接提供者</button>
  </div>;
}
export function CloudConnectionPage({model={},requestsModel={},setupModel={},actionsModel={},legacySections=[],hidden=false}){
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
            disabled={typeof actionsModel.onOpenConsole!=='function'}
            onClick={event=>{
              if(event.nativeEvent?.isTrusted===true)actionsModel.onOpenConsole?.();
            }}
            title="在大页面打开云控控制台" aria-label="在新标签页打开只读云控控制台">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5h5v5m0-5-9 9M19 14v5H5V5h5"/>
            </svg>
          </button>
          <button type="button" id="cloud-overview-refresh" className="od-icon-button"
            disabled={typeof actionsModel.onRefresh!=='function'}
            onClick={event=>{
              if(event.nativeEvent?.isTrusted===true)actionsModel.onRefresh?.();
            }}
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
      <CloudFirstRun model={setupModel}/>
      <CloudRequestHistory model={requestsModel}/>
    </section>
  </div>;
}


// R35.3: React owns Cloud request history, pagination, details and focus.
// The existing CloudHosting/RunHost retain all read, identity and authority
// checks. Only plain-text projections and trusted UI actions cross this seam.
export function CloudRequestHistory({model={}}){
  const rows=Array.isArray(model.rows)?model.rows:[];
  const detail=model.detail||null,focus=React.useRef(null),lastOpener=React.useRef(null);
  const trusted=(event,callback,value)=>{
    if(event.nativeEvent?.isTrusted===true&&typeof callback==='function')
      callback(value);
  };
  React.useLayoutEffect(()=>{
    if(detail)focus.current?.focus?.({preventScroll:true});
    else if(lastOpener.current?.isConnected)
      lastOpener.current.focus?.({preventScroll:true});
  },[detail?.key]);
  return <section className="cloud-requests od-surface"
    aria-label="云请求历史和原始结果入口">
    <div className="cloud-section-title od-toolbar"><strong>请求记录</strong></div>
    <ol id="cloud-request-samples" className="cloud-request-samples">
      {rows.length?rows.map(row=><li key={row.key}>
        <span>{row.title}</span><span>{row.summary}</span>
        <button type="button" className="od-button od-button--secondary"
          onClick={event=>{
            lastOpener.current=event.currentTarget;
            trusted(event,model.onDetail,row.index);
          }}>查看详情</button>
      </li>):<li>{model.emptyText||'暂无云请求'}</li>}
    </ol>
    <div className="cloud-request-pagination" aria-label="云请求历史翻页">
      <button id="cloud-request-prev" type="button"
        className="od-button od-button--secondary" disabled={!model.canPrev}
        onClick={event=>trusted(event,model.onPrev)}>上一页</button>
      <span id="cloud-request-page" role="status" aria-live="polite" className="hint">
        {model.pageText||'正在读取请求记录…'}
      </span>
      <button id="cloud-request-next" type="button"
        className="od-button od-button--secondary" disabled={!model.canNext}
        onClick={event=>trusted(event,model.onNext)}>下一页</button>
    </div>
    <section id="cloud-request-detail" className="cloud-request-detail"
      aria-label="所选云请求详情" hidden={!detail}>
      <div className="cloud-request-detail-head">
        <strong id="cloud-request-detail-title" tabIndex={-1} ref={focus}>
          {detail?.title||'请求详情'}
        </strong>
        <button id="cloud-request-close" type="button"
          className="od-button od-button--secondary"
          onClick={event=>trusted(event,model.onClose)}>关闭详情</button>
      </div>
      <p id="cloud-request-detail-state" className="cloud-request-detail-state">
        {detail?.state||''}
      </p>
      <p id="cloud-request-detail-facts" className="hint">{detail?.facts||''}</p>
      <p id="cloud-request-detail-reason" className="hint">{detail?.reason||''}</p>
      <details className="cloud-request-technical od-disclosure od-disclosure--flat">
        <summary>查看原始运行身份</summary>
        <pre id="cloud-request-detail-run-id">{detail?.runId||''}</pre>
      </details>
      <button id="cloud-request-open-result" type="button"
        className="od-button od-button--secondary" disabled={!detail?.canOpenRun}
        onClick={event=>trusted(event,model.onOpenResult)}>
        在「开发」查看原始 Run / Result
      </button>
      <p id="cloud-request-detail-note" role="status" className="hint">
        {detail?.note||''}
      </p>
    </section>
  </section>;
}
