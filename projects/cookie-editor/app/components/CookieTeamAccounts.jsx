import * as React from 'react';

const phases={AVAILABLE:'尚未领取',PAIRED:'等待发送端交付',DOWNLOADED:'已下载 · 尚未应用',APPLIED:'应用回执已确认'};
const errors={E_TEAM_BUSY:'已有操作正在处理。',E_TEAM_UNKNOWN:'结果未知，已停止。请读取原回执，不要再次提交。',
  E_TEAM_UNAVAILABLE:'账号未分配、已撤销或版本已变化，请重新读取列表。',E_TEAM_EXPIRED:'账号已过期，请联系管理员。',
  E_TEAM_TARGET_CHANGED:'目标网站或文档已变化，请重新核对；不会应用旧确认。',
  E_TEAM_ASSIGNMENT_CHANGED:'分配或版本已变化，请重新读取并领取当前版本。',
  E_TEAM_DELIVERY_REQUIRED:'发送端尚未完成指纹核对和加密交付，请联系管理员后重新读取。',
  E_TEAM_PAIR_REQUIRED:'请先请求设备配对。',E_TEAM_DOWNLOAD_REQUIRED:'请先领取已交付会话。',
  E_TEAM_REVIEW_REQUIRED:'请先核对本次应用目标。',E_TEAM_LOCAL_CHANGED:'本机账号已变化，请重新核对。'};

// Same business component for the installed App and the isolated development
// consumer. A preview adapter never enables an installed sandbox capability.
export function CookieTeamAccounts({client=null,disabled=false}){
  const [state,setState]=React.useState(null),[notice,setNotice]=React.useState('');
  const [busy,setBusy]=React.useState(false),[review,setReview]=React.useState(null);
  const inFlight=React.useRef(false),alive=React.useRef(true),heading=React.useRef(null);
  React.useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[client]);
  React.useLayoutEffect(()=>{if(review)heading.current?.focus();},[review]);
  const run=async(action,id)=>{
    if(inFlight.current||disabled||!client)return;
    inFlight.current=true;setBusy(true);setNotice('');
    if(action!=='use')setReview(null);
    try{
      const result=await client[action](id);
      if(!alive.current)return;
      if(action==='review'){setReview(result);}
      else{
        setReview(null);
        if(action==='use')setNotice('账号 Cookie 应用已取得可信回执；第三方网站登录身份尚未验证。');
        if(action==='receive')setNotice('已保存到本机私有账号库，当前登录未改变。请另行核对并应用。');
        if(action==='pair')setNotice('设备配对请求已确认；请让发送端核对下方完整接收指纹后交付。');
        if(action==='reconcile')setNotice(result.status==='CONFIRMED'?'原服务回执已确认；未自动继续领取或应用，请重新核对。':
          '本地可信操作结果仍待核对；已保留原未知记录，不重发、不回滚。');
      }
      const next=action==='list'?result:await client.list();
      if(alive.current)setState(next);
    }catch(error){if(alive.current){setReview(null);setNotice(errors[error?.code]||'操作未完成。请检查连接、授权和原回执；不会自动重复提交。');
      // Reading state after an unknown is safe and exposes its durable fence.
      try{setState(await client.list());}catch{/* Preserve the last visible state. */}
    }}finally{inFlight.current=false;if(alive.current)setBusy(false);}
  };
  const locked=disabled||busy||!client;
  return <section className="cookie-team-panel" aria-labelledby="cookie-team-heading" aria-busy={busy}>
    <div className="cookie-business-heading"><h3 id="cookie-team-heading">团队账号</h3>
      <button className="od-button od-button--secondary" type="button" disabled={locked}
        onClick={()=>void run('list')}>读取获授权账号</button></div>
    <p className="cookie-business-muted">管理员发布与分配 → 设备配对 → 加密领取 → 核对目标 → 明确应用。读取列表不会上传本机账号或改变当前登录。</p>
    {!client&&<p role="status" className="cookie-account-notice">团队可信连接尚未接入当前运行入口。现有服务账号与用量缓存可继续查看；合成闭环请使用开发说明中的隔离入口。</p>}
    {client&&!state&&<p className="cookie-business-muted">点击读取列表，仅查看当前成员和设备获授权的账号。</p>}
    {state&&<>
      <p className="cookie-business-muted">成员 {state.member.userId} · 设备 {state.member.deviceId} · 授权代际 {state.member.authEpoch}</p>
      {!state.accounts.length&&<p role="status">没有获授权且有效的团队账号，请联系管理员分配到本设备。</p>}
      {state.accounts.map(item=>{
        const candidates=state.local?.filter(row=>row.accountId===item.accountId&&row.version===item.version)??[];
        const local=candidates.findLast(row=>row.assignmentRevision===item.assignmentRevision)??candidates.findLast(row=>row.phase==='PAIRED');
        const unavailable=item.state!=='AVAILABLE'||state.pending;
        return <article key={item.accountId} className="cookie-team-account" aria-label={'团队账号：'+item.displayName}>
          <h4>{item.displayName} <small>v{item.version}</small></h4>
          <p>{item.origin}</p><p>来源：管理员发布的加密会话 · 分配到当前成员与设备</p>
          <p role="status">{item.state==='EXPIRED'?'已过期':phases[local?.phase]||'可领取'} · 登录身份未验证</p>
          {local?.pair&&<details><summary>接收设备核对信息</summary><p>将完整指纹通过独立可信渠道交给管理员核对。</p>
            <code className="cookie-team-fingerprint">{local.pair.receiverFingerprint}</code></details>}
          <div className="cookie-business-actions">
            {!local?.alias&&<button type="button" className="od-button od-button--secondary" disabled={locked||unavailable||local?.phase==='PAIRED'}
              onClick={()=>void run('pair',item.accountId)}>请求设备配对 · {item.displayName}</button>}
            {local?.phase==='PAIRED'&&<button type="button" className="od-button od-button--primary" disabled={locked||unavailable}
              onClick={()=>void run('receive',item.accountId)}>领取已交付会话 · {item.displayName}</button>}
            {local?.alias&&<button type="button" className="od-button od-button--primary" disabled={locked||unavailable}
              onClick={()=>void run('review',item.accountId)}>核对应用 · {item.displayName}</button>}
          </div>
          {local?.receipt&&<p className="cookie-business-muted">回执：{local.receipt.switched?'该次 Cookie 效果已核对，当前状态未重查':'会话已下载，未应用'} · 第三方登录未验证</p>}
        </article>;
      })}
      {state.local?.filter(row=>row.operationId&&row.pending).map(row=><div className="cookie-team-account" key={row.operationId}>
        <strong>原操作待核对</strong><code>{row.operationId}</code>
        <button type="button" className="od-button od-button--secondary" disabled={locked}
          onClick={()=>void run('reconcile',row.operationId)}>读取原回执</button>
      </div>)}
    </>}
    {review&&<section className="cookie-team-confirm" aria-label="核对团队账号应用">
      <h4 ref={heading} tabIndex={-1}>应用 {review.displayName} v{review.version}？</h4>
      <p>目标：{review.origin} · Store {review.scope.storeId} · {review.scope.partitionKey?'精确分区':'无分区'}</p>
      <p>仅应用到核对的当前文档；账号版本、分配、安装或授权变化后本次确认失效。回执不等于第三方网站登录成功。</p>
      <button className="od-button od-button--primary" type="button" disabled={locked}
        onClick={()=>void run('use',review.accountId)}>确认应用到当前目标</button>
      <button className="od-button od-button--quiet" type="button" disabled={busy} onClick={()=>setReview(null)}>取消应用</button>
    </section>}
    {notice&&<p role="status" className="cookie-account-notice">{notice}</p>}
    <details><summary>数据方向与撤销边界</summary>
      <p>发布、分配与领取是独立操作；这里不自动上传本地账号。会话只经原可信加密分享链进入私有账号库，网页界面不接收原始 Cookie。</p>
      <p>移除分配或撤销设备将阻止新的领取与使用授权，保留本机既有账号和 Cookie；已交付会话的第三方登出须在上游独立处理。</p>
    </details>
  </section>;
}
