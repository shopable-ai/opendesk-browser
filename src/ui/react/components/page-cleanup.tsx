import * as React from 'react';
import {extensionCenterText} from '../../extension-center-localization.js';

// Debug-only view of the Page Authority's read-back. No tab or program mutations.
export function PageCleanupDiagnostics({model,locale='zh-CN'}){
  if(!model)return null;
  const t=(key,params={})=>extensionCenterText(locale,key,params);
  const {groups,known,checking,onRefresh}=model;
  const status=checking?'oldPagesChecking':known
    ?(groups.length?'oldPagesProgramCount':'oldPagesEmpty')
    :(groups.length?'oldPagesStale':'oldPagesUnavailable');
  return <details id="debug-page-cleanup" className="debug-detail od-disclosure">
    <summary>{t('oldPagesDebugTitle')}</summary>
    <div className="ec-page-cleanup-content">
      <p>{t('oldPagesDebugGuide')}</p>
      <div className="ec-page-cleanup-status">
        <p role="status">{t(status,{count:groups.length})}</p>
        <button type="button" className="od-button od-button--secondary" aria-disabled={checking||undefined}
          onClick={()=>{if(!checking)void onRefresh();}}>{t('oldPagesRecheck')}</button>
      </div>
      {groups.map(({id,title,cleanup})=><section key={id} className="ec-page-cleanup-group">
        <h3>{title}</h3>
        {title!==id&&<p className="ec-page-cleanup-meta"><code>{id}</code></p>}
        {cleanup.documents.length===0?<p>{t('oldPagesUnlocated')}</p>:
          <ul aria-label={t('oldPagesAffected')}>
            {cleanup.documents.map((row,index)=><li key={row.key}>
              <span>{row.tabTitle||t('oldPageNumber',{number:index+1})}</span>
              <p className="ec-page-cleanup-meta">
                {t(row.state==='cached'?'oldPageCached':row.state==='active'?'oldPagePresent':'oldPageUnobservable')}
                {' · '}{t('oldPageTab',{id:row.tabId})}{row.documentId&&<> · <code>{row.documentId}</code></>}
              </p>
            </li>)}
          </ul>}
        <ul aria-label={t('oldPagesTechnical')}>{cleanup.records.map((row,index)=><li key={index}>
          {t('oldPageRecord',{revision:row.revision??t('unknown'),state:row.state,
            records:row.records??t('unknown'),pending:row.pendingRecords??t('unknown')})}
          {row.error&&<p>{[row.error.code,row.error.message].filter(Boolean).join(' · ')}</p>}
        </li>)}</ul>
      </section>)}
    </div>
  </details>;
}
