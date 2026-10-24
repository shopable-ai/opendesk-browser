// One installation transaction path for Side Panel and Marketplace.
// This is the EXISTING v1 tool registry and authority, not a second runner.
import {SIDEBAR_TOOL_STORE, MAX_INSTALLED_TOOLS, validateSidebarToolPackage, sidebarToolStorageKey,serializeSidebarToolPackage,sidebarToolPackageHash,verifySidebarToolBackground} from './package.js';
import {MARKET_PROVENANCE_STORE,OFFICIAL_READING_TOC_RELEASE} from '../../sidebar-tools/official-reading-toc.js';
export {MARKET_PROVENANCE_STORE} from '../../sidebar-tools/official-reading-toc.js';
import {BROWSER_MENU_GRANTS_STORE,BOOKMARK_OWNED_STORE_PREFIX} from '../../framework/sdk/browser-contract.js';
import {READING_TOC_SITE_STORE, READING_TOC_VISIBILITY_STORE, READING_TOC_PAGE_RULES_STORE, READING_TOC_PLACEMENT_PREFIX, READING_TOC_TOOL_ID} from '../../../examples/sidebar-tools/reading-toc/trusted/policy.js';
import {CLIP_SITE_STORE} from '../../../examples/sidebar-tools/web-markdown-clipper/trusted/policy.js';
import {CAPTURE_SITE_STORE, KNOWLEDGE_TOOL_ID, KNOWLEDGE_WORKSPACE_PREFIX} from '../../knowledge/policy.js';
import {writeVerifiedLocalValue,classifyStorageWriteError,unknownStorageOutcome,sameStorageValue,stableStorageString} from './storage-state.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords,requireToolRevocationEpochs,TOOL_REVOCATION_EPOCHS_STORE,TOOL_CLEANUP_STORE,requirePendingToolCleanups} from './lifecycle.js';
import {PROTOCOL as FOUNDATION_PROTOCOL} from '../../platform/protocol.js';
import {TIME_REVIEW_KEY} from '../../../examples/sidebar-tools/time-review/trusted/model.js';
import {PROMPT_ASSET_STORE} from '../../../examples/sidebar-tools/prompt-shortcuts/trusted/asset-contract.js';
import {stopStayFocusForTool,cleanupUninstalledStayFocus} from '../../../examples/sidebar-tools/stay-focus/trusted/lifecycle.js';
import {stopAdblockForTool,cleanupUninstalledAdblock,prepareReviewedAdblockUpdate} from '../../../examples/sidebar-tools/adblock/trusted/lifecycle.js';
import {ADBLOCK_STORE} from '../../../examples/sidebar-tools/adblock/trusted/policy.js';
import {stopAiAccessForTool,cleanupUninstalledAiAccess} from '../../../examples/sidebar-tools/ai-vip-share/trusted/lifecycle.js';
import {stopManagedProxyForTool} from '../../platform/chrome/browser-managed-proxy.js';
import {stopManagedSiteBudgetForTool,MANAGED_SITE_BUDGET_STORE} from '../../platform/chrome/browser-managed-site-budget.js';
import {MANAGED_SITE_REVIEWED_SCOPE_STORE,rebindReviewedManagedSiteScopes} from '../../framework/host/managed-site-reviewed-scopes.js';
import {normalizeManagedSiteV3Policy} from '../../framework/sdk/site-budget-v3-policy.js';
import {MANAGED_SITE_BUDGET_CAPABILITY,MANAGED_SITE_BUDGET_PROTOCOL} from '../../platform/host/managed-site-runtime-contract.js';
import {assertManagedSitePolicySupported} from '../../platform/host/managed-site-runtime-contract.js';
import {prepareLegacyFocusUpgrade,writeLegacyFocusUpgradeSnapshot,
  finishLegacyFocusUpgradeLocked} from './legacy-focus-upgrade.js';

export const MARKET_OPERATIONS_STORE='opendesk.market.operations.v1';
export {TOOL_CLEANUP_STORE,requirePendingToolCleanups} from './lifecycle.js';
// Fixed official site-grant store name. Test equality against the independent
// Prompt Shortcuts policy; do not import packaged tool code into generic installer.
export const PROMPT_SHORTCUTS_SITE_CLEANUP_STORE='opendesk.sidebar-tools.prompt-sites.v1';
export {TOOL_REVOCATION_EPOCHS_STORE} from './lifecycle.js';
const marketIdPattern=/^opendesk\/[a-z][a-z0-9-]{1,39}$/;
const shaPattern=/^[a-f0-9]{64}$/;
const opPattern=/^[a-f0-9-]{36}$/;
const error=(message,code)=>Object.assign(new Error(message),{code});
export function sameSidebarToolPackage(a,b) {
  if(!a||!b)return false;
  // V2 menu security is bound to a canonical package digest; nested object
  // key order never changes the identity of approved capabilities/contributions.
  if(a.format==='opendesk.sidebar-tool.v2'||b.format==='opendesk.sidebar-tool.v2'){
    try{return serializeSidebarToolPackage(a)===serializeSidebarToolPackage(b);}
    catch{return false;}
  }
  try{return serializeSidebarToolPackage(a)===serializeSidebarToolPackage(b);}catch{return false;}
}
export function admittedSidebarToolPackages(rows) {
  if(!Array.isArray(rows))return [];
  const seen=new Set();
  return rows.slice(0,MAX_INSTALLED_TOOLS).flatMap(row=>{
    try{const tool=validateSidebarToolPackage(row);if(seen.has(tool.id))return [];seen.add(tool.id);return [tool];}
    catch{return [];}
  });
}
export function compareToolVersions(a,b) {
  const left=a.split('.'),right=b.split('.');
  for(let i=0;i<3;i++){
    if(left[i].length!==right[i].length)return left[i].length>right[i].length?1:-1;
    if(left[i]!==right[i])return left[i]>right[i]?1:-1;
  }
  return 0;
}
// Every mutation and recovery must reject malformed, duplicate and overflowed
// rows. Silently filtering them would erase the original registry on next set.
export function requireCompleteInstalledSidebarTools(rows){
  if(rows===undefined)return [];
  const admitted=admittedSidebarToolPackages(rows);
  if(!Array.isArray(rows)||admitted.length!==rows.length)
    throw error('本机工具安装记录损坏、重复或超过产品限制；已停止修改以保护原始数据','E_STORAGE_CORRUPT');
  return admitted;
}
export async function getInstalledSidebarTools(api) {
  return requireCompleteInstalledSidebarTools(
    (await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
}
// Fixed product adapters only; never execute package JS or clear a peer rule range.
async function stopInstalledToolOwnedServices(api,toolId){
  await stopStayFocusForTool(api,toolId);
  await stopAdblockForTool(api,toolId);
  await stopAiAccessForTool(api,toolId);
  await stopManagedSiteBudgetForTool(api,toolId);
  await stopManagedProxyForTool(api,toolId);
}

export async function setInstalledSidebarToolEnabled({api,lockManager,tool,enabled}){
  if(typeof enabled!=='boolean')throw error('工具启停状态无效','E_TOOL_SCHEMA');
  if(!lockManager?.request)throw error('浏览器缺少安全存储锁','E_TOOL_LOCK');
  return lockManager.request('opendesk.sidebar-tools:tool:'+tool.id,()=>
    lockManager.request('opendesk.sidebar-tools:catalog',async()=>{
      const current=(await getInstalledSidebarTools(api)).find(row=>row.id===tool.id);
      if(!sameSidebarToolPackage(current,tool))throw error('工具已更新或卸载，请重新打开详情','E_TOOL_CHANGED');
      const raw=(await api.storage.local.get(SIDEBAR_TOOL_ENABLE_STORE))[SIDEBAR_TOOL_ENABLE_STORE];
      const previous=requireToolEnableRecords(raw);
      const currentlyEnabled=previous[tool.id]!==false;
      if(currentlyEnabled===enabled){
        if(!enabled){
          // A previous STOP might have persisted the disabled flag before
          // a native DNR or proxy cleanup failed. Reconcile again on STOP.
          await stopInstalledToolOwnedServices(api,tool.id);
          return {enabled:false,cleanupAttempted:true};
        }
        return {enabled};
      }
      const rawEpochs=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE];
      const epochs=requireToolRevocationEpochs(rawEpochs);
      const rawGrants=(await api.storage.local.get(BROWSER_MENU_GRANTS_STORE))[BROWSER_MENU_GRANTS_STORE];
      if(rawGrants!==undefined&&(!rawGrants||typeof rawGrants!=='object'||Array.isArray(rawGrants)))
        throw error('工具网站授权记录损坏；已停止修改','E_STORAGE_CORRUPT');
      const grant=rawGrants?.[tool.id],nextEpoch=crypto.randomUUID();
      const preserveGrant=grant?.version===current.version&&
        grant.installEpoch===(epochs[tool.id]??null)&&
        grant.packageHash===await sidebarToolPackageHash(current);
      const menu=grant?.contextMenu;
      const preserveMenu=menu?.version===current.version&&
        menu.installEpoch===(epochs[tool.id]??null)&&
        menu.packageHash===await sidebarToolPackageHash(current);
      // Stop first. Resume fences every old frame/request before it becomes available.
      // A crash between these writes leaves the tool stopped, never silently resumed.
      if(!enabled){
        await writeVerifiedLocalValue(api,SIDEBAR_TOOL_ENABLE_STORE,
          {...previous,[tool.id]:false},raw,'工具启停');
        await stopInstalledToolOwnedServices(api,tool.id);
      }
      if(enabled){
        // Resume cannot bless an interrupted STOP with stale native effects.
        // Cleanup happens before the new epoch and enabled=true become visible.
        await stopInstalledToolOwnedServices(api,tool.id);
      }
      await writeVerifiedLocalValue(api,TOOL_REVOCATION_EPOCHS_STORE,
        {...epochs,[tool.id]:nextEpoch},rawEpochs,'工具实例撤销');
      // Only an already valid, unchanged package grant crosses this transition.
      // Old frames and pending requests retain the old epoch and remain revoked.
      if(preserveGrant||preserveMenu)await writeVerifiedLocalValue(api,BROWSER_MENU_GRANTS_STORE,
        {...rawGrants,[tool.id]:{...grant,...(preserveGrant?{installEpoch:nextEpoch}:{}),
          ...(preserveMenu?{contextMenu:{...menu,installEpoch:nextEpoch}}:{})}},rawGrants,'工具网站授权保留');
      if(enabled)await writeVerifiedLocalValue(api,SIDEBAR_TOOL_ENABLE_STORE,
        {...previous,[tool.id]:true},raw,'工具启停');
      return {enabled};
    }));
}
function marketIdentity(value,candidate) {
  if(value==null)return null;
  if(!marketIdPattern.test(value.marketId)||!shaPattern.test(value.sha256)||
      !opPattern.test(value.operationId)||value.marketId.split('/')[1]!==candidate.id)
    throw error('市场安装身份、哈希或事务 ID 无效','E_MARKET_IDENTITY');
  return value;
}
function recoverableOperations(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter(([id,row])=>
    opPattern.test(id)&&row&&typeof row==='object'&&marketIdPattern.test(row.marketId)&&shaPattern.test(row.sha256)));
}
function trimmedOperations(ops) {
  const entries=Object.entries(ops),terminal=entries.filter(([,r])=>['succeeded','failed'].includes(r.state))
    .sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0));
  const retained=new Set(terminal.slice(0,24).map(([id])=>id));
  return Object.fromEntries(entries.filter(([id,r])=>!['succeeded','failed'].includes(r.state)||retained.has(id)));
}
// This journal records an acknowledged uninstall intent, not an authority grant.
// A retry MUST hold the same tool/catalog locks and MUST first re-read the registry.
const toolIdPattern=/^[a-z][a-z0-9-]{1,39}$/;
// An unreadable or malformed cleanup journal must never become "no pending cleanup".
// Filtering invalid entries would let a subsequent install bypass the previous owner's
// unfinished removal and would hide the recovery problem from Extension Center.
export async function getPendingToolCleanups(api){
  return requirePendingToolCleanups((await api.storage.local.get(TOOL_CLEANUP_STORE))[TOOL_CLEANUP_STORE]);
}
export async function recordToolUninstall(api,tool){
  // Independent of package bytes: an old iframe must stay revoked even when
  // precisely the same tool/version is later installed again. Do not prune.
  // A broken cleanup journal must be rejected BEFORE revoking a still-installed
  // working tool. All reads and writes remain under the existing install locks.
  const prior=await getPendingToolCleanups(api);
  const rawEpochs=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE];
  const revisions=requireToolRevocationEpochs(rawEpochs);
  await writeVerifiedLocalValue(api,TOOL_REVOCATION_EPOCHS_STORE,
    {...revisions,[tool.id]:globalThis.crypto.randomUUID()},rawEpochs,'工具旧实例撤销');
  const next={...prior,[tool.id]:{version:tool.version,createdAt:Date.now()}};
  await writeVerifiedLocalValue(api,TOOL_CLEANUP_STORE,next,prior,'卸载恢复记录');
}
async function removeVerifiedStorageKey(storage,key,scope='卸载后的数据清理'){
  let failure=null;
  try{await storage.remove(key);}catch(error){failure=error;}
  let value;
  try{value=(await storage.get(key))[key];}
  catch(error){throw unknownStorageOutcome(error,scope);}
  if(value!==undefined)throw failure?classifyStorageWriteError(failure,scope):
    unknownStorageOutcome(null,scope);
}
async function removeVerifiedKey(api,key){
  return removeVerifiedStorageKey(api.storage.local,key);
}
async function retireUninstalledToolSchedules(api,id){
  if(typeof api.runtime?.sendMessage!=='function')throw error('调度服务不可用','E_SERVICE_UNSUPPORTED');
  let timer;
  try{
    const response=await Promise.race([
      api.runtime.sendMessage({protocol:FOUNDATION_PROTOCOL,type:'cleanupUninstalledToolSchedules',payload:{toolId:id}}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(unknownStorageOutcome(null,'卸载计划清理回执')),10000);})
    ]);
    if(response?.ok!==true)throw error(response?.error?.message||'未取得计划清理回执',response?.error?.code||'E_OUTCOME_UNKNOWN');
    if(response.data?.toolId!==id||response.data.schedulesRetired!==true||response.data.alarmsCleared!==true)
      throw unknownStorageOutcome(null,'卸载计划清理回执');
  }finally{clearTimeout(timer);}
}
// Must be called while BOTH opendesk.sidebar-tools:tool:<id> and :catalog
// locks are held, in that order. Never delete by an old instance's ID alone.
export async function cleanupUninstalledToolLocked(api,id){
  if(!toolIdPattern.test(id))throw error('工具 ID 无效','E_TOOL_SCHEMA');
  const pending=await getPendingToolCleanups(api);
  if(!pending[id])return {state:'not-pending',toolId:id};
  const installed=await getInstalledSidebarTools(api);
  if(installed.some(row=>row.id===id))
    return {state:'still-installed',toolId:id};
  try{
    // Keep the existing durable journal and install locks until the original
    // Scheduler confirms retirement. A same-ID reinstall cannot hide this intent.
    await retireUninstalledToolSchedules(api,id);
    await removeVerifiedKey(api,sidebarToolStorageKey(id));
    if(id==='prompt-shortcuts')await removeVerifiedKey(api,PROMPT_ASSET_STORE);
    // Delete private bookmark ownership IDs but do not silently remove user bookmarks.
    await removeVerifiedKey(api,BOOKMARK_OWNED_STORE_PREFIX+id);
    if(id==='time-review')await removeVerifiedKey(api,TIME_REVIEW_KEY);
    await stopManagedSiteBudgetForTool(api,id,{cleanup:true});
    await cleanupUninstalledStayFocus(api,id,removeVerifiedKey,
      key=>removeVerifiedStorageKey(api.storage.session,key,'卸载专注会话'));
    await cleanupUninstalledAdblock(api,id,removeVerifiedKey);
    await cleanupUninstalledAiAccess(api,id,removeVerifiedKey);
    await stopManagedProxyForTool(api,id,{removeVerifiedKey});
    for(const store of [SIDEBAR_TOOL_ENABLE_STORE,READING_TOC_SITE_STORE,READING_TOC_VISIBILITY_STORE,READING_TOC_PAGE_RULES_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE,PROMPT_SHORTCUTS_SITE_CLEANUP_STORE,MARKET_PROVENANCE_STORE,BROWSER_MENU_GRANTS_STORE,MANAGED_SITE_REVIEWED_SCOPE_STORE]){
      const raw=(await api.storage.local.get(store))[store];
      const original=store===SIDEBAR_TOOL_ENABLE_STORE?requireToolEnableRecords(raw):
        raw===undefined?{}:raw;
      if(!original||typeof original!=='object'||Array.isArray(original))
        throw error('卸载权限或来源记录损坏，已停止清理以保护其他工具数据','E_STORAGE_CORRUPT');
      if(!Object.hasOwn(original,id))continue;
      const updated={...original};delete updated[id];
      await writeVerifiedLocalValue(api,store,updated,original,'卸载权限与来源清理');
    }
    if(id===KNOWLEDGE_TOOL_ID){
      const entries=await api.storage.session.get(null);
      const keys=Object.keys(entries||{}).filter(key=>key.startsWith(KNOWLEDGE_WORKSPACE_PREFIX));
      for(const key of keys)await removeVerifiedStorageKey(api.storage.session,key,'卸载会话数据清理');
    }
    if(id===READING_TOC_TOOL_ID){
      const entries=await api.storage.local.get(null);
      const keys=Object.keys(entries||{}).filter(key=>key.startsWith(READING_TOC_PLACEMENT_PREFIX));
      for(const key of keys)await removeVerifiedKey(api,key);
    }
    const fresh=await getPendingToolCleanups(api);
    if(Object.hasOwn(fresh,id)){
      const updated={...fresh};delete updated[id];
      await writeVerifiedLocalValue(api,TOOL_CLEANUP_STORE,updated,fresh,'卸载恢复记录');
    }
  }catch(cause){
    throw error('工具已从安装列表移除，但数据或权限清理未完成；请到「我的应用」恢复清理。'+
      String(cause?.message||cause).slice(0,120),'E_TOOL_UNINSTALL_CLEANUP');
  }
  return {state:'cleaned',toolId:id};
}
export async function retryUninstalledToolCleanup({api,lockManager,id}){
  if(!lockManager?.request)throw error('浏览器缺少安全存储锁','E_TOOL_LOCK');
  return lockManager.request('opendesk.sidebar-tools:tool:'+id,()=>
    lockManager.request('opendesk.sidebar-tools:catalog',()=>cleanupUninstalledToolLocked(api,id)));
}
async function canonicalSha256(tool){
  const bytes=new TextEncoder().encode(serializeSidebarToolPackage(tool));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    value=>value.toString(16).padStart(2,'0')).join('');
}
// Only trusted, same-source v3->v3 upgrades may rebind site review. The old
// finite Driver policy (not app JS) is hashed in the EXISTING install journal;
// recovery checks the hash before any scope write. Chrome origins and policy
// are independently checked by the Driver at every native operation.
async function siteScopePolicyHash(policy){
  const normalized=normalizeManagedSiteV3Policy(policy);
  const bytes=new TextEncoder().encode(stableStorageString(normalized));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
async function readSiteScopeTransferPlan(api,{id,source,fromEpoch,fromHash,toEpoch,toHash}){
  const saved=await api.storage.local.get([MANAGED_SITE_BUDGET_STORE,MANAGED_SITE_REVIEWED_SCOPE_STORE]);
  const row=saved[MANAGED_SITE_BUDGET_STORE]?.[id];
  if(!row||row.kind!=='site-budget.v3')return null;
  // A stale or local-reviewed ledger is not evidence of a market-owned
  // grant. Never transfer it on the basis of the candidate's own claims.
  if(row.epoch!==fromEpoch||row.packageHash!==fromHash||row.source!==source)
    return null;
  const scopes=saved[MANAGED_SITE_REVIEWED_SCOPE_STORE];
  if(scopes!==undefined&&(!scopes||typeof scopes!=='object'||Array.isArray(scopes)))
    throw error('应用网站授权账本损坏，禁止迁移','E_SITE_SCOPE_CORRUPT');
  if(!scopes||!Object.hasOwn(scopes,id))return null;
  const normalized=normalizeManagedSiteV3Policy(row.policy);
  const proposed=rebindReviewedManagedSiteScopes(scopes,
    {id,fromEpoch,fromHash,toEpoch,toHash,policy:normalized});
  if(sameStorageValue(scopes,proposed))return null;
  return {fromEpoch,fromHash,policyHash:await siteScopePolicyHash(normalized)};
}
async function transferReviewedSiteScopeLocked(api,lockManager,{id,source,toEpoch,toHash,scope}){
  if(!scope)return;
  const [installed,identity,epochs,ledger]=await Promise.all([
    getInstalledSidebarTools(api),
    api.storage.local.get(MARKET_PROVENANCE_STORE),
    api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE),
    api.storage.local.get(MANAGED_SITE_BUDGET_STORE)
  ]);
  const current=installed.find(row=>row.id===id);
  const provenance=identity[MARKET_PROVENANCE_STORE]?.[id];
  const active=ledger[MANAGED_SITE_BUDGET_STORE]?.[id];
  if(!current||!current.capabilities.includes(MANAGED_SITE_BUDGET_CAPABILITY)||
     current.backgroundPolicy?.kind!=='site-budget.v3'||
     await sidebarToolPackageHash(current)!==toHash||
     epochs[TOOL_REVOCATION_EPOCHS_STORE]?.[id]!==toEpoch||
     provenance?.marketId!==source||provenance?.version!==current.version||
     provenance?.sha256!==await canonicalSha256(current)||
     active?.kind!=='site-budget.v3'||active.source!==source||
     !((active.epoch===scope.fromEpoch&&active.packageHash===scope.fromHash)||
       (active.epoch===toEpoch&&active.packageHash===toHash))||
     await siteScopePolicyHash(active.policy)!==scope.policyHash)
    throw error('同来源网站授权迁移身份或持久策略已变化，请恢复核对',
      'E_MIGRATION_SCOPE_CHANGED');
  await lockManager.request('opendesk.browser:managed-site-site-grants',async()=>{
    // The old Host may have been awaiting a real consent click. Recheck the
    // committed installed owner and provenance under the grants lock before
    // carrying its already-reviewed scope to the new generation.
    const nowInstalled=(await getInstalledSidebarTools(api)).find(row=>row.id===id);
    const nowEpoch=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))
      [TOOL_REVOCATION_EPOCHS_STORE]?.[id];
    if(!sameSidebarToolPackage(nowInstalled,current)||nowEpoch!==toEpoch)
      throw error('应用升级期间身份已更换','E_MIGRATION_SCOPE_CHANGED');
    const raw=(await api.storage.local.get(MANAGED_SITE_REVIEWED_SCOPE_STORE))
      [MANAGED_SITE_REVIEWED_SCOPE_STORE];
    if(!raw||!Object.hasOwn(raw,id))
      throw error('旧版网站授权已被撤销或丢失，不能伪报迁移完成',
        'E_MIGRATION_SCOPE_CHANGED');
    const next=rebindReviewedManagedSiteScopes(raw,{id,
      fromEpoch:scope.fromEpoch,fromHash:scope.fromHash,
      toEpoch,toHash,policy:active.policy});
    if(!sameStorageValue(raw??{},next))
      await writeVerifiedLocalValue(api,MANAGED_SITE_REVIEWED_SCOPE_STORE,next,raw,
        '跨安装代际网站授权');
  });
}

// Submit package bytes and their generation together through the existing
// storage/locks. Chrome writes are not a cross-call transaction: partial or
// unreadable outcomes stay unknown and must never trigger an automatic replay.
async function commitInstalledSidebarTools(api,next,previous,nextEpochs,previousEpochs,menuUpdate,adblockUpdate){
  const updates={[SIDEBAR_TOOL_STORE]:next,[TOOL_REVOCATION_EPOCHS_STORE]:nextEpochs,
    ...(menuUpdate?{[BROWSER_MENU_GRANTS_STORE]:menuUpdate.next}:{}),
    ...(adblockUpdate?{[ADBLOCK_STORE]:adblockUpdate.next}:{})};
  const prior={[SIDEBAR_TOOL_STORE]:previous,[TOOL_REVOCATION_EPOCHS_STORE]:previousEpochs,
    ...(menuUpdate?{[BROWSER_MENU_GRANTS_STORE]:menuUpdate.previous}:{}),
    ...(adblockUpdate?{[ADBLOCK_STORE]:adblockUpdate.previous}:{})};
  let failure=null;
  try{await api.storage.local.set(updates);}
  catch(cause){failure=cause;}
  let actual;
  try{
    actual=Object.assign({},...await Promise.all(Object.keys(updates).map(key=>api.storage.local.get(key))));
  }catch(cause){throw unknownStorageOutcome(cause,'工具安装及实例代际');}
  if(Object.keys(updates).every(key=>sameStorageValue(actual[key],updates[key])))
    return {confirmed:true,acknowledgementLost:Boolean(failure)};
  if(failure&&Object.keys(prior).every(key=>sameStorageValue(actual[key],prior[key])||
     (key===SIDEBAR_TOOL_STORE&&actual[key]===undefined&&previous.length===0)))
    throw classifyStorageWriteError(failure,'工具安装及实例代际');
  throw unknownStorageOutcome(failure,'工具安装及实例代际');
}
function matchesPreviousProvenance(row,source){
  const previous=row.previousProvenance;
  return Boolean(previous&&typeof previous==='object'&&!Array.isArray(previous)&&
    Object.keys(previous).length===3&&previous.marketId===row.marketId&&
    typeof previous.version==='string'&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(previous.version)&&
    shaPattern.test(previous.sha256)&&sameStorageValue(previous,source));
}
// Never replay an unknown operation. The installed package and local provenance,
// not the market directory, are the only inputs for recovery.
export async function reconcileMarketOperation(api,operationId,expectedPackage=null){
  if(!opPattern.test(operationId))throw error('事务 ID 无效','E_MARKET_IDENTITY');
  const [stored,installed,provenance]=await Promise.all([
    api.storage.local.get(MARKET_OPERATIONS_STORE),getInstalledSidebarTools(api),
    api.storage.local.get(MARKET_PROVENANCE_STORE)]);
  const row=recoverableOperations(stored[MARKET_OPERATIONS_STORE])[operationId];
  if(!row)return {state:'missing',operationId};
  const current=installed.find(tool=>tool.id===row.toolId);
  let matched=Boolean(current&&current.version===row.version&&
    row.marketId==='opendesk/'+row.toolId&&
    (!expectedPackage||sameSidebarToolPackage(current,expectedPackage)));
  if(matched){
    await verifySidebarToolBackground(current);
    matched=await canonicalSha256(current)===row.sha256;
    if(matched&&Object.hasOwn(row,'installEpoch')){
      const epochs=requireToolRevocationEpochs((await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE]);
      matched=typeof row.installEpoch==='string'&&row.installEpoch.length>0&&epochs[row.toolId]===row.installEpoch;
    }
  }
  const source=(provenance[MARKET_PROVENANCE_STORE]||{})[row.toolId];
  const sourceMatched=source?.marketId===row.marketId&&source.sha256===row.sha256&&source.version===row.version;
  const sourceConflicts=Boolean(source&&!sourceMatched&&!matchesPreviousProvenance(row,source));
  let state;
  if(!matched||sourceConflicts)state=row.state==='failed'?'failed':'outcome-unknown';
  else state=sourceMatched&&row.state==='succeeded'?'succeeded':'needs-finalization';
  return {state,operationId,toolId:row.toolId,marketId:row.marketId,
    installedVersion:current?.version||null,packageVerified:matched,provenanceVerified:sourceMatched};
}
export async function recoverMarketOperation({api,lockManager,operationId,expectedIdentity=null}){
  if(!opPattern.test(operationId))throw error('事务 ID 无效','E_MARKET_IDENTITY');
  const stored=await api.storage.local.get(MARKET_OPERATIONS_STORE);
  const row=recoverableOperations(stored[MARKET_OPERATIONS_STORE])[operationId];
  if(!row)return {state:'missing',operationId};
  if(expectedIdentity&&['toolId','marketId','version','sha256'].some(key=>
    Object.hasOwn(expectedIdentity,key)&&expectedIdentity[key]!==row[key]))
    throw error('安装事务与所选固定版本不一致','E_MARKET_IDENTITY');
  if(!lockManager?.request)throw error('浏览器缺少安全存储锁','E_TOOL_LOCK');
  return lockManager.request('opendesk.sidebar-tools:tool:'+row.toolId,()=>
    lockManager.request('opendesk.sidebar-tools:catalog',async()=>{
      const matchesIdentity=active=>active&&['toolId','marketId','version','sha256'].every(key=>active[key]===row[key])&&
        Object.hasOwn(active,'installEpoch')===Object.hasOwn(row,'installEpoch')&&active.installEpoch===row.installEpoch&&
        Object.hasOwn(active,'previousProvenance')===Object.hasOwn(row,'previousProvenance')&&
        sameStorageValue(active.previousProvenance,row.previousProvenance)&&
        Object.hasOwn(active,'legacyFocusUpgrade')===Object.hasOwn(row,'legacyFocusUpgrade')&&
        sameStorageValue(active.legacyFocusUpgrade,row.legacyFocusUpgrade);
      const locked=(await api.storage.local.get(MARKET_OPERATIONS_STORE))[MARKET_OPERATIONS_STORE];
      if(!matchesIdentity(recoverableOperations(locked)[operationId]))
        throw unknownStorageOutcome(null,'市场事务身份已变化');
      const checked=await reconcileMarketOperation(api,operationId);
      if(checked.state!=='needs-finalization')return checked;
      const saved=(await api.storage.local.get(MARKET_PROVENANCE_STORE))[MARKET_PROVENANCE_STORE]||{};
      // Only the exact baseline accepted under the original install lock may
      // advance to this already committed release. Older journals fail closed.
      if(saved[row.toolId]&&!checked.provenanceVerified&&!matchesPreviousProvenance(row,saved[row.toolId]))
        return {...checked,state:'outcome-unknown'};
      const identity={marketId:row.marketId,sha256:row.sha256,version:row.version};
      if(!checked.provenanceVerified)await writeVerifiedLocalValue(api,MARKET_PROVENANCE_STORE,
        {...saved,[row.toolId]:identity},saved,'市场来源恢复');
      // A partial package commit can already have advanced the installed
      // epoch while the independently reviewed site grant still names the
      // previous one. Journal recovery must finish that exact scope transfer
      // BEFORE calling the market operation succeeded; no new approval or
      // arbitrary candidate code is consumed a second time.
      if(row.scopeTransfer){
        if(typeof row.installEpoch!=='string'||!row.installEpoch)
          throw unknownStorageOutcome(null,'应用网站授权代际');
        const current=(await getInstalledSidebarTools(api)).find(tool=>tool.id===row.toolId);
        if(!current||await canonicalSha256(current)!==row.sha256)
          throw unknownStorageOutcome(null,'应用升级包身份');
        await transferReviewedSiteScopeLocked(api,lockManager,{
          id:row.toolId,source:row.marketId,toEpoch:row.installEpoch,
          toHash:await sidebarToolPackageHash(current),scope:row.scopeTransfer
        });
      }
      // Never finalize a legacy owner transfer from package/provenance alone.
      // Resume the stored immutable snapshot without running candidate JS.
      let migrationReceipt=null;
      if(row.legacyFocusUpgrade)
        migrationReceipt=await finishLegacyFocusUpgradeLocked({
          api,lockManager,descriptor:row.legacyFocusUpgrade});
      const original=(await api.storage.local.get(MARKET_OPERATIONS_STORE))[MARKET_OPERATIONS_STORE]||{};
      const active=recoverableOperations(original)[operationId];
      if(!matchesIdentity(active))
        throw unknownStorageOutcome(null,'市场事务恢复');
      await writeVerifiedLocalValue(api,MARKET_OPERATIONS_STORE,trimmedOperations({
        ...original,[operationId]:{...active,state:'succeeded',reason:'reconciled-local',
          ...(migrationReceipt?{migrationReceipt}:{}),
          updatedAt:Date.now()}}),original,'市场事务恢复');
      return reconcileMarketOperation(api,operationId);
    }));
}
export async function installReviewedSidebarTool({api,lockManager,candidate,baseline=null,
  market=null,reviewApproved=false,approveUpdate=()=>true,approveSourceChange=null,commitIntent=null}){
  if(reviewApproved!==true)throw error('必须先经过用户明确安装审阅','E_REVIEW_REQUIRED');
  const tool=await verifySidebarToolBackground(candidate);
  const identity=marketIdentity(market,tool);
  // Managed policy compatibility is decided by the running, precompiled Worker
  // BEFORE the registry's commit boundary. Installation never executes package JS.
  if(tool.capabilities.includes(MANAGED_SITE_BUDGET_CAPABILITY)){
    let response;
    try{response=await api.runtime.sendMessage({protocol:MANAGED_SITE_BUDGET_PROTOCOL,
      toolId:tool.id,operation:'probe'});}
    catch{throw error('公共后台能力无法连接到真实 Worker','E_TOOL_RUNTIME_UNAVAILABLE');}
    if(!response?.ok)throw error(response?.error?.message||
      '当前浏览器未实现此受管后台合同',response?.error?.code||'E_TOOL_RUNTIME_UNAVAILABLE');
    assertManagedSitePolicySupported(tool,response.data);
  }
  // An imported package cannot reserve or impersonate the built-in reader ID.
  // The trusted bundled release must match BOTH the reviewed source and bytes.
  if(tool.id===OFFICIAL_READING_TOC_RELEASE.id&&
     (identity?.marketId!==OFFICIAL_READING_TOC_RELEASE.marketId||
      identity.sha256!==OFFICIAL_READING_TOC_RELEASE.sha256||
      tool.version!==OFFICIAL_READING_TOC_RELEASE.version))
    throw error('阅读目录是官方保留 ID，请从内置官方目录安装经过校验的发行包','E_OFFICIAL_ID_RESERVED');
  if(!lockManager?.request)throw error('浏览器缺少安全存储锁','E_TOOL_LOCK');
  const lock=(name,work)=>lockManager.request('opendesk.sidebar-tools:'+name,work);
  return lock('tool:'+tool.id,()=>lock('catalog',async()=>{
    const installed=await getInstalledSidebarTools(api);
    const existing=installed.find(row=>row.id===tool.id)||null;
    if(Boolean(existing)!==Boolean(baseline)||
       (existing&&!sameSidebarToolPackage(existing,baseline)))
      throw error('安装状态已发生变化，请重新审阅','E_TOOL_CHANGED');
    const provenance=(await api.storage.local.get(MARKET_PROVENANCE_STORE))[MARKET_PROVENANCE_STORE]||{};
    if(!identity&&existing&&provenance[tool.id]&&!sameSidebarToolPackage(existing,tool)){
      if(typeof approveSourceChange!=='function')
        throw error('官方来源工具不能被本地包静默接管，请审核来源替换','E_PUBLISHER_CONFLICT');
      if(await approveSourceChange(existing,tool)!==true)return {state:'cancelled',tool};
    }
    if(identity&&existing&&!sameSidebarToolPackage(existing,tool)){
      const record=provenance[tool.id];
      if(record?.marketId!==identity.marketId||!shaPattern.test(record?.sha256)){
        if(record||typeof approveSourceChange!=='function')
          throw error('此工具 ID 已被其他来源使用，必须明确审核来源替换','E_PUBLISHER_CONFLICT');
        if(await approveSourceChange(existing,tool)!==true)return {state:'cancelled',tool};
      }
    }
    if(identity&&await canonicalSha256(tool)!==identity.sha256)
      throw error('待安装包的规范化摘要与市场审阅记录不一致','E_MARKET_IDENTITY');
    if(existing&&sameSidebarToolPackage(existing,tool)){
      if(identity)await writeVerifiedLocalValue(api,MARKET_PROVENANCE_STORE,{
        ...provenance,[tool.id]:{marketId:identity.marketId,sha256:identity.sha256,version:tool.version}
      },provenance,'市场来源');
      return {state:'already-installed',tool};
    }
    if(!existing&&(await getPendingToolCleanups(api))[tool.id])
      throw error('上次卸载仍有未完成的数据或权限清理；请先恢复清理后重新审阅安装',
        'E_TOOL_UNINSTALL_CLEANUP');
    if(!existing&&installed.length>=MAX_INSTALLED_TOOLS)
      throw error('最多安装 '+MAX_INSTALLED_TOOLS+' 个工具','E_TOOL_CAPACITY');
    if(existing){
      // Only the exact, journaled Stay Focus 1.0.10 -> public v3 handoff
      // below may cross this historical native-owner boundary. Every other
      // legacy-capability removal remains fail-closed.
      if(existing.capabilities.includes('focus.control')&&
         !tool.capabilities.includes('focus.control')&&
         !(existing.id==='stay-focus'&&tool.id==='stay-focus'&&
           tool.format==='opendesk.sidebar-tool.v2'&&
           tool.backgroundPolicy?.kind==='site-budget.v3'&&
           tool.capabilities.includes(MANAGED_SITE_BUDGET_CAPABILITY)))
        throw error('旧网站限制缺少受支持的无损升级迁移路径，原安装保持不变',
          'E_MIGRATION_REQUIRED');
      if(identity&&compareToolVersions(tool.version,existing.version)<=0)
        throw error('市场不允许同版本替换或自动降级','E_VERSION_CONFLICT');
      if(!(await approveUpdate(existing,tool)))return {state:'cancelled',tool};
    }
    const rawEpochs=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE];
    const epochs=requireToolRevocationEpochs(rawEpochs),nextEpoch=crypto.randomUUID();
    const ops=identity?recoverableOperations((await api.storage.local.get(MARKET_OPERATIONS_STORE))[MARKET_OPERATIONS_STORE]):null;
    if(identity&&ops[identity.operationId])
      throw error('事务已存在，请先恢复核对，不能再次提交','E_OUTCOME_UNKNOWN');
    const prior=provenance[tool.id];
    const previousProvenance=identity&&existing&&prior?.marketId===identity.marketId&&
      prior.version===existing.version&&shaPattern.test(prior.sha256)&&Object.keys(prior).length===3&&
      await canonicalSha256(existing)===prior.sha256
      ?{marketId:prior.marketId,version:prior.version,sha256:prior.sha256}:null;
    // Independent v3 apps may retain EXACTLY their previous approved site
    // scope, but only when both releases have verified same-source provenance.
    // No candidate JS runs and no new domain can be authorized by this path.
    const scopeTransfer=identity&&previousProvenance&&
      existing.backgroundPolicy?.kind==='site-budget.v3'&&
      tool.backgroundPolicy?.kind==='site-budget.v3'&&
      existing.capabilities.includes(MANAGED_SITE_BUDGET_CAPABILITY)&&
      tool.capabilities.includes(MANAGED_SITE_BUDGET_CAPABILITY)&&
      typeof epochs[tool.id]==='string'?
      await readSiteScopeTransferPlan(api,{id:tool.id,source:identity.marketId,
        fromEpoch:epochs[tool.id],fromHash:await sidebarToolPackageHash(existing),
        toEpoch:nextEpoch,toHash:await sidebarToolPackageHash(tool)}):null;
    const requiresLegacyFocusMigration=Boolean(existing?.capabilities.includes('focus.control')&&
      !tool.capabilities.includes('focus.control'));
    // Same-source provenance and old epoch/hash MUST be proven before any
    // package/ledger mutation; candidate JavaScript is never evaluated.
    let legacyFocusUpgrade=null;
    if(requiresLegacyFocusMigration){
      if(!identity||!previousProvenance)
        throw error('旧网站限制升级必须有相同官方来源的可验证历史包','E_MIGRATION_REQUIRED');
      legacyFocusUpgrade=await prepareLegacyFocusUpgrade({
        api,existing,candidate:tool,source:identity.marketId,
        previousProvenance,oldEpoch:epochs[tool.id],newEpoch:nextEpoch,
        operationId:identity.operationId
      });
    }
    // Consume an external handoff only AFTER read-only migration preflight.
    if(identity&&commitIntent)await commitIntent();
    const writeOp=async(state,reason='',migrationReceipt=null)=>{
      if(!identity)return;
      const original=(await api.storage.local.get(MARKET_OPERATIONS_STORE))[MARKET_OPERATIONS_STORE]||{};
      const updated={...original,[identity.operationId]:{marketId:identity.marketId,sha256:identity.sha256,
        toolId:tool.id,version:tool.version,installEpoch:nextEpoch,...(previousProvenance?{previousProvenance}:{}),
        ...(scopeTransfer?{scopeTransfer}:{}),
        ...(legacyFocusUpgrade?{legacyFocusUpgrade:legacyFocusUpgrade.descriptor}:{}),
        ...(migrationReceipt?{migrationReceipt}:{}),
        state,reason:reason.slice(0,140),updatedAt:Date.now()}};
      await writeVerifiedLocalValue(api,MARKET_OPERATIONS_STORE,trimmedOperations(updated),original,'市场事务记录');
    };
    let registryAttempted=false,registryCommitted=false,seeded=false;
    try{
      // The registry write is the commit boundary. Preserve the installed
      // tool's data and valid grants if that write fails. Orphan grants for
      // capabilities it never held must disappear before a new package is visible.
      await writeOp('reviewed');
      if(legacyFocusUpgrade){
        await writeLegacyFocusUpgradeSnapshot(api,legacyFocusUpgrade);
        await writeOp('migration-prepared');
      }
      await writeOp('committing');
      if(!existing){
        // Never delete a previous owner's private data before the registry
        // commit boundary. Explicit cleanup is required for orphaned IDs.
        const dataKey=sidebarToolStorageKey(tool.id);
        if((await api.storage.local.get(dataKey))[dataKey]!==undefined){
          const cleanup=(await getPendingToolCleanups(api))[tool.id];
          throw error(cleanup
            ?'此 ID 仍有上次卸载的本地数据；先在「我的应用」恢复清理后重新审阅安装'
            :'此 ID 存在未关联卸载确认的本地数据，安装已停止以保护内容；请先备份并核对原始数据，安装确认不会自动清理它',
          'E_TOOL_ORPHAN_DATA');
        }
      }
      const siteStores=[[READING_TOC_SITE_STORE,'page.toc'],[READING_TOC_PAGE_RULES_STORE,'page.toc'],
        [CLIP_SITE_STORE,'page.clip'],[CAPTURE_SITE_STORE,'page.capture'],
        [PROMPT_SHORTCUTS_SITE_CLEANUP_STORE,'page.prompts']];
      const clearGrant=async store=>{
        const value=(await api.storage.local.get(store))[store]||{};
        if(Object.hasOwn(value,tool.id)){
          const updated={...value};delete updated[tool.id];
          await writeVerifiedLocalValue(api,store,updated,value,'工具网站授权清理');
        }
      };
      for(const [store,capability] of siteStores)
        if(!existing?.capabilities.includes(capability))await clearGrant(store);
      if(!existing)await clearGrant(BROWSER_MENU_GRANTS_STORE);
      // Only menu preferences cross this explicitly reviewed update. Rebinding
      // the shared row would also silently approve Cookie/Full Bookmarks data.
      let rawBrowserGrants,browserGrants,previousBrowserGrant,previousMenu,preserveMenu=false;
      if(existing?.capabilities.includes('browser.contextMenu')&&tool.capabilities.includes('browser.contextMenu')){
        rawBrowserGrants=(await api.storage.local.get(BROWSER_MENU_GRANTS_STORE))[BROWSER_MENU_GRANTS_STORE];
        if(rawBrowserGrants!==undefined&&(!rawBrowserGrants||typeof rawBrowserGrants!=='object'||Array.isArray(rawBrowserGrants)))
          throw error('工具浏览器授权记录损坏','E_STORAGE_CORRUPT');
        browserGrants=rawBrowserGrants||{};previousBrowserGrant=browserGrants[tool.id];
        previousMenu=previousBrowserGrant?.contextMenu??previousBrowserGrant;
        preserveMenu=previousMenu?.version===existing.version&&
          previousMenu.installEpoch===(epochs[tool.id]??null)&&
          previousMenu.packageHash===await sidebarToolPackageHash(existing)&&
          Array.isArray(previousMenu.activeActions)&&Array.isArray(previousMenu.origins);
      }
      // Only a new installation with a genuinely absent namespace may receive
      // reviewed initialData. Never seed on upgrades, empty saved libraries, or
      // failed uninstall cleanup. The existing catalog/tool lock serializes writes.
      if(!existing&&tool.initialData!==undefined){
        const key=sidebarToolStorageKey(tool.id);
        if((await api.storage.local.get(key))[key]!==undefined)
          throw error('首次安装数据位置已被占用，拒绝覆盖','E_TOOL_ORPHAN_DATA');
        await writeVerifiedLocalValue(api,key,tool.initialData,undefined,'工具首次安装数据');
        seeded=true;
      }
      let menuUpdate=null;
      if(preserveMenu){
        const oldActions=existing.contributes.contextMenus.map(action=>action.actionId);
        const newActions=tool.contributes.contextMenus.map(action=>action.actionId);
        const activeActions=previousMenu.activeActions.length&&oldActions.every(id=>previousMenu.activeActions.includes(id))
          ?newActions:previousMenu.activeActions.filter(id=>newActions.includes(id));
        menuUpdate={previous:rawBrowserGrants,next:{...browserGrants,[tool.id]:{
          ...previousBrowserGrant,contextMenu:{...previousMenu,version:tool.version,
            installEpoch:nextEpoch,packageHash:await sidebarToolPackageHash(tool),activeActions}
        }}};
      }
      const adblockUpdate=await prepareReviewedAdblockUpdate(api,{
        existing,candidate:tool,oldEpoch:epochs[tool.id]??null,newEpoch:nextEpoch});
      const next=existing?installed.map(row=>row.id===tool.id?tool:row):[...installed,tool];
      registryAttempted=true;
      const registry=await commitInstalledSidebarTools(api,next,installed,{...epochs,[tool.id]:nextEpoch},rawEpochs,menuUpdate,adblockUpdate);
      registryCommitted=true;
      // Even if the local readback is durable, an unacknowledged package commit
      // must require explicit recovery of provenance and operation state.
      if(registry.acknowledgementLost)throw unknownStorageOutcome(null,'工具包写入回执');
      // Removing a capability makes its prior grant unusable immediately;
      // now clear that record after the successful registry boundary.
      for(const [store,capability] of siteStores)
        if(existing?.capabilities.includes(capability)&&!tool.capabilities.includes(capability))await clearGrant(store);
      if(identity){
        await writeVerifiedLocalValue(api,MARKET_PROVENANCE_STORE,{...provenance,[tool.id]:{
          marketId:identity.marketId,sha256:identity.sha256,version:tool.version}},provenance,'市场来源');
      }else if(Object.hasOwn(provenance,tool.id)){
        const updated={...provenance};delete updated[tool.id];
        await writeVerifiedLocalValue(api,MARKET_PROVENANCE_STORE,updated,provenance,'旧市场来源清理');
      }
      // Publish the scope on the same original Installer path, AFTER the
      // package, source and epoch have been read back. Any write ambiguity
      // leaves an unresolved market journal, not a fabricated success.
      if(scopeTransfer)await transferReviewedSiteScopeLocked(api,lockManager,{
        id:tool.id,source:identity.marketId,toEpoch:nextEpoch,
        toHash:await sidebarToolPackageHash(tool),scope:scopeTransfer});
      // The journal stays unresolved until the public Driver and old native
      // resources have both passed an independent readback.
      let migrationReceipt=null;
      if(legacyFocusUpgrade){
        // Persist handoff intent before old DNR/Alarm retirement, not after
        // the first native effect. Recovery never guesses whether it ran.
        await writeOp('native-handoff');
        migrationReceipt=await finishLegacyFocusUpgradeLocked({
          api,lockManager,descriptor:legacyFocusUpgrade.descriptor});
      }
      const cleanup=await getPendingToolCleanups(api);
      if(cleanup[tool.id]){
        const updated={...cleanup};delete updated[tool.id];
        await writeVerifiedLocalValue(api,TOOL_CLEANUP_STORE,updated,cleanup,'过期卸载记录清理');
      }
      await writeOp('succeeded','',migrationReceipt);
      return {state:'installed',tool,operationId:identity?.operationId||null,
        ...(migrationReceipt?{migrationReceipt}:{})};
    }catch(cause){
      // A confirmed pre-commit failure must not strand default data as an orphan,
      // but an unknown/committed registry outcome must NEVER delete it.
      if(seeded&&!registryCommitted&&cause?.code!=='E_OUTCOME_UNKNOWN'){
        try{
          const present=await getInstalledSidebarTools(api);
          if(!present.some(row=>row.id===tool.id)){
            const key=sidebarToolStorageKey(tool.id);
            const raw=(await api.storage.local.get(key))[key];
            if(!sameStorageValue(raw,tool.initialData))
              throw unknownStorageOutcome(null,'首次安装数据回滚前核对');
            await removeVerifiedStorageKey(api.storage.local,key,'首次安装数据回滚');
          }
        }catch(rollbackError){
          throw unknownStorageOutcome(rollbackError,'首次安装数据恢复');
        }
      }
      if(!registryCommitted&&cause?.code!=='E_OUTCOME_UNKNOWN'&&(!registryAttempted||
        ['E_HOST_STORAGE_WRITE','E_HOST_STORAGE_QUOTA'].includes(cause?.code))){
        try{await writeOp('failed',cause?.code||'pre-commit');}catch{}
        throw cause;
      }
      // A successful registry write followed by a metadata/ack failure is
      // neither a rollback nor a second invitation to consume user approval.
      try{await writeOp('outcome-unknown',cause?.code||'write-uncertain');}catch{}
      throw unknownStorageOutcome(cause,'工具安装');
    }
  }));
}
