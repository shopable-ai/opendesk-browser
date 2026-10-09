import {sha256Utf8} from '../scripting/user-scripts/page-program-package.js';

const KEY='opendesk.local-project.selection.v1';
const failure=(code,message)=>Object.assign(new Error(message),{code});
export function createLocalProjectView({client,api,document:doc,onChange=()=>{}}){
  const find=id=>doc.getElementById(id),mode=find('local-project-mode'),select=find('local-project-select'),status=find('local-project-status');
  let disposed=false,generation=0,selectionGeneration=0,connected=false,epoch=null,projects=[],selection='',last=null,checking=false,diagnostic='';
  const listeners=[];
  const active=()=>mode.checked;
  const selected=()=>projects.find(row=>row.bindingId===selection);
  const listen=(node,event,callback)=>{node.addEventListener(event,callback);listeners.push([node,event,callback]);};
  function render(message){
    find('developer-source-switch').dataset.mode=active()?'local':'manual';
    find('local-project-tools').hidden=!active();
    find('manual-source-editor').hidden=active();
    find('local-project-params-tools').hidden=!active();
    find('manual-project-params-tools').hidden=active();
    select.disabled=checking||!connected;
    status.dataset.state=!active()?'manual':checking?'checking':!connected?'disconnected':selected()?'connected':'selection-needed';
    status.textContent=!active()?'':checking?'正在连接本地开发服务…':message||(
      !connected?'未连接本地开发服务。请启动 OpenDesk 后点击刷新。'
      :projects.length===0?'暂无已授权项目，请先在本地授权项目。'
      :selected()?'已连接 · 运行时读取最新源码'
      :selection?'之前的项目暂不可用，请重新选择。':'请选择已授权项目');
    const detail=[diagnostic,last?`上次读取源码 SHA-256：${last.sourceHash}`:''].filter(Boolean).join('；');
    if(active()&&detail)status.title=detail;else status.removeAttribute('title');
    find('local-project-refresh').disabled=checking;
    onChange();
  }
  function choices(){
    // Choosing the only *already authorized* project is navigation, never an execution or new authorization.
    if(!selection&&projects.length===1){selection=projects[0].bindingId;persist();}
    select.replaceChildren(new Option('选择已授权项目',''));
    for(const row of projects)select.append(new Option(row.name,row.bindingId));
    if(selection&&!selected())select.append(new Option('之前的项目（不可用）',selection));
    select.value=selection;
  }
  function persist(){const paramsText=find('local-project-params').value;if(new TextEncoder().encode(paramsText).length>32768)return;api.storage?.local?.set({[KEY]:{local:active(),bindingId:selection,paramsText}}).catch(()=>{});}
  async function refresh(){
    if(!active()||!client.requestLocalProject||disposed)return;
    const version=++generation;let errorMessage;checking=true;diagnostic='';render();
    try{
      const state=await client.requestLocalProject('status',{});
      if(disposed||version!==generation)return;
      if(!state.connected)throw failure('E_DEV_DISCONNECTED','本地开发连接尚未建立');
      const value=await client.requestLocalProject('projects.list',{});
      if(disposed||version!==generation)return;
      if(value.providerEpoch!==state.providerEpoch||!Array.isArray(value.projects)||value.projects.length>8||
        value.projects.some(row=>typeof row.bindingId!=='string'||typeof row.name!=='string'))throw failure('E_DEV_DISCONNECTED','项目连接身份已变化，请刷新');
      connected=true;epoch=value.providerEpoch;projects=value.projects;choices();render();
    }catch(error){if(!disposed&&version===generation){
      connected=false;epoch=null;projects=[];choices();
      diagnostic=`${error?.code||'E_DEV_DISCONNECTED'}：${error?.message||'连接失败'}`;
      errorMessage=error?.code==='E_DEV_DISCONNECTED'
        ?'本地开发服务未连接。请启动后点击刷新。'
        :'连接失败，请检查本地服务或项目授权后重试。';
      render(errorMessage);
    }}
    finally{if(version===generation){checking=false;render(errorMessage);}}
  }
  function capture(){if(!active()||checking||!connected||!selected())throw failure('E_DEV_DISCONNECTED','请选择已连接的本地项目');return {generation,bindingId:selection,providerEpoch:epoch};}
  function assertCaptured(captured){if(disposed||!active()||checking||!connected||captured.generation!==generation||captured.bindingId!==selection||captured.providerEpoch!==epoch)throw failure('E_DEV_CONFLICT','本地项目或连接已变化，本次未运行');}
  async function resolve(captured){
    assertCaptured(captured);
    const value=await client.requestLocalProject('project.resolve',{bindingId:captured.bindingId});
    assertCaptured(captured);
    if(value.providerEpoch!==captured.providerEpoch||value.bindingId!==captured.bindingId||!['controller','page-userscript'].includes(value.runtimeKind)||
      typeof value.sourceUtf8!=='string'||value.sourceBytes!==new TextEncoder().encode(value.sourceUtf8).length||value.sourceHash!==await sha256Utf8(value.sourceUtf8))throw failure('E_DEV_HASH','本地源码字节或执行身份不一致');
    assertCaptured(captured);last=value;render();return value;
  }
  listen(mode,'change',()=>{generation++;selectionGeneration++;checking=false;connected=false;epoch=null;last=null;diagnostic='';persist();render();if(active())void refresh();});
  listen(select,'change',()=>{generation++;selectionGeneration++;checking=false;selection=select.value;last=null;persist();render();});
  listen(find('local-project-refresh'),'click',()=>void refresh());
  listen(find('local-project-params'),'input',persist);
  const unsubscribe=client.subscribeLocalProjects?.(state=>{
    generation++;checking=false;connected=false;epoch=null;
    if(!disposed){render();if(active()&&state.connected)void refresh();}
  });
  const unsubscribeConnection=client.subscribeConnection?.(state=>{if(state.connected&&!disposed&&active())void refresh();});
  const initial=selectionGeneration;
  api.storage?.local?.get(KEY).then(value=>{
    if(disposed||selectionGeneration!==initial)return;
    const saved=value[KEY];if(saved&&typeof saved.bindingId==='string'){selection=saved.bindingId;mode.checked=saved.local===true;if(typeof saved.paramsText==='string'&&saved.paramsText.length<=32768)find('local-project-params').value=saved.paramsText;choices();}
    render();if(active())void refresh();
  }).catch(()=>{});
  render();
  if(!api.storage?.local&&active())void refresh();
  return {active,connected:()=>connected&&!checking&&!!selected(),selectedBindingId:()=>selection,capture,resolve,assertCaptured,
    dispose(){disposed=true;generation++;unsubscribe?.();unsubscribeConnection?.();for(const [node,event,callback] of listeners)node.removeEventListener(event,callback);},
    resourceSnapshot:()=>({subscriptions:listeners.length+Number(!!unsubscribe)+Number(!!unsubscribeConnection)})};
}
