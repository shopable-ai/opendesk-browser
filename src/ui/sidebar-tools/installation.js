// One installation transaction path for Side Panel and Marketplace.
// This is the EXISTING v1 tool registry and authority, not a second runner.
import {SIDEBAR_TOOL_STORE, MAX_INSTALLED_TOOLS, validateSidebarToolPackage, sidebarToolStorageKey} from './package.js';
import {READING_TOC_SITE_STORE, READING_TOC_PLACEMENT_PREFIX, READING_TOC_TOOL_ID} from '../../reading-toc/policy.js';
import {CLIP_SITE_STORE} from '../../page-clip/policy.js';
import {CAPTURE_SITE_STORE, KNOWLEDGE_TOOL_ID, KNOWLEDGE_WORKSPACE_PREFIX} from '../../knowledge/policy.js';

export const MARKET_PROVENANCE_STORE='opendesk.market.provenance.v1';
export const MARKET_OPERATIONS_STORE='opendesk.market.operations.v1';
const marketIdPattern=/^opendesk\/[a-z][a-z0-9-]{1,39}$/;
const shaPattern=/^[a-f0-9]{64}$/;
const opPattern=/^[a-f0-9-]{36}$/;
const error=(message,code)=>Object.assign(new Error(message),{code});
export function sameSidebarToolPackage(a,b) {
  return Boolean(a&&b)&&['format','id','version','title','description','html','css','js']
    .every(key=>a[key]===b[key])&&JSON.stringify(a.capabilities)===JSON.stringify(b.capabilities);
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
export async function getInstalledSidebarTools(api) {
  return admittedSidebarToolPackages((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
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
// Do not replay pending/unknown market operations. First reconcile the actual registry.
// An unacknowledged storage write can have succeeded, even if its promise rejected.
export async function reconcileMarketOperation(api,operationId,expectedPackage=null) {
  if(!opPattern.test(operationId))throw error('事务 ID 无效','E_MARKET_IDENTITY');
  const [stored,installed]=await Promise.all([
    api.storage.local.get(MARKET_OPERATIONS_STORE),getInstalledSidebarTools(api)]);
  const row=recoverableOperations(stored[MARKET_OPERATIONS_STORE])[operationId];
  if(!row)return {state:'missing',operationId};
  const current=installed.find(tool=>tool.id===row.toolId);
  const matched=expectedPackage&&current&&sameSidebarToolPackage(current,expectedPackage);
  return {state:matched?'succeeded':row.state==='succeeded'?'outcome-unknown':row.state,
    operationId,toolId:row.toolId,marketId:row.marketId,installedVersion:current?.version||null};
}
export async function installReviewedSidebarTool({api,lockManager,candidate,baseline=null,
  market=null,reviewApproved=false,approveUpdate=()=>true}){
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
    if(identity&&existing&&!sameSidebarToolPackage(existing,tool)) {
      const record=provenance[tool.id];
      if(record?.marketId!==identity.marketId||!shaPattern.test(record?.sha256))
        throw error('此工具 ID 已被其他来源使用，禁止覆盖','E_PUBLISHER_CONFLICT');
    }
    if(existing&&sameSidebarToolPackage(existing,tool)){
      if(identity)await api.storage.local.set({[MARKET_PROVENANCE_STORE]:{
        ...provenance,[tool.id]:{marketId:identity.marketId,sha256:identity.sha256,version:tool.version}
      }});
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
    let commitStarted=false;
    const writeOp=async(state,reason='')=>{
      if(!identity)return;
      ops[identity.operationId]={marketId:identity.marketId,sha256:identity.sha256,toolId:tool.id,
        version:tool.version,state,reason:reason.slice(0,140),updatedAt:Date.now()};
      await api.storage.local.set({[MARKET_OPERATIONS_STORE]:trimmedOperations(ops)});
    };
    try{
      await writeOp('reviewed');
      commitStarted=true;
      await writeOp('committing');
      // No fresh installation may inherit orphan tool data or site authorizations.
      if(!existing)await api.storage.local.remove(sidebarToolStorageKey(tool.id));
      for(const [store,capability] of [[READING_TOC_SITE_STORE,'page.toc'],[CLIP_SITE_STORE,'page.clip'],[CAPTURE_SITE_STORE,'page.capture']]){
        if(existing&&tool.capabilities.includes(capability))continue;
        const value=(await api.storage.local.get(store))[store]||{};
        if(Object.hasOwn(value,tool.id)){
          const next={...value};delete next[tool.id];
          await api.storage.local.set({[store]:next});
        }
      }
      const next=existing?installed.map(row=>row.id===tool.id?tool:row):[...installed,tool];
      await api.storage.local.set({[SIDEBAR_TOOL_STORE]:next});
      // The registry, not a pending UI promise, is the installation truth.
      const verified=await getInstalledSidebarTools(api);
      if(!verified.some(row=>sameSidebarToolPackage(row,tool)))
        throw error('写入后无法验证工具安装记录','E_OUTCOME_UNKNOWN');
      if(identity){
        await api.storage.local.set({[MARKET_PROVENANCE_STORE]:{
          ...provenance,[tool.id]:{marketId:identity.marketId,sha256:identity.sha256,version:tool.version}
        }});
      }else if(Object.hasOwn(provenance,tool.id)){
        // Explicit local imports may replace code under the same tool ID.
        // This must invalidate the former publisher attribution.
        const nextProvenance={...provenance};delete nextProvenance[tool.id];
        await api.storage.local.set({[MARKET_PROVENANCE_STORE]:nextProvenance});
      }
      await writeOp('succeeded');
      return {state:'installed',tool,operationId:identity?.operationId||null};
    }catch(e){
      if(commitStarted){
        // Preserve durable unknown for reconciliation instead of blind replay.
        try{await writeOp('outcome-unknown',String(e?.message||e));}catch{}
        throw error('安装结果需恢复核对：'+String(e?.message||e),'E_OUTCOME_UNKNOWN');
      }
      throw e;
    }
  }));
}
