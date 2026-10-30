import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createApi, time, sampleStale, accountStale, matches} from './model.mjs';
import {createDemoApi, DEMO_DATA_LABEL} from './demo-data.mjs';
import {evaluateHistory, reliableEstimate, windowOptions, windowLabel, selectedWindow,
  canShowWorkspaceGuidance, OFFICIAL_MEMBER_GUIDES, OFFICIAL_WORKSPACE_URL} from './usage-insights.mjs';
import './style.css';

const isDemo = __OD_PREVIEW__;
const api = isDemo ? createDemoApi() : createApi();
const historyLimit = 500; // Read-only aggregate, preserves 20 per-window cycles across multiple windows.
const formatDate = value => value && Number.isFinite(Date.parse(value)) ?
  new Date(value).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}) : '未知';
const percent = value => Number.isFinite(value) ? `${Math.round(value*10)/10}%` : '未知';
const attemptLabel = status => ({OK:'查询成功',AUTH_REQUIRED:'待认证',SCHEMA_UNKNOWN:'响应未知',
  RATE_LIMITED:'查询受限',UNAVAILABLE:'查询失败',IDENTITY_UNVERIFIED:'身份未证实'}[status] ?? '尚未查询');
const decisionLabel = decision => ({attention:'值得关注',observe:'继续观察',insufficient:'数据不足'}[decision] ?? '数据不足');
const sourceLabel = value => ({USAGE_RESPONSE:'额度响应',OAUTH_CACHE:'OAuth 缓存',
  QUOTA_RESPONSE:'用量响应',ADMIN_ENTERED:'管理员录入'}[value] ?? '未知');

function Icon({name}) {
  const paths = {
    history:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 13l3-3 3 2 4-5M7 17h10"/></>,
    refresh:<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.7 9a7 7 0 0 1 12-2L20 12M4 12l2.3 5a7 7 0 0 0 12-2"/></>,
    invite:<><path d="M15 19a6 6 0 0 0-12 0"/><circle cx="9" cy="8" r="4"/><path d="M19 8v8m-4-4h8"/></>,
    close:<><path d="M5 5l14 14M19 5L5 19"/></>,
    search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>
  };
  return <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">{paths[name]}</svg>;
}
function IconButton({name, label, onClick, disabled=false, extra=''}) {
  return <button type="button" className={`icon-btn ${extra}`} aria-label={label}
    title={label} onClick={onClick} disabled={disabled}><Icon name={name}/></button>;
}
function useNativeDialog(ref, close) {
  // Captures and restores the exact invoking button for pointer and keyboard users.
  useEffect(()=>{
    const previous = document.activeElement;
    ref.current.showModal();
    return ()=>{ref.current?.close();if(previous?.isConnected) previous.focus();};
  },[]);
}
function CompactBars({rollovers, windowKey, count=7, expanded=false, onChoose, selected}) {
  const result = evaluateHistory(rollovers,windowKey,count);
  const entries = [...Array(Math.max(0,count-result.displayed.length)).fill(null),...result.displayed];
  return <div className={expanded?'detail-chart':''}>
    <div className="bar-wrap"><div className="bars" style={{'--num':count}}
      role="group" aria-label={`最近 ${count} 次已识别重置前剩余百分比，固定 0 到 100，缺失不是零`}>
      <div className="reference" aria-hidden="true"/>
      {entries.map((row,i)=>{
        const value=reliableEstimate(row)?row.nearResetUnusedEstimatePercent:null;
        const label=row ? `${formatDate(row.priorResetsAt)} 预计重置前：${value===null?'无可靠近重置观测':percent(value)}` : '未识别到该次周期';
        return <button type="button" className={`bar-btn ${row?'':'bar-unseen'}`}
          key={row?`${row.priorResetsAt}-${i}`:`empty-${i}`}
          title={label} aria-label={label} disabled={!row || !onChoose}
          aria-pressed={!!row && selected === row.priorResetsAt}
          onClick={()=>row && onChoose?.(row)}>
          {value===null?<span className="bar-missing" aria-hidden="true">—</span>:
            <span className="bar-fill" style={{'--bar-height':`${value}%`}}
              aria-hidden="true"/>}
          {value!==null && value>=80 && <span className="sr-only">超过 80% 关注线</span>}
        </button>;
      })}
    </div>
    {!expanded && <div className="bar-spark-note"><strong>{result.fixedCount}/7</strong><span>已识别周期</span></div>}
    </div>
    {expanded && <div className="bar-spark-note"><span>左旧右新 · 80% 虚线 · — 表示缺失</span><span>已识别 {result.displayed.length} 次</span></div>}
  </div>;
}
function IntroSummary({accounts, data}) {
  const loaded=accounts.filter(a=>data[a.alias]?.status==='ready');
  const attention=loaded.filter(a=>windowOptions(a,data[a.alias].data).some(w=>
    evaluateHistory(data[a.alias].data.rollovers,w.key).decision==='attention')).length;
  const missing=loaded.filter(a=>!windowOptions(a,data[a.alias].data).some(w=>
    evaluateHistory(data[a.alias].data.rollovers,w.key).reliableCount>=4)).length;
  return <div className="status-strip" aria-label="账号历史概览">
    <span><strong>{accounts.length}</strong> 个账号</span><span className="strip-sep" aria-hidden="true"/>
    <span><strong>{attention}</strong> 个值得关注</span><span className="strip-sep" aria-hidden="true"/>
    <span><strong>{missing}</strong> 个证据不足</span>
    <span className="strip-note">{loaded.length} / {accounts.length} 个账号已读取历史 · 关注规则固定最近 7 次</span>
  </div>;
}
function Row({account, record, scope, onDetail, onInvite, onRefresh, busy, refreshError, now}) {
  const history=record?.status==='ready'?record.data:null;
  const choice=selectedWindow(account,history,scope);
  const summary=history&&choice?evaluateHistory(history.rollovers,choice.key):null;
  const current=account.windows?.find(w=>w.windowKey===choice?.key);
  const loading=record?.status!=='ready';
  const plan=account.subscription?.tierLabel || account.providerPlan?.code?.toUpperCase() ||
    account.providerPlan?.family?.replace('UNKNOWN','') || '未知';
  const guidance=canShowWorkspaceGuidance(account);
  const show=(event=null)=>onDetail(account.alias,choice?.key??null,event?.priorResetsAt??null);
  return <tr>
    <td className="col-id"><button className="account-name" type="button" onClick={()=>show()}>{account.displayName}</button>
      <span className="account-mail">{account.identity?.email??'邮箱未知'}</span>
      <span className="account-alias">{account.identity?.displayName && account.identity.displayName !== account.displayName ?
        account.identity.displayName+' · ':''}{account.alias}</span></td>
    <td className="col-plan"><div className="plan"><strong>{plan}</strong><span className="plan-source">{sourceLabel(account.subscription?.source)}</span></div>
      <span className="meta-line">到期 {formatDate(account.subscription?.membershipExpiresAt)}</span>
      <span className="meta-line">负责 / 标签：{account.displayName}</span>
      <div className="cache"><strong>{current && Number.isFinite(current.remainingPercent)?`当前缓存剩余 ${percent(current.remainingPercent)}`:'当前缓存未知'}</strong>
        {current && <span className={sampleStale(account,current,now)?'stale':'muted'}>· {sampleStale(account,current,now)?'过期':'缓存'}</span>}</div></td>
    <td className="col-chart">{choice?<><div className="window-head"><strong>{windowLabel(choice)}</strong><span>最近 7 次</span></div>
      {record?.status==='error'?<span className="error">历史读取失败</span>:loading?<span className="working" role="status">读取历史…</span>:
        <CompactBars rollovers={history.rollovers} windowKey={choice.key} onChoose={show}/>}</>:
        <span className="muted">{scope==='all'?'暂无额度窗口':'此账号无所选额度窗口'}</span>}</td>
    <td className="col-summary">
      {record?.status==='error'?<span className="decision insufficient">读取失败</span>:
        loading?<span className="decision insufficient">读取中</span>:
        <><span className={`decision ${summary?.decision??'insufficient'}`}>{decisionLabel(summary?.decision)}</span>
          <span className="sum-line"><strong>{percent(summary?.average)}</strong> · 可靠均值</span>
          <span className="sum-detail">≥80% {summary?.highCount??0} 次 · 可靠 {summary?.reliableCount??0}/7</span></>}
      <span className="meta-line">{attemptLabel(account.lastAttempt?.status)} · {formatDate(account.lastAttempt?.checkedAt)}</span>
    </td>
    <td className="col-actions"><div className="actions">
      <IconButton name="history" label={`查看 ${account.displayName} 历史证据`} onClick={()=>show()} extra="important"/>
      <IconButton name="refresh" label={`手动刷新 ${account.displayName} 额度`} disabled={busy || isDemo} onClick={()=>onRefresh(account.alias)}/>
      <IconButton name="invite" label={guidance?`查看 ${account.displayName} 的官方工作区邀请指引`:'个人账号或组织权限未核验，不能分享登录会话'}
        disabled={!guidance} onClick={()=>onInvite(account.alias)}/>
    </div>{refreshError && <div className="row-error" role="alert">{refreshError}</div>}</td>
  </tr>;
}
function Field({label,value}){return <div className="cell"><small>{label}</small><strong>{value??'未知'}</strong></div>;}
function Evidence({event,account}) {
  if(!event)return <p className="muted">尚无已识别重置周期。预测变动不视为真实重置。</p>;
  const ok=reliableEstimate(event);
  return <dl className="evidence">
    <div><dt>所选周期预计重置</dt><dd>{time(event.priorResetsAt)}</dd></div>
    <div><dt>最后前置观测</dt><dd>{time(event.lastPreResetSampleAt)}</dd></div>
    <div><dt>距离预计重置</dt><dd>{Number.isFinite(event.leadSeconds)?`${Math.round(event.leadSeconds/60)} 分钟`:'未知'}</dd></div>
    <div><dt>近重置剩余估计</dt><dd>{ok?percent(event.nearResetUnusedEstimatePercent):'缺失 · 不计入均值'}</dd></div>
    <div className="span2"><dt>证据等级</dt><dd>{ok?'近重置观测（估计值，非精确浪费量）':'证据不足（虽已识别跨越，但无可靠近重置采样）'}</dd></div>
  </dl>;
}
function Drawer({account, summaryHistory, initialWindow, initialCycle, close, refresh, busy, error, invite, now}) {
  const dialog=useRef(null);useNativeDialog(dialog,close);
  const [windowKey,setWindowKey]=useState(initialWindow);
  const [count,setCount]=useState(7);
  const [cycleKey,setCycleKey]=useState(initialCycle);
  const [detail,setDetail]=useState({status:'loading'});
  const options=windowOptions(account,summaryHistory);
  const choice=options.find(w=>w.key===windowKey)??options[0]??null;
  useEffect(()=>{
    if(!choice){setDetail({status:'ready',data:{observations:[],rollovers:[]}});return;}
    let active=true;setDetail({status:'loading'});
    api.history(account.alias,{limit:20,windowKey:choice.key}).then(value=>{
      if(active)setDetail({status:'ready',data:value});
    },()=>{if(active)setDetail({status:'error'});});
    return ()=>{active=false;};
  },[account.alias,choice?.key]);
  const result=evaluateHistory(detail.status==='ready'?detail.data.rollovers:[],choice?.key,count);
  const event=result.displayed.find(row=>row.priorResetsAt===cycleKey)??result.displayed.at(-1)??null;
  return <dialog ref={dialog} className="drawer" aria-labelledby="detail-title"
    onCancel={e=>{e.preventDefault();close();}}>
    <div className="drawer-head"><div><span className="eyebrow">账号历史证据</span><h2 id="detail-title">{account.displayName}</h2><p>{account.identity?.email??'邮箱未知'} · {account.alias}</p></div>
      <IconButton name="close" label="关闭详情" onClick={close}/></div>
    <div className="drawer-body">
      <div className="profile">
        <Field label="会员类型" value={account.subscription?.tierLabel??account.providerPlan?.code?.toUpperCase()??'未知'}/>
        <Field label="已知到期时间" value={formatDate(account.subscription?.membershipExpiresAt)}/>
        <Field label="负责人 / 管理标签" value={account.displayName}/>
      </div>
      <section className="drawer-section"><div className="drawer-controls"><h3>最近重置前的剩余额度</h3>
        <div className="mini-toggle" role="group" aria-label="详情显示的历史周期数量">
          {[7,10,20].map(n=><button type="button" key={n} aria-pressed={count===n}
            onClick={()=>setCount(n)}>{n} 次</button>)}</div></div>
        <div className="drawer-controls"><div className="mini-toggle" role="group" aria-label="切换独立额度窗口">
          {options.map(w=><button type="button" key={w.key} aria-pressed={choice?.key===w.key} onClick={()=>{setWindowKey(w.key);setCycleKey(null);}}>{windowLabel(w)}</button>)}
          {!options.length&&<span className="muted">暂无窗口</span>}</div></div>
        {detail.status==='error'?<p role="alert" className="error">该窗口历史读取失败；不显示估算结论。</p>:
          detail.status==='loading'?<p role="status">正在读取该窗口的真实历史…</p>:
          <><CompactBars rollovers={detail.data.rollovers} windowKey={choice?.key} count={count} expanded
            selected={event?.priorResetsAt} onChoose={row=>setCycleKey(row.priorResetsAt)}/>
            <p className="chart-caption">最近 {count} 次是展示范围；“值得关注”始终依据最近 7 次已识别周期中的可靠观测计算，不是最近 7 天。</p>
            <div className="status-strip"><span className={`decision ${result.decision}`}>{decisionLabel(result.decision)}</span>
              <span>可靠均值 <strong>{percent(result.average)}</strong></span>
              <span>≥80% <strong>{result.highCount}</strong> 次</span>
              <span>可靠样本 <strong>{result.reliableCount}/7</strong></span></div>
            <h3>所选柱子的历史证据</h3><Evidence event={event} account={account}/></>}
      </section>
      <section className="drawer-section"><h3>管理操作</h3>
        <div className="drawer-actions"><button className="outline" type="button" disabled={busy || isDemo}
          onClick={()=>refresh(account.alias)}>{busy?'正在刷新…':'手动刷新当前额度'}</button>
          <button className="outline" type="button" disabled={!canShowWorkspaceGuidance(account)}
            onClick={()=>invite(account.alias)}>官方工作区邀请指引</button></div>
        {error && <p role="alert" className="error">{error}</p>}
        <p className="chart-caption">当前剩余是最近一次缓存观测；以上柱图是历史重置前估计，两者不可混用。</p>
      </section>
      <section className="drawer-section"><details className="secondary"><summary>完整资料、查询状态与未证实事件</summary>
        <dl className="secondary">
          <dt>缓存额度窗口</dt><dd>{(account.windows??[]).map(w=>`${w.windowKey}: ${percent(w.remainingPercent)} ${sampleStale(account,w,now)?'(过期)':'(缓存)'}`).join('；')||'无'}</dd>
          <dt>订阅资料来源</dt><dd>{sourceLabel(account.subscription?.source)}</dd>
          <dt>套餐响应来源</dt><dd>{sourceLabel(account.providerPlan?.source)}</dd>
          <dt>身份来源</dt><dd>{sourceLabel(account.identity?.emailSource)}</dd>
          <dt>会员下次账单</dt><dd>{time(account.subscription?.nextBillingAt)}</dd>
          <dt>最近查询状态</dt><dd>{attemptLabel(account.lastAttempt?.status)} · {time(account.lastAttempt?.checkedAt)}</dd>
          <dt>错误原因代码</dt><dd>{account.lastAttempt?.reason??'未知'}</dd>
          <dt>未证实事件</dt><dd>{(summaryHistory?.rollovers??[]).filter(r=>r.type!=='CROSSED_PREDICTED_RESET').length} 条（不用于均值）</dd>
        </dl>
      </details></section>
    </div>
  </dialog>;
}
function InviteDialog({account,close}) {
  const dialog=useRef(null);useNativeDialog(dialog,close);
  const plan=account.providerPlan?.family?.toUpperCase?.()??'UNKNOWN';
  const url=plan==='BUSINESS'?OFFICIAL_MEMBER_GUIDES.BUSINESS:OFFICIAL_MEMBER_GUIDES.ENTERPRISE;
  return <dialog ref={dialog} className="invite" aria-labelledby="invite-title" onCancel={e=>{e.preventDefault();close();}}>
    <div className="drawer-head"><div><span className="eyebrow">官方组织成员管理</span><h2 id="invite-title">邀请新员工</h2>
      <p>{account.displayName} · 仅提供合规操作路径</p></div>
      <IconButton name="close" label="关闭邀请指引" onClick={close}/></div>
    <div className="drawer-body">
      <div className="invite-row"><span>目标工作区</span><strong>尚未核验（需在官方工作区中选择）</strong></div>
      <div className="invite-row"><span>接收方式</span><strong>由官方工作区按邮箱邀请</strong></div>
      <div className="invite-row"><span>邀请有效期</span><strong>未知 · 以官方页面为准</strong></div>
      <div className="invite-row"><span>操作结果</span><strong>尚未发起邀请</strong></div>
      <p className="invite-notice">本地额度服务没有组织管理员权限或邀请 API。套餐名称不能证明管理身份。请在官方工作区的「设置 → 成员」中确认工作区、身份和席位后，由官方系统发出邀请。个人账号 Cookie、Token、登录会话不会作为邀请链接分享。</p>
      <div className="invite-links"><a className="primary" href={OFFICIAL_WORKSPACE_URL} target="_blank" rel="noopener noreferrer">打开官方 ChatGPT</a>
        <a className="outline" href={url} target="_blank" rel="noopener noreferrer">查看官方成员管理说明</a></div>
    </div>
  </dialog>;
}
function App() {
  const [accounts,setAccounts]=useState(null),[loadError,setLoadError]=useState('');
  const [records,setRecords]=useState({}),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
  const [scope,setScope]=useState('all'),[sort,setSort]=useState('attention');
  const [selected,setSelected]=useState(null),[inviting,setInviting]=useState(null);
  const [busy,setBusy]=useState({}),[errors,setErrors]=useState({}),[now,setNow]=useState(Date.now());
  const pending=useRef(new Set());
  useEffect(()=>{let active=true;api.accounts().then(rows=>{if(active)setAccounts(rows);},error=>{if(active)setLoadError(error.message);});
    return ()=>{active=false;};},[]);
  // Time ageing is local; this timer NEVER refreshes quotas or performs a request.
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60_000);return ()=>clearInterval(timer);},[]);
  const aliases=(accounts??[]).map(a=>a.alias).join('|');
  useEffect(()=>{
    if(!accounts?.length)return;
    let stopped=false,next=0;const rows=accounts;
    const worker=async()=>{
      while(!stopped && next<rows.length){
        const alias=rows[next++].alias;
        try{const data=await api.history(alias,{limit:historyLimit});
          if(!stopped)setRecords(old=>({...old,[alias]:{status:'ready',data}}));}
        catch{if(!stopped)setRecords(old=>({...old,[alias]:{status:'error'}}));}
      }
    };
    void Promise.all(Array.from({length:Math.min(4,rows.length)},()=>worker()));
    return ()=>{stopped=true;};
  },[aliases]);
  async function refresh(alias) {
    if(isDemo || pending.current.has(alias))return;
    pending.current.add(alias);setBusy(old=>({...old,[alias]:true}));setErrors(old=>({...old,[alias]:''}));
    try{
      const account=await api.refresh(alias);setAccounts(old=>old.map(a=>a.alias===alias?account:a));
      try{const data=await api.history(alias,{limit:historyLimit});setRecords(old=>({...old,[alias]:{status:'ready',data}}));}
      catch{setRecords(old=>({...old,[alias]:{status:'error'}}));}
    }catch(error){setErrors(old=>({...old,[alias]:error.message}));}
    finally{pending.current.delete(alias);setBusy(old=>({...old,[alias]:false}));}
  }
  const rows=useMemo(()=>{
    const list=(accounts??[]).filter(a=>matches(a,query)).filter(a=>{
      const record=records[a.alias],history=record?.status==='ready'?record.data:null;
      const choice=selectedWindow(a,history,scope);
      const decision=choice&&history?evaluateHistory(history.rollovers,choice.key).decision:null;
      if(filter==='attention')return decision==='attention';
      if(filter==='insufficient')return record?.status==='ready' && (!choice||decision==='insufficient');
      if(filter==='stale')return accountStale(a,now)||a.lastAttempt?.status!=='OK';
      return true;
    });
    const score=a=>{const record=records[a.alias],history=record?.status==='ready'?record.data:null;
      const choice=selectedWindow(a,history,scope);
      const stat=history&&choice?evaluateHistory(history.rollovers,choice.key):null;
      return stat?stat.decision==='attention'?2:stat.decision==='observe'?1:0:0;};
    list.sort((a,b)=>sort==='name'?a.displayName.localeCompare(b.displayName,'zh-CN'):
      sort==='average-high'||sort==='average-low'?(()=>{
        const value=x=>{const h=records[x.alias]?.data,c=selectedWindow(x,h,scope);
          return h&&c?evaluateHistory(h.rollovers,c.key).average:null;};
        const aa=value(a),bb=value(b);
        if(aa===null)return bb===null?0:1;if(bb===null)return -1;
        return sort==='average-high'?bb-aa:aa-bb;
      })():score(b)-score(a)||a.displayName.localeCompare(b.displayName,'zh-CN'));
    return list;
  },[accounts,records,query,filter,scope,sort,now]);
  const account=accounts?.find(a=>a.alias===selected?.alias);
  const inviteAccount=accounts?.find(a=>a.alias===inviting);
  const openDetails=(alias,windowKey,cycleKey)=>setSelected({alias,windowKey,cycleKey});
  return <div className="shell">
    <header className="app-header"><div className="brand"><span className="mark" aria-hidden="true">OD</span>
      <div><strong>AI 账号额度管理中心</strong><small>企业账号 · 历史使用决策</small></div></div>
      <div className="head-right">{isDemo&&<span className="tag demo-tag">{DEMO_DATA_LABEL}</span>}
        <span className="tag">本机授权 · 手动刷新</span></div></header>
    <main><div className="page-title"><div><h1>账号使用概览</h1>
      <p>对比最近 7 次已识别重置前的剩余额度，发现长期未充分使用的账号。</p></div>
      <span className="legend"><i/> 80% 参考线 · 缺失 ≠ 0</span></div>
      {loadError?<p className="error" role="alert">{loadError}</p>:accounts===null?<p role="status">正在读取本机账号列表…</p>:<>
      <IntroSummary accounts={accounts} data={records}/>
      <div className="controls" aria-label="账号搜索和视图设置">
        <label className="search"><span className="sr-only">搜索账号、邮箱或别名</span>
          <span className="magnifier"><Icon name="search"/></span>
          <input type="search" placeholder="搜索账号、邮箱、别名…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <label className="control-label">筛选 <select value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">全部账号</option><option value="attention">值得关注</option>
          <option value="insufficient">数据不足</option><option value="stale">过期 / 查询失败</option></select></label>
        <label className="control-label">排序 <select value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="attention">关注优先</option><option value="average-high">均值从高到低</option>
          <option value="average-low">均值从低到高</option><option value="name">账号名称</option></select></label>
        <div className="scope" role="group" aria-label="比较的额度窗口">
          {[['all','可用窗口'],['short','短周期'],['long','长周期']].map(([value,label])=>
            <button type="button" key={value} aria-pressed={scope===value} onClick={()=>setScope(value)}>{label}</button>)}</div>
      </div>
      {!accounts.length?<div className="empty">尚未配置账号。请先通过现有本地服务登记授权账号。</div>:
      !rows.length?<div className="empty">没有符合筛选条件的账号。尝试清除搜索或切换额度窗口。</div>:
      <div className="table-wrap"><table className="accounts"><caption className="sr-only">账号、会员资料、7 次历史剩余和管理结论</caption>
        <thead><tr><th className="col-id" scope="col">账号身份</th><th className="col-plan" scope="col">会员 / 当前缓存</th>
          <th className="col-chart" scope="col">最近 7 次重置前剩余</th><th className="col-summary" scope="col">管理结论</th>
          <th className="col-actions" scope="col">操作</th></tr></thead>
        <tbody>{rows.map(a=><Row key={a.alias} account={a} record={records[a.alias]} scope={scope} now={now}
          onDetail={openDetails} onInvite={setInviting} onRefresh={refresh} busy={!!busy[a.alias]} refreshError={errors[a.alias]}/>)}</tbody></table></div>}
      <div className="foot-note"><strong>统计口径：</strong>可靠估计仅来自已识别跨越预测重置、且有近重置观测的周期。固定最近 7 次，至少 4 次可靠、其中至少 3 次剩余 ≥80% 才标记“值得关注”。最近 7 次并非最近 7 天；所有当前额度都是缓存。</div>
      </>}
    </main>
    {account&&<Drawer key={account.alias} account={account} summaryHistory={records[account.alias]?.data}
      initialWindow={selected.windowKey} initialCycle={selected.cycleKey} close={()=>setSelected(null)}
      refresh={refresh} busy={!!busy[account.alias]} error={errors[account.alias]}
      invite={setInviting} now={now}/>}
    {inviteAccount&&<InviteDialog account={inviteAccount} close={()=>setInviting(null)}/>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
