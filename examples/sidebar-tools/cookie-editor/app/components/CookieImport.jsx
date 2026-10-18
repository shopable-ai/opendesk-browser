import * as React from 'react';
import {Button} from '@opendesk/ui';
import {CookieImportDropzone,CookieFormField} from './CookieEditorView.jsx';

const MAX_FILE=8*1024*1024;

// One explicit submit. The preflight runs in place against the real Controller
// after source/format edits; no Preview parser or mock transport is installed.
export default function CookieImport({controller,disabled=false,onClose,onDirty}){
  const sourceRef=React.useRef(null),fileRef=React.useRef(null);
  const active=React.useRef(false),revision=React.useRef(0);
  const stamp=()=>{const s=controller.snapshot();return {epoch:s.epoch,url:s.target?.url};};
  const isCurrent=(seq,at)=>{
    if(!active.current||revision.current!==seq)return false;
    const now=controller.snapshot();
    return now.epoch===at.epoch&&now.target?.url===at.url;
  };
  const [format,setFormat]=React.useState('auto');
  const [plan,setPlan]=React.useState(null);
  const [sourceRevision,setSourceRevision]=React.useState(0);
  const [dragging,setDragging]=React.useState(false);
  const [fileName,setFileName]=React.useState('');
  const [overwrite,setOverwrite]=React.useState(false);
  const [checking,setChecking]=React.useState(false);
  const [reading,setReading]=React.useState(false);
  const [message,setMessage]=React.useState('');
  React.useEffect(()=>{
    active.current=true;
    return ()=>{
      active.current=false;revision.current++;
      controller.discardImport();
      if(sourceRef.current)sourceRef.current.value='';
    };
  },[controller]);
  const invalidate=()=>{
    revision.current++;
    controller.discardImport();
    setPlan(null);setOverwrite(false);setMessage('');
  };
  const edited=()=>{
    invalidate();setFileName('');
    onDirty?.(Boolean(sourceRef.current?.value));
    setSourceRevision(x=>x+1);
  };
  // DOM ref holds the raw credentials. State only carries a numeric generation.
  React.useEffect(()=>{
    if(!sourceRef.current?.value.trim()){setChecking(false);return;}
    const timer=setTimeout(async()=>{
      const seq=++revision.current,at=stamp();
      setChecking(true);setMessage('');
      try{
        const result=await controller.previewImport(sourceRef.current?.value||'',format,overwrite);
        if(!isCurrent(seq,at))return;
        setPlan(result);
        if(!result)setMessage('预检未通过：请修正内容、授权或网站范围。');
      }catch{
        if(isCurrent(seq,at))setMessage('预检失败：请核对格式及网站授权。');
      }finally{
        if(isCurrent(seq,at))setChecking(false);
      }
    },260);
    return ()=>clearTimeout(timer);
  },[controller,format,overwrite,sourceRevision]);
  const readFile=async file=>{
    if(!file)return;
    invalidate();
    const seq=revision.current,at=stamp();
    if(file.size>MAX_FILE){
      setMessage('文件超过 8 MiB 限制，请分批导入。');
      if(fileRef.current)fileRef.current.value='';
      return;
    }
    setReading(true);
    try{
      const text=await file.text();
      if(!isCurrent(seq,at))return;
      if(sourceRef.current){sourceRef.current.value=text;onDirty?.(Boolean(text));}
      setFileName(file.name||'Cookie 文件');
      setSourceRevision(x=>x+1);
    }catch{
      if(isCurrent(seq,at))setMessage('读取本地文件失败，请粘贴原文重试。');
    }finally{
      if(isCurrent(seq,at)){
        setReading(false);
        if(fileRef.current)fileRef.current.value='';
      }
    }
  };
  const execute=async()=>{
    // Controller compares the raw text and exact target/epoch against the
    // reviewed preflight. Never replay if a Host write outcome is unknown.
    if(!plan?.accepted||checking||reading||disabled)return;
    const seq=++revision.current,at=stamp();
    setReading(true);setMessage('');
    try{
      const ok=await controller.executeImport(sourceRef.current?.value||'',format,overwrite);
      if(!isCurrent(seq,at))return;
      if(ok){
        if(sourceRef.current)sourceRef.current.value='';
        onDirty?.(false);
        onClose({committed:true});
      }else{
        setPlan(null);
        setMessage('导入可能部分生效；请刷新 Chrome 核对，禁止直接重复提交。');
      }
    }finally{
      if(isCurrent(seq,at))setReading(false);
    }
  };
  return <section className="cookie-panel cookie-import-panel od-surface od-surface--padded"
    aria-label="导入 Cookie">
    <div className="cookie-panel-heading"><h3>导入 Cookie</h3>
      <Button type="button" className="od-button--quiet" disabled={disabled||reading}
        onClick={onClose}>关闭</Button></div>
    <input ref={fileRef} type="file" accept=".json,.txt,.cookies,text/plain,application/json"
      hidden disabled={disabled||reading}
      onChange={e=>void readFile(e.target.files?.[0])}/>
    <div className="import-source">
      <CookieImportDropzone dragging={dragging} fileName={fileName}
        disabled={disabled||reading} maxSize="8 MiB"
        onPick={()=>fileRef.current?.click()}
        onDragEnter={e=>{if(disabled||reading)return;e.preventDefault();setDragging(true);}}
        onDragOver={e=>{if(disabled||reading)return;e.preventDefault();setDragging(true);}}
        onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragging(false);}}
        onDrop={e=>{
          if(disabled||reading)return;
          e.preventDefault();setDragging(false);
          void readFile(e.dataTransfer?.files?.[0]);
        }}/>
      {(fileName||Boolean(sourceRef.current?.value))&&<div className="import-source-meta">
        <span className="selected-file" title={fileName||undefined}>
          {fileName||'已输入 Cookie 内容'}</span>
        <Button type="button" variant="secondary" className="clear-source"
          disabled={disabled||reading} onClick={()=>{
            invalidate();setFileName('');
            if(sourceRef.current)sourceRef.current.value='';
            onDirty?.(false);setSourceRevision(x=>x+1);
          }}>清空</Button>
      </div>}
    </div>
    <label>格式
      <select className="od-field" disabled={disabled||reading} value={format}
        onChange={e=>{invalidate();setFormat(e.target.value);}}>
        <option value="auto">自动识别</option><option value="json">JSON</option>
        <option value="header">Cookie Header</option>
        <option value="netscape">Netscape</option>
      </select>
    </label>
    <CookieFormField label="或粘贴 Cookie 内容" className="cookie-import-field">
      <textarea className="od-field" ref={sourceRef} rows={5} autoComplete="off"
        spellCheck={false} disabled={disabled||reading}
        placeholder="粘贴 JSON、Cookie Header 或 Netscape 文本"
        data-cookie-secret-input="true" onInput={edited}/>
    </CookieFormField>
    {checking&&<p role="status" className="cookie-message">正在安全预检…</p>}
    {plan&&<section aria-label="导入预检结果" role="status"
      className="cookie-message od-alert cookie-import-summary">
      <strong>新增 {plan.created} · 覆盖 {plan.replaced} · 跳过 {plan.skipped} · 可导入 {plan.accepted}</strong>
      {plan.issues?.length>0&&<>
        <span>以下条目未通过校验，不会导入：</span>
        <ul>{plan.issues.map(item=><li key={item.index}>
          第 {item.index} 条 · {item.status==='expired'?'已过期':'无效'} · {item.reason}
        </li>)}</ul>
        {plan.issueCount>30&&<p>还有 {plan.issueCount-30} 条未展开，请核对原文。</p>}
      </>}
      {plan.replaced>0&&<label className="cookie-import-overwrite">
        <input type="checkbox" checked={overwrite} disabled={disabled||reading||checking}
          onChange={e=>{const next=e.target.checked;invalidate();setOverwrite(next);}}/>
        覆盖 {plan.replaced} 条现有同身份 Cookie（默认跳过）
      </label>}
    </section>}
    {message&&<p role="alert" className="cookie-message od-alert od-alert--error">{message}</p>}
    <div className="cookie-editor-actions">
      <Button type="button" disabled={disabled||reading} onClick={onClose}>取消</Button>
      <span className="cookie-spacer"/>
      <Button type="button" variant="primary"
        disabled={disabled||reading||checking||!plan?.accepted}
        onClick={()=>void execute()}>导入 Cookie</Button>
    </div>
  </section>;
}
