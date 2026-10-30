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
  commercialReceive,commercialTarget,onChange,blocked}){
  const select=byId('ai-vip-site-select'),summary=byId('ai-vip-site-source'),account=byId('ai-vip-site-account');
  const status=byId('ai-vip-site-status'),open=byId('ai-vip-site-open'),receive=byId('ai-vip-site-receive');
  const cancel=byId('ai-vip-site-cancel'),authPanel=byId('ai-vip-source-auth');
  const credentialInput=byId('ai-vip-source-credential'),clear=byId('ai-vip-source-clear');
  const clocks=Session.createSourceClocks();
  let available=false,disposed=false,generation=0,loading=false,notice='',masked='',optionsKey='';
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
  select?.addEventListener('change',event=>{if(event.isTrusted===true)invalidate();});
  clear?.addEventListener('click',event=>{if(event.isTrusted===true)invalidate();});
  cancel?.addEventListener('click',event=>{if(event.isTrusted===true)invalidate();});
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
    render({development,locked,busy:controllerBusy,commercialLabel}){
      if(!select)return;
      const lost=available&&!development;available=Boolean(development);
      if(lost)invalidate();
      const rows=[...(available?ORDINARY_SITES:[]),...(commercialTarget()?[{key:'commercial',site:{label:commercialLabel||'会员网站'}}]:[])];
      const key=rows.map(row=>row.key+'|'+row.site.label).join(',');
      if(key!==optionsKey){
        optionsKey=key;const old=select.value;
        select.replaceChildren();
        for(const row of [{key:'',site:{label:'请选择网站'}},...rows]){
          const option=document.createElement('option');option.value=row.key;option.textContent=row.site.label;select.append(option);
        }
        select.value=rows.some(row=>row.key===old)?old:'';
      }
      const context=current(),commercial=select.value==='commercial'&&commercialTarget();
      select.disabled=Boolean(controllerBusy);open.disabled=!context&&!commercial;
      receive.disabled=Boolean(locked||controllerBusy||loading||(!context&&!commercial));
      authPanel.hidden=!context;cancel.hidden=!getPending()&&!loading;
      clear.disabled=Boolean(controllerBusy);cancel.disabled=Boolean(controllerBusy);
      summary.textContent=context?'来源：'+context.source.serviceOrigin+' · 网站：'+new URL(context.site.targetUrl).host:
        commercial?'来源：已核验的会员服务 · 网站：'+new URL(commercial).host:'选择已配置的网站及其会话来源。';
      account.textContent=masked?'账号：'+masked:commercial?'使用服务器当前分配的账号':'尚未取得会话';
      status.textContent=locked?'恢复记录仍需核对，已停止取得及写入新会话；仍可打开网站。':notice||
        (context?'普通网站直接使用来源授权，无需会员、额度或代理。':'');
    },
    dispose(){disposed=true;++generation;loading=false;if(credentialInput)credentialInput.value='';setPending(null);}
  };
}
