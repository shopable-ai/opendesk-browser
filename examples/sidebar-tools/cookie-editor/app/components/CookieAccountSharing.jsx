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
  E_ACCOUNT_NOT_FOUND:'原领取账号已删除；不会重复消耗领取次数。请联系发送方生成新邀请。',
  E_SESSION_PAIR_REQUIRED:'请先在本机请求设备配对，再由发送设备核对指纹并交付。',
  E_SESSION_FINGERPRINT_REQUIRED:'请独立核对发送设备显示的完整指纹，再填写到这里。',
  E_SESSION_SENDER_MISMATCH:'发送设备指纹不一致，已拒绝解密和保存。',
  E_SESSION_PACKET:'加密快照验证失败，未保存会话，也未改动当前网站 Cookie。',
  E_DEVICE_KEY_NOT_FOUND:'本机配对密钥已丢失；请撤销原邀请并重新配对，不会生成替代密钥。',
  E_DEVICE_KEY_CORRUPT:'本机配对密钥验证失败，已停止。请重新配对。',
  E_DEVICE_KEY_OUTCOME_UNKNOWN:'设备密钥保存结果未知，已停止；请重新查看本机配对状态。'
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
  const [mode,setMode]=React.useState('configuration');
  const [relay,setRelay]=React.useState(''),[expiry,setExpiry]=React.useState('86400');
  const [maxClaims,setMaxClaims]=React.useState('1'),[invite,setInvite]=React.useState(null);
  const [existing,setExisting]=React.useState([]);
  const [pairs,setPairs]=React.useState([]),[reviewed,setReviewed]=React.useState('');
  const [delivery,setDelivery]=React.useState(null);
  const {busy,notice,setNotice,run}=useShareRequest(request);
  const [unknown,setUnknown]=React.useState(false);
  const create=()=>run('shareCreate',{alias:account.alias,accountVersion:account.version,
    relayOrigin:relay.trim(),expiresInSeconds:Number(expiry),
    maxClaims:mode==='session'?1:Number(maxClaims),mode},setInvite);
  // Unknown creates have no safely recoverable server ID. Prevent a second
  // click from being mistaken for a retry of that first invitation.
  React.useEffect(()=>{if(notice===messages.E_OUTCOME_UNKNOWN)setUnknown(true);},[notice]);
  const session=(invite?.invite.mode||mode)==='session';
  return <ShareFrame title={session?'分享会话':'分享配置'} onBack={onBack} busy={busy}>
    <p className="cookie-account-notice">{session
      ?'仅在网站允许移交时使用。两端核对设备指纹后加密交付 Cookie 快照；不会代替网站登录验证或绕过设备绑定。'
      :'领取账号名称、描述和网站配置，不包含 Cookie。配置领取后请在网站正常登录。'}</p>
    <div className="cookie-share-source"><small>{session?'会话快照来源':'账号配置来源'}</small><strong>{account.displayName}</strong></div>
    <div className="cookie-share-form">
      <label className="cookie-share-field">分享内容
        <select className="od-field" aria-label="分享内容" value={mode}
          disabled={busy||Boolean(invite)||unknown}
          onChange={e=>setMode(e.target.value)}>
          <option value="configuration">账号配置</option>
          <option value="session" disabled={!account.cookieCount}>加密会话快照 · 单次领取</option>
        </select>
      </label>
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
          <select className="od-field" value={session?'1':maxClaims} disabled={busy||Boolean(invite)||unknown||session}
            onChange={e=>setMaxClaims(e.target.value)}>
            {[1,3,5,10].map(n=><option key={n} value={n}>{n} 次</option>)}
          </select>
        </label>
      </div>
      <p className="cookie-account-empty">{session
        ?'链接只用于发起配对；须核对接收设备的完整指纹后，才向该设备加密交付。'
        :'持有链接的人可领取配置。仅向可信接收方传递，并按需撤销。'}</p>
      <button className="od-button od-button--primary" type="button"
        disabled={busy||!relay.trim()||Boolean(invite)||unknown} onClick={create}>
        {busy?'正在处理…':'生成真实邀请'}</button>
      <button className="od-button od-button--secondary" type="button" disabled={busy}
        onClick={()=>run('shareList',{alias:account.alias},value=>{
          setExisting(value.invitations);if(!value.invitations.length)setNotice('没有已保存的邀请。');
        })}>查看已有邀请</button>
      {existing.map(item=><button key={item.ref} className="od-button od-button--secondary"
        type="button" disabled={busy} onClick={()=>{
          setRelay(new URL(item.url).origin);setMode(item.invite.mode);setInvite(item);
          setPairs([]);setReviewed('');setDelivery(null);
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
        {session&&<div className="cookie-share-form">
          <button className="od-button od-button--secondary" type="button" disabled={busy||invite.phase!=='active'}
            onClick={()=>run('sharePairs',{ref:invite.ref},value=>{
              setPairs(value.pairs);setReviewed('');
              if(!value.pairs.length)setNotice('尚无设备请求配对。请接收方先打开邀请并请求配对。');
            })}>查询配对设备</button>
          {pairs.map(pair=><div className="cookie-market-detail" key={pair.requestId}>
            <strong>接收设备指纹</strong><code>{pair.receiverFingerprint}</code>
            <p className="cookie-account-empty">请与接收设备屏幕上的指纹逐字核对；仅持有邀请链接不能证明设备身份。</p>
            {pair.status==='pending'&&<>
              <label className="cookie-share-field"><span>
                <input type="checkbox" checked={reviewed===pair.requestId} disabled={busy}
                  onChange={e=>setReviewed(e.target.checked?pair.requestId:'')}/>
                已独立核对接收设备指纹
              </span></label>
              <button className="od-button od-button--primary" type="button"
                disabled={busy||reviewed!==pair.requestId||Boolean(delivery)}
                onClick={()=>run('shareDeliver',{ref:invite.ref,requestId:pair.requestId,
                  receiverFingerprint:pair.receiverFingerprint},setDelivery)}>核对并加密交付</button>
            </>}
            {(pair.senderFingerprint||delivery?.requestId===pair.requestId)&&<>
              <strong>发送设备指纹</strong>
              <code>{pair.senderFingerprint||delivery.senderFingerprint}</code>
              <p className="cookie-account-empty">请接收方独立核对这个完整指纹后再领取。加密交付不代表 Cookie 已恢复或网站已登录。</p>
            </>}
          </div>)}
        </div>}
      </div>}
      {notice&&<p className="cookie-account-feedback" role="status">{notice}</p>}
      <details className="cookie-share-help"><summary>会话移交状态</summary>
        <p className="cookie-account-empty">设备私钥不随普通数据备份迁移；密钥丢失须重新配对。会话快照保存后仍须明确切换，再独立确认网站登录。配置领取、Cookie 写入读回和网站登录分别记录。</p>
      </details>
    </div>
  </ShareFrame>;
}
export function CookieAccountReceive({onBack,request,origin}){
  const [url,setUrl]=React.useState(''),[inspection,setInspection]=React.useState(null);
  const [received,setReceived]=React.useState(false),[unknown,setUnknown]=React.useState(false);
  const [receipt,setReceipt]=React.useState(null),[senderFingerprint,setSenderFingerprint]=React.useState('');
  const {busy,notice,run}=useShareRequest(request);
  React.useEffect(()=>{if(notice===messages.E_OUTCOME_UNKNOWN)setUnknown(true);},[notice]);
  const session=inspection?.invite.mode==='session';
  const claimed=value=>{setReceipt(value);setReceived(true);};
  return <ShareFrame title="领取分享" onBack={onBack} busy={busy}>
    <div className="cookie-share-form">
      <label className="cookie-share-field">HTTPS 邀请链接
        <input className="od-field" type="url" aria-label="HTTPS 邀请链接" autoComplete="off"
          value={url} disabled={busy||received||unknown}
          onChange={e=>{setUrl(e.target.value);setInspection(null);}}/>
      </label>
      <button className="od-button od-button--secondary" type="button" disabled={busy||!url.trim()||received}
        onClick={()=>run('shareInspect',{inviteUrl:url.trim()},value=>{
          setInspection(value);setReceipt(value);
          setReceived(value.configurationImported===true||value.sessionImported===true);
          if(value.senderFingerprint)setSenderFingerprint(value.senderFingerprint);
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
        {!received&&(session
          ?inspection.sessionAvailable!==true
            ?<p role="status">{messages.E_SHARE_DEVICE_KEY_STORAGE_REQUIRED}</p>
            :<div className="cookie-share-form">
              {!inspection.pair&&!inspection.localSavePending&&<button type="button"
                className="od-button od-button--primary"
                disabled={busy||unknown||inspection.invite.origin!==origin||inspection.invite.remainingClaims<1}
                onClick={()=>run('sharePair',{inviteUrl:inspection.url},setInspection)}>请求设备配对</button>}
              {inspection.pair&&<>
                <strong>本机接收设备指纹</strong><code>{inspection.pair.receiverFingerprint}</code>
                <p className="cookie-account-empty">先让发送方核对本机指纹并交付，再独立核对发送方屏幕上的完整指纹。</p>
              </>}
              {(inspection.pair||inspection.localSavePending)&&<>
                <label className="cookie-share-field">已核对的发送设备指纹
                  <input className="od-field" aria-label="已核对的发送设备指纹" autoComplete="off"
                    value={senderFingerprint} maxLength={64} disabled={busy||unknown}
                    onChange={e=>setSenderFingerprint(e.target.value.trim().toLowerCase())}/>
                </label>
                <button className="od-button od-button--primary" type="button"
                  disabled={busy||unknown||inspection.invite.origin!==origin||!/^[a-f0-9]{64}$/.test(senderFingerprint)}
                  onClick={()=>run('shareClaim',{inviteUrl:inspection.url,senderFingerprint},claimed)}>
                  {inspection.localSavePending?'继续保存已领取会话':'领取加密会话快照'}</button>
              </>}
            </div>
          :<button className="od-button od-button--primary" type="button"
            disabled={busy||received||unknown||inspection.invite.origin!==origin||
              (!inspection.localSavePending&&inspection.invite.remainingClaims<1)}
            onClick={()=>run('shareClaim',{inviteUrl:inspection.url},claimed)}>
            {inspection.localSavePending?'继续保存已领取配置':'领取账号配置'}</button>)}
      </div>}
      {received&&<p role="status" className="cookie-account-notice">{receipt?.sessionImported
        ?'会话快照已保存；Cookie 未写入，网站登录尚未验证。请返回账号列表明确切换，再独立核对网站登录。'
        :'配置已保存；Cookie 未写入，网站登录尚未验证。请使用网站正常登录流程。'}</p>}
      {notice&&<p className="cookie-account-feedback" role="status">{notice}</p>}
    </div>
  </ShareFrame>;
}
