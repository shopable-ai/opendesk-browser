// Audited controller for the trusted React settings renderer. No tool HTML or JS
// enters this extension world; permission and Host authority stay here.
import {TIME_REVIEW_ID,TIME_REVIEW_CAPABILITY,timeReviewSiteOrigin,requireTimeReviewSiteGrants} from './policy.js';
import {TIME_REVIEW_KEY} from './model.js';
import {timeReviewText,timeReviewOriginText} from './localization.js';

export function createTimeReviewPermissionControls({api,ui,notice,runOperation,localeController=null,getLocale=()=>localeController?.getLocale?.()||'zh-CN'}){
  if(!ui)return {render(tool,readOnly=false){
    if(!readOnly&&tool?.id===TIME_REVIEW_ID&&tool.capabilities?.includes(TIME_REVIEW_CAPABILITY))
      throw Error('Time Review trusted controls are missing');
  },dispose(){}};
  let disposed=false,activeTool=null,epoch=0,busy=false,pendingSite=null,readGeneration=0,activeOrigin=null;
  let locale=getLocale();
  const text=(key,parameters)=>timeReviewText(locale,key,parameters);
  let statusKey='reading',statusParameters={};
  let model={visible:false,busy:false,siteReview:false,allReview:false,clearReview:false,minuteReview:false,
    locale,confirmText:'',siteStatus:text('reading'),origins:[],currentGrantHidden:false,allGrantHidden:false,
    revokeAllHidden:true,idleGranted:false,nativeStart:false,effect:null};
  const publish=patch=>{if(!disposed){model=Object.freeze({...model,...patch});ui.render(model);}};
  const setStatus=(key,parameters={})=>{statusKey=key;statusParameters=parameters;return text(key,parameters);};
  const localize=()=>{
    locale=getLocale();
    publish({locale,siteStatus:text(statusKey,statusParameters),
      confirmText:pendingSite?timeReviewOriginText(locale,'siteConfirm',pendingSite):''});
  };
  const unsubscribe=localeController?.subscribe?.(localize);
  const say=(message,error=false,project=null)=>{if(!disposed)notice(message,error,project);};
  const sayText=(key,error=false,parameters={})=>{
    const project=()=>timeReviewText(getLocale(),key,parameters);
    say(project(),error,project);
  };
  const setBusy=value=>{if(!disposed){busy=value;publish({busy:value});}};
  const trusted=event=>!disposed&&event?.isTrusted===true&&!busy&&model.visible;
  const effects=(kind,target)=>({kind,target,sequence:(model.effect?.sequence||0)+1});
  const actions={};
  const click=(id,fn)=>{actions[id]=fn;};
  function operation(name,payload,event){
    if(!trusted(event)){if(event?.isTrusted!==true)sayText('trustedClick',true);return;}
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
        sayText('grantsUpdated');
      }else sayText(name==='time.start'?'started':
        name==='time.minuteConsent'?(payload.enabled?'minuteEnabled':'minuteDisabled'):
        'cleared');
    }).catch(error=>{if(current===epoch)sayText('operationError',true,{code:error?.code||'E_TIME_REVIEW',message:String(error?.message||error)});})
      .finally(()=>{if(current===epoch)setBusy(false);});
  }
  function renderGrants(raw){
    const grants=requireTimeReviewSiteGrants(raw);
    publish({siteStatus:grants.allSites?setStatus('allGranted'):
      grants.origins.length?setStatus('countGranted',{count:grants.origins.length}):setStatus('noneGranted'),
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
      catch{publish({siteStatus:setStatus('invalidGrants')});}
    }else publish({siteStatus:setStatus('unreadableGrants')});
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
    Promise.resolve(request).then(ok=>{if(current===epoch)sayText(ok?'idleGranted':'idleDenied',!ok);})
      .catch(error=>{if(current===epoch)say(error.message,true);}).finally(()=>{if(current===epoch){setBusy(false);void refresh();}});
  });
  click('time-review-revoke-idle',event=>{
    if(!trusted(event))return;
    setBusy(true);const current=epoch;
    Promise.resolve().then(()=>!disposed&&current===epoch&&api.permissions.remove({permissions:['idle']}))
      .then(()=>{if(current===epoch)sayText('idleRevoked');})
      .catch(error=>{if(current===epoch)say(error.message,true);}).finally(()=>{if(current===epoch){setBusy(false);void refresh();}});
  });
  click('time-review-site-current-open',async event=>{
    if(!trusted(event))return;const current=epoch;
    try{
      const origin=await currentOrigin();
      if(!origin){sayText('openWebsite',true);return;}
      if(disposed||current!==epoch||!model.visible)return;
      pendingSite=origin;
      publish({confirmText:timeReviewOriginText(locale,'siteConfirm',origin),siteReview:true,effect:effects('scroll','time-review-site-confirm')});
    }catch{sayText('siteUnknown',true);}
  });
  click('time-review-site-current-approve',async event=>{
    if(!trusted(event)||!pendingSite)return;
    const origin=pendingSite,current=epoch;
    // A stale confirmation cannot authorize a different tab or Origin.
    const actual=await currentOrigin();
    if(disposed||current!==epoch||pendingSite!==origin)return;
    if(actual!==origin||!model.visible){
      pendingSite=null;publish({siteReview:false});sayText('siteChanged',true);return;
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
    if(locale!==getLocale())localize();
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
    unsubscribe?.();
    disposed=true;epoch++;readGeneration++;pendingSite=null;
    ui.connect(null);ui.render(null);
  }};
}
