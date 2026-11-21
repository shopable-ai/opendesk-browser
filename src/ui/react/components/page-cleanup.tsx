import * as React from 'react';
import {extensionCenterText} from '../../extension-center-localization.js';

export function PageCleanupDetails({cleanup,locale='zh-CN',showDocuments=false}){
  const statusId=React.useId();
  const t=(key,params={})=>extensionCenterText(locale,key,params);
  if(!cleanup)return null;
  const hasDocuments=cleanup.documents.length>0;
  const content=<div className="ec-page-cleanup-content">
    {hasDocuments&&<ul className="ec-page-cleanup-documents">
      {cleanup.documents.map((row,index)=><li key={row.key}>
        <span>{t('oldPageNumber',{number:index+1})}{row.tabTitle?' · '+row.tabTitle:''}</span>
        <span className="ec-page-cleanup-meta">{t(row.state==='cached'?'oldPageCached':
          row.state==='unobservable'?'oldPageUnobservable':'oldPagePresent')}</span>
      </li>)}
    </ul>}
    {!showDocuments&&<p className="ec-page-cleanup-meta">{t('oldPagesIndependent')}</p>}
    <details className="od-disclosure od-disclosure--flat">
      <summary>{t('oldPagesTechnical')}</summary>
      <ul>{cleanup.records.map((row,index)=><li key={index}>
        {t('oldPageRecord',{revision:row.revision??t('unknown'),state:row.state,
          records:row.records??t('unknown'),pending:row.pendingRecords??t('unknown')})}
        {row.error&&<p>{[row.error.code,row.error.message].filter(Boolean).join(' · ')}</p>}
      </li>)}</ul>
      {hasDocuments&&<ul>{cleanup.documents.map(row=><li key={row.key}>
        {t('oldPageTab',{id:row.tabId})}{row.documentId?' · '+row.documentId:''}
      </li>)}</ul>}
    </details>
  </div>;
  return <section className="ec-page-cleanup ec-page-cleanup-content" aria-labelledby={statusId}>
    <p id={statusId}>{showDocuments?t('oldPagesRecoveryOnly'):<strong>{t('oldPagesUnconfirmed')}</strong>}</p>
    <p>{t(showDocuments?(hasDocuments?'oldPagesRecoveryGuide':'oldPagesRecoveryUnlocated'):
      (hasDocuments?'oldPagesGuide':'oldPagesUnlocated'))}</p>
    {showDocuments?content:<details className="od-disclosure">
      <summary>{t(hasDocuments?'oldPagesPending':'oldPagesHistory')}</summary>
      {content}
    </details>}
  </section>;
}
