import {PROTOCOL, permissionPattern} from '../environment.js';
import {ADMITTED_METHODS} from '../framework/sdk/registry.js';
import {requireChromePermissions} from '../platform/chrome/permission-gate.js';
import {createSiteAccess} from './site-access.js';
import {createSdkApproval, sdkApprovalPreview, sdkHttpLabPreset} from './sdk-approval.js';

const capabilityLabels = {
  'network.localRelay': '本机 Node HTTP 转发（独立配对；仅批准的本机 GET）',
  network: 'HTTP 网络请求（仅本次精确批准的来源与目标）', 'storage.persistent': '持久存储',
  'storage.session': '浏览器会话存储', notifications: '通知', 'device.id': '稳定应用 ID',
  'network.info': '外部网络信息（当前未启用）'
};

// React owns the controls. These fields are observations and inputs, never an
// authorization store; the original Chrome gate and SDK Authority still decide.
export function createDeveloperHostControls({api, client, view}) {
  const fields = view.fields, actions = new Map();
  let disposed = false, target, healthVersion = 0;
  let sdkDocuments = new Map(), sdkSelectionVersion = 0, sdkBusy = false, autoLabPreset = null;
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
    .map(value => ({value, label:capabilityLabels[value] || value, checked:false, disabled:value === 'network.info'}))});
  const selectedCapabilities = () => fields['sdk-capabilities'].rows.filter(row => row.checked && !row.disabled).map(row => row.value);
  const sdkSelection = () => ({document:sdkDocuments.get(fields['sdk-document'].value),
    capabilities:selectedCapabilities(), targetText:fields['sdk-target-origins'].value});
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
  function sdkDocumentChanged() {
    const doc = sdkDocuments.get(fields['sdk-document'].value);
    const preset = doc?.frameId === 0 ? sdkHttpLabPreset(doc.url) : null;
    const network = fields['sdk-capabilities'].rows.find(row => row.value === 'network');
    if (!preset && autoLabPreset && fields['sdk-target-origins'].value === autoLabPreset.targetText &&
        selectedCapabilities().length === 1 && selectedCapabilities()[0] === 'network') {
      patch('sdk-target-origins', {value:''});
      patch('sdk-capabilities', {rows:fields['sdk-capabilities'].rows.map(row => row.value === 'network' ? {...row, checked:false} : row)});
    }
    autoLabPreset = null;
    if (preset && !fields['sdk-target-origins'].value.trim() && selectedCapabilities().length === 0 && network && !network.disabled) {
      patch('sdk-capabilities', {rows:fields['sdk-capabilities'].rows.map(row => row.value === 'network' ? {...row, checked:true} : row)});
      patch('sdk-target-origins', {value:preset.targetText}); autoLabPreset = preset;
    }
    sdkInputsChanged();
  }
  function clearSdkDocument() {
    sdkSelectionVersion++; sdkDocuments = new Map();
    patch('sdk-document', {options:[{label:'请选择当前精确文档', value:''}], value:'', disabled:true});
    sdkInputsChanged('文档列表已变化，请重新选择精确文档并批准');
  }
  async function refreshSdkTabs() {
    clearSdkDocument();
    patch('sdk-tab', {options:[{label:'请选择具体网页', value:''}], value:''});
    const version = sdkSelectionVersion;
    const tabs = await api.tabs.query({});
    if (disposed || version !== sdkSelectionVersion) return;
    const eligible = tabs.filter(tab => !tab.incognito && Number.isInteger(tab.id) && /^https?:\/\//.test(tab.url || ''));
    patch('sdk-tab', {options:[{label:'请选择具体网页', value:''}, ...eligible.map(tab =>
      ({label:`[${tab.id}] ${tab.title || tab.url} — ${tab.url}`, value:String(tab.id)}))]});
    const demos = eligible.filter(tab => sdkHttpLabPreset(tab.url));
    const demo = demos.find(tab => tab.active) || demos[0];
    if (demo) { patch('sdk-tab', {value:String(demo.id)}); await refreshSdkDocuments(); }
    else sdkDisplay('idle', '请选择网页、当前文档和服务');
  }
  async function refreshSdkDocuments() {
    clearSdkDocument();
    if (!fields['sdk-tab'].value) return;
    const tabId = Number(fields['sdk-tab'].value), version = sdkSelectionVersion;
    const [tab, frames] = await Promise.all([api.tabs.get(tabId), api.webNavigation.getAllFrames({tabId})]);
    if (disposed || version !== sdkSelectionVersion || fields['sdk-tab'].value !== String(tabId)) return;
    if (tab.incognito) throw {code:'E_PERMISSION', message:'不支持隐身网页'};
    for (const frame of frames || []) {
      if (!frame.documentId || frame.errorOccurred || !/^https?:\/\//.test(frame.url || '') ||
          (frame.documentLifecycle && frame.documentLifecycle !== 'active')) continue;
      sdkDocuments.set(frame.documentId, {tabId, frameId:frame.frameId, documentId:frame.documentId, url:frame.url});
    }
    const root = [...sdkDocuments.values()].find(doc => doc.frameId === 0);
    patch('sdk-document', {options:[{label:'请选择当前精确文档', value:''}, ...[...sdkDocuments.values()].map(doc =>
      ({label:`frame ${doc.frameId} · ${doc.documentId} · ${doc.url}`, value:doc.documentId}))],
      value:root?.documentId || '', disabled:sdkDocuments.size === 0});
    sdkDocumentChanged();
    sdkDisplay('idle', autoLabPreset
      ? '已预填本地 HTTP 实验页的 network 与目标 Origin；请核对后点击明确批准并安装（尚未授权或发送 HTTP）'
      : root ? '已选择当前主文档；请核对并选择要授权的服务' : '没有可自动选择的当前 HTTP(S) 主文档');
  }
  bind('sdk-refresh', () => refreshSdkTabs().catch(sdkError));
  bind('sdk-tab', () => refreshSdkDocuments().catch(sdkError));
  bind('sdk-document', sdkDocumentChanged);
  for (const id of ['sdk-capabilities', 'sdk-target-origins']) bind(id, () => { autoLabPreset = null; sdkInputsChanged(); });
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
  };
  const sdkTabRemoved = tabId => {
    if (String(tabId) !== fields['sdk-tab'].value) return;
    patch('sdk-tab', {value:''}); clearSdkDocument(); sdkDisplay('stale', '选定网页已关闭');
  };
  api.permissions.onRemoved.addListener(sdkPermissionsRemoved);
  api.webNavigation.onCommitted.addListener(sdkNavigation);
  api.tabs.onRemoved.addListener(sdkTabRemoved);
  client.ready.catch(sdkError);
  const ready = Promise.all([
    siteAccess.refresh().catch(error => warn('Chrome site access check failed', error)),
    refreshSdkTabs().catch(sdkError)
  ]);

  return Object.freeze({ready,
    resourceSnapshot:() => ({subscriptions:disposed ? 0 : 5, actions:actions.size}),
    dispose() {
      if (disposed) return;
      disposed = true; sdkSelectionVersion++; healthVersion++;
      api.permissions.onRemoved.removeListener(sdkPermissionsRemoved);
      api.webNavigation.onCommitted.removeListener(sdkNavigation);
      api.tabs.onRemoved.removeListener(sdkTabRemoved);
      sdkApproval.dispose(); siteAccess.dispose();
      for (const [id, handler] of actions) if (view.actions[id] === handler) delete view.actions[id];
      actions.clear();
    }
  });
}
