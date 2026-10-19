import {
  key,sameCookieScope,sameCookieMetadata,sameNativeSlot,normalizeCookie,nativeInput,
  inspectImport,rejectImportDuplicates,exportText
} from '../domain/cookie-model.js';
import {safeCode} from '../adapters/browser-sdk.js';

const badReceipt=()=>Object.assign(Error('E_OUTCOME_UNKNOWN'),{code:'E_OUTCOME_UNKNOWN'});
const isVerified=receipt=>receipt?.saved===true&&receipt.verified===true;
const isRemoved=receipt=>receipt?.removed===true&&receipt.verified===true;
const formatCode=(error,fallback)=>'（'+safeCode(error,fallback)+'）';
const bounded=(text,limit)=>new Blob([text]).size<=limit;

// Only public, redacted metadata is published to React. Values, pending import
// batches, value-preservation reads and previewRefs never enter React state.
export function createCookieController({adapter,onChange=()=>{}}){
  if(!adapter||typeof adapter.list!=='function')throw Error('E_COOKIE_CONTROLLER_ADAPTER');
  let epoch=0,closed=false,busy=false,target=null,rows=[],phase='idle',
    message='',messageType='info',importPlan=null,clearPlan=null,
    observing=null,observeCursor='0',observeEvents=[];
  let importRevision=0;
  const current=(ticket,at)=>!closed&&epoch===ticket&&target?.url===at.url;
  const snapshot=()=>({epoch,busy,target,rows:rows.map(x=>({...x})),
    phase,message,messageType,observing:!!observing,
    observeEvents:observeEvents.map(x=>({...x}))});
  const notify=()=>{if(!closed)onChange(snapshot());};
  function report(text='',type='info'){message=text;messageType=type;notify();}
  function invalidate(text='网站或权限已改变，先刷新并核对 Cookie。'){
    const uncertain=busy;
    retireObservation();
    epoch++;busy=false;target=null;rows=[];phase='idle';importPlan=null;
    clearPlan=null;
    report(uncertain?'网站或授权在操作中变化，结果可能未知；请手动核对，不要自动重试。':text,
      uncertain?'error':'info');
  }
  const lock=()=>{if(closed||busy||!target||phase!=='ready')return null;
    busy=true;const at=target,ticket=epoch;notify();return {at,ticket};};
  const unlock=guard=>{if(current(guard.ticket,guard.at)){busy=false;notify();}};
  const verifiedRead=guard=>current(guard.ticket,guard.at);
  // Host observation sessions are owned by the old URL and may survive the UI.
  // Retire them on every target/grant change, including in-flight read failures.
  function retireObservation(){
    const at=target,sessionRef=observing?.sessionRef;
    observing=null;observeCursor='0';observeEvents=[];
    if(at&&typeof sessionRef==='string')
      void Promise.resolve().then(()=>adapter.observeStop(at,sessionRef)).catch(()=>{});
  }
  async function load(input='',{preserveMessage=false}={}){
    if(closed||busy)return;
    retireObservation();
    const ticket=++epoch;rows=[];target=null;phase='loading';importPlan=null;
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
        phase='error';rows=[];report('读取未确认'+formatCode(error,'E_COOKIE_READ')+
          '；检查权限与 Store/Partition 后手动刷新。','error');
      }
    }finally{if(ticket===epoch&&!closed){busy=false;notify();}}
  }
  // Explicitly release short-lived raw import bytes when the input or panel
  // changes; an old preflight must never remain actionable after dismissal.
  function discardImport(){importPlan=null;importRevision++;}
  function discardClear(){clearPlan=null;}
  function getRow(id){return rows.find(row=>row.id===id)||null;}
  async function readValue(id){
    const row=getRow(id),at=target,ticket=epoch;
    if(closed||busy||phase!=='ready'||!row||!at)return null;
    try{
      const value=await adapter.readValue(at,row);
      if(!current(ticket,at)||!getRow(id))return null;
      return value; // Caller may show it only in an ephemeral DOM node.
    }catch(error){
      if(current(ticket,at))
        report('读取敏感值被拒绝'+formatCode(error,'E_COOKIE_VALUES')+
          '；请检查独立的 Cookie Value 授权。','error');
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
      let updated=normalizeCookie(input,at.hostname);
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
          updated={...updated,value:preserved};
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
    }catch(error){if(verifiedRead(guard))
      report('删除结果未确认'+formatCode(error,'E_COOKIE_REMOVE')+
        '；请核对实际 Cookie，勿重复删除。','error');
    }finally{unlock(guard);}
    if(removed&&current(guard.ticket,guard.at))
      await load(guard.at.url,{preserveMessage:true});
    return removed;
  }
  async function previewClear(){
    const guard=lock();if(!guard)return null;
    clearPlan=null;
    try{
      const p=await adapter.clearPreview(guard.at);
      if(!verifiedRead(guard))return null;
      if(!Number.isSafeInteger(p?.matched)||p.matched<0||p.matched>50||
        typeof p.previewRef!=='string'||!/^[0-9a-f-]{36}$/i.test(p.previewRef))
        throw badReceipt();
      clearPlan={epoch:guard.ticket,url:guard.at.url,
        previewRef:p.previewRef,count:p.matched};
      return {count:p.matched,hostname:guard.at.hostname};
    }catch(error){if(verifiedRead(guard))
      report('清理预览被拒绝'+formatCode(error,'E_COOKIE_CLEAR')+'。','error');
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
    }catch(error){if(verifiedRead(guard))
      report('清理可能部分生效'+formatCode(error,'E_COOKIE_CLEAR')+
        '；重新预览前请先核对，勿自动重试。','error');
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
      done=true;report(metadata?'已导出不含值的元数据；不能恢复 Cookie。':
        'Cookie 已导出，可能包含登录凭据，请妥善保管。','success');
    }catch(error){if(verifiedRead(guard))
      report('导出失败或被拒绝'+formatCode(error,'E_COOKIE_EXPORT')+
        '；检查授权或选择其他格式。','error');
    }finally{plaintext='';unlock(guard);}
    return done;
  }
  async function previewImport(source,format='auto',overwrite=false){
    const guard=lock();if(!guard)return null;
    importPlan=null;
    const revision=++importRevision;
    try{
      const plan=inspectImport(source,format,guard.at.hostname);
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
          if(row.partitionKey&&
            (row.partitionKey.topLevelSite!==partition.partitionKey.topLevelSite||
            Boolean(row.partitionKey.hasCrossSiteAncestor)!==
              Boolean(partition.partitionKey.hasCrossSiteAncestor)))
            throw Error('E_COOKIE_PARTITION');
          item.cookie={...row,storeId:store.storeId};
          nativeInput(item.cookie,guard.at);
        }catch{item.status='invalid';item.reason='Store、Partition、Path 或网站范围不一致';}
      }
      rejectImportDuplicates(plan.records);
      const seen=new Map();let created=0,replaced=0;
      for(const item of plan.records){
        if(item.status!=='ready')continue;
        const r=item.cookie,route=new URL(guard.at.origin);route.pathname=r.path;
        const scope=JSON.stringify([route.href,r.partitionKey||null]);
        if(!seen.has(scope))
          seen.set(scope,await adapter.exactList(guard.at,r,()=>verifiedRead(guard)));
        if(!verifiedRead(guard)||revision!==importRevision)return null;
        const present=seen.get(scope);
        if(!Array.isArray(present))throw badReceipt();
        if(present.some(old=>key(old)===key(r))){
          replaced++;
          // An unapproved overwrite must never be included in the native plan.
          // Other new cookies remain importable without replacing this slot.
          if(!overwrite)item.status='existing';
        }else created++;
      }
      const accepted=plan.records.filter(item=>item.status==='ready').map(item=>item.cookie);
      if(revision!==importRevision)return null;
      importPlan={epoch:guard.ticket,url:guard.at.url,source,format,accepted,
        total:plan.records.length,created,replaced,overwrite};
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
    }catch(error){if(verifiedRead(guard))
      report('导入预检失败'+formatCode(error,'E_COOKIE_IMPORT')+
        '；原文保留，可修正后重新预览。','error');
      return null;
    }finally{unlock(guard);}
  }
  function batches(target,accepted){
    const result=[];let bucket=[],lastScope='';
    for(const row of accepted){
      const option={...nativeInput(row,target)};delete option.url;
      const scope=JSON.stringify([option.storeId??null,
        option.partitionKey?.topLevelSite??null,
        Boolean(option.partitionKey?.hasCrossSiteAncestor)]);
      const next=[...bucket,option];
      if(bucket.length&&(bucket.length===50||scope!==lastScope||
        !bounded(JSON.stringify({url:target.url,cookies:next}),11500))){
        result.push(bucket);bucket=[];
      }
      bucket.push(option);lastScope=scope;
    }
    if(bucket.length)result.push(bucket);
    return result;
  }
  async function executeImport(source,format='auto',overwrite=false){
    const plan=importPlan,guard=lock();if(!guard)return false;
    importPlan=null;let verified=0,complete=false;
    try{
      if(!plan||plan.epoch!==guard.ticket||plan.url!==guard.at.url||
        plan.source!==source||plan.format!==format||plan.overwrite!==overwrite||
         !plan.accepted.length||
        plan.accepted.some(row=>!row.session&&row.expirationDate<=Date.now()/1000))
        throw Error('E_COOKIE_CONFLICT');
      const batchSupported=adapter.supportsWriteMany();
      const chunks=batchSupported?batches(guard.at,plan.accepted):
        batches(guard.at,plan.accepted).flat().map(item=>[item]);
      for(const chunk of chunks){
        if(!verifiedRead(guard))return false;
        if(batchSupported){
          const receipt=await adapter.writeMany(guard.at,chunk);
          if(!verifiedRead(guard))return false;
          if(!Array.isArray(receipt?.results)||receipt.results.length!==chunk.length)
            throw badReceipt();
          for(let i=0;i<chunk.length;i++){
            if(receipt.results[i]?.index!==i||!isVerified(receipt.results[i]))
              throw badReceipt();
            verified++;
          }
        }else{
          const receipt=await adapter.write(guard.at,chunk[0]);
          if(!verifiedRead(guard))return false;
          if(!isVerified(receipt))throw badReceipt();
          verified++;
        }
      }
      complete=true;report('Chrome 回读确认导入 '+verified+' 条，跳过 '+
        (plan.total-plan.accepted.length)+' 条。','success');
    }catch(error){if(verifiedRead(guard))
      report('已确认 '+verified+'/'+(plan?.accepted.length||0)+
        ' 条；其余写入结果未知'+formatCode(error,'E_COOKIE_IMPORT')+
        '。先核对 Chrome，不能盲目重试。','error');
    }finally{unlock(guard);}
    if(complete&&current(guard.ticket,guard.at))
      await load(guard.at.url,{preserveMessage:true});
    return complete;
  }
  async function observe(action){
    const guard=lock();if(!guard)return;
    try{
      if(action==='start'){
        const started=await adapter.observeStart(guard.at);
        if(!verifiedRead(guard)){
          if(typeof started?.sessionRef==='string')
            void Promise.resolve().then(()=>adapter.observeStop(guard.at,started.sessionRef)).catch(()=>{});
          return;
        }
        if(typeof started?.sessionRef!=='string')throw badReceipt();
        observing=started;observeCursor='0';observeEvents=[];
        report('已开始 15 秒元数据观察，无 Cookie Value。');
      }else if(observing){
        const sessionRef=observing.sessionRef;
        if(action==='stop'){
          // Clear the local handle before awaiting the Host, so navigation
          // cannot schedule a duplicate stop or revive a stale session.
          observing=null;observeCursor='0';observeEvents=[];
          await adapter.observeStop(guard.at,sessionRef);
          if(!verifiedRead(guard))return;
          report('已停止观察。');
        }else if(action==='read'){
          const outcome=await adapter.observeRead(guard.at,sessionRef,observeCursor);
          if(!verifiedRead(guard))return;
          observeCursor=outcome.nextCursor;
          observeEvents=(outcome.events||[]).slice(-40).map(item=>({
            name:String(item.name||''),domain:String(item.domain||''),
            path:String(item.path||''),removed:item.removed===true
          }));
          report('本次读取 '+observeEvents.length+' 条变化（不含 Cookie 值）。');
        }
      }
    }catch(error){if(verifiedRead(guard)){
      if(['E_SESSION_EXPIRED','E_GRANT_REVOKED','E_SITE_GRANT_REQUIRED','E_SITE_PERMISSION_REVOKED'].includes(error?.code))
        retireObservation();
      report('变化观察中止'+formatCode(error,'E_COOKIE_OBSERVE')+'。','error');
    }}finally{unlock(guard);}
  }
  function dispose(){
    retireObservation();
    epoch++;closed=true;busy=false;rows=[];target=null;importPlan=null;
    clearPlan=null;observeEvents=[];
  }
  // Initial state is available synchronously through snapshot(). Do not
  // dispatch a React setState from within App's first render.
  return {snapshot,load,invalidate,getRow,readValue,save,remove,
    previewClear,executeClear,discardClear,previewImport,executeImport,
    discardImport,exportTo,observe,dispose};
}
