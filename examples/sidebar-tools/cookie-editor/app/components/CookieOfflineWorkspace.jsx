import * as React from 'react';
import {parseTarget,normalizeCookie,redactMetadata,key,inspectImport,
  rejectImportDuplicates,exportText} from '../domain/cookie-model.js';
import CookieInlineEditor from './CookieInlineEditor.jsx';
import {CookieEditorView} from './CookieEditorView.jsx';

// Offline copies are intentionally volatile. Cookie Values live only in a
// private ref until the sandbox unmounts and are never persisted or sent to Host.
export default function CookieOfflineWorkspace({initialTarget,adapter,onDirty=()=>{}}){
  const cookies=React.useRef([]),importPlan=React.useRef(null);
  const importText=React.useRef(null),fileInput=React.useRef(null);
  const [siteInput,setSiteInput]=React.useState(initialTarget?.origin||'');
  const [site,setSite]=React.useState(initialTarget||null);
  const [rows,setRows]=React.useState([]);
  const [selected,setSelected]=React.useState(null);
  const [importing,setImporting]=React.useState(false);
  const [preview,setPreview]=React.useState(null);
  const [format,setFormat]=React.useState('auto');
  const [exportFormat,setExportFormat]=React.useState('json');
  const [confirmClear,setConfirmClear]=React.useState(false);
  const [pendingDelete,setPendingDelete]=React.useState(null);
  const [busy,setBusy]=React.useState(false);
  const [message,setMessage]=React.useState('离线工作区仅在本次打开期间有效；不写入 Chrome，也不持久化。');
  const [dirty,setDirty]=React.useState(false);
  const [discard,setDiscard]=React.useState(null);
  const mark=value=>{setDirty(value);onDirty(value);};
  const guarded=action=>{
    if(dirty){setDiscard({action});return;}
    action();
  };
  const resolveDiscard=accept=>{
    const proposed=discard;setDiscard(null);
    if(accept&&proposed?.action){mark(false);proposed.action();}
  };
  const refreshRows=()=>{
    setRows(redactMetadata(cookies.current).map(row=>({...row,id:key(row)})));
  };
  React.useEffect(()=>()=>{cookies.current.length=0;importPlan.current=null;
    if(importText.current)importText.current.value='';},[]);
  const applySite=()=>{
    try{
      const next=parseTarget(siteInput.trim());
      cookies.current.length=0;importPlan.current=null;setSelected(null);
      setPreview(null);setImporting(false);setSite(next);refreshRows();mark(false);
      setMessage('已切换离线网站范围，旧临时 Cookie 已清除。');
    }catch{setMessage('请输入有效 HTTP(S) 网站地址；不会请求 Chrome 授权。');}
  };
  const save=(value,{originalId=null,valueEdited=true}={})=>{
    if(!site)return;
    try{
      const prior=originalId?cookies.current.find(row=>key(row)===originalId):null;
      if(originalId&&!prior)throw Error('E_COOKIE_CONFLICT');
      const normalized=normalizeCookie({...value,
        value:!valueEdited&&prior?prior.value:value.value},site.hostname);
      if(prior)cookies.current=cookies.current.filter(row=>key(row)!==originalId);
      const id=key(normalized);
      cookies.current=cookies.current.filter(row=>key(row)!==id);
      cookies.current.push(normalized);
      refreshRows();setSelected(null);mark(false);
      setMessage('仅保存到离线内存，没有修改浏览器 Cookie。');
    }catch{setMessage('离线 Cookie 校验失败：检查 Domain、Path、过期时间、SameSite 和名称。');}
  };
  const inspect=()=>{
    if(!site){setMessage('请先选择离线网站范围。');return;}
    try{
      const result=inspectImport(importText.current?.value||'',format,site.hostname);
      rejectImportDuplicates(result.records);
      importPlan.current=result;
      const accepted=result.records.filter(x=>x.status==='ready').length;
      setPreview({total:result.records.length,accepted,
        skipped:result.records.length-accepted});
      setMessage('预检仅在内存中运行，尚未覆盖离线条目。');
    }catch{importPlan.current=null;setPreview(null);setMessage('导入解析失败或超出 8 MiB 限制。');}
  };
  const applyImport=()=>{
    if(!importPlan.current||!preview?.accepted)return;
    for(const item of importPlan.current.records){
      if(item.status!=='ready')continue;
      const id=key(item.cookie);
      cookies.current=cookies.current.filter(x=>key(x)!==id);
      cookies.current.push(item.cookie);
    }
    importPlan.current=null;setPreview(null);setImporting(false);
    if(importText.current)importText.current.value='';
    refreshRows();mark(false);setMessage('Cookie 仅导入了离线工作区；Chrome 未改变。');
  };
  const exportNow=async method=>{
    if(!cookies.current.length)return;
    setBusy(true);
    try{
      const text=exportText(exportFormat,cookies.current);
      if(new Blob([text]).size>150000)throw Error('E_LIMIT');
      if(method==='copy')await adapter.copy(text);
      else await adapter.download(text,(site?.hostname||'offline')+'-offline-cookies.'+
        (exportFormat==='json'?'json':'txt'));
      setMessage('已输出离线 Cookie 文件／文本，其中可能包含登录凭据。');
    }catch{setMessage('导出失败：检查格式兼容性、数据大小或文件／剪贴板授权。');}
    finally{setBusy(false);}
  };
  return <main className="cookie-offline" aria-label="离线 Cookie 工作区">
    <div className="cookie-offline-banner" role="note">
      <strong>离线工作区</strong><p>仅在当前工具的临时内存中编辑，不代表 Chrome 实时 Cookie。</p>
    </div>
    <div className="cookie-offline-site">
      <label>模拟目标网站范围（不会连接网站）
        <input type="url" value={siteInput} onChange={e=>setSiteInput(e.target.value)}
          placeholder="https://example.com" disabled={busy||dirty}/></label>
      <button type="button" disabled={busy||dirty} onClick={applySite}>应用范围</button>
    </div>
    {site&&<CookieEditorView site={site.hostname} rows={rows} busy={busy}
      selected={selected} onSelect={id=>guarded(()=>setSelected(id))}
      onNew={()=>guarded(()=>setSelected('new'))}
      onImport={()=>guarded(()=>setImporting(x=>!x))}
      onExport={()=>void exportNow('download')}
      onClear={()=>setConfirmClear(true)}
      editor={row=><CookieInlineEditor key={row.id} row={row} target={site}
        disabled={busy} onDirty={mark} onSave={save}
        onCancel={()=>guarded(()=>setSelected(null))}
        onDelete={id=>setPendingDelete(id)}/>}/>}
    {site&&selected==='new'&&<CookieInlineEditor key="new" target={site} disabled={busy}
      onSave={save} onDirty={mark} onCancel={()=>guarded(()=>setSelected(null))}/>}
    {importing&&<section className="cookie-panel" aria-label="离线导入">
      <h3>导入到离线工作区</h3>
      <label>格式 <select value={format} onChange={e=>{setFormat(e.target.value);
        importPlan.current=null;setPreview(null);}}>
        <option value="auto">自动识别</option><option value="json">JSON</option>
        <option value="header">Cookie Header</option><option value="netscape">Netscape</option>
      </select></label>
      <label>选择文件 <input ref={fileInput} type="file" accept=".txt,.json,.cookies"
        onChange={async e=>{const f=e.target.files?.[0];if(!f)return;
          if(f.size>8*1024*1024){setMessage('文件大于 8 MiB');return;}
          const text=await f.text();if(importText.current)importText.current.value=text;
          mark(true);importPlan.current=null;setPreview(null);}}/></label>
      <label>文本 <textarea ref={importText} data-cookie-secret-input="true"
        rows={5} autoComplete="off"
        onInput={()=>{mark(true);importPlan.current=null;setPreview(null);}}/></label>
      {preview&&<p role="status">总计 {preview.total}，可导入 {preview.accepted}，跳过 {preview.skipped}</p>}
      <div className="cookie-editor-actions">
        <button type="button" onClick={()=>guarded(()=>{
          setImporting(false);importPlan.current=null;
        })}>取消</button>
        <button type="button" onClick={inspect}>预检</button>
        <button type="button" disabled={!preview?.accepted} onClick={applyImport}>导入内存</button>
      </div>
    </section>}
    {rows.length>0&&<div className="cookie-editor-actions">
      <label>导出格式 <select value={exportFormat} onChange={e=>setExportFormat(e.target.value)}>
        <option value="json">JSON</option><option value="header">Cookie Header</option>
        <option value="netscape">Netscape</option>
      </select></label>
      <button type="button" disabled={busy} onClick={()=>void exportNow('copy')}>复制离线数据</button>
      <button type="button" disabled={busy} onClick={()=>void exportNow('download')}>保存离线文件</button>
    </div>}
    {discard&&<div className="cookie-confirm" role="alertdialog" aria-modal="true"
      aria-label="未保存的离线编辑">
      <p>当前离线 Cookie 或导入内容尚未保存。要放弃这些修改吗？</p>
      <button type="button" onClick={()=>resolveDiscard(false)}>继续编辑</button>
      <button type="button" className="danger"
        onClick={()=>resolveDiscard(true)}>放弃修改</button>
    </div>}
    {pendingDelete&&<div className="cookie-confirm" role="alertdialog" aria-modal="true"
      aria-label="删除离线 Cookie"><p>只删除离线内存中的这条 Cookie，不影响 Chrome。确定吗？</p>
      <button type="button" onClick={()=>setPendingDelete(null)}>取消</button>
      <button type="button" className="danger" onClick={()=>{
        cookies.current=cookies.current.filter(x=>key(x)!==pendingDelete);
        setPendingDelete(null);refreshRows();setSelected(null);mark(false);
        setMessage('已删除离线 Cookie，Chrome 未更改。');
      }}>删除</button></div>}
    {confirmClear&&<div className="cookie-confirm" role="alertdialog" aria-modal="true"
      aria-label="清空离线工作区"><p>只清空当前临时内存，不影响 Chrome。确定吗？</p>
      <button type="button" onClick={()=>setConfirmClear(false)}>取消</button>
      <button type="button" className="danger" onClick={()=>{
        cookies.current.length=0;refreshRows();setSelected(null);
        setConfirmClear(false);mark(false);setMessage('离线内存已清空。');
      }}>清空离线 Cookie</button></div>}
    {message&&<p className="cookie-message" role="status">{message}</p>}
  </main>;
}
