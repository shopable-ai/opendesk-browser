import {
  key,sameCookieScope,sameCookieMetadata,sameNativeSlot,normalizeCookie,nativeInput,cookieImportTarget,
  inspectImport,rejectImportDuplicates,exportText
} from '../domain/cookie-model.js';
import {safeCode} from '../adapters/browser-sdk.js';
import {cookieChanges} from '../domain/cookie-changes.js';
import {warnCookieFailure} from './cookie-diagnostics.js';

const badReceipt=()=>Object.assign(Error('E_OUTCOME_UNKNOWN'),{code:'E_OUTCOME_UNKNOWN'});
const isVerified=receipt=>receipt?.saved===true&&receipt.verified===true;
const isRemoved=receipt=>receipt?.removed===true&&receipt.verified===true;
const formatCode=(error,fallback)=>'（'+safeCode(error,fallback)+'）';
const failure=code=>Object.assign(Error(code),{code});
const cookieFailureHelp=error=>({
  E_COOKIE_VALUES_REQUIRED:'Cookie 管理授权不完整或已失效；请在顶部可信设置中补全所选范围的管理授权，再手动重试。',
  E_COOKIE_VALUES:'敏感值回执未确认；请刷新列表后重新打开编辑，不会自动重试。',
  E_COOKIE_CONFLICT:'Cookie 已改变或不存在；请刷新列表后重新打开编辑。',
  E_COOKIE_STORE:'Cookie Store 与当前授权不匹配；请核对当前窗口并刷新列表。',
  E_COOKIE_PARTITION:'Cookie Partition 与当前授权不匹配；请核对当前网站分区并刷新列表。'
})[safeCode(error)];
const exportFailureHelp=error=>({
  E_USER_GESTURE_REQUIRED:'请重新点击复制或下载，以确认本次导出。',
  E_CANCELLED:'本次导出已取消；需要时可重新发起。',
  E_OUTCOME_UNKNOWN:'导出结果未确认；请先核对剪贴板或下载记录，不要自动重试。',
  E_CLIPBOARD:'无法写入剪贴板；请检查剪贴板权限，或改用下载。',
  E_DOWNLOAD:'无法启动下载；请检查浏览器下载设置，或改用复制。',
  E_COOKIE_VALUES:'未取得完整 Cookie 值；请刷新列表并检查管理授权，或取消包含 Cookie 值后导出 JSON 元数据。',
  E_LIMIT:'导出内容超过当前容量限制；可取消包含 Cookie 值后导出 JSON 元数据。',
  E_TOOL_RUNTIME_UNAVAILABLE:'当前安装版本无法使用一键导出；请从扩展列表审阅更新 Cookie Editor。'
})[safeCode(error,'E_COOKIE_EXPORT')]||cookieFailureHelp(error)||'请检查授权或选择其他格式。';
const bounded=(text,limit)=>new Blob([text]).size<=limit;
const importSkipLabels={expired:'已过期',store:'存储区不匹配',partition:'分区无效或不匹配',
  invalid:'格式或属性无效',existing:'已有记录且未启用覆盖'};
// These codes are rejected before the affected native Cookie write.
const importPrewriteDenials=new Set([
  'E_COOKIE_CONFLICT','E_COOKIE_SCOPE','E_COOKIE_STORE','E_COOKIE_PARTITION',
  'E_CHROME_UNSUPPORTED','E_CHROME_PERMISSION_REQUIRED','E_SITE_GRANT_REQUIRED',
  'E_GRANT_REVOKED','E_TOOL_CHANGED','E_TOOL_DISABLED','E_OWNER','E_CONTEXT',
  'E_PERMISSION','E_SCHEMA','E_LIMIT','E_DOCUMENT_CHANGED','E_SITE_PERMISSION_REVOKED','E_COOKIE_EXPIRED',
  'E_COOKIE_BATCH_EXPIRED'
]);
const accessLossCodes=new Set(['E_GRANT_REVOKED','E_SITE_GRANT_REQUIRED',
  'E_SITE_PERMISSION_REVOKED','E_CHROME_PERMISSION_REQUIRED','E_TOOL_CHANGED','E_TOOL_DISABLED',
  'E_OWNER','E_CONTEXT','E_DOCUMENT_CHANGED']);

// Only public, redacted metadata is published to React. Values, pending import
// batches, value-preservation reads and previewRefs never enter React state.
export function createCookieController({adapter,onChange=()=>{},onSuccess=()=>{},navigationIntervalMs=0}){
  if(!adapter||typeof adapter.list!=='function')throw Error('E_COOKIE_CONTROLLER_ADAPTER');
  let epoch=0,closed=false,busy=false,target=null,rows=[],phase='idle',problem=null,
    message='',messageType='info',importPlan=null,clearPlan=null;
  let importRevision=0,clearRevision=0,valueRevision=0,importOutcome=null,importConflicts=0;
  let pendingClear=null;
  let clearRecovery=null,clearRecoveryPending=false;
  let syncStale=false,syncPending=null,syncGeneration=0,activeEffect=null,previousReceipt=null;
  let navigationPending=false,navigationQueued=false,navigationRun=null,verifiedScope=null;
  let dispatchRevision=0,retryQueued=null;
  let nextAutomaticReadAt=0,rateLimitedUntil=0,navigationWait=null;
  let unresolvedSince=null;
  let readDiagnostic=null;
  const unknownEffects=new Set();
  let changes=[],changeRevision=0;
  const current=(ticket,at)=>!closed&&epoch===ticket&&target?.url===at.url;
  const snapshot=()=>({epoch,busy:busy||Boolean(activeEffect),target:target?{...target}:null,rows:structuredClone(rows),
    phase,problem,message,messageType,syncStale,navigationPending,readDiagnostic,verifiedScope,
    settlingPrevious:Boolean(activeEffect&&activeEffect.ticket!==epoch),previousReceipt,
    importOutcome,importConflicts,unknownEffects:[...unknownEffects],
    clearRecovery:clearRecovery&&{hostname:clearRecovery.at.hostname,
      available:phase==='ready'&&target?.url===clearRecovery.at.url&&verifiedScope===clearRecovery.scope,
      pending:clearRecoveryPending},changes:structuredClone(changes)});
  const notify=()=>{if(!closed)onChange(snapshot());};
  function publishSuccess(text,notice){
    // Feedback cannot change a verified native outcome or trigger its replay.
    try{onSuccess(text,notice);}catch{}
  }
  function report(text='',type='info',notice){
    message=text;messageType=type;notify();
    if(type==='success')publishSuccess(text,notice);
  }
  function reportEffect(guard,text,type,notice){
    if(current(guard.ticket,guard.at))return report(text,type,notice);
    if(closed)return;
    if(type==='success'&&notice)return publishSuccess(text,notice);
    previousReceipt={text,type};notify();
  }
  function reportPartialImport(verified,total,reason='',counts=''){
    importOutcome='partial';
    previousReceipt={type:'warning',text:'Chrome 已确认导入 '+verified+'/'+total+
      ' 条；'+reason+'其余条目未写入。'+counts+'请先核对 Chrome。'};
    notify();
  }
  async function readScope(at,live){
    const store=await adapter.getStore(at);
    if(!live())return null;
    const partition=await adapter.getPartition(at);
    if(!live())return null;
    if(typeof store?.storeId!=='string'||!store.storeId||
       typeof partition?.partitionKey?.topLevelSite!=='string'||
       !partition.partitionKey.topLevelSite)throw failure('E_COOKIE_SCOPE');
    return JSON.stringify([store.storeId,partition.partitionKey.topLevelSite,
      partition.partitionKey.hasCrossSiteAncestor===true]);
  }
  function cancelNavigationWait(){
    if(!navigationWait)return;
    clearTimeout(navigationWait.timer);
    navigationWait.resolve();navigationWait=null;
  }
  async function waitForNavigation(automatic=true){
    const delay=Math.max(rateLimitedUntil,automatic?nextAutomaticReadAt:0)-Date.now();
    if(delay<=0)return;
    await new Promise(resolve=>{
      const pending={timer:null,resolve};
      pending.timer=setTimeout(()=>{
        if(navigationWait===pending)navigationWait=null;
        resolve();
      },delay);
      navigationWait=pending;
    });
  }
  function invalidate(text='网站或权限已改变，先刷新并核对 Cookie。'){
    // Invalidate the document, not a receipt already sent to the Host.
    retireSync();syncStale=false;changes=[];
    cancelNavigationWait();
    retryQueued?.(false);retryQueued=null;
    navigationPending=false;navigationQueued=false;navigationRun=null;verifiedScope=null;
    unresolvedSince=null;
    epoch++;valueRevision++;busy=false;target=null;rows=[];phase='idle';problem=null;
    importPlan=null;importOutcome=null;
    discardClear();
    report(text);
  }
  // SDK revocation is authoritative even before the bridge/UI event arrives.
  function rejectLostAccess(error){
    if(!accessLossCodes.has(error?.code))return false;
    invalidate(error.code==='E_CHROME_PERMISSION_REQUIRED'
      ?'Chrome Cookie 或网站访问权限已失效；请在顶部可信设置中恢复 Chrome 访问后重新检查。'
      :'网站授权或安装身份已失效，请手动重新检查。');
    phase='blocked';problem=error.code;notify();
    return true;
  }
  const lock=()=>{if(closed||busy||activeEffect||navigationPending||!target||phase!=='ready')return null;
    retireSync();busy=true;valueRevision++;const guard={at:target,ticket:epoch,dispatchRevision};
    notify();return guard;};
  const beginEffect=(guard,effect)=>{activeEffect=guard;guard.effect=effect;};
  const unlock=guard=>{
    const retiredEffect=activeEffect===guard;
    if(retiredEffect)activeEffect=null;
    if(!current(guard.ticket,guard.at)){if(retiredEffect)notify();return;}
    busy=false;
    if(retryQueued){const settle=retryQueued;retryQueued=null;void retry().then(settle);}
    else if(navigationQueued)void syncNavigation();
    else notify();
  };
  // Navigation retires unsent work, but the original epoch still owns receipts
  // for effects already dispatched until the lock settles.
  const ownsOperation=guard=>!closed&&(activeEffect===guard||current(guard.ticket,guard.at));
  const canDispatch=guard=>current(guard.ticket,guard.at)&&guard.dispatchRevision===dispatchRevision;
  const rejectOperationAccess=(guard,error)=>
    current(guard.ticket,guard.at)&&
    !(error?.code==='E_DOCUMENT_CHANGED'&&!canDispatch(guard)&&!guard.effect)&&rejectLostAccess(error);
  function retry(){
    if(closed)return Promise.resolve(false);
    if(busy&&phase!=='loading'){
      retryQueued?.(false);
      return new Promise(resolve=>{retryQueued=resolve;});
    }
    return load('',{replaceRead:true,preserveMessage:true});
  }
  async function load(input='',{preserveMessage=false,automatic=false,replaceRead=false,reconcileClear=null}={}){
    if(closed||(busy&&!(replaceRead&&phase==='loading')))return false;
    // A manual read can resume checks after an invalidation. Unknown effects
    // remain visible until acknowledged, including clipboard/download effects.
    retireSync();syncStale=false;changes=[];
    cancelNavigationWait();
    navigationPending=false;navigationQueued=false;navigationRun=null;verifiedScope=null;
    const ticket=++epoch;valueRevision++;rows=[];target=null;phase='loading';problem=null;
    unresolvedSince=null;
    importPlan=null;importOutcome=null;
    clearPlan=null;busy=true;
    if(!preserveMessage){message='';messageType='info';}
    notify();
    let at=null,stage='target';
    try{
      if(automatic||Date.now()<rateLimitedUntil)await waitForNavigation(automatic);
      if(ticket!==epoch||closed)return;
      nextAutomaticReadAt=Date.now()+navigationIntervalMs;
      const resolved=await adapter.targetFor(input);
      if(ticket!==epoch||closed)return;
      at=resolved.target;
      target=at;
      if(!at){
        phase='blocked';problem=resolved.reasonCode||'E_NO_ACTIVE_TAB';
        report('当前没有可读取的普通 HTTP(S) 网页。');return;
      }
      stage='permission';const permission=await adapter.checkRead(at);
      if(!current(ticket,at))return;
      if(!permission.callableNow){
        phase='blocked';problem=permission.reasonCode||'E_PERMISSION_REQUIRED';
        report('当前网站的 Cookie 读取权限未就绪。');
        return;
      }
      const live=()=>current(ticket,at);
      stage='scope-before';const beforeScope=await readScope(at,live);
      if(!live())return;
      stage='list';const found=await adapter.list(at,{isCurrent:live});
      if(!live()||found===null)return;
      stage='scope-after';const scope=await readScope(at,live);
      if(!live())return;
      if(scope!==beforeScope)throw failure('E_COOKIE_SCOPE');
      if(replaceRead){
        stage='target-after';const latest=await adapter.targetFor();
        if(!live())return;
        if(!latest.target)throw failure(latest.reasonCode||'E_DOCUMENT_CHANGED');
        if(latest.target.url!==at.url)throw failure('E_DOCUMENT_CHANGED');
      }
      // SDK Adapter already strips values. Never copy the returned raw payload
      // into a log, diagnostic store or React component state.
      verifiedScope=scope;
      rows=found.map(row=>({...row,id:key(row)}));
      phase='ready';problem=null;readDiagnostic=null;if(!preserveMessage)message='';
      if(reconcileClear&&clearRecovery===reconcileClear.record&&at.url===clearRecovery.at.url&&
         scope===clearRecovery.scope&&dispatchRevision===reconcileClear.revision){
        clearRecovery=null;
        unknownEffects.delete('clear');
        report('已重新读取本站 Cookie。列表显示当前记录，上次清理的结果仍无法确认。','verification');
        return true;
      }
      notify();
      return true;
    }catch(error){
      if(ticket===epoch&&!closed){
        warnCookieFailure('load',stage,error,'E_COOKIE_READ');
        if(rejectLostAccess(error))return;
        const rateLimited=safeCode(error,'E_COOKIE_READ')==='E_RATE_LIMIT';
        if(rateLimited)rateLimitedUntil=Date.now()+60000;
        if((automatic||replaceRead)&&rateLimited){
          readDiagnostic={operation:'load',stage:'read',code:'E_RATE_LIMIT'};
          report('自动读取暂受请求频率限制，等待一分钟后重新核验。');
          await waitForNavigation();
          if(ticket!==epoch||closed)return;
          busy=false;
          return load(input,{automatic:true,preserveMessage,replaceRead,reconcileClear});
        }
        phase='error';problem=safeCode(error,'E_COOKIE_READ');rows=[];
        report('读取未确认'+formatCode(error,'E_COOKIE_READ')+
          '；检查权限与 Store/Partition 后手动刷新。','error');
      }
    }finally{if(ticket===epoch&&!closed){busy=false;notify();}}
  }
  // Explicitly release short-lived raw import bytes when the input or panel
  // changes; an old preflight must never remain actionable after dismissal.
  function discardImport(){importPlan=null;importRevision++;}
  function dismissImportReport(){
    // The modal owns recoverable parse/empty-plan feedback as a transient Toast.
    // Never erase revocation or uncertain Host-write diagnostics here.
    if(phase==='ready'&&/^(没有可导入记录|导入预检失败)/.test(message)){
      message='';messageType='info';notify();
    }
  }
  function discardClear(){
    clearPlan=null;clearRevision++;
    pendingClear?.cancel();
  }
  function getRow(id){const row=rows.find(row=>row.id===id);return row?structuredClone(row):null;}
  async function readValue(id){
    const row=getRow(id),at=target,ticket=epoch;
    if(closed||busy||navigationPending||phase!=='ready'||!row||!at)return null;
    const revision=++valueRevision;
    try{
      const value=await adapter.readValue(at,row);
      if(!current(ticket,at)||busy||revision!==valueRevision||!getRow(id))return null;
      return value; // Caller may show it only in an ephemeral DOM node.
    }catch(error){
      if(current(ticket,at)){
        if(!busy&&revision===valueRevision)
          warnCookieFailure('read-value','read',error,'E_COOKIE_VALUES');
        if(!(error?.code==='E_DOCUMENT_CHANGED'&&navigationRun)&&rejectLostAccess(error))return null;
        if(!busy&&revision===valueRevision)
          report('读取敏感值被拒绝'+formatCode(error,'E_COOKIE_VALUES')+
            '；'+(cookieFailureHelp(error)||'请核对当前网站与授权后手动刷新。'),'error');
      }
      return null;
    }
  }
  async function save(input,{originalId=null,valueEdited=true}={}){
    const guard=lock();if(!guard)return false;
    const {at,ticket}=guard;
    const old=originalId?getRow(originalId):null;
    let saved=false,newNameSaved=false,renamed=false,stage='validate';
    try{
      if(originalId&&!old)throw failure('E_COOKIE_CONFLICT');
      // A withheld input is not an explicit empty value. Validate attributes
      // first, then retrieve and validate the retained value under its grant.
      let updated=normalizeCookie({...input,valueRedacted:false,
        ...(old&&!valueEdited?{value:''}:{})},at.hostname);
      if(old&&!sameCookieScope(old,updated))
        throw failure('E_COOKIE_SCOPE');
      renamed=Boolean(old&&old.name!==updated.name);
      nativeInput(updated,at);
      if(old){
        stage='read';
        const before=await adapter.exactList(at,old,()=>canDispatch(guard));
        if(!canDispatch(guard))return false;
        const original=before?.find(item=>key(item)===key(old));
        if(!original||!sameCookieMetadata(original,old))throw failure('E_COOKIE_CONFLICT');
        if(renamed&&before.some(item=>sameNativeSlot(item,updated)))
          throw Object.assign(Error('E_COOKIE_CONFLICT'),{code:'E_COOKIE_CONFLICT'});
        if(!valueEdited){
          // Retain the old value only under the existing complete Cookie consent.
          const preserved=await adapter.readValue(at,old);
          if(!canDispatch(guard))return false;
          updated=normalizeCookie({...updated,value:preserved},at.hostname);
        }
      }
      if(!canDispatch(guard))return false;
      stage='write';
      beginEffect(guard,'save');
      const result=await adapter.write(at,updated,{ifAbsent:!old||renamed});
      if(!ownsOperation(guard))return false;
      stage='receipt';
      if(!isVerified(result))throw badReceipt();
      guard.effect=false;
      newNameSaved=renamed;
      if(renamed){
        stage='remove-old-name';
        if(!canDispatch(guard)){
          warnCookieFailure('save',stage,{code:'E_DOCUMENT_CHANGED'},'E_COOKIE_SET','partial');
          reportEffect(guard,'新名称已写入；页面已变化，未发送旧名称删除。请核对两条 Cookie。','warning');
          return false;
        }
        beginEffect(guard,'save');
        const removed=await adapter.remove(at,old);
        if(!ownsOperation(guard))return false;
        if(!isRemoved(removed))throw badReceipt();
      }
      saved=true;
      reportEffect(guard,renamed?'新 Cookie 已写入并核实旧名称删除。':'Chrome 已确认保存。','success');
    }catch(error){
      if(ownsOperation(guard)){
        const unknown=error?.code!=='E_COOKIE_NOT_SUBMITTED'&&
          (newNameSaved||Boolean(guard.effect)&&error?.code==='E_OUTCOME_UNKNOWN');
        if(canDispatch(guard)||guard.effect||newNameSaved)
          warnCookieFailure('save',stage,error,'E_COOKIE_SET',unknown?'unknown':newNameSaved?'partial':'failed');
        if(error?.code==='E_COOKIE_NOT_SUBMITTED'){
          guard.effect=false;
          reportEffect(guard,newNameSaved?'新名称已写入；未提交旧名称删除。请核对两条 Cookie。':
            '本次保存未提交。请重新核对当前网页。','warning');
          return false;
        }
        if(unknown)unknownEffects.add('save');
        if(rejectOperationAccess(guard,error))return false;
        if(!canDispatch(guard)&&!guard.effect)return false;
        const part=newNameSaved?'新名称已写入，但旧名称删除未确认；两条可能并存。':
          '保存未确认或身份已改变。';
        reportEffect(guard,part+formatCode(error,'E_COOKIE_SET')+' '+
          (cookieFailureHelp(error)||'请手动核对，不要自动重试。'),'error');
      }
    }finally{unlock(guard);}
    if(saved&&current(ticket,at)&&!navigationPending&&!navigationQueued)
      await load(at.url,{preserveMessage:true});
    return saved;
  }
  async function remove(id){
    const guard=lock();if(!guard)return false;
    const row=getRow(id);let removed=false;
    try{
      if(!row)throw Error('E_COOKIE_CONFLICT');
      if(!canDispatch(guard))return false;
      beginEffect(guard,'remove');
      const receipt=await adapter.remove(guard.at,row);
      if(!ownsOperation(guard))return false;
      if(!isRemoved(receipt))throw badReceipt();
      guard.effect=false;removed=true;reportEffect(guard,current(guard.ticket,guard.at)
        ?'Chrome 已确认删除「'+row.name+'」。':'Chrome 已确认删除上一网页的 Cookie。','success');
    }catch(error){if(ownsOperation(guard)){
      if(error?.code==='E_COOKIE_NOT_SUBMITTED'){
        guard.effect=false;reportEffect(guard,'本次删除未提交。请重新核对当前网页。','warning');return false;
      }
      if(error?.code==='E_OUTCOME_UNKNOWN')unknownEffects.add('remove');
      if(rejectOperationAccess(guard,error))return false;
      reportEffect(guard,'删除结果未确认'+formatCode(error,'E_COOKIE_REMOVE')+
        '；请核对实际 Cookie，勿重复删除。','error');
    }
    }finally{unlock(guard);}
    if(removed&&current(guard.ticket,guard.at)&&!navigationPending&&!navigationQueued)
      await load(guard.at.url,{preserveMessage:true});
    return removed;
  }
  async function previewClear(includeShared=true){
    if(clearRecovery)return null;
    const guard=lock();if(!guard)return null;
    clearPlan=null;
    const revision=++clearRevision;
    // This deadline only applies to a read. Never let a late preview republish
    // a plan, or release the lock of a newer operation after dismissal.
    let cancel;
    const cancelled=new Promise(resolve=>{cancel=()=>resolve(null);});
    const pending={cancel:()=>{cancel();finish();}};
    let timer;
    const finish=()=>{
      if(pendingClear!==pending)return;
      pendingClear=null;clearTimeout(timer);unlock(guard);
    };
    pendingClear=pending;
    try{
      const scope=includeShared?'site-exact-host':undefined;
      const deadline=new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(failure('E_COOKIE_PREVIEW_TIMEOUT')),2800);
      });
      const p=await Promise.race([cancelled,deadline,adapter.clearPreview(guard.at,scope)]);
      if(!canDispatch(guard)||revision!==clearRevision)return null;
      if(p?.scope!==(scope?'SITE_EXACT_HOST':'EXACT_HOST_HOST_ONLY')||
        scope&&(!Number.isSafeInteger(p.excluded)||p.excluded<0)||
        !Number.isSafeInteger(p?.matched)||p.matched<0||p.matched>50||
        typeof p.previewRef!=='string'||!/^[0-9a-f-]{36}$/i.test(p.previewRef))
        throw badReceipt();
      clearPlan={epoch:guard.ticket,url:guard.at.url,
        previewRef:p.previewRef,count:p.matched,scope};
      return {count:p.matched,excluded:p.excluded??0,hostname:guard.at.hostname};
    }catch(error){if(ownsOperation(guard)&&revision===clearRevision){
      if(rejectOperationAccess(guard,error))return null;
      const text=error?.code==='E_COOKIE_PREVIEW_TIMEOUT'?'清理预览超时。可以重试或取消。':
        error?.code==='E_LIMIT'?'当前范围超过 50 条或超过核对上限。请缩小清理范围。':
          '清理预览未能完成'+formatCode(error,'E_COOKIE_CLEAR')+'。';
      return {problem:text};
    }
      return null;
    }finally{finish();}
  }
  async function executeClear(){
    if(clearRecovery)return false;
    const plan=clearPlan,guard=lock();if(!guard)return false;
    const scopeAtDispatch=verifiedScope;
    clearPlan=null;let verified=false,dispatched=false,ref=null;
    try{
      if(!plan||plan.epoch!==guard.ticket||plan.url!==guard.at.url)
        throw Error('E_COOKIE_CONFLICT');
      // This call begins synchronously inside the existing Clear dialog's
      // real Confirm click, before its activation can be lost to an await.
      // The trusted Side Panel still checks the exact preview and Host grant.
      const allowed=await adapter.beginClearIntent(guard.at,plan.previewRef,plan.count,plan.scope);
      if(allowed?.authorized!==true||!Number.isSafeInteger(allowed.ref)||allowed.ref<1)
        throw Object.assign(Error('清理确认未获得可信 Host 授权'),{code:'E_USER_GESTURE_REQUIRED'});
      ref=allowed.ref;
      if(!canDispatch(guard))return false;
      beginEffect(guard,'clear');dispatched=true;
      const p=await adapter.clearExecute(guard.at,plan.previewRef,plan.count,plan.scope);
      if(!ownsOperation(guard))return false;
      if(p?.preview!==false||p?.scope!==(plan.scope?'SITE_EXACT_HOST':'EXACT_HOST_HOST_ONLY')||
        p?.matched!==plan.count||!Number.isSafeInteger(p.removed)||
        !Number.isSafeInteger(p.remaining)||p.removed!==plan.count||
        p.remaining<0||p.remaining>50||plan.scope&&
        (!Number.isSafeInteger(p.excluded)||p.excluded<0))throw badReceipt();
      guard.effect=false;verified=true;
      const message='已清理 '+guard.at.hostname+' 的 '+p.removed+' 条 Cookie，本次清理范围剩余 '+p.remaining+' 条。';
      const caption=p.excluded?'已保留 '+p.excluded+' 条超出本次清理范围的 Cookie。':'';
      reportEffect(guard,caption?message+' '+caption:message,'success',caption?{message,caption}:{message});
    }catch(error){if(ownsOperation(guard)){
      if(error?.code==='E_COOKIE_NOT_SUBMITTED'){
        guard.effect=false;reportEffect(guard,'本次清理未提交。请重新核对当前网页。','warning');return false;
      }
      if(accessLossCodes.has(error?.code)||error?.code==='E_COOKIE_STALE'||error?.code==='E_CHROME_UNSUPPORTED'){
        dispatched=false;
        guard.effect=false;
      }
      if(rejectOperationAccess(guard,error))return false;
      if(!canDispatch(guard)&&!dispatched)return false;
      if(dispatched){
        clearRecovery={at:guard.at,scope:scopeAtDispatch};
        unknownEffects.add('clear');
        notify();
      }else reportEffect(guard,'清理尚未执行'+formatCode(error,'E_COOKIE_CLEAR')+
        '；请检查授权或网页状态后重新预览。','error');
    }
    }finally{
      if(ref!==null)void adapter.finishClearIntent(ref).catch(()=>{});
      unlock(guard);
    }
    if(verified&&current(guard.ticket,guard.at)&&!navigationPending&&!navigationQueued)
      await load(guard.at.url,{preserveMessage:true});
    return verified;
  }
  async function verifyClearCurrentRecords(){
    if(!clearRecovery||clearRecoveryPending||closed||busy||activeEffect||navigationPending||
       phase!=='ready'||target?.url!==clearRecovery.at.url||verifiedScope!==clearRecovery.scope)return;
    const reconcileClear={record:clearRecovery,revision:dispatchRevision};
    clearRecoveryPending=true;
    try{
      return await load('',{replaceRead:true,reconcileClear});
    }finally{clearRecoveryPending=false;notify();}
  }
  async function exportTo({format='json',metadata=false,method='download'}={}){
    const guard=lock();if(!guard)return false;
    const operation=method==='copy'||method==='download'?method:'export';
    let plaintext='',done=false,exportRef=null,stage='intent';
    try{
      if(!['copy','download'].includes(method))throw Error('E_COOKIE_EXPORT');
      const intent=await adapter.beginExportIntent(guard.at,method);
      if(intent?.authorized!==true||!Number.isSafeInteger(intent.ref)||intent.ref<1)
        throw failure('E_COOKIE_EXPORT');
      exportRef=intent.ref;
      if(!canDispatch(guard)){
        if(ownsOperation(guard))warnCookieFailure(operation,stage,{code:'E_DOCUMENT_CHANGED'},'E_COOKIE_EXPORT');
        return false;
      }
      if(metadata&&format!=='json')throw Error('E_COOKIE_EXPORT');
      stage='read';
      const records=await adapter.list(guard.at,{
        includeValues:!metadata,isCurrent:()=>canDispatch(guard)});
      if(!canDispatch(guard)){
        if(ownsOperation(guard))warnCookieFailure(operation,stage,{code:'E_DOCUMENT_CHANGED'},'E_COOKIE_EXPORT');
        return false;
      }
      if(!Array.isArray(records)||!records.length)throw Error('E_COOKIE_EXPORT');
      stage='format';
      if(metadata){
        const safe=records.map(({valueRedacted,...row})=>row);
        plaintext=JSON.stringify({kind:'opendesk.cookie-metadata.v1',
          origin:guard.at.origin,restoreSupported:false,
          scope:'current-authorized-url-store-partition',cookies:safe},null,2)+'\n';
      }else{
        if(records.some(row=>row.valueRedacted!==false||typeof row.value!=='string'))
          throw failure('E_COOKIE_VALUES');
        plaintext=exportText(format,records);
      }
      if(!bounded(plaintext,150000))throw failure('E_LIMIT');
      const suffix=format==='json'?'json':'txt';
      stage=method==='copy'?'clipboard':'download';
      beginEffect(guard,method);
      if(method==='copy'){
        const receipt=await adapter.copy(plaintext);
        stage='receipt';
        if(receipt?.copied!==true)throw badReceipt();
      }else if(method==='download'){
        const receipt=await adapter.download(plaintext,guard.at.hostname.slice(0,60)+
          (metadata?'-cookie-metadata.json':'-chrome-cookies.'+suffix));
        stage='receipt';
        if(receipt?.started!==true)throw badReceipt();
      }
      else throw Error('E_COOKIE_EXPORT');
      if(!ownsOperation(guard))return false;
      guard.effect=false;done=true;
      reportEffect(guard,metadata?'已导出 Cookie 元数据（不含值）。':
        method==='copy'?'已复制 Cookie。':'Cookie 文件下载已发起。','success');
    }catch(error){
      if(!ownsOperation(guard))return false;
      const unknown=Boolean(guard.effect)&&safeCode(error,'E_COOKIE_EXPORT')==='E_OUTCOME_UNKNOWN';
      if(unknown)unknownEffects.add(method);
      warnCookieFailure(operation,stage,error,'E_COOKIE_EXPORT',unknown?'unknown':'failed');
      if(rejectOperationAccess(guard,error))return false;
      if(!canDispatch(guard)&&!guard.effect)return false;
      reportEffect(guard,'导出失败或被拒绝；'+exportFailureHelp(error),'error');
    }finally{
      plaintext='';
      if(exportRef!==null)void adapter.finishExportIntent(exportRef).catch(()=>{});
      unlock(guard);
    }
    return done;
  }
  async function previewImport(source,format='auto',overwrite=false,{allSites=false,submitDirectly=false}={}){
    const guard=lock();if(!guard)return null;
    importPlan=null;importOutcome=null;
    const revision=++importRevision;
    let stage='parse';
    try{
      const plan=inspectImport(source,format,guard.at.hostname,allSites);
      const nativeConflicts=submitDirectly&&adapter.supportsWriteMany();
      stage='scope';
      const store=await adapter.getStore(guard.at);
      if(!canDispatch(guard)||revision!==importRevision)return null;
      const needsPartition=!nativeConflicts||plan.records.some(item=>
        item.status==='ready'&&item.cookie.partitionKey);
      const partition=needsPartition?await adapter.getPartition(guard.at):null;
      if(!canDispatch(guard)||revision!==importRevision)return null;
      if(typeof store?.storeId!=='string'||!store.storeId||
        needsPartition&&!partition?.partitionKey?.topLevelSite)throw Error('E_COOKIE_SCOPE');
      for(const item of plan.records){
        if(item.status!=='ready')continue;
        try{
          const row=item.cookie;
          if(row.storeId!==undefined&&row.storeId!==store.storeId)throw failure('E_COOKIE_STORE');
          if(!allSites&&row.partitionKey&&
            (row.partitionKey.topLevelSite!==partition.partitionKey.topLevelSite||
            Boolean(row.partitionKey.hasCrossSiteAncestor)!==
              Boolean(partition.partitionKey.hasCrossSiteAncestor)))
            throw failure('E_COOKIE_PARTITION');
          if(row.partitionKey){
            const site=row.partitionKey.topLevelSite;
            if(!URL.canParse(site))throw failure('E_COOKIE_PARTITION');
            const partitionSite=new URL(site);
            if(!['http:','https:'].includes(partitionSite.protocol)||
               partitionSite.username||partitionSite.password||
               partitionSite.origin!==site)
              throw failure('E_COOKIE_PARTITION');
          }
          item.cookie={...row,storeId:store.storeId};
          item.target=allSites?cookieImportTarget(item.cookie,guard.at):guard.at;
          nativeInput(item.cookie,item.target);
        }catch(error){
          item.status='invalid';
          if(error?.code==='E_COOKIE_STORE'){
            item.skipReason='store';item.reason='Cookie 存储区与当前窗口不匹配';
          }else if(error?.code==='E_COOKIE_PARTITION'){
            item.skipReason='partition';item.reason='Cookie 分区无效或与当前分区不匹配';
          }else item.reason='Cookie 的分区、路径或域名属性不受支持';
        }
      }
      rejectImportDuplicates(plan.records);
      stage='read';const seen=new Map();let created=nativeConflicts?null:0,replaced=created;
      // Single-click imports have no conflict preview. Let the Host report
      // exact conflicts from the live Store immediately before writing.
      for(const item of nativeConflicts?[]:plan.records){
        if(item.status!=='ready')continue;
        const r=item.cookie,at=item.target,route=new URL(at.origin);route.pathname=r.path;
        const scope=JSON.stringify([route.href,r.partitionKey||null]);
        // A foreign site needs no Cookie READ grant merely to receive a
        // user-supplied backup. The existing Host verifies every native write.
        const readable=at.origin===guard.at.origin&&(!r.partitionKey||
          r.partitionKey.topLevelSite===partition.partitionKey.topLevelSite&&
          Boolean(r.partitionKey.hasCrossSiteAncestor)===
            Boolean(partition.partitionKey.hasCrossSiteAncestor));
        if(!readable){created++;continue;}
        if(!seen.has(scope))
          seen.set(scope,await adapter.exactList(at,r,()=>canDispatch(guard)));
        if(!canDispatch(guard)||revision!==importRevision)return null;
        const present=seen.get(scope);
        if(!Array.isArray(present))throw badReceipt();
        if(present.some(old=>sameNativeSlot(old,r))){
          replaced++;
          // An unapproved overwrite must never be included in the native plan.
          // Other new cookies remain importable without replacing this slot.
          if(!overwrite)item.status='existing';
        }else created++;
      }
      const accepted=plan.records.filter(item=>item.status==='ready').map(item=>({cookie:item.cookie,target:item.target}));
      if(revision!==importRevision)return null;
      // Show only preflight status and fixed validation reasons. Never return
      // source text, Cookie Values, or accepted raw cookies to React.
      const issues=plan.records.filter(item=>item.status!=='ready'&&item.status!=='existing');
      const skipCounts={expired:0,store:0,partition:0,invalid:0,existing:0};
      for(const item of plan.records){
        if(item.status!=='ready')skipCounts[item.skipReason||item.status]++;
      }
      const skipDetails=Object.entries(importSkipLabels).filter(([key])=>skipCounts[key]>0)
        .map(([key,label])=>label+' '+skipCounts[key]+' 条').join('、');
      importPlan={epoch:guard.ticket,url:guard.at.url,source,format,accepted,
        total:plan.records.length,skipDetails,overwrite,allSites};
      const result={total:plan.records.length,accepted:accepted.length,
        skipped:plan.records.length-accepted.length,created,replaced,
        skipCounts,skipDetails,
        issueCount:issues.length,
        issues:issues.slice(0,30).map(item=>({
          index:item.index,status:item.status,
          reason:typeof item.reason==='string'?item.reason:'无效 Cookie 条目'
        }))};
      report(accepted.length?'已生成导入预检；确认后写入真实 Chrome。':
        '没有可导入记录，请修正输入。',accepted.length?'info':'error');
      return result;
    }catch(error){if(ownsOperation(guard)){
      if(revision===importRevision)
        warnCookieFailure('import',stage,error,'E_COOKIE_IMPORT');
      if(rejectOperationAccess(guard,error))return null;
      if(revision===importRevision)
        report('导入预检失败'+formatCode(error,'E_COOKIE_IMPORT')+
          '；原文保留，可修正后重新预览。','error');
    }
      return null;
    }finally{unlock(guard);}
  }
  function batches(accepted,overwrite){
    const result=[];let bucket=[],lastScope='',lastUrl='';
    for(const {cookie,target} of accepted){
      const native=nativeInput(cookie,target),url=native.url;
      const option={...native};delete option.url;
      if(!overwrite)option.ifAbsent=true;
      // Exact URL includes the Path used for Chrome native readback.
      const scope=JSON.stringify([url,option.storeId??null,
        option.partitionKey?.topLevelSite??null,
        Boolean(option.partitionKey?.hasCrossSiteAncestor)]);
      const next=[...bucket,option];
      if(bucket.length&&(bucket.length===50||scope!==lastScope||
        !bounded(JSON.stringify({url,cookies:next}),11500))){
        result.push({url:lastUrl,cookies:bucket});bucket=[];
      }
      bucket.push(option);lastScope=scope;lastUrl=url;
    }
    if(bucket.length)result.push({url:lastUrl,cookies:bucket});
    return result;
  }
  async function executeImport(source,format='auto',overwrite=false,{allSites=false}={}){
    const plan=importPlan,guard=lock();if(!guard)return false;
    importPlan=null;importOutcome=null;importConflicts=0;
    let verified=0,complete=false,stage='validate',pending=0,knownStop=false;
    const accepted=plan?.accepted.length||0,inputCount=plan?.total||0;
    const counts=(failed,unknown)=>{
      const details=[plan?.skipDetails,importConflicts?'精确冲突 '+importConflicts+' 条':''].filter(Boolean).join('、');
      return '跳过 '+(inputCount-accepted+importConflicts)+' 条，失败 '+failed+' 条，未知 '+unknown+
        ' 条，未执行 '+(accepted-verified-importConflicts-failed-unknown)+' 条。'+
        (details?'跳过原因：'+details+'。':'');
    };
    try{
      if(!plan||plan.epoch!==guard.ticket||plan.url!==guard.at.url||
        plan.source!==source||plan.format!==format||plan.overwrite!==overwrite||
        plan.allSites!==allSites||!accepted)throw failure('E_COOKIE_NOT_SUBMITTED');
      if(plan.accepted.some(({cookie})=>!cookie.session&&cookie.expirationDate<=Date.now()/1000))
        throw failure('E_COOKIE_EXPIRED');
      const batchSupported=adapter.supportsWriteMany();
      // The single-write adapter accepts normalized Cookie records, NOT the
      // already-serialized SDK payload produced by batches(). Re-serializing
      // a host-only payload loses its implicit Domain and breaks imports.
      const chunks=batchSupported?batches(plan.accepted,plan.overwrite):
        plan.accepted.map(({cookie,target})=>({target,cookie}));
      for(const chunk of chunks){
        if(!canDispatch(guard)){
          throw failure('E_COOKIE_NOT_SUBMITTED');
        }
        stage='write';beginEffect(guard,'import');
        pending=batchSupported?chunk.cookies.length:1;
        knownStop=false;
        if(batchSupported){
          const receipt=await adapter.writeMany({url:chunk.url},chunk.cookies,{skipConflicts:!plan.overwrite});
          if(!ownsOperation(guard))return false;
          stage='receipt';
          // A receipt accounts for a prefix of confirmed or skipped rows,
          // optionally followed by one stopping failure.
          const results=receipt?.results;
          if(!Array.isArray(results)||!results.length||results.length>chunk.cookies.length)
            throw badReceipt();
          let succeeded=0,skipped=0,failedCode=null;
          for(let i=0;i<results.length;i++){
            const part=results[i];
            if(part?.index!==i)throw badReceipt();
            if(isVerified(part)&&part.skipped===undefined&&part.code===undefined){
              if(failedCode!==null)throw badReceipt();
              succeeded++;
            }else if(!plan.overwrite&&failedCode===null&&part?.skipped===true&&
              part.saved===false&&part.verified===false&&part.code==='E_COOKIE_CONFLICT'){
              skipped++;
            }else{
              if(failedCode!==null||receipt.stopped!==true||
                part?.saved!==false||part?.verified!==false||part?.skipped!==undefined)
                throw badReceipt();
              failedCode=safeCode(part,'E_OUTCOME_UNKNOWN');
            }
          }
          if((receipt.saved!==undefined&&receipt.saved!==succeeded)||
            (receipt.verified!==undefined&&receipt.verified!==succeeded))
            throw badReceipt();
          if(failedCode!==null){
            if(results.length!==succeeded+skipped+1)throw badReceipt();
            // Commit the known-good prefix only after validating the entire
            // Host receipt and its counters; malformed receipts stay unknown.
            verified+=succeeded;
            importConflicts+=skipped;
            knownStop=true;
            throw Object.assign(badReceipt(),{code:failedCode});
          }
          if(results.length!==chunk.cookies.length||receipt.stopped===true)
            throw badReceipt();
          verified+=succeeded;
          importConflicts+=skipped;
        }else{
          const receipt=await adapter.write(chunk.target,chunk.cookie,{ifAbsent:!plan.overwrite}).catch(error=>{
            if(plan.overwrite||error?.code!=='E_COOKIE_CONFLICT')throw error;
            return {skipped:true};
          });
          if(!ownsOperation(guard))return false;
          stage='receipt';
          if(receipt?.skipped===true&&!plan.overwrite)importConflicts++;
          else if(isVerified(receipt))verified++;
          else throw badReceipt();
        }
        guard.effect=false;
      }
      complete=true;reportEffect(guard,'Chrome 回读确认导入 '+verified+' 条，跳过 '+
        (plan.total-plan.accepted.length+importConflicts)+' 条。','success');
    }catch(error){if(ownsOperation(guard)){
      const preflightExpired=stage==='validate'&&error?.code==='E_COOKIE_EXPIRED';
      if(error?.code==='E_COOKIE_NOT_SUBMITTED'||error?.code==='E_COOKIE_BATCH_EXPIRED'||preflightExpired){
        warnCookieFailure('import',stage,error,'E_COOKIE_IMPORT',verified?'partial':'failed');
        guard.effect=false;
        const expired=error.code==='E_COOKIE_BATCH_EXPIRED';
        const reason=expired?'确认时限已到，':preflightExpired?'待导入的 Cookie 已过期，':'本次导入未提交，';
        if(verified||importConflicts)reportPartialImport(verified,inputCount,reason,counts(0,0));
        else{
          importOutcome='denied';
          reportEffect(guard,reason+'本次未写入。'+counts(0,0)+'请核对后重新确认。','warning');
        }
        return false;
      }
      const prewriteDenied=importPrewriteDenials.has(error?.code);
      if((verified||importConflicts)&&prewriteDenied){
        warnCookieFailure('import',stage,error,'E_COOKIE_IMPORT','partial');
        rejectOperationAccess(guard,error);
        guard.effect=false;
        // Keep the count after hiding the revoked scope, without site or Cookie details.
        reportPartialImport(verified,inputCount,'',counts(knownStop?1:0,0));
        return false;
      }
      const denied=prewriteDenied;
      warnCookieFailure('import',stage,error,'E_COOKIE_IMPORT',
        !denied&&guard.effect?'unknown':'failed');
      if(denied)guard.effect=false;
      rejectOperationAccess(guard,error);
      importOutcome=denied?'denied':'unknown';
      if(guard.effect&&importOutcome==='unknown')unknownEffects.add('import');
      reportEffect(guard,'已确认 '+verified+'/'+inputCount+
        ' 条；'+(importOutcome==='denied'
          ?'本次写入被明确拒绝，后续未执行'
          :'其余结果未知或未执行，可能部分生效')+
        formatCode(error,'E_COOKIE_IMPORT')+'。'+counts(denied&&knownStop?1:0,
          !denied&&guard.effect?(knownStop?1:pending):0)+
        (importOutcome==='denied'
          ?'检查 Cookie 冲突或权限后，可重新发起新的导入。'
          :'先核对 Chrome，不能盲目重试。'),'error');
    }
    }finally{unlock(guard);}
    if(complete&&current(guard.ticket,guard.at)&&!navigationPending&&!navigationQueued)
      void syncMetadata({afterImport:true});
    return complete;
  }
  // A read started before any operation must stay retired even if that
  // operation fails and releases busy without changing the target epoch.
  function retireSync(){syncGeneration++;syncPending=null;}
  // Passive list refresh uses the public SDK and returns metadata only. It must
  // never erase a live editor, re-read Cookie values or trigger a write.
  async function syncMetadata({canApply=()=>true,events=[],afterImport=false}={}){
    if(closed||busy||navigationPending||phase!=='ready'||!target||!canApply()||
      syncPending?.ticket===epoch||Date.now()<rateLimitedUntil||
      (!afterImport&&Date.now()<nextAutomaticReadAt))return false;
    nextAutomaticReadAt=Date.now()+navigationIntervalMs;
    const at=target,ticket=epoch,token={ticket,generation:syncGeneration},markRevision=changeRevision;
    syncPending=token;
    const safe=()=>current(ticket,at)&&syncPending===token&&
      token.generation===syncGeneration&&!busy&&canApply();
    try{
      const found=await adapter.list(at,{isCurrent:safe});
      if(found===null||!safe())return false;
      // Store/Partition may change without a navigation event. A changed
      // security scope must never inherit metadata from the old scope.
      const scope=await readScope(at,safe);
      if(!safe())return false;
      if(scope!==verifiedScope){
        invalidate('Cookie Store 或 Partition 已变化，请重新核验权限。');
        phase='blocked';problem='E_COOKIE_SCOPE';notify();return false;
      }
      // Even unchanged metadata can accompany a changed Cookie value.
      // Retire sensitive reads started before this accepted refresh.
      valueRevision++;
      const next=found.map(row=>({...row,id:key(row)}));
      const previous=new Map(rows.map(row=>[row.id,row]));
      const changed=next.length!==rows.length||next.some(row=>
        JSON.stringify(previous.get(row.id))!==JSON.stringify(row));
      const updates=markRevision===changeRevision?cookieChanges(rows,next,events,changeRevision+1):[];
      if(updates.length){
        changeRevision++;
        const updatedIds=new Set(updates.map(row=>row.id));
        // A bounded in-memory ledger, shared by filtering and row indicators.
        changes=[...updates,...changes.filter(row=>!updatedIds.has(row.id))].slice(0,100);
      }
      if(changed)rows=next;
      if(changed||updates.length||syncStale){syncStale=false;notify();}
      return true;
    }catch(error){
      // A retired read still proves revocation for the same target. Only a
      // document mismatch retired by a verified navigation belongs to the old
      // path; it must not tear down that navigation's newer scope check.
      if(current(ticket,at)&&!(error?.code==='E_DOCUMENT_CHANGED'&&navigationRun)&&
        rejectLostAccess(error))return false;
      // Keep the last known metadata visible but identify it as stale. Native
      // permissions and write receipts remain the only authority for mutations.
      if(safe()){
        if(safeCode(error,'E_COOKIE_READ')==='E_RATE_LIMIT')rateLimitedUntil=Date.now()+60000;
        if(!syncStale){syncStale=true;notify();}
      }
      return false;
    }finally{if(syncPending===token)syncPending=null;}
  }
  // The Host has already verified a same-document, same-Origin path transition.
  // Keep redacted rows only for reconciliation while the SDK rechecks scope.
  // The pending flag withdraws the old page from UI and fences dispatch.
  async function syncNavigation(){
    if(closed)return false;
    if(phase==='loading'||phase==='blocked'&&problem==='E_DOCUMENT_UNRESOLVED')
      return load('',{automatic:true,replaceRead:true,preserveMessage:true});
    if(phase!=='ready'||!target)return false;
    dispatchRevision++;navigationQueued=true;
    navigationPending=true;retireSync();valueRevision++;
    importPlan=null;clearPlan=null;notify();
    if(busy||navigationRun)return false;
    const run={};navigationRun=run;
    const ownsRun=()=>!closed&&navigationRun===run;
    let applied=false,stage='target';
    try{
      while(navigationQueued&&ownsRun()&&phase==='ready'&&!busy){
        // One verified navigation can require ten public SDK requests. Bound
        // automatic work below the shared Host budget and coalesce destinations
        // while keeping sensitive actions fenced throughout the wait.
        await waitForNavigation();
        if(!ownsRun()||phase!=='ready'||busy)return false;
        navigationQueued=false;
        nextAutomaticReadAt=Date.now()+navigationIntervalMs;
        const at=target,ticket=epoch;
        const live=()=>current(ticket,at)&&ownsRun();
        stage='target';const resolved=await adapter.targetFor();
        if(!live())return false;
        if(navigationQueued)continue;
        const next=resolved.target;
        if(!next&&resolved.reasonCode==='E_DOCUMENT_UNRESOLVED')throw failure('E_DOCUMENT_UNRESOLVED');
        if(!next||next.origin!==at.origin){
          invalidate('网站已变化，请重新核对 Cookie 授权。');return false;
        }
        stage='permission';const permission=await adapter.checkRead(next);
        if(!live())return false;
        if(navigationQueued)continue;
        if(!permission.callableNow){
          invalidate('Cookie 授权已变化，请手动检查。');
          phase='blocked';problem=permission.reasonCode||'E_PERMISSION_REQUIRED';notify();
          return false;
        }
        stage='scope-before';const scope=await readScope(next,()=>live()&&!navigationQueued);
        if(!live())return false;
        if(navigationQueued)continue;
        if(scope!==verifiedScope){
          invalidate('Cookie Store 或 Partition 已变化，请重新授权读取。');
          phase='blocked';problem='E_COOKIE_SCOPE';notify();return false;
        }
        stage='list';const found=await adapter.list(next,{isCurrent:()=>live()&&!navigationQueued});
        if(!live())return false;
        if(navigationQueued)continue;
        if(found===null)throw failure('E_COOKIE_READ');
        stage='scope-after';const afterScope=await readScope(next,()=>live()&&!navigationQueued);
        if(!live())return false;
        if(navigationQueued)continue;
        if(afterScope!==scope){
          invalidate('读取期间 Cookie Store 或 Partition 已变化。');
          phase='blocked';problem='E_COOKIE_SCOPE';notify();return false;
        }
        stage='target-after';const latest=await adapter.targetFor();
        if(!live())return false;
        if(navigationQueued)continue;
        if(!latest.target)throw failure(latest.reasonCode||'E_DOCUMENT_CHANGED');
        if(latest.target.origin!==next.origin)throw failure('E_DOCUMENT_CHANGED');
        if(navigationQueued||latest.target?.url!==next.url){
          navigationQueued=true;continue;
        }
        // Publish the normalized URL and metadata together. Do not reset
        // search, filters, pagination, scroll or independent UI drafts.
        if(at.url!==next.url){epoch++;target=next;}
        const updated=found.map(row=>({...row,id:key(row)}));
        if(JSON.stringify(rows)!==JSON.stringify(updated))rows=updated;
        syncStale=false;problem=null;readDiagnostic=null;unresolvedSince=null;
        applied=true;notify();
      }
    }catch(error){
      if(!ownsRun())return false;
      // Fixed stage and allowlisted code only; never retain the Host error,
      // request URL, returned Cookie rows or arbitrary error properties.
      readDiagnostic={operation:'navigation',stage,code:safeCode(error,'E_COOKIE_READ')};
      if(readDiagnostic.code==='E_RATE_LIMIT'){
        warnCookieFailure('navigation',stage,error,'E_COOKIE_READ');
        // Only metadata reads resume. An export or mutation is never replayed.
        syncStale=true;navigationQueued=true;rateLimitedUntil=Date.now()+60000;
        report('自动同步暂受请求频率限制；等待重新核验。');
        return false;
      }
      if(readDiagnostic.code==='E_DOCUMENT_UNRESOLVED'){
        unresolvedSince??=Date.now();
        if(Date.now()-unresolvedSince<10000){
          syncStale=true;navigationQueued=true;
          nextAutomaticReadAt=Math.max(nextAutomaticReadAt,Date.now()+1000);
          return false;
        }
      }
      // A newer verified same-document Path event may make an older SDK
      // request fail with E_DOCUMENT_CHANGED. Drain the queued destination
      // instead of briefly clearing the list for that retired request.
      // Genuine grant/Store/Partition revocation always remains fail-closed.
      if(navigationQueued&&['E_DOCUMENT_CHANGED','E_DOCUMENT_STALE'].includes(safeCode(error,'E_COOKIE_READ')))
        return false;
      if(!closed&&navigationPending&&phase==='ready'){
        warnCookieFailure('navigation',stage,error,'E_COOKIE_READ');
        if(!rejectLostAccess(error)){
          invalidate('路径切换后的 Cookie 范围无法核验；请手动刷新。');
          phase='blocked';problem=safeCode(error,'E_COOKIE_READ');notify();
        }
      }
    }finally{
      if(ownsRun()){
        navigationRun=null;navigationPending=false;
        if(navigationQueued&&phase==='ready')void syncNavigation();
        else notify();
      }
    }
    return applied;
  }
  function clearChanges(){changeRevision++;changes=[];notify();}
  function dispose(){
    retireSync();syncStale=false;changes=[];
    cancelNavigationWait();
    retryQueued?.(false);retryQueued=null;
    navigationPending=false;navigationQueued=false;navigationRun=null;verifiedScope=null;
    epoch++;closed=true;busy=false;rows=[];target=null;importPlan=null;importOutcome=null;
    discardClear();activeEffect=null;
  }
  // Initial state is available synchronously through snapshot(). Do not
  // dispatch a React setState from within App's first render.
  return {snapshot,load,retry,invalidate,getRow,readValue,save,remove,
    dismissPreviousReceipt:()=>{if(previousReceipt){previousReceipt=null;notify();}},
    acknowledgeUnknown:effect=>{if(effect!=='clear'&&unknownEffects.delete(effect))notify();},
    previewClear,executeClear,discardClear,verifyClearCurrentRecords,previewImport,executeImport,
    discardImport,dismissImportReport,exportTo,
    syncMetadata,syncNavigation,clearChanges,
    observationAccessLost:rejectLostAccess,dispose};
}
