// Chrome permission declarations are explicit; there is no "all API permissions" wildcard.
// Mirror this catalog in manifest.json. verifyManifest enforces their exact parity.
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,sidebarToolPackageHash} from '../../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,requireToolEnableRecords,sidebarToolEnabled} from '../../ui/sidebar-tools/lifecycle.js';

export const REQUIRED_BROWSER_API_PERMISSIONS = Object.freeze([
  "storage",
  "scripting",
  "sidePanel",
  "activeTab",
  "downloads",
  "tabs",
  "webNavigation",
  "userScripts",
  "cookies",
  "notifications",
  "unlimitedStorage",
  "alarms",
  // Chrome forbids "proxy" as an optional permission. The fixed, audited AI
  // Access service is the only product allowed to manage it after a real click.
  "proxy"
]);
export const OPTIONAL_PLUGIN_API_PERMISSIONS = Object.freeze([
  "bookmarks",
  "history",
  "contextMenus",
  "clipboardRead",
  "clipboardWrite",
  "tabGroups",
  "webRequest",
  "declarativeNetRequestWithHostAccess",
  "nativeMessaging",
  "idle"
]);
export const REQUIRED_HOST_PATTERNS = Object.freeze(['<all_urls>']);

const optionalSet = new Set(OPTIONAL_PLUGIN_API_PERMISSIONS);
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function chromeRequest(value) {
  const request = {};
  for (const name of ['origins', 'permissions']) {
    if (value?.[name] === undefined) continue;
    if (!Array.isArray(value[name]) || value[name].some(item => typeof item !== 'string' || !item))
      throw fail('E_SCHEMA', 'Chrome 权限范围无效');
    const entries = [...new Set(value[name])].sort();
    if (entries.length) request[name] = entries;
  }
  if (!Object.keys(request).length) throw fail('E_SCHEMA', 'Chrome 权限范围不能为空');
  return request;
}

// Runtime is read-only. A missing grant must never turn Run/Preview/Verify into
// a permission prompt, even if Chrome would consider the click a user gesture.
export async function requireChromePermissions({api, request}) {
  if (await api.permissions.contains(chromeRequest(request)) !== true)
    throw fail('E_PERMISSION', '访问受限：请先在网站权限或脚本管理中点击「恢复访问」，再手动运行');
  return true;
}

// Ephemeral UI observation, not an authorization database. Prepare on selection
// or refresh; only a separate trusted Install/Restore click can request missing
// entries synchronously. Chrome and the program authority are checked again at
// admission. An observation invalidated by an event cannot issue a new prompt.
export function createChromePermissionConsent({api, onChange = () => {}}) {
  const observations = new Map();
  let generation = 0, disposed = false;
  const changed = () => { generation++; observations.clear(); if (!disposed) onChange(); };
  api.permissions.onAdded?.addListener(changed);
  api.permissions.onRemoved?.addListener(changed);
  async function prepare(value) {
    const request = chromeRequest(value), key = JSON.stringify(request), epoch = generation;
    const missing = {};
    // Check entries separately only in the installation UI, to request exactly
    // the missing subset instead of re-requesting an already approved scope.
    for (const name of ['origins', 'permissions']) {
      const entries = request[name] || [];
      const allowed = await Promise.all(entries.map(entry => api.permissions.contains({[name]: [entry]})));
      const denied = entries.filter((entry, i) => allowed[i] !== true);
      if (denied.length) missing[name] = denied;
    }
    if (disposed || epoch !== generation) return null;
    const state = Object.freeze({request, missing, granted: !Object.keys(missing).length});
    observations.set(key, state);
    return state;
  }
  function confirm(event, value) {
    if (!event?.isTrusted) return Promise.reject(fail('E_GESTURE', '请主动点击安装或恢复访问'));
    if (disposed) return Promise.reject(fail('E_HOST_CLOSED', '权限面板已关闭'));
    let request, state, pending;
    try {
      request = chromeRequest(value); state = observations.get(JSON.stringify(request));
      if (!state) throw fail('E_PERMISSION_CHECK_REQUIRED', '权限状态正在更新；请稍后再次点击安装或恢复访问');
      if (state.granted) return requireChromePermissions({api, request});
      pending = api.permissions.request(structuredClone(state.missing));
    } catch (error) { return Promise.reject(error); }
    return (async () => {
      if (await pending !== true) throw fail('E_PERMISSION', '未授予新增访问范围；原安装保持不变');
      if (disposed) throw fail('E_HOST_CLOSED', '权限面板已关闭');
      return requireChromePermissions({api, request});
    })();
  }
  return Object.freeze({prepare, confirm, dispose() {
    disposed = true; generation++; observations.clear();
    api.permissions.onAdded?.removeListener(changed);
    api.permissions.onRemoved?.removeListener(changed);
  }});
}

// Only declared optional browser APIs are requestable. This does not create an
// OpenDesk task grant or expose the chrome object to an untrusted page script.
export function optionalPluginPermissionRequest(permissions) {
  if (!Array.isArray(permissions) || !permissions.length ||
      permissions.length > OPTIONAL_PLUGIN_API_PERMISSIONS.length ||
      permissions.some(name => typeof name !== 'string' || !optionalSet.has(name)) ||
      new Set(permissions).size !== permissions.length)
    throw fail('E_SCHEMA', '插件请求了未声明、重复或无效的 Chrome API 权限');
  return {permissions: [...permissions]};
}

export async function hasOptionalPluginPermissions({api, permissions}) {
  const request = optionalPluginPermissionRequest(permissions);
  return (await api.permissions.contains(request)) === true;
}

// Call directly from a trusted extension UI click, BEFORE the first await.
// Never call this from a service worker or silently during task execution.
export function requestOptionalPluginPermissions({api, event, permissions}) {
  if (!event?.isTrusted) return Promise.reject(fail('E_GESTURE', '额外浏览器权限必须由用户点击申请'));
  let request, pending;
  try {
    request = optionalPluginPermissionRequest(permissions);
    pending = api.permissions.request(request);
  } catch (cause) {
    return Promise.reject(cause);
  }
  return (async () => {
    if (await pending !== true)
      throw fail('E_PERMISSION', '用户未授予额外浏览器权限');
    if (await api.permissions.contains(request) !== true)
      throw fail('E_PERMISSION', '浏览器权限状态已变化，未能确认授权');
    return Object.freeze({permissions: Object.freeze([...request.permissions])});
  })();
}

export async function requireOptionalPluginPermissions({api, permissions}) {
  if (!await hasOptionalPluginPermissions({api, permissions}))
    throw fail('E_PERMISSION', '插件所需的 Chrome API 权限未获授权或已撤销');
  return true;
}

const TRUSTED_TOOL_ID=/^[a-z][a-z0-9-]{1,39}$/;
const TRUSTED_PERMISSION_PREPARED_VERSION=1;
const TRUSTED_CAPABILITY_TO_PERMISSION=Object.freeze({
  'browser.bookmarks':{toolCapability:'browser.bookmarks',permission:'bookmarks'},
  'browser.bookmarks.createOwned':{toolCapability:'browser.bookmarks',permission:'bookmarks'},
  'browser.bookmarks.full':{toolCapability:'browser.bookmarks.full',permission:'bookmarks'},
  'browser.contextMenu':{toolCapability:'browser.contextMenu',permission:'contextMenus'},
  'browser.contextMenu.register':{toolCapability:'browser.contextMenu',permission:'contextMenus'},
  'browser.network.observe':{toolCapability:'browser.network.observe',permission:'webRequest'},
  'browser.clipboard.read':{toolCapability:'user.export',permission:'clipboardRead'},
  'browser.clipboard.write':{toolCapability:'user.export',permission:'clipboardWrite'},
  'browser.tabs.groups':{toolCapability:'browser.tabs',permission:'tabGroups'},
  'browser.nativeMessaging':{toolCapability:'tasks.open',permission:'nativeMessaging'},
  'browser.idle':{toolCapability:'focus.control',permission:'idle'}
});

function trustedHttpOrigin(value){
  if(value===undefined||value===null)return null;
  if(typeof value!=='string'||value.length>2048||value.trim()!==value)
    throw fail('E_SCHEMA','HTTP(S) Origin 无效');
  let url;
  try{url=new URL(value)}catch{throw fail('E_SCHEMA','HTTP(S) Origin 无效')}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.origin!==value)
    throw fail('E_SCHEMA','只能请求精确 HTTP(S) Origin');
  return {origin:url.origin,pattern:`${url.protocol}//${url.hostname}/*`};
}

function trustedSidePanelSender(api,sender,hostInstanceId){
  if(sender?.id!==api.runtime?.id||sender?.tab?.incognito||
     (sender?.frameId!==undefined&&sender.frameId!==0)||
     typeof sender?.documentId!=='string'||!sender.documentId)
    throw fail('E_OWNER','只有可信 Side Panel 文档可请求工具权限');
  let expected,actual;
  try{
    expected=new URL(api.runtime.getURL('ui/tool.html'));
    actual=new URL(sender.url);
  }catch{throw fail('E_OWNER','可信 Side Panel 地址无效')}
  if(actual.protocol!==expected.protocol||actual.host!==expected.host||actual.pathname!==expected.pathname||
     (hostInstanceId!==undefined&&actual.searchParams.get('hostInstanceId')!==hostInstanceId))
    throw fail('E_OWNER','权限请求未绑定到当前可信 Host');
  return sender;
}

function permissionForCapability(capability){
  if(typeof capability!=='string'||capability.length<1||capability.length>128)
    throw fail('E_SCHEMA','工具能力无效');
  const mapped=TRUSTED_CAPABILITY_TO_PERMISSION[capability];
  if(!mapped||!optionalSet.has(mapped.permission))
    throw fail('E_SCHEMA','只能通过已安装工具能力请求 manifest 声明的 optional 权限');
  return mapped;
}

export function trustedToolPermissionRequest({toolId,capability,origin}={}){
  if(typeof toolId!=='string'||!TRUSTED_TOOL_ID.test(toolId))
    throw fail('E_SCHEMA','工具 ID 无效');
  const {permission}=permissionForCapability(capability);
  const request={permissions:[permission]};
  const site=trustedHttpOrigin(origin);
  if(site)request.origins=[site.pattern];
  return request;
}

function requirePreparedPermission(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     value.version!==TRUSTED_PERMISSION_PREPARED_VERSION||
     typeof value.toolId!=='string'||!TRUSTED_TOOL_ID.test(value.toolId)||
     typeof value.toolVersion!=='string'||!value.toolVersion||
     typeof value.packageHash!=='string'||!/^[a-f0-9]{64}$/.test(value.packageHash)||
     !(value.installEpoch===null||typeof value.installEpoch==='string')||
     typeof value.capability!=='string'||typeof value.toolCapability!=='string'||
     !value.request||typeof value.request!=='object'||Array.isArray(value.request)||
     typeof value.scope!=='string'||!value.scope)
    throw fail('E_SCHEMA','权限确认快照无效');
  const request=trustedToolPermissionRequest({
    toolId:value.toolId,capability:value.capability,
    ...(value.origin===null?{}:{origin:value.origin})
  });
  if(JSON.stringify(request)!==JSON.stringify(value.request))
    throw fail('E_SCHEMA','权限确认快照与请求不一致');
  const mapped=permissionForCapability(value.capability);
  if(mapped.toolCapability!==value.toolCapability)
    throw fail('E_SCHEMA','权限确认快照能力不一致');
  return value;
}

async function installedToolSnapshot(api,input){
  if(typeof input?.toolId!=='string'||!TRUSTED_TOOL_ID.test(input.toolId))
    throw fail('E_SCHEMA','工具 ID 无效');
  const {toolCapability,permission}=permissionForCapability(input.capability);
  const request=trustedToolPermissionRequest(input);
  const row=await api.storage.local.get([SIDEBAR_TOOL_STORE,TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_ENABLE_STORE]);
  const tools=Array.isArray(row[SIDEBAR_TOOL_STORE])?row[SIDEBAR_TOOL_STORE]:[];
  const matches=tools.map(value=>validateSidebarToolPackage(value)).filter(tool=>tool.id===input.toolId);
  if(matches.length!==1)throw fail('E_TOOL_CHANGED','工具未安装或安装记录不唯一');
  const tool=matches[0],epochs=row[TOOL_REVOCATION_EPOCHS_STORE]||{};
  if(!sidebarToolEnabled(requireToolEnableRecords(row[SIDEBAR_TOOL_ENABLE_STORE]),tool.id))
    throw fail('E_TOOL_DISABLED','工具已停用');
  if(!tool.capabilities.includes(toolCapability))
    throw fail('E_TOOL_CAPABILITY_REQUIRED','工具未声明请求该权限所需的能力');
  const packageHash=await sidebarToolPackageHash(tool);
  const installEpoch=epochs[tool.id]??null;
  if(input.toolVersion!==undefined&&input.toolVersion!==tool.version)
    throw fail('E_TOOL_CHANGED','工具版本已变化');
  if(input.packageHash!==undefined&&input.packageHash!==packageHash)
    throw fail('E_TOOL_CHANGED','工具包 Hash 已变化');
  if(input.installEpoch!==undefined&&input.installEpoch!==installEpoch)
    throw fail('E_TOOL_CHANGED','工具安装世代已变化');
  return Object.freeze({
    version:TRUSTED_PERMISSION_PREPARED_VERSION,
    toolId:tool.id,toolVersion:tool.version,packageHash,installEpoch,
    capability:input.capability,toolCapability,permission,origin:input.origin??null,
    request,scope:input.origin??`permission:${permission}`
  });
}

function samePrepared(a,b){
  return a.toolId===b.toolId&&a.toolVersion===b.toolVersion&&
    a.packageHash===b.packageHash&&a.installEpoch===b.installEpoch&&
    a.capability===b.capability&&a.toolCapability===b.toolCapability&&
    JSON.stringify(a.request)===JSON.stringify(b.request)&&a.scope===b.scope;
}

export function createToolPermissionConsent({api}={}){
  if(!api?.storage?.local?.get||!api?.permissions?.request||!api?.permissions?.contains||
     typeof api.runtime?.getContexts!=='function')
    throw fail('E_SERVICE_UNSUPPORTED','Chrome permission service unavailable');
  async function prepare(input){
    const snapshot=await installedToolSnapshot(api,input);
    const granted=await api.permissions.contains(snapshot.request);
    return Object.freeze({...snapshot,granted:granted===true});
  }
  function requestForTool(event,prepared,{sender,hostInstanceId}={}){
    if(!event?.isTrusted)return Promise.reject(fail('E_USER_GESTURE_REQUIRED','请通过可信 Side Panel 点击请求权限'));
    let snapshot,trusted,pending;
    try{
      trusted=trustedSidePanelSender(api,sender,hostInstanceId);
      snapshot=requirePreparedPermission(prepared);
      pending=api.permissions.request(structuredClone(snapshot.request));
    }catch(error){return Promise.reject(error)}
    return (async()=>{
      if(await pending!==true)throw fail('E_PERMISSION','未授予工具请求的 Chrome 权限');
      const latest=await installedToolSnapshot(api,snapshot);
      if(!samePrepared(snapshot,latest))throw fail('E_TOOL_CHANGED','权限确认期间工具身份已变化');
      trustedSidePanelSender(api,trusted,hostInstanceId);
      if(typeof api.runtime?.getContexts==='function'){
        const contexts=await api.runtime.getContexts({
          contextTypes:['SIDE_PANEL'],documentUrls:[trusted.url],documentIds:[trusted.documentId]
        });
        if(!Array.isArray(contexts)||contexts.filter(context=>
          context.contextType==='SIDE_PANEL'&&context.documentUrl===trusted.url&&
          context.documentId===trusted.documentId&&context.frameId===0&&!context.incognito).length!==1)
          throw fail('E_DOCUMENT_CHANGED','权限授予期间可信 Side Panel 文档已变化');
      }
      if(await api.permissions.contains(snapshot.request)!==true)
        throw fail('E_OUTCOME_UNKNOWN','Chrome 未确认请求的权限状态');
      return {granted:true,scope:snapshot.scope};
    })();
  }
  return Object.freeze({prepare,requestForTool});
}

export function requestForTool({api,event,sender,prepared,hostInstanceId}){
  if(!event?.isTrusted)return Promise.reject(fail('E_USER_GESTURE_REQUIRED','请通过可信 Side Panel 点击请求权限'));
  return createToolPermissionConsent({api}).requestForTool(event,prepared,{sender,hostInstanceId});
}
