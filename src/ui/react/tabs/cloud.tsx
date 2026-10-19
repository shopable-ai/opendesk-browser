import * as React from 'react';
import {CloudTaskAuthorization} from './cloud-authorization.tsx';
import {CloudPairingSettings,CloudClientCredentials} from './cloud-settings.tsx';
// Pure escaped text: CloudHosting keeps the only read/claim/authority/revoke owner.
export function CloudOverviewText({value=''}) {return <>{String(value??'')}</>;}


// First-run actions stay in the same Controller and trusted React tree.
export function CloudFirstRun({model={}}){
  return <div id="cloud-first-run" className="cloud-first-run od-surface" hidden={!model.visible}>
    <p id="cloud-next-step">{model.nextStep||'请先连接可信提供者。'}</p>
    <button type="button" id="cloud-configure" className="od-button"
      onClick={event=>{if(event.nativeEvent?.isTrusted===true)model.onConfigure?.();}}>
      连接提供者
    </button>
  </div>;
}

// CloudHosting projects the complete page; React is its only DOM owner.
export function CloudConnectionPage({model={},requestsModel={},setupModel={},pageModel={},hidden=false}){
  const [pairingOpen,setPairingOpen]=React.useState(false);
  const trusted=(event,action)=>{if(event.nativeEvent?.isTrusted===true)action?.();};
  return <div id="workbench-cloud" role="tabpanel" aria-labelledby="tab-cloud"
    className="od-page" data-workbench-page="cloud" hidden={hidden}>
    <section className="cloud-panel od-stack" aria-label="云控管理">
      <header className="cloud-panel-head od-toolbar">
        <strong className="od-page-title">云控</strong>
        <div className="cloud-panel-actions od-action-group">
          <button type="button" id="cloud-open-console" className="od-icon-button"
            disabled={typeof pageModel.onOpenConsole!=='function'}
            onClick={event=>trusted(event,pageModel.onOpenConsole)}
            title="在大页面打开云控控制台" aria-label="在新标签页打开只读云控控制台">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5h5v5m0-5-9 9M19 14v5H5V5h5"/>
            </svg>
          </button>
          <button type="button" id="cloud-overview-refresh" className="od-icon-button"
            disabled={typeof pageModel.onRefresh!=='function'}
            onClick={event=>trusted(event,pageModel.onRefresh)}
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
            <div>执行端 <strong id="cloud-overview-executor"><CloudOverviewText value={model.executor??'未配对'}/></strong></div>
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
      <CloudFirstRun model={{...setupModel,onConfigure:()=>setPairingOpen(true)}}/>
      {!setupModel.visible&&<CloudProgramInbox model={pageModel.programs}/>}
      <div hidden={!pageModel.visibleApproval}>
        <CloudTaskAuthorization model={pageModel.authorization}/>
      </div>
      <CloudRequestHistory model={requestsModel}/>
      <CloudClientCredentials model={pageModel.clients}/>
      <CloudPairingSettings model={pageModel.pairing} open={pairingOpen}
        onOpenChange={setPairingOpen}/>
    </section>
  </div>;
}


// Program source never renders before a trusted review click. Reviewed JS
// is shown only as inert, escaped React text, never injected into HTML/eval.
export function CloudProgramInbox({model={}}){
  const rows=Array.isArray(model.rows)?model.rows:[],
    review=model.review||null,trial=model.trial||null;
  const [paramsText,setParamsText]=React.useState('{}');
  React.useEffect(()=>setParamsText('{}'),[review?.deliveryId,review?.sourceHash]);
  const trusted=(event,fn,id)=>{
    if(event.nativeEvent?.isTrusted===true&&typeof fn==='function')fn(id);
  };
  return <section className="cloud-programs od-surface" aria-label="云端交付的待审核程序">
    <div className="cloud-section-title od-toolbar">
      <strong>待审核程序</strong>
      <button type="button" className="od-button od-button--secondary"
        disabled={!model.canRefresh}
        onClick={event=>trusted(event,model.onRefresh)}>
        刷新
      </button>
    </div>
    <p role="status" className="hint">{model.status||'云端交付的源码不会自动执行或安装。'}</p>
    {rows.length>0&&<ul className="cloud-request-samples cloud-program-list">
      {rows.map(row=>{
        const current=review?.deliveryId===row.deliveryId;
        return <li key={row.deliveryId} className="cloud-program-item">
          <div className="cloud-program-summary">
            <strong>{row.title||row.taskId}</strong>
            <span>{row.taskId} · v{row.version} · {row.siteOrigins?.join('、')||''}</span>
            <span>SHA-256 {row.sourceHash}</span>
          </div>
          <div className="cloud-program-actions">
            <button type="button" className="od-button od-button--secondary"
              disabled={Boolean(model.busy)}
              onClick={event=>trusted(event,model.onReview,row.deliveryId)}>
              {current?'重新核对源码':'查看源码与权限'}
            </button>
            <button type="button" className="od-button"
              disabled={Boolean(model.busy)||!current}
              onClick={event=>trusted(event,model.onImport,row.deliveryId)}>
              接收为待验证任务
            </button>
          </div>
          {current&&<section className="cloud-program-review" aria-label="已校验的远程程序源码">
            <p><strong>程序说明：</strong>{review.description||'未提供'} </p>
            <p><strong>来源：</strong>{review.sourceOrigin} · {review.author}</p>
            <p><strong>网站：</strong>{review.siteOrigins?.join('、')}</p>
            <p><strong>权限：</strong>{review.permissions?.join('、')}</p>
            <p><strong>依赖：</strong>此 Task Package v1 不声明外部 JS 依赖；源码使用浏览器已有的 Controller 能力。</p>
            <p className="cloud-program-hash">程序 SHA-256 {review.sourceHash}</p>
            <p className="cloud-program-hash">清单 SHA-256 {review.manifestHash}</p>
            <details className="od-disclosure od-disclosure--flat">
              <summary>查看参数约束</summary>
              <pre>{review.paramsSchema}</pre>
            </details>
            <div className="cloud-program-source">
              <strong>完整 JS 源码（只读）</strong>
              <pre><code>{review.source}</code></pre>
            </div>
            {review.previousVersion
              ?<details className="od-disclosure od-disclosure--flat">
                <summary>与已安装 v{review.previousVersion} 的差异</summary>
                {review.difference?<><p className="hint">差异区间：新增 {review.difference.added} 行、删除 {review.difference.removed} 行；共同首尾已折叠。</p>
                  <pre>{review.difference.excerpt}</pre>
                  <details className="od-disclosure od-disclosure--flat">
                    <summary>查看已安装版本完整源码</summary>
                    <pre>{review.previousSource}</pre>
                  </details>
                </>:<p className="hint">已安装版本源码暂不可读取；请在任务目录核对后再替换。</p>}
              </details>
              :<p className="hint">本机尚无此 Task 的已安装版本。</p>}
            <div className="cloud-program-trial">
              <label htmlFor="cloud-program-params">试运行参数（JSON）</label>
              <textarea id="cloud-program-params" rows={2}
                value={paramsText} onChange={event=>setParamsText(event.currentTarget.value)}
                spellCheck={false}/>
              <button type="button" className="od-button"
                disabled={Boolean(model.busy)}
                onClick={event=>{
                  if(event.nativeEvent?.isTrusted===true)
                    model.onTrial?.(row.deliveryId,paramsText,event.nativeEvent);
                }}>在当前授权网页单次试运行</button>
            </div>
            <p className="hint">本次执行使用原有 Controller Worker；只允许清单指定的网站。试运行不自动安装，也不授予云控长期权限。</p>
          </section>}
        </li>;
      })}
    </ul>}
    {trial&&<section className="cloud-program-trial-result od-disclosure"
      aria-label="本机一次性试运行记录">
      <strong>最近试运行 · {trial.title} v{trial.version}</strong>
      <p role="status">{trial.message||'执行状态待核对'}</p>
      <p className="hint">Run：{trial.runId||'尚未创建'} · 状态：{trial.state}</p>
      <p className="cloud-program-hash">SHA-256 {trial.sourceHash}</p>
      <div className="cloud-program-actions">
        <button type="button" className="od-button od-button--secondary"
          disabled={!trial.canStop}
          onClick={event=>trusted(event,model.onStopTrial)}>停止本次 Run</button>
        <button type="button" className="od-button od-button--secondary"
          disabled={!trial.runId}
          onClick={event=>trusted(event,model.onOpenTrial)}>
          查看原始 Run / Result
        </button>
        <button type="button" className="od-button od-button--secondary"
          disabled={!trial.canVerify}
          onClick={event=>trusted(event,model.onVerifyTrial)}>
          验证页面回执并发布本地版本
        </button>
        <button type="button" className="od-button"
          disabled={!trial.canInstall}
          onClick={event=>{
            if(event.nativeEvent?.isTrusted===true)
              model.onInstallTrial?.(event.nativeEvent);
          }}>
          正式安装此版本
        </button>
      </div>
      {!trial.imported&&<p className="hint">先在上方点击「接收为待验证任务」，再验证本次 Run。</p>}
      {trial.installed&&<p className="hint">安装后若希望服务器调用，须另外批准此精确 Task 安装版本。</p>}
    </section>}
  </section>;
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
        <summary>查看原始请求 / Job / Run 身份</summary>
        <div className="hint">云请求</div><pre id="cloud-request-detail-request-id">{detail?.requestId||''}</pre>
        <div className="hint">Provider Job</div><pre id="cloud-request-detail-job-id">{detail?.jobId||''}</pre>
        <div className="hint">本地 Run</div><pre id="cloud-request-detail-run-id">{detail?.runId||''}</pre>
        <div className="hint">本地 Result（编号不代表已保存）</div><pre id="cloud-request-detail-result-id">{detail?.resultId||''}</pre>
      </details>
      <button id="cloud-request-stop-this" type="button"
        className="od-button od-button--secondary" disabled={!detail?.canStopThis}
        onClick={event=>trusted(event,model.onStopThis)}>
        只停止本次云请求
      </button>
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
