import * as React from 'react';

const secondary = 'od-button od-button--secondary cookie-button--compact';
const primary = 'od-button od-button--primary cookie-button--compact';
const statuses = {UNCONNECTED:'未连接', CONNECTED:'已连接', DISCONNECTED:'已断开',
  SESSION_EXPIRED:'会话已过期', OUTCOME_UNKNOWN:'结果未知', INVALIDATED:'已失效', RETIRED:'已归档（远端状态未声明）'};
const unresolved = connection => Boolean(connection.pending) || connection.status === 'OUTCOME_UNKNOWN';
const openPending = connection => ['serviceOpen', 'open'].includes(connection?.pending?.action) && connection.pending.canArchive === true;
const fingerprint = value => JSON.stringify(value);
const observedTime = value => {
  if (typeof value !== 'string' && typeof value !== 'number') return '暂无';
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? time.toLocaleString('zh-CN') : '暂无';
};
const percentage = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value + '%' : '暂无';
const usageStatus = value => ({OK:'读取成功', SUCCESS:'读取成功', READY:'可用', FRESH:'最新缓存', STALE:'缓存已过期',
  ERROR:'读取失败', UNAVAILABLE:'暂不可用', EMPTY:'暂无缓存', UNKNOWN:'状态未知'})[value] || '状态待核对';
function exactOrigin(value) {
  try {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
      url.hostname === '[::1]' || url.hostname === '127.0.0.1';
    return !url.username && !url.password && url.origin === value &&
      (url.protocol === 'https:' || url.protocol === 'http:' && loopback);
  } catch { return false; }
}

// HTTP transport, persistence and trusted permission reviews belong to the caller.
export function CookieHttpConnections({origin = '', accounts = [], accountReady = false, state,
  busy = false, notice = '', onAction, onDirtyChange, onAccounts}) {
  const [form, setForm] = React.useState(null);
  const [error, setError] = React.useState('');
  const [working, setWorking] = React.useState(false);
  const [uncertain, setUncertain] = React.useState(null);
  const lock = React.useRef(false);
  const mounted = React.useRef(true);
  const latest = React.useRef(null);
  const trigger = React.useRef(null);
  const restore = React.useRef(false);
  const heading = React.useRef(null);
  const firstField = React.useRef(null);
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
  const dirty = Boolean(form && (form.kind !== 'config' || form.label || form.serviceOrigin));
  React.useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  React.useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useLayoutEffect(() => {
    if (form) firstField.current?.focus({preventScroll:true});
    else if (restore.current) {
      restore.current = false;
      (trigger.current?.isConnected ? trigger.current : heading.current)?.focus({preventScroll:true});
    }
  }, [form?.kind, form?.connectionId]);

  const close = () => {
    if (lock.current || latest.current.busy) return;
    restore.current = true; setForm(null); setError('');
  };
  const open = (event, kind, connection, extra = {}) => {
    if (lock.current || latest.current.busy) return;
    trigger.current = event.currentTarget;
    setError('');
    setForm({kind, revision:state.revision, origin, accounts:fingerprint(accounts), accountReady,
      connectionId:connection?.id, connection:fingerprint(connection), label:'', serviceOrigin:'',
      alias:'', remoteAccountId:'', code:'', confirmed:false, ...extra});
  };
  const update = patch => { setError(''); setForm(previous => ({...previous, ...patch, confirmed:false})); };
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
      if (!mounted.current) return;
      if (success === true) {
        if (action === 'serviceStatus' || action === 'serviceReconcile' || action === 'serviceArchiveOpen' || action === 'serviceRetire') {
          setUncertain(previous => previous?.connectionId === payload.connectionId ? null : previous);
        }
        if (!read) { restore.current = true; setForm(null); }
      } else if (success?.rejected === true) {
        setError('操作未执行/已确认拒绝，请核对提示后重新审阅');
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
      if (!label || label.length > 64 || /[\x00-\x1f\x7f]/.test(label)) { setError('请填写 1–64 字的服务名称，不含控制字符。'); return; }
      if (!exactOrigin(form.serviceOrigin)) { setError('请输入完整服务来源地址：本机 HTTP localhost / 数字回环地址，或 HTTPS 地址；不含尾斜杠、路径、查询、片段或账号密码。'); return; }
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
  return <section className="cookie-business-content" aria-label="服务连接">
    <header className="cookie-business-heading">
      <h3 ref={heading} tabIndex={-1}>服务连接</h3>
      <button type="button" className={primary} disabled={blocked || Boolean(form)}
        onClick={event => open(event, 'config')}>添加服务</button>
    </header>
    <p>填写普通 HTTP 服务的地址即可连接，无需安装本机辅助程序。不会扫描端口或自动连接。</p>
    <p>会话有效期为 15 分钟。每次请求仅发往已确认的服务地址；每次公开网络请求都需要宿主的一次性审阅，确认地址和操作范围。</p>
    {notice && <p role="status" className="cookie-business-callout">{notice}</p>}
    {error && <p role="alert" className="od-form-error">{error}</p>}
    {!state && <p role="status">服务状态尚未就绪，请等待读取完成。</p>}
    {busy && <p role="status">正在处理服务请求…</p>}
    {state && !connections.length && <p>尚未配置服务。先添加地址，再使用应用一次性配对码连接。</p>}
    {unknown && <p role="alert" className="cookie-business-callout">存在未确认结果，所有服务写入已暂停。请读取回执；未知的管理页打开请手动核对后归档，不要重复打开。</p>}
    {uncertain && !uncertain.connectionId && <p>请重新读取应用的服务配置，核对刚才的保存结果后再操作。</p>}
    {connections.map(connection => <article key={connection.id} className="cookie-business-inquiry" aria-label={'服务：' + connection.label}>
      <h4>{connection.label}</h4><p>{connection.origin}</p>
      <p>{statuses[connection.status] || '状态未知'}{connection.expiresAt ? ' · 会话到期：' + String(connection.expiresAt) : ''}</p>
      {['SESSION_EXPIRED', 'INVALIDATED'].includes(connection.status) && <p>旧记录保留；重新添加此地址并使用新应用配对码连接，不代表旧设备已撤销</p>}
      <div className="cookie-business-actions">
        {connection.canRetire === true && connection.status !== 'RETIRED' && <button type="button" className={secondary} disabled={unavailable || Boolean(form)}
          aria-label={'归档旧连接：' + connection.label} onClick={event => open(event, 'retire', connection)}>归档旧连接</button>}
        <button type="button" className={secondary} disabled={unavailable || connection.status === 'RETIRED' && !connection.pending} onClick={() => reconcile(connection)}
          aria-label={'读取回执：' + connection.label}>读取回执</button>
        <button type="button" className={primary} disabled={blocked || Boolean(form) || !['UNCONNECTED', 'DISCONNECTED'].includes(connection.status)}
          onClick={event => open(event, 'connect', connection)} aria-label={'连接服务：' + connection.label}>连接</button>
        <button type="button" className={secondary} disabled={blocked || connection.status !== 'CONNECTED'}
          onClick={() => dispatch('serviceResources', {connectionId:connection.id}, context(connection), true)}
          aria-label={'读取资源：' + connection.label}>读取资源</button>
        {Number.isSafeInteger(connection.resourceCursor) && connection.resourceCursor >= 0 && <button type="button" className={secondary}
          disabled={blocked || connection.status !== 'CONNECTED'} aria-label={'读取更多资源：' + connection.label}
          onClick={() => dispatch('serviceResources', {connectionId:connection.id, cursor:connection.resourceCursor}, context(connection), true)}>读取更多资源</button>}
        <button type="button" className={secondary} disabled={blocked || Boolean(form) || connection.status !== 'CONNECTED'}
          onClick={event => open(event, 'bind', connection)} aria-label={'绑定账号：' + connection.label}>绑定账号</button>
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
      {connection.status === 'CONNECTED' && !connection.resources?.length && <p>尚无可选资源，请先读取资源；服务返回空列表时，请在服务端配置资源。</p>}
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
          {cache ? <>
            <p>缓存状态：{usageStatus(cache.status)} · 观测时间：{observedTime(cache.observedAt)}</p>
            {windows.length ? windows.map((window, index) => <p key={index}>
              {window.key === 'primary' || window.slot === 'primary' ? '主要窗口' : window.key === 'secondary' || window.slot === 'secondary' ? '次要窗口' : '用量窗口'}：
              已用 {percentage(window.usedPercent)} · 剩余 {percentage(window.remainingPercent)} · 重置时间：{observedTime(window.resetsAt)}
            </p>) : <p>暂无用量窗口摘要。</p>}
          </> : <p>尚未读取缓存用量。</p>}
        </div>;
      })}
      {connection.policy && <>
        <p>已读取服务策略；读取不代表批准，不会自动接受或扩大权限。</p>
        <p>已接受策略：{connection.policy.acceptance ? '版本 ' + connection.policy.acceptance.desiredRevision : '尚未接受'}</p>
        {connection.policy.acceptance?.scope && <p>已接受范围：{connection.policy.acceptance.scope.bindingIds?.join('、')} · {connection.policy.acceptance.scope.dataCategories?.join('、')} · {connection.policy.acceptance.scope.trigger} · {connection.policy.acceptance.scope.retentionDays} 天</p>}
        {reviewable(connection) && <button type="button" className={secondary}
          disabled={blocked || Boolean(form) || connection.status !== 'CONNECTED'} aria-label={'审阅同步策略：' + connection.label}
          onClick={event => open(event, 'accept', connection, {bindingIds:[], dataCategories:[], retentionDays:connection.policy.desired.scope.retentionDays})}>审阅同步策略</button>}
      </>}
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
    {form && <form className="cookie-business-inquiry" aria-label="HTTP 服务连接编辑"
      onSubmit={submit} onKeyDown={keyDown} autoComplete="off">
      <h4>{({config:'配置服务', connect:'应用配对', bind:'绑定账号', unbind:'确认解绑', disconnect:'确认断开', archive:'归档未知打开', accept:'审阅同步策略', retire:'归档旧连接'})[form.kind]}</h4>
      {formConnection && <p>{formConnection.label} · {formConnection.origin}</p>}
      {!fresh(form) && <p role="alert">站点、账号或状态版本已变化。请取消后重新核对，已有输入已保留。</p>}
      {form.kind === 'config' && <div className="cookie-business-features">
        <label>服务名称<input ref={firstField} className="od-field" aria-label="服务名称" maxLength={64}
          value={form.label} disabled={formBlocked} onChange={event => update({label:event.target.value})}/></label>
        <label>服务地址<input className="od-field" aria-label="服务地址" type="text" autoComplete="off" spellCheck={false}
          placeholder="http://localhost:8787 或 https://service.example" value={form.serviceOrigin}
          disabled={formBlocked} onChange={event => update({serviceOrigin:event.target.value})}/></label>
        <p>仅填来源地址，不带尾斜杠、路径、查询或片段。保存配置不会自动连接。</p>
      </div>}
      {form.kind === 'connect' && <>
        <label>应用一次性配对码<input ref={firstField} className="od-field" aria-label="应用一次性配对码" type="password"
          autoComplete="off" spellCheck={false} maxLength={64} value={form.code} disabled={formBlocked}
          onChange={event => update({code:event.target.value})}/></label>
        <p>从服务端获取 64 位十六进制应用配对码。管理页链接不是应用配对码；配对码只用于此次连接，不会保存到配置。</p>
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
          <p>确认将 {form.origin} 的 {form.alias}（版本 {available.find(account => account.alias === form.alias)?.version}）绑定到 {formConnection?.origin} 的 {form.remoteAccountId}？</p>
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
      <div className="cookie-business-actions">
        <button ref={['unbind', 'disconnect', 'archive', 'retire'].includes(form.kind) ? firstField : undefined} type="button" className={primary}
          disabled={formBlocked || !fresh(form)} onClick={submit}>{({config:'保存配置', connect:'确认连接', bind:form.confirmed ? '确认绑定' : '核对绑定', unbind:'确认解绑', disconnect:'确认断开', archive:'确认归档', accept:'确认接受策略', retire:'确认归档旧连接'})[form.kind]}</button>
        <button type="button" className={secondary} disabled={working || busy} onClick={close}>取消</button>
      </div>
    </form>}
    {state?.legacyAvailable && <p>检测到旧连接记录；旧记录不会自动转换或连接，请按当前服务地址重新配置。</p>}
  </section>;
}
