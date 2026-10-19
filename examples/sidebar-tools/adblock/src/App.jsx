import * as React from 'react';
import {Card,CardContent,Switch,Button} from '@opendesk/ui';
import {valid,verified,confirmed,siteHost} from './model.js';

const siteCopy={
  navigating:'页面正在导航，加载完成后可管理本站。',
  incognito:'隐身页面不可管理网站例外。',
  unsupported:'仅支持普通 HTTP(S) 网站。',
  unavailable:'当前网站身份暂不可用，请切换标签页后重试。'
};
const errorText=error=>String(error?.message||error||'操作失败').slice(0,220);
function Status({state,loading}){
  const known=verified(state)&&state.toolEnabled===true&&!state.restartRequired;
  const active=Boolean(known&&state.enabled);
  const label=loading?'正在核对 Chrome…':!state?'Chrome 状态未知':
    state.toolEnabled===false?'工具已停用':state.restartRequired?'需要重载扩展':
    state.permissions?.dnr!==true?'过滤权限不可用':!verified(state)?'DNR 尚未确认':
    active?'保护已开启':'保护已关闭';
  return <span className={'adblock-state '+(active?'is-on':known?'is-off':'is-unknown')} role="status">
    <span className="adblock-dot" aria-hidden="true"/>{label}
  </span>;
}
function App(){
  const [state,setState]=React.useState(null);
  const [loading,setLoading]=React.useState(true);
  const [busy,setBusy]=React.useState(false);
  const [notice,setNotice]=React.useState('');
  const [problem,setProblem]=React.useState(false);
  const [view,setView]=React.useState('overview');
  const alive=React.useRef(true),reading=React.useRef(0),locked=React.useRef(false);
  const queued=React.useRef(false),current=React.useRef(null);
  const contextRevision=React.useRef(0);
  const api=globalThis.OpenDeskTool;
  const refresh=React.useCallback(async(silent=false)=>{
    if(locked.current){queued.current=true;return;}
    const turn=++reading.current;
    if(!silent)setLoading(true);
    try{
      if(typeof api?.request!=='function')throw Error('AdBlock Host 未就绪');
      const next=await api.request('adblock.status',{});
      if(!valid(next))throw Error('Chrome DNR 状态数据不完整');
      if(!alive.current||turn!==reading.current||locked.current)return;
      current.current=next;setState(next);setProblem(false);setNotice('');
    }catch(error){
      if(!alive.current||turn!==reading.current||locked.current)return;
      current.current=null;setState(null);setProblem(true);
      setNotice('无法核实 Chrome 状态：'+errorText(error));
    }finally{if(alive.current&&turn===reading.current)setLoading(false);}
  },[api]);
  const operate=React.useCallback(async(operation,payload={})=>{
    if(locked.current||!current.current)return;
    let needsReadback=false;
    locked.current=true;reading.current++;
    const operationContext=contextRevision.current;
    setBusy(true);setProblem(false);setNotice('请在可信宿主中确认此次操作…');
    try{
      const result=await api.request(operation,payload);
      const checked=await api.request('adblock.status',{});
      if(operationContext!==contextRevision.current){
        needsReadback=true;
        if(alive.current){
          current.current=null;setState(null);setProblem(true);
          setNotice('页面或工具在确认期间已切换，旧操作结果不用于当前网页；正在重新读取 Chrome 状态。');
        }
        return;
      }
      if(!confirmed(result,checked,operation,payload))throw Error('Chrome DNR 规则回读不一致');
      if(!alive.current)return;
      current.current=checked;setState(checked);
      setNotice(operation==='adblock.site.set'||operation==='adblock.site.restore'
        ?'设置已由 Chrome 确认；请刷新目标网页。'
        :checked.enabled?'Chrome 已确认开启过滤。':'Chrome 已确认关闭过滤。');
    }catch(error){
      if(!alive.current)return;
      if(operationContext!==contextRevision.current){
        needsReadback=true;current.current=null;setState(null);setProblem(true);
        setNotice('页面或工具已切换，之前的操作结果不确定；正在读取当前 Chrome 状态。');
        return;
      }
      const cancelled=error?.code==='E_CANCELLED'||/cancel|取消/i.test(errorText(error));
      if(cancelled)setNotice('已取消，未提交这次更改。');
      else{
        current.current=null;setState(null);setProblem(true);
        needsReadback=true;
        setNotice('结果未确认（'+String(error?.code||'E_ADBLOCK')+'）：'+errorText(error)+'。正在重新读取 Chrome 状态，不会自动重试写入。');
      }
    }finally{
      locked.current=false;
      if(alive.current){setBusy(false);setLoading(false);
        if(queued.current||needsReadback){queued.current=false;void refresh(true);}}
    }
  },[api,refresh]);
  React.useEffect(()=>{
    alive.current=true;
    const onVisible=()=>{if(!document.hidden)void refresh(true);};
    const onPageChanged=()=>{
      // Invalidate both pending status reads and any already-confirmed write
      // whose result belongs to a previous tab, page or tool generation.
      contextRevision.current++;
      reading.current++;
      current.current=null;setState(null);setLoading(true);
      if(locked.current)queued.current=true;
      void refresh();
    };
    const onMessage=event=>{
      if(event.source!==globalThis.parent)return;
      if(event.data?.protocol==='opendesk.adblock.ui.v1'&&event.data?.kind==='settings')
        setView('settings');
    };
    document.addEventListener('visibilitychange',onVisible);
    globalThis.addEventListener('focus',onVisible);
    globalThis.addEventListener('message',onMessage);
    api?.root?.addEventListener?.('opendesk-page-changed',onPageChanged);
    api?.root?.addEventListener?.('opendesk-tool-state-changed',onPageChanged);
    const interval=setInterval(()=>{if(!document.hidden)void refresh(true);},12000);
    void refresh();
    return ()=>{alive.current=false;reading.current++;clearInterval(interval);
      document.removeEventListener('visibilitychange',onVisible);
      globalThis.removeEventListener('focus',onVisible);
      globalThis.removeEventListener('message',onMessage);
      api?.root?.removeEventListener?.('opendesk-page-changed',onPageChanged);
      api?.root?.removeEventListener?.('opendesk-tool-state-changed',onPageChanged);};
  },[refresh]);
  const ready=Boolean(verified(state)&&state.toolEnabled===true&&!state.restartRequired);
  const on=Boolean(ready&&state.enabled);
  const host=siteHost(state);
  const exceptions=Array.isArray(state?.exceptions)?state.exceptions:[];
  const siteOn=Boolean(on&&host&&!exceptions.includes(host));
  const switchLocked=loading||busy||!ready;
  const siteLocked=switchLocked||!on||!host;
  const canRestore=ready&&!busy&&!loading;
  const back=<Button variant="secondary" className="adblock-back" onClick={()=>setView('overview')}
    aria-label="返回广告拦截概览">← 返回</Button>;
  return <div className="adblock-app">
    {view==='overview'?<>
      <Card><CardContent className="adblock-card">
        <div className="adblock-control-row">
          <div className="adblock-copy"><strong>全局保护</strong><Status state={state} loading={loading}/></div>
          <Switch isSelected={on} isDisabled={switchLocked}
            onChange={value=>void operate(value?'adblock.enable':'adblock.disable')}
            aria-label="全局广告拦截"/>
        </div>
        {state?.restartRequired?<p className="adblock-help">过滤尚未就绪。请保存工作并重新加载 OpenDesk Browser 扩展，然后手动开启。</p>:null}
        {state?.permissions?.dnr===false?<p className="adblock-help">Chrome 必选广告过滤权限不可用，无法确认清理完成；请检查扩展状态后重新读取。</p>:null}
      </CardContent></Card>
      <Card><CardContent className="adblock-card">
        <div className="adblock-control-row">
          <div className="adblock-copy"><strong>当前网站</strong>
            <span className="adblock-host">{host||'当前网页不可管理'}</span></div>
          <Switch isSelected={siteOn} isDisabled={siteLocked}
            onChange={value=>{if(host)void operate('adblock.site.set',{host,filtering:value});}}
            aria-label="当前网站广告过滤"/>
        </div>
        <p className="adblock-help">{host?(!on?'开启全局保护后可管理本站。':
          siteOn?'正在过滤本站匹配的第三方广告请求。':'本站已加入例外列表。'):
          siteCopy[state?.currentSite?.status]||'等待 Chrome 读取当前网站身份。'}</p>
      </CardContent></Card>
      <Card><CardContent className="adblock-card">
        <div className="adblock-control-row"><div className="adblock-copy">
          <strong>内置过滤规则</strong>
          <span className="adblock-muted">{Number.isInteger(state?.domainCount)?state.domainCount+' 个离线域名':'离线规则'} · 不提供未经核实的拦截计数</span>
        </div></div>
      </CardContent></Card>
      <Button className="adblock-link" variant="secondary" onClick={()=>setView('exceptions')}>
        已停用的网站 <span>{exceptions.length}</span><span aria-hidden="true">→</span>
      </Button>
    </>:view==='exceptions'?<>
      <div className="adblock-page-head">{back}<strong>已停用的网站</strong><span>{exceptions.length}</span></div>
      <Card><CardContent className="adblock-exceptions">
        {!state?<p className="adblock-help">例外状态未确认，恢复操作不可用。</p>:
          !exceptions.length?<p className="adblock-empty">暂无网站例外</p>:
          exceptions.map(host=><div className="adblock-exception" key={host}>
            <div className="adblock-copy"><strong>{host}</strong><span className="adblock-muted">此网站的广告过滤已停用</span></div>
            <Button disabled={!canRestore} onClick={()=>void operate('adblock.site.restore',{host})}
              aria-label={'恢复 '+host+' 的广告过滤'}>恢复</Button>
          </div>)}
      </CardContent></Card>
    </>:<>
      <div className="adblock-page-head">{back}<strong>设置说明</strong></div>
      <Card><CardContent className="adblock-card">
        <strong>过滤范围</strong><p className="adblock-help">使用 OpenDesk Browser 内置离线 DNR 规则，仅对符合规则的第三方请求生效。</p>
        <strong>网站例外</strong><p className="adblock-help">关闭本站过滤可加入例外；例外列表支持逐个恢复。</p>
        <strong>网页异常</strong><p className="adblock-help">更改后请刷新网页；遇到异常可暂时关闭全局保护。</p>
        <Button variant="secondary" onClick={()=>setView('exceptions')}>管理网站例外</Button>
      </CardContent></Card>
    </>}
    <div className="adblock-footer"><Button variant="secondary" disabled={busy}
      onClick={()=>void refresh()} aria-label="重新读取 Chrome 广告过滤状态">↻ 刷新状态</Button></div>
    {notice?<p className="adblock-notice" data-error={problem?'true':'false'} role={problem?'alert':'status'}>{notice}</p>:null}
  </div>;
}
export default App;
