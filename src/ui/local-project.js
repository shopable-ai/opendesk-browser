import {sha256Utf8} from '../scripting/user-scripts/page-program-package.js';
import {sourceLabel,sourceName} from '../native-agent/source-label.js';

const KEY='opendesk.local-project.selection.v1';
const HELP_URL='https://github.com/shopable-ai/opendesk-browser/blob/main/docs/api/local-projects.zh-CN.md';
const failure=(code,message)=>Object.assign(new Error(message),{code});
export function createLocalProjectView({client,api,document:doc,onChange=()=>{}}){
  const find=id=>doc.getElementById(id),mode=find('local-project-mode'),select=find('local-project-select'),status=find('local-project-status');
  let disposed=false,generation=0,selectionGeneration=0,connected=false,epoch=null,projects=[],selection='',savedName='',savedSourceId='',last=null,checking=false,diagnostic='';
  const listeners=[];
  let pollTimer=null,pollBusy=false,preparationCheck=null,preparationAgain=false,preparationError=null;
  const preparationLabels={ready:'已就绪',updating:'正在更新',merging:'正在合并修改','source-error':'源码有错误'};
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
      !connected?'本地项目来源尚未连接；已保存的项目名称只用于离线展示，不代表可读取或运行。'
      :projects.length===0?'暂无可运行的已授权程序。在 OpenDesk 菜单「浏览器连接」中授权 JS 文件后刷新；文件工作区可单独使用，也可用 opendesk browser 接入本地目录。'
      :selected()?preparationLabels[selected().preparation?.state]||'已连接 · 保存后自动准备，点击运行执行最新源码'
      :selection?'此前项目已离线或授权发生变化，请核验后重新选择。':'请选择已授权项目');
    const prepared=selected()?.preparation;
    const detail=[diagnostic,prepared?.error?`${prepared.error.code}：${prepared.error.message}`:'',last?`输入版本：${last.inputHash}；源码 SHA-256：${last.sourceHash}；${last.cacheHit?'复用已准备产物':'本次准备'}；编译 ${Math.round(last.timings?.webpackMs||0)}ms；复核 ${Math.round(last.timings?.totalMs||0)}ms；构建 ${last.timings?.buildCount??'未知'} 次`:''].filter(Boolean).join('；');
    if(active()&&detail)status.title=detail;else status.removeAttribute('title');
    const details=find('local-project-diagnostics');if(details)details.textContent=detail||'运行后显示版本与准备耗时。';
    find('local-project-refresh').disabled=checking;
    onChange();
  }
  function choices(){
    // Choosing the only *already authorized* project is navigation, never an execution or new authorization.
    if(!selection&&projects.length===1){selection=projects[0].bindingId;persist();}
    select.replaceChildren(new Option('选择已授权项目',''));
    const counts=new Map();
    for(const row of projects){const name=sourceName(row.name);counts.set(name,(counts.get(name)||0)+1);}
    for(const row of projects)select.append(new Option(sourceLabel(row,{kind:row.runtimeKind==='page-userscript'?'页面脚本':'',duplicate:counts.get(sourceName(row.name))>1}),row.bindingId));
    if(selection&&!selected())select.append(new Option(sourceLabel({name:savedName,sourceId:savedSourceId,bindingId:selection},{offline:true}),selection));
    select.value=selection;
  }
  function persist(){
    const row=selected();
    if(row){savedName=sourceName(row.name);savedSourceId=row.sourceId||'';}
    const paramsText=find('local-project-params').value;
    if(new TextEncoder().encode(paramsText).length>32768)return;
    api.storage?.local?.set({[KEY]:{bindingId:selection,name:savedName,sourceId:savedSourceId,paramsText}}).catch(()=>{});
  }
  async function refresh(){
    if(!active()||!client.requestLocalProject||disposed)return;
    const version=++generation;let errorMessage;checking=true;diagnostic='';render();
    try{
      const state=await client.requestLocalProject('status',{});
      if(disposed||version!==generation)return;
      if(!state.connected)throw failure('E_DEV_DISCONNECTED','本地开发连接尚未建立');
      const value=await client.requestLocalProject('projects.list',{});
      if(disposed||version!==generation)return;
      if(value.providerEpoch!==state.providerEpoch||!Array.isArray(value.projects)||value.projects.length>32||
        value.projects.some(row=>typeof row.bindingId!=='string'||typeof row.name!=='string'))throw failure('E_DEV_DISCONNECTED','项目连接身份已变化，请刷新');
      connected=true;epoch=value.providerEpoch;projects=value.projects;preparationError=null;
      const unavailable=Array.isArray(value.unavailableSources)?value.unavailableSources:[];
      diagnostic=unavailable.filter(row=>row?.source==='legacy-mcp'&&/^E_[A-Z0-9_]+$/.test(row.code||''))
        .map(row=>'旧 MCP 来源暂不可用（'+row.code+'）；其它已登记来源保持可用').join('；');
      if(selected()){savedName=sourceName(selected().name);savedSourceId=selected().sourceId||'';persist();}
      choices();render();
    }catch(error){if(!disposed&&version===generation){
      connected=false;epoch=null;projects=[];choices();
      diagnostic=`${error?.code||'E_DEV_DISCONNECTED'}：${error?.message||'连接失败'}`;
      errorMessage=error?.code==='E_DEV_DISCONNECTED'
        ?'本地项目服务未连接。请检查本机 OpenDesk 连接；文件工作区、Go 单文件和 MCP 来源可分别保持各自状态。'
        :'连接失败，请检查本地服务或项目授权后重试。';
      render(errorMessage);
    }}
    finally{if(version===generation){checking=false;render(errorMessage);}}
  }
  function capture(){if(!active()||checking||!connected||!selected())throw failure('E_DEV_DISCONNECTED','请选择已连接的本地项目');if(preparationError||selected().preparation?.state==='source-error')throw failure('E_DEV_SOURCE','本地项目状态尚未通过核对，请修复后刷新');return {generation,bindingId:selection,providerEpoch:epoch};}
  function assertCaptured(captured){if(disposed||!active()||checking||!connected||preparationError||selected()?.preparation?.state==='source-error'||captured.generation!==generation||captured.bindingId!==selection||captured.providerEpoch!==epoch)throw failure('E_DEV_CONFLICT','本地项目或连接已变化，本次未运行');}
  async function assertReady(captured){while(preparationCheck)await preparationCheck;assertCaptured(captured);}
  async function resolve(captured){
    assertCaptured(captured);
    render('正在更新');
    let value;try{value=await client.requestLocalProject('project.resolve',{bindingId:captured.bindingId});}catch(error){render(`源码有错误：${error.code||'E_DEV_SOURCE'}`);throw error;}
    assertCaptured(captured);
    if(value.providerEpoch!==captured.providerEpoch||value.bindingId!==captured.bindingId||!['controller','page-userscript'].includes(value.runtimeKind)||
      typeof value.sourceUtf8!=='string'||value.sourceBytes!==new TextEncoder().encode(value.sourceUtf8).length||value.sourceHash!==await sha256Utf8(value.sourceUtf8))throw failure('E_DEV_HASH','本地源码字节或执行身份不一致');
    await assertReady(captured);last=value;render();return value;
  }
  listen(mode,'change',()=>{generation++;selectionGeneration++;checking=false;connected=false;epoch=null;last=null;diagnostic='';persist();render();if(active())void refresh();});
  listen(select,'change',()=>{generation++;selectionGeneration++;checking=false;selection=select.value;last=null;persist();render();});
  listen(find('local-project-refresh'),'click',()=>void refresh());
  listen(find('local-project-connect'),'click',event=>{
    if(!event.isTrusted||!active()||disposed)return;
    const unable=()=>{if(!disposed&&active())status.textContent='未能打开本机连接设置。可在 Chrome 扩展详情中打开「扩展选项」。';};
    try{
      if(typeof api.runtime?.openOptionsPage!=='function')return unable();
      void Promise.resolve(api.runtime.openOptionsPage()).catch(unable);
    }catch{unable();}
  });
  listen(find('local-project-guide-open'),'click',event=>{
    if(!event.isTrusted||!active())return;
    const unable=()=>{status.textContent='未能打开文档。请查看仓库 docs/api/quickstart.zh-CN.md 的「首次配置」章节。';};
    try {
      const opened=api.tabs?.create?.({url:HELP_URL});
      if(!opened)return unable();
      void Promise.resolve(opened).catch(unable);
    }catch{unable();}
  });
  listen(find('local-project-params'),'input',persist);
  const unsubscribe=client.subscribeLocalProjects?.(state=>{
    if(state.connected&&connected&&state.providerEpoch===epoch){void refreshPreparation();return;}
    generation++;checking=false;connected=false;epoch=null;projects=[];
    if(!disposed){choices();render();if(active()&&state.connected)void refresh();}
  });
  const unsubscribeConnection=client.subscribeConnection?.(state=>{if(state.connected&&!disposed&&active())void refresh();});
  const initial=selectionGeneration;
  api.storage?.local?.get(KEY).then(value=>{
    if(disposed||selectionGeneration!==initial)return;
    const saved=value[KEY];if(saved&&typeof saved.bindingId==='string'){selection=saved.bindingId;savedName=sourceName(saved.name,'之前的项目');savedSourceId=typeof saved.sourceId==='string'?saved.sourceId:'';/* The editor is the safe default on every new Sidebar session. */if(typeof saved.paramsText==='string'&&saved.paramsText.length<=32768)find('local-project-params').value=saved.paramsText;choices();}
    render();if(active())void refresh();
  }).catch(()=>{});
  render();
  // Metadata only; polling does not resolve/compile source or dispatch a run.
  const catalogIdentity=rows=>JSON.stringify(rows.map(row=>[row.bindingId,row.name,row.runtimeKind,row.source,row.sourceId,row.workspaceId]).sort((a,b)=>a[0].localeCompare(b[0])));
  function refreshPreparation(){
    if(disposed||!active()||checking||!connected)return;
    if(pollBusy){preparationAgain=true;return preparationCheck;}
    const version=generation;pollBusy=true;
    preparationCheck=Promise.resolve().then(async()=>{try{do{preparationAgain=false;
      const value=await client.requestLocalProject('projects.list',{});if(disposed||version!==generation)return;if(value.providerEpoch!==epoch){void refresh();return;}
      if(!Array.isArray(value.projects)||value.projects.length>32||value.projects.some(row=>typeof row?.bindingId!=='string'||typeof row?.name!=='string'))throw failure('E_DEV_DISCONNECTED','项目状态身份无效');
      if(catalogIdentity(value.projects)!==catalogIdentity(projects)){void refresh();return;}
      projects=value.projects;preparationError=null;render();
    }while(preparationAgain&&!disposed&&active()&&connected&&version===generation);}
    catch(error){if(!disposed&&version===generation){
      preparationError=error;generation++;
      if(['E_DEV_DISCONNECTED','E_NATIVE_DISCONNECTED','E_PROVIDER_DISCONNECTED'].includes(error?.code)){connected=false;render('本地来源离线');}
      else{diagnostic=`${error?.code||'E_DEV_STATUS'}：状态暂时不可用，稍后重试`;render();}
    }}finally{pollBusy=false;preparationCheck=null;}});
    return preparationCheck;
  }
  pollTimer=setInterval(refreshPreparation,2000);
  if(!api.storage?.local&&active())void refresh();
  return {active,connected:()=>connected&&!checking&&!!selected(),selectedBindingId:()=>selection,providerEpoch:()=>epoch,
    selectedProject:()=>{const row=selected();return row?{name:sourceName(row.name),sourceId:row.sourceId||''}:null;},
    capture,resolve,assertCaptured,assertReady,
    dispose(){disposed=true;generation++;clearInterval(pollTimer);unsubscribe?.();unsubscribeConnection?.();for(const [node,event,callback] of listeners)node.removeEventListener(event,callback);},
    resourceSnapshot:()=>({subscriptions:listeners.length+Number(!!unsubscribe)+Number(!!unsubscribeConnection)})};
}
