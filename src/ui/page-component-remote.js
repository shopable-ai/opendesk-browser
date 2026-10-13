// Existing component editor + existing Broker for automatic SHA-fixed ESM.
// Run/Save can prepare new versions; installed revisions remain strictly offline.
// Manual preparation and lock selection remain optional advanced diagnostics.
import {createChromePermissionConsent} from '../platform/chrome/permission-gate.js';
const error=(code,message)=>Object.assign(new Error(message),{code});
const inputKey=input=>JSON.stringify({source:input.componentSource,framework:input.framework,programId:input.programId});
const identity=(input,roots)=>({componentSource:input.componentSource,framework:input.framework,roots,...(input.framework==='controller'?{programId:input.programId}:{})});
const pin=row=>({url:row.url,sha256:row.sha256,bytes:row.bytes});
// This is a *source naming* gate for fresh auto-downloads, not proof that the
// publisher will never replace a file. The Broker's original SHA lock is the
// executable byte identity. Existing immutable locks remain offline-readable.
export function assertPinnedESMSource(url){
  let path;try{path=new URL(url).pathname;}catch{throw error('E_REMOTE_URL','ESM 模块必须为合法 HTTPS 地址');}
  const semver=/(?:^|[\/@._-])v?\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?(?=\/|[._-]|$)/i;
  const commit=/(?:^|\/)[a-f0-9]{40}(?=\/|$)/i;
  if(!semver.test(path)&&!commit.test(path))
    throw error('E_REMOTE_VERSION_UNPINNED','新 ESM 来源必须使用明确的版本号或完整 Commit SHA，不能自动下载 latest/main 等可变地址：'+url);
  return url;
}
export function createPageComponentRemote({client,preparer,api,document:doc,getInput,isBlocked=()=>false,onState=()=>{}}){
  const get=id=>doc.getElementById(id),panel=get('page-component-remote'),status=get('page-component-remote-status'),
    button=get('page-component-remote-prepare'),cancelButton=get('page-component-remote-cancel'),
    sources=get('page-component-remote-sources'),details=get('page-component-remote-details'),
    detailBody=get('page-component-remote-detail-body'),selector=get('page-component-remote-lock');
  let disposed=false,generation=0,busy=false,state=null;
  let warmEpoch=0,warmTimer=null,warmed=null,warmError=null;
  const selectedLocks=new Map();
  const permissions=createChromePermissionConsent({api});
  const compatible=input=>input&&['react','vue','controller'].includes(input.framework);
  // A normal, exact-version npm import is also a remote ESM root. Obtain
  // the same genuine Chrome origin gesture even without a literal HTTPS URL.
  const needsSourceConsent=input=>compatible(input)&&typeof input.componentSource==='string'&&
    (input.componentSource.includes('https://')||
      input.framework==='controller'&&/^\s*(?:import\s+(?!\()|export\s+(?:\*|\{)[^\n]*\s+from\s+['"])/m.test(input.componentSource));
  function current(ticket,input){
    if(disposed||ticket!==generation||inputKey(getInput())!==inputKey(input))throw error('E_REMOTE_STALE','组件源码已更改或准备已取消；旧结果不会使用');
  }
  function render(notify=true){
    if(!panel)return;
    const input=getInput();panel.hidden=!compatible(input);
    if(panel.hidden)return;
    const stage=state?.stage||'idle';
    status.textContent=state?.message||(input.framework==='controller'
      ? 'Controller ESM：点击运行会自动解析、获取并固定明确版本的静态依赖图。首次下载可能需要 Chrome 来源授权；Developer 上限 32 模块 / 256 KiB。'
      : '点击运行会自动处理固定 HTTPS 依赖；高级检查仅供查看来源、许可证与 SHA。已固定资产可离线复用，上限 32 个模块 / 256 KiB。');
    status.dataset.state=stage;
    button.textContent=stage==='download'?(state?.cachedUrls?.length===state?.urls?.length?'确认复用缓存':'确认获取所列模块'):stage==='review'?'确认固定此版本':stage==='choose'?'使用所选固定版本':'高级：检查依赖';
    button.disabled=busy||isBlocked()||stage==='choose'&&!selector?.value;
    cancelButton.hidden=!busy;cancelButton.disabled=false;
    sources.hidden=!(state?.urls?.length);sources.textContent=(state?.urls||[]).join('\n');
    selector.hidden=stage!=='choose';
    details.hidden=!(state?.entries?.length);
    if(state?.entries?.length){
      detailBody.textContent=state.entries.map(row=>row.url+'\n'+row.bytes+' bytes · SHA-256 '+row.sha256+
        '\n许可证：'+(row.license?.name||'来源未声明，需作者核对')).join('\n\n');
      if(stage==='review')details.open=true;
    }
    if(notify)onState();
  }
  function cancel(){
    generation++;busy=false;preparer.cancel();
    state={stage:'idle',message:'准备已取消；迟到结果不会运行或安装。已明确确认的固定版本可保留。'};render();
  }
  // The compiler inspects STATIC import roots in its trusted fixed Worker.
  // Prime Chrome's read-only permission observation after typing, before a
  // trusted Run click. The click itself owns the native request; we never
  // call permissions.request from an async dependency download callback.
  function scheduleRunPermissionWarm(){
    warmEpoch++;if(warmTimer){clearTimeout(warmTimer);warmTimer=null;}
    warmed=null;warmError=null;
    const input={...getInput()},epoch=warmEpoch;
    if(!needsSourceConsent(input)||typeof preparer.inspect!=='function')return;
    warmTimer=setTimeout(async()=>{
      warmTimer=null;
      const valid=()=>!disposed&&epoch===warmEpoch&&inputKey(input)===inputKey(getInput());
      try{
        const analysis=await inspect(input);
        if(!valid())return;
        const origins=[...new Set((analysis.remoteRoots||[]).map(url=>new URL(url).origin+'/*'))];
        if(origins.length)await permissions.prepare({origins});
        if(valid())warmed={key:inputKey(input),origins};
      }catch(cause){
        // Syntax errors are reported by the normal fixed compiler on Run,
        // not hidden behind a permanent disabled button.
        if(valid())warmError={key:inputKey(input),code:cause.code||'E_REMOTE_INSPECT'};
      }finally{if(valid())render();}
    },200);
  }
  function readyForRun(){
    const input=getInput();
    return !needsSourceConsent(input)||
      warmed?.key===inputKey(input)||warmError?.key===inputKey(input);
  }
  function confirmRun(event,input){
    if(!event?.isTrusted)return Promise.reject(error('E_GESTURE','请主动点击 Run'));
    if(disposed)return Promise.reject(error('E_HOST_CLOSED','开发面板已关闭'));
    if(!needsSourceConsent(input))return Promise.resolve(true);
    if(warmError?.key===inputKey(input))return Promise.resolve(true); // Compiler explains syntax.
    if(warmed?.key!==inputKey(input))return Promise.reject(error('E_REMOTE_PERMISSION_PENDING',
      '正在只读检查静态模块的 Chrome 来源权限；准备完成后请点击 Run'));
    return warmed.origins.length?permissions.confirm(event,{origins:warmed.origins}):Promise.resolve(true);
  }
  function refresh(){generation++;busy=false;state=null;scheduleRunPermissionWarm();render();}
  async function inspect(input,modules=[]){
    if(typeof preparer.inspect!=='function')throw error('E_PAGE_COMPILER_WORKER','当前组件准备器不支持依赖检查');
    return preparer.inspect({...input,projectId:'browser-'+input.framework,remoteModules:modules});
  }
  async function showDownload(ticket,input,analysis,review,cachedUrls=[]){
    const cached=analysis.missingUrls.filter(url=>cachedUrls.includes(url));
    state={stage:'download',input,analysis,review,urls:analysis.missingUrls,cachedUrls:cached,entries:review?.entries||[],
      message:cached.length===analysis.missingUrls.length
        ? '已有批准来源的完全相同内容可复用；请确认本程序也需要这些来源。复用字节并不授权执行，仍须独立审核和固定。'
        : '仅确认获取以下 HTTPS 模块。获取后还需审阅并固定完整版本；此操作不会自动执行。'};
    const origins=[...new Set(analysis.missingUrls.filter(url=>!cached.includes(url)).map(url=>new URL(url).origin+'/*'))];
    if(origins.length)await permissions.prepare({origins});current(ticket,input);render();
  }
  async function inspected(ticket,input){
    const analysis=await inspect(input);current(ticket,input);
    if(!analysis.remoteRoots.length){state={stage:'ready',message:'此组件只使用固定框架，无需获取第三方模块。'};render();return;}
    const report=await client.request('inspectPageComponentDependencies',identity(input,analysis.remoteRoots));current(ticket,input);
    const chosen=selectedLocks.get(report.manifestDigest),lock=report.locks?.find(row=>row.lockId===chosen)||
      (report.locks?.length===1?report.locks[0]:null);
    if(lock){
      const loaded=await client.request('loadPageComponentDependencies',{...identity(input,analysis.remoteRoots),lockId:lock.lockId});current(ticket,input);
      const checked=await inspect(input,loaded.modules);current(ticket,input);
      if(!checked.complete)throw error('E_REMOTE_GRAPH','固定依赖图不完整；不会下载缺失模块');
      selectedLocks.set(report.manifestDigest,lock.lockId);
      state={stage:'ready',message:'已校验固定依赖 · '+loaded.modules.length+' 个模块 · 可离线运行；请明确点击运行组件。',entries:lock.entries};render();return;
    }
    if(report.locks?.length>1){
      state={stage:'choose',input,analysis,report,message:'存在多份已固定版本，请明确选择本次使用的版本。'};
      selector.replaceChildren(new Option('选择固定依赖版本',''),...report.locks.map(row=>new Option(row.lockId.slice(0,28)+'… · '+row.entries.length+' 个模块',row.lockId)));
      selector.value='';render();return;
    }
    await showDownload(ticket,input,analysis,null,report.cachedUrls||[]);
  }
  async function click(event){
    if(!event?.isTrusted||disposed||busy||isBlocked())return;
    const input={...getInput()};if(!compatible(input))return;
    const ticket=++generation,previous=state;
    // Permission consent must be invoked synchronously from this trusted click;
    // an existing Chrome host grant does not replace source confirmation.
    let permission;
    if(previous?.stage==='download'){
      if(inputKey(previous.input)!==inputKey(input)){refresh();return;}
      const needNetwork=previous.urls.filter(url=>!previous.cachedUrls?.includes(url));
      permission=needNetwork.length?permissions.confirm(event,{origins:[...new Set(needNetwork.map(url=>new URL(url).origin+'/*'))]}):Promise.resolve(true);
    }
    busy=true;render();
    try{
      if(previous?.stage==='download'){
        await permission;current(ticket,input);
        let review=previous.review;
        // One approved URL per bounded broker request. A late response cannot
        // trigger the next network request after Cancel or a source edit.
        for(const url of previous.urls){
          review=await client.request('preparePageComponentDependencies',{...identity(input,previous.analysis.remoteRoots),
            ...(review?{reviewId:review.reviewId,reviewDigest:review.reviewDigest}:{}),approvedUrls:[url],explicitUserAction:true});
          current(ticket,input);
        }
        const analysis=await inspect(input,review.modules);current(ticket,input);
        if(!analysis.complete){await showDownload(ticket,input,analysis,review);return;}
        state={stage:'review',input,analysis,review,urls:review.entries.map(row=>row.url),entries:review.entries,
          message:'完整依赖图已获取并校验：'+review.entries.length+' 个模块，'+review.totalBytes+' bytes。请审阅来源、许可证及 SHA-256 后固定此版本。第三方代码将在获准网页中运行，可访问网页数据。'};
        render();return;
      }
      if(previous?.stage==='review'){
        current(ticket,previous.input);
        const approved=await client.request('approvePageComponentDependencies',{...identity(input,previous.analysis.remoteRoots),
          reviewId:previous.review.reviewId,reviewDigest:previous.review.reviewDigest,
          acceptedModules:previous.review.entries.map(pin),graph:previous.analysis.modules.map(({url,children})=>({url,children})),explicitUserAction:true});
        current(ticket,input);selectedLocks.set(approved.manifestDigest,approved.lockId);
        state={stage:'ready',entries:approved.entries,message:'已固定 '+approved.entries.length+' 个模块；保存与准备不会运行网页，请明确点击运行组件。'};render();return;
      }
      if(previous?.stage==='choose'){
        const selected=previous.report.locks.find(row=>row.lockId===selector.value);
        if(!selected)throw error('E_REMOTE_LOCK','请先选择固定版本');
        const loaded=await client.request('loadPageComponentDependencies',{...identity(input,previous.analysis.remoteRoots),lockId:selected.lockId});current(ticket,input);
        const checked=await inspect(input,loaded.modules);current(ticket,input);
      if(!checked.complete)throw error('E_REMOTE_GRAPH','固定依赖图不完整；不会下载缺失模块');selectedLocks.set(previous.report.manifestDigest,selected.lockId);
        state={stage:'ready',entries:selected.entries,message:'已选择并校验固定依赖版本；请明确点击运行组件。'};render();return;
      }
      await inspected(ticket,input);
    }catch(cause){
      if(ticket!==generation||disposed)return;
      state={stage:'error',message:(cause.code||'E_REMOTE_PREPARE')+'：'+(cause.message||cause)};render();
    }finally{if(ticket===generation){busy=false;render();}}
  }
  // Native/File-first R7.2: the Run/Save click is the single author intent.
  // Keep the old manual review UI for advanced forensics, but the normal path
  // automatically fixes the complete statically discoverable ESM graph.
  // Third-party code is handled only as bytes by the existing Broker Manager
  // and by the fixed compiler Worker; no downloaded code runs in this UI.
  async function autoLoadForRun(input,assertRunCurrent=()=>{}){
    if(busy)throw error('E_REMOTE_PENDING','当前已有依赖操作；请先结束或取消');
    const ticket=++generation;busy=true;render();
    const verify=()=>{assertRunCurrent();current(ticket,input);};
    let analysis;
    try{
      analysis=await inspect(input);verify();
      if(!analysis.remoteRoots.length)return undefined;
      const request=identity(input,analysis.remoteRoots);
      const report=await client.request('inspectPageComponentDependencies',request);verify();
      const available=Array.isArray(report?.locks)?report.locks:[];
      let selected=available.find(row=>row.lockId===selectedLocks.get(report.manifestDigest))||
        (available.length===1?available[0]:null);
      if(!selected&&available.length>1)throw error('E_REMOTE_LOCK_AMBIGUOUS',
        '此源码存在多份不同 SHA 的固定模块图；请在高级详情指定版本');
      let lockId;
      if(selected)lockId=selected.lockId;
      else{
        let review=null;
        for(let i=0;i<32&&!analysis.complete;i++){
          const next=analysis.missingUrls.find(url=>!review?.entries?.some(entry=>entry.url===url));
          if(!next)throw error('E_REMOTE_GRAPH','静态依赖图不完整，无法确定下一模块');
          assertPinnedESMSource(next);
          const prior=review?.entries?.length||0;
          // A review is just a temporary byte transaction, not user approval.
          review=await client.request('preparePageComponentDependencies',{
            ...request,...(review?{reviewId:review.reviewId,reviewDigest:review.reviewDigest}:{}),
            approvedUrls:[next],explicitUserAction:true});
          verify();
          if(!Array.isArray(review?.entries)||!Array.isArray(review.modules)||
            review.entries.length!==prior+1||review.entries.some(row=>!row.url||!/^[a-f0-9]{64}$/.test(row.sha256)))
            throw error('E_REMOTE_REVIEW','新模块的 SHA 或完整性清单不可信');
          analysis=await inspect(input,review.modules);verify();
        }
        if(!analysis.complete||!review)
          throw error('E_REMOTE_GRAPH','模块图超出 32 项或仍有未固定的 import');
        const approved=await client.request('approvePageComponentDependencies',{
          ...request,reviewId:review.reviewId,reviewDigest:review.reviewDigest,
          acceptedModules:review.entries.map(pin),
          graph:analysis.modules.map(row=>({url:row.url,children:row.children})),
          explicitUserAction:true});
        verify();
        if(approved?.manifestDigest!==report.manifestDigest||
          !/^component-lock-[a-f0-9]{64}$/.test(approved.lockId))
          throw error('E_REMOTE_LOCK','固定模块锁未通过身份校验');
        lockId=approved.lockId;selectedLocks.set(report.manifestDigest,lockId);
      }
      const loaded=await client.request('loadPageComponentDependencies',{...request,lockId});verify();
      const checked=await inspect(input,loaded.modules);verify();
      if(!checked.complete)throw error('E_REMOTE_GRAPH','固定模块图与源码不匹配；拒绝运行');
      state={stage:'ready',entries:loaded.modules,
        message:'已自动固定 '+loaded.modules.length+' 个 ESM 模块；Run 使用受控执行世界，不会在宿主执行库代码'};
      return loaded;
    }catch(cause){
      if(!disposed&&ticket===generation&&cause?.code==='E_DEPENDENCY_PERMISSION'&&
        Array.isArray(analysis?.missingUrls)&&analysis.missingUrls.length){
        // A transitive origin is learned only after its parent module has been
        // fetched. The original gesture has expired. Prepare the *next* native
        // Run click, but never silently request a new grant or replay effects.
        const origins=[...new Set([...(warmed?.key===inputKey(input)?warmed.origins:[]),
          ...analysis.missingUrls.map(url=>new URL(url).origin+'/*')])];
        try{
          await permissions.prepare({origins});
          if(!disposed&&ticket===generation)warmed={key:inputKey(input),origins};
        }catch{} // Preserve the original permission failure.
        if(!disposed&&ticket===generation)cause.message+='；请再次点击 Run，由 Chrome 决定是否授予新发现的来源';
      }
      if(!disposed&&ticket===generation)state={stage:'error',message:(cause.code||'E_REMOTE_PREPARE')+'：'+(cause.message||cause)};
      throw cause;
    }finally{if(!disposed&&ticket===generation){busy=false;render();}}
  }
  async function loadForRun(input){
    if(busy)throw error('E_REMOTE_PENDING','请先完成或取消当前依赖准备');
    // Older injected compiler test doubles lack inspect(); the production
    // preparer always implements it and will independently reject unpinned URLs.
    if(typeof preparer.inspect!=='function')return undefined;
    const ticket=generation,analysis=await inspect(input);current(ticket,input);
    if(!analysis.remoteRoots.length)return undefined;
    const query=identity(input,analysis.remoteRoots);
    const report=await client.request('inspectPageComponentDependencies',query);current(ticket,input);
    const chosen=selectedLocks.get(report.manifestDigest),lock=report.locks?.find(row=>row.lockId===chosen)||
      (report.locks?.length===1?report.locks[0]:null);
    if(!lock)throw error('E_REMOTE_UNLOCKED',report.locks?.length?'存在多个固定版本，请在「检查依赖」中明确选择':'请先点击「检查依赖」，确认并固定新的 HTTPS 模块；运行不会下载代码');
    const loaded=await client.request('loadPageComponentDependencies',{...query,lockId:lock.lockId});current(ticket,input);
    return loaded;
  }
  const onCancel=event=>{if(event?.isTrusted)cancel();},onSelection=()=>render();
  button?.addEventListener('click',click);cancelButton?.addEventListener('click',onCancel);selector?.addEventListener('change',onSelection);
  scheduleRunPermissionWarm();
  return Object.freeze({loadForRun,autoLoadForRun,confirmRun,refresh,cancel,update:()=>render(false),
    get readyForRun(){return readyForRun();},get busy(){return busy;},
    dispose(){if(disposed)return;disposed=true;generation++;warmEpoch++;if(warmTimer)clearTimeout(warmTimer);permissions.dispose();
      button?.removeEventListener('click',click);cancelButton?.removeEventListener('click',onCancel);selector?.removeEventListener('change',onSelection);}});
}
