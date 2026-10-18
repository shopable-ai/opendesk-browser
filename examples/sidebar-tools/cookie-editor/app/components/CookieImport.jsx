import * as React from 'react';
import {Button} from '@opendesk/ui';

const MAX_FILE=8*1024*1024;
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
  const chooseFile=async event=>{
    const file=event.target.files?.[0];
    if(!file)return;
    const seq=++revision.current,at=stamp();
    controller.discardImport();setPlan(null);
    if(file.size>MAX_FILE){
      setMessage('文件超过 8 MiB 限制');
      if(fileRef.current)fileRef.current.value='';
      return;
    }
    setReading(true);setMessage('');
    try{
      const text=await file.text();
      // Permission, target or mode may have changed while File.text() ran.
      // Never restore previous site's secrets after synchronous redaction.
      if(!isCurrent(seq,at))return;
      if(sourceRef.current){sourceRef.current.value=text;onDirty?.(true);}
    }catch{
      if(isCurrent(seq,at))setMessage('读取本地文件失败，请改用粘贴内容。');
    }finally{
      if(isCurrent(seq,at)){
        setReading(false);
        if(fileRef.current)fileRef.current.value='';
      }
    }
  };
  const inspect=async()=>{
    const seq=++revision.current,at=stamp();
    setMessage('');setPlan(null);
    const result=await controller.previewImport(sourceRef.current?.value||'',format);
    if(!isCurrent(seq,at))return;
    setPlan(result);
    if(!result)setMessage('预检未通过，请检查格式、Host 授权及作用域。');
  };
  const execute=async()=>{
    if(!plan?.accepted)return;
    const seq=++revision.current,at=stamp();
    setReading(true);
    try{
      const ok=await controller.executeImport(sourceRef.current?.value||'',format);
      if(!isCurrent(seq,at))return;
      if(ok){
        if(sourceRef.current)sourceRef.current.value='';
        onDirty?.(false);
        onClose({committed:true});
      }else{
        setPlan(null);
        setMessage('导入结果可能部分生效。请先刷新 Chrome 核对，不要重复提交。');
      }
    }finally{
      if(isCurrent(seq,at))setReading(false);
    }
  };
  return <section className="cookie-panel od-surface od-surface--padded" aria-label="导入 Cookie">
    <h3>导入 Cookie</h3>
    <p>先预检，确认后才通过公开 Browser SDK 写入。重复身份、过期数据和跨站 Store/Partition 不会自动覆盖。</p>
    <label>来源格式 <select className="od-field" disabled={disabled||reading} value={format}
      onChange={e=>{revision.current++;controller.discardImport();setFormat(e.target.value);setPlan(null);}}>
      <option value="auto">自动识别</option><option value="json">JSON</option>
      <option value="header">Cookie Header</option><option value="netscape">Netscape</option>
    </select></label>
    <label>选择本地文件（最大 8 MiB）
      <input className="od-field" ref={fileRef} type="file" accept=".json,.txt,.cookies,text/plain,application/json"
        disabled={disabled||reading} onChange={e=>void chooseFile(e)}/></label>
    <label>待导入文本 <textarea className="od-field" ref={sourceRef} rows={6} autoComplete="off"
      spellCheck={false} disabled={disabled||reading} placeholder="Cookie: name=value; theme=dark"
      data-cookie-secret-input="true"
      onInput={()=>{revision.current++;controller.discardImport();setPlan(null);onDirty?.(true);}}/></label>
    {plan&&<section aria-label="导入预检结果" role="status" className="cookie-message od-alert">
      <p>总计 {plan.total} · 可导入 {plan.accepted} · 新增 {plan.created} · 覆盖 {plan.replaced} · 跳过 {plan.skipped}</p>
      {plan.issues?.length>0&&<>
        <strong>未通过的条目（最多显示前 30 条，不显示 Cookie Value）</strong>
        <ul>{plan.issues.map(item=><li key={item.index}>
          第 {item.index} 条 · {item.status==='expired'?'已过期':'未通过校验'} · {item.reason}
        </li>)}</ul>
        {plan.issueCount>30&&<p>另有 {plan.issueCount-30} 条未显示，请分批核查原文。</p>}
      </>}
    </section>}
    {message&&<p role="alert" className="cookie-message od-alert od-alert--error">{message}</p>}
    <div className="cookie-editor-actions">
      <Button type="button" disabled={disabled||reading} onClick={onClose}>关闭</Button>
      <span className="cookie-spacer"/>
      <Button type="button" disabled={disabled||reading} onClick={()=>void inspect()}>预检</Button>
      <Button type="button" variant="primary"
        disabled={disabled||reading||!plan?.accepted}
        onClick={()=>void execute()}>确认导入</Button>
    </div>
  </section>;
}
