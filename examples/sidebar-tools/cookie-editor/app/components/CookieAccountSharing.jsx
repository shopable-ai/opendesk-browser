import * as React from 'react';
import {CookieIconButton} from './CookieEditorView.jsx';

const messages={
  E_SHARE_HTTPS_REQUIRED:'请输入两端设备均信任证书的 HTTPS 地址。',
  E_SHARE_URL:'请输入完整的 HTTPS 分享服务地址或邀请链接。',
  E_SHARE_PERMISSION_REQUIRED:'未获得分享服务连接权限，请在可信提示中允许该地址。',
  E_SHARE_NETWORK:'无法连接分享服务，请检查局域网与证书。',
  E_SHARE_RESPONSE:'分享服务返回了无效响应。',
  E_SHARE_DEVICE_KEY_STORAGE_REQUIRED:'安全设备私钥存储尚未通过恢复合同验证，会话传递暂不可用；请仅领取配置并在网站正常登录。',
  E_OUTCOME_UNKNOWN:'操作结果未知，已停止；不会自动重试或重复领取。请核对服务状态。',
  E_SITE_MISMATCH:'邀请属于其他网站，请先打开邀请中的网站，再进入账号领取。',
  E_INVITE_EXPIRED:'邀请已过期。',E_INVITE_REVOKED:'邀请已撤销。',
  E_INVITE_CONSUMED:'邀请领取次数已用完。',E_VAULT_CONFLICT:'账号已变化，请返回账号列表重新读取。',
  E_SHARE_LIMIT:'本机账号或邀请数量已达上限，请先处理已保存项目。',
  E_SHARE_REVIEW_REQUIRED:'账号状态已重新读取，请核对后再次点击保存；不会自动重复领取。',
  E_ACCOUNT_NOT_FOUND:'原领取账号已删除；不会重复消耗领取次数。请联系发送方生成新邀请。'
};
const errorText=error=>messages[error?.code]||'操作未完成（'+String(error?.code||'E_SHARE_REQUEST')+'）。';
const phases={active:'有效',expired:'已过期',revoked:'已撤销',consumed:'领取次数已用完'};
function useShareRequest(request){
  const [busy,setBusy]=React.useState(false),[notice,setNotice]=React.useState('');
  const inFlight=React.useRef(false),alive=React.useRef(true);
  React.useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  const run=(action,payload,onSuccess)=>{
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setNotice('');
    let intent;
    try{intent=request(action,payload);}catch(error){intent=Promise.reject(error);}
    void Promise.resolve(intent).then(value=>{
      if(alive.current)onSuccess(value);
    }).catch(error=>{if(alive.current)setNotice(errorText(error));})
      .finally(()=>{inFlight.current=false;if(alive.current)setBusy(false);});
  };
  return {busy,notice,setNotice,run};
}
function ShareFrame({title,onBack,busy,children}){
  const heading=React.useRef(null);
  React.useLayoutEffect(()=>{heading.current?.focus({preventScroll:true});},[]);
  return <section className="cookie-account-page od-surface" aria-label={title}>
    <div className="cookie-account-content cookie-share-page">
      <header className="cookie-account-header">
        <CookieIconButton name="undo" label="返回账号" disabled={busy} onClick={onBack}/>
        <h2 ref={heading} tabIndex={-1}>{title}</h2>
      </header>{children}
    </div>
  </section>;
}
export function CookieAccountShareLive({account,onBack,request,copy}){
  const [relay,setRelay]=React.useState(''),[expiry,setExpiry]=React.useState('86400');
  const [maxClaims,setMaxClaims]=React.useState('1'),[invite,setInvite]=React.useState(null);
  const [existing,setExisting]=React.useState([]);
  const {busy,notice,setNotice,run}=useShareRequest(request);
  const [unknown,setUnknown]=React.useState(false);
  const create=()=>run('shareCreate',{alias:account.alias,accountVersion:account.version,
    relayOrigin:relay.trim(),expiresInSeconds:Number(expiry),maxClaims:Number(maxClaims),
    mode:'configuration'},setInvite);
  // Unknown creates have no safely recoverable server ID. Prevent a second
  // click from being mistaken for a retry of that first invitation.
  React.useEffect(()=>{if(notice===messages.E_OUTCOME_UNKNOWN)setUnknown(true);},[notice]);
  return <ShareFrame title="分享配置" onBack={onBack} busy={busy}>
    <p className="cookie-account-notice">领取账号名称、描述和网站配置，不包含 Cookie。配置领取后请在网站正常登录。</p>
    <div className="cookie-share-source"><small>账号配置来源</small><strong>{account.displayName}</strong></div>
    <div className="cookie-share-form">
      <label className="cookie-share-field">局域网 HTTPS 分享服务
        <input className="od-field" type="url" aria-label="局域网 HTTPS 分享服务"
          autoComplete="off" value={relay} disabled={busy||Boolean(invite)||unknown}
          onChange={e=>setRelay(e.target.value)}/>
      </label>
      <div className="cookie-share-row is-anonymous">
        <label className="cookie-share-field">邀请有效期
          <select className="od-field" value={expiry} disabled={busy||Boolean(invite)||unknown}
            onChange={e=>setExpiry(e.target.value)}>
            <option value="3600">1 小时</option><option value="86400">1 天</option><option value="604800">7 天</option>
          </select>
        </label>
        <label className="cookie-share-field">最多领取
          <select className="od-field" value={maxClaims} disabled={busy||Boolean(invite)||unknown}
            onChange={e=>setMaxClaims(e.target.value)}>
            {[1,3,5,10].map(n=><option key={n} value={n}>{n} 次</option>)}
          </select>
        </label>
      </div>
      <p className="cookie-account-empty">持有链接的人可领取配置。仅向可信接收方传递，并按需撤销。</p>
      <button className="od-button od-button--primary" type="button"
        disabled={busy||!relay.trim()||Boolean(invite)||unknown} onClick={create}>
        {busy?'正在处理…':'生成真实邀请'}</button>
      <button className="od-button od-button--secondary" type="button" disabled={busy}
        onClick={()=>run('shareList',{alias:account.alias},value=>{
          setExisting(value.invitations);if(!value.invitations.length)setNotice('没有已保存的邀请。');
        })}>查看已有邀请</button>
      {existing.map(item=><button key={item.ref} className="od-button od-button--secondary"
        type="button" disabled={busy} onClick={()=>{
          setRelay(new URL(item.url).origin);setInvite(item);
        }}>查看邀请 · {new Date(item.invite.expiresAt).toLocaleString()}</button>)}
      {invite&&<div className="cookie-market-detail" role="status">
        <strong>{phases[invite.phase]||'状态待核对'}</strong>
        <label className="cookie-share-field">邀请链接
          <input className="od-field" aria-label="邀请链接" readOnly value={invite.url}/>
        </label>
        <p className="cookie-account-empty">到期时间：{new Date(invite.invite.expiresAt).toLocaleString()}<br/>
          剩余领取：{invite.invite.remainingClaims} 次（点击查询更新）</p>
        <div className="cookie-share-actions">
          <button className="od-button od-button--secondary" type="button" disabled={busy||invite.phase!=='active'}
            onClick={()=>{
              let intent;try{intent=copy(invite.url);}catch{setNotice('复制未完成，请手动复制链接。');return;}
              void Promise.resolve(intent).then(receipt=>{
              if(receipt?.copied!==true)throw Error('unconfirmed');setNotice('邀请链接已复制。');
            }).catch(()=>setNotice('复制未完成，请手动复制链接。'));}}>复制链接</button>
          <button className="od-button od-button--secondary" type="button" disabled={busy}
            onClick={()=>run('shareStatus',{ref:invite.ref},setInvite)}>查询实际状态</button>
          <button className="od-button od-button--secondary" type="button" disabled={busy||invite.phase!=='active'}
            onClick={()=>run('shareRevoke',{ref:invite.ref},setInvite)}>撤销邀请</button>
        </div>
      </div>}
      {notice&&<p className="cookie-account-feedback" role="status">{notice}</p>}
      <details className="cookie-share-help"><summary>会话移交状态</summary>
        <p className="cookie-account-empty">非导出设备私钥的安全持久化与恢复尚未验证；当前拒绝 Cookie 会话分享。配置领取、Cookie 写入读回和网站登录是三个独立结果。</p>
      </details>
    </div>
  </ShareFrame>;
}
export function CookieAccountReceive({onBack,request,origin}){
  const [url,setUrl]=React.useState(''),[inspection,setInspection]=React.useState(null);
  const [received,setReceived]=React.useState(false),[unknown,setUnknown]=React.useState(false);
  const {busy,notice,run}=useShareRequest(request);
  React.useEffect(()=>{if(notice===messages.E_OUTCOME_UNKNOWN)setUnknown(true);},[notice]);
  return <ShareFrame title="领取配置" onBack={onBack} busy={busy}>
    <div className="cookie-share-form">
      <label className="cookie-share-field">HTTPS 邀请链接
        <input className="od-field" type="url" aria-label="HTTPS 邀请链接" autoComplete="off"
          value={url} disabled={busy||received||unknown}
          onChange={e=>{setUrl(e.target.value);setInspection(null);}}/>
      </label>
      <button className="od-button od-button--secondary" type="button" disabled={busy||!url.trim()||received}
        onClick={()=>run('shareInspect',{inviteUrl:url.trim()},value=>{
          setInspection(value);setReceived(value.configurationImported===true);
        })}>查看邀请</button>
      {inspection&&<div className="cookie-market-detail">
        <strong>{inspection.invite.displayName}</strong><p>{inspection.invite.description}</p>
        <p className="cookie-account-empty">网站：{inspection.invite.origin}<br/>
          {inspection.localSavePending||inspection.configurationImported
            ?<>本机已保留领取记录；此处不查询邀请的当前状态。</>
            :<>到期时间：{new Date(inspection.invite.expiresAt).toLocaleString()}<br/>
              剩余领取：{inspection.invite.remainingClaims} 次</>}</p>
        {inspection.invite.origin!==origin&&<p role="status">请先打开 {inspection.invite.origin}，再返回本入口领取。</p>}
        {!received&&<p className="cookie-account-empty">将新增独立账号，重名自动区分；保留当前网站会话。不会写入 Cookie 或确认登录。</p>}
        {!received&&(inspection.invite.mode==='session'
          ?<p role="status">{messages.E_SHARE_DEVICE_KEY_STORAGE_REQUIRED}</p>
          :<button className="od-button od-button--primary" type="button"
            disabled={busy||received||unknown||inspection.invite.origin!==origin||
              (!inspection.localSavePending&&inspection.invite.remainingClaims<1)}
            onClick={()=>run('shareClaim',{inviteUrl:inspection.url},()=>setReceived(true))}>
            {inspection.localSavePending?'继续保存已领取配置':'领取账号配置'}</button>)}
      </div>}
      {received&&<p role="status" className="cookie-account-notice">配置已保存；Cookie 未写入，网站登录尚未验证。请使用网站正常登录流程。</p>}
      {notice&&<p className="cookie-account-feedback" role="status">{notice}</p>}
    </div>
  </ShareFrame>;
}
