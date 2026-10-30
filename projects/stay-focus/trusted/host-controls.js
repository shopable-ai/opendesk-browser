// Optional idle permission prompts and destructive controls originate only in the
// trusted React Side Panel, never from the opaque-origin tool iframe.
import {FOCUS_ID,FOCUS_CAPABILITY,focusHost,hostnameMatches} from './policy.js';
const managedSite=(hostname,sites)=>(Array.isArray(sites)?sites:[])
  .filter(site=>hostnameMatches(hostname,site.host,site.subdomains===true))
  .sort((a,b)=>b.host.length-a.host.length)[0]||null;
export function createStayFocusPermissionControls({api,ui,notice,runOperation,pageTarget=null,readStatus=null}){
  if(!ui)return {render(tool,readOnly=false){
    if(!readOnly&&tool?.id===FOCUS_ID&&tool.capabilities?.includes(FOCUS_CAPABILITY))
      throw Error('Stay Focus trusted controls are missing');
  },dispose(){}};
  let disposed=false,activeTool=null,epoch=0,quickSequence=0,unsubscribePage=null;
  let model={visible:false,busy:false,canGrant:false,intro:'',clearReview:false,effect:null,
    currentPageHost:'',currentAction:'unavailable',phase:'checking',
    statusText:'正在核对 Chrome 状态…',idleGranted:false,dnrGranted:false};
  const publish=patch=>{if(!disposed){model=Object.freeze({...model,...patch});ui.render(model);}};
  const message=(text,error=false)=>{if(!disposed)notice(text,error);};
  const trusted=event=>!disposed&&model.visible&&event?.isTrusted===true&&!model.busy;
  const pageHost=()=>pageTarget?.snapshot?.status==='available'?focusHost(pageTarget.snapshot.url)||'':'';
  // One live worker status is shared by the native activation control and
  // current-page action. Do not infer permission from a frontend Boolean.
  async function refreshQuick(){
    const host=pageHost(),sequence=++quickSequence,current=epoch,tool=activeTool;
    if(!model.visible)return;
    if(!model.canGrant){
      publish({currentPageHost:host,currentAction:'unavailable',phase:'disabled',
        statusText:'工具已停用，请先在扩展中心启用 Stay Focus。'});return;
    }
    if(typeof readStatus!=='function'){
      publish({phase:'error',currentAction:'error',statusText:'无法读取可信后台状态，请重新打开工具。'});return;
    }
    if(['checking','error'].includes(model.phase))
      publish({currentPageHost:host,currentAction:host?'loading':'unavailable',
        phase:'checking',statusText:'正在核对 Chrome 保护状态…'});
    try{
      const state=await readStatus();
      if(disposed||current!==epoch||sequence!==quickSequence||tool!==activeTool||host!==pageHost())return;
      if(!Array.isArray(state?.sites)||!state.permissions||
        typeof state.permissions.idle!=='boolean'||typeof state.permissions.dnr!=='boolean'||
        typeof state.enabled!=='boolean')
        throw Error('后台状态数据不完整');
      const permissions=state.permissions;
      let phase,statusText;
      if(!permissions.dnr){
        phase='unsupported';statusText='扩展缺少 Chrome 网站规则权限，请更新或重新加载扩展。';
      }else if(!permissions.idle){
        phase='needs-permission';statusText='需要开启 Chrome 空闲检测权限。';
      }else if(state.enabled&&state.ruleReceipt?.verified!==true){
        phase='unverified';statusText='规则尚未核对，暂不能确认网站限制生效。';
      }else if(state.enabled){
        phase='active';
        statusText=state.sites.some(site=>site.enabled)
          ?'已开启 · Chrome 规则已核对':'已开启 · 尚未加入启用的网站';
      }else if(state.authorized){
        phase='stopped';statusText='已停止限制 · 网站与 Chrome 权限已保留';
      }else if(state.sites.length){
        phase='reauthorize';statusText='需要重新开启 · 已有网站设置已保留';
      }else{
        phase='first';statusText='尚未开启 · 首次开启后可一键管理网站';
      }
      const existing=host?managedSite(host,state.sites):null;
      publish({phase,statusText,idleGranted:permissions.idle,dnrGranted:permissions.dnr,
        currentPageHost:host,currentAction:!host?'unavailable':
          existing?.enabled?'managed':existing?'paused':'add'});
    }catch(error){
      if(!disposed&&current===epoch&&sequence===quickSequence)
        publish({phase:'error',statusText:'无法核对后台状态：'+String(error?.message||error),
          currentPageHost:host,currentAction:'error'});
    }
  }
  async function quickAdd(event){
    if(!trusted(event)||!model.canGrant||
      !['active','unverified','stopped'].includes(model.phase)||
      !['add','paused','managed'].includes(model.currentAction))return;
    const requestedAction=model.currentAction;
    const host=pageHost();
    if(!host||host!==model.currentPageHost||!pageTarget?.capture||!pageTarget?.revalidate||!readStatus)return;
    let captured;
    try{captured=pageTarget.capture();}catch(error){message(error.message,true);return;}
    if(focusHost(captured.url)!==host)return;
    const current=epoch;
    publish({busy:true});
    try{
      await pageTarget.revalidate(captured);
      const state=await readStatus();
      if(disposed||current!==epoch||host!==pageHost())throw Error('网页或工具已变化，未加入旧网站');
      if(!Array.isArray(state?.sites)||!Number.isInteger(state?.dailyBudget?.minutes))
        throw Error('无法核对当前网站的共享额度');
      const existing=managedSite(host,state.sites);
      const actualAction=existing?.enabled?'managed':existing?'paused':'add';
      if(actualAction!==requestedAction){publish({currentAction:actualAction});return;}
      const known=(Array.isArray(state.catalog)?state.catalog:[])
        .filter(row=>hostnameMatches(host,row.host,true))
        .sort((a,b)=>b.host.length-a.host.length)[0];
      const site=existing?{host:existing.host,subdomains:existing.subdomains,
        enabled:requestedAction!=='managed',mode:existing.mode,minutes:existing.minutes,group:existing.group}:
        {host:known?.host||host,subdomains:true,enabled:true,mode:'limit',
          minutes:state.dailyBudget.minutes,group:'entertainment'};
      await pageTarget.revalidate(captured);
      if(disposed||current!==epoch||host!==pageHost())throw Error('当前网页已变化，未加入旧网站');
      // This event comes from the extension-owned React Side Panel, never the iframe.
      const result=await runOperation('focus.site.put',{site},event);
      if(disposed||current!==epoch)return;
      try{await pageTarget.revalidate(captured);}catch{
        message('网站可能已保存，但当前网页已切换；请核对网站列表，勿重复提交。',true);
        return;
      }
      const confirmed=managedSite(host,result?.sites);
      if(!confirmed||confirmed.enabled!==site.enabled)
        throw Error('保存回执没有确认当前网站状态，请读取状态');
      publish({currentAction:site.enabled?'managed':'paused'});
      if(!result.enabled)message('网站已保存；开启浏览器专注限制后生效。');
      else if(result.ruleReceipt?.verified!==true)
        message('已保存网站，但 Chrome 规则尚未核对。',true);
      else message(site.enabled?'已管理 '+confirmed.host+'。':'已暂停 '+confirmed.host+'。');
    }catch(error){
      if(!disposed&&current===epoch)message((error?.code||'E_FOCUS')+'：'+String(error?.message||error),true);
    }finally{
      if(!disposed&&current===epoch){publish({busy:false});void refreshQuick();}
    }
  }
  function operate(operation,payload,event){
    if(!trusted(event))return;
    publish({busy:true});const current=epoch;
    Promise.resolve().then(()=>!disposed&&current===epoch?runOperation(operation,payload,event):null)
      .then(result=>{
        if(disposed||current!==epoch)return;
        if(result?.enabled!==false||result?.ruleReceipt?.verified!==true)
          throw Error('后台尚未确认规则已清理，请重新核对状态');
        message(operation==='focus.disable'?
          '限制已停止。Chrome 权限和网站设置仍保留，可直接重新开启。':
          'Stay Focus 设置与记录已清空。');
      }).catch(error=>{
        if(!disposed&&current===epoch)
          message((error?.code||'E_FOCUS')+'：'+String(error?.message||error),true);
      }).finally(()=>{
        if(!disposed&&current===epoch){publish({busy:false});void refreshQuick();}
      });
  }
  const effect=(kind,target)=>({kind,target,sequence:(model.effect?.sequence||0)+1});
  const actions=Object.freeze({
    quickAdd,
    refreshQuick:()=>void refreshQuick(),
    grant(event){
      if(!trusted(event)||!model.canGrant||
        !['first','reauthorize','needs-permission','stopped'].includes(model.phase))return;
      if(!model.dnrGranted){
        message('当前扩展缺少 Chrome 规则权限，请更新或重新加载扩展。',true);return;
      }
      const current=epoch;
      publish({busy:true});
      // Permission request must run in this real click stack, and only when
      // Chrome has not already granted idle. DNR remains required/shared.
      let approval;
      try{
        approval=model.idleGranted?Promise.resolve(true):
          api.permissions.request({permissions:['idle']});
      }catch(error){publish({busy:false});message(error.message,true);return;}
      Promise.resolve(approval).then(async ok=>{
        if(disposed||current!==epoch||!model.canGrant)return;
        if(!ok)throw new Error('未批准空闲检测权限，限制没有开启');
        const result=await runOperation('focus.enable',{},event);
        if(disposed||current!==epoch)return;
        if(result?.enabled!==true||result?.permissions?.ready!==true||
          result?.ruleReceipt?.verified!==true)
          throw Error('已请求开启，但 Chrome 规则还未核对，请检查状态');
        message('Stay Focus 已开启。现在可以直接加入和管理网站。');
      }).catch(error=>{
        if(!disposed&&current===epoch)
          message((error?.code||'E_FOCUS_PERMISSION')+'：'+String(error?.message||error),true);
      }).finally(()=>{
        if(!disposed&&current===epoch){publish({busy:false});void refreshQuick();}
      });
    },
    stop:event=>operate('focus.disable',{},event),
    openClear(event){if(trusted(event))publish({clearReview:true,effect:effect('scroll','stay-focus-clear-confirm')});},
    approveClear(event){
      if(!trusted(event)||!model.clearReview)return;
      publish({clearReview:false});operate('focus.clear',{confirm:true},event);
    },
    cancelClear(event){if(event?.isTrusted===true&&!disposed)publish({clearReview:false,effect:effect('focus','stay-focus-clear-open')});}
  });
  ui.connect(actions);publish({});
  const onFocus=()=>{if(model.visible&&!model.busy&&!globalThis.document?.hidden)void refreshQuick();};
  globalThis.addEventListener?.('focus',onFocus);
  globalThis.document?.addEventListener?.('visibilitychange',onFocus);
  const statusTimer=globalThis.setInterval?.(onFocus,20000);
  unsubscribePage=pageTarget?.subscribe?.(()=>{quickSequence++;void refreshQuick();})||null;
  return {render(tool,readOnly=false,toolEnabled=false){
    if(disposed)return;
    const visible=!readOnly&&tool?.id===FOCUS_ID&&tool.capabilities.includes(FOCUS_CAPABILITY);
    const canGrant=Boolean(visible&&toolEnabled);
    const changed=!visible||tool!==activeTool||canGrant!==model.canGrant;
    if(changed){epoch++;quickSequence++;publish({busy:false,clearReview:false});}
    activeTool=visible?tool:null;
    if(!visible){publish({visible:false,canGrant:false});return;}
    const daily=tool.backgroundPolicy?.dailyMinutes||30;
    const intro='首次开启只激活后台管理能力，不自动加入网站。'+
      '打开 YouTube 等网页后可一键加入；已加入的网站共享每日 '+daily+
      ' 分钟（可修改）。关闭侧栏后规则仍由 Chrome 后台执行。';
    publish({visible:true,canGrant,intro,phase:changed?'checking':model.phase,
      statusText:changed?'正在核对 Chrome 保护状态…':model.statusText});
    if(changed)void refreshQuick();
  },dispose(){
    if(disposed)return;disposed=true;epoch++;quickSequence++;
    unsubscribePage?.();unsubscribePage=null;
    globalThis.removeEventListener?.('focus',onFocus);
    globalThis.document?.removeEventListener?.('visibilitychange',onFocus);
    globalThis.clearInterval?.(statusTimer);
    ui.connect(null);ui.render(null);
  }};
}
