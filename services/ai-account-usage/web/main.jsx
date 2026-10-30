import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createApi, time, sampleStale, accountStale, matches} from './model.mjs';
import {createDemoApi, DEMO_DATA_LABEL} from './demo-data.mjs';
import {evaluateHistory, reliableEstimate, windowOptions, windowLabel, selectedWindow,
  projectAccountView, summarizeVisibleAccounts, canShowWorkspaceGuidance,
  OFFICIAL_MEMBER_GUIDES, OFFICIAL_WORKSPACE_URL} from './usage-insights.mjs';
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
      role="group" aria-label={`最近 ${count} 次已识别重置前剩余百分比，固定 0 到 100，80% 虚线参考线，缺失不是零`}>
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
            <span className={`bar-fill ${value>=80?'high':''}`} style={{'--bar-height':`${value}%`}}
              aria-hidden="true"/>}
          {value!==null && value>=80 && <span className="sr-only">超过 80% 关注线</span>}
        </button>;
      })}
    </div>
    </div>
    {expanded && <div className="bar-spark-note"><span>左旧右新 · 80% 虚线 · — 表示缺失</span><span>已识别 {result.displayed.length} 次</span></div>}
  </div>;
}
function IntroSummary({rows, allCount, records, scope}) {
  const stats=summarizeVisibleAccounts(rows,records,scope);
  return <div className="status-strip" aria-label="当前筛选结果与各行所示窗口的统计">
    <span><strong>{stats.total}</strong> / {allCount} 个账号</span>
    <span className="strip-sep" aria-hidden="true"/>
    <span><strong>{stats.attention}</strong> 个值得关注</span>
    <span className="strip-sep" aria-hidden="true"/>
    <span><strong>{stats.insufficient}</strong> 个数据不足</span>
    {stats.notApplicable>0&&<span className="strip-caveat">{stats.notApplicable} 个无所选窗口</span>}
    {stats.errors>0&&<span className="strip-caveat">{stats.errors} 个历史读取失败</span>}
    <span className="strip-note">仅当前筛选 · 按各行窗口 · 历史已读 {stats.loaded}/{stats.total}</span>
  </div>;
}
function Row({account,record,scope,onDetail,onInvite,onRefresh,busy,refreshError,now}) {
  const {history,choice,summary,state}=projectAccountView(account,record,scope);
  const current=account.windows?.find(w=>w.windowKey===choice?.key);
  const plan=account.subscription?.tierLabel || account.providerPlan?.code?.toUpperCase() ||
    account.providerPlan?.family?.replace('UNKNOWN','') || '未知';
  const title=account.displayName?.trim() || '未命名账号';
  const issue=account.lastAttempt?.status!=='OK'?attemptLabel(account.lastAttempt?.status):null;
  const guidance=canShowWorkspaceGuidance(account);
  const expired=current?sampleStale(account,current,now):true;
  const show=(event=null)=>onDetail(account.alias,choice?.key??null,event?.priorResetsAt??null);
  const shouldRefresh=!isDemo&&(issue||!current||expired||state==='error');
  return <tr>
    <td className="col-id"><div className="identity-top">
      <button className="account-name" title={title} type="button" onClick={()=>show()}>{title}</button>
      {issue&&<span className="account-status" title={attemptLabel(account.lastAttempt?.status)}>{issue}</span>}
      </div><span className="account-mail" title={account.identity?.email??'邮箱未知'}>{account.identity?.email??'邮箱未知'}</span></td>
    <td className="col-plan"><strong className="plan-name">{plan}</strong>
      <span className="meta-line">到期 {formatDate(account.subscription?.membershipExpiresAt)}</span></td>
    <td className="col-current"><strong className="quota-value" title="最近一次缓存额度，非实时数据">
      {choice?(current&&Number.isFinite(current.remainingPercent)?percent(current.remainingPercent):'未知'):'—'}</strong>
      {choice&&<span className={expired?'quota-cache expired':'quota-cache'}>{current?(expired?'已过期':'缓存'):'无样本'}</span>}</td>
    <td className="col-chart">{choice?<><div className="window-head"><strong>{windowLabel(choice)}</strong></div>
      {state==='error'?<span className="error">历史读取失败</span>:
       state==='loading'?<span className="working" role="status">读取历史…</span>:
       <CompactBars rollovers={history?.rollovers??[]} windowKey={choice.key} onChoose={show}/>}</>:
       <span className="muted">{scope==='all'?'暂无额度窗口':'无所选额度窗口'}</span>}</td>
    <td className="col-summary">
      {state==='error'?<span className="decision insufficient">历史读取失败</span>:
       state==='loading'?<span className="working" role="status">读取中</span>:
       state==='not-applicable'?<span className="muted">不适用当前窗口</span>:
       <><span className={'decision '+state}>{decisionLabel(state)}</span>
         {summary?.average!=null&&<span className="sum-line"><strong>{percent(summary.average)}</strong> 平均剩余</span>}
         <span className="sum-detail">≥80% {summary?.highCount??0} 次 · 可靠 {summary?.reliableCount??0}/7</span></>}
    </td>
    <td className="col-actions"><div className="actions">
      <IconButton name="history" label={'查看 '+title+' 历史证据'} onClick={()=>show()} extra="important"/>
      {shouldRefresh&&<IconButton name="refresh" label={'手动刷新 '+title+' 额度'} disabled={busy} onClick={()=>onRefresh(account.alias)}/>}
      {guidance&&<IconButton name="invite" label={'查看 '+title+' 的官方工作区邀请指引'} onClick={()=>onInvite(account.alias)}/>}
    </div>{refreshError&&<div className="row-error" role="alert">{refreshError}</div>}</td>
  </tr>;
}
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
    <div className="drawer-head"><div><span className="eyebrow">账号历史证据</span><h2 id="detail-title">{account.displayName}</h2><p>{account.identity?.email??'邮箱未知'}</p></div>
      <IconButton name="close" label="关闭详情" onClick={close}/></div>
    <div className="drawer-body">
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
      <section className="drawer-section"><details className="secondary"><summary>账号资料、来源与诊断</summary>
        <dl className="secondary">
          <dt>技术别名</dt><dd>{account.alias}</dd>
          <dt>管理员标签</dt><dd>{account.displayName}（本地设置，不代表负责人）</dd>
          <dt>会员类型与到期</dt><dd>{account.subscription?.tierLabel??account.providerPlan?.code?.toUpperCase()??'未知'} · {formatDate(account.subscription?.membershipExpiresAt)}</dd>
          <dt>身份资料姓名</dt><dd>{account.identity?.displayName ? account.identity.displayName+'（'+sourceLabel(account.identity.displayNameSource)+'）' : '未知（未获得独立姓名）'}</dd>
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
    <div className="drawer-head"><div><span className="eyebrow">官方工作区</span>
      <h2 id="invite-title">组织成员管理指引</h2>
      <p>{account.displayName} · 仅提供合规操作路径</p></div>
      <IconButton name="close" label="关闭邀请指引" onClick={close}/></div>
    <div className="drawer-body">
      <p className="invite-notice">当前服务不核验工作区管理员身份或席位，也没有邀请 API。尚未发起邀请。请先在官方工作区确认管理权限，再由官方系统按员工邮箱邀请。不得将个人 Cookie、Token 或登录会话当作邀请凭据。</p>
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
      const state=projectAccountView(a,records[a.alias],scope).state;
      if(filter==='attention')return state==='attention';
      if(filter==='insufficient')return state==='insufficient';
      if(filter==='stale')return accountStale(a,now)||a.lastAttempt?.status!=='OK';
      return true;
    });
    const projected=a=>projectAccountView(a,records[a.alias],scope);
    const score=a=>({attention:2,observe:1})[projected(a).state]??0;
    const display=a=>a.displayName||a.identity?.email||'未命名账号';
    list.sort((a,b)=>sort==='name'?display(a).localeCompare(display(b),'zh-CN'):
      sort==='average-high'||sort==='average-low'?(()=>{
        const aa=projected(a).summary?.average??null,bb=projected(b).summary?.average??null;
        if(aa===null)return bb===null?0:1;if(bb===null)return -1;
        return sort==='average-high'?bb-aa:aa-bb;
      })():score(b)-score(a)||display(a).localeCompare(display(b),'zh-CN'));
    return list;
  },[accounts,records,query,filter,scope,sort,now]);
  const account=accounts?.find(a=>a.alias===selected?.alias);
  const inviteAccount=accounts?.find(a=>a.alias===inviting);
  const openDetails=(alias,windowKey,cycleKey)=>setSelected({alias,windowKey,cycleKey});
  return <div className="shell">
    <header className="app-header">
      <div className="brand"><span className="mark" title="OpenDesk" aria-hidden="true">OD</span>
        <h1 id="page-title" className="app-title">AI 账号额度管理</h1></div>
      <div className="head-right">{isDemo&&<span className="tag demo-tag">{DEMO_DATA_LABEL}</span>}</div>
    </header>
    <main aria-labelledby="page-title">
      {loadError?<p className="error" role="alert">{loadError}</p>:accounts===null?<p role="status">正在读取本机账号列表…</p>:<>
      <IntroSummary rows={rows} allCount={accounts.length} records={records} scope={scope}/>
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
        <thead><tr><th className="col-id" scope="col">账号身份</th><th className="col-plan" scope="col">会员资料</th>
          <th className="col-current" scope="col">当前缓存</th><th className="col-chart" scope="col">最近 7 次重置前剩余</th>
          <th className="col-summary" scope="col">管理结论</th><th className="col-actions" scope="col">操作</th></tr></thead>
        <tbody>{rows.map(a=><Row key={a.alias} account={a} record={records[a.alias]} scope={scope} now={now}
          onDetail={openDetails} onInvite={setInviting} onRefresh={refresh} busy={!!busy[a.alias]} refreshError={errors[a.alias]}/>)}</tbody></table></div>}
      <details className="foot-note"><summary>统计规则与数据说明</summary>
        <p>按每个账号独立额度窗口的最近 7 次已识别重置计算；至少 4 次可靠近重置观测且其中 3 次剩余 ≥80% 才值得关注。10/20 次仅改变详情展示范围。缺失不等于 0，最近 7 次不是最近 7 天；当前额度均为缓存。</p></details>
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
