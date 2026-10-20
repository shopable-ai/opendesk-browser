import * as React from 'react';
import {Button} from '@opendesk/ui';
import {CookieExportFormatRow,CookieExportActions} from './CookieEditorView.jsx';

// Identical export choices to the approved React preview. Only the existing
// Controller/SDK may read values or write clipboard/download bytes.
export default function CookieExport({controller,disabled=false,onClose,onDelivered}){
  const titleId=React.useId();
  const [message,setMessage]=React.useState('');
  const [format,setFormat]=React.useState('json');
  const [includeValues,setIncludeValues]=React.useState(true);
  const [working,setWorking]=React.useState(false);
  const metadata=format==='json'&&!includeValues;
  const rows=controller.snapshot().rows;
  const partitioned=rows.some(row=>Boolean(row.partitionKey));
  const lossy=partitioned&&format!=='json';
  const busy=disabled||working;
  const deliver=async method=>{
    setWorking(true);
    try{
      // A false/unknown result must never become a success toast or automatic retry.
      const success=await controller.exportTo({format,metadata,method});
      if(success)onDelivered?.(method);
      else setMessage(controller.snapshot().message||'导出失败，请检查授权或格式');
    }finally{setWorking(false);}
  };
  const choose=method=>{
    if(busy||lossy)return;
    // A user click is the only export trigger. Host independently checks the
    // Cookie Value and clipboard/download grants; React adds no second dialog.
    void deliver(method);
  };
  return <section className="cookie-export-workspace" role="region" aria-labelledby={titleId}
    onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.stopPropagation();onClose?.();}}}>
    <section className="cookie-panel cookie-export-panel od-surface--padded">
    <div className="cookie-panel-heading">
      <h3 id={titleId}>导出 Cookie</h3>
      <Button type="button" autoFocus className="od-button--quiet" disabled={busy}
        onClick={onClose} aria-label="关闭导出">关闭</Button>
    </div>
    <CookieExportFormatRow format={format} includeValues={includeValues} disabled={busy}
      onFormat={setFormat} onIncludeValues={setIncludeValues}/>
    <p className="cookie-message" role="note">{metadata
      ?'仅导出元数据，不能用来恢复 Cookie。'
      :format==='json'
        ?'JSON 备份可保留 Cookie 值、Store 和 Partition。'
        :'此格式无法无损保留全部身份与属性；请优先使用 JSON 备份。'}</p>
    {lossy&&<p className="cookie-message od-alert od-alert--warning" role="alert">
      本站含分区 Cookie。此格式无法无损保存 Partition，已禁止导出；请选择 JSON。
    </p>}
    <CookieExportActions disabled={busy||lossy} onCopy={()=>choose('copy')}
      onDownload={()=>choose('download')}/>
    {message&&<p role="alert" className="cookie-message od-alert od-alert--error">{message}</p>}
  </section>
  </section>;
}
