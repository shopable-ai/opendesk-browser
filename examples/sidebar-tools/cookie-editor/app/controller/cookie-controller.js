import {
  key,sameCookieScope,sameCookieMetadata,sameNativeSlot,normalizeCookie,nativeInput,cookieImportTarget,
  inspectImport,rejectImportDuplicates,exportText
} from '../domain/cookie-model.js';
import {safeCode} from '../adapters/browser-sdk.js';

const badReceipt=()=>Object.assign(Error('E_OUTCOME_UNKNOWN'),{code:'E_OUTCOME_UNKNOWN'});
const isVerified=receipt=>receipt?.saved===true&&receipt.verified===true;
const isRemoved=receipt=>receipt?.removed===true&&receipt.verified===true;
const formatCode=(error,fallback)=>'（'+safeCode(error,fallback)+'）';
const bounded=(text,limit)=>new Blob([text]).size<=limit;
// These codes are rejected before the affected native Cookie write.
const importPrewriteDenials=new Set([
  'E_COOKIE_CONFLICT','E_COOKIE_SCOPE','E_COOKIE_STORE','E_COOKIE_PARTITION',
  'E_CHROME_UNSUPPORTED','E_CHROME_PERMISSION_REQUIRED','E_SITE_GRANT_REQUIRED',
  'E_GRANT_REVOKED','E_TOOL_CHANGED','E_TOOL_DISABLED','E_OWNER','E_CONTEXT',
  'E_PERMISSION','E_SCHEMA','E_LIMIT'
]);
const accessLossCodes=new Set(['E_GRANT_REVOKED','E_SITE_GRANT_REQUIRED',
  'E_SITE_PERMISSION_REVOKED','E_TOOL_CHANGED','E_TOOL_DISABLED',
  'E_OWNER','E_CONTEXT','E_DOCUMENT_CHANGED']);

// Only public, redacted metadata is published to React. Values, pending import
// batches, value-preservation reads and previewRefs never enter React state.
export function createCookieController({adapter,onChange=()=>{}}){
  if(!adapter||typeof adapter.list!=='function')throw Error('E_COOKIE_CONTROLLER_ADAPTER');
  let epoch=0,closed=false,busy=false,target=null,rows=[],phase='idle',
    message='',messageType='info',importPlan=null,clearPlan=null;
  let importRevision=0,clearRevision=0,valueRevision=0,importOutcome=null;
  let syncStale=false,syncPending=null,syncGeneration=0;
  const current=(ticket,at)=>!closed&&epoch===ticket&&target?.url===at.url;
  const snapshot=()=>({epoch,busy,target:target?{...target}:null,rows:structuredClone(rows),
    phase,message,messageType,syncStale,importOutcome});
  const notify=()=>{if(!closed)onChange(snapshot());};
  function report(text='',type='info'){message=text;messageType=type;notify();}
  function invalidate(text='网站或权限已改变，先刷新并核对 Cookie。'){
    const uncertain=busy;
    retireSync();syncStale=false;
    epoch++;valueRevision++;busy=false;target=null;rows=[];phase='idle';importPlan=null;importOutcome=null;
    clearPlan=null;
    report(uncertain?'网站或授权在操作中变化，结果可能未知；请手动核对，不要自动重试。':text,
      uncertain?'error':'info');
  }
  // SDK revocation is authoritative even before the bridge/UI event arrives.
  function rejectLostAccess(error){
    if(!accessLossCodes.has(error?.code))return false;
    invalidate('网站授权或安装身份已失效，请刷新后重新预检。');
    return true;
  }
  const lock=()=>{if(closed||busy||!target||phase!=='ready')return null;
    retireSync();busy=true;valueRevision++;const at=target,ticket=epoch;notify();return {at,ticket};};
  const unlock=guard=>{if(current(guard.ticket,guard.at)){busy=false;notify();}};
  const verifiedRead=guard=>current(guard.ticket,guard.at);
  async function load(input='',{preserveMessage=false}={}){
    if(closed||busy)return;
    retireSync();syncStale=false;
    const ticket=++epoch;valueRevision++;rows=[];target=null;phase='loading';importPlan=null;importOutcome=null;
    clearPlan=null;busy=true;
    if(!preserveMessage){message='';messageType='info';}
    notify();
    let at=null;
    try{
      at=await adapter.targetFor(input);
      if(ticket!==epoch||closed)return;
      target=at;
      if(!at){phase='blocked';report('请先在浏览器打开 HTTP(S) 网站，或手动选择网站。');return;}
      const permission=await adapter.checkRead(at);
      if(!current(ticket,at))return;
      if(!permission.callableNow){
        phase='blocked';report('本站尚无读取授权（'+permission.reasonCode+'）。请在扩展设置中审阅授权。');
        return;
      }
      const found=await adapter.list(at,{isCurrent:()=>current(ticket,at)});
      if(!current(ticket,at)||found===null)return;
      // SDK Adapter already strips values. Never copy the returned raw payload
      // into a log, diagnostic store or React component state.
      rows=found.map(row=>({...row,id:key(row)}));
      phase='ready';if(!preserveMessage)message='';
      notify();
    }catch(error){
      if(ticket===epoch&&!closed){
        if(rejectLostAccess(error))return;
        phase='error';rows=[];report('读取未确认'+formatCode(error,'E_COOKIE_READ')+
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
  function discardClear(){clearPlan=null;clearRevision++;}
  function getRow(id){const row=rows.find(row=>row.id===id);return row?structuredClone(row):null;}
  async function readValue(id){
    const row=getRow(id),at=target,ticket=epoch;
    if(closed||busy||phase!=='ready'||!row||!at)return null;
    const revision=++valueRevision;
    try{
      const value=await adapter.readValue(at,row);
      if(!current(ticket,at)||busy||revision!==valueRevision||!getRow(id))return null;
      return value; // Caller may show it only in an ephemeral DOM node.
    }catch(error){
      if(current(ticket,at)){
        if(rejectLostAccess(error))return null;
        if(!busy&&revision===valueRevision)
          report('读取敏感值被拒绝'+formatCode(error,'E_COOKIE_VALUES')+
            '；请检查独立的 Cookie Value 授权。','error');
      }
      return null;
    }
  }
  async function save(input,{originalId=null,valueEdited=true}={}){
    const guard=lock();if(!guard)return false;
    const {at,ticket}=guard;
    const old=originalId?getRow(originalId):null;
    let saved=false,newNameSaved=false,renamed=false;
    try{
      if(originalId&&!old)throw Error('E_COOKIE_CONFLICT');
      // A withheld input is not an explicit empty value. Validate attributes
      // first, then retrieve and validate the retained value under its grant.
      let updated=normalizeCookie({...input,valueRedacted:false,
        ...(old&&!valueEdited?{value:''}:{})},at.hostname);
      if(old&&!sameCookieScope(old,updated))
        throw Error('E_COOKIE_SCOPE');
      renamed=Boolean(old&&old.name!==updated.name);
      nativeInput(updated,at);
      if(old){
        const before=await adapter.exactList(at,old,()=>current(ticket,at));
        if(!verifiedRead(guard))return false;
        const original=before?.find(item=>key(item)===key(old));
        if(!original||!sameCookieMetadata(original,old))throw Error('E_COOKIE_CONFLICT');
        if(renamed&&before.some(item=>sameNativeSlot(item,updated)))
          throw Object.assign(Error('E_COOKIE_CONFLICT'),{code:'E_COOKIE_CONFLICT'});
        if(!valueEdited){
          // Retain the old value only with the separate values capability.
          const preserved=await adapter.readValue(at,old);
          if(!verifiedRead(guard))return false;
          updated=normalizeCookie({...updated,value:preserved},at.hostname);
        }
      }
      if(!verifiedRead(guard))return false;
      const result=await adapter.write(at,updated,{ifAbsent:!old||renamed});
      if(!verifiedRead(guard))return false;
      if(!isVerified(result))throw badReceipt();
      newNameSaved=renamed;
      if(renamed){
        const removed=await adapter.remove(at,old);
        if(!verifiedRead(guard))return false;
        if(!isRemoved(removed))throw badReceipt();
      }
      saved=true;
      report(renamed?'新 Cookie 已写入并核实旧名称删除。':'Chrome 已确认保存。','success');
    }catch(error){
      if(verifiedRead(guard)){
        if(rejectLostAccess(error))return false;
        const part=newNameSaved?'新名称已写入，但旧名称删除未确认；两条可能并存。':
          '保存未确认或身份已改变。';
        report(part+formatCode(error,'E_COOKIE_SET')+' 请手动核对，不要自动重试。','error');
      }
    }finally{unlock(guard);}
    if(saved&&current(ticket,at))await load(at.url,{preserveMessage:true});
    return saved;
  }
  async function remove(id){
    const guard=lock();if(!guard)return false;
    const row=getRow(id);let removed=false;
    try{
      if(!row)throw Error('E_COOKIE_CONFLICT');
      const receipt=await adapter.remove(guard.at,row);
      if(!verifiedRead(guard))return false;
      if(!isRemoved(receipt))throw badReceipt();
      removed=true;report('Chrome 已确认删除「'+row.name+'」。','success');
    }catch(error){if(verifiedRead(guard)){
      if(rejectLostAccess(error))return false;
      report('删除结果未确认'+formatCode(error,'E_COOKIE_REMOVE')+
        '；请核对实际 Cookie，勿重复删除。','error');
    }
    }finally{unlock(guard);}
    if(removed&&current(guard.ticket,guard.at))
      await load(guard.at.url,{preserveMessage:true});
    return removed;
  }
  async function previewClear(){
    const guard=lock();if(!guard)return null;
    clearPlan=null;
    const revision=++clearRevision;
    try{
      const p=await adapter.clearPreview(guard.at);
      if(!verifiedRead(guard)||revision!==clearRevision)return null;
      if(!Number.isSafeInteger(p?.matched)||p.matched<0||p.matched>50||
        typeof p.previewRef!=='string'||!/^[0-9a-f-]{36}$/i.test(p.previewRef))
        throw badReceipt();
      clearPlan={epoch:guard.ticket,url:guard.at.url,
        previewRef:p.previewRef,count:p.matched};
      return {count:p.matched,hostname:guard.at.hostname};
    }catch(error){if(verifiedRead(guard)){
      if(rejectLostAccess(error))return null;
      if(revision===clearRevision)
        report('清理预览被拒绝'+formatCode(error,'E_COOKIE_CLEAR')+'。','error');
    }
      return null;
    }finally{unlock(guard);}
  }
  async function executeClear(){
    const plan=clearPlan,guard=lock();if(!guard)return false;
    clearPlan=null;let verified=false;
    try{
      if(!plan||plan.epoch!==guard.ticket||plan.url!==guard.at.url)
        throw Error('E_COOKIE_CONFLICT');
      const p=await adapter.clearExecute(guard.at,plan.previewRef,plan.count);
      if(!verifiedRead(guard))return false;
      if(p?.preview!==false||p?.scope!=='EXACT_HOST_HOST_ONLY'||
        p?.matched!==plan.count||!Number.isSafeInteger(p.removed)||
        !Number.isSafeInteger(p.remaining)||p.removed<0||p.removed>plan.count||
        p.remaining<0||p.remaining>50)throw badReceipt();
      verified=true;report('Chrome 清理 '+p.removed+' 条，剩余 '+p.remaining+' 条。','success');
    }catch(error){if(verifiedRead(guard)){
      if(rejectLostAccess(error))return false;
      report('清理可能部分生效'+formatCode(error,'E_COOKIE_CLEAR')+
        '；重新预览前请先核对，勿自动重试。','error');
    }
    }finally{unlock(guard);}
    if(verified&&current(guard.ticket,guard.at))
      await load(guard.at.url,{preserveMessage:true});
    return verified;
  }
  async function exportTo({format='json',metadata=false,method='download'}={}){
    const guard=lock();if(!guard)return false;
    let plaintext='',done=false;
    try{
      if(metadata&&format!=='json')throw Error('E_COOKIE_EXPORT');
      const records=await adapter.list(guard.at,{
        includeValues:!metadata,isCurrent:()=>verifiedRead(guard)});
      if(!verifiedRead(guard))return false;
      if(!Array.isArray(records)||!records.length)throw Error('E_COOKIE_EXPORT');
      if(metadata){
        const safe=records.map(({valueRedacted,...row})=>row);
        plaintext=JSON.stringify({kind:'opendesk.cookie-metadata.v1',
          origin:guard.at.origin,restoreSupported:false,
          scope:'current-authorized-url-store-partition',cookies:safe},null,2)+'\n';
      }else{
        if(records.some(row=>row.valueRedacted!==false||typeof row.value!=='string'))
          throw Error('E_COOKIE_VALUES');
        plaintext=exportText(format,records);
      }
      if(!bounded(plaintext,150000))throw Error('E_LIMIT');
      const suffix=format==='json'?'json':'txt';
      if(method==='copy')await adapter.copy(plaintext);
      else if(method==='download')
        await adapter.download(plaintext,guard.at.hostname.slice(0,60)+
          (metadata?'-cookie-metadata.json':'-chrome-cookies.'+suffix));
      else throw Error('E_COOKIE_EXPORT');
      if(!verifiedRead(guard))return false;
      done=true;report(metadata?'已导出 Cookie 元数据（不含值）。':
        method==='copy'?'已复制 Cookie。':'Cookie 文件下载已发起。','success');
    }catch(error){if(verifiedRead(guard)){
      if(rejectLostAccess(error))return false;
      report('导出失败或被拒绝'+formatCode(error,'E_COOKIE_EXPORT')+
        '；检查授权或选择其他格式。','error');
    }
    }finally{plaintext='';unlock(guard);}
    return done;
  }
  async function previewImport(source,format='auto',overwrite=false,{allSites=false}={}){
    const guard=lock();if(!guard)return null;
    importPlan=null;importOutcome=null;
    const revision=++importRevision;
    try{
      const plan=inspectImport(source,format,guard.at.hostname,allSites);
      const store=await adapter.getStore(guard.at);
      if(!verifiedRead(guard)||revision!==importRevision)return null;
      const partition=await adapter.getPartition(guard.at);
      if(!verifiedRead(guard)||revision!==importRevision)return null;
      if(typeof store?.storeId!=='string'||!store.storeId||
        !partition?.partitionKey?.topLevelSite)throw Error('E_COOKIE_SCOPE');
      for(const item of plan.records){
        if(item.status!=='ready')continue;
        try{
          const row=item.cookie;
          if(row.storeId!==undefined&&row.storeId!==store.storeId)throw Error('E_COOKIE_STORE');
          if(!allSites&&row.partitionKey&&
            (row.partitionKey.topLevelSite!==partition.partitionKey.topLevelSite||
            Boolean(row.partitionKey.hasCrossSiteAncestor)!==
              Boolean(partition.partitionKey.hasCrossSiteAncestor)))
            throw Error('E_COOKIE_PARTITION');
          if(row.partitionKey){
            const partitionSite=new URL(row.partitionKey.topLevelSite);
            if(!['http:','https:'].includes(partitionSite.protocol)||
               partitionSite.username||partitionSite.password||
               partitionSite.origin!==row.partitionKey.topLevelSite)
              throw Error('E_COOKIE_PARTITION');
          }
          item.cookie={...row,storeId:store.storeId};
          item.target=allSites?cookieImportTarget(item.cookie,guard.at):guard.at;
          nativeInput(item.cookie,item.target);
        }catch{item.status='invalid';item.reason='Cookie 的 Store、Partition、Path 或域名属性不受支持';}
      }
      rejectImportDuplicates(plan.records);
      const seen=new Map();let created=0,replaced=0;
      for(const item of plan.records){
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
          seen.set(scope,await adapter.exactList(at,r,()=>verifiedRead(guard)));
        if(!verifiedRead(guard)||revision!==importRevision)return null;
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
      importPlan={epoch:guard.ticket,url:guard.at.url,source,format,accepted,
        total:plan.records.length,created,replaced,overwrite,allSites};
      // Show only preflight status and fixed validation reasons. Never return
      // source text, Cookie Values, or accepted raw cookies to React.
      const issues=plan.records.filter(item=>item.status!=='ready'&&item.status!=='existing');
      const result={total:plan.records.length,accepted:accepted.length,
        skipped:plan.records.length-accepted.length,created,replaced,
        issueCount:issues.length,
        issues:issues.slice(0,30).map(item=>({
          index:item.index,status:item.status,
          reason:typeof item.reason==='string'?item.reason:'无效 Cookie 条目'
        }))};
      report(accepted.length?'已生成导入预检；确认后写入真实 Chrome。':
        '没有可导入记录，请修正输入。',accepted.length?'info':'error');
      return result;
    }catch(error){if(verifiedRead(guard)){
      if(rejectLostAccess(error))return null;
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
    importPlan=null;importOutcome=null;let verified=0,complete=false;
    try{
      if(!plan||plan.epoch!==guard.ticket||plan.url!==guard.at.url||
        plan.source!==source||plan.format!==format||plan.overwrite!==overwrite||
        plan.allSites!==allSites||!plan.accepted.length||
        plan.accepted.some(({cookie})=>!cookie.session&&cookie.expirationDate<=Date.now()/1000))
        throw Error('E_COOKIE_CONFLICT');
      const batchSupported=adapter.supportsWriteMany();
      // The single-write adapter accepts normalized Cookie records, NOT the
      // already-serialized SDK payload produced by batches(). Re-serializing
      // a host-only payload loses its implicit Domain and breaks imports.
      const chunks=batchSupported?batches(plan.accepted,plan.overwrite):
        plan.accepted.map(({cookie,target})=>({target,cookie}));
      for(const chunk of chunks){
        if(!verifiedRead(guard))return false;
        if(batchSupported){
          const receipt=await adapter.writeMany({url:chunk.url},chunk.cookies);
          if(!verifiedRead(guard))return false;
          // The Host stops at the first failed entry. Its genuine partial
          // receipt is a verified prefix followed by ONE failed row; it is
          // intentionally shorter than the requested batch.
          const results=receipt?.results;
          if(!Array.isArray(results)||!results.length||results.length>chunk.cookies.length)
            throw badReceipt();
          let succeeded=0,failedCode=null;
          for(let i=0;i<results.length;i++){
            const part=results[i];
            if(part?.index!==i)throw badReceipt();
            if(isVerified(part)){
              if(failedCode!==null)throw badReceipt();
              succeeded++;verified++;
            }else{
              if(failedCode!==null||receipt.stopped!==true||
                part?.saved!==false||part?.verified!==false)
                throw badReceipt();
              failedCode=safeCode(part,'E_OUTCOME_UNKNOWN');
            }
          }
          if((receipt.saved!==undefined&&receipt.saved!==succeeded)||
            (receipt.verified!==undefined&&receipt.verified!==succeeded))
            throw badReceipt();
          if(failedCode!==null){
            if(results.length!==succeeded+1)throw badReceipt();
            throw Object.assign(badReceipt(),{code:failedCode});
          }
          if(results.length!==chunk.cookies.length||receipt.stopped===true)
            throw badReceipt();
        }else{
          const receipt=await adapter.write(chunk.target,chunk.cookie,
            {ifAbsent:!plan.overwrite});
          if(!verifiedRead(guard))return false;
          if(!isVerified(receipt))throw badReceipt();
          verified++;
        }
      }
      complete=true;report('Chrome 回读确认导入 '+verified+' 条，跳过 '+
        (plan.total-plan.accepted.length)+' 条。','success');
    }catch(error){if(verifiedRead(guard)){
      if(rejectLostAccess(error))return false;
      // A clearly pre-write denial with zero effects is recoverable; any
      // confirmed prefix or uncertain effect still requires manual readback.
      importOutcome=verified===0&&importPrewriteDenials.has(error?.code)?'denied':'unknown';
      report('已确认 '+verified+'/'+(plan?.accepted.length||0)+
        ' 条；'+(importOutcome==='denied'
          ?'本次写入被明确拒绝，后续未执行'
          :'其余结果未知或未执行，可能部分生效')+
        formatCode(error,'E_COOKIE_IMPORT')+
        (importOutcome==='denied'
          ?'。检查 Cookie 冲突或权限后，可重新发起新的导入。'
          :'。先核对 Chrome，不能盲目重试。'),'error');
    }
    }finally{unlock(guard);}
    if(complete&&current(guard.ticket,guard.at))
      await load(guard.at.url,{preserveMessage:true});
    return complete;
  }
  // A read started before any operation must stay retired even if that
  // operation fails and releases busy without changing the target epoch.
  function retireSync(){syncGeneration++;syncPending=null;}
  // Passive list refresh uses the public SDK and returns metadata only. It must
  // never erase a live editor, re-read Cookie values or trigger a write.
  async function syncMetadata({canApply=()=>true}={}){
    if(closed||busy||phase!=='ready'||!target||!canApply()||
      syncPending?.ticket===epoch)return false;
    const at=target,ticket=epoch,token={ticket,generation:syncGeneration};
    syncPending=token;
    const safe=()=>current(ticket,at)&&syncPending===token&&
      token.generation===syncGeneration&&!busy&&canApply();
    try{
      const found=await adapter.list(at,{isCurrent:safe});
      if(found===null||!safe())return false;
      // Even unchanged metadata can accompany a changed Cookie value.
      // Retire sensitive reads started before this accepted refresh.
      valueRevision++;
      const next=found.map(row=>({...row,id:key(row)}));
      const previous=new Map(rows.map(row=>[row.id,row]));
      const changed=next.length!==rows.length||next.some(row=>
        JSON.stringify(previous.get(row.id))!==JSON.stringify(row));
      if(changed)rows=next;
      if(changed||syncStale){syncStale=false;notify();}
      return true;
    }catch(error){
      if(current(ticket,at)&&rejectLostAccess(error))return false;
      // Keep the last known metadata visible but identify it as stale. Native
      // permissions and write receipts remain the only authority for mutations.
      if(safe()&&!syncStale){syncStale=true;notify();}
      return false;
    }finally{if(syncPending===token)syncPending=null;}
  }
  function dispose(){
    retireSync();syncStale=false;
    epoch++;closed=true;busy=false;rows=[];target=null;importPlan=null;importOutcome=null;
    clearPlan=null;
  }
  // Initial state is available synchronously through snapshot(). Do not
  // dispatch a React setState from within App's first render.
  return {snapshot,load,invalidate,getRow,readValue,save,remove,
    previewClear,executeClear,discardClear,previewImport,executeImport,
    discardImport,dismissImportReport,exportTo,syncMetadata,dispose};
}
