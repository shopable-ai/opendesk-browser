import * as Journal from './cookie-journal.js';
import {LOCAL_CHATGPT} from './local-cookie-file.js';
import {createWebsiteController,ORDINARY_SITES} from './site-session.js';
import {DEVELOPMENT_ACTIVATION_URLS,activationCodeFromVerifiedPage,AUTO_PREPARATION_PAUSE_KEY,
  readAutoPreparationPauses,isAutoPreparationPaused,addAutoPreparationPause} from './activation-links.js';
import {REVIEWED_SERVICE,validateServiceDefinition,parseServiceLink} from './service-links.js';
import {prepareServerCookieBatches,serverCookieScope,validateServerCookieScope} from './server-cookie-batches.js';
// AI VIP Share business presentation stays inside the installed opaque sandbox.
// This tool never treats an aiAccess proxy lease as a paid member entitlement.
(function(){
  'use strict';
  let started=false,release=()=>{};
  function mountController({createDevelopmentControls,serviceDefinition=REVIEWED_SERVICE}={}){
  if(started)return release;
  const root=window.OpenDeskTool?.root;
  if(!root||!root.querySelector?.('#ai-vip-member-card'))return null;
  started=true;
  let developmentControls=typeof createDevelopmentControls==='function'?createDevelopmentControls():null;
  const byId=id=>root.querySelector('#'+id);
  const memberCard=byId('ai-vip-member-card');
  const memberFacts=byId('ai-vip-member-facts');
  const memberEmpty=byId('ai-vip-member-empty'),memberEmptyText=byId('ai-vip-member-empty-text');
  const focusRedeem=byId('ai-vip-focus-redeem');
  const activationHint=byId('ai-vip-activation-hint'),activationDetail=byId('ai-vip-activation-detail');
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
  const codeClear=byId('ai-vip-code-clear');
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
  const desktopOpen=byId('ai-vip-desktop-open'),desktopStatus=byId('ai-vip-desktop-status');
  const desktopSection=byId('ai-vip-desktop-promo');
  let localSection=byId('ai-vip-local-development');
  let localConnect=byId('ai-vip-local-connect'),localStatus=byId('ai-vip-local-status');
  let testSites=byId('ai-vip-test-sites');
  const enableWebsiteTests=event=>{
    if(event.isTrusted===true&&developmentProfile){websiteController?.enableTests();}
  };
  testSites?.addEventListener('click',enableWebsiteTests);
  let disposed=false;
  const cookieSection=byId('ai-vip-cookie-section'),cookieStatus=byId('ai-vip-cookie-status');
  const cookieInstall=byId('ai-vip-cookie-install'),cookieResults=byId('ai-vip-cookie-results');
  const sharedSection=byId('ai-vip-shared-section'),sharedAssigned=byId('ai-vip-shared-account');
  const sharedStatus=byId('ai-vip-shared-status'),sharedReceive=byId('ai-vip-shared-receive');
  const cookieOpen=byId('ai-vip-cookie-open');
  if([memberState,accountName,productName,remaining,unit,expiry,verified,
    secondaryMetrics,history,historyCount,refresh,code,redeem,redeemStatus,redeemError,
    previewPanel,previewTitle,previewDescription,previewAccount,cancel,
    recoveryPanel,recoveryStatus,recoveryCheck,shop,shopStatus,
    metricLabel,meter,meterBar,redeemForm,codeClear,confirm,
    memberCard,memberFacts,memberEmpty,memberEmptyText,focusRedeem,activationHint,activationDetail,
    historyDetails,redeemIntro,redeemFine,
    shopSection,proxySection,desktopSection,desktopOpen,desktopStatus]
      .some(element=>!element))return;

  // One release-reviewed service; user URLs select it, never define authority.
  const service=serviceDefinition?validateServiceDefinition(serviceDefinition):null;
  const connection=byId('ai-vip-connection'),connectionForm=byId('ai-vip-connection-form');
  const serviceLink=byId('ai-vip-service-link'),connect=byId('ai-vip-connect');
  const connectionStatus=byId('ai-vip-connection-status'),connectionSummary=byId('ai-vip-connection-summary');
  const connectionChange=byId('ai-vip-connection-change'),usageCard=byId('ai-vip-usage-card');
  const SERVICE_KEY='aiVipServiceConnectionR1';
  let serviceConnected=false,connecting=false,editingConnection=true,connectionNotice='',activationFromLink=false;
  const plain=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
  const safeString=(value,max=100)=>typeof value==='string'&&value.trim()&&
    value.length<=max?value.trim():null;
  const dateMs=value=>Number.isSafeInteger(value)&&value>=946684800000&&
    value<=4102444800000?value:null;
  const dateLabel=value=>new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'short',
    day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  const productionEndpoints=service?.endpoints??null;
  let endpoints=null;
  const LEGACY_LOCAL_ORIGIN='http://127.0.0.1:7898',DEFAULT_LOCAL_ORIGIN='http://127.0.0.1:7903';
  const LOCAL_ORIGINS=[LEGACY_LOCAL_ORIGIN,DEFAULT_LOCAL_ORIGIN];
  let localOrigin=LEGACY_LOCAL_ORIGIN;
  const localEndpoints=origin=>({member:origin+'/api/member',
    voucherPreview:origin+'/api/preview',voucherRedeem:origin+'/api/redeem',
    voucherStatus:origin+'/api/status'});
  const LOCAL_DOMAINS=Object.freeze(['chatgpt.com','openai.com','claude.ai','anthropic.com',
    'gemini.google.com','generativelanguage.googleapis.com','perplexity.ai']);
  const LOCAL_PREFERENCE_KEY='aiVipLocalDevelopmentR136';
  const catalog=service?.catalogUrl||null;
  const desktopClient=service?.desktopClientUrl||null;
  const businessSdk=window.OpenDeskSDK?.browser?.network;
  // Existing installed-tool storage is bound by Host to package and install epoch.
  // Never store a voucher, password, auth cookie, proxy lease or access token.
  const RECOVERY_KEY='aiVipRedeemR52',PACKAGE_VERSION='1.4.33';
  // Do not strand an unresolved 1.2.0 voucher journal after a tool upgrade.
  const RECOVERY_COMPAT_VERSIONS=Object.freeze(['1.2.0','1.3.0','1.3.1','1.3.2','1.3.3','1.3.4','1.3.5','1.3.6','1.3.7','1.3.8','1.3.9','1.4.0','1.4.1','1.4.2','1.4.3','1.4.4','1.4.5','1.4.6','1.4.7','1.4.8','1.4.9','1.4.10','1.4.11','1.4.12','1.4.13','1.4.14','1.4.15','1.4.16','1.4.17','1.4.18','1.4.19','1.4.20','1.4.21','1.4.22','1.4.23','1.4.24','1.4.25','1.4.26','1.4.27','1.4.28','1.4.29','1.4.30','1.4.31','1.4.32',PACKAGE_VERSION]);
  const storeRequest=window.OpenDeskTool.request;
  let snapshot=null,pending=null,recovery=null,recoveryFault=null;
  // Stale validated facts are display-only, not authority for new operations.
  let memberVerifiedFresh=false,activationHintCode=null,activationSeen=null,activationSource=null;
  let activationCancelGeneration=0,redeemPostStarted=false,stopAfterRedeem=false;
  let preflightAccountId=null;
  const pausedScopesInMemory=new Set();
  let recoveryReady=false,busy=false,seq=0;
  let refreshProxyPresentation=()=>{};
  let developmentProfile=null,developmentRead=0,localMode=false,localConnecting=false;
  let localChoiceLoaded=false,localChoice=false,localChoiceOrigin=LEGACY_LOCAL_ORIGIN,localNotice='',serviceRevision=0;
  // Release-owned exact URLs. No production Cookie source/target has been approved.
  const COOKIE_TARGETS=Object.freeze(service?.cookieTargets||[]),COOKIE_KEY='aiVipCookieDeliveryR137';
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
  let presentedCookiePending=null,presentedCookieIssue='';
  let cookieFaultRecoverable=false,cookieJournal=null,websiteController=null;
  let sharedCatalog=null,sharedId='',sharedGeneration=0,sharedBusy=false,sharedNotice='',acquireAfterActivation=false;
  let serverSession=null;
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
  const assignedScope=row=>row?.cookieFormat?serverCookieScope(row.cookieScope):cookieScope(row?.cookieScope||[]);
  function validateSharedCatalog(data){
    if(data===undefined)return null;
    if(!exactKeys(data,['schemaVersion','companyId','assignedAccountId','redemptionId','accounts'])||data.schemaVersion!==1||
      !safeString(data.companyId,120)||!safeString(data.assignedAccountId,120)||!safeString(data.redemptionId,120)||
      !Array.isArray(data.accounts)||data.accounts.length!==1||data.accounts[0]?.id!==data.assignedAccountId)
      fail('E_SHARED_SCHEMA','共享账号目录无效');
    const ids=new Set(),scopes=new Map();
    const accounts=data.accounts.map(row=>{
      if(!exactKeys(row,['id','label','displayNameMasked','targetUrl','cookieScope','cookieFormat'])||!safeString(row.id,120)||
        ids.has(row.id)||!safeString(row.label,100)||!commercialCookieTarget(row.targetUrl)||
        !Array.isArray(row.cookieScope)||!row.cookieScope.length||row.cookieScope.length>50)
        fail('E_SHARED_SCHEMA','共享账号或目标无效');
      // Display metadata is neither a credential nor proof of website login.
      // Reject raw identities and characters that could mislead the review.
      if(row.displayNameMasked!==undefined&&(!safeString(row.displayNameMasked,100)||
        row.displayNameMasked!==row.displayNameMasked.trim()||!/\*{2,}/.test(row.displayNameMasked)||
        /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(row.displayNameMasked)))
        fail('E_SHARED_SCHEMA','共享账号脱敏身份无效');
      ids.add(row.id);
      if(row.cookieFormat!==undefined){
        if(!localMode||!developmentProfile||row.cookieFormat!=='chatgpt-export-v1'||
          row.targetUrl!==LOCAL_CHATGPT.site.targetUrl)fail('E_SHARED_SCHEMA','会话格式未获批准');
        return {...row,cookieScope:validateServerCookieScope(row.cookieScope)};
      }
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
    serverSession=null;
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
      // The staged website-login entry owns the single next action. Keep the
      // legacy retry node inert instead of showing a second acquisition button.
      sharedReceive.hidden=true;
      sharedReceive.disabled=busy||cookieBusy||sharedBusy||!selection||
        !cookieReady||(Boolean(cookieFault)&&!cookieFaultRecoverable)||
        ['unknown','partial'].includes(cookieRecord?.state);
    }
    if(sharedStatus)sharedStatus.textContent=['unknown','partial'].includes(cookieRecord?.state)?
      '上次会话写入结果仍需人工核对；已停止取得会话，不会自动重放。':
      sharedBusy?'正在取得服务器分配账号的会话…':sharedNotice||
      (selection?'服务器已分配 '+selection.label+'；尚未写入目标网站。':'当前没有服务器分配的账号。');
    refresh.disabled=!endpoints||busy||cookieBusy||sharedBusy;
  }
  async function requestSharedSession(){
    if(websiteController?.isOrdinarySelected())return;
    const selected=assignedShared();
    if(!selected||!memberVerifiedFresh||busy||sharedBusy||cookieBusy||!endpoints||!cookieReady||(cookieFault&&!cookieFaultRecoverable)||
      ['unknown','partial'].includes(cookieRecord?.state))return;
    if(cookieFaultRecoverable){cookieFault='';cookieFaultRecoverable=false;}
    const generation=++sharedGeneration,revision=serviceRevision,accountId=snapshot?.account.id;
    const companyId=sharedCatalog.companyId,redemptionId=sharedCatalog.redemptionId,requestId=crypto.randomUUID();
    cookiePending=null;serverSession=null;sharedBusy=true;sharedNotice='';renderRedeem();
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
      if(selected.cookieFormat==='chatgpt-export-v1'){
        const assertActive=()=>{
          if(disposed||generation!==sharedGeneration||revision!==serviceRevision||
            snapshot?.account.id!==accountId||sharedCatalog?.redemptionId!==redemptionId||
            assignedShared()?.cookieFormat!==selected.cookieFormat||
            serverCookieScope(assignedShared()?.cookieScope||[])!==serverCookieScope(selected.cookieScope))
            fail('E_SHARED_IDENTITY','会话分配已变化');
        };
        const prepared=await prepareServerCookieBatches(result.cookieDelivery,{now,issuedAt:result.serverNow,
          expectedScope:serverCookieScope(selected.cookieScope),cookies:window.OpenDeskSDK.browser.cookies,assertActive});
        assertActive();
        serverSession={...prepared,index:0,accountId,sharedAccountId:result.sharedAccountId,companyId,redemptionId,
          revision,assignmentGeneration:generation,requestId};
        stageServerBatch();
        return;
      }
      const delivery=validateCookieDelivery(result.cookieDelivery);
      if(delivery.targetUrl!==selected.targetUrl||cookieScope(delivery.payload.cookies)!==cookieScope(selected.cookieScope))
        fail('E_SHARED_SCOPE','交付未完整覆盖该账号已批准的会话范围');
      receiveCookies(result);
      if(!cookiePending)fail('E_SHARED_DELIVERY','交付无法接收');
      cookiePending={...cookiePending,accountId,sharedAccountId:result.sharedAccountId,companyId,redemptionId,
        scope:cookieScope(selected.cookieScope),revision,assignmentGeneration:generation};
      sharedNotice='服务器已交付 '+selected.label+'。请确认写入，再到目标网页核对账号。';
    }catch(error){
      if(generation!==sharedGeneration||revision!==serviceRevision)return;
      cookiePending=null;serverSession=null;
      sharedNotice=['E_SITE_GRANT_REQUIRED','E_CHROME_PERMISSION_REQUIRED'].includes(error?.code)?
        '请在工具设置中允许 ChatGPT 网站 Cookie 访问，再准备登录。':
        '未取得有效的服务器分配账号交付；请核对网站授权并刷新后重试。未写入 Cookie。';
    }finally{
      if(generation===sharedGeneration){sharedBusy=false;renderRedeem();}
    }
  }
  function stageServerBatch(){
    const session=serverSession,payload=session.batches[session.index];
    const requestId=session.requestId+'-'+session.index;
    cookiePending={...session,kind:'server-batch',payload,
      deliveryId:session.deliveryId+'-'+session.index,requestId,policyVersion:'1',
      scopeKey:JSON.stringify(['commercial-membership',new URL(endpoints.member).origin,'commercial-assigned-site',
        session.accountId,session.redemptionId,'setCookies',session.targetUrl,['commercial',session.companyId,
          session.redemptionId,session.sharedAccountId,session.redemptionId]]),
      slots:payload.cookies.map(row=>({name:row.name,domain:'chatgpt.com',hostOnly:row.domain===undefined,
        path:row.path,storeId:session.storeId,partitionKey:row.partitionKey??null}))};
    // The plan remains private memory. The pending intent only retains its own exact batch.
    delete cookiePending.batches;
    sharedNotice='服务器交付共 '+session.totalCount+' 项，保留 '+session.count+' 项，跳过 '+session.skippedCount+
      ' 项过期数据。第 '+(session.index+1)+' / '+session.batches.length+' 批（'+payload.cookies.length+' 项），每批分别确认。';
  }
  function completeServerBatch(delivery,success){
    const session=serverSession;
    if(!session||session.deliveryId+'-'+session.index!==delivery.deliveryId)return false;
    session.batches[session.index].cookies=[];
    const remaining=session.batches.slice(session.index+1).reduce((n,batch)=>n+batch.cookies.length,0);
    if(success&&remaining&&estimatedServerNow()<session.expiresAt){
      session.index++;stageServerBatch();return false;
    }
    serverSession=null;
    sharedNotice=!success?'本批未完整设置，后续批次已丢弃；请核对结果。':remaining?
      '本批已核验，交付已到期，剩余 '+remaining+' 项未提交；请重新准备登录。':
      '服务器交付的各批 Cookie 已写入并核验；请在 ChatGPT 页面核对实际登录。';
    return success&&remaining===0;
  }
  sharedReceive?.addEventListener('click',event=>{
    if(event.isTrusted===true&&!sharedReceive.disabled)void requestSharedSession();
  });
  async function openCookieTarget(target=cookieRecord?.targetUrl){
    if(!cookieTarget(target))return;
    try{await window.OpenDeskSDK.browser.tabs.create({url:target});}
    catch{sharedNotice='Cookie 已写入，但目标网页未能打开；请手动打开目标站核对账号。';renderShared();}
  }
  cookieOpen?.addEventListener('click',event=>{if(event.isTrusted===true)void openCookieTarget();});
  function cookieTarget(url){
    return url===LOCAL_CHATGPT.site.targetUrl||commercialCookieTarget(url)||Boolean(developmentProfile&&
      ORDINARY_SITES.some(row=>row.site.targetUrl===url));
  }
  function commercialCookieTarget(url){
    const targets=[...COOKIE_TARGETS,...(localMode&&developmentProfile?[localOrigin+'/session/',LOCAL_CHATGPT.site.targetUrl]:[])];
    return typeof url==='string'&&targets.includes(url);
  }
  function validateCookieDelivery(data,now=estimatedServerNow(),expectedTarget=null){
    // Only the ordinary controller supplies a fixed expected target, after its
    // own source authorization. Commercial responses cannot borrow that policy.
    const allowed=expectedTarget?Boolean(developmentProfile&&
      ORDINARY_SITES.some(row=>row.site.targetUrl===expectedTarget)&&data?.targetUrl===expectedTarget):
      commercialCookieTarget(data?.targetUrl);
    if(!exactKeys(data,['schemaVersion','deliveryId','targetUrl','expiresAt','cookies'])||data.schemaVersion!==1||
      !safeString(data.deliveryId,120)||!allowed||now===null||
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
    projectCookieRecord();
    cookieSection.hidden=!cookiePending&&!cookieRecord&&!cookieFault;
    const record=cookieRecord;
    const currentRecord=Boolean(record&&!(cookieFault&&cookieFaultRecoverable)&&
      (!cookiePending||record.deliveryId===cookiePending.deliveryId));
    const validity=byId('ai-vip-session-validity');
    if(validity){
      validity.hidden=!cookiePending;
      validity.textContent=cookiePending?'交付有效期至 '+dateLabel(cookiePending.expiresAt)+
        '；仅限本次提交窗口，不代表网站登录或套餐有效期。':'';
    }
    const siteSection=byId('ai-vip-sites-section');
    const issue=cookieFault||(['unknown','partial'].includes(record?.state)?record.deliveryId||record.state:'');
    if(siteSection&&!cookieSection.hidden){
      siteSection.hidden=false;
      // New decisions and warnings are revealed once. Unrelated renders and
      // restored successful receipts respect the user's collapsed state.
      if((cookiePending&&cookiePending!==presentedCookiePending)||(issue&&issue!==presentedCookieIssue))
        siteSection.open=true;
    }
    if((cookiePending&&cookiePending!==presentedCookiePending)||(issue&&issue!==presentedCookieIssue))cookieSection.open=true;
    else if(presentedCookiePending&&!cookiePending&&record?.state==='success')cookieSection.open=false;
    const cookieSummary=byId('ai-vip-cookie-summary');
    if(cookieSummary)cookieSummary.textContent=cookiePending?'继续本次登录':issue?'核对上次操作':'查看上次网站操作';
    presentedCookiePending=cookiePending;presentedCookieIssue=issue;
    cookieInstall.hidden=!cookiePending;
    cookieInstall.textContent=['local-file','server-batch'].includes(cookiePending?.kind)?'继续登录 · 确认本批（'+cookiePending.payload.cookies.length+' 项）':'继续登录并打开网站';
    cookieInstall.disabled=!cookieReady||cookieBusy||busy||!cookiePending||Boolean(cookieFault)||journalLocked()||
      (record?.scopeKey&&record.scopeKey===cookiePending?.scopeKey&&
        record.deliveryId===cookiePending?.deliveryId&&record.state!=='failed');
    const resultDetails=byId('ai-vip-cookie-result-details');
    if(resultDetails)resultDetails.hidden=!(currentRecord&&record?.results?.length);
    clear(cookieResults);
    for(const row of (currentRecord?record?.results:[])||[])addRow(cookieResults,'第 '+(row.index+1)+' 项',
      row.verified?'已写入并核验':row.saved?'已写入，尚未核验':
        COOKIE_RESULT_LABELS[row.code]||'未完成，请人工核对');
    const localBatch=record?.scopeKey&&(JSON.parse(record.scopeKey)[0]==='user-local-file'||record.targetUrl===LOCAL_CHATGPT.site.targetUrl);
    const labels={success:(!cookiePending?'上次批次':localBatch?'本批':'全部')+' Cookie 已写入并核验；网站登录及身份仍需在目标页面核对。',
      partial:'部分 Cookie 已写入；其余未完成。不会自动回滚或重放，请在目标页面核对。',
      failed:'Cookie 未写入。请检查目标网站的 Chrome 权限与工具设置授权；修复后可主动重试有效交付。',
      unknown:'Cookie 操作结果未知或恢复记录未确认；已禁止重放，请在目标页面人工核对。'};
    cookieStatus.textContent=cookieFault||(cookieBusy?'正在核对授权与网站会话，请勿重复操作。':
      record&&(!cookiePending||record.deliveryId===cookiePending.deliveryId)?
        (record.state==='failed'&&sharedNotice.startsWith('已取消 Cookie 确认')?
          (cookiePending?sharedNotice:'已取消 Cookie 确认，未提交写入；当前准备已结束，请重新准备登录。'):labels[record.state]):
        cookiePending?'已收到网站会话，目标网站：'+new URL(cookiePending.targetUrl).host+'。当前批次尚未提交，请核对后确认。':
        sharedBusy?'正在获取网站会话…':sharedNotice.startsWith('未取得有效')?
          '暂未取得有效网站会话，请检查授权后重试。':'尚未应用网站会话。');
    if(cookieOpen)cookieOpen.hidden=!currentRecord||Boolean(cookiePending)||record?.state!=='success'||!cookieTarget(record.targetUrl);
  }
  function journalLocked(){
    if(!cookieReady)return true;
    if(cookieJournal?.schemaVersion===1)return ['unknown','partial'].includes(cookieJournal.state);
    return cookieJournal?.schemaVersion===2&&(
      Boolean(Journal.legacyCookieBarrier(cookieJournal))||
      cookieJournal.attempts.some(row=>['unknown','partial'].includes(row.state)));
  }
  function projectCookieRecord(){
    if(cookieJournal?.schemaVersion!==2){cookieRecord=cookieJournal;return;}
    const rows=cookieJournal.attempts;
    const unknown=rows.find(row=>['unknown','partial'].includes(row.state));
    const target=websiteController?.current()?.site.targetUrl||assignedShared()?.targetUrl;
    const row=unknown||rows.filter(row=>JSON.parse(row.scopeKey)[6]===target).at(-1);
    cookieRecord=row?{...row,targetUrl:JSON.parse(row.scopeKey)[6]}:cookieJournal.legacy.record;
    // Old evidence is always visible as old evidence, never attributed to a new site.
    if(cookieRecord===cookieJournal.legacy.record&&cookieRecord&&target&&cookieRecord.targetUrl!==target&&
      !['unknown','partial'].includes(cookieRecord.state))cookieRecord=null;
    // Retained development facts are display-only and unavailable without the profile.
    if(!developmentProfile&&ORDINARY_SITES.some(row=>row.site.targetUrl===cookieRecord?.targetUrl))cookieRecord=null;
  }
  async function readCookieRecord(){return Journal.readCookieJournal(storeRequest);}
  async function loadCookieRecord(){
    try{cookieJournal=(await readCookieRecord()).value;cookieReady=true;projectCookieRecord();}
    catch{cookieFault='Cookie 恢复记录无法核对，已禁止写入；请检查工具存储授权。';}
    renderRedeem();
  }
  function commercialIntent(delivery){
    const selected=assignedShared();
    if(!selected||!memberVerifiedFresh||delivery.accountId!==snapshot?.account.id||
      delivery.redemptionId!==sharedCatalog?.redemptionId||
      (delivery.sharedAccountId&&delivery.sharedAccountId!==sharedId)||
      delivery.targetUrl!==selected.targetUrl||cookieScope(delivery.payload.cookies)!==cookieScope(selected.cookieScope))
      fail('E_COOKIE_DELIVERY','共享会话缺少当前服务器分配');
    const sourceOrigin=new URL(endpoints.member).origin;
    return {...delivery,kind:'commercial',sharedAccountId:sharedId,companyId:sharedCatalog.companyId,
      assignmentGeneration:sharedGeneration,requestId:delivery.requestId||crypto.randomUUID(),policyVersion:'1',
      scopeKey:JSON.stringify(['commercial-membership',sourceOrigin,'commercial-assigned-site',delivery.accountId,
        delivery.redemptionId,'setCookies',delivery.targetUrl,['commercial',sharedCatalog.companyId,
          delivery.redemptionId,sharedId,delivery.redemptionId]]),
      slots:delivery.payload.cookies.map(row=>({name:row.name,domain:new URL(delivery.targetUrl).hostname,
        hostOnly:row.domain===undefined,path:row.path,storeId:null,partitionKey:'unresolved'}))};
  }
  async function validateCurrentDelivery(delivery,refresh=false){
    if(disposed)fail('E_COOKIE_DELIVERY','工具已关闭');
    if(['ordinary','local-file'].includes(delivery.kind))return websiteController.validate(delivery,{refresh});
    if(refresh){
      const latest=verifiedMember(await businessRequest('GET',endpoints.member));
      acceptMemberSnapshot(latest);
    }
    let now=estimatedServerNow();
    if(delivery.kind==='server-batch'){
      const session=serverSession;
      if(!session||session.batches[session.index]!==delivery.payload||
        session.deliveryId+'-'+session.index!==delivery.deliveryId||
        assignedScope(assignedShared())!==session.scope||assignedShared()?.cookieFormat!=='chatgpt-export-v1')
        fail('E_COOKIE_DELIVERY','服务器批次或范围已变化');
      if(refresh){
        const context=await window.OpenDeskSDK.browser.cookies.getCurrentStore({url:delivery.targetUrl});
        if(context?.storeId!==session.storeId)fail('E_COOKIE_DELIVERY','Cookie Store 已变化');
        if(delivery.payload.cookies.some(row=>row.partitionKey)){
          const partition=await window.OpenDeskSDK.browser.cookies.getPartitionKey({url:delivery.targetUrl});
          if(partition?.partitionKey?.topLevelSite!==session.partitionKey?.topLevelSite||
            partition?.partitionKey?.hasCrossSiteAncestor!==session.partitionKey?.hasCrossSiteAncestor)
            fail('E_COOKIE_DELIVERY','Cookie Partition 已变化');
        }
      }
      now=estimatedServerNow();
    }
    if(delivery.revision!==serviceRevision||!memberVerifiedFresh||snapshot?.account.id!==delivery.accountId||
      now===null||delivery.expiresAt<=now||!commercialCookieTarget(delivery.targetUrl)||
      delivery.assignmentGeneration!==sharedGeneration||sharedId!==delivery.sharedAccountId||
      sharedCatalog?.companyId!==delivery.companyId||sharedCatalog?.redemptionId!==delivery.redemptionId||
      (delivery.kind==='server-batch'?assignedScope(assignedShared())!==delivery.scope:
        cookieScope(assignedShared()?.cookieScope||[])!==cookieScope(delivery.payload.cookies)))
      fail('E_COOKIE_DELIVERY','交付已过期或共享授权已变化');
    return now;
  }
  function receiveCookies(receipt){
    cookiePending=null;
    if(receipt.cookieDelivery===undefined){renderCookies();return;}
    try{
      cookiePending={...validateCookieDelivery(receipt.cookieDelivery),accountId:receipt.accountId,
        redemptionId:receipt.redemptionId,revision:serviceRevision};
      // Existing unknown/partial effects cannot be replaced by another delivered batch.
      if(journalLocked())
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
  function installCurrentSession(event){
    if(event?.isTrusted!==true||cookieInstall.disabled||cookieBusy||busy||!cookiePending)return;
    const returnFocus=document.activeElement===cookieInstall;
    let delivery;
    try{delivery=['ordinary','local-file','server-batch'].includes(cookiePending.kind)?cookiePending:commercialIntent(cookiePending);}
    catch{cookiePending=null;cookieFault='缺少当前有效会话分配，未提交 Cookie。';renderRedeem();return;}
    cookiePending=delivery; // Preserve the exact intent for an explicit pre-dispatch cancellation.
    cookieBusy=true;cookieFault='';renderRedeem();
    return (async()=>{
      let started=false,marker,cancelledBeforeDispatch=false;
      try{
        await validateCurrentDelivery(delivery,true);
        const legacyOrigin=cookieJournal?.serviceOrigin;
        const mappings=cookieJournal?.schemaVersion===1&&LOCAL_ORIGINS.includes(legacyOrigin)&&
          cookieJournal.targetUrl===legacyOrigin+'/session/'?[{sourceId:'commercial-membership',
            siteId:'commercial-assigned-site',serviceOrigin:legacyOrigin,targetUrl:legacyOrigin+'/session/',
            accountId:cookieJournal.accountId,...(cookieJournal.sharedAccountId?{sharedAccountId:cookieJournal.sharedAccountId}:{})}]:[];
        cookieJournal=(await Journal.migrateCookieJournal(storeRequest,mappings)).value;
        const bytes=new TextEncoder().encode(JSON.stringify(delivery.payload));
        const payloadHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
          b=>b.toString(16).padStart(2,'0')).join('');
        await validateCurrentDelivery(delivery);
        marker=await Journal.reserveCookieAttempt(storeRequest,{scopeKey:delivery.scopeKey,
          requestId:delivery.requestId,deliveryId:delivery.deliveryId,policyVersion:delivery.policyVersion,
          payloadHash,expiresAt:delivery.expiresAt,count:delivery.payload.cookies.length,
          slots:delivery.slots,state:'unknown',resolution:'pending',results:[]});
        cookieJournal=marker.value;projectCookieRecord();
        await validateCurrentDelivery(delivery);
        started=true;
        const result=await window.OpenDeskSDK.browser.cookies.setMany(delivery.payload);
        cookieJournal=(await Journal.saveCookieReceipt(storeRequest,marker.reference,{receipt:result})).value;
        const outcome=cookieJournal.attempts.find(row=>row.attemptId===marker.reference.attemptId);
        if(cookiePending===delivery||cookiePending?.deliveryId===delivery.deliveryId)cookiePending=null;
        const completion=['ordinary','local-file'].includes(delivery.kind)?
          websiteController.completed(delivery,{success:outcome.state==='success'}):null;
        const serverComplete=delivery.kind==='server-batch'?completeServerBatch(delivery,outcome.state==='success'):true;
        if(delivery.kind!=='server-batch')sharedNotice=outcome.state==='success'?'已设置，请在目标页核对实际登录状态。':
          '网站会话未完整设置；请核对逐项结果，不会自动重试。';
        if(outcome.state==='success'&&!disposed&&
          serverComplete&&(delivery.kind!=='local-file'||completion?.complete))await openCookieTarget(delivery.targetUrl);
      }catch(error){
        let safeCancellation=false,confirmedNotInvoked=false;
        if(marker){
          try{
            cookieJournal=(await Journal.saveCookieReceipt(storeRequest,marker.reference,
              !started?{notInvoked:true}:{errorCode:error?.code})).value;
            safeCancellation=started&&error?.code==='E_COOKIE_NOT_SUBMITTED';
            confirmedNotInvoked=!started;
          }catch{cookieFault='Cookie 恢复记录无法确认，已禁止新写入与重放。';}
        }
        if(safeCancellation&&!cookieFault){
          cancelledBeforeDispatch=true;
          sharedNotice='已取消 Cookie 确认，未提交写入；有效交付可由你重新确认，不会自动重试。';
        }else{
          if(delivery.kind==='server-batch')completeServerBatch(delivery,false);
          if(['ordinary','local-file'].includes(delivery.kind))websiteController.completed(delivery);
          cookiePending=null;
          cookieFault=cookieFault||(started?'Cookie 写入结果未知，已禁止重放；请在目标页面人工核对。':
            error?.code==='E_COOKIE_LIMIT'?'恢复记录容量不足，未提交Cookie；原记录已保留':
            error?.code==='E_COOKIE_SCOPE'?
              '当前主机已有不同范围的网站会话，本次交付不能完整替换，未写入 Cookie。请使用独立的浏览器配置处理此会话。':
            'Cookie 未提交：交付已变化、恢复记录锁定或存储无法核对。请核对后重新取得有效交付。');
          cookieFaultRecoverable=!started&&!journalLocked()&&(!marker||confirmedNotInvoked)&&
            !cookieFault.startsWith('Cookie 恢复记录无法确认');
        }
      }finally{
        // A submitted outcome always belongs to its captured scope, including a late response.
        if(!cookiePending||cookiePending.deliveryId!==delivery.deliveryId)delivery.credential='';
        cookieBusy=false;projectCookieRecord();renderRedeem();
        if(cancelledBeforeDispatch&&returnFocus&&!disposed&&cookieInstall.isConnected&&
          !cookieInstall.disabled&&!cookieInstall.hidden&&document.hasFocus()&&
          (document.activeElement===document.body||document.activeElement===cookieInstall))
          cookieInstall.focus({preventScroll:true});
      }
    })();
  }
  cookieInstall?.addEventListener('click',event=>{void installCurrentSession(event);});
  async function useWebsite(event){
    if(event?.isTrusted!==true)return;
    if(localMode)return requestSharedSession(); // Explicit developer staging only.
    await requestSharedSession();
    // Initial intent covers login. Every later batch still needs its own click.
    // setMany retains the original trusted Host confirmation and all fences.
    if(!disposed&&cookiePending&&!cookieInstall.disabled)await installCurrentSession(event);
  }
  function validatedDevelopmentProfile(value){
    // Only getStatus supplies this field, after the platform's dev/package approval.
    // Storage or a member/lease response can never supply proxy availability.
    if(!plain(value)||!plain(value.endpoint)||value.endpoint.scheme!=='http'||
      value.endpoint.host!=='127.0.0.1'||value.endpoint.port!==7897||
      !Array.isArray(value.domains)||value.domains.length!==LOCAL_DOMAINS.length||
      new Set(value.domains).size!==LOCAL_DOMAINS.length||
      LOCAL_DOMAINS.some(domain=>!value.domains.includes(domain)))return null;
    return {endpoint:{scheme:'http',host:'127.0.0.1',port:7897},domains:[...value.domains]};
  }
  function recoveryMatchesService(record=recovery,development=localMode,origin=localOrigin){
    return !record||(development?record.schemaVersion===2&&record.serviceOrigin===origin:
      record.schemaVersion===3&&service&&record.serviceOrigin===new URL(service.url).origin);
  }
  function renderLocalDevelopment(){
    if(disposed)return;
    // Only the source-reviewed SDK profile admits these optional controls;
    // production and unapproved packages never construct a development view.
    if(developmentProfile&&!localSection&&typeof createDevelopmentControls==='function'){
      developmentControls=createDevelopmentControls();
      localSection=developmentControls.section;localConnect=developmentControls.button;
      localStatus=developmentControls.status;
      testSites=developmentControls.websiteButton;
      testSites?.addEventListener('click',enableWebsiteTests);
      localConnect.addEventListener('click',connectLocalDevelopment);
    }
    renderFeatureStatus();
    if(!localSection||!localConnect||!localStatus)return;
    localSection.hidden=!developmentProfile;
    if(testSites)testSites.disabled=!developmentProfile||busy||cookieBusy;
    localConnect.disabled=!developmentProfile||localConnecting||busy||cookieBusy||
      (localMode&&(Boolean(recoveryFault)||Boolean(recovery&&recoveryMatchesService())||localSwitchBlocked()));
    localConnect.textContent=localConnecting?'正在连接…':localMode?'退出本地开发':'连接本地开发';
    localConnect.setAttribute('aria-pressed',String(localMode));
    localStatus.textContent=localNotice||(localMode?
      '本地开发 · 已选择 '+new URL(localOrigin).host+' 测试服务。激活后由服务器提供会话；测试权益不是付费会员。':
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
      '正式兑换服务未配置，兑换输入框仅可查看、不可提交；专属链接和旧设备激活也不能代替兑换服务。');
    set('feature-cookie',localMode?'激活后由本机测试服务器提供当前分配的网站会话；每批确认后到目标网站核对实际账号与权益。':
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
    if(result.value!==null&&(!plain(result.value)||typeof result.value.enabled!=='boolean'||
      !(result.value.schemaVersion===1&&Object.keys(result.value).sort().join(',')==='enabled,schemaVersion'||
        result.value.schemaVersion===2&&Object.keys(result.value).sort().join(',')==='enabled,schemaVersion,serviceOrigin'&&
        LOCAL_ORIGINS.includes(result.value.serviceOrigin))))
      fail('E_LOCAL_STORAGE','本地开发选择格式无效');
    return result;
  }
  function changeBusinessMode(development,origin=localChoiceOrigin){
    if(!LOCAL_ORIGINS.includes(origin))fail('E_LOCAL_ORIGIN','测试服务来源无效');
    if(localMode===development&&(!development||localOrigin===origin))return;
    invalidateShared();sharedNotice='';acquireAfterActivation=false;
    localMode=development;
    if(development)localOrigin=origin;
    endpoints=development?localEndpoints(localOrigin):serviceConnected?productionEndpoints:null;
    ++serviceRevision;++seq;
    snapshot=null;serverSampleAt=null;pending=null;code.value='';busy=false;
    memberVerifiedFresh=false;activationHintCode=null;activationSeen=null;activationHint.hidden=true;
    cookiePending=null;renderCookies();
    renderBusinessConfiguration();
    renderLocalDevelopment();
  }
  async function acceptDevelopmentStatus(state){
    const read=++developmentRead;
    developmentProfile=(createDevelopmentControls||localSection)?validatedDevelopmentProfile(state?.developmentProfile):null;
    if(!developmentProfile){
      changeBusinessMode(false);
      renderLocalDevelopment();renderRedeem();return;
    }
    if(!localChoiceLoaded){
      try{
        const preference=await readLocalPreference();
        if(read!==developmentRead)return;
        localChoice=preference.value?.enabled===true;
        localChoiceOrigin=preference.value?.serviceOrigin??LEGACY_LOCAL_ORIGIN;localChoiceLoaded=true;
        localNotice='';
      }catch{
        if(read!==developmentRead)return;
        localNotice='本地开发选择无法恢复；连接前将重新核对存储，不会自动激活。';
        renderLocalDevelopment();return;
      }
    }
    if(localChoice&&recoveryReady&&recoveryMatchesService(recovery,true,localChoiceOrigin))changeBusinessMode(true,localChoiceOrigin);
    renderLocalDevelopment();renderRedeem();
  }
  function connectLocalDevelopment(event){
    if(event?.isTrusted!==true||localConnect.disabled||localConnecting||busy||cookieBusy)return;
    const selected=!localMode;
    localConnecting=true;localNotice='正在核对可信开发配置与本地选择…';renderLocalDevelopment();
    void (async()=>{
      try{
        // Re-read trusted availability before using even a persisted development choice.
        await refreshDevelopmentAvailability();
        const latest=await readRecovery();recovery=latest.record;
        const origin=selected?(recovery?.serviceOrigin??DEFAULT_LOCAL_ORIGIN):localOrigin;
        if(!developmentProfile||!recoveryMatchesService(recovery,selected,origin)||
          (!selected&&(recoveryFault||localSwitchBlocked())))
          fail('E_LOCAL_UNAVAILABLE','开发配置不可用或仍有待完成操作');
        const before=await readLocalPreference();
        try{
          await storeRequest('storage.set',{key:LOCAL_PREFERENCE_KEY,
            value:{schemaVersion:2,enabled:selected,serviceOrigin:origin},ifMatch:before.etag});
        }catch{/* Verify a possibly committed preference; never assume success. */}
        const after=await readLocalPreference();
        if(after.value?.enabled!==selected||after.value?.serviceOrigin!==origin||!developmentProfile)
          fail('E_LOCAL_STORAGE','本地选择未持久确认或开发配置已撤销');
        localChoice=selected;localChoiceOrigin=origin;localChoiceLoaded=true;localNotice='';
        changeBusinessMode(selected,origin);
      }catch{
        localNotice='未能连接或切换本地开发服务。请核对开发配置、工具存储及待核对兑换记录。';
      }finally{localConnecting=false;renderLocalDevelopment();}
    })();
  }
  localConnect?.addEventListener('click',connectLocalDevelopment);
  function validRecovery(raw){
    if(raw===null)return null;
    const development=raw?.schemaVersion===2,connected=raw?.schemaVersion===3;
    const fields=['accountId','createdAt','idempotencyKey','packageVersion','schemaVersion','toolId',
      ...(development||connected?['serviceOrigin']:[])];
    if(!plain(raw)||Object.keys(raw).sort().join(',')!==fields.sort().join(',')||
      (!development&&!connected&&raw.schemaVersion!==1)||(development&&!LOCAL_ORIGINS.includes(raw.serviceOrigin))||
      (connected&&(!safeString(raw.serviceOrigin,2048)||!/^https:\/\/[^/]+$/.test(raw.serviceOrigin)))||
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
      if(developmentProfile&&localChoice&&recoveryMatchesService(recovery,true,localChoiceOrigin))changeBusinessMode(true,localChoiceOrigin);
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
      (redemptionIntent.development&&(!developmentProfile||redemptionIntent.serviceOrigin!==localOrigin)))
      fail('E_RECOVERY_SERVICE_CHANGED','服务环境已变化，本次未写入兑换事务');
    // Once storage.set starts, retain this intent's service even if availability changes.
    const record={schemaVersion:redemptionIntent.development?2:3,
      serviceOrigin:redemptionIntent.serviceOrigin,
      toolId:'ai-vip-share',packageVersion:PACKAGE_VERSION,
      accountId,idempotencyKey:key,createdAt:Date.now()};
    await writeRecovery(before,record);
    recovery=record;
    renderRedeem();
  }
  async function clearRecovered(key){
    const before=await readRecovery();
    if(!before.record||before.record.idempotencyKey!==key||
      before.record.accountId!==recovery?.accountId||before.record.schemaVersion!==recovery?.schemaVersion||
      before.record.serviceOrigin!==recovery?.serviceOrigin)
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
    memberCard.setAttribute('data-view',memberVerifiedFresh?view:'stale');
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
      account.state==='guest'?'请通过正式会员服务关联账号。':'当前没有可用会员权益。';
    productName.hidden=false;
    memberEmpty.hidden=Boolean(primary);
    memberEmptyText.textContent=account.state==='guest'?
      '账号关联后可查看权益及兑换记录。':'目前没有已生效的会员权益。';
    focusRedeem.hidden=account.state!=='bound'||!memberVerifiedFresh;
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
    if(!memberVerifiedFresh){
      memberState.textContent='查询失败';memberState.setAttribute('data-tone','warn');
      productName.textContent=(primary?'上次核验：'+primary.title:'上次查询到的会员账号')+' · 当前状态待核验';
      focusRedeem.hidden=true;verified.hidden=false;
      verified.textContent='上次服务端核验 · '+dateLabel(serverNow)+'（当前状态待核验）';
    }
    if(recovery&&account.id!==recovery.accountId)
      redeemNotice('当前账号与未确认兑换归属不同。请切回原账号核对，不会继承权益。',true);
    else if(!busy&&!recovery&&!recoveryFault){
      if(account.state==='guest')redeemNotice('登录并绑定账号后可使用兑换码。');
      else if(memberVerifiedFresh&&(/服务未配置|服务尚未接入|服务接入后|核验中|会员无法核验|兑换已暂停/.test(redeemStatus.textContent)||
        redeemStatus.textContent==='服务端已确认兑换成功，但权益刷新失败；请稍后刷新查看最新数据。'))
        redeemNotice('输入兑换码并预检，确认后再领取。');
    }
    if(memberVerifiedFresh&&redeemStatus.textContent==='服务端已确认兑换成功。正在更新权益，接下来可点击登录并打开网站。')
      redeemNotice('激活成功，可登录并打开网站。');
    renderRedeem();
  }
  function renderRedeem(){
    const accountReady=memberVerifiedFresh&&Boolean(endpoints)&&snapshot?.account.state==='bound';
    const locked=Boolean(recovery||recoveryFault);
    const allowed=accountReady&&!busy&&!cookieBusy&&cookieReady&&!cookieFault&&recoveryReady&&!locked&&
      !['unknown','partial'].includes(cookieRecord?.state);
    const showForm=!locked; // Disabled input remains visible in empty states.
    redeemForm.hidden=!showForm;
    // The live redeem-status below the form owns the single instructional line.
    // Keep legacy nodes inert for test/recovery compatibility, with no spacing.
    redeemIntro.hidden=true;
    redeemFine.hidden=true;
    code.disabled=!allowed||Boolean(pending);
    redeem.disabled=!allowed||Boolean(pending)||
      !/^[A-Za-z0-9._-]{6,120}$/.test(code.value.trim());
    redeem.textContent=busy?'正在处理…':'查看激活内容';
    confirm.disabled=!allowed||!pending;
    previewPanel.hidden=!pending&&!preflightAccountId;
    confirm.hidden=!pending;
    if(preflightAccountId&&!pending){
      previewTitle.textContent='正在核对激活内容';
      previewDescription.textContent='尚未领取权益，可以取消本次预检。';
      previewAccount.textContent='接收账号：'+(snapshot?.account?.name||'待核对');
    }
    const redeemDetails=byId('ai-vip-redeem-details');
    if(redeemDetails){
      redeemDetails.hidden=Boolean(pending||locked);
      if(assignedShared()&&!activationHintCode&&!code.value)redeemDetails.open=false;
      else if(activationHintCode)redeemDetails.open=true;
    }
    activationHint.hidden=!activationHintCode||Boolean(pending)||!memberVerifiedFresh;
    cancel.hidden=!pending&&!preflightAccountId;
    cancel.disabled=busy;
    codeClear.disabled=code.disabled||!code.value;
    showRecovery();
    redeemStatus.hidden=!recoveryPanel.hidden||!redeemError.hidden;
    refreshProxyPresentation();
    renderLocalDevelopment();
    renderConnection();
    websiteController?.render({development:Boolean(developmentProfile),locked:journalLocked()||Boolean(cookieFault&&!cookieFaultRecoverable),
      busy:busy||cookieBusy||sharedBusy,commercialLabel:assignedShared()?.label,
      commercialIdentity:assignedShared()?.displayNameMasked,
      commercialNotice:sharedBusy?'正在准备网站登录…':sharedNotice});
    const flow=byId('ai-vip-login-flow');
    if(flow){
      flow.textContent=journalLocked()||cookieFault?'上次操作尚待核对，请查看下方记录。':
        !assignedShared()&&accountReady&&snapshot.redemptions.some(row=>row.status==='redeemed')?
          '当前没有可用的网站会话分配。请联系服务方核对授权，无需重复激活。':'';
      flow.hidden=!flow.textContent;
    }
    renderCookies();
    renderShared();
    window.OpenDeskTool.setState?.({dirty:Boolean(serviceLink?.value||code.value||pending||cookiePending),
      busy:connecting||busy||cookieBusy||sharedBusy||Boolean(websiteController?.busy)});
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
    if(!expected.includes(url)||(development&&(!developmentProfile||!Object.values(localEndpoints(localOrigin)).includes(url))))
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
      (selected&&(!replacement||replacement.targetUrl!==selected.targetUrl||replacement.cookieFormat!==selected.cookieFormat||
        replacement.label!==selected.label||replacement.displayNameMasked!==selected.displayNameMasked||
        assignedScope(replacement)!==assignedScope(selected)))){
      const hadPrevious=Boolean(sharedCatalog)||(snapshot?.account.id&&snapshot.account.id!==data.account.id);
      invalidateShared();sharedNotice=hadPrevious?'账号或授权目录已变化，请重新取得会话。':'';
    }
    sharedCatalog=next;
    sharedId=next?.assignedAccountId||'';
    // A slow member response cannot move the sampled server clock backwards
    // and thereby extend a previously received Cookie delivery.
    const floor=snapshot&&serverSampleAt!==null?
      snapshot.serverNow+Math.max(0,performance.now()-serverSampleAt):data.serverNow;
    snapshot={...data,serverNow:Math.max(data.serverNow,floor)};
    memberVerifiedFresh=true;
    if(cookiePending&&!['ordinary','local-file'].includes(cookiePending.kind)&&cookiePending.accountId!==data.account.id)cookiePending=null;
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
    const hadPrevious=Boolean(snapshot);
    busy=true;memberVerifiedFresh=false;refresh.disabled=true;
    memberCard.setAttribute('data-view','loading');memberState.textContent='核验中';
    if(!hadPrevious){
      accountName.textContent='正在读取会员信息';accountName.hidden=false;
      productName.textContent='';productName.hidden=true;
      memberFacts.hidden=true;verified.hidden=true;
      secondaryMetrics.hidden=true;historyDetails.hidden=true;memberEmpty.hidden=true;
    }else{
      productName.textContent='正在更新上次已核验信息…';productName.hidden=false;
    }
    renderRedeem();
    try{
      const data=verifiedMember(await businessRequest('GET',endpoints.member));
      if(current!==seq)return;
      acceptMemberSnapshot(data);
    }catch(error){
      if(current!==seq)return;
      memberVerifiedFresh=false;
      invalidateShared();cookiePending=null;
      pending=null;code.value='';activationHintCode=null;activationHint.hidden=true;
      if(snapshot){
        renderMember(); // stale last-validated server data, never action authorization
      }else{
        memberCard.setAttribute('data-view','failed');
        memberState.textContent='无法核验';memberState.setAttribute('data-tone','warn');
        accountName.textContent='会员信息暂不可用';
        productName.textContent='会员服务连接异常，请检查网络后重试。';
        productName.hidden=false;memberEmpty.hidden=false;
        memberEmptyText.textContent='目前无法判断会员是否有效，未将它视为未激活或已到期。';
        focusRedeem.hidden=true;memberFacts.hidden=true;verified.hidden=true;
        secondaryMetrics.hidden=true;historyDetails.hidden=true;
        remaining.textContent='';unit.textContent='';expiry.textContent='';
        meter.hidden=true;meterBar.style.width='0%';meter.removeAttribute('aria-valuenow');
        secondaryMetrics.textContent='';clear(history);historyCount.textContent='';
      }
      if(recovery)redeemNotice('会员身份暂无法核验，上次兑换仍待核对；不可再次提交。',true);
      else if(redeemStatus.textContent.includes('服务端已确认兑换成功'))
        redeemNotice('服务端已确认兑换成功，但权益刷新失败；请稍后刷新查看最新数据。');
      else redeemNotice('会员无法核验，兑换已暂停。',true);
    }finally{
      if(current===seq){
        busy=false;refresh.disabled=false;if(snapshot)renderMember();else renderRedeem();
        if(acquireAfterActivation&&snapshot){
          const continueSession=!stopAfterRedeem&&!disposed;
          acquireAfterActivation=false;
          if(continueSession)void requestSharedSession();
        }
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
    let summary=data.grantSummary;
    // The SQLite demo extends the original preview, never its redeem payload.
    // Render reviewed terms from validated data rather than trusting prose to
    // establish a quantity, lifetime or third-party permission.
    if(data.demoGrant!==undefined){
      const grant=data.demoGrant;
      if(!localMode||!plain(grant)||grant.skuId!=='demo-quota'||
        !Number.isSafeInteger(grant.quantity)||grant.quantity<1||grant.quantity>20||
        grant.unit!=='次'||grant.starts!=='on-confirmation'||
        grant.entitlementExpiresAt!==null||grant.scope!=='opendesk-fixture-only'||
        !Number.isSafeInteger(grant.claimExpiresAt)||dateMs(grant.claimExpiresAt)===null||grant.claimExpiresAt<data.expiresAt||
        grant.claimExpiresAt-now>24*60*60*1000)
        fail('E_PREVIEW','开发权益的数量、有效期或使用范围无法核验');
      summary='发放 '+grant.quantity+' 次本地演示额度；确认后生效，额度不设到期。'+
        '仅限 OpenDesk 合成额度，不含第三方会员、Cookie 或代理；领取链接截止 '+
        dateLabel(grant.claimExpiresAt)+'。';
    }
    return {id:data.previewId,accountId:data.accountId,title:data.skuTitle,
      summary,masked:data.voucherPreviewMasked,expiresAt:data.expiresAt};
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
    if(busy||cookieBusy||!memberVerifiedFresh||!cookieReady||cookieFault||!endpoints||!recoveryReady||
      recovery||recoveryFault||['unknown','partial'].includes(cookieRecord?.state)||snapshot?.account.state!=='bound')return;
    if(!pending){
      if(!/^[A-Za-z0-9._-]{6,120}$/.test(value))return;
      stopAfterRedeem=false;
      const accountId=snapshot.account.id;
      const preflightGeneration=activationCancelGeneration;
      preflightAccountId=accountId;
      sharedGeneration++;sharedBusy=false;cookiePending=null;sharedNotice='';
      busy=true;renderRedeem();redeemNotice('正在请求服务端核验兑换内容…');
      try{
        const result=validatePreview(await businessRequest('POST',endpoints.voucherPreview,{code:value}));
        if(disposed||preflightGeneration!==activationCancelGeneration)fail('E_ACTIVATION_CANCELLED','已取消预检');
        if(snapshot?.account.id!==accountId)fail('E_IDENTITY_CHANGED','预检过程中账号已变化');
        pending=result;code.value='';
        previewTitle.textContent=result.title;
        previewDescription.textContent=result.summary+' · '+result.masked+'；确认后才会兑换。';
        previewAccount.textContent='接收账号：'+snapshot.account.name;
        redeemNotice('请核对商品与账号，再点击「确认激活」。');
      }catch(error){
        redeemNotice(error?.code==='E_ACTIVATION_CANCELLED'?'已取消预检，未提交兑换。':
          '无法核验兑换码，请检查账号、兑换码或网络后重试。',error?.code!=='E_ACTIVATION_CANCELLED');
      }finally{
        preflightAccountId=null;busy=false;renderRedeem();
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
    // A reviewed link may never be consumed after leaving its approved source.
    // The trusted user's confirmation is necessary but not sufficient.
    if(activationHintCode&&!activationFromLink){
      busy=true;renderRedeem();
      try{
        if(!activationPageMatches(await storeRequest('currentPage.info'),activationHintCode))
          fail('E_ACTIVATION_PAGE_CHANGED','激活网页已变化');
      }catch{
        pending=null;code.value='';activationHintCode=null;activationHint.hidden=true;
        redeemNotice('激活页面已变化或权限无法核验，未提交兑换；请重新预检。',true);
        busy=false;renderRedeem();return;
      }
      busy=false;renderRedeem();
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
    const confirmationGeneration=activationCancelGeneration;
    redeemPostStarted=false;stopAfterRedeem=false;
    const redemptionIntent=Object.freeze({revision:serviceRevision,development:localMode,serviceOrigin:localMode?localOrigin:new URL(service.url).origin});
    const intentRevision=redemptionIntent.revision;
    busy=true;renderRedeem();
    redeemNotice('正在重新核对当前账号与预检时限；尚未提交兑换。');
    try{
      // Validate current identity before creating a write-ahead journal.
      // The Provider must also bind the actual POST to its authenticated session.
      const latest=verifiedMember(await businessRequest('GET',endpoints.member));
      acceptMemberSnapshot(latest);
      if(disposed||confirmationGeneration!==activationCancelGeneration)
        fail('E_ACTIVATION_CANCELLED','确认已取消，未提交兑换');
      const currentServerNow=estimatedServerNow();
      if(automatic&&activationCodeFromPage(await storeRequest('currentPage.info'))!==urlCode)
        fail('E_ACTIVATION_PAGE_CHANGED','激活网页已变化');
      if(intentRevision!==serviceRevision||latest.account.state!=='bound'||latest.account.id!==accountId||
        pending?.id!==previewId||currentServerNow===null||
        pending.expiresAt<=currentServerNow)
        fail('E_PRE_SUBMIT','账号或预检状态发生变化');
    }catch(error){
      pending=null;code.value='';busy=false;
      if(error?.code==='E_ACTIVATION_CANCELLED'||disposed||
        confirmationGeneration!==activationCancelGeneration){
        activationHintCode=null;activationHint.hidden=true;
        redeemNotice('已停止尚未提交的兑换；需要领取时请重新主动预检。',true);
      }else redeemNotice('账号或预检状态无法重新核验，本次未提交兑换；请重新预检。',true);
      renderRedeem();
      return;
    }
    redeemNotice('正在持久保存兑换事务，再提交服务端；请勿重复操作。');
    try{
      await beginRecovery(accountId,key,redemptionIntent); // Write-ahead and verified readback.
      if(activationHintCode&&!activationFromLink&&!activationPageMatches(await storeRequest('currentPage.info'),activationHintCode))
        fail('E_ACTIVATION_PAGE_CHANGED','激活网页已变化，保留事务以便核对');
      if(automatic&&activationCodeFromPage(await storeRequest('currentPage.info'))!==urlCode)
        fail('E_ACTIVATION_PAGE_CHANGED','激活网页已变化；保留事务供核对，不会提交');
      const submitNow=estimatedServerNow();
      if(intentRevision!==serviceRevision||snapshot?.account.id!==accountId||pending?.id!==previewId||
        submitNow===null||pending.expiresAt<=submitNow)
        fail('E_PRE_SUBMIT','事务持久化后账号或预检时限变化；禁止提交');
      if(disposed||confirmationGeneration!==activationCancelGeneration){
        // No redeem POST has started: clear only the original verified write-ahead record.
        await clearRecovered(key);
        pending=null;code.value='';activationHintCode=null;activationHint.hidden=true;
        redeemNotice('已取消，服务端兑换尚未提交。');
        return;
      }
      redeemPostStarted=true;
      const result=await businessRequest('POST',endpoints.voucherRedeem,{
        previewId,accountId,idempotencyKey:key});
      validateReceipt(result,key);
      pending=null;code.value='';activationHintCode=null;activationHint.hidden=true;
      // Valid receipt is authoritative; failed journal clearing keeps a lock.
      await clearRecovered(key);
      cookiePending=null;cookieFault='';
      acquireAfterActivation=localMode&&!stopAfterRedeem&&!disposed;
      redeemNotice(stopAfterRedeem?'服务端已确认兑换成功；已停止后续自动操作，结果仍可查看。':
        '服务端已确认兑换成功。正在更新权益，接下来可点击登录并打开网站。');
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
    }finally{busy=false;redeemPostStarted=false;renderRedeem();}
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
        // Status recovery is not a new consent to write a website session.
        acquireAfterActivation=false;
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
  focusRedeem.addEventListener('click',event=>{
    if(event?.isTrusted!==true||code.disabled)return;
    const details=byId('ai-vip-redeem-details');if(details)details.open=true;
    redeemForm.scrollIntoView?.({block:'nearest',behavior:'smooth'});
    code.focus?.({preventScroll:true});
  });
  code.addEventListener('input',()=>{
    if(activationHintCode&&code.value.trim()!==activationHintCode){
      activationHintCode=null;activationFromLink=false;activationHint.hidden=true;
    }
    redeemNotice('兑换内容需先由服务端预检，确认后才会提交。');
    renderRedeem();
  });
  codeClear.addEventListener('click',event=>{
    if(event?.isTrusted!==true||code.disabled)return;
    code.value='';activationHintCode=null;activationHint.hidden=true;
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
    if(!pending&&!preflightAccountId)return;
    const wasLink=Boolean(activationHintCode),accountId=pending?.accountId||preflightAccountId;
    const serviceOrigin=localMode?localOrigin:service?new URL(service.url).origin:null;
    ++activationCancelGeneration;stopAfterRedeem=true;
    if(wasLink&&serviceOrigin&&accountId){
      const scope={serviceOrigin,accountId};
      pausedScopesInMemory.add(serviceOrigin+'|'+accountId);
      void persistAutoPreparationPause(scope).catch(()=>{
        redeemNotice('已停止本次操作；取消状态未能持久核验，下次请手动确认。',true);
      });
    }
    if(busy){
      if(preflightAccountId&&!pending){
        code.value='';activationHintCode=null;activationHint.hidden=true;
        redeemNotice('已停止当前预检，尚未提交兑换。');
      }else redeemNotice(redeemPostStarted?
        '服务端请求已提交，不能撤销；已停止后续自动操作，请核对原事务结果。':
        '正在阻止尚未提交的兑换并核对原事务，请勿重复操作。');
      renderRedeem();return;
    }
    pending=null;code.value='';activationHintCode=null;activationHint.hidden=true;
    redeemNotice('已取消预检，未提交兑换；后续不自动重新预检。');
    renderRedeem();code.focus?.({preventScroll:true});
  }
  previewPanel.addEventListener('keydown',event=>{
    if(event?.isTrusted!==true||event.key!=='Escape'||!pending&&!preflightAccountId)return;
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
  const ACTIVATION_URLS=Object.freeze(service?[{origin:new URL(service.url).origin,path:service.activation.path,parameter:service.activation.parameter}]:[]);
  const ACTIVATION_KEY='aiVipActivationR140';
  let urlChecking=false;
  async function mayAutoPrepare(scope){
    if(pausedScopesInMemory.has(scope.serviceOrigin+'|'+scope.accountId))return false;
    try{
      const saved=await storeRequest('storage.get',{key:AUTO_PREPARATION_PAUSE_KEY,withEtag:true});
      return !isAutoPreparationPaused(readAutoPreparationPauses(saved.value),scope);
    }catch{return false;} // Unknown cancellation state cannot authorize auto-preparation.
  }
  async function persistAutoPreparationPause(scope){
    for(let attempt=0;attempt<3;attempt++){
      try{
        const before=await storeRequest('storage.get',{key:AUTO_PREPARATION_PAUSE_KEY,withEtag:true});
        const current=readAutoPreparationPauses(before.value);
        if(isAutoPreparationPaused(current,scope))return;
        const next=addAutoPreparationPause(current,scope);
        await storeRequest('storage.set',{key:AUTO_PREPARATION_PAUSE_KEY,value:next,ifMatch:before.etag});
        const after=await storeRequest('storage.get',{key:AUTO_PREPARATION_PAUSE_KEY,withEtag:true});
        if(isAutoPreparationPaused(readAutoPreparationPauses(after.value),scope))return;
      }catch(error){if(attempt===2)throw error;}
    }
    fail('E_ACTIVATION_PAUSE_UNKNOWN','取消状态未能持久确认');
  }
  function activationCodeFromPage(info){
    const rules=localMode&&developmentProfile?DEVELOPMENT_ACTIVATION_URLS:ACTIVATION_URLS;
    return activationCodeFromVerifiedPage(info,rules);
  }
  function activationPageMatches(info,value){
    return activationCodeFromPage(info)===value&&info.url===activationSource;
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
    if(activationFromLink||urlChecking||busy||cookieBusy||sharedBusy||pending||cookiePending||
      !memberVerifiedFresh||!endpoints||!recoveryReady||recovery||recoveryFault||
      !cookieReady||cookieFault||['unknown','partial'].includes(cookieRecord?.state)||
      snapshot?.account.state!=='bound')return;
    urlChecking=true;const revision=serviceRevision;
    try{
      const info=await storeRequest('currentPage.info');
      if(revision!==serviceRevision||!memberVerifiedFresh)return;
      const value=activationCodeFromPage(info); // exact Host-verified origin and route
      if(!value){
        if(activationHintCode){
          if(code.value===activationHintCode)code.value='';
          activationHintCode=null;activationHint.hidden=true;renderRedeem();
        }
        activationSeen=null;return;
      }
      if(value===activationSeen&&info.url===activationSource)return;
      // Confirmation stays bound to the exact reviewed landing URL, even when
      // another approved page carries the same code.
      activationSource=info.url;activationFromLink=false;
      activationSeen=value;activationHintCode=value;code.value=value;
      activationDetail.textContent='已批准来源的激活码 '+value.slice(0,3)+'****'+value.slice(-2)+
        ' 已带入；正在自动预检，确认后才会领取。';
      redeemNotice('已识别专属链接，正在核对领取内容；不会自动领取。');
      renderRedeem();
      const scope={accountId:snapshot.account.id,serviceOrigin:localMode?localOrigin:new URL(service.url).origin};
      if(!(await mayAutoPrepare(scope))){
        redeemNotice('此前已取消自动继续，或取消状态无法核验；可主动点击「查看激活内容」。');
        return;
      }
      // Double-check current Host source and recipient after async storage read.
      const fresh=await storeRequest('currentPage.info');
      if(disposed||revision!==serviceRevision||!memberVerifiedFresh||
        snapshot?.account.id!==scope.accountId||activationCodeFromPage(fresh)!==value||
        fresh.url!==activationSource||pending)return;
      await runActivation(value);
    }catch{/* No page permission never issues a voucher POST. */}
    finally{urlChecking=false;}
  }
  const shopSdk=window.OpenDeskSDK?.browser?.tabs;
  shopSection.hidden=!catalog;
  desktopSection.hidden=!desktopClient;
  function bindPromotion(button,status,url,name){
    // A visible but unconfigured promotion explains the release blocker;
    // it never tries to navigate to an invented or unreviewed destination.
    button.disabled=false;status.hidden=true;
    button.addEventListener('click',event=>{
      if(event?.isTrusted!==true||button.disabled)return;
      if(!url){
        status.hidden=false;
        status.textContent=name+'的外部网址尚未配置或未通过审核，无法打开。';
        return;
      }
      button.disabled=true;
      status.hidden=false;
      status.textContent='正在请求打开'+name+'…';
      let operation;
      try{
        if(typeof shopSdk?.create!=='function')throw Error('E_TABS_UNAVAILABLE');
        operation=shopSdk.create({url});
      }catch{
        status.textContent='未能打开'+name+'，请检查浏览器授权或稍后重试。';
        button.disabled=false;
        return;
      }
      Promise.resolve(operation).then(
        ()=>{status.textContent='浏览器已确认接收打开'+name+'的请求。';},
        ()=>{status.textContent='未能打开'+name+'，请检查浏览器授权或稍后重试。';}
      ).finally(()=>{button.disabled=false;});
    });
  }
  bindPromotion(shop,shopStatus,catalog,'商品目录');
  bindPromotion(desktopOpen,desktopStatus,desktopClient,'桌面客户端');
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
    const hasEntitlement=()=>Boolean(memberVerifiedFresh&&endpoints&&snapshot&&estimatedServerNow()!==null&&
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
    const needsNativePermission=()=>validState(current)&&current.state==='disabled'&&
      current.permission===false&&current.canStop===false&&
      current.control==='controllable_by_this_extension';
    localSwitchBlocked=()=>canStop()||stopping;
    const paint=()=>{
      const stop=canStop();
      const ready=!stop&&!starting&&!stopping&&!reading&&
        typeof sdk?.requestEnable==='function'&&safeEndpoint()&&hasEntitlement()&&
        (released(current)||needsNativePermission());
      const controlIssue=stopRequired||['conflict','unavailable'].includes(current?.state)||
        Boolean(notice&&stop);
      status.textContent=stopping?'正在停用':starting?'启用待确认':
        stopRequired||current?.reason==='E_STOP_PENDING'?'停用待确认':!sdk?'不可用':
        notice&&!current?'状态异常':!current?'检测中':
        current.state==='disabled'?(current.permission===false?'未授权':
          stopConfirmed&&released(current)?'已停止':'未启用'):
        ({enabled:'已启用',conflict:'控制权冲突',unavailable:'状态异常'})[current.state];
      toggle.setAttribute('data-action',stop?'stop':'start');
      toggle.classList.toggle('od-button--secondary',stop);
      toggle.textContent=stop?(stopping?'正在停用…':'停用代理'):'启用代理';
      toggle.hidden=!stop&&!ready;
      toggle.disabled=stop?(stopping||!sdk||typeof sdk.requestDisable!=='function'):
        (starting||stopping||reading||!ready);
      refreshProxy.hidden=!sdk&&!stop;
      refreshProxy.disabled=reading||starting||stopping||!sdk;
      proxySection.hidden=!stop&&!controlIssue&&!safeEndpoint();
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
      else if(needsNativePermission())detail.textContent='尚未授予浏览器代理权限；点击启用时由 Chrome 按需请求授权。';
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
      if(event?.isTrusted!==true)return;
      const restoreFocus=document.activeElement===refreshProxy;
      void update().finally(()=>{
        if(restoreFocus&&refreshProxy.isConnected&&!refreshProxy.disabled&&
          !refreshProxy.hidden&&document.hasFocus()&&document.activeElement===document.body)
          refreshProxy.focus({preventScroll:true});
      });
    });
    refreshDevelopmentAvailability=update;
    async function start(){
      if(starting||stopping||reading||canStop()||!safeEndpoint()||!hasEntitlement()||
        (!released(current)&&!needsNativePermission())||typeof sdk?.requestEnable!=='function')return;
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
  function renderConnection(){
    if(!connection)return;
    connection.hidden=localMode;
    connectionForm.hidden=!editingConnection&&serviceConnected;
    connectionChange.hidden=!serviceConnected||editingConnection;
    connectionChange.disabled=busy||cookieBusy||sharedBusy||connecting;
    connect.disabled=busy||cookieBusy||sharedBusy||connecting;
    serviceLink.disabled=connect.disabled;
    connect.textContent=connecting?'正在连接…':'连接并查看权益';
    connectionSummary.hidden=!serviceConnected;
    connectionSummary.textContent=serviceConnected?service.label+' · '+new URL(service.url).host:'';
    connectionStatus.textContent=connectionNotice||(serviceConnected?
      memberVerifiedFresh?'服务身份与权益已核验。':'连接已选择，当前权益尚未核验；请刷新重试。':
      service?'粘贴服务方提供的链接。激活前会先供你核对。':
        '当前安装包尚未接入正式服务。请向服务提供方索取支持的链接，不能用网站地址代替。');
    memberCard.hidden=!endpoints;
    if(usageCard)usageCard.hidden=!endpoints&&!cookieFault&&!journalLocked()&&!recovery&&!recoveryFault;
  }
  async function readServiceChoice(){
    const result=await storeRequest('storage.get',{key:SERVICE_KEY,withEtag:true});
    if(result?.preview===true||typeof result?.etag!=='string'||!/^[a-f0-9]{64}$/.test(result.etag))
      fail('E_SERVICE_STORAGE','服务连接记录无法核对');
    if(result.value!==null&&(!exactKeys(result.value,['schemaVersion','serviceId','url'])||
      result.value.schemaVersion!==1||!safeString(result.value.serviceId,80)||!safeString(result.value.url,2048)))
      fail('E_SERVICE_STORAGE','服务连接记录无效');
    return result;
  }
  async function connectService(event){
    if(event?.isTrusted!==true||connect.disabled)return;
    connecting=true;connectionNotice='正在核对服务链接…';renderConnection();
    try{
      const parsed=parseServiceLink(serviceLink.value,service);
      if(cookieBusy||sharedBusy||busy||pending||cookiePending||localMode||localSwitchBlocked()||
        (recovery&&!recoveryMatchesService()))fail('E_SERVICE_PENDING','上次操作尚未核对，请保留原服务');
      const before=await readServiceChoice();
      const value={schemaVersion:1,serviceId:service.id,url:service.url};
      try{await storeRequest('storage.set',{key:SERVICE_KEY,value,ifMatch:before.etag});}catch{}
      const after=await readServiceChoice();
      if(JSON.stringify(after.value)!==JSON.stringify(value))fail('E_SERVICE_STORAGE','服务连接未能保存');
      serviceConnected=true;endpoints=productionEndpoints;editingConnection=false;connectionNotice='';
      serviceLink.value=''; // Never retain an activation link in storage or the input.
      await refreshMember();
      if(parsed.code){
        activationHintCode=parsed.code;activationFromLink=true;activationSource=null;
        code.value=parsed.code;
        activationDetail.textContent='链接中的激活码已带入。先查看激活内容，再由你确认；尚未领取。';
        redeemNotice('专属链接已识别，请查看并核对激活内容。');
        if(memberVerifiedFresh&&snapshot?.account.state==='bound')await runActivation(parsed.code);
      }
    }catch(error){
      connectionNotice=({E_SERVICE_NOT_CONFIGURED:'当前安装包尚未接入正式服务；请联系服务提供方提供接入配置。',
        E_SERVICE_UNSUPPORTED:'此链接不属于已接入的服务。请使用服务方提供的连接链接或专属激活链接。',
        E_SERVICE_LINK:'链接格式无效。请粘贴完整的 HTTPS 服务链接，不要填写目标网站或登录数据。',
        E_SERVICE_PENDING:'上次操作尚待核对，已保留原服务与记录。',
        E_SERVICE_STORAGE:'服务连接无法保存，未开始兑换或网站登录。'})[error?.code]||'服务尚未连接，请核对链接和存储授权后重试。';
    }finally{connecting=false;renderRedeem();}
  }
  connect?.addEventListener('click',event=>{void connectService(event);});
  serviceLink?.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.isComposing){event.preventDefault?.();void connectService(event);}
  });
  connectionChange?.addEventListener('click',event=>{
    if(event.isTrusted!==true||connectionChange.disabled)return;
    editingConnection=true;renderConnection();serviceLink.focus?.();
  });
  async function restoreServiceChoice(){
    if(!service)return;
    try{
      const {value}=await readServiceChoice();
      if(disposed||!value)return;
      if(value.serviceId!==service.id||value.url!==service.url){
        connectionNotice='保存的服务与当前接入配置不同，请重新核对链接；原恢复记录保留。';renderConnection();return;
      }
      serviceConnected=true;editingConnection=false;
      if(!localMode){endpoints=productionEndpoints;await refreshMember();}
    }catch{connectionNotice='保存的服务无法核对，请重新连接；原记录保留。';renderConnection();}
  }
  function renderBusinessConfiguration(){
    renderConnection();
    if(!endpoints){
    memberCard.setAttribute('data-view','unconfigured');
    memberState.textContent='服务未配置';
    memberState.setAttribute('data-tone','neutral');
    accountName.textContent='会员信息暂不可用';
    accountName.hidden=false;
    productName.textContent='正式会员服务尚未接入';productName.hidden=false;
    memberEmpty.hidden=false;
    memberEmptyText.textContent='这并不表示会员未激活或已到期。服务接入后才能查询真实状态。';
    focusRedeem.hidden=true;memberFacts.hidden=true;verified.hidden=true;
    secondaryMetrics.hidden=true;historyDetails.hidden=true;
    redeemNotice('会员服务尚未接入，当前无法预检或兑换。');
    refresh.hidden=true;refresh.disabled=true;
    }else{
    refresh.hidden=false;
    refresh.disabled=false;
    void refreshMember();
    }
    renderRedeem();
  }
  websiteController=createWebsiteController({byId,network:businessSdk,tabs:window.OpenDeskSDK?.browser?.tabs,
    storeRequest,cookies:window.OpenDeskSDK?.browser?.cookies,getRestoredTarget:()=>!cookieReady?undefined:cookieJournal?.schemaVersion===2?
      cookieJournal.attempts.filter(row=>row.state==='success').map(row=>JSON.parse(row.scopeKey)[6]).at(-1):null,
    getPending:()=>cookiePending,setPending:value=>{cookiePending=value;if(!value){serverSession=null;sharedNotice='';}
      if(value&&cookieFaultRecoverable){cookieFault='';cookieFaultRecoverable=false;}},
    validateDelivery:validateCookieDelivery,commercialReceive:useWebsite,
    commercialTarget:()=>assignedShared()?.targetUrl||null,onChange:renderRedeem,
    blocked:()=>cookieBusy||busy||sharedBusy||journalLocked()||Boolean(cookieFault&&!cookieFaultRecoverable)});
  // Recover independently of Provider configuration; never silently drop a journal.
  void loadRecovery();
  void loadCookieRecord();
  renderBusinessConfiguration();
  void restoreServiceChoice();
  setupManagedProxy();
  // Only the open installed app observes its current target; no background sandbox.
  const activationTimer=typeof window.setInterval==='function'?
    window.setInterval(()=>{
      if(!cookieBusy){
        websiteController?.tick();
        if(serverSession&&!cookieBusy&&(estimatedServerNow()===null||estimatedServerNow()>=serverSession.expiresAt)){
          const remaining=serverSession.batches.slice(serverSession.index).reduce((n,batch)=>n+batch.cookies.length,0);
          cookiePending=null;serverSession=null;
          sharedNotice='交付已到期，剩余 '+remaining+' 项未提交；请重新准备登录。';renderRedeem();
        }
        if(cookiePending&&!['ordinary','local-file'].includes(cookiePending.kind)&&
          (estimatedServerNow()===null||cookiePending.expiresAt<=estimatedServerNow())){
          cookiePending=null;sharedNotice='会话交付已过期，请重新获取。';renderRedeem();
        }
      }
      void checkActivationPage();
    },1200):null;
  renderRedeem();
  release=()=>{
    disposed=true;++activationCancelGeneration;stopAfterRedeem=true;
    websiteController?.dispose();
    localConnect?.removeEventListener?.('click',connectLocalDevelopment);
    developmentControls?.dispose();
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
