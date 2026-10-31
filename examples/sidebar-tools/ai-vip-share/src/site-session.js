// Fixed, source-reviewed website adapters. Secrets stay in this controller's memory.
import * as Session from './session-context.js';
const ORIGINS=['http://localhost:7901','http://127.0.0.1:7902'];
const NAMES=['ordinary_fixture_session','ordinary_fixture_context'];
export const ORDINARY_SITES=Object.freeze(ORIGINS.map((origin,index)=>{
  const host=new URL(origin).hostname;
  return Object.freeze({key:'ordinary-'+index,...Session.validateDeclarations({
    siteId:'ordinary-workspace',label:'普通工作台 '+(index+1),targetUrl:origin+'/session/',
    sourceIds:['ordinary-controlled-source'],policyVersion:'1',verification:'controlled-target-page',
    cookieSlots:NAMES.map(name=>({name,domain:host,hostOnly:true,path:'/session/',storeId:null,
      partitionKey:'unresolved',secure:false,httpOnly:true,sameSite:'lax'}))},
  {sourceId:'ordinary-controlled-source',serviceOrigin:origin,serviceRevision:'1',policy:'ordinary',
    endpoints:{authorization:origin+'/api/authorization',session:origin+'/api/session'},
    operationKinds:['setCookies'],maxAuthorizationMs:3600000,maxDeliveryMs:120000})});
}));
export function createWebsiteController({byId,network,tabs,getPending,setPending,validateDelivery,
  commercialReceive,commercialTarget,onChange,blocked,storeRequest,getRestoredTarget}){
  const select=byId('ai-vip-site-select'),summary=byId('ai-vip-site-source'),account=byId('ai-vip-site-account');
  const section=byId('ai-vip-sites-section'),options=byId('ai-vip-site-options');
  const status=byId('ai-vip-site-status'),open=byId('ai-vip-site-open'),receive=byId('ai-vip-site-receive');
  const cancel=byId('ai-vip-site-cancel'),authPanel=byId('ai-vip-source-auth');
  const credentialInput=byId('ai-vip-source-credential'),clear=byId('ai-vip-source-clear');
  const accountRow=byId('ai-vip-site-account-row');
  const clocks=Session.createSourceClocks();
  let available=false,profileAvailable=false,disposed=false,generation=0,loading=false,notice='',masked='',optionsKey=null;
  let siteButtons=[];
  let testsRequested=false;
  // Display preference only: no credential, grant, delivery or browser authority.
  const preferenceKey='aiVipSiteSelectionR1';
  const validChoice=value=>value===''||value==='commercial'||ORDINARY_SITES.some(row=>row.key===value);
  let choiceVersion=0,restored=false,restoreBlocked=false,storedChoice=null,etag=null;
  let preferenceReady=false,saveRunning=false,queuedChoice=null,storageFailed=false;
  async function readPreference(){
    const result=await storeRequest('storage.get',{key:preferenceKey,withEtag:true});
    const value=result?.value;
    if(result?.preview===true||typeof result?.etag!=='string'||!/^[a-f0-9]{64}$/.test(result.etag)||
      (value!==null&&(!value||typeof value!=='object'||Array.isArray(value)||
        Object.keys(value).sort().join(',')!=='schemaVersion,selection'||value.schemaVersion!==1||
        !validChoice(value.selection))))throw Error('Invalid site preference');
    return result;
  }
  function storageFailure(){
    storageFailed=true;queuedChoice=null;
  }
  const preferenceLoad=(async()=>{
    try{
      const result=await readPreference();
      if(disposed)return;
      storedChoice=result.value?.selection??null;etag=result.etag;
    }catch{if(!disposed)storageFailure();}
    finally{preferenceReady=true;if(!disposed)onChange();}
  })();
  async function saveChoice(){
    if(saveRunning)return;
    saveRunning=true;
    try{
      await preferenceLoad;
      // Coalesce changes while waiting; cap writes rather than retrying conflicts.
      for(let writes=0;queuedChoice&&!disposed&&!storageFailed;writes++){
        if(writes===4){storageFailure();break;}
        const choice=queuedChoice;queuedChoice=null;
        const value={schemaVersion:1,selection:choice.value};
        try{
          await storeRequest('storage.set',{key:preferenceKey,value,ifMatch:etag});
          const after=await readPreference();
          if(disposed)return;
          if(after.value?.selection!==choice.value)throw Error('Site preference changed');
          etag=after.etag;storedChoice=choice.value;
        }catch{if(!disposed)storageFailure();}
      }
    }finally{saveRunning=false;if(!disposed)onChange();}
  }
  const current=()=>ORDINARY_SITES.find(row=>row.key===select?.value);
  const assertActive=(context,epoch)=>{
    if(disposed||!available||generation!==epoch||current()!==context)throw Error('Selection changed');
  };
  function invalidate(){
    ++generation;loading=false;masked='';notice='';
    if(credentialInput)credentialInput.value='';
    setPending(null);onChange();
  }
  async function request(context,epoch,credential,method,url,data){
    assertActive(context,epoch);
    if(!Object.values(context.source.endpoints).includes(url))throw Error('Unapproved endpoint');
    const ticket=clocks.begin(context.source);
    const response=await network.request({method,url,...(data?{data}:{}),config:{timeout:10000,
      responseType:'json',headers:{'X-OpenDesk-Local-Test':'1','X-Ordinary-Session-Credential':credential}}});
    assertActive(context,epoch);
    if(!response||!Number.isInteger(response.status)||response.status<200||response.status>=300||
      !response.data||typeof response.data!=='object'||Array.isArray(response.data))throw Error('Source refused');
    const now=clocks.sample(context.source,ticket,response.data.serverNow);
    return {data:response.data,now};
  }
  async function authorization(context,epoch,credential){
    const response=await request(context,epoch,credential,'GET',context.source.endpoints.authorization);
    return {auth:Session.validateAuthorization(context,response.data.authorization,response.now),now:response.now};
  }
  async function acquire(){
    const context=current();if(!context||loading||blocked())return;
    const credential=credentialInput?.value;
    if(typeof credential!=='string'||!/^Bearer [A-Za-z0-9_-]{1,200}$/.test(credential)){
      notice='请输入此来源为你签发的有效凭据。';onChange();return;
    }
    const epoch=++generation;loading=true;notice='正在核对来源授权…';masked='';
    credentialInput.value='';setPending(null);onChange();
    try{
      const {auth}=await authorization(context,epoch,credential),requestId=crypto.randomUUID();
      const response=await request(context,epoch,credential,'POST',context.source.endpoints.session,
        {requestId,subjectId:auth.subjectId,authorizationRevision:auth.authorizationRevision,
          targetUrl:context.site.targetUrl,operationKind:'setCookies'});
      const currentAuth=Session.validateAuthorization(context,response.data.authorization,response.now);
      const scopeKey=Session.createScopeKey(context,auth,'setCookies',response.now);
      if(scopeKey!==Session.createScopeKey(context,currentAuth,'setCookies',response.now))throw Error('Authorization changed');
      const metadata=Session.validateSessionResponse(context,currentAuth,response.data.metadata,
        {requestId,operationKind:'setCookies',now:response.now});
      const delivery=validateDelivery(response.data.cookieDelivery,response.now,context.site.targetUrl);
      if(delivery.deliveryId!==metadata.deliveryId||delivery.expiresAt!==metadata.expiresAt||
        delivery.payload.cookies.length!==context.site.cookieSlots.length)throw Error('Delivery mismatch');
      for(const slot of context.site.cookieSlots){
        const row=delivery.payload.cookies.find(row=>row.name===slot.name&&row.path===slot.path);
        if(!row||row.domain!==undefined||row.secure!==slot.secure||row.httpOnly!==slot.httpOnly||
          row.sameSite!==slot.sameSite)throw Error('Cookie policy mismatch');
      }
      assertActive(context,epoch);
      // Display only a fixed masked identity; source-supplied strings never become UI authority.
      if(response.data.displayNameMasked!=='o***@fixture.test')throw Error('Masked identity mismatch');
      masked=response.data.displayNameMasked;
      setPending({...delivery,kind:'ordinary',context,authorization:currentAuth,metadata,scopeKey,
        requestId,policyVersion:context.site.policyVersion,epoch,credential,
        slots:context.site.cookieSlots.map(({name,domain,hostOnly,path,storeId,partitionKey})=>
          ({name,domain,hostOnly,path,storeId,partitionKey}))});
      notice='已取得有效会话，请确认设置并在目标页核对。';
    }catch{
      if(generation===epoch){setPending(null);masked='';notice='来源授权或交付无效，未设置 Cookie。请重新取得有效凭据。';}
    }finally{if(generation===epoch){loading=false;onChange();}}
  }
  function chooseSite(event,key){
    if(event.isTrusted!==true||disposed||select.disabled)return;
    ++choiceVersion;restored=true;
    const value=select.value===key?'':key;
    select.value=validChoice(value)&&!(!available&&value.startsWith('ordinary-'))&&
      !(value==='commercial'&&!commercialTarget())?value:'';
    invalidate();
    queuedChoice={value:select.value};void saveChoice();
  }
  clear?.addEventListener('click',event=>{if(event.isTrusted===true)invalidate();});
  credentialInput?.addEventListener('input',()=>{if(clear)clear.hidden=!credentialInput.value;});
  cancel?.addEventListener('click',event=>{
    if(event.isTrusted!==true)return;
    invalidate();receive?.focus({preventScroll:true});
  });
  open?.addEventListener('click',event=>{
    if(event.isTrusted!==true||open.disabled)return;
    const url=current()?.site.targetUrl||(select.value==='commercial'?commercialTarget():null);
    if(url)void tabs.create({url}).catch(()=>{notice='未能打开目标网页，请稍后重试。';onChange();});
  });
  receive?.addEventListener('click',event=>{
    if(event.isTrusted!==true||receive.disabled)return;
    if(current())void acquire();else if(select.value==='commercial')void commercialReceive();
  });
  return {
    enableTests(){testsRequested=true;onChange();if(section)section.open=true;},
    current, get busy(){return loading;},
    isOrdinarySelected:()=>Boolean(current()),
    async validate(delivery,{refresh=false}={}){
      assertActive(delivery.context,delivery.epoch);
      let now=clocks.now(delivery.context.source);
      if(refresh){
        const fresh=await authorization(delivery.context,delivery.epoch,delivery.credential);
        now=fresh.now;
        if(Session.createScopeKey(delivery.context,fresh.auth,'setCookies',now)!==delivery.scopeKey)
          throw Error('Authorization revoked or changed');
      }
      if(now===null||now>=delivery.expiresAt)throw Error('Delivery expired');
      Session.validateSessionResponse(delivery.context,delivery.authorization,delivery.metadata,
        {requestId:delivery.requestId,operationKind:'setCookies',now});
      return now;
    },
    completed(delivery,{success=false}={}){
      if(getPending()===delivery)setPending(null);
      // Remove the last credential reference even while a receipt is settling.
      delivery.credential='';
      if(generation===delivery.epoch){masked='';notice=success?'已设置，请在目标页核对实际登录状态。':'会话未完整设置，请核对下方结果。';}
    },
    clear:invalidate,
    tick(){
      const delivery=getPending();
      if(delivery?.kind==='ordinary'&&!loading&&clocks.now(delivery.context.source)>=delivery.expiresAt){
        delivery.credential='';invalidate();notice='会话交付已过期，请重新获取。';onChange();
      }
    },
    render({development,locked,busy:controllerBusy,commercialLabel,commercialNotice}){
      if(!select)return;
      const restoredTarget=getRestoredTarget?.();
      const requested=testsRequested||storedChoice?.startsWith('ordinary-')||
        ORDINARY_SITES.some(row=>row.site.targetUrl===restoredTarget);
      const lost=profileAvailable&&!development;profileAvailable=Boolean(development);
      available=Boolean(development&&requested);
      if(lost){restoreBlocked=true;invalidate();}
      const rows=[...(available?ORDINARY_SITES:[]),...(commercialTarget()?[{key:'commercial',site:{label:commercialLabel||'会员网站'}}]:[])];
      if(section)section.hidden=rows.length===0;
      const key=rows.map(row=>row.key+'|'+row.site.label).join(',');
      if(key!==optionsKey){
        optionsKey=key;const old=select.value;
        siteButtons=rows.map(row=>{
          const button=document.createElement('button');
          button.type='button';button.value=row.key;button.textContent=row.site.label;
          button.className='od-button od-button--secondary';
          button.addEventListener('click',event=>chooseSite(event,row.key));
          return button;
        });
        options?.replaceChildren(...siteButtons);
        select.value=rows.some(row=>row.key===old)?old:'';
        // Selecting the sole reviewed target is display-only. No network or
        // website action occurs until the user presses a stage action.
        if(rows.length===1&&!select.value)select.value=rows[0].key;
      }
      if(options)options.hidden=rows.length<2;
      if(!restored&&!restoreBlocked&&!choiceVersion&&preferenceReady&&available){
        const target=getRestoredTarget?.();
        // undefined means the independent journal read has not settled yet.
        if(storedChoice!==null||target!==undefined){
          const choice=storedChoice??ORDINARY_SITES.find(row=>row.site.targetUrl===target)?.key??'';
          const present=rows.some(row=>row.key===choice);
          // A commercial directory is verified asynchronously. Wait for it
          // without treating the saved preference as authority or replacing a
          // newer explicit selection.
          if(choice!=='commercial'||present){
            select.value=present?choice:'';
            restored=true;
          }
        }
      }
      const context=current(),commercial=select.value==='commercial'&&commercialTarget();
      select.disabled=Boolean(controllerBusy)||rows.length===0;open.disabled=!context&&!commercial;
      for(const button of siteButtons){
        const selected=button.value===select.value;
        button.disabled=select.disabled;
        button.className='od-button od-button--'+(selected?'primary':'secondary');
        button.setAttribute('aria-pressed',String(selected));
        button.title=selected?'再次点击取消选择':'';
      }
      receive.disabled=Boolean(locked||controllerBusy||loading||(!context&&!commercial));
      const pending=Boolean(getPending());
      authPanel.hidden=!context||pending;
      if(clear)clear.hidden=!credentialInput?.value;
      receive.hidden=pending;
      receive.textContent=loading?'正在准备…':'准备登录';
      cancel.hidden=!pending&&!loading;
      if(accountRow)accountRow.hidden=!pending;
      clear.disabled=Boolean(controllerBusy);cancel.disabled=Boolean(controllerBusy);
      summary.textContent=context?context.site.label+' · '+new URL(context.site.targetUrl).host:
        commercial?(commercialLabel||'会员网站')+' · '+new URL(commercial).host:
          rows.length?'选择网站':'暂无可用网站';
      account.textContent=masked||(commercial?(commercialLabel||'服务器当前分配的账号'):'尚未取得会话');
      status.textContent=locked?'恢复记录仍需核对，已停止取得及写入新会话；仍可打开网站。':pending?'':notice||
        (commercial&&commercialNotice?commercialNotice:
        (storageFailed?'网站选择未能保存；仍可手动选择，重新打开后请核对。':
          context?'填写网站服务签发的登录凭据后，点击「准备登录」。':
            commercial?'准备登录后核对账号，再由浏览器确认。':rows.length?'请选择要登录的网站。':''));
      status.hidden=!status.textContent;
    },
    dispose(){disposed=true;++generation;loading=false;if(credentialInput)credentialInput.value='';setPending(null);}
  };
}
