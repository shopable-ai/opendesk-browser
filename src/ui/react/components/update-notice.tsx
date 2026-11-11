import * as React from 'react';

const PROTOCOL='opendesk.update-notice.v1';
const empty={records:[],newCount:0,unreadCount:0,actionableCount:0,badgeCount:0,
  browserPendingCount:0,globalMode:'toast+inbox',toolModes:{},
  openRequestedAt:0,verified:false,problem:null};
const modeLabels={'toast+inbox':'网页提醒 + 数字角标','inbox-only':'仅数字角标','silent':'静默（仍可手动查看）'};
const statuses={available:'有新版本，等待审阅',review_required:'需要审阅新增能力',
  pending_browser_apply:'Chrome 等待应用新版',applied:'已安装（有可信回执）',
  unknown:'状态未知，需人工核对'};
function call(kind,params={}){
  if(typeof chrome?.runtime?.sendMessage!=='function')return Promise.reject(Error('更新中心暂不可用'));
  return chrome.runtime.sendMessage({protocol:PROTOCOL,kind,...params}).then(reply=>{
    if(!reply?.ok)throw Error(reply?.error?.message||reply?.error?.code||'更新中心响应异常');
    return reply.data;
  });
}
function shortStamp(time){
  if(!Number.isFinite(time)||!time)return '—';
  try{return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit'}).format(new Date(time));}catch{return '—';}
}
function ReleaseDetail({row,onUpdate,onOpenReview,busy,verified,surface='sidebar'}){
  const [working,setWorking]=React.useState(false);
  const [message,setMessage]=React.useState('');
  const needsUpdate=row.kind==='sidebar-tool'&&row.ignoredAt===null&&
    ['available','review_required'].includes(row.status);
  const status=row.ignoredAt?'已忽略本版本':row.viewedAt&&needsUpdate?'已查看 · 待更新':statuses[row.status]||'未知';
  const action=async name=>{
    if(working||busy)return;
    setWorking(true);setMessage('');
    try{await onUpdate(row.key,name);}
    catch(error){setMessage('操作未确认：'+String(error?.message||error).slice(0,120));}
    finally{setWorking(false);}
  };
  const review=async()=>{
    if(working||busy)return;
    setWorking(true);setMessage('');
    try{
      // Request the real native surface from the original click stack.
      // Marking viewed is a separate durable, permission-free operation.
      const opened=onOpenReview?.(row);
      if(await opened===true)await onUpdate(row.key,'view');
      else setMessage('请在原有 Side Panel「扩展」中审阅更新；现有安装不变。');
    }catch(error){setMessage('审阅入口未开启：'+String(error?.message||error).slice(0,120));}
    finally{setWorking(false);}
  };
  return <section className="od-update-release" aria-label={row.title+' 的更新'}>
    <div className="od-update-release-head"><strong>{row.title}</strong>
      <span className="od-update-release-status">{status}</span></div>
    <div className="od-update-release-meta">
      {row.kind==='browser'?'OpenDesk 浏览器本体':'扩展工具'}
      {row.fromVersion?' · v'+row.fromVersion+' → v'+row.version:' · v'+row.version}
      {row.source?' · '+row.source:''}
    </div>
    <p className="od-update-release-description">
      {row.kind==='browser'?'此更新由 Chrome 管理，无须通过 OpenDesk 工具安装器操作。':
        row.status==='unknown'?'来源、版本或安装结果尚未确认，不能据此安装。':
        row.description?'官方目录简介：'+row.description:
          '官方目录未提供逐条版本说明。审阅更新不会自动安装。'}
    </p>
    {row.sha256&&<details className="od-update-release-technical">
      <summary>来源与包校验</summary>
      <p>{row.source||'官方目录'}</p>
      <code>{row.sha256}</code>
    </details>}
    {row.newCapabilities?.length>0&&<div className="od-update-release-permissions">
      <strong>新增能力，须单独确认：</strong>
      <span>{row.newCapabilities.join('、')}</span></div>}
    <div className="od-update-release-actions">
      {needsUpdate&&
        <button type="button" onClick={review} disabled={working||busy||!verified}>
          {surface==='app'?'前往侧栏审阅':'审阅并更新'}
        </button>}
      {needsUpdate&&row.viewedAt===null&&
        <button type="button" onClick={()=>action('view')} disabled={working||busy}>标记已读</button>}
      {needsUpdate&&row.ignoredAt===null&&row.dismissedAt===null&&row.viewedAt===null&&
        <button type="button" onClick={()=>action('snooze')} disabled={working||busy}>稍后</button>}
      {needsUpdate&&row.ignoredAt===null&&
        <button type="button" onClick={()=>action('ignore')} disabled={working||busy}>忽略本版本</button>}
    </div>
    {message&&<p role="alert" className="od-update-error">{message}</p>}
  </section>;
}
// One trusted React Shell subscription serves both the toolbar badge and center.
// The update store is read-only here. Mutations remain in the existing Worker.
export function useUpdateNoticeController(onOpenRequested=()=>{}){
  const [state,setState]=React.useState(empty);
  const [opened,setOpened]=React.useState(false);
  const [filter,setFilter]=React.useState('pending');
  const [error,setError]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const mounted=React.useRef(false),refreshing=React.useRef(false),dirty=React.useRef(false);
  const openRef=React.useRef(onOpenRequested);
  const handledOpen=React.useRef(0);
  openRef.current=onOpenRequested;
  const refresh=React.useCallback(async()=>{
    if(refreshing.current){dirty.current=true;return;}
    refreshing.current=true;
    try{
      const next=await call('list');
      if(!mounted.current)return;
      setState(next);setError('');
      if(next.openRequestedAt>0&&next.openRequestedAt!==handledOpen.current){
        handledOpen.current=next.openRequestedAt;
        setFilter('pending');setOpened(true);
        openRef.current?.();
        void call('clear-open').catch(()=>{});
      }
    }catch(e){if(mounted.current)setError(String(e?.message||e).slice(0,160));}
    finally{
      refreshing.current=false;
      if(dirty.current){dirty.current=false;if(mounted.current)void refresh();}
    }
  },[]);
  React.useEffect(()=>{
    mounted.current=true;void refresh();
    const listener=(changes,area)=>{
      if(area==='local'&&changes['opendesk.update-notice.state.v1'])void refresh();
    };
    chrome?.storage?.onChanged?.addListener(listener);
    return ()=>{mounted.current=false;chrome?.storage?.onChanged?.removeListener(listener);};
  },[refresh]);
  const act=async(key,action)=>{
    setBusy(true);
    try{await call('action',{key,action});await refresh();}
    finally{setBusy(false);}
  };
  const saveMode=async(mode,toolId=null)=>{
    setBusy(true);
    try{setState(await call('set-mode',{mode,toolId}));setError('');}
    catch(e){setError('设置未确认：'+String(e?.message||e).slice(0,140));}
    finally{setBusy(false);}
  };
  return {state,opened,setOpened,filter,setFilter,error,busy,refresh,act,saveMode};
}

export function UpdateNoticeSlot({surface='sidebar',controller,onOpenReview=()=>false}){
  const {state,opened,setOpened,filter,setFilter,error,busy,refresh,act,saveMode}=controller;
  const trigger=React.useRef(null),dialog=React.useRef(null);
  React.useEffect(()=>{
    if(!opened)return;
    const before=document.activeElement;
    const panel=dialog.current;
    panel?.focus({preventScroll:true});
    const onEscape=event=>{
      if(event.key!=='Escape'||event.defaultPrevented)return;
      if(document.querySelector('[aria-modal="true"]'))return;
      event.preventDefault();event.stopImmediatePropagation();
      trigger.current?.focus({preventScroll:true});setOpened(false);
    };
    document.addEventListener('keydown',onEscape,true);
    return ()=>{
      document.removeEventListener('keydown',onEscape,true);
      if(panel?.contains(document.activeElement)||document.activeElement===panel)
        (trigger.current?.isConnected?trigger.current:before)?.focus?.({preventScroll:true});
    };
  },[opened,setOpened]);
  const records=state.records||[];
  const pending=records.filter(row=>row.kind==='sidebar-tool'&&
    ['available','review_required'].includes(row.status)&&row.ignoredAt===null);
  const history=records.filter(row=>row.kind==='sidebar-tool'&&!pending.includes(row));
  const browsers=records.filter(row=>row.kind==='browser');
  const shown=filter==='pending'?pending:filter==='history'?history:browsers;
  const count=state.verified?state.badgeCount:0;
  return <aside className={'od-update-slot'+(surface==='app'?' is-app':'')}
    aria-label="OpenDesk 更新中心">
    <button ref={trigger} className="od-update-trigger" type="button"
      title={count?'更新中心 · '+count+' 项待更新':'更新中心'}
      aria-label={'更新中心'+(count?'，'+count+' 项扩展待更新':'')}
      aria-haspopup="dialog" aria-expanded={opened} aria-controls="od-update-panel"
      onClick={()=>{setOpened(!opened);if(!opened)void refresh();}}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5 9a8 8 0 0 1 14-2l1 1M19 15a8 8 0 0 1-14 2l-1-1"/></svg>
      <span className="od-update-trigger-label">{surface==='app'?'更新中心':'更新'}</span>
      {count>0&&<span className="od-update-trigger-count" aria-hidden="true">{count>9?'9+':count}</span>}
    </button>
    {opened&&<section ref={dialog} tabIndex={-1} id="od-update-panel" role="dialog"
      aria-modal="false" aria-labelledby="od-update-title"
      className="od-update-panel">
      <header className="od-update-head"><div>
        <strong id="od-update-title">更新中心</strong>
        <span>{state.verified?state.actionableCount+' 项工具更新待处理':'正在核验发行与安装状态'}</span>
      </div><button type="button" aria-label="关闭更新中心"
        onClick={()=>{trigger.current?.focus({preventScroll:true});setOpened(false);}}>×</button></header>
      {error&&<p role="alert" className="od-update-error">{error}</p>}
      {!state.verified&&<p className="od-update-warning" role="status">
        更新核验尚未完成。历史记录可以查看，当前不可执行更新。
        {state.problem?'（'+state.problem+'）':''}
      </p>}
      <div className="od-update-tabs" role="group" aria-label="更新记录类型">
        <button type="button" aria-pressed={filter==='pending'} onClick={()=>setFilter('pending')}>待更新 ({state.verified?state.actionableCount:0})</button>
        <button type="button" aria-pressed={filter==='history'} onClick={()=>setFilter('history')}>历史 ({history.length})</button>
        <button type="button" aria-pressed={filter==='browser'} onClick={()=>setFilter('browser')}>浏览器 ({browsers.length})</button>
      </div>
      <div className="od-update-release-list" aria-live="polite">
        {shown.length?shown.map(row=><ReleaseDetail key={row.key} row={row}
          onUpdate={act} onOpenReview={onOpenReview} surface={surface}
          verified={state.verified} busy={busy}/>)
          :<p className="od-update-empty">{filter==='pending'?'暂无待处理更新':
             filter==='history'?'暂无更新历史':'暂无浏览器本体更新记录'}</p>}
      </div>
      <details className="od-update-preferences">
        <summary>提醒设置</summary>
        <div className="od-update-options">
          <label htmlFor="od-update-global-mode">提醒方式</label>
          <select id="od-update-global-mode" value={state.globalMode} disabled={busy}
            onChange={event=>void saveMode(event.currentTarget.value)}>
            {Object.entries(modeLabels).map(([key,value])=><option key={key} value={key}>{value}</option>)}
          </select>
        </div>
        <p>静默仅隐藏主动网页提醒和数字角标；更新仍可在这里查看。</p>
        {state.globalMode==='toast+inbox'&&<div className="od-update-per-tool">
          <strong>各工具提醒方式</strong>
          {[...new Map(records.filter(row=>row.kind==='sidebar-tool')
            .map(row=>[row.id,row])).values()].map(row=><label key={row.id}>
            <span>{row.title}</span>
            <select value={state.toolModes?.[row.id]||'toast+inbox'} disabled={busy}
              onChange={event=>void saveMode(event.currentTarget.value,row.id)}>
              {Object.entries(modeLabels).map(([key,value])=><option key={key} value={key}>{value}</option>)}
            </select></label>)}
        </div>}
      </details>
      <footer className="od-update-foot">工具安装仍由原可信安装器审阅；浏览器本体由 Chrome 管理。</footer>
    </section>}
  </aside>;
}
