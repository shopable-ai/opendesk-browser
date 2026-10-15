import {sha256Utf8} from '../scripting/user-scripts/page-program-package.js';
import {sourceLabel,sourceName} from '../native-agent/source-label.js';

const KEY='opendesk.local-project.selection.v1';
const HELP_URL='https://github.com/shopable-ai/opendesk-browser/blob/main/docs/api/local-projects.zh-CN.md';
const failure=(code,message)=>Object.assign(new Error(message),{code});
export function createLocalProjectView({client,api,document:doc,onChange=()=>{},preparationDelayMs=450}){
  const find=id=>doc.getElementById(id),mode=find('local-project-mode'),select=find('local-project-select'),status=find('local-project-status');
  let disposed=false,generation=0,selectionGeneration=0,connected=false,nativeConnected=false,epoch=null,projects=[],selection='',savedName='',savedSourceId='',last=null,checking=false,diagnostic='';
  let backgroundTimer=null,backgroundRead=null,backgroundKey='',backgroundError=null,prepared=null;
  const sourceUnavailable='本机 OpenDesk 已连接，但可运行源码 Provider 尚未接入。已授权的单文件会自动恢复；目录项目可在原目录执行 opendesk browser dev . 或 opendesk-dev . 接入，无需重复 Native 配对。';
  const listeners=[];
  let pollTimer=null,pollBusy=false,preparationCheck=null,preparationAgain=false,preparationError=null,nativeUpdateError=null;
  const nativeUpdateMessage='本机 OpenDesk 版本不支持此项目的源码传输，请更新本机应用后刷新。项目源码未执行。';
  const preparationLabels={ready:'已准备',updating:'正在准备',merging:'正在准备',unprepared:'等待准备','source-error':'源码有错误'};
  const active=()=>mode.checked;
  const selected=()=>projects.find(row=>row.bindingId===selection);
  const readyForRun=()=>{
    const row=selected(),state=row?.preparation?.state;
    return !!(active()&&connected&&!checking&&!nativeUpdateError&&!preparationError&&!backgroundError&&row&&
      ['controller','page-userscript'].includes(row.runtimeKind)&&
      (state==='ready'||state===undefined&&prepared?.bindingId===row.bindingId&&prepared?.providerEpoch===epoch));
  };
  const listen=(node,event,callback)=>{node.addEventListener(event,callback);listeners.push([node,event,callback]);};
  function render(message){
    const local=active(),row=selected(),preparation=row?.preparation,ready=readyForRun();
    find('developer-source-switch').dataset.mode=local?'local':'manual';
    find('local-project-tools').hidden=!local;
    find('manual-source-editor').hidden=local;
    find('local-project-params-tools').hidden=!local||row?.runtimeKind!=='controller';
    find('manual-project-params-tools').hidden=local;
    select.disabled=checking||!connected;
    const recovery=local&&(!connected||!projects.length);
    const recoveryPanel=find('local-project-recovery');
    if(recoveryPanel)recoveryPanel.hidden=!recovery;
    find('local-project-connect').hidden=!recovery||nativeConnected;
    find('local-project-guide').hidden=!recovery;
    status.dataset.state=!local?'manual':checking?'checking':!connected?
      (nativeConnected?'source-unavailable':'disconnected'):nativeUpdateError?'update-required':
      !row?'selection-needed':backgroundError||preparation?.state==='source-error'?'source-error':
      ready?'ready':'preparing';
    status.textContent=!local?'':checking?'正在检查本机连接…':message||(
      !connected?(nativeConnected?sourceUnavailable:'本地项目服务未连接；已授权的项目仍保留，恢复 Native 后自动检查。'):
      !projects.length?'暂无可运行的已授权项目。目录授权使用 opendesk browser dev .；单文件授权使用 opendesk browser project add。':
      !row?(selection?'此前项目已离线或授权变化，保留名称但不可运行；恢复来源或明确选择另一项目。':'请选择已授权项目'):
      nativeUpdateError?nativeUpdateMessage:
      backgroundError||preparation?.state==='source-error'?
        '源码有错误：'+(backgroundError?.code||preparation?.error?.code||'E_DEV_SOURCE')+'；修改后自动复查':
      preparationError?'准备状态暂不可用，正在重新核对…':
      ready?'已准备 · 点击「运行本地项目」才会执行':
      preparationLabels[preparation?.state]||'正在准备最新源码…'
    );
    const report=prepared||(preparation?.state==='ready'?preparation:null);
    const details=[
      'Chrome Native：'+(nativeConnected?'已连接':'未连接'),
      '源码 Provider：'+(connected?'已注册':'未就绪'),
      '本地测试网页：独立目标，未检测（127.0.0.1:43111）',
      epoch?'Provider Epoch：'+epoch:'',
      row?'项目绑定：'+row.bindingId+'（'+row.runtimeKind+'）':'',
      diagnostic,
      backgroundError?(backgroundError.code||'E_DEV_SOURCE')+'：'+(backgroundError.message||'准备失败'):'',
      preparation?.error?(preparation.error.code||'E_DEV_SOURCE')+'：'+(preparation.error.message||'准备失败'):'',
      report?.sourceHash?'源码 SHA-256：'+report.sourceHash:'',
      report?.inputHash?'输入版本：'+report.inputHash:'',
      preparationError?'状态读取错误：'+(preparationError.code||'E_DEV_STATUS'):'',
      last?'上次运行源码：'+last.sourceHash+'；输入版本：'+last.inputHash+'；最近运行核验：'+(last.cacheHit?'复用已准备产物':'本次准备')+
        '；编译 '+Math.round(last.timings?.webpackMs||0)+'ms；总计 '+Math.round(last.timings?.totalMs||0)+
        'ms；构建 '+(last.timings?.buildCount??'未知')+' 次':''
    ].filter(Boolean).join('；');
    if(local)status.title=details;else status.removeAttribute('title');
    const diagnostics=find('local-project-diagnostics');
    if(diagnostics)diagnostics.textContent=details;
    const refreshButton=find('local-project-refresh');
    refreshButton.disabled=checking;
    refreshButton.hidden=connected&&!!row&&ready&&!nativeUpdateError;
    onChange();
  }
  function resetBackground(){
    if(backgroundTimer!==null)clearTimeout(backgroundTimer);
    backgroundTimer=null;backgroundRead=null;backgroundKey='';backgroundError=null;prepared=null;
  }
  // The current Go aggregator may omit Node preparation metadata. Resolve only
  // an already-authorized selected binding, verify its bytes, and retain only
  // a summary. This is a read/compile, not a browser Run or a new file grant.
  function syncPreparation(){
    const row=selected(),state=row?.preparation?.state;
    if(!active()||!connected||!row){resetBackground();return;}
    const key=JSON.stringify([epoch,row.bindingId,state??null,row.preparation?.sourceRevision??null,
      row.preparation?.sourceHash??null,row.preparation?.artifactId??null]);
    if(backgroundKey===key)return;
    if(backgroundTimer!==null)clearTimeout(backgroundTimer);
    backgroundTimer=null;backgroundKey=key;backgroundError=null;prepared=null;
    if(state!==undefined)return; // Node's own ready/updating/error state is authoritative.
    const ticket={generation,epoch,bindingId:row.bindingId,key};
    backgroundTimer=setTimeout(()=>{
      backgroundTimer=null;
      const current=()=>!disposed&&active()&&connected&&generation===ticket.generation&&
        epoch===ticket.epoch&&selection===ticket.bindingId&&backgroundKey===ticket.key;
      const operation=(async()=>{
        const source=await client.requestLocalProject('project.resolve',{bindingId:ticket.bindingId});
        if(!current())return;
        if(source.providerEpoch!==ticket.epoch||source.bindingId!==ticket.bindingId||
          !['controller','page-userscript'].includes(source.runtimeKind)||
          typeof source.sourceUtf8!=='string'||!source.sourceUtf8.trim()||
          !/^[a-f0-9]{64}$/.test(source.sourceHash||'')||
          (source.inputHash!==undefined&&!/^[a-f0-9]{64}$/.test(source.inputHash))||
          source.sourceBytes!==new TextEncoder().encode(source.sourceUtf8).length||
          source.sourceHash!==await sha256Utf8(source.sourceUtf8))
          throw failure('E_DEV_HASH','准备的源码字节、版本或授权绑定不一致');
        if(!current())return;
        prepared={bindingId:ticket.bindingId,providerEpoch:ticket.epoch,
          sourceHash:source.sourceHash,inputHash:source.inputHash};
      })().catch(error=>{
        if(!current())return;
        if(error?.code==='E_NATIVE_UPDATE_REQUIRED')nativeUpdateError=error;
        else backgroundError={code:error?.code||'E_DEV_SOURCE',message:error?.message||'源码准备失败'};
      }).finally(()=>{
        if(backgroundRead===operation)backgroundRead=null;
        if(current())render();
      });
      backgroundRead=operation;
    },Math.max(0,preparationDelayMs));
  }
  function choices(){
    // Choosing the only *already authorized* project is navigation, never an execution or new authorization.
    if(!selection&&projects.length===1){selection=projects[0].bindingId;persist();}
    select.replaceChildren(new Option('选择已授权项目',''));
    const counts=new Map();
    for(const row of projects){const name=sourceName(row.name);counts.set(name,(counts.get(name)||0)+1);}
    for(const row of projects)select.append(new Option(sourceLabel(row,{kind:row.runtimeKind==='page-userscript'?'页面脚本':'',duplicate:counts.get(sourceName(row.name))>1,offline:!connected}),row.bindingId));
    if(selection&&!selected())select.append(new Option(sourceLabel({name:savedName,sourceId:savedSourceId,bindingId:selection},{offline:true}),selection));
    select.value=selection;
  }
  function persist(){
    const row=selected();
    if(row){savedName=sourceName(row.name);savedSourceId=row.sourceId||'';}
    const paramsText=find('local-project-params').value;
    if(new TextEncoder().encode(paramsText).length>32768)return;
    api.storage?.local?.set({[KEY]:{bindingId:selection,name:savedName,sourceId:savedSourceId,paramsText,localMode:active()}}).catch(()=>{});
  }
  async function refresh(){
    if(!active()||!client.requestLocalProject||disposed)return;
    const version=++generation;let errorMessage,statusKnown=false;checking=true;diagnostic='';render();
    try{
      const state=await client.requestLocalProject('status',{});
      if(disposed||version!==generation)return;
      nativeConnected=state.nativeConnected===true;
      statusKnown=true;
      if(!state.connected)throw failure(nativeConnected?'E_DEV_PROVIDER_UNAVAILABLE':'E_DEV_DISCONNECTED',nativeConnected?'本机已连接，但可运行源码 Provider 尚未注册':'本地开发连接尚未建立');
      const value=await client.requestLocalProject('projects.list',{});
      if(disposed||version!==generation)return;
      if(value.providerEpoch!==state.providerEpoch||!Array.isArray(value.projects)||value.projects.length>32||
        value.projects.some(row=>typeof row.bindingId!=='string'||typeof row.name!=='string'))throw failure('E_DEV_DISCONNECTED','项目连接身份已变化，请刷新');
      connected=true;epoch=value.providerEpoch;projects=value.projects;preparationError=null;nativeUpdateError=null;
      const unavailable=Array.isArray(value.unavailableSources)?value.unavailableSources:[];
      diagnostic=unavailable.filter(row=>row?.source==='legacy-mcp'&&/^E_[A-Z0-9_]+$/.test(row.code||''))
        .map(row=>'旧 MCP 来源暂不可用（'+row.code+'）；其它已登记来源保持可用').join('；');
      if(selected()){savedName=sourceName(selected().name);savedSourceId=selected().sourceId||'';persist();}
      choices();syncPreparation();render();
    }catch(error){if(!disposed&&version===generation){
      if(!statusKnown)nativeConnected=false;
      // An invalid/disconnected catalog cannot remain an online selection.
      // Keep only the selected project's saved label, never its stale entries.
      connected=false;epoch=null;projects=[];resetBackground();choices();
      diagnostic=`${error?.code||'E_DEV_DISCONNECTED'}：${error?.message||'连接失败'}`;
      errorMessage=error?.code==='E_DEV_PROVIDER_UNAVAILABLE'?sourceUnavailable:error?.code==='E_DEV_DISCONNECTED'
        ?'本地项目服务未连接。请检查本机 OpenDesk 连接；文件工作区、Go 单文件和 MCP 来源可分别保持各自状态。'
        :'连接失败，请检查本地服务或项目授权后重试。';
      render(errorMessage);
    }}
    finally{if(version===generation){checking=false;render(errorMessage);}}
  }
  function capture(){if(!active()||checking||!connected||!selected())throw failure('E_DEV_DISCONNECTED','请选择已连接的本地项目');if(nativeUpdateError)throw failure('E_NATIVE_UPDATE_REQUIRED',nativeUpdateMessage);if(preparationError||backgroundError||selected().preparation?.state==='source-error')throw failure('E_DEV_SOURCE','本地项目状态尚未通过核对，请修复后刷新');// Background readiness is a hint, not execution authority: a trusted Run
    // always resolves and SHA-checks the latest bytes before dispatch.
    return {generation,bindingId:selection,providerEpoch:epoch};}
  function assertCaptured(captured){if(disposed||!active()||checking||!connected||preparationError||backgroundError||nativeUpdateError||selected()?.preparation?.state==='source-error'||captured.generation!==generation||captured.bindingId!==selection||captured.providerEpoch!==epoch)throw failure('E_DEV_CONFLICT','本地项目或连接已变化，本次未运行');}
  async function assertReady(captured){while(preparationCheck)await preparationCheck;if(backgroundRead)await backgroundRead;assertCaptured(captured);}
  async function resolve(captured){
    assertCaptured(captured);
    render('正在更新');
    let value;try{value=await client.requestLocalProject('project.resolve',{bindingId:captured.bindingId});}catch(error){
      if(!disposed&&captured.generation===generation){
        if(error?.code==='E_NATIVE_UPDATE_REQUIRED'){nativeUpdateError=error;diagnostic=`${error.code}：${error.message||nativeUpdateMessage}`;render(nativeUpdateMessage);}
        else render(`源码有错误：${error.code||'E_DEV_SOURCE'}`);
      }
      throw error;
    }
    assertCaptured(captured);
    if(value.providerEpoch!==captured.providerEpoch||value.bindingId!==captured.bindingId||!['controller','page-userscript'].includes(value.runtimeKind)||
      typeof value.sourceUtf8!=='string'||!/^[a-f0-9]{64}$/.test(value.sourceHash||'')||
      (value.inputHash!==undefined&&!/^[a-f0-9]{64}$/.test(value.inputHash))||
      value.sourceBytes!==new TextEncoder().encode(value.sourceUtf8).length||value.sourceHash!==await sha256Utf8(value.sourceUtf8))throw failure('E_DEV_HASH','本地源码字节或执行身份不一致');
    await assertReady(captured);last={inputHash:value.inputHash,sourceHash:value.sourceHash,cacheHit:value.cacheHit,timings:value.timings};render();return value;
  }
  listen(mode,'change',()=>{generation++;selectionGeneration++;checking=false;connected=false;nativeConnected=false;epoch=null;last=null;diagnostic='';nativeUpdateError=null;resetBackground();persist();render();if(active())void refresh();});
  listen(select,'change',()=>{generation++;selectionGeneration++;checking=false;selection=select.value;last=null;nativeUpdateError=null;diagnostic='';resetBackground();persist();syncPreparation();render();});
  listen(find('local-project-refresh'),'click',()=>{resetBackground();void refresh();});
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
    nativeConnected=state.nativeConnected===true;
    if(state.connected&&connected&&state.providerEpoch===epoch){void refreshPreparation(true);return;}
    generation++;checking=false;connected=false;epoch=null;resetBackground();
    if(!disposed){choices();render();if(active()&&state.connected)void refresh();}
  });
  const unsubscribeConnection=client.subscribeConnection?.(state=>{if(state.connected&&!disposed&&active())void refresh();});
  const initial=selectionGeneration;
  api.storage?.local?.get(KEY).then(value=>{
    if(disposed||selectionGeneration!==initial)return;
    const saved=value[KEY];if(saved&&typeof saved.bindingId==='string'){selection=saved.bindingId;savedName=sourceName(saved.name,'之前的项目');savedSourceId=typeof saved.sourceId==='string'?saved.sourceId:'';/* Restoring a UI preference does not authorize or execute. */if(saved.localMode===true)mode.checked=true;if(typeof saved.paramsText==='string'&&saved.paramsText.length<=32768)find('local-project-params').value=saved.paramsText;choices();}
    render();if(active())void refresh();
  }).catch(()=>{});
  render();
  // Metadata only; polling does not resolve/compile source or dispatch a run.
  const catalogIdentity=rows=>JSON.stringify(rows.map(row=>[row.bindingId,row.name,row.runtimeKind,row.source,row.sourceId,row.workspaceId]).sort((a,b)=>a[0].localeCompare(b[0])));
  function refreshPreparation(repeatIfBusy=false){
    if(disposed||!active()||checking)return;
    // Recover even when the provider's online notification preceded this view.
    // This reads status only until a source is available; it never runs code.
    if(!connected){void refresh();return;}
    if(pollBusy){if(repeatIfBusy)preparationAgain=true;return preparationCheck;}
    const version=generation;pollBusy=true;
    preparationCheck=Promise.resolve().then(async()=>{let followups=0;try{do{preparationAgain=false;
      const value=await client.requestLocalProject('projects.list',{});if(disposed||version!==generation)return;if(value.providerEpoch!==epoch){void refresh();return;}
      if(!Array.isArray(value.projects)||value.projects.length>32||value.projects.some(row=>typeof row?.bindingId!=='string'||typeof row?.name!=='string'))throw failure('E_DEV_DISCONNECTED','项目状态身份无效');
      if(catalogIdentity(value.projects)!==catalogIdentity(projects)){void refresh();return;}
      projects=value.projects;preparationError=null;syncPreparation();render();
    }while(preparationAgain&&followups++<1&&!disposed&&active()&&connected&&version===generation);}
    catch(error){if(!disposed&&version===generation){
      preparationError=error;generation++;
      if(['E_DEV_DISCONNECTED','E_NATIVE_DISCONNECTED','E_PROVIDER_DISCONNECTED'].includes(error?.code)){connected=false;resetBackground();choices();render('本地来源离线');}
      else{diagnostic=`${error?.code||'E_DEV_STATUS'}：状态暂时不可用，稍后重试`;render();}
    }}finally{pollBusy=false;preparationCheck=null;}});
    return preparationCheck;
  }
  pollTimer=setInterval(refreshPreparation,2000);
  if(!api.storage?.local&&active())void refresh();
  return {active,connected:()=>connected&&!checking&&!nativeUpdateError&&!!selected(),readyForRun,selectedBindingId:()=>selection,providerEpoch:()=>epoch,
    preparationIdentity:()=>{const p=selected()?.preparation;return JSON.stringify([p?.state??null,p?.inputHash??prepared?.inputHash??null,p?.sourceHash??prepared?.sourceHash??null,p?.buildHash??null]);},
    selectedProject:()=>{const row=selected();return row?{name:sourceName(row.name),sourceId:row.sourceId||''}:null;},
    capture,resolve,assertCaptured,assertReady,
    dispose(){disposed=true;generation++;clearInterval(pollTimer);resetBackground();unsubscribe?.();unsubscribeConnection?.();for(const [node,event,callback] of listeners)node.removeEventListener(event,callback);},
    resourceSnapshot:()=>({subscriptions:listeners.length+Number(!!unsubscribe)+Number(!!unsubscribeConnection)})};
}
