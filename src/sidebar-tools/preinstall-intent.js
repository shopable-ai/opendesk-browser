// Self-contained and size-limited MV3 install intent; no installer/UI imports.
// Only chrome.runtime.onInstalled(reason='install') may invoke registration.
export const DEFAULT_PREINSTALL_STORE='opendesk.sidebar-tools.bootstrap.v1';
export const DEFAULT_PREINSTALL_LOCK='opendesk.sidebar-tools:bootstrap';
const REGISTRY='opendesk.sidebar-tools.installed.v1';
const historyKeys=[REGISTRY,'opendesk.sidebar-tools.revocation-epochs.v1',
  'opendesk.sidebar-tools.uninstall-cleanup.v1','opendesk.market.provenance.v1',
  'opendesk.market.operations.v1'];
const error=(message,code='E_PREINSTALL')=>Object.assign(new Error(message),{code});
export function validDefaultPreinstallMarker(row){
  if(!row||typeof row!=='object'||Array.isArray(row)||row.schema!==DEFAULT_PREINSTALL_STORE||
    !['pending','complete','attention','skipped-existing'].includes(row.state)||
    typeof row.extensionVersion!=='string'||!Array.isArray(row.completed)||
    !row.completed.every(id=>typeof id==='string')||
    !(row.plan===null||Array.isArray(row.plan)))
    throw error('默认预装标记损坏，已停止自动恢复');
  return row;
}
export async function registerDefaultPreinstall({api,lockManager,reason}){
  if(reason!=='install')return {state:'not-new-install'};
  if(!lockManager?.request)throw error('缺少可信浏览器存储锁');
  return lockManager.request(DEFAULT_PREINSTALL_LOCK,async()=>{
    const saved=await api.storage.local.get([DEFAULT_PREINSTALL_STORE,...historyKeys]);
    if(saved[DEFAULT_PREINSTALL_STORE]!==undefined)
      return {state:validDefaultPreinstallMarker(saved[DEFAULT_PREINSTALL_STORE]).state};
    // Any previous registry, including an empty or malformed value, is user state.
    const historical=historyKeys.some(key=>saved[key]!==undefined&&
      (key===REGISTRY||saved[key]&&typeof saved[key]==='object'&&Object.keys(saved[key]).length>0));
    const marker={schema:DEFAULT_PREINSTALL_STORE,state:historical?'skipped-existing':'pending',
      extensionVersion:api.runtime.getManifest().version,plan:null,completed:[]};
    let failure=null;
    try{await api.storage.local.set({[DEFAULT_PREINSTALL_STORE]:marker});}
    catch(e){failure=e;}
    let actual;
    try{actual=(await api.storage.local.get(DEFAULT_PREINSTALL_STORE))[DEFAULT_PREINSTALL_STORE];}
    catch(e){throw error('无法确认默认初始化状态写入','E_OUTCOME_UNKNOWN');}
    // Confirm semantic state, independent of Chrome's object-key reordering.
    if(actual?.schema===marker.schema&&actual?.state===marker.state&&
      actual?.extensionVersion===marker.extensionVersion&&actual.plan===null&&
      Array.isArray(actual.completed)&&actual.completed.length===0)
      return {state:marker.state};
    throw error(failure?'默认初始化状态写入失败':'默认初始化状态写入结果未知',
      failure?'E_HOST_STORAGE_WRITE':'E_OUTCOME_UNKNOWN');
  });
}
