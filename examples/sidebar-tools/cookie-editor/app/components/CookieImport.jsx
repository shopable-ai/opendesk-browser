import * as React from 'react';
import {Button} from '@opendesk/ui';
import {CookieImportDropzone,CookieIconButton} from './CookieEditorView.jsx';

const MAX_FILE=8*1024*1024;

// Import is a full-height sidebar workspace, not a cramped modal or second editor.
// Raw Cookie values live only in a DOM textarea / local async stack, never React state.
// The Controller performs the existing permission, preflight and verified Host writes.
export default function CookieImport({disabled=false,onClose,onImportText,onBeginImport,onNotice,notice}){
  const workspaceRef=React.useRef(null);
  const triggerRef=React.useRef(null);
  const fileRef=React.useRef(null);
  const sourceRef=React.useRef(null);
  const stagedFile=React.useRef(null);
  const [stagedName,setStagedName]=React.useState('');
  const [overwrite,setOverwrite]=React.useState(false);
  const active=React.useRef(false);
  const running=React.useRef(false);
  const reading=React.useRef(false);
  const intentRef=React.useRef(null);
  const beginIntent=()=>{
    let pending;
    try{pending=Promise.resolve(onBeginImport?.());}
    catch(error){pending=Promise.reject(error);}
    // Trusted import admission starts in the explicit Import click, not file selection.
    intentRef.current=pending.then(value=>value===true,()=>false);
  };
  const headingId=React.useId();
  const [busy,setBusy]=React.useState(false);
  const [uncertain,setUncertain]=React.useState(false);
  const [dragging,setDragging]=React.useState(false);
  React.useLayoutEffect(()=>{
    active.current=true;
    const workspace=workspaceRef.current;
    const previous=workspace.ownerDocument.activeElement;
    triggerRef.current=previous&&previous!==workspace.ownerDocument.body?previous:null;
    sourceRef.current?.focus();
    return ()=>{
      active.current=false;
      if(sourceRef.current)sourceRef.current.value='';
      stagedFile.current=null;
      if(triggerRef.current?.isConnected)triggerRef.current.focus();
    };
  },[]);
  const close=()=>{
    if(!running.current&&!reading.current&&!disabled)onClose?.();
  };
  const importText=async text=>{
    if(running.current||disabled||uncertain)return;
    if(!text?.trim()){
      onNotice?.('请先选择文件或粘贴 Cookie 内容。','error');
      return;
    }
    running.current=true;setBusy(true);
    try{
      if(await intentRef.current!==true){
        onNotice?.('本次导入未获得可信操作授权，请重新点击导入。','error');
        return;
      }
      const imported=await onImportText?.(text,{overwrite});
      if(imported==='unknown')setUncertain(true);
      if(imported===true){
        stagedFile.current=null;
        if(sourceRef.current)sourceRef.current.value='';
        onClose?.({committed:true});
      }
    }catch{
      setUncertain(true);
      onNotice?.('导入结果未知，请先核对 Chrome，不要直接重试。','error');
    }finally{
      running.current=false;
      if(active.current)setBusy(false);
    }
  };
  const importFile=async file=>{
    if(!file||reading.current||running.current||disabled||uncertain)return;
    if(file.size>MAX_FILE){
      onNotice?.('文件超过 8 MiB，请分批导入。','error');
      if(fileRef.current)fileRef.current.value='';
      return;
    }
    reading.current=true;setBusy(true);
    let text='';
    try{
      text=await file.text();
      if(!active.current)return;
      await importText(text);
    }catch{
      if(active.current)onNotice?.('无法读取 Cookie 文件，请重试。','error');
    }finally{
      text='';reading.current=false;
      if(active.current){
        if(!running.current)setBusy(false);
        if(fileRef.current)fileRef.current.value='';
      }
    }
  };
  // File selection and drag/drop only stage the user-supplied source.
  // No native Cookie write or trusted import intent is generated here.
  const stageFile=file=>{
    if(!file||disabled||uncertain||running.current||reading.current)return;
    if(file.size>MAX_FILE){
      onNotice?.('文件超过 8 MiB，请分批导入。','error');
      if(fileRef.current)fileRef.current.value='';
      return;
    }
    stagedFile.current=file;setStagedName(file.name.slice(0,100));
  };
  return <section ref={workspaceRef} className="cookie-import-workspace"
    role="region" aria-labelledby={headingId}
    onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
    <div className="cookie-import-body">
      <header className="cookie-import-heading">
        <h2 id={headingId}>导入 Cookie</h2>
        <CookieIconButton name="close" label="关闭导入" disabled={disabled||busy}
          onClick={close}/>
      </header>
      <input ref={fileRef} type="file" hidden
        accept=".json,.txt,.cookies,text/plain,application/json"
        disabled={disabled||busy||uncertain}
        onChange={event=>{stageFile(event.currentTarget.files?.[0]);}}/>
      <CookieImportDropzone dragging={dragging} fileName={stagedName}
        disabled={disabled||busy||uncertain}
        maxSize="8 MiB" onPick={()=>{if(fileRef.current)fileRef.current.value='';fileRef.current?.click();}}
        onDragEnter={event=>{event.preventDefault();if(!busy)setDragging(true);}}
        onDragOver={event=>{event.preventDefault();if(!busy)setDragging(true);}}
        onDragLeave={event=>{
          if(!event.currentTarget.contains(event.relatedTarget))setDragging(false);
        }}
        onDrop={event=>{
          event.preventDefault();setDragging(false);
          const file=event.dataTransfer?.files?.[0];
          if(!file||busy||uncertain||disabled)return;
          stageFile(file);
        }}/>
      {stagedName&&<p className="cookie-import-selected" role="status">
        已选择 {stagedName} · 点击导入即可写入
      </p>}
      <label className="cookie-import-paste" htmlFor="cookie-import-source">
        <span>或粘贴 Cookie 内容</span>
        <textarea id="cookie-import-source" ref={sourceRef}
          className="od-field" rows={5} aria-label="粘贴 Cookie 内容"
          placeholder="JSON、Cookie Header 或 Netscape"
          autoComplete="off" spellCheck={false} data-cookie-secret-input="true"
          disabled={disabled||busy||uncertain}
          onInput={()=>{if(stagedFile.current){stagedFile.current=null;setStagedName('');}}}/>
      </label>
      <label className="cookie-import-overwrite">
        <input type="checkbox" checked={overwrite}
          disabled={disabled||busy||uncertain}
          onChange={event=>setOverwrite(event.currentTarget.checked)}/>
        <span>覆盖已存在的 Cookie（默认不覆盖）</span>
      </label>
      <div className="cookie-import-actions">
        <Button type="button" variant="primary" disabled={disabled||busy||uncertain}
          onClick={()=>{
            if(reading.current||running.current||disabled||uncertain)return;
            const file=stagedFile.current;
            if(!file&&!(sourceRef.current?.value||'').trim()){
              onNotice?.('请先选择文件或粘贴 Cookie 内容。','error');return;
            }
            beginIntent();
            if(file)void importFile(file);
            else void importText(sourceRef.current?.value||'');
          }}>
          {busy?'导入中…':'导入'}
        </Button>
      </div>
      {notice&&<div role={notice.kind==='error'?'alert':'status'}
        className={'cookie-import-toast'+(notice.kind==='error'?' cookie-import-toast--error':'')}>
        {notice.text}
      </div>}
    </div>
  </section>;
}
