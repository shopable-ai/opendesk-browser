// A first-party host-only proxy card. Installed sandbox content cannot forge this click.
// The legacy worker remains intact until a reviewed Managed Proxy SDK replaces it.
import {AI_ID,AI_CAPABILITY} from './policy.js';
import {AI_LOCAL_TEST_ENABLED} from './provider-config.js';
export function createAiAccessPermissionControls({api,ui,notice,runOperation}){
  if(!ui)return {render(tool,readOnly=false){
    if(!readOnly&&tool?.id===AI_ID&&tool.capabilities?.includes(AI_CAPABILITY))
      throw Error('AI Access trusted controls are missing');
  },refresh(){},dispose(){}};
  let disposed=false;
  let model={visible:false,badge:'',status:'',actionLabel:'',actionDisabled:true,busy:false,
    pressed:false,error:null,localTestEnabled:AI_LOCAL_TEST_ENABLED,activateDisabled:true};
  const publish=patch=>{if(!disposed){model=Object.freeze({...model,...patch});ui.render(model);}};
  let activeTool=null,toolEnabled=false,busy=false,statusEpoch=0;
  let pendingOperation=null,operationEpoch=0;
  let last={state:'unavailable',canStop:false,reason:'正在核对 Chrome 状态'};
  const canStop=data=>data?.canStop===true||data?.state==='enabled';
  function show(data){
    last=data&&typeof data==='object'?data:{state:'unavailable',reason:'状态回执无效'};
    const labels={enabled:'代理已启用',disabled:'代理已停用',
      activation_required:'代理服务待激活',unavailable:'代理不可用',conflict:'代理控制冲突'};
    const stop=canStop(last);
    const reason=typeof last.reason==='string'?last.reason.slice(0,180):'';

    const retry=stop&&last.state==='unavailable'&&/停止|清理|结果尚未确认|结果未确认/.test(reason);
    // STOP remains reachable while an earlier ENABLE is still in flight.
    const interrupt=busy&&['aiAccess.enable','aiAccess.activate'].includes(pendingOperation);
    publish({badge:labels[last.state]||'状态待核对',
      status:reason||'仅反映 Chrome 实际控制状态，不代表 AI 网站网络连通。',
      actionLabel:interrupt?'停用代理':busy?'正在处理':stop?(retry?'重试停用':'停用代理'):'启用代理',
      actionDisabled:(busy&&!interrupt)||!toolEnabled||!(interrupt||stop||last.state==='disabled'),
      busy,pressed:last.state==='enabled'&&stop,
      activateDisabled:busy||!toolEnabled||stop||last.state!=='activation_required'});
  }
  async function refresh(){
    const seq=++statusEpoch,tool=activeTool;
    if(disposed||!tool||!toolEnabled)return;
    try{
      const reply=await runOperation('aiAccess.status',{},null);
      if(!disposed&&seq===statusEpoch&&activeTool===tool&&toolEnabled)show(reply);
    }catch(error){
      if(!disposed&&seq===statusEpoch&&activeTool===tool&&toolEnabled)
        show({state:'unavailable',reason:String(error?.message||error).slice(0,180)});
    }
  }
  function execute(operation,payload,event){
    if(disposed||event?.isTrusted!==true||!toolEnabled||
      (busy&&!['aiAccess.enable','aiAccess.activate'].includes(pendingOperation)))return;
    if(!operation)return;
    ++statusEpoch;
    const actionEpoch=++operationEpoch;
    busy=true;
    pendingOperation=operation;
    publish({error:null});
    show(last);
    // Host-only trusted click; the Worker serializes state and persists STOP.
    // A late ENABLE completion cannot replace the newer STOP UI response.
    Promise.resolve().then(()=>!disposed&&actionEpoch===operationEpoch?runOperation(operation,payload,event):null).then(
      ()=>{if(!disposed&&actionEpoch===operationEpoch)return refresh();},
      error=>{
        if(disposed||actionEpoch!==operationEpoch)return;
        const message=(error?.code||'E_AI')+'：'+String(error?.message||error).slice(0,180);
        publish({error:message});
        notice(message,true);
        return refresh(); // Read-only recovery; never retry an unknown write.
      }
    ).finally(()=>{
      if(!disposed&&actionEpoch===operationEpoch){
        busy=false;pendingOperation=null;show(last);
      }
    });
  }
  ui.connect(Object.freeze({
    toggle:event=>execute(busy?'aiAccess.disable':canStop(last)?'aiAccess.disable':
      last.state==='disabled'?'aiAccess.enable':null,{},event),
    activate(event){if(AI_LOCAL_TEST_ENABLED&&!busy&&last.state==='activation_required')
      execute('aiAccess.activate',{code:'LOCAL-DEV-ONLY'},event);}
  }));publish({});
  function render(tool,readOnly=false,enabled=false,hostVisible=true){
    if(disposed)return;
    const visible=!readOnly&&tool?.id===AI_ID&&
      Array.isArray(tool.capabilities)&&tool.capabilities.includes(AI_CAPABILITY);
    if(!visible){
      activeTool=null;toolEnabled=false;publish({visible:false});statusEpoch++;
      operationEpoch++;busy=false;pendingOperation=null;
      publish({error:null});return;
    }
    const changed=activeTool!==tool||toolEnabled!==Boolean(enabled);
    activeTool=tool;toolEnabled=Boolean(enabled);publish({visible:toolEnabled&&hostVisible});
    if(changed){
      operationEpoch++;busy=false;pendingOperation=null;
      publish({error:null});
      show({state:'unavailable',reason:'正在核对 Chrome 代理状态'});
      if(toolEnabled)void refresh();
    }
    if(!toolEnabled)show({state:'unavailable',reason:'请先启用已安装的工具'});
  }
  return {render,refresh,dispose(){
    if(disposed)return;disposed=true;statusEpoch++;operationEpoch++;activeTool=null;toolEnabled=false;
    ui.connect(null);ui.render(null);
  }};
}
