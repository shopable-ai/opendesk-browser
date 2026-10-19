import * as React from 'react';
import {DEBUG_INITIAL_STATE} from '../../debug-workbench.js';

// Trusted diagnostics are always rendered as escaped text.
export function DebugDiagnosticText({value=''}) {
  return <>{String(value??'')}</>;
}

// The single app root owns the development gate, model subscription and actions.
export function DebugPage({model={},actions=null,hidden=false,development=null}) {
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
      <header className="debug-heading od-toolbar">
        <div><strong className="od-page-title">调试</strong>
          <p className="hint">读取当前 RunHost 的云控状态，不导入第二份任务。</p></div>
        <div className="debug-actions">
          <button type="button" id="debug-refresh" className="od-button od-button--secondary"
            disabled={unavailable||state.refreshing||typeof actions?.refresh!=='function'}
            onClick={()=>{void actions?.refresh();}}>刷新</button>
          <button type="button" id="debug-copy" className="od-button od-button--secondary"
            disabled={unavailable||state.refreshing||state.copying||typeof actions?.copy!=='function'}
            onClick={()=>{void actions?.copy();}}>复制脱敏摘要</button>
        </div>
      </header>
      <p id="debug-cloud-summary" className="debug-summary" role="status">
        <DebugDiagnosticText value={state.summary}/>
      </p>
      <div className="debug-metrics od-surface" aria-label="运行环境状态">
        {metrics.map(([key,label,value])=><div key={key}><span>{label}</span>
          <strong id={'debug-'+key}><DebugDiagnosticText value={value}/></strong></div>)}
      </div>
      <p id="debug-feedback" className="hint" role="status" aria-live="polite">
        <DebugDiagnosticText value={state.feedback}/>
      </p>
      {development&&<details className="debug-detail od-surface"><summary>本地开发服务</summary>
        <output id="opendesk-development-status" className="hint" title={development.title}>{development.text}</output>
      </details>}
      <details className="debug-detail od-disclosure"><summary>脱敏诊断快照</summary>
        <pre id="debug-snapshot" aria-label="诊断快照"><DebugDiagnosticText value={state.snapshot}/></pre>
      </details>
    </section>
  </div>;
}
