// AI VIP Share business presentation stays inside the installed opaque sandbox.
// This tool never treats an aiAccess proxy lease as a paid member entitlement.
(function(){
  'use strict';
  let started=false,release=()=>{};
  function mountController(){
  if(started)return release;
  const root=window.OpenDeskTool?.root;
  if(!root||!root.querySelector?.('#ai-vip-member-card'))return null;
  started=true;
  const byId=id=>root.querySelector('#'+id);
  const memberCard=byId('ai-vip-member-card');
  const memberFacts=byId('ai-vip-member-facts');
  const secondaryMetrics=byId('ai-vip-secondary-metrics');
  const historyDetails=byId('ai-vip-history-details');
  const redeemIntro=byId('ai-vip-redeem-intro');
  const redeemFine=byId('ai-vip-redeem-fine');
  const shopSection=byId('ai-vip-shop-section');
  const proxySection=byId('ai-vip-proxy-section');
  const memberState=byId('ai-vip-member-state');
  const accountName=byId('ai-vip-account-name');
  const productName=byId('ai-vip-product-name');
  const remaining=byId('ai-vip-remaining');
  const unit=byId('ai-vip-remaining-unit');
  const expiry=byId('ai-vip-expiry');
  const verified=byId('ai-vip-verified');

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
  const localSection=byId('ai-vip-local-development');
  const localConnect=byId('ai-vip-local-connect'),localStatus=byId('ai-vip-local-status');
  const cookieSection=byId('ai-vip-cookie-section'),cookieStatus=byId('ai-vip-cookie-status');
  const cookieInstall=byId('ai-vip-cookie-install'),cookieResults=byId('ai-vip-cookie-results');
  const sharedSection=byId('ai-vip-shared-section'),sharedAssigned=byId('ai-vip-shared-account');
  const sharedStatus=byId('ai-vip-shared-status'),sharedReceive=byId('ai-vip-shared-receive');
  const cookieOpen=byId('ai-vip-cookie-open');
  if([memberState,accountName,productName,remaining,unit,expiry,verified,
    secondaryMetrics,history,historyCount,refresh,code,redeem,redeemStatus,redeemError,
    previewPanel,previewTitle,previewDescription,previewAccount,cancel,
    recoveryPanel,recoveryStatus,recoveryCheck,shop,shopStatus,
    metricLabel,meter,meterBar,redeemForm,codeReveal,codeClear,confirm,
    memberCard,memberFacts,historyDetails,redeemIntro,redeemFine,
    shopSection,proxySection]
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
  const productionEndpoints=validatedBusinessEndpoints();
  let endpoints=productionEndpoints;
  const LOCAL_ORIGIN='http://127.0.0.1:7898';
  const LOCAL_ENDPOINTS=Object.freeze({member:LOCAL_ORIGIN+'/api/member',
    voucherPreview:LOCAL_ORIGIN+'/api/preview',voucherRedeem:LOCAL_ORIGIN+'/api/redeem',
    voucherStatus:LOCAL_ORIGIN+'/api/status'});
  const LOCAL_DOMAINS=Object.freeze(['chatgpt.com','openai.com','claude.ai','anthropic.com',
    'gemini.google.com','generativelanguage.googleapis.com','perplexity.ai']);
  const LOCAL_PREFERENCE_KEY='aiVipLocalDevelopmentR136';
  const catalog=validCatalogUrl(PRODUCT_CATALOG_URL);
  const businessSdk=window.OpenDeskSDK?.browser?.network;
  // Existing installed-tool storage is bound by Host to package and install epoch.
  // Never store a voucher, password, auth cookie, proxy lease or access token.
  const RECOVERY_KEY='aiVipRedeemR52',PACKAGE_VERSION='1.4.2';
  // Do not strand an unresolved 1.2.0 voucher journal after a tool upgrade.
  const RECOVERY_COMPAT_VERSIONS=Object.freeze(['1.2.0','1.3.0','1.3.1','1.3.2','1.3.3','1.3.4','1.3.5','1.3.6','1.3.7','1.3.8','1.3.9','1.4.0','1.4.1','1.4.2']);
  const storeRequest=window.OpenDeskTool.request;
  let snapshot=null,pending=null,recovery=null,recoveryFault=null;
  let recoveryReady=false,busy=false,seq=0;
  let refreshProxyPresentation=()=>{};
  let developmentProfile=null,developmentRead=0,localMode=false,localConnecting=false;
  let localChoiceLoaded=false,localChoice=false,localNotice='',serviceRevision=0;
  // Release-owned exact URLs. No production Cookie source/target has been approved.
  const COOKIE_TARGETS=Object.freeze([]),COOKIE_KEY='aiVipCookieDeliveryR137';
  const COOKIE_CODES=new Set(['E_OUTCOME_UNKNOWN','E_COOKIE_CONFLICT','E_COOKIE_SCOPE','E_COOKIE_STORE',
    'E_COOKIE_PARTITION','E_CHROME_UNSUPPORTED','E_CHROME_PERMISSION_REQUIRED','E_SITE_GRANT_REQUIRED',
    'E_GRANT_REVOKED','E_TOOL_CHANGED','E_TOOL_DISABLED','E_OWNER','E_CONTEXT','E_PERMISSION','E_SCHEMA','E_LIMIT']);
  // Keep exact error codes in the durable receipt. Only this display map
  // translates them for non-technical users; no code is logged or retried.
  const COOKIE_RESULT_LABELS=Object.freeze({
    E_OUTCOME_UNKNOWN:'写入结果待核对',
    E_COOKIE_CONFLICT:'网站会话冲突',
    E_COOKIE_SCOPE:'会话范围不匹配',
    E_COOKIE_STORE:'浏览器会话存储不可用',
    E_COOKIE_PARTITION:'当前浏览器不支持此会话',
    E_CHROME_UNSUPPORTED:'浏览器不支持该操作',
    E_CHROME_PERMISSION_REQUIRED:'尚未授予浏览器 Cookie 权限',
    E_SITE_GRANT_REQUIRED:'请先允许此网站的 Cookie 访问',
    E_GRANT_REVOKED:'网站授权已撤销',
    E_TOOL_CHANGED:'工具已更新，请重新打开',
    E_TOOL_DISABLED:'工具已停用',
    E_OWNER:'会话不属于当前工具',
    E_CONTEXT:'网页状态已变化',
    E_PERMISSION:'权限不足',
    E_SCHEMA:'会话内容格式无效',
    E_LIMIT:'会话内容超出限制'
  });
  let cookiePending=null,cookieRecord=null,cookieReady=false,cookieBusy=false,cookieFault='';
  let cookieFaultRecoverable=false;
  let sharedCatalog=null,sharedId='',sharedGeneration=0,sharedBusy=false,sharedNotice='',acquireAfterActivation=false;
  let localSwitchBlocked=()=>false,refreshDevelopmentAvailability=async()=>{};
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
  const exactKeys=(value,keys)=>plain(value)&&Object.keys(value).every(key=>keys.includes(key));
  const cookieScope=rows=>JSON.stringify(rows.map(row=>[row.name,row.path,row.domain||'']).sort());
  function validateSharedCatalog(data){
    if(data===undefined)return null;
    if(!exactKeys(data,['schemaVersion','companyId','assignedAccountId','redemptionId','accounts'])||data.schemaVersion!==1||
      !safeString(data.companyId,120)||!safeString(data.assignedAccountId,120)||!safeString(data.redemptionId,120)||
      !Array.isArray(data.accounts)||data.accounts.length!==1||data.accounts[0]?.id!==data.assignedAccountId)
      fail('E_SHARED_SCHEMA','共享账号目录无效');
    const ids=new Set(),scopes=new Map();
    const accounts=data.accounts.map(row=>{
      if(!exactKeys(row,['id','label','targetUrl','cookieScope'])||!safeString(row.id,120)||
        ids.has(row.id)||!safeString(row.label,100)||!cookieTarget(row.targetUrl)||
        !Array.isArray(row.cookieScope)||!row.cookieScope.length||row.cookieScope.length>50)
        fail('E_SHARED_SCHEMA','共享账号或目标无效');
      ids.add(row.id);
      const identities=new Set();
      for(const slot of row.cookieScope){
        if(!exactKeys(slot,['name','path','domain'])||!safeString(slot.name,256)||/[;=\s\x00-\x1f\x7f]/.test(slot.name)||
          typeof slot.path!=='string'||!slot.path.startsWith('/')||slot.path.length>512||/[\r\n;]/.test(slot.path)||
          (slot.domain!==undefined&&slot.domain!==new URL(row.targetUrl).hostname)||
          identities.has(slot.name+'\n'+slot.path))fail('E_SHARED_SCHEMA','共享会话范围无效');
        identities.add(slot.name+'\n'+slot.path);
      }
      const scope=cookieScope(row.cookieScope);
      if(scopes.has(row.targetUrl)&&scopes.get(row.targetUrl)!==scope)
        fail('E_SHARED_SCHEMA','同一目标的账号必须完整替换相同会话范围');
      scopes.set(row.targetUrl,scope);
      return {...row,cookieScope:row.cookieScope.map(slot=>({...slot}))};
    });
    return {companyId:data.companyId,assignedAccountId:data.assignedAccountId,redemptionId:data.redemptionId,accounts};
  }
  function invalidateShared(){
    sharedGeneration++;sharedBusy=false;sharedCatalog=null;sharedId='';
    if(cookiePending?.sharedAccountId)cookiePending=null;
  }
  function assignedShared(){return sharedCatalog?.accounts.find(row=>row.id===sharedId);}
  function renderShared(){
    const selection=assignedShared();
    // Allocation remains private server state; only a conditional session
    // recovery action is exposed in the installable product.
    if(sharedSection)sharedSection.hidden=!sharedCatalog;
    if(sharedAssigned)sharedAssigned.textContent=selection?.label||'尚未分配';
    if(sharedReceive){
      sharedReceive.textContent=cookieRecord?.state==='success'?'重新获取网站会话':'获取网站会话';
      sharedReceive.hidden=!selection||Boolean(cookiePending)||
        ['unknown','partial'].includes(cookieRecord?.state);
      sharedReceive.disabled=busy||cookieBusy||sharedBusy||!selection||
        !cookieReady||(Boolean(cookieFault)&&!cookieFaultRecoverable)||
        ['unknown','partial'].includes(cookieRecord?.state);
    }
    if(sharedStatus)sharedStatus.textContent=['unknown','partial'].includes(cookieRecord?.state)?
      '上次会话写入结果仍需人工核对；已停止取得会话，不会自动重放。':
      sharedBusy?'正在取得服务器分配账号的会话…':sharedNotice||
      (selection?'服务器已分配 '+selection.label+'；尚未写入目标网站。':'当前没有服务器分配的账号。');
    if(cookieBusy)refresh.disabled=true;
  }
  async function requestSharedSession(){
    const selected=assignedShared();
    if(!selected||busy||sharedBusy||cookieBusy||!endpoints||!cookieReady||(cookieFault&&!cookieFaultRecoverable)||
      ['unknown','partial'].includes(cookieRecord?.state))return;
    if(cookieFaultRecoverable){cookieFault='';cookieFaultRecoverable=false;}
    const generation=++sharedGeneration,revision=serviceRevision,accountId=snapshot?.account.id;
    const companyId=sharedCatalog.companyId,redemptionId=sharedCatalog.redemptionId,requestId=crypto.randomUUID();
    cookiePending=null;sharedBusy=true;sharedNotice='';renderRedeem();
    try{
      // The same authenticated business endpoint handles a distinct, structured session request.
      const result=await businessRequest('POST',endpoints.voucherStatus,
        {operation:'sharedSession',accountId,redemptionId,requestId});
      if(generation!==sharedGeneration||revision!==serviceRevision)return;
      const now=estimatedServerNow();
      if(!exactKeys(result,['schemaVersion','accountId','sharedAccountId','redemptionId','requestId','serverNow','cookieDelivery'])||
        result.schemaVersion!==1||result.accountId!==accountId||snapshot?.account.id!==accountId||
        result.sharedAccountId!==sharedCatalog?.assignedAccountId||result.redemptionId!==redemptionId||
        sharedCatalog?.redemptionId!==redemptionId||result.requestId!==requestId||dateMs(result.serverNow)===null||
        now===null||Math.abs(now-result.serverNow)>30000||sharedCatalog?.companyId!==companyId)
        fail('E_SHARED_IDENTITY','交付与当前共享账号不符');
      const delivery=validateCookieDelivery(result.cookieDelivery);
      if(delivery.targetUrl!==selected.targetUrl||cookieScope(delivery.payload.cookies)!==cookieScope(selected.cookieScope))
        fail('E_SHARED_SCOPE','交付未完整覆盖该账号已批准的会话范围');
      receiveCookies(result);
      if(!cookiePending)fail('E_SHARED_DELIVERY','交付无法接收');
      cookiePending={...cookiePending,accountId,sharedAccountId:result.sharedAccountId,companyId,redemptionId,
        scope:cookieScope(selected.cookieScope),revision,assignmentGeneration:generation};
      sharedNotice='服务器已交付 '+selected.label+'。请确认写入，再到目标网页核对账号。';
    }catch{
      if(generation!==sharedGeneration||revision!==serviceRevision)return;
      cookiePending=null;sharedNotice='未取得有效的服务器分配账号交付；请刷新授权目录后重试。未写入 Cookie。';
    }finally{
      if(generation===sharedGeneration){sharedBusy=false;renderRedeem();}
    }
  }
  sharedReceive?.addEventListener('click',event=>{
    if(event.isTrusted===true&&!sharedReceive.disabled)void requestSharedSession();
  });
  async function openCookieTarget(){
    if(cookieRecord?.state!=='success'||!cookieTarget(cookieRecord.targetUrl))return;
    try{await window.OpenDeskSDK.browser.tabs.create({url:cookieRecord.targetUrl});}
    catch{sharedNotice='Cookie 已写入，但目标网页未能打开；请手动打开目标站核对账号。';renderShared();}
  }
  cookieOpen?.addEventListener('click',event=>{if(event.isTrusted===true)void openCookieTarget();});
  function cookieTarget(url){
    const targets=localMode&&developmentProfile?[LOCAL_ORIGIN+'/session/']:COOKIE_TARGETS;
    return typeof url==='string'&&targets.includes(url);
  }
  function validateCookieDelivery(data){
    const now=estimatedServerNow();
    if(!exactKeys(data,['schemaVersion','deliveryId','targetUrl','expiresAt','cookies'])||data.schemaVersion!==1||
      !safeString(data.deliveryId,120)||!cookieTarget(data.targetUrl)||now===null||
      dateMs(data.expiresAt)===null||data.expiresAt<=now||data.expiresAt-now>PREVIEW_MAX_LIFETIME_MS||
      !Array.isArray(data.cookies)||data.cookies.length<1||data.cookies.length>50)
      fail('E_COOKIE_DELIVERY','Cookie 交付格式、目标范围或有效期无效');
    const target=new URL(data.targetUrl),seen=new Set();
    const cookies=data.cookies.map(row=>{
      if(!exactKeys(row,['name','value','domain','path','secure','httpOnly','sameSite','expirationDate'])||
        typeof row.name!=='string'||!row.name||row.name.length>256||/[;=\s\x00-\x1f\x7f]/.test(row.name)||
        typeof row.value!=='string'||/[\x00-\x1f\x7f;]/.test(row.value)||
        typeof row.path!=='string'||!row.path.startsWith('/')||row.path.length>512||/[\r\n;]/.test(row.path)||
        (row.domain!==undefined&&(typeof row.domain!=='string'||row.domain.replace(/^\./,'').toLowerCase()!==target.hostname))||
        ['secure','httpOnly'].some(key=>row[key]!==undefined&&typeof row[key]!=='boolean')||
        (row.sameSite!==undefined&&!['unspecified','lax','strict','no_restriction'].includes(row.sameSite))||
        (row.expirationDate!==undefined&&(!Number.isFinite(row.expirationDate)||row.expirationDate<=now/1000||row.expirationDate>4102444800))||
        (row.secure===true&&target.protocol!=='https:')||
        (row.sameSite==='no_restriction'&&row.secure!==true)||
        (row.name.startsWith('__Secure-')&&row.secure!==true)||
        (row.name.startsWith('__Host-')&&(row.secure!==true||row.domain!==undefined||row.path!=='/')))
        fail('E_COOKIE_DELIVERY','Cookie 字段、域、有效期或安全属性无效');
      const identity=row.name+'\n'+row.path;
      if(seen.has(identity))fail('E_COOKIE_DELIVERY','Cookie 交付包含重复目标');
      seen.add(identity);
      return {...row,...(row.domain!==undefined?{domain:row.domain.toLowerCase()}: {})};
    });
    const payload={url:data.targetUrl,cookies};
    // Same bounded IPC budget as the public SDK, without exposing raw values.
    if(encodeURIComponent(JSON.stringify(payload)).replace(/%[0-9A-F]{2}|./g,'x').length>12000||
      cookies.some(row=>encodeURIComponent(row.value).replace(/%[0-9A-F]{2}|./g,'x').length>4096))
      fail('E_COOKIE_DELIVERY','Cookie 交付超过公共接口上限');
    return {deliveryId:data.deliveryId,targetUrl:data.targetUrl,expiresAt:data.expiresAt,payload};
  }
  function renderCookies(){
    if(!cookieSection||!cookieStatus||!cookieInstall||!cookieResults)return;
    cookieSection.hidden=!cookiePending&&!cookieRecord&&!cookieFault&&!assignedShared();
    const record=cookieRecord;
    cookieInstall.hidden=!cookiePending;
    cookieInstall.disabled=!cookieReady||cookieBusy||busy||!cookiePending||Boolean(cookieFault)||
      (record?.deliveryId===cookiePending?.deliveryId&&record.state!=='failed');
    clear(cookieResults);
    for(const row of record?.results||[])addRow(cookieResults,'第 '+(row.index+1)+' 项',
      row.verified?'已写入并核验':row.saved?'已写入，尚未核验':
        COOKIE_RESULT_LABELS[row.code]||'未完成，请人工核对');
    const labels={success:'全部 Cookie 已写入并核验；请在目标页面验证会话。',
      partial:'部分 Cookie 已写入；其余未完成。不会自动回滚或重放，请在目标页面核对。',
      failed:'Cookie 未写入。请检查目标网站的 Chrome 权限与工具设置授权；修复后可主动重试有效交付。',
      unknown:'Cookie 操作结果未知或恢复记录未确认；已禁止重放，请在目标页面人工核对。'};
    cookieStatus.textContent=cookieFault||(cookieBusy?'正在核对授权与网站会话，请勿重复操作。':
      record&&(!cookiePending||record.deliveryId===cookiePending.deliveryId)?labels[record.state]:
        cookiePending?'已收到网站会话，目标网站：'+new URL(cookiePending.targetUrl).host+'。应用前请核对授权。':
        sharedBusy?'正在获取网站会话…':sharedNotice.startsWith('未取得有效')?
          '暂未取得有效网站会话，请检查授权后重试。':'尚未应用网站会话。');
    if(cookieOpen)cookieOpen.hidden=record?.state!=='success'||!cookieTarget(record.targetUrl);
  }
  async function readCookieRecord(){
    const result=await storeRequest('storage.get',{key:COOKIE_KEY,withEtag:true});
    const r=result?.value;
    if(!plain(result)||result.preview===true||typeof result.etag!=='string'||! /^[a-f0-9]{64}$/.test(result.etag)||
      (r!==null&&(!exactKeys(r,['schemaVersion','deliveryId','attemptId','accountId','serviceOrigin','targetUrl','state','count','results','seen','sharedAccountId','scope'])||
        r.schemaVersion!==1||!safeString(r.deliveryId,120)||!safeString(r.attemptId,120)||
        !safeString(r.accountId,120)||typeof r.serviceOrigin!=='string'||typeof r.targetUrl!=='string'||
        (r.sharedAccountId!==undefined&&(!safeString(r.sharedAccountId,120)||typeof r.scope!=='string'||r.scope.length>16000))||
        !['success','partial','failed','unknown'].includes(r.state)||!Number.isInteger(r.count)||r.count<1||r.count>50||
        !Array.isArray(r.seen)||r.seen.length>50||r.seen.some(row=>!exactKeys(row,['deliveryId','expiresAt'])||
          !safeString(row.deliveryId,120)||dateMs(row.expiresAt)===null)||
        !Array.isArray(r.results)||r.results.length>r.count||r.results.some((row,index)=>
          !exactKeys(row,['index','saved','verified','code'])||row.index!==index||typeof row.saved!=='boolean'||
          typeof row.verified!=='boolean'||(row.verified&&!row.saved)||(row.code!==undefined&&!COOKIE_CODES.has(row.code))))))
      fail('E_COOKIE_STORAGE','Cookie 恢复记录无法验证');
    return result;
  }
  async function saveCookieRecord(record,before){
    try{await storeRequest('storage.set',{key:COOKIE_KEY,value:record,ifMatch:before.etag});}
    catch{/* Acknowledgement loss is resolved only by exact readback, never by repeating a write. */}
    const after=await readCookieRecord();
    const comparable=r=>r===null?null:JSON.stringify([r.schemaVersion,r.deliveryId,r.attemptId,r.accountId,
      r.serviceOrigin,r.targetUrl,r.state,r.count,r.sharedAccountId,r.scope,r.results.map(row=>[row.index,row.saved,row.verified,row.code]),
      r.seen.map(row=>[row.deliveryId,row.expiresAt])]);
    if(comparable(after.value)!==comparable(record))fail('E_COOKIE_STORAGE','Cookie 恢复记录未持久确认');
    cookieRecord=record;return after;
  }
  async function loadCookieRecord(){
    try{cookieRecord=(await readCookieRecord()).value;cookieReady=true;}
    catch{cookieFault='Cookie 恢复记录无法核对，已禁止写入；请检查工具存储授权。';}
    renderCookies();
  }
  function receiveCookies(receipt){
    cookiePending=null;
    if(receipt.cookieDelivery===undefined){renderCookies();return;}
    try{
      cookiePending={...validateCookieDelivery(receipt.cookieDelivery),accountId:receipt.accountId,
        redemptionId:receipt.redemptionId,revision:serviceRevision};
      // Existing unknown/partial effects cannot be replaced by another delivered batch.
      if(cookieRecord&&['unknown','partial'].includes(cookieRecord.state))
        fail('E_COOKIE_UNKNOWN','上次 Cookie 写入仍需人工核对；本次交付不会重放或覆盖恢复记录。');
      if(cookieReady)cookieFault='';
    }catch{cookiePending=null;cookieFault='已拒绝 Cookie 交付：格式、站点范围或有效期无效，或上次写入仍待核对。兑换结果与代理状态保持独立。';}
    renderCookies();
  }
  function cookieOutcome(value,count){
    if(!exactKeys(value,['saved','verified','results','stopped'])||!Array.isArray(value.results)||
      value.results.length<1||value.results.length>count||
      (value.stopped!==undefined&&value.stopped!==true)||value.results.some((row,index)=>
        !exactKeys(row,['index','saved','verified','code'])||row.index!==index||typeof row.saved!=='boolean'||
        typeof row.verified!=='boolean'||(row.verified&&!row.saved)||(!row.saved&&row.code===undefined)||
        (row.code!==undefined&&(!COOKIE_CODES.has(row.code)||row.verified))||
        (!row.verified&&index!==value.results.length-1))||
      value.saved!==value.results.filter(row=>row.saved).length||value.verified!==value.results.filter(row=>row.verified).length||
      ((value.results.length<count||value.results.some(row=>!row.verified))&&value.stopped!==true))
      fail('E_COOKIE_RECEIPT','逐项 Cookie 回执不完整');
    const results=value.results.map(row=>({...row}));
    const state=results.some(row=>row.code==='E_OUTCOME_UNKNOWN'||row.saved&&!row.verified)?'unknown':
      value.verified===count?'success':value.saved>0?'partial':'failed';
    return {state,results};
  }
  cookieInstall?.addEventListener('click',event=>{
    if(event?.isTrusted!==true||cookieInstall.disabled||cookieBusy||busy||!cookiePending)return;
    const delivery=cookiePending;
    cookieBusy=true;renderRedeem();
    void (async()=>{
      let started=false,marker;
      try{
        const now=estimatedServerNow();
        if(delivery.revision!==serviceRevision||snapshot?.account.id!==delivery.accountId||
          now===null||delivery.expiresAt<=now||!cookieTarget(delivery.targetUrl))
          fail('E_COOKIE_DELIVERY','交付已失效或账号已变化');
        if(delivery.sharedAccountId){
          const latest=verifiedMember(await businessRequest('GET',endpoints.member));
          acceptMemberSnapshot(latest);
          if(delivery.assignmentGeneration!==sharedGeneration||sharedId!==delivery.sharedAccountId||
            sharedCatalog?.companyId!==delivery.companyId||sharedCatalog?.redemptionId!==delivery.redemptionId||
          snapshot.account.id!==delivery.accountId||
            cookieScope(assignedShared()?.cookieScope||[])!==delivery.scope)
            fail('E_COOKIE_DELIVERY','共享账号已变化或授权已撤销');
        }
        const before=await readCookieRecord(),old=before.value;
        if(old&&(['unknown','partial'].includes(old.state)||
          old.seen.some(row=>row.deliveryId===delivery.deliveryId)&&!(old.deliveryId===delivery.deliveryId&&old.state==='failed')))
          fail('E_COOKIE_REPLAY','此交付已执行或上次结果待核对，禁止重放');
        if(delivery.sharedAccountId&&old?.scope&&old.targetUrl===delivery.targetUrl&&old.scope!==delivery.scope)
          fail('E_COOKIE_SCOPE','会话范围已变化，禁止留下旧账号的未替换 Cookie');
        const seen=(old?.seen||[]).filter(row=>row.expiresAt>now&&row.deliveryId!==delivery.deliveryId);
        if(seen.length>=50)fail('E_COOKIE_LIMIT','仍有效的交付记录过多，请稍后再试');
        seen.push({deliveryId:delivery.deliveryId,expiresAt:delivery.expiresAt});
        const record={schemaVersion:1,deliveryId:delivery.deliveryId,attemptId:crypto.randomUUID(),
          accountId:delivery.accountId,serviceOrigin:new URL(endpoints.member).origin,targetUrl:delivery.targetUrl,
          ...(delivery.sharedAccountId?{sharedAccountId:delivery.sharedAccountId,scope:delivery.scope}:{}),
          state:'unknown',count:delivery.payload.cookies.length,results:[],seen};
        marker=await saveCookieRecord(record,before);
        if(delivery.revision!==serviceRevision||snapshot?.account.id!==delivery.accountId||
          (delivery.sharedAccountId&&(sharedId!==delivery.sharedAccountId||delivery.assignmentGeneration!==sharedGeneration))||
          estimatedServerNow()===null||delivery.expiresAt<=estimatedServerNow())
          fail('E_COOKIE_DELIVERY','交付状态已变化');
        started=true;
        const result=await window.OpenDeskSDK.browser.cookies.setMany(delivery.payload);
        const outcome=cookieOutcome(result,record.count);
        await saveCookieRecord({...record,...outcome},marker);
        if(outcome.state!=='failed')cookiePending=null;
        if(delivery.sharedAccountId){
          sharedNotice=outcome.state==='success'?'网站会话已写入；请在目标页面核对实际登录状态。':
            '网站会话未完整写入；请核对逐项结果，不会自动重试。';
          if(outcome.state==='success')await openCookieTarget();
        }
      }catch(error){
        cookieFaultRecoverable=!started&&error?.code==='E_COOKIE_DELIVERY';
        // Before invocation there can be no Cookie effect. The SDK also rejects
        // schema/budget/permission preflight before its per-item write loop.
        if(marker&&(!started||['E_SITE_GRANT_REQUIRED','E_CHROME_PERMISSION_REQUIRED','E_SCHEMA','E_LIMIT'].includes(error?.code))){
          try{await saveCookieRecord({...marker.value,state:'failed',results:[]},marker);}
          catch{cookieFault='Cookie 写入恢复记录无法确认，已禁止重放。';cookiePending=null;}
          if(!started){cookiePending=null;cookieFault='Cookie 写入未提交：交付已过期、账号或服务状态已变化。';}
        }else{
          cookiePending=null;
          cookieFault=started?'Cookie 写入结果未知，已禁止重放；请在目标页面人工核对。':
            'Cookie 写入未提交：交付过期、账号变化、重复操作或恢复存储无法核对。';
        }
      }finally{cookieBusy=false;renderRedeem();}
    })();
  });
  function validatedDevelopmentProfile(value){
    // Only getStatus supplies this field, after the platform's dev/package approval.
    // Storage or a member/lease response can never supply proxy availability.
    if(!plain(value)||!plain(value.endpoint)||value.endpoint.scheme!=='http'||
      value.endpoint.host!=='127.0.0.1'||value.endpoint.port!==7897||
      !Array.isArray(value.domains)||value.domains.length!==LOCAL_DOMAINS.length||
      new Set(value.domains).size!==LOCAL_DOMAINS.length||
      LOCAL_DOMAINS.some(domain=>!value.domains.includes(domain)))return null;
    return {endpoint:{scheme:'http',host:'127.0.0.1',port:7897},domains:[...LOCAL_DOMAINS]};
  }
  function recoveryMatchesService(record=recovery,development=localMode){
    return !record||(development?record.schemaVersion===2&&record.serviceOrigin===LOCAL_ORIGIN:
      record.schemaVersion===1);
  }
  function renderLocalDevelopment(){
    // The production React view has no development/fixture UI.
    // Old isolated VM harnesses may provide these optional nodes.
    renderFeatureStatus();
    if(!localSection||!localConnect||!localStatus)return;
    localSection.hidden=!developmentProfile;
    localConnect.disabled=!developmentProfile||localConnecting||busy||cookieBusy||
      (localMode&&(Boolean(recoveryFault)||Boolean(recovery&&recoveryMatchesService())||localSwitchBlocked()));
    localConnect.textContent=localConnecting?'正在连接…':localMode?'退出本地开发':'连接本地开发';
    localConnect.setAttribute('aria-pressed',String(localMode));
    localStatus.textContent=localNotice||(localMode?
      '本地开发 · 已选择 127.0.0.1:7898 演示服务。使用测试激活码后由服务端分配账号；不是付费会员。':
      '本地开发 · 尚未连接。主动连接后使用本机演示账号与兑换服务，不代表正式会员或代理已启用。');
  }
  function renderFeatureStatus(){
    // Configuration is not evidence of login, redemption, Cookie or proxy success.
    const set=(id,text)=>{const element=byId('ai-vip-'+id);if(element)element.textContent=text;};
    set('service-mode',localMode?'本地演示已选择。请按下方步骤兑换测试码；演示权益不代表正式会员。':
      productionEndpoints?'正式会员服务已配置；以账号查询和兑换回执为准。':
        '正式服务未配置。安装工具后即可查看接入状态，无需另外激活工具。');
    set('feature-member',localMode?'演示账号由本地测试服务提供；权益以会员卡的实际查询结果为准。':
      productionEndpoints?'从会员卡查询服务返回的账号与权益；登录、绑定由正式账号服务提供。':
        '正式账号服务未配置，暂不能登录、绑定或查询权益。');
    set('feature-redeem',endpoints?'账号核验后显示输入框；先预检再确认。兑换记录随权益刷新，结果未知时使用「核对上次兑换」。':
      '正式兑换服务未配置，输入框暂不显示；专属链接和旧设备激活也不能代替兑换服务。');
    set('feature-cookie',localMode?'仅演示测试站点。激活后从服务器取得公司共享账号；不能自选目标账号；确认写入后到测试站核对实际账号。':
      COOKIE_TARGETS.length?'仅接收已批准目标的有效交付，逐项确认写入后到目标页面核对。':
        '生产目标未配置；收到有效交付后才可核对目标并确认写入。');
    set('feature-shop',catalog?'从「查看更多商品」打开已配置目录；商品购买与兑换结果分别核验。':
      '商城地址未配置，商品按钮暂不显示。');
    set('feature-proxy',localMode?'演示兑换授予代理功能后才可启用；启用、停止与 Cookie 分开操作。':
      APPROVED_PROXY_ENDPOINT?'有效权益与浏览器授权核验后可请求启用；停止入口优先保留。':
        '生产代理未配置；代理连接与会员权益分别核验，已有控制意图仍可请求停用。');
    set('demo-availability',developmentProfile?'本地演示入口可用：使用下方「连接本地开发」。本机测试服务需保持运行。':
      '本地演示入口不可用：需匹配已审阅安装包的开发版扩展。正式版、旧开发版或包来源不匹配时不提供入口；仅重新导入 JSON 无法更新扩展。可用「重新检测代理状态」再次检测。');
  }
  async function readLocalPreference(){
    if(typeof storeRequest!=='function')fail('E_LOCAL_STORAGE','工具存储不可用');
    const result=await storeRequest('storage.get',{key:LOCAL_PREFERENCE_KEY,withEtag:true});
    if(!plain(result)||result.preview===true||typeof result.etag!=='string'||
      !/^[a-f0-9]{64}$/.test(result.etag))fail('E_LOCAL_STORAGE','无法核对本地开发选择');
    if(result.value!==null&&(!plain(result.value)||result.value.schemaVersion!==1||
      typeof result.value.enabled!=='boolean'||Object.keys(result.value).sort().join(',')!=='enabled,schemaVersion'))
      fail('E_LOCAL_STORAGE','本地开发选择格式无效');
    return result;
  }
  function changeBusinessMode(development){
    if(localMode===development)return;
    invalidateShared();sharedNotice='';acquireAfterActivation=false;
    localMode=development;
    endpoints=development?LOCAL_ENDPOINTS:productionEndpoints;
    ++serviceRevision;++seq;
    snapshot=null;serverSampleAt=null;pending=null;code.value='';busy=false;
    cookiePending=null;renderCookies();
    renderBusinessConfiguration();
    renderLocalDevelopment();
  }
  async function acceptDevelopmentStatus(state){
    const read=++developmentRead;
    developmentProfile=validatedDevelopmentProfile(state?.developmentProfile);
    if(!developmentProfile){
      changeBusinessMode(false);
      renderLocalDevelopment();return;
    }
    if(!localChoiceLoaded){
      try{
        const preference=await readLocalPreference();
        if(read!==developmentRead)return;
        localChoice=preference.value?.enabled===true;localChoiceLoaded=true;
        localNotice='';
      }catch{
        if(read!==developmentRead)return;
        localNotice='本地开发选择无法恢复；连接前将重新核对存储，不会自动激活。';
        renderLocalDevelopment();return;
      }
    }
    if(localChoice&&recoveryReady&&recoveryMatchesService(recovery,true))changeBusinessMode(true);
    renderLocalDevelopment();
  }
  localConnect?.addEventListener('click',event=>{
    if(event?.isTrusted!==true||localConnect.disabled||localConnecting||busy||cookieBusy)return;
    const selected=!localMode;
    localConnecting=true;localNotice='正在核对可信开发配置与本地选择…';renderLocalDevelopment();
    void (async()=>{
      try{
        // Re-read trusted availability before using even a persisted development choice.
        await refreshDevelopmentAvailability();
        if(!developmentProfile||!recoveryMatchesService(recovery,selected)||
          (!selected&&(recoveryFault||localSwitchBlocked())))
          fail('E_LOCAL_UNAVAILABLE','开发配置不可用或仍有待完成操作');
        const before=await readLocalPreference();
        try{
          await storeRequest('storage.set',{key:LOCAL_PREFERENCE_KEY,
            value:{schemaVersion:1,enabled:selected},ifMatch:before.etag});
        }catch{/* Verify a possibly committed preference; never assume success. */}
        const after=await readLocalPreference();
        if(after.value?.enabled!==selected||!developmentProfile)
          fail('E_LOCAL_STORAGE','本地选择未持久确认或开发配置已撤销');
        localChoice=selected;localChoiceLoaded=true;localNotice='';
        changeBusinessMode(selected);
      }catch{
        localNotice='未能连接或切换本地开发服务。请核对开发配置、工具存储及待核对兑换记录。';
      }finally{localConnecting=false;renderLocalDevelopment();}
    })();
  });
  function validRecovery(raw){
    if(raw===null)return null;
    const development=raw?.schemaVersion===2;
    const fields=['accountId','createdAt','idempotencyKey','packageVersion','schemaVersion','toolId',
      ...(development?['serviceOrigin']:[])];
    if(!plain(raw)||Object.keys(raw).sort().join(',')!==fields.sort().join(',')||
      (!development&&raw.schemaVersion!==1)||(development&&raw.serviceOrigin!==LOCAL_ORIGIN)||
      raw.toolId!=='ai-vip-share'||
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
    if(next===null?after.record!==null:!after.record||
      Object.keys(next).some(key=>after.record[key]!==next[key]))
      fail('E_RECOVERY_WRITE','兑换事务未被确认持久保存，禁止提交或重试');
    return after;
  }
  async function loadRecovery(){
    const retrying=!!recoveryFault;
    try{
      recovery=(await readRecovery()).record;
      recoveryFault=null;
      if(recovery)redeemNotice('发现上次未确认的兑换。请先核对服务端状态，不能重新提交。',true);
      else if(retrying)redeemNotice(endpoints?'恢复记录已核对，可重新预检兑换码。':'恢复记录已核对；兑换服务仍未配置，暂无法提交。');
    }catch{
      recoveryFault='无法核对本工具的持久兑换记录；已禁止兑换，请检查安装和存储授权。';
      redeemNotice(recoveryFault,true);
    }finally{
      recoveryReady=true;
      if(developmentProfile&&localChoice&&recoveryMatchesService(recovery,true))changeBusinessMode(true);
      renderRedeem();
    }
  }
  async function beginRecovery(accountId,key,redemptionIntent){
    const before=await readRecovery();
    if(before.record){
      recovery=before.record;
      fail('E_RECOVERY_PENDING','已有未核对交易，不允许提交第二笔兑换');
    }
    if(redemptionIntent.revision!==serviceRevision||redemptionIntent.development!==localMode||
      (redemptionIntent.development&&!developmentProfile))
      fail('E_RECOVERY_SERVICE_CHANGED','服务环境已变化，本次未写入兑换事务');
    // Once storage.set starts, retain this intent's service even if availability changes.
    const record={schemaVersion:redemptionIntent.development?2:1,
      ...(redemptionIntent.development?{serviceOrigin:LOCAL_ORIGIN}:{}),
      toolId:'ai-vip-share',packageVersion:PACKAGE_VERSION,
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
    else if(!recoveryMatchesService())
      recoveryStatus.textContent='上次兑换来自其他服务环境，请切回原服务核对；记录保留，不会重新提交。';
    else if(snapshot?.account.id!==recovery.accountId)
      recoveryStatus.textContent='当前账号与上次兑换的账号不一致。已阻止继承旧账号交易。';
    else recoveryStatus.textContent='有未完成的兑换回执。只能查询服务端终态，不会重新提交兑换。';
    recoveryCheck.hidden=!recovery&&!recoveryFault;
    recoveryCheck.textContent=recoveryFault?'重试读取恢复记录':'核对上次兑换';
    recoveryCheck.disabled=busy||cookieBusy||!recoveryReady||(!recoveryFault&&
      (!recovery||!endpoints||!recoveryMatchesService()||snapshot?.account.id!==recovery?.accountId));
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
      if(raw.featureId!==undefined){
        e.featureId=safeString(raw.featureId,80);
        if(!e.featureId)fail('E_ENTITLEMENT','功能权益标识无效');
      }
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
      sharedAccounts:account.state==='bound'?validateSharedCatalog(data.sharedAccounts):null,
      entitlements:data.entitlements.map(verifiedEntitlement),
      redemptions:data.redemptions.map(verifiedRecord)};
  }
  const statusLabel=value=>({active:'有效',expired:'已到期',
    exhausted:'已用尽',inactive:'未生效'})[value]||'待核验';
  function renderMember(){
    if(!snapshot)return;
    const {account,entitlements,redemptions,serverNow}=snapshot;
    const effective=entitlements.filter(e=>e.status==='active'&&
      (e.type!=='time'||e.expiresAt>serverNow)&&
      (!['quota','credit'].includes(e.type)||e.remaining>0));
    const primary=effective.find(e=>e.type==='time')||effective[0]||entitlements[0]||null;
    const view=account.state==='guest'?'guest':effective.length?'active':
      entitlements.length?'inactive':'empty';
    memberCard.setAttribute('data-view',view);
    const exhausted=entitlements.some(e=>e.status==='exhausted'||
      (['quota','credit'].includes(e.type)&&e.remaining===0));
    const expired=entitlements.some(e=>e.status==='expired'||
      (e.type==='time'&&e.expiresAt<=serverNow));
    memberState.textContent=account.state==='guest'?'未登录':
      effective.length?'权益有效':exhausted?'额度已用尽':expired?'已到期':
      entitlements.length?'权益未生效':'尚未开通';
    memberState.setAttribute('data-tone',effective.length?'active':
      entitlements.length?'warn':'neutral');
    accountName.textContent=account.state==='bound'?account.name:'尚未绑定会员账号';
    accountName.hidden=false;
    productName.textContent=primary?primary.title:
      account.state==='guest'?'请先使用正式产品账号登录或绑定。':'可使用兑换码激活会员权益。';
    productName.hidden=false;
    memberFacts.hidden=!primary||account.state!=='bound';
    memberFacts.setAttribute('data-kind',primary?.type||'none');
    meter.hidden=true;meterBar.style.width='0%';
    meter.removeAttribute('aria-valuenow');
    remaining.textContent='';unit.textContent='';expiry.textContent='';
    if(primary?.type==='time'){
      metricLabel.textContent='会员时间';
      const isFuture=primary.expiresAt>serverNow;
      const days=Math.ceil((primary.expiresAt-serverNow)/86400000);
      remaining.textContent=isFuture&&primary.status==='active'?String(days):
        !isFuture?'0':'已结束';
      unit.textContent=/^\d+$/.test(remaining.textContent)?'天':'';
      expiry.textContent='到期 '+dateLabel(primary.expiresAt);
    }else if(primary?.type==='quota'||primary?.type==='credit'){
      metricLabel.textContent='剩余使用额度';
      remaining.textContent=String(primary.remaining);
      unit.textContent=primary.unit;
      expiry.textContent='总额度 '+primary.total+' '+primary.unit;
      if(primary.total>0){
        const percent=Math.max(0,Math.min(100,Math.round(primary.remaining/primary.total*100)));
        meter.hidden=false;meterBar.style.width=percent+'%';
        meter.setAttribute('aria-valuenow',String(percent));
      }
    }else if(primary?.type==='feature'){
      metricLabel.textContent='功能权益';
      remaining.textContent=primary.status==='active'?'已启用':statusLabel(primary.status);
      expiry.textContent=primary.detail;
    }
    verified.hidden=!primary&&!redemptions.length;
    verified.textContent=verified.hidden?'':'服务端已核验 · '+dateLabel(serverNow);
    // One member card: no second "我的权益" panel. Do not lose genuine
    // supplementary quota/feature grants that are not the hero entitlement.
    // All strings are from the already validated server snapshot.
    const extras=entitlements.filter(e=>e!==primary);
    secondaryMetrics.textContent=extras.map(e=>{
      const status=e.status!=='active'?e.status:
        e.type==='time'&&e.expiresAt<=serverNow?'expired':
        ['quota','credit'].includes(e.type)&&e.remaining===0?'exhausted':e.status;
      if(e.type==='quota'||e.type==='credit')
        return e.title+'：'+e.remaining+' / '+e.total+' '+e.unit+'（'+statusLabel(status)+'）';
      if(e.type==='time')return e.title+'：'+dateLabel(e.expiresAt)+'（'+statusLabel(status)+'）';
      return e.title+'：'+statusLabel(status)+' · '+e.detail;
    }).join(' · ');
    secondaryMetrics.hidden=!extras.length||account.state!=='bound';
    historyDetails.hidden=!redemptions.length;
    historyCount.textContent=redemptions.length?String(redemptions.length)+' 条':'';
    clear(history);
    redemptions.forEach(item=>addRow(history,item.title,
      dateLabel(item.at)+' · '+(item.status==='redeemed'?'已兑换':'已撤销')+
      (item.masked?' · '+item.masked:'')));
    refresh.hidden=false;refresh.disabled=false;
    if(recovery&&account.id!==recovery.accountId)
      redeemNotice('当前账号与未确认兑换归属不同。请切回原账号核对，不会继承权益。',true);
    else if(!busy&&!recovery&&!recoveryFault){
      if(account.state==='guest')redeemNotice('登录并绑定账号后可使用兑换码。');
      else if(/服务未配置|服务接入后|核验中|会员无法核验|兑换已暂停/.test(redeemStatus.textContent))
        redeemNotice('输入兑换码并预检，确认后再领取。');
    }
    renderRedeem();
  }
  function renderRedeem(){
    const accountReady=Boolean(endpoints)&&snapshot?.account.state==='bound';
    const locked=Boolean(recovery||recoveryFault);
    const allowed=accountReady&&!busy&&!cookieBusy&&recoveryReady&&!locked&&
      !['unknown','partial'].includes(cookieRecord?.state);
    const showForm=accountReady&&!locked;
    redeemForm.hidden=!showForm;
    // The live redeem-status below the form owns the single instructional line.
    // Keep legacy nodes inert for test/recovery compatibility, with no spacing.
    redeemIntro.hidden=true;
    redeemFine.hidden=true;
    code.disabled=!allowed||Boolean(pending);
    redeem.disabled=!allowed||Boolean(pending)||
      !/^[A-Za-z0-9._-]{6,120}$/.test(code.value.trim());
    redeem.textContent=busy?'正在处理…':'预检激活';
    confirm.disabled=!allowed||!pending;
    previewPanel.hidden=!pending;
    cancel.hidden=!pending;
    cancel.disabled=busy;
    codeReveal.disabled=code.disabled;
    codeClear.disabled=code.disabled||!code.value;
    if(code.disabled||!code.value){
      code.type='password';
      codeReveal.setAttribute('aria-label','显示兑换码');
      codeReveal.setAttribute('aria-pressed','false');
    }
    showRecovery();
    redeemStatus.hidden=!recoveryPanel.hidden||!redeemError.hidden;
    refreshProxyPresentation();
    renderLocalDevelopment();
    renderCookies();
    renderShared();
    window.OpenDeskTool.setState?.({dirty:Boolean(code.value||pending||cookiePending),
      busy:busy||cookieBusy||sharedBusy});
  }
  function redeemNotice(message,error=false){
    redeemStatus.textContent=message;
    redeemError.hidden=!error;
    redeemError.textContent=error?message:'';
    redeemStatus.hidden=error||!recoveryPanel.hidden;
  }
  async function businessRequest(method,url,data){
    if(!endpoints||typeof businessSdk?.request!=='function')
      fail('E_PROVIDER','正式会员服务或 Browser SDK 网络授权未配置');
    const revision=serviceRevision,development=localMode;
    const expected=method==='GET'?[endpoints.member]:method==='POST'?
      [endpoints.voucherPreview,endpoints.voucherRedeem,endpoints.voucherStatus]:[];
    if(!expected.includes(url)||(development&&(!developmentProfile||!Object.values(LOCAL_ENDPOINTS).includes(url))))
      fail('E_PROVIDER_URL','请求不属于当前明确选择的会员服务');
    const result=await businessSdk.request({method,url,
      ...(data===undefined?{}:{data}),config:{timeout:10000,responseType:'json',
        ...(development?{headers:{'X-OpenDesk-Local-Test':'1'}}:{})}});
    if(revision!==serviceRevision)fail('E_PROVIDER_CHANGED','服务环境已变化，忽略旧回执');
    if(!plain(result)||!Number.isInteger(result.status)||result.status<200||
      result.status>=300||!plain(result.data))
      fail('E_PROVIDER_RESPONSE','会员服务拒绝请求或响应无效');
    return result.data;
  }
  function acceptMemberSnapshot(data){
    const selected=assignedShared();
    const next=data.sharedAccounts;
    const replacement=next?.accounts.find(row=>row.id===sharedId);
    if(snapshot?.account.id!==data.account.id||sharedCatalog?.companyId!==next?.companyId||sharedCatalog?.redemptionId!==next?.redemptionId||
      (selected&&(!replacement||replacement.targetUrl!==selected.targetUrl||cookieScope(replacement.cookieScope)!==cookieScope(selected.cookieScope)))){
      invalidateShared();sharedNotice='账号或授权目录已变化，请重新取得会话。';
    }
    sharedCatalog=next;
    sharedId=next?.assignedAccountId||'';
    // A slow member response cannot move the sampled server clock backwards
    // and thereby extend a previously received Cookie delivery.
    const floor=snapshot&&serverSampleAt!==null?
      snapshot.serverNow+Math.max(0,performance.now()-serverSampleAt):data.serverNow;
    snapshot={...data,serverNow:Math.max(data.serverNow,floor)};
    if(cookiePending?.accountId!==data.account.id)cookiePending=null;
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
    memberCard.setAttribute('data-view','loading');
    memberState.textContent='核验中';
    accountName.textContent='正在读取会员信息';
    accountName.hidden=false;
    productName.textContent='';productName.hidden=true;
    memberFacts.hidden=true;verified.hidden=true;
    secondaryMetrics.hidden=true;historyDetails.hidden=true;
    renderRedeem();
    try{
      const data=verifiedMember(await businessRequest('GET',endpoints.member));
      if(current!==seq)return;
      acceptMemberSnapshot(data);
    }catch(error){
      if(current!==seq)return;
      snapshot=null;serverSampleAt=null;
      invalidateShared();cookiePending=null;
      pending=null;code.value='';
      memberCard.setAttribute('data-view','failed');
      memberState.textContent='无法核验';
      memberState.setAttribute('data-tone','warn');
      accountName.textContent='会员服务暂时不可用';
      productName.textContent='请检查网络或权限，然后刷新重试。';
      productName.hidden=false;
      memberFacts.hidden=true;verified.hidden=true;
      secondaryMetrics.hidden=true;historyDetails.hidden=true;
      remaining.textContent='';unit.textContent='';expiry.textContent='';
      meter.hidden=true;meterBar.style.width='0%';
      meter.removeAttribute('aria-valuenow');
      secondaryMetrics.textContent='';clear(history);historyCount.textContent='';
      if(recovery)redeemNotice('会员身份暂无法核验，上次兑换仍待核对；不可再次提交。',true);
      else if(redeemStatus.textContent.includes('服务端已确认兑换成功'))
        redeemNotice('服务端已确认兑换成功，但权益刷新失败；请稍后刷新查看最新数据。');
      else redeemNotice('会员无法核验，兑换已暂停。',true);
    }finally{
      if(current===seq){
        busy=false;refresh.disabled=false;if(snapshot)renderMember();else renderRedeem();
        if(acquireAfterActivation&&snapshot){acquireAfterActivation=false;void requestSharedSession();}
      }
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
    if(event?.isTrusted!==true)return;
    return runActivation(code.value.trim());
  }
  // Both entry points use this private flow. URL input never fabricates a trusted event.
  async function runActivation(value,automatic=false,urlCode=value){
    if(busy||cookieBusy||!endpoints||!recoveryReady||
      recovery||recoveryFault||['unknown','partial'].includes(cookieRecord?.state)||snapshot?.account.state!=='bound')return;
    if(!pending){
      if(!/^[A-Za-z0-9._-]{6,120}$/.test(value))return;
      const accountId=snapshot.account.id;
      sharedGeneration++;sharedBusy=false;cookiePending=null;sharedNotice='';
      busy=true;renderRedeem();redeemNotice('正在请求服务端核验兑换内容…');
      try{
        const result=validatePreview(await businessRequest('POST',endpoints.voucherPreview,{code:value}));
        if(snapshot?.account.id!==accountId)fail('E_IDENTITY_CHANGED','预检过程中账号已变化');
        pending=result;code.value='';
        previewTitle.textContent=result.title;
        previewDescription.textContent=result.summary+' · '+result.masked+'；确认后才会兑换。';
        previewAccount.textContent='接收账号：'+snapshot.account.name;
        redeemNotice('请核对商品与账号，再点击「确认激活」。');
      }catch{
        redeemNotice('无法核验兑换码，请检查账号、兑换码或网络后重试。',true);
      }finally{
        busy=false;renderRedeem();
        // The input becomes disabled after preflight; move focus to the review.
        if(pending&&!automatic)confirm.focus?.({preventScroll:true});
      }
      if(automatic&&pending){
        try{
          if(activationCodeFromPage(await storeRequest('currentPage.info'))!==value){
            pending=null;redeemNotice('激活网页已变化，未提交激活；已保留防重放记录。',true);renderRedeem();return;
          }
          await runActivation('',true,value);
        }catch{pending=null;redeemNotice('无法重新核验激活网页，未提交激活。',true);renderRedeem();}
      }
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
    const redemptionIntent=Object.freeze({revision:serviceRevision,development:localMode});
    const intentRevision=redemptionIntent.revision;
    busy=true;renderRedeem();
    redeemNotice('正在重新核对当前账号与预检时限；尚未提交兑换。');
    try{
      // Validate current identity before creating a write-ahead journal.
      // The Provider must also bind the actual POST to its authenticated session.
      const latest=verifiedMember(await businessRequest('GET',endpoints.member));
      acceptMemberSnapshot(latest);
      const currentServerNow=estimatedServerNow();
      if(automatic&&activationCodeFromPage(await storeRequest('currentPage.info'))!==urlCode)
        fail('E_ACTIVATION_PAGE_CHANGED','激活网页已变化');
      if(intentRevision!==serviceRevision||latest.account.state!=='bound'||latest.account.id!==accountId||
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
      await beginRecovery(accountId,key,redemptionIntent); // Write-ahead and verified readback.
      if(automatic&&activationCodeFromPage(await storeRequest('currentPage.info'))!==urlCode)
        fail('E_ACTIVATION_PAGE_CHANGED','激活网页已变化；保留事务供核对，不会提交');
      const submitNow=estimatedServerNow();
      if(intentRevision!==serviceRevision||snapshot?.account.id!==accountId||pending?.id!==previewId||
        submitNow===null||pending.expiresAt<=submitNow)
        fail('E_PRE_SUBMIT','事务持久化后账号或预检时限变化；禁止提交');
      const result=await businessRequest('POST',endpoints.voucherRedeem,{
        previewId,accountId,idempotencyKey:key});
      validateReceipt(result,key);
      pending=null;code.value='';
      // Valid receipt is authoritative; failed journal clearing keeps a lock.
      await clearRecovered(key);
      cookiePending=null;cookieFault='';
      acquireAfterActivation=true;
      redeemNotice('服务端已确认兑换成功。正在更新权益与兑换记录；网络连接需要单独开启。');
      busy=false;renderRedeem();
      await refreshMember();
    }catch(error){
      pending=null;code.value='';
      if(error?.code==='E_RECOVERY_SERVICE_CHANGED'&&!recovery){
        redeemNotice('服务环境已变化，本次未提交兑换、未写入事务；请恢复服务后重新预检。',true);
      }else{
        if(!recovery)recoveryFault='无法证明兑换事务的持久状态，已禁止再次提交。';
        redeemNotice(recovery?'兑换结果未确认。请使用「核对上次兑换」查询服务端状态，切勿重复兑换。':
          '无法确认本地兑换状态，已禁止提交。请检查存储授权。',true);
      }
    }finally{busy=false;renderRedeem();}
  }
  async function checkRecoveryClick(event){
    if(event?.isTrusted!==true||busy||cookieBusy||!recoveryReady)return;
    if(recoveryFault){
      busy=true;renderRedeem();
      try{await loadRecovery();}
      finally{busy=false;renderRedeem();}
      return;
    }
    if(!endpoints||!recoveryMatchesService()||
      recoveryFault||!recovery||snapshot?.account.id!==recovery.accountId)return;
    busy=true;renderRedeem();
    redeemNotice('正在查询上次兑换的服务端最终状态（不会再次消费兑换码）…');
    try{
      const saved=(await readRecovery()).record;
      if(!saved||!recoveryMatchesService(saved)||saved.idempotencyKey!==recovery.idempotencyKey||
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
        cookiePending=null;cookieFault='';
        acquireAfterActivation=true;
        redeemNotice('服务端已确认上次兑换成功，已解除重复提交保护；请刷新权益。');
        busy=false;
        await refreshMember();
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
  // Manifest sandbox deliberately omits allow-forms. Use trusted input events
  // for the same intent handler; never rely on a native form submission.
  redeem.addEventListener('click',event=>{
    event.preventDefault?.();
    void redeemClick(event);
  });
  code.addEventListener('keydown',event=>{
    if(event.key!=='Enter'||event.isComposing)return;
    event.preventDefault?.();
    void redeemClick(event);
  });
  redeemForm.addEventListener('submit',event=>{
    event.preventDefault();
    void redeemClick(event);
  });
  confirm.addEventListener('click',event=>{void redeemClick(event);});
  recoveryCheck.addEventListener('click',event=>{void checkRecoveryClick(event);});
  function cancelPendingPreview(){
    if(busy||!pending)return;
    pending=null;code.value='';
    redeemNotice('已取消本次预检，未提交任何兑换。');
    renderRedeem();
    code.focus?.({preventScroll:true});
  }
  previewPanel.addEventListener('keydown',event=>{
    if(event?.isTrusted!==true||event.key!=='Escape'||busy||!pending)return;
    event.preventDefault?.();
    event.stopPropagation?.();
    cancelPendingPreview();
  });
  cancel.addEventListener('click',event=>{
    if(event?.isTrusted!==true)return;
    cancelPendingPreview();
  });
  // Production activation origin/path/parameter are intentionally unconfigured.
  // Local fixture protocol only; metadata comes from the installed public Host.
  const ACTIVATION_URLS=Object.freeze([]);
  const ACTIVATION_KEY='aiVipActivationR140';
  let urlChecking=false;
  function activationCodeFromPage(info){
    if(!plain(info)||info.status!=='available'||typeof info.url!=='string'||info.url.length>2048)return null;
    try{
      const url=new URL(info.url);
      const rules=localMode&&developmentProfile?[{origin:LOCAL_ORIGIN,path:'/activate',parameter:'activation_code'}]:ACTIVATION_URLS;
      const rule=rules.find(row=>url.origin===row.origin&&url.pathname===row.path);
      if(!rule||url.username||url.password||url.hash)return null;
      const entries=[...url.searchParams.entries()];
      if(entries.length!==1||entries[0][0]!==rule.parameter||
        !/^[A-Za-z0-9._-]{6,120}$/.test(entries[0][1]))return null;
      return entries[0][1];
    }catch{return null;}
  }
  async function claimActivation(value,revision){
    // Salted deduplication markers, never the URL, code, or Cookie. A claim is
    // written and read back BEFORE any activation POST. Unknown claims stay locked.
    const before=await storeRequest('storage.get',{key:ACTIVATION_KEY,withEtag:true});
    const data=before.value===null?{schemaVersion:1,salt:crypto.randomUUID(),seen:[]}:before.value;
    if(!exactKeys(data,['schemaVersion','salt','seen'])||data.schemaVersion!==1||
      !safeString(data.salt,120)||!Array.isArray(data.seen)||data.seen.length>64||
      data.seen.some(row=>typeof row!=='string'||!/^[a-f0-9]{64}$/.test(row)))
      fail('E_ACTIVATION_RECORD','自动激活恢复记录无法核验；不会提交。');
    const bytes=new TextEncoder().encode(data.salt+'\n'+value);
    const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(data.seen.includes(fingerprint))return false;
    if(data.seen.length>=64)fail('E_ACTIVATION_LIMIT','自动激活记录已满；不会自动清除或重放。');
    const next={...data,seen:[...data.seen,fingerprint]};
    if(revision!==serviceRevision)return false;
    await storeRequest('storage.set',{key:ACTIVATION_KEY,value:next,ifMatch:before.etag});
    const after=await storeRequest('storage.get',{key:ACTIVATION_KEY,withEtag:true});
    if(!exactKeys(after.value,['schemaVersion','salt','seen'])||after.value.schemaVersion!==next.schemaVersion||
      after.value.salt!==next.salt||JSON.stringify(after.value.seen)!==JSON.stringify(next.seen))
      fail('E_ACTIVATION_RECORD','自动激活事务未持久确认；不会提交。');
    return revision===serviceRevision;
  }
  async function checkActivationPage(){
    if(urlChecking||busy||cookieBusy||sharedBusy||pending||cookiePending||!endpoints||
      !recoveryReady||recovery||recoveryFault||!cookieReady||cookieFault||
      ['unknown','partial'].includes(cookieRecord?.state)||snapshot?.account.state!=='bound')return;
    urlChecking=true;
    const revision=serviceRevision;
    try{
      const info=await storeRequest('currentPage.info');
      if(revision!==serviceRevision)return;
      const value=activationCodeFromPage(info);
      if(!value||!await claimActivation(value,revision))return;
      // Metadata can change while the recovery claim is being saved.
      const latest=await storeRequest('currentPage.info');
      if(revision!==serviceRevision||activationCodeFromPage(latest)!==value||busy||cookieBusy||pending)return;
      redeemNotice('已识别允许网站的激活参数，正在请求服务器分配账号…');
      await runActivation(value,true);
    }catch{
      redeemNotice('自动激活尚未完成；请核对网络、当前网页读取权限和恢复记录。未确认的操作不会自动重试。',true);
    }finally{urlChecking=false;}
  }
  const shopSdk=window.OpenDeskSDK?.browser?.tabs;
  shop.disabled=!catalog;
  shopSection.hidden=!catalog;
  shopStatus.hidden=true;
  shop.addEventListener('click',event=>{
    if(event?.isTrusted!==true||!catalog||shop.disabled)return;
    shop.disabled=true;shopStatus.hidden=false;shopStatus.textContent='正在请求打开商品目录…';
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
    'chatgpt.com','openai.com','claude.ai','anthropic.com','gemini.google.com',
    'generativelanguage.googleapis.com','perplexity.ai'
  ]);
  const APPROVED_PROXY_ENDPOINT=null; // Release-owned; never use localhost for production.
  function setupManagedProxy(){
    const status=byId('ai-vip-proxy-state'),detail=byId('ai-vip-proxy-detail');
    const refreshProxy=byId('ai-vip-proxy-refresh'),toggle=byId('ai-vip-proxy-toggle');
    const alert=byId('ai-vip-proxy-alert'),alertText=byId('ai-vip-proxy-alert-text');
    if(!status||!detail||!refreshProxy||!toggle||!alert||!alertText)return;
    const sdk=window.OpenDeskSDK?.browser?.proxy?.managed;
    let current=null,starting=false,stopping=false,reading=false;
    let stopRequired=false,stopConfirmed=false,operation=0,readSequence=0,notice='';
    const approvedEndpoint=APPROVED_PROXY_ENDPOINT&&
      ['https','socks5'].includes(APPROVED_PROXY_ENDPOINT.scheme)&&
      typeof APPROVED_PROXY_ENDPOINT.host==='string'&&
      Number.isSafeInteger(APPROVED_PROXY_ENDPOINT.port)?APPROVED_PROXY_ENDPOINT:null;
    const safeEndpoint=()=>localMode&&developmentProfile?developmentProfile.endpoint:approvedEndpoint;
    const hasEntitlement=()=>Boolean(endpoints&&snapshot&&estimatedServerNow()!==null&&
      snapshot.account?.state==='bound'&&(localMode?
        snapshot.redemptions.some(row=>row.status==='redeemed')&&snapshot.entitlements.some(row=>
          row.type==='feature'&&row.featureId==='local-managed-proxy'&&row.status==='active'):
        snapshot.entitlements?.some(row=>row.status==='active'&&
          (row.type!=='time'||row.expiresAt>estimatedServerNow())&&
          (!['quota','credit'].includes(row.type)||row.remaining>0))));
    const validState=state=>state&&['enabled','disabled','conflict','unavailable'].includes(state.state)&&
      typeof state.canStop==='boolean'&&typeof state.permission==='boolean'&&
      ['not_controllable','controlled_by_other_extensions','controllable_by_this_extension',
        'controlled_by_this_extension','unknown'].includes(state.control);
    const released=state=>validState(state)&&state.state==='disabled'&&
      state.canStop===false&&state.permission===true&&state.control==='controllable_by_this_extension';
    const canStop=()=>stopRequired||starting||current?.canStop===true;
    localSwitchBlocked=()=>canStop()||stopping;
    const paint=()=>{
      const stop=canStop();
      const ready=!stop&&!starting&&!stopping&&!reading&&
        typeof sdk?.requestEnable==='function'&&safeEndpoint()&&hasEntitlement()&&released(current);
      const controlIssue=stopRequired||['conflict','unavailable'].includes(current?.state)||
        Boolean(notice&&stop);
      status.textContent=stopping?'正在停用':starting?'启用待确认':
        stopRequired?'停用待确认':!sdk?'不可用':
        notice&&!current?'状态异常':!current?'检测中':
        current.state==='disabled'?(stopConfirmed&&released(current)?'已停止':'未启用'):
        ({enabled:'已启用',conflict:'控制权冲突',unavailable:'状态异常'})[current.state];
      toggle.setAttribute('data-action',stop?'stop':'start');
      toggle.classList.toggle('od-button--secondary',stop);
      toggle.textContent=stop?(stopping?'正在停用…':'停用代理'):'启用代理';
      toggle.hidden=!stop&&!ready;
      toggle.disabled=stop?(stopping||!sdk||typeof sdk.requestDisable!=='function'):
        (starting||stopping||reading||!ready);
      refreshProxy.hidden=!sdk&&!stop;
      refreshProxy.disabled=reading||starting||stopping||!sdk;
      proxySection.setAttribute('data-mode',stop||controlIssue?'critical':ready?'ready':'passive');
      status.hidden=!stop&&!controlIssue&&(!safeEndpoint()||!sdk||!hasEntitlement());
      const warning=controlIssue||Boolean(notice&&!current);
      alert.hidden=!warning;
      alertText.textContent=warning?(notice||(current?.state==='conflict'?
        '代理由其他扩展或系统策略管理，不能覆盖。':
        '代理状态未确认，请检查后按需请求停用。')):'';
      detail.hidden=warning;
      if(notice)detail.textContent=notice;
      else if(!sdk)detail.textContent='当前扩展没有可用的代理管理能力。';
      else if(stop)detail.textContent='本工具仍有代理控制意图，可随时请求停用。';
      else if(current?.state==='conflict')detail.textContent='代理控制权冲突，不会覆盖其他扩展。';
      else if(!safeEndpoint())detail.textContent='代理服务尚未接入，暂不能启用。';
      else if(!hasEntitlement())detail.textContent=localMode?
        '请先完成会员激活，取得网站访问权益。':'需要经过服务端核验的有效会员权益。';
      else if(!current)detail.textContent='正在检测浏览器代理状态。';
      else detail.textContent='启用后可访问已批准的 AI 网站。';
      renderLocalDevelopment();
    };
    refreshProxyPresentation=paint;
    async function update(){
      if(!sdk||starting||stopping)return;
      const token=operation,read=++readSequence;
      reading=true;paint();
      try{
        const state=await sdk.getStatus();
        if(token!==operation||read!==readSequence)return;
        if(!validState(state))throw Error('代理状态回执无效');
        current=state;
        await acceptDevelopmentStatus(state);
        if(token!==operation||read!==readSequence)return;
        if(stopConfirmed&&released(state))stopRequired=false;
        notice=stopRequired?'停用仍待确认；请明确请求 STOP，不能凭刷新推断已释放。':'';
      }catch(error){
        if(token!==operation||read!==readSequence)return;
        // Forget the stale displayed state, retain the owned STOP affordance.
        stopRequired=canStop();current=null;
        await acceptDevelopmentStatus(null);
        notice='代理状态无法确认（'+String(error?.code||'E_PROXY_STATUS').slice(0,50)+'）；未确认释放。';
      }finally{if(read===readSequence){reading=false;paint();}}
    }
    refreshProxy.addEventListener('click',event=>{
      if(event?.isTrusted===true)void update();
    });
    refreshDevelopmentAvailability=update;
    async function start(){
      if(starting||stopping||reading||canStop()||!safeEndpoint()||!hasEntitlement()||
        !released(current)||typeof sdk?.requestEnable!=='function')return;
      const token=++operation;++readSequence;reading=false;
      starting=true;stopRequired=true;stopConfirmed=false;notice='启用请求在途，仍可主动请求 STOP。';paint();
      try{
        const state=await sdk.requestEnable({config:{endpoint:{...safeEndpoint()},
          domains:[...(localMode?developmentProfile.domains:AI_PROXY_DOMAINS)]}});
        if(token!==operation)return;
        if(!validState(state))throw Error('启用回执无效');
        current=state;
        // An acknowledged owned enable is stoppable; it is not a release.
        stopRequired=state.canStop!==true;
        notice=state.state==='enabled'&&state.canStop?'':
          '启用未确认；请明确 STOP，勿盲目重试。';
      }catch(error){
        if(token===operation)notice='启用未确认（'+String(error?.code||'E_PROXY').slice(0,50)+'）；请明确 STOP，勿盲目重试。';
      }finally{
        starting=false;
        if(token!==operation){
          // STOP owns the newer intent. Never paint or trust a late START ack.
          if(!stopping)void update();
        }else paint();
      }
    }
    async function stop(){
      if(stopping||!canStop()||typeof sdk?.requestDisable!=='function')return;
      const token=++operation;++readSequence;reading=false;
      stopping=true;stopRequired=true;stopConfirmed=false;notice='正在请求 STOP；尚未确认释放。';paint();
      try{
        const state=await sdk.requestDisable();
        if(token!==operation)return;
        if(!validState(state))throw Error('停用回执无效');
        current=state;stopConfirmed=released(state);
        stopRequired=!stopConfirmed||starting;
        notice=stopRequired?'STOP 释放仍未确认；保留停用入口，等待在途请求结束后核对。':'Chrome 已确认当前安装的代理已释放。';
      }catch(error){
        if(token===operation)notice='STOP 仍待确认（'+String(error?.code||'E_PROXY_STOP').slice(0,50)+'）；不会覆盖其他代理配置。';
      }finally{if(token===operation){stopping=false;paint();}}
    }
    toggle.addEventListener('click',event=>{
      if(event?.isTrusted!==true)return;
      if(canStop())void stop();else void start();
    });
    paint();
    void update();
  }
  function renderBusinessConfiguration(){
    if(!endpoints){
    memberCard.setAttribute('data-view','unconfigured');
    memberState.textContent='服务未配置';
    memberState.setAttribute('data-tone','neutral');
    accountName.textContent='暂无法查询账号与会员权益';
    accountName.hidden=false;
    productName.textContent='';productName.hidden=true;
    memberFacts.hidden=true;verified.hidden=true;
    secondaryMetrics.hidden=true;historyDetails.hidden=true;
    redeemNotice('会员服务接入后可使用兑换码。');
    refresh.hidden=true;refresh.disabled=true;
    }else{
    refresh.hidden=false;
    refresh.disabled=false;
    void refreshMember();
    }
    renderRedeem();
  }
  // Recover independently of Provider configuration; never silently drop a journal.
  void loadRecovery();
  void loadCookieRecord();
  renderBusinessConfiguration();
  setupManagedProxy();
  // Only the open installed app observes its current target; no background sandbox.
  const activationTimer=typeof window.setInterval==='function'?
    window.setInterval(()=>{void checkActivationPage();},1200):null;
  renderRedeem();
  release=()=>{
    if(activationTimer!==null)window.clearInterval?.(activationTimer);
    ++serviceRevision;++sharedGeneration;++seq;
  };
  return release;
  }
  // Legacy Node VM fixtures mount synchronously; React mounts only after the
  // real sandbox tree commits. Both paths invoke the same verified controller.
  window.__OpenDeskVipStart=mountController;
  if(window.OpenDeskTool?.root?.querySelector?.('#ai-vip-member-card'))mountController();
})();
