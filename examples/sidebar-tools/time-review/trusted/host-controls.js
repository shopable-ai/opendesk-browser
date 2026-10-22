// Audited controller for the trusted React settings renderer. No tool HTML or JS
// enters this extension world; permission and Host authority stay here.
import {TIME_REVIEW_ID,TIME_REVIEW_CAPABILITY,timeReviewSiteOrigin,requireTimeReviewSiteGrants} from './policy.js';
import {TIME_REVIEW_KEY} from './model.js';

export function createTimeReviewPermissionControls({api,ui,notice,runOperation}){
  if(!ui)return {render(tool,readOnly=false){
    if(!readOnly&&tool?.id===TIME_REVIEW_ID&&tool.capabilities?.includes(TIME_REVIEW_CAPABILITY))
      throw Error('Time Review trusted controls are missing');
  },dispose(){}};
  let disposed=false,activeTool=null,epoch=0,busy=false,pendingSite=null,readGeneration=0,activeOrigin=null;
  let model={visible:false,busy:false,siteReview:false,allReview:false,clearReview:false,minuteReview:false,
    confirmText:'',siteStatus:'正在读取网站授权…',origins:[],currentGrantHidden:false,allGrantHidden:false,
    revokeAllHidden:true,idleGranted:false,nativeStart:false,effect:null};
  const publish=patch=>{if(!disposed){model=Object.freeze({...model,...patch});ui.render(model);}};
  const say=(message,error=false)=>{if(!disposed)notice(message,error);};
  const setBusy=value=>{if(!disposed){busy=value;publish({busy:value});}};
  const trusted=event=>!disposed&&event?.isTrusted===true&&!busy&&model.visible;
  const effects=(kind,target)=>({kind,target,sequence:(model.effect?.sequence||0)+1});
  const actions={};
  const click=(id,fn)=>{actions[id]=fn;};
  function operation(name,payload,event){
    if(!trusted(event)){if(event?.isTrusted!==true)say('请主动点击受信任工具设置中的按钮',true);return;}
    setBusy(true);
    const current=epoch;
    Promise.resolve().then(()=>current===epoch&&!disposed?runOperation(name,payload,event):null).then(result=>{
      if(disposed||current!==epoch)return;
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
    }).catch(error=>{if(current===epoch)say((error?.code||'E_TIME_REVIEW')+'：'+String(error?.message||error),true);})
      .finally(()=>{if(current===epoch)setBusy(false);});
  }
  function renderGrants(raw){
    const grants=requireTimeReviewSiteGrants(raw);
    publish({siteStatus:grants.allSites?'已授权全部普通网站':
      grants.origins.length?'已授权 '+grants.origins.length+' 个网站':'尚未授权网站，不会记录时间',
      currentGrantHidden:grants.allSites||grants.origins.includes(activeOrigin),
      allGrantHidden:grants.allSites,revokeAllHidden:!grants.allSites&&!grants.origins.length,
      origins:Object.freeze([...grants.origins])});
  }

  async function refresh(){
    if(disposed||!model.visible)return;
    const generation=++readGeneration;
    const [stored,idle,site]=await Promise.allSettled([
      // Evaluate each Chrome API call inside a Promise. A temporarily
      // unavailable API must be rejected by allSettled, not leak an
      // unhandled rejection from this fire-and-forget refresh.
      Promise.resolve().then(()=>api.storage.local.get(TIME_REVIEW_KEY)),
      Promise.resolve().then(()=>api.permissions.contains({permissions:['idle']})),
      Promise.resolve().then(()=>currentOrigin())
    ]);
    if(disposed||!model.visible||generation!==readGeneration)return;
    activeOrigin=site.status==='fulfilled'?site.value:null;
    if(stored.status==='fulfilled'){
      try{renderGrants(stored.value[TIME_REVIEW_KEY]?.siteGrants);}
      catch{publish({siteStatus:'网站授权数据无效；请核查后重新授权'});}
    }else publish({siteStatus:'授权状态不可读；采集已受保护'});
    publish({idleGranted:idle.status==='fulfilled'&&idle.value===true});
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
    setBusy(true);const current=epoch;
    // Request Chrome permissions directly in the trusted click call stack.
    let request;
    try{request=api.permissions.request({permissions:['idle']});}
    catch(error){say(error.message,true);setBusy(false);return;}
    Promise.resolve(request).then(ok=>{if(current===epoch)say(ok?'空闲检测已授权；网站范围也已批准时会自动开始记录。':
      '未获得 Chrome 空闲检测权限，不能开始记录。',!ok);})
      .catch(error=>{if(current===epoch)say(error.message,true);}).finally(()=>{if(current===epoch){setBusy(false);void refresh();}});
  });
  click('time-review-revoke-idle',event=>{
    if(!trusted(event))return;
    setBusy(true);const current=epoch;
    Promise.resolve().then(()=>!disposed&&current===epoch&&api.permissions.remove({permissions:['idle']}))
      .then(()=>{if(current===epoch)say('已撤销空闲检测，历史记录保留。');})
      .catch(error=>{if(current===epoch)say(error.message,true);}).finally(()=>{if(current===epoch){setBusy(false);void refresh();}});
  });
  click('time-review-site-current-open',async event=>{
    if(!trusted(event))return;const current=epoch;
    try{
      const origin=await currentOrigin();
      if(!origin){say('请先打开要授权的普通网站。',true);return;}
      if(disposed||current!==epoch||!model.visible)return;
      pendingSite=origin;
      publish({confirmText:'确认授权 '+origin+' 记录以后的前台非空闲时间？',siteReview:true,effect:effects('scroll','time-review-site-confirm')});
    }catch{say('无法确认当前网站；本次没有授权。',true);}
  });
  click('time-review-site-current-approve',async event=>{
    if(!trusted(event)||!pendingSite)return;
    const origin=pendingSite,current=epoch;
    // A stale confirmation cannot authorize a different tab or Origin.
    const actual=await currentOrigin();
    if(disposed||current!==epoch||pendingSite!==origin)return;
    if(actual!==origin||!model.visible){
      pendingSite=null;publish({siteReview:false});say('网站已切换，请重新审阅。',true);return;
    }
    pendingSite=null;publish({siteReview:false});
    operation('time.siteGrant',{mode:'site',origin,allow:true},event);
  });
  click('time-review-site-current-cancel',()=>{pendingSite=null;publish({siteReview:false});});
  click('time-review-site-all-open',event=>{
    if(!trusted(event))return;
    publish({allReview:true,effect:effects('scroll','time-review-site-all-confirm')});
  });
  click('time-review-site-all-approve',event=>{
    if(!trusted(event))return;
    publish({allReview:false});operation('time.siteGrant',{mode:'all',enabled:true},event);
  });
  click('time-review-site-all-cancel',()=>{publish({allReview:false});});
  click('time-review-site-all-revoke',event=>{
    if(!trusted(event))return;
    pendingSite=null;publish({siteReview:false});publish({allReview:false});
    operation('time.siteGrant',{mode:'all',enabled:false},event);
  });
  click('time-review-trusted-start',event=>operation('time.start',{},event));
  click('time-review-clear-open',event=>{
    if(!trusted(event))return;
    publish({clearReview:true,effect:effects('scroll','time-review-inline-clear-review')});
  });
  click('time-review-clear-approve',event=>{
    if(!trusted(event))return;
    publish({clearReview:false});operation('time.clear',{confirm:true},event);
  });
  click('time-review-clear-cancel',()=>{publish({clearReview:false});publish({effect:effects('focus','time-review-clear-open')});});
  click('time-review-minute-enable',event=>operation('time.minuteConsent',{enabled:true},event));
  click('time-review-minute-disable',event=>{
    if(!trusted(event))return;
    publish({minuteReview:true,effect:effects('scroll','time-review-minute-delete-review')});
  });
  click('time-review-minute-delete-approve',event=>{
    if(!trusted(event))return;
    publish({minuteReview:false});operation('time.minuteConsent',{enabled:false},event);
  });
  click('time-review-minute-delete-cancel',()=>{publish({minuteReview:false});publish({effect:effects('focus','time-review-minute-disable')});});
  actions.revokeSite=(origin,event)=>{
    if(model.origins.includes(origin))operation('time.siteGrant',{mode:'site',origin,allow:false},event);
  };
  ui.connect(Object.freeze(actions));publish({});
  return {render(tool,readOnly=false,nativeStart=false){
    if(disposed)return;
    const enabled=!readOnly&&tool?.id===TIME_REVIEW_ID&&tool.capabilities.includes(TIME_REVIEW_CAPABILITY);
    if(tool!==activeTool){epoch++;readGeneration++;pendingSite=null;busy=false;
      publish({busy:false,siteReview:false,allReview:false,clearReview:false,minuteReview:false});}
    activeTool=enabled?tool:null;
    if(!enabled){
      epoch++;readGeneration++;pendingSite=null;activeOrigin=null;busy=false;
      publish({visible:false,busy:false,siteReview:false,allReview:false,clearReview:false,minuteReview:false});
    }else {publish({visible:true,nativeStart});void refresh();}
  },dispose(){
    if(disposed)return;
    disposed=true;epoch++;readGeneration++;pendingSite=null;
    ui.connect(null);ui.render(null);
  }};
}
