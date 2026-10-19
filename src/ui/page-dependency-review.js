import {createChromePermissionConsent} from '../platform/chrome/permission-gate.js';
import {digestUtf8} from '../platform/protocol.js';
import {parseUserScriptDependencies} from '../scripting/user-scripts/dependency-metadata.js';
import {hasUnbuiltESM} from './esm-source-detector.js';

// Source-attached state/actions only. Durable bytes and approvals stay in the manager.
export function createPageDependencyReview({client,resolver,getSource,isAvailable=()=>true,
  api=globalThis.chrome,view,onState=()=>{}}) {
  if(!view)
    return {update(){},get readyForRun(){return true;},confirmRun(){return Promise.resolve(true);},dispose(){}};
  let disposed=false,working=false,review=null,captured=null,sourceIdentity=null,availableIdentity=null,
    generation=0,permissionIdentity=null,permissionReady=false,approved=false,notice='',accepted=false,projection;
  const codes=new Map();
  const consent=createChromePermissionConsent({api,onChange(){permissionIdentity=null;permissionReady=false;update();}});
  const message=error=>(error?.code||'E_DEPENDENCY_REVIEW')+'：'+(error?.message||String(error));
  const invalidate=()=>{review=null;captured=null;approved=false;notice='';codes.clear();accepted=false;};
  const assertCurrent=snapshot=>{
    if(disposed||snapshot.generation!==generation||!isAvailable()||getSource()!==snapshot.sourceUtf8||resolver.snapshot().key!==snapshot.key)
      throw {code:'E_DEPENDENCY_LOCK_STALE',message:'准备期间源码或编辑模式已变化；请重新准备，网页尚未运行'};
  };
  const originsFor=report=>[...new Set((report?.requires||[]).filter(row=>row.sourceKind==='https'&&!row.downloadError)
    .map(row=>'https://'+new URL(row.url).hostname+'/*'))];
  function publish(values){
    projection={...values,busy:working,review:review?{
      reviewId:review.reviewId,accepted,approved,
      entries:review.entries.map(entry=>({...entry,code:codes.get(entry.order)}))
    }:null};
    view.patchDependencies('network',projection);
  }
  function update() {
    if(disposed)return;
    const source=getSource(),parsed=parseUserScriptDependencies(source),available=isAvailable(),esm=hasUnbuiltESM(source);
    const identitySource=JSON.stringify([source,resolver.sourceFormat]);
    if(identitySource!==sourceIdentity||available!==availableIdentity){
      generation++;sourceIdentity=identitySource;availableIdentity=available;invalidate();permissionIdentity=null;permissionReady=false;
    }
    const values={visible:available&&(esm||!!parsed.requires.length),isESM:esm,world:resolver.sourceFormat||'esm-page',
      worldDisabled:working,prepareDisabled:true,approveDisabled:true,status:notice,
      prepareLabel:esm?'下载并准备 '+(resolver.sourceFormat==='esm-controller'?'Controller':'Page')+' 依赖':'下载并准备依赖'};
    if(!values.visible){publish(values);return;}
    let snapshot;
    try{snapshot=resolver.snapshot();}catch(error){publish({...values,status:message(error)});return;}
    const report=snapshot.report,origins=originsFor(report),identity=JSON.stringify([snapshot.key,origins]);
    if(identity!==permissionIdentity){
      permissionIdentity=identity;permissionReady=!origins.length;
      if(origins.length)void consent.prepare({origins}).then(result=>{
        if(!disposed&&permissionIdentity===identity){permissionReady=!!result;update();onState();}
      }).catch(error=>{if(!disposed&&permissionIdentity===identity){notice=message(error);update();onState();}});
    }
    const unsupported=report?.requires?.find(row=>row.downloadError);
    const noDependencies=esm&&Array.isArray(report?.requires)&&report.requires.length===0;
    publish({...values,prepareDisabled:working||!report||noDependencies||!permissionReady||!!unsupported,
      approveDisabled:working||approved||!review||codes.size!==review.entries.length||!accepted,
      status:notice||(noDependencies?'无需外部依赖；可在所选世界离线编译运行，无需下载或批准。':unsupported?message(unsupported.downloadError):
        report?.locks?.length===1||report?.selectedLockId
          ? '已有批准版本可离线试运行。重新下载只生成待审核字节，批准前保留原锁。'
          : '点击 Run 会自动校验、获取并固定依赖。这里是可选的高级下载与审阅，不会运行网页。')});
  }
  // Called synchronously by the existing Page Run click, using the same consent.
  function pageRunPermission(){
    if(disposed)throw {code:'E_HOST_CLOSED',message:'依赖面板已关闭'};
    if(!hasUnbuiltESM(getSource())||resolver.sourceFormat!=='esm-page')return null;
    const snapshot=resolver.snapshot();
    if(snapshot.sourceFormat!=='esm-page'||snapshot.world!=='USER_SCRIPT')
      throw {code:'E_DEPENDENCY_WORLD',message:'当前 Page import 的执行世界已变化'};
    const origins=originsFor(snapshot.report);
    return {identity:JSON.stringify([snapshot.key,origins]),origins};
  }
  function readyForRun(){
    try{const row=pageRunPermission();return !row||permissionIdentity===row.identity&&permissionReady;}catch{return false;}
  }
  function confirmRun(event){
    if(!event?.isTrusted)return Promise.reject({code:'E_GESTURE',message:'请主动点击 Page Run'});
    try{
      const row=pageRunPermission();
      if(!row)return Promise.resolve(true);
      if(permissionIdentity!==row.identity||!permissionReady)
        throw {code:'E_PERMISSION_PENDING',message:'正在核对 ESM 模块来源权限，请在检查完成后点击 Run'};
      return row.origins.length?consent.confirm(event,{origins:row.origins}):Promise.resolve(true);
    }catch(error){return Promise.reject(error);}
  }
  function action(event,operation) {
    if(!event?.isTrusted||disposed||working||!isAvailable())return;
    working=true;update();onState();
    return Promise.resolve().then(operation).catch(error=>{if(!disposed)notice=message(error);})
      .finally(()=>{working=false;if(!disposed){update();onState();}});
  }
  function prepare(event){
    if(!event?.isTrusted||disposed||working||!isAvailable()||projection.prepareDisabled)return;
    let snapshot,permission;
    try{
      snapshot={...resolver.snapshot(),generation};const origins=originsFor(snapshot.report);
      // Keep the native permission request inside the real trusted click stack.
      permission=origins.length?consent.confirm(event,{origins}):Promise.resolve(true);
    }catch(error){notice=message(error);update();return;}
    return action(event,async()=>{
      invalidate();notice='正在下载准备；网页尚未运行…';update();await permission;assertCurrent(snapshot);
      const result=await client.request('preparePageDependencies',{sourceUtf8:snapshot.sourceUtf8,
        entryFormat:snapshot.entryFormat,...(snapshot.sourceFormat?{sourceFormat:snapshot.sourceFormat}:{}),explicitUserAction:true});
      assertCurrent(snapshot);
      if(result.manifestDigest!==snapshot.report?.manifestDigest||!Array.isArray(result.entries)||!result.entries.length)
        throw {code:'E_DEPENDENCY_REVIEW',message:'下载回执与声明不符'};
      if(snapshot.sourceFormat&&(result.sourceFormat!==snapshot.sourceFormat||result.world!==snapshot.world))
        throw {code:'E_DEPENDENCY_WORLD',message:'下载回执的运行世界不符，请独立准备批准'};
      captured=snapshot;review=structuredClone(result);
      notice='下载准备完成。可逐项查看缓存源码，审核来源、哈希与许可证后批准；网页尚未运行。';
    });
  }
  function readSource(event,order,reviewId){
    if(!review||review.reviewId!==reviewId)return;
    const frozen=review,snapshot=captured,entry=frozen.entries.find(row=>row.order===order);
    if(!entry)return;
    return action(event,async()=>{
      assertCurrent(snapshot);
      const bytes=await client.request('readPageDependencyReview',{reviewId:frozen.reviewId,order:entry.order});
      assertCurrent(snapshot);
      if(bytes.reviewId!==frozen.reviewId||bytes.order!==entry.order||bytes.sha256!==entry.sha256||
        typeof bytes.code!=='string'||await digestUtf8(bytes.code)!==entry.sha256)
        throw {code:'E_DEPENDENCY_HASH',message:'缓存原文与审核 SHA-256 不符'};
      assertCurrent(snapshot);codes.set(entry.order,bytes.code);
      notice='已显示固定缓存原文；哈希不代表代码可信，请逐项审阅后再批准。';
    });
  }
  function approve(event){
    if(projection.approveDisabled)return;
    const frozen=review,snapshot=captured;
    return action(event,async()=>{
      assertCurrent(snapshot);
      const lock=await client.request('approvePageDependencies',{reviewId:frozen.reviewId,explicitUserAction:true,
        acceptedHashes:frozen.entries.map(row=>row.sha256)});
      assertCurrent(snapshot);resolver.accept(lock,snapshot);approved=true;
      notice='已明确批准这些固定字节。网页尚未运行；请单独点击'+(snapshot.sourceFormat==='esm-controller'?'运行草稿':'网页试运行')+'。';
    });
  }
  const actions=Object.freeze({prepare,readSource,approve,
    accept(value,reviewId){if(disposed||working||!review||review.reviewId!==reviewId)return;accepted=value===true;update();},
    chooseWorld(value){
      if(disposed||working||!['esm-page','esm-controller'].includes(value))return;
      resolver.refresh({sourceFormat:value});update();onState();
    }});
  view.actions.pageDependencyReview=actions;
  update();
  return {update,confirmRun,get readyForRun(){return readyForRun();},get busy(){return working;},
    dispose(){
      if(disposed)return;disposed=true;generation++;consent.dispose();
      if(view.actions.pageDependencyReview===actions){
        delete view.actions.pageDependencyReview;view.patchDependencies('network',null);
      }
    }};
}
