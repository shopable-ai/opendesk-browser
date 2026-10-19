import {parseUserScriptDependencies} from '../scripting/user-scripts/dependency-metadata.js';
import {createChromePermissionConsent} from '../platform/chrome/permission-gate.js';
import {inferPageEntryFormat,assertPageSourceReadyToRun} from './page-dependencies.js';

// UI state/actions for the existing dependency manager. Prepare, optional manual
// approval and execution remain independent. No downloaded code runs in this UI.
export function createPageDependencyInstaller({client,api,view,resolver,getSource,getProgramId,
  isBlocked=()=>false,isVisible=()=>true,onState=()=>{}}) {
  if(!view)
    return Object.freeze({update(){},refresh(){},get readyForRun(){return true;},confirmRun(){return Promise.resolve(true);},dispose(){}});
  let disposed=false,busy=false,generation=0,permissionGeneration=0,sourceIdentity=null;
  let report=null,selected=new Map(),review=null,reviewSource=null,reviewProgramId=null;
  let message='',messageState='idle',readyForPermission=false,projection;
  const checks=new Set();
  const permissions=createChromePermissionConsent({api,onChange(){readyForPermission=false;void warm();render(false);}});
  const currentSource=()=>getSource(),currentProgram=()=>getProgramId(),currentReport=()=>resolver.inspection;
  const stillCurrent=(ticket,source,programId,digest)=>{
    if(disposed||ticket!==generation||currentSource()!==source||currentProgram()!==programId||
      !isVisible()||currentReport()?.manifestDigest!==digest)
      throw Object.assign(new Error('源码、程序 ID 或依赖清单已变化；迟到下载/审核结果不会使用'),{code:'E_DEPENDENCY_STALE'});
  };
  const preferred=row=>row.sourceKind==='packaged'?'packaged':
    row.cacheChoices?.length===1?'cache:'+row.cacheChoices[0].sha256:
    row.sharedCacheChoices?.length===1?'shared:'+row.sharedCacheChoices[0].sha256:'download';
  const choices=()=>report?report.requires.map(row=>({row,value:selected.get(row.order)||preferred(row)})):[];
  const networkOrigins=()=>[...new Set(choices()
    .filter(({row,value})=>row.sourceKind==='https'&&value==='download'&&!row.downloadError)
    .map(({row})=>'https://'+new URL(row.url).hostname+'/*'))];
  function clearReview(){review=null;reviewSource=null;reviewProgramId=null;checks.clear();}
  function acquisitionOptions(row){
    if(row.sourceKind==='packaged')return [{value:'packaged',label:'使用扩展预装固定资源'}];
    return [{value:'download',label:'HTTPS 在线下载新字节（高级手动模式）'},
      ...(row.cacheChoices||[]).map(choice=>({value:'cache:'+choice.sha256,label:'本程序固定缓存 · SHA '+choice.sha256.slice(0,16)+'…'})),
      ...(row.sharedCacheChoices||[]).map(choice=>({value:'shared:'+choice.sha256,label:'跨程序复用字节 · SHA '+choice.sha256.slice(0,16)+'…'}))];
  }
  function publish(visible){
    const errors=report?.requires?.filter(row=>row.downloadError)||[],errorMessage=resolver.inspectError;
    projection={visible,busy,statusState:messageState,status:message||(resolver.busy?'正在只读检查来源与已批准 SHA…':
      errorMessage?'依赖检查失败：'+(errorMessage.code||'E_DEPENDENCY_INSPECT')+' '+(errorMessage.message||errorMessage):
        errors.length?'存在无法下载的来源；请修改 @require 及其 HTTPS URL':
          report?.locks?.length?'已有 '+report.locks.length+' 份固定依赖锁；可离线运行。要更新请显式获取并重新审核。':
            '点击网页试运行会自动获取、校验并锁定依赖；以下是可选的高级手动审阅。'),
      entries:choices().map(({row,value})=>({...row,value,options:acquisitionOptions(row),disabled:busy||isBlocked()||!!row.downloadError})),
      locks:(report?.locks||[]).map(row=>({value:row.lockId,label:'SHA 锁 '+row.lockId.slice(9,25)+'… · '+row.entries.length+' 项'})),
      selectedLockId:resolver.selectedLockId||'',lockDisabled:busy||isBlocked(),
      prepareDisabled:busy||isBlocked()||!report||resolver.busy||!!errorMessage||errors.length>0||!readyForPermission||!!review,
      prepareLabel:busy?'正在获取并校验…':review?'完成高级审核':'高级：手动获取与检查',
      approveDisabled:busy||!review||isBlocked()||checks.size!==review?.entries.length||
        reviewSource!==currentSource()||reviewProgramId!==currentProgram(),
      review:review?{reviewId:review.reviewId,entries:review.entries.map(entry=>({...entry,checked:checks.has(entry.order)}))}:null};
    view.patchDependencies('classic',projection);
  }
  function render(notify=true){
    if(disposed)return;
    let hasRequires=false;
    try{hasRequires=parseUserScriptDependencies(currentSource()).requires.length>0;}catch{}
    const visible=isVisible()&&hasRequires,identity=JSON.stringify([currentSource(),currentProgram(),visible]);
    const identityChanged=identity!==sourceIdentity;
    if(identityChanged){sourceIdentity=identity;generation++;permissionGeneration++;busy=false;clearReview();message='';messageState='idle';}
    if(!visible){publish(false);return;}
    const latest=currentReport(),reportChanged=latest!==report;
    if(reportChanged){report=latest;selected=new Map();clearReview();message='';}
    if(identityChanged||reportChanged)void warm();
    publish(true);
    if(notify)onState();
  }
  async function warm(){
    const ticket=++permissionGeneration;readyForPermission=false;
    if(!report||disposed)return;
    const origins=networkOrigins();
    if(!origins.length){readyForPermission=true;render();return;}
    try{
      const observation=await permissions.prepare({origins});
      if(disposed||ticket!==permissionGeneration)return;
      readyForPermission=!!observation;render();
    }catch(cause){
      if(disposed||ticket!==permissionGeneration)return;
      message=(cause.code||'E_PERMISSION')+'：'+(cause.message||cause);messageState='error';render();
    }
  }
  // Keep Chrome's real missing-origin request inside the trusted Run click.
  function confirmRun(event){
    if(!event?.isTrusted)return Promise.reject(Object.assign(new Error('请主动点击运行'),{code:'E_GESTURE'}));
    if(disposed)return Promise.reject(Object.assign(new Error('编辑器已关闭'),{code:'E_HOST_CLOSED'}));
    try{if(!parseUserScriptDependencies(currentSource()).requires.length)return Promise.resolve(true);}
    catch(cause){return Promise.reject(cause);}
    if(!report||currentReport()!==report)
      return Promise.reject(Object.assign(new Error('依赖正在检查，请在检查结束后运行'),{code:'E_DEPENDENCY_INSPECT_PENDING'}));
    const origins=networkOrigins();
    if(!origins.length)return Promise.resolve(true);
    if(!readyForPermission)
      return Promise.reject(Object.assign(new Error('依赖来源权限仍在检查，请稍后重新点击运行'),{code:'E_PERMISSION_PENDING'}));
    return permissions.confirm(event,{origins});
  }
  function refresh(){
    generation++;permissionGeneration++;busy=false;clearReview();message='';messageState='idle';render(false);
  }
  function prepare(event){
    if(!event?.isTrusted||disposed||busy||isBlocked()||!isVisible()||projection.prepareDisabled)return;
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
    }catch(cause){message=(cause.code||'E_DEPENDENCY_PREPARE')+'：'+(cause.message||cause);messageState='error';render();return;}
    const ticket=++generation;busy=true;message='正在获取固定字节并计算 SHA；尚未批准、不会执行。';messageState='preparing';render();
    return (async()=>{
      await permission;stillCurrent(ticket,source,programId,digest);
      const result=await client.request('preparePageDependencies',{sourceUtf8:source,
        entryFormat:inferPageEntryFormat(source),programId,explicitUserAction:true,selections});
      stillCurrent(ticket,source,programId,digest);
      if(result?.status!=='pending-review'||!Array.isArray(result.entries)||result.entries.length!==report.requires.length)
        throw Object.assign(new Error('未返回完整的待审核固定资源'),{code:'E_DEPENDENCY_REVIEW'});
      review=result;reviewSource=source;reviewProgramId=programId;checks.clear();
      message='已取得 '+result.entries.length+' 项固定字节，共 '+result.totalBytes+
        ' bytes。可选高级审阅：核对来源、完整 SHA-256 与许可证后批准；批准不会运行。';messageState='review';
    })().catch(cause=>{
      if(!disposed&&ticket===generation){message=(cause.code||'E_DEPENDENCY_PREPARE')+'：'+(cause.message||cause);messageState='error';}
    }).finally(()=>{if(!disposed&&ticket===generation){busy=false;render();}});
  }
  function approve(event){
    if(!event?.isTrusted||disposed||busy||isBlocked()||!isVisible()||projection.approveDisabled)return;
    const source=reviewSource,programId=reviewProgramId,digest=report?.manifestDigest,pending=review,ticket=++generation;
    busy=true;message='正在单独批准当前程序的固定 SHA；不会运行脚本。';messageState='review';render();
    return (async()=>{
      stillCurrent(ticket,source,programId,digest);
      const lock=await client.request('approvePageDependencies',{reviewId:pending.reviewId,programId,
        explicitUserAction:true,acceptedHashes:pending.entries.map(entry=>entry.sha256)});
      stillCurrent(ticket,source,programId,digest);
      if(!lock||lock.approvalStatus!=='approved'||!/^dep-lock-[a-f0-9]{64}$/.test(lock.lockId)||lock.manifestDigest!==digest)
        throw Object.assign(new Error('未获得完整可信依赖锁'),{code:'E_DEPENDENCY_LOCK'});
      clearReview();message='本程序已批准 SHA 锁 '+lock.lockId+'。现在可以单独点击「在当前网页试运行」；重复运行不会下载。';
      messageState='approved';resolver.approved(lock.lockId);
    })().catch(cause=>{
      if(!disposed&&ticket===generation){message=(cause.code||'E_DEPENDENCY_APPROVE')+'：'+(cause.message||cause);messageState='error';}
    }).finally(()=>{if(!disposed&&ticket===generation){busy=false;render();}});
  }
  const actions=Object.freeze({prepare,approve,
    chooseAcquisition(order,value){
      if(disposed||busy||isBlocked())return;
      const row=report?.requires.find(entry=>entry.order===order);
      if(!row||row.downloadError||!acquisitionOptions(row).some(option=>option.value===value))return;
      selected.set(order,value);message='';messageState='idle';clearReview();void warm();render();
    },
    checkReview(order,value,reviewId){
      if(disposed||busy||!review||review.reviewId!==reviewId||!review.entries.some(entry=>entry.order===order))return;
      if(value===true)checks.add(order);else checks.delete(order);render();
    },
    chooseLock(value){if(disposed||busy||isBlocked())return;resolver.chooseLock(value);render();}
  });
  view.actions.pageDependencies=actions;
  render(false);
  return Object.freeze({update:()=>render(false),refresh,confirmRun,
    get readyForRun(){
      if(disposed)return false;
      let hasRequires;try{hasRequires=parseUserScriptDependencies(currentSource()).requires.length>0;}catch{return false;}
      if(!hasRequires)return true;
      return !!report&&report===currentReport()&&(!networkOrigins().length||readyForPermission);
    },get busy(){return busy;},dispose(){
      if(disposed)return;disposed=true;generation++;permissionGeneration++;permissions.dispose();
      if(view.actions.pageDependencies===actions){delete view.actions.pageDependencies;view.patchDependencies('classic',null);}
    }});
}
