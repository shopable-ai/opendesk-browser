// Precompiled trusted Side Panel controls. The static markup lives in
// ui/tool.html; no untrusted tool HTML or scripts enter this extension page.
import {TIME_REVIEW_ID,TIME_REVIEW_CAPABILITY,timeReviewSiteOrigin,requireTimeReviewSiteGrants} from './policy.js';
import {TIME_REVIEW_KEY} from './model.js';

export function createTimeReviewPermissionControls({api,doc,notice,runOperation}){
  const get=id=>doc.getElementById(id),section=get('time-review-permission-settings');
  // Unrelated tools may render in minimal hosts. Fail closed only if the
  // privileged Time Review itself is selected without its precompiled controls.
  if(!section)return {render(tool,readOnly=false){
    if(!readOnly&&tool?.id===TIME_REVIEW_ID&&tool.capabilities?.includes(TIME_REVIEW_CAPABILITY))
      throw Error('Time Review trusted controls are missing');
  }};
  const say=(message,error=false)=>notice(message,error);
  const click=(id,fn)=>get(id).addEventListener('click',fn);
  const review=get('time-review-site-confirm'),all=get('time-review-site-all-confirm');
  const clear=get('time-review-inline-clear-review'),minute=get('time-review-minute-delete-review');
  const siteList=get('time-review-site-grants-list'),siteStatus=get('time-review-site-grants-status');
  const idleGrant=get('time-review-grant-idle'),idleRevoke=get('time-review-revoke-idle');
  const currentGrant=get('time-review-site-current-open'),allGrant=get('time-review-site-all-open');
  const revokeAll=get('time-review-site-all-revoke'),trustedStart=get('time-review-trusted-start');
  let busy=false,pendingSite=null,readGeneration=0;
  const setBusy=value=>{
    busy=value;
    for(const button of section.querySelectorAll('button'))button.disabled=value;
  };
  const trusted=event=>event?.isTrusted===true&&!busy&&!section.hidden;
  function operation(name,payload,event){
    if(!trusted(event)){if(event?.isTrusted!==true)say('请主动点击受信任工具设置中的按钮',true);return;}
    setBusy(true);
    Promise.resolve().then(()=>runOperation(name,payload,event)).then(result=>{
      if(name==='time.siteGrant'){
        // A pre-existing async storage read may still contain the old grants.
        // Fence it before painting the verified Host response, then resync.
        readGeneration++;
        renderGrants(result.siteGrants);
        void refresh();
        say('网站采集授权已更新；未授权的网站不会记录。');
      }else say(name==='time.start'?'已开始／恢复本机后台记录。':
        name==='time.minuteConsent'?(payload.enabled?'未来分钟明细已开启。':'分钟明细已关闭并清除。'):
        '本机统计已清空。');
    }).catch(error=>say((error?.code||'E_TIME_REVIEW')+'：'+String(error?.message||error),true))
      .finally(()=>setBusy(false));
  }
  function renderGrants(raw){
    const grants=requireTimeReviewSiteGrants(raw);
    siteStatus.textContent=grants.allSites?'已授权全部普通网站':
      grants.origins.length?'已授权 '+grants.origins.length+' 个网站':'尚未授权网站，不会记录时间';
    // Full-site consent and exact-Origin consent are mutually exclusive.
    // Never offer a second grant that cannot take effect while allSites is on.
    currentGrant.hidden=grants.allSites;
    allGrant.hidden=grants.allSites;
    revokeAll.hidden=!grants.allSites&&!grants.origins.length;
    siteList.replaceChildren();
    for(const origin of grants.origins){
      const line=doc.createElement('div'),label=doc.createElement('span'),revoke=doc.createElement('button');
      line.className='time-review-site-grant-row';
      label.textContent=origin;revoke.textContent='撤销';revoke.type='button';
      revoke.className='od-button od-button--secondary';
      revoke.setAttribute('aria-label','撤销 '+origin+' 的时间统计授权');
      revoke.addEventListener('click',event=>operation('time.siteGrant',{mode:'site',origin,allow:false},event));
      line.append(label,revoke);siteList.append(line);
    }
  }
  async function refresh(){
    const generation=++readGeneration;
    const [stored,idle]=await Promise.allSettled([
      // Evaluate each Chrome API call inside a Promise. A temporarily
      // unavailable API must be rejected by allSettled, not leak an
      // unhandled rejection from this fire-and-forget refresh.
      Promise.resolve().then(()=>api.storage.local.get(TIME_REVIEW_KEY)),
      Promise.resolve().then(()=>api.permissions.contains({permissions:['idle']}))
    ]);
    if(section.hidden||generation!==readGeneration)return;
    if(stored.status==='fulfilled'){
      try{renderGrants(stored.value[TIME_REVIEW_KEY]?.siteGrants);}
      catch{siteStatus.textContent='网站授权数据无效；请核查后重新授权';}
    }else siteStatus.textContent='授权状态不可读；采集已受保护';
    if(idle.status==='fulfilled'){
      idleGrant.hidden=idle.value===true;
      idleRevoke.hidden=idle.value!==true;
    }else{
      // Unknown Chrome permission state never becomes an assumed grant.
      idleGrant.hidden=false;
      idleRevoke.hidden=true;
    }
  }
  async function currentOrigin(){
    const win=await api.windows.getLastFocused();
    if(!win?.focused||win.incognito||win.type!=='normal')return null;
    const tabs=await api.tabs.query({active:true,windowId:win.id});
    const tab=tabs?.length===1?tabs[0]:null;
    return !tab||tab.incognito||tab.pendingUrl?null:timeReviewSiteOrigin(tab.url);
  }
  click('time-review-grant-idle',event=>{
    if(!trusted(event))return;
    setBusy(true);
    // Request Chrome permissions directly in the trusted click call stack.
    let request;
    try{request=api.permissions.request({permissions:['idle']});}
    catch(error){say(error.message,true);setBusy(false);return;}
    Promise.resolve(request).then(ok=>say(ok?'空闲检测已授权，还需主动开始记录。':
      '未获得 Chrome 空闲检测权限，不能开始记录。',!ok))
      .catch(error=>say(error.message,true)).finally(()=>{setBusy(false);void refresh();});
  });
  click('time-review-revoke-idle',event=>{
    if(!trusted(event))return;
    setBusy(true);
    Promise.resolve().then(()=>api.permissions.remove({permissions:['idle']}))
      .then(()=>say('已撤销空闲检测，历史记录保留。'))
      .catch(error=>say(error.message,true)).finally(()=>{setBusy(false);void refresh();});
  });
  click('time-review-site-current-open',async event=>{
    if(!trusted(event))return;
    try{
      const origin=await currentOrigin();
      if(!origin){say('请先打开要授权的普通网站。',true);return;}
      if(section.hidden)return;
      pendingSite=origin;
      get('time-review-site-confirm-text').textContent='确认授权 '+origin+' 记录以后的前台非空闲时间？';
      review.hidden=false;review.scrollIntoView?.({block:'nearest'});
    }catch{say('无法确认当前网站；本次没有授权。',true);}
  });
  click('time-review-site-current-approve',async event=>{
    if(!trusted(event)||!pendingSite)return;
    const origin=pendingSite;
    // A stale confirmation cannot authorize a different tab or Origin.
    if(await currentOrigin()!==origin||section.hidden){
      pendingSite=null;review.hidden=true;say('网站已切换，请重新审阅。',true);return;
    }
    pendingSite=null;review.hidden=true;
    operation('time.siteGrant',{mode:'site',origin,allow:true},event);
  });
  click('time-review-site-current-cancel',()=>{pendingSite=null;review.hidden=true;});
  click('time-review-site-all-open',event=>{
    if(!trusted(event))return;
    all.hidden=false;all.scrollIntoView?.({block:'nearest'});
  });
  click('time-review-site-all-approve',event=>{
    if(!trusted(event))return;
    all.hidden=true;operation('time.siteGrant',{mode:'all',enabled:true},event);
  });
  click('time-review-site-all-cancel',()=>{all.hidden=true;});
  click('time-review-site-all-revoke',event=>{
    if(!trusted(event))return;
    pendingSite=null;review.hidden=true;all.hidden=true;
    operation('time.siteGrant',{mode:'all',enabled:false},event);
  });
  click('time-review-trusted-start',event=>operation('time.start',{},event));
  click('time-review-clear-open',event=>{
    if(!trusted(event))return;
    clear.hidden=false;clear.scrollIntoView?.({block:'nearest'});
  });
  click('time-review-clear-approve',event=>{
    if(!trusted(event))return;
    clear.hidden=true;operation('time.clear',{confirm:true},event);
  });
  click('time-review-clear-cancel',()=>{clear.hidden=true;get('time-review-clear-open').focus?.({preventScroll:true});});
  click('time-review-minute-enable',event=>operation('time.minuteConsent',{enabled:true},event));
  click('time-review-minute-disable',event=>{
    if(!trusted(event))return;
    minute.hidden=false;minute.scrollIntoView?.({block:'nearest'});
  });
  click('time-review-minute-delete-approve',event=>{
    if(!trusted(event))return;
    minute.hidden=true;operation('time.minuteConsent',{enabled:false},event);
  });
  click('time-review-minute-delete-cancel',()=>{minute.hidden=true;get('time-review-minute-disable').focus?.({preventScroll:true});});
  return {render(tool,readOnly=false){
    const enabled=!readOnly&&tool?.id===TIME_REVIEW_ID&&tool.capabilities.includes(TIME_REVIEW_CAPABILITY);
    section.hidden=!enabled;
    // The compiled native UI already has its own one-click start/resume.
    // Retain this host button only for the untrusted iframe fallback.
    trustedStart.hidden=Boolean(get('sidebar-tool-frame')?.dataset?.timeReviewNative==='true');
    if(!enabled){
      readGeneration++;pendingSite=null;
      review.hidden=true;all.hidden=true;clear.hidden=true;minute.hidden=true;
    }else void refresh();
  }};
}
