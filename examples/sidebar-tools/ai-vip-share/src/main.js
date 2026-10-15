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
  const code=byId('ai-vip-redeem-code');
  const redeem=byId('ai-vip-redeem');
  const redeemStatus=byId('ai-vip-redeem-status');
  const redeemError=byId('ai-vip-redeem-error');
  const previewPanel=byId('ai-vip-redeem-preview');
  const previewTitle=byId('ai-vip-preview-title');
  const previewDescription=byId('ai-vip-preview-description');
  const previewAccount=byId('ai-vip-preview-account');
  const cancel=byId('ai-vip-redeem-cancel');
  const shop=byId('ai-vip-shop-open'),shopStatus=byId('ai-vip-shop-status');
  if([memberState,accountName,productName,remaining,unit,expiry,verified,
    benefits,history,historyCount,refresh,code,redeem,redeemStatus,redeemError,
    previewPanel,previewTitle,previewDescription,previewAccount,cancel,shop,shopStatus]
      .some(element=>!element))return;

  // Release-owned values: only populate after commercial/provider review.
  // Do not use the technical proxy activate/verify URLs for these endpoints.
  const BUSINESS_ENDPOINTS=Object.freeze({member:'',voucherPreview:'',voucherRedeem:''});
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
    if(!member||!voucherPreview||!voucherRedeem)return null;
    const origins=[member,voucherPreview,voucherRedeem].map(url=>new URL(url).origin);
    return new Set(origins).size===1?{member,voucherPreview,voucherRedeem}:null;
  }
  const endpoints=validatedBusinessEndpoints();
  const catalog=validCatalogUrl(PRODUCT_CATALOG_URL);
  const businessSdk=window.OpenDeskSDK?.browser?.network;
  let snapshot=null,pending=null,uncertainKey=null,busy=false,seq=0;
  let lastVerifiedAt=null;
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
    lastVerifiedAt=Date.now();
    accountName.textContent=account.state==='bound'?account.name:'尚未登录或绑定账号';
    const active=entitlements.filter(e=>e.status==='active');
    const primary=active.find(e=>e.type==='time')||active[0]||entitlements[0]||null;
    memberState.textContent=account.state==='guest'?'未登录':
      active.length?'权益有效':entitlements.length?'暂无有效权益':'未开通';
    productName.textContent=primary?primary.title:'尚无已核验商品';
    if(!primary){
      remaining.textContent='—';unit.textContent='暂无权益';
      expiry.textContent='商品时长与额度以实际核验结果为准';
    }else if(primary.type==='time'){
      remaining.textContent=String(Math.max(0,Math.ceil((primary.expiresAt-serverNow)/86400000)));
      unit.textContent='天';
      expiry.textContent='服务端到期时间：'+dateLabel(primary.expiresAt);
    }else if(primary.type==='quota'||primary.type==='credit'){
      remaining.textContent=String(primary.remaining);
      unit.textContent=primary.unit;
      expiry.textContent='额度总量 '+primary.total+' '+primary.unit+'，'+statusLabel(primary.status);
    }else{
      remaining.textContent=primary.status==='active'?'有效':'—';
      unit.textContent='功能权益';
      expiry.textContent=primary.detail;
    }
    verified.textContent='权益数据截至服务端 '+dateLabel(serverNow)+'；网络状态与会员权益分别核验。';
    emptyRow(benefits,'尚未开通任何权益。');
    if(entitlements.length){
      clear(benefits);
      entitlements.forEach(e=>addRow(benefits,e.title,benefitDescription(e,serverNow)));
    }
    historyCount.textContent=String(redemptions.length)+' 条（本次核验）';
    emptyRow(history,'没有已经核验的兑换记录。');
    if(redemptions.length){
      clear(history);
      redemptions.slice(0,20).forEach(item=>addRow(history,item.title,
        dateLabel(item.at)+' · '+(item.status==='redeemed'?'已兑换':'已撤销')+
        (item.masked?' · '+item.masked:'')));
    }
    refresh.disabled=false;
    if(uncertainKey){
      const found=redemptions.some(row=>row.key===uncertainKey&&row.status==='redeemed');
      if(found){
        uncertainKey=null;
        redeemStatus.textContent='已通过最新服务端兑换记录确认兑换成功，未自动启用代理。';
      }else redeemStatus.textContent='兑换结果仍未确认，请联系服务商核对记录，勿再次提交。';
    }
    renderRedeem();
  }
  function renderRedeem(){
    const allowed=Boolean(endpoints)&&snapshot?.account.state==='bound'&&!busy&&!uncertainKey;
    code.disabled=!allowed||Boolean(pending);
    redeem.disabled=!allowed||(!pending&&!/^[A-Za-z0-9._-]{6,120}$/.test(code.value.trim()));
    redeem.textContent=busy?'正在处理':pending?'确认兑换':'立即兑换';
    previewPanel.hidden=!pending;
    cancel.hidden=!pending||busy;
  }
  function redeemNotice(message,error=false){
    redeemStatus.textContent=message;
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
      snapshot=data;
      renderMember();
    }catch(error){
      if(current!==seq)return;
      snapshot=null;
      memberState.textContent='无法核验';
      accountName.textContent='账号状态待核验';
      productName.textContent='无法确认会员身份';
      remaining.textContent='—';unit.textContent='待核验';
      expiry.textContent='权益数据不可用，不能推断会员仍然有效';
      verified.textContent='会员服务暂时不可用；请检查权限或网络后手动刷新。';
      emptyRow(benefits,'权益核验失败');
      emptyRow(history,'兑换历史不可核验');
      historyCount.textContent='暂不可查';
      redeemNotice('会员无法核验，兑换已锁定。',true);
    }finally{
      if(current===seq){busy=false;refresh.disabled=false;renderRedeem();}
    }
  }
  function validatePreview(data){
    if(!plain(data)||!safeString(data.previewId,160)||
      !safeString(data.accountId,120)||data.accountId!==snapshot?.account.id||
      !safeString(data.skuTitle,100)||!safeString(data.grantSummary,180)||
      !safeString(data.voucherPreviewMasked,48)||
      !data.voucherPreviewMasked.includes('*')||
      dateMs(data.expiresAt)===null||data.expiresAt<=Date.now())
      fail('E_PREVIEW','兑换预检与当前账号不符或已失效');
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
    if(event?.isTrusted!==true||busy||!endpoints||uncertainKey||
      snapshot?.account.state!=='bound')return;
    if(!pending){
      const value=code.value.trim();
      if(!/^[A-Za-z0-9._-]{6,120}$/.test(value))return;
      busy=true;renderRedeem();redeemNotice('正在请求服务端核验兑换内容…');
      try{
        const result=validatePreview(await businessRequest('POST',endpoints.voucherPreview,{code:value}));
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
    if(pending.expiresAt<=Date.now()){
      pending=null;redeemNotice('兑换预检已过期，请重新输入兑换码。',true);
      renderRedeem();return;
    }
    let key;
    try{key=crypto.randomUUID();}catch{
      redeemNotice('无法安全生成兑换事务标识；本次兑换未提交。',true);return;
    }
    busy=true;renderRedeem();
    redeemNotice('正在提交兑换，请勿重复操作。');
    try{
      const result=await businessRequest('POST',endpoints.voucherRedeem,{
        previewId:pending.id,accountId:pending.accountId,idempotencyKey:key});
      validateReceipt(result,key);
      pending=null;code.value='';
      redeemNotice('服务端已确认兑换成功。正在刷新权益与兑换记录；代理状态保持不变。');
      busy=false;renderRedeem();
      await refreshMember();
    }catch{
      // A network error after POST has UNKNOWN EFFECT. No automatic retry.
      uncertainKey=key;pending=null;code.value='';
      redeemNotice('兑换结果未确认。请刷新记录或联系服务商核对，切勿重复兑换。',true);
    }finally{busy=false;renderRedeem();}
  }
  refresh.addEventListener('click',event=>{
    if(event?.isTrusted===true)void refreshMember();
  });
  code.addEventListener('input',()=>{redeemNotice('兑换内容需先经过服务端预检，确认后才会提交。');renderRedeem();});
  redeem.addEventListener('click',event=>{void redeemClick(event);});
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
    // Browser SDK runs the existing trusted per-operation approval.
    Promise.resolve().then(()=>{
      const sdk=shopSdk;
      if(typeof sdk?.create!=='function')throw Error('当前版本缺少网页打开能力');
      return sdk.create({url:catalog});
    }).then(
      ()=>{shopStatus.textContent='已请求在浏览器新标签页打开商品目录。';},
      ()=>{shopStatus.textContent='未能打开商品目录，请检查权限或稍后重试。';}
    ).finally(()=>{shop.disabled=false;});
  });
  if(!endpoints){
    memberState.textContent='服务未配置';
    verified.textContent='正式会员 Provider 尚未配置，账号、权益与兑换记录均不可验证。';
    redeemNotice('兑换服务未配置，暂无法提交。权益仅按服务端回执生效；兑换不会自动开启代理。');
    refresh.disabled=true;
  }else{
    refresh.disabled=false;
    void refreshMember();
  }
  renderRedeem();
})();
