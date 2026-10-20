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
    currentPageHost:'',currentAction:'unavailable'};
  const publish=patch=>{if(!disposed){model=Object.freeze({...model,...patch});ui.render(model);}};
  const message=(text,error=false)=>{if(!disposed)notice(text,error);};
  const trusted=event=>!disposed&&model.visible&&event?.isTrusted===true&&!model.busy;
  const pageHost=()=>pageTarget?.snapshot?.status==='available'?focusHost(pageTarget.snapshot.url)||'':'';
  async function refreshQuick(){
    const host=pageHost(),sequence=++quickSequence,current=epoch,tool=activeTool;
    if(!model.visible||!model.canGrant||!host||typeof readStatus!=='function'){
      publish({currentPageHost:host,currentAction:'unavailable'});return;
    }
    publish({currentPageHost:host,currentAction:'loading'});
    try{
      const state=await readStatus();
      if(disposed||current!==epoch||sequence!==quickSequence||tool!==activeTool||host!==pageHost())return;
      if(!Array.isArray(state?.sites))throw Error('网站管理状态不可用');
      const existing=managedSite(host,state.sites);
      publish({currentAction:existing?.enabled?'managed':existing?'paused':'add'});
    }catch(error){
      if(!disposed&&current===epoch&&sequence===quickSequence)
        publish({currentAction:'error'});
    }
  }
  async function quickAdd(event){
    if(!trusted(event)||!model.canGrant||!['add','paused','managed'].includes(model.currentAction))return;
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
      .then(()=>{if(disposed||current!==epoch)return;message(operation==='focus.enable'?'已开启本机专注限制。':
        operation==='focus.disable'?'已请求关闭限制，确认 Chrome 规则清理结果。':
        '本机 Stay Focus 记录已清空。');})
      .catch(error=>{if(current===epoch)message((error?.code||'E_FOCUS')+'：'+String(error?.message||error),true);})
      .finally(()=>{if(current===epoch)publish({busy:false});});
  }
  const effect=(kind,target)=>({kind,target,sequence:(model.effect?.sequence||0)+1});
  const actions=Object.freeze({
    quickAdd,
    refreshQuick:()=>void refreshQuick(),
    grant(event){
      if(!trusted(event)||!model.canGrant)return;
      publish({busy:true});const current=epoch;
      // Required DNR stays shared; optional idle starts in the real click stack.
      let approval;
      try{approval=api.permissions.request({permissions:['idle']});}
      catch(error){publish({busy:false});message(error.message,true);return;}
      Promise.resolve(approval).then(ok=>{
        if(disposed||current!==epoch||!model.canGrant)return;
        if(!ok)throw new Error('未批准空闲检测权限，不会启动限制');
        return runOperation('focus.enable',{},event);
      }).then(()=>{if(!disposed&&current===epoch&&model.canGrant)
        message('Stay Focus 已开启，受管娱乐网站共享每日总额度，Chrome 规则将按使用时间执行。');},
        error=>{if(current===epoch)message((error.code||'E_FOCUS_PERMISSION')+'：'+error.message,true);})
        .finally(()=>{if(current===epoch)publish({busy:false});});
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
  unsubscribePage=pageTarget?.subscribe?.(()=>{quickSequence++;void refreshQuick();})||null;
  return {render(tool,readOnly=false,toolEnabled=false){
    if(disposed)return;
    const visible=!readOnly&&tool?.id===FOCUS_ID&&tool.capabilities.includes(FOCUS_CAPABILITY);
    const canGrant=Boolean(visible&&toolEnabled);
    const changed=!visible||tool!==activeTool||canGrant!==model.canGrant;
    if(changed){epoch++;quickSequence++;publish({busy:false,clearReview:false});}
    activeTool=visible?tool:null;
    if(!visible){publish({visible:false,canGrant:false});return;}
    const policy=tool.backgroundPolicy;
    let intro;
    if(policy?.kind==='site-budget.v2'){
      const names=new Map(policy.suggestions.map(row=>[row.host,row.name]));
      const siteLabels=policy.defaultSites.map(host=>names.get(host)||host).join('、');
      intro='首次开启将管理：'+(siteLabels||'无预设网站')+
        '。默认共享每日 '+policy.dailyMinutes+' 分钟，工作时段可自行调整。'+
        '请先审阅站点；更新应用包不会自动增加或重置已有设置。关闭侧栏后仍由浏览器后台执行。';
    }else intro='首次授权并开启后，YouTube、TikTok、Instagram 等已识别娱乐网站默认共用每日 30 分钟。'+
      '开启前不自动限制网站，已开启时关闭侧栏仍由浏览器后台执行。';
    publish({visible:true,canGrant,intro});
    if(changed)void refreshQuick();
  },dispose(){
    if(disposed)return;disposed=true;epoch++;quickSequence++;
    unsubscribePage?.();unsubscribePage=null;
    ui.connect(null);ui.render(null);
  }};
}
