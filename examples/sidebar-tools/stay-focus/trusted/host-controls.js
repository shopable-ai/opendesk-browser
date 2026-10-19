// Optional idle permission prompts and destructive controls originate only in the
// trusted React Side Panel, never from the opaque-origin tool iframe.
import {FOCUS_ID,FOCUS_CAPABILITY} from './policy.js';
export function createStayFocusPermissionControls({api,ui,notice,runOperation}){
  if(!ui)return {render(tool,readOnly=false){
    if(!readOnly&&tool?.id===FOCUS_ID&&tool.capabilities?.includes(FOCUS_CAPABILITY))
      throw Error('Stay Focus trusted controls are missing');
  },dispose(){}};
  let disposed=false,activeTool=null,epoch=0;
  let model={visible:false,busy:false,canGrant:false,intro:'',clearReview:false,effect:null};
  const publish=patch=>{if(!disposed){model=Object.freeze({...model,...patch});ui.render(model);}};
  const message=(text,error=false)=>{if(!disposed)notice(text,error);};
  const trusted=event=>!disposed&&model.visible&&event?.isTrusted===true&&!model.busy;
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
  return {render(tool,readOnly=false,toolEnabled=false){
    if(disposed)return;
    const visible=!readOnly&&tool?.id===FOCUS_ID&&tool.capabilities.includes(FOCUS_CAPABILITY);
    const canGrant=Boolean(visible&&toolEnabled);
    if(!visible||tool!==activeTool||canGrant!==model.canGrant){epoch++;publish({busy:false,clearReview:false});}
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
  },dispose(){
    if(disposed)return;disposed=true;epoch++;
    ui.connect(null);ui.render(null);
  }};
}
