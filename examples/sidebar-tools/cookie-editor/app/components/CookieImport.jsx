import * as React from 'react';
import {Button} from '@opendesk/ui';
import {inspectImport,rejectImportDuplicates} from '../domain/cookie-model.js';
import {CookieImportDropzone,CookieIconButton} from './CookieEditorView.jsx';

const MAX_FILE=8*1024*1024;

// One responsive bottom sheet within the same mounted list; Controller still owns all writes.
// Raw Cookie values live only in a DOM textarea / local async stack, never React state.
// The Controller performs the existing permission, preflight and verified Host writes.
export default function CookieImport({disabled=false,onClose,onImportText,onBeginImport,onNotice,
  onBeforeSubmit,onPendingChange,notice}){
  const workspaceRef=React.useRef(null);
  const fileRef=React.useRef(null);
  const sourceRef=React.useRef(null);
  const stagedFile=React.useRef(null);
  const [stagedName,setStagedName]=React.useState('');
  const [overwrite,setOverwrite]=React.useState(true);
  const [preview,setPreview]=React.useState(null);
  const previewRef=React.useRef(null);
  const revision=React.useRef(0);
  const invalidatePreview=()=>{
    revision.current++;previewRef.current=null;setPreview(null);
  };
  const active=React.useRef(false);
  const running=React.useRef(false);
  const reading=React.useRef(false);
  const intentRef=React.useRef(null);
  const beginIntent=()=>{
    let pending;
    try{pending=Promise.resolve(onBeginImport?.());}
    catch(error){pending=Promise.reject(error);}
    // Trusted admission starts only in the explicit confirmation click.
    intentRef.current=pending.then(value=>value===true,()=>false);
  };
  const headingId=React.useId();
  const [busy,setBusy]=React.useState(false);
  const [uncertain,setUncertain]=React.useState(false);
  const [dragging,setDragging]=React.useState(false);
  const [confirmDiscard,setConfirmDiscard]=React.useState(false);
  React.useLayoutEffect(()=>{
    active.current=true;
    const workspace=workspaceRef.current;
    sourceRef.current?.focus({preventScroll:true});
    return ()=>{
      active.current=false;
      if(sourceRef.current)sourceRef.current.value='';
      stagedFile.current=null;previewRef.current=null;
      onPendingChange?.(false);
    };
  },[]);
  const close=()=>{
    if(running.current||reading.current||disabled||busy)return;
    if(stagedFile.current||sourceRef.current?.value.trim()){
      setConfirmDiscard(true);return;
    }
    onClose?.();
  };
  const importText=async text=>{
    if(running.current||disabled||uncertain)return;
    if(!text?.trim()){
      onNotice?.('请先选择文件或粘贴 Cookie 内容。','error');
      return;
    }
    running.current=true;setBusy(true);
    try{
      const authorized=await intentRef.current;
      if(!active.current)return;
      if(authorized!==true){
        onNotice?.('本次导入未获得可信操作授权，请重新预览并确认导入。','error');
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
  const preparePreview=async()=>{
    if(reading.current||running.current||disabled||uncertain)return;
    invalidatePreview();
    const generation=revision.current;
    const file=stagedFile.current;
    reading.current=true;setBusy(true);
    let text='';
    try{
      text=file?await file.text():sourceRef.current?.value||'';
      if(!active.current||generation!==revision.current)return;
      // Header/dictionary inputs inherit the Controller's current site at commit.
      // This local placeholder never becomes a native destination.
      const {records}=inspectImport(text,'auto','current-site.invalid',true);
      rejectImportDuplicates(records);
      const rows=records.map(({index,cookie,status})=>({index,status,
        ...(cookie?{name:cookie.name,domain:cookie.domain,path:cookie.path}:{})}));
      const next={rows,total:rows.length,ready:rows.filter(row=>row.status==='ready').length};
      previewRef.current=next;setPreview(next);onNotice?.(null);
    }catch{
      // Never surface parser/native exception text, which may contain secrets.
      if(active.current)onNotice?.('无法预览：请检查文件或 Cookie 格式，输入已保留。','error');
    }finally{
      text='';reading.current=false;
      if(active.current)setBusy(false);
    }
  };
  const confirmImport=()=>{
    if(reading.current||running.current||disabled||uncertain||!previewRef.current?.ready)return;
    if(onBeforeSubmit?.()===false)return;
    const file=stagedFile.current;
    invalidatePreview(); // A confirmation is single use, including failed/unknown writes.
    beginIntent(); // Keep the original trusted click before any asynchronous file read.
    if(!file){void importText(sourceRef.current?.value||'');return;}
    reading.current=true;setBusy(true);
    void (async()=>{
      let text='';
      try{
        text=await file.text();
        if(active.current)await importText(text);
      }catch{
        if(active.current)onNotice?.('无法读取 Cookie 文件，输入已保留，请重新预览。','error');
      }finally{
        text='';reading.current=false;
        if(active.current&&!running.current)setBusy(false);
      }
    })();
  };
  // File selection and drag/drop only stage the user-supplied source.
  // No native Cookie write or trusted import intent is generated here.
  const stageFile=file=>{
    if(!file||disabled||uncertain||running.current||reading.current)return;
    invalidatePreview();
    if(file.size>MAX_FILE){
      onNotice?.('文件超过 8 MiB，请分批导入。','error');
      if(fileRef.current)fileRef.current.value='';
      return;
    }
    stagedFile.current=file;setStagedName(file.name.slice(0,100));
    setConfirmDiscard(false);onNotice?.(null);onPendingChange?.(true);
  };
  const keepFocus=event=>{
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();close();return;
    }
    if(event.key!=='Tab')return;
    const all=Array.from(workspaceRef.current?.querySelectorAll(
      'button:not(:disabled),textarea:not(:disabled),input:not(:disabled):not([type=file])')||[])
      .filter(el=>el.getClientRects().length>0);
    if(!all.length)return;
    const first=all[0],last=all[all.length-1];
    if(event.shiftKey&&(document.activeElement===first||!workspaceRef.current.contains(document.activeElement))){
      event.preventDefault();last.focus();
    }else if(!event.shiftKey&&(document.activeElement===last||!workspaceRef.current.contains(document.activeElement))){
      event.preventDefault();first.focus();
    }
  };
  return <>
    <div className="cookie-import-dismiss-layer" aria-hidden="true"
      onPointerDown={event=>{event.preventDefault();close();}}/>
    <section ref={workspaceRef} id="cookie-import-drawer" className="cookie-import-workspace"
      role="dialog" aria-modal="true" aria-labelledby={headingId}
      onKeyDown={keepFocus}>
      <header className="cookie-import-heading">
        <h2 id={headingId}>导入 Cookie</h2>
        <CookieIconButton name="close" label="关闭导入" disabled={disabled||busy}
          onClick={close}/>
      </header>
      <div className="cookie-import-body">
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
          已选择 {stagedName} · 请先预览，再确认导入
        </p>}
        <label className="cookie-import-paste" htmlFor="cookie-import-source">
          <span>或粘贴 Cookie 内容</span>
          <textarea id="cookie-import-source" ref={sourceRef}
            className="od-field" rows={4} aria-label="粘贴 Cookie 内容"
            placeholder="JSON、Cookie Header 或 Netscape"
            autoComplete="off" spellCheck={false} data-cookie-secret-input="true"
            disabled={disabled||busy||uncertain}
            onInput={event=>{
              invalidatePreview();
              if(stagedFile.current){stagedFile.current=null;setStagedName('');}
              setConfirmDiscard(false);onNotice?.(null);
              onPendingChange?.(Boolean(event.currentTarget.value.trim()));
            }}/>
        </label>
        <label className="cookie-import-overwrite">
          <input type="checkbox" checked={overwrite}
            disabled={disabled||busy||uncertain}
            onChange={event=>{
              invalidatePreview();
              const next=event.currentTarget.checked;setOverwrite(next);
              setConfirmDiscard(false);onPendingChange?.(Boolean(stagedFile.current)||
                Boolean(sourceRef.current?.value.trim()));
            }}/>
          <span>覆盖已有 Cookie</span>
        </label>
        {preview&&<section aria-label="导入预览" className="cookie-import-selected">
          <p role="status">共 {preview.total} 条，可导入 {preview.ready} 条，
            跳过 {preview.total-preview.ready} 条。尚未写入 Cookie，值不在预览中显示。</p>
          <p>{overwrite?'同一 Cookie 身份已存在时将覆盖。':'同一 Cookie 身份已存在时将跳过，不覆盖。'}
            省略域的记录使用当前网站；网站权限和最终可导入条数将在确认时校验。</p>
          <ul>{preview.rows.map(row=><li key={row.index}>
            {row.name?<>{row.name} · {row.domain==='current-site.invalid'?'当前网站':row.domain} · {row.path}</>:
              <>第 {row.index} 条：格式无效</>}
            {row.status!=='ready'&&'（跳过：无效、重复或已过期）'}
          </li>)}</ul>
        </section>}
      </div>
      <div className="cookie-import-footer">
        {notice&&<div role={notice.kind==='error'?'alert':'status'}
          className={'cookie-import-inline-notice'+(notice.kind==='error'?' is-error':'')}>
          {notice.text}
        </div>}
        {confirmDiscard&&<div className="cookie-import-discard" role="group"
          aria-label="放弃导入内容">
          <span>放弃未导入的内容？</span>
          <Button type="button" variant="secondary"
            onClick={()=>{setConfirmDiscard(false);sourceRef.current?.focus({preventScroll:true});}}>继续导入</Button>
          <Button type="button" variant="secondary" onClick={()=>onClose?.()}>放弃内容</Button>
        </div>}
        <div className="cookie-import-actions">
          <Button type="button" variant="secondary" disabled={disabled||busy}
            onClick={close}>取消</Button>
          <Button type="button" variant="primary"
            disabled={disabled||busy||uncertain||Boolean(preview&&!preview.ready)}
            onClick={()=>{if(previewRef.current)confirmImport();else void preparePreview();}}>
            {busy?'处理中…':preview?'确认导入':'预览导入'}
          </Button>
        </div>
      </div>
    </section>
  </>;
}
