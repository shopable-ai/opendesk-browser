import {PROTOCOL, permissionPattern} from '../environment.js';
import {ADMITTED_METHODS} from '../framework/sdk/registry.js';
import {requireChromePermissions} from '../platform/chrome/permission-gate.js';
import {createSiteAccess} from './site-access.js';
import {createSdkApproval, sdkApprovalPreview, sdkHttpLabPreset} from './sdk-approval.js';
import {inspectUserScriptsAccess, userScriptsSettingsURL} from './user-scripts-access.js';

const capabilityLabels = {
  'network.localRelay': '本机 Node HTTP 转发（独立配对；仅批准的本机 GET）',
  network: 'HTTP 网络请求', 'storage.persistent': '持久存储',
  'storage.session': '浏览器会话存储', notifications: '通知', 'device.id': '稳定应用 ID',
  'network.info': '外部网络信息（当前未启用）',
  'service.log': '调试日志', 'service.time': '当前时间', 'resources.packaged': '内置资源'
};
// Deliberate development defaults; newly admitted capabilities need a separate decision.
const defaultCapabilities = new Set(['network', 'storage.persistent', 'storage.session',
  'notifications', 'device.id', 'service.log', 'service.time', 'resources.packaged']);

// React owns the controls. These fields are observations and inputs, never an
// authorization store; the original Chrome gate and SDK Authority still decide.
export function createDeveloperHostControls({api, client, view, currentPageTarget}) {
  const fields = view.fields, actions = new Map();
  let disposed = false, target, healthVersion = 0;
  let sdkDocuments = new Map(), sdkSelectionVersion = 0, sdkBusy = false, autoLabPreset = null;
  const sdkDrafts = new Map();
  let sdkDraftKey = null, unboundSdkDraft = null;
  let sdkTabs = new Map(), sdkFollowCurrent = true, sdkCurrentReady = false, sdkCurrentIdentity, sdkRefreshVersion = 0;
  const currentIdentity = state => JSON.stringify([state?.status, state?.windowId, state?.tabId,
    state?.frameId, state?.documentId, state?.origin]);
  const patch = (id, values) => { if (!disposed) view.patch(id, values); };
  const bind = (id, action) => {
    if (view.actions[id]) throw new Error('E_DEVELOPER_ACTION_OWNER: ' + id);
    const handler = (...args) => disposed ? undefined : action(...args);
    view.actions[id] = handler; actions.set(id, handler);
  };
  const warn = (message, error) => console.warn(message, error);

  function renderSiteAccess(state) {
    const satisfied = state.snapshot?.websites === true;
    patch('site-access-status', {data:{state:state.phase, websites:state.snapshot?.websites},
      textContent:state.message + (state.snapshot
        ? `（Cookie：${state.snapshot.cookies ? '已授权' : '未授权'}；通知：${state.snapshot.notifications ? '已授权' : '未授权'}）` : '')});
    patch('site-access-grant', {disabled:state.busy || !state.snapshot || satisfied,
      textContent:state.busy ? '正在恢复访问…' : satisfied ? '全部网站已授权' : '恢复全部网站访问'});
  }
  const siteAccess = createSiteAccess({api, onState:renderSiteAccess});
  renderSiteAccess({phase:'checking', message:'正在查询 Chrome 网站权限', snapshot:null, busy:false});
  const grantSiteAccess = event => siteAccess.grant(event).catch(error => warn('Chrome site access not granted', error));
  bind('site-access-grant', grantSiteAccess);
  // The App Shell may use the same state/action for its recovery entry. There
  // is no hidden recovery DOM or second permission controller to keep in sync.
  bind('site-access-restore', grantSiteAccess);
  bind('site-access-refresh', () => siteAccess.refresh().catch(error => warn('Chrome site access refresh failed', error)));

  let userScriptsRead = 0, openingUserScriptsSettings = false, userScriptsSettingsTab;
  let userScriptsPermissionsActive = false;
  const renderUserScripts = (state, textContent) =>
    patch('browser-user-scripts-status', {data:{state}, textContent});
  const refreshUserScripts = async () => {
    const read = ++userScriptsRead;
    const available = await inspectUserScriptsAccess(api).catch(() => null);
    if (disposed || read !== userScriptsRead) return;
    patch('browser-user-scripts-reopen-hint', {hidden:available !== false});
    if (available === true) renderUserScripts('available', 'Chrome 用户脚本功能可用');
    else if (available === false) renderUserScripts('unavailable', '未检测到 Chrome 用户脚本功能');
    else renderUserScripts('unknown', '暂时无法确认，请重新检测');
  };
  bind('browser-user-scripts-refresh', refreshUserScripts);
  bind('browser-user-scripts-panel-active', active => {
    userScriptsPermissionsActive = active === true;
    if (userScriptsPermissionsActive) void refreshUserScripts();
  });
  const checkSettingsReturn = () => {
    if (userScriptsPermissionsActive) void refreshUserScripts();
  };
  const userScriptsTabActivated = ({tabId, windowId}) => {
    const ownerWindow = currentPageTarget?.windowId ?? userScriptsSettingsTab?.windowId;
    if (Number.isInteger(ownerWindow) && ownerWindow === windowId && userScriptsSettingsTab?.id !== tabId)
      checkSettingsReturn();
  };
  api.tabs.onActivated?.addListener(userScriptsTabActivated);
  bind('browser-user-scripts-settings', async event => {
    if (event?.isTrusted !== true || openingUserScriptsSettings) return;
    openingUserScriptsSettings = true;
    patch('browser-user-scripts-settings-error', {hidden:true});
    try {
      const url = userScriptsSettingsURL(api);
      if (!url) throw new Error('Invalid extension ID');
      const tab = await api.tabs.create({url});
      if (!disposed && Number.isInteger(tab?.id) && Number.isInteger(tab?.windowId)) userScriptsSettingsTab = tab;
    } catch {
      const name = api.runtime.getManifest?.()?.name;
      const extension = typeof name === 'string' && name.trim() ? '「' + name + '」' : '当前扩展';
      patch('browser-user-scripts-settings-error', {hidden:false, textContent:
        '未能打开设置。请从 Chrome 菜单进入「扩展程序 → 管理扩展程序」，找到' + extension + '，在「详情」中开启「允许用户脚本」。'});
    } finally {
      openingUserScriptsSettings = false;
    }
  });

  function displayHealth(error, data) {
    patch('status', {data:{error:String(Boolean(error))}, textContent:error
      ? `${error.code || 'E_TARGET'}：${error.message}`
      : data?.scope === 'environment-health-only' ? '目标健康检查通过（仅环境通信）' : '工具窗口已聚焦'});
    patch('health-result', {textContent:data ? JSON.stringify(data, null, 2) : ''});
  }
  async function request(type, payload = {}) {
    const response = await api.runtime.sendMessage({protocol:PROTOCOL, type, ...payload});
    if (!response?.ok) throw response?.error || {code:'E_TARGET', message:'未收到扩展响应'};
    return response.data;
  }
  async function healthAction(operation) {
    const version = ++healthVersion;
    patch('status', {textContent:'正在检查…'});
    try {
      const data = await operation();
      if (disposed || version !== healthVersion) return;
      if (data?.target) { target = data.target; patch('check-target', {disabled:false}); }
      displayHealth(null, data);
    } catch (error) { if (!disposed && version === healthVersion) displayHealth(error); }
  }
  bind('create-target', event => {
    if (!event?.isTrusted) return;
    let url, pattern;
    try { url = fields['target-url'].value; pattern = permissionPattern(url); }
    catch (error) { displayHealth(error); return; }
    return healthAction(async () => {
      await requireChromePermissions({api, request:{origins:[pattern]}});
      if (!disposed) return request('CREATE_HEALTH_TARGET', {url});
    });
  });
  bind('check-source', () => healthAction(() => request('CHECK_SOURCE')));
  bind('check-target', () => {
    if (!fields['check-target'].disabled) return healthAction(() => request('CHECK_HEALTH', {target}));
  });

  patch('sdk-capabilities', {rows:[...new Set(Object.values(ADMITTED_METHODS).map(method => method.capability))]
    .map(value => ({value, label:capabilityLabels[value] || value,
      checked:defaultCapabilities.has(value), disabled:value === 'network.info'}))});
  const selectedCapabilities = () => fields['sdk-capabilities'].rows.filter(row => row.checked && !row.disabled).map(row => row.value);
  const sdkSelection = () => ({document:sdkDocuments.get(fields['sdk-document'].value),
    capabilities:selectedCapabilities(), targetText:fields['sdk-target-origins'].value});
  function sdkPageSummary() {
    const doc = sdkSelection().document, tab = sdkTabs.get(fields['sdk-tab'].value);
    patch('sdk-page-title', {textContent:doc ? tab?.title || new URL(doc.url).hostname :
      sdkFollowCurrent ? currentPageTarget?.snapshot?.message || '正在识别当前网页…' : '所选网页的文档尚未确认'});
    patch('sdk-page-url', {textContent:doc?.url || ''});
    patch('sdk-use-current', {hidden:sdkFollowCurrent || !currentPageTarget});
  }
  function sdkDisplay(state, message, data) {
    patch('sdk-status', {data:{state}, textContent:message});
    patch('sdk-result', {textContent:data === undefined ? '' : JSON.stringify(data, null, 2)});
  }
  const sdkError = error => sdkDisplay('error', `${error.code || 'E_TARGET'}：${error.message || error}`);
  function sdkUpdateButtons() {
    const {valid, text} = sdkApprovalPreview(sdkSelection());
    patch('sdk-approval-preview', {textContent:text});
    patch('sdk-install', {disabled:sdkBusy || !valid});
    patch('sdk-inspect', {disabled:sdkBusy || !sdkDocuments.has(fields['sdk-document'].value)});
    patch('sdk-revoke', {disabled:sdkBusy || !sdkApproval.currentGrant});
  }
  const sdkApproval = createSdkApproval({api, client, permissionPattern, readSelection:sdkSelection,
    onBusy(value) { sdkBusy = value; sdkUpdateButtons(); },
    onState({state, message, snapshot, receipt, error, lastConfirmedReceipt}) {
      sdkDisplay(state, message, {approvalSnapshot:snapshot, receipt, error, lastConfirmedReceipt,
        historyNotice:'历史回执不证明当前授权仍有效，也不代表当前输入已批准'});
    }});
  function sdkInputsChanged(message) { sdkApproval.invalidate(message); sdkUpdateButtons(); }
  const readSdkDraft = () => ({capabilities:selectedCapabilities(),
    targetText:fields['sdk-target-origins'].value, autoLabPreset});
  function saveSdkDraft() { if (sdkDraftKey) sdkDrafts.set(sdkDraftKey, readSdkDraft()); }
  function sdkDocumentChanged() {
    saveSdkDraft();
    const doc = sdkDocuments.get(fields['sdk-document'].value);
    sdkDraftKey = doc ? `${doc.tabId}:${doc.frameId}:${doc.documentId}` : null;
    if (!doc) { sdkPageSummary(); sdkInputsChanged(); return; }
    const preset = doc?.frameId === 0 ? sdkHttpLabPreset(doc.url) : null;
    const draft = sdkDrafts.get(sdkDraftKey) || unboundSdkDraft || {
      capabilities:[...defaultCapabilities], targetText:preset?.targetText || '', autoLabPreset:preset};
    unboundSdkDraft = null;
    const selected = new Set(draft.capabilities);
    patch('sdk-capabilities', {rows:fields['sdk-capabilities'].rows.map(row =>
      ({...row, checked:!row.disabled && selected.has(row.value)}))});
    patch('sdk-target-origins', {value:draft.targetText});
    autoLabPreset = draft.autoLabPreset;
    saveSdkDraft();
    sdkPageSummary();
    sdkInputsChanged();
  }
  function clearSdkDocument() {
    saveSdkDraft(); sdkDraftKey = null;
    sdkSelectionVersion++; sdkDocuments = new Map();
    patch('sdk-document', {options:[{label:'请选择当前精确文档', value:''}], value:'', disabled:true});
    sdkPageSummary();
    sdkInputsChanged('文档列表已变化，请重新选择精确文档并批准');
  }
  async function refreshSdkTabs() {
    const refreshVersion = ++sdkRefreshVersion;
    patch('sdk-refresh', {disabled:true});
    try {
    const previousTab = fields['sdk-tab'].value;
    const previousDocument = sdkDocuments.get(fields['sdk-document'].value);
    clearSdkDocument();
    patch('sdk-tab', {options:[{label:'请选择具体网页', value:''}], value:''});
    const version = sdkSelectionVersion;
    const current = currentPageTarget?.snapshot;
    sdkCurrentIdentity = currentIdentity(current);
    const windowId = current?.windowId ?? currentPageTarget?.windowId;
    const tabs = currentPageTarget && (!Number.isSafeInteger(windowId) || windowId < 0) ? [] :
      await api.tabs.query(currentPageTarget ? {windowId} : {});
    if (disposed || version !== sdkSelectionVersion) return;
    const eligible = tabs.filter(tab => !tab.incognito && Number.isInteger(tab.id) && /^https?:\/\//.test(tab.url || '') &&
      (!currentPageTarget || tab.windowId === windowId));
    sdkTabs = new Map(eligible.map(tab => [String(tab.id), tab]));
    patch('sdk-tab', {options:[{label:'请选择具体网页', value:''}, ...eligible.map(tab =>
      ({label:`${tab.title || new URL(tab.url).hostname} — ${tab.url}`, value:String(tab.id)}))]});
    const demos = eligible.filter(tab => sdkHttpLabPreset(tab.url));
    const selected = currentPageTarget && sdkFollowCurrent
      ? current?.status === 'available' && eligible.find(tab => tab.id === current.tabId)
      : eligible.find(tab => String(tab.id) === previousTab) || (!currentPageTarget && (demos.find(tab => tab.active) || demos[0]));
    if (selected) { patch('sdk-tab', {value:String(selected.id)}); await refreshSdkDocuments(previousDocument); }
    else { sdkPageSummary(); sdkDisplay('idle', current?.message || '请打开 HTTP(S) 网页，或展开选择其他网页'); }
    } finally {
      if (refreshVersion === sdkRefreshVersion) patch('sdk-refresh', {disabled:false});
    }
  }
  async function refreshSdkDocuments(preferredDocument) {
    const previousDocument = preferredDocument || sdkDocuments.get(fields['sdk-document'].value);
    clearSdkDocument();
    if (!fields['sdk-tab'].value) return;
    const tabId = Number(fields['sdk-tab'].value), version = sdkSelectionVersion;
    const [tab, frames] = await Promise.all([api.tabs.get(tabId), api.webNavigation.getAllFrames({tabId})]);
    if (disposed || version !== sdkSelectionVersion || fields['sdk-tab'].value !== String(tabId)) return;
    if (tab.incognito) throw {code:'E_PERMISSION', message:'不支持隐身网页'};
    if (currentPageTarget && tab.windowId !== (currentPageTarget.snapshot?.windowId ?? currentPageTarget.windowId))
      throw {code:'E_DOCUMENT_STALE', message:'所选网页已移出当前窗口，请重新选择'};
    for (const frame of frames || []) {
      if (!frame.documentId || frame.errorOccurred || !/^https?:\/\//.test(frame.url || '') ||
          (frame.documentLifecycle && frame.documentLifecycle !== 'active')) continue;
      sdkDocuments.set(frame.documentId, {tabId, frameId:frame.frameId, documentId:frame.documentId, url:frame.url});
    }
    const root = [...sdkDocuments.values()].find(doc => doc.frameId === 0);
    const current = currentPageTarget?.snapshot;
    if (currentPageTarget && sdkFollowCurrent && (current?.status !== 'available' || current.tabId !== tabId ||
        root?.documentId !== current.documentId || root?.url !== current.url)) {
      clearSdkDocument(); sdkDisplay('stale', '当前网页正在变化，请等待文档确认后再批准'); return;
    }
    const selected = previousDocument?.tabId === tabId && sdkDocuments.has(previousDocument.documentId)
      ? previousDocument : root;
    patch('sdk-document', {options:[{label:'请选择当前精确文档', value:''}, ...[...sdkDocuments.values()].map(doc =>
      ({label:`${doc.frameId === 0 ? '主文档' : '子框架 ' + doc.frameId} · ${doc.url}`, value:doc.documentId}))],
      value:selected?.documentId || '', disabled:sdkDocuments.size === 0});
    sdkDocumentChanged();
    sdkDisplay('idle', autoLabPreset
      ? '开发服务与本地 HTTP 实验页目标已预填；请核对后批准（尚未授权或发送 HTTP）'
      : selected ? '已选择当前文档；请核对所选服务与访问范围后批准' : '没有可自动选择的当前 HTTP(S) 主文档');
  }
  bind('sdk-refresh', () => refreshSdkTabs().catch(sdkError));
  bind('sdk-tab', () => { sdkFollowCurrent = false; return refreshSdkDocuments().catch(sdkError); });
  bind('sdk-document', () => { sdkFollowCurrent = false; sdkDocumentChanged(); });
  bind('sdk-use-current', () => { sdkFollowCurrent = true; return refreshSdkTabs().catch(sdkError); });
  for (const id of ['sdk-capabilities', 'sdk-target-origins']) bind(id, () => {
    autoLabPreset = null;
    if (sdkDraftKey) saveSdkDraft(); else unboundSdkDraft = readSdkDraft();
    sdkInputsChanged();
  });
  for (const [id, operation] of [['sdk-install', event => sdkApproval.approve(event)],
    ['sdk-inspect', () => sdkApproval.inspectGrant()], ['sdk-revoke', event => sdkApproval.revoke(event)]]) {
    bind(id, event => {
      if (!event?.isTrusted || sdkBusy || fields[id].disabled) return;
      // No await before approve: the real native click reaches permissions.request.
      return operation(event).catch(error => warn('SDK operation was not confirmed', error));
    });
  }
  const sdkPermissionsRemoved = () => sdkInputsChanged('浏览器权限撤销已被观察；当前显示不再证明授权有效，请重新批准');
  const sdkNavigation = details => {
    if (String(details.tabId) !== fields['sdk-tab'].value) return;
    clearSdkDocument(); sdkDisplay('stale', '网页已导航，请重新选择当前文档并授权');
    for (const key of sdkDrafts.keys()) {
      if (key.startsWith(`${details.tabId}:`) && (details.frameId === 0 || key.startsWith(`${details.tabId}:${details.frameId}:`))) sdkDrafts.delete(key);
    }
  };
  const sdkTabRemoved = tabId => {
    if (userScriptsSettingsTab?.id === tabId) {
      userScriptsSettingsTab = undefined;
      checkSettingsReturn();
    }
    if (String(tabId) !== fields['sdk-tab'].value) return;
    patch('sdk-tab', {value:''}); clearSdkDocument(); sdkDisplay('stale', '选定网页已关闭');
    for (const key of sdkDrafts.keys()) if (key.startsWith(`${tabId}:`)) sdkDrafts.delete(key);
  };
  api.permissions.onRemoved.addListener(sdkPermissionsRemoved);
  api.webNavigation.onCommitted.addListener(sdkNavigation);
  api.tabs.onRemoved.addListener(sdkTabRemoved);
  const unsubscribeCurrent = currentPageTarget?.subscribe(state => {
    if (disposed || !sdkCurrentReady || !sdkFollowCurrent) return;
    const identity = currentIdentity(state);
    if (identity === sdkCurrentIdentity) {
      const tab = sdkTabs.get(String(state.tabId));
      if (tab && state.status === 'available') {
        sdkTabs.set(String(state.tabId), {...tab, title:state.title, url:state.url});
        const doc = sdkDocuments.get(state.documentId);
        if (doc) sdkDocuments.set(state.documentId, {...doc, url:state.url});
        sdkPageSummary();
      }
      return;
    }
    sdkCurrentIdentity = identity;
    if (state.status === 'available') void refreshSdkTabs().catch(sdkError);
    else {
      clearSdkDocument(); patch('sdk-tab', {value:''});
      sdkDisplay('stale', state.message || '正在识别当前网页，请等待文档确认');
    }
  });
  client.ready.catch(sdkError);
  const ready = Promise.all([
    siteAccess.refresh().catch(error => warn('Chrome site access check failed', error)),
    (async () => {
      await currentPageTarget?.ready;
      if (disposed) return;
      sdkCurrentReady = true;
      return refreshSdkTabs();
    })().catch(sdkError)
  ]);

  return Object.freeze({ready,
    resourceSnapshot:() => ({subscriptions:disposed ? 0 : 5 + Number(Boolean(unsubscribeCurrent)) + Number(Boolean(api.tabs.onActivated)), actions:actions.size}),
    dispose() {
      if (disposed) return;
      disposed = true; sdkSelectionVersion++; sdkRefreshVersion++; healthVersion++;
      unsubscribeCurrent?.();
      api.permissions.onRemoved.removeListener(sdkPermissionsRemoved);
      api.webNavigation.onCommitted.removeListener(sdkNavigation);
      api.tabs.onRemoved.removeListener(sdkTabRemoved);
      api.tabs.onActivated?.removeListener(userScriptsTabActivated);
      sdkApproval.dispose(); siteAccess.dispose(); sdkDrafts.clear(); unboundSdkDraft = null;
      for (const [id, handler] of actions) if (view.actions[id] === handler) delete view.actions[id];
      actions.clear();
    }
  });
}
