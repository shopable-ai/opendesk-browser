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

export function createPreviewWorlds({api}) {
  let serial = Promise.resolve();
  const ordered = work => {
    const next = serial.then(work, work);
    serial = next.catch(() => {});
    return next;
  };
  async function ledger() {
    invariant(typeof api.storage?.session?.get === 'function' && typeof api.storage.session.set === 'function',
      'E_WORLD_ISOLATION', '缺少浏览器会话级执行世界账本');
    const value = (await api.storage.session.get(LEDGER))[LEDGER] ?? [];
    invariant(Array.isArray(value) && value.every(row => Number.isSafeInteger(row.tabId) &&
      typeof row.documentId === 'string' && typeof row.worldId === 'string' && row.worldId.startsWith(PREFIX)),
      'E_WORLD_ISOLATION', '执行世界账本损坏，请关闭当前标签页后重试');
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
  async function probe(native, target, code, expected, worldId) {
    const receipt = await native.execute({target:{tabId:target.tabId,documentIds:[target.documentId]},
      world:'USER_SCRIPT', ...(worldId ? {worldId} : {}), js:[{code}]});
    invariant(Array.isArray(receipt) && receipt.length === 1 && receipt[0].frameId === 0 &&
      receipt[0].documentId === target.documentId && receipt[0].error === undefined && receipt[0].result === expected,
      'E_WORLD_ISOLATION', '浏览器未确认独立脚本世界；请刷新网页后重试，未注入依赖或用户代码');
  }
  async function allocate(native, target) {
    return ordered(async () => {
    invariant(typeof native.configureWorld === 'function' && typeof native.getWorldConfigurations === 'function' &&
      typeof native.resetWorldConfiguration === 'function', 'E_WORLD_ISOLATION', '浏览器缺少独立世界配置与对账能力');
    // World configurations persist beyond storage.session and tab-close events
    // are not guaranteed during shutdown. Reconcile only our preview prefix on
    // every allocation, including the first one after a browser restart. Reset
    // affects future contexts, not already-created worlds or document budgets.
    const configurations = await native.getWorldConfigurations();
    invariant(Array.isArray(configurations), 'E_WORLD_ISOLATION', '无法读取浏览器执行世界配置');
    for (const configuration of configurations) {
      if (typeof configuration.worldId === 'string' && configuration.worldId.startsWith(PREFIX))
        await native.resetWorldConfiguration(configuration.worldId);
    }
    const worldId = await reserve(target), marker = '__opendesk_probe_' + token();
    const reserved = token(), isolated = token();
    await native.configureWorld({worldId,csp:PAGE_WORLD_CSP,messaging:false});
    // Random global lexical bindings cannot be deleted, have no getter, and do
    // not depend on mutable Object/Reflect builtins in the default world.
    await probe(native, target, 'const ' + marker + ' = ' + JSON.stringify(reserved) + ';\n' + JSON.stringify(reserved), reserved);
    // Verify the engine retains a global lexical binding across injections;
    // otherwise a temporary wrapper could produce a false isolation result.
    await probe(native, target, marker, reserved);
    await probe(native, target, 'typeof ' + marker + " === 'undefined' ? " + JSON.stringify(isolated) + ' : ' + JSON.stringify(reserved), isolated, worldId);
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
  return Object.freeze({allocate,cleanup});
}
