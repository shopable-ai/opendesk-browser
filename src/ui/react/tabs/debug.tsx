import * as React from 'react';
import {DEBUG_INITIAL_STATE} from '../../debug-workbench.js';
import {BrowserHistory} from './browser-history.tsx';
import {PageCleanupDiagnostics} from '../components/page-cleanup.tsx';

// Trusted diagnostics are always rendered as escaped text.
export function DebugDiagnosticText({value=''}) {
  return <>{String(value??'')}</>;
}

// The single app root owns the development gate, model subscription and actions.
export function DebugPage({model={},actions=null,hidden=false,development=null,locale='zh-CN',
  browserHistoryModel=null,browserHistoryActions=null}) {
  const state={...DEBUG_INITIAL_STATE,...model};
  const unavailable=state.disposed;
  const metrics=[
    ['pairing','配对',state.pairing],['connection','WSS 连接',state.connection],
    ['reconcile','持久对账',state.reconcile],['slot','执行槽',state.slot],
    ['task-count','批准任务',state.taskCount],['request-count','云请求',state.requestCount]
  ];
  return <div id="workbench-debug" role="tabpanel" aria-labelledby="tab-debug"
    className="od-page" data-workbench-page="debug" hidden={hidden}
    aria-busy={state.refreshing||state.copying}>
    <section className="debug-workbench" aria-label="Cloud Control 开发诊断">
      <header className="debug-heading od-page-head">
        <strong className="od-page-title">调试</strong>
        <div className="od-page-actions">
          <button type="button" id="debug-refresh" className="od-icon-button"
            title="刷新调试状态" aria-label="刷新调试状态"
            disabled={unavailable||state.refreshing||typeof actions?.refresh!=='function'}
            onClick={()=>{void actions?.refresh();}}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14-5L4 8m0-5v5h5M4 13a8 8 0 0 0 14 5l2-2m0 5v-5h-5"/></svg>
          </button>
          <button type="button" id="debug-copy" className="od-icon-button"
            title="复制脱敏摘要" aria-label="复制脱敏摘要"
            disabled={unavailable||state.refreshing||state.copying||typeof actions?.copy!=='function'}
            onClick={()=>{void actions?.copy();}}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></svg>
          </button>
        </div>
      </header>
      <p className="hint debug-note">读取当前 RunHost 的云控状态，不导入第二份任务。</p>
      <section className="debug-status od-surface od-surface--padded" aria-label="运行环境状态">
        <p id="debug-cloud-summary" className="debug-summary" role="status">
          <DebugDiagnosticText value={state.summary}/>
        </p>
        <div className="debug-metrics">
          {metrics.map(([key,label,value])=><div key={key}><span>{label}</span>
            <strong id={'debug-'+key}><DebugDiagnosticText value={value}/></strong></div>)}
        </div>
        <p id="debug-feedback" className="hint debug-note" role="status" aria-live="polite">
          <DebugDiagnosticText value={state.feedback}/>
        </p>
      </section>
      {development&&<details className="debug-detail od-disclosure"><summary>本地开发服务</summary>
        <output id="opendesk-development-status" className="hint" title={development.title}>{development.text}</output>
        {development.openAcceptance&&<button type="button" className="od-button od-button--secondary"
          disabled={development.acceptanceBusy} onClick={event=>void development.openAcceptance(event.nativeEvent)}>
          {development.acceptanceBusy?'正在核对离线验收身份…':'打开离线任务验收'}
        </button>}
        {development.acceptanceError&&<p role="alert">{development.acceptanceError}</p>}
        {development.detailMemory&&<>
          <p className="hint">详情记忆只读观察：时间为后台收到存储变化或完成读回的时间；观察会随后台重载清空，不代表保存动作的触发时机。</p>
          <pre aria-label="详情记忆只读观察">{JSON.stringify(development.detailMemory,null,2)}</pre>
        </>}
      </details>}
      <PageCleanupDiagnostics model={state.pageCleanup} locale={locale}/>
      <details className="debug-detail od-disclosure"><summary>脱敏诊断快照</summary>
        <pre id="debug-snapshot" className="od-result" aria-label="诊断快照"><DebugDiagnosticText value={state.snapshot}/></pre>
      </details>
      {browserHistoryModel&&<section id="sidebar-host-browser-tools" aria-label="可信浏览器工具">
        <BrowserHistory model={browserHistoryModel} actions={browserHistoryActions}/>
      </section>}
    </section>
  </div>;
}
