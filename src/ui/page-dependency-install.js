import {parseUserScriptDependencies} from '../scripting/user-scripts/dependency-metadata.js';
import {createChromePermissionConsent} from '../platform/chrome/permission-gate.js';
import {inferPageEntryFormat,assertPageSourceReadyToRun} from './page-dependencies.js';

// UI-only controller for the existing broker dependency manager. Inspect is read
// only; prepare cannot approve; approve cannot execute. No downloaded code is
// evaluated in the extension UI, Service Worker or this module.
export function createPageDependencyInstaller({client,api,document:doc,resolver,getSource,getProgramId,
  isBlocked=()=>false,isVisible=()=>true,onState=()=>{}}) {
  const get=id=>doc.getElementById(id);
  const panel=get('page-dependency-panel'),status=get('page-dependency-status'),
    list=get('page-dependency-list'),prepareButton=get('page-dependency-prepare'),
    reviewPanel=get('page-dependency-review'),reviewList=get('page-dependency-review-list'),
    approveButton=get('page-dependency-approve'),lockSelector=get('page-dependency-lock');
  if(!panel)return Object.freeze({update(){},refresh(){},get readyForRun(){return true;},confirmRun(){return Promise.resolve(true);},dispose(){}});
  const listeners=[];
  function listen(node,type,fn){node.addEventListener(type,fn);listeners.push([node,type,fn]);}
  const permissions=createChromePermissionConsent({api,onChange(){
    readyForPermission=false;void warm();render(false);
  }});
  let disposed=false,busy=false,generation=0,permissionGeneration=0;
  let report=null,selected=new Map(),review=null,reviewSource=null,reviewProgramId=null;
  let checks=[],message='',messageState='idle',readyForPermission=false,lockRenderKey='';
  const option=(value,label)=>{const node=doc.createElement('option');node.value=value;node.textContent=label;return node;};
  const paragraph=(parent,text,className='hint')=>{
    const node=doc.createElement('p');node.className=className;node.textContent=text;parent.append(node);return node;
  };
  const currentSource=()=>getSource();
  const currentProgram=()=>getProgramId();
  const currentReport=()=>resolver.inspection;
  const stillCurrent=(ticket,source,programId,digest)=>{
    if(disposed||ticket!==generation||currentSource()!==source||currentProgram()!==programId||
       currentReport()?.manifestDigest!==digest)
      throw Object.assign(new Error('源码、程序 ID 或依赖清单已变化；迟到下载/审核结果不会使用'),{code:'E_DEPENDENCY_STALE'});
  };
  const preferred=row=>row.sourceKind==='packaged'?'packaged':
    row.cacheChoices?.length===1?'cache:'+row.cacheChoices[0].sha256:
    row.sharedCacheChoices?.length===1?'shared:'+row.sharedCacheChoices[0].sha256:'download';
  const choices=()=>{
    if(!report)return [];
    return report.requires.map(row=>({row,value:selected.get(row.order)||preferred(row)}));
  };
  const networkOrigins=()=>[...new Set(choices()
    .filter(({row,value})=>row.sourceKind==='https'&&value==='download'&&!row.downloadError)
    .map(({row})=>'https://'+new URL(row.url).hostname+'/*'))];
  function redrawList(){
    const fragments=[];
    for(const row of report?.requires||[]){
      const container=doc.createElement('div');container.className='od-surface od-stack';
      paragraph(container,(row.name||'第三方库')+' · 版本 '+(row.version||'未识别')+
        ' · '+(row.sourceKind==='packaged'?'扩展预装':row.cacheChoices?.length?'本程序有已审核缓存':
          row.sharedCacheChoices?.length?'发现跨程序已审核字节':'首次需要下载'),'identity');
      paragraph(container,'来源：'+(row.url||row.raw));
      paragraph(container,'许可证：'+(row.license?.name||'尚未核实，请自行检查来源与许可证')+
        ' · '+(row.downloadError?'不支持：'+row.downloadError.message:'运行时自动固定并校验'));
      const picker=doc.createElement('select');
      picker.dataset.dependencyOrder=String(row.order);
      picker.setAttribute('aria-label','第 '+(row.order+1)+' 项依赖的获取方式');
      if(row.sourceKind==='packaged')picker.append(option('packaged','使用扩展预装固定资源'));
      else {
        picker.append(option('download','HTTPS 在线下载新字节（高级手动模式）'));
        for(const choice of row.cacheChoices||[])
          picker.append(option('cache:'+choice.sha256,'本程序已审核缓存 · SHA '+choice.sha256.slice(0,16)+'…'));
        for(const choice of row.sharedCacheChoices||[])
          picker.append(option('shared:'+choice.sha256,'跨程序复用字节 · SHA '+choice.sha256.slice(0,16)+'…（需本程序独立审核）'));
      }
      picker.disabled=!!row.downloadError;
      picker.value=selected.get(row.order)||preferred(row);
      container.append(picker);
      if(row.downloadError)paragraph(container,row.downloadError.code+'：'+row.downloadError.message);
      fragments.push(container);
    }
    list.replaceChildren(...fragments);
    const locks=report?.locks||[];
    lockSelector.hidden=locks.length<=1;
    const lockKey=JSON.stringify(locks.map(x=>x.lockId));
    if(lockKey!==lockRenderKey){
      lockRenderKey=lockKey;
      lockSelector.replaceChildren(option('','多份固定版本：请选择本次执行的锁'),
        ...locks.map(row=>option(row.lockId,'SHA 锁 '+row.lockId.slice(9,25)+'… · '+row.entries.length+' 项')));
      lockSelector.value=resolver.selectedLockId||'';
    }
  }
  function redrawReview(){
    checks=[];
    if(!review){reviewPanel.hidden=true;reviewList.replaceChildren();return;}
    const nodes=[];
    for(const entry of review.entries){
      const section=doc.createElement('div');section.className='od-stack';
      paragraph(section,(entry.name||'库')+' · 固定版本 '+(entry.version||'未识别')+
        '\n来源：'+entry.url+'\n实际来源：'+entry.resolvedUrl+
        '\n获得方式：'+entry.acquisition+'\n大小：'+entry.byteLength+' bytes'+
        '\nSHA-256：'+entry.sha256+'\n许可证：'+(entry.license?.name||'未知；用户须自行确认合规')+
        '\n验证：'+(entry.integrityResult?.verified?.join('、')||'原始字节 SHA-256')+
        '\n运行世界：'+entry.world+'\n安全风险：'+(entry.risk||'第三方代码可以访问获准页面 DOM 和网页允许的网络渠道'),'identity');
      const label=doc.createElement('label'),check=doc.createElement('input');
      check.type='checkbox';check.checked=false;checks.push(check);
      label.append(check,doc.createTextNode(' 已核对这份代码的来源、完整 SHA 与风险，允许为当前程序建立依赖锁'));
      section.append(label);nodes.push(section);
    }
    reviewList.replaceChildren(...nodes);
    reviewPanel.hidden=false;reviewPanel.open=true;
  }
  function render(notify=true){
    if(disposed)return;
    let hasRequires=false;
    try{hasRequires=parseUserScriptDependencies(currentSource()).requires.length>0;}catch{}
    panel.hidden=!isVisible()||!hasRequires;
    if(panel.hidden)return;
    const latest=currentReport();
    if(latest!==report){
      report=latest;selected=new Map();review=null;reviewSource=null;reviewProgramId=null;
      message='';lockRenderKey='';redrawList();redrawReview();
      void warm();
    }
    if(review&&(currentSource()!==reviewSource||currentProgram()!==reviewProgramId)){
      review=null;reviewSource=null;reviewProgramId=null;redrawReview();
      message='源码或程序身份已变化；请重新获取并审核';messageState='idle';
    }
    const errors=report?.requires?.filter(row=>row.downloadError)||[];
    const errorMessage=resolver.inspectError;
    status.dataset.state=messageState;
    status.textContent=message||(resolver.busy?'正在只读检查来源与已批准 SHA…':
      errorMessage?'依赖检查失败：'+(errorMessage.code||'E_DEPENDENCY_INSPECT')+' '+(errorMessage.message||errorMessage):
        errors.length?'存在无法下载的来源；请修改 @require 及其 HTTPS URL':
          report?.locks?.length?'已有 '+report.locks.length+' 份固定依赖锁；可离线运行。要更新请显式获取并重新审核。':
            '点击网页试运行会自动获取、校验并锁定依赖；以下是可选的高级手动审阅。');
    prepareButton.disabled=busy||isBlocked()||!report||resolver.busy||!!errorMessage||
      errors.length>0||!readyForPermission||!!review;
    prepareButton.textContent=busy?'正在获取并校验…':review?'完成高级审核':'高级：手动获取与检查';
    approveButton.disabled=busy||!review||isBlocked()||checks.length!==review?.entries.length||
      !checks.every(check=>check.checked)||reviewSource!==currentSource()||
      reviewProgramId!==currentProgram();
    lockSelector.disabled=busy||isBlocked();
    if(notify)onState();
  }
  async function warm(){
    const ticket=++permissionGeneration;
    readyForPermission=false;
    if(!report||disposed)return;
    const origins=networkOrigins();
    if(!origins.length){readyForPermission=true;render(false);return;}
    try{
      const observation=await permissions.prepare({origins});
      if(disposed||ticket!==permissionGeneration)return;
      readyForPermission=!!observation;render(false);
    }catch(cause){
      if(disposed||ticket!==permissionGeneration)return;
      message=(cause.code||'E_PERMISSION')+'：'+(cause.message||cause);
      messageState='error';render(false);
    }
  }
  // Called synchronously from the real Run click. A prepared missing-origin
  // observation may show Chrome's native grant prompt; no async follow-up
  // is allowed to manufacture a user gesture. The Broker independently checks
  // actual permissions when it needs to fetch new bytes.
  function confirmRun(event){
    if(!event?.isTrusted)return Promise.reject(Object.assign(new Error('请主动点击运行'),{code:'E_GESTURE'}));
    if(disposed)return Promise.reject(Object.assign(new Error('编辑器已关闭'),{code:'E_HOST_CLOSED'}));
    if(!report||currentReport()!==report)
      return Promise.reject(Object.assign(new Error('依赖正在检查，请在检查结束后运行'),{code:'E_DEPENDENCY_INSPECT_PENDING'}));
    const origins=networkOrigins();
    if(!origins.length)return Promise.resolve(true);
    if(!readyForPermission)
      return Promise.reject(Object.assign(new Error('依赖来源权限仍在检查，请稍后重新点击运行'),{code:'E_PERMISSION_PENDING'}));
    return permissions.confirm(event,{origins});
  }
  function refresh(){
    generation++;permissionGeneration++;busy=false;review=null;reviewSource=null;reviewProgramId=null;
    message='';messageState='idle';redrawReview();render(false);
  }
  // Chrome permissions.confirm invokes permissions.request synchronously before
  // this handler's first await. A late inspection cannot recreate a user gesture.
  function prepare(event){
    if(!event?.isTrusted||disposed||busy||isBlocked()||!readyForPermission||!report||review)return;
    const source=currentSource(),programId=currentProgram(),digest=report.manifestDigest;
    let selections=[],permission;
    try{
      assertPageSourceReadyToRun(source);
      for(const {row,value} of choices()){
        if(row.downloadError)throw Object.assign(new Error('无效依赖来源'),{code:'E_DEPENDENCY_URL'});
        if(value.startsWith('shared:'))selections.push({order:row.order,sharedAssetSha256:value.slice(7)});
        else if(value.startsWith('cache:'))selections.push({order:row.order,assetSha256:value.slice(6)});
        else if(!['download','packaged'].includes(value))throw Object.assign(new Error('无效依赖选择'),{code:'E_SCHEMA'});
      }
      const origins=networkOrigins();
      permission=origins.length?permissions.confirm(event,{origins}):Promise.resolve(true);
    }catch(cause){
      message=(cause.code||'E_DEPENDENCY_PREPARE')+'：'+(cause.message||cause);messageState='error';render();return;
    }
    const ticket=++generation;busy=true;message='正在获取固定字节并计算 SHA；尚未批准、不会执行。';messageState='preparing';render();
    (async()=>{
      await permission;stillCurrent(ticket,source,programId,digest);
      const result=await client.request('preparePageDependencies',{sourceUtf8:source,
        entryFormat:inferPageEntryFormat(source),programId,explicitUserAction:true,selections});
      stillCurrent(ticket,source,programId,digest);
      if(result?.status!=='pending-review'||!Array.isArray(result.entries)||
         result.entries.length!==report.requires.length)
        throw Object.assign(new Error('未返回完整的待审核固定资源'),{code:'E_DEPENDENCY_REVIEW'});
      review=result;reviewSource=source;reviewProgramId=programId;redrawReview();
      message='已取得 '+result.entries.length+' 项固定字节，共 '+result.totalBytes+
        ' bytes。请逐项核对完整 SHA-256 与未知许可证；勾选后才能批准，批准也不会运行。';
      messageState='review';
    })().catch(cause=>{
      if(!disposed&&ticket===generation){message=(cause.code||'E_DEPENDENCY_PREPARE')+'：'+(cause.message||cause);messageState='error';}
    }).finally(()=>{if(!disposed&&ticket===generation){busy=false;render();}});
  }
  function approve(event){
    if(!event?.isTrusted||disposed||busy||!review||isBlocked()||
      checks.length!==review.entries.length||!checks.every(check=>check.checked))return;
    const source=reviewSource,programId=reviewProgramId,digest=report?.manifestDigest;
    const pending=review,ticket=++generation;busy=true;
    message='正在单独批准当前程序的固定 SHA；不会运行脚本。';messageState='review';render();
    (async()=>{
      stillCurrent(ticket,source,programId,digest);
      const lock=await client.request('approvePageDependencies',{reviewId:pending.reviewId,
        programId,explicitUserAction:true,acceptedHashes:pending.entries.map(entry=>entry.sha256)});
      stillCurrent(ticket,source,programId,digest);
      if(!lock||lock.approvalStatus!=='approved'||!/^dep-lock-[a-f0-9]{64}$/.test(lock.lockId)||
         lock.manifestDigest!==digest)
        throw Object.assign(new Error('未获得完整可信依赖锁'),{code:'E_DEPENDENCY_LOCK'});
      review=null;reviewSource=null;reviewProgramId=null;redrawReview();
      message='本程序已批准 SHA 锁 '+lock.lockId+'。现在可以单独点击「在当前网页试运行」；重复运行不会下载。';
      messageState='approved';resolver.approved(lock.lockId);
    })().catch(cause=>{
      if(!disposed&&ticket===generation){message=(cause.code||'E_DEPENDENCY_APPROVE')+'：'+(cause.message||cause);messageState='error';}
    }).finally(()=>{if(!disposed&&ticket===generation){busy=false;render();}});
  }
  listen(list,'change',event=>{
    const order=event.target?.dataset?.dependencyOrder;
    if(order===undefined||busy)return;
    selected.set(Number(order),event.target.value);
    message='';messageState='idle';review=null;redrawReview();void warm();render();
  });
  listen(prepareButton,'click',prepare);
  listen(approveButton,'click',approve);
  listen(reviewList,'change',()=>render());
  listen(lockSelector,'change',event=>{if(!busy){resolver.chooseLock(event.target.value);render();}});
  render(false);
  return Object.freeze({update:()=>render(false),refresh,confirmRun,
    get readyForRun(){
      if(disposed)return false;
      let hasRequires;try{hasRequires=parseUserScriptDependencies(currentSource()).requires.length>0;}catch{return false;}
      if(!hasRequires)return true;
      return !!report&&report===currentReport()&&(!networkOrigins().length||readyForPermission);
    },
    get busy(){return busy;},dispose(){
    if(disposed)return;disposed=true;generation++;permissionGeneration++;permissions.dispose();
    for(const [node,type,fn] of listeners)node.removeEventListener(type,fn);
  }});
}
