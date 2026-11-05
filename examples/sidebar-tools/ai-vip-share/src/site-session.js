// Fixed, source-reviewed website adapters. Secrets stay in this controller's memory.
import * as Session from './session-context.js';
import {LOCAL_CHATGPT,preflightCookieFile} from './local-cookie-file.js';
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
  commercialReceive,commercialTarget,onChange,blocked,storeRequest,getRestoredTarget,cookies}){
  const select=byId('ai-vip-site-select'),summary=byId('ai-vip-site-source'),account=byId('ai-vip-site-account');
  const section=byId('ai-vip-sites-section'),options=byId('ai-vip-site-options');
  const status=byId('ai-vip-site-status'),open=byId('ai-vip-site-open'),receive=byId('ai-vip-site-receive');
  const cancel=byId('ai-vip-site-cancel'),authPanel=byId('ai-vip-source-auth');
  const credentialInput=byId('ai-vip-source-credential'),clear=byId('ai-vip-source-clear');
  const accountRow=byId('ai-vip-site-account-row');
  const fileInput=byId('ai-vip-cookie-file'),fileHelp=byId('ai-vip-file-help');
  const fileSteps=byId('ai-vip-file-steps'),fileSummary=byId('ai-vip-file-summary');
  const isLocal=context=>context?.key===LOCAL_CHATGPT.key;
  let localBatches=[],localIndex=0,localDeadline=0,localStore=null,localPartition=null;
  let localSummary='',fileError=false;
  const clocks=Session.createSourceClocks();
  let available=false,profileAvailable=false,disposed=false,generation=0,loading=false,notice='',masked='',optionsKey=null;
  let siteButtons=[];
  let testsRequested=false;
  // Display preference only: no credential, grant, delivery or browser authority.
  const preferenceKey='aiVipSiteSelectionR1';
  const validChoice=value=>value===''||value==='commercial'||value===LOCAL_CHATGPT.key||ORDINARY_SITES.some(row=>row.key===value);
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
  const current=()=>[LOCAL_CHATGPT,...ORDINARY_SITES].find(row=>row.key===select?.value);
  const assertActive=(context,epoch)=>{
    if(disposed||(!isLocal(context)&&!available)||generation!==epoch||current()!==context)throw Error('Selection changed');
  };
  function invalidate(){
    ++generation;loading=false;masked='';notice='';
    localSummary='';fileError=false;
    localBatches=[];localIndex=0;localDeadline=0;localStore=null;localPartition=null;
    if(fileInput)fileInput.value='';
    if(credentialInput)credentialInput.value='';
    setPending(null);onChange();
  }
  function stageLocalBatch(epoch){
    const payload=localBatches[localIndex];
    const requestId=crypto.randomUUID();
    setPending({kind:'local-file',context:LOCAL_CHATGPT,epoch,payload,
      targetUrl:LOCAL_CHATGPT.site.targetUrl,expiresAt:localDeadline,requestId,
      deliveryId:requestId,policyVersion:LOCAL_CHATGPT.site.policyVersion,
      scopeKey:JSON.stringify(['user-local-file','https://chatgpt.com','chatgpt','user-selected-file',
        'local-file-v1','setCookies',LOCAL_CHATGPT.site.targetUrl,['ordinary','no-assignment']]),
      slots:payload.cookies.map(row=>({name:row.name,domain:'chatgpt.com',hostOnly:row.domain===undefined,
        path:row.path,storeId:localStore,partitionKey:row.partitionKey??null}))});
    masked='本地文件 · 账号尚未核验';
    notice='第 '+(localIndex+1)+' / '+localBatches.length+' 批，'+payload.cookies.length+
      ' 项。每批单独确认；设置可能替换当前登录。';
  }
  async function importLocalFile(event){
    if(event.isTrusted!==true||!isLocal(current())||loading||blocked())return;
    const file=fileInput?.files?.[0];
    if(!file)return; // Cancelling the native chooser has no effects.
    const epoch=++generation;loading=true;setPending(null);localBatches=[];masked='';
    localSummary='';fileError=false;
    notice='正在本机预检文件…';onChange();
    try{
      if(file.size>65536)throw Error('文件超过 64 KiB，未提交 Cookie。');
      const checked=preflightCookieFile(await file.text());
      assertActive(LOCAL_CHATGPT,epoch);
      localSummary='文件共 '+checked.totalCount+' 项 · 保留 '+checked.count+' 项 · 已跳过 '+
        checked.skippedCount+' 项过期 Cookie。';
      if(!checked.count){
        fileError=true;notice='没有可用 Cookie，未准备任何写入批次。可重新选择其他文件；原文件保持不变。';
        return;
      }
      // These are public authorized context queries, never Cookie value reads.
      const actual=await cookies.getCurrentStore({url:LOCAL_CHATGPT.site.targetUrl});
      assertActive(LOCAL_CHATGPT,epoch);
      if(typeof actual?.storeId!=='string')throw Error('无法核对当前浏览器存储，未提交 Cookie。');
      const partitioned=checked.contexts.some(row=>row.partitionKey);
      const partition=partitioned?await cookies.getPartitionKey({url:LOCAL_CHATGPT.site.targetUrl}):null;
      assertActive(LOCAL_CHATGPT,epoch);
      for(const row of checked.contexts){
        if(row.storeId!==undefined&&row.storeId!==actual.storeId)
          throw Error('文件的 Cookie Store 与当前浏览器不符，未提交 Cookie。');
        if(row.partitionKey&&(row.partitionKey.topLevelSite!==partition?.partitionKey?.topLevelSite||
          row.partitionKey.hasCrossSiteAncestor!==partition?.partitionKey?.hasCrossSiteAncestor))
          throw Error('文件分区与当前网站不符，请先打开 ChatGPT 并核对网站授权。');
      }
      localStore=actual.storeId;localPartition=partition?.partitionKey??null;
      localDeadline=Math.floor(Math.min(Date.now()+120000,checked.earliestExpiry??Infinity));
      localBatches=checked.batches;localIndex=0;
      localSummary+=' '+checked.batches.length+' 批分别确认。准备有效期最多 2 分钟。';
      stageLocalBatch(epoch);
    }catch(error){
      if(generation===epoch){localBatches=[];setPending(null);masked='';
        // Keep non-secret file counts when browser authorization/context fails;
        // no batch is prepared, and the error below remains authoritative.
        fileError=true;
        notice=error?.code==='E_COOKIE_FILE'?error.message:
          ['E_SITE_GRANT_REQUIRED','E_CHROME_PERMISSION_REQUIRED'].includes(error?.code)?
            '请先在工具设置中授予 ChatGPT 网站 Cookie 读取及写入权限，再重新选择文件。':
          error?.message?.startsWith('文件')||error?.message?.startsWith('无法核对')?error.message:
            '文件预检或浏览器上下文核对失败，未提交 Cookie。请打开 ChatGPT 并核对授权。';}
    }finally{if(fileInput)fileInput.value='';if(generation===epoch){loading=false;onChange();}}
  }
  fileInput?.addEventListener('change',importLocalFile);
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
    if(isLocal(current()))fileInput?.click();
    else if(current())void acquire();else if(select.value==='commercial')void commercialReceive();
  });
  return {
    enableTests(){testsRequested=true;onChange();if(section)section.open=true;},
    current, get busy(){return loading;},
    isOrdinarySelected:()=>Boolean(current()),
    async validate(delivery,{refresh=false}={}){
      assertActive(delivery.context,delivery.epoch);
      if(delivery.kind==='local-file'){
        if(getPending()!==delivery||localBatches[localIndex]!==delivery.payload||
          Date.now()>=localDeadline||delivery.payload.cookies.some(row=>
            row.expirationDate!==undefined&&row.expirationDate*1000<=Date.now()))throw Error('File expired');
        if(refresh){
          const actual=await cookies.getCurrentStore({url:delivery.targetUrl});
          assertActive(delivery.context,delivery.epoch);
          if(actual?.storeId!==localStore)throw Error('Store changed');
          if(delivery.payload.cookies.some(row=>row.partitionKey)){
            const actualPartition=await cookies.getPartitionKey({url:delivery.targetUrl});
            assertActive(delivery.context,delivery.epoch);
            if(actualPartition?.partitionKey?.topLevelSite!==localPartition?.topLevelSite||
              actualPartition?.partitionKey?.hasCrossSiteAncestor!==localPartition?.hasCrossSiteAncestor)
              throw Error('Partition changed');
          }
        }
        if(Date.now()>=localDeadline)throw Error('File expired');
        return Date.now();
      }
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
      if(delivery.kind==='local-file'){
        // Erase the submitted batch immediately. Remaining batches require another explicit click.
        const remaining=localBatches.slice(localIndex+1).reduce((count,batch)=>count+batch.cookies.length,0);
        const active=!disposed&&generation===delivery.epoch;
        delivery.payload.cookies=[];
        if(success&&active&&remaining>0&&Date.now()<localDeadline){
          ++localIndex;
          stageLocalBatch(delivery.epoch);
        }else{
          localBatches=[];masked='';localSummary='';
          notice=!success?'本批未完整设置，后续批次已丢弃。请核对结果，不会自动重试。':
            remaining>0?'本批已写入并核验；准备已到期，剩余 '+remaining+' 项未提交。请重新选择文件，不会自动重试。':
              '本次保留的各批 Cookie 已写入并核验，请在目标页核对实际登录状态。';
        }
        return {complete:success&&active&&remaining===0};
      }
      // Remove the last credential reference even while a receipt is settling.
      delivery.credential='';
      if(generation===delivery.epoch){masked='';notice=success?'已设置，请在目标页核对实际登录状态。':'会话未完整设置，请核对下方结果。';}
    },
    clear:invalidate,
    tick(){
      const delivery=getPending();
      if(delivery&&!loading&&(delivery.kind==='local-file'?Date.now()>=localDeadline:
        delivery.kind==='ordinary'&&clocks.now(delivery.context.source)>=delivery.expiresAt)){
        const remaining=delivery.kind==='local-file'?
          localBatches.slice(localIndex).reduce((count,batch)=>count+batch.cookies.length,0):0;
        delivery.credential='';invalidate();
        notice=remaining>0?'准备已到期，剩余 '+remaining+' 项未提交。请重新选择文件，不会自动重试。':
          '会话交付已过期，请重新获取。';onChange();
      }
    },
    render({development,locked,busy:controllerBusy,commercialLabel,commercialNotice}){
      if(!select)return;
      const restoredTarget=getRestoredTarget?.();
      const requested=testsRequested||storedChoice?.startsWith('ordinary-')||
        ORDINARY_SITES.some(row=>row.site.targetUrl===restoredTarget);
      const lost=profileAvailable&&!development;profileAvailable=Boolean(development);
      available=Boolean(development&&requested);
      if(lost&&!isLocal(current())){restoreBlocked=true;invalidate();}
      const rows=[LOCAL_CHATGPT,...(available?ORDINARY_SITES:[]),...(commercialTarget()?[{key:'commercial',site:{label:commercialLabel||'会员网站'}}]:[])];
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
      if(!restored&&!restoreBlocked&&!choiceVersion&&preferenceReady){
        const target=getRestoredTarget?.();
        // undefined means the independent journal read has not settled yet.
        if(storedChoice!==null||target!==undefined){
          const choice=storedChoice??[LOCAL_CHATGPT,...ORDINARY_SITES].find(row=>row.site.targetUrl===target)?.key??LOCAL_CHATGPT.key;
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
      authPanel.hidden=!context||isLocal(context)||pending;
      if(fileHelp)fileHelp.hidden=!isLocal(context);
      if(fileSteps)fileSteps.hidden=!isLocal(context);
      if(fileSummary){fileSummary.textContent=localSummary;fileSummary.hidden=!isLocal(context)||!localSummary;}
      if(fileInput)fileInput.disabled=Boolean(locked||controllerBusy||loading||pending);
      if(clear)clear.hidden=!credentialInput?.value;
      receive.hidden=pending;
      receive.textContent=loading?'正在准备…':isLocal(context)?'选择 Cookie JSON':'准备登录';
      cancel.hidden=!pending&&!loading;
      if(accountRow)accountRow.hidden=!pending;
      clear.disabled=Boolean(controllerBusy);cancel.disabled=Boolean(controllerBusy);
      summary.textContent=context?context.site.label+' · '+new URL(context.site.targetUrl).host:
        commercial?(commercialLabel||'会员网站')+' · '+new URL(commercial).host:
          rows.length?'选择网站':'暂无可用网站';
      account.textContent=masked||(commercial?(commercialLabel||'服务器当前分配的账号'):'尚未取得会话');
      status.textContent=locked?'恢复记录仍需核对，已停止取得及写入新会话；仍可打开网站。':pending?(isLocal(context)?notice:''):notice||
        (commercial&&commercialNotice?commercialNotice:
        (storageFailed?'网站选择未能保存；仍可手动选择，重新打开后请核对。':
          isLocal(context)?'选择你明确授权使用的本地 Cookie JSON；不会上传或保存文件。':
          context?'填写网站服务签发的登录凭据后，点击「准备登录」。':
            commercial?'准备登录后核对账号，再由浏览器确认。':rows.length?'请选择要登录的网站。':''));
      status.hidden=!status.textContent;
      status.setAttribute('data-tone',isLocal(context)&&fileError&&!locked?'error':'neutral');
    },
    dispose(){invalidate();disposed=true;++generation;loading=false;if(credentialInput)credentialInput.value='';setPending(null);}
  };
}
