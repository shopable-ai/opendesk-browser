import {FoundationError, invariant} from '../../platform/protocol.js';
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
  const ordered = work => {
    const next = serial.then(work, work);
    serial = next.catch(() => {});
    return next;
  };
  async function ledger(persisted) {
    invariant(typeof api.storage?.session?.get === 'function' && typeof api.storage.session.set === 'function',
      'E_WORLD_ISOLATION', '缺少浏览器会话级执行世界账本');
    const value = (await api.storage.session.get(LEDGER))[LEDGER] ?? [];
    invariant(Array.isArray(value) && value.every(row => Number.isSafeInteger(row.tabId) &&
      typeof row.documentId === 'string' && typeof row.worldId === 'string' && row.worldId.startsWith(PREFIX)),
      'E_WORLD_ISOLATION', '执行世界账本损坏，请关闭当前标签页后重试');
    if(!storage)return value;
    const executions=await storage.transaction(['frameworkKV'],'readonly',tx=>tx.all('frameworkKV'));
    if(persisted)for(const execution of executions.filter(row=>row?.tag==='page-execution-v1'))
      persisted.set(execution.executionKey,JSON.stringify(execution.managedUI?.lifecycle));
    const documents=new Map();
    for(const execution of executions.filter(row=>row?.tag==='page-execution-v1'&&row.managedUI?.lifecycle)){
      const row={tabId:execution.tabId,documentId:execution.documentId,worldId:execution.managedUI.worldId,
        installed:execution.managedUI.lifecycle};
      assertInstalledBinding(row,execution);
      const current=value.find(item=>item.worldId===row.worldId||item.installed?.executionKey===execution.executionKey);
      if(current){
        // A stale state mirror may follow a lost session-write acknowledgement;
        // a different identity must never be silently repaired into a dispatch.
        if(current.installed)assertInstalledBinding(current,execution);
        else invariant(current.tabId===row.tabId&&current.documentId===row.documentId&&current.worldId===row.worldId&&
          Object.keys(current).every(key=>['tabId','documentId','worldId'].includes(key)),
          'E_WORLD_ISOLATION','安装执行世界与原始预留记录不一致');
        current.installed=row.installed;
        continue;
      }
      if(!documents.has(row.documentId)){
        let exists=true;
        try{const frame=await api.webNavigation.getFrame({documentId:row.documentId});exists=frame!==null&&frame!==undefined;}
        catch{/* Unobservable and BFCache documents still consume their budget. */}
        documents.set(row.documentId,exists);
      }
      if(documents.get(row.documentId))value.push(row);
    }
    return value;
  }
  async function reserve(target) {
      const rows = await ledger();
      invariant(rows.filter(row => row.documentId === target.documentId).length < MAX_PREVIEW_WORLDS_PER_DOCUMENT,
        'E_PREVIEW_WORLD_LIMIT', '当前文档已调试 6 次；请刷新网页后继续。刷新会清除本页旧脚本的运行状态。');
      invariant(rows.length < 4096, 'E_PREVIEW_WORLD_LIMIT', '本次浏览器会话的调试世界已达上限，请关闭不用的标签页');
      const worldId = PREFIX + token();
      rows.push({tabId:target.tabId,documentId:target.documentId,worldId});
      await api.storage.session.set({[LEDGER]:rows});
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
  async function allocate(native, target, {injectImmediately=false}={}) {
    return ordered(async () => {
    invariant(typeof native.configureWorld === 'function' && typeof native.getWorldConfigurations === 'function' &&
      typeof native.resetWorldConfiguration === 'function', 'E_WORLD_ISOLATION', '浏览器缺少独立世界配置与对账能力');
    // World configurations persist beyond storage.session and tab-close events
    // are not guaranteed during shutdown. Reconcile only our preview prefix on
    // every allocation, including the first one after a browser restart. Reset
      // may change messaging in existing contexts. Installed parents still need
      // their original channel for frame retirement and managed disposal.
    const configurations = await native.getWorldConfigurations();
    invariant(Array.isArray(configurations), 'E_WORLD_ISOLATION', '无法读取浏览器执行世界配置');
      const liveInstalled=new Set((await ledger()).filter(row=>row.installed&&row.installed.state!=='retired'||
        row.previewFrames&&row.managed&&!['retired','discarded'].includes(row.managed.state))
        .map(row=>row.worldId));
    for (const configuration of configurations) {
        if (typeof configuration.worldId === 'string' && configuration.worldId.startsWith(PREFIX)&&
          !liveInstalled.has(configuration.worldId))
        await native.resetWorldConfiguration(configuration.worldId);
    }
    const worldId = await reserve(target), marker = '__opendesk_probe_' + token();
    const reserved = token(), isolated = token();
    await native.configureWorld({worldId,csp:PAGE_WORLD_CSP,messaging:false});
    // Random global lexical bindings cannot be deleted, have no getter, and do
    // not depend on mutable Object/Reflect builtins in the default world.
    await probe(native, target, 'const ' + marker + ' = ' + JSON.stringify(reserved) + ';\n' + JSON.stringify(reserved), reserved,undefined,injectImmediately);
    // Verify the engine retains a global lexical binding across injections;
    // otherwise a temporary wrapper could produce a false isolation result.
    await probe(native, target, marker, reserved,undefined,injectImmediately);
    await probe(native, target, 'typeof ' + marker + " === 'undefined' ? " + JSON.stringify(isolated) + ' : ' + JSON.stringify(reserved), isolated, worldId,injectImmediately);
    return worldId;
    });
  }
  async function cleanup({tabId, documentId, removed = false}) {
    return ordered(async () => {
      const rows = await ledger();
      let native;
      try {native = api.userScripts;} catch { /* A removed tab still releases the session ledger. */ }
      if (removed) await api.storage.session.set({[LEDGER]:rows.filter(row => row.tabId !== tabId)});
      if (typeof native?.resetWorldConfiguration !== 'function') return;
      for (const row of rows.filter(row => row.tabId === tabId && (removed || row.documentId !== documentId))) {
        try {await native.resetWorldConfiguration(row.worldId);} catch {
          throw new FoundationError('E_WORLD_ISOLATION', '无法清理已离开文档的世界配置');
        }
      }
      // Resetting configuration does NOT destroy a world, stop listeners or
      // refund document budget. BFCache can restore the same document later.
    });
  }
  const editRecords=work=>ordered(async()=>{
    const persisted=new Map(),rows=await ledger(persisted),
      before=rows.map(row=>JSON.stringify(row.installed)),
      identities=rows.map(row=>[row.tabId,row.documentId,row.worldId]),result=work(rows);
    invariant(!result?.then&&rows.length===identities.length&&rows.every((row,i)=>row.tabId===identities[i][0]&&row.documentId===identities[i][1]&&row.worldId===identities[i][2]),'E_WORLD_ISOLATION','受管元数据不能改变世界预算或身份');
    // Keep lifecycle transitions in the original Authority execution before
    // mirroring the session ledger or invoking a disposer. An extension reload
    // must not turn an attempted cleanup into a fresh ready world.
    if(storage)await storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      for(const [index,row] of rows.entries()){
        if(!row.installed||JSON.stringify(row.installed)===before[index])continue;
        const execution=await tx.get('frameworkKV',row.installed.executionKey);
        assertInstalledBinding(row,execution);
        invariant(JSON.stringify(execution.managedUI?.lifecycle)===persisted.get(row.installed.executionKey),
          'E_WORLD_ISOLATION','安装执行状态已变更，请重新核对，未重放清理');
        await tx.put('frameworkKV',{...execution,managedUI:{...execution.managedUI,lifecycle:row.installed}},row.installed.executionKey);
      }
    });
    await api.storage.session.set({[LEDGER]:rows});return result;
  });
  return Object.freeze({allocate,cleanup,records:ledger,editRecords});
}
