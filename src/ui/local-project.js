import {sha256Utf8} from '../scripting/user-scripts/page-program-package.js';
import {sourceLabel,sourceName} from '../native-agent/source-label.js';

const KEY='opendesk.local-project.selection.v1';
const HELP_URL='https://github.com/shopable-ai/opendesk-browser/blob/main/docs/api/local-projects.zh-CN.md';
const failure=(code,message)=>Object.assign(new Error(message),{code});
export function createLocalProjectView({client,api,document:doc,onChange=()=>{},preparationDelayMs=450}){
  const find=id=>doc.getElementById(id),mode=find('local-project-mode'),select=find('local-project-select'),status=find('local-project-status');
  let disposed=false,generation=0,selectionGeneration=0,connected=false,nativeConnected=false,epoch=null,projects=[],workspaces=[],selection='',savedName='',savedSourceId='',last=null,checking=false,diagnostic='';
  let backgroundTimer=null,backgroundRead=null,backgroundKey='',backgroundError=null,prepared=null,workspaceOpenError=null;
  const sourceUnavailable='本机 OpenDesk 已连接，但可运行源码 Provider 尚未接入。已授权的单文件会自动恢复；目录项目可在原目录执行 opendesk browser dev . 或 opendesk-dev . 接入，无需重复 Native 配对。';
  const listeners=[];
  let pollTimer=null,pollBusy=false,preparationCheck=null,preparationAgain=false,preparationError=null,nativeUpdateError=null,workspaceCheck=null,catalogVersion=null;
  const nativeUpdateMessage='本机 OpenDesk 版本不支持此项目的源码传输，请更新本机应用后刷新。项目源码未执行。';
  const preparationLabels={ready:'已准备',updating:'正在准备',merging:'正在准备',unprepared:'等待准备','source-error':'源码有错误'};
  const active=()=>mode.checked;
  // Directory discovery and executable-source registration can arrive in either
  // order. Associate only one current program with the same authorized source;
  // labels and earlier successful bytes are never execution identities.
  const programsFor=workspace=>projects.filter(row=>
    !(workspace.sourceId&&row.sourceId&&workspace.sourceId!==row.sourceId)&&
    !(workspace.workspaceId&&row.workspaceId&&workspace.workspaceId!==row.workspaceId)&&
    (workspace.sourceId&&row.sourceId===workspace.sourceId||workspace.workspaceId&&row.workspaceId===workspace.workspaceId));
  const rows=()=>[...projects,...workspaces.filter(workspace=>programsFor(workspace).length!==1)];
  const selected=()=>rows().find(row=>row.bindingId===selection&&
    !(row.fileOnly&&savedSourceId&&row.sourceId&&savedSourceId!==row.sourceId));
  const runnable=()=>selected()&&!selected().fileOnly;
  const selectionKind=()=>selected()?.fileOnly?'file-workspace':selected()?'program':'missing';
  const canOpenWorkspace=()=>active()&&!disposed&&!checking&&nativeConnected&&selected()?.fileOnly===true;
  const errorText=(error,fallback='E_DEV_SOURCE')=>[error?.code||fallback,typeof error?.message==='string'?error.message.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,800):''].filter(Boolean).join('：');
  let rendered='',choiceIdentity='';
  const canAttemptRun=()=>active()&&connected&&!checking&&!nativeUpdateError&&!preparationError&&!backgroundError&&
    !!runnable()&&selected()?.preparation?.state!=='source-error';
  const readyForRun=()=>{
    const row=selected(),state=row?.preparation?.state;
    return !!(active()&&connected&&!checking&&!nativeUpdateError&&!preparationError&&!backgroundError&&row&&
      ['controller','page-userscript'].includes(row.runtimeKind||prepared?.runtimeKind)&&
      (state==='ready'||state===undefined&&prepared?.bindingId===row.bindingId&&prepared?.providerEpoch===epoch));
  };
  const listen=(node,event,callback)=>{node.addEventListener(event,callback);listeners.push([node,event,callback]);};
  function render(message){
    const local=active(),row=selected(),preparation=row?.preparation,ready=readyForRun();
    const identity=JSON.stringify([local,checking,connected,nativeConnected,epoch,selection,row,workspaces.length,row?.fileOnly?programsFor(row).length:null,diagnostic,last,preparationError?.code,nativeUpdateError?.code,backgroundError,prepared,workspaceOpenError,message]);
    if(identity===rendered)return;
    rendered=identity;
    find('developer-source-switch').dataset.mode=local?'local':'manual';
    find('local-project-tools').hidden=!local;
    find('manual-source-editor').hidden=local;
    find('local-project-params-tools').hidden=!local||row?.runtimeKind!=='controller';
    find('manual-project-params-tools').hidden=local;
    const intro=find('local-project-intro');
    if(intro)intro.textContent='本地项目与直接编辑使用同一运行流程；先准备所选入口及多文件依赖，再点击「运行本地项目」执行。打开文件仅用于编辑。';
    select.disabled=checking||(!connected&&!workspaces.length);
    find('local-project-connect').textContent=row?.fileOnly?'打开文件工作区 ↗':'连接本机 OpenDesk ↗';
    find('local-project-connect').disabled=row?.fileOnly?!canOpenWorkspace():false;
    const recovery=local&&(!connected||!projects.length||row?.fileOnly);
    const recoveryPanel=find('local-project-recovery');
    if(recoveryPanel)recoveryPanel.hidden=!recovery;
    find('local-project-connect').hidden=!recovery||(nativeConnected&&!row?.fileOnly);
    find('local-project-guide').hidden=!recovery;
    status.dataset.state=!local?'manual':checking?'checking':row?.fileOnly?'entry-unavailable':!connected?
      (workspaces.length?'selection-needed':nativeConnected?'source-unavailable':'disconnected'):nativeUpdateError?'update-required':
      !row?'selection-needed':backgroundError||preparation?.state==='source-error'?'source-error':
      ready?'ready':'preparing';
    status.textContent=!local?'':checking?'正在检查本机连接…':message||(
      row?.fileOnly?(workspaceOpenError?.bindingId===row.bindingId?workspaceOpenError.message:programsFor(row).length>1?'所选目录有多个运行入口；请选择具体程序后运行。':'所选目录已连接，尚未发现可运行入口。请核对该项目的 package.json 中 opendesk 入口及源码 Provider 连接；配置完成后由原目录 opendesk-dev . 接入。打开文件仅用于辅助编辑，不会运行代码。'):
      !connected&&workspaces.length?'请选择已授权项目；等待该项目的运行入口与源码 Provider 就绪。':
      !connected?(nativeConnected?sourceUnavailable:'本地项目服务未连接；已授权的项目仍保留，恢复 Native 后自动检查。'):
      !projects.length?'暂无可运行的已授权项目。目录授权使用 opendesk browser dev .；单文件授权使用 opendesk browser project add。':
      !row?(selection?'此前项目已离线或授权变化，保留名称但不可运行；恢复来源或明确选择另一项目。':'请选择已授权项目'):
      nativeUpdateError?nativeUpdateMessage:
      backgroundError||preparation?.state==='source-error'?
        '源码有错误：'+errorText(backgroundError||preparation?.error)+'；请修改所示入口或项目配置，保存后自动复查':
      preparationError?'准备状态暂不可用，正在重新核对…':
      ready?(preparation?.state==='ready'?'已准备 · 点击「运行本地项目」才会执行':'源码已核验 · 运行前将再次读取最新版本'):
      preparationLabels[preparation?.state]||'正在准备最新源码…'
    );
    const report=prepared||(preparation?.state==='ready'?preparation:null);
    const details=[
      'Chrome Native：'+(nativeConnected?'已连接':'未连接'),
      '源码 Provider：'+(connected?'已注册':'未就绪'),
      '本地测试网页：独立目标，未检测（127.0.0.1:43111）',
      epoch?'Provider Epoch：'+epoch:'',
      row?'项目绑定：'+row.bindingId+'（'+(row.fileOnly?'文件工作区':row.runtimeKind)+'）':'',
      diagnostic,
      backgroundError?(backgroundError.code||'E_DEV_SOURCE')+'：'+(backgroundError.message||'准备失败'):'',
      preparation?.error?(preparation.error.code||'E_DEV_SOURCE')+'：'+(preparation.error.message||'准备失败'):'',
      report?.sourceHash?'源码 SHA-256：'+report.sourceHash:'',
      report?.sourceRevision||report?.inputHash?'输入版本：'+(report.sourceRevision||report.inputHash):'',
      preparationError?'状态读取错误：'+(preparationError.code||'E_DEV_STATUS'):'',
      last?'最近读取源码（不代表已执行）：'+last.sourceHash+'；输入版本：'+last.inputHash+'；源码读取：'+(last.cacheHit?'复用已准备产物':'本次准备')+
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
    if(!active()||!connected||!row||row.fileOnly){resetBackground();return;}
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
          sourceHash:source.sourceHash,inputHash:source.inputHash,runtimeKind:source.runtimeKind};
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
    const workspace=workspaces.find(row=>row.bindingId===selection);
    const matches=workspace&&(!savedSourceId||!workspace.sourceId||savedSourceId===workspace.sourceId)?
      programsFor(workspace).filter(row=>!savedSourceId||!row.sourceId||savedSourceId===row.sourceId):[];
    if(matches.length===1){
      generation++;selection=matches[0].bindingId;last=null;workspaceOpenError=null;
      resetBackground();persist();
    }
    const available=rows();
    if(!selection&&available.length===1){selection=available[0].bindingId;persist();}
    const identity=JSON.stringify([available.map(row=>[row.bindingId,row.name,row.sourceId,row.runtimeKind,row.fileOnly,!connected&&!row.fileOnly]),selection&&!selected()?[selection,savedName,savedSourceId]:null]);
    if(identity===choiceIdentity){if(select.value!==selection)select.value=selection;return;}
    choiceIdentity=identity;
    select.replaceChildren(new Option('选择已授权项目',''));
    const counts=new Map();
    for(const row of available){const name=sourceName(row.name);counts.set(name,(counts.get(name)||0)+1);}
    for(const row of available)select.append(new Option(sourceLabel(row,{kind:row.fileOnly?'文件工作区':row.runtimeKind==='page-userscript'?'页面脚本':'',duplicate:counts.get(sourceName(row.name))>1,offline:!connected&&!row.fileOnly}),row.bindingId));
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
  async function readWorkspaces(){
    try{
      const value=await client.requestLocalProject('workspaces.list',{});
      if(typeof value?.sessionId!=='string'||value.sessionId.length<16||value.sessionId.length>128||!Array.isArray(value.workspaces)||value.workspaces.length>32)return [];
      const ids=new Set();
      return value.workspaces.filter(row=>{
        if(!row||!/^workspace-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.workspaceId)||
          typeof row.name!=='string'||!sourceName(row.name,'')||!['read-only','read-write'].includes(row.access)||
          (row.sourceId!==undefined&&!/^source-[a-f0-9]{24}$/.test(row.sourceId))||
          (row.leaseEpoch!==undefined&&(typeof row.leaseEpoch!=='string'||!/^[A-Za-z0-9._:-]{16,100}$/.test(row.leaseEpoch)))||ids.has(row.workspaceId))return false;
        ids.add(row.workspaceId);return true;
      }).map(row=>({workspaceId:row.workspaceId,name:sourceName(row.name),sourceId:row.sourceId||'',access:row.access,leaseEpoch:row.leaseEpoch,
        sessionId:value.sessionId,bindingId:'file-workspace:'+row.workspaceId,fileOnly:true})).sort((a,b)=>a.workspaceId.localeCompare(b.workspaceId));
    }catch{return [];}
  }
  function refreshWorkspaces(){
    if(workspaceCheck)return;
    const version=generation;
    // Optional file metadata must not delay runnable-source readiness or its pre-run checks.
    workspaceCheck=readWorkspaces().then(files=>{
      if(disposed||!nativeConnected||version!==generation||JSON.stringify(files)===JSON.stringify(workspaces))return;
      workspaces=files;
      if(catalogVersion!==generation){choices();render();}
    }).finally(()=>{workspaceCheck=null;});
  }
  async function refresh({quiet=false}={}){
    if(!active()||!client.requestLocalProject||disposed)return;
    const version=quiet?generation:++generation;
    let errorMessage,statusKnown=false;
    catalogVersion=version;
    if(!quiet){checking=true;diagnostic='';render();}
    try{
      const state=await client.requestLocalProject('status',{});
      if(disposed||version!==generation)return;
      nativeConnected=state.nativeConnected===true;
      if(nativeConnected)refreshWorkspaces();else workspaces=[];
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
      if(selected()&&(savedName!==sourceName(selected().name)||savedSourceId!==(selected().sourceId||'')))persist();
    }catch(error){if(!disposed&&version===generation){
      if(!statusKnown){nativeConnected=false;workspaces=[];}
      connected=false;epoch=null;projects=[];
      resetBackground();
      diagnostic=`${error?.code||'E_DEV_DISCONNECTED'}：${error?.message||'连接失败'}`;
      errorMessage=error?.code==='E_DEV_PROVIDER_UNAVAILABLE'?sourceUnavailable:error?.code==='E_DEV_DISCONNECTED'
        ?'本地项目服务未连接。请检查本机 OpenDesk 连接；文件工作区、Go 单文件和 MCP 来源可分别保持各自状态。'
        :'连接失败，请检查本地服务或项目授权后重试。';
    }}
    finally{if(catalogVersion===version)catalogVersion=null;if(!disposed&&version===generation){
      checking=false;choices();syncPreparation();render(workspaces.length?undefined:errorMessage);
    }}
  }
  function capture(){if(!active()||checking||!connected||!runnable())throw failure('E_DEV_DISCONNECTED','请选择已连接的本地项目');if(nativeUpdateError)throw failure('E_NATIVE_UPDATE_REQUIRED',nativeUpdateMessage);if(preparationError||backgroundError||selected().preparation?.state==='source-error')throw failure('E_DEV_SOURCE','本地项目状态尚未通过核对，请修复后刷新');// Background readiness is a hint, not execution authority: a trusted Run
    // always resolves and SHA-checks the latest bytes before dispatch.
    const p=selected()?.preparation;
    return {generation,bindingId:selection,providerEpoch:epoch,
      ...(p?.state==='ready'&&/^[a-f0-9]{64}$/.test(p.sourceHash||'')?{preparedSourceHash:p.sourceHash}:{}),
      ...(p?.state==='ready'&&/^[a-f0-9]{64}$/.test(p.sourceRevision||'')?{preparedSourceRevision:p.sourceRevision}:{})};}
  function assertCaptured(captured){if(disposed||!active()||checking||!connected||!runnable()||preparationError||backgroundError||nativeUpdateError||selected()?.preparation?.state==='source-error'||captured.generation!==generation||captured.bindingId!==selection||captured.providerEpoch!==epoch)throw failure('E_DEV_CONFLICT','本地项目或连接已变化，本次未运行');}
  async function assertReady(captured,expectedSourceHash=null){
    while(preparationCheck)await preparationCheck;
    if(backgroundRead)await backgroundRead;
    assertCaptured(captured);
    const preparation=selected()?.preparation;
    // An authoritative in-progress build cannot dispatch previously resolved
    // bytes, even if the older SHA-256 remains internally consistent.
    if(preparation?.state!==undefined&&preparation.state!=='ready')
      throw failure('E_DEV_CONFLICT','最新源码尚未准备就绪；本次未运行，请在准备完成后重新运行');
    if(preparation?.state==='ready'&&(
      captured.preparedSourceHash&&preparation.sourceHash&&captured.preparedSourceHash!==preparation.sourceHash||
      captured.preparedSourceRevision&&preparation.sourceRevision&&captured.preparedSourceRevision!==preparation.sourceRevision||
      expectedSourceHash&&/^[a-f0-9]{64}$/.test(preparation.sourceHash||'')&&expectedSourceHash!==preparation.sourceHash))
      throw failure('E_DEV_CONFLICT','准备版本在运行前发生变化；本次未运行，请重新运行最新源码');
  }
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
    await assertReady(captured,value.sourceHash);
    const row=selected(),currentPreparation=row?.preparation;
    if((row?.runtimeKind&&row.runtimeKind!==value.runtimeKind)||
      (captured.preparedSourceHash&&captured.preparedSourceHash!==value.sourceHash)||
      (captured.preparedSourceRevision&&captured.preparedSourceRevision!==(value.sourceRevision??value.inputHash))||
      (currentPreparation?.state==='ready'&&/^[a-f0-9]{64}$/.test(currentPreparation.sourceHash||'')&&currentPreparation.sourceHash!==value.sourceHash)||
      (captured.preparedSourceRevision&&/^[a-f0-9]{64}$/.test(currentPreparation?.sourceRevision||'')&&captured.preparedSourceRevision!==currentPreparation.sourceRevision))
      throw failure('E_DEV_CONFLICT','本地项目运行类型或源码版本已变化；等待准备完成后明确重新运行');
    last={inputHash:value.inputHash,sourceHash:value.sourceHash,cacheHit:value.cacheHit,timings:value.timings};render();return value;
  }
  listen(mode,'change',()=>{generation++;selectionGeneration++;checking=false;connected=false;nativeConnected=false;epoch=null;projects=[];workspaces=[];last=null;diagnostic='';nativeUpdateError=null;workspaceOpenError=null;resetBackground();persist();render();if(active())void refresh();});
  listen(select,'change',()=>{generation++;selectionGeneration++;checking=false;if(selection!==select.value)savedSourceId='';selection=select.value;last=null;nativeUpdateError=null;workspaceOpenError=null;diagnostic='';resetBackground();persist();syncPreparation();render();});
  listen(find('local-project-refresh'),'click',()=>{resetBackground();void refresh();});
  function openWorkspace(event){
    const row=selected(),version=generation;
    if(!event?.isTrusted||!canOpenWorkspace())return false;
    const unable=error=>{
      if(disposed||!active()||generation!==version||selection!==row.bindingId)return;
      workspaceOpenError={bindingId:row.bindingId,message:'未能打开文件工作区（'+errorText(error,'E_WORKSPACE_OPEN')+'）。请点击「打开文件工作区」重试；若目录已离线，在原目录重新执行 opendesk-dev . 后刷新。'};
      render();
    };
    if(workspaceOpenError){workspaceOpenError=null;render();}
    try{
      const query=row.sourceId?'sourceId='+encodeURIComponent(row.sourceId):'workspaceId='+encodeURIComponent(row.workspaceId);
      void Promise.resolve(api.tabs.create({url:api.runtime.getURL('native-agent/workspace.html')+'?'+query})).catch(unable);
    }catch(error){unable(error);}
    return true;
  }
  listen(find('local-project-connect'),'click',event=>{
    if(!event.isTrusted||!active()||disposed)return;
    const unable=()=>{if(!disposed&&active())status.textContent='未能打开本机连接设置。可在 Chrome 扩展详情中打开「扩展选项」。';};
    try{
      const row=selected();
      if(row?.fileOnly){openWorkspace(event);return;}
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
    if(disposed)return;
    const same=state.connected===connected&&(state.nativeConnected===true)===nativeConnected&&(!state.connected||state.providerEpoch===epoch);
    if(same){if(active())void refreshPreparation(true);return;}
    nativeConnected=state.nativeConnected===true;
    if(state.connected&&connected&&state.providerEpoch===epoch){
      if(!nativeConnected&&workspaces.length){workspaces=[];choices();render();}
      void refreshPreparation(true);return;
    }
    generation++;checking=false;connected=false;epoch=null;projects=[];workspaces=[];resetBackground();
    choices();render();if(active()&&state.connected)void refresh({quiet:true});
  });
  const unsubscribeConnection=client.subscribeConnection?.(state=>{if(state.connected&&!disposed&&active())void refreshPreparation(true);});
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
    if(pollBusy){if(repeatIfBusy)preparationAgain=true;return preparationCheck;}
    const version=generation;pollBusy=true;
    preparationCheck=Promise.resolve().then(async()=>{let followups=0;try{do{preparationAgain=false;
      if(!connected){await refresh({quiet:true});return;}
      if(nativeConnected)refreshWorkspaces();
      const value=await client.requestLocalProject('projects.list',{});if(disposed||version!==generation)return;if(value.providerEpoch!==epoch){generation++;void refresh({quiet:true});return;}
      if(!Array.isArray(value.projects)||value.projects.length>32||value.projects.some(row=>typeof row?.bindingId!=='string'||typeof row?.name!=='string'))throw failure('E_DEV_DISCONNECTED','项目状态身份无效');
      if(catalogIdentity(value.projects)!==catalogIdentity(projects)){generation++;void refresh({quiet:true});return;}
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
  return {active,connected:()=>connected&&!checking&&!nativeUpdateError&&!!runnable(),canAttemptRun,readyForRun,selectionKind,canOpenWorkspace,openWorkspace,selectedBindingId:()=>selection,providerEpoch:()=>epoch,
    preparationIdentity:()=>{const p=selected()?.preparation;return JSON.stringify([p?.state??null,p?.sourceRevision??prepared?.inputHash??null,p?.sourceHash??prepared?.sourceHash??null,p?.artifactId??null]);},
    selectedProject:()=>{const row=selected();return row?{name:sourceName(row.name),sourceId:row.sourceId||''}:null;},
    capture,resolve,assertCaptured,assertReady,
    dispose(){disposed=true;generation++;clearInterval(pollTimer);resetBackground();unsubscribe?.();unsubscribeConnection?.();for(const [node,event,callback] of listeners)node.removeEventListener(event,callback);},
    resourceSnapshot:()=>({subscriptions:listeners.length+Number(!!unsubscribe)+Number(!!unsubscribeConnection)})};
}
