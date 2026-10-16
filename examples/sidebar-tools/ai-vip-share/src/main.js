// AI VIP Share business presentation stays inside the installed opaque sandbox.
// This tool never treats an aiAccess proxy lease as a paid member entitlement.
(function(){
  'use strict';
  const root=window.OpenDeskTool?.root;
  if(!root)return;
  const byId=id=>root.querySelector('#'+id);
  const memberState=byId('ai-vip-member-state');
  const accountName=byId('ai-vip-account-name');
  const productName=byId('ai-vip-product-name');
  const remaining=byId('ai-vip-remaining');
  const unit=byId('ai-vip-remaining-unit');
  const expiry=byId('ai-vip-expiry');
  const verified=byId('ai-vip-verified');
  const benefits=byId('ai-vip-benefits');
  const history=byId('ai-vip-history-list');
  const historyCount=byId('ai-vip-history-count');
  const refresh=byId('ai-vip-refresh');
  const metricLabel=byId('ai-vip-metric-label');
  const meter=byId('ai-vip-meter'),meterBar=byId('ai-vip-meter-bar');
  const redeemForm=byId('ai-vip-redeem-form');
  const codeReveal=byId('ai-vip-code-reveal'),codeClear=byId('ai-vip-code-clear');
  const confirm=byId('ai-vip-redeem-confirm');
  const code=byId('ai-vip-redeem-code');
  const redeem=byId('ai-vip-redeem');
  const redeemStatus=byId('ai-vip-redeem-status');
  const redeemError=byId('ai-vip-redeem-error');
  const previewPanel=byId('ai-vip-redeem-preview');
  const previewTitle=byId('ai-vip-preview-title');
  const previewDescription=byId('ai-vip-preview-description');
  const previewAccount=byId('ai-vip-preview-account');
  const cancel=byId('ai-vip-redeem-cancel');
  const recoveryPanel=byId('ai-vip-recovery');
  const recoveryStatus=byId('ai-vip-recovery-status');
  const recoveryCheck=byId('ai-vip-recovery-check');
  const shop=byId('ai-vip-shop-open'),shopStatus=byId('ai-vip-shop-status');
  if([memberState,accountName,productName,remaining,unit,expiry,verified,
    benefits,history,historyCount,refresh,code,redeem,redeemStatus,redeemError,
    previewPanel,previewTitle,previewDescription,previewAccount,cancel,
    recoveryPanel,recoveryStatus,recoveryCheck,shop,shopStatus,
    metricLabel,meter,meterBar,redeemForm,codeReveal,codeClear,confirm]
      .some(element=>!element))return;

  // Release-owned values: only populate after commercial/provider review.
  // Do not use the technical proxy activate/verify URLs for these endpoints.
  const BUSINESS_ENDPOINTS=Object.freeze({member:'',voucherPreview:'',voucherRedeem:'',voucherStatus:''});
  const PRODUCT_CATALOG_URL='';
  const plain=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
  const safeString=(value,max=100)=>typeof value==='string'&&value.trim()&&
    value.length<=max?value.trim():null;
  const dateMs=value=>Number.isSafeInteger(value)&&value>=946684800000&&
    value<=4102444800000?value:null;
  const dateLabel=value=>new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'short',
    day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  function validCatalogUrl(value){
    if(typeof value!=='string'||!value)return null;
    try{
      const url=new URL(value);
      if(url.protocol!=='https:'||!url.hostname||url.username||url.password||
        url.hash||url.search||url.port||url.href.length>2048)return null;
      return url.href;
    }catch{return null;}
  }
  function validProviderUrl(value){
    const href=validCatalogUrl(value);
    if(!href)return null;
    const url=new URL(href);
    return url.pathname!=='/'?href:null;
  }
  function validatedBusinessEndpoints(){
    const member=validProviderUrl(BUSINESS_ENDPOINTS.member);
    const voucherPreview=validProviderUrl(BUSINESS_ENDPOINTS.voucherPreview);
    const voucherRedeem=validProviderUrl(BUSINESS_ENDPOINTS.voucherRedeem);
    const voucherStatus=validProviderUrl(BUSINESS_ENDPOINTS.voucherStatus);
    if(!member||!voucherPreview||!voucherRedeem||!voucherStatus)return null;
    const origins=[member,voucherPreview,voucherRedeem,voucherStatus].map(url=>new URL(url).origin);
    return new Set(origins).size===1?{member,voucherPreview,voucherRedeem,voucherStatus}:null;
  }
  const endpoints=validatedBusinessEndpoints();
  const catalog=validCatalogUrl(PRODUCT_CATALOG_URL);
  const businessSdk=window.OpenDeskSDK?.browser?.network;
  // Existing installed-tool storage is bound by Host to package and install epoch.
  // Never store a voucher, password, auth cookie, proxy lease or access token.
  const RECOVERY_KEY='aiVipRedeemR52',PACKAGE_VERSION='1.3.1';
  // Do not strand an unresolved 1.2.0 voucher journal after a tool upgrade.
  const RECOVERY_COMPAT_VERSIONS=Object.freeze(['1.2.0','1.3.0','1.3.1']);
  const storeRequest=window.OpenDeskTool.request;
  let snapshot=null,pending=null,recovery=null,recoveryFault=null;
  let recoveryReady=false,busy=false,seq=0;
  // Provider clock, not device Date.now(), determines preview validity.
  // A stale member snapshot cannot authorize a new voucher side effect.
  const PREVIEW_MAX_LIFETIME_MS=5*60*1000;
  let serverSampleAt=null;
  function estimatedServerNow(){
    if(!snapshot||serverSampleAt===null)return null;
    const elapsed=performance.now()-serverSampleAt;
    if(!Number.isFinite(elapsed)||elapsed<0||
      elapsed>PREVIEW_MAX_LIFETIME_MS)return null;
    return snapshot.serverNow+elapsed;
  }
  const clear=(node)=>node.replaceChildren();
  function addRow(list,title,detail){
    const item=document.createElement('li');
    item.className='ai-vip-list-item';
    const strong=document.createElement('strong');
    strong.textContent=title;
    const note=document.createElement('p');
    note.className='od-note';
    note.textContent=detail;
    item.append(strong,note);
    list.append(item);
  }
  function emptyRow(list,text){
    clear(list);
    const item=document.createElement('li');
    item.className='od-note';
    item.textContent=text;
    list.append(item);
  }
  function fail(codeValue,message){
    const error=new Error(message);
    error.code=codeValue;
    throw error;
  }
  function validRecovery(raw){
    if(raw===null)return null;
    const fields=['accountId','createdAt','idempotencyKey','packageVersion','schemaVersion','toolId'];
    if(!plain(raw)||Object.keys(raw).sort().join(',')!==fields.sort().join(',')||
      raw.schemaVersion!==1||raw.toolId!=='ai-vip-share'||
      !RECOVERY_COMPAT_VERSIONS.includes(raw.packageVersion)||!safeString(raw.accountId,120)||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.idempotencyKey)||
      // Diagnostic local timestamp only: clock rollback must not hide an
      // unresolved POST or prevent an account-bound server status check.
      dateMs(raw.createdAt)===null)
      fail('E_RECOVERY_RECORD','上次兑换记录版本或身份无法安全核验');
    return raw;
  }
  async function readRecovery(){
    if(typeof storeRequest!=='function')fail('E_RECOVERY_STORAGE','工具存储能力不可用');
    const result=await storeRequest('storage.get',{key:RECOVERY_KEY,withEtag:true});
    if(!plain(result)||result.preview===true||
      typeof result.etag!=='string'||!/^[a-f0-9]{64}$/.test(result.etag))
      fail('E_RECOVERY_STORAGE','当前不是可恢复的正式安装存储');
    return {record:validRecovery(result.value),etag:result.etag};
  }
  async function writeRecovery(before,next){
    // ETag CAS runs under the existing Host Web Lock. A lost acknowledgement
    // needs a read-back; a mismatched record forbids any voucher POST.
    try{
      await storeRequest('storage.set',{key:RECOVERY_KEY,value:next,ifMatch:before.etag});
    }catch{/* Outcome may have been committed before reply was lost. */}
    const after=await readRecovery();
    if(JSON.stringify(after.record)!==JSON.stringify(next))
      fail('E_RECOVERY_WRITE','兑换事务未被确认持久保存，禁止提交或重试');
    return after;
  }
  async function loadRecovery(){
    try{
      recovery=(await readRecovery()).record;
      recoveryFault=null;
      if(recovery)redeemNotice('发现上次未确认的兑换。请先核对服务端状态，不能重新提交。',true);
    }catch{
      recoveryFault='无法核对本工具的持久兑换记录；已禁止兑换，请检查安装和存储授权。';
      redeemNotice(recoveryFault,true);
    }finally{recoveryReady=true;renderRedeem();}
  }
  async function beginRecovery(accountId,key){
    const before=await readRecovery();
    if(before.record){
      recovery=before.record;
      fail('E_RECOVERY_PENDING','已有未核对交易，不允许提交第二笔兑换');
    }
    const record={schemaVersion:1,toolId:'ai-vip-share',packageVersion:PACKAGE_VERSION,
      accountId,idempotencyKey:key,createdAt:Date.now()};
    await writeRecovery(before,record);
    recovery=record;
    renderRedeem();
  }
  async function clearRecovered(key){
    const before=await readRecovery();
    if(!before.record||before.record.idempotencyKey!==key||
      before.record.accountId!==recovery?.accountId)
      fail('E_RECOVERY_CONFLICT','持久兑换记录发生变化，未自动清除');
    await writeRecovery(before,null);
    recovery=null;
    recoveryFault=null;
  }
  function showRecovery(){
    recoveryPanel.hidden=!recovery&&!recoveryFault;
    if(!recovery&&!recoveryFault)return;
    if(recoveryFault)recoveryStatus.textContent=recoveryFault;
    else if(!endpoints)recoveryStatus.textContent='存在待核对交易，但正式兑换服务未配置；请保留记录。';
    else if(snapshot?.account.id!==recovery.accountId)
      recoveryStatus.textContent='当前账号与上次兑换的账号不一致。已阻止继承旧账号交易。';
    else recoveryStatus.textContent='有未完成的兑换回执。只能查询服务端终态，不会重新提交兑换。';
    recoveryCheck.hidden=!recovery;
    recoveryCheck.disabled=!recovery||!endpoints||busy||!recoveryReady||
      Boolean(recoveryFault)||snapshot?.account.id!==recovery?.accountId;
  }
  function verifiedEntitlement(raw){
    if(!plain(raw))fail('E_ENTITLEMENT','会员权益格式无效');
    const type=raw.type,status=raw.status,title=safeString(raw.title,100);
    if(!['time','quota','credit','feature'].includes(type)||
      !['active','expired','exhausted','inactive'].includes(status)||!title)
      fail('E_ENTITLEMENT','会员权益类型或状态无法核验');
    const e={type,status,title};
    if(type==='time'){
      e.expiresAt=dateMs(raw.expiresAt);
      if(e.expiresAt===null)fail('E_ENTITLEMENT','权益到期日无效');
    }else if(type==='quota'||type==='credit'){
      if(!Number.isSafeInteger(raw.remaining)||raw.remaining<0||
        !Number.isSafeInteger(raw.total)||raw.total<raw.remaining||
        !safeString(raw.unit,20))fail('E_ENTITLEMENT','权益额度无效');
      e.remaining=raw.remaining;e.total=raw.total;e.unit=raw.unit.trim();
    }else{
      e.detail=safeString(raw.detail,120)||'以商品权益说明为准';
    }
    return e;
  }
  function verifiedRecord(raw){
    if(!plain(raw)||!safeString(raw.redemptionId,120)||
      !safeString(raw.skuTitle,100)||dateMs(raw.redeemedAt)===null||
      !['redeemed','reversed'].includes(raw.status))
      fail('E_HISTORY','兑换记录格式无效');
    const key=safeString(raw.idempotencyKey,120);
    // Only a backend-masked voucher can ever be rendered; never use raw code.
    const masked=safeString(raw.voucherPreviewMasked,48);
    return {id:raw.redemptionId,title:raw.skuTitle,
      at:raw.redeemedAt,status:raw.status,
      key,masked:masked&&masked.includes('*')?masked:null};
  }
  function verifiedMember(data){
    if(!plain(data)||data.schemaVersion!==1||dateMs(data.serverNow)===null||
      !plain(data.account)||!['guest','bound'].includes(data.account.state)||
      !Array.isArray(data.entitlements)||data.entitlements.length>32||
      !Array.isArray(data.redemptions)||data.redemptions.length>50)
      fail('E_MEMBER_SCHEMA','会员服务返回了不受支持的数据格式');
    const account=data.account.state==='bound'?{
      state:'bound',id:safeString(data.account.id,120),
      name:safeString(data.account.displayNameMasked,100)}:{state:'guest',id:null,name:null};
    if(account.state==='bound'&&(!account.id||!account.name)||
      account.state==='guest'&&(data.entitlements.length||data.redemptions.length))
      fail('E_MEMBER_SCHEMA','账号与权益归属不一致');
    return {serverNow:data.serverNow,account,
      entitlements:data.entitlements.map(verifiedEntitlement),
      redemptions:data.redemptions.map(verifiedRecord)};
  }
  function benefitDescription(e,serverNow){
    if(e.type==='time'){
      const days=Math.max(0,Math.ceil((e.expiresAt-serverNow)/86400000));
      return (e.status==='active'?'剩余 '+days+' 天 · ':'')+
        '到期 '+dateLabel(e.expiresAt)+' · '+statusLabel(e.status);
    }
    if(e.type==='quota'||e.type==='credit')
      return '剩余 '+e.remaining+' / '+e.total+' '+e.unit+' · '+statusLabel(e.status);
    return e.detail+' · '+statusLabel(e.status);
  }
  const statusLabel=value=>({active:'有效',expired:'已到期',
    exhausted:'已用尽',inactive:'未生效'})[value]||'待核验';
  function renderMember(){
    if(!snapshot)return;
    const {account,entitlements,redemptions,serverNow}=snapshot;
    accountName.textContent=account.state==='bound'?account.name:'尚未登录或绑定账号';
    const active=entitlements.filter(e=>e.status==='active');
    const primary=active.find(e=>e.type==='time')||active[0]||entitlements[0]||null;
    memberState.textContent=account.state==='guest'?'未登录':
      active.length?'权益有效':entitlements.length?'暂无有效权益':'未开通';
    memberState.setAttribute('data-tone',active.length?'active':
      entitlements.length?'warn':'neutral');
    productName.textContent=primary?primary.title:
      account.state==='guest'?'请先绑定 AI VIP Share 产品账号':'尚无已核验商品';
    metricLabel.textContent=primary?.type==='time'?'剩余会员时间':
      primary?.type==='quota'||primary?.type==='credit'?'剩余使用额度':
      primary?.type==='feature'?'已获得的功能':'当前会员权益';
    meter.hidden=true;
    meterBar.style.width='0%';
    meter.removeAttribute('aria-valuenow');
    if(!primary){
      remaining.textContent='—';unit.textContent='暂无权益';
      expiry.textContent='具体权益以服务端核验结果为准';
    }else if(primary.type==='time'){
      remaining.textContent=String(Math.max(0,Math.ceil((primary.expiresAt-serverNow)/86400000)));
      unit.textContent='天';
      expiry.textContent='到期 '+dateLabel(primary.expiresAt);
      // Do not invent original duration; a time entitlement has no verified start.
    }else if(primary.type==='quota'||primary.type==='credit'){
      remaining.textContent=String(primary.remaining);
      unit.textContent=primary.unit;
      expiry.textContent='总额度 '+primary.total+' '+primary.unit;
      if(primary.total>0){
        const percent=Math.max(0,Math.min(100,Math.round(primary.remaining/primary.total*100)));
        meter.hidden=false;meterBar.style.width=percent+'%';
        meter.setAttribute('aria-valuenow',String(percent));
      }
    }else{
      remaining.textContent=primary.status==='active'?'已开通':'未生效';
      unit.textContent='功能权益';
      expiry.textContent=primary.detail;
    }
    verified.textContent='服务端核验时间：'+dateLabel(serverNow)+'；网络与会员分别核验。';
    emptyRow(benefits,'尚未开通任何权益。');
    if(entitlements.length){
      clear(benefits);
      entitlements.forEach(e=>addRow(benefits,e.title,benefitDescription(e,serverNow)));
    }
    historyCount.textContent=String(redemptions.length)+' 条';
    emptyRow(history,'暂无经过核验的兑换记录。');
    if(redemptions.length){
      clear(history);
      redemptions.slice(0,20).forEach(item=>addRow(history,item.title,
        dateLabel(item.at)+' · '+(item.status==='redeemed'?'已兑换':'已撤销')+
        (item.masked?' · '+item.masked:'')));
    }
    refresh.disabled=false;
    // Absence in the bounded ledger is never proof of non-consumption.
    if(recovery&&account.id!==recovery.accountId)
      redeemNotice('当前账号与未确认兑换归属不同。请切回原账号核对，不会继承权益。',true);
    renderRedeem();
  }
  function renderRedeem(){
    const allowed=Boolean(endpoints)&&snapshot?.account.state==='bound'&&!busy&&
      recoveryReady&&!recovery&&!recoveryFault;
    code.disabled=!allowed||Boolean(pending);
    redeem.disabled=!allowed||Boolean(pending)||
      !/^[A-Za-z0-9._-]{6,120}$/.test(code.value.trim());
    redeem.textContent=busy?'正在处理…':'预检兑换';
    confirm.disabled=!allowed||!pending;
    previewPanel.hidden=!pending;
    cancel.hidden=!pending;
    cancel.disabled=busy;
    codeReveal.disabled=code.disabled;
    codeClear.disabled=code.disabled||!code.value;
    // Sensitive code must return to masked mode after a preflight or lock.
    if(code.disabled||!code.value){
      code.type='password';codeReveal.textContent='显示';
      codeReveal.setAttribute('aria-label','显示兑换码');
      codeReveal.setAttribute('aria-pressed','false');
    }
    showRecovery();
  }
  function redeemNotice(message,error=false){
    redeemStatus.textContent=error?'请查看错误提示；未经确认的结果不视为兑换成功。':message;
    redeemError.hidden=!error;
    redeemError.textContent=error?message:'';
  }
  async function businessRequest(method,url,data){
    if(!endpoints||typeof businessSdk?.request!=='function')
      fail('E_PROVIDER','正式会员服务或 Browser SDK 网络授权未配置');
    const result=await businessSdk.request({method,url,
      ...(data===undefined?{}:{data}),config:{timeout:10000,responseType:'json'}});
    if(!plain(result)||!Number.isInteger(result.status)||result.status<200||
      result.status>=300||!plain(result.data))
      fail('E_PROVIDER_RESPONSE','会员服务拒绝请求或响应无效');
    return result.data;
  }
  function acceptMemberSnapshot(data){
    snapshot=data;
    serverSampleAt=performance.now();
    if(pending&&pending.accountId!==data.account.id){
      pending=null;code.value='';
      redeemNotice('账号已变化，本次兑换预检已取消；未提交兑换。',true);
    }
    renderMember();
  }
  async function refreshMember(){
    if(!endpoints||busy)return;
    const current=++seq;
    busy=true;refresh.disabled=true;
    memberState.textContent='正在核验';
    verified.textContent='正在请求正式会员服务，不使用本地缓存作为有效会员证明。';
    renderRedeem();
    try{
      const data=verifiedMember(await businessRequest('GET',endpoints.member));
      if(current!==seq)return;
      acceptMemberSnapshot(data);
    }catch(error){
      if(current!==seq)return;
      snapshot=null;serverSampleAt=null;
      pending=null;code.value='';
      memberState.textContent='无法核验';
      memberState.setAttribute('data-tone','warn');
      metricLabel.textContent='当前会员权益';
      meter.hidden=true;meterBar.style.width='0%';
      meter.removeAttribute('aria-valuenow');
      accountName.textContent='账号状态待核验';
      productName.textContent='无法确认会员身份';
      remaining.textContent='—';unit.textContent='待核验';
      expiry.textContent='权益数据不可用，不能推断会员仍然有效';
      verified.textContent='会员服务暂时不可用；请检查权限或网络后手动刷新。';
      emptyRow(benefits,'权益核验失败');
      emptyRow(history,'兑换历史不可核验');
      historyCount.textContent='暂不可查';
      if(recovery)redeemNotice('会员身份暂无法核验，上次兑换仍待核对；不可再次提交。',true);
      else if(redeemStatus.textContent.includes('服务端已确认兑换成功'))
        redeemNotice('服务端已确认兑换成功，但权益刷新失败；请稍后刷新查看最新数据。');
      else redeemNotice('会员无法核验，兑换已锁定。',true);
    }finally{
      if(current===seq){busy=false;refresh.disabled=false;renderRedeem();}
    }
  }
  function validatePreview(data){
    const now=estimatedServerNow();
    if(!plain(data)||!safeString(data.previewId,160)||
      !safeString(data.accountId,120)||data.accountId!==snapshot?.account.id||
      !safeString(data.skuTitle,100)||!safeString(data.grantSummary,180)||
      !safeString(data.voucherPreviewMasked,48)||
      !data.voucherPreviewMasked.includes('*')||
      dateMs(data.expiresAt)===null||now===null||
      data.expiresAt<=now||data.expiresAt-now>PREVIEW_MAX_LIFETIME_MS)
      fail('E_PREVIEW','兑换预检与当前账号不符、超出安全时限或已失效');
    return {id:data.previewId,accountId:data.accountId,title:data.skuTitle,
      summary:data.grantSummary,masked:data.voucherPreviewMasked,expiresAt:data.expiresAt};
  }
  function validateReceipt(data,key){
    if(!plain(data)||data.status!=='redeemed'||data.idempotencyKey!==key||
      data.accountId!==snapshot?.account.id||
      !safeString(data.redemptionId,120)||
      dateMs(data.redeemedAt)===null||
      !Array.isArray(data.grantedEntitlements)||data.grantedEntitlements.length<1||
      data.grantedEntitlements.length>32)
      fail('E_RECEIPT','未收到有效且归属于当前账号的幂等兑换回执');
    data.grantedEntitlements.forEach(verifiedEntitlement);
    return data;
  }
  async function redeemClick(event){
    if(event?.isTrusted!==true||busy||!endpoints||!recoveryReady||
      recovery||recoveryFault||snapshot?.account.state!=='bound')return;
    if(!pending){
      const value=code.value.trim();
      if(!/^[A-Za-z0-9._-]{6,120}$/.test(value))return;
      const accountId=snapshot.account.id;
      busy=true;renderRedeem();redeemNotice('正在请求服务端核验兑换内容…');
      try{
        const result=validatePreview(await businessRequest('POST',endpoints.voucherPreview,{code:value}));
        if(snapshot?.account.id!==accountId)fail('E_IDENTITY_CHANGED','预检过程中账号已变化');
        pending=result;code.value='';
        previewTitle.textContent=result.title;
        previewDescription.textContent=result.summary+' · '+result.masked+'；确认后才会兑换。';
        previewAccount.textContent='接收账号：'+snapshot.account.name;
        redeemNotice('请核对商品与账号，再点击「确认兑换」。');
      }catch{
        redeemNotice('无法核验兑换码，请检查账号、兑换码或网络后重试。',true);
      }finally{busy=false;renderRedeem();}
      return;
    }
    const previewNow=estimatedServerNow();
    if(pending.accountId!==snapshot.account.id||previewNow===null||
      pending.expiresAt<=previewNow){
      pending=null;redeemNotice('预检已过期、服务端时间已失效或账号变化，请重新核对兑换码。',true);
      renderRedeem();return;
    }
    let key;
    try{key=crypto.randomUUID();}catch{
      redeemNotice('无法安全生成兑换事务标识；本次兑换未提交。',true);return;
    }
    const accountId=pending.accountId,previewId=pending.id;
    busy=true;renderRedeem();
    redeemNotice('正在重新核对当前账号与预检时限；尚未提交兑换。');
    try{
      // Validate current identity before creating a write-ahead journal.
      // The Provider must also bind the actual POST to its authenticated session.
      const latest=verifiedMember(await businessRequest('GET',endpoints.member));
      acceptMemberSnapshot(latest);
      const currentServerNow=estimatedServerNow();
      if(latest.account.state!=='bound'||latest.account.id!==accountId||
        pending?.id!==previewId||currentServerNow===null||
        pending.expiresAt<=currentServerNow)
        fail('E_PRE_SUBMIT','账号或预检状态发生变化');
    }catch{
      pending=null;code.value='';busy=false;
      redeemNotice('账号或预检状态无法重新核验，本次未提交兑换；请重新预检。',true);
      renderRedeem();
      return;
    }
    redeemNotice('正在持久保存兑换事务，再提交服务端；请勿重复操作。');
    try{
      await beginRecovery(accountId,key); // Write-ahead and verified readback.
      if(snapshot?.account.id!==accountId)
        fail('E_IDENTITY_CHANGED','事务持久化后账号变化；禁止提交');
      const result=await businessRequest('POST',endpoints.voucherRedeem,{
        previewId,accountId,idempotencyKey:key});
      validateReceipt(result,key);
      pending=null;code.value='';
      // Valid receipt is authoritative; failed journal clearing keeps a lock.
      await clearRecovered(key);
      redeemNotice('服务端已确认兑换成功。正在刷新权益与兑换记录；代理状态保持不变。');
      busy=false;renderRedeem();
      await refreshMember();
    }catch{
      pending=null;code.value='';
      if(!recovery)recoveryFault='无法证明兑换事务的持久状态，已禁止再次提交。';
      redeemNotice(recovery?'兑换结果未确认。请使用「核对上次兑换」查询服务端状态，切勿重复兑换。':
        '无法确认本地兑换状态，已禁止提交。请检查存储授权。',true);
    }finally{busy=false;renderRedeem();}
  }
  async function checkRecoveryClick(event){
    if(event?.isTrusted!==true||busy||!endpoints||!recoveryReady||
      recoveryFault||!recovery||snapshot?.account.id!==recovery.accountId)return;
    busy=true;renderRedeem();
    redeemNotice('正在查询上次兑换的服务端最终状态（不会再次消费兑换码）…');
    try{
      const saved=(await readRecovery()).record;
      if(!saved||saved.idempotencyKey!==recovery.idempotencyKey||
        saved.accountId!==recovery.accountId)
        fail('E_RECOVERY_CHANGED','本地事务已变化');
      const latest=verifiedMember(await businessRequest('GET',endpoints.member));
      acceptMemberSnapshot(latest);
      if(latest.account.state!=='bound'||latest.account.id!==saved.accountId)
        fail('E_RECOVERY_ACCOUNT','当前服务端账号与待核对事务归属不同');
      const data=await businessRequest('POST',endpoints.voucherStatus,{
        accountId:saved.accountId,idempotencyKey:saved.idempotencyKey});
      if(!plain(data)||data.accountId!==saved.accountId||
        data.idempotencyKey!==saved.idempotencyKey)
        fail('E_STATUS_IDENTITY','服务端没有返回匹配的账号和事务');
      if(data.status==='redeemed'){
        validateReceipt(data,saved.idempotencyKey);
        await clearRecovered(saved.idempotencyKey);
        redeemNotice('服务端已确认上次兑换成功，已解除重复提交保护；请刷新权益。');
      }else if(data.status==='rejected'&&data.final===true){
        await clearRecovered(saved.idempotencyKey);
        redeemNotice('服务端确认上次兑换未生效。已解除锁定，可重新预检兑换码。');
      }else redeemNotice('服务端仍未给出最终结论；保留恢复记录，禁止重复兑换。',true);
    }catch{
      redeemNotice('查询失败或服务端状态无法验证；恢复记录保留，禁止重复兑换。',true);
    }finally{busy=false;renderRedeem();}
  }
  refresh.addEventListener('click',event=>{
    if(event?.isTrusted===true)void refreshMember();
  });
  code.addEventListener('input',()=>{
    redeemNotice('兑换内容需先由服务端预检，确认后才会提交。');
    renderRedeem();
  });
  codeReveal.addEventListener('click',event=>{
    if(event?.isTrusted!==true||code.disabled)return;
    const visible=code.type==='password';
    code.type=visible?'text':'password';
    codeReveal.textContent=visible?'隐藏':'显示';
    codeReveal.setAttribute('aria-label',visible?'隐藏兑换码':'显示兑换码');
    codeReveal.setAttribute('aria-pressed',String(visible));
  });
  codeClear.addEventListener('click',event=>{
    if(event?.isTrusted!==true||code.disabled)return;
    code.value='';
    code.type='password';
    redeemNotice('兑换码已清空，尚未提交。');
    renderRedeem();
    code.focus?.();
  });
  // Both keyboard Enter and button click use one real form-submit handler.
  redeemForm.addEventListener('submit',event=>{
    event.preventDefault();
    void redeemClick(event);
  });
  confirm.addEventListener('click',event=>{void redeemClick(event);});
  recoveryCheck.addEventListener('click',event=>{void checkRecoveryClick(event);});
  cancel.addEventListener('click',event=>{
    if(event?.isTrusted!==true||busy)return;
    pending=null;code.value='';
    redeemNotice('已取消本次预检，未提交任何兑换。');
    renderRedeem();code.focus?.();
  });
  const shopSdk=window.OpenDeskSDK?.browser?.tabs;
  shop.disabled=!catalog;
  shopStatus.textContent=catalog?'在新标签页打开已审核的商品目录（需要安装审阅和浏览器授权）。':
    '正式商品目录尚未配置，不展示虚假价格或订单。';
  shop.addEventListener('click',event=>{
    if(event?.isTrusted!==true||!catalog||shop.disabled)return;
    shop.disabled=true;shopStatus.textContent='正在请求打开商品目录…';
    // Invoke the reviewed SDK directly in the trusted user gesture.
    let operation;
    try{
      if(typeof shopSdk?.create!=='function')throw Error('当前版本缺少网页打开能力');
      operation=shopSdk.create({url:catalog});
    }catch{
      shopStatus.textContent='未能打开商品目录，请检查权限或稍后重试。';
      shop.disabled=false;return;
    }
    Promise.resolve(operation).then(
      ()=>{shopStatus.textContent='已请求在浏览器新标签页打开商品目录。';},
      ()=>{shopStatus.textContent='未能打开商品目录，请检查权限或稍后重试。';}
    ).finally(()=>{shop.disabled=false;});
  });
  // AI domain preferences and provider endpoints belong to this installed tool,
  // never the public browser-wide proxy Driver. Production remains disabled
  // until a separately reviewed, authenticated Provider is configured.
  const AI_PROXY_DOMAINS=Object.freeze([
    'chatgpt.com','openai.com','claude.ai','gemini.google.com','perplexity.ai'
  ]);
  const APPROVED_PROXY_ENDPOINT=null; // Release-owned; never use localhost for production.
  function setupManagedProxy(){
    const status=byId('ai-vip-proxy-state'),detail=byId('ai-vip-proxy-detail');
    const refreshProxy=byId('ai-vip-proxy-refresh'),toggle=byId('ai-vip-proxy-toggle');
    const alert=byId('ai-vip-proxy-alert'),alertText=byId('ai-vip-proxy-alert-text');
    if(!status||!detail||!refreshProxy||!toggle||!alert||!alertText)return;
    const sdk=window.OpenDeskSDK?.browser?.proxy?.managed;
    let current=null,working=false,enabling=false,stopRequested=false,lastError='';
    const safeEndpoint=APPROVED_PROXY_ENDPOINT&&
      ['https','socks5'].includes(APPROVED_PROXY_ENDPOINT.scheme)&&
      typeof APPROVED_PROXY_ENDPOINT.host==='string'&&
      Number.isSafeInteger(APPROVED_PROXY_ENDPOINT.port)?APPROVED_PROXY_ENDPOINT:null;
    // A proxy route does not prove membership; STOP never requires a Provider.
    const hasEntitlement=()=>Boolean(endpoints&&snapshot&&estimatedServerNow()!==null&&
      snapshot.account?.state==='bound'&&snapshot.entitlements?.some(row=>
        row.status==='active'&&(row.type!=='time'||row.expiresAt>estimatedServerNow())));
    const paint=()=>{
      const stopAction=enabling||current?.canStop===true;
      const canStart=Boolean(sdk&&safeEndpoint&&hasEntitlement()&&
        current?.state==='disabled'&&typeof sdk.requestEnable==='function');
      const canStop=Boolean(sdk&&typeof sdk.requestDisable==='function'&&
        (enabling||current?.canStop===true));
      toggle.setAttribute('data-action',stopAction?'stop':'start');
      toggle.classList.toggle('od-button--secondary',stopAction);
      toggle.textContent=stopAction?(stopRequested?'已请求停用':'停用代理'):
        working?'正在检测…':'启用代理';
      // When START is outstanding, STOP records the user's intent. As soon as
      // START settles, a new SDK disable request is made. No late START
      // response may render an "enabled" state without a native status read.
      toggle.disabled=!sdk||stopRequested||
        (stopAction?!canStop||(!enabling&&working):working||!canStart);
      refreshProxy.disabled=working||enabling||!sdk;
      status.textContent=!sdk?'SDK 不可用':stopRequested?'待执行 STOP':
        enabling?'启用请求中':!current?'尚未读取':
        ({enabled:'已启用',disabled:'已停止',conflict:'代理被占用',
          unavailable:'需要恢复'})[current.state]||'状态未知';
      status.setAttribute('data-tone',current?.state==='enabled'?'active':
        ['conflict','unavailable'].includes(current?.state)||lastError?'warn':'neutral');
      if(!sdk)detail.textContent='当前浏览器未提供已批准的 Managed Proxy SDK。';
      else if(stopRequested)detail.textContent='已记录停用意图；启用请求完成后立即申请 STOP，不自动恢复代理。';
      else if(enabling)detail.textContent='正在请求启用代理，可直接点击「停用代理」撤销本次启用意图。';
      else if(lastError)detail.textContent=lastError;
      else if(current?.canStop)detail.textContent=
        '当前安装存在可停用的代理资源；停用不需要会员或商业服务在线。';
      else if(current?.state==='conflict')detail.textContent=
        '浏览器代理由其他扩展、工具或策略管理；不会抢占其控制权。';
      else if(!safeEndpoint)detail.textContent=
        '正式代理 Provider 尚未配置，启用不可用；现有代理仍可独立 STOP。';
      else if(!hasEntitlement())detail.textContent=
        '会员权益尚未由正式服务核验，禁止仅凭网络可用而启用访问。';
      else detail.textContent='启用需通过可信 Side Panel 单次确认；Chrome 状态必须回读。';
      const conflict=['conflict','unavailable'].includes(current?.state);
      alert.hidden=!(conflict||lastError);
      alertText.textContent=lastError||(
        conflict?'代理控制状态异常；请检查 Chrome 扩展设置或重新检测。':'');
    };
    async function update({keepError=false}={}){
      if(!sdk||working||enabling)return;
      working=true;paint();
      try{
        const state=await sdk.getStatus();
        if(!state||typeof state.state!=='string')throw Error('代理状态回执无效');
        current=state;
        if(!keepError)lastError='';
      }catch(error){
        current=null;
        lastError='代理状态无法确认（'+String(error?.code||'E_PROXY_STATUS').slice(0,50)+'）。';
      }finally{working=false;paint();}
    }
    async function stop({queued=false}={}){
      if(working||!sdk||typeof sdk.requestDisable!=='function'||
        (!queued&&current?.canStop!==true))return;
      working=true;lastError='';paint();
      let failed=false;
      try{
        await sdk.requestDisable();
      }catch(error){
        failed=true;
        lastError='STOP 未获确认（'+String(error?.code||'E_PROXY_STOP').slice(0,50)+
          '），不会修改其他工具或系统网络。请重新检测并按需重试。';
      }finally{
        working=false;
        await update({keepError:failed});
      }
    }
    async function start(){
      if(working||!sdk||!safeEndpoint||!hasEntitlement()||
        current?.state!=='disabled'||typeof sdk.requestEnable!=='function')return;
      working=true;enabling=true;stopRequested=false;lastError='';paint();
      try{
        await sdk.requestEnable({config:{endpoint:{...safeEndpoint},
          domains:[...AI_PROXY_DOMAINS]}});
      }catch(error){
        lastError='启用未确认（'+String(error?.code||'E_PROXY').slice(0,50)+
          '），不会推断代理已连接。';
      }finally{
        enabling=false;working=false;
        if(stopRequested){
          stopRequested=false;
          // The STOP gesture happened while START was in flight.
          // Always ask the ownership-scoped SDK to disable; no unsafe
          // chrome.proxy writes or interference with another owner.
          await stop({queued:true});
        }else await update({keepError:Boolean(lastError)});
      }
    }
    refreshProxy.addEventListener('click',event=>{
      if(event?.isTrusted===true)void update();
    });
    toggle.addEventListener('click',event=>{
      if(event?.isTrusted!==true)return;
      if(enabling){
        stopRequested=true;paint();return;
      }
      if(working)return;
      if(current?.canStop===true)void stop();
      else void start();
    });
    paint();
    void update();
  }
  setupManagedProxy();

  // Recover independently of Provider configuration; never silently drop a journal.
  void loadRecovery();
  if(!endpoints){
    memberState.textContent='服务未配置';
    memberState.setAttribute('data-tone','warn');
    accountName.textContent='会员账号暂不可核验';
    productName.textContent='正式会员服务尚未配置';
    metricLabel.textContent='当前会员权益';
    verified.textContent='正式会员 Provider 尚未配置，账号、权益与兑换记录均不可验证。';
    redeemNotice('兑换服务未配置，暂无法提交。权益仅按服务端回执生效；兑换不会自动开启代理。');
    refresh.disabled=true;
  }else{
    refresh.disabled=false;
    void refreshMember();
  }
  renderRedeem();
})();
