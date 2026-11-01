import * as React from 'react';
import {Button} from '@opendesk/ui';
import {CookieImportDropzone,CookieIconButton} from './CookieEditorView.jsx';

const MAX_FILE=8*1024*1024;

// Native bottom sheet; file and textarea values never enter React state.
// Actual imports still run through the existing Controller, Adapter and Host.
export default function CookieImport({disabled=false,onClose,onImportText,onBeginImport,
  onAbandonIntent,onNotice,onBeforeSubmit,onPendingChange,notice}){
  const dialogRef=React.useRef(null);
  const fileRef=React.useRef(null);
  const sourceRef=React.useRef(null);
  const stagedFile=React.useRef(null);
  const [stagedName,setStagedName]=React.useState('');
  const [overwrite,setOverwrite]=React.useState(true);
  const active=React.useRef(false);
  const running=React.useRef(false);
  const reading=React.useRef(false);
  const intentRef=React.useRef(null);
  const [busy,setBusy]=React.useState(false);
  const [uncertain,setUncertain]=React.useState(false);
  const [dragging,setDragging]=React.useState(false);
  const [confirmDiscard,setConfirmDiscard]=React.useState(false);
  const headingId=React.useId();
  const hintId=React.useId();

  React.useLayoutEffect(()=>{
    const dialog=dialogRef.current;
    active.current=true;
    dialog.showModal();
    sourceRef.current?.focus({preventScroll:true});
    return ()=>{
      active.current=false;
      if(sourceRef.current)sourceRef.current.value='';
      stagedFile.current=null;
      const admission=intentRef.current;
      intentRef.current=null;
      if(admission)void admission.then(()=>onAbandonIntent?.(),()=>onAbandonIntent?.());
      onPendingChange?.(false);
      if(dialog.open)dialog.close();
    };
  },[]);

  const close=()=>{
    if(running.current||reading.current||disabled||busy)return;
    if(stagedFile.current||sourceRef.current?.value.trim()){
      setConfirmDiscard(true);
      return;
    }
    onClose?.();
  };
  const beginIntent=()=>{
    let pending;
    try{
      // Admission MUST start in the real Confirm click before File.text()/await.
      pending=Promise.resolve(onBeginImport?.());
    }catch{
      pending=Promise.resolve(false);
    }
    intentRef.current=pending.then(value=>value===true,()=>false);
  };
  const releaseUnusedIntent=async()=>{
    const admission=intentRef.current;
    intentRef.current=null;
    if(admission)await admission.catch(()=>false);
    onAbandonIntent?.();
  };
  const importText=async text=>{
    if(running.current||disabled||uncertain){
      await releaseUnusedIntent();
      return;
    }
    if(!text?.trim()){
      onNotice?.('请先选择文件或粘贴 Cookie 内容。','error');
      await releaseUnusedIntent();
      return;
    }
    running.current=true;
    setBusy(true);
    const admission=intentRef.current;
    intentRef.current=null;
    try{
      const authorized=await admission;
      if(!active.current){
        onAbandonIntent?.();
        return;
      }
      if(authorized!==true){
        onNotice?.('本次导入未获得可信操作授权，请重新点击“确认导入”。','error');
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
      // Do not auto-retry a possible native effect.
      onNotice?.('导入结果未知，请先核对 Chrome，不要直接重试。','error');
    }finally{
      running.current=false;
      if(active.current)setBusy(false);
    }
  };
  const confirmImport=()=>{
    if(reading.current||running.current||disabled||busy||uncertain)return;
    if(onBeforeSubmit?.()===false)return;
    const file=stagedFile.current;
    const pasted=file?'':sourceRef.current?.value||'';
    if(!file&&!pasted.trim()){
      onNotice?.('请先选择文件或粘贴 Cookie 内容。','error');
      return;
    }
    beginIntent(); // Only this click grants the trusted import attempt.
    if(!file){
      void importText(pasted);
      return;
    }
    reading.current=true;
    setBusy(true);
    void (async()=>{
      let text='';
      try{
        text=await file.text();
        if(active.current)await importText(text);
        else await releaseUnusedIntent();
      }catch{
        if(active.current)onNotice?.('无法读取 Cookie 文件，请重新选择或粘贴内容。','error');
        await releaseUnusedIntent();
      }finally{
        text='';
        reading.current=false;
        if(active.current&&!running.current)setBusy(false);
      }
    })();
  };
  // Choose / drop merely stages a File. Neither action starts admission or a write.
  const stageFile=file=>{
    if(!file||disabled||uncertain||running.current||reading.current)return;
    if(file.size>MAX_FILE){
      onNotice?.('文件超过 8 MiB，请分批导入。','error');
      if(fileRef.current)fileRef.current.value='';
      return;
    }
    if(sourceRef.current)sourceRef.current.value='';
    stagedFile.current=file;
    setStagedName(file.name.slice(0,100));
    setConfirmDiscard(false);
    onNotice?.(null);
    onPendingChange?.(true);
  };
  const hasDraggedFile=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
  const dragOver=event=>{
    if(!hasDraggedFile(event))return;
    event.preventDefault();
    if(!busy&&!disabled)setDragging(true);
  };
  const dropFile=event=>{
    if(!hasDraggedFile(event))return;
    event.preventDefault();
    setDragging(false);
    if(!busy&&!disabled&&!uncertain)stageFile(event.dataTransfer?.files?.[0]);
  };
  const onBackdropClick=event=>{
    const rect=event.currentTarget.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||
       event.clientY<rect.top||event.clientY>rect.bottom)close();
  };

  return <dialog ref={dialogRef} id="cookie-import-drawer"
    className="cookie-import-workspace od-surface" role="dialog" aria-modal="true"
    aria-labelledby={headingId} aria-describedby={hintId} aria-busy={busy}
    onCancel={event=>{event.preventDefault();close();}}
    onClick={onBackdropClick}
    onDragEnter={dragOver} onDragOver={dragOver}
    onDragLeave={event=>{
      if(!event.currentTarget.contains(event.relatedTarget))setDragging(false);
    }}
    onDrop={dropFile}>
    <header className="cookie-import-heading">
      <h2 id={headingId}>导入 Cookie</h2>
      <CookieIconButton name="close" label="关闭导入" disabled={disabled||busy}
        onClick={close}/>
    </header>
    <div className="cookie-import-body">
      <p id={hintId} className="cookie-import-hint">文件只会暂存，点击「确认导入」后才会校验并写入。</p>
      <input ref={fileRef} type="file" hidden
        accept=".json,.txt,.cookies,text/plain,application/json"
        disabled={disabled||busy||uncertain}
        onChange={event=>stageFile(event.currentTarget.files?.[0])}/>
      <div className={'cookie-import-dropzone'+(dragging?' is-dragging':'')}>
        <CookieImportDropzone dragging={dragging} fileName={stagedName}
          disabled={disabled||busy||uncertain} maxSize="8 MiB"
          onPick={()=>{if(fileRef.current)fileRef.current.value='';fileRef.current?.click();}}/>
        <span>或将 JSON / TXT / Netscape 文件拖到此处</span>
      </div>
      {stagedName&&<p className="cookie-import-selected" role="status">
        已选择 {stagedName} · 点击「确认导入」后才会写入
      </p>}
      <label className="cookie-import-paste" htmlFor="cookie-import-source">
        <span>或粘贴 Cookie 内容</span>
        <textarea id="cookie-import-source" ref={sourceRef}
          className="od-field" rows={4} aria-label="粘贴 Cookie 内容"
          placeholder="JSON、Cookie Header 或 Netscape"
          autoComplete="off" spellCheck={false} data-cookie-secret-input="true" data-sensitive="true"
          disabled={disabled||busy||uncertain}
          onInput={event=>{
            if(stagedFile.current){stagedFile.current=null;setStagedName('');}
            setConfirmDiscard(false);
            onNotice?.(null);
            onPendingChange?.(Boolean(event.currentTarget.value.trim()));
          }}/>
      </label>
      <label className="cookie-import-overwrite">
        <input type="checkbox" checked={overwrite}
          disabled={disabled||busy||uncertain}
          onChange={event=>{
            setOverwrite(event.currentTarget.checked);
            setConfirmDiscard(false);
            onPendingChange?.(Boolean(stagedFile.current)||
              Boolean(sourceRef.current?.value.trim()));
          }}/>
        <span>覆盖已有 Cookie</span>
      </label>
    </div>
    <footer className="cookie-import-footer">
      {notice&&<div role={notice.kind==='error'?'alert':'status'}
        className={'cookie-import-inline-notice'+(notice.kind==='error'?' is-error':'')}>
        {notice.text}
      </div>}
      {confirmDiscard?<div className="cookie-import-discard" role="group"
        aria-label="放弃导入内容">
        <span>放弃未导入的内容？</span>
        <Button type="button" variant="secondary" disabled={disabled||busy}
          onClick={()=>{setConfirmDiscard(false);sourceRef.current?.focus({preventScroll:true});}}>继续导入</Button>
        <Button type="button" variant="secondary" disabled={disabled||busy}
          onClick={()=>onClose?.()}>放弃内容</Button>
      </div>:<div className="cookie-import-actions">
        <Button type="button" variant="secondary" disabled={disabled||busy}
          onClick={close}>取消</Button>
        <Button type="button" variant="primary" disabled={disabled||busy||uncertain}
          onClick={confirmImport}>
          {busy?'处理中…':'确认导入'}
        </Button>
      </div>}
    </footer>
  </dialog>;
}
