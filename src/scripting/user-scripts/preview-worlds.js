import {FoundationError, invariant} from '../../platform/protocol.js';
import {readPageRecords} from './page-records.js';
import {PAGE_WORLD_CSP} from './execution-source.js';

// Chromium can fall back to the default USER_SCRIPT world when a document has
// exhausted its named worlds. A project budget alone cannot prove isolation.
// This budget is deliberately conservative, and every allocation is also
// checked through exact native document receipts before sending any user code.
export const MAX_PREVIEW_WORLDS_PER_DOCUMENT = 6;
const LEDGER = 'opendeskPagePreviewWorldsD1';
const PREFIX = 'opendesk-preview-d1-';
const token = () => crypto.randomUUID().replaceAll('-', '');
const INSTALLED_IDENTITY=['namespace','programId','revision','sourceHash','manifestHash',
  'installationId','grantGeneration','executionKey','receiptNonce'];

// Full ledger reads may overlap. A permit covers one native query only, never
// a ledger read or a wait for the world queue. Results are not shared or cached.
let documentQueries=0;
const waitingDocuments=[];
async function observeLedgerDocument(api,documentId){
  if(documentQueries<8)documentQueries++;
  else await new Promise(resolve=>waitingDocuments.push(resolve));
  try{return await api.webNavigation.getFrame({documentId});}
  finally{
    const next=waitingDocuments.shift();
    if(next)next();else documentQueries--;
  }
}

// Diagnostics only: fixed phase names and durations, never identity or authority.
// Observers cannot fail an allocation or hold its serial queue with a Promise.
function timingCheckpoint(onTiming,prefix=''){
  let checkpointAt=performance.now();
  return key=>{
    const now=performance.now(),duration=now-checkpointAt;checkpointAt=now;
    if(typeof onTiming!=='function'||!Number.isFinite(duration)||duration<0)return;
    try{onTiming(prefix+key,duration)?.catch?.(()=>{});}catch{/* Diagnostics are non-authoritative. */}
  };
}

function assertInstalledBinding(row,execution){
  const r=row.installed;
  invariant(execution?.tag==='page-execution-v1'&&r&&
    INSTALLED_IDENTITY.every(key=>r[key]===execution[key])&&
    row.tabId===execution.tabId&&row.documentId===execution.documentId&&
    r.target?.tabId===row.tabId&&r.target.documentId===row.documentId&&
    row.worldId===execution.managedUI?.worldId&&
    /^[a-f0-9]{64}$/.test(r.compiledSha256)&&r.compiledSha256===execution.managedUI.compiledSha256,
    'E_WORLD_ISOLATION','安装执行世界与原始执行记录不一致');
}

export function createPreviewWorlds({api,storage}) {
  let serial = Promise.resolve();
  const pendingProofs=new Map();
  const ordered = work => {
    const next = serial.then(work, work);
    serial = next.catch(() => {});
    return next;
  };
  async function sessionLedger(){
    invariant(typeof api.storage?.session?.get === 'function' && typeof api.storage.session.set === 'function',
      'E_WORLD_ISOLATION', '缺少浏览器会话级执行世界账本');
    const value = (await api.storage.session.get(LEDGER))[LEDGER] ?? [];
    invariant(Array.isArray(value) && value.every(row => Number.isSafeInteger(row.tabId) &&
      typeof row.documentId === 'string' && typeof row.worldId === 'string' && row.worldId.startsWith(PREFIX)),
      'E_WORLD_ISOLATION', '执行世界账本损坏，请关闭当前标签页后重试');
    return value;
  }
  async function ledger(persisted,onTiming,prefix='',scope) {
    const checkpoint=timingCheckpoint(onTiming,prefix),value=await sessionLedger();
    checkpoint('SessionMs');
    if(!storage)return value;
    let scopedRow;
    if(scope){
      invariant(typeof scope.executionKey==='string'&&typeof scope.worldId==='string'&&
        typeof scope.receiptNonce==='string'&&/^[a-f0-9]{64}$/.test(scope.compiledSha256),
        'E_WORLD_ISOLATION','缺少原安装世界的精确元数据身份');
      const matches=value.filter(row=>row.worldId===scope.worldId||row.installed?.executionKey===scope.executionKey);
      invariant(matches.length<=1&&(!matches.length||matches[0].worldId===scope.worldId&&
        (!matches[0].installed||matches[0].installed.executionKey===scope.executionKey)),
        'E_WORLD_ISOLATION','安装世界元数据身份冲突');
      scopedRow=matches[0];
    }
    // Updating one already reserved world needs its fresh Authority execution,
    // not unrelated document recovery. Missing session rows retain full recovery.
    const executions=await storage.transaction(['frameworkKV'],'readonly',async tx=>scopedRow?
      [await tx.get('frameworkKV',scope.executionKey)]:readPageRecords(tx,'execution'));
    if(scope){
      const execution=executions.find(row=>row?.executionKey===scope.executionKey);
      invariant(execution?.tag==='page-execution-v1'&&execution.executionKey===scope.executionKey&&
        execution.receiptNonce===scope.receiptNonce&&execution.managedUI?.worldId===scope.worldId&&
        execution.managedUI.compiledSha256===scope.compiledSha256,
        'E_WORLD_ISOLATION','原安装世界执行绑定已改变');
      invariant(scope.initial===true?execution.managedUI.lifecycle===undefined:
        execution.managedUI.lifecycle&&typeof execution.managedUI.lifecycle==='object',
        'E_WORLD_ISOLATION','原安装世界持久生命周期不符合本次元数据阶段');
      if(scopedRow){
        invariant(execution.tabId===scopedRow.tabId&&execution.documentId===scopedRow.documentId,
          'E_WORLD_ISOLATION','原安装世界文档绑定已改变');
        if(scopedRow.installed)assertInstalledBinding(scopedRow,execution);
        else invariant(!scopedRow.managed&&scopedRow.pendingBinding===scope.receiptNonce,
          'E_WORLD_ISOLATION','安装世界预留身份已改变');
      }
    }
    checkpoint('StorageMs');
    if(persisted)for(const execution of executions.filter(row=>row?.tag==='page-execution-v1'))
      persisted.set(execution.executionKey,JSON.stringify(execution.managedUI?.lifecycle));
    const documents=new Map(),recover=[];
    for(const execution of executions.filter(row=>row?.tag==='page-execution-v1'&&row.managedUI?.lifecycle)){
      const row={tabId:execution.tabId,documentId:execution.documentId,worldId:execution.managedUI.worldId,
        installed:execution.managedUI.lifecycle};
      assertInstalledBinding(row,execution);
      recover.push({row,execution});
      if(!value.some(item=>item.worldId===row.worldId||item.installed?.executionKey===execution.executionKey))
        documents.set(row.documentId,true);
    }
    checkpoint('ReconcileMs');
    // Old executions can span hundreds of documents. Keep at most eight fresh
    // UUID observations in flight without idling behind one slow batch member.
    // No result is cached across reads; only an exact absence refunds a slot.
    const ids=[...documents.keys()];let nextDocument=0;
    await Promise.all(Array.from({length:Math.min(8,ids.length)},async()=>{
      while(nextDocument<ids.length){
        const documentId=ids[nextDocument++];
        try{
          const frame=await observeLedgerDocument(api,documentId);
          documents.set(documentId,frame!==null&&frame!==undefined);
        }catch{/* Unobservable and BFCache documents still consume their budget. */}
      }
    }));
    checkpoint('DocumentsMs');
    // Merge against the accumulating ledger in execution order: a row recovered
    // earlier in this read must enforce the same identity binding as a session row.
    for(const {row,execution} of recover){
      const current=value.find(item=>item.worldId===row.worldId||item.installed?.executionKey===execution.executionKey);
      if(current){
        // A stale state mirror may follow a lost session-write acknowledgement;
        // a different identity must never be silently repaired into a dispatch.
        if(current.installed)assertInstalledBinding(current,execution);
        else invariant(current.tabId===row.tabId&&current.documentId===row.documentId&&current.worldId===row.worldId&&
          (!current.pendingBinding||current.pendingBinding===execution.receiptNonce)&&
          Object.keys(current).every(key=>['tabId','documentId','worldId','pendingBinding'].includes(key)),
          'E_WORLD_ISOLATION','安装执行世界与原始预留记录不一致');
        current.installed=row.installed;
        continue;
      }
      if(documents.get(row.documentId))value.push(row);
    }
    checkpoint('MergeMs');
    return value;
  }
  async function reserve(target,pendingBinding,onTiming,beforeReserve) {
      const checkpoint=timingCheckpoint(onTiming);
      const rows = await ledger(undefined,onTiming,'worldReserveLedger');
      checkpoint('worldReserveLedgerMs');
      await beforeReserve(rows);
      invariant(rows.filter(row => row.documentId === target.documentId).length < MAX_PREVIEW_WORLDS_PER_DOCUMENT,
        'E_PREVIEW_WORLD_LIMIT', '当前文档已调试 6 次；请刷新网页后继续。刷新会清除本页旧脚本的运行状态。');
      invariant(rows.length < 4096, 'E_PREVIEW_WORLD_LIMIT', '本次浏览器会话的调试世界已达上限，请关闭不用的标签页');
      const worldId = PREFIX + token();
      rows.push({tabId:target.tabId,documentId:target.documentId,worldId,
        ...(pendingBinding?{pendingBinding}:{})});
      checkpoint('worldReservePrepareMs');
      await api.storage.session.set({[LEDGER]:rows});
      checkpoint('worldReservePersistMs');
      return worldId;
  }
  async function probe(native, target, code, expected, worldId, injectImmediately) {
    const receipt = await native.execute({target:{tabId:target.tabId,documentIds:[target.documentId]},
      ...(target.frameId>0||injectImmediately===true?{injectImmediately:true}:{}),
      world:'USER_SCRIPT', ...(worldId ? {worldId} : {}), js:[{code}]});
    invariant(Array.isArray(receipt) && receipt.length === 1 && receipt[0].frameId === (target.frameId ?? 0) &&
      receipt[0].documentId === target.documentId && receipt[0].error === undefined && receipt[0].result === expected,
      'E_WORLD_ISOLATION', '浏览器未确认独立脚本世界；请刷新网页后重试，未注入依赖或用户代码');
  }
  const observations=new WeakMap();
  const observationTarget=target=>JSON.stringify([target.tabId,target.frameId??0,target.documentId,target.expectedUrl,target.expectedWindowId]);
  function beginAllocation(target,{pendingBinding}={}){
    invariant(typeof pendingBinding==='string'&&pendingBinding.length>0,'E_WORLD_ISOLATION','缺少原世界观察身份');
    const handle=Object.freeze({}),timings={};
    const onTiming=(key,value)=>{timings[key]=value;},checkpoint=timingCheckpoint(onTiming);
    // Readonly only: no FIFO position, Native work or reservation at begin.
    const firstRead=ledger(undefined,onTiming,'worldAllocateLedger').then(rows=>{
      checkpoint('worldAllocateLedgerMs');return {rows};
    },error=>({error}));
    observations.set(handle,{target:observationTarget(target),pendingBinding,firstRead,timings,state:'open'});
    return handle;
  }
  async function discardAllocation(handle){
    const observation=observations.get(handle);
    invariant(observation,'E_WORLD_ISOLATION','观察不属于此分配器');
    if(observation.state==='open')observation.state='discarded';
    await observation.firstRead; // already handled; draining never replaces an earlier error
  }
  async function allocate(native, target, {injectImmediately=false,pendingBinding,onTiming,concurrentProof=false,firstLedger}={}) {
    const checkpoint=timingCheckpoint(onTiming);
    invariant(typeof concurrentProof==='boolean'&&(!concurrentProof||typeof pendingBinding==='string'&&pendingBinding.length>0),
      'E_WORLD_ISOLATION','并行隔离核验必须持有原世界预留');
    const prove=async({worldId,marker,reserved,isolated})=>{
      await probe(native, target, 'const ' + marker + ' = ' + JSON.stringify(reserved) + ';\n' + JSON.stringify(reserved), reserved,undefined,injectImmediately);
      checkpoint('worldProbeDefaultWriteMs');
      const defaultRead=()=>probe(native,target,marker,reserved,undefined,injectImmediately);
      const isolatedRead=()=>probe(native,target,'typeof '+marker+" === 'undefined' ? "+JSON.stringify(isolated)+' : '+JSON.stringify(reserved),isolated,worldId,injectImmediately);
      if(concurrentProof){
        // The acknowledged const write precedes both immutable reads. Require
        // both exact receipts and drain both calls before releasing protection,
        // even when one fails. No dependency or user source is sent here.
        const timed=(work,key)=>{
          const finished=timingCheckpoint(onTiming);
          return work().finally(()=>finished(key));
        };
        const results=await Promise.allSettled([
          timed(defaultRead,'worldProbeDefaultReadMs'),
          timed(isolatedRead,'worldProbeIsolatedMs')
        ]);
        checkpoint('worldProbeReadJoinMs');
        for(const result of results)if(result.status==='rejected')throw result.reason;
      }else{
        await defaultRead();checkpoint('worldProbeDefaultReadMs');
        await isolatedRead();checkpoint('worldProbeIsolatedMs');
      }
    };
    // Start the full readonly observation without yielding our original FIFO
    // position. Handle rejection now, even while earlier Native work holds it.
    const firstCheckpoint=timingCheckpoint(onTiming);
    let observation;
    if(firstLedger!==undefined){
      observation=observations.get(firstLedger);
      invariant(observation?.state==='open'&&observation.target===observationTarget(target)&&
        observation.pendingBinding===pendingBinding,'E_WORLD_ISOLATION','原世界观察身份已变化或已消费');
      observation.state='consumed';
    }
    const firstRead=observation?.firstRead??ledger(undefined,onTiming,'worldAllocateLedger').then(rows=>{
      firstCheckpoint('worldAllocateLedgerMs');return {rows};
    },error=>({error}));
    const allocated=await ordered(async () => {
    checkpoint('worldSerialWaitMs');
    const first=await firstRead;
    if(observation)for(const [key,value] of Object.entries(observation.timings)){try{onTiming?.(key,value)?.catch?.(()=>{});}catch{}}
    checkpoint('worldAllocateReadWaitMs');
    if(Object.hasOwn(first,'error'))throw first.error;
    invariant(typeof native.configureWorld === 'function' && typeof native.getWorldConfigurations === 'function' &&
      typeof native.resetWorldConfiguration === 'function', 'E_WORLD_ISOLATION', '浏览器缺少独立世界配置与对账能力');
    // World configurations persist beyond storage.session and tab-close events
    // are not guaranteed during shutdown. Reconcile only our preview prefix on
    // every allocation, including the first one after a browser restart. Reset
      // may change messaging in existing contexts. Installed parents still need
      // their original channel for frame retirement and managed disposal.
    const configurations = await native.getWorldConfigurations();
    invariant(Array.isArray(configurations), 'E_WORLD_ISOLATION', '无法读取浏览器执行世界配置');
    checkpoint('worldConfigurationsMs');
    const beforeReserve=async rows=>{
      const cleanupCheckpoint=timingCheckpoint(onTiming),liveInstalled=new Set();
      // Union protection only: reserve still charges and persists exclusively
      // its fresh full rows. A stale snapshot cannot authorize or refund them.
      for(const snapshot of [first.rows,rows])for(const row of snapshot){
        if(row.pendingBinding||row.installed&&row.installed.state!=='retired'||
          row.previewFrames&&row.managed&&!['retired','discarded'].includes(row.managed.state))
          liveInstalled.add(row.worldId);
        for(const child of [...(row.installed?.frames||[]),...(row.previewFrames?.frames||[])])
          if(child.worldId&&child.state!=='retired')liveInstalled.add(child.worldId);
      }
    cleanupCheckpoint('worldLiveBindingsMs');
    for (const configuration of configurations) {
        if (typeof configuration.worldId === 'string' && configuration.worldId.startsWith(PREFIX)&&
          !liveInstalled.has(configuration.worldId)){
        const pending=pendingProofs.get(configuration.worldId);if(pending)pending.invalidated=true;
        await native.resetWorldConfiguration(configuration.worldId);
      }
    }
    cleanupCheckpoint('worldCleanupConfigurationsMs');
    };
    const worldId = await reserve(target,pendingBinding,onTiming,beforeReserve), marker = '__opendesk_probe_' + token();
    const reserved = token(), isolated = token();
    checkpoint('worldReserveMs');
    try{
    await native.configureWorld({worldId,csp:PAGE_WORLD_CSP,messaging:false});
    checkpoint('worldConfigureMs');
    const proof={worldId,marker,reserved,isolated,invalidated:false};
    // Only the trusted installed parent opts in. Its persisted pending nonce
    // protects this configuration while Native proves the independent world.
    if(concurrentProof){pendingProofs.set(worldId,proof);return proof;}
    // Random global lexical bindings cannot be deleted, have no getter, and do
    // not depend on mutable Object/Reflect builtins in the default world.
    // Verify the engine retains a global lexical binding across injections;
    // otherwise a temporary wrapper could produce a false isolation result.
    await prove(proof);
    return worldId;
    }catch(error){
      // Allocation has not returned an ID to its caller yet. Release only its
      // pending protection here, keeping the consumed document budget intact.
      if(pendingBinding){
        const rows=await ledger(),row=rows.find(row=>row.worldId===worldId);
        if(row?.pendingBinding===pendingBinding){delete row.pendingBinding;
          await api.storage.session.set({[LEDGER]:rows});}
      }
      throw error;
    }
    });
    if(typeof allocated==='string')return allocated;
    try{
      await prove(allocated);
      await ordered(async()=>{
        const rows=await sessionLedger(),matches=rows.filter(row=>row.worldId===allocated.worldId),row=matches[0];
        invariant(pendingProofs.get(allocated.worldId)===allocated&&!allocated.invalidated&&matches.length===1&&
          row.tabId===target.tabId&&row.documentId===target.documentId&&row.pendingBinding===pendingBinding&&
          !row.installed&&!row.managed&&!row.previewFrames,
          'E_WORLD_ISOLATION','隔离核验期间原世界预留已改变');
      });
      checkpoint('worldProofRevalidationMs');
      return allocated.worldId;
    }catch(error){
      await releasePending({worldId:allocated.worldId,nonce:pendingBinding});throw error;
    }finally{if(pendingProofs.get(allocated.worldId)===allocated)pendingProofs.delete(allocated.worldId);}
  }
  async function cleanup({tabId, documentId, removed = false}) {
    return ordered(async () => {
      const rows = await ledger();
      const stale=rows.filter(row=>row.tabId===tabId&&(removed||row.documentId!==documentId));
      for(const row of stale){const pending=pendingProofs.get(row.worldId);if(pending)pending.invalidated=true;}
      let native;
      try {native = api.userScripts;} catch { /* A removed tab still releases the session ledger. */ }
      if (removed) await api.storage.session.set({[LEDGER]:rows.filter(row => row.tabId !== tabId)});
      if (typeof native?.resetWorldConfiguration !== 'function') return;
      for (const row of stale) {
        try {await native.resetWorldConfiguration(row.worldId);} catch {
          throw new FoundationError('E_WORLD_ISOLATION', '无法清理已离开文档的世界配置');
        }
      }
      // Resetting configuration does NOT destroy a world, stop listeners or
      // refund document budget. BFCache can restore the same document later.
    });
  }
  const releasePending=({worldId,nonce})=>ordered(async()=>{
    const rows=await ledger(),row=rows.find(row=>row.worldId===worldId);
    if(row?.pendingBinding!==nonce)return;
    const pending=pendingProofs.get(worldId);if(pending)pending.invalidated=true;
    delete row.pendingBinding;
    await api.storage.session.set({[LEDGER]:rows});
  });
  const editRecords=(work,scope)=>ordered(async()=>{
    invariant(!scope||storage,'E_WORLD_ISOLATION','安装元数据必须核对原持久执行');
    const persisted=new Map(),rows=await ledger(persisted,undefined,'',scope),
      before=rows.map(row=>JSON.stringify(row.installed)),
      original=scope?rows.map(row=>JSON.stringify(row)):undefined,
      identities=rows.map(row=>[row.tabId,row.documentId,row.worldId]),result=work(rows);
    invariant(!result?.then&&rows.length===identities.length&&rows.every((row,i)=>row.tabId===identities[i][0]&&row.documentId===identities[i][1]&&row.worldId===identities[i][2]),'E_WORLD_ISOLATION','受管元数据不能改变世界预算或身份');
    if(scope)invariant(rows.filter(row=>row.worldId===scope.worldId).length===1&&
      rows.every((row,i)=>row.worldId===scope.worldId||JSON.stringify(row)===original[i]),
      'E_WORLD_ISOLATION','精确元数据更新不能修改其他世界');
    // Keep lifecycle transitions in the original Authority execution before
    // mirroring the session ledger or invoking a disposer. An extension reload
    // must not turn an attempted cleanup into a fresh ready world.
    if(storage)await storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      for(const [index,row] of rows.entries()){
        const changed=JSON.stringify(row.installed)!==before[index];
        if(!row.installed||!changed&&(!scope||row.worldId!==scope.worldId))continue;
        const execution=await tx.get('frameworkKV',row.installed.executionKey);
        assertInstalledBinding(row,execution);
        if(scope)invariant(row.installed.executionKey===scope.executionKey&&
          execution.receiptNonce===scope.receiptNonce&&execution.managedUI.compiledSha256===scope.compiledSha256,
          'E_WORLD_ISOLATION','原安装世界执行绑定已改变');
        invariant(JSON.stringify(execution.managedUI?.lifecycle)===persisted.get(row.installed.executionKey),
          'E_WORLD_ISOLATION','安装执行状态已变更，请重新核对，未重放清理');
        if(changed)await tx.put('frameworkKV',{...execution,managedUI:{...execution.managedUI,lifecycle:row.installed}},row.installed.executionKey);
      }
    });
    for(const row of rows)if((!scope||row.worldId===scope.worldId)&&row.installed&&row.pendingBinding===row.installed.receiptNonce)delete row.pendingBinding;
    await api.storage.session.set({[LEDGER]:rows});return result;
  });
  return Object.freeze({allocate,beginAllocation,discardAllocation,cleanup,records:ledger,editRecords,releasePending});
}
