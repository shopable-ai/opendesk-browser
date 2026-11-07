import * as React from 'react';
import {Button} from '@opendesk/ui';
import {CookieIcon, CookieIconButton} from './CookieEditorView.jsx';

const secondary = 'od-button od-button--secondary cookie-button--compact';
const primary = 'od-button od-button--primary cookie-button--compact';
const statuses = {UNCONNECTED:'未连接', CONNECTED:'已配对', DISCONNECTED:'已断开',
  SESSION_EXPIRED:'会话已过期', OUTCOME_UNKNOWN:'结果未知', INVALIDATED:'已失效', RECEIPTS_ONLY:'仅可查回执', RETIRED:'已归档（远端状态未声明）'};
const unresolved = connection => Boolean(connection.pending) || connection.status === 'OUTCOME_UNKNOWN';
const openPending = connection => ['serviceOpen', 'open'].includes(connection?.pending?.action) && connection.pending.canArchive === true;
const fingerprint = value => JSON.stringify(value);
const loopbackHost = hostname => hostname === 'localhost' || hostname.endsWith('.localhost') ||
  hostname === '[::1]' || hostname === '127.0.0.1';
const observedTime = value => {
  if (typeof value !== 'string' && typeof value !== 'number') return '暂无';
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? time.toLocaleString('zh-CN') : '暂无';
};
const percentage = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value + '%' : '暂无';
const checkStatus = value => value===true ? '成功' : value===false ? '无法访问' : ({OK:'成功', FAILED:'失败', NOT_CHECKED:'尚未检查', UNPAIRED:'尚未配对', EXPIRED:'已过期', REVOKED:'已撤销', DENIED:'拒绝访问', UNREACHABLE:'无法访问', UNKNOWN:'未知'})[value] || '尚未检查';
const usageStatus = value => ({OK:'读取成功', SUCCESS:'读取成功', READY:'可用', FRESH:'最新缓存', STALE:'缓存已过期',
  ERROR:'读取失败', UNAVAILABLE:'暂不可用', EMPTY:'暂无缓存', UNKNOWN:'状态未知'})[value] || '状态待核对';
function exactOrigin(value) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && url.origin === value &&
      (url.protocol === 'https:' || url.protocol === 'http:' && loopbackHost(url.hostname));
  } catch { return false; }
}

// HTTP transport, persistence and trusted permission reviews belong to the caller.
export function CookieHttpConnections({origin = '', accounts = [], accountReady = false, state,
  busy = false, notice = '', onAction, onDirtyChange, onAccounts, onDiscardRequest}) {
  const [form, setForm] = React.useState(null);
  const [error, setError] = React.useState('');
  const [working, setWorking] = React.useState(false);
  const [uncertain, setUncertain] = React.useState(null);
  const [resumeFocus, setResumeFocus] = React.useState(false);
  const [detailId, setDetailId] = React.useState(null);
  const [errorField, setErrorField] = React.useState('');
  const lock = React.useRef(false);
  const mounted = React.useRef(true);
  const latest = React.useRef(null);
  const trigger = React.useRef(null);
  const restore = React.useRef(false);
  const heading = React.useRef(null);
  const addButton = React.useRef(null);
  const firstField = React.useRef(null);
  const addressField = React.useRef(null);
  const detailTrigger = React.useRef(null);
  const detailSource = React.useRef(null);
  const detailHeading = React.useRef(null);
  const detailButtons = React.useRef({});
  const connections = state?.connections || [];
  latest.current = {origin, accounts, accountReady, state, busy, onAction, uncertain};
  const unknown = Boolean(uncertain) || connections.some(unresolved);
  React.useEffect(() => {
    if (uncertain && !uncertain.connectionId && state?.revision !== uncertain.revision &&
      Number.isSafeInteger(state?.revision) && !connections.some(unresolved)) setUncertain(null);
  }, [state, uncertain]);
  const unavailable = busy || working || typeof onAction !== 'function' || !Number.isSafeInteger(state?.revision);
  const blocked = unavailable || unknown;
  const available = accounts.filter(account => account.origin === origin);
  const policyBindings = connection => (connection?.bindings || []).filter(binding => !binding.revoked &&
    binding.localAccount?.origin === origin && accountReady && available.some(account =>
      ['origin', 'alias', 'version', 'storeId', 'partitionKey'].every(key =>
        fingerprint(account[key]) === fingerprint(binding.localAccount[key]))));
  const reviewable = connection => {
    const desired = connection?.policy?.desired, scope = desired?.scope;
    return Number.isSafeInteger(desired?.desiredRevision) && desired.desiredRevision > 0 &&
      /^[a-f0-9]{64}$/.test(desired.desiredHash) && scope?.trigger === 'MANUAL' &&
      Number.isSafeInteger(scope.retentionDays) && scope.retentionDays > 0 && scope.retentionDays <= 30 &&
      Array.isArray(scope.dataCategories) && scope.dataCategories.length > 0 &&
      scope.dataCategories.every(category => ['ACCOUNT_METADATA', 'USAGE_SUMMARY'].includes(category)) &&
      Array.isArray(scope.bindingIds) && scope.bindingIds.length > 0 &&
      scope.bindingIds.every(id => policyBindings(connection).some(binding => binding.bindingId === id));
  };
  const dirty = Boolean(form && (form.kind !== 'config' || form.label || form.serviceOrigin ||
    Object.entries(form.drafts || {}).some(([type,draft]) => type !== form.type && (draft.label || draft.serviceOrigin))));
  React.useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  React.useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useLayoutEffect(() => {
    if (form) firstField.current?.focus({preventScroll:true});
    else if (restore.current) {
      restore.current = false;
      const target = trigger.current?.isConnected ? trigger.current : addButton.current || heading.current;
      (heading.current || detailHeading.current)?.scrollIntoView?.({block:'start'});
      target?.focus({preventScroll:true});
    }
  }, [form?.kind, form?.connectionId]);
  React.useLayoutEffect(() => {
    if (resumeFocus && !busy) {
      setResumeFocus(false);
      firstField.current?.focus({preventScroll:true});
    }
  }, [resumeFocus, busy]);
  React.useLayoutEffect(() => {
    if (detailId) detailHeading.current?.focus({preventScroll:true});
    else if (detailTrigger.current) {
      const id = detailTrigger.current;
      detailTrigger.current = null;
      heading.current?.scrollIntoView?.({block:'start'});
      detailButtons.current[id]?.current?.focus({preventScroll:true});
    }
  }, [detailId]);

  const close = () => {
    if (lock.current || latest.current.busy) return;
    const finish = () => {
      if (lock.current) return;
      restore.current = true; setForm(null); setError(''); setErrorField('');
    };
    if (form?.kind === 'config' && dirty && onDiscardRequest) {
      onDiscardRequest(finish, () => setResumeFocus(true));
    } else finish();
  };
  const open = (event, kind, connection, extra = {}) => {
    if (lock.current || latest.current.busy) return;
    trigger.current = event.currentTarget;
    setError(''); setErrorField('');
    setForm({kind, revision:state.revision, origin, accounts:fingerprint(accounts), accountReady,
      connectionId:connection?.id, connection:fingerprint(connection), label:'', serviceOrigin:'',
      alias:'', remoteAccountId:'', code:'', confirmed:false, type:'local', drafts:{}, ...extra});
  };
  const update = patch => { setError(''); setErrorField(''); setForm(previous => ({...previous, ...patch, confirmed:false})); };
  const switchType = type => {
    setError(''); setErrorField('');
    setForm(previous => ({...previous, type, confirmed:false,
      drafts:{...previous.drafts, [previous.type]:{label:previous.label, serviceOrigin:previous.serviceOrigin}},
      ...(previous.drafts[type] || {label:'', serviceOrigin:''})}));
  };
  const fresh = draft => {
    const current = latest.current;
    return current.state?.revision === draft.revision && current.origin === draft.origin &&
      current.accountReady === draft.accountReady && fingerprint(current.accounts) === draft.accounts &&
      (!draft.connectionId || fingerprint(current.state?.connections?.find(item => item.id === draft.connectionId)) === draft.connection);
  };
  const context = connection => ({revision:state.revision, origin, accounts:fingerprint(accounts), accountReady,
    connectionId:connection.id, connection:fingerprint(connection)});
  const dispatch = async (action, payload, draft, read = false) => {
    const current = latest.current;
    if (lock.current || current.busy || typeof current.onAction !== 'function' || !Number.isSafeInteger(current.state?.revision)) return;
    if (!fresh(draft)) { setError('站点、账号或服务状态已变化，请取消后重新核对。已有输入已保留。'); return; }
    if (!read && action !== 'serviceArchiveOpen' && !(action === 'serviceRetire' &&
      current.state.connections.find(item => item.id === payload.connectionId)?.canRetire === true) &&
      (current.uncertain || current.state.connections.some(unresolved))) return;
    lock.current = true; setWorking(true); setError('');
    try {
      const success = await current.onAction(action, {revision:draft.revision, ...payload});
      if (!mounted.current || latest.current.origin!==draft.origin || latest.current.accountReady!==draft.accountReady || fingerprint(latest.current.accounts)!==draft.accounts) return;
      if (success === true || success?.ok === true) {
        if (action === 'serviceStatus' || action === 'serviceReconcile' || action === 'serviceArchiveOpen' || action === 'serviceRetire') {
          setUncertain(previous => previous?.connectionId === payload.connectionId ? null : previous);
        }
        if (action==='serviceReconcile' && success?.state && form?.kind==='connect') {
          const refreshed=success.state.connections.find(item=>item.id===payload.connectionId);
          if(refreshed?.status==='CONNECTED'){setForm(null);setDetailId(refreshed.id);}
          else if(refreshed?.status==='UNCONNECTED'&&!refreshed.pending){
            setForm(previous=>({...previous,...context(refreshed),revision:success.state.revision,code:''}));
            setError('原连接码已无效、过期或已使用。请从目标服务管理页生成新应用连接码，再确认连接。');
          }
        }
        if (!read) {
          if (action==='serviceSave' && success?.state) {
            const result=success.state;
            const added=result.connections.filter(item=>!current.state.connections.some(old=>old.id===item.id));
            const saved=added.length===1&&added[0].origin===payload.serviceOrigin&&added[0].label===payload.label&&added[0].status==='UNCONNECTED' ? added[0] : null;
            if(saved && latest.current.origin===draft.origin && mounted.current){
              setDetailId(saved.id);
              setForm({kind:'connect', revision:result.revision, origin:latest.current.origin,
                accounts:fingerprint(latest.current.accounts), accountReady:latest.current.accountReady,
                connectionId:saved.id, connection:fingerprint(saved), code:'', confirmed:false});
            } else {restore.current=true;setForm(null);setError('配置已保存，请从服务列表核对后继续连接。');}
          } else {
            restore.current = true; setForm(null);
            if(action==='serviceConnect')setDetailId(payload.connectionId);
          }
        }
      } else if (success?.rejected === true) {
        const rejectedConnection=success.state?.connections?.find(item=>item.id===payload.connectionId);
        if(['serviceConnect','serviceReconcile'].includes(action)&&
          ['UNCONNECTED','DISCONNECTED'].includes(rejectedConnection?.status)&&!rejectedConnection.pending){
          setUncertain(previous=>previous?.connectionId===payload.connectionId?null:previous);
          setForm(previous=>previous?.kind==='connect'&&previous.connectionId===payload.connectionId
            ? {...previous,revision:success.state.revision,connection:fingerprint(rejectedConnection),code:'',confirmed:false}
            : previous);
          setError('连接码已无效、过期或已使用。请在目标服务管理页生成新应用连接码，再确认连接。');
        } else setError('操作未执行/已确认拒绝，请核对提示后重新审阅');
      } else {
        if (!read) setUncertain({connectionId:payload.connectionId, action, revision:draft.revision});
        setError(read ? '未能读取服务回执，请检查服务地址与连接状态。' : '操作未获成功确认，已暂停写入。请先读取回执，勿重复提交。');
      }
    } catch {
      if (!mounted.current) return;
      if (!read) setUncertain({connectionId:payload.connectionId, action, revision:draft.revision});
      setError(read ? '暂时无法读取服务，请检查服务是否正在运行。' : '尚未确认操作结果，已暂停写入。请先读取回执，勿重复提交。');
    } finally {
      lock.current = false;
      if (mounted.current) setWorking(false);
    }
  };
  const submit = async event => {
    event?.preventDefault();
    if (!form || lock.current || latest.current.busy) return;
    if (!fresh(form)) { setError('站点、账号或服务状态已变化，请取消后重新核对。已有输入已保留。'); return; }
    const connection = latest.current.state?.connections?.find(item => item.id === form.connectionId);
    if (form.kind === 'config') {
      const label = form.label.trim();
      if (!label || label.length > 64 || /[\x00-\x1f\x7f]/.test(label)) { setErrorField('name'); setError('请填写 1–64 字的服务名称，不含控制字符。'); firstField.current?.focus(); return; }
      if (!exactOrigin(form.serviceOrigin)) { setErrorField('address'); setError('请输入完整服务来源地址：本机 HTTP localhost / 数字回环地址，或 HTTPS 地址；不含尾斜杠、路径、查询、片段或账号密码。'); addressField.current?.focus(); return; }
      return dispatch('serviceSave', {label, serviceOrigin:form.serviceOrigin}, form);
    }
    if (!connection) return;
    if (form.kind === 'connect') {
      if (!/^[a-fA-F0-9]{64}$/.test(form.code)) { setError('请填写应用配对用的 64 位十六进制一次性配对码。'); return; }
      return dispatch('serviceConnect', {connectionId:connection.id, code:form.code.toLowerCase()}, form);
    }
    if (form.kind === 'bind') {
      const account = available.find(item => item.alias === form.alias);
      const resource = connection.resources?.find(item => item.remoteAccountId === form.remoteAccountId);
      if (!accountReady || !account || !Number.isSafeInteger(account.version) || !resource || connection.status !== 'CONNECTED') {
        setError('请选择当前站点已保存的账号和已读取的远端资源。'); return;
      }
      if (!form.confirmed) { setError(''); setForm({...form, confirmed:true}); return; }
      return dispatch('serviceBind', {connectionId:connection.id, alias:account.alias,
        accountVersion:account.version, remoteAccountId:resource.remoteAccountId}, form);
    }
    if (form.kind === 'accept') {
      const desired = connection.policy?.desired;
      if (!reviewable(connection) || connection.status !== 'CONNECTED' ||
        !form.bindingIds.length || !form.dataCategories.length ||
        !form.bindingIds.every(id => desired.scope.bindingIds.includes(id)) ||
        !form.dataCategories.every(category => desired.scope.dataCategories.includes(category)) ||
        !Number.isSafeInteger(form.retentionDays) || form.retentionDays < 1 || form.retentionDays > desired.scope.retentionDays) {
        setError('请选择有效的本站账号绑定、数据类别及保留天数后重新审阅。'); return;
      }
      return dispatch('serviceAcceptPolicy', {connectionId:connection.id, desiredRevision:desired.desiredRevision,
        desiredHash:desired.desiredHash, scope:{bindingIds:form.bindingIds, dataCategories:form.dataCategories,
          trigger:'MANUAL', retentionDays:form.retentionDays}}, form);
    }
    if (form.kind === 'unbind') return dispatch('serviceUnbind', {connectionId:connection.id, bindingId:form.bindingId}, form);
    if (form.kind === 'disconnect') return dispatch('serviceDisconnect', {connectionId:connection.id}, form);
    if (form.kind === 'retire' && connection.canRetire === true) return dispatch('serviceRetire', {connectionId:connection.id}, form);
    if (form.kind === 'archive') return dispatch('serviceArchiveOpen', {connectionId:connection.id}, form);
  };
  const keyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Enter' && event.target?.tagName === 'INPUT' &&
      !event.nativeEvent?.isComposing && !event.isComposing) { event.preventDefault(); void submit(event); }
  };
  const formConnection = connections.find(item => item.id === form?.connectionId);
  const formBlocked = unavailable || unknown && form?.kind !== 'archive' && !(form?.kind === 'retire' && formConnection?.canRetire === true);
  const reconcile = connection => dispatch(connection.pending ? 'serviceReconcile' : 'serviceStatus', {connectionId:connection.id}, context(connection), true);
  const detail = connections.find(connection => connection.id === detailId);
  const company = form?.type === 'company';
  const empty = Boolean(state && !connections.length);
  const needsReview = connection => unresolved(connection) || uncertain?.connectionId===connection.id;
  const connectedCount = connections.filter(connection=>connection.status==='CONNECTED' && !needsReview(connection)).length;
  const showDetail = (connection, source=connection.id) => {detailSource.current=source;setDetailId(connection.id);};
  const listAction = connection => {
    if (needsReview(connection)) return <button type="button" className={secondary} aria-label={'核对原操作：' + connection.label}
      disabled={unavailable || Boolean(form)} onClick={()=>reconcile(connection)}>读取原回执</button>;
    if (connection.status==='CONNECTED') return <button type="button" className={primary} aria-label={'查看服务账号：' + connection.label}
      disabled={unavailable || Boolean(form)} onClick={()=>showDetail(connection)}>{connection.check&&(connection.check.reachable===false||['REVOKED','EXPIRED'].includes(connection.check.session)||['FAILED','DENIED'].includes(connection.check.resources))?'查看检查结果':'查看账号'}</button>;
    if (['UNCONNECTED','DISCONNECTED'].includes(connection.status)) return <button type="button" className={primary} aria-label={'连接服务：' + connection.label}
      disabled={blocked || Boolean(form)} onClick={event=>open(event,'connect',connection)}>继续连接</button>;
    return <button type="button" className={secondary} aria-label={'查看连接状态：' + connection.label} disabled={unavailable || Boolean(form)}
      ref={detailButtons.current[connection.id+':state'] ||= {current:null}}
      onClick={()=>showDetail(connection,connection.id+':state')}>核对状态</button>;
  };
  const pairingPage=form?.kind==='connect';
  return <section className="cookie-http-connections" aria-label="服务连接" data-view={form ? 'config' : detail ? 'detail' : 'list'}>
    {!form && <>
    <header className="cookie-http-list-header">
      {detail ? <><CookieIconButton name="right" className="cookie-http-back" label="返回服务列表" disabled={unavailable || Boolean(form)} onClick={()=>{detailTrigger.current=detailSource.current||detail.id;setDetailId(null);}}/>
        <h3 ref={detailHeading} tabIndex={-1}>服务详情</h3></> : <div className="cookie-http-heading-copy">
          <h3 ref={heading} tabIndex={-1}>服务连接 <small aria-label="服务数量">{state ? connections.length : '—'}</small>
            {connectedCount>0 && <small aria-label="已连接服务数量"> · {connectedCount} 个已配对</small>}</h3>
          <p>添加地址 → 配对 → 查看账号 → 按需关联</p>
        </div>}
      <div className="cookie-http-header-actions">
        <CookieIconButton name="refresh" label="刷新服务列表" appearance="quiet" disabled={unavailable || Boolean(form)}
          onClick={()=>dispatch('serviceStatus', {}, {revision:state.revision, origin, accounts:fingerprint(accounts), accountReady}, true)}/>
        {!empty && <button type="button" aria-label="添加服务" ref={addButton} className={primary} disabled={blocked || Boolean(form)} onClick={event => open(event, 'config')}>＋添加服务</button>}
      </div>
    </header>
    {notice && <p role="status" className="cookie-business-callout">{notice}</p>}
    {error && !form && <p role="alert" className="od-field-error">{error}</p>}
    {!state && <p role="status">服务状态尚未就绪，请等待读取完成。</p>}
    {busy && <p role="status">正在处理服务请求…</p>}
    {empty && <div className="cookie-http-empty"><span className="cookie-http-symbol"><CookieIcon name="plug"/></span>
      <strong>连接你的第一个服务</strong><p>尚未配置服务。先添加地址，再使用应用一次性配对码连接。</p>
      <Button ref={addButton} aria-label="添加服务" variant="primary" disabled={blocked || Boolean(form)} onClick={event=>open(event,'config')}>＋添加服务</Button>
    </div>}
    {unknown && <p role="alert" className="cookie-business-callout">存在未确认结果，所有服务写入已暂停。请读取回执；未知的管理页打开请手动核对后归档，不要重复打开。</p>}
    {uncertain && !uncertain.connectionId && <p>请重新读取应用的服务配置，核对刚才的保存结果后再操作。</p>}
    {!detail && <div className="cookie-http-list">{connections.map(connection => {
      const local = loopbackHost(new URL(connection.origin).hostname);
      const status = needsReview(connection) ? 'OUTCOME_UNKNOWN' : connection.status;
      const count = (connection.bindings || []).filter(binding=>!binding.revoked).length;
      return <article key={connection.id} className="cookie-http-card" aria-label={'服务：' + connection.label}>
      <div className="cookie-http-card-top"><span className={'cookie-http-symbol'+(local?' cookie-http-symbol--local':'')}><CookieIcon name={local ? 'chart' : 'users'}/></span>
        <div className="cookie-http-card-name"><h4>{connection.label}</h4><p><span>{local ? '此电脑' : '公司'} · </span><span>{connection.origin}</span></p></div>
        <span className="cookie-http-status" data-status={status}><CookieIcon name={status==='CONNECTED' ? 'check' : status==='OUTCOME_UNKNOWN' ? 'clock' : status==='UNCONNECTED' || status==='DISCONNECTED' ? 'unplug' : 'info'}/>{statuses[status] || '状态未知'}</span>
      </div>
      <p className="cookie-http-next">{needsReview(connection) ? '原操作结果尚未确认，请读取原回执，勿重新发送。' :
        connection.status==='UNCONNECTED' ? '地址已保存，尚未连接。准备好应用连接码后继续。' :
        connection.status==='CONNECTED' ? (connection.check?.reachable===false ? '上次检查无法访问服务，请确认后台正在运行。' :
          connection.check?.session==='REVOKED' ? '上次检查会话无效或已撤销，请在后台核对设备授权。' :
          ['FAILED','DENIED'].includes(connection.check?.resources) ? '配对事实保留；资源读取失败，请查看检查结果。' : '配对已确认；服务当前可用性以连接检查为准。') :
        connection.status==='DISCONNECTED' ? '服务已确认断开；需要新的应用连接码才能再次连接。' : '请在详情核对原授权与恢复方式。'}</p>
      <div className="cookie-http-card-actions"><span className="cookie-http-associations" role="img" aria-label={'已关联账号：'+count+' 个'} title="已关联账号数；不代表身份已核验或同步已授权"><CookieIcon name="users"/><span aria-hidden="true">关联 <strong>{count}</strong></span></span>
        <div className="cookie-http-row-actions" role="group" aria-label={connection.label+'的操作'}>
        <CookieIconButton name="info" appearance="quiet" label={'服务详情：' + connection.label} disabled={unavailable || Boolean(form)}
          buttonRef={detailButtons.current[connection.id] ||= {current:null}} className="cookie-http-detail-action" onClick={()=>{detailSource.current=connection.id;setDetailId(connection.id);}}/>
        {listAction(connection)}</div>
      </div>
    </article>;})}</div>}
    {connections.filter(connection=>connection.id===detailId).map(connection=><article key={connection.id} className="cookie-business-inquiry" aria-label={'服务：' + connection.label}>
      <h4>{connection.label}</h4><p>{connection.origin}</p>
      <p>{statuses[connection.status] || '状态未知'}{connection.expiresAt ? ' · 会话到期：' + observedTime(connection.expiresAt) : ''}</p>
      {['SESSION_EXPIRED', 'INVALIDATED'].includes(connection.status) && <p>旧记录保留；重新添加此地址并使用新应用配对码连接，不代表旧设备已撤销</p>}
      <div className="cookie-business-actions">
        <button type="button" className={primary} disabled={unavailable || Boolean(form) || needsReview(connection) || ['RETIRED','INVALIDATED','RECEIPTS_ONLY'].includes(connection.status)}
          aria-label={'检查连接：' + connection.label} onClick={()=>dispatch('serviceCheck',{connectionId:connection.id},context(connection),true)}>检查连接</button>
        {<button type="button" className={secondary}
          disabled={blocked || Boolean(form) || !['UNCONNECTED','DISCONNECTED'].includes(connection.status)} aria-label={'连接服务：' + connection.label}
          onClick={event=>open(event,'connect',connection)}>继续连接</button>}
      </div>
      <section className="cookie-http-check" aria-label="连接检查结果" aria-live="polite">
        <h4>检查结果</h4>
        <p>地址：{connection.origin}</p>
        <p>会话到期：{connection.expiresAt ? observedTime(connection.expiresAt) : '尚未建立'}</p>
        <p>检查时间：{observedTime(connection.check?.checkedAt)}</p>
        <dl><div><dt>服务可访问</dt><dd>{checkStatus(connection.check?.reachable)}</dd></div>
          <div><dt>应用会话</dt><dd>{checkStatus(connection.check?.session)}</dd></div>
          <div><dt>账号资源读取</dt><dd>{checkStatus(connection.check?.resources)}</dd></div></dl>
        {connection.check?.message&&<p>{connection.check.message}</p>}
        <p>仅检查已授权服务的会话与资源；不配对、不关联、不续期、不读取 Cookie、不查询上游额度。刷新列表仅重读本地配置。</p>
      </section>
      <h4>服务账号</h4>
      <div className="cookie-business-actions">
        <button type="button" className={secondary} disabled={unavailable || connection.status!=='CONNECTED' || Boolean(form)}
          aria-label={'读取资源：' + connection.label} onClick={()=>dispatch('serviceResources',{connectionId:connection.id},context(connection),true)}>读取服务账号</button>
        {Number.isSafeInteger(connection.resourceCursor)&&connection.resourceCursor>=0&&<button type="button" className={secondary}
          disabled={unavailable || connection.status!=='CONNECTED' || Boolean(form)} aria-label={'读取更多资源：' + connection.label}
          onClick={()=>dispatch('serviceResources',{connectionId:connection.id,cursor:connection.resourceCursor},context(connection),true)}>读取更多账号</button>}
        <button type="button" className={secondary} disabled={blocked || Boolean(form) || connection.status!=='CONNECTED' || !connection.resources?.length}
          onClick={event=>open(event,'bind',connection)} aria-label={'绑定账号：' + connection.label}>关联本站账号（可跳过）</button>
      </div>
      {connection.status === 'CONNECTED' && !connection.resources?.length && <p>{connection.resourceRead?.status==='OK' ? '服务已连接，后台尚未配置账号。请联系管理员添加；关联本站账号可跳过。' : connection.resourceRead?.status==='FAILED' ? '服务已配对，但账号资源读取失败。请查看检查结果或重新读取服务账号。' : '尚未读取服务账号；读取成功前无法判断后台是否有账号。'}</p>}
      {connection.resourceRead?.checkedAt&&<p className="cookie-http-meta">资源来源：{connection.origin} · 读取时间：{observedTime(connection.resourceRead.checkedAt)}</p>}
      {(connection.resources || []).map(resource => {
        const cache = connection.usageCache?.[resource.remoteAccountId];
        const windows = Array.isArray(cache?.windows) ? cache.windows :
          Array.isArray(cache?.account?.windows) ? cache.account.windows : [];
        return <div key={resource.remoteAccountId} className="cookie-business-usage-row">
          <strong>{resource.displayName || resource.remoteAccountId}</strong>
          <p>{resource.providerKey} · {resource.verificationState === 'VERIFIED' ? '已核验' : '未核验（UNVERIFIED）'} · 不传输 Cookie</p>
          <button type="button" className={secondary} disabled={unavailable || connection.status !== 'CONNECTED'}
            aria-label={'读取缓存用量：' + resource.remoteAccountId}
            onClick={() => dispatch('serviceUsage', {connectionId:connection.id, remoteAccountId:resource.remoteAccountId}, context(connection), true)}>读取缓存用量</button>
          {connection.usageErrors?.[resource.remoteAccountId]&&<p role="status">缓存用量读取失败；下方如有旧数据，保留供参考。</p>}
          {cache ? <>
            <p>来源：服务端缓存（未查询上游） · 缓存状态：{!cache.observedAt&&!windows.length&&['UNKNOWN','EMPTY'].includes(cache.status)?'暂无缓存（尚无观测）':usageStatus(cache.status)} · 观测时间：{observedTime(cache.observedAt)}</p>
            {windows.length ? windows.map((window, index) => <p key={index}>
              {window.key === 'primary' || window.slot === 'primary' ? '主要窗口' : window.key === 'secondary' || window.slot === 'secondary' ? '次要窗口' : '用量窗口'}：
              已用 {percentage(window.usedPercent)} · 剩余 {percentage(window.remainingPercent)} · 重置时间：{observedTime(window.resetsAt)}
            </p>) : <p>暂无用量窗口摘要。</p>}
          </> : <p>尚未读取缓存用量。</p>}
        </div>;
      })}
      <details className="cookie-business-disclosure"><summary>更多操作与同步策略</summary>
      <div className="cookie-business-actions">
        {connection.canRetire === true && connection.status !== 'RETIRED' && <button type="button" className={secondary} disabled={unavailable || Boolean(form)}
          aria-label={'归档旧连接：' + connection.label} onClick={event => open(event, 'retire', connection)}>归档旧连接</button>}
        <button type="button" className={secondary} disabled={unavailable || connection.status === 'RETIRED' && !connection.pending} onClick={() => reconcile(connection)}
          aria-label={'读取回执：' + connection.label}>读取回执</button>
        <button type="button" className={secondary} disabled={blocked || connection.status !== 'CONNECTED' || Boolean(form)}
          onClick={() => dispatch('serviceOpen', {connectionId:connection.id, bindingId:''}, context(connection))}
          aria-label={'打开设备管理页：' + connection.label}>打开设备管理页</button>
        <button type="button" className={secondary} disabled={blocked || connection.status !== 'CONNECTED'}
          onClick={() => dispatch('serviceReadPolicy', {connectionId:connection.id}, context(connection), true)}
          aria-label={'读取策略：' + connection.label}>读取策略</button>
        <button type="button" className={secondary} disabled={blocked || Boolean(form) || connection.status !== 'CONNECTED'}
          onClick={event => open(event, 'disconnect', connection)} aria-label={'断开服务：' + connection.label}>断开</button>
        {connection.status !== 'RETIRED' && openPending(connection) &&
          <button type="button" className={secondary} disabled={unavailable || Boolean(form)}
            onClick={event => open(event, 'archive', connection)}>核对并归档未知打开</button>}
      </div>
      {connection.policy && <>
        <p>已读取服务策略；读取不代表批准，不会自动接受或扩大权限。</p>
        <p>已接受策略：{connection.policy.acceptance ? '版本 ' + connection.policy.acceptance.desiredRevision : '尚未接受'}</p>
        {connection.policy.acceptance?.scope && <p>已接受范围：{connection.policy.acceptance.scope.bindingIds?.join('、')} · {connection.policy.acceptance.scope.dataCategories?.join('、')} · {connection.policy.acceptance.scope.trigger} · {connection.policy.acceptance.scope.retentionDays} 天</p>}
        {reviewable(connection) && <button type="button" className={secondary}
          disabled={blocked || Boolean(form) || connection.status !== 'CONNECTED'} aria-label={'审阅同步策略：' + connection.label}
          onClick={event => open(event, 'accept', connection, {bindingIds:[], dataCategories:[], retentionDays:connection.policy.desired.scope.retentionDays})}>审阅同步策略</button>}
      </>}
      </details>
      <h4>本站账号关联</h4>
      {!(connection.bindings||[]).some(binding=>!binding.revoked)&&<p>尚未关联本站账号。关联可跳过；配对与资源读取不依赖关联。</p>}
      {(connection.bindings || []).map(binding => <div key={binding.bindingId} className="cookie-business-usage-row">
        <strong>{binding.localAccount?.alias}</strong>
        <p>{binding.localAccount?.origin} · 账号版本 {binding.localAccount?.version} · 远端资源 {binding.remoteAccountId}</p>
        <p>{binding.revoked ? '已解绑' : '已绑定'} · {binding.verificationState === 'VERIFIED' ? '已核验' : '未核验（UNVERIFIED），不代表同一登录身份'} · 不传输 Cookie</p>
        <button type="button" className={secondary} disabled={blocked || Boolean(form) || binding.revoked || connection.status !== 'CONNECTED'}
          aria-label={'打开资源管理页：' + binding.bindingId}
          onClick={() => dispatch('serviceOpen', {connectionId:connection.id, bindingId:binding.bindingId}, context(connection))}>打开资源管理页</button>
        <button type="button" className={secondary} disabled={blocked || Boolean(form) || binding.revoked || connection.status !== 'CONNECTED'}
          aria-label={'解绑账号：' + binding.bindingId}
          onClick={event => open(event, 'unbind', connection, {bindingId:binding.bindingId})}>解绑</button>
      </div>)}
    </article>)}
    {!detail && <p className="cookie-http-safety"><CookieIcon name="shield"/><span>连接只建立服务入口。账号需单独关联，Cookie 不会自动上传。</span></p>}
    <details className="cookie-business-disclosure"><summary>连接与权限说明</summary>
      <p>需要已实现 OpenDesk 服务协议的账号与额度管理后台。无需安装本机辅助程序；不是任意网址，也不能填写 chatgpt.com。不会扫描端口或自动部署服务。</p>
      <p>会话有效期为 15 分钟。请求仅发往已确认的服务地址，复用安装时批准的网络能力和已有网站访问权限；缺少网站访问权限时，由宿主提示一次授权。</p>
    </details>
    </>}
    {form && <form className="cookie-http-form" aria-label="HTTP 服务连接编辑"
      onSubmit={submit} onKeyDown={keyDown} autoComplete="off">
      <header className="cookie-http-form-header">
        <CookieIconButton name="right" className="cookie-http-back" label={detail ? '返回服务详情' : '返回服务列表'} disabled={working || busy} onClick={close}/>
        <h3>{({config:'添加服务',connect:'配对服务',bind:'关联本站账号',unbind:'确认解绑',disconnect:'确认断开',archive:'归档未知打开',accept:'审阅同步策略',retire:'归档旧连接'})[form.kind]}</h3>
      </header>
      {formConnection && <p>{formConnection.label} · {formConnection.origin}</p>}
      {!fresh(form) && <p role="alert">站点、账号或状态版本已变化。请取消后重新核对，已有输入已保留。</p>}
      {form.kind === 'config' && <>
        <fieldset className="cookie-http-types"><legend>服务类型</legend>
          <div className="cookie-http-type-options">{[['local','此电脑上的服务'],['company','公司服务']].map(([value,label])=><label key={value} className="cookie-http-type-option">
            <input type="radio" name="cookie-http-service-type" value={value} checked={form.type===value} disabled={formBlocked} onChange={()=>switchType(value)}/><span>{label}</span>
          </label>)}</div>
          <p>{company ? '连接公司提供的账号与额度管理服务，向管理员获取服务地址。' : '连接此电脑上已启动的账号额度服务。请保持服务运行。'}</p>
        </fieldset>
        <div className="cookie-http-fields">
        <label className="od-form-field"><span className="od-field-label">服务名称</span><input ref={firstField} className="od-field" aria-label="服务名称" maxLength={64}
          placeholder={company ? '例如：设计团队' : '例如：我的额度服务'} aria-invalid={errorField==='name' || undefined} aria-describedby="cookie-http-name-error"
          value={form.label} disabled={formBlocked} onChange={event => update({label:event.target.value})}/>
          <span id="cookie-http-name-error" role="alert" className="od-field-error" hidden={errorField!=='name'}>{errorField==='name' ? error : ''}</span>
        </label>
        <label className="od-form-field"><span className="od-field-label">服务地址</span><input ref={addressField} className="od-field" aria-label="服务地址" type="text" autoComplete="off" spellCheck={false}
          inputMode="url" placeholder={company ? '粘贴管理员提供的 HTTPS 服务地址' : '粘贴本地服务提供的完整地址'} value={form.serviceOrigin}
          aria-invalid={errorField==='address' || undefined} aria-describedby="cookie-http-address-help cookie-http-address-error"
          disabled={formBlocked} onChange={event => update({serviceOrigin:event.target.value})}/>
          <span id="cookie-http-address-help" className="cookie-http-field-help od-field-help">{company ? '向管理员索取完整 HTTPS 服务地址；应用一次性连接码在保存后填写。' : '在服务管理页「Cookie 同步设置 → 生成新应用连接码」复制服务地址（含端口）。'}</span>
          <span id="cookie-http-address-error" role="alert" className="od-field-error" hidden={errorField!=='address'}>{errorField==='address' ? error : ''}</span>
        </label>
        </div>
        <details className="cookie-business-disclosure cookie-http-setup">
          <summary>服务还没启动，或找不到地址？</summary>
          <p>先启动此电脑上的账号额度服务，并保持运行。在管理页「Cookie 同步设置」生成新应用连接码，复制其中的完整服务地址。未准备好服务时，可先取消，稍后继续。</p>
          <p>本机主机名和端口可能随启动改变，不要替换为 127.0.0.1 或猜测端口。公司服务使用管理员提供的 HTTPS 地址。</p>
          <p>只填来源地址，不带尾斜杠、路径、查询或片段。管理页链接不是服务地址；应用一次性连接码在下一步填写。</p>
        </details>
      </>}
      {form.kind === 'connect' && <>
        <label>应用一次性配对码<input ref={firstField} className="od-field" aria-label="应用一次性配对码" type="password"
          autoComplete="off" spellCheck={false} maxLength={64} value={form.code} disabled={formBlocked}
          onChange={event => update({code:event.target.value})}/></label>
        <p>在上方目标服务的管理页，打开「Cookie 同步设置 → 生成新应用连接码」。连接码为 64 位十六进制，5 分钟有效、仅可使用一次；管理页链接不是连接码。确认连接才会创建设备与 15 分钟应用会话。连接码不会保存到配置。</p>
      </>}
      {form.kind === 'bind' && <>
        <p>当前站点：{origin || '尚未确定'}。仅建立账号关联，不传输 Cookie。</p>
        {!accountReady && <p role="status">账号尚未读取，请先到账号页读取。</p>}
        {accountReady && !available.length && <p>本站点尚无已保存账号。</p>}
        {(!accountReady || !available.length) && typeof onAccounts === 'function' && <button type="button" className={secondary}
          disabled={working || busy} onClick={onAccounts}>前往账号保存</button>}
        <label>本站点账号<select ref={firstField} className="od-field" aria-label="本站点账号" value={form.alias}
          disabled={formBlocked || !accountReady} onChange={event => update({alias:event.target.value})}>
          <option value="">请选择已保存账号</option>{available.map(account => <option key={account.alias} value={account.alias}>{account.displayName || account.alias} · {account.alias}</option>)}
        </select></label>
        <label>远端资源<select className="od-field" aria-label="远端资源" value={form.remoteAccountId} disabled={formBlocked}
          onChange={event => update({remoteAccountId:event.target.value})}>
          <option value="">请选择已读取资源</option>{(formConnection?.resources || []).map(resource => <option key={resource.remoteAccountId}
            value={resource.remoteAccountId}>{resource.displayName || resource.remoteAccountId} · {resource.providerKey} · {resource.verificationState === 'VERIFIED' ? '已核验' : '未核验'}</option>)}
        </select></label>
        {form.confirmed && <div className="cookie-business-callout" aria-label="绑定确认">
          <p>确认将 {form.origin} 的 {available.find(account => account.alias === form.alias)?.displayName || form.alias}（{form.alias}，版本 {available.find(account => account.alias === form.alias)?.version}）关联到 {formConnection?.label}（{formConnection?.origin}）的 {formConnection?.resources?.find(resource => resource.remoteAccountId===form.remoteAccountId)?.displayName || form.remoteAccountId}（{form.remoteAccountId}）？</p>
          <p>未核验（UNVERIFIED）：关联不证明同一登录身份，不传输 Cookie。</p>
        </div>}
      </>}
      {form.kind === 'accept' && <>
        <p>期望版本：{formConnection?.policy?.desired?.desiredRevision} · 摘要：{formConnection?.policy?.desired?.desiredHash}</p>
        <p>仅手动触发（MANUAL），不传输 Cookie。请选择本次明确接受的范围。</p>
        {(formConnection?.policy?.desired?.scope?.bindingIds || []).map(id => <label key={id}>
          <input ref={id === formConnection.policy.desired.scope.bindingIds[0] ? firstField : undefined}
            type="checkbox" aria-label={'批准绑定：' + id} checked={form.bindingIds.includes(id)} disabled={formBlocked}
            onChange={event => update({bindingIds:event.target.checked ? [...form.bindingIds, id] : form.bindingIds.filter(value => value !== id)})}/>
          {id} · {formConnection.bindings?.find(binding => binding.bindingId === id)?.localAccount?.alias}
        </label>)}
        {(formConnection?.policy?.desired?.scope?.dataCategories || []).map(category => <label key={category}>
          <input type="checkbox" aria-label={'批准数据：' + category} checked={form.dataCategories.includes(category)} disabled={formBlocked}
            onChange={event => update({dataCategories:event.target.checked ? [...form.dataCategories, category] : form.dataCategories.filter(value => value !== category)})}/>{category}
        </label>)}
        <label>保留天数<input className="od-field" type="number" aria-label="保留天数" min={1}
          max={formConnection?.policy?.desired?.scope?.retentionDays} value={form.retentionDays} disabled={formBlocked}
          onChange={event => update({retentionDays:Number(event.target.value)})}/></label>
      </>}
      {form.kind === 'unbind' && <p>确认解绑 {form.bindingId}？本地保存的账号和 Cookie 不会删除。</p>}
      {form.kind === 'disconnect' && <p>确认断开此服务？绑定将不可用，本地保存的账号保留。结果以服务回执为准。</p>}
      {form.kind === 'retire' && <p>仅归档旧连接；不表示远端撤销或未知操作失败，原记录保留。未知配对可能已创建设备，请先在后台核对。需新配置和新应用配对码。</p>}
      {form.kind === 'archive' && <p>请先手动核对管理页是否已打开。归档保留操作历史，不表示原打开失败，也不会再次打开管理页。</p>}
      <p id="cookie-http-form-error" role="alert" className="od-field-error" hidden={!error || Boolean(errorField)}>{errorField ? '' : error}</p>
      {error && notice && <p role="status">{notice}</p>}
      {pairingPage&&formConnection&&needsReview(formConnection)&&<button type="button" className={secondary}
        disabled={unavailable} onClick={()=>reconcile(formConnection)}>读取原回执</button>}
      <div className={form.kind === 'config' ? 'cookie-http-form-footer' : undefined}>
      {form.kind === 'config' && <p>仅保存本地地址，不创建设备、不上传 Cookie；保存成功后进入配对，需再次明确确认连接。</p>}
      <div className="cookie-business-actions">
        {form.kind === 'config' && <Button variant="secondary" className="cookie-button--compact" disabled={working || busy} onClick={close}>取消</Button>}
        {form.kind === 'config' ? <Button variant="primary" className="cookie-button--compact" disabled={formBlocked || !fresh(form)} onClick={submit}>保存并继续</Button> :
        <button ref={['unbind', 'disconnect', 'archive', 'retire'].includes(form.kind) ? firstField : undefined} type="button" className={primary}
          disabled={formBlocked || !fresh(form)} onClick={submit}>{({connect:'确认连接', bind:form.confirmed ? '确认绑定' : '核对绑定', unbind:'确认解绑', disconnect:'确认断开', archive:'确认归档', accept:'确认接受策略', retire:'确认归档旧连接'})[form.kind]}</button>}
        {form.kind !== 'config' && <button type="button" className={secondary} disabled={working || busy} onClick={close}>取消</button>}
      </div>
      </div>
    </form>}
    {state?.legacyAvailable && <p>检测到旧连接记录；旧记录不会自动转换或连接，请按当前服务地址重新配置。</p>}
  </section>;
}
