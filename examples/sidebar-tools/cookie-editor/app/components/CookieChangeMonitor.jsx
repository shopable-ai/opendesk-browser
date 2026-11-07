import * as React from 'react';
import {createCookieObservation} from '../controller/cookie-observation.js';

export default function CookieChangeMonitor({adapter,controller,available,stale=false,canApply=()=>true,changes=[],onlyChanged,onOnlyChanged}){
  const [state,setState]=React.useState({phase:'idle',expiresAt:0,gap:false});
  const [clock,setClock]=React.useState(Date.now);
  const gate=React.useRef(false);
  gate.current={available,canApply};
  const [observer]=React.useState(()=>createCookieObservation({adapter,controller,onChange:setState,
    canRun:()=>gate.current.available&&gate.current.canApply()&&document.visibilityState!=='hidden'}));
  React.useEffect(()=>{
    if(!available)observer.stop();
  },[available,observer]);
  React.useEffect(()=>{
    const visibility=()=>{if(document.visibilityState==='hidden')observer.stop();};
    document.addEventListener('visibilitychange',visibility);
    return ()=>{
      document.removeEventListener('visibilitychange',visibility);
      observer.dispose();
    };
  },[observer]);
  React.useEffect(()=>{
    if(state.phase!=='running')return;
    setClock(Date.now());
    const timer=window.setInterval(()=>{setClock(Date.now());void observer.poll();},500);
    return ()=>window.clearInterval(timer);
  },[observer,state.phase]);
  const running=state.phase==='running',starting=state.phase==='starting';
  const count=kind=>changes.filter(row=>row.kind===kind).length;
  const status=running?'监听中 · '+Math.min(30,Math.max(0,Math.ceil((state.expiresAt-clock)/1000)))+' 秒':
    starting?'正在开启监听':state.phase==='error'?'监听未连接':state.phase==='ended'?'本次监听已结束':
    !available?'同步已暂停':stale?'同步待恢复':'自动同步';
  return <section className="cookie-change-monitor" aria-label="Cookie 变化监听">
    <div className="cookie-monitor-controls">
      <span className={'cookie-monitor-state'+(running?' is-listening':'')}>{status}</span>
      <button type="button" className="od-button od-button--quiet cookie-monitor-button"
        disabled={!running&&(!available||starting||!adapter.supportsObservation())}
        title="监听当前页面可用的非分区 Cookie 的内容或属性变化，不读取原值；30 秒后自动结束。"
        onClick={()=>running?observer.stop('ended'):void observer.start()}>
        {running?'停止监听':'监听30秒'}
      </button>
    </div>
    {running&&<p className="cookie-monitor-note">监听当前页面的非分区 Cookie；不自动读取原值。</p>}
    {changes.length>0&&<>
      <div className="cookie-change-controls">
        <span role="status" aria-live="polite" aria-atomic="true">
          新增 {count('added')} · 更新 {count('updated')} · 删除 {count('removed')}
        </span>
        <button type="button" className="od-button od-button--quiet cookie-monitor-button"
          aria-pressed={onlyChanged} onClick={()=>onOnlyChanged(!onlyChanged)}>仅看变化</button>
        <button type="button" className="od-button od-button--quiet cookie-monitor-button"
          onClick={()=>{onOnlyChanged(false);controller.clearChanges();}}>清除标记</button>
      </div>
      {changes.some(row=>row.kind==='removed')&&<p className="cookie-change-removals">
        已删除：{changes.filter(row=>row.kind==='removed').slice(0,3).map(row=>row.name).join('、')}
        {count('removed')>3?' 等 '+count('removed')+' 项':''}
      </p>}
      {changes.length===100&&<p className="cookie-monitor-note">仅保留最近 100 项变化，清除标记可重新观察。</p>}
    </>}
    {state.gap&&<p className="cookie-monitor-note" role="status">变化较快，部分事件已合并；列表已重新同步，变化记录可能不完整。</p>}
    {state.phase==='error'&&<p className="cookie-monitor-note" role="status">本次监听不可用，可重新开启；普通自动同步仍按网站权限运行。</p>}
  </section>;
}
