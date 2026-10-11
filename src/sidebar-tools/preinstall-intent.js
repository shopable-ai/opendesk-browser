// Compact, trusted-only first-install intent. Safe to import in the size-limited
// MV3 service worker: deliberately does NOT import the package installer or UI.
import {writeVerifiedLocalValue} from '../ui/sidebar-tools/storage-state.js';
import {SIDEBAR_TOOL_STORE} from '../ui/sidebar-tools/package.js';

export const DEFAULT_PREINSTALL_STORE='opendesk.sidebar-tools.bootstrap.v1';
export const DEFAULT_PREINSTALL_LOCK='opendesk.sidebar-tools:bootstrap';
const isRecord=row=>row!==null&&typeof row==='object'&&!Array.isArray(row);
const error=message=>Object.assign(new Error(message),{code:'E_PREINSTALL'});
export function validDefaultPreinstallMarker(marker){
  if(!isRecord(marker)||marker.schema!==DEFAULT_PREINSTALL_STORE||
    !['pending','complete','attention','skipped-existing'].includes(marker.state)||
    typeof marker.extensionVersion!=='string'||!Array.isArray(marker.completed)||
    !marker.completed.every(id=>typeof id==='string')||
    !(marker.plan===null||Array.isArray(marker.plan)))
    throw error('默认预装标记损坏，已停止自动恢复');
  return marker;
}
// This function runs only in the trusted runtime.onInstalled(reason=install)
// callback. A previously written (even empty or corrupt) registry is user state
// and is never treated as a fresh install to overwrite.
export async function registerDefaultPreinstall({api,lockManager,reason}){
  if(reason!=='install')return {state:'not-new-install'};
  if(!lockManager?.request)throw error('缺少可信浏览器存储锁');
  return lockManager.request(DEFAULT_PREINSTALL_LOCK,async()=>{
    const before=(await api.storage.local.get(DEFAULT_PREINSTALL_STORE))[DEFAULT_PREINSTALL_STORE];
    if(before!==undefined)return {state:validDefaultPreinstallMarker(before).state};
    const stores=await api.storage.local.get([
      SIDEBAR_TOOL_STORE,'opendesk.sidebar-tools.revocation-epochs.v1',
      'opendesk.sidebar-tools.uninstall-cleanup.v1','opendesk.market.provenance.v1',
      'opendesk.market.operations.v1'
    ]);
    const historical=stores[SIDEBAR_TOOL_STORE]!==undefined||
      Object.entries(stores).some(([key,value])=>key!==SIDEBAR_TOOL_STORE&&isRecord(value)&&Object.keys(value).length>0);
    const marker={schema:DEFAULT_PREINSTALL_STORE,state:historical?'skipped-existing':'pending',
      extensionVersion:api.runtime.getManifest().version,plan:null,completed:[]};
    await writeVerifiedLocalValue(api,DEFAULT_PREINSTALL_STORE,marker,undefined,'官方预装首次意图');
    return {state:marker.state};
  });
}
