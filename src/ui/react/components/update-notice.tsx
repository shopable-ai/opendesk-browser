import * as React from 'react';

const PROTOCOL='opendesk.update-notice.v1';
const empty={records:[],newCount:0,globalMode:'toast+inbox',toolModes:{},
  openRequestedAt:0,verified:false,problem:null};
const modeLabels={'toast+inbox':'网页提醒 + 更新入口','inbox-only':'仅更新入口','silent':'静默（保留历史）'};
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
function ReleaseDetail({row,onUpdate,onOpenReview,busy}){
  const [working,setWorking]=React.useState(false);
  const [message,setMessage]=React.useState('');
  const needsUpdate=['available','review_required'].includes(row.status);
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
      // The original trusted Installer is the only next action; this is not install.
      await onUpdate(row.key,'view');
      if(await onOpenReview?.(row)!==true)
        setMessage('请在「扩展」中选择本工具的「审阅更新」；现有安装不变。');
    }catch(error){setMessage('审阅入口未开启：'+String(error?.message||error).slice(0,120));}
    finally{setWorking(false);}
  };
  return <section className="od-update-release" aria-label={row.title+' 的更新'}>
    <div className="od-update-release-head"><strong>{row.title}</strong>
      <span className="od-update-release-status">{status}</span></div>
    <div className="od-update-release-meta">
      {row.kind==='browser'?'Chrome 扩展本体':'Sidebar Tool'}
      {row.fromVersion?' · v'+row.fromVersion+' → v'+row.version:' · v'+row.version}
      {row.source?' · '+row.source:''}
    </div>
    <p className="od-update-release-description">
      {row.kind==='browser'?'Chrome 管理浏览器扩展本体的应用与升级；此处不提供跳过安装操作。':
        row.status==='unknown'?'安装来源、权限或结果尚未完成可信核验。请先检查现有安装记录。':
        '更新只提供新候选。旧版继续运行，点击审阅不会自动安装。'}
    </p>
    {row.sha256&&<div className="od-update-release-hash" title={row.sha256}>
      包 SHA-256：<code>{row.sha256}</code></div>}
    {row.newCapabilities?.length>0&&<div className="od-update-release-permissions">
      <strong>新增能力，须单独确认：</strong>
      <span>{row.newCapabilities.join('、')}</span></div>}
    <div className="od-update-release-actions">
      {needsUpdate&&row.kind==='sidebar-tool'&&
        <button type="button" onClick={review} disabled={working||busy}>审阅并更新</button>}
      {needsUpdate&&row.viewedAt===null&&row.ignoredAt===null&&
        <button type="button" onClick={()=>action('view')} disabled={working||busy}>查看更新</button>}
      {needsUpdate&&row.ignoredAt===null&&row.dismissedAt===null&&row.viewedAt===null&&
        <button type="button" onClick={()=>action('snooze')} disabled={working||busy}>稍后</button>}
      {needsUpdate&&row.ignoredAt===null&&
        <button type="button" onClick={()=>action('ignore')} disabled={working||busy}>忽略本版本</button>}
    </div>
    {message&&<p role="alert" className="od-update-error">{message}</p>}
  </section>;
}
export function UpdateNoticeSlot({surface='sidebar',activeTab='tools',onOpenTools=()=>false,
  onOpenReview=()=>false}){
  const [state,setState]=React.useState(empty);
  const [opened,setOpened]=React.useState(false);
  const [error,setError]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const [filter,setFilter]=React.useState('pending');
  const trigger=React.useRef(null);
  const dialog=React.useRef(null);
  const active=React.useRef(true);
  const refreshing=React.useRef(false);
  const refresh=React.useCallback(async()=>{
    if(refreshing.current)return;
    refreshing.current=true;
    try{
      const next=await call('list');
      if(!active.current)return;
      setState(next);setError('');
      if(next.openRequestedAt>0){
        setOpened(true);setFilter('pending');
        void call('clear-open').catch(()=>{});
      }
    }catch(e){if(active.current)setError(String(e?.message||e).slice(0,160));}
    finally{refreshing.current=false;}
  },[]);
  React.useEffect(()=>{
    active.current=true;void refresh();
    const listener=(changes,area)=>{
      if(area==='local'&&changes['opendesk.update-notice.state.v1'])void refresh();
    };
    chrome?.storage?.onChanged?.addListener(listener);
    return ()=>{active.current=false;chrome?.storage?.onChanged?.removeListener(listener);};
  },[refresh]);
  React.useEffect(()=>{
    if(!opened)return;
    const before=document.activeElement;
    dialog.current?.focus({preventScroll:true});
    const esc=event=>{
      if(event.key==='Escape'&&!event.defaultPrevented){
        event.preventDefault();setOpened(false);
      }
    };
    document.addEventListener('keydown',esc);
    return ()=>{
      document.removeEventListener('keydown',esc);
      if(!dialog.current||dialog.current.contains(document.activeElement))
        (trigger.current?.isConnected?trigger.current:before)?.focus?.({preventScroll:true});
    };
  },[opened]);
  const act=async(key,action)=>{
    setBusy(true);
    try{
      await call('action',{key,action});
      await refresh();
    }finally{setBusy(false);}
  };
  const saveMode=async(mode,toolId=null)=>{
    setBusy(true);
    try{const result=await call('set-mode',{mode,toolId});setState(result);setError('');}
    catch(e){setError('设置未确认：'+String(e?.message||e).slice(0,140));}
    finally{setBusy(false);}
  };
  const records=state.records||[];
  const pending=records.filter(row=>['available','review_required','pending_browser_apply'].includes(row.status)&&
    row.ignoredAt===null);
  const shown=filter==='pending'?pending:records;
  const visible=state.newCount>0||records.length>0||activeTab==='tools';
  if(!visible)return null;
  return <aside className={'od-update-slot'+(surface==='app'?' is-app':'')}
    aria-label="OpenDesk 更新通知中心">
    <button ref={trigger} className="od-update-trigger" type="button"
      aria-expanded={opened} aria-controls="od-update-panel" onClick={()=>{
        setOpened(value=>!value);if(!opened)void refresh();
      }}>
      {state.newCount>0&&<span className="od-update-new">NEW</span>}
      <span>{state.newCount>0?state.newCount+' 项扩展有更新':'更新记录'}</span>
    </button>
    {opened&&<section ref={dialog} tabIndex={-1} id="od-update-panel"
      className="od-update-panel" aria-label="扩展更新详情和历史">
      <header className="od-update-head"><div>
        <strong>扩展更新</strong><span>可信候选 · 人工审阅 · 安装记录</span>
      </div><button type="button" aria-label="关闭更新中心" onClick={()=>setOpened(false)}>×</button></header>
      {error&&<p role="alert" className="od-update-error">{error}</p>}
      {!state.verified&&<p className="od-update-warning" role="status">
        发行目录或本机状态尚未完成可信核验。仅可查看已保存记录；不可凭此断言新版本可安装。
        {state.problem?'（'+state.problem+'）':''}
      </p>}
      <div className="od-update-options">
        <label htmlFor="od-update-global-mode">提醒方式</label>
        <select id="od-update-global-mode" value={state.globalMode} disabled={busy}
          onChange={event=>void saveMode(event.currentTarget.value)}>
          {Object.entries(modeLabels).map(([key,value])=><option key={key} value={key}>{value}</option>)}
        </select>
      </div>
      <div className="od-update-tabs" role="group" aria-label="更新记录筛选">
        <button type="button" aria-pressed={filter==='pending'} onClick={()=>setFilter('pending')}>待处理 ({pending.length})</button>
        <button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>全部记录 ({records.length})</button>
      </div>
      <div className="od-update-release-list">
        {shown.length?shown.map(row=><ReleaseDetail key={row.key} row={row}
          onUpdate={act} onOpenReview={onOpenReview} busy={busy}/>)
          :<p className="od-update-empty">{filter==='pending'?'暂无待处理更新':'暂无可信更新记录'}</p>}
      </div>
      {filter==='all'&&state.globalMode==='toast+inbox'&&
        <div className="od-update-per-tool">
          <strong>独立工具的提醒偏好</strong>
          {[...new Map(records.filter(row=>row.kind==='sidebar-tool')
            .map(row=>[row.id,row])).values()].map(row=><label key={row.id}>
            <span>{row.title}</span>
            <select value={state.toolModes?.[row.id]||'toast+inbox'} disabled={busy}
              onChange={event=>void saveMode(event.currentTarget.value,row.id)}>
              {Object.entries(modeLabels).map(([key,value])=><option key={key} value={key}>{value}</option>)}
            </select></label>)}
        </div>}
      <footer className="od-update-foot"><span>Chrome 本体更新由 Chrome 管理</span>
        {surface!=='app'&&<button type="button" onClick={()=>{
          if(onOpenTools()!==false)setOpened(false);
        }}>扩展管理</button>}</footer>
    </section>}
  </aside>;
}
