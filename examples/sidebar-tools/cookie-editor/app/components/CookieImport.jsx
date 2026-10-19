import * as React from 'react';
import {Button} from '@opendesk/ui';
import {CookieImportDropzone,CookieIconButton} from './CookieEditorView.jsx';

const MAX_FILE=8*1024*1024;

// Import is a focused modal, not a second editor or an inline list section.
// Raw Cookie values live only in a DOM textarea / local async stack, never React state.
// The Controller performs the existing permission, preflight and verified Host writes.
export default function CookieImport({disabled=false,onClose,onImportText,onNotice}){
  const dialogRef=React.useRef(null);
  const triggerRef=React.useRef(null);
  const fileRef=React.useRef(null);
  const sourceRef=React.useRef(null);
  const active=React.useRef(false);
  const running=React.useRef(false);
  const headingId=React.useId();
  const [busy,setBusy]=React.useState(false);
  const [dragging,setDragging]=React.useState(false);
  React.useLayoutEffect(()=>{
    active.current=true;
    const dialog=dialogRef.current;
    const previous=dialog.ownerDocument.activeElement;
    triggerRef.current=previous&&previous!==dialog.ownerDocument.body?previous:null;
    dialog.showModal();
    sourceRef.current?.focus();
    return ()=>{
      active.current=false;
      if(sourceRef.current)sourceRef.current.value='';
      if(dialog.open)dialog.close();
      if(triggerRef.current?.isConnected)triggerRef.current.focus();
    };
  },[]);
  const close=()=>{
    if(!running.current&&!disabled)onClose?.();
  };
  const importText=async text=>{
    if(running.current||disabled)return;
    if(!text?.trim()){
      onNotice?.('请先选择文件或粘贴 Cookie 内容。','error');
      return;
    }
    running.current=true;setBusy(true);
    try{
      const imported=await onImportText?.(text);
      if(imported===true){
        if(sourceRef.current)sourceRef.current.value='';
        onClose?.({committed:true});
      }
    }catch{
      onNotice?.('导入失败，请核对文件格式或网站授权。','error');
    }finally{
      running.current=false;
      if(active.current)setBusy(false);
    }
  };
  const importFile=async file=>{
    if(!file||running.current||disabled)return;
    if(file.size>MAX_FILE){
      onNotice?.('文件超过 8 MiB，请分批导入。','error');
      if(fileRef.current)fileRef.current.value='';
      return;
    }
    let text='';
    try{
      text=await file.text();
      if(!active.current)return;
      await importText(text);
    }catch{
      if(active.current)onNotice?.('无法读取 Cookie 文件，请重试。','error');
    }finally{
      text='';
      if(active.current&&fileRef.current)fileRef.current.value='';
    }
  };
  return <dialog ref={dialogRef} className="cookie-import-dialog od-surface"
    aria-labelledby={headingId}
    onCancel={event=>{event.preventDefault();close();}}>
    <div className="cookie-import-body">
      <header className="cookie-import-heading">
        <h2 id={headingId}>导入 Cookie</h2>
        <CookieIconButton name="close" label="关闭导入" disabled={disabled||busy}
          onClick={close}/>
      </header>
      <input ref={fileRef} type="file" hidden
        accept=".json,.txt,.cookies,text/plain,application/json"
        disabled={disabled||busy}
        onChange={event=>{void importFile(event.currentTarget.files?.[0]);}}/>
      <CookieImportDropzone dragging={dragging} disabled={disabled||busy}
        maxSize="8 MiB" onPick={()=>fileRef.current?.click()}
        onDragEnter={event=>{event.preventDefault();if(!busy)setDragging(true);}}
        onDragOver={event=>{event.preventDefault();if(!busy)setDragging(true);}}
        onDragLeave={event=>{
          if(!event.currentTarget.contains(event.relatedTarget))setDragging(false);
        }}
        onDrop={event=>{
          event.preventDefault();setDragging(false);
          void importFile(event.dataTransfer?.files?.[0]);
        }}/>
      <label className="cookie-import-paste" htmlFor="cookie-import-source">
        <span>或粘贴 Cookie 内容</span>
        <textarea id="cookie-import-source" ref={sourceRef}
          className="od-field" rows={5} aria-label="粘贴 Cookie 内容"
          placeholder="JSON、Cookie Header 或 Netscape"
          autoComplete="off" spellCheck={false} data-cookie-secret-input="true"
          disabled={disabled||busy}/>
      </label>
      <div className="cookie-import-actions">
        <Button type="button" variant="secondary" disabled={busy}
          onClick={close}>取消</Button>
        <Button type="button" variant="primary" disabled={disabled||busy}
          onClick={()=>void importText(sourceRef.current?.value||'')}>
          {busy?'导入中…':'导入'}
        </Button>
      </div>
    </div>
  </dialog>;
}
