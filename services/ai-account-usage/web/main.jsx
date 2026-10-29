import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createApi, time, duration, sampleStale, accountStale, matches} from './model.mjs';
import './style.css';
const api = createApi();
const source = value => ({USAGE_RESPONSE:'用量响应', OAUTH_CACHE:'OAuth 缓存', ADMIN_ENTERED:'管理员录入'}[value] ?? '未知');
function Windows({account, now}) {
  return account.windows?.length ? <div className="windows">{account.windows.map(w => <div className="window" key={w.windowKey}>
    <strong>{w.limitId} · {duration(w.durationSeconds)} · {w.slot}</strong>
    <span>剩余 {w.remainingPercent ?? '未知'}% · 已用 {w.usedPercent ?? '未知'}%</span>
    <meter min="0" max="100" value={w.remainingPercent ?? 0} aria-label={`${duration(w.durationSeconds)} 剩余额度`} />
    <small className={sampleStale(account,w,now) ? 'warning' : ''}>{sampleStale(account,w,now) ? '过期样本' : '缓存样本'} · 采样 {time(w.observedAt)}</small>
    <small>预计重置 {time(w.resetsAt)}</small>
  </div>)}</div> : <span className="muted">尚无成功额度样本</span>;
}
function Field({label, value, origin}) {
  return <div><dt>{label}</dt><dd>{value ?? '未知'}{origin && <small>来源：{source(origin)}</small>}</dd></div>;
}
function Drawer({account, now, close, refresh, busy, error}) {
  const dialog = useRef(null);
  const [history,setHistory] = useState(null), [historyError,setHistoryError] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => {dialog.current?.close(); if (previous?.isConnected) previous.focus();};
  }, []);
  useEffect(() => {
    let active = true;
    api.history(account.alias).then(value => {if(active) setHistory(value);}, () => {if(active) setHistoryError('历史加载失败。关闭详情后可重新打开。');});
    return () => {active=false;};
  }, [account.alias]);
  const i = account.identity;
  return <dialog ref={dialog} className="drawer" aria-labelledby="detail-title" onCancel={event => {event.preventDefault(); close();}}>
    <header className="drawer-head"><div><small>账号详情</small><h2 id="detail-title">{account.displayName}</h2><span>{account.alias}</span></div><button autoFocus onClick={close} aria-label="关闭账号详情">关闭 ×</button></header>
    <section><h3>实际身份</h3><dl className="detail-grid">
      <Field label="账号 ID" value={i?.accountId}/><Field label="用户 ID" value={i?.userId}/>
      <Field label="邮箱" value={i?.email} origin={i?.emailSource ?? 'UNKNOWN'}/><Field label="姓名" value={i?.displayName} origin={i?.displayNameSource ?? 'UNKNOWN'}/>
      <Field label="身份采样时间" value={time(i?.observedAt)}/><Field label="管理员备注 / 标签" value={account.displayName} origin="ADMIN_ENTERED"/>
      <Field label="认证模式" value={account.lastAttempt?.mode}/><Field label="最近尝试" value={account.lastAttempt?.status}/>
      <Field label="尝试时间" value={time(account.lastAttempt?.checkedAt)}/><Field label="结果原因" value={account.lastAttempt?.reason}/>
      <Field label="响应套餐" value={account.providerPlan?.code}/><Field label="套餐来源" value={account.providerPlan?.source}/>
      <Field label="管理员套餐" value={account.subscription?.tierLabel} origin={account.subscription?.source ?? 'UNKNOWN'}/>
      <Field label="订阅到期" value={time(account.subscription?.membershipExpiresAt)} origin={account.subscription?.source ?? 'UNKNOWN'}/>
      <Field label="下次账单" value={time(account.subscription?.nextBillingAt)} origin={account.subscription?.source ?? 'UNKNOWN'}/>
    </dl></section>
    <section><div className="toolbar"><h3>额度窗口</h3><button disabled={busy} onClick={() => refresh(account.alias)}>{busy ? '正在刷新…' : '手动刷新额度'}</button></div>{error && <p role="alert" className="error">{error}</p>}<Windows account={account} now={now}/></section>
    <section><h3>最近历史（最多 20 条）</h3><p className="muted">历史为已保存观察，刷新额度不会自动重载历史；重新打开详情可读取新记录。</p>
      {historyError ? <p role="alert" className="error">{historyError}</p> : !history ? <p role="status">正在读取历史…</p> : <>
        {!history.observations.length ? <p>尚无采样历史。</p> : <div className="table-scroll"><table><thead><tr><th>采样时间</th><th>窗口</th><th>剩余</th><th>预计重置</th></tr></thead><tbody>{[...history.observations].reverse().map((row,index) => <tr key={index}><td>{time(row.observedAt)}</td><td>{row.limitId ?? row.windowKey} · {duration(row.durationSeconds)}</td><td>{row.remainingPercent ?? '未知'}%</td><td>{time(row.resetsAt)}</td></tr>)}</tbody></table></div>}
        <h4>重置观察</h4>{!history.rollovers.length ? <p>尚无重置观察。</p> : <ul>{[...history.rollovers].reverse().map((row,index) => <li key={index}>{time(row.detectedAt)} · {row.windowKey} · {row.type} · 证据质量 {row.estimateQuality}</li>)}</ul>}
      </>}
    </section>
  </dialog>;
}
function App() {
  const [accounts,setAccounts] = useState(null), [loadError,setLoadError] = useState('');
  const [query,setQuery] = useState(''), [filter,setFilter] = useState('all'), [selected,setSelected] = useState(null);
  const [busy,setBusy] = useState({}), [errors,setErrors] = useState({}), [now,setNow] = useState(Date.now());
  const pending = useRef(new Set());
  useEffect(() => {let active=true; api.accounts().then(value => {if(active) setAccounts(value);}, error => {if(active) setLoadError(error.message);}); return () => {active=false;};}, []);
  // Time labels age locally; this timer never performs network requests.
  useEffect(() => {const id=setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id);}, []);
  async function refresh(alias) {
    if (pending.current.has(alias)) return;
    pending.current.add(alias); setBusy(old => ({...old,[alias]:true})); setErrors(old => ({...old,[alias]:''}));
    try {const account=await api.refresh(alias); setAccounts(old => old.map(row => row.alias===alias ? account : row));}
    catch(error) {setErrors(old => ({...old,[alias]:error.message}));}
    finally {pending.current.delete(alias); setBusy(old => ({...old,[alias]:false}));}
  }
  const rows=(accounts ?? []).filter(a => matches(a,query) && (filter==='all' || (filter==='stale' ? accountStale(a,now) : a.lastAttempt?.status !== 'OK')));
  const account=accounts?.find(a => a.alias===selected);
  return <div className="layout"><header className="top"><div className="brand"><span className="logo" aria-hidden="true">OD</span><div><strong>AI 账号额度管理中心</strong><small>独立管理员网页 · 账号、额度窗口与历史</small></div></div><span className="chip">本地管理 · 缓存观察</span></header>
    <nav aria-label="主导航"><a href="#accounts" aria-current="page">账号管理</a></nav>
    <main id="accounts"><div className="heading"><div><h1>账号概览</h1><p>查看保存的额度样本，按需手动查询。</p></div><span>{accounts?.length ?? '—'} 个账号</span></div>
      <aside className="notice">额度不是实时数据。最近尝试失败、样本超过 15 分钟或预计重置时间已过时，旧样本标记为过期。订阅日期来自管理员录入。</aside>
      <div className="toolbar"><label className="search">搜索账号<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="标签、别名、邮箱、姓名或 ID"/></label><label>状态<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部账号</option><option value="stale">过期 / 无样本</option><option value="failed">失败 / 未查询</option></select></label></div>
      {loadError ? <p role="alert" className="error">{loadError}</p> : accounts===null ? <p role="status">正在读取已保存账号…</p> : !accounts.length ? <div className="empty">尚无账号。请通过本地服务配置账号后重新打开页面。</div> : !rows.length ? <p className="empty">没有符合搜索或状态条件的账号。</p> : <div className="table-scroll"><table><caption className="sr-only">已保存账号与额度窗口</caption><thead><tr><th>账号 / 管理员标签</th><th>套餐 / 订阅到期</th><th>动态额度窗口</th><th>状态 / 最近尝试</th><th>操作</th></tr></thead><tbody>{rows.map(a => <tr key={a.alias}>
        <td><strong>{a.identity?.displayName ?? '姓名未知'}</strong><span>{a.identity?.email ?? '邮箱未知'}</span><small>{a.displayName} · {a.alias}</small></td>
        <td>{a.providerPlan?.code ?? '套餐未知'}<small>来源：{a.providerPlan?.source ?? 'UNKNOWN'}</small><small>订阅到期：{time(a.subscription?.membershipExpiresAt)}</small><small>来源：{source(a.subscription?.source)}</small></td>
        <td><Windows account={a} now={now}/></td><td><span className="chip">{a.lastAttempt?.status ?? '尚未查询'}</span><small className={accountStale(a,now) ? 'warning' : ''}>{accountStale(a,now) ? '过期 / 无样本' : '缓存样本'}</small><small>{a.lastAttempt?.mode ?? '模式未知'}</small><small>{time(a.lastAttempt?.checkedAt)}</small></td>
        <td><div className="actions"><button onClick={() => setSelected(a.alias)} aria-label={`查看 ${a.alias} 详情`}>详情 / 历史</button><button disabled={busy[a.alias]} onClick={() => refresh(a.alias)}>{busy[a.alias] ? '正在刷新…' : '刷新额度'}</button></div>{errors[a.alias] && <p role="alert" className="error">{errors[a.alias]}</p>}</td>
      </tr>)}</tbody></table></div>}
    </main>{account && <Drawer key={account.alias} account={account} now={now} close={() => setSelected(null)} refresh={refresh} busy={busy[account.alias]} error={errors[account.alias]}/>}</div>;
}
createRoot(document.getElementById('root')).render(<App/>);
