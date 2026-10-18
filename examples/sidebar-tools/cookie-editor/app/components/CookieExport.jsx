import * as React from 'react';
import {Button} from '@opendesk/ui';
export default function CookieExport({controller,disabled=false,onClose}){
  const [format,setFormat]=React.useState('json');
  const [metadata,setMetadata]=React.useState(true);
  const [working,setWorking]=React.useState(false);
  const exportNow=async method=>{
    setWorking(true);
    try{await controller.exportTo({format:metadata?'json':format,metadata,method});}
    finally{setWorking(false);}
  };
  return <section className="cookie-panel od-surface od-surface--padded" aria-label="导出 Cookie">
    <h3>导出 Cookie</h3>
    <label><input type="checkbox" checked={metadata}
      disabled={disabled||working} onChange={e=>setMetadata(e.target.checked)}/>
      仅导出元数据（不包含 Cookie Value）</label>
    {!metadata&&<p className="cookie-message od-alert od-alert--warning" role="note">
      导出敏感值需额外授权，内容可能包含登录凭据。下载或复制后请自行安全保管。</p>}
    <label>格式 <select className="od-field" disabled={disabled||working||metadata} value={format}
      onChange={e=>setFormat(e.target.value)}>
      <option value="json">JSON</option>
      <option value="header">Cookie Header</option>
      <option value="netscape">Netscape</option>
    </select></label>
    <div className="cookie-editor-actions">
      <Button type="button" disabled={working} onClick={onClose}>关闭</Button>
      <span className="cookie-spacer"/>
      <Button type="button" disabled={disabled||working}
        onClick={()=>void exportNow('copy')}>复制</Button>
      <Button type="button" variant="primary" disabled={disabled||working}
        onClick={()=>void exportNow('download')}>保存文件</Button>
    </div>
  </section>;
}
