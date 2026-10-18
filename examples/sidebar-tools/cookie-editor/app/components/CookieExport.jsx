import * as React from 'react';
import {Button} from '@opendesk/ui';
import {CookieExportFormatRow,CookieExportActions} from './CookieEditorView.jsx';

// Identical export choices to the approved React preview. Only the existing
// Controller/SDK may read values or write clipboard/download bytes.
export default function CookieExport({controller,disabled=false,onClose}){
  const [format,setFormat]=React.useState('json');
  const [includeValues,setIncludeValues]=React.useState(true);
  const [confirmation,setConfirmation]=React.useState(null);
  const [working,setWorking]=React.useState(false);
  const cancelRef=React.useRef(null);
  const metadata=format==='json'&&!includeValues;
  const rows=controller.snapshot().rows;
  const partitioned=rows.some(row=>Boolean(row.partitionKey));
  const lossy=partitioned&&format!=='json';
  const busy=disabled||working;
  React.useEffect(()=>{if(confirmation)cancelRef.current?.focus();},[confirmation]);
  const deliver=async method=>{
    setConfirmation(null);
    setWorking(true);
    try{
      // A false/unknown result must never become a success toast or automatic retry.
      await controller.exportTo({format,metadata,method});
    }finally{setWorking(false);}
  };
  const choose=method=>{
    if(busy||lossy)return;
    if(metadata){void deliver(method);return;}
    // A default checked "include values" is only a preference; it never grants
    // cookie.values permission or waives explicit exfiltration confirmation.
    setConfirmation(method);
  };
  return <section className="cookie-panel cookie-export-panel od-surface od-surface--padded"
    aria-label="导出 Cookie">
    <div className="cookie-panel-heading">
      <h3>导出 Cookie</h3>
      <Button type="button" className="od-button--quiet" disabled={busy}
        onClick={onClose} aria-label="关闭导出">关闭</Button>
    </div>
    <CookieExportFormatRow format={format} includeValues={includeValues} disabled={busy}
      onFormat={next=>{setFormat(next);setConfirmation(null);}}
      onIncludeValues={next=>{setIncludeValues(next);setConfirmation(null);}}/>
    <p className="cookie-message" role="note">{metadata
      ?'仅导出元数据，不能用来恢复 Cookie。'
      :format==='json'
        ?'JSON 备份可保留 Store 和 Partition；读取敏感值需独立授权。'
        :'此格式无法无损保留全部身份与属性；请优先使用 JSON 备份。'}</p>
    {lossy&&<p className="cookie-message od-alert od-alert--warning" role="alert">
      本站含分区 Cookie。此格式无法无损保存 Partition，已禁止导出；请选择 JSON。
    </p>}
    {confirmation&&<div className="cookie-export-confirm od-alert od-alert--warning"
      role="group" aria-label="确认导出敏感 Cookie">
      <p>导出内容可能包含登录凭据。确认{confirmation==='copy'?'复制到剪贴板':'下载到本机'}？
        授权仍由 OpenDesk Host 单独核验。</p>
      <div className="cookie-editor-actions">
        <Button ref={cancelRef} type="button" onClick={()=>setConfirmation(null)}>取消</Button>
        <Button type="button" variant="primary" disabled={busy}
          onClick={()=>void deliver(confirmation)}>确认导出</Button>
      </div>
    </div>}
    <CookieExportActions disabled={busy||lossy} onCopy={()=>choose('copy')}
      onDownload={()=>choose('download')}/>
  </section>;
}
