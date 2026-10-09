import {sha256Utf8} from '../scripting/user-scripts/page-program-package.js';

const KEY='opendesk.local-project.selection.v1';
const failure=(code,message)=>Object.assign(new Error(message),{code});
export function createLocalProjectView({client,api,document:doc,onChange=()=>{}}){
  const find=id=>doc.getElementById(id),mode=find('local-project-mode'),select=find('local-project-select'),status=find('local-project-status');
  let disposed=false,generation=0,selectionGeneration=0,connected=false,epoch=null,projects=[],selection='',last=null,checking=false;
  const listeners=[];
  const active=()=>mode.value==='local';
  const selected=()=>projects.find(row=>row.bindingId===selection);
  const listen=(node,event,callback)=>{node.addEventListener(event,callback);listeners.push([node,event,callback]);};
  function render(message){
    select.hidden=!active();find('manual-source-editor').hidden=active();
    find('local-project-params-tools').hidden=!active();find('manual-project-params-tools').hidden=active();
    status.dataset.state=active()?(connected&&selected()?'connected':'disconnected'):'manual';
    status.textContent=message||(active()?connected&&selected()
      ?`${selected().name} · 已连接 · 每次运行读取本地源码${last?' · 上次读取 '+last.sourceHash:''}`
      :'本地项目未连接。启动已配置的 OpenDesk MCP，然后刷新连接。'
      :'手工草稿模式；切换项目不会覆盖未保存的编辑内容。');
    find('local-project-refresh').disabled=checking;
    onChange();
  }
  function choices(){
    select.replaceChildren(new Option('选择已授权项目',''));
    for(const row of projects)select.append(new Option(row.name,row.bindingId));
    if(selection&&!selected())select.append(new Option('上次项目（未连接）',selection));
    select.value=selection;
  }
  function persist(){const paramsText=find('local-project-params').value;if(new TextEncoder().encode(paramsText).length>32768)return;api.storage?.local?.set({[KEY]:{local:active(),bindingId:selection,paramsText}}).catch(()=>{});}
  async function refresh(){
    if(!client.requestLocalProject||disposed)return;
    const version=++generation;let errorMessage;checking=true;render();
    try{
      const state=await client.requestLocalProject('status',{});
      if(disposed||version!==generation)return;
      if(!state.connected)throw failure('E_DEV_DISCONNECTED','本地开发连接尚未建立');
      const value=await client.requestLocalProject('projects.list',{});
      if(disposed||version!==generation)return;
      if(value.providerEpoch!==state.providerEpoch||!Array.isArray(value.projects)||value.projects.length>8||
        value.projects.some(row=>typeof row.bindingId!=='string'||typeof row.name!=='string'))throw failure('E_DEV_DISCONNECTED','项目连接身份已变化，请刷新');
      connected=true;epoch=value.providerEpoch;projects=value.projects;choices();render();
    }catch(error){if(!disposed&&version===generation){connected=false;epoch=null;projects=[];choices();errorMessage=(error.code||'E_DEV_DISCONNECTED')+'：'+error.message;render(errorMessage);}}
    finally{if(version===generation){checking=false;render(errorMessage);}}
  }
  function capture(){if(!active()||!connected||!selected())throw failure('E_DEV_DISCONNECTED','请选择已连接的本地项目');return {generation,bindingId:selection,providerEpoch:epoch};}
  function assertCaptured(captured){if(disposed||!active()||!connected||captured.generation!==generation||captured.bindingId!==selection||captured.providerEpoch!==epoch)throw failure('E_DEV_CONFLICT','本地项目或连接已变化，本次未运行');}
  async function resolve(captured){
    assertCaptured(captured);
    const value=await client.requestLocalProject('project.resolve',{bindingId:captured.bindingId});
    assertCaptured(captured);
    if(value.providerEpoch!==captured.providerEpoch||value.bindingId!==captured.bindingId||!['controller','page-userscript'].includes(value.runtimeKind)||
      typeof value.sourceUtf8!=='string'||value.sourceBytes!==new TextEncoder().encode(value.sourceUtf8).length||value.sourceHash!==await sha256Utf8(value.sourceUtf8))throw failure('E_DEV_HASH','本地源码字节或执行身份不一致');
    assertCaptured(captured);last=value;render();return value;
  }
  listen(mode,'change',()=>{generation++;selectionGeneration++;checking=false;last=null;persist();render();if(active())void refresh();});
  listen(select,'change',()=>{generation++;selectionGeneration++;checking=false;selection=select.value;last=null;persist();render();});
  listen(find('local-project-refresh'),'click',()=>void refresh());
  listen(find('local-project-params'),'input',persist);
  const unsubscribe=client.subscribeLocalProjects?.(state=>{
    generation++;checking=false;connected=false;epoch=null;
    if(!disposed){render();if(state.connected)void refresh();}
  });
  const unsubscribeConnection=client.subscribeConnection?.(state=>{if(state.connected&&!disposed)void refresh();});
  const initial=selectionGeneration;
  api.storage?.local?.get(KEY).then(value=>{
    if(disposed||selectionGeneration!==initial)return;
    const saved=value[KEY];if(saved&&typeof saved.bindingId==='string'){selection=saved.bindingId;mode.value=saved.local?'local':'manual';if(typeof saved.paramsText==='string'&&saved.paramsText.length<=32768)find('local-project-params').value=saved.paramsText;choices();if(active())find('local-project-tools').open=true;}
    render();void refresh();
  }).catch(()=>{});
  render();
  if(!api.storage?.local)void refresh();
  return {active,connected:()=>connected&&!!selected(),capture,resolve,assertCaptured,
    dispose(){disposed=true;generation++;unsubscribe?.();unsubscribeConnection?.();for(const [node,event,callback] of listeners)node.removeEventListener(event,callback);},
    resourceSnapshot:()=>({subscriptions:listeners.length+Number(!!unsubscribe)+Number(!!unsubscribeConnection)})};
}
