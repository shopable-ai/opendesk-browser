import * as React from 'react';
import {extensionCenterText} from '../../extension-center-localization.js';

export function PageCleanupDetails({cleanup,locale='zh-CN'}){
  const t=(key,params={})=>extensionCenterText(locale,key,params);
  if(!cleanup)return null;
  return <details className="od-disclosure ec-page-cleanup">
    <summary>{t(cleanup.documents.length>0?'oldPagesPending':'oldPagesHistory')}</summary>
    <div className="ec-page-cleanup-content">
      <p>{t(cleanup.documents.length>0?'oldPagesGuide':'oldPagesUnlocated')}</p>
      {cleanup.documents.length>0?<ul className="ec-page-cleanup-documents">
        {cleanup.documents.map((row,index)=><li key={row.key}>
          <span>{t('oldPageNumber',{number:index+1})}{row.tabTitle?' · '+row.tabTitle:''}</span>
          <span className="ec-page-cleanup-meta">{t(row.state==='cached'?'oldPageCached':
            row.state==='unobservable'?'oldPageUnobservable':'oldPagePresent')}</span>
        </li>)}
      </ul>:null}
      <p className="ec-page-cleanup-meta">{t('oldPagesIndependent')}</p>
      <details className="od-disclosure od-disclosure--flat">
        <summary>{t('oldPagesTechnical')}</summary>
        <ul>{cleanup.records.map((row,index)=><li key={index}>
          {t('oldPageRecord',{revision:row.revision??t('unknown'),state:row.state,
            records:row.records??t('unknown'),pending:row.pendingRecords??t('unknown')})}
        </li>)}</ul>
        {cleanup.documents.length>0&&<ul>{cleanup.documents.map(row=><li key={row.key}>
          {t('oldPageTab',{id:row.tabId})}{row.documentId?' · '+row.documentId:''}
        </li>)}</ul>}
      </details>
    </div>
  </details>;
}
