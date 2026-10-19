import * as React from 'react';

export interface BrowserHistoryModel {
  text: string;
  startDate: string;
  endDate: string;
  limit: string;
  busy: boolean;
  status: string;
  permission: 'unknown' | 'granted' | 'missing';
  visits: readonly {url: string; title?: string; lastVisitTime?: number}[] | null;
}

export interface BrowserHistoryActions {
  change(field: 'text' | 'startDate' | 'endDate' | 'limit', value: string): void;
  search(event: Event): void | Promise<void>;
}

export function BrowserHistory({model, actions}: {
  model: BrowserHistoryModel | null;
  actions: BrowserHistoryActions | null;
}) {
  if (!model) return null;
  return <details id="trusted-history-panel" className="od-disclosure od-disclosure--flat"
    data-trusted-history-workbench="mounted" data-history-permission={model.permission}>
    <summary>历史记录查询</summary>
    <div className="od-stack">
      {([
        ['text', 'text', '搜索文本', 'search'],
        ['startDate', 'start', '开始日期', 'date'],
        ['endDate', 'end', '结束日期', 'date'],
        ['limit', 'limit', '结果数量', 'number']
      ] as const).map(([field, id, label, type]) => <label className="od-form-field" key={field}>
        <span className="od-field-label">{label}</span>
        <input id={'trusted-history-' + id} className="od-field" type={type}
          min={field === 'limit' ? 1 : undefined} max={field === 'limit' ? 100 : undefined}
          value={model[field]} readOnly={!actions}
          onInput={event => actions?.change(field, event.currentTarget.value)} />
      </label>)}
      <button id="trusted-history-search" className="od-button" type="button"
        disabled={model.busy || !actions} onClick={event => {void actions?.search(event.nativeEvent);}}>
        查询历史
      </button>
      <p id="trusted-history-status" className="od-note" role="status">{model.status}</p>
      <div id="trusted-history-results" className="od-stack" aria-live="polite">
        {model.visits && (model.visits.length ? <div className="od-stack trusted-history-results-list">
          {model.visits.map((visit, index) => <article key={index}
            className="od-surface od-surface--padded trusted-history-result">
            <strong>{visit.title || visit.url}</strong>
            <code className="od-technical">{visit.url}</code>
            <small className="od-note">{Number.isFinite(visit.lastVisitTime)
              ? new Date(visit.lastVisitTime!).toLocaleString() : '未知时间'}</small>
          </article>)}
        </div> : <p className="hint">没有匹配的历史记录。</p>)}
      </div>
    </div>
  </details>;
}
