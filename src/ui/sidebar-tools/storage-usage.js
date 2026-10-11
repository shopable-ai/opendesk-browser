// Read only Chrome's byte counters; do not enumerate or log note/code bodies.
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from './package.js';
import {KNOWLEDGE_DATA_KEY} from '../../knowledge/policy.js';

export async function readSidebarStorageUsage(api,installed=[],pendingCleanupIds=[]){
  if(typeof api?.storage?.local?.getBytesInUse!=='function')
    throw new Error('当前扩展环境无法读取本地存储容量');
  // Pending cleanup IDs are bounded host metadata: include leftover data
  // without retrieving note bodies or scanning unrelated storage keys.
  const pending=Array.isArray(pendingCleanupIds)?pendingCleanupIds.filter(
    id=>typeof id==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(id)):[];
  const dataKeys=[...new Set([
    ...(installed||[]).map(tool=>sidebarToolStorageKey(tool.id)),
    ...pending.map(sidebarToolStorageKey),KNOWLEDGE_DATA_KEY
  ])];
  const [totalBytes,packageBytes,toolDataBytes,unlimited]=await Promise.all([
    api.storage.local.getBytesInUse(null),
    api.storage.local.getBytesInUse(SIDEBAR_TOOL_STORE),
    api.storage.local.getBytesInUse(dataKeys),
    api.permissions?.contains ? Promise.resolve().then(()=>api.permissions.contains({permissions:['unlimitedStorage']})).catch(()=>null) : Promise.resolve(null)
  ]);
  for(const value of [totalBytes,packageBytes,toolDataBytes])
    if(!Number.isSafeInteger(value)||value<0)throw new Error('浏览器返回了无效的存储计数');
  return {totalBytes,packageBytes,toolDataBytes,unlimited:unlimited===true?true:unlimited===false?false:null};
}
