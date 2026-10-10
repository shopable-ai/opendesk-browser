import {normalizeSdkTargetScope} from '../framework/sdk/target-origins.js';

function fail(code, message) { const error = new Error(message); error.code = code; return error; }
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sorted = values => [...new Set(values)].sort();

// A READ-ONLY convenience preset for the first-party local HTTP test lab.
// It never installs scripts, requests Chrome permissions or grants network
// access. The actual exact-document snapshot and trusted click remain required.
export function sdkHttpLabPreset(urlText) {
  let url;
  try { url = new URL(urlText); } catch { return null; }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
      !['43111', '43112'].includes(url.port) || url.pathname !== '/demo-form.html' ||
      url.username || url.password) return null;
  return Object.freeze({capabilities:Object.freeze(['network']), targetText:'https://httpbingo.org'});
}

// An immutable UI input snapshot, NOT a grant. The authority still derives the
// actual principal and document, validates capabilities, and owns all persistence.
export function snapshotSdkApproval({document: selected, capabilities, targetText = ''}) {
  if (!selected || !Number.isSafeInteger(selected.tabId) || selected.tabId < 0 ||
      !Number.isSafeInteger(selected.frameId) || selected.frameId < 0 ||
      typeof selected.documentId !== 'string' || !selected.documentId)
    throw fail('E_DOCUMENT_STALE', '请选择一个精确的当前文档');
  if (!Array.isArray(capabilities) || !capabilities.length || capabilities.some(value => typeof value !== 'string' || !value))
    throw fail('E_CAPABILITY', '请明确选择 SDK 服务');
  if (typeof targetText !== 'string' || targetText.length > 18000)
    throw fail('E_SCHEMA', '目标 origin 输入超出预算');
  const source = new URL(selected.url);
  // The displayed textarea allows blank lines and trims each line. It never
  // interprets comma-separated URLs, ranges, paths, or existing grant scope.
  const entries = targetText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const scope = normalizeSdkTargetScope(source.origin, entries);
  const choices = Object.freeze(sorted(capabilities));
  if (scope.targetOrigins.length && !choices.includes('network'))
    throw fail('E_CAPABILITY', '批准额外目标必须勾选 HTTP 网络请求');
  return Object.freeze({tabId:selected.tabId, frameId:selected.frameId, documentId:selected.documentId,
    sourceOrigin:scope.sourceOrigin, capabilities:choices,
    targetOrigins:scope.targetOrigins, allowedOrigins:scope.allowedOrigins});
}

export function sdkNativePermissionRequest(snapshot, permissionPattern) {
  // Source permission is also needed for fixed SDK injection. Chrome host
  // patterns may cover more ports than the exact application-layer approval.
  return {origins:sorted(snapshot.allowedOrigins.map(permissionPattern)),
    ...(snapshot.capabilities.includes('notifications') ? {permissions:['notifications']} : {})};
}

function checkReceipt(receipt, snapshot) {
  if (receipt?.installed !== true || receipt.documentId !== snapshot.documentId ||
      receipt.sourceOrigin !== snapshot.sourceOrigin ||
      typeof receipt.grantIncarnation !== 'string' || !receipt.grantIncarnation ||
      !same(receipt.capabilities, snapshot.capabilities) ||
      !same(receipt.targetOrigins, snapshot.targetOrigins) ||
      !same(receipt.allowedOrigins, snapshot.allowedOrigins))
    throw fail('E_RECEIPT', 'Authority 回执与本次批准快照不一致；不能显示为授权成功');
}

export function createSdkApproval({api, client, permissionPattern, readSelection, onState = () => {}, onBusy = () => {}}) {
  let revision = 0, busy = false, disposed = false, lastReceipt, currentGrant;
  function publish(state, message, snapshot, receipt, error) {
    if (!disposed) onState({state, message, snapshot, receipt, error,
      // Historical evidence only: neither a denied expansion nor an edit proves
      // an earlier grant is revoked, active, or extended to the new inputs.
      lastConfirmedReceipt:lastReceipt});
  }
  function invalidate(message = '选择已变更，请按当前快照重新批准') {
    revision++;
    currentGrant = undefined;
    publish('stale', message);
  }
  function assertSelection(snapshot, version) {
    if (disposed || version !== revision || !same(snapshotSdkApproval(readSelection()), snapshot))
      throw fail('E_DOCUMENT_STALE', '批准期间文档或输入已变化；本次确认不能用于新选择');
  }
  async function inspect(snapshot, version) {
    const [tab, frames] = await Promise.all([
      api.tabs.get(snapshot.tabId), api.webNavigation.getAllFrames({tabId:snapshot.tabId})
    ]);
    assertSelection(snapshot, version);
    const frame = frames?.find(value => value.frameId === snapshot.frameId && value.documentId === snapshot.documentId);
    if (tab.incognito !== false || !frame || frame.errorOccurred || frame.documentLifecycle !== 'active' ||
        new URL(frame.url).origin !== snapshot.sourceOrigin)
      throw fail('E_DOCUMENT_STALE', '来源文档已关闭、导航或不再处于可授权状态');
    const permitted = await api.permissions.contains(sdkNativePermissionRequest(snapshot, permissionPattern));
    assertSelection(snapshot, version);
    if (!permitted) throw fail('E_PERMISSION', '原生权限已失效，请重新批准');
  }
  async function approve(event) {
    if (!event?.isTrusted) throw fail('E_GESTURE', '必须由真实用户点击批准');
    if (disposed) throw fail('E_DOCUMENT_STALE', '工具窗口已关闭');
    if (busy) throw fail('E_BUSY', '本次批准仍在处理中，不会重复发送');
    const version = revision;
    let snapshot, submitted = false;
    busy = true;
    try {
      snapshot = snapshotSdkApproval(readSelection());
      // Deliberately BEFORE the first await, including client.ready. The caller
      // invokes approve directly in the trusted click handler, not a timer.
      const permission = api.permissions.request(sdkNativePermissionRequest(snapshot, permissionPattern));
      onBusy(true);
      publish('awaiting-permission', '正在等待原生权限批准；尚未授予新的应用范围', snapshot);
      if (!await permission) throw fail('E_PERMISSION', '原生权限被拒绝；未提交新的应用授权，既有范围不视为已扩大');
      assertSelection(snapshot, version);
      await client.ready;
      assertSelection(snapshot, version);
      await inspect(snapshot, version);
      assertSelection(snapshot, version);
      submitted = true;
      publish('installing', '正在通过现有 authority 授权并安装此快照', snapshot);
      const receipt = await client.request('installSdk', {tabId:snapshot.tabId, frameId:snapshot.frameId,
        documentId:snapshot.documentId, capabilities:[...snapshot.capabilities], targetOrigins:[...snapshot.targetOrigins]});
      checkReceipt(receipt, snapshot);
      lastReceipt = structuredClone(receipt);
      // An edit after RPC dispatch does not cancel a possible grant. Preserve the
      // receipt for its ORIGINAL snapshot, but never paint current inputs green.
      await inspect(snapshot, version);
      currentGrant = Object.freeze({tabId:snapshot.tabId,frameId:snapshot.frameId,
        documentId:snapshot.documentId,grantIncarnation:receipt.grantIncarnation});
      publish('installed', receipt.requiresReapprovalAfterWorkerRestart
        ? 'Authority 已确认此快照；Worker 重启后须重新批准，后续调用仍由 authority 核验；ready 可能复用先前 Hello'
        : 'Authority 已确认此快照；后续调用仍由 authority 核验；ready 可能复用先前 Hello', snapshot, receipt);
      return receipt;
    } catch (error) {
      const state = error.code === 'E_DOCUMENT_STALE' ? 'stale' : submitted ? 'unknown' : 'denied';
      publish(state, `${error.code || 'E_TARGET'}：${error.message || error}${submitted ? '；安装可能已经发生，不自动重试或将原快照授权套用于新输入' : ''}`,
        snapshot, undefined, {code:error.code || 'E_TARGET', message:String(error.message || error)});
      throw error;
    } finally {
      busy = false;
      if (!disposed) onBusy(false);
    }
  }

  function selectedDocument() {
    const doc = readSelection()?.document;
    if (!doc || !Number.isSafeInteger(doc.tabId) || doc.tabId < 0 ||
        !Number.isSafeInteger(doc.frameId) || doc.frameId < 0 ||
        typeof doc.documentId !== 'string' || !doc.documentId)
      throw fail('E_DOCUMENT_STALE', '请选择当前精确网页文档');
    let origin;
    try { origin = new URL(doc.url); } catch { throw fail('E_DOCUMENT_STALE', '当前文档地址无效'); }
    if (!['http:','https:'].includes(origin.protocol))
      throw fail('E_DOCUMENT_STALE', '只能读取 HTTP(S) 网页文档授权');
    return Object.freeze({tabId:doc.tabId,frameId:doc.frameId,documentId:doc.documentId});
  }
  function assertSelected(doc, version) {
    if (disposed || version !== revision || !same(selectedDocument(),doc))
      throw fail('E_DOCUMENT_STALE', '文档选择已更改，本次结果属于旧文档');
  }
  async function inspectGrant() {
    if (disposed) throw fail('E_DOCUMENT_STALE', '工具窗口已经关闭');
    if (busy) throw fail('E_BUSY', '正在处理另一项授权操作');
    const selected=selectedDocument(), version=revision;
    busy=true;onBusy(true);
    try {
      publish('checking', '正在只读查询此文档的实际 SDK 授权，不申请新权限');
      await client.ready;
      assertSelected(selected,version);
      const receipt=await client.request('inspectSdkGrant',selected);
      assertSelected(selected,version);
      if (receipt?.documentId!==selected.documentId ||
          typeof receipt.sourceOrigin!=='string' || typeof receipt.present!=='boolean')
        throw fail('E_RECEIPT', 'SDK 授权查询回执不符合合同');
      if (receipt.present) {
        if (typeof receipt.grantIncarnation!=='string'||!receipt.grantIncarnation)
          throw fail('E_RECEIPT', 'Authority 未提供原始授权实例');
        currentGrant=Object.freeze({...selected,grantIncarnation:receipt.grantIncarnation});
        publish('observed', '已发现该文档的 SDK 授权（只读快照，不保证已注入或后续仍有效）',undefined,receipt);
      } else {
        currentGrant=undefined;
        publish('absent', '此网页文档目前没有有效的 SDK 应用授权',undefined,receipt);
      }
      return receipt;
    } catch (error) {
      currentGrant=undefined;
      publish(error.code==='E_DOCUMENT_STALE'?'stale':'unknown',
        `${error.code||'E_TARGET'}：${error.message||error}；无法确认当前授权状态`);
      throw error;
    } finally {
      busy=false;if(!disposed)onBusy(false);
    }
  }
  async function revoke(event) {
    if (!event?.isTrusted) throw fail('E_GESTURE','撤销必须由用户真实点击');
    if (disposed) throw fail('E_DOCUMENT_STALE','工具窗口已经关闭');
    if (busy) throw fail('E_BUSY','正在处理另一项授权操作');
    const selected=selectedDocument(),version=revision,grant=currentGrant;
    if (!grant || grant.tabId!==selected.tabId || grant.frameId!==selected.frameId ||
        grant.documentId!==selected.documentId)
      throw fail('E_GRANT_REVOKED','当前文档没有已确认的授权实例，请先查询');
    busy=true;onBusy(true);
    let submitted=false;
    try {
      await client.ready;
      assertSelected(selected,version);
      submitted=true;
      publish('revoking','正在撤销原始授权实例；不会新增 Chrome 原生权限');
      const receipt=await client.request('revokeSdkGrant',{...selected,grantIncarnation:grant.grantIncarnation});
      if(receipt?.revoked!==true || receipt.grantIncarnation!==grant.grantIncarnation ||
          !same(selected,{tabId:receipt.tabId,frameId:receipt.frameId,documentId:receipt.documentId}))
        throw fail('E_RECEIPT','Authority 撤销回执与原授权实例不同，不能认定撤销成功');
      assertSelected(selected,version);
      currentGrant=undefined;
      publish('revoked','原 SDK 授权已撤销；已发生的网页效果不会回滚，请刷新网页清理已加载代码',
        undefined,receipt);
      return receipt;
    } catch (error) {
      if(submitted)currentGrant=undefined;
      publish(error.code==='E_DOCUMENT_STALE'?'stale':submitted?'unknown':'denied',
        `${error.code||'E_TARGET'}：${error.message||error}${submitted?'；撤销可能已发生，先查询状态，不自动重试':''}`);
      throw error;
    } finally {
      busy=false;if(!disposed)onBusy(false);
    }
  }
  return {approve, inspectGrant, revoke, invalidate, get busy() { return busy; },
    get currentGrant() { return currentGrant; },
    dispose() { disposed = true; revision++; currentGrant = undefined; }};
}
