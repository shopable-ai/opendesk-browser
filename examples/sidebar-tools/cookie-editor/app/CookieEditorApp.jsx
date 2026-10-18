import * as React from 'react';
import {Button} from '@opendesk/ui';
import {createCookieSdkAdapter} from './adapters/browser-sdk.js';
import {createCookieController} from './controller/cookie-controller.js';
import {CookieEditorView} from './components/CookieEditorView.jsx';
import CookieInlineEditor from './components/CookieInlineEditor.jsx';
import CookieImport from './components/CookieImport.jsx';
import CookieExport from './components/CookieExport.jsx';
import CookiePermissions from './components/CookiePermissions.jsx';
import CookieOfflineWorkspace from './components/CookieOfflineWorkspace.jsx';

// The only transport is Controller -> Adapter -> public OpenDeskSDK.browser.
// Host permission, value grant and native receipts are never replaced in React.
export default function CookieEditorApp({request,hostRoot,setState}){
  const [view,setView]=React.useState(null);
  const [mode,setMode]=React.useState('browser');
  const [offlineInitialSite,setOfflineInitialSite]=React.useState(null);
  const modeRef=React.useRef('browser');
  const [panel,setPanel]=React.useState(null);
  const [selected,setSelected]=React.useState(null);
  const [query,setQuery]=React.useState('');
  const [filter,setFilter]=React.useState('all');
  const [sort,setSort]=React.useState('name');
  const [page,setPage]=React.useState(1);
  const [expanded,setExpanded]=React.useState(false);
  const [siteInput,setSiteInput]=React.useState('');
  const [dirty,setDirty]=React.useState(false);
  const [confirmation,setConfirmation]=React.useState(null);
  const [status,setStatus]=React.useState('');
  const [working,setWorking]=React.useState(false);
  const appliedSite=React.useRef('');
  const cancelButton=React.useRef(null);
  const data=React.useRef(null);
  if(data.current===null){
    const adapter=createCookieSdkAdapter({
      getBrowser:()=>globalThis.OpenDeskSDK?.browser,
      request
    });
    const controller=createCookieController({adapter,onChange:s=>setView(s)});
    data.current={adapter,controller};
  }
  const {controller,adapter}=data.current;
  const snapshot=view||controller.snapshot();
  const busy=Boolean(snapshot.busy||working);
  const locked=busy||Boolean(confirmation);
  const scrubSensitive=()=>{
    // Invalidate DOM secrets synchronously on permission changes and navigation,
    // even before React commits the render that removes the editor.
    for(const node of hostRoot.querySelectorAll('[data-cookie-secret-input]'))
      node.value='';
    for(const node of hostRoot.querySelectorAll('[data-cookie-secret-output]')){
      node.textContent='';node.hidden=true;
    }
  };
  const cleanEditor=()=>{
    setPanel(null);setSelected(null);setDirty(false);setStatus('');
  };
  const ask=(text,action,onCancel)=>{
    setConfirmation({text,action,onCancel});
  };
  const guarded=(action)=>{
    if(locked)return;
    if(dirty){ask('当前有尚未保存的 Cookie 或导入文本，确认放弃修改？',()=>{
      setDirty(false);action();});return;}
    action();
  };
  const endConfirm=accept=>{
    const decision=confirmation;
    setConfirmation(null);
    if(accept&&decision?.action)decision.action();
    if(!accept&&decision?.onCancel)decision.onCancel();
  };
  const refresh=()=>{
    if(busy)return;
    cleanEditor();setPage(1);
    void controller.load(appliedSite.current);
  };
  const invalidate=(reason,siteChanged=false)=>{
    // Permission/page events must not silently connect the isolated offline
    // workspace to Chrome or destroy its independent local input.
    if(modeRef.current==='offline'){
      controller.invalidate(reason);
      return;
    }
    scrubSensitive();
    const wasBusy=controller.snapshot().busy;
    controller.invalidate(reason);
    cleanEditor();setConfirmation(null);setQuery('');setPage(1);
    if(siteChanged){appliedSite.current='';setSiteInput('');}
    if(wasBusy)setStatus('网站或权限在操作期间改变，写入结果可能未知。请核对 Chrome，禁止自动重试。');
    else void controller.load(appliedSite.current);
  };
  React.useEffect(()=>{
    const grant=()=>invalidate('授权已改变，敏感值和旧列表已清除。');
    const page=()=>invalidate('当前网站已切换，旧数据已清除。',true);
    hostRoot.addEventListener('opendesk-cookie-grants-changed',grant);
    hostRoot.addEventListener('opendesk-page-changed',page);
    void controller.load();
    return ()=>{
      hostRoot.removeEventListener('opendesk-cookie-grants-changed',grant);
      hostRoot.removeEventListener('opendesk-page-changed',page);
      scrubSensitive();
      controller.dispose();
    };
  },[hostRoot,controller]);
  React.useEffect(()=>{setState?.({busy,dirty});},[busy,dirty,setState]);
  React.useEffect(()=>{if(confirmation)cancelButton.current?.focus();},[confirmation]);
  React.useEffect(()=>{
    // A live session invalidation must not discard an offline editor's
    // independent dirty state when an unrelated browser event fires.
    if(modeRef.current==='offline')return;
    if(snapshot.phase!=='ready'){
      setSelected(null);setPanel(null);setDirty(false);setConfirmation(null);
    }
  },[snapshot.epoch,snapshot.phase]);
  const target=snapshot.target;
  const openPanel=name=>guarded(()=>{
    setSelected(null);setPanel(name);setPage(1);setStatus('');
  });
  const switchMode=next=>guarded(()=>{
    if(next===mode)return;
    scrubSensitive();
    if(next==='offline'){
      // Closing the live mode must retire observe sessions, wipe live Cookie
      // identities and prevent an outstanding native read from resurfacing.
      setOfflineInitialSite(controller.snapshot().target);
      controller.invalidate('已退出实时 Cookie 模式；重新进入后需重新授权读取。');
    }else{
      // Reenter by explicitly rechecking the current or selected website.
      void controller.load(appliedSite.current);
    }
    modeRef.current=next;
    setMode(next);setSelected(null);setPanel(null);setDirty(false);
  });
  const save=async(row,options)=>{
    setWorking(true);
    try{
      const saved=await controller.save(row,options);
      if(saved){setSelected(null);setDirty(false);setPage(1);}
    }finally{setWorking(false);}
  };
  const remove=id=>ask('仅删除所选 Cookie 的精确身份，可能影响当前网站登录。确定删除？',
    async()=>{
      setWorking(true);
      try{if(await controller.remove(id)){setSelected(null);setDirty(false);}}
      finally{setWorking(false);}
    });
  const clear=async()=>{
    setWorking(true);
    let result;
    try{result=await controller.previewClear();}
    finally{setWorking(false);}
    if(!result)return;
    ask('Chrome 将仅清理 '+result.hostname+' 的 '+result.count+
      ' 条精确 Host-only Cookie；Domain Cookie 和其他网站不在范围内。确定执行？',
      async()=>{setWorking(true);try{await controller.executeClear();}
        finally{setWorking(false);}},
      ()=>controller.discardClear());
  };
  const select=id=>guarded(()=>{setPanel(null);setSelected(id);setStatus('');});
  const onKeyDown=e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){
      // Child forms own Save; never accidentally save hidden/redacted values.
      if(e.target.closest('.cookie-inline-editor'))return;
      e.preventDefault();return;
    }
    if(!confirmation)return;
    if(e.key==='Escape'){e.preventDefault();endConfirm(false);}
    if(e.key==='Tab'){
      const buttons=e.currentTarget.querySelectorAll('.cookie-confirm button');
      if(buttons.length===2){e.preventDefault();
        (e.currentTarget.ownerDocument.activeElement===buttons[0]?buttons[1]:buttons[0]).focus();}
    }
  };
  return <main className="cookie-editor-react od-page" onKeyDown={onKeyDown}>
    {mode==='offline'?<CookieOfflineWorkspace initialTarget={offlineInitialSite}
      adapter={adapter} onDirty={setDirty}/>:
    <>
      <CookiePermissions phase={snapshot.phase} target={target}
        disabled={busy} onRetry={()=>guarded(refresh)}/>
      {snapshot.phase==='ready'&&<div className="od-surface">
        <CookieEditorView site={target?.hostname||''}
          rows={snapshot.rows} selected={selected} onSelect={select}
          onRefresh={()=>guarded(refresh)}
          query={query} onQuery={v=>{setQuery(v);setPage(1);}}
          filter={filter} onFilter={v=>{setFilter(v);setPage(1);}}
          sort={sort} onSort={v=>{setSort(v);setPage(1);}}
          expandedFilters={expanded} onToggleFilters={()=>setExpanded(x=>!x)}
          page={page} onPage={setPage} busy={locked}
          onImport={()=>openPanel('import')} onExport={()=>openPanel('export')}
          onNew={()=>select('new')} onClear={()=>void clear()}
          clearDisabled={!snapshot.rows.length}
          newEditor={selected==='new'?<CookieInlineEditor key="new" target={target}
            disabled={locked} onSave={save} onDirty={setDirty}
            onCancel={()=>guarded(()=>setSelected(null))}/>:null}
          editor={row=><CookieInlineEditor key={row.id} row={row} target={target}
            disabled={locked} readValue={controller.readValue} onSave={save}
            onDirty={setDirty} onCancel={()=>guarded(()=>setSelected(null))}
            onDelete={remove}/>}/>
        {panel==='import'&&<CookieImport controller={controller} disabled={locked}
          onClose={result=>{
            // A verified import has already committed; it must not reopen the
            // unsaved-change dialog using the render's stale dirty closure.
            if(result?.committed===true){setPanel(null);setDirty(false);return;}
            guarded(()=>{setPanel(null);setDirty(false);});
          }}
          onDirty={setDirty}/>}
        {panel==='export'&&<CookieExport controller={controller} disabled={locked}
          onClose={()=>setPanel(null)}/>}
      </div>}
      {snapshot.phase==='ready'&&<details className="cookie-observe-fold od-disclosure">
        <summary>变化观察</summary>
        <section className="cookie-observe" aria-label="Cookie 变化观察">
        <div><strong>变化观察</strong><small>最多 15 秒，只显示元数据。</small></div>
        {!snapshot.observing?<Button disabled={locked} onClick={()=>void controller.observe('start')}>
          开始观察</Button>:<>
          <Button disabled={locked} onClick={()=>void controller.observe('read')}>读取变化</Button>
          <Button disabled={locked} onClick={()=>void controller.observe('stop')}>停止</Button>
        </>}
        {snapshot.observeEvents.length>0&&<ul>
          {snapshot.observeEvents.map((event,i)=><li key={i}>{
            event.removed?'已删除':'已变更'} · {event.name} · {event.domain}{event.path}</li>)}
        </ul>}
        </section>
      </details>}
    </>}
    <details className="cookie-utility-settings od-disclosure" open={mode==='offline'?true:undefined}>
      <summary>更多 · 离线工作区与网站范围</summary>
      <div className="cookie-utility-content">
        <div className="cookie-mode-tabs" role="group" aria-label="工作模式">
          <Button disabled={locked} aria-pressed={mode==='browser'}
            onClick={()=>switchMode('browser')}>浏览器</Button>
          <Button disabled={locked} aria-pressed={mode==='offline'}
            onClick={()=>switchMode('offline')}>离线工作区</Button>
        </div>
        {mode==='browser'&&<div className="cookie-site-select">
          <label htmlFor="cookie-target-url">切换或选择网站
            <input className="od-field" id="cookie-target-url" type="url"
              value={siteInput} disabled={locked}
              placeholder="留空则跟随当前网页"
              onChange={e=>setSiteInput(e.target.value)}/></label>
          <Button disabled={locked} onClick={()=>guarded(()=>{
            appliedSite.current=siteInput.trim();setSelected(null);setPanel(null);
            void controller.load(appliedSite.current);
          })}>应用</Button>
          <Button disabled={locked} onClick={()=>guarded(()=>{
            appliedSite.current='';setSiteInput('');void controller.load();
          })}>当前页</Button>
        </div>}
      </div>
    </details>
    {mode==='browser'&&snapshot.message&&<p role="status" className={'cookie-message od-alert '+(snapshot.messageType==='error'?'od-alert--error':snapshot.messageType==='warning'?'od-alert--warning':'')}>
      {snapshot.message}</p>}
    {status&&<p role="alert" className="cookie-message od-alert od-alert--error">{status}</p>}
    {confirmation&&<div className="cookie-confirm od-alert od-alert--warning" role="alertdialog" aria-modal="true"
      aria-label="确认 Cookie 操作">
      <p>{confirmation.text}</p>
      <div className="cookie-editor-actions">
        <Button ref={cancelButton} type="button" onClick={()=>endConfirm(false)}>取消</Button>
        <Button type="button" className="od-button--danger"
          onClick={()=>endConfirm(true)}>确认</Button>
      </div>
    </div>}
  </main>;
}
