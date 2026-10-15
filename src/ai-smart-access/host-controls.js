// A first-party host-only proxy card. Installed sandbox content cannot forge this click.
// The legacy worker remains intact until a reviewed Managed Proxy SDK replaces it.
import {AI_ID,AI_CAPABILITY} from './policy.js';
import {AI_LOCAL_TEST_ENABLED} from './provider-config.js';
export function createAiAccessPermissionControls({api,doc,container,notice,runOperation}){
  const section=doc.createElement('section');
  section.id='ai-access-trusted-controls';
  section.className='od-surface od-surface--padded';
  section.setAttribute('aria-label','AI 网站访问');
  section.hidden=true;
  const header=doc.createElement('div');
  header.className='ai-access-proxy-head';
  const title=doc.createElement('h2');
  title.className='od-title';
  title.textContent='AI 网站访问';
  const badge=doc.createElement('span');
  badge.className='od-note';
  badge.setAttribute('role','status');
  badge.setAttribute('aria-live','polite');
  header.append(title,badge);
  const status=doc.createElement('p');
  status.id='ai-access-status';
  status.className='od-note';
  const action=doc.createElement('button');
  action.type='button';
  action.id='ai-access-toggle';
  action.className='od-button';
  const errorText=doc.createElement('p');
  errorText.id='ai-access-error';
  errorText.className='od-field-error';
  errorText.setAttribute('role','alert');
  errorText.hidden=true;
  const help=doc.createElement('p');
  help.className='od-note';
  help.textContent='仅控制本工具的 AI 网站代理，不修改系统 VPN 或其他扩展；会员有效期与代理启停互不影响。';
  section.append(header,status,action,errorText,help);
  let activate=null;
  if(AI_LOCAL_TEST_ENABLED){
    const label=doc.createElement('p');
    label.className='od-note';
    label.textContent='本地开发测试 · 模拟租约 127.0.0.1:7898 / HTTP 代理 127.0.0.1:7897；不代表生产会员授权。';
    activate=doc.createElement('button');
    activate.type='button';activate.id='ai-access-local-activate';
    activate.className='od-button';activate.textContent='激活本地测试服务';
    section.append(label,activate);
  }
  container.append(section);
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
    badge.textContent=labels[last.state]||'状态待核对';
    status.textContent=reason||'仅反映 Chrome 实际控制状态，不代表 AI 网站网络连通。';
    const retry=stop&&last.state==='unavailable'&&/停止|清理|结果尚未确认|结果未确认/.test(reason);
    // STOP remains reachable while an earlier ENABLE is still in flight.
    const interrupt=busy&&['aiAccess.enable','aiAccess.activate'].includes(pendingOperation);
    action.textContent=interrupt?'停用代理':busy?'正在处理':
      stop?(retry?'重试停用':'停用代理'):'启用代理';
    action.disabled=(busy&&!interrupt)||!toolEnabled||
      !(interrupt||stop||last.state==='disabled');
    action.setAttribute('aria-busy',String(busy));
    action.setAttribute('aria-pressed',String(last.state==='enabled'&&stop));
    if(activate)activate.disabled=busy||!toolEnabled||stop||last.state!=='activation_required';
  }
  async function refresh(){
    const seq=++statusEpoch,tool=activeTool;
    if(!tool||!toolEnabled)return;
    try{
      const reply=await runOperation('aiAccess.status',{},null);
      if(seq===statusEpoch&&activeTool===tool&&toolEnabled)show(reply);
    }catch(error){
      if(seq===statusEpoch&&activeTool===tool&&toolEnabled)
        show({state:'unavailable',reason:String(error?.message||error).slice(0,180)});
    }
  }
  function execute(operation,payload,event){
    if(event?.isTrusted!==true||!toolEnabled||
      (busy&&!['aiAccess.enable','aiAccess.activate'].includes(pendingOperation)))return;
    if(!operation)return;
    ++statusEpoch;
    const actionEpoch=++operationEpoch;
    busy=true;
    pendingOperation=operation;
    errorText.hidden=true;
    show(last);
    // Host-only trusted click; the Worker serializes state and persists STOP.
    // A late ENABLE completion cannot replace the newer STOP UI response.
    Promise.resolve().then(()=>runOperation(operation,payload,event)).then(
      ()=>{if(actionEpoch===operationEpoch)return refresh();},
      error=>{
        if(actionEpoch!==operationEpoch)return;
        const message=(error?.code||'E_AI')+'：'+String(error?.message||error).slice(0,180);
        errorText.textContent=message;
        errorText.hidden=false;
        notice(message,true);
        return refresh(); // Read-only recovery; never retry an unknown write.
      }
    ).finally(()=>{
      if(actionEpoch===operationEpoch){
        busy=false;pendingOperation=null;show(last);
      }
    });
  }
  action.addEventListener('click',event=>execute(busy?'aiAccess.disable':canStop(last)?'aiAccess.disable':
    last.state==='disabled'?'aiAccess.enable':null,{},event));
  activate?.addEventListener('click',event=>{
    if(!busy&&last.state==='activation_required')
      execute('aiAccess.activate',{code:'LOCAL-DEV-ONLY'},event);
  });
  function render(tool,readOnly=false,enabled=false){
    const visible=!readOnly&&tool?.id===AI_ID&&
      Array.isArray(tool.capabilities)&&tool.capabilities.includes(AI_CAPABILITY);
    if(!visible){
      activeTool=null;toolEnabled=false;section.hidden=true;statusEpoch++;
      operationEpoch++;busy=false;pendingOperation=null;
      errorText.hidden=true;return;
    }
    const changed=activeTool!==tool||toolEnabled!==Boolean(enabled);
    activeTool=tool;toolEnabled=Boolean(enabled);section.hidden=false;
    if(changed){
      operationEpoch++;busy=false;pendingOperation=null;
      errorText.hidden=true;
      show({state:'unavailable',reason:'正在核对 Chrome 代理状态'});
      if(toolEnabled)void refresh();
    }
    if(!toolEnabled)show({state:'unavailable',reason:'请先启用已安装的工具'});
  }
  return {render,refresh};
}
