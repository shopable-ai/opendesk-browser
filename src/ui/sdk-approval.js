import {normalizeSdkTargetScope} from '../framework/sdk/target-origins.js';

function fail(code, message) { const error = new Error(message); error.code = code; return error; }
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sorted = values => [...new Set(values)].sort();

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
  let revision = 0, busy = false, disposed = false, lastReceipt;
  function publish(state, message, snapshot, receipt, error) {
    if (!disposed) onState({state, message, snapshot, receipt, error,
      // Historical evidence only: neither a denied expansion nor an edit proves
      // an earlier grant is revoked, active, or extended to the new inputs.
      lastConfirmedReceipt:lastReceipt});
  }
  function invalidate(message = '选择已变更，请按当前快照重新批准') {
    revision++;
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
  return {approve, invalidate, get busy() { return busy; },
    dispose() { disposed = true; revision++; }};
}
