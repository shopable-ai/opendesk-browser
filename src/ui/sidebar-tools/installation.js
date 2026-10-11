// One installation transaction path for Side Panel and Marketplace.
// This is the EXISTING v1 tool registry and authority, not a second runner.
import {SIDEBAR_TOOL_STORE, MAX_INSTALLED_TOOLS, validateSidebarToolPackage, sidebarToolStorageKey,serializeSidebarToolPackage} from './package.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../framework/sdk/browser-contract.js';
import {READING_TOC_SITE_STORE, READING_TOC_VISIBILITY_STORE, READING_TOC_PAGE_RULES_STORE, READING_TOC_PLACEMENT_PREFIX, READING_TOC_TOOL_ID} from '../../reading-toc/policy.js';
import {CLIP_SITE_STORE} from '../../page-clip/policy.js';
import {CAPTURE_SITE_STORE, KNOWLEDGE_TOOL_ID, KNOWLEDGE_WORKSPACE_PREFIX} from '../../knowledge/policy.js';
import {writeVerifiedLocalValue,classifyStorageWriteError,unknownStorageOutcome,sameStorageValue} from './storage-state.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords,TOOL_REVOCATION_EPOCHS_STORE} from './lifecycle.js';
import {TIME_REVIEW_KEY} from '../../time-review/model.js';

export const MARKET_PROVENANCE_STORE='opendesk.market.provenance.v1';
export const MARKET_OPERATIONS_STORE='opendesk.market.operations.v1';
export const TOOL_CLEANUP_STORE='opendesk.sidebar-tools.uninstall-cleanup.v1';
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
  return Boolean(a&&b)&&['format','id','version','title','description','html','css','js']
    .every(key=>a[key]===b[key])&&JSON.stringify(a.capabilities)===JSON.stringify(b.capabilities)&&
    JSON.stringify(a.requires??null)===JSON.stringify(b.requires??null)&&
    JSON.stringify(a.contributes??null)===JSON.stringify(b.contributes??null);
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
export async function setInstalledSidebarToolEnabled({api,lockManager,tool,enabled}){
  if(typeof enabled!=='boolean')throw error('工具启停状态无效','E_TOOL_SCHEMA');
  if(!lockManager?.request)throw error('浏览器缺少安全存储锁','E_TOOL_LOCK');
  return lockManager.request('opendesk.sidebar-tools:tool:'+tool.id,()=>
    lockManager.request('opendesk.sidebar-tools:catalog',async()=>{
      const current=(await getInstalledSidebarTools(api)).find(row=>row.id===tool.id);
      if(!sameSidebarToolPackage(current,tool))throw error('工具已更新或卸载，请重新打开详情','E_TOOL_CHANGED');
      const raw=(await api.storage.local.get(SIDEBAR_TOOL_ENABLE_STORE))[SIDEBAR_TOOL_ENABLE_STORE];
      const previous=requireToolEnableRecords(raw);
      if((previous[tool.id]!==false)===enabled)return {enabled};
      const rawEpochs=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE];
      const epochs=rawEpochs===undefined?{}:rawEpochs;
      if(!epochs||typeof epochs!=='object'||Array.isArray(epochs)||
        Object.entries(epochs).some(([id,value])=>!toolIdPattern.test(id)||typeof value!=='string'))
        throw error('工具撤销记录损坏；已停止修改','E_STORAGE_CORRUPT');
      // Stop first. Resume fences every old frame/request before it becomes available.
      // A crash between these writes leaves the tool stopped, never silently resumed.
      if(!enabled)await writeVerifiedLocalValue(api,SIDEBAR_TOOL_ENABLE_STORE,
        {...previous,[tool.id]:false},raw,'工具启停');
      await writeVerifiedLocalValue(api,TOOL_REVOCATION_EPOCHS_STORE,
        {...epochs,[tool.id]:crypto.randomUUID()},rawEpochs,'工具实例撤销');
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
function pendingCleanups(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter(([id,row])=>
    toolIdPattern.test(id)&&row&&typeof row==='object'&&
    typeof row.version==='string'&&/^\d+\.\d+\.\d+$/.test(row.version)));
}
export async function getPendingToolCleanups(api){
  return pendingCleanups((await api.storage.local.get(TOOL_CLEANUP_STORE))[TOOL_CLEANUP_STORE]);
}
export async function recordToolUninstall(api,tool){
  // Independent of package bytes: an old iframe must stay revoked even when
  // precisely the same tool/version is later installed again. Do not prune.
  const revisions=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE]||{};
  await writeVerifiedLocalValue(api,TOOL_REVOCATION_EPOCHS_STORE,
    {...revisions,[tool.id]:globalThis.crypto.randomUUID()},revisions,'工具旧实例撤销');
  const prior=await getPendingToolCleanups(api);
  const next={...prior,[tool.id]:{version:tool.version,createdAt:Date.now()}};
  await writeVerifiedLocalValue(api,TOOL_CLEANUP_STORE,next,prior,'卸载恢复记录');
}
async function removeVerifiedKey(api,key){
  let failure=null;
  try{await api.storage.local.remove(key);}catch(error){failure=error;}
  let value;
  try{value=(await api.storage.local.get(key))[key];}
  catch(error){throw unknownStorageOutcome(error,'卸载后的数据清理');}
  if(value!==undefined)throw failure?classifyStorageWriteError(failure,'卸载后的数据清理'):
    unknownStorageOutcome(null,'卸载后的数据清理');
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
    await removeVerifiedKey(api,sidebarToolStorageKey(id));
    if(id==='time-review')await removeVerifiedKey(api,TIME_REVIEW_KEY);
    for(const store of [SIDEBAR_TOOL_ENABLE_STORE,READING_TOC_SITE_STORE,READING_TOC_VISIBILITY_STORE,READING_TOC_PAGE_RULES_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE,MARKET_PROVENANCE_STORE,BROWSER_MENU_GRANTS_STORE]){
      const raw=(await api.storage.local.get(store))[store];
      const original=store===SIDEBAR_TOOL_ENABLE_STORE?requireToolEnableRecords(raw):(raw||{});
      if(!Object.hasOwn(original,id))continue;
      const updated={...original};delete updated[id];
      await writeVerifiedLocalValue(api,store,updated,original,'卸载权限与来源清理');
    }
    if(id===KNOWLEDGE_TOOL_ID){
      const entries=await api.storage.session.get(null);
      const keys=Object.keys(entries||{}).filter(key=>key.startsWith(KNOWLEDGE_WORKSPACE_PREFIX));
      if(keys.length)await api.storage.session.remove(keys);
    }
    if(id===READING_TOC_TOOL_ID){
      const entries=await api.storage.local.get(null);
      const keys=Object.keys(entries||{}).filter(key=>key.startsWith(READING_TOC_PLACEMENT_PREFIX));
      if(keys.length)await api.storage.local.remove(keys);
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
  if(matched)matched=await canonicalSha256(current)===row.sha256;
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
        Object.hasOwn(active,'previousProvenance')===Object.hasOwn(row,'previousProvenance')&&
        sameStorageValue(active.previousProvenance,row.previousProvenance);
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
      const original=(await api.storage.local.get(MARKET_OPERATIONS_STORE))[MARKET_OPERATIONS_STORE]||{};
      const active=recoverableOperations(original)[operationId];
      if(!matchesIdentity(active))
        throw unknownStorageOutcome(null,'市场事务恢复');
      await writeVerifiedLocalValue(api,MARKET_OPERATIONS_STORE,trimmedOperations({
        ...original,[operationId]:{...active,state:'succeeded',reason:'reconciled-local',
          updatedAt:Date.now()}}),original,'市场事务恢复');
      return reconcileMarketOperation(api,operationId);
    }));
}
export async function installReviewedSidebarTool({api,lockManager,candidate,baseline=null,
  market=null,reviewApproved=false,approveUpdate=()=>true,approveSourceChange=null}){
  if(reviewApproved!==true)throw error('必须先经过用户明确安装审阅','E_REVIEW_REQUIRED');
  const tool=validateSidebarToolPackage(candidate);
  const identity=marketIdentity(market,tool);
  if(!lockManager?.request)throw error('浏览器缺少安全存储锁','E_TOOL_LOCK');
  const lock=(name,work)=>lockManager.request('opendesk.sidebar-tools:'+name,work);
  return lock('tool:'+tool.id,()=>lock('catalog',async()=>{
    const installed=await getInstalledSidebarTools(api);
    const existing=installed.find(row=>row.id===tool.id)||null;
    if(Boolean(existing)!==Boolean(baseline)||
       (existing&&!sameSidebarToolPackage(existing,baseline)))
      throw error('安装状态已发生变化，请重新审阅','E_TOOL_CHANGED');
    const provenance=(await api.storage.local.get(MARKET_PROVENANCE_STORE))[MARKET_PROVENANCE_STORE]||{};
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
    if(!existing&&installed.length>=MAX_INSTALLED_TOOLS)
      throw error('最多安装 '+MAX_INSTALLED_TOOLS+' 个工具','E_TOOL_CAPACITY');
    if(existing){
      if(identity&&compareToolVersions(tool.version,existing.version)<=0)
        throw error('市场不允许同版本替换或自动降级','E_VERSION_CONFLICT');
      if(!(await approveUpdate(existing,tool)))return {state:'cancelled',tool};
    }
    const ops=identity?recoverableOperations((await api.storage.local.get(MARKET_OPERATIONS_STORE))[MARKET_OPERATIONS_STORE]):null;
    if(identity&&ops[identity.operationId])
      throw error('事务已存在，请先恢复核对，不能再次提交','E_OUTCOME_UNKNOWN');
    const prior=provenance[tool.id];
    const previousProvenance=identity&&existing&&prior?.marketId===identity.marketId&&
      prior.version===existing.version&&shaPattern.test(prior.sha256)&&Object.keys(prior).length===3&&
      await canonicalSha256(existing)===prior.sha256
      ?{marketId:prior.marketId,version:prior.version,sha256:prior.sha256}:null;
    const writeOp=async(state,reason='')=>{
      if(!identity)return;
      const original=(await api.storage.local.get(MARKET_OPERATIONS_STORE))[MARKET_OPERATIONS_STORE]||{};
      const updated={...original,[identity.operationId]:{marketId:identity.marketId,sha256:identity.sha256,
        toolId:tool.id,version:tool.version,...(previousProvenance?{previousProvenance}:{}),
        state,reason:reason.slice(0,140),updatedAt:Date.now()}};
      await writeVerifiedLocalValue(api,MARKET_OPERATIONS_STORE,trimmedOperations(updated),original,'市场事务记录');
    };
    let registryAttempted=false,registryCommitted=false;
    try{
      // The registry write is the commit boundary. Preserve the installed
      // tool's data and valid grants if that write fails. Orphan grants for
      // capabilities it never held must disappear before a new package is visible.
      await writeOp('reviewed');
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
        [BROWSER_MENU_GRANTS_STORE,'browser.contextMenu']];
      const clearGrant=async store=>{
        const value=(await api.storage.local.get(store))[store]||{};
        if(Object.hasOwn(value,tool.id)){
          const updated={...value};delete updated[tool.id];
          await writeVerifiedLocalValue(api,store,updated,value,'工具网站授权清理');
        }
      };
      for(const [store,capability] of siteStores)
        if(!existing?.capabilities.includes(capability))await clearGrant(store);
      const next=existing?installed.map(row=>row.id===tool.id?tool:row):[...installed,tool];
      registryAttempted=true;
      const registry=await writeVerifiedLocalValue(api,SIDEBAR_TOOL_STORE,next,installed,'工具安装记录');
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
      const cleanup=await getPendingToolCleanups(api);
      if(cleanup[tool.id]){
        const updated={...cleanup};delete updated[tool.id];
        await writeVerifiedLocalValue(api,TOOL_CLEANUP_STORE,updated,cleanup,'过期卸载记录清理');
      }
      await writeOp('succeeded');
      return {state:'installed',tool,operationId:identity?.operationId||null};
    }catch(cause){
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
