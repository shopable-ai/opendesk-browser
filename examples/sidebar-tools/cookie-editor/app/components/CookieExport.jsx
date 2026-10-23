import * as React from 'react';
import {CookieExportFormatRow,CookieExportActions,CookieIconButton} from './CookieEditorView.jsx';

// Compact, non-modal export popover used by both official React and the preview.
// Credential reads and clipboard/download effects remain Controller -> SDK -> Host.
export default function CookieExport({controller,disabled=false,onClose,onDelivered}){
  const titleId=React.useId();
  const panelId=React.useId();
  const root=React.useRef(null);
  const [message,setMessage]=React.useState('');
  const [format,setFormat]=React.useState('json');
  const [includeValues,setIncludeValues]=React.useState(true);
  const [working,setWorking]=React.useState(false);
  const metadata=format==='json'&&!includeValues;
  const rows=controller.snapshot().rows;
  const partitioned=rows.some(row=>Boolean(row.partitionKey));
  const lossy=partitioned&&format==='header';
  const busy=disabled||working;
  React.useEffect(()=>{
    root.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus({preventScroll:true});
  },[]);
  const deliver=async method=>{
    if(busy||lossy)return;
    setWorking(true);
    setMessage('');
    try{
      // A false/unknown Host receipt is never success and is never replayed.
      const success=await controller.exportTo({format,metadata,method});
      if(success)onDelivered?.(method);
      else setMessage(controller.snapshot().message||'导出失败，请检查授权或格式');
    }catch{
      setMessage('导出未完成，请检查授权后手动重试。');
    }finally{setWorking(false);}
  };
  return <section ref={root} className="cookie-export-panel" role="dialog"
    aria-modal="false" aria-labelledby={titleId}>
    <div className="cookie-panel-heading">
      <h3 id={titleId}>导出 Cookie</h3>
      <CookieIconButton name="close" label="关闭导出" disabled={busy} onClick={onClose}/>
    </div>
    <CookieExportFormatRow format={format} includeValues={includeValues} disabled={busy}
      panelId={panelId} onFormat={next=>{setFormat(next);setMessage('');}}
      onIncludeValues={value=>{setIncludeValues(value);setMessage('');}}/>
    <div id={panelId} role="tabpanel" tabIndex={0} className="cookie-export-content"
      aria-label="导出操作">
      {lossy&&<p className="cookie-message od-alert od-alert--warning" role="alert">
        当前网站存在分区 Cookie，Cookie Header 无法完整导出。请选择 JSON。
      </p>}
      <CookieExportActions disabled={busy||lossy}
        onCopy={()=>void deliver('copy')} onDownload={()=>void deliver('download')}/>
      {message&&<p role="alert" className="cookie-message od-alert od-alert--error">{message}</p>}
    </div>
  </section>;
}
