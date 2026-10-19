// Reusable installed-tool lease check for fixed, trusted managed Chrome workers.
// This delegates to the ONE existing Sidebar Tool installation store/epoch.
// The installed package supplies data, never Host code or its own digest function.
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage}
  from '../../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,sidebarToolEnabled}
  from '../../ui/sidebar-tools/lifecycle.js';

const changed=()=>Object.assign(new Error('工具已经更新、撤权、停用或卸载'),{code:'E_TOOL_CHANGED'});

export async function readManagedSiteToolAuthority(api,{toolId,capability,extraStoreKeys=[]}){
  if(typeof toolId!=='string'||!toolId||typeof capability!=='string'||!capability||
     !Array.isArray(extraStoreKeys)||extraStoreKeys.some(key=>typeof key!=='string'||!key))
    throw Object.assign(new Error('无效的受管应用身份'),{code:'E_TOOL_IDENTITY'});
  const saved=await api.storage.local.get([...new Set([SIDEBAR_TOOL_STORE,
    SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,...extraStoreKeys])]);
  const rows=saved[SIDEBAR_TOOL_STORE];
  const candidates=Array.isArray(rows)?rows.filter(row=>row?.id===toolId):[];
  let tool=null;
  if(candidates.length===1){
    try{tool=validateSidebarToolPackage(candidates[0]);}catch{/* Deny corrupt installed data. */}
  }
  if(!tool?.capabilities.includes(capability))tool=null;
  return {tool,saved,enabled:sidebarToolEnabled(saved[SIDEBAR_TOOL_ENABLE_STORE],toolId),
    epoch:saved[TOOL_REVOCATION_EPOCHS_STORE]?.[toolId]??null};
}

export async function assertManagedSiteToolLease(api,{toolId,capability,packageHash,installEpoch,
  hashPackage,extraStoreKeys=[]}){
  if(typeof packageHash!=='string'||!/^[a-f0-9]{64}$/.test(packageHash)||
     typeof hashPackage!=='function')throw changed();
  const auth=await readManagedSiteToolAuthority(api,{toolId,capability,extraStoreKeys});
  if(!auth.tool||!auth.enabled||auth.epoch!==(installEpoch??null)||
     await hashPackage(auth.tool)!==packageHash)throw changed();
  return auth;
}
